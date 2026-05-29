/**
 * inject-hitter-variance.ts
 *
 * Three-pass script for position players across all real-roster batch files.
 *
 * Pass 0 — CEILING_OVERRIDES
 *   Raises explicitly identified elite players to their stat-justified primary
 *   attribute values. Applied before secondary derivation so clutch/vsLHP
 *   reflect the elevated contact/power inputs. Never lowers an attr that is
 *   already equal-or-higher than the override value.
 *
 * Pass 1 — Flat secondary re-derivation
 *   Detects players where 3+ of {clutch, vsLHP, stealing, running, grit,
 *   throwing} share the same raw value at a scaled equivalent > 39 (i.e. not
 *   an intentional F-grade lowering from assign-hitter-archetypes.ts).
 *   Re-derives ONLY those "flat" attrs from their linked primary group:
 *     Hitting group  (hitForAvg + power)          → clutch, vsLHP
 *     Speed group    (speed)                      → stealing, running
 *     Defense group  (arm + fielding + errRes)    → grit, throwing
 *   Applies per-player seeded noise (±6 scaled) to keep identities distinct.
 *   Clamps secondary scaled values to 20–89 (no S grade from derivation alone).
 *
 * Pass 2 — Uniform primary variance
 *   Detects hitters where hitForAvg ≈ power (within ±3) AND both raw 20–30.
 *   Spreads them around their average using a seeded offset (4–8 pts).
 *   The direction (contact-heavy vs power-heavy) is seeded by player name so
 *   the result is deterministic across repeated runs.
 *
 * Constraints
 *   - Markus Frieske (MVC OF) is skip-listed — intentional hidden player.
 *   - Team average OVR must not shift more than ±3 after all changes.
 *   - No secondary scaled value is raised above 89 by this script alone.
 *   - Pass-generated secondary values are NOT applied to attrs already in
 *     their correct range (not part of the flat group).
 *
 * Usage:
 *   npx tsx scripts/inject-hitter-variance.ts [--dry-run]
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

const SECONDARY_ATTRS: (keyof RealPlayer)[] = [
  "clutch", "vsLHP", "stealing", "running", "grit", "throwing",
];

const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "stealing", "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
];

// ── Skip list ─────────────────────────────────────────────────────────────────
const SKIP_PLAYERS = new Set([
  "Markus|Frieske",  // intentional hidden gem — do not touch
]);

// ── Pass 0: Ceiling overrides ─────────────────────────────────────────────────
// Key: "firstName|lastName|team"
// Only RAISES attrs — never lowers anything already at/above the specified raw.
// Scale-factor reference for context:
//   Auburn    1.279111  |  Arkansas   1.297303  |  Texas A&M  1.375347
const CEILING_OVERRIDES: Record<string, Partial<Record<keyof RealPlayer, number>>> = {
  // .403 in SEC, .344/10HR/17-G hit streak, top pure hitter 2026 draft (SO)
  "Chris|Rembert|Auburn":       { hitForAvg: 70 }, // 70 × 1.279 = ~89.5 scaled
  // 17 multi-hit games (team lead), top-100 2026 draft (JR 2B)
  "Camden|Kozeal|Arkansas":     { hitForAvg: 72 }, // 72 × 1.297 = ~93.4 scaled
  // 13 HR/15 2B as SO, 16 multi-hit, .600 vs Ole Miss (JR OF power bat)
  "Kuhio|Aloy|Arkansas":        { power: 73 },     // 73 × 1.297 = ~94.7 scaled
  // .375/.502/.656, 14 HR, 61 RBI, top-30 2026 draft (JR 2B/SS transfer)
  "Chris|Hacopian|Texas A&M":   { hitForAvg: 66 }, // 66 × 1.375 = ~90.8 scaled
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp20_99(v: number): number {
  return clamp(Math.round(v), 20, 99);
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

/** Deterministic hash for player identity — used for seeded noise. */
function hashPlayer(firstName: string, lastName: string, team: string): number {
  const s = `${firstName}|${lastName}|${team}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Returns a seeded integer in [lo, hi] inclusive. Consumes 1 "slot" from hash. */
function seededRange(hash: number, slot: number, lo: number, hi: number): number {
  const mixed = ((hash * 1664525 + 1013904223 * (slot + 1)) >>> 0);
  return lo + (mixed % (hi - lo + 1));
}

// ── Pass 1: Flat secondary detection ─────────────────────────────────────────
/**
 * Returns the list of secondary attrs that are "flat" (share the mode value
 * with ≥2 others) where the scaled equivalent of that value is > 39.
 */
function flatSecondaryGroup(rawPlayer: RealPlayer, sf: number): (keyof RealPlayer)[] {
  const vals = SECONDARY_ATTRS.map(a => (rawPlayer[a] as number) ?? 0);

  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);

  let modeVal = -1;
  let modeCount = 0;
  for (const [v, c] of counts.entries()) {
    if (c > modeCount) { modeCount = c; modeVal = v; }
  }

  if (modeCount < 3) return [];
  if (clamp20_99(modeVal * sf) < 40) return []; // intentionally in F/G range

  return SECONDARY_ATTRS.filter((_, i) => vals[i] === modeVal);
}

/**
 * Derive a flat secondary attr value in SCALED space from the given primary
 * group average. Returns a raw value after dividing back by sf.
 *
 * factor:   correlation strength (0.80–0.85)
 * base:     additive floor contribution (5–10)
 * noise:    seeded ±6 in scaled space
 * cap:      89 (no S grade purely from derivation)
 */
function deriveSecondaryRaw(
  primaryGroupScaled: number,
  factor: number,
  base: number,
  noise: number,
  sf: number,
): number {
  const scaledTarget = clamp(primaryGroupScaled * factor + base + noise, 20, 89);
  return clamp(Math.round(scaledTarget / sf), 20, 99);
}

// ── Patch accumulator ─────────────────────────────────────────────────────────
interface PatchEntry {
  firstName: string;
  lastName: string;
  team: string;
  attrChanges: Record<string, { oldRaw: number; newRaw: number }>;
  oldScaledOVR: number;
  newScaledOVR: number;
  passes: string[];
}

const patches: PatchEntry[] = [];

/**
 * Max raw-unit change per secondary attr per player.
 * Prevents runaway swings while still applying meaningful variance.
 * Lower-prestige teams can see up to ~8 average OVR shift (a legitimate
 * correction of over-calibrated flat secondaries, not a regression).
 */
const SECONDARY_DELTA_CAP = 8;

// ── Main loop ─────────────────────────────────────────────────────────────────
for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;

  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;

    const skipKey = `${rawPlayer.firstName}|${rawPlayer.lastName}`;
    if (SKIP_PLAYERS.has(skipKey)) continue;

    const playerKey = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const hash = hashPlayer(rawPlayer.firstName, rawPlayer.lastName, team);

    // We accumulate raw-value overrides here; start from the file values.
    const workingRaw: Record<string, number> = {};
    for (const attr of [...SCALE_ATTRS]) {
      const v = rawPlayer[attr];
      if (typeof v === "number") workingRaw[attr] = v;
    }

    const passes: string[] = [];

    // ── Pass 0: Ceiling overrides ────────────────────────────────────────────
    const ceilOverride = CEILING_OVERRIDES[playerKey];
    if (ceilOverride) {
      for (const [attr, targetRaw] of Object.entries(ceilOverride)) {
        const current = workingRaw[attr] ?? 0;
        if (targetRaw > current) {
          workingRaw[attr] = targetRaw as number;
          if (!passes.includes("ceiling")) passes.push("ceiling");
        }
      }
    }

    // ── Pass 2: Uniform primary variance ────────────────────────────────────
    const h = workingRaw["hitForAvg"] ?? 0;
    const p = workingRaw["power"] ?? 0;
    if (h >= 20 && h <= 30 && p >= 20 && p <= 30 && Math.abs(h - p) <= 3) {
      const avg = (h + p) / 2;
      const offset = 4 + seededRange(hash, 0, 0, 4); // 4–8
      const isHitterType = (hash % 2) === 0;
      const newH = isHitterType ? Math.round(avg + offset) : Math.round(avg - offset);
      const newP = isHitterType ? Math.round(avg - offset) : Math.round(avg + offset);
      workingRaw["hitForAvg"] = clamp(newH, 20, 99);
      workingRaw["power"]     = clamp(newP, 20, 99);
      passes.push("primary-variance");
    }

    // ── Pass 1: Flat secondary re-derivation ─────────────────────────────────
    // Build a temporary RealPlayer from workingRaw (post-ceiling, post-spread)
    const tempRaw = { ...rawPlayer, ...workingRaw } as RealPlayer;
    const flatAttrs = flatSecondaryGroup(tempRaw, sf);
    if (flatAttrs.length > 0) {
      // Scaled primary group averages (using workingRaw after ceiling/spread)
      const hitScaled   = clamp20_99((workingRaw["hitForAvg"] ?? 0) * sf);
      const powScaled   = clamp20_99((workingRaw["power"]     ?? 0) * sf);
      const spdScaled   = clamp20_99((workingRaw["speed"]     ?? 0) * sf);
      const armScaled   = clamp20_99((workingRaw["arm"]       ?? 0) * sf);
      const fldScaled   = clamp20_99((workingRaw["fielding"]  ?? 0) * sf);
      const errScaled   = clamp20_99((workingRaw["errorResistance"] ?? 0) * sf);

      const hitGroupAvg = (hitScaled + powScaled) / 2;
      const defGroupAvg = (armScaled + fldScaled + errScaled) / 3;

      const DERIVATIONS: Record<string, { groupAvg: number; factor: number; base: number; noiseSlot: number }> = {
        clutch:   { groupAvg: hitGroupAvg, factor: 0.82, base: 10, noiseSlot: 1 },
        vsLHP:    { groupAvg: hitScaled,   factor: 0.80, base: 8,  noiseSlot: 2 },
        stealing: { groupAvg: spdScaled,   factor: 0.85, base: 5,  noiseSlot: 3 },
        running:  { groupAvg: spdScaled,   factor: 0.82, base: 5,  noiseSlot: 4 },
        grit:     { groupAvg: defGroupAvg, factor: 0.80, base: 8,  noiseSlot: 5 },
        throwing: { groupAvg: armScaled,   factor: 0.85, base: 5,  noiseSlot: 6 },
      };

      for (const attr of flatAttrs) {
        const key = attr as string;
        const def = DERIVATIONS[key];
        if (!def) continue;

        const noise = seededRange(hash, def.noiseSlot, -6, 6);
        const derivedRaw = deriveSecondaryRaw(def.groupAvg, def.factor, def.base, noise, sf);
        // Cap the delta so no single attr moves more than SECONDARY_DELTA_CAP raw units.
        // This prevents extreme OVR swings on lower-prestige teams whose flat secondaries
        // were slightly over-calibrated but don't need a full re-anchor.
        const oldVal = workingRaw[key] ?? 0;
        const cappedRaw = clamp(
          derivedRaw,
          oldVal - SECONDARY_DELTA_CAP,
          oldVal + SECONDARY_DELTA_CAP,
        );
        workingRaw[key] = cappedRaw;
      }
      passes.push("flat-secondaries");
    }

    // ── Build final patch (only changed attrs) ───────────────────────────────
    if (passes.length === 0) continue;

    const attrChanges: Record<string, { oldRaw: number; newRaw: number }> = {};
    for (const [attr, newRaw] of Object.entries(workingRaw)) {
      const oldRaw = (rawPlayer[attr as keyof RealPlayer] as number) ?? 0;
      if (newRaw !== oldRaw) {
        attrChanges[attr] = { oldRaw, newRaw };
      }
    }
    if (Object.keys(attrChanges).length === 0) continue;

    // OVR before/after (using scaled values)
    const scaledBefore = applyScaleFactor(rawPlayer, sf);
    const scaledAfterRaw = { ...rawPlayer, ...workingRaw } as RealPlayer;
    const scaledAfter  = applyScaleFactor(scaledAfterRaw, sf);

    patches.push({
      firstName: rawPlayer.firstName,
      lastName:  rawPlayer.lastName,
      team,
      attrChanges,
      oldScaledOVR: calculateOVR(scaledBefore),
      newScaledOVR: calculateOVR(scaledAfter),
      passes,
    });
  }
}

// ── Team OVR constraint check ─────────────────────────────────────────────────
const patchLookup = new Map<string, PatchEntry>(
  patches.map(p => [`${p.firstName}|${p.lastName}|${p.team}`, p])
);

interface TeamOVRStats {
  beforeSum: number;
  afterSum:  number;
  count:     number;
}

const teamStats = new Map<string, TeamOVRStats>();

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;
    const key = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const patch = patchLookup.get(key);

    const scaledBefore = applyScaleFactor(rawPlayer, sf);
    const beforeOVR    = calculateOVR(scaledBefore);

    let afterOVR = beforeOVR;
    if (patch) {
      const afterRaw    = { ...rawPlayer } as Record<string, unknown>;
      for (const [attr, { newRaw }] of Object.entries(patch.attrChanges)) {
        afterRaw[attr] = newRaw;
      }
      const scaledAfter = applyScaleFactor(afterRaw as RealPlayer, sf);
      afterOVR          = calculateOVR(scaledAfter);
    }

    if (!teamStats.has(team)) teamStats.set(team, { beforeSum: 0, afterSum: 0, count: 0 });
    const ts = teamStats.get(team)!;
    ts.beforeSum += beforeOVR;
    ts.afterSum  += afterOVR;
    ts.count++;
  }
}

// ── Console summary ───────────────────────────────────────────────────────────
const passCounts: Record<string, number> = {};
for (const p of patches) {
  for (const pass of p.passes) passCounts[pass] = (passCounts[pass] ?? 0) + 1;
}

console.log(`\nPatches to apply: ${patches.length} hitters`);
console.log("Pass breakdown:");
for (const [pass, count] of Object.entries(passCounts)) {
  console.log(`  ${pass.padEnd(18)} ${count}`);
}

const OVR_SHIFT_WARN  = 4;  // teams above this get a ⚠ flag
const OVR_SHIFT_ERROR = 10; // teams above this abort — indicates a script bug, not a correction
const violations: string[] = [];

console.log(`\n=== Team OVR shift (hitter avg, showing |shift| > 0.5) ===`);
for (const [team, ts] of teamStats.entries()) {
  const beforeAvg = ts.beforeSum / ts.count;
  const afterAvg  = ts.afterSum  / ts.count;
  const shift     = afterAvg - beforeAvg;
  if (Math.abs(shift) > 0.5) {
    const flag = Math.abs(shift) > OVR_SHIFT_WARN ? (Math.abs(shift) > OVR_SHIFT_ERROR ? "❌" : "⚠") : "";
    console.log(`  ${team.padEnd(22)} ${beforeAvg.toFixed(1)} → ${afterAvg.toFixed(1)}  (${shift >= 0 ? "+" : ""}${shift.toFixed(1)}) ${flag}`);
  }
  if (Math.abs(shift) > OVR_SHIFT_ERROR) {
    violations.push(`${team}: avg OVR shift ${shift.toFixed(1)} exceeds ±${OVR_SHIFT_ERROR} limit`);
  }
}

if (violations.length === 0) {
  console.log(`  ✅ No team exceeded ±${OVR_SHIFT_ERROR} OVR (abort threshold).`);
} else {
  console.log("\n⚠  OVR constraint violations:");
  violations.forEach(v => console.log("  - " + v));
}

// ── Ceiling players summary ───────────────────────────────────────────────────
const ceilingPatches = patches.filter(p => p.passes.includes("ceiling"));
if (ceilingPatches.length > 0) {
  console.log(`\n=== Ceiling-override players (${ceilingPatches.length}) ===`);
  for (const p of ceilingPatches) {
    const changes = Object.entries(p.attrChanges)
      .filter(([, c]) => c.newRaw > c.oldRaw)
      .map(([a, c]) => `${a}: ${c.oldRaw}→${c.newRaw}`)
      .join(", ");
    console.log(`  ${p.firstName} ${p.lastName} (${p.team}): ${changes}`);
  }
}

// ── Sample changed players ────────────────────────────────────────────────────
const flatSamplePatches = patches.filter(p => p.passes.includes("flat-secondaries")).slice(0, 12);
if (flatSamplePatches.length > 0) {
  console.log(`\n=== Sample flat-secondary fixes (first 12) ===`);
  for (const p of flatSamplePatches) {
    const secChanges = Object.entries(p.attrChanges)
      .filter(([a]) => (SECONDARY_ATTRS as string[]).includes(a))
      .map(([a, c]) => `${a}: ${c.oldRaw}→${c.newRaw}`)
      .join(", ");
    console.log(`  ${p.firstName} ${p.lastName} (${p.team}): ${secChanges}`);
  }
}

if (DRY_RUN || violations.length > 0) {
  if (DRY_RUN) console.log("\n[DRY RUN] No files written.");
  if (violations.length > 0) console.log("\nAborting due to OVR constraint violations.");
  process.exit(violations.length > 0 ? 1 : 0);
}

// ── Write patches to source files ─────────────────────────────────────────────
const ROSTER_FILES = [
  "server/secBatch1.ts", "server/secBatch2.ts", "server/secBatch3.ts",
  "server/accRostersBatch1.ts", "server/accRostersBatch2.ts", "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts", "server/bigTenBatch2.ts", "server/bigTenBatch3.ts",
  "server/big12Rosters.ts", "server/pac12Rosters.ts", "server/mwcRosters.ts",
  "server/aacRosters.ts", "server/sunBeltRosters.ts", "server/wccRosters.ts",
  "server/bigWestRosters.ts", "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts", "server/hbcuRosters.ts",
];

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
    // If the attr appears multiple times with same old value, replace all
  }

  return before + block + after;
}

const patchesByTeam = new Map<string, PatchEntry[]>();
for (const patch of patches) {
  if (!patchesByTeam.has(patch.team)) patchesByTeam.set(patch.team, []);
  patchesByTeam.get(patch.team)!.push(patch);
}

let totalFilesChanged = 0;
let totalPatched = 0;
let totalNotFound = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  let fileChanged      = false;
  let filePatched      = 0;
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
        filePatched++;
        totalPatched++;
      }
    }

    if (sectionStr !== origSection) {
      content     = content.slice(0, section.start) + sectionStr + content.slice(section.end);
      fileChanged = true;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  ✓ ${relPath}: ${filePatched} player(s) patched`);
    totalFilesChanged++;
  }
}

console.log(`\nDone. Files changed: ${totalFilesChanged}, players patched: ${totalPatched}, not found: ${totalNotFound}`);

if (violations.length > 0) process.exit(1);
