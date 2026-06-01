/**
 * redistribute-pitches-v2.ts
 *
 * One-time redistribution script targeting the new pitch-mix goals:
 *   SNK 40–50%  SPL 40–50%  SL 35–45%  CB 35–45%
 *   CH  30–40%  SHU 20–30%  CT 10–20%
 *
 * Problems in current data:
 *   - SEC/ACC pitchers have SNK+SPL on nearly everyone (76-89%)
 *     while SL/CB are almost absent (7-13%)
 *   - CH is globally too high (~58%) — should be 30-40%
 *   - SHU is globally too low (~6.4%) — should be 20-30%
 *
 * ── Redistribution steps (applied to every pitcher in order) ─────────────────
 *
 *   Step 1  Dual SNK+SPL → SL / CB
 *           Pitchers who have both SNK > 0 and SPL > 0 get one of the two
 *           pitches converted every 2nd such pitcher:
 *             even dualCounter: SNK → SL (if SL absent), else SNK → CB
 *             odd  dualCounter: SPL → CB (if CB absent), else SPL → SL
 *           This targets SEC/ACC where ~80%+ of pitchers carry both.
 *
 *   Step 2  CH → SHU
 *           Every 3rd pitcher with CH > 0 and SHU = 0 has CH cleared and
 *           SHU set to 3 (mid-quality). Drops CH from ~58% to ~38% while
 *           lifting SHU from ~6% to ~26%.
 *
 * ── Storage formats ───────────────────────────────────────────────────────────
 *   pitchMix format  – ...pitchMix(N, [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU])
 *   Inline format    – pitchFB: N, pitchSL: N, ... pitchSHU: N  (one player per line)
 *
 * ── Run ───────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/redistribute-pitches-v2.ts
 *
 * ⚠  NOT IDEMPOTENT. Run once only.
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
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/wccRosters.ts",
];

// pitchMix secondary array indices: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU]
const IDX = { s2: 0, sl: 1, cb: 2, ch: 3, ct: 4, snk: 5, spl: 6, fk: 7, sff: 8, shu: 9 } as const;

// ── Global counters ───────────────────────────────────────────────────────────
let dualCounter = 0;   // step 1: pitchers with both SNK and SPL
let chCounter   = 0;   // step 2: pitchers with CH

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

// ── Apply redistribution steps to a 10-element array ─────────────────────────
function redistribute(arr: number[]): number[] {
  let [twoS, sl, cb, ch, ct, snk, spl, fk, sff, shu] = arr;

  // Step 1: Dual SNK+SPL → SL / CB (every other dual pitcher)
  if (snk > 0 && spl > 0) {
    dualCounter++;
    if (dualCounter % 2 === 0) {
      // Even: convert SNK → SL (if SL absent, else → CB)
      if (sl === 0) { sl = snk; snk = 0; }
      else if (cb === 0) { cb = snk; snk = 0; }
    } else {
      // Odd: convert SPL → CB (if CB absent, else → SL)
      if (cb === 0) { cb = spl; spl = 0; }
      else if (sl === 0) { sl = spl; spl = 0; }
    }
  }

  // Step 2: CH → SHU (every 3rd CH-holder without SHU)
  if (ch > 0 && shu === 0) {
    chCounter++;
    if (chCounter % 3 === 0) {
      ch = 0;
      shu = 3;
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

    // Pad to 10 elements
    while (elements.length < 10) elements.push(0);
    const arr = elements.slice(0, 10);

    const result = redistribute(arr);
    track(result);

    const newStr = `...pitchMix(${primary}, [${result.join(", ")}])`;
    if (newStr !== match) fileCount++;
    return newStr;
  });

  fs.writeFileSync(fullPath, modified, "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} call(s) modified`);
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

    const result = redistribute(arr);

    // Track distribution
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
      result[IDX.ch]  !== arr[IDX.ch]  ||
      result[IDX.snk] !== arr[IDX.snk] ||
      result[IDX.spl] !== arr[IDX.spl] ||
      result[IDX.shu] !== arr[IDX.shu];

    if (!changed) return line;
    fileCount++;

    let updated = line
      .replace(/\bpitchSL:\s*\d+/,  `pitchSL: ${result[IDX.sl]}`)
      .replace(/\bpitchCB:\s*\d+/,  `pitchCB: ${result[IDX.cb]}`)
      .replace(/\bpitchCH:\s*\d+/,  `pitchCH: ${result[IDX.ch]}`)
      .replace(/\bpitchCT:\s*\d+/,  `pitchCT: ${result[IDX.ct]}`)
      .replace(/\bpitchSNK:\s*\d+/, `pitchSNK: ${result[IDX.snk]}`)
      .replace(/\bpitchSPL:\s*\d+/, `pitchSPL: ${result[IDX.spl]}`)
      .replace(/\bpitchSHU:\s*\d+/, `pitchSHU: ${result[IDX.shu]}`);

    // If pitchSHU field doesn't exist yet in line, append it
    if (!line.includes("pitchSHU:")) {
      updated = updated.replace(/\}\s*$/, `, pitchSHU: ${result[IDX.shu]} }`);
    }

    return updated;
  });

  fs.writeFileSync(fullPath, newLines.join("\n"), "utf-8");
  console.log(`  ✓ ${filePath}: ${fileCount} pitcher(s) updated`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── Post-redistribution distribution: ${totalPitchers} pitchers ──\n`);

const TOLERANCE = 8; // pp — wide for a first run; validate-pitch-mix.ts uses ±5pp

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
  console.error(`\n✗ Some pitches are outside tolerance. Re-tune the redistribution counters.\n`);
  process.exit(1);
}

console.log(`\n✓ All distributions within tolerance of targets.\n`);
