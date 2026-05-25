/**
 * redistribute-pitches.ts — Task #591
 *
 * Expands all pitchMix() 7-element calls to 10-element calls, adding:
 *   index 7 = FK  (Forkball, binary 0/1 like CH)
 *   index 8 = SFF (Split-Finger Fastball, binary 0/1 like CH)
 *   index 9 = SHU (Shuuto, 0-7 like SNK)
 *
 * Full array: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
 *
 * Redistribution rules (deterministic, counter-based):
 *   Step 2 — CH → FK/SFF:
 *     For each pitcher with CH=1 (global chCounter):
 *       chCounter % 5 === 1  → CH removed, FK=1  (~20%)
 *       chCounter % 5 === 2  → CH removed, SFF=1  (~20%)
 *       otherwise            → CH unchanged       (~60%)
 *
 *   Step 3 — SNK → SHU:
 *     For each pitcher with SNK>0 (global snkCounter):
 *       snkCounter % 7 === 0 → SNK removed, SHU = original SNK level (~14%)
 *
 *   Step 4a — SL augmentation:
 *     For each pitcher without SL (noSlCounter):
 *       noSlCounter % 9 === 0 → SL = 3 added
 *
 *   Step 4b — CB augmentation:
 *     For each pitcher without CB (noCbCounter):
 *       noCbCounter % 13 === 0 → CB = 3 added
 *
 *   Step 4c — 2S augmentation:
 *     For each pitcher without 2S (no2SCounter):
 *       no2SCounter % 50 === 0 → 2S = 1 added
 *
 * FK and SFF are binary (clamped to 0 or 1) like CH.
 * SHU inherits the exact SNK level value (0-7).
 * Already-10-element arrays are skipped (idempotent).
 *
 * Run with: npx tsx scripts/redistribute-pitches.ts
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
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

// ── Global counters (all deterministic, counter-based) ────────────────────────
let chCounter   = 0;  // pitchers WITH CH=1
let snkCounter  = 0;  // pitchers WITH SNK>0
let noSlCounter = 0;  // pitchers WITHOUT SL
let noCbCounter = 0;  // pitchers WITHOUT CB
let no2SCounter = 0;  // pitchers WITHOUT 2S

let totalPitchers  = 0;
let changedCalls   = 0;
let skippedCalls   = 0;

// ── Tracking for distribution report ─────────────────────────────────────────
let afterCH = 0, afterFK = 0, afterSFF = 0, afterSHU = 0;
let afterSL = 0, afterCB = 0, afterSNK = 0, afterSPL = 0;
let after2S = 0, afterCT = 0;

/**
 * Apply redistribution to a 7-element secondary array.
 * Input:  [2S, SL, CB, CH, CT, SNK, SPL]
 * Output: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
 */
function redistribute(arr: number[]): number[] {
  while (arr.length < 7) arr.push(0);

  let twoS = arr[0];
  let sl   = arr[1];
  let cb   = arr[2];
  let ch   = arr[3];
  let ct   = arr[4];
  let snk  = arr[5];
  let spl  = arr[6];
  let fk   = 0;
  let sff  = 0;
  let shu  = 0;

  totalPitchers++;

  // ── Step 2: CH redistribution (20% → FK, 20% → SFF, 60% keep) ───────────
  if (ch > 0) {
    chCounter++;
    const mod = chCounter % 5;
    if (mod === 1) {
      fk = 1;
      ch = 0;
    } else if (mod === 2) {
      sff = 1;
      ch = 0;
    }
    // mod 0, 3, 4 → keep CH
  }

  // ── Step 3: SNK redistribution (~14.3% → SHU) ────────────────────────────
  if (snk > 0) {
    snkCounter++;
    if (snkCounter % 7 === 0) {
      shu = snk;
      snk = 0;
    }
  }

  // ── Step 4a: SL augmentation (every 9th no-SL pitcher gets SL=3) ─────────
  if (sl === 0) {
    noSlCounter++;
    if (noSlCounter % 9 === 0) {
      sl = 3;
    }
  }

  // ── Step 4b: CB augmentation (every 13th no-CB pitcher gets CB=3) ────────
  if (cb === 0) {
    noCbCounter++;
    if (noCbCounter % 13 === 0) {
      cb = 3;
    }
  }

  // ── Step 4c: 2S augmentation (every 50th no-2S pitcher gets 2S=1) ────────
  if (twoS === 0) {
    no2SCounter++;
    if (no2SCounter % 50 === 0) {
      twoS = 1;
    }
  }

  // ── Tracking ──────────────────────────────────────────────────────────────
  if (ch   > 0) afterCH++;
  if (fk   > 0) afterFK++;
  if (sff  > 0) afterSFF++;
  if (shu  > 0) afterSHU++;
  if (sl   > 0) afterSL++;
  if (cb   > 0) afterCB++;
  if (snk  > 0) afterSNK++;
  if (spl  > 0) afterSPL++;
  if (twoS > 0) after2S++;
  if (ct   > 0) afterCT++;

  return [twoS, sl, cb, ch, ct, snk, spl, fk, sff, shu];
}

// Matches: ...pitchMix(N, [elements])
// Captures: group 1 = primary, group 2 = comma-separated array contents
const PITCH_MIX_RE = /\.\.\.pitchMix\((\d+),\s*\[([^\]]*)\]\)/g;

function processFile(filePath: string): void {
  const fullPath = path.resolve(filePath);
  const original = fs.readFileSync(fullPath, "utf-8");

  let modified = original;
  let fileChanges = 0;
  let fileSkips = 0;

  modified = modified.replace(PITCH_MIX_RE, (match, primaryStr, argsStr) => {
    const primary = parseInt(primaryStr, 10);
    const elements = argsStr
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s !== "")
      .map((s: string) => parseInt(s, 10))
      .filter((n: number) => !isNaN(n));

    // Skip if already a 10-element array (idempotent)
    if (elements.length >= 10) {
      skippedCalls++;
      fileSkips++;
      totalPitchers++;
      return match;
    }

    const newArr = redistribute(elements);
    const formatted = newArr.join(", ");
    fileChanges++;
    changedCalls++;
    return `...pitchMix(${primary}, [${formatted}])`;
  });

  if (fileChanges > 0) {
    fs.writeFileSync(fullPath, modified, "utf-8");
    console.log(`  ✓ ${filePath}: ${fileChanges} call(s) updated${fileSkips ? `, ${fileSkips} skipped` : ""}`);
  } else if (fileSkips > 0) {
    console.log(`  ○ ${filePath}: already up to date (${fileSkips} skipped)`);
  } else {
    console.log(`  - ${filePath}: no pitchMix calls found`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\n── Pitch redistribution — Task #591 (FK / SFF / SHU) ──\n");

for (const file of ROSTER_FILES) {
  processFile(file);
}

const pct = (n: number) => `${((n / totalPitchers) * 100).toFixed(1)}%`;

console.log(`
── Summary ──────────────────────────────────────────────────────
  Total pitchers processed : ${totalPitchers}
  pitchMix() calls updated : ${changedCalls}
  calls already up to date : ${skippedCalls}

── Distribution after redistribution (${totalPitchers} pitchers) ──
  FB  : 100%      (always present)
  CH  : ${pct(afterCH).padStart(6)}   target ~55%
  FK  : ${pct(afterFK).padStart(6)}   target ~18%
  SFF : ${pct(afterSFF).padStart(6)}   target ~18%
  SHU : ${pct(afterSHU).padStart(6)}   target  ~7.5%
  SL  : ${pct(afterSL).padStart(6)}   target ~43%
  CB  : ${pct(afterCB).padStart(6)}   target ~43%
  SNK : ${pct(afterSNK).padStart(6)}   target ~39%
  SPL : ${pct(afterSPL).padStart(6)}   target ~38%
  2S  : ${pct(after2S).padStart(6)}   target ~18%
  CT  : ${pct(afterCT).padStart(6)}   target ~22%
──────────────────────────────────────────────────────────────────
`);
