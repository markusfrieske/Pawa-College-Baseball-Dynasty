#!/usr/bin/env tsx
/**
 * cap-s-grade-common-abilities.ts
 *
 * Enforces the S-grade common ability cap rule:
 *   - Only players with calibrated OVR (WITH abilities) ≥ 550 may have any
 *     common ability value ≥ 90 (S-grade).
 *   - No player may have more than 2 S-grade common abilities.
 *   - Where a player exceeds the cap:
 *       • Keep the (up to 2) highest-valued S-grade common attrs.
 *       • Cap the rest to raw_cap (largest raw r where round(r * factor) ≤ 89).
 *
 * Applies fixes to the roster source batch files via line-level replacement on
 * the line containing "clutch:" (all common ability attrs are on that line).
 *
 * Common ability fields by position:
 *   Pitchers : wRISP, vsLefty, poise, grit, heater, agile, recovery
 *   Fielders : clutch, vsLHP, grit, stealing, running, throwing, recovery
 *   Catchers : clutch, vsLHP, grit, stealing, running, throwing, recovery (+ catcherAbility, but
 *              catcherAbility is a separate line so excluded from the cap logic here)
 *
 * Run with:  npx tsx scripts/cap-s-grade-common-abilities.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { ROSTER_SCALE_FACTORS } from "../server/rosterScaleFactors";
import { calculateOVR } from "../shared/abilities";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const S_THRESH = 90;       // S-grade threshold (calibrated value)
const A_CAP_RAW_TARGET = 89; // cap to this calibrated value (A-grade max)
const MAX_S_GRADES = 2;    // max S-grades allowed for OVR 550+ players
const OVR_S_FLOOR = 550;   // only players at or above this OVR may have S-grades

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

const PITCHER_COMMON = ["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] as const;
const FIELDER_COMMON = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery"] as const;

function getCommonFields(position: string): readonly string[] {
  return PITCHER_POSITIONS.has(position) ? PITCHER_COMMON : FIELDER_COMMON;
}

/** Largest raw value r where round(r * factor) ≤ A_CAP_RAW_TARGET (89) */
function computeRawCap(factor: number): number {
  let r = Math.floor(A_CAP_RAW_TARGET / factor);
  if (Math.round((r + 1) * factor) <= A_CAP_RAW_TARGET) r++;
  return r;
}

// ── Build fix map ────────────────────────────────────────────────────────────
interface PlayerFix { [attr: string]: number }
const fixMap = new Map<string, PlayerFix>();

console.log("=== Auditing calibrated rosters for S-grade violations ===\n");

let totalViolatingPlayers = 0;

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const factor = ROSTER_SCALE_FACTORS[team] ?? 1;
  const rawCap = computeRawCap(factor);

  for (const p of players as any[]) {
    const fields = getCommonFields(p.position);
    const sFields = fields.filter(f => (p[f] ?? 0) >= S_THRESH);
    if (sFields.length === 0) continue;

    const ovr = calculateOVR(p as Parameters<typeof calculateOVR>[0]);

    const fix: PlayerFix = {};

    if (ovr < OVR_S_FLOOR) {
      // Cap ALL S-grade common attrs
      for (const f of sFields) fix[f] = rawCap;
    } else if (sFields.length > MAX_S_GRADES) {
      // Keep top MAX_S_GRADES by calibrated value, cap the rest
      const sorted = [...sFields].sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0));
      for (let i = MAX_S_GRADES; i < sorted.length; i++) {
        fix[sorted[i]] = rawCap;
      }
    }

    if (Object.keys(fix).length > 0) {
      const key = `${team}::${p.firstName}::${p.lastName}`;
      fixMap.set(key, fix);
      totalViolatingPlayers++;
      const reason = ovr < OVR_S_FLOOR
        ? `OVR ${ovr} < ${OVR_S_FLOOR}`
        : `${sFields.length} S-grades > max ${MAX_S_GRADES}`;
      console.log(`  [FIX] ${team.padEnd(20)} ${(p.firstName + " " + p.lastName).padEnd(22)} OVR=${ovr}  (${reason})  cap → ${JSON.stringify(fix)}`);
    }
  }
}

console.log(`\nTotal players to fix: ${totalViolatingPlayers}\n`);

if (totalViolatingPlayers === 0) {
  console.log("No violations found — nothing to do.");
  process.exit(0);
}

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
console.log("=== Applying fixes to roster source files ===\n");

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

    const firstMatch = line.match(/firstName:\s*"([^"]+)"/);
    if (firstMatch) currentFirst = firstMatch[1];

    const lastMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (lastMatch) currentLast = lastMatch[1];

    // The common-ability line contains either "clutch:" (fielders/catchers)
    // or "wRISP:" (pitchers). Both appear exactly once per player.
    const isCommonLine = /\bclutch:\s*\d+/.test(line) || /\bwRISP:\s*\d+/.test(line);
    if (isCommonLine) {
      const key = `${currentTeam}::${currentFirst}::${currentLast}`;
      const fix = fixMap.get(key);

      if (fix) {
        for (const [attr, newRaw] of Object.entries(fix)) {
          const m = line.match(new RegExp(`\\b${attr}:\\s*(\\d+)`));
          if (m) {
            const curRaw = parseInt(m[1], 10);
            if (curRaw > newRaw) {
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

console.log(`\nDone.`);
console.log(`  Files changed     : ${totalFilesChanged}`);
console.log(`  Attribute changes : ${totalAttrChanges}`);
console.log(`\nRun  npx tsx scripts/validate-all.ts  to confirm all validators pass.`);
