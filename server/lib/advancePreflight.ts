/**
 * Advance preflight service.
 *
 * In reported-game mode, checks whether all current-week human-vs-human games
 * have been finalized (accepted report).  Returns a structured blocker list so
 * the advance route can return 409 with per-game detail and the commissioner UI
 * can surface direct links to blocking games.
 *
 * GameBlockerStatus classifications:
 *   "unreported"           — no game report has been submitted yet
 *   "pending_confirmation" — report submitted but not yet accepted
 *   "disputed"             — report disputed, needs commissioner resolution
 *   "invalid_or_orphaned"  — game row exists but is in an unexpected/corrupt
 *                            state (e.g. missing team references, stale partial
 *                            data, or a report attached to a game that no longer
 *                            matches the current season/week slot)
 */

import { storage } from "../storage";

export type GameBlockerStatus =
  | "unreported"
  | "pending_confirmation"
  | "disputed"
  | "invalid_or_orphaned";

export interface GameBlocker {
  gameId: string;
  week: number;
  season: number;
  phase: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  status: GameBlockerStatus;
}

export interface AdvancePreflightResult {
  canAdvance: boolean;
  blockers: GameBlocker[];
  isReportedMode: boolean;
}

/**
 * Run advance preflight for a league.
 *
 * Simulated mode always returns canAdvance=true.
 * Reported mode scans current-week regular-phase games with two human teams.
 *
 * Status determination order:
 *   1. invalid_or_orphaned — game row is missing required team references, or
 *      an attached report's season/week does not match the game's own values.
 *   2. unreported           — no report row at all.
 *   3. pending_confirmation — report exists but status = "pending".
 *   4. disputed             — report status = "disputed".
 *   (accepted → not a blocker)
 */
export async function getAdvancePreflight(leagueId: string): Promise<AdvancePreflightResult> {
  const league = await storage.getLeague(leagueId);
  if (!league) throw new Error(`League ${leagueId} not found`);

  if (league.gameMode !== "reported") {
    return { canAdvance: true, blockers: [], isReportedMode: false };
  }

  const teams = await storage.getTeamsByLeague(leagueId);
  const humanTeamIds = new Set(teams.filter(t => !t.isCpu).map(t => t.id));
  const teamNameById = new Map(teams.map(t => [t.id, t.name]));

  const seasonGames = await storage.getGamesByLeagueSeason(leagueId, league.currentSeason);

  // Only regular-phase games in the current week that involve two human teams.
  // Exhibition games are simulated even in reported mode.
  // Postseason advances have their own separate flow.
  const currentWeekHumanGames = seasonGames.filter(g =>
    g.week === league.currentWeek &&
    g.phase === "regular" &&
    g.homeTeamId != null && humanTeamIds.has(g.homeTeamId) &&
    g.awayTeamId != null && humanTeamIds.has(g.awayTeamId),
  );

  if (currentWeekHumanGames.length === 0) {
    return { canAdvance: true, blockers: [], isReportedMode: true };
  }

  const gameReports = await storage.getGameReportsByLeague(leagueId);
  const reportsByGameId = new Map(gameReports.map(r => [r.gameId, r]));

  const blockers: GameBlocker[] = [];

  for (const game of currentWeekHumanGames) {
    // Step 1: Detect invalid/orphaned game rows before checking report status.
    // A game is considered invalid_or_orphaned when:
    //   - It is missing either team reference (should never happen for regular games), or
    //   - An attached report's season/week fields don't match the game's own values
    //     (indicates the report was created for a different game slot and reused).
    if (!game.homeTeamId || !game.awayTeamId) {
      blockers.push({
        gameId: game.id,
        week: game.week,
        season: game.season ?? league.currentSeason,
        phase: game.phase ?? "regular",
        homeTeamId: game.homeTeamId ?? "",
        awayTeamId: game.awayTeamId ?? "",
        homeTeamName: game.homeTeamId ? (teamNameById.get(game.homeTeamId) ?? null) : null,
        awayTeamName: game.awayTeamId ? (teamNameById.get(game.awayTeamId) ?? null) : null,
        status: "invalid_or_orphaned",
      });
      continue;
    }

    const report = reportsByGameId.get(game.id);

    // A report whose season/week doesn't match the game is an orphaned report —
    // treat the game as if it has no report (unreported) plus flag it.
    if (report && (report.season !== game.season || report.week !== game.week)) {
      blockers.push({
        gameId: game.id,
        week: game.week,
        season: game.season ?? league.currentSeason,
        phase: game.phase ?? "regular",
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamName: teamNameById.get(game.homeTeamId) ?? null,
        awayTeamName: teamNameById.get(game.awayTeamId) ?? null,
        status: "invalid_or_orphaned",
      });
      continue;
    }

    let status: GameBlockerStatus | null = null;

    if (!report) {
      status = "unreported";
    } else if (report.status === "pending") {
      status = "pending_confirmation";
    } else if (report.status === "disputed") {
      status = "disputed";
    }
    // report.status === "accepted" → finalized, not a blocker

    if (status) {
      blockers.push({
        gameId: game.id,
        week: game.week,
        season: game.season ?? league.currentSeason,
        phase: game.phase ?? "regular",
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamName: teamNameById.get(game.homeTeamId) ?? null,
        awayTeamName: teamNameById.get(game.awayTeamId) ?? null,
        status,
      });
    }
  }

  return {
    canAdvance: blockers.length === 0,
    blockers,
    isReportedMode: true,
  };
}
