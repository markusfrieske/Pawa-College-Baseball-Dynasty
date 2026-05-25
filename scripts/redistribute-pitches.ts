/**
 * redistribute-pitches.ts
 *
 * Redistributes slider and curveball usage into rarer pitch types across ALL
 * real pitchers, distributed evenly across every conference (modulo-based,
 * deterministic — not random, not first-N%).
 *
 * Handles two pitch storage formats:
 *   1. pitchMix format:   `...pitchMix(1, [2S, SL, CB, CH, CT, SNK, SPL])`
 *   2. Inline field format: `pitchFB: 1, pitch2S: 0, pitchSL: 4, pitchCB: 4, ...`
 *
 * Conversion rules (applied to ORIGINAL pre-redistribution pitch values):
 *   SL pitchers at index i:  i%100 < 28 → SNK | i%100 < 38 → CT | else keep SL
 *   CB pitchers at index j:  j%100 < 25 → SPL | j%100 < 35 → 2S | else keep CB
 *
 * Level transfer: min(7, existingTarget + sourcePitchLevel).
 * 2S is binary: converting CB→2S sets pitch2S=1 regardless of CB level.
 * OVR cap: ≤400 OVR → max level 4; ≤500 OVR → max level 5.
 *
 * Reads ORIGINAL values via `git show HEAD~1:<file>` so it can be re-run safely.
 */

import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);

// ─── Source files (all 19 paths imported by realRosters.ts) ──────────────────
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

// ─── Regex patterns ───────────────────────────────────────────────────────────
// pitchMix format:  ...pitchMix(1, [2S, SL, CB, CH, CT, SNK, SPL])
const PITCH_MIX_RE     = /\.\.\.pitchMix\(1,\s*\[([^\]]+)\]/;
// inline format: any line containing pitchSL: but NOT pitchMix(
const INLINE_PITCH_RE  = /\bpitchSL:\s*(\d+)/;
const FIRST_NAME_RE    = /firstName:\s*"([^"]+)"/;
const LAST_NAME_RE     = /lastName:\s*"([^"]+)"/;
const TEAM_KEY_RE      = /^\s{0,4}"([^"]+)":\s*\[/;

// pitchMix array positional indices: [2S, SL, CB, CH, CT, SNK, SPL]
const IDX = { s2: 0, sl: 1, cb: 2, ch: 3, ct: 4, snk: 5, spl: 6 } as const;

interface PitchValues {
  pitch2S: number; pitchSL: number; pitchCB: number; pitchCH: number;
  pitchCT: number; pitchSNK: number; pitchSPL: number;
}

interface ConversionValues {
  pitch2S: number; pitchSL: number; pitchCB: number;
  pitchCT: number; pitchSNK: number; pitchSPL: number;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function pct(n: number, total: number) { return ((n / total) * 100).toFixed(1) + "%"; }

function gitShowOriginal(relPath: string): string {
  const r = spawnSync("git", ["show", `HEAD~1:${relPath}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) {
    // File wasn't modified in last commit — read from working tree
    const r2 = spawnSync("cat", [join(ROOT, relPath)], { encoding: "utf8" });
    return r2.stdout ?? "";
  }
  return r.stdout;
}

function parsePitchValuesFromInline(line: string): PitchValues {
  function field(name: string): number {
    const m = line.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  }
  return {
    pitch2S: field("pitch2S"), pitchSL: field("pitchSL"), pitchCB: field("pitchCB"),
    pitchCH: field("pitchCH"), pitchCT: field("pitchCT"),
    pitchSNK: field("pitchSNK"), pitchSPL: field("pitchSPL"),
  };
}

function parsePitchValuesFromMix(content: string): PitchValues {
  const parts = content.split(",").map(s => parseInt(s.trim(), 10));
  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    pitch2S: safe(parts[IDX.s2]), pitchSL: safe(parts[IDX.sl]), pitchCB: safe(parts[IDX.cb]),
    pitchCH: safe(parts[IDX.ch]), pitchCT: safe(parts[IDX.ct]),
    pitchSNK: safe(parts[IDX.snk]), pitchSPL: safe(parts[IDX.spl]),
  };
}

// ─── Step 1: Load ORIGINAL pitch values from git HEAD~1 ──────────────────────
// Key: "teamName::firstName::lastName"
const originalPitches = new Map<string, PitchValues>();
const originalContents = new Map<string, string>();

// Also track which format each file uses (per pitcher)
// "pitchMix" or "inline" — stored so writing uses the right replacement method
const playerFormat = new Map<string, "pitchMix" | "inline">();

for (const relPath of SOURCE_FILES) {
  const content = gitShowOriginal(relPath);
  originalContents.set(relPath, content);

  const lines = content.split("\n");
  let currentTeam = "";
  let currentFirstName = "";
  let currentLastName = "";
  let pitchFound = false;

  for (const line of lines) {
    const teamM = line.match(TEAM_KEY_RE);
    if (teamM) currentTeam = teamM[1];

    const fnM = line.match(FIRST_NAME_RE);
    if (fnM) { currentFirstName = fnM[1]; pitchFound = false; }

    const lnM = line.match(LAST_NAME_RE);
    if (lnM) currentLastName = lnM[1];

    if (!pitchFound && currentFirstName && currentLastName && currentTeam) {
      // Detect pitchMix format
      const pmM = line.match(PITCH_MIX_RE);
      if (pmM) {
        const key = `${currentTeam}::${currentFirstName}::${currentLastName}`;
        originalPitches.set(key, parsePitchValuesFromMix(pmM[1]));
        playerFormat.set(key, "pitchMix");
        pitchFound = true;
        continue;
      }
      // Detect inline format — line has pitchSL: but no pitchMix
      if (INLINE_PITCH_RE.test(line)) {
        const key = `${currentTeam}::${currentFirstName}::${currentLastName}`;
        originalPitches.set(key, parsePitchValuesFromInline(line));
        playerFormat.set(key, "inline");
        pitchFound = true;
      }
    }
  }
}

console.log(`\n── Loaded original pitch values for ${originalPitches.size} entries`);

// ─── Step 2: Build ordered SL and CB pitcher lists via RAW roster order ───────
interface PitcherEntry {
  key: string;
  teamName: string;
  player: RealPlayer;
  orig: PitchValues;
}

const slPitchers: PitcherEntry[] = [];
const cbPitchers: PitcherEntry[] = [];
let totalPitchers = 0;

for (const [teamName, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const p of players) {
    if (!PITCHER_POSITIONS.has(p.position)) continue;
    totalPitchers++;
    const key = `${teamName}::${p.firstName}::${p.lastName}`;
    const orig = originalPitches.get(key);
    if (!orig) continue;
    if (orig.pitchSL > 0) slPitchers.push({ key, teamName, player: p, orig });
    if (orig.pitchCB > 0) cbPitchers.push({ key, teamName, player: p, orig });
  }
}

// Before stats
function countPitch(field: keyof PitchValues) {
  let n = 0;
  for (const v of originalPitches.values()) if (v[field] > 0) n++;
  return n;
}
const bSL = slPitchers.length, bCB = cbPitchers.length;
const bCT = countPitch("pitchCT"), bSNK = countPitch("pitchSNK");
const bSPL = countPitch("pitchSPL"), b2S = countPitch("pitch2S");

console.log(`── Before (${totalPitchers} pitchers):`);
console.log(`   SL:${bSL}(${pct(bSL,totalPitchers)}) CB:${bCB}(${pct(bCB,totalPitchers)}) CT:${bCT} SNK:${bSNK} SPL:${bSPL} 2S:${b2S}`);

// ─── Step 3: Modulo-based conversion assignment ───────────────────────────────
const conversionMap = new Map<string, ConversionValues>();

function getOrInit(entry: PitcherEntry): ConversionValues {
  if (!conversionMap.has(entry.key)) {
    conversionMap.set(entry.key, {
      pitch2S: entry.orig.pitch2S, pitchSL: entry.orig.pitchSL,
      pitchCB: entry.orig.pitchCB, pitchCT: entry.orig.pitchCT,
      pitchSNK: entry.orig.pitchSNK, pitchSPL: entry.orig.pitchSPL,
    });
  }
  return conversionMap.get(entry.key)!;
}

let nSLtoSNK = 0, nSLtoCT = 0, nCBtoSPL = 0, nCBto2S = 0;

for (let i = 0; i < slPitchers.length; i++) {
  const mod = i % 100;
  const vals = getOrInit(slPitchers[i]);
  if (mod < 28) {
    vals.pitchSNK = Math.min(7, vals.pitchSNK + vals.pitchSL);
    vals.pitchSL = 0; nSLtoSNK++;
  } else if (mod < 38) {
    vals.pitchCT = Math.min(7, vals.pitchCT + vals.pitchSL);
    vals.pitchSL = 0; nSLtoCT++;
  }
}

for (let j = 0; j < cbPitchers.length; j++) {
  const mod = j % 100;
  const vals = getOrInit(cbPitchers[j]);
  if (mod < 25) {
    vals.pitchSPL = Math.min(7, vals.pitchSPL + vals.pitchCB);
    vals.pitchCB = 0; nCBtoSPL++;
  } else if (mod < 35) {
    vals.pitch2S = 1; vals.pitchCB = 0; nCBto2S++;
  }
}

console.log(`── Assigned: SL→SNK=${nSLtoSNK} SL→CT=${nSLtoCT} CB→SPL=${nCBtoSPL} CB→2S=${nCBto2S}`);

// ─── Step 4: Apply OVR pitch cap ──────────────────────────────────────────────
let capApplied = 0;
for (const [key, vals] of conversionMap) {
  const [teamName, firstName, lastName] = key.split("::");
  const player = RAW_UNCALIBRATED_ROSTERS[teamName]?.find(
    p => p.firstName === firstName && p.lastName === lastName
  );
  if (!player) continue;
  const ovr = calculateOVR(player);
  const cap = ovr <= 400 ? 4 : ovr <= 500 ? 5 : 7;
  if (cap < 7) {
    let changed = false;
    for (const f of ["pitchSL","pitchCB","pitchCT","pitchSNK","pitchSPL"] as const) {
      if (vals[f] > cap) { vals[f] = cap; changed = true; }
    }
    if (changed) capApplied++;
  }
}
console.log(`── OVR cap applied to ${capApplied} pitchers`);

// ─── Step 5: Write corrected files (starting from ORIGINAL content) ───────────
let filesModified = 0;
let playersUpdated = 0;

for (const relPath of SOURCE_FILES) {
  const original = originalContents.get(relPath);
  if (!original) { console.warn(`  [skip] no content for ${relPath}`); continue; }

  const lines = original.split("\n");
  let currentTeam = "";
  let currentFirstName = "";
  let currentLastName = "";
  let pitchWritten = false;
  let fileModified = false;

  const newLines = lines.map(line => {
    // Track team context
    const teamM = line.match(TEAM_KEY_RE);
    if (teamM) currentTeam = teamM[1];

    const fnM = line.match(FIRST_NAME_RE);
    if (fnM) { currentFirstName = fnM[1]; pitchWritten = false; }

    const lnM = line.match(LAST_NAME_RE);
    if (lnM) currentLastName = lnM[1];

    if (pitchWritten || !currentFirstName || !currentLastName || !currentTeam) return line;

    const key = `${currentTeam}::${currentFirstName}::${currentLastName}`;
    const newVals = conversionMap.get(key);
    if (!newVals) {
      // No conversion — mark pitch line as seen so we don't re-scan
      if (PITCH_MIX_RE.test(line) || INLINE_PITCH_RE.test(line)) pitchWritten = true;
      return line;
    }

    const fmt = playerFormat.get(key);

    // pitchMix format
    if (fmt === "pitchMix" && PITCH_MIX_RE.test(line)) {
      const origParts = line.match(PITCH_MIX_RE)![1]
        .split(",").map(s => parseInt(s.trim(), 10));
      const origCH = Number.isFinite(origParts[IDX.ch]) ? origParts[IDX.ch] : 0;
      const newArray = [
        newVals.pitch2S, newVals.pitchSL, newVals.pitchCB,
        origCH, newVals.pitchCT, newVals.pitchSNK, newVals.pitchSPL,
      ];
      const newLine = line.replace(
        /(\.\.\.\s*pitchMix\s*\(\s*1\s*,\s*\[)([^\]]+)(\])/,
        `$1${newArray.join(", ")}$3`
      );
      if (newLine !== line) { pitchWritten = true; fileModified = true; playersUpdated++; }
      return newLine;
    }

    // Inline field format
    if (fmt === "inline" && INLINE_PITCH_RE.test(line)) {
      let newLine = line
        .replace(/\bpitch2S:\s*\d+/,  `pitch2S: ${newVals.pitch2S}`)
        .replace(/\bpitchSL:\s*\d+/,  `pitchSL: ${newVals.pitchSL}`)
        .replace(/\bpitchCB:\s*\d+/,  `pitchCB: ${newVals.pitchCB}`)
        .replace(/\bpitchCT:\s*\d+/,  `pitchCT: ${newVals.pitchCT}`)
        .replace(/\bpitchSNK:\s*\d+/, `pitchSNK: ${newVals.pitchSNK}`)
        .replace(/\bpitchSPL:\s*\d+/, `pitchSPL: ${newVals.pitchSPL}`);
      if (newLine !== line) { pitchWritten = true; fileModified = true; playersUpdated++; }
      else pitchWritten = true;
      return newLine;
    }

    return line;
  });

  const newContent = newLines.join("\n");
  writeFileSync(join(ROOT, relPath), newContent, "utf8");
  if (fileModified) { filesModified++; console.log(`  ✓ Updated ${relPath}`); }
  else console.log(`  ○ Restored ${relPath} (no conversions in this file)`);
}

console.log(`\n  ${playersUpdated} pitchers updated across ${filesModified} files`);

// ─── Step 6: Expected after-counts ────────────────────────────────────────────
let aSL = 0, aCB = 0, aCT = 0, aSNK = 0, aSPL = 0, a2S = 0;
for (const [key, orig] of originalPitches) {
  const vals = conversionMap.get(key);
  const sl  = vals ? vals.pitchSL  : orig.pitchSL;
  const cb  = vals ? vals.pitchCB  : orig.pitchCB;
  const ct  = vals ? vals.pitchCT  : orig.pitchCT;
  const snk = vals ? vals.pitchSNK : orig.pitchSNK;
  const spl = vals ? vals.pitchSPL : orig.pitchSPL;
  const s2  = vals ? vals.pitch2S  : orig.pitch2S;
  if (sl  > 0) aSL++;
  if (cb  > 0) aCB++;
  if (ct  > 0) aCT++;
  if (snk > 0) aSNK++;
  if (spl > 0) aSPL++;
  if (s2  > 0) a2S++;
}

console.log(`\n── After (expected from conversion map):`);
console.log(`   SL:  ${bSL}→${aSL} (${pct(aSL,totalPitchers)})`);
console.log(`   CB:  ${bCB}→${aCB} (${pct(aCB,totalPitchers)})`);
console.log(`   CT:  ${bCT}→${aCT} (${pct(aCT,totalPitchers)})`);
console.log(`   SNK: ${bSNK}→${aSNK} (${pct(aSNK,totalPitchers)})`);
console.log(`   SPL: ${bSPL}→${aSPL} (${pct(aSPL,totalPitchers)})`);
console.log(`   2S:  ${b2S}→${a2S} (${pct(a2S,totalPitchers)})`);
console.log(`\n✓ Done. Run validate-all to confirm.\n`);
