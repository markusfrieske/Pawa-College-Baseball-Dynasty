import { test, expect } from "@playwright/test";
import {
  ovrToStar,
  getTopAttrDeltas,
  groupPlayersByCategory,
  sortByDepth,
  availOutsToIpStr,
  availRestNeeded,
  DAY_LABEL,
} from "../../client/src/pages/roster/lib/helpers";
import type { Player } from "../../shared/schema";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    teamId: "t1",
    firstName: "John",
    lastName: "Doe",
    position: "SS",
    eligibility: "FR",
    overall: 300,
    starRating: 3,
    ...overrides,
  } as unknown as Player;
}

test.describe("roster helpers", () => {
  test("ovrToStar maps overall to correct star band", () => {
    expect(ovrToStar(650)).toBe(5);
    expect(ovrToStar(500)).toBe(5);
    expect(ovrToStar(499)).toBe(4);
    expect(ovrToStar(400)).toBe(4);
    expect(ovrToStar(399)).toBe(3);
    expect(ovrToStar(300)).toBe(3);
    expect(ovrToStar(299)).toBe(2);
    expect(ovrToStar(200)).toBe(2);
    expect(ovrToStar(199)).toBe(1);
    expect(ovrToStar(0)).toBe(1);
  });

  test("getTopAttrDeltas returns top N non-zero, non-overall deltas sorted by magnitude", () => {
    const result = getTopAttrDeltas({
      overall: 10,
      power: 2,
      speed: -8,
      fielding: 0,
      hitForAvg: 5,
    });
    expect(result).toEqual([
      { label: "Speed", delta: -8 },
      { label: "Contact", delta: 5 },
      { label: "Power", delta: 2 },
    ]);
  });

  test("getTopAttrDeltas respects limit and handles null/undefined", () => {
    expect(getTopAttrDeltas(null)).toEqual([]);
    expect(getTopAttrDeltas(undefined)).toEqual([]);
    const result = getTopAttrDeltas({ power: 1, speed: 2, arm: 3 }, 2);
    expect(result.length).toBe(2);
  });

  test("getTopAttrDeltas falls back to humanized key when no label exists", () => {
    const result = getTopAttrDeltas({ someUnknownAttr: 4 });
    expect(result[0].label).toBe("some Unknown Attr");
  });

  test("groupPlayersByCategory buckets players by position group", () => {
    const players = [
      makePlayer({ id: "1", position: "P", stamina: 80, starRating: 4, overall: 400 }),
      makePlayer({ id: "2", position: "C", starRating: 3, overall: 300 }),
      makePlayer({ id: "3", position: "1B", starRating: 2, overall: 250 }),
      makePlayer({ id: "4", position: "2B", starRating: 3, overall: 310 }),
      makePlayer({ id: "5", position: "3B", starRating: 3, overall: 320 }),
      makePlayer({ id: "6", position: "SS", starRating: 4, overall: 410 }),
      makePlayer({ id: "7", position: "OF", starRating: 5, overall: 510 }),
      makePlayer({ id: "8", position: "UT", starRating: 2, overall: 220 }),
    ];
    const grouped = groupPlayersByCategory(players);
    expect(grouped.pitchers.map(p => p.id)).toEqual(["1"]);
    expect(grouped.catchers.map(p => p.id)).toEqual(["2"]);
    expect(grouped.firstBase.map(p => p.id)).toEqual(["3"]);
    expect(grouped.secondBase.map(p => p.id)).toEqual(["4"]);
    expect(grouped.thirdBase.map(p => p.id)).toEqual(["5"]);
    expect(grouped.shortstops.map(p => p.id)).toEqual(["6"]);
    expect(grouped.outfielders.map(p => p.id)).toEqual(["7"]);
    expect(grouped.otherInfielders.map(p => p.id)).toEqual(["8"]);
  });

  test("groupPlayersByCategory treats DH as an outfielder-group position", () => {
    const players = [makePlayer({ id: "dh1", position: "DH" })];
    const grouped = groupPlayersByCategory(players);
    expect(grouped.outfielders.map(p => p.id)).toEqual(["dh1"]);
  });

  test("groupPlayersByCategory sorts pitchers by stamina then star/overall", () => {
    const players = [
      makePlayer({ id: "a", position: "P", stamina: 40, starRating: 3, overall: 300 }),
      makePlayer({ id: "b", position: "P", stamina: 80, starRating: 2, overall: 250 }),
      makePlayer({ id: "c", position: "P", stamina: 80, starRating: 5, overall: 550 }),
    ];
    const grouped = groupPlayersByCategory(players);
    expect(grouped.pitchers.map(p => p.id)).toEqual(["c", "b", "a"]);
  });

  test("sortByDepth orders by depthOrder ascending then overall descending", () => {
    const players = [
      makePlayer({ id: "1", depthOrder: 2, overall: 300 }),
      makePlayer({ id: "2", depthOrder: 1, overall: 250 }),
      makePlayer({ id: "3", depthOrder: 0, overall: 400 }),
      makePlayer({ id: "4", depthOrder: 0, overall: 500 }),
    ];
    const sorted = sortByDepth(players);
    expect(sorted.map(p => p.id)).toEqual(["4", "3", "2", "1"]);
  });

  test("sortByDepth does not mutate original array", () => {
    const players = [
      makePlayer({ id: "1", depthOrder: 2 }),
      makePlayer({ id: "2", depthOrder: 1 }),
    ];
    const original = [...players];
    sortByDepth(players);
    expect(players).toEqual(original);
  });

  test("availOutsToIpStr converts outs to innings-pitched string", () => {
    expect(availOutsToIpStr(0)).toBe("0.0");
    expect(availOutsToIpStr(1)).toBe("0.1");
    expect(availOutsToIpStr(2)).toBe("0.2");
    expect(availOutsToIpStr(3)).toBe("1.0");
    expect(availOutsToIpStr(10)).toBe("3.1");
  });

  test("availRestNeeded returns correct rest days by outs thrown", () => {
    expect(availRestNeeded(0)).toBe(0);
    expect(availRestNeeded(3)).toBe(1);
    expect(availRestNeeded(9)).toBe(2);
    expect(availRestNeeded(15)).toBe(3);
    expect(availRestNeeded(21)).toBe(4);
    expect(availRestNeeded(27)).toBe(5);
    expect(availRestNeeded(28)).toBe(6);
    expect(availRestNeeded(100)).toBe(6);
  });

  test("DAY_LABEL maps abbreviations to full day names", () => {
    expect(DAY_LABEL.WED).toBe("Wednesday");
    expect(DAY_LABEL.FRI).toBe("Friday");
    expect(DAY_LABEL.SAT).toBe("Saturday");
    expect(DAY_LABEL.SUN).toBe("Sunday");
  });
});
