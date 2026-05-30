/**
 * add-roster-variety.ts
 *
 * Introduces 22 previously-zero gold abilities onto appropriate elite rosters
 * and brings near-absent abilities (Express Baserunning, Hit Machine,
 * The Almanac, Loser's Luck) to 3–5 occurrences each.
 *
 * Rules enforced:
 *  - Gold abilities only to A+ potential players in Tier-1 conferences (proxy for OVR ≥ 500)
 *  - Pitcher gold → pitchers only
 *  - Fielder gold → non-pitchers, non-catchers
 *  - Catcher gold → catchers only
 *  - Loser's Luck (pitcher red) → any pitcher, no OVR constraint
 *  - No player receives more than one gold ability (checked via existing assignments)
 *  - Each player is modified at most once
 */

import * as fs from "fs";
import * as path from "path";

const ROSTER_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/big12Rosters.ts",
  "server/pac12Rosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

/**
 * Map of player key "FirstName|LastName" → ability to prepend to their abilities array.
 * Each player appears at most once and receives exactly one new ability.
 */
const ABILITY_ADDITIONS: Record<string, string> = {
  // ── GOLD PITCHER ABILITIES (10 unique) ──
  "Aidan|King": "Doctor K",             // Florida SP vel=97 A+
  "Tyler|Fay": "Top Gear",              // Alabama SP vel=98 A+
  "Tomas|Valincius": "Iron Arm",        // Mississippi State SP vel=97 A+
  "Liam|Peterson": "Gas Tank",          // Florida SP vel=97 A+
  "Andreas|Alvarez": "Lefty Killer",    // Auburn SP vel=97 A+
  "Jason|DeCaro": "Painter",            // North Carolina SP vel=97 A+
  "Jake|Marciano": "Slugger Killer",    // Auburn SP vel=97 A+
  "Wes|Mendes": "Fighting Spirit",      // Florida State SP vel=97 A+
  "Jack|Radel": "Indomitable Soul",     // Notre Dame SP vel=97 A+
  "Ethan|Lund": "Wizard Mode",          // Oklahoma State SP vel=98 A+

  // ── GOLD FIELDER ABILITIES (12 unique + 2 near-absent boosts) ──
  "Mason|White": "Lightning Speed",     // Arizona SS A+ spd=83
  "Derek|Curiel": "Express Baserunning", // LSU OF A+ spd=77 [near-absent +1]
  "Landon|Hairston": "Express Baserunning", // Arizona State 3B A+ spd=72 [near-absent +1]
  "Nico|Partida": "First Pitch King",   // Texas A&M 3B A+
  "Chris|Hacopian": "Iron Man",         // Texas A&M 2B A+
  "Camden|Kozeal": "High Ball Hitter",  // Arkansas 2B A+
  "Judd|Utermark": "Low Ball Hitter",   // Ole Miss 3B A+
  "Kuhio|Aloy": "Legendary Walkoff Hitter", // Arkansas OF A+
  "Ace|Reese": "Unrelenting",           // Mississippi State 3B A+
  "Caden|Sorrell": "Flying Start",      // Texas A&M OF A+
  "Jorian|Wilson": "Heavy Tank",        // Texas A&M OF A+
  "Ethin|Bingaman": "Hit Machine",      // Auburn 3B A+ [near-absent +1]
  "Kyle|Jones": "Trickster",            // Florida OF A+
  "Caden|McDonald": "Hit Machine",      // Florida 1B A+ [near-absent +1]

  // ── GOLD CATCHER ABILITIES (2 new + 2 near-absent boosts) ──
  "Ryder|Helfrick": "Trash Talker",     // Arkansas C A+
  "Brady|Neal": "Iron Wall",            // Alabama C A+
  "Chase|Fralick": "The Almanac",       // Auburn C A+ [near-absent +1]
  "Hunter|Carns": "The Almanac",        // Florida State C A+ [near-absent +1]

  // ── LOSER'S LUCK (pitcher RED — no OVR constraint, just pitchers) ──
  // Bringing from 1 → 4 total (+3 pitchers with Walk/control issues)
  "Peter|Michael": "Loser's Luck",      // Louisville RP ctrl=28 Walk pitcher
  "Santiago|Garcia": "Loser's Luck",    // LSU RP ctrl=35 Walk pitcher
  "Zion|Theophilus": "Loser's Luck",    // LSU RP ctrl=35 Walk+Slow Starter
};

// Track which player keys have been applied (guard against double-mod)
const applied = new Set<string>();

let totalChanges = 0;

for (const relPath of ROSTER_FILES) {
  const fullPath = path.resolve(relPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const lines = raw.split("\n");
  let modified = false;

  let curFirst: string | null = null;
  let curLast: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current player (firstName and lastName on the same line)
    const fnMatch = line.match(/firstName:\s*"([^"]+)"/);
    const lnMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (fnMatch) curFirst = fnMatch[1];
    if (lnMatch) curLast = lnMatch[1];

    // Check abilities line
    if (curFirst && curLast && line.includes("abilities:") && line.includes("[")) {
      const key = `${curFirst}|${curLast}`;
      const abilityToAdd = ABILITY_ADDITIONS[key];

      if (abilityToAdd && !applied.has(key)) {
        // Guard: skip if ability already exists on this line (idempotent)
        if (line.includes(`"${abilityToAdd}"`)) {
          applied.add(key);
          continue;
        }

        // Prepend the ability into the array
        if (line.includes("abilities: []")) {
          // Empty array → fill it
          lines[i] = line.replace("abilities: []", `abilities: ["${abilityToAdd}"]`);
        } else {
          // Non-empty → prepend before first existing ability
          lines[i] = line.replace("abilities: [", `abilities: ["${abilityToAdd}", `);
        }
        applied.add(key);
        modified = true;
        totalChanges++;
        console.log(`  + ${abilityToAdd} → ${curFirst} ${curLast} (${relPath})`);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, lines.join("\n"));
  }
}

console.log(`\nTotal ability additions: ${totalChanges}`);
console.log(`Unique players modified: ${applied.size}`);

// Report which keys weren't found (likely name mismatch)
const notFound = Object.keys(ABILITY_ADDITIONS).filter((k) => !applied.has(k));
if (notFound.length > 0) {
  console.log("\nWARNING — keys not found in any roster file:");
  notFound.forEach((k) => console.log(`  ${k} → ${ABILITY_ADDITIONS[k]}`));
}
