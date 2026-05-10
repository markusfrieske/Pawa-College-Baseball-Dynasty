/**
 * Duplicate player name validator.
 *
 * Checks every team in ALL_REAL_ROSTERS for:
 *   1. Players with identical first+last name on the SAME team (always hard error)
 *   2. Players with identical first+last name across DIFFERENT teams (warning — real players
 *      can share names, but it's flagged so collisions can be confirmed intentional)
 *
 * Exits 1 only when same-team duplicates are found.
 * Cross-team duplicates are printed as warnings (non-fatal) so the roster author can decide.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";

const teamCount  = Object.keys(ALL_REAL_ROSTERS).length;
const playerCount = Object.values(ALL_REAL_ROSTERS).reduce((n, p) => n + p.length, 0);
console.log(`Scanning ${teamCount} teams (${playerCount} players) for duplicate names...`);

interface DuplicateEntry {
  name: string;
  team: string;
  position: string;
  eligibility: string;
}

// Build a global name → list-of-appearances map
const globalIndex = new Map<string, DuplicateEntry[]>();

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players) {
    const fullName = `${p.firstName} ${p.lastName}`.trim();
    if (!globalIndex.has(fullName)) globalIndex.set(fullName, []);
    globalIndex.get(fullName)!.push({
      name: fullName,
      team,
      position: p.position,
      eligibility: p.eligibility,
    });
  }
}

// 1. Same-team duplicates (hard errors)
const sameTeamErrors: { team: string; name: string; count: number }[] = [];

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const seen = new Map<string, number>();
  for (const p of players) {
    const fullName = `${p.firstName} ${p.lastName}`.trim();
    seen.set(fullName, (seen.get(fullName) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) sameTeamErrors.push({ team, name, count });
  }
}

// 2. Cross-team duplicates (warnings)
const crossTeamWarnings: { name: string; appearances: DuplicateEntry[] }[] = [];

for (const [name, appearances] of globalIndex) {
  if (appearances.length > 1) {
    const teams = new Set(appearances.map(a => a.team));
    if (teams.size > 1) {
      crossTeamWarnings.push({ name, appearances });
    }
  }
}

let hasHardErrors = false;

if (sameTeamErrors.length > 0) {
  hasHardErrors = true;
  console.error(`\n✗ Found ${sameTeamErrors.length} same-team duplicate(s):\n`);
  for (const e of sameTeamErrors) {
    console.error(`  [${e.team}]: "${e.name}" appears ${e.count} times on the same roster`);
  }
  console.error(`\nFix: remove or rename the duplicate player(s) in the matching roster file.`);
}

if (crossTeamWarnings.length > 0) {
  console.warn(`\n⚠ Warning: ${crossTeamWarnings.length} name(s) appear on multiple teams (non-fatal — verify these are intentional):\n`);
  for (const w of crossTeamWarnings) {
    const teams = w.appearances.map(a => `${a.team} (${a.position}, ${a.eligibility})`).join(", ");
    console.warn(`  "${w.name}" — ${teams}`);
  }
}

if (!hasHardErrors && crossTeamWarnings.length === 0) {
  console.log("✓ No duplicate player names found across all roster files.");
}

if (!hasHardErrors && crossTeamWarnings.length > 0) {
  console.log(`\n✓ No same-team duplicates. ${crossTeamWarnings.length} cross-team name collision(s) above are informational.`);
}

process.exit(hasHardErrors ? 1 : 0);
