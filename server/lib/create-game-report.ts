import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { games, gameReports, gameFinalizations, gameReportCorrections, auditLogs, type Game, type InsertGameReport } from "../../shared/schema";
import { ReportTransitionConflict } from "./report-transition";
import { reportCorrectionRows } from "./report-corrections";
import { appendReportRevision } from "./report-history";

/** Initial content and required provenance share the same game eligibility boundary as acceptance. */
export async function createGameReportAtomic(input: { game: Game; data: InsertGameReport; userId: string; corrections: unknown; auditDetail: string }) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM games WHERE id = ${input.game.id} FOR UPDATE`);
    const [game] = await tx.select().from(games).where(eq(games.id, input.game.id));
    const [receipt] = await tx.select().from(gameFinalizations).where(eq(gameFinalizations.gameId, input.game.id));
    const [existing] = await tx.select().from(gameReports).where(eq(gameReports.gameId, input.game.id));
    if (!game || game.leagueId !== input.data.leagueId || game.isComplete || receipt || existing) {
      throw new ReportTransitionConflict("This game already has a report or official result. Reload its current state.");
    }
    for (const key of ["homeTeamId", "awayTeamId", "season", "week", "phase", "gameType", "isConference"] as const) {
      if (game[key] !== input.game[key]) throw new ReportTransitionConflict("Game details changed during submission. Reload before reporting.");
    }
    const [report] = await tx.insert(gameReports).values({ ...input.data, status: "pending", editVersion: 1 }).returning();
    const corrections = reportCorrectionRows(input.corrections, { gameReportId: report.id, gameId: game.id, leagueId: game.leagueId, userId: input.userId });
    await tx.insert(auditLogs).values({ leagueId: game.leagueId, userId: input.userId, action: "Game Report Submitted", details: input.auditDetail + "; Game " + game.id + "; report " + report.id });
    if (corrections.length) await tx.insert(gameReportCorrections).values(corrections);
    await appendReportRevision(tx, report, { actorUserId: input.userId, event: "submitted", corrections });
    return report;
  });
}
