import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { games, gameReports, gameFinalizations, auditLogs, type InsertGameReport } from "../../shared/schema";

export class ReportEditConflict extends Error {}

type EditableFields = Pick<InsertGameReport, "homeScore" | "awayScore" | "homeHits" | "awayHits" | "homeErrors" | "awayErrors" | "inningScores" | "homeBoxData" | "awayBoxData">;

/** Serializes commissioner body edits with each other and completed finalizations.
 * Confirm/dispute must separately bind the snapshot they reviewed; this is not that contract.
 */
export async function editGameReport(input: {
  gameId: string; leagueId: string; reportId: string; userId: string;
  expectedEditVersion: number; changes: EditableFields;
}) {
  return db.transaction(async tx => {
    // Same lock order as finalization: game first, then report.
    await tx.execute(sql`SELECT id FROM games WHERE id = ${input.gameId} AND league_id = ${input.leagueId} FOR UPDATE`);
    const [game] = await tx.select().from(games).where(eq(games.id, input.gameId));
    if (!game || game.leagueId !== input.leagueId) throw new ReportEditConflict("Game is no longer available for editing.");
    const [receipt] = await tx.select().from(gameFinalizations).where(eq(gameFinalizations.gameId, input.gameId));
    if (game.isComplete || receipt) throw new ReportEditConflict("This game has been finalized and its report cannot be edited.");
    await tx.execute(sql`SELECT id FROM game_reports WHERE id = ${input.reportId} FOR UPDATE`);
    const [report] = await tx.select().from(gameReports).where(eq(gameReports.id, input.reportId));
    if (!report || report.gameId !== input.gameId || report.leagueId !== input.leagueId || !["pending", "disputed"].includes(report.status)) {
      throw new ReportEditConflict("This report is no longer pending or disputed and cannot be edited.");
    }
    if (report.editVersion !== input.expectedEditVersion || report.editVersion >= 2147483647) {
      throw new ReportEditConflict("This report changed since you opened it. Reload the latest report and review your changes before submitting again.");
    }
    const [updated] = await tx.update(gameReports).set({ ...input.changes, editVersion: report.editVersion + 1, updatedAt: new Date() }).where(eq(gameReports.id, report.id)).returning();
    await tx.insert(auditLogs).values({
      leagueId: input.leagueId, userId: input.userId, action: "Game Report Edited",
      details: JSON.stringify({ gameId: input.gameId, reportId: report.id, previousEditVersion: report.editVersion, editVersion: updated.editVersion, awayScore: updated.awayScore, homeScore: updated.homeScore }),
    });
    return updated;
  });
}
