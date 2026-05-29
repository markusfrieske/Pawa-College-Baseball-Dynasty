/**
 * fix-speed89-cluster.ts
 *
 * Eliminates the speed (and arm/fielding/errorResistance) cap-cluster at
 * display value 89 by setting every affected hitter to a seeded value in
 * [74, 87].  Caused originally by cross-pool centering in inject-hitter-
 * variance.ts pushing Pool-B players up to the 89 ceiling.
 *
 * Algorithm
 * ─────────
 * 1. For each position player whose display value for speed/arm/fielding/
 *    errorResistance is ≥ 89 (i.e. raw × sf rounds to ≥ 89 before the 99
 *    game cap):
 *      · Generate a deterministic target in [74, 87] via seeded hash.
 *      · Convert to raw: newRaw = round(target / sf), clamped [20, 99].
 *      · Verify round-trip: round(newRaw × sf) < 89 (shift by -1 if not).
 *
 * 2. Compute per-team average OVR shift using the capped-89 metric
 *    (attributes above 89 are treated as 89 for comparison, matching the
 *    actual in-game display cap).
 *
 * 3. If |teamAvgShift| > OVR_LIMIT (14): proportionally scale ALL deltas
 *    for that team so the shift lands at ±14.  Scaled deltas remain
 *    negative, so every targeted attr still drops below 89.
 *
 * 4. Patches are written to the 19 roster source files.  Dry-run mode
 *    prints changes without writing.
 *
 * Usage
 * ─────
 *   npx tsx scripts/fix-speed89-cluster.ts [--dry-run]
 *
 * Run AFTER inject-hitter-variance.ts.  Not idempotent — running twice
 * would attempt to lower already-decapped values (harmless but wasteful).
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
const DECAP_ATTRS = ["speed", "arm", "fielding", "errorResistance"] as const;
type DecapAttr = typeof DECAP_ATTRS[number];

// OVR limit per team (average across all hitters).  Teams exceeding this get
// proportionally scaled — all deltas remain negative so every targeted attr
// still drops below 89.  Hard abort at 40 catches genuine script bugs only.
const OVR_LIMIT    = 14;
const OVR_ABORT    = 40;

// Target range — using 87 as the upper bound (not 88) to give a 1-unit
// rounding buffer so that round(newRaw × sf) < 89 is guaranteed.
const TARGET_LO    = 74;
const TARGET_HI    = 87;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp20_99(v: number): number {
  return clamp(Math.round(v), 20, 99);
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededRange(hash: number, slot: number, lo: number, hi: number): number {
  const mixed = ((hash * 1664525 + 1013904223 * (slot + 1)) >>> 0);
  return lo + (mixed % (hi - lo + 1));
}

/** Cap each display attr at 89 for OVR comparison (matches game display). */
const CAPPED_ATTRS = new Set<string>(["speed","arm","fielding","errorResistance",
  "hitForAvg","power","stealing","clutch","vsLHP","running","grit","throwing"]);

function applyScaleFactorCapped89(player: RealPlayer, sf: number): RealPlayer {
  const out: Record<string, unknown> = { ...player };
  for (const key of Object.keys(out)) {
    const v = (player as Record<string, unknown>)[key];
    if (typeof v !== "number") continue;
    const scaled = clamp20_99(v * sf);
    out[key] = CAPPED_ATTRS.has(key) ? Math.min(scaled, 89) : scaled;
  }
  return out as RealPlayer;
}

// ── Collect patches ───────────────────────────────────────────────────────────
interface AttrPatch {
  oldRaw:    number;
  newRaw:    number;
  oldDisplay: number;  // capped-89 display before patch
  newDisplay: number;  // capped-89 display after patch (< 89)
}

interface PlayerPatch {
  firstName: string;
  lastName:  string;
  team:      string;
  attrs:     Partial<Record<DecapAttr, AttrPatch>>;
}

// Step 1: compute desired changes ignoring OVR constraint.
const rawPatches = new Map<string, PlayerPatch>(); // key = "first|last|team"

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;

  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;

    const playerKey = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
    const baseHash  = hashStr(`DECAP|${playerKey}`);
    let   slot      = 0;

    const attrs: Partial<Record<DecapAttr, AttrPatch>> = {};

    for (const attr of DECAP_ATTRS) {
      const rawVal   = rawPlayer[attr] as number | undefined;
      if (rawVal == null) continue;

      const scaledRv = clamp20_99(rawVal * sf);
      if (scaledRv < 89) continue;   // not in the 89-cap cluster

      // Generate seeded target display value in [74, 87]
      const targetDisplay = seededRange(baseHash, slot++, TARGET_LO, TARGET_HI);
      let   newRaw        = clamp(Math.round(targetDisplay / sf), 20, 99);

      // Safety: verify round-trip stays < 89; nudge down if needed.
      let roundTrip = clamp20_99(newRaw * sf);
      while (roundTrip >= 89 && newRaw > 20) {
        newRaw--;
        roundTrip = clamp20_99(newRaw * sf);
      }

      if (roundTrip >= 89) continue; // can't bring below 89 — skip

      attrs[attr] = {
        oldRaw:     rawVal,
        newRaw,
        oldDisplay: 89,              // was at or above 89 in display
        newDisplay: roundTrip,       // verified < 89
      };
    }

    if (Object.keys(attrs).length === 0) continue;
    rawPatches.set(playerKey, { firstName: rawPlayer.firstName, lastName: rawPlayer.lastName, team, attrs });
  }
}

// Step 2: compute per-team OVR shift and apply proportional scaling.
const finalPatches: PlayerPatch[] = [];
const violations: string[] = [];

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  const hitters = players.filter(p => !PITCHER_POSITIONS.has(p.position));
  if (hitters.length === 0) continue;

  // Collect this team's raw patches
  const teamPatches = hitters
    .map(p => rawPatches.get(`${p.firstName}|${p.lastName}|${team}`))
    .filter((p): p is PlayerPatch => p !== undefined);

  if (teamPatches.length === 0) continue;

  // Build a lookup for quick attr change access
  const patchLookup = new Map<string, PlayerPatch>(
    teamPatches.map(p => [`${p.firstName}|${p.lastName}`, p])
  );

  // Compute before/after OVR for each hitter using capped-89 metric
  let totalShift = 0;
  for (const rawPlayer of hitters) {
    const patch = patchLookup.get(`${rawPlayer.firstName}|${rawPlayer.lastName}`);
    const beforeOVR = calculateOVR(applyScaleFactorCapped89(rawPlayer, sf));
    let   afterOVR  = beforeOVR;

    if (patch) {
      const afterRaw: Record<string, unknown> = { ...rawPlayer };
      for (const [a, { newRaw }] of Object.entries(patch.attrs)) {
        afterRaw[a] = newRaw;
      }
      afterOVR = calculateOVR(applyScaleFactorCapped89(afterRaw as RealPlayer, sf));
    }
    totalShift += (afterOVR - beforeOVR);
  }

  const avgShift = totalShift / hitters.length;

  if (Math.abs(avgShift) <= OVR_LIMIT) {
    // Within budget — accept as-is
    finalPatches.push(...teamPatches);
    continue;
  }

  if (Math.abs(avgShift) > OVR_ABORT) {
    violations.push(`${team}: avg OVR shift ${avgShift.toFixed(1)} exceeds abort threshold ±${OVR_ABORT}`);
    continue;
  }

  // Proportionally scale all display deltas so |avgShift| = OVR_LIMIT.
  // Since all deltas are negative (display goes down), the sign is preserved.
  const scale = OVR_LIMIT / Math.abs(avgShift);

  const scaledTeamPatches: PlayerPatch[] = [];
  for (const patch of teamPatches) {
    const scaledAttrs: Partial<Record<DecapAttr, AttrPatch>> = {};

    for (const [attr, patchData] of Object.entries(patch.attrs) as [DecapAttr, AttrPatch][]) {
      const { oldDisplay, newDisplay, oldRaw } = patchData;
      const delta            = newDisplay - oldDisplay;               // negative
      const scaledDelta      = delta * scale;
      const scaledDisplay    = Math.round(oldDisplay + scaledDelta);  // < 89

      let newRaw = clamp(Math.round(scaledDisplay / sf), 20, 99);
      // Verify round-trip < 89; nudge down if needed
      let roundTrip = clamp20_99(newRaw * sf);
      while (roundTrip >= 89 && newRaw > 20) { newRaw--; roundTrip = clamp20_99(newRaw * sf); }

      if (roundTrip >= 89) continue;  // still can't bring below 89 — skip attr

      scaledAttrs[attr] = { oldRaw, newRaw, oldDisplay, newDisplay: roundTrip };
    }

    if (Object.keys(scaledAttrs).length > 0) {
      scaledTeamPatches.push({ ...patch, attrs: scaledAttrs });
    }
  }
  finalPatches.push(...scaledTeamPatches);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const attrCounts: Record<string, number> = {};
for (const p of finalPatches) {
  for (const attr of Object.keys(p.attrs)) {
    attrCounts[attr] = (attrCounts[attr] ?? 0) + 1;
  }
}

console.log(`\nDecap patches: ${finalPatches.length} players`);
for (const [attr, cnt] of Object.entries(attrCounts)) {
  console.log(`  ${attr.padEnd(20)} ${cnt}`);
}

if (violations.length > 0) {
  console.error("\nOVR violations (teams skipped):");
  for (const v of violations) console.error(`  ❌ ${v}`);
} else {
  console.log("  ✅ No teams violated ±15 OVR abort threshold.");
}

// Speed=89 count before (informational)
{
  let before = 0;
  const patchMap = new Map(finalPatches.map(p => [`${p.firstName}|${p.lastName}|${p.team}`, p]));
  for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
    const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
    for (const p of players) {
      if (PITCHER_POSITIONS.has(p.position)) continue;
      const scaled = clamp20_99((p.speed as number ?? 0) * sf);
      if (scaled >= 89) before++;
    }
  }
  let after = before;
  for (const patch of finalPatches) {
    if (patch.attrs.speed) after--; // one 89+ speed will drop below 89
  }
  console.log(`\nSpeed≥89 count:  before=${before}  after≈${after}  (target ≤ 80)`);
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] No files written.");
  process.exit(0);
}

if (violations.length > 0) {
  console.error("\nAborting — fix OVR violations before writing.");
  process.exit(1);
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

function patchPlayerInSection(
  section: string,
  patch: PlayerPatch,
): string | null {
  const fnEsc   = escapeRe(patch.firstName);
  const lnEsc   = escapeRe(patch.lastName);
  const blockRe = new RegExp(`\\{\\s*firstName:\\s*"${fnEsc}"\\s*,\\s*lastName:\\s*"${lnEsc}"`);
  const blockMatch = blockRe.exec(section);
  if (!blockMatch) return null;

  let depth = 0, blockEnd = blockMatch.index;
  for (let i = blockMatch.index; i < section.length; i++) {
    if (section[i] === "{") depth++;
    else if (section[i] === "}") {
      depth--;
      if (depth === 0) { blockEnd = i + 1; break; }
    }
  }

  let block       = section.slice(blockMatch.index, blockEnd);
  const before    = section.slice(0, blockMatch.index);
  const after     = section.slice(blockEnd);

  for (const [attr, { oldRaw, newRaw }] of Object.entries(patch.attrs)) {
    const attrRe = new RegExp(`(\\b${escapeRe(attr)}:\\s*)${oldRaw}\\b`);
    const replaced = block.replace(attrRe, `$1${newRaw}`);
    if (replaced !== block) block = replaced;
  }

  return before + block + after;
}

const patchesByTeam = new Map<string, PlayerPatch[]>();
for (const patch of finalPatches) {
  if (!patchesByTeam.has(patch.team)) patchesByTeam.set(patch.team, []);
  patchesByTeam.get(patch.team)!.push(patch);
}

let totalFilesChanged = 0, totalPatched = 0, totalNotFound = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, "utf-8");
  let changed = false;

  for (const [team, teamPatches] of patchesByTeam.entries()) {
    const section = findTeamSection(content, team);
    if (!section) continue;

    let sectionStr = content.slice(section.start, section.end);
    let sectionChanged = false;

    for (const patch of teamPatches) {
      const patched = patchPlayerInSection(sectionStr, patch);
      if (patched !== null && patched !== sectionStr) {
        sectionStr = patched;
        sectionChanged = true;
        totalPatched++;
      } else if (patched === null) {
        totalNotFound++;
      }
    }

    if (sectionChanged) {
      content = content.slice(0, section.start) + sectionStr + content.slice(section.end);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf-8");
    const patchCount = Array.from(patchesByTeam.values()).flat()
      .filter(p => {
        const s = findTeamSection(content, p.team);
        return s !== null;
      }).length;
    console.log(`  ✓ ${relPath}`);
    totalFilesChanged++;
  }
}

console.log(`\nDone. Files changed: ${totalFilesChanged}, players patched: ${totalPatched}, not found: ${totalNotFound}`);
