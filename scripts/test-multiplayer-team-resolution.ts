/**
 * Unit test: multiplayer team resolution without CPU fallback.
 *
 * Verifies that resolveUserTeam always returns the correct team for each of
 * the 14 coaches in a full multiplayer league and NEVER falls back to the
 * first non-CPU team when a user is not found.
 *
 * Run with:  npx tsx scripts/test-multiplayer-team-resolution.ts
 */

import { resolveUserTeam } from "../server/route-helpers";

// ── Mock 14-team fully-human league ──────────────────────────────────────────

const LEAGUE_SIZE = 14;

const teams = Array.from({ length: LEAGUE_SIZE }, (_, i) => ({
  id: `team-${i + 1}`,
  isCpu: false,
  coachId: `coach-${i + 1}`,
  leagueId: "league-1",
  name: `Team ${i + 1}`,
}));

const coaches = Array.from({ length: LEAGUE_SIZE }, (_, i) => ({
  id: `coach-${i + 1}`,
  userId: `user-${i + 1}`,
  teamId: `team-${i + 1}`,
  leagueId: "league-1",
}));

// ── Assertion helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Test 1: each of the 14 users gets their own exact team ───────────────────

console.log("\n[1] Each user resolves to their own team");
for (let i = 0; i < LEAGUE_SIZE; i++) {
  const userId = `user-${i + 1}`;
  const expectedCoachId = `coach-${i + 1}`;
  const expectedTeamId = `team-${i + 1}`;

  const { userCoach, userTeam } = resolveUserTeam(coaches, teams, userId);

  assert(`user-${i + 1} → coach-${i + 1}`, userCoach?.id, expectedCoachId);
  assert(`user-${i + 1} → team-${i + 1}`, userTeam?.id, expectedTeamId);

  // Critical: no cross-contamination
  if (userTeam && userTeam.id !== expectedTeamId) {
    console.error(`  CRITICAL  user-${i + 1} got ${userTeam.id} — cross-team data corruption!`);
    failed++;
  }
}

// ── Test 2: unknown user gets undefined — NOT the first non-CPU team ──────────

console.log("\n[2] Unknown userId returns undefined (no CPU fallback)");
const { userCoach: noCoach, userTeam: noTeam } = resolveUserTeam(coaches, teams, "not-a-real-user");
assert("unknown user: userCoach is undefined", noCoach, undefined);
assert("unknown user: userTeam is undefined (not team-1)", noTeam, undefined);

// ── Test 3: undefined userId is handled safely ────────────────────────────────

console.log("\n[3] Undefined userId is safe");
const { userCoach: undefCoach, userTeam: undefTeam } = resolveUserTeam(coaches, teams, undefined);
assert("undefined userId: userCoach is undefined", undefCoach, undefined);
assert("undefined userId: userTeam is undefined", undefTeam, undefined);

// ── Test 4: show what the OLD buggy fallback would return ─────────────────────

console.log("\n[4] Old CPU-fallback comparison (would-have-been behaviour)");
const oldFallback = teams.find(t => !t.isCpu);
console.log(`  Old pattern 'teams.find(t => !t.isCpu)' returns: ${oldFallback?.id}`);
console.log(`  In a 14-user league this sent ALL unmatched requests to ${oldFallback?.id} — now fixed.`);

// ── Test 5: coach with no teamId returns undefined team ───────────────────────

console.log("\n[5] Coach with null teamId returns undefined team");
const noTeamCoaches = [{ id: "coach-x", userId: "user-x", teamId: null as string | null, leagueId: "league-1" }];
const { userCoach: ntCoach, userTeam: ntTeam } = resolveUserTeam(noTeamCoaches, teams, "user-x");
assert("coach found", ntCoach?.id, "coach-x");
assert("no teamId → userTeam is undefined", ntTeam, undefined);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
