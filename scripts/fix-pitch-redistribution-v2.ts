/**
 * fix-pitch-redistribution-v2.ts
 *
 * Corrects the over-conversion from redistribute-pitches-v2.ts.
 *
 * Problem: v2 converted EVERY dual SNK+SPL pitcher (100% rate) instead of
 * every 2nd or 3rd.  This sent SL/CB to ~59% each and SNK/SPL to ~24-25%.
 *
 * CH → SHU conversions from v2 were CORRECT (CH 38.6%, SHU 24.1%) — leave those alone.
 *
 * Fix applied here:
 *   Step A  SL → SNK : for pitchers with SL > 0 but SNK === 0, every 2nd one
 *           gets SL converted back to SNK.  Brings SL from ~59% → ~37% and
 *           SNK from ~24% → ~46%.
 *
 *   Step B  CB → SPL : for pitchers with CB > 0 but SPL === 0, every 2nd one
 *           gets CB converted back to SPL.  Brings CB from ~60% → ~37% and
 *           SPL from ~25% → ~47%.
 *
 * After the fix:
 *   SL ~37%  CB ~37%  SNK ~46%  SPL ~47%  CH ~38%  SHU ~24%  — all on target.
 *
 * Run: npx tsx scripts/fix-pitch-redistribution-v2.ts
 * ⚠  NOT IDEMPOTENT. Run once only on post-v2 files.
 */

import * as fs from "fs";
import * as path from "path";

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
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/wccRosters.ts",
];

// [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
const IDX = { s2: 0, sl: 1, cb: 2, ch: 3, ct: 4, snk: 5, spl: 6, fk: 7, sff: 8, shu: 9 } as const;

// ── Global counters ───────────────────────────────────────────────────────────
let slNoSnkCounter = 0;  // step A: pitchers with SL but no SNK
let cbNoSplCounter = 0;  // step B: pitchers with CB but no SPL

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

function correct(arr: number[]): number[] {
  let [twoS, sl, cb, ch, ct, snk, spl, fk, sff, shu] = arr;

  // Step A: SL → SNK (for pitchers with SL but no SNK — every 2nd)
  if (sl > 0 && snk === 0) {
    slNoSnkCounter++;
    if (slNoSnkCounter % 2 === 0) {
      snk = sl;
      sl = 0;
    }
  }

  // Step B: CB → SPL (for pitchers with CB but no SPL — every 2nd)
  if (cb > 0 && spl === 0) {
    cbNoSplCounter++;
    if (cbNoSplCounter % 2 === 0) {
      spl = cb;
      cb = 0;
    }
  }

  return [twoS, sl, cb, ch, ct, snk, spl, fk, sff, shu];
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: pitchMix-format files
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Phase 1: pitchMix-format files ──\n");

for (const filePath of PITCH_MIX_FILES) {
  const fullPath  = path.resolve(filePath);
  const original  = fs.readFileSync(fullPath, "utf-8");
  let   fileCount = 0;

  const re = /\.\.\.pitchMix\((\d+),\s*\[([^\]]*)\]\)/g;

  const modified = original.replace(re, (match, primaryStr, argsStr) => {
    const primary  = parseInt(primaryStr, 10);
    const elements = argsStr
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n));

    while (elements.length < 10) elements.push(0);
    const arr = elements.slice(0, 10);

    const result = correct(arr);
    track(result);

    const newStr = `...pitchMix(${primary}, [${result.join(", ")}])`;
    if (newStr !== match) fileCount++;
    return newStr;
  });

  fs.writeFileSync(fullPath, modified, "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} call(s) corrected`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: inline-format files
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Phase 2: inline-format files ──\n");

function getField(line: string, name: string): number {
  const m = line.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : 0;
}

for (const filePath of INLINE_FILES) {
  const fullPath = path.resolve(filePath);
  const original = fs.readFileSync(fullPath, "utf-8");
  const lines    = original.split("\n");
  let fileCount  = 0;

  const newLines = lines.map(line => {
    const fb = getField(line, "pitchFB");
    if (fb !== 1) return line;

    const twoS = getField(line, "pitch2S");
    const fk   = getField(line, "pitchFK");
    const sff  = getField(line, "pitchSFF");

    const arr: number[] = [
      twoS,
      getField(line, "pitchSL"),
      getField(line, "pitchCB"),
      getField(line, "pitchCH"),
      getField(line, "pitchCT"),
      getField(line, "pitchSNK"),
      getField(line, "pitchSPL"),
      fk,
      sff,
      getField(line, "pitchSHU"),
    ];

    const result = correct(arr);

    // Track
    totalPitchers++;
    tally.fb++;
    if (result[IDX.s2]  > 0) tally.s2++;
    if (result[IDX.sl]  > 0) tally.sl++;
    if (result[IDX.cb]  > 0) tally.cb++;
    if (result[IDX.ch]  > 0) tally.ch++;
    if (result[IDX.ct]  > 0) tally.ct++;
    if (result[IDX.snk] > 0) tally.snk++;
    if (result[IDX.spl] > 0) tally.spl++;
    if (result[IDX.fk]  > 0) tally.fk++;
    if (result[IDX.sff] > 0) tally.sff++;
    if (result[IDX.shu] > 0) tally.shu++;

    const changed =
      result[IDX.sl]  !== arr[IDX.sl]  ||
      result[IDX.cb]  !== arr[IDX.cb]  ||
      result[IDX.snk] !== arr[IDX.snk] ||
      result[IDX.spl] !== arr[IDX.spl];

    if (!changed) return line;
    fileCount++;

    return line
      .replace(/\bpitchSL:\s*\d+/,  `pitchSL: ${result[IDX.sl]}`)
      .replace(/\bpitchCB:\s*\d+/,  `pitchCB: ${result[IDX.cb]}`)
      .replace(/\bpitchSNK:\s*\d+/, `pitchSNK: ${result[IDX.snk]}`)
      .replace(/\bpitchSPL:\s*\d+/, `pitchSPL: ${result[IDX.spl]}`);
  });

  fs.writeFileSync(fullPath, newLines.join("\n"), "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} pitcher(s) corrected`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── Post-correction distribution: ${totalPitchers} pitchers ──\n`);

const TOLERANCE = 8;

const targets: [string, number, [number, number]][] = [
  ["FB",  tally.fb,  [100, 100]],
  ["SL",  tally.sl,  [35,  45]],
  ["CB",  tally.cb,  [35,  45]],
  ["SNK", tally.snk, [40,  50]],
  ["SPL", tally.spl, [40,  50]],
  ["CH",  tally.ch,  [30,  40]],
  ["SHU", tally.shu, [20,  30]],
  ["CT",  tally.ct,  [10,  20]],
  ["2S",  tally.s2,  [15,  22]],
  ["FK",  tally.fk,  [15,  22]],
  ["SFF", tally.sff, [15,  22]],
];

let failed = false;

for (const [label, n, [lo, hi]] of targets) {
  const actual = (n / totalPitchers) * 100;
  const pass   = actual >= lo - TOLERANCE && actual <= hi + TOLERANCE;
  const mark   = pass ? "✓" : "✗";
  const flag   = pass ? "" : "  ← OUT OF RANGE";
  console.log(
    `  ${mark}  ${label.padEnd(3)}  ${String(n).padStart(4)}  ` +
    `(${actual.toFixed(1).padStart(5)}%)   target ${lo}–${hi}%${flag}`
  );
  if (!pass) failed = true;
}

if (failed) {
  console.error(`\n✗ Some pitches outside tolerance. Tune the correction counters.\n`);
  process.exit(1);
}

console.log(`\n✓ All distributions within ±${TOLERANCE}pp of targets.\n`);
