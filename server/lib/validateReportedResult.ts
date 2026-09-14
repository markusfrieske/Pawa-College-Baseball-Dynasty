import type { Game } from "@shared/schema";
import { storage } from "../storage";
import { validateBoxScore, type BoxScoreIssue } from "./validateBoxScore";

export class ReportValidationError extends Error {
  constructor(public readonly issues: BoxScoreIssue[]) {
    super(issues.find(issue => issue.severity === "error")?.message ?? "Invalid game report");
    this.name = "ReportValidationError";
  }
}

/** Validate before any report/result writes. Roster membership is current team
 * membership; immutable season/roster revisions remain a separate contract. */
export async function validateReportedResult(data: unknown, game: Game, leagueId: string): Promise<BoxScoreIssue[]> {
  const issues = validateBoxScore(data);
  if (issues.some(issue => issue.severity === "error")) return issues;
  const report = data as Record<string, any>;
  if (game.leagueId !== leagueId || (report.leagueId != null && report.leagueId !== leagueId) ||
      (report.gameId != null && report.gameId !== game.id)) {
    return [...issues, { id: "report-game-binding", field: "gameId", severity: "error", message: "Report must belong to this game and league" }];
  }
  for (const [side, teamId] of [["home", game.homeTeamId], ["away", game.awayTeamId]] as const) {
    const box = report[`${side}BoxData`];
    if (!box || ![box.batting, box.pitching].some(rows => Array.isArray(rows) && rows.length)) continue;
    const team = teamId ? await storage.getTeam(teamId) : undefined;
    if (!team || team.leagueId !== leagueId) {
      issues.push({ id: `${side}-team`, field: `${side}BoxData`, severity: "error", message: "Reported team must belong to this league" });
      continue;
    }
    const validIds = new Set((await storage.getPlayersByTeam(team.id)).map(player => player.id));
    for (const section of ["batting", "pitching"] as const) {
      for (const [index, row] of (box[section] ?? []).entries()) {
        if (!validIds.has(row.playerId)) issues.push({
          id: `${side}-${section}-roster-${index}`, field: `${side}BoxData.${section}.${index}.playerId`, severity: "error",
          message: `Select a player from the ${side} team's roster for this ${section} row`,
        });
      }
    }
  }
  return issues;
}

export async function assertReportedResult(data: unknown, game: Game, leagueId: string): Promise<void> {
  const issues = await validateReportedResult(data, game, leagueId);
  if (issues.some(issue => issue.severity === "error")) throw new ReportValidationError(issues);
}
