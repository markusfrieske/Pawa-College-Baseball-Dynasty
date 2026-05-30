/**
 * fix-roster-variety.ts
 *
 * Two-phase correction:
 *
 * Phase 1 — STRIP 19 gold-gate violations left by add-roster-variety.ts
 *   (10 pitcher gold that can never reach OVR 500, 9 hitter gold below 500)
 *
 * Phase 2 — ADD correct gold abilities to verified OVR ≥ 500 fielders/catchers
 *   (23 unique previously-zero-count abilities across 20 players)
 *
 * Near-absent abilities after fix:
 *   Express Baserunning: 3  ✅  (Lebron ✅ + Curiel ✅ + Hairston ✅, already valid)
 *   Hit Machine:         3  ✅  (Rembert ✅ + Becker ✅ + Abernathy ✅)
 *   The Almanac:         3  ✅  (D.Jackson ✅ + Fralick ✅ + Carns ✅, already valid)
 *   Loser's Luck:        4  ✅  (already valid pitcher-red additions)
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

// Phase 1: Abilities to STRIP (player has a gold ability but OVR < 500)
// key = "FirstName|LastName", value = ability to remove
const REMOVALS: Record<string, string> = {
  // Pitcher gold violations (pitchers can't reach OVR 500 in this system)
  "Aidan|King":      "Doctor K",
  "Liam|Peterson":   "Gas Tank",
  "Tyler|Fay":       "Top Gear",
  "Jake|Marciano":   "Slugger Killer",
  "Andreas|Alvarez": "Lefty Killer",
  "Tomas|Valincius": "Iron Arm",
  "Wes|Mendes":      "Fighting Spirit",
  "Jason|DeCaro":    "Painter",
  "Jack|Radel":      "Indomitable Soul",
  "Ethan|Lund":      "Wizard Mode",
  // Hitter gold violations (OVR calibrated below 500)
  "Chris|Hacopian":  "Iron Man",
  "Nico|Partida":    "First Pitch King",
  "Caden|Sorrell":   "Flying Start",
  "Jorian|Wilson":   "Heavy Tank",
  "Judd|Utermark":   "Low Ball Hitter",
  "Ace|Reese":       "Unrelenting",
  "Kyle|Jones":      "Trickster",
  "Ethin|Bingaman":  "Hit Machine",
  "Caden|McDonald":  "Hit Machine",
};

// Phase 2: Abilities to ADD to verified OVR ≥ 500 fielders/catchers
// (all confirmed via validate-gold-gate using ALL_REAL_ROSTERS + calculateOVR)
const ADDITIONS: Record<string, string> = {
  // Reassigning 7 stripped hitter-gold abilities to valid OVR ≥ 500 targets
  "Carlos|Arguelles":   "First Pitch King",      // Miami OF  OVR=547
  "Drew|Faurot":        "Iron Man",              // UCF OF    OVR=546
  "Roman|Martin":       "Flying Start",          // UCLA 3B   OVR=539
  "Gavin|Kelly":        "Heavy Tank",            // WVU 2B    OVR=538
  "Kaleb|DeLaTorre":    "Low Ball Hitter",       // SAlabama 3B OVR=532
  "Ethan|Mendoza":      "Unrelenting",           // Texas 2B  OVR=528
  "Drew|Smith":         "Trickster",             // Oregon OF OVR=527
  // Hit Machine (near-absent): bring 1→3 with 2 new OVR≥500 holders
  "Dylan|Becker":       "Hit Machine",           // MoState OF OVR=525
  "Jay|Abernathy":      "Hit Machine",           // Tennessee 3B OVR=524
  // 11 brand-new zero-count fielder gold abilities
  "Carter|McCulley":    "Outside Hitter",        // FSU 2B    OVR=522
  "Colby|Turner":       "Bases Loaded King",     // Michigan 3B OVR=521
  "Anthony|Martinez":   "Gambler",               // UCF 1B    OVR=516
  "Jake|Schaffner":     "Ace Killer",            // UNC SS    OVR=515
  "Levi|Clark":         "Emotional Pillar",      // Tennessee 1B OVR=514
  "Garrett|Frazier":    "Surprise!",             // DallasBaptist OF OVR=513
  "Steven|Milam":       "Strike Thrower",        // LSU SS    OVR=511
  "AJ|Gracia":          "Heat Up",               // Virginia OF OVR=509
  "Ethan|Surowiec":     "Shock Commander",       // Florida OF OVR=508
  "Brodie|Johnston":    "Spirit Head",           // Vanderbilt SS OVR=508
  "Will|Bryan":         "Slap Happy",            // UAB SS    OVR=508
};

// ── Helpers ────────────────────────────────────────────────────────────────

function removeAbility(line: string, ability: string): string {
  // Handle "ability", at start or middle
  let result = line.replace(`"${ability}", `, "");
  // Handle , "ability" at end
  result = result.replace(`, "${ability}"`, "");
  // Handle lone ability in empty array residual
  result = result.replace(`"${ability}"`, "");
  return result;
}

function addAbility(line: string, ability: string): string {
  if (line.includes("abilities: []")) {
    return line.replace("abilities: []", `abilities: ["${ability}"]`);
  }
  return line.replace("abilities: [", `abilities: ["${ability}", `);
}

// ── Main ───────────────────────────────────────────────────────────────────

const removedKeys = new Set<string>();
const addedKeys = new Set<string>();
let totalRemovals = 0;
let totalAdditions = 0;

for (const relPath of ROSTER_FILES) {
  const fullPath = path.resolve(relPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const lines = raw.split("\n");
  let modified = false;
  let curFirst: string | null = null;
  let curLast: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fnMatch = line.match(/firstName:\s*"([^"]+)"/);
    const lnMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (fnMatch) curFirst = fnMatch[1];
    if (lnMatch) curLast = lnMatch[1];

    if (curFirst && curLast && line.includes("abilities:") && line.includes("[")) {
      const key = `${curFirst}|${curLast}`;

      // Phase 1: Remove
      const abilityToRemove = REMOVALS[key];
      if (abilityToRemove && !removedKeys.has(key) && line.includes(`"${abilityToRemove}"`)) {
        lines[i] = removeAbility(lines[i], abilityToRemove);
        removedKeys.add(key);
        modified = true;
        totalRemovals++;
        console.log(`  - ${abilityToRemove} ← stripped from ${curFirst} ${curLast} (${relPath})`);
      }

      // Phase 2: Add
      const abilityToAdd = ADDITIONS[key];
      if (abilityToAdd && !addedKeys.has(key) && !line.includes(`"${abilityToAdd}"`)) {
        lines[i] = addAbility(lines[i], abilityToAdd);
        addedKeys.add(key);
        modified = true;
        totalAdditions++;
        console.log(`  + ${abilityToAdd} → added to ${curFirst} ${curLast} (${relPath})`);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, lines.join("\n"));
  }
}

console.log(`\nPhase 1 — Strippings: ${totalRemovals}`);
console.log(`Phase 2 — Additions:  ${totalAdditions}`);

const notRemoved = Object.keys(REMOVALS).filter((k) => !removedKeys.has(k));
const notAdded = Object.keys(ADDITIONS).filter((k) => !addedKeys.has(k));
if (notRemoved.length > 0) {
  console.log("\nWARNING — REMOVALS not found:");
  notRemoved.forEach((k) => console.log(`  ${k} → ${REMOVALS[k]}`));
}
if (notAdded.length > 0) {
  console.log("\nWARNING — ADDITIONS not found:");
  notAdded.forEach((k) => console.log(`  ${k} → ${ADDITIONS[k]}`));
}
