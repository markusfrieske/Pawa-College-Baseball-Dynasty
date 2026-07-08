/**
 * Unit tests for game-report access control rules.
 *
 * Covers:
 *   - hasCommissionerAccess: commissioner can view/act, non-commissioner cannot
 *   - isInvolved logic: home/away coach can access; uninvolved coach is denied
 *   - gameScoreSchema: rejects negatives, NaN, non-numbers; accepts valid integers
 *
 * These are pure-logic tests — no database or HTTP server required.
 */
import { test, expect } from "@playwright/test";
import { hasCommissionerAccess, gameScoreSchema } from "../../server/route-helpers";

// ── hasCommissionerAccess ─────────────────────────────────────────────────────

test.describe("hasCommissionerAccess", () => {
  const league = { commissionerId: "user-comm" };

  test("returns true when userId matches commissionerId", () => {
    expect(hasCommissionerAccess(league, "user-comm")).toBe(true);
  });

  test("returns false when userId does not match commissionerId", () => {
    expect(hasCommissionerAccess(league, "user-other")).toBe(false);
  });

  test("returns false when userId is undefined", () => {
    expect(hasCommissionerAccess(league, undefined)).toBe(false);
  });

  test("returns false when commissionerId is null", () => {
    expect(hasCommissionerAccess({ commissionerId: null }, "user-comm")).toBe(false);
  });
});

// ── isInvolved (game-report access logic) ────────────────────────────────────

/**
 * Mirrors the guard from GET /api/leagues/:id/games/:gameId/report:
 *
 *   const isInvolved =
 *     fetchCoach?.teamId &&
 *     (fetchCoach.teamId === fetchGame.homeTeamId ||
 *      fetchCoach.teamId === fetchGame.awayTeamId);
 */
function isInvolved(
  coachTeamId: string | null | undefined,
  homeTeamId: string,
  awayTeamId: string,
): boolean {
  return !!(
    coachTeamId &&
    (coachTeamId === homeTeamId || coachTeamId === awayTeamId)
  );
}

test.describe("game-report isInvolved guard", () => {
  const homeTeamId = "team-home";
  const awayTeamId = "team-away";

  test("home coach is involved", () => {
    expect(isInvolved(homeTeamId, homeTeamId, awayTeamId)).toBe(true);
  });

  test("away coach is involved", () => {
    expect(isInvolved(awayTeamId, homeTeamId, awayTeamId)).toBe(true);
  });

  test("uninvolved coach is NOT involved", () => {
    expect(isInvolved("team-other", homeTeamId, awayTeamId)).toBe(false);
  });

  test("null coachTeamId is NOT involved", () => {
    expect(isInvolved(null, homeTeamId, awayTeamId)).toBe(false);
  });

  test("undefined coachTeamId is NOT involved", () => {
    expect(isInvolved(undefined, homeTeamId, awayTeamId)).toBe(false);
  });
});

// ── gameScoreSchema ───────────────────────────────────────────────────────────

test.describe("gameScoreSchema validation", () => {
  test("accepts valid non-negative integer scores", () => {
    const result = gameScoreSchema.safeParse({ homeScore: 5, awayScore: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homeScore).toBe(5);
      expect(result.data.awayScore).toBe(3);
    }
  });

  test("accepts zero scores (ties/no-hitters are valid)", () => {
    expect(gameScoreSchema.safeParse({ homeScore: 0, awayScore: 0 }).success).toBe(true);
  });

  test("rejects negative homeScore", () => {
    expect(gameScoreSchema.safeParse({ homeScore: -1, awayScore: 3 }).success).toBe(false);
  });

  test("rejects negative awayScore", () => {
    expect(gameScoreSchema.safeParse({ homeScore: 4, awayScore: -2 }).success).toBe(false);
  });

  test("rejects non-number homeScore", () => {
    expect(gameScoreSchema.safeParse({ homeScore: "five", awayScore: 3 }).success).toBe(false);
  });

  test("rejects missing scores", () => {
    expect(gameScoreSchema.safeParse({}).success).toBe(false);
  });

  test("rejects NaN-like string that coerces to NaN", () => {
    expect(gameScoreSchema.safeParse({ homeScore: NaN, awayScore: 0 }).success).toBe(false);
  });
});
