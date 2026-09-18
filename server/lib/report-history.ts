import { eq } from "drizzle-orm";
import { db } from "../db";
import { gameFinalizations, gameReportRevisions, type GameReport } from "../../shared/schema";
import { ReportTransitionConflict, type ReportTransaction } from "./report-transition";

/** Freeze the full server-owned snapshot; dates use the same ISO shape as HTTP JSON. */
export async function appendReportRevision(tx: ReportTransaction, report: GameReport, metadata: {
  actorUserId: string | null; event: string; corrections?: unknown[];
}) {
  const [revision] = await tx.insert(gameReportRevisions).values({
    reportId: report.id, gameId: report.gameId, leagueId: report.leagueId, editVersion: report.editVersion,
    actorUserId: metadata.actorUserId, event: metadata.event,
    snapshot: JSON.parse(JSON.stringify(report)),
    corrections: JSON.parse(JSON.stringify(metadata.corrections ?? [])),
  }).returning();
  return revision;
}

export interface AcceptanceIdentity {
  gameId: string; reportId: string; expectedEditVersion: number; userId: string;
  action: string; resolution: "reported" | "corrected";
}

/** Caller must recheck current authority before using this response-loss recovery. */
export async function findAcceptanceReceipt(database: typeof db | ReportTransaction, identity: AcceptanceIdentity) {
  const [receipt] = await database.select().from(gameFinalizations).where(eq(gameFinalizations.gameId, identity.gameId));
  if (!receipt) return null;
  if (!receipt.reportRevisionId || receipt.reportId !== identity.reportId
    || receipt.requestedEditVersion !== identity.expectedEditVersion
    || receipt.acceptedByUserId !== identity.userId || receipt.reportAction !== identity.action
    || receipt.reportResolution !== identity.resolution) {
    throw new ReportTransitionConflict("This game was accepted by a different decision. Reload its accepted result.");
  }
  return receipt;
}
