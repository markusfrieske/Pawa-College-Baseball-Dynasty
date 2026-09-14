import type { ReportFieldSource } from "./report-roster-identity";

export interface ReportCorrection {
  fieldLabel?: string;
  ocrValue: string;
  correctedValue: string;
}

export interface ReportCorrectionState {
  fieldMeta: Record<string, ReportFieldSource>;
  corrections: Record<string, ReportCorrection>;
}

/** Keep the first observation and the latest submitted value across form phases. */
export function recordReportCorrection({ state, key, oldValue, newValue, fieldLabel }: {
  state: ReportCorrectionState;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  fieldLabel?: string;
}): ReportCorrectionState {
  if (!state.fieldMeta[key] || String(oldValue ?? "") === String(newValue ?? "")) return state;
  return {
    fieldMeta: { ...state.fieldMeta, [key]: "corrected" },
    corrections: {
      ...state.corrections,
      [key]: {
        fieldLabel: fieldLabel ?? state.corrections[key]?.fieldLabel,
        ocrValue: state.corrections[key]?.ocrValue ?? String(oldValue ?? ""),
        correctedValue: String(newValue ?? ""),
      },
    },
  };
}

function pruneKeys(state: ReportCorrectionState, remove: (key: string) => boolean): ReportCorrectionState {
  if (![...Object.keys(state.fieldMeta), ...Object.keys(state.corrections)].some(remove)) return state;
  return {
    fieldMeta: Object.fromEntries(Object.entries(state.fieldMeta).filter(([key]) => !remove(key))),
    corrections: Object.fromEntries(Object.entries(state.corrections).filter(([key]) => !remove(key))),
  };
}

/** Clear a shared/ambiguous source before an identity migration can copy it. */
export function pruneReportPlayerCorrections(
  state: ReportCorrectionState,
  side: "home" | "away",
  section: "batting" | "pitching",
  playerId: string,
): ReportCorrectionState {
  const prefix = `${section}.${side}.${playerId}.`;
  return pruneKeys(state, key => key.startsWith(prefix));
}

/**
 * Reconcile ordinary row edits/removals, not identity reassignment (which has its
 * own roster-aware migration). Namespace ownership is side + section + player ID.
 * Unchanged references disambiguate legacy duplicates; if identity remains
 * ambiguous, do not invent an observation from another row's statistics.
 */
export function reconcileReportRowCorrections<T extends { playerId: string }>({
  state, previousRows, nextRows, side, section,
}: {
  state: ReportCorrectionState;
  previousRows: readonly T[];
  nextRows: readonly T[];
  side: "home" | "away";
  section: "batting" | "pitching";
}): ReportCorrectionState {
  let result = state;
  const base = `${section}.${side}.`;
  const nextIds = new Set(nextRows.map(row => row.playerId));
  const removedPrefixes = [...new Set(previousRows.map(row => row.playerId))]
    .filter(id => !nextIds.has(id)).map(id => `${base}${id}.`);
  result = pruneKeys(result, key => removedPrefixes.some(prefix => key.startsWith(prefix)));

  for (const id of nextIds) {
    let before = previousRows.filter(row => row.playerId === id);
    let after = nextRows.filter(row => row.playerId === id);
    const prefix = `${base}${id}.`;
    const wasDuplicate = before.length > 1 || after.length > 1;
    const previousValues = before.map(row => JSON.stringify(row)).sort();
    const nextValues = after.map(row => JSON.stringify(row)).sort();
    const unchangedValues = before.length === after.length &&
      previousValues.every((value, index) => value === nextValues[index]);
    const introducedValue = nextValues.some(value => !previousValues.includes(value));
    // Consume only one occurrence per reference: even repeated identical object
    // references must not erase the ownership of another legacy duplicate.
    for (const row of [...before]) {
      const index = after.indexOf(row);
      if (index < 0) continue;
      before = before.filter((_, i) => i !== before.indexOf(row));
      after = after.filter((_, i) => i !== index);
    }
    if (wasDuplicate && !unchangedValues) {
      // A player-keyed correction cannot establish which duplicate owns its
      // original observation. Clear that audit entry before any subsequent edit;
      // untouched OCR/low metadata still belongs to the surviving namespace.
      const ambiguousCorrectionKeys = new Set([
        ...Object.keys(result.corrections).filter(key => key.startsWith(prefix)),
        ...Object.keys(result.fieldMeta).filter(key => key.startsWith(prefix) && result.fieldMeta[key] === "corrected"),
      ]);
      result = pruneKeys(result, key => ambiguousCorrectionKeys.has(key));
    }
    if (before.length !== 1 || after.length !== 1) {
      if (wasDuplicate && introducedValue && before.length && after.length) {
        // Cloned, edited duplicates provide no trustworthy row pairing. Do not
        // let a later edit treat their new values as original OCR observations.
        result = pruneKeys(result, key => key.startsWith(prefix));
      }
      continue;
    }
    const oldRow = before[0];
    const newRow = after[0];
    for (const key of Object.keys(result.fieldMeta)) {
      if (!key.startsWith(prefix)) continue;
      const field = key.slice(prefix.length);
      if (field === "playerId" || field === "needsName" ||
          !Object.prototype.hasOwnProperty.call(oldRow, field) ||
          !Object.prototype.hasOwnProperty.call(newRow, field)) continue;
      result = recordReportCorrection({
        state: result, key,
        oldValue: oldRow[field as keyof T], newValue: newRow[field as keyof T],
      });
    }
  }
  return result;
}

/** Truncating the linescore must also truncate its submitted correction trail. */
export function pruneReportInningCorrections(state: ReportCorrectionState, inningCount: number): ReportCorrectionState {
  if (!Number.isSafeInteger(inningCount) || inningCount < 0) return state;
  return pruneKeys(state, key => {
    const match = /^inning\.(\d+)\.(home|away)$/.exec(key);
    return !!match && Number(match[1]) >= inningCount;
  });
}
