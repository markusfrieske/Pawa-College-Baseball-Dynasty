import type { Player } from "../../../shared/schema";

export type ReportFieldSource = "ocr" | "low" | "corrected";
export type ReportRosterPlayer = Pick<Player, "id" | "firstName" | "lastName" | "position">;
export interface ReportIdentityRow {
  playerId: string;
  name: string;
  position?: string;
  needsName?: boolean;
}
export interface ReportIdentityIssue {
  rowIndex: number;
  playerId: string;
  code: "unresolved-player" | "duplicate-player";
  message: string;
}
export interface ReportIdentityCorrection {
  fieldPath: string;
  originalValue: string;
  correctedValue: string;
  oldPlayerId: string;
  newPlayerId: string;
}

/** Names are labels. Only an exact ID on this team's roster resolves a row. */
export function collectReportIdentityIssues(
  rows: readonly ReportIdentityRow[],
  roster: readonly ReportRosterPlayer[],
): ReportIdentityIssue[] {
  const allowed = new Set(roster.map(player => player.id));
  const seen = new Set<string>();
  const issues: ReportIdentityIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!row.playerId || !allowed.has(row.playerId) || row.needsName) {
      issues.push({ rowIndex, playerId: row.playerId, code: "unresolved-player", message: "Select a player from this team's roster for this row." });
    }
    if (seen.has(row.playerId)) {
      issues.push({ rowIndex, playerId: row.playerId, code: "duplicate-player", message: "This player already has a row in this section. Select another roster player or remove the duplicate row." });
    }
    seen.add(row.playerId);
  });
  return issues;
}

/** Atomically replace identity, keeping the entered baseball statistics intact. */
export function reassignReportRosterPlayer<T extends ReportIdentityRow>(input: {
  rows: readonly T[];
  rowIndex: number;
  selectedPlayerId: string;
  roster: readonly ReportRosterPlayer[];
  fieldMeta: Readonly<Record<string, ReportFieldSource>>;
  side: "home" | "away";
  section: "batting" | "pitching";
}): { ok: true; rows: T[]; fieldMeta: Record<string, ReportFieldSource>; corrections: ReportIdentityCorrection[] }
  | { ok: false; error: { code: "invalid-row" | "invalid-player" | "duplicate-player"; message: string } } {
  const { rows, rowIndex, selectedPlayerId, roster, fieldMeta, side, section } = input;
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
    return { ok: false, error: { code: "invalid-row", message: "This report row no longer exists. Review the current rows and try again." } };
  }
  const player = roster.find(candidate => candidate.id === selectedPlayerId);
  if (!selectedPlayerId || !player) {
    return { ok: false, error: { code: "invalid-player", message: "Select a player from this team's roster." } };
  }
  if (rows.some((row, index) => index !== rowIndex && row.playerId === selectedPlayerId)) {
    return { ok: false, error: { code: "duplicate-player", message: "This player already has a row in this section. Select another player or remove the duplicate row." } };
  }
  const oldRow = rows[rowIndex];
  const name = `${player.firstName} ${player.lastName}`;
  const updatedRow: T = { ...oldRow, playerId: player.id, name, needsName: false };
  if (section === "batting") updatedRow.position = player.position;
  const oldPrefix = `${section}.${side}.${oldRow.playerId}.`;
  const newPrefix = `${section}.${side}.${player.id}.`;
  const nextMeta: Record<string, ReportFieldSource> = { ...fieldMeta };
  // If repairing a pre-existing duplicate, the remaining row still owns its
  // original metadata. Copy its provenance rather than erasing that row's keys.
  const oldIdentityStillUsed = rows.some((row, index) => index !== rowIndex && row.playerId === oldRow.playerId);
  if (oldPrefix !== newPrefix) {
    for (const key of Object.keys(nextMeta)) {
      if (key.startsWith(newPrefix) || (!oldIdentityStillUsed && key.startsWith(oldPrefix))) delete nextMeta[key];
    }
    for (const [key, source] of Object.entries(fieldMeta)) {
      if (key.startsWith(oldPrefix)) nextMeta[newPrefix + key.slice(oldPrefix.length)] = source;
    }
  }
  nextMeta[`${newPrefix}playerId`] = "corrected";
  nextMeta[`${newPrefix}name`] = "corrected";
  if (section === "batting" && oldRow.position !== player.position) nextMeta[`${newPrefix}position`] = "corrected";
  const corrections: ReportIdentityCorrection[] = [];
  for (const field of ["playerId", "name", ...(section === "batting" ? ["position"] : [])] as Array<"playerId" | "name" | "position">) {
    const originalValue = oldRow[field] ?? "";
    const correctedValue = updatedRow[field] ?? "";
    if (originalValue !== correctedValue) corrections.push({
      fieldPath: `${newPrefix}${field}`, originalValue, correctedValue,
      oldPlayerId: oldRow.playerId, newPlayerId: player.id,
    });
  }
  return { ok: true, rows: rows.map((row, index) => index === rowIndex ? updatedRow : row), fieldMeta: nextMeta, corrections };
}
