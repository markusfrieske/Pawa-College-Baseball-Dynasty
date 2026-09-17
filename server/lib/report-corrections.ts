import type { InsertGameReportCorrection } from "../../shared/schema";

/** Bind correction provenance to server-owned identities, ignoring non-record entries. */
export function reportCorrectionRows(raw: unknown, ctx: { gameReportId: string; gameId: string; leagueId: string; userId: string }): InsertGameReportCorrection[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(c => c !== null && typeof c === "object" && typeof c.fieldKey === "string" && c.fieldKey.length > 0).map(c => ({
    gameReportId: ctx.gameReportId, gameId: ctx.gameId, leagueId: ctx.leagueId,
    fieldKey: c.fieldKey, fieldLabel: typeof c.fieldLabel === "string" ? c.fieldLabel : null,
    ocrValue: c.ocrValue == null ? null : String(c.ocrValue), correctedValue: c.correctedValue == null ? null : String(c.correctedValue),
    correctedByUserId: ctx.userId,
  }));
}
