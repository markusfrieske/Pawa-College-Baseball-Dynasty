import { test, expect } from "@playwright/test";
import { validateBoxScore } from "../../server/lib/validateBoxScore";

function batter(playerId: string, overrides: Record<string, unknown> = {}) {
  return { playerId, name: "Display name", ab: 4, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0, ...overrides };
}
function pitcher(playerId: string, overrides: Record<string, unknown> = {}) {
  return { playerId, ip: "7.2", h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, ...overrides };
}
function report() {
  return {
    homeScore: 1, awayScore: 0, homeHits: 1, awayHits: 0,
    homeBoxData: { batting: Array.from({ length: 9 }, (_, i) => batter(`home-${i}`, i === 0 ? { r: 1, h: 1, rbi: 1 } : {})), pitching: [pitcher("home-0")] },
    awayBoxData: { batting: Array.from({ length: 9 }, (_, i) => batter(`away-${i}`)), pitching: [pitcher("away-p", { h: 1, r: 1, er: 1 })] },
  };
}
const errors = (data: unknown) => validateBoxScore(data).filter(issue => issue.severity === "error");

test("accepts current form payload, two-way player, substitutes and uncollected optional stats", () => {
  const data = report();
  data.homeBoxData.batting.push(batter("home-sub", { ab: 0 }));
  data.homeBoxData.pitching.push(pitcher("home-relief", { ip: "0.1" }));
  expect(errors(data)).toEqual([]);
  expect(errors({ ...data, homeBoxData: { ...data.homeBoxData, batting: data.homeBoxData.batting.map(row => ({ ...row, exitVelo: 88.5, hbp: 0, cs: 0 })), pitching: [pitcher("home-0", { spinRate: 2100.25 })] } })).toEqual([]);
});

test("retains explicit score-only reports and optional empty arrays", () => {
  for (const extra of [{}, { homeBoxData: null, awayBoxData: null, inningScores: null }, { homeBoxData: { batting: [], pitching: [] }, awayBoxData: {} }]) {
    expect(errors({ homeScore: 1, awayScore: 0, ...extra })).toEqual([]);
  }
});

test("original negative AB and impossible HR exploit is blocked", () => {
  const data = report();
  data.homeBoxData.batting[0] = batter("home-0", { r: 1, h: 1, ab: -7, hr: 999 });
  const found = errors(data);
  expect(found.some(issue => issue.field === "homeBoxData.batting.0.ab")).toBe(true);
  expect(found.some(issue => issue.id.startsWith("extra-hits-exceed-h"))).toBe(true);
});

test("all persisted counters reject negative, fractional, nonfinite, unsafe and nonnumeric values", () => {
  const battingFields = ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb", "hbp", "cs", "barrels", "ballsInPlay", "hardHits", "putouts", "assists", "fieldingErrors", "totalChances"];
  const pitchingFields = ["h", "r", "er", "bb", "so", "hr", "totalPitches", "whiffs"];
  for (const [kind, fields] of [["batting", battingFields], ["pitching", pitchingFields]] as const) {
    for (const field of fields) {
      for (const value of [-1, 0.25, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, "1", null, {}, true]) {
        const data = report();
        Object.assign(data.homeBoxData[kind][0], { [field]: value });
        expect(errors(data).some(issue => issue.field === `homeBoxData.${kind}.0.${field}`), `${kind}.${field} = ${String(value)}`).toBe(true);
      }
    }
  }
});

test("missing collected runs cannot masquerade as recorded zero", () => {
  const data = report();
  const { r, ...missingRun } = data.awayBoxData.batting[0];
  data.awayBoxData.batting[0] = missingRun as ReturnType<typeof batter>;
  expect(errors(data).some(issue => issue.field === "awayBoxData.batting.0.r")).toBe(true);
  expect(errors(data).some(issue => issue.id === "away-batting-runs")).toBe(false);
});

test("every form counter and pitching IP is required when rows are supplied", () => {
  for (const [kind, fields] of [["batting", ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"]], ["pitching", ["ip", "h", "r", "er", "bb", "so", "hr"]]] as const) {
    for (const field of fields) {
      const data = report();
      delete (data.homeBoxData[kind][0] as Record<string, unknown>)[field];
      expect(errors(data).some(issue => issue.field === `homeBoxData.${kind}.0.${field}`)).toBe(true);
    }
  }
});

test("malformed JSON-compatible structures return issues without throwing", () => {
  for (const value of [null, undefined, [], 0, "report", false]) expect(errors(value).length).toBeGreaterThan(0);
  for (const box of [[], "box", 1, true]) expect(errors({ homeScore: 1, awayScore: 0, homeBoxData: box }).length).toBeGreaterThan(0);
  for (const kind of ["batting", "pitching"]) {
    for (const rows of [null, {}, "rows", 1, [null], ["row"], [[]], [false]]) {
      expect(errors({ homeScore: 1, awayScore: 0, homeBoxData: { [kind]: rows } }).length).toBeGreaterThan(0);
    }
  }
});

test("missing, wrong-type, blank and duplicate IDs are rejected per section", () => {
  for (const kind of ["batting", "pitching"] as const) {
    for (const playerId of [undefined, null, "", " ", " home-0", 7, {}]) {
      const data = report();
      Object.assign(data.homeBoxData[kind][0], { playerId });
      expect(errors(data).some(issue => issue.field === `homeBoxData.${kind}.0.playerId`)).toBe(true);
    }
    const data = report();
    if (kind === "batting") data.homeBoxData.batting[1].playerId = "home-0";
    else data.homeBoxData.pitching.push(pitcher("home-0"));
    expect(errors(data).some(issue => issue.id.startsWith("duplicate-player"))).toBe(true);
  }
});

test("IP accepts baseball outs notation and rejects decimal innings and coercions", () => {
  for (const ip of ["0", "0.0", "0.1", "2.2", "10.0"]) {
    const data = report(); data.homeBoxData.pitching[0].ip = ip;
    expect(errors(data)).toEqual([]);
  }
  for (const ip of ["", "7.3", "7.5", "-1.0", "1.00", "1.2x", " 1.2", "1e2", "715827882.2", "9007199254740991.0", 1.2, null]) {
    const data = report(); Object.assign(data.homeBoxData.pitching[0], { ip });
    expect(errors(data).some(issue => issue.field === "homeBoxData.pitching.0.ip")).toBe(true);
  }
});

test("innings require numeric pairs and reconcile both teams without imposing game length", () => {
  expect(errors({ homeScore: 1, awayScore: 0, inningScores: [[0, 1]] })).toEqual([]);
  for (const inningScores of ["innings", {}, [null], [[0]], [[0, 1, 2]], [["0", 1]], [[0, -1]], [[0, 0.5]], [[0, NaN]], [[0, Number.MAX_SAFE_INTEGER + 1]], [[1, 0]]]) {
    expect(errors({ homeScore: 1, awayScore: 0, inningScores }).length).toBeGreaterThan(0);
  }
});

test("supplied hits/errors and row totals are strict; hit mismatches block", () => {
  for (const field of ["homeHits", "awayHits", "homeErrors", "awayErrors"]) {
    for (const value of [-1, 1.2, "1", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(errors({ ...report(), [field]: value }).some(issue => issue.field === field)).toBe(true);
    }
  }
  expect(errors({ ...report(), homeHits: 5 }).some(issue => issue.id === "home-hits-mismatch")).toBe(true);
  const data = report(); data.homeBoxData.batting[0].r = 2;
  expect(errors(data).some(issue => issue.id === "home-batting-runs")).toBe(true);
});

test("supplied totals reconcile known fields while omitted optional readings stay unknown", () => {
  const data = report();
  expect(errors({ ...data, homeBoxData: { ...data.homeBoxData, totals: { ab: 36, r: 1, h: 1 } } })).toEqual([]);
  expect(errors({ ...data, homeBoxData: { ...data.homeBoxData, totals: { ab: 999 } } }).some(issue => issue.id === "home-totals-ab")).toBe(true);
  expect(errors({ ...data, homeBoxData: { ...data.homeBoxData, totals: { hbp: 2 } } })).toEqual([]);
});

test("baseball counting relations block impossible hits, extra-base hits and earned runs", () => {
  for (const overrides of [{ ab: 0 }, { ab: 1, so: 1 }, { doubles: 1, triples: 1 }, { hr: 1, rbi: 0 }]) {
    const data = report(); Object.assign(data.homeBoxData.batting[0], overrides);
    expect(errors(data).length).toBeGreaterThan(0);
  }
  for (const overrides of [{ er: 1, r: 0 }, { hr: 1, h: 0 }, { hr: 1, h: 1, r: 0 }]) {
    const data = report(); Object.assign(data.homeBoxData.pitching[0], overrides);
    expect(errors(data).length).toBeGreaterThan(0);
  }
});

test("telemetry is optional but supplied values must be finite nonnegative numbers", () => {
  for (const [kind, field] of [["batting", "exitVelo"], ["pitching", "spinRate"]] as const) {
    for (const value of ["10", -1, NaN, Infinity, null, {}]) {
      const data = report(); Object.assign(data.homeBoxData[kind][0], { [field]: value });
      expect(errors(data).some(issue => issue.field === `homeBoxData.${kind}.0.${field}`)).toBe(true);
    }
  }
});

test("existing score bounds and no-ties policy are explicit", () => {
  for (const value of ["1", null, -1, 0.5, 31, Infinity, NaN]) expect(errors({ homeScore: value, awayScore: 0 }).length).toBeGreaterThan(0);
  expect(errors({ homeScore: 2, awayScore: 2 })[0].message).toContain("current reporting policy");
  expect(errors({ homeScore: 30, awayScore: 0 })).toEqual([]);
});
