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
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import type { Game, GameReport, Team, InsertPlayerSeasonStats, Coach } from "@shared/schema";
import {
  games as gamesTable,
  gameFinalizations,
  standings,
  playerSeasonStats,
  leagueEvents,
  coaches,
  players,
  coachRivalries,
  teams as teamsTable,
} from "@shared/schema";
import {
  updateStandingsForGame,
  accumulatePlayerStats,
  updatePitcherRestFromBox,
  computeLegacyScore,
  enrichBoxData,
} from "./game-engine";
import { invalidateLeague } from "./cache";
import { hasPerk, XP_AWARDS } from "@shared/coachPerks";
import { GAME_TYPE_TO_DAY, ipToOuts } from "@shared/pitcherRest";
import { generateGameRecap } from "./lib/recap-generator";

/** Drizzle transaction type (same interface as db). */
type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

// ── Private helpers for finalizeGameAtomic (use tx, not storage) ─────────────

/**
 * Upserts player-season stats for one side of a box score inside a transaction.
 * Replicates `accumulatePlayerStats` + `storage.upsertPlayerSeasonStats` using `tx`.
 */
async function upsertBoxSideStatsInTx(
  tx: DrizzleTx,
  leagueId: string,
  season: number,
  teamId: string,
  boxData: any,
  teamWon?: boolean,
): Promise<void> {
  if (!boxData) return;

  // Resolve fake_ IDs the same way accumulatePlayerStats does.
  const hasFakeIds =
    (boxData.batting || []).some((b: any) => b.playerId?.startsWith("fake_")) ||
    (boxData.pitching || []).some((p: any) => p.playerId?.startsWith("fake_"));
  if (hasFakeIds) {
    const teamPlayers = await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
      .from(players).where(eq(players.teamId, teamId));
    const nameToId = new Map<string, string>();
    for (const pl of teamPlayers) {
      nameToId.set(`${pl.firstName} ${pl.lastName}`.toLowerCase(), pl.id);
    }
    const resolve = (entry: any) => {
      if (!entry.playerId?.startsWith("fake_")) return entry;
      const realId = nameToId.get((entry.name || "").toLowerCase());
      return realId ? { ...entry, playerId: realId } : { ...entry, playerId: null };
    };
    boxData = {
      ...boxData,
      batting: (boxData.batting || []).map(resolve),
      pitching: (boxData.pitching || []).map(resolve),
    };
  }

  const playerStatsMap = new Map<string, InsertPlayerSeasonStats>();

  for (const b of (boxData.batting || [])) {
    if (!b.playerId || b.playerId.startsWith("fake_")) continue;
    playerStatsMap.set(b.playerId, {
      playerId: b.playerId, playerName: b.name, teamId, leagueId, season, position: b.position,
      games: 1, ab: b.ab || 0, r: b.r || 0, h: b.h || 0, doubles: b.doubles || 0,
      triples: b.triples || 0, hr: b.hr || 0, rbi: b.rbi || 0, bb: b.bb || 0,
      hbp: b.hbp || 0, so: b.so || 0, sb: b.sb || 0, cs: b.cs || 0,
      exitVeloTotal: b.exitVelo || 0, barrels: b.barrels || 0, ballsInPlay: b.ballsInPlay || 0,
      hardHits: b.hardHits || 0, putouts: b.putouts || 0, assists: b.assists || 0,
      fieldingErrors: b.fieldingErrors || 0, totalChances: b.totalChances || 0, wpa: 0,
      pitchingGames: 0, wins: 0, losses: 0, ipOuts: 0,
      pHits: 0, pRuns: 0, pEr: 0, pBb: 0, pSo: 0, pHr: 0,
      totalPitches: 0, whiffs: 0, spinRateTotal: 0,
    });
  }

  // Determine winning/losing pitcher using pitcher-of-record logic.
  let winningPitcherId: string | null = null;
  let losingPitcherId: string | null = null;
  if (teamWon !== undefined && Array.isArray(boxData.pitching)) {
    if (teamWon) {
      for (const p of boxData.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        winningPitcherId = p.playerId;
      }
    } else {
      let maxEr = -1, firstId: string | null = null;
      for (const p of boxData.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        if (!firstId) firstId = p.playerId;
        if ((p.er || 0) > maxEr) { maxEr = p.er || 0; losingPitcherId = p.playerId; }
      }
      if (!losingPitcherId) losingPitcherId = firstId;
    }
  }

  for (const p of (boxData.pitching || [])) {
    if (!p.playerId || p.playerId.startsWith("fake_")) continue;
    const ipParts = String(p.ip).split(".");
    const ipOuts = Math.min(parseInt(ipParts[1]) || 0, 2) + (parseInt(ipParts[0]) || 0) * 3;
    const isWin = p.playerId === winningPitcherId;
    const isLoss = p.playerId === losingPitcherId;
    const existing = playerStatsMap.get(p.playerId);
    if (existing) {
      existing.pitchingGames = 1; existing.ipOuts = ipOuts;
      existing.pHits = p.h || 0; existing.pRuns = p.r || 0; existing.pEr = p.er || 0;
      existing.pBb = p.bb || 0; existing.pSo = p.so || 0; existing.pHr = p.hr || 0;
      existing.totalPitches = p.totalPitches || 0; existing.whiffs = p.whiffs || 0;
      existing.spinRateTotal = p.spinRate || 0;
      if (isWin) existing.wins = 1; if (isLoss) existing.losses = 1;
    } else {
      playerStatsMap.set(p.playerId, {
        playerId: p.playerId, playerName: p.name, teamId, leagueId, season, position: "P",
        games: 1, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0,
        bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, exitVeloTotal: 0, barrels: 0,
        ballsInPlay: 0, hardHits: 0, putouts: 0, assists: 0, fieldingErrors: 0,
        totalChances: 0, wpa: 0,
        pitchingGames: 1, wins: isWin ? 1 : 0, losses: isLoss ? 1 : 0, ipOuts,
        pHits: p.h || 0, pRuns: p.r || 0, pEr: p.er || 0, pBb: p.bb || 0,
        pSo: p.so || 0, pHr: p.hr || 0, totalPitches: p.totalPitches || 0,
        whiffs: p.whiffs || 0, spinRateTotal: p.spinRate || 0,
      });
    }
  }

  for (const data of playerStatsMap.values()) {
    const [existing] = await tx.select().from(playerSeasonStats).where(
      and(eq(playerSeasonStats.playerId, data.playerId),
          eq(playerSeasonStats.leagueId, data.leagueId),
          eq(playerSeasonStats.season, data.season))
    );
    if (existing) {
      await tx.update(playerSeasonStats).set({
        playerName: data.playerName, teamId: data.teamId, position: data.position,
        games:         existing.games         + (data.games ?? 0),
        ab:            existing.ab            + (data.ab ?? 0),
        r:             existing.r             + (data.r ?? 0),
        h:             existing.h             + (data.h ?? 0),
        doubles:       existing.doubles       + (data.doubles ?? 0),
        triples:       existing.triples       + (data.triples ?? 0),
        hr:            existing.hr            + (data.hr ?? 0),
        rbi:           existing.rbi           + (data.rbi ?? 0),
        bb:            existing.bb            + (data.bb ?? 0),
        hbp:           existing.hbp           + (data.hbp ?? 0),
        so:            existing.so            + (data.so ?? 0),
        sb:            existing.sb            + (data.sb ?? 0),
        cs:            existing.cs            + (data.cs ?? 0),
        exitVeloTotal: existing.exitVeloTotal + (data.exitVeloTotal ?? 0),
        barrels:       existing.barrels       + (data.barrels ?? 0),
        ballsInPlay:   existing.ballsInPlay   + (data.ballsInPlay ?? 0),
        hardHits:      existing.hardHits      + (data.hardHits ?? 0),
        pitchingGames: existing.pitchingGames + (data.pitchingGames ?? 0),
        wins:          existing.wins          + (data.wins ?? 0),
        losses:        existing.losses        + (data.losses ?? 0),
        ipOuts:        existing.ipOuts        + (data.ipOuts ?? 0),
        pHits:         existing.pHits         + (data.pHits ?? 0),
        pRuns:         existing.pRuns         + (data.pRuns ?? 0),
        pEr:           existing.pEr           + (data.pEr ?? 0),
        pBb:           existing.pBb           + (data.pBb ?? 0),
        pSo:           existing.pSo           + (data.pSo ?? 0),
        pHr:           existing.pHr           + (data.pHr ?? 0),
        totalPitches:  existing.totalPitches  + (data.totalPitches ?? 0),
        whiffs:        existing.whiffs        + (data.whiffs ?? 0),
        spinRateTotal: existing.spinRateTotal + (data.spinRateTotal ?? 0),
        putouts:       existing.putouts       + (data.putouts ?? 0),
        assists:       existing.assists       + (data.assists ?? 0),
        fieldingErrors:existing.fieldingErrors+ (data.fieldingErrors ?? 0),
        totalChances:  existing.totalChances  + (data.totalChances ?? 0),
        wpa:           existing.wpa           + (data.wpa ?? 0),
      }).where(eq(playerSeasonStats.id, existing.id));
    } else {
      await tx.insert(playerSeasonStats).values(data);
    }
  }
}

/**
 * Updates pitcher rest tracking inside a transaction.
 * Replicates `bulkUpdatePlayerRest` + `updatePitcherRestFromBox` using `tx`.
 */
async function updatePitcherRestInTx(
  tx: DrizzleTx,
  homeBoxData: any,
  awayBoxData: any,
  game: { gameType?: string | null; week?: number | null },
  leagueCurrentWeek?: number,
): Promise<void> {
  const gameDay = GAME_TYPE_TO_DAY[game.gameType ?? ""] ?? "WED";
  const gameWeek = game.week ?? leagueCurrentWeek ?? 1;
  const updates: Array<{ id: string; outs: number; week: number; day: string }> = [];
  for (const boxData of [homeBoxData, awayBoxData]) {
    if (!Array.isArray(boxData?.pitching)) continue;
    for (const p of boxData.pitching) {
      const pid = p.playerId as string | undefined;
      if (!pid || pid.startsWith("fake_")) continue;
      const outs = ipToOuts((p.ip as string) ?? "0.0");
      if (outs > 0) updates.push({ id: pid, outs, week: gameWeek, day: gameDay });
    }
  }
  if (updates.length === 0) return;
  const outsWhen = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.outs}::integer`), sql` `);
  const weekWhen = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.week}::integer`), sql` `);
  const dayWhen  = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.day}`),          sql` `);
  const ids      = sql.join(updates.map(u => sql`${u.id}`),                              sql`, `);
  await tx.execute(sql`
    UPDATE players
    SET last_pitched_outs = CASE id ${outsWhen} END,
        last_pitched_week = CASE id ${weekWhen} END,
        last_pitched_day  = CASE id ${dayWhen}  END
    WHERE id IN (${ids})
  `);
}

/**
 * Writes coach XP + rivalry inside a transaction (single-game path only).
 * Batch callers use `coachXpAccum` and call `flushCoachXp()` instead.
 */
async function writeCoachXpAndRivalryInTx(
  tx: DrizzleTx,
  homeTeam: { coachId?: string | null } | undefined,
  awayTeam: { coachId?: string | null } | undefined,
  homeWon: boolean,
  homeScore: number,
  awayScore: number,
  game: Pick<Game, "isConference" | "season" | "week" | "gameType">,
  leagueId: string,
): Promise<void> {
  const writeXp = async (coachId: string | null | undefined, won: boolean): Promise<void> => {
    if (!coachId) return;
    const [coach] = await tx.select().from(coaches).where(eq(coaches.id, coachId));
    if (!coach) return;
    const isConf = !!(game.isConference && won);
    const perkBonus = won && hasPerk(coach, "gm_tactician")
      ? XP_AWARDS.TACTICIAN_WIN_BONUS + (isConf ? XP_AWARDS.TACTICIAN_CONF_BONUS : 0)
      : 0;
    const newXp     = coach.xp + (won ? WIN_XP : LOSS_XP) + perkBonus;
    const newLevel  = Math.floor(newXp / 1000) + 1;
    const newWins   = coach.careerWins   + (won ? 1 : 0);
    const newLosses = coach.careerLosses + (won ? 0 : 1);
    await tx.update(coaches).set({
      xp:          newXp,
      level:       newLevel,
      skillPoints: coach.skillPoints + (newLevel > coach.level ? 1 : 0),
      careerWins:  newWins,
      careerLosses: newLosses,
      confWins:    coach.confWins    + (isConf ? 1 : 0),
      confLosses:  coach.confLosses  + ((game.isConference && !won) ? 1 : 0),
      legacyScore: computeLegacyScore({ ...coach, careerWins: newWins }),
    }).where(eq(coaches.id, coachId));
  };

  await writeXp(homeTeam?.coachId, homeWon);
  await writeXp(awayTeam?.coachId, !homeWon);

  // Rivalry update: HvH games only (both coaches must have a userId).
  if (homeTeam?.coachId && awayTeam?.coachId) {
    try {
      const [hCoach] = await tx.select({ id: coaches.id, userId: coaches.userId })
        .from(coaches).where(eq(coaches.id, homeTeam.coachId));
      const [aCoach] = await tx.select({ id: coaches.id, userId: coaches.userId })
        .from(coaches).where(eq(coaches.id, awayTeam.coachId));
      if (hCoach?.userId && aCoach?.userId) {
        const isPostseason = game.gameType === "super_regionals" || game.gameType === "cws";
        const aIsHome = hCoach.id < aCoach.id;
        const [coachAId, coachBId] = aIsHome
          ? [hCoach.id, aCoach.id] : [aCoach.id, hCoach.id];
        const aWon  = aIsHome ? homeWon : !homeWon;
        const aRuns = aIsHome ? homeScore : awayScore;
        const bRuns = aIsHome ? awayScore : homeScore;
        const margin = Math.abs(aRuns - bRuns);
        const winnerId = aWon ? coachAId : coachBId;
        const [existing] = await tx.select().from(coachRivalries).where(
          and(
            eq(coachRivalries.leagueId, leagueId),
            eq(coachRivalries.coachAId, coachAId),
            eq(coachRivalries.coachBId, coachBId),
          )
        ).limit(1);
        if (!existing) {
          await tx.insert(coachRivalries).values({
            leagueId,
            coachAId, coachBId,
            gamesPlayed: isPostseason ? 0 : 1,
            coachAWins: isPostseason ? 0 : (aWon ? 1 : 0),
            coachBWins: isPostseason ? 0 : (aWon ? 0 : 1),
            coachARunsScored: isPostseason ? 0 : aRuns,
            coachBRunsScored: isPostseason ? 0 : bRuns,
            postseasonGames: isPostseason ? 1 : 0,
            coachAPostseasonWins: isPostseason && aWon ? 1 : 0,
            coachBPostseasonWins: isPostseason && !aWon ? 1 : 0,
            currentStreakWinnerId: winnerId, currentStreakLength: 1,
            lastMeetingSeason: game.season, lastMeetingWeek: game.week,
            lastMeetingCoachAScore: aRuns, lastMeetingCoachBScore: bRuns,
            lastMeetingWinnerId: winnerId, biggestWinMargin: margin, biggestWinCoachId: winnerId,
          });
        } else {
          const newStreak = existing.currentStreakWinnerId === winnerId
            ? existing.currentStreakLength + 1 : 1;
          await tx.update(coachRivalries).set({
            gamesPlayed:        isPostseason ? existing.gamesPlayed        : existing.gamesPlayed + 1,
            coachAWins:         isPostseason ? existing.coachAWins         : existing.coachAWins  + (aWon ? 1 : 0),
            coachBWins:         isPostseason ? existing.coachBWins         : existing.coachBWins  + (aWon ? 0 : 1),
            postseasonGames:    isPostseason ? existing.postseasonGames + 1 : existing.postseasonGames,
            coachAPostseasonWins: isPostseason && aWon  ? existing.coachAPostseasonWins + 1 : existing.coachAPostseasonWins,
            coachBPostseasonWins: isPostseason && !aWon ? existing.coachBPostseasonWins + 1 : existing.coachBPostseasonWins,
            currentStreakWinnerId: winnerId, currentStreakLength: newStreak,
            lastMeetingSeason: game.season, lastMeetingWeek: game.week,
            lastMeetingWinnerId: winnerId, updatedAt: new Date(),
          }).where(eq(coachRivalries.id, existing.id));
        }
      }
    } catch (e) {
      console.error("[finalizeGameAtomic] rivalry update error:", e);
    }
  }
}

/**
 * Exactly-once game finalisation using a single DB transaction.
 *
 * ALL mutations — sentinel claim, game score/status, standings, player stats,
 * pitcher rest, coach XP, coach rivalry, league event — execute inside one
 * `db.transaction()` and commit atomically. If any step fails the entire
 * transaction rolls back and the caller can retry.
 *
 * Cache invalidation and recap generation run OUTSIDE the transaction (they are
 * non-transactional best-effort post-commit effects). `coachXpAccum` updates
 * also run after commit so that in-memory map mutations do not survive a rollback.
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
  const {
    finalizer = "unknown",
    skipStandings = false,
    skipPlayerStats = false,
    skipPitcherRest = false,
    skipCoachXp = false,
    coachXpAccum,
    skipLeagueEvent = false,
    skipCacheInvalidation = false,
    isManualReport = false,
    reportedByUserId = null,
    eventDescriptionSuffix,
    leagueCurrentWeek,
    leagueTeams: providedTeams,
  } = opts;

  const homeWon = homeScore > awayScore;
  const isConf  = game.isConference ?? false;

  let alreadyFinalized = false;
  // Collect coach deltas for the batch-accumulator path; populated inside the
  // transaction ONLY after we know it will commit (i.e., after the sentinel check
  // succeeds). The actual map.set() runs OUTSIDE the transaction so the mutation
  // is not visible if the transaction rolls back.
  let pendingCoachDeltas: Array<{ coachId: string; won: boolean }> | null = null;

  await db.transaction(async (tx) => {
    // ── 1. Lock game row (serialises concurrent finalization calls) ───────
    await tx.execute(sql`SELECT id FROM games WHERE id = ${game.id} FOR UPDATE`);

    // ── 2. Idempotency check ───────────────────────────────────────────────
    const existingSentinel = await tx.select()
      .from(gameFinalizations)
      .where(eq(gameFinalizations.gameId, game.id))
      .limit(1);
    if (existingSentinel.length > 0) {
      alreadyFinalized = true;
      return; // no writes — transaction commits trivially
    }

    // ── 3. Claim sentinel ──────────────────────────────────────────────────
    await tx.insert(gameFinalizations).values({ gameId: game.id, finalizer });

    // ── 4. Update game (scores + isComplete + optional fields) ────────────
    const gameSet: Record<string, unknown> = { homeScore, awayScore, isComplete: true };
    if (rawBoxScore) gameSet.boxScore = JSON.stringify(rawBoxScore);
    if (isManualReport) {
      gameSet.isManuallyReported = true;
      if (reportedByUserId) gameSet.reportedByUserId = reportedByUserId;
    }
    await tx.update(gamesTable).set(gameSet).where(eq(gamesTable.id, game.id));

    // ── 5. Standings ───────────────────────────────────────────────────────
    if (!skipStandings) {
      let [homeRow] = await tx.select()
        .from(standings)
        .where(and(eq(standings.leagueId, leagueId), eq(standings.teamId, game.homeTeamId), eq(standings.season, game.season)));
      if (!homeRow) {
        [homeRow] = await tx.insert(standings).values({ leagueId, teamId: game.homeTeamId, season: game.season }).returning();
      }
      let [awayRow] = await tx.select()
        .from(standings)
        .where(and(eq(standings.leagueId, leagueId), eq(standings.teamId, game.awayTeamId), eq(standings.season, game.season)));
      if (!awayRow) {
        [awayRow] = await tx.insert(standings).values({ leagueId, teamId: game.awayTeamId, season: game.season }).returning();
      }
      await tx.update(standings).set({
        wins:             sql`${standings.wins}             + ${homeWon ? 1 : 0}`,
        losses:           sql`${standings.losses}           + ${homeWon ? 0 : 1}`,
        conferenceWins:   sql`${standings.conferenceWins}   + ${isConf && homeWon  ? 1 : 0}`,
        conferenceLosses: sql`${standings.conferenceLosses} + ${isConf && !homeWon ? 1 : 0}`,
        runsScored:       sql`${standings.runsScored}       + ${homeScore}`,
        runsAllowed:      sql`${standings.runsAllowed}      + ${awayScore}`,
      }).where(eq(standings.id, homeRow.id));
      await tx.update(standings).set({
        wins:             sql`${standings.wins}             + ${homeWon ? 0 : 1}`,
        losses:           sql`${standings.losses}           + ${homeWon ? 1 : 0}`,
        conferenceWins:   sql`${standings.conferenceWins}   + ${isConf && !homeWon ? 1 : 0}`,
        conferenceLosses: sql`${standings.conferenceLosses} + ${isConf && homeWon  ? 1 : 0}`,
        runsScored:       sql`${standings.runsScored}       + ${awayScore}`,
        runsAllowed:      sql`${standings.runsAllowed}      + ${homeScore}`,
      }).where(eq(standings.id, awayRow.id));
    }

    // ── 6. Player season stats ─────────────────────────────────────────────
    if (rawBoxScore && !skipPlayerStats) {
      await upsertBoxSideStatsInTx(tx, leagueId, game.season, game.homeTeamId, rawBoxScore.home, homeWon);
      await upsertBoxSideStatsInTx(tx, leagueId, game.season, game.awayTeamId, rawBoxScore.away, !homeWon);
    }

    // ── 7. Pitcher rest ────────────────────────────────────────────────────
    if (rawBoxScore && !skipPitcherRest) {
      await updatePitcherRestInTx(tx, rawBoxScore.home, rawBoxScore.away, game, leagueCurrentWeek);
    }

    // ── 8. Coach XP ─────────────────────────────────────────────────────────
    // Batch callers (advance-week) pass `coachXpAccum`; their XP is flushed
    // once per batch in `flushCoachXp()`. We record the pending deltas here so
    // the map mutation happens OUTSIDE the transaction.
    if (!skipCoachXp) {
      const teams = providedTeams
        ?? await tx.select().from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
      const homeTeam = teams.find((t: any) => t.id === game.homeTeamId);
      const awayTeam = teams.find((t: any) => t.id === game.awayTeamId);

      if (coachXpAccum) {
        // Record for post-tx accumulation (does not write to DB).
        pendingCoachDeltas = [];
        if (homeTeam?.coachId) pendingCoachDeltas.push({ coachId: homeTeam.coachId, won: homeWon });
        if (awayTeam?.coachId) pendingCoachDeltas.push({ coachId: awayTeam.coachId, won: !homeWon });
      } else {
        // Single-game path: write XP + rivalry directly inside the transaction.
        await writeCoachXpAndRivalryInTx(tx, homeTeam, awayTeam, homeWon, homeScore, awayScore, game, leagueId);
      }
    }

    // ── 9. League event ────────────────────────────────────────────────────
    if (!skipLeagueEvent) {
      const teams = providedTeams
        ?? await tx.select().from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
      const homeTeam = teams.find((t: any) => t.id === game.homeTeamId);
      const awayTeam = teams.find((t: any) => t.id === game.awayTeamId);
      const winner    = homeWon ? homeTeam : awayTeam;
      const loser     = homeWon ? awayTeam : homeTeam;
      const winScore  = homeWon ? homeScore : awayScore;
      const lossScore = homeWon ? awayScore : homeScore;
      const suffix    = eventDescriptionSuffix ? ` ${eventDescriptionSuffix}` : "";
      await tx.insert(leagueEvents).values({
        leagueId,
        teamId:            winner?.id              ?? null,
        teamName:          winner?.name            ?? null,
        teamAbbreviation:  winner?.abbreviation    ?? null,
        teamPrimaryColor:  winner?.primaryColor    ?? null,
        eventType:         "GAME_RESULT",
        description:       `${winner?.abbreviation ?? "?"} def. ${loser?.abbreviation ?? "?"} ${winScore}-${lossScore}${suffix}`,
        season:            game.season,
        week:              game.week,
        metadata:          { gameId: game.id },
      });
    }

    // ── Transaction commits here ───────────────────────────────────────────
  });

  if (alreadyFinalized) return { alreadyFinalized: true };

  // ── Post-commit: coachXpAccum batch accumulation ─────────────────────────
  // Running OUTSIDE the transaction ensures the map is not mutated if the
  // transaction rolls back (in-memory mutations are not rolled back by Drizzle).
  if (coachXpAccum && pendingCoachDeltas) {
    for (const { coachId, won } of pendingCoachDeltas) {
      const acc = coachXpAccum.get(coachId) ?? { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
      acc.xp     += won ? WIN_XP : LOSS_XP;
      acc.wins   += won ? 1 : 0;
      acc.losses += won ? 0 : 1;
      acc.confWins   += isConf && won  ? 1 : 0;
      acc.confLosses += isConf && !won ? 1 : 0;
      coachXpAccum.set(coachId, acc);
    }
  }

  // ── Post-commit: cache invalidation + recap (non-transactional) ───────────
  if (!skipCacheInvalidation) {
    invalidateLeague(leagueId);
  }
  generateAndStoreRecap(game, homeScore, awayScore, rawBoxScore, leagueId, opts).catch(e =>
    console.error("[finalizeGameAtomic] recap generation error:", e),
  );

  return { alreadyFinalized: false };
}
