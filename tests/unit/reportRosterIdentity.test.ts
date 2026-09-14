import { test, expect } from "@playwright/test";
import { collectReportIdentityIssues, reassignReportRosterPlayer, type ReportFieldSource } from "../../client/src/lib/report-roster-identity";
import { validateBoxScore } from "../../server/lib/validateBoxScore";

const roster = [
  { id: "home-0", firstName: "Alex", lastName: "Smith", position: "SS" },
  { id: "home-1", firstName: "Bo", lastName: "Jones", position: "P" },
];
const batter = (playerId = "screenshot-unknown") => ({ playerId, name: "Unreadable", position: "?", needsName: true, ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 0, so: 1, sb: 0, substitute: true });
const input = (rows = [batter()]) => ({ rows, rowIndex: 0, selectedPlayerId: "home-0", roster, fieldMeta: {} as Record<string, ReportFieldSource>, side: "home" as const, section: "batting" as const });

test("roster reassignment replaces canonical identity and preserves every statistic and role immutably", () => {
  const rows = Object.freeze([Object.freeze(batter()), Object.freeze(batter("other-row"))]);
  const result = reassignReportRosterPlayer({ ...input(), rows });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows[0]).toEqual({ ...rows[0], playerId: "home-0", name: "Alex Smith", position: "SS", needsName: false });
  expect(result.rows).not.toBe(rows);
  expect(result.rows[1]).toBe(rows[1]);
  expect(rows[0].playerId).toBe("screenshot-unknown");
  expect(result.corrections).toContainEqual({ fieldPath: "batting.home.home-0.playerId", originalValue: "screenshot-unknown", correctedValue: "home-0", oldPlayerId: "screenshot-unknown", newPlayerId: "home-0" });
});

test("moves field provenance by complete prefix and marks only identity changes corrected", () => {
  const fieldMeta = Object.freeze({
    "batting.home.screenshot-unknown.ab": "ocr", "batting.home.screenshot-unknown.hr": "low",
    "batting.home.screenshot-unknown.r": "corrected", "batting.home.screenshot-unknown.name": "low",
    "batting.home.screenshot-unknown-extra.h": "low", "pitching.home.screenshot-unknown.h": "ocr",
    "batting.away.screenshot-unknown.ab": "low", "score.homeScore": "ocr",
    "batting.home.home-0.h": "corrected",
  } satisfies Record<string, ReportFieldSource>);
  const result = reassignReportRosterPlayer({ ...input(), fieldMeta });
  if (!result.ok) throw new Error(result.error.message);
  expect(result.fieldMeta).toEqual({
    "batting.home.home-0.ab": "ocr", "batting.home.home-0.hr": "low", "batting.home.home-0.r": "corrected",
    "batting.home.home-0.name": "corrected", "batting.home.home-0.playerId": "corrected", "batting.home.home-0.position": "corrected",
    "batting.home.screenshot-unknown-extra.h": "low", "pitching.home.screenshot-unknown.h": "ocr",
    "batting.away.screenshot-unknown.ab": "low", "score.homeScore": "ocr",
  });
  expect(fieldMeta["batting.home.screenshot-unknown.ab"]).toBe("ocr");
});

test("pitcher reassignment retains game role, IP and decisions and permits a two-way player's separate batting row", () => {
  const row = { playerId: "ocr-pitcher", name: "B. J", position: "RP", ip: "2.1", h: 2, r: 0, er: 0, bb: 1, so: 4, hr: 0, win: true, loss: false, save: false, isStarter: false };
  const result = reassignReportRosterPlayer({ ...input(), rows: [row], selectedPlayerId: "home-1", section: "pitching" });
  if (!result.ok) throw new Error(result.error.message);
  expect(result.rows[0]).toEqual({ ...row, playerId: "home-1", name: "Bo Jones", needsName: false });
  expect(result.corrections.some(correction => correction.fieldPath.endsWith("position"))).toBe(false);
  expect(collectReportIdentityIssues([{ ...batter("home-1"), needsName: false }], roster)).toEqual([]);
  expect(collectReportIdentityIssues(result.rows, roster)).toEqual([]);
});

test("rejects foreign IDs, free-text names, duplicates and stale indices without changing inputs", () => {
  const original = input([batter(), batter("home-1")]);
  const snapshot = JSON.stringify(original);
  for (const selectedPlayerId of ["", "away-player", "Alex Smith", " home-0", "home-1"]) {
    const result = reassignReportRosterPlayer({ ...original, selectedPlayerId });
    expect(result.ok).toBe(false);
  }
  for (const rowIndex of [-1, 2, 0.5, NaN, Infinity]) expect(reassignReportRosterPlayer({ ...original, rowIndex }).ok).toBe(false);
  expect(JSON.stringify(original)).toBe(snapshot);
});

test("existing duplicate can be repaired without erasing the remaining row's metadata", () => {
  const result = reassignReportRosterPlayer({ ...input([batter("home-1"), batter("home-1")]), fieldMeta: { "batting.home.home-1.ab": "low" } });
  if (!result.ok) throw new Error(result.error.message);
  expect(result.rows.map(row => row.playerId)).toEqual(["home-0", "home-1"]);
  expect(result.fieldMeta["batting.home.home-1.ab"]).toBe("low");
  expect(result.fieldMeta["batting.home.home-0.ab"]).toBe("low");
});

test("repeat reassignment preserves each identity transition and current provenance", () => {
  const first = reassignReportRosterPlayer({ ...input(), fieldMeta: { "batting.home.screenshot-unknown.hr": "low" } });
  if (!first.ok) throw new Error(first.error.message);
  const second = reassignReportRosterPlayer({ ...input(), rows: first.rows, fieldMeta: first.fieldMeta, selectedPlayerId: "home-1" });
  if (!second.ok) throw new Error(second.error.message);
  expect(second.corrections.find(correction => correction.fieldPath.endsWith("playerId"))).toMatchObject({ originalValue: "home-0", correctedValue: "home-1", oldPlayerId: "home-0", newPlayerId: "home-1" });
  expect(second.fieldMeta["batting.home.home-1.hr"]).toBe("low");
  expect(Object.keys(second.fieldMeta).some(key => key.startsWith("batting.home.home-0."))).toBe(false);
});

test("identity issues block named synthetic rows, foreign players, flagged unresolved rows and same-section duplicates", () => {
  const rows = [{ ...batter(), name: "Alex Smith", needsName: false }, { ...batter("away-0"), needsName: false }, batter("home-0"), { ...batter("home-0"), needsName: false }];
  expect(collectReportIdentityIssues(rows, roster).map(issue => [issue.rowIndex, issue.code])).toEqual([[0, "unresolved-player"], [1, "unresolved-player"], [2, "unresolved-player"], [3, "duplicate-player"]]);
  expect(collectReportIdentityIssues([], roster)).toEqual([]);
  expect(collectReportIdentityIssues([{ ...batter("home-0"), needsName: false }], [])).toHaveLength(1);
});

test("reselecting current roster ID resolves the flag without inventing an identity transition", () => {
  const row = { ...batter("home-0"), name: "Alex Smith", position: "SS" };
  const result = reassignReportRosterPlayer(input([row]));
  if (!result.ok) throw new Error(result.error.message);
  expect(result.corrections).toEqual([]);
  expect(collectReportIdentityIssues(result.rows, roster)).toEqual([]);
});

test("mapped complete batting fixture passes server stat validation while missing ID is rejected", () => {
  const fullRoster = Array.from({ length: 9 }, (_, i) => ({ ...roster[0], id: `home-${i}` }));
  const rows = fullRoster.map((player, i) => ({ ...batter(player.id), needsName: false, r: i === 0 ? 1 : 0, h: i === 0 ? 2 : 0, doubles: i === 0 ? 1 : 0, rbi: i === 0 ? 1 : 0 }));
  rows[0] = { ...rows[0], playerId: "", needsName: true };
  const report = { homeScore: 1, awayScore: 0, homeBoxData: { batting: rows } };
  expect(validateBoxScore(report).some(issue => issue.field === "homeBoxData.batting.0.playerId")).toBe(true);
  const result = reassignReportRosterPlayer({ ...input(rows), roster: fullRoster });
  if (!result.ok) throw new Error(result.error.message);
  expect(validateBoxScore({ ...report, homeBoxData: { batting: result.rows } }).filter(issue => issue.severity === "error")).toEqual([]);
  expect(collectReportIdentityIssues(result.rows, fullRoster)).toEqual([]);
  // The server's pure validator checks shape/statistics; database-backed roster
  // membership remains separate and is not claimed by this unit fixture.
  expect(collectReportIdentityIssues([{ ...result.rows[0], playerId: "away-foreign" }], fullRoster)).toHaveLength(1);
});
