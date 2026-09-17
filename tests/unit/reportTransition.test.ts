import { test, expect } from "@playwright/test";
import { captureReviewedReport } from "../../client/src/lib/reportTransition";

test("an open dispute remains bound to its reviewed score when the source is refreshed", () => {
  const source = { gameId: "game-a", editVersion: 3, homeScore: 4, awayScore: 2 };
  const draft = captureReviewedReport(source);
  Object.assign(source, { gameId: "game-b", editVersion: 4, homeScore: 9, awayScore: 8 });
  expect(draft).toEqual({ gameId: "game-a", expectedEditVersion: 3, homeScore: 4, awayScore: 2 });
  expect(Object.isFrozen(draft)).toBe(true);
  expect(captureReviewedReport(source)).toEqual({ gameId: "game-b", expectedEditVersion: 4, homeScore: 9, awayScore: 8 });
});

test("a missing or malformed reviewed version cannot create an action target", () => {
  for (const editVersion of [undefined, null, "1", 0, -1, 1.5, NaN, Infinity, 2147483648]) {
    expect(() => captureReviewedReport({ gameId: "game-a", homeScore: 4, awayScore: 2, editVersion })).toThrow("Reload and review");
  }
});
