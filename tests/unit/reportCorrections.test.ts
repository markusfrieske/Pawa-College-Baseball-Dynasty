import { test, expect } from "@playwright/test";
import { recordReportCorrection, reconcileReportRowCorrections, pruneReportInningCorrections, pruneReportPlayerCorrections, type ReportCorrectionState } from "../../client/src/lib/report-corrections";
import { reassignReportRosterPlayer } from "../../client/src/lib/report-roster-identity";

const row = (playerId = "two-way", h = 2) => ({ playerId, name: "Alex Smith", h, ab: 4, role: "starter", ip: "3.1", win: false });
const initial = (): ReportCorrectionState => ({
  fieldMeta: { "batting.home.two-way.h": "ocr", "batting.home.two-way.ab": "low", "pitching.home.two-way.h": "ocr", "batting.away.two-way.h": "ocr" },
  corrections: {},
});
const reconcile = (state: ReportCorrectionState, previousRows: ReturnType<typeof row>[], nextRows: ReturnType<typeof row>[]) =>
  reconcileReportRowCorrections({ state, previousRows, nextRows, side: "home", section: "batting" });

test("review correction then repeated score edits retain the original observation and latest submitted value", () => {
  const state = initial();
  const reviewed = recordReportCorrection({ state, key: "batting.home.two-way.h", oldValue: 2, newValue: 3, fieldLabel: "Home hits" });
  const scored = reconcile(reviewed, [row("two-way", 3)], [row("two-way", 1)]);
  const repeated = reconcile(scored, [row("two-way", 1)], [row("two-way", 0)]);
  expect(repeated.corrections["batting.home.two-way.h"]).toEqual({ fieldLabel: "Home hits", ocrValue: "2", correctedValue: "0" });
  expect(repeated.fieldMeta["batting.home.two-way.h"]).toBe("corrected");
  expect(state).toEqual(initial());
  const removed = reconcile(repeated, [row("two-way", 0)], []);
  expect(removed.corrections).toEqual({});
  expect(removed.fieldMeta).toEqual({ "pitching.home.two-way.h": "ocr", "batting.away.two-way.h": "ocr" });
});

test("manual fields, same-value blur and list reorders do not invent corrections", () => {
  const state = initial();
  const a = row(); const b = row("second");
  expect(reconcile(state, [a, b], [{ ...b }, { ...a }])).toBe(state);
  expect(reconcile(state, [a], [a, b])).toBe(state);
  expect(reconcile(state, [a], [{ ...a, win: true, name: "Manual name" }])).toBe(state);
  expect(recordReportCorrection({ state, key: "score.homeScore", oldValue: 0, newValue: 2 })).toBe(state);
  expect(recordReportCorrection({ state, key: "batting.home.two-way.h", oldValue: 2, newValue: "2" })).toBe(state);
});

test("low-confidence missing values remain auditable and reverting retains the original trail", () => {
  let state = recordReportCorrection({ state: initial(), key: "batting.home.two-way.ab", oldValue: 0, newValue: 4 });
  state = recordReportCorrection({ state, key: "batting.home.two-way.ab", oldValue: 4, newValue: 0 });
  expect(state.corrections["batting.home.two-way.ab"]).toEqual({ fieldLabel: undefined, ocrValue: "0", correctedValue: "0" });
  expect(state.fieldMeta["batting.home.two-way.ab"]).toBe("corrected");
});

test("pitching IP and OCR-provenance decisions preserve string and boolean values", () => {
  const state: ReportCorrectionState = { fieldMeta: { "pitching.home.two-way.ip": "ocr", "pitching.home.two-way.win": "ocr" }, corrections: {} };
  const result = reconcileReportRowCorrections({ state, previousRows: [row()], nextRows: [{ ...row(), ip: "4.2", win: true }], side: "home", section: "pitching" });
  expect(result.corrections["pitching.home.two-way.ip"]).toMatchObject({ ocrValue: "3.1", correctedValue: "4.2" });
  expect(result.corrections["pitching.home.two-way.win"]).toMatchObject({ ocrValue: "false", correctedValue: "true" });
});

test("removing one legacy duplicate retains ownership without attributing the removed row's values to its survivor", () => {
  const a = row("two-way", 2); const b = row("two-way", 4);
  expect(reconcile(initial(), [a, b], [b])).toEqual(initial());
  expect(reconcile(initial(), [a, b], [{ ...b }])).toEqual(initial());
  const edited = reconcile(initial(), [a, b], [{ ...a, h: 3 }, b]);
  expect(edited.corrections["batting.home.two-way.h"]).toMatchObject({ ocrValue: "2", correctedValue: "3" });
  const survivor = reconcile(edited, [{ ...a, h: 3 }, b], [b]);
  expect(survivor.fieldMeta["batting.home.two-way.h"]).toBeUndefined();
  expect(survivor.corrections["batting.home.two-way.h"]).toBeUndefined();
  expect(survivor.fieldMeta["batting.home.two-way.ab"]).toBe("low");
  expect(reconcile(edited, [a, b], []).fieldMeta["batting.home.two-way.h"]).toBeUndefined();
});

test("legacy duplicate reorder with ambiguous clones never invents a player observation", () => {
  const a = row("two-way", 2); const b = row("two-way", 4);
  expect(reconcile(initial(), [a, b], [{ ...b }, { ...a }])).toEqual(initial());
});

test("ambiguous cloned duplicate edits discard stale correction provenance rather than submit a false latest value", () => {
  const a = row("two-way", 2); const b = row("two-way", 4);
  const state = recordReportCorrection({ state: initial(), key: "batting.home.two-way.h", oldValue: 1, newValue: 2 });
  const result = reconcile(state, [a, b], [{ ...a, h: 3 }, { ...b }]);
  expect(result.corrections).toEqual({});
  expect(result.fieldMeta).toEqual({ "pitching.home.two-way.h": "ocr", "batting.away.two-way.h": "ocr" });
});

test("removed namespace pruning respects complete player IDs and preserves other sides and sections", () => {
  const state = initial();
  state.fieldMeta["batting.home.two-way-extra.h"] = "low";
  state.corrections["batting.home.two-way.h"] = { ocrValue: "2", correctedValue: "3" };
  state.corrections["pitching.home.two-way.h"] = { ocrValue: "1", correctedValue: "2" };
  const next = reconcile(state, [row()], []);
  expect(next.fieldMeta["batting.home.two-way-extra.h"]).toBe("low");
  expect(next.corrections).toEqual({ "pitching.home.two-way.h": { ocrValue: "1", correctedValue: "2" } });
});

test("linescore truncation prunes both sides' removed innings only and cannot resurrect discarded corrections", () => {
  const state: ReportCorrectionState = {
    fieldMeta: { "inning.8.home": "ocr", "inning.9.away": "corrected", "inning.10.home": "low", "score.homeScore": "ocr" },
    corrections: { "inning.9.away": { ocrValue: "1", correctedValue: "2" } },
  };
  const truncated = pruneReportInningCorrections(state, 9);
  expect(truncated).toEqual({ fieldMeta: { "inning.8.home": "ocr", "score.homeScore": "ocr" }, corrections: {} });
  expect(pruneReportInningCorrections(truncated, 12)).toBe(truncated);
  for (const invalid of [-1, 1.5, NaN]) expect(pruneReportInningCorrections(state, invalid)).toBe(state);
  expect(state.corrections["inning.9.away"]).toBeDefined();
});

test("repeated inning edits can preserve both inning observations and derived score observations before truncation", () => {
  let state: ReportCorrectionState = { fieldMeta: { "inning.9.home": "ocr", "score.homeScore": "ocr" }, corrections: {} };
  state = recordReportCorrection({ state, key: "inning.9.home", oldValue: 2, newValue: 1 });
  state = recordReportCorrection({ state, key: "score.homeScore", oldValue: 5, newValue: 4 });
  state = recordReportCorrection({ state, key: "inning.9.home", oldValue: 1, newValue: 0 });
  state = recordReportCorrection({ state, key: "score.homeScore", oldValue: 4, newValue: 3 });
  expect(state.corrections["inning.9.home"]).toMatchObject({ ocrValue: "2", correctedValue: "0" });
  const truncated = pruneReportInningCorrections(state, 9);
  expect(truncated.corrections).toEqual({ "score.homeScore": { fieldLabel: undefined, ocrValue: "5", correctedValue: "3" } });
});

test("duplicate edits followed by reassignment cannot copy a sibling's correction into either identity", () => {
  const a = row("two-way", 2); const b = row("two-way", 4);
  const editedRows = [{ ...a, h: 3 }, b];
  const edited = reconcile(initial(), [a, b], editedRows);
  expect(edited.corrections["batting.home.two-way.h"]).toMatchObject({ ocrValue: "2", correctedValue: "3" });
  for (const rowIndex of [0, 1]) {
    const cleared = pruneReportPlayerCorrections(edited, "home", "batting", "two-way");
    const result = reassignReportRosterPlayer({
      rows: editedRows, rowIndex, selectedPlayerId: "new-id",
      roster: [{ id: "two-way", firstName: "Alex", lastName: "Smith", position: "P" }, { id: "new-id", firstName: "Bo", lastName: "Jones", position: "SS" }],
      fieldMeta: cleared.fieldMeta, side: "home", section: "batting",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.rows.map(player => player.h)).toEqual([3, 4]);
    expect(result.fieldMeta["batting.home.two-way.h"]).toBeUndefined();
    expect(result.fieldMeta["batting.home.new-id.h"]).toBeUndefined();
    expect(cleared.corrections).toEqual({});
    expect(result.fieldMeta["pitching.home.two-way.h"]).toBe("ocr");
    expect(result.fieldMeta["batting.away.two-way.h"]).toBe("ocr");
    expect(result.corrections.every(correction => !correction.fieldPath.endsWith(".h"))).toBe(true);
  }
});
