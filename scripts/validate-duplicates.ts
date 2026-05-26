/**
 * Duplicate player name validator.
 *
 * Checks every team in ALL_REAL_ROSTERS for:
 *   1. Players with identical first+last name on the SAME team (always hard error)
 *   2. Players with identical first+last name across DIFFERENT teams (warning — real players
 *      can share names, but it's flagged so collisions can be confirmed intentional)
 *
 * Exits 1 only when same-team duplicates are found.
 * Cross-team duplicates listed in KNOWN_CROSS_TEAM_DUPLICATES are silently accepted.
 * Any NEW collision not in that list is printed as a warning.
 *
 * To confirm a new collision as intentional, add the name to the set below.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";

/**
 * Confirmed-intentional cross-team name collisions.
 * These are different real players who happen to share a name across different programs.
 * Reviewed and confirmed as of the 2026 roster data set.
 */
const KNOWN_CROSS_TEAM_DUPLICATES = new Set<string>([
  "Cooper Moore",      // LSU (P, SR) — Kansas (C, FR)
  "Billy Barlow",      // Florida (P, JR) — Florida State (P, JR)
  "Karson Bowen",      // Florida (C, SR) — TCU (C, JR)
  "Patrick Reilly",    // Vanderbilt (P, JR) — San Diego (P, SO)
  "Braden Holcomb",    // Vanderbilt (OF, JR) — Belmont (P, SR)
  "Aiden Sims",        // Texas A&M (P, FR) — Ole Miss (P, FR)
  "Gavin Grahovac",    // Texas A&M (1B, JR) — Ohio State (P, SR)
  "Brady Neal",        // Tennessee (OF, FR) — Alabama (C, JR)
  "Dylan Dreiling",    // Tennessee (1B, SO) — Wichita State (C, JR)
  "Lucas Steele",      // Auburn (OF, JR) — UAB (P, SR)
  "Jake Mitchell",     // Auburn (OF, FR) — UC Davis (OF, SO)
  "Sam Whitfield",     // Georgia (P, FR) — Columbia (P, SO)
  "Bryce Calloway",    // Georgia (P, JR) — Tulane (SS, JR)
  "Kolby Branch",      // Georgia (SS, SR) — Wichita State (2B, JR)
  "Cole Johnson",      // Georgia (OF, FR) — Kansas State (P, SR)
  "Cole Jenkins",      // South Carolina (P, JR) — Georgia State (P, JR)
  "Carson Hansen",     // Kentucky (OF, SR) — Texas Tech (P, SR)
  "Ryan Kraft",        // Missouri (P, JR) — Evansville (P, SO)
  "Landon Price",      // Missouri (P, FR) — Oregon State (OF, JR)
  "Chris Patterson",   // Missouri (3B, JR) — Maryland (OF, SR)
  "Owen Burke",        // Missouri (OF, FR) — Yale (1B, FR)
  "LJ Mercurius",      // Oklahoma (P, JR) — UNLV (P, JR)
  "Marcus Pruitt",     // Oklahoma (2B, JR) — Missouri State (OF, SO)
  "Kade Bing",         // Texas (P, JR) — Baylor (SS, JR)
  "Adrian Rodriguez",  // Texas (SS, SO) — Texas Tech (2B, JR)
  "Cooper Underwood",  // Georgia Tech (P, FR) — Cincinnati (2B, SR)
  "Jake Whitfield",    // Georgia Tech (2B, SO) — Santa Clara (OF, SR)
  "Alex Hernandez",    // Georgia Tech (OF, SO) — Fresno State (1B, SR)
  "Max Galvin",        // Miami (OF, JR) — Coastal Carolina (P, FR)
  "Anthony Perez",     // Miami (P, SO) — Cal State Fullerton (3B, SR)
  "Sam Harris",        // NC State (P, FR) — Virginia (2B, JR)
  "Ryan Lynch",        // North Carolina (P, SO) — Coastal Carolina (P, SR)
  "Macon Winslow",     // North Carolina (OF, JR) — Kansas (OF, JR)
  "Ty Uber",           // Notre Dame (P, SR) — Stanford (P, SR)
  "Nick Barber",       // Pittsburgh (C, SO) — Old Dominion (P, SR)
  "Marcus Chen",       // California (P, FR) — Michigan (DH, JR)
  "Kyle Watkins",      // California (OF, JR) — Saint Mary's (OF, SR)
  "Drew Dowd",         // Stanford (P, JR) — Rice (P, JR)
  "Drew Bowser",       // Stanford (OF, SO) — Boston College (OF, SO)
  "Anthony Stephan",   // Virginia (OF, SR) — Rutgers (3B, FR)
  "Marcus Kruzan",     // Iowa (P, JR) — Minnesota (P, JR)
  "Ryan Bailey",       // Maryland (P, JR) — North Texas (P, SO)
  "Drew Mitchell",     // Ohio State (2B, FR) — Oregon State (OF, JR)
  "Cade Anderson",     // Minnesota (OF, SO) — UAB (P, JR)
  "Tyler Bennett",     // Northwestern (C, SO) — Penn State (2B, SO)
  "Matt Graveline",    // Ohio State (C, SR) — West Virginia (OF, JR)
  "Kai Nakamura",      // Oregon (P, FR) — Hawaii (P, SR)
  "Maddox Molony",     // Oregon (SS, JR) — Oregon State (C, FR)
  "Dominic Hellman",   // Oregon (1B, JR) — USC (OF, SO)
  "Drew Hartman",      // Penn State (P, JR) — James Madison (P, JR)
  "Spencer Barnett",   // Penn State (SS, JR) — West Virginia (SS, JR)
  "Chase Krewson",     // Rutgers (OF, JR) — Baylor (OF, JR)
  "Braden Davis",      // USC (OF, SO) — Troy (OF, SO)
  "Blake Turner",      // Washington State (P, SO) — UC Davis (1B, SR)
  "Brandon Kim",       // Fresno State (OF, SR) — UC Irvine (C, JR)
  "Bryce Robison",     // UNLV (SS, JR) — BYU (P, JR)
  "Dean Toigo",        // UNLV (OF, JR) — Arizona State (1B, SR)
  "Ethan Park",        // Columbia (P, FR) — Cal State Fullerton (P, SO)
  "Rob Castillo",      // Cornell (1B, SR) — Brown (SS, JR)
  "Will Stratton",     // Princeton (P, SR) — Indiana State (P, SO)
  "Cole Watts",        // Coastal Carolina (SS, JR) — App State (P, SO)
  "Chase DeLauter",    // Coastal Carolina (OF, SO) — James Madison (P, SR)
  "Brady Mills",       // Marshall (C, SO) — Indiana State (1B, SO)
  "Gavin Guidry",      // Louisiana (P, FR) — Tulane (C, JR)
  "Jake Porter",       // Cal Poly (OF, SR) — Evansville (P, JR)
  "Danny Vega",        // Cal State Northridge (P, JR) — UIC (P, JR)
  "Carlos Mendez",     // Cal State Bakersfield (P, JR) — UIC (OF, FR)
  "Marcus Odom",       // Florida A&M (P, JR) — Alabama State (P, SO)
  "Bryson Leak",       // North Carolina A&T (P, SO) — North Carolina Central (3B, SO)
  "Mason Greer",       // Missouri State (C, FR) — Baylor (1B, SO)
  "Gavin Pryor",       // Indiana State (P, FR) — Evansville (OF, FR)
  "Tyler Norris",      // Illinois State (P, SO) — Utah (P, SO)
  "Tyler McCord",      // Belmont (P, JR) — Dallas Baptist (C, SO)
  "Caedmon Parker",    // TCU (P, SO) — Dallas Baptist (P, JR)
  "Tyler Brown",       // UCF (3B, JR) — North Texas (OF, FR)
  "Dylan Campbell",    // Michigan State (C, JR) — South Florida (SS, JR)
  "Garrett Wright",    // Tennessee (UT, JR) — Cincinnati (1B, JR)
  "Gunnar Myro",       // Oregon State (OF, JR) — UNLV (OF, JR)
  "Ben Niednagel",     // San Diego State (OF, JR) — Air Force (OF, JR)
  "Khalil Walker",     // Nevada (INF, JR) — New Mexico (OF, JR)
  "Blake Morrison",    // Cal State Northridge (P, JR) — Indiana State (OF, JR)
  "Tracer Lopez",      // Texas Tech (OF, JR) — UCF (INF, SR)
]);

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

// 2. Cross-team duplicates — split into known (confirmed) vs new (unconfirmed)
const newCrossTeamWarnings: { name: string; appearances: DuplicateEntry[] }[] = [];
let confirmedCount = 0;

for (const [name, appearances] of globalIndex) {
  if (appearances.length > 1) {
    const teams = new Set(appearances.map(a => a.team));
    if (teams.size > 1) {
      if (KNOWN_CROSS_TEAM_DUPLICATES.has(name)) {
        confirmedCount++;
      } else {
        newCrossTeamWarnings.push({ name, appearances });
      }
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

if (newCrossTeamWarnings.length > 0) {
  console.warn(`\n⚠ Warning: ${newCrossTeamWarnings.length} NEW unconfirmed cross-team name collision(s) found:`);
  console.warn(`  Add each confirmed-intentional name to KNOWN_CROSS_TEAM_DUPLICATES in scripts/validate-duplicates.ts\n`);
  for (const w of newCrossTeamWarnings) {
    const teams = w.appearances.map(a => `${a.team} (${a.position}, ${a.eligibility})`).join(", ");
    console.warn(`  "${w.name}" — ${teams}`);
  }
}

if (!hasHardErrors && newCrossTeamWarnings.length === 0) {
  if (confirmedCount > 0) {
    console.log(`✓ No same-team duplicates. ${confirmedCount} confirmed cross-team name collision(s) accepted as intentional.`);
  } else {
    console.log("✓ No duplicate player names found across all roster files.");
  }
}

process.exit(hasHardErrors ? 1 : 0);
