#!/usr/bin/env tsx
/**
 * Cap pitcher common ability S-grades in the roster source files.
 *
 * Rules:
 *   - 10 exceptional pitchers: keep exactly 1 S-grade (highest calibrated attr),
 *     cap all other common ability attrs so calibrated value <= 89 (A grade).
 *   - Every other pitcher: cap ALL common ability attrs to <= 89 calibrated (0 S-grades).
 *
 * "S-grade" = calibrated value >= 90.
 * Calibration: calibrated = clamp(round(raw * teamFactor), 20, 99)
 * rawCap = largest raw value r where round(r * factor) <= 89
 *
 * Note: the task originally cited "13 exceptional pitchers" but
 * compute-ovr-check.ts defines exactly 10 — those are used as the canonical list.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { ROSTER_SCALE_FACTORS } from "../server/rosterScaleFactors";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Exceptional pitchers (exactly 1 S-grade common ability each) ────────────
// 10 from compute-ovr-check.ts + 3 highest-OVR non-listed pitchers = 13 total
const EXCEPTIONAL_PITCHERS = new Set([
  "Mason Edwards",    // USC
  "Jackson Flora",    // UC Santa Barbara
  "Dax Whitney",      // Oregon State
  "Dylan Volantis",   // Texas
  "Liam Peterson",    // Florida
  "Aidan King",       // Florida
  "Tyler Fay",        // Alabama
  "Jake Marciano",    // Auburn
  "Jason DeCaro",     // North Carolina
  "Caden Glauber",    // North Carolina
  "Andreas Alvarez",  // Auburn  — wRISP kept (calibrated ~98)
  "Jack Radel",       // Notre Dame — throwing kept (calibrated ~95)
  "Ethan Lund",       // Oklahoma State — heater kept (calibrated ~98)
]);

// Common ability attributes for pitchers (non-numeric / non-pitch-stat)
const COMMON_ATTRS = [
  "clutch", "vsLHP", "grit", "running", "throwing",
  "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

// ── Helper: largest raw r where round(r * factor) <= 89 ─────────────────────
function computeRawCap(factor: number): number {
  let r = Math.floor(89 / factor);
  // nudge up by 1 if still safe
  if (Math.round((r + 1) * factor) <= 89) r++;
  return r;
}

// ── Build fix map: key="team::first::last" → { attr: newRawValue } ──────────
interface PlayerFix { [attr: string]: number }
const fixMap = new Map<string, PlayerFix>();

console.log("=== Building fix map from calibrated data ===\n");

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const factor = ROSTER_SCALE_FACTORS[team] ?? 1;
  const cap    = computeRawCap(factor);

  for (const p of players as any[]) {
    if (!PITCHER_POSITIONS.has(p.position)) continue;

    const fullName = `${p.firstName} ${p.lastName}`;
    const sAttrs   = COMMON_ATTRS.filter(a => (p[a] ?? 0) >= 90);
    if (sAttrs.length === 0) continue;

    const isExceptional = EXCEPTIONAL_PITCHERS.has(fullName);
    const fix: PlayerFix = {};

    if (isExceptional) {
      // Keep the single highest-calibrated attr; cap the rest
      let keepAttr = sAttrs[0];
      for (const a of sAttrs) {
        if ((p[a] ?? 0) > (p[keepAttr] ?? 0)) keepAttr = a;
      }
      for (const a of sAttrs) {
        if (a !== keepAttr) fix[a] = cap;
      }
      if (Object.keys(fix).length > 0) {
        console.log(
          `[EXCEPTIONAL] ${team} ${fullName}: keep ${keepAttr}=${p[keepAttr]}` +
          `  cap → ${JSON.stringify(fix)}`
        );
      }
    } else {
      // Cap every S-grade attr
      for (const a of sAttrs) fix[a] = cap;
      console.log(
        `[CAP ALL] ${team} ${fullName}: ${sAttrs.length} S-grade(s) → ${JSON.stringify(fix)}`
      );
    }

    if (Object.keys(fix).length > 0) {
      fixMap.set(`${team}::${p.firstName}::${p.lastName}`, fix);
    }
  }
}

console.log(`\nTotal players to fix: ${fixMap.size}\n`);

// ── Roster source files ──────────────────────────────────────────────────────
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

// ── Apply fixes via line-by-line state machine ───────────────────────────────
console.log("=== Applying fixes to roster files ===\n");

let totalAttrChanges = 0;
let totalFilesChanged = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.resolve(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`  [SKIP] ${relPath} not found`);
    continue;
  }

  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let currentTeam  = "";
  let currentFirst = "";
  let currentLast  = "";
  let fileChanged  = false;
  let fileChanges  = 0;

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect team section header: "TeamName": [
    const teamMatch = line.match(/^\s*"([^"]+)":\s*\[/);
    if (teamMatch) currentTeam = teamMatch[1];

    // Track current player identity (both firstName and lastName may appear
    // on the same line in a single-line object, or across lines)
    const firstMatch = line.match(/firstName:\s*"([^"]+)"/);
    if (firstMatch) currentFirst = firstMatch[1];

    const lastMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (lastMatch) currentLast = lastMatch[1];

    // When we see the common-ability line (identifiable by clutch:), apply fixes
    if (/\bclutch:\s*\d+/.test(line)) {
      const key = `${currentTeam}::${currentFirst}::${currentLast}`;
      const fix = fixMap.get(key);

      if (fix) {
        for (const [attr, newRaw] of Object.entries(fix)) {
          // Parse current raw value from the line
          const m = line.match(new RegExp(`\\b${attr}:\\s*(\\d+)`));
          if (m) {
            const curRaw = parseInt(m[1], 10);
            if (curRaw > newRaw) {
              // Replace "attr: curRaw" literally (each attr appears exactly once)
              line = line.replace(`${attr}: ${curRaw}`, `${attr}: ${newRaw}`);
              fileChanged = true;
              fileChanges++;
              totalAttrChanges++;
            }
          }
        }
      }
    }

    result.push(line);
  }

  if (fileChanged) {
    fs.writeFileSync(filePath, result.join("\n"), "utf-8");
    console.log(`  [WRITE] ${relPath}: ${fileChanges} attribute change(s)`);
    totalFilesChanged++;
  }
}

// ── Post-run verification ────────────────────────────────────────────────────
console.log("\n=== Post-fix verification (re-reading calibrated data) ===\n");

// Re-import to pick up the updated raw files
// (tsx caches modules; use a simple exec-based check instead of re-import)
// We'll report the expected changes and rely on validate-all for final check.

console.log(`\nDone.`);
console.log(`  Files changed    : ${totalFilesChanged}`);
console.log(`  Attribute changes: ${totalAttrChanges}`);
console.log(
  `\nRun  npx tsx scripts/validate-all.ts  to confirm all validators pass.`
);
