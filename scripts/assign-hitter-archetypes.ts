/**
 * assign-hitter-archetypes.ts
 *
 * Restores archetype identity for Role and Raw hitters by lowering
 * non-archetype attributes back into the F-grade range (scaled 20–39).
 *
 * Task #638 raised every hitter's secondary common attrs to a uniform
 * per-tier floor, eliminating all F/G grades and flattening identity.
 * This script reverses that for Role and Raw archetypes only.
 *
 * ── Three hitter archetype groups ────────────────────────────────────
 *   Hitting  : hitForAvg + power  →  common: clutch, vsLHP
 *   Speed    : speed              →  common: stealing, running
 *   Defense  : arm + fielding + errorResistance  →  common: throwing, grit
 *
 * ── Six player tiers ─────────────────────────────────────────────────
 *   Superstar / Star / Solid / Average  — untouched
 *   Role-Hitting / Role-Speed / Role-Defense — lower non-archetype attrs to F
 *   Raw                                 — lower all but one breakthrough attr to F
 *
 * ── Classification (based on SCALED primary attrs only) ──────────────
 *   Raw      : exactly 1 primary attr ≥ 70, all others < 50, OVR < 350
 *   Role-X   : one group's primary peak ≥ 65, both other groups' primaries < 55
 *   Superstar: overall peak ≥ 75 AND avg 6 common attrs ≥ 60 (before Task #638 inflation)
 *   Star     : overall peak ≥ 70 AND avg common ≥ 50
 *   Solid    : overall peak ≥ 60
 *   Average  : everything else
 *
 * Usage:
 *   npx tsx scripts/assign-hitter-archetypes.ts [--dry-run]
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

// ── Archetype group definitions ───────────────────────────────────────────────

/** Primary attrs per archetype group */
const GROUP_PRIMARY: Record<string, (keyof RealPlayer)[]> = {
  Hitting : ["hitForAvg", "power"],
  Speed   : ["speed"],
  Defense : ["arm", "fielding", "errorResistance"],
};

/** Common ability attrs per archetype group */
const GROUP_COMMON: Record<string, (keyof RealPlayer)[]> = {
  Hitting : ["clutch", "vsLHP"],
  Speed   : ["stealing", "running"],
  Defense : ["throwing", "grit"],
};

const ALL_PRIMARY: (keyof RealPlayer)[] = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance"];
const ALL_COMMON:  (keyof RealPlayer)[] = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing"];

// ── All attributes that ROSTER_SCALE_FACTORS applies to ──────────────────────
const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

// ── Per-player override map ───────────────────────────────────────────────────
// Key format: "firstName|lastName|teamName"
// Value: one of "Superstar"|"Star"|"Solid"|"Average"|"Role-Hitting"|"Role-Speed"|"Role-Defense"|"Raw"
const HITTER_ARCHETYPE_OVERRIDES: Record<string, string> = {
  // Example: "John|Doe|LSU": "Role-Speed"
};

// ── F-grade target ────────────────────────────────────────────────────────────
/**
 * We target scaled = 28 for lowered attrs (solidly in F range: 20–39).
 * For a given scale factor sf: newRaw = round(28 / sf), clamped so that
 * the resulting scaled value stays >= 20 (avoids G grade).
 */
const F_GRADE_TARGET_SCALED = 28;

/** Attrs at or below this scaled threshold are already in F/G range — skip. */
const F_GRADE_MAX_SCALED = 39;

// ── Roster source files ───────────────────────────────────────────────────────
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

function commonGrade(v: number): "S" | "A" | "B" | "C" | "D" | "F" | "G" {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 40) return "D";
  if (v >= 20) return "F";
  return "G";
}

function groupPeak(scaled: RealPlayer, group: string): number {
  return Math.max(...GROUP_PRIMARY[group].map(a => (scaled[a] as number) ?? 0));
}

// ── Classification ────────────────────────────────────────────────────────────
function classifyHitter(scaled: RealPlayer): string {
  const hitPeak  = groupPeak(scaled, "Hitting");
  const spdPeak  = groupPeak(scaled, "Speed");
  const defPeak  = groupPeak(scaled, "Defense");
  const allPeak  = Math.max(hitPeak, spdPeak, defPeak);

  const ovr = calculateOVR(scaled);

  // ── Raw: exactly one primary attr ≥ 70, all others < 50, OVR < 350
  const primaries = ALL_PRIMARY.map(a => (scaled[a] as number) ?? 0);
  const highCount = primaries.filter(v => v >= 70).length;
  const lowCount  = primaries.filter(v => v < 50).length;
  if (highCount === 1 && lowCount >= 5 && ovr < 350) return "Raw";

  // ── Role: one group peak ≥ 65, both other groups' primaries ALL < 55
  const hitAllLow = GROUP_PRIMARY["Hitting"].every(a => ((scaled[a] as number) ?? 0) < 55);
  const spdAllLow = GROUP_PRIMARY["Speed"].every(a => ((scaled[a] as number) ?? 0) < 55);
  const defAllLow = GROUP_PRIMARY["Defense"].every(a => ((scaled[a] as number) ?? 0) < 55);

  if (hitPeak >= 65 && spdAllLow && defAllLow) return "Role-Hitting";
  if (spdPeak >= 65 && hitAllLow && defAllLow) return "Role-Speed";
  if (defPeak >= 65 && hitAllLow && spdAllLow) return "Role-Defense";

  // ── Standard tiers — use primary peak only (common attrs inflated by Task #638)
  if (allPeak >= 75) return "Superstar";
  if (allPeak >= 70) return "Star";
  if (allPeak >= 60) return "Solid";
  return "Average";
}

/** For Role/Raw: return the list of attrs that should be lowered to F range. */
function getAttrsToLower(archetype: string, scaled: RealPlayer): (keyof RealPlayer)[] {
  if (archetype === "Raw") {
    // All primary attrs except the one breakthrough (highest), plus all common attrs
    const primaries = ALL_PRIMARY.map(a => ({ attr: a, val: (scaled[a] as number) ?? 0 }));
    const maxPrimary = Math.max(...primaries.map(p => p.val));
    let breakthroughUsed = false;
    const primaryToLower: (keyof RealPlayer)[] = [];
    for (const { attr, val } of primaries) {
      if (!breakthroughUsed && val === maxPrimary) {
        breakthroughUsed = true; // keep the highest one
        continue;
      }
      primaryToLower.push(attr);
    }
    return [...primaryToLower, ...ALL_COMMON];
  }

  if (archetype.startsWith("Role-")) {
    const group = archetype.replace("Role-", ""); // "Hitting" | "Speed" | "Defense"
    const keepPrimary = new Set(GROUP_PRIMARY[group]);
    const keepCommon  = new Set(GROUP_COMMON[group]);
    return [
      ...ALL_PRIMARY.filter(a => !keepPrimary.has(a)),
      ...ALL_COMMON.filter(a  => !keepCommon.has(a)),
    ];
  }

  return []; // Superstar/Star/Solid/Average — no lowering
}

// ── Build patches ─────────────────────────────────────────────────────────────
interface PatchEntry {
  firstName: string;
  lastName: string;
  team: string;
  archetype: string;
  attrChanges: Record<string, { oldRaw: number; newRaw: number }>;
  oldScaledOVR: number;
  newScaledOVR: number;
}

const patches: PatchEntry[] = [];
let totalHitters = 0;

const archetypeCounts: Record<string, number> = {
  Superstar: 0, Star: 0, Solid: 0, Average: 0,
  "Role-Hitting": 0, "Role-Speed": 0, "Role-Defense": 0, Raw: 0,
};

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;

  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;
    totalHitters++;

    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const overrideKey  = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const archetype    = HITTER_ARCHETYPE_OVERRIDES[overrideKey] ?? classifyHitter(scaledPlayer);

    archetypeCounts[archetype] = (archetypeCounts[archetype] ?? 0) + 1;

    const attrsToLower = getAttrsToLower(archetype, scaledPlayer);
    if (attrsToLower.length === 0) continue;

    const oldOVR = calculateOVR(scaledPlayer);
    const attrChanges: Record<string, { oldRaw: number; newRaw: number }> = {};
    const patchedScaled: Record<string, unknown> = { ...scaledPlayer };

    for (const attr of attrsToLower) {
      const oldRaw    = (rawPlayer[attr] as number) ?? 0;
      const oldScaled = (scaledPlayer[attr] as number) ?? 0;

      // Only lower — skip if already in F/G range
      if (oldScaled <= F_GRADE_MAX_SCALED) continue;

      // Compute raw needed to reach ~F_GRADE_TARGET_SCALED after scaling
      let newRaw = Math.round(F_GRADE_TARGET_SCALED / sf);
      // Ensure it doesn't produce G grade (<20 scaled)
      const minRaw = Math.ceil(20 / sf);
      newRaw = Math.max(newRaw, minRaw);
      // Hard upper cap: never compute a newRaw that's already ≥ oldRaw
      // (this prevents accidental raises if target > current for some edge case)
      if (newRaw >= oldRaw) continue;

      const newScaled = clamp20_99(Math.round(newRaw * sf));

      attrChanges[attr] = { oldRaw, newRaw };
      patchedScaled[attr as string] = newScaled;
    }

    if (Object.keys(attrChanges).length > 0) {
      const newOVR = calculateOVR(patchedScaled as RealPlayer);
      patches.push({
        firstName: rawPlayer.firstName,
        lastName: rawPlayer.lastName,
        team,
        archetype,
        attrChanges,
        oldScaledOVR: oldOVR,
        newScaledOVR: newOVR,
      });
    }
  }
}

// ── Console summary ───────────────────────────────────────────────────────────
console.log(`\nTotal hitters: ${totalHitters}`);
console.log(`Patches to apply: ${patches.length} hitters\n`);

console.log("=== Archetype distribution ===");
for (const [tier, count] of Object.entries(archetypeCounts)) {
  const pct = ((count / totalHitters) * 100).toFixed(1);
  console.log(`  ${tier.padEnd(16)} ${String(count).padStart(4)}  (${pct}%)`);
}

// ── Distribution stats (before / after) ──────────────────────────────────────
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

const beforeBands:     Record<number, number> = { 5:0, 4:0, 3:0, 2:0, 1:0 };
const afterBands:      Record<number, number> = { 5:0, 4:0, 3:0, 2:0, 1:0 };
const beforeGradeSots: Record<string, number> = { S:0, A:0, B:0, C:0, D:0, F:0, G:0 };
const afterGradeSlots: Record<string, number> = { S:0, A:0, B:0, C:0, D:0, F:0, G:0 };

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;

    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const key   = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const patch = patchLookup.get(key);

    const bOVR = calculateOVR(scaledPlayer);
    beforeBands[starBand(bOVR)]++;
    for (const attr of ALL_COMMON) {
      beforeGradeSots[commonGrade((scaledPlayer[attr] as number) ?? 20)]++;
    }

    if (patch) {
      const patchedScaled: Record<string, unknown> = { ...scaledPlayer };
      for (const [attr, { newRaw }] of Object.entries(patch.attrChanges)) {
        patchedScaled[attr] = clamp20_99(Math.round(newRaw * sf));
      }
      const aOVR = calculateOVR(patchedScaled as RealPlayer);
      afterBands[starBand(aOVR)]++;
      for (const attr of ALL_COMMON) {
        const newRaw = patch.attrChanges[attr]?.newRaw ?? (rawPlayer[attr] as number) ?? 0;
        afterGradeSlots[commonGrade(clamp20_99(Math.round(newRaw * sf)))]++;
      }
    } else {
      afterBands[starBand(bOVR)]++;
      for (const attr of ALL_COMMON) {
        afterGradeSlots[commonGrade((scaledPlayer[attr] as number) ?? 20)]++;
      }
    }
  }
}

const n = totalHitters;
const pct = (v: number) => `${v} (${((v / n) * 100).toFixed(1)}%)`;
const totalSlots = n * ALL_COMMON.length;
const pctSlot = (v: number) => `${v} (${((v / totalSlots) * 100).toFixed(1)}%)`;

console.log("\n=== Star band distribution (hitters) ===");
console.log(`${"Band".padEnd(6)}  ${"Before".padStart(20)}  ${"After".padStart(20)}`);
for (const s of [5, 4, 3, 2, 1]) {
  console.log(`  ${s}★    ${pct(beforeBands[s]).padStart(18)}  ${pct(afterBands[s]).padStart(18)}`);
}

console.log("\n=== Common attr grade distribution ===");
console.log(`${"Grade".padEnd(6)}  ${"Before".padStart(20)}  ${"After".padStart(20)}`);
for (const g of ["S", "A", "B", "C", "D", "F", "G"]) {
  console.log(`  ${g}       ${pctSlot(beforeGradeSots[g]).padStart(18)}  ${pctSlot(afterGradeSlots[g]).padStart(18)}`);
}

// ── Validation ────────────────────────────────────────────────────────────────
const violations: string[] = [];

// Every Role/Raw hitter should have at least 1 common attr in F/G range after patching
let roleRawNoF = 0;
for (const patch of patches) {
  if (!patch.archetype.startsWith("Role-") && patch.archetype !== "Raw") continue;
  const rawPlayer = (RAW_UNCALIBRATED_ROSTERS[patch.team] ?? [])
    .find(p => p.firstName === patch.firstName && p.lastName === patch.lastName);
  if (!rawPlayer) continue;
  const sf = ROSTER_SCALE_FACTORS[patch.team] ?? 1;
  const scaledPlayer = applyScaleFactor(rawPlayer, sf);
  const patchedScaled: Record<string, unknown> = { ...scaledPlayer };
  for (const [attr, { newRaw }] of Object.entries(patch.attrChanges)) {
    patchedScaled[attr] = clamp20_99(Math.round(newRaw * sf));
  }
  const hasFOrG = ALL_COMMON.some(a => {
    const v = (patchedScaled[a as string] as number) ?? 0;
    return v < 40; // F or G grade
  });
  if (!hasFOrG) roleRawNoF++;
}

if (roleRawNoF > 0) {
  violations.push(`${roleRawNoF} Role/Raw hitters have 0 F/G-grade common attrs after patching`);
}

// Ensure F-grade slots increased (we introduced F grades for Role/Raw)
const afterFplusG = (afterGradeSlots["F"] ?? 0) + (afterGradeSlots["G"] ?? 0);
const beforeFplusG = (beforeGradeSots["F"] ?? 0) + (beforeGradeSots["G"] ?? 0);
if (patches.length > 0 && afterFplusG <= beforeFplusG) {
  violations.push(`F/G grade slots did not increase: before=${beforeFplusG} after=${afterFplusG}`);
}

if (violations.length === 0) {
  console.log("\n✅ All constraints satisfied.");
} else {
  console.log("\n⚠  Constraint violations:");
  violations.forEach(v => console.log("  - " + v));
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] No files written.");
  process.exit(violations.length > 0 ? 1 : 0);
}

// ── Write patches to source files ─────────────────────────────────────────────
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

  let block   = section.slice(blockMatch.index, blockEnd);
  const before = section.slice(0, blockMatch.index);
  const after  = section.slice(blockEnd);

  for (const [attr, { oldRaw, newRaw }] of Object.entries(patch.attrChanges)) {
    const attrRe   = new RegExp(`(\\b${escapeRe(attr)}:\\s*)${oldRaw}\\b`);
    const replaced = block.replace(attrRe, `$1${newRaw}`);
    if (replaced !== block) block = replaced;
  }

  return before + block + after;
}

const patchesByTeam = new Map<string, PatchEntry[]>();
for (const patch of patches) {
  if (!patchesByTeam.has(patch.team)) patchesByTeam.set(patch.team, []);
  patchesByTeam.get(patch.team)!.push(patch);
}

let totalFilesChanged = 0;
let totalReplacements = 0;
let totalNotFound = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  let fileChanged     = false;
  let fileReplacements = 0;
  let fileNotFound     = 0;

  for (const [team, teamPatches] of patchesByTeam) {
    const section = findTeamSection(content, team);
    if (!section) continue;

    let sectionStr    = content.slice(section.start, section.end);
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
