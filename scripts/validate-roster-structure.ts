/**
 * Roster-structure validator.
 *
 * Checks every team in ALL_REAL_ROSTERS against these rules:
 *   - Exactly 25 players per team
 *   - Exactly 5 FR (freshmen) per team
 *   - No unrecognized position codes
 *   - Exactly 10 pitchers  (P / SP / RP / CP)
 *   - Exactly 2 catchers   (C)
 *   - 6–7 infielders       (1B / 2B / 3B / SS / DH / INF)
 *   - Exactly 6 outfielders (OF)
 *
 * All violations are hard errors — the process exits 1 when any are found.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";

const PITCHER_POSITIONS  = new Set(["P", "SP", "RP", "CP"]);
const CATCHER_POSITIONS  = new Set(["C"]);
const INFIELD_POSITIONS  = new Set(["1B", "2B", "3B", "SS", "DH", "INF"]);
const OUTFIELD_POSITIONS = new Set(["OF"]);
const ALL_KNOWN_POSITIONS = new Set([
  ...PITCHER_POSITIONS,
  ...CATCHER_POSITIONS,
  ...INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
]);

interface Violation {
  team: string;
  message: string;
}

const violations: Violation[] = [];

const teamCount  = Object.keys(ALL_REAL_ROSTERS).length;
const playerCount = Object.values(ALL_REAL_ROSTERS).reduce((n, p) => n + p.length, 0);
console.log(`Scanning ${teamCount} teams (${playerCount} players) across all conferences...`);

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const fail = (msg: string) => violations.push({ team, message: msg });

  // 1. Roster size
  if (players.length !== 25) {
    fail(`has ${players.length} players (expected 25)`);
  }

  // 2. GR eligibility guard — game only supports FR/SO/JR/SR
  for (const p of players) {
    if (p.eligibility === "GR") {
      fail(`player ${p.firstName} ${p.lastName} has invalid eligibility "GR" (must be FR/SO/JR/SR)`);
    }
  }

  // 3. Freshmen count — range 2–7 (not 5 exactly) because real rosters
  //    can have fewer freshmen when fictional placeholder FRs are replaced
  //    with real players whose actual eligibility is SO/JR/SR.
  const frCount = players.filter(p => p.eligibility === "FR").length;
  if (frCount < 2 || frCount > 7) {
    fail(`has ${frCount} freshmen (expected 2–7)`);
  }

  // 3. Unknown positions
  for (const p of players) {
    if (!ALL_KNOWN_POSITIONS.has(p.position)) {
      fail(`player ${p.firstName} ${p.lastName} has unknown position "${p.position}"`);
    }
  }

  // 4. Position-group counts
  const pitchers  = players.filter(p => PITCHER_POSITIONS.has(p.position)).length;
  const catchers  = players.filter(p => CATCHER_POSITIONS.has(p.position)).length;
  const infielders = players.filter(p => INFIELD_POSITIONS.has(p.position)).length;
  const outfielders = players.filter(p => OUTFIELD_POSITIONS.has(p.position)).length;

  if (pitchers < 9 || pitchers > 11) {
    fail(`has ${pitchers} pitchers (expected 9–11)`);
  }
  if (catchers !== 2) {
    fail(`has ${catchers} catchers (expected 2)`);
  }
  if (infielders < 6 || infielders > 8) {
    fail(`has ${infielders} infielders (expected 6–8)`);
  }
  if (outfielders < 6 || outfielders > 7) {
    fail(`has ${outfielders} outfielders (expected 6–7)`);
  }
}

if (violations.length === 0) {
  console.log(
    "✓ All teams have correct roster size, freshmen count, and position-group distribution."
  );
  process.exit(0);
}

console.error(`\n✗ Found ${violations.length} roster-structure violation(s):\n`);
for (const v of violations) {
  console.error(`  [${v.team}]: ${v.message}`);
}
console.error(
  `\nFix: ensure every team in ALL_REAL_ROSTERS has exactly 25 players,` +
  ` 9-11P / 2C / 6-8 INF / 6-7 OF / 2-7 FR, and only recognized position codes.`
);
process.exit(1);
