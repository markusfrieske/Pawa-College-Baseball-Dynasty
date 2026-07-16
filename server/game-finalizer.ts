/**
 * Centralised game finalisation service.
 *
 * Every path that completes a game — quick-score, reported game confirm,
 * play-by-play, advance-week, bulk-sim, postseason — should route through
 * finalizeGame() so that each side-effect fires exactly once in the correct
 * order:
 *
 *   1. Persist score + box score
 *   2. Update standings
 *   3. Accumulate player season stats (home + away in parallel)
 *   4. Update pitcher rest tracking
 *   5. Award coach XP / wins / losses / legacy score
 *   6. Create GAME_RESULT league event
 *   7. Mark game isComplete = true  (deferred so stats are confirmed first)
 *   8. Invalidate league cache
 *
 * Batch callers (advance-week, bulk-sim) pass a shared `coachXpAccum` map so
 * coach deltas accumulate across all games in a week, then flush once with
 * flushCoachXp(). This preserves a single updateCoach() DB write per coach per
 * batch regardless of how many games they played.
 */

import { storage } from "./storage";
import { pool } from "./db";
import type { Game, GameReport, Team, InsertPlayerSeasonStats, Coach } from "@shared/schema";
import {
  updateStandingsForGame,
  accumulatePlayerStats,
  updatePitcherRestFromBox,
  computeLegacyScore,
  enrichBoxData,
} from "./game-engine";
import { invalidateLeague } from "./cache";
import { hasPerk, XP_AWARDS } from "@shared/coachPerks";
import { generateGameRecap } from "./lib/recap-generator";

const WIN_XP = XP_AWARDS.WIN;
const LOSS_XP = XP_AWARDS.LOSS;

export interface CoachXpDelta {
  xp: number;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
}

type CoachSnapshot = {
  id: string;
  xp: number;
  level: number;
  skillPoints: number;
  careerWins: number;
  careerLosses: number;
  confWins: number;
  confLosses: number;
  confChampionships: number;
  cwsAppearances: number;
  nationalChampionships: number;
  allAmericans: number;
  draftPicks: number;
  perks?: Record<string, boolean> | null;
};

export interface FinalizeGameOptions {
  /** Skip standings update (default false). Set true for postseason SR/CWS games. */
  skipStandings?: boolean;
  /** Skip player season-stats accumulation (default false). Requires box data. */
  skipPlayerStats?: boolean;
  /** Skip pitcher rest tracking (default false). Requires box data. */
  skipPitcherRest?: boolean;
  /** Skip coach XP / wins / losses award (default false). */
  skipCoachXp?: boolean;
  /**
   * When provided, coach XP deltas are accumulated into this map instead of
   * being written to the DB immediately. Call flushCoachXp() once after the
   * full batch to persist. Used by advance-week / bulk-sim.
   */
  coachXpAccum?: Map<string, CoachXpDelta>;
  /** Skip GAME_RESULT league event creation (default false). */
  skipLeagueEvent?: boolean;
  /** Skip cache invalidation (default false). Batch callers invalidate once after all games. */
  skipCacheInvalidation?: boolean;
  /**
   * Skip the game row updates (scores + isComplete) inside finalizeGame().
   * Set true when the caller (finalizeGameAtomic) has already committed these
   * writes atomically before running side-effects.
   */
  skipGameUpdate?: boolean;
  /** Mark the game row as manually reported (sets isManuallyReported + reportedByUserId). */
  isManualReport?: boolean;
  reportedByUserId?: string | null;
  /** Appended to the GAME_RESULT event description, e.g. "(Super Regionals)". */
  eventDescriptionSuffix?: string;
  /** Pre-fetched league teams — avoids a DB round-trip for single-game callers. */
  leagueTeams?: Team[];
  /** Current league week for pitcher rest (falls back to game.week if omitted). */
  leagueCurrentWeek?: number;
}

/**
 * Finalise a completed game and apply all side-effects in order.
 *
 * Pass rawBoxScore = null only when no box data is available (e.g. quick-score).
 * In that case skipPlayerStats and skipPitcherRest are implied automatically.
 */
export async function finalizeGame(
  game: Pick<Game, "id" | "homeTeamId" | "awayTeamId" | "season" | "week" | "isConference" | "gameType">,
  homeScore: number,
  awayScore: number,
  rawBoxScore: { home: any; away: any; innings?: any[] } | null,
  leagueId: string,
  opts: FinalizeGameOptions = {},
): Promise<void> {
  // ── Exhibition games must never pollute standings, player stats, or coach XP ──
  // gameType 'exhibition' is used by Spring Training games. We still persist the
  // score and create a league event so the box score is viewable, but all
  // competitive side-effects are suppressed regardless of caller-supplied opts.
  const isExhibition = game.gameType === "exhibition";
  const effectiveOpts: FinalizeGameOptions = isExhibition
    ? {
        ...opts,
        skipStandings: true,
        skipPlayerStats: true,
        skipPitcherRest: true,
        skipCoachXp: true,
      }
    : opts;

  const {
    skipStandings = false,
    skipPlayerStats = false,
    skipPitcherRest = false,
    skipCoachXp = false,
    coachXpAccum,
    skipLeagueEvent = false,
    skipCacheInvalidation = false,
    skipGameUpdate = false,
    isManualReport = false,
    reportedByUserId = null,
    eventDescriptionSuffix,
    leagueCurrentWeek,
  } = effectiveOpts;

  const homeWon = homeScore > awayScore;

  // ── 1. Persist score + box score (isComplete deferred to step 7) ───────────
  // Skipped when finalizeGameAtomic() has already committed these writes atomically.
  if (!skipGameUpdate) {
    const gameUpdate: Record<string, unknown> = { homeScore, awayScore };
    if (rawBoxScore) gameUpdate.boxScore = JSON.stringify(rawBoxScore);
    if (isManualReport) {
      gameUpdate.isManuallyReported = true;
      if (reportedByUserId) gameUpdate.reportedByUserId = reportedByUserId;
    }
    await storage.updateGame(game.id, gameUpdate);
  }

  // ── 2. Standings ───────────────────────────────────────────────────────────
  if (!skipStandings) {
    await updateStandingsForGame(
      leagueId, game.season,
      game.homeTeamId, game.awayTeamId,
      homeScore, awayScore,
      game.isConference ?? false,
    );
  }

  // ── 3 + 4. Player stats and pitcher rest (both require box data) ───────────
  if (rawBoxScore) {
    if (!skipPlayerStats) {
      await Promise.all([
        accumulatePlayerStats(leagueId, game.season, game.homeTeamId, rawBoxScore.home, homeWon),
        accumulatePlayerStats(leagueId, game.season, game.awayTeamId, rawBoxScore.away, !homeWon),
      ]);
    }
    if (!skipPitcherRest) {
      await updatePitcherRestFromBox(rawBoxScore.home, rawBoxScore.away, game, leagueCurrentWeek);
    }
  }

  // ── 5. Coach XP / wins / losses / legacy score ─────────────────────────────
  if (!skipCoachXp) {
    const teams = opts.leagueTeams ?? await storage.getTeamsByLeague(leagueId);
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);

    // Accumulate into map (batch path) or write immediately (single-game path).
    const tryAccumulate = (coachId: string, won: boolean): boolean => {
      if (!coachXpAccum) return false;
      const acc = coachXpAccum.get(coachId) ?? { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
      acc.xp += won ? WIN_XP : LOSS_XP;
      acc.wins += won ? 1 : 0;
      acc.losses += won ? 0 : 1;
      acc.confWins += (game.isConference && won) ? 1 : 0;
      acc.confLosses += (game.isConference && !won) ? 1 : 0;
      coachXpAccum.set(coachId, acc);
      return true;
    };

    const writeXp = async (coachId: string, won: boolean): Promise<void> => {
      const coach = await storage.getCoach(coachId);
      if (!coach) return;
      const isConf = game.isConference && won;
      const perkBonus = won && hasPerk(coach, "gm_tactician")
        ? XP_AWARDS.TACTICIAN_WIN_BONUS + (isConf ? XP_AWARDS.TACTICIAN_CONF_BONUS : 0)
        : 0;
      const newXp = coach.xp + (won ? WIN_XP : LOSS_XP) + perkBonus;
      const newLevel = Math.floor(newXp / 1000) + 1;
      const newWins = coach.careerWins + (won ? 1 : 0);
      const newLosses = coach.careerLosses + (won ? 0 : 1);
      await storage.updateCoach(coach.id, {
        xp: newXp,
        level: newLevel,
        skillPoints: coach.skillPoints + (newLevel > coach.level ? 1 : 0),
        careerWins: newWins,
        careerLosses: newLosses,
        confWins: coach.confWins + (isConf ? 1 : 0),
        confLosses: coach.confLosses + ((game.isConference && !won) ? 1 : 0),
        legacyScore: computeLegacyScore({ ...coach, careerWins: newWins }),
      });
    };

    const xpWrites: Promise<void>[] = [];
    if (homeTeam?.coachId && !tryAccumulate(homeTeam.coachId, homeWon)) {
      xpWrites.push(writeXp(homeTeam.coachId, homeWon));
    }
    if (awayTeam?.coachId && !tryAccumulate(awayTeam.coachId, !homeWon)) {
      xpWrites.push(writeXp(awayTeam.coachId, !homeWon));
    }
    await Promise.all(xpWrites);

    // ── 5.5 Update coach rivalry (HvH games only) ──────────────────────────
    if (homeTeam?.coachId && awayTeam?.coachId) {
      try {
        const [hCoach, aCoach] = await Promise.all([
          storage.getCoach(homeTeam.coachId),
          storage.getCoach(awayTeam.coachId),
        ]);
        if (hCoach?.userId && aCoach?.userId) {
          const isPostseason =
            game.gameType === "super_regionals" || game.gameType === "cws";
          const aIsHome = hCoach.id < aCoach.id;
          const [coachAId, coachBId] = aIsHome
            ? [hCoach.id, aCoach.id]
            : [aCoach.id, hCoach.id];
          const aWon  = aIsHome ? homeWon : !homeWon;
          const aRuns = aIsHome ? homeScore : awayScore;
          const bRuns = aIsHome ? awayScore : homeScore;
          await storage.upsertRivalryFromGame(
            leagueId, coachAId, coachBId, aWon, aRuns, bRuns,
            game.season, game.week, isPostseason,
          );
        }
      } catch (e) {
        console.error("[finalizeGame] rivalry update error:", e);
      }
    }
  }

  // ── 6. GAME_RESULT league event ────────────────────────────────────────────
  if (!skipLeagueEvent) {
    try {
      const teams = opts.leagueTeams ?? await storage.getTeamsByLeague(leagueId);
      const homeTeam = teams.find(t => t.id === game.homeTeamId);
      const awayTeam = teams.find(t => t.id === game.awayTeamId);
      const winner = homeWon ? homeTeam : awayTeam;
      const loser  = homeWon ? awayTeam : homeTeam;
      const winScore  = homeWon ? homeScore : awayScore;
      const lossScore = homeWon ? awayScore : homeScore;
      const suffix = eventDescriptionSuffix ? ` ${eventDescriptionSuffix}` : "";
      await storage.createLeagueEvent({
        leagueId,
        teamId: winner?.id ?? null,
        teamName: winner?.name ?? null,
        teamAbbreviation: winner?.abbreviation ?? null,
        teamPrimaryColor: winner?.primaryColor ?? null,
        eventType: "GAME_RESULT",
        description: `${winner?.abbreviation ?? "?"} def. ${loser?.abbreviation ?? "?"} ${winScore}-${lossScore}${suffix}`,
        season: game.season,
        week: game.week,
        metadata: { gameId: game.id },
      });
    } catch (e) {
      console.error("[finalizeGame] league event error:", e);
    }
  }

  // ── 7. Mark complete (after stats + standings confirmed) ───────────────────
  // Skipped when finalizeGameAtomic() has already committed is_complete=true atomically.
  if (!skipGameUpdate) {
    await storage.updateGame(game.id, { isComplete: true });
  }

  // ── 8. Cache ───────────────────────────────────────────────────────────────
  if (!skipCacheInvalidation) {
    invalidateLeague(leagueId);
  }

  // ── 9. Generate postgame recap (non-blocking, best-effort) ─────────────────
  // Skip if a recap already exists (idempotent for retried finalizations).
  generateAndStoreRecap(game, homeScore, awayScore, rawBoxScore, leagueId, opts).catch(e =>
    console.error("[finalizeGame] recap generation error:", e),
  );
}

/** Builds and persists a GameRecap for a completed game. Exported for batch callers. */
export async function generateAndStoreRecap(
  game: Pick<Game, "id" | "homeTeamId" | "awayTeamId" | "season" | "week" | "isConference" | "gameType">,
  homeScore: number,
  awayScore: number,
  rawBoxScore: { home: any; away: any; innings?: any[] } | null,
  leagueId: string,
  opts: FinalizeGameOptions,
): Promise<void> {
  // Guard: skip if recap already exists (idempotent).
  const existing = await storage.getGameRecap(game.id);
  if (existing) return;

  const teams = opts.leagueTeams ?? await storage.getTeamsByLeague(leagueId);
  const homeTeam = teams.find(t => t.id === game.homeTeamId);
  const awayTeam = teams.find(t => t.id === game.awayTeamId);
  if (!homeTeam || !awayTeam) return;

  // Gather standings impact: query winner's record after update
  const homeWon = homeScore > awayScore;
  const winnerTeam = homeWon ? homeTeam : awayTeam;
  let standingsImpact: string | null = null;
  try {
    const allStandings = await storage.getStandingsByLeague(leagueId, game.season);
    const winnerStandings = allStandings.find(s => s.teamId === winnerTeam.id);
    if (winnerStandings) {
      standingsImpact = `${winnerTeam.abbreviation} improve to ${winnerStandings.wins}-${winnerStandings.losses}`;
      if (game.isConference) {
        standingsImpact += ` (${winnerStandings.conferenceWins ?? 0}-${winnerStandings.conferenceLosses ?? 0} conf)`;
      }
    }
  } catch { /* ignore */ }

  // Gather series status for conference series games (fri/sat/sun)
  let seriesStatus: string | null = null;
  const gameTypeOrder = ["friday", "saturday", "sunday"];
  if (game.isConference && game.gameType && gameTypeOrder.includes(game.gameType)) {
    try {
      const allGames = await storage.getGamesByLeagueSeason(leagueId, game.season);
      const seriesGames = allGames.filter(g =>
        g.isComplete &&
        g.week === game.week &&
        ((g.homeTeamId === game.homeTeamId && g.awayTeamId === game.awayTeamId) ||
         (g.homeTeamId === game.awayTeamId && g.awayTeamId === game.homeTeamId))
      );
      if (seriesGames.length > 1) {
        const homeWins = seriesGames.filter(g => g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore).length;
        const awayWins = seriesGames.length - homeWins;
        const seriesWinner = homeWins > awayWins ? homeTeam : awayWins > homeWins ? awayTeam : null;
        if (seriesWinner) {
          seriesStatus = `${seriesWinner.abbreviation} lead series ${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}`;
        } else {
          seriesStatus = `Series tied ${homeWins}-${awayWins}`;
        }
      }
    } catch { /* ignore */ }
  }

  const recapPayload = generateGameRecap({
    game: {
      id: game.id,
      leagueId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeTeam: { name: homeTeam.name, abbreviation: homeTeam.abbreviation, primaryColor: homeTeam.primaryColor },
      awayTeam: { name: awayTeam.name, abbreviation: awayTeam.abbreviation, primaryColor: awayTeam.primaryColor },
      homeScore,
      awayScore,
      phase: (game as any).phase ?? null,
      gameType: game.gameType ?? null,
      season: game.season,
      week: game.week,
      isConference: game.isConference ?? false,
    },
    boxScore: rawBoxScore ? {
      innings: (rawBoxScore.innings as number[][] | undefined) ?? [],
      home: rawBoxScore.home,
      away: rawBoxScore.away,
    } : null,
    seriesInfo: { status: seriesStatus },
    standingsInfo: { impact: standingsImpact },
  });

  await storage.createGameRecap(recapPayload);
}

/**
 * Flush accumulated coach XP deltas to the DB.
 *
 * Call once after a batch of finalizeGame() calls that shared the same
 * coachXpAccum map. Writes one updateCoach() per coach regardless of how many
 * games they played in the batch.
 *
 * @param coachXpAccum  Map populated by finalizeGame() with opts.coachXpAccum.
 * @param allCoaches    Pre-fetched coaches (skips N individual getCoach() calls).
 *                      If omitted each coach is fetched individually.
 */
export async function flushCoachXp(
  coachXpAccum: Map<string, CoachXpDelta>,
  allCoaches?: CoachSnapshot[],
): Promise<void> {
  if (coachXpAccum.size === 0) return;
  const coachMap = allCoaches ? new Map(allCoaches.map(c => [c.id, c])) : null;
  await Promise.all(Array.from(coachXpAccum.entries()).map(async ([coachId, delta]) => {
    const coach = coachMap?.get(coachId) ?? await storage.getCoach(coachId);
    if (!coach) return;
    // Apply gm_tactician perk bonus based on accumulated win/confWin counts
    const perkWinBonus = hasPerk(coach, "gm_tactician")
      ? delta.wins * XP_AWARDS.TACTICIAN_WIN_BONUS + delta.confWins * XP_AWARDS.TACTICIAN_CONF_BONUS
      : 0;
    const newXp = coach.xp + delta.xp + perkWinBonus;
    const newLevel = Math.floor(newXp / 1000) + 1;
    const skillPointsGained = Math.max(0, newLevel - coach.level);
    const newWins = coach.careerWins + delta.wins;
    await storage.updateCoach(coach.id, {
      xp: newXp,
      level: newLevel,
      skillPoints: coach.skillPoints + skillPointsGained,
      careerWins: newWins,
      careerLosses: coach.careerLosses + delta.losses,
      confWins: coach.confWins + delta.confWins,
      confLosses: coach.confLosses + delta.confLosses,
      legacyScore: computeLegacyScore({ ...coach, careerWins: newWins }),
    });
  }));
}

/**
 * Award XP for a postseason milestone. Call this wherever confChampionships /
 * cwsAppearances / nationalChampionships are incremented on a coach.
 *
 * Applies gm_playoff_poise (+150 per milestone) and gm_legendary
 * (+300 for CWS, +1 free SP for conf champ) perks automatically.
 */
export async function awardPostseasonXp(
  coachId: string,
  milestone: "conf_champ" | "cws_appearance" | "cws_win",
): Promise<void> {
  try {
    const coach = await storage.getCoach(coachId);
    if (!coach) return;

    const baseXp: Record<string, number> = {
      conf_champ: XP_AWARDS.CONF_CHAMP,
      cws_appearance: XP_AWARDS.CWS_APPEARANCE,
      cws_win: XP_AWARDS.CWS_WIN,
    };

    const postseasonBonus = hasPerk(coach, "gm_playoff_poise") ? XP_AWARDS.PLAYOFF_POISE_BONUS : 0;
    const legendaryCwsBonus =
      (milestone === "cws_appearance" || milestone === "cws_win") && hasPerk(coach, "gm_legendary")
        ? XP_AWARDS.LEGENDARY_CWS_BONUS
        : 0;
    const legendarySpBonus = milestone === "conf_champ" && hasPerk(coach, "gm_legendary") ? 1 : 0;

    const totalXp = (baseXp[milestone] ?? 0) + postseasonBonus + legendaryCwsBonus;
    const newXp = coach.xp + totalXp;
    const newLevel = Math.floor(newXp / 1000) + 1;
    const levelSpGained = Math.max(0, newLevel - coach.level);

    await storage.updateCoach(coach.id, {
      xp: newXp,
      level: newLevel,
      skillPoints: coach.skillPoints + levelSpGained + legendarySpBonus,
    });
  } catch (e) {
    console.error(`[awardPostseasonXp] ${milestone} coachId=${coachId}:`, e);
  }
}

/**
 * Award XP for signing a recruit. Uses star-based XP scale.
 * Call after a human coach signs a recruit.
 */
export async function awardRecruitSignXp(
  coachId: string,
  starRank: number,
  isBlueChip: boolean,
): Promise<void> {
  try {
    const coach = await storage.getCoach(coachId);
    if (!coach) return;
    const signXp = isBlueChip
      ? XP_AWARDS.SIGN_BLUE_CHIP
      : (XP_AWARDS.SIGN_BY_STAR[Math.min(5, Math.max(1, starRank)) as 1 | 2 | 3 | 4 | 5] ?? XP_AWARDS.SIGN_BY_STAR[1]);
    const newXp = coach.xp + signXp;
    const newLevel = Math.floor(newXp / 1000) + 1;
    const skillPointsGained = Math.max(0, newLevel - coach.level);
    await storage.updateCoach(coach.id, {
      xp: newXp,
      level: newLevel,
      skillPoints: coach.skillPoints + skillPointsGained,
    });
  } catch (e) {
    console.error(`[awardRecruitSignXp] coachId=${coachId}:`, e);
  }
}

/**
 * Finalise a reported game. Delegates to finalizeGame() with manual-report
 * flags set. This is the correct path for commissioner confirm/finalize and
 * opposing-coach confirm flows.
 *
 * Coach XP is awarded here (previously missing from the reported-game path).
 * Cache invalidation is left to the caller (games.ts confirm/finalize routes).
 */
export async function finalizeReportedGame(report: GameReport, game: Game, leagueId: string): Promise<void> {
  const { homeScore, awayScore } = report;
  const homeBoxData = report.homeBoxData as Record<string, unknown> | null;
  const awayBoxData = report.awayBoxData as Record<string, unknown> | null;
  const inningScores = (report.inningScores as number[][] | null) ?? [];
  const homeHits   = report.homeHits   ?? 0;
  const awayHits   = report.awayHits   ?? 0;
  const homeErrors = report.homeErrors ?? 0;
  const awayErrors = report.awayErrors ?? 0;

  const boxScore = {
    innings: inningScores,
    home: enrichBoxData(homeBoxData, homeErrors, homeScore, homeHits),
    away: enrichBoxData(awayBoxData, awayErrors, awayScore, awayHits),
  };

  // Use atomic wrapper so concurrent confirm/force-finalize calls can't
  // double-apply standings, stats, or XP.
  await finalizeGameAtomic(game, homeScore, awayScore, boxScore, leagueId, {
    isManualReport: true,
    reportedByUserId: report.reporterUserId,
    eventDescriptionSuffix: "(Reported)",
    skipCacheInvalidation: true,  // caller (games.ts) calls invalidateLeague after
    finalizer: "reported-game",
  });
}

// ── Internal helper: build player stat records from a single box without DB writes ──

async function buildPlayerStatsForBox(
  leagueId: string,
  season: number,
  teamId: string,
  boxData: any,
  teamWon?: boolean,
): Promise<InsertPlayerSeasonStats[]> {
  if (!boxData) return [];
  let bd = boxData;

  // Resolve fake_ IDs (defensive — engine usually emits real IDs in advance path)
  const hasFakeIds =
    (bd.batting  || []).some((b: any) => b.playerId?.startsWith("fake_")) ||
    (bd.pitching || []).some((p: any) => p.playerId?.startsWith("fake_"));
  if (hasFakeIds) {
    const teamPlayers = await storage.getPlayersByTeam(teamId);
    const nameToId = new Map<string, string>();
    for (const pl of teamPlayers) nameToId.set(`${pl.firstName} ${pl.lastName}`.toLowerCase(), pl.id);
    const resolve = (entry: any): any => {
      if (!entry.playerId?.startsWith("fake_")) return entry;
      const realId = nameToId.get((entry.name || "").toLowerCase());
      return realId ? { ...entry, playerId: realId } : { ...entry, playerId: null };
    };
    bd = { ...bd, batting: (bd.batting || []).map(resolve), pitching: (bd.pitching || []).map(resolve) };
  }

  const statsMap = new Map<string, InsertPlayerSeasonStats>();

  if (bd.batting) {
    for (const b of bd.batting) {
      if (!b.playerId || b.playerId.startsWith("fake_")) continue;
      statsMap.set(b.playerId, {
        playerId: b.playerId, playerName: b.name, teamId, leagueId, season, position: b.position,
        games: 1, ab: b.ab || 0, r: b.r || 0, h: b.h || 0,
        doubles: b.doubles || 0, triples: b.triples || 0, hr: b.hr || 0,
        rbi: b.rbi || 0, bb: b.bb || 0, hbp: b.hbp || 0, so: b.so || 0,
        sb: b.sb || 0, cs: b.cs || 0,
        exitVeloTotal: b.exitVelo || 0, barrels: b.barrels || 0,
        ballsInPlay: b.ballsInPlay || 0, hardHits: b.hardHits || 0,
        putouts: b.putouts || 0, assists: b.assists || 0,
        fieldingErrors: b.fieldingErrors || 0, totalChances: b.totalChances || 0, wpa: 0,
        pitchingGames: 0, wins: 0, losses: 0, ipOuts: 0,
        pHits: 0, pRuns: 0, pEr: 0, pBb: 0, pSo: 0, pHr: 0,
        totalPitches: 0, whiffs: 0, spinRateTotal: 0,
      });
    }
  }

  // Determine winning / losing pitcher
  let winningPitcherId: string | null = null;
  let losingPitcherId: string | null = null;
  if (teamWon !== undefined && Array.isArray(bd.pitching)) {
    if (teamWon) {
      for (const p of bd.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        winningPitcherId = p.playerId;
      }
    } else {
      let maxEr = -1; let firstPid: string | null = null;
      for (const p of bd.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        if (firstPid === null) firstPid = p.playerId;
        if ((p.er || 0) > maxEr) { maxEr = p.er || 0; losingPitcherId = p.playerId; }
      }
      if (losingPitcherId === null) losingPitcherId = firstPid;
    }
  }

  if (bd.pitching) {
    for (const p of bd.pitching) {
      if (!p.playerId || p.playerId.startsWith("fake_")) continue;
      const [whole, frac] = String(p.ip).split(".");
      const totalOuts = (parseInt(whole) || 0) * 3 + Math.min(parseInt(frac) || 0, 2);
      const isWin = p.playerId === winningPitcherId;
      const isLoss = p.playerId === losingPitcherId;
      const ex = statsMap.get(p.playerId);
      if (ex) {
        ex.pitchingGames = 1; ex.ipOuts = totalOuts;
        ex.pHits = p.h || 0; ex.pRuns = p.r || 0; ex.pEr = p.er || 0;
        ex.pBb = p.bb || 0; ex.pSo = p.so || 0; ex.pHr = p.hr || 0;
        ex.totalPitches = p.totalPitches || 0; ex.whiffs = p.whiffs || 0;
        ex.spinRateTotal = p.spinRate || 0;
        if (isWin) ex.wins = 1;
        if (isLoss) ex.losses = 1;
      } else {
        statsMap.set(p.playerId, {
          playerId: p.playerId, playerName: p.name, teamId, leagueId, season, position: "P",
          games: 1, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
          rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0,
          exitVeloTotal: 0, barrels: 0, ballsInPlay: 0, hardHits: 0,
          putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0, wpa: 0,
          pitchingGames: 1, wins: isWin ? 1 : 0, losses: isLoss ? 1 : 0, ipOuts: totalOuts,
          pHits: p.h || 0, pRuns: p.r || 0, pEr: p.er || 0,
          pBb: p.bb || 0, pSo: p.so || 0, pHr: p.hr || 0,
          totalPitches: p.totalPitches || 0, whiffs: p.whiffs || 0, spinRateTotal: p.spinRate || 0,
        });
      }
    }
  }

  return Array.from(statsMap.values());
}

/**
 * Batch-finalise all games for a single week-advance tick.
 *
 * Replaces N×(standings SELECT×2 + standings UPDATE×2 + playerStats SELECT×N + playerStats UPDATE×N)
 * with three bulk SQL calls:
 *   1. ONE batchUpdateGames      — update scores + is_complete for all games
 *   2. ONE batchIncrementStandings — sum all deltas per team, then single UPDATE
 *   3. ONE batchUpsertPlayerSeasonStats — pre-aggregate per player, fetch existing once, batch UPDATE/INSERT
 *   4. Pitcher rest — parallel (light, only updates pitchers per game)
 *   5. Coach XP    — accumulated into coachXpAccum map (zero extra DB writes)
 */
export async function batchFinalizeGames(
  results: Array<{
    game: Pick<Game, "id" | "homeTeamId" | "awayTeamId" | "season" | "week" | "isConference" | "gameType">;
    result: { homeScore: number; awayScore: number; boxScore: string };
  }>,
  leagueId: string,
  season: number,
  coachXpAccum: Map<string, CoachXpDelta>,
  leagueTeams: Team[],
  coaches?: Coach[],
  options?: { skipStandings?: boolean; skipCoachXp?: boolean },
): Promise<void> {
  if (results.length === 0) return;

  // ── 1. Batch update game scores + isComplete ──────────────────────────────
  await storage.batchUpdateGames(
    results.map(({ game, result }) => ({
      id: game.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      boxScore: result.boxScore,
    }))
  );

  // ── 2. Batch increment standings — aggregate all deltas in memory first ────
  if (!options?.skipStandings) {
    const standingDeltas = new Map<string, {
      wins: number; losses: number; confWins: number; confLosses: number;
      runsScored: number; runsAllowed: number;
    }>();
    for (const { game, result } of results) {
      const homeWon = result.homeScore > result.awayScore;
      const isConf  = game.isConference ?? false;
      const hd = standingDeltas.get(game.homeTeamId) ??
        { wins: 0, losses: 0, confWins: 0, confLosses: 0, runsScored: 0, runsAllowed: 0 };
      hd.wins      += homeWon ? 1 : 0;
      hd.losses    += homeWon ? 0 : 1;
      hd.confWins  += (isConf && homeWon)  ? 1 : 0;
      hd.confLosses+= (isConf && !homeWon) ? 1 : 0;
      hd.runsScored += result.homeScore;
      hd.runsAllowed+= result.awayScore;
      standingDeltas.set(game.homeTeamId, hd);

      const ad = standingDeltas.get(game.awayTeamId) ??
        { wins: 0, losses: 0, confWins: 0, confLosses: 0, runsScored: 0, runsAllowed: 0 };
      ad.wins      += homeWon ? 0 : 1;
      ad.losses    += homeWon ? 1 : 0;
      ad.confWins  += (isConf && !homeWon) ? 1 : 0;
      ad.confLosses+= (isConf && homeWon)  ? 1 : 0;
      ad.runsScored += result.awayScore;
      ad.runsAllowed+= result.homeScore;
      standingDeltas.set(game.awayTeamId, ad);
    }
    await storage.batchIncrementStandings(
      leagueId, season,
      Array.from(standingDeltas.entries()).map(([teamId, d]) => ({ teamId, ...d }))
    );
  }

  // ── 3. Batch upsert player stats — collect from all game boxes at once ────
  const allPlayerStats: InsertPlayerSeasonStats[] = [];
  for (const { game, result } of results) {
    try {
      const box = JSON.parse(result.boxScore);
      const homeWon = result.homeScore > result.awayScore;
      const [homeStats, awayStats] = await Promise.all([
        buildPlayerStatsForBox(leagueId, season, game.homeTeamId, box.home, homeWon),
        buildPlayerStatsForBox(leagueId, season, game.awayTeamId, box.away, !homeWon),
      ]);
      allPlayerStats.push(...homeStats, ...awayStats);
    } catch (e) {
      console.error("[batchFinalizeGames] box parse error:", e);
    }
  }
  if (allPlayerStats.length > 0) {
    await storage.batchUpsertPlayerSeasonStats(allPlayerStats);
  }

  // ── 4. Pitcher rest (parallel — fast, only touches pitcher rows) ──────────
  await Promise.all(
    results.map(async ({ game, result }) => {
      try {
        const box = JSON.parse(result.boxScore);
        await updatePitcherRestFromBox(box.home, box.away, game);
      } catch { /* non-critical */ }
    })
  );

  // ── 5. Coach XP accumulation (zero DB writes — caller flushes once after) ─
  if (!options?.skipCoachXp) {
    const coachById = coaches ? new Map(coaches.map(c => [c.id, c])) : new Map<string, Coach>();
    for (const { game, result } of results) {
      const homeWon = result.homeScore > result.awayScore;
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      if (homeTeam?.coachId) {
        const acc = coachXpAccum.get(homeTeam.coachId) ??
          { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
        acc.xp     += homeWon ? WIN_XP : LOSS_XP;
        acc.wins   += homeWon ? 1 : 0;
        acc.losses += homeWon ? 0 : 1;
        acc.confWins  += (game.isConference && homeWon)  ? 1 : 0;
        acc.confLosses+= (game.isConference && !homeWon) ? 1 : 0;
        coachXpAccum.set(homeTeam.coachId, acc);
      }
      if (awayTeam?.coachId) {
        const acc = coachXpAccum.get(awayTeam.coachId) ??
          { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
        acc.xp     += homeWon ? LOSS_XP : WIN_XP;
        acc.wins   += homeWon ? 0 : 1;
        acc.losses += homeWon ? 1 : 0;
        acc.confWins  += (game.isConference && !homeWon) ? 1 : 0;
        acc.confLosses+= (game.isConference && homeWon)  ? 1 : 0;
        coachXpAccum.set(awayTeam.coachId, acc);
      }

      // ── 5.5 Rivalry updates — HvH games only (same logic as finalizeGame) ───
      if (homeTeam?.coachId && awayTeam?.coachId) {
        const hCoach = coachById.get(homeTeam.coachId);
        const aCoach = coachById.get(awayTeam.coachId);
        if (hCoach?.userId && aCoach?.userId) {
          const isPostseason =
            game.gameType === "super_regionals" || game.gameType === "cws";
          const aIsHome = hCoach.id < aCoach.id;
          const [coachAId, coachBId] = aIsHome
            ? [hCoach.id, aCoach.id]
            : [aCoach.id, hCoach.id];
          const aWon  = aIsHome ? homeWon : !homeWon;
          const aRuns = aIsHome ? result.homeScore : result.awayScore;
          const bRuns = aIsHome ? result.awayScore : result.homeScore;
          storage.upsertRivalryFromGame(
            leagueId, coachAId, coachBId, aWon, aRuns, bRuns,
            game.season, game.week, isPostseason,
          ).catch(e => console.error("[batchFinalizeGames] rivalry update error:", e));
        }
      }
    }
  }

  // ── 9. Fire-and-forget recap generation per game (best-effort) ────────────
  for (const { game, result } of results) {
    try {
      const box = JSON.parse(result.boxScore);
      generateAndStoreRecap(game, result.homeScore, result.awayScore, box, leagueId, {
        leagueTeams,
        skipLeagueEvent: true,
        skipCacheInvalidation: true,
      }).catch(e => console.error("[batchFinalizeGames] recap error:", e));
    } catch { /* non-critical */ }
  }
}

/**
 * Atomic wrapper around finalizeGame() that provides exactly-once finalization.
 *
 * Uses a single DB transaction to:
 *   1. Lock the game row (FOR UPDATE) — serialises concurrent finalization calls
 *   2. Check the sentinel table (idempotency — returns immediately if already done)
 *   3. INSERT the sentinel row
 *   4. UPDATE games: scores + is_complete = true atomically
 *   5. COMMIT — after this point the game is permanently marked complete
 *
 * Side-effects (standings, stats, XP, league events, cache) are applied OUTSIDE
 * the transaction after the commit. They run at most once per game: the sentinel
 * blocks re-entry, and `is_complete = true` means the game object itself reflects
 * completion even before side-effects finish.
 *
 * Usage:
 *   const { alreadyFinalized } = await finalizeGameAtomic(
 *     game, home, away, box, leagueId, { finalizer: "quick-score" }
 *   );
 *   if (alreadyFinalized) return res.json(existingGame);
 */
export async function finalizeGameAtomic(
  game: Pick<Game, "id" | "homeTeamId" | "awayTeamId" | "season" | "week" | "isConference" | "gameType">,
  homeScore: number,
  awayScore: number,
  rawBoxScore: { home: any; away: any; innings?: any[] } | null,
  leagueId: string,
  opts: FinalizeGameOptions & { finalizer?: string } = {},
): Promise<{ alreadyFinalized: boolean }> {
  const { finalizer = "unknown", ...finalizeOpts } = opts;
  const isManualReport = finalizeOpts.isManualReport ?? false;
  const reportedByUserId = finalizeOpts.reportedByUserId ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: lock game row — serialises concurrent calls on this game
    await client.query("SELECT id FROM games WHERE id = $1 FOR UPDATE", [game.id]);

    // Step 2: idempotency check inside the transaction
    const existing = await client.query<{ game_id: string }>(
      "SELECT game_id FROM game_finalizations WHERE game_id = $1",
      [game.id],
    );
    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return { alreadyFinalized: true };
    }

    // Step 3: claim sentinel
    await client.query(
      "INSERT INTO game_finalizations (game_id, finalizer) VALUES ($1, $2)",
      [game.id, finalizer],
    );

    // Step 4: write scores + mark game complete atomically
    const setParts: string[] = ["home_score = $2", "away_score = $3", "is_complete = true"];
    const params: unknown[] = [game.id, homeScore, awayScore];
    let paramIdx = 4;
    if (rawBoxScore) {
      setParts.push(`box_score = $${paramIdx++}`);
      params.push(JSON.stringify(rawBoxScore));
    }
    if (isManualReport) {
      setParts.push("is_manually_reported = true");
      if (reportedByUserId) {
        setParts.push(`reported_by_user_id = $${paramIdx++}`);
        params.push(reportedByUserId);
      }
    }
    await client.query(
      `UPDATE games SET ${setParts.join(", ")} WHERE id = $1`,
      params,
    );

    // Step 5: commit — game is now permanently complete
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Side-effects run after the atomic commit. skipGameUpdate=true prevents
  // finalizeGame() from re-writing scores/isComplete (already committed above).
  await finalizeGame(game, homeScore, awayScore, rawBoxScore, leagueId, {
    ...finalizeOpts,
    skipGameUpdate: true,
  });

  return { alreadyFinalized: false };
}
