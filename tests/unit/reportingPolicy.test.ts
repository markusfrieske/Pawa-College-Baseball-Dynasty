import { test, expect } from "@playwright/test";
import { buildScoreOnlyReport, reportOverrideReasonError, REPORT_OVERRIDE_REASON_MAX_LENGTH } from "../../shared/reporting";

test("on-behalf reasons require intentional nonblank text", () => {
  for (const reason of [undefined, null, false, 5, {}, [], "", " \n\t "]) expect(reportOverrideReasonError(reason)).not.toBeNull();
  expect(reportOverrideReasonError("  Both coaches supplied the agreed result.  ")).toBeNull();
});

test("reason length uses the normalized audit text boundary", () => {
  expect(reportOverrideReasonError("x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH))).toBeNull();
  expect(reportOverrideReasonError("  " + "x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH) + "  ")).toBeNull();
  expect(reportOverrideReasonError("x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH + 1))).not.toBeNull();
});

test("score-only payload drops retained full-report data and preserves unknown summaries", () => {
  const draft = { homeScore: 4, awayScore: 2, homeHits: 9, homeErrors: 1, homeBoxData: { batting: [{ playerId: "old", h: 9 }] }, inningScores: [[2, 4]], corrections: [{ fieldKey: "old" }], overrideReason: "  Agreed score  " };
  const before = JSON.stringify(draft);
  expect(buildScoreOnlyReport(draft)).toEqual({ homeScore: 4, awayScore: 2, homeHits: null, awayHits: null, homeErrors: null, awayErrors: null, homeBoxData: null, awayBoxData: null, inningScores: null, overrideReason: "Agreed score" });
  expect(JSON.stringify(draft)).toBe(before);
});

test("involved commissioner score-only payload does not invent a reason or corrections", () => {
  const result = buildScoreOnlyReport({ homeScore: 1, awayScore: 0 });
  expect(result).not.toHaveProperty("overrideReason");
  expect(result).not.toHaveProperty("corrections");
});
