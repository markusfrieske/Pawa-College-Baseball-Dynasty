/**
 * tests/unit/storylineAccess.test.ts
 *
 * Unit tests for league-member access to the storylines endpoint.
 *
 * Covers the `isLeagueMember` helper used by assertLeagueMember in
 * storyline-routes.ts to guard GET /api/leagues/:id/storylines.
 *
 * Rules:
 *   - A commissioner always gets access (checked separately via hasCommissionerAccess).
 *   - A non-commissioner coach IS a member if a coach record with their userId exists
 *     in the league — regardless of whether teamId is null or non-null.
 *   - A user with no coach record in the league is NOT a member.
 *   - An unauthenticated caller (userId === undefined) is never a member.
 */

import { test, expect } from "@playwright/test";
import { isLeagueMember } from "../../server/route-helpers";

function makeCoach(userId: string | null | undefined, teamId: string | null = "team-1") {
  return { userId, teamId };
}

test.describe("isLeagueMember", () => {
  test("returns true for a coach with a matching userId and a teamId", () => {
    const coaches = [makeCoach("user-coach-a"), makeCoach("user-coach-b")];
    expect(isLeagueMember(coaches, "user-coach-a")).toBe(true);
  });

  test("returns true for a coach whose teamId is null (joined but not yet team-assigned)", () => {
    const coaches = [makeCoach("user-coach-a", null)];
    expect(isLeagueMember(coaches, "user-coach-a")).toBe(true);
  });

  test("returns false when userId does not match any coach record", () => {
    const coaches = [makeCoach("user-coach-a"), makeCoach("user-coach-b")];
    expect(isLeagueMember(coaches, "user-outsider")).toBe(false);
  });

  test("returns false for an empty coach list", () => {
    expect(isLeagueMember([], "user-coach-a")).toBe(false);
  });

  test("returns false when userId is undefined (unauthenticated caller)", () => {
    const coaches = [makeCoach("user-coach-a")];
    expect(isLeagueMember(coaches, undefined)).toBe(false);
  });

  test("ignores CPU coaches with a null userId", () => {
    const coaches = [makeCoach(null), makeCoach(null)];
    expect(isLeagueMember(coaches, "user-outsider")).toBe(false);
  });

  test("finds the correct user among mixed human and CPU coaches", () => {
    const coaches = [makeCoach(null), makeCoach("user-human"), makeCoach(null)];
    expect(isLeagueMember(coaches, "user-human")).toBe(true);
    expect(isLeagueMember(coaches, "user-other")).toBe(false);
  });
});
