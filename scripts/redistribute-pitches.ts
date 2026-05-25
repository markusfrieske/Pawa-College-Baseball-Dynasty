/**
 * redistribute-pitches.ts — Task #591
 *
 * One-time setup script that adds FK, SFF, and SHU pitch types across all
 * 19 real roster files and redistributes pitch assignments toward the
 * distribution targets below.
 *
 * ⚠  NOT IDEMPOTENT.  Run once on clean (pre-task-591) roster files.
 *    Re-running on already-processed files will over-redistribute CH→FK/SFF.
 *
 * ── Storage formats handled ──────────────────────────────────────────────────
 *   pitchMix format  — ...pitchMix(N, [2S, SL, CB, CH, CT, SNK, SPL])
 *     expands to 10-element: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
 *   Inline format    — pitchFB: N, ... pitchSPL: N (then appends FK/SFF/SHU)
 *     used by: mwcRosters.ts, aacRosters.ts, wccRosters.ts
 *
 * ── Steps ────────────────────────────────────────────────────────────────────
 *
 * Step 2 — CH → FK / SFF redistribution (20% / 20% / 60% split):
 *   Global chCounter increments for every pitcher with CH > 0.
 *     chCounter % 5 === 1  → CH removed, FK  = 1  (~20%)
 *     chCounter % 5 === 2  → CH removed, SFF = 1  (~20%)
 *     otherwise            → CH unchanged           (~60%)
 *   FK and SFF are binary (0 or 1) like CH.
 *
 * Step 3 — SNK → SHU redistribution (~14.3%):
 *   Global snkCounter increments for every pitcher with SNK > 0.
 *     snkCounter % 7 === 0 → SNK removed, SHU = original SNK level
 *   SHU inherits the exact SNK level (0–7).
 *
 * Step 4 — Conversion pass (removes one pitch type, adds another):
 *   Applied to pitchMix-format pitchers only (inline pitchers excluded).
 *   4a. SL → CT: every 14th pitcher with SL > 0 and CT = 0
 *       → Reduces SL surplus (45% → 43%), closes CT deficit (20% → 22%).
 *   4b. SNK → 2S: every 27th pitcher with SNK > 0 and 2S = 0 (binary: 2S=1)
 *       → Reduces SNK surplus (41% → 40%), closes 2S deficit (17% → 18%).
 *   These are CONVERSIONS, not augmentations: the source pitch is set to 0.
 *
 * ── Distribution targets (all pitchers) ─────────────────────────────────────
 *   FB  100%   CH  ~55%   FK  ~18%   SFF ~18%   SHU ~7.5%
 *   SL  ~43%   CB  ~43%   SNK ~39%   SPL ~38%   CT  ~22%   2S  ~18%
 *
 * ── Post-validation ──────────────────────────────────────────────────────────
 *   Script prints pass/fail for each target (±5 pp tolerance) and exits
 *   with code 1 if any value is out of range.
 *
 * Run: npx tsx scripts/redistribute-pitches.ts
 */

import * as fs from "fs";
import * as path from "path";

// ── File lists ────────────────────────────────────────────────────────────────
const PITCH_MIX_FILES = [
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
  "server/ivyLeagueRosters.ts",
  "server/sunBeltRosters.ts",
  "server/bigWestRosters.ts",
  "server/hbcuRosters.ts",
  "server/moValleyRosters.ts",
];

const INLINE_FILES = [
  "server/mwcRosters.ts",   // Mountain West — uses inline field format
  "server/aacRosters.ts",   // AAC            — uses inline field format
  "server/wccRosters.ts",   // WCC            — uses inline field format
];

// pitchMix secondary array indices: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
const IDX = { s2: 0, sl: 1, cb: 2, ch: 3, ct: 4, snk: 5, spl: 6, fk: 7, sff: 8, shu: 9 } as const;

// ── Redistribution counters ───────────────────────────────────────────────────
let chCounter      = 0;   // step 2
let snkCounter     = 0;   // step 3
let slNoCtCounter  = 0;   // step 4a
let snkNo2SCounter = 0;   // step 4b

// ── Distribution tracking ─────────────────────────────────────────────────────
const tally = { fb: 0, s2: 0, sl: 0, cb: 0, ch: 0, ct: 0, snk: 0, spl: 0, fk: 0, sff: 0, shu: 0 };
let totalPitchers = 0;

function track(arr: number[]): void {
  totalPitchers++;
  tally.fb++;
  if (arr[IDX.s2]  > 0) tally.s2++;
  if (arr[IDX.sl]  > 0) tally.sl++;
  if (arr[IDX.cb]  > 0) tally.cb++;
  if (arr[IDX.ch]  > 0) tally.ch++;
  if (arr[IDX.ct]  > 0) tally.ct++;
  if (arr[IDX.snk] > 0) tally.snk++;
  if (arr[IDX.spl] > 0) tally.spl++;
  if (arr[IDX.fk]  > 0) tally.fk++;
  if (arr[IDX.sff] > 0) tally.sff++;
  if (arr[IDX.shu] > 0) tally.shu++;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: pitchMix-format files — expand 7→10 elements, apply all steps
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Phase 1: pitchMix-format files ──\n");

for (const filePath of PITCH_MIX_FILES) {
  const fullPath  = path.resolve(filePath);
  const original  = fs.readFileSync(fullPath, "utf-8");
  let   fileCount = 0;

  // Create regex per file so lastIndex resets
  const re = /\.\.\.pitchMix\((\d+),\s*\[([^\]]*)\]\)/g;

  const modified = original.replace(re, (match, primaryStr, argsStr) => {
    const primary  = parseInt(primaryStr, 10);
    const elements = argsStr
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n));

    // Parse (pad to at least 7 elements)
    while (elements.length < 7) elements.push(0);
    let [twoS, sl, cb, ch, ct, snk, spl] = elements;

    // If already 10 elements, read existing FK/SFF/SHU
    let fk  = elements.length >= 10 ? elements[IDX.fk]  : 0;
    let sff = elements.length >= 10 ? elements[IDX.sff] : 0;
    let shu = elements.length >= 10 ? elements[IDX.shu] : 0;

    const alreadyExpanded = elements.length >= 10;

    // ── Step 2: CH → FK/SFF (only on fresh 7-element arrays) ─────────────
    if (!alreadyExpanded && ch > 0) {
      chCounter++;
      const mod = chCounter % 5;
      if (mod === 1) { fk = 1; ch = 0; }
      else if (mod === 2) { sff = 1; ch = 0; }
    }

    // ── Step 3: SNK → SHU (only on fresh 7-element arrays) ───────────────
    if (!alreadyExpanded && snk > 0) {
      snkCounter++;
      if (snkCounter % 7 === 0) { shu = snk; snk = 0; }
    }

    // ── Step 4a: SL → CT conversion (both fresh and already-expanded) ────
    if (sl > 0 && ct === 0) {
      slNoCtCounter++;
      if (slNoCtCounter % 14 === 0) { ct = Math.min(7, sl); sl = 0; }
    }

    // ── Step 4b: SNK → 2S conversion (both fresh and already-expanded) ───
    if (snk > 0 && twoS === 0) {
      snkNo2SCounter++;
      if (snkNo2SCounter % 27 === 0) { twoS = 1; snk = 0; }
    }

    const result = [twoS, sl, cb, ch, ct, snk, spl, fk, sff, shu];
    track(result);

    const newStr = `...pitchMix(${primary}, [${result.join(", ")}])`;
    if (newStr !== match) fileCount++;
    return newStr;
  });

  fs.writeFileSync(fullPath, modified, "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} call(s) modified`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: inline-format files — add FK/SFF/SHU fields, apply steps 2 & 3
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Phase 2: inline-format files ──\n");

let inlineCHCounter  = 0;
let inlineSNKCounter = 0;

function getField(line: string, name: string): number {
  const m = line.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : -1; // -1 = field absent
}

for (const filePath of INLINE_FILES) {
  const fullPath = path.resolve(filePath);
  const original = fs.readFileSync(fullPath, "utf-8");
  const lines    = original.split("\n");
  let fileCount  = 0;

  const newLines = lines.map(line => {
    // Pitcher lines have pitchFB: 1  (batters have pitchFB: 0 or no field)
    const fb = getField(line, "pitchFB");
    if (fb !== 1) return line;

    let ch  = Math.max(0, getField(line, "pitchCH"));
    let snk = Math.max(0, getField(line, "pitchSNK"));
    let fk  = Math.max(0, getField(line, "pitchFK"));
    let sff = Math.max(0, getField(line, "pitchSFF"));
    let shu = Math.max(0, getField(line, "pitchSHU"));
    const twoS = Math.max(0, getField(line, "pitch2S"));
    const sl   = Math.max(0, getField(line, "pitchSL"));
    const cb   = Math.max(0, getField(line, "pitchCB"));
    const ct   = Math.max(0, getField(line, "pitchCT"));
    const spl  = Math.max(0, getField(line, "pitchSPL"));

    let changed = false;

    // Step 2: CH redistribution (only if FK/SFF not already assigned)
    if (ch > 0 && fk === 0 && sff === 0) {
      inlineCHCounter++;
      const mod = inlineCHCounter % 5;
      if (mod === 1) { fk = 1; ch = 0; changed = true; }
      else if (mod === 2) { sff = 1; ch = 0; changed = true; }
    }

    // Step 3: SNK → SHU (only if SHU not already assigned)
    if (snk > 0 && shu === 0) {
      inlineSNKCounter++;
      if (inlineSNKCounter % 7 === 0) { shu = snk; snk = 0; changed = true; }
    }

    // Track distribution
    totalPitchers++;
    tally.fb++;
    if (twoS > 0) tally.s2++;
    if (sl   > 0) tally.sl++;
    if (cb   > 0) tally.cb++;
    if (ch   > 0) tally.ch++;
    if (ct   > 0) tally.ct++;
    if (snk  > 0) tally.snk++;
    if (spl  > 0) tally.spl++;
    if (fk   > 0) tally.fk++;
    if (sff  > 0) tally.sff++;
    if (shu  > 0) tally.shu++;

    if (!changed) return line;
    fileCount++;

    let result = line
      .replace(/\bpitchCH:\s*\d+/,  `pitchCH: ${ch}`)
      .replace(/\bpitchSNK:\s*\d+/, `pitchSNK: ${snk}`)
      .replace(/\bpitchFK:\s*\d+/,  `pitchFK: ${fk}`)
      .replace(/\bpitchSFF:\s*\d+/, `pitchSFF: ${sff}`)
      .replace(/\bpitchSHU:\s*\d+/, `pitchSHU: ${shu}`);

    // Append FK/SFF/SHU if not already in line
    if (!line.includes("pitchFK:")) {
      result = result.replace(/\}\s*$/, `, pitchFK: ${fk}, pitchSFF: ${sff}, pitchSHU: ${shu} }`);
    }

    return result;
  });

  fs.writeFileSync(fullPath, newLines.join("\n"), "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} pitcher(s) updated`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-VALIDATION: all pitches must be within ±5 pp of their targets
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── Post-validation: ${totalPitchers} pitchers ──\n`);

const TOLERANCE = 5; // percentage points

const targets: [string, number, number][] = [
  ["FB",  tally.fb,   100],
  ["CH",  tally.ch,    55],
  ["FK",  tally.fk,    18],
  ["SFF", tally.sff,   18],
  ["SHU", tally.shu,    7.5],
  ["SL",  tally.sl,    43],
  ["CB",  tally.cb,    43],
  ["SNK", tally.snk,   39],
  ["SPL", tally.spl,   38],
  ["CT",  tally.ct,    22],
  ["2S",  tally.s2,    18],
];

let failed = false;

for (const [label, n, target] of targets) {
  const actual = (n / totalPitchers) * 100;
  const delta  = actual - target;
  const pass   = Math.abs(delta) <= TOLERANCE;
  const mark   = pass ? "✓" : "✗";
  const sign   = delta >= 0 ? "+" : "";
  const flag   = pass ? "" : "  ← OUT OF RANGE";
  console.log(
    `  ${mark}  ${label.padEnd(3)}  ${String(n).padStart(4)}  ` +
    `(${actual.toFixed(1).padStart(5)}%)   target ~${String(target).padEnd(4)}%   ` +
    `delta ${sign}${delta.toFixed(1)}pp${flag}`
  );
  if (!pass) failed = true;
}

if (failed) {
  console.error(`\n✗ Some pitches are outside the ±${TOLERANCE}pp tolerance. Re-tune the redistribution.\n`);
  process.exit(1);
}

console.log(`\n✓ All distributions within ±${TOLERANCE}pp of targets.\n`);
