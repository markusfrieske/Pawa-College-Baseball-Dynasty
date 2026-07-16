/**
 * Advance preflight service.
 *
 * In reported-game mode, checks whether all current-week human-vs-human games
 * have been finalized (accepted report).  Returns a structured blocker list so
 * the advance route can return 409 with per-game detail and the commissioner UI
 * can surface direct links to blocking games.
 */

import { storage } from "../storage";

export type GameBlockerStatus = "unreported" | "pending_confirmation" | "disputed";

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
 * Reported mode scans current-week regular-phase games with two human teams:
 *   - "unreported"           — no report submitted
 *   - "pending_confirmation" — report submitted but pending
 *   - "disputed"             — report disputed, needs commissioner resolution
 *
 * Games with an "accepted" report, or CPU-vs-CPU games, are never blockers.
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
    const report = reportsByGameId.get(game.id);
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
        homeTeamId: game.homeTeamId!,
        awayTeamId: game.awayTeamId!,
        homeTeamName: teamNameById.get(game.homeTeamId!) ?? null,
        awayTeamName: teamNameById.get(game.awayTeamId!) ?? null,
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
