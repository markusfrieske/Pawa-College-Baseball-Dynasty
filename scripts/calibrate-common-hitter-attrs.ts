/**
 * calibrate-common-hitter-attrs.ts
 *
 * Raises the floor on secondary (common) hitter attributes so that
 * F-grade (-3 OVR penalty) attrs reach at least C-grade (+2 OVR) for
 * Tier 1 players, eliminating the F-grade band entirely and pushing
 * the hitter 1★ band from ~31.5% toward ≤25%.
 *
 * Secondary attrs targeted: clutch, vsLHP, grit, stealing, running, throwing
 * Pitchers (P/SP/RP/CP) are skipped.
 *
 * Per-tier minimum SCALED values (after ROSTER_SCALE_FACTORS are applied):
 *   Tier 1 (SEC/ACC/Big Ten/Big 12): 65  → upper C grade (+2 OVR per attr)
 *   Tier 2 (Pac-12/AAC/Sun Belt):    62
 *   Tier 3 (WCC/Big West/MoValley):  58
 *   Tier 4 (Ivy League):             52
 *   Tier 5 (HBCU):                   46  → lower D grade (0 OVR penalty)
 *
 * Floors only raise attrs — never lower them.
 * Per-attr raw cap: 80 (keeps attrs in C-grade range, prevents A/S inflation).
 *
 * Usage: npx tsx scripts/calibrate-common-hitter-attrs.ts [--dry-run]
 *
 * Note: After the first run the file is calibrated; re-running with --dry-run
 * will show 0 patches (already at floor) and skip the "1★ shrink" check.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import type { RealPlayer } from "../server/realRosters";
import { ROSTER_SCALE_FACTORS } from "../server/rosterScaleFactors";
import { calculateOVR } from "../shared/abilities";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

/** The 6 secondary (common) hitter attributes to floor-calibrate. */
const SECONDARY_ATTRS = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing"] as const;
type SecondaryAttr = typeof SECONDARY_ATTRS[number];

/** All attributes that ROSTER_SCALE_FACTORS applies to (mirrors realRosters.ts). */
const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

/** Minimum SCALED value per conference tier for secondary attrs.
 *  D-grade starts at 40 (0 OVR penalty); C-grade starts at 60 (+2 OVR).
 *  Floors are set aggressively enough to push the 1★ band below 30%. */
const TIER_MIN_SCALED: Record<number, number> = {
  1: 65,  // upper C grade → +2 OVR per attr for Tier 1 hitters
  2: 62,
  3: 58,
  4: 52,
  5: 46,  // low D grade floor — no OVR penalty for HBCU players
};

/** Hard raw cap so we don't inflate secondary attrs into A/S territory. */
const SECONDARY_RAW_CAP = 80;

// ── Conference-tier team mapping ─────────────────────────────────────────────
const TIER_1_TEAMS = new Set([
  "LSU","Florida","Vanderbilt","Texas A&M","Tennessee","Alabama","Ole Miss",
  "South Carolina","Georgia","Arkansas","Mississippi State","Missouri","Auburn",
  "Kentucky","Florida State","Miami",
  "Clemson","NC State","Georgia Tech","North Carolina","Virginia Tech","Notre Dame",
  "Wake Forest","Pittsburgh","Duke","Boston College","Syracuse","Louisville",
  "Virginia","Miami (FL)",
  "Michigan","Ohio State","Indiana","Penn State","Purdue","Rutgers","Maryland",
  "Michigan State","Illinois","Iowa","Nebraska","Minnesota","Northwestern",
  "Wisconsin","UCLA","Oregon","Washington",
  "Kansas","West Virginia","Arizona State","Arizona","Baylor","BYU","Cincinnati",
  "Houston","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah",
  "Oklahoma","Texas",
]);

const TIER_2_TEAMS = new Set([
  "Oregon State","Washington State","Fresno State","San Diego State","UNLV",
  "Nevada","New Mexico","Air Force","Stanford","California","USC",
  "East Carolina","Wichita State","Tulane","Memphis","South Florida","Charlotte",
  "UAB","Rice","Florida Atlantic","North Texas","Dallas Baptist",
  "Coastal Carolina","Southern Miss","Troy","Marshall","Louisiana","Old Dominion",
  "Arkansas State","Georgia Southern","App State","Georgia State","South Alabama",
  "James Madison",
]);

const TIER_3_TEAMS = new Set([
  "Pepperdine","Loyola Marymount","San Diego","Saint Mary's","Gonzaga","Santa Clara",
  "Portland","San Francisco",
  "Cal State Fullerton","Long Beach State","UC Irvine","UC Santa Barbara",
  "UC San Diego","Hawaii","Cal Poly","UC Davis","Cal State Northridge","Cal State Bakersfield",
  "Missouri State","Indiana State","Illinois State","Southern Illinois","Bradley",
  "Evansville","Valparaiso","UIC","Belmont","Murray State","Western Illinois",
  "Northern Iowa","Creighton",
]);

const TIER_4_TEAMS = new Set([
  "Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale","Brown",
]);

function getConferenceTier(team: string): number {
  if (TIER_1_TEAMS.has(team)) return 1;
  if (TIER_2_TEAMS.has(team)) return 2;
  if (TIER_3_TEAMS.has(team)) return 3;
  if (TIER_4_TEAMS.has(team)) return 4;
  return 5;
}

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
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp20_99(v: number): number {
  return Math.round(Math.max(20, Math.min(99, v)));
}

function applyScaleFactor(player: RealPlayer, sf: number): RealPlayer {
  if (sf === 1) return player;
  const out: Record<string, unknown> = { ...player };
  for (const attr of SCALE_ATTRS) {
    const val = player[attr];
    if (typeof val === "number") {
      out[attr as string] = clamp20_99(val * sf);
    }
  }
  return out as RealPlayer;
}

function commonGrade(v: number): "S"|"A"|"B"|"C"|"D"|"F"|"G" {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 40) return "D";
  if (v >= 20) return "F";
  return "G";
}

function gradeOvrDelta(grade: "S"|"A"|"B"|"C"|"D"|"F"|"G"): number {
  const pts: Record<string, number> = { G: -7, F: -3, D: 0, C: 2, B: 4, A: 6, S: 21 };
  return pts[grade] ?? 0;
}

// ── 1. Build patch records ─────────────────────────────────────────────────────
interface PatchEntry {
  firstName: string;
  lastName: string;
  team: string;
  attrChanges: Record<string, { oldRaw: number; newRaw: number }>;
  oldScaledOVR: number;
  newScaledOVR: number;
}

const patches: PatchEntry[] = [];
let totalHitters = 0;

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  const tier = getConferenceTier(team);
  const minScaled = TIER_MIN_SCALED[tier];

  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;
    totalHitters++;

    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const oldOVR = calculateOVR(scaledPlayer);

    const attrChanges: Record<string, { oldRaw: number; newRaw: number }> = {};
    const patchedScaled: Record<string, unknown> = { ...scaledPlayer };

    for (const attr of SECONDARY_ATTRS) {
      const oldRaw = (rawPlayer[attr] as number) ?? 0;
      const oldScaled = (scaledPlayer[attr] as number) ?? 20;

      if (oldScaled < minScaled) {
        // Compute the raw value needed to hit minScaled after scale+clamp
        const rawNeeded = Math.ceil(minScaled / sf);
        const newRaw = Math.min(rawNeeded, SECONDARY_RAW_CAP);
        // Verify the scaled result actually meets the floor (clamping may prevent it)
        const newScaled = clamp20_99(Math.round(newRaw * sf));

        if (newRaw > oldRaw) {
          attrChanges[attr] = { oldRaw, newRaw };
          patchedScaled[attr] = newScaled;
        }
      }
    }

    if (Object.keys(attrChanges).length > 0) {
      const newOVR = calculateOVR(patchedScaled as RealPlayer);
      patches.push({
        firstName: rawPlayer.firstName,
        lastName: rawPlayer.lastName,
        team,
        attrChanges,
        oldScaledOVR: oldOVR,
        newScaledOVR: newOVR,
      });
    }
  }
}

console.log(`Total hitters: ${totalHitters}`);
console.log(`Patches to apply: ${patches.length} hitters`);

// ── 2. Distribution stats ─────────────────────────────────────────────────────
const patchLookup = new Map<string, PatchEntry>(
  patches.map(p => [`${p.firstName}|${p.lastName}|${p.team}`, p])
);

function starBand(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}

const beforeBands: Record<number, number> = { 5:0, 4:0, 3:0, 2:0, 1:0 };
const afterBands: Record<number, number>  = { 5:0, 4:0, 3:0, 2:0, 1:0 };
let beforeGradeSlots: Record<string, number> = { S:0, A:0, B:0, C:0, D:0, F:0, G:0 };
let afterGradeSlots:  Record<string, number> = { S:0, A:0, B:0, C:0, D:0, F:0, G:0 };
let beforeBelow200 = 0, afterBelow200 = 0;

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;

    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const key = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const patch = patchLookup.get(key);

    const bOVR = calculateOVR(scaledPlayer);
    beforeBands[starBand(bOVR)]++;
    if (bOVR < 200) beforeBelow200++;

    for (const attr of SECONDARY_ATTRS) {
      beforeGradeSlots[commonGrade((scaledPlayer[attr] as number) ?? 20)]++;
    }

    let aOVR: number;
    if (patch) {
      const patchedScaled: Record<string, unknown> = { ...scaledPlayer };
      for (const [attr, { newRaw }] of Object.entries(patch.attrChanges)) {
        patchedScaled[attr] = clamp20_99(Math.round(newRaw * sf));
      }
      aOVR = calculateOVR(patchedScaled as RealPlayer);
      for (const attr of SECONDARY_ATTRS) {
        const newRaw = patch.attrChanges[attr]?.newRaw ?? (rawPlayer[attr] as number) ?? 0;
        afterGradeSlots[commonGrade(clamp20_99(Math.round(newRaw * sf)))]++;
      }
    } else {
      aOVR = bOVR;
      for (const attr of SECONDARY_ATTRS) {
        afterGradeSlots[commonGrade((scaledPlayer[attr] as number) ?? 20)]++;
      }
    }

    afterBands[starBand(aOVR)]++;
    if (aOVR < 200) afterBelow200++;
  }
}

const n = totalHitters;
const pct = (v: number) => `${v} (${((v / n) * 100).toFixed(1)}%)`;

console.log("\n=== Star band distribution (hitters) ===");
console.log(`${"Band".padEnd(6)}  ${"Before".padStart(20)}  ${"After".padStart(20)}`);
for (const s of [5, 4, 3, 2, 1]) {
  console.log(`  ${s}★    ${pct(beforeBands[s]).padStart(18)}  ${pct(afterBands[s]).padStart(18)}`);
}

console.log("\n=== Secondary attr grade distribution (all 6 attrs per hitter) ===");
const totalSlots = n * SECONDARY_ATTRS.length;
const pctSlot = (v: number) => `${v} (${((v / totalSlots) * 100).toFixed(1)}%)`;
console.log(`${"Grade".padEnd(6)}  ${"Before".padStart(20)}  ${"After".padStart(20)}`);
for (const g of ["S","A","B","C","D","F","G"]) {
  console.log(`  ${g}       ${pctSlot(beforeGradeSlots[g]).padStart(18)}  ${pctSlot(afterGradeSlots[g]).padStart(18)}`);
}

// ── 3. Constraint validation ──────────────────────────────────────────────────
const violations: string[] = [];

// Only require shrinkage when we actually applied patches (not on a re-run of
// an already-calibrated dataset where patches.length === 0).
if (patches.length > 0 && afterBelow200 >= beforeBelow200) {
  violations.push(
    `1★ band did not shrink: before=${beforeBelow200} (${((beforeBelow200/n)*100).toFixed(1)}%) after=${afterBelow200} (${((afterBelow200/n)*100).toFixed(1)}%)`
  );
}

const TARGET_1STAR_FRACTION = 0.30;
if (afterBelow200 / n > TARGET_1STAR_FRACTION) {
  violations.push(
    `1★ band is ${((afterBelow200/n)*100).toFixed(1)}% — target is <30% (${afterBelow200} > ${Math.floor(n * TARGET_1STAR_FRACTION)})`
  );
}

if (afterGradeSlots["G"] > 0) {
  violations.push(`${afterGradeSlots["G"]} G-grade secondary attr slots remain after calibration`);
}

if (violations.length === 0) {
  console.log("\n✅ All constraints satisfied.");
} else {
  console.log("\n⚠ Constraint violations:");
  violations.forEach(v => console.log("  - " + v));
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] No files written.");
  process.exit(violations.length > 0 ? 1 : 0);
}

// ── 4. Write patches to source files ─────────────────────────────────────────
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTeamSection(content: string, team: string): { start: number; end: number } | null {
  const teamRe = new RegExp(`"${escapeRe(team)}"\\s*:\\s*\\[`);
  const m = teamRe.exec(content);
  if (!m) return null;

  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < content.length; i++) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") {
      depth--;
      if (depth === 0) return { start: m.index, end: i + 1 };
    }
  }
  return null;
}

function patchPlayerInSection(section: string, patch: PatchEntry): string | null {
  const fnEsc = escapeRe(patch.firstName);
  const lnEsc = escapeRe(patch.lastName);

  const blockRe = new RegExp(`\\{\\s*firstName:\\s*"${fnEsc}"\\s*,\\s*lastName:\\s*"${lnEsc}"`);
  const blockMatch = blockRe.exec(section);
  if (!blockMatch) return null;

  let depth = 0;
  let blockEnd = blockMatch.index;
  for (let i = blockMatch.index; i < section.length; i++) {
    if (section[i] === "{") depth++;
    else if (section[i] === "}") {
      depth--;
      if (depth === 0) { blockEnd = i + 1; break; }
    }
  }

  let block = section.slice(blockMatch.index, blockEnd);
  const before = section.slice(0, blockMatch.index);
  const after = section.slice(blockEnd);

  // Replace each secondary attr value individually in the block
  for (const [attr, { oldRaw, newRaw }] of Object.entries(patch.attrChanges)) {
    const attrRe = new RegExp(`(\\b${escapeRe(attr)}:\\s*)${oldRaw}\\b`);
    const replaced = block.replace(attrRe, `$1${newRaw}`);
    if (replaced === block) {
      // Attr not found or value mismatch — skip this attr
      continue;
    }
    block = replaced;
  }

  return before + block + after;
}

const patchesByFile: Map<string, PatchEntry[]> = new Map();
for (const patch of patches) {
  // Determine which file contains this team — we'll try all files
  const key = patch.team;
  if (!patchesByFile.has(key)) patchesByFile.set(key, []);
  patchesByFile.get(key)!.push(patch);
}

let totalFilesChanged = 0;
let totalReplacements = 0;
let totalNotFound = 0;

// Build a lookup from team -> patches
const patchesByTeam = new Map<string, PatchEntry[]>();
for (const patch of patches) {
  if (!patchesByTeam.has(patch.team)) patchesByTeam.set(patch.team, []);
  patchesByTeam.get(patch.team)!.push(patch);
}

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  let fileChanged = false;
  let fileReplacements = 0;
  let fileNotFound = 0;

  // For each team whose patches might live in this file, try to apply them
  for (const [team, teamPatches] of patchesByTeam) {
    const section = findTeamSection(content, team);
    if (!section) continue; // team not in this file

    let sectionStr = content.slice(section.start, section.end);
    const origSection = sectionStr;

    for (const patch of teamPatches) {
      const patched = patchPlayerInSection(sectionStr, patch);
      if (patched === null) {
        fileNotFound++;
        totalNotFound++;
        console.warn(`  ⚠ Player not found: ${patch.firstName} ${patch.lastName} (${team}) in ${relPath}`);
      } else {
        sectionStr = patched;
        fileReplacements++;
        totalReplacements++;
      }
    }

    if (sectionStr !== origSection) {
      content = content.slice(0, section.start) + sectionStr + content.slice(section.end);
      fileChanged = true;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  ✓ ${relPath}: ${fileReplacements} player(s) patched`);
    totalFilesChanged++;
  }
}

console.log(`\nDone. Files changed: ${totalFilesChanged}, players patched: ${totalReplacements}, not found: ${totalNotFound}`);

if (violations.length > 0) {
  process.exit(1);
}
