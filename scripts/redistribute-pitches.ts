/**
 * redistribute-pitches.ts
 *
 * Redistributes slider and curveball usage into rarer pitch types across all
 * real pitchers, in deterministic roster-file order (no randomness).
 *
 * Conversion rules:
 *   - First 28% of SL-having pitchers: SL → SNK
 *   - Next  10% of SL-having pitchers: SL → CT   (28-38%)
 *   - First 25% of CB-having pitchers: CB → SPL
 *   - Next  10% of CB-having pitchers: CB → 2S    (25-35%)
 *
 * Level transfer: move source pitch level to target (min(7, existing+source)).
 * 2S is binary: converting CB→2S always sets pitch2S=1 regardless of CB level.
 * OVR cap applied after conversion: ≤400 OVR → max 4; ≤500 OVR → max 5.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ─── Source files to update ────────────────────────────────────────────────────
const SOURCE_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/pac12Rosters.ts",
  "server/mwcRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/sunBeltRosters.ts",
  "server/bigWestRosters.ts",
  "server/hbcuRosters.ts",
  "server/moValleyRosters.ts",
  "server/big12Rosters.ts",
  "server/aacRosters.ts",
  "server/wccRosters.ts",
];

// ─── Pitch value type ──────────────────────────────────────────────────────────
interface NewPitchValues {
  pitch2S: number;
  pitchSL: number;
  pitchCB: number;
  pitchCT: number;
  pitchSNK: number;
  pitchSPL: number;
}

// ─── Step 1: Count before ─────────────────────────────────────────────────────
let beforeSL = 0, beforeCB = 0, beforeCT = 0, beforeSNK = 0, beforeSPL = 0, before2S = 0;
let totalPitchers = 0;

for (const [, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const p of players) {
    if (!PITCHER_POSITIONS.has(p.position)) continue;
    totalPitchers++;
    if ((p.pitchSL ?? 0) > 0) beforeSL++;
    if ((p.pitchCB ?? 0) > 0) beforeCB++;
    if ((p.pitchCT ?? 0) > 0) beforeCT++;
    if ((p.pitchSNK ?? 0) > 0) beforeSNK++;
    if ((p.pitchSPL ?? 0) > 0) beforeSPL++;
    if ((p.pitch2S ?? 0) > 0) before2S++;
  }
}

console.log(`\n── Before redistribution (${totalPitchers} pitchers) ──`);
console.log(`  Slider:       ${beforeSL} (${pct(beforeSL, totalPitchers)}%)`);
console.log(`  Curveball:    ${beforeCB} (${pct(beforeCB, totalPitchers)}%)`);
console.log(`  Cutter:       ${beforeCT} (${pct(beforeCT, totalPitchers)}%)`);
console.log(`  Sinker:       ${beforeSNK} (${pct(beforeSNK, totalPitchers)}%)`);
console.log(`  Forkball/SFF: ${beforeSPL} (${pct(beforeSPL, totalPitchers)}%)`);
console.log(`  2-Seam:       ${before2S} (${pct(before2S, totalPitchers)}%)`);

function pct(n: number, total: number): string {
  return ((n / total) * 100).toFixed(1);
}

// ─── Step 2: Collect ordered pitcher lists ────────────────────────────────────
interface PitcherEntry {
  teamName: string;
  player: RealPlayer;
}

const slPitchers: PitcherEntry[] = [];
const cbPitchers: PitcherEntry[] = [];

for (const [teamName, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const p of players) {
    if (!PITCHER_POSITIONS.has(p.position)) continue;
    if ((p.pitchSL ?? 0) > 0) slPitchers.push({ teamName, player: p });
    if ((p.pitchCB ?? 0) > 0) cbPitchers.push({ teamName, player: p });
  }
}

// ─── Step 3: Assign conversion indices ───────────────────────────────────────
const slToSNKEnd = Math.floor(0.28 * slPitchers.length);
const slToCTEnd = Math.floor(0.38 * slPitchers.length);
const cbToSPLEnd = Math.floor(0.25 * cbPitchers.length);
const cbTo2SEnd = Math.floor(0.35 * cbPitchers.length);

console.log(`\n── Conversion targets ──`);
console.log(`  SL→SNK: first ${slToSNKEnd} of ${slPitchers.length} SL pitchers`);
console.log(`  SL→CT:  next  ${slToCTEnd - slToSNKEnd} (idx ${slToSNKEnd}-${slToCTEnd - 1})`);
console.log(`  CB→SPL: first ${cbToSPLEnd} of ${cbPitchers.length} CB pitchers`);
console.log(`  CB→2S:  next  ${cbTo2SEnd - cbToSPLEnd} (idx ${cbToSPLEnd}-${cbTo2SEnd - 1})`);

// ─── Step 4: Build conversion map ─────────────────────────────────────────────
// Key: "firstName::lastName" (unique per validate-duplicates)
const conversionMap = new Map<string, NewPitchValues>();

function playerKey(p: RealPlayer): string {
  return `${p.firstName}::${p.lastName}`;
}

function getOrInit(p: RealPlayer): NewPitchValues {
  const key = playerKey(p);
  if (!conversionMap.has(key)) {
    conversionMap.set(key, {
      pitch2S:  p.pitch2S  ?? 0,
      pitchSL:  p.pitchSL  ?? 0,
      pitchCB:  p.pitchCB  ?? 0,
      pitchCT:  p.pitchCT  ?? 0,
      pitchSNK: p.pitchSNK ?? 0,
      pitchSPL: p.pitchSPL ?? 0,
    });
  }
  return conversionMap.get(key)!;
}

// SL conversions
for (let i = 0; i < slPitchers.length; i++) {
  const { player: p } = slPitchers[i];
  const vals = getOrInit(p);
  if (i < slToSNKEnd) {
    // SL → SNK: move level
    vals.pitchSNK = Math.min(7, vals.pitchSNK + vals.pitchSL);
    vals.pitchSL = 0;
  } else if (i < slToCTEnd) {
    // SL → CT: move level
    vals.pitchCT = Math.min(7, vals.pitchCT + vals.pitchSL);
    vals.pitchSL = 0;
  }
}

// CB conversions
for (let i = 0; i < cbPitchers.length; i++) {
  const { player: p } = cbPitchers[i];
  const vals = getOrInit(p);
  if (i < cbToSPLEnd) {
    // CB → SPL: move level
    vals.pitchSPL = Math.min(7, vals.pitchSPL + vals.pitchCB);
    vals.pitchCB = 0;
  } else if (i < cbTo2SEnd) {
    // CB → 2S: binary, always 1
    vals.pitch2S = 1;
    vals.pitchCB = 0;
  }
}

// ─── Step 5: Apply OVR pitch cap ──────────────────────────────────────────────
// Build a quick lookup for raw players
const rawPlayerMap = new Map<string, RealPlayer>();
for (const [, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const p of players) {
    rawPlayerMap.set(playerKey(p), p);
  }
}

let capApplied = 0;

for (const [key, vals] of conversionMap) {
  const player = rawPlayerMap.get(key);
  if (!player) continue;

  // Compute OVR with the new pitch values substituted in
  const ovr = calculateOVR(player);

  let cap = 7;
  if (ovr <= 400) cap = 4;
  else if (ovr <= 500) cap = 5;

  if (cap < 7) {
    let changed = false;
    for (const field of ["pitchSL", "pitchCB", "pitchCT", "pitchSNK", "pitchSPL"] as const) {
      if (vals[field] > cap) {
        vals[field] = cap;
        changed = true;
      }
    }
    if (changed) capApplied++;
  }
}

console.log(`  OVR cap applied to: ${capApplied} pitchers`);

// ─── Step 6: Update source files ─────────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let filesModified = 0;
let playersUpdated = 0;

for (const relPath of SOURCE_FILES) {
  const filePath = join(ROOT, relPath);
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    console.warn(`  [skip] ${relPath} not found`);
    continue;
  }

  let modified = false;

  for (const [key, newVals] of conversionMap) {
    const [firstName, lastName] = key.split("::");

    // Skip if this player doesn't appear in this file
    if (!content.includes(`firstName: "${firstName}"`) && !content.includes(`firstName:"${firstName}"`)) continue;
    if (!content.includes(`lastName: "${lastName}"`) && !content.includes(`lastName:"${lastName}"`)) continue;

    const escapedFirst = escapeRegex(firstName);
    const escapedLast = escapeRegex(lastName);

    // Match: firstName: "X" ... lastName: "Y" (or reverse), then pitchMix(1, [...])
    // The player block is within ~800 chars from firstName to pitchMix
    const pattern = new RegExp(
      `(firstName:\\s*"${escapedFirst}",\\s*lastName:\\s*"${escapedLast}"[\\s\\S]{0,800}?)` +
      `(\\.\\.\\.pitchMix\\(1,\\s*\\[)([^\\]]+)(\\])`,
      "g"
    );

    const newContent = content.replace(pattern, (match, prefix, pitchStart, arrayContent, bracketEnd) => {
      // Parse original array: [2S, SL, CB, CH, CT, SNK, SPL]
      const parts = arrayContent.split(",").map((s: string) => parseInt(s.trim(), 10));
      const origCH = Number.isFinite(parts[3]) ? parts[3] : 0; // preserve CH

      const newArray = [
        newVals.pitch2S,
        newVals.pitchSL,
        newVals.pitchCB,
        origCH,
        newVals.pitchCT,
        newVals.pitchSNK,
        newVals.pitchSPL,
      ];

      return `${prefix}${pitchStart}${newArray.join(", ")}${bracketEnd}`;
    });

    if (newContent !== content) {
      content = newContent;
      modified = true;
      playersUpdated++;
    }
  }

  if (modified) {
    writeFileSync(filePath, content, "utf8");
    filesModified++;
    console.log(`  ✓ Updated ${relPath}`);
  }
}

console.log(`\n  ${playersUpdated} pitchers updated across ${filesModified} files`);

// ─── Step 7: Report expected after-counts ────────────────────────────────────
let afterSL = 0, afterCB = 0, afterCT = 0, afterSNK = 0, afterSPL = 0, after2S = 0;

for (const [, vals] of conversionMap) {
  if (vals.pitchSL  > 0) afterSL++;
  if (vals.pitchCB  > 0) afterCB++;
  if (vals.pitchCT  > 0) afterCT++;
  if (vals.pitchSNK > 0) afterSNK++;
  if (vals.pitchSPL > 0) afterSPL++;
  if (vals.pitch2S  > 0) after2S++;
}

// Pitchers NOT in conversionMap kept their original values
for (const [, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const p of players) {
    if (!PITCHER_POSITIONS.has(p.position)) continue;
    const key = playerKey(p);
    if (conversionMap.has(key)) continue; // already counted above
    if ((p.pitchSL  ?? 0) > 0) afterSL++;
    if ((p.pitchCB  ?? 0) > 0) afterCB++;
    if ((p.pitchCT  ?? 0) > 0) afterCT++;
    if ((p.pitchSNK ?? 0) > 0) afterSNK++;
    if ((p.pitchSPL ?? 0) > 0) afterSPL++;
    if ((p.pitch2S  ?? 0) > 0) after2S++;
  }
}

console.log(`\n── After redistribution (expected) ──`);
console.log(`  Slider:       ${beforeSL} → ${afterSL} (${pct(afterSL, totalPitchers)}%)`);
console.log(`  Curveball:    ${beforeCB} → ${afterCB} (${pct(afterCB, totalPitchers)}%)`);
console.log(`  Cutter:       ${beforeCT} → ${afterCT} (${pct(afterCT, totalPitchers)}%)`);
console.log(`  Sinker:       ${beforeSNK} → ${afterSNK} (${pct(afterSNK, totalPitchers)}%)`);
console.log(`  Forkball/SFF: ${beforeSPL} → ${afterSPL} (${pct(afterSPL, totalPitchers)}%)`);
console.log(`  2-Seam:       ${before2S} → ${after2S} (${pct(after2S, totalPitchers)}%)`);
console.log(`\n✓ Redistribution complete. Run validate-all to confirm.\n`);
