#!/usr/bin/env tsx
/**
 * redistribute-common-attrs.ts
 *
 * Lowers common ability attrs toward per-archetype / per-OVR-band target ranges
 * to achieve a more realistic grade distribution:
 *   C ≈ 24%,  D ≈ 37%,  F ≈ 15%,  G ≈ 3%
 *
 * ── Per-archetype ceilings (hitters) ─────────────────────────────────────────
 *   Superstar (allPeak≥75 & commonAvg≥60): ceiling 75  (mid-B, preserve elites)
 *   Star      (allPeak≥70 & commonAvg≥50): ceiling 65  (low-C)
 *   Solid     (allPeak≥60)               : ceiling 58  (D-grade)
 *   Average   (allPeak≥40)               : ceiling 45  (D-grade)
 *   Sub-Avg   (allPeak<40, "Average" bucket): ceiling 16 (G-grade, weakest players)
 *   Role-X / Raw                          : untouched (Task #642 owns these)
 *
 * ── Per-OVR-band ceilings (pitchers) ─────────────────────────────────────────
 *   Elite (OVR ≥ 450)        : ceiling 75
 *   Above Avg (OVR 350-449)  : ceiling 65
 *   Average   (OVR 250-349)  : ceiling 58
 *   Below Avg (OVR 150-249)  : ceiling 45
 *   Very Weak (OVR < 150)    : ceiling 16 (G-grade)
 *
 * ── Invariants ───────────────────────────────────────────────────────────────
 *   • Lower-only: never raises any attr
 *   • G grades require clamp10 in server/realRosters.ts (patched)
 *     and COMMON_OVR G=-3 in shared/abilities.ts (patched)
 *   • Idempotent: second run with --dry-run reports 0 patches
 *
 * ── Post-pass validation gates ───────────────────────────────────────────────
 *   • G-grade slots: 1% ≤ G% ≤ 5%
 *   • S-grade slots: after ≤ before (never adds S grades)
 *   • C-grade slots: ≤ 30% (below the old 44.8% glut)
 *   • All Role/Raw hitters: ≥ 1 F/G common attr (Task #642 invariant)
 *
 * Usage:
 *   npx tsx scripts/redistribute-common-attrs.ts [--dry-run]
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

// ── Grade helpers ─────────────────────────────────────────────────────────────
function commonGrade(v: number): "S" | "A" | "B" | "C" | "D" | "F" | "G" {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 40) return "D";
  if (v >= 20) return "F";
  return "G";
}

// Clamp for primary attrs (min 20)
function clamp20_99(v: number): number {
  return Math.round(Math.max(20, Math.min(99, v)));
}

// Clamp for common attrs (min 10 — allows G grades 10-19)
function clamp10_99(v: number): number {
  return Math.round(Math.max(10, Math.min(99, v)));
}

// ── Position + attr sets ──────────────────────────────────────────────────────
const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

const HITTER_COMMON: (keyof RealPlayer)[] = [
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
];

const PITCHER_COMMON: (keyof RealPlayer)[] = [
  "wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery",
];

const COMMON_ATTR_SET = new Set<string>([
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
]);

const PRIMARY_SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "velocity", "control", "stamina", "stuff",
];
const ALL_SCALE_ATTRS: (keyof RealPlayer)[] = [
  ...PRIMARY_SCALE_ATTRS,
  "stealing",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
];

// ── Scale helper — uses clamp10 for common attrs, clamp20 for primaries ───────
function applyScaleFactor(player: RealPlayer, sf: number): RealPlayer {
  if (sf === 1) return player;
  const out: Record<string, unknown> = { ...player };
  for (const attr of ALL_SCALE_ATTRS) {
    const val = player[attr];
    if (typeof val === "number") {
      const isCommon = COMMON_ATTR_SET.has(attr as string);
      out[attr as string] = isCommon
        ? clamp10_99(val * sf)
        : clamp20_99(val * sf);
    }
  }
  return out as RealPlayer;
}

// ── Hitter archetype classification ──────────────────────────────────────────
function classifyHitter(scaled: RealPlayer): string {
  const hitPeak = Math.max(scaled.hitForAvg ?? 0, scaled.power ?? 0);
  const spdPeak = scaled.speed ?? 0;
  const defPeak = Math.max(scaled.arm ?? 0, scaled.fielding ?? 0, scaled.errorResistance ?? 0);
  const allPeak = Math.max(hitPeak, spdPeak, defPeak);

  const primaries = [
    scaled.hitForAvg ?? 0, scaled.power ?? 0, scaled.speed ?? 0,
    scaled.arm ?? 0, scaled.fielding ?? 0, scaled.errorResistance ?? 0,
  ];
  const highCount = primaries.filter(v => v >= 70).length;
  const lowCount  = primaries.filter(v => v < 50).length;
  const ovr = calculateOVR(scaled);

  if (highCount === 1 && lowCount >= 5 && ovr < 300) return "Raw";

  const hitAllLow = (scaled.hitForAvg ?? 0) < 55 && (scaled.power ?? 0) < 55;
  const spdAllLow = (scaled.speed ?? 0) < 55;
  const defAllLow = (scaled.arm ?? 0) < 55 && (scaled.fielding ?? 0) < 55 && (scaled.errorResistance ?? 0) < 55;

  if (hitPeak >= 65 && spdAllLow && defAllLow) return "Role-Hitting";
  if (spdPeak >= 65 && hitAllLow && defAllLow) return "Role-Speed";
  if (defPeak >= 65 && hitAllLow && spdAllLow) return "Role-Defense";

  const ALL_COMMON_6: (keyof RealPlayer)[] = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing"];
  const commonAvg = ALL_COMMON_6.reduce((s, a) => s + ((scaled[a] as number) ?? 0), 0) / ALL_COMMON_6.length;

  if (allPeak >= 75 && commonAvg >= 60) return "Superstar";
  if (allPeak >= 70 && commonAvg >= 50) return "Star";
  if (allPeak >= 60) return "Solid";
  return "Average"; // allPeak < 60
}

// ── Ceiling lookup ────────────────────────────────────────────────────────────
/**
 * Returns the ceiling (max allowed scaled value) for a hitter common attr.
 * Sub-Average players (allPeak < 50 within "Average" bucket) get G ceiling.
 * Role-* and Raw are untouched (Task #642 owns those).
 */
function hitterCeiling(archetype: string, allPeak: number): number | null {
  if (archetype.startsWith("Role-") || archetype === "Raw") return null;

  switch (archetype) {
    case "Superstar": return 75;  // B-grade max; preserve elite secondaries
    case "Star":      return 65;  // low-C max
    case "Solid":     return 58;  // D-grade (C→D)
    case "Average":
      // Sub-Average bucket (allPeak<40): truly weak players — enable G grades
      return allPeak < 40 ? 16 : 45;
    default:
      return null;
  }
}

/**
 * Returns the ceiling for a pitcher common attr based on OVR band.
 */
function pitcherCeiling(ovr: number): number | null {
  if (ovr >= 450) return 75;
  if (ovr >= 350) return 65;
  if (ovr >= 250) return 58;
  if (ovr >= 150) return 45;
  return 16; // OVR < 150: G-grade for very weak pitchers
}

/**
 * Given the ceiling and current attr values, compute the new raw value.
 * Returns null if no change is needed (already at/below ceiling, or can't lower).
 */
function computeNewRaw(
  oldRaw: number,
  oldScaled: number,
  sf: number,
  ceiling: number,
): number | null {
  if (oldRaw <= 0) return null;
  if (oldScaled <= ceiling) return null; // already within target

  const rawNeeded = Math.ceil(ceiling / sf);
  const minRaw    = Math.ceil(10 / sf); // allow G grades (min scaled = 10)
  const newRaw    = Math.max(minRaw, rawNeeded);

  if (newRaw >= oldRaw) return null; // lower-only
  return newRaw;
}

// ── Distribution tracking ─────────────────────────────────────────────────────
interface GradeDist { S: number; A: number; B: number; C: number; D: number; F: number; G: number; }
function zeroDist(): GradeDist { return { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, G: 0 }; }

// ── Patch collection ──────────────────────────────────────────────────────────
interface PatchEntry {
  firstName: string;
  lastName:  string;
  team:      string;
  attrChanges: Record<string, { oldRaw: number; newRaw: number }>;
}

const patches: PatchEntry[] = [];
const beforeDist = zeroDist();
const afterDist  = zeroDist();

let totalHitters  = 0;
let totalPitchers = 0;

const archetypeCounts:  Record<string, number> = {};
const archetypePatched: Record<string, number> = {};

// Track Role/Raw hitters for post-pass invariant check
interface RoleRawEntry {
  team: string;
  firstName: string;
  lastName: string;
  commonAttrs: Record<string, number>; // attr → afterScaled
  archetype: string;
}
const roleRawEntries: RoleRawEntry[] = [];

for (const [team, rawPlayers] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;

  for (const rawPlayer of rawPlayers as RealPlayer[]) {
    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const isPitcher    = PITCHER_POSITIONS.has(rawPlayer.position);
    const commonAttrs  = isPitcher ? PITCHER_COMMON : HITTER_COMMON;

    if (isPitcher) totalPitchers++;
    else           totalHitters++;

    // Count before distribution
    for (const attr of commonAttrs) {
      const v = (scaledPlayer[attr] as number) ?? 20;
      beforeDist[commonGrade(v)]++;
    }

    // Classify
    let archetype = "";
    let allPeak   = 0;
    let ovr       = 0;

    if (!isPitcher) {
      archetype = classifyHitter(scaledPlayer);
      const primaries = [
        scaledPlayer.hitForAvg ?? 0, scaledPlayer.power ?? 0, scaledPlayer.speed ?? 0,
        scaledPlayer.arm ?? 0, scaledPlayer.fielding ?? 0, scaledPlayer.errorResistance ?? 0,
      ];
      allPeak = Math.max(...primaries);
      archetypeCounts[archetype] = (archetypeCounts[archetype] ?? 0) + 1;
    } else {
      ovr = calculateOVR(scaledPlayer);
    }

    const attrChanges: Record<string, { oldRaw: number; newRaw: number }> = {};
    const afterCommonScaled: Record<string, number> = {};

    for (const attr of commonAttrs) {
      const oldRaw    = (rawPlayer[attr] as number) ?? 0;
      const oldScaled = (scaledPlayer[attr] as number) ?? 20;

      const ceiling = isPitcher
        ? pitcherCeiling(ovr)
        : hitterCeiling(archetype, allPeak);

      if (ceiling === null) {
        afterDist[commonGrade(oldScaled)]++;
        afterCommonScaled[attr as string] = oldScaled;
        continue;
      }

      const newRaw = computeNewRaw(oldRaw, oldScaled, sf, ceiling);
      if (newRaw === null) {
        afterDist[commonGrade(oldScaled)]++;
        afterCommonScaled[attr as string] = oldScaled;
        continue;
      }

      // newScaled uses clamp10 since G grades are allowed for common attrs
      const newScaled = clamp10_99(Math.round(newRaw * sf));
      afterDist[commonGrade(newScaled)]++;
      afterCommonScaled[attr as string] = newScaled;
      attrChanges[attr as string] = { oldRaw, newRaw };
    }

    if (!isPitcher && (archetype.startsWith("Role-") || archetype === "Raw")) {
      roleRawEntries.push({
        team,
        firstName: rawPlayer.firstName,
        lastName:  rawPlayer.lastName,
        archetype,
        commonAttrs: afterCommonScaled,
      });
    }

    if (Object.keys(attrChanges).length > 0) {
      patches.push({ firstName: rawPlayer.firstName, lastName: rawPlayer.lastName, team, attrChanges });
      if (!isPitcher) archetypePatched[archetype] = (archetypePatched[archetype] ?? 0) + 1;
    }
  }
}

// ── Post-pass validation gates ────────────────────────────────────────────────
const totalSlots = (totalHitters + totalPitchers) * 7;
const violations: string[] = [];

// 1. G% bounds: 1% ≤ G ≤ 5%
const gPct = afterDist.G / totalSlots;
if (gPct < 0.01) {
  violations.push(`G% too low: ${(gPct * 100).toFixed(1)}% (need ≥ 1%)`);
}
if (gPct > 0.05) {
  violations.push(`G% too high: ${(gPct * 100).toFixed(1)}% (need ≤ 5%)`);
}

// 2. S slots not increased
if (afterDist.S > beforeDist.S) {
  violations.push(`S-grade slots increased: ${beforeDist.S} → ${afterDist.S} (must not increase)`);
}

// 3. C ≤ 30%
const cPct = afterDist.C / totalSlots;
if (cPct > 0.30) {
  violations.push(`C% too high: ${(cPct * 100).toFixed(1)}% (need ≤ 30%)`);
}

// 4. All Role/Raw hitters have ≥ 1 F/G common attr
let roleRawNoFG = 0;
for (const entry of roleRawEntries) {
  const hasFOrG = Object.values(entry.commonAttrs).some(v => commonGrade(v) === "F" || commonGrade(v) === "G");
  if (!hasFOrG) {
    roleRawNoFG++;
    violations.push(`Role/Raw invariant: ${entry.firstName} ${entry.lastName} (${entry.team}, ${entry.archetype}) has 0 F/G common attrs`);
  }
}

// ── Distribution report ───────────────────────────────────────────────────────
const beforeTotal = Object.values(beforeDist).reduce((a, b) => a + b, 0);
const afterTotal  = Object.values(afterDist).reduce((a, b) => a + b, 0);

console.log(`\nPlayers: ${totalHitters} hitters + ${totalPitchers} pitchers`);
console.log(`Attr slots: ${beforeTotal} before / ${afterTotal} after (expected: ${totalSlots})`);

function pct(n: number, total: number): string {
  return ((n / total) * 100).toFixed(1).padStart(5) + "%";
}

console.log("\nGrade distribution — Before → After:");
console.log("  Grade  Before             After              Target");
const TARGETS: Record<string, string> = { C: "~24%", D: "~37%", F: "~15%", G: "~3%" };
for (const grade of ["S", "A", "B", "C", "D", "F", "G"] as const) {
  const b = beforeDist[grade];
  const a = afterDist[grade];
  const tgt = TARGETS[grade] ?? "—";
  console.log(
    `  ${grade}      ${String(b).padStart(6)} (${pct(b, beforeTotal)})   ${String(a).padStart(6)} (${pct(a, afterTotal)})   ${tgt}`
  );
}

console.log("\nHitter archetype breakdown:");
for (const [arch, count] of Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])) {
  const patched = archetypePatched[arch] ?? 0;
  console.log(`  ${arch.padEnd(20)} ${String(count).padStart(4)} players,  ${String(patched).padStart(4)} patched`);
}

const totalAttrChanges = patches.reduce((n, p) => n + Object.keys(p.attrChanges).length, 0);
console.log(`\nPatches prepared: ${patches.length} players, ${totalAttrChanges} attr changes`);

// Report validation results
if (violations.length > 0) {
  console.error("\n✗ Post-pass validation FAILED:");
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
} else {
  console.log("\n✓ Post-pass validation passed:");
  console.log(`  G% = ${(gPct * 100).toFixed(1)}% [1–5%] ✓`);
  console.log(`  S count: ${beforeDist.S} → ${afterDist.S} (no increase) ✓`);
  console.log(`  C% = ${(cPct * 100).toFixed(1)}% [≤30%] ✓`);
  console.log(`  Role/Raw F/G invariant: all ${roleRawEntries.length} players satisfy ≥1 F/G attr ✓`);
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] No files written.");
  process.exit(0);
}

// ── Roster file write-back ────────────────────────────────────────────────────
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTeamSection(content: string, teamName: string): { start: number; end: number } | null {
  const headerRe = new RegExp(`["']${escapeRe(teamName)}["']\\s*:\\s*\\[`);
  const headerMatch = headerRe.exec(content);
  if (!headerMatch) return null;
  let depth = 0;
  let i = headerMatch.index + headerMatch[0].length - 1;
  for (; i < content.length; i++) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") {
      depth--;
      if (depth === 0) return { start: headerMatch.index, end: i + 1 };
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

  let block    = section.slice(blockMatch.index, blockEnd);
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
let totalNotFound     = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  let fileChanged      = false;
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
        console.warn(`  ⚠ Not found: ${patch.firstName} ${patch.lastName} (${patch.team}) in ${relPath}`);
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

if (totalNotFound > 0) process.exit(1);
