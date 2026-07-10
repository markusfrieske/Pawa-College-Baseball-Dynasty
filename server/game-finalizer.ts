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
import type { Game, GameReport, Team } from "@shared/schema";
import {
  updateStandingsForGame,
  accumulatePlayerStats,
  updatePitcherRestFromBox,
  computeLegacyScore,
  enrichBoxData,
} from "./game-engine";
import { invalidateLeague } from "./cache";
import { hasPerk, XP_AWARDS } from "@shared/coachPerks";

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
  const {
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
  } = opts;

  const homeWon = homeScore > awayScore;

  // ── 1. Persist score + box score (isComplete deferred to step 7) ───────────
  const gameUpdate: Record<string, unknown> = { homeScore, awayScore };
  if (rawBoxScore) gameUpdate.boxScore = JSON.stringify(rawBoxScore);
  if (isManualReport) {
    gameUpdate.isManuallyReported = true;
    if (reportedByUserId) gameUpdate.reportedByUserId = reportedByUserId;
  }
  await storage.updateGame(game.id, gameUpdate);

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
      });
    } catch (e) {
      console.error("[finalizeGame] league event error:", e);
    }
  }

  // ── 7. Mark complete (after stats + standings confirmed) ───────────────────
  await storage.updateGame(game.id, { isComplete: true });

  // ── 8. Cache ───────────────────────────────────────────────────────────────
  if (!skipCacheInvalidation) {
    invalidateLeague(leagueId);
  }
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

  await finalizeGame(game, homeScore, awayScore, boxScore, leagueId, {
    isManualReport: true,
    reportedByUserId: report.reporterUserId,
    eventDescriptionSuffix: "(Reported)",
    skipCacheInvalidation: true,  // caller (games.ts) calls invalidateLeague after
  });
}
