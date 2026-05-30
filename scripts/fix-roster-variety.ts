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
 *
 * Same-name collision safety: every REMOVALS and ADDITIONS entry carries a
 * `posGroup` field ("pitcher" | "hitter"). The file scanner tracks the
 * current player's position via updatePlayerContext() and only applies a
 * change when the player's position group matches the entry's posGroup.
 * This prevents the script from accidentally modifying a same-named player
 * on a different team who has a different position type.
 */

import * as fs from "fs";
import * as path from "path";
import {
  createPlayerContext,
  updatePlayerContext,
  isPitcher,
} from "./roster-scan-helper";

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

interface AbilityOp {
  ability: string;
  /**
   * Position group the target player must belong to.
   * Prevents same-named players on different teams (with different positions)
   * from being accidentally modified.
   */
  posGroup: "pitcher" | "hitter";
}

// Phase 1: Abilities to STRIP (player has a gold ability but OVR < 500)
// key = "FirstName|LastName"
const REMOVALS: Record<string, AbilityOp> = {
  // Pitcher gold violations (pitchers can't reach OVR 500 in this system)
  "Aidan|King":      { ability: "Doctor K",         posGroup: "pitcher" },
  "Liam|Peterson":   { ability: "Gas Tank",          posGroup: "pitcher" },
  "Tyler|Fay":       { ability: "Top Gear",          posGroup: "pitcher" },
  "Jake|Marciano":   { ability: "Slugger Killer",    posGroup: "pitcher" },
  "Andreas|Alvarez": { ability: "Lefty Killer",      posGroup: "pitcher" },
  "Tomas|Valincius": { ability: "Iron Arm",          posGroup: "pitcher" },
  "Wes|Mendes":      { ability: "Fighting Spirit",   posGroup: "pitcher" },
  "Jason|DeCaro":    { ability: "Painter",           posGroup: "pitcher" },
  "Jack|Radel":      { ability: "Indomitable Soul",  posGroup: "pitcher" },
  "Ethan|Lund":      { ability: "Wizard Mode",       posGroup: "pitcher" },
  // Hitter gold violations (OVR calibrated below 500)
  "Chris|Hacopian":  { ability: "Iron Man",          posGroup: "hitter" },
  "Nico|Partida":    { ability: "First Pitch King",  posGroup: "hitter" },
  "Caden|Sorrell":   { ability: "Flying Start",      posGroup: "hitter" },
  "Jorian|Wilson":   { ability: "Heavy Tank",        posGroup: "hitter" },
  "Judd|Utermark":   { ability: "Low Ball Hitter",   posGroup: "hitter" },
  "Ace|Reese":       { ability: "Unrelenting",       posGroup: "hitter" },
  "Kyle|Jones":      { ability: "Trickster",         posGroup: "hitter" },
  "Ethin|Bingaman":  { ability: "Hit Machine",       posGroup: "hitter" },
  "Caden|McDonald":  { ability: "Hit Machine",       posGroup: "hitter" },
};

// Phase 2: Abilities to ADD to verified OVR ≥ 500 fielders/catchers
// (all confirmed via validate-gold-gate using ALL_REAL_ROSTERS + calculateOVR)
const ADDITIONS: Record<string, AbilityOp> = {
  // Reassigning 7 stripped hitter-gold abilities to valid OVR ≥ 500 targets
  "Carlos|Arguelles":   { ability: "First Pitch King",    posGroup: "hitter" }, // Miami OF  OVR=547
  "Drew|Faurot":        { ability: "Iron Man",            posGroup: "hitter" }, // UCF OF    OVR=546
  "Roman|Martin":       { ability: "Flying Start",        posGroup: "hitter" }, // UCLA 3B   OVR=539
  "Gavin|Kelly":        { ability: "Heavy Tank",          posGroup: "hitter" }, // WVU 2B    OVR=538
  "Kaleb|DeLaTorre":    { ability: "Low Ball Hitter",     posGroup: "hitter" }, // SAlabama 3B OVR=532
  "Ethan|Mendoza":      { ability: "Unrelenting",         posGroup: "hitter" }, // Texas 2B  OVR=528
  "Drew|Smith":         { ability: "Trickster",           posGroup: "hitter" }, // Oregon OF OVR=527
  // Hit Machine (near-absent): bring 1→3 with 2 new OVR≥500 holders
  "Dylan|Becker":       { ability: "Hit Machine",         posGroup: "hitter" }, // MoState OF OVR=525
  "Jay|Abernathy":      { ability: "Hit Machine",         posGroup: "hitter" }, // Tennessee 3B OVR=524
  // 11 brand-new zero-count fielder gold abilities
  "Carter|McCulley":    { ability: "Outside Hitter",      posGroup: "hitter" }, // FSU 2B    OVR=522
  "Colby|Turner":       { ability: "Bases Loaded King",   posGroup: "hitter" }, // Michigan 3B OVR=521
  "Anthony|Martinez":   { ability: "Gambler",             posGroup: "hitter" }, // UCF 1B    OVR=516
  "Jake|Schaffner":     { ability: "Ace Killer",          posGroup: "hitter" }, // UNC SS    OVR=515
  "Levi|Clark":         { ability: "Emotional Pillar",    posGroup: "hitter" }, // Tennessee 1B OVR=514
  "Garrett|Frazier":    { ability: "Surprise!",           posGroup: "hitter" }, // DallasBaptist OF OVR=513
  "Steven|Milam":       { ability: "Strike Thrower",      posGroup: "hitter" }, // LSU SS    OVR=511
  "AJ|Gracia":          { ability: "Heat Up",             posGroup: "hitter" }, // Virginia OF OVR=509
  "Ethan|Surowiec":     { ability: "Shock Commander",     posGroup: "hitter" }, // Florida OF OVR=508
  "Brodie|Johnston":    { ability: "Spirit Head",         posGroup: "hitter" }, // Vanderbilt SS OVR=508
  "Will|Bryan":         { ability: "Slap Happy",          posGroup: "hitter" }, // UAB SS    OVR=508
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
  const ctx = createPlayerContext();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    updatePlayerContext(line, ctx);

    if (!ctx.firstName || !ctx.lastName) continue;
    if (!line.includes("abilities:") || !line.includes("[")) continue;

    const nameKey = `${ctx.firstName}|${ctx.lastName}`;
    const playerIsPitcher = isPitcher(ctx.position);

    // Phase 1: Remove
    const removal = REMOVALS[nameKey];
    if (
      removal &&
      !removedKeys.has(nameKey) &&
      line.includes(`"${removal.ability}"`) &&
      // Position-group guard: only touch pitchers for pitcher entries, hitters for hitter entries
      (removal.posGroup === "pitcher") === playerIsPitcher
    ) {
      lines[i] = removeAbility(lines[i], removal.ability);
      removedKeys.add(nameKey);
      modified = true;
      totalRemovals++;
      console.log(`  - ${removal.ability} ← stripped from ${ctx.firstName} ${ctx.lastName} [${ctx.team ?? "?"}] (${relPath})`);
    }

    // Phase 2: Add
    const addition = ADDITIONS[nameKey];
    if (
      addition &&
      !addedKeys.has(nameKey) &&
      !line.includes(`"${addition.ability}"`) &&
      // Position-group guard: only touch hitters for hitter entries (all additions are hitter gold)
      (addition.posGroup === "pitcher") === playerIsPitcher
    ) {
      lines[i] = addAbility(lines[i], addition.ability);
      addedKeys.add(nameKey);
      modified = true;
      totalAdditions++;
      console.log(`  + ${addition.ability} → added to ${ctx.firstName} ${ctx.lastName} [${ctx.team ?? "?"}] (${relPath})`);
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
  notRemoved.forEach((k) => console.log(`  ${k} → ${REMOVALS[k].ability}`));
}
if (notAdded.length > 0) {
  console.log("\nWARNING — ADDITIONS not found:");
  notAdded.forEach((k) => console.log(`  ${k} → ${ADDITIONS[k].ability}`));
}
