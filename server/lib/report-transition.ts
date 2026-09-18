import { appendReportRevision } from "./report-history";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { games, gameReports, gameFinalizations, auditLogs, type GameReport } from "../../shared/schema";

export class ReportTransitionConflict extends Error {}
export type ReportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface ReviewedReport {
  gameId: string; leagueId: string; reportId: string; expectedEditVersion: number;
  snapshot: Pick<GameReport, "editVersion" | "status">;
  allowedStatuses: string[];
}

/** Every decision checks the reviewed draft AND the prepared snapshot under the same locks as edits. */
export async function lockReviewedReport(tx: ReportTransaction, input: ReviewedReport) {
  await tx.execute(sql`SELECT id FROM games WHERE id = ${input.gameId} AND league_id = ${input.leagueId} FOR UPDATE`);
  const [game] = await tx.select().from(games).where(eq(games.id, input.gameId));
  const [receipt] = await tx.select().from(gameFinalizations).where(eq(gameFinalizations.gameId, input.gameId));
  if (!game || game.leagueId !== input.leagueId || game.isComplete || receipt) {
    throw new ReportTransitionConflict("This game is no longer available for a report decision. Reload its current result.");
  }
  await tx.execute(sql`SELECT id FROM game_reports WHERE id = ${input.reportId} FOR UPDATE`);
  const [report] = await tx.select().from(gameReports).where(eq(gameReports.id, input.reportId));
  if (!report || report.gameId !== game.id || report.leagueId !== input.leagueId
    || !input.allowedStatuses.includes(report.status) || report.status !== input.snapshot.status
    || report.editVersion !== input.expectedEditVersion || report.editVersion !== input.snapshot.editVersion
    || report.editVersion >= 2147483647) {
    throw new ReportTransitionConflict("This report changed since you reviewed it. Reload the latest report before making a decision.");
  }
  return { game, report };
}

export async function disputeGameReport(input: ReviewedReport & {
  userId: string; reason: string; correctedHomeScore: number | null; correctedAwayScore: number | null;
}) {
  return db.transaction(async tx => {
    const { report } = await lockReviewedReport(tx, input);
    const [updated] = await tx.update(gameReports).set({
      status: "disputed", disputedByUserId: input.userId, disputeReason: input.reason,
      disputeCorrectedHomeScore: input.correctedHomeScore, disputeCorrectedAwayScore: input.correctedAwayScore,
      editVersion: report.editVersion + 1, updatedAt: new Date(),
    }).where(eq(gameReports.id, report.id)).returning();
    await tx.insert(auditLogs).values({ leagueId: input.leagueId, userId: input.userId, action: "Game Report Disputed",
      details: JSON.stringify({ gameId: input.gameId, reportId: report.id, previousEditVersion: report.editVersion, editVersion: updated.editVersion,
        homeScore: report.homeScore, awayScore: report.awayScore, reason: input.reason, correctedHomeScore: input.correctedHomeScore, correctedAwayScore: input.correctedAwayScore }),
    });
    await appendReportRevision(tx, updated, { actorUserId: input.userId, event: "disputed" });
    return updated;
  });
}
