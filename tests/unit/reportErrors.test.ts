import { test, expect } from "@playwright/test";
import { describeReportField, parseReportError } from "../../client/src/lib/report-errors";
import { validateBoxScore } from "../../server/lib/validateBoxScore";

test("retains every issue from the actual report validator and apiRequest encoding", () => {
  const validationErrors = validateBoxScore({ homeScore: 3, awayScore: 1, inningScores: [[1, 2]], homeBoxData: { pitching: [{ playerId: "pitcher", ip: "6.3", h: 1, r: 0, er: 1, bb: 0, so: 2, hr: 0 }] } });
  const result = parseReportError(new Error(`422: ${JSON.stringify({ message: validationErrors[0].message, validationErrors })}`));
  expect(result?.issues).toHaveLength(validationErrors.length);
  expect(result?.issues.map(issue => issue.message)).toEqual(validationErrors.map(issue => issue.message));
  expect(result?.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: "inningScores", label: "Inning scores", target: { section: "innings" } }),
    expect.objectContaining({ field: "homeBoxData.pitching.0.ip", label: "Home pitching, row 1 — Innings pitched", target: { section: "pitching", side: "home", rowIndex: 0 } }),
    expect.objectContaining({ field: "homeBoxData.pitching.0.er", label: "Home pitching, row 1 — Earned runs" }),
  ]));
});

test("roster and totals labels show team, one-based row, and readable statistic", () => {
  expect(describeReportField("awayBoxData.batting.8.playerId")).toEqual({ label: "Away batting, row 9 — Roster player", target: { section: "batting", side: "away", rowIndex: 8 } });
  expect(describeReportField("homeBoxData.totals.rbi")).toEqual({ label: "Home batting totals — Runs batted in" });
  expect(describeReportField("inningScores.10")).toEqual({ label: "Inning 11", target: { section: "innings", rowIndex: 10 } });
  expect(describeReportField("awayHits")).toEqual({ label: "Away hits", target: { section: "batting", side: "away" } });
  expect(describeReportField("homeErrors")).toEqual({ label: "Home errors", target: { section: "errors", side: "home" } });
  expect(describeReportField("homeScore")).toEqual({ label: "Home score", target: { section: "score", side: "home" } });
});

test("handles authorization, conflict, and local errors without JSON or status prefixes", () => {
  expect(parseReportError(new Error('403: {"message":"Only the involved coach can report this game"}'))).toEqual({ summary: "Only the involved coach can report this game", issues: [] });
  expect(parseReportError('409: {"message":"A concurrent report for this game was already submitted"}')?.summary).toBe("A concurrent report for this game was already submitted");
  expect(parseReportError("Select a roster player")?.summary).toBe("Select a roster player");
  expect(parseReportError(null)).toBeNull();
});

test("malformed response bodies produce a readable fallback and malformed issues are skipped", () => {
  for (const body of ['500: <html>proxy failure</html>', '422: {"message":', '500: null', '500: []', '500: {"stack":"secret"}', '']) {
    expect(parseReportError(body)).toEqual({ summary: "The report could not be saved. Please try again.", issues: [] });
  }
  const parsed = parseReportError(JSON.stringify({ message: 15, validationErrors: [null, [], "bad", { message: {} }, { id: "roster", field: "awayBoxData.batting.1.playerId", message: "Select a roster player" }] }));
  expect(parsed?.summary).toBe("Select a roster player");
  expect(parsed?.issues).toHaveLength(1);
});

test("preserves warnings distinctly and does not invent a navigable field for unknown paths", () => {
  const parsed = parseReportError(JSON.stringify({ message: "Review these items", validationErrors: [
    { id: "same", field: "some.private.path", severity: "warning", message: "Check the optional detail" },
    { id: "same", field: "score", severity: "error", message: "Scores must differ" },
  ] }));
  expect(parsed?.issues).toHaveLength(2);
  expect(parsed?.issues[0]).toEqual({ id: "same", field: "some.private.path", label: "Report", message: "Check the optional detail", severity: "warning" });
  expect(parsed?.issues[1].target).toEqual({ section: "score" });
  expect(describeReportField("homeBoxData.batting.999999999999999999999.playerId").target).toBeUndefined();
});
