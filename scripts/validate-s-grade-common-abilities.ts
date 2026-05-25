#!/usr/bin/env tsx
/**
 * validate-s-grade-caps.ts
 *
 * Validates that:
 *  1. No player with calibrated OVR (WITH abilities) < 550 has any S-grade
 *     (≥ 90) common ability.
 *  2. No player has more than 2 S-grade common abilities.
 *
 * Common ability fields by position:
 *   Pitchers : wRISP, vsLefty, poise, grit, heater, agile, recovery
 *   Fielders/Catchers : clutch, vsLHP, grit, stealing, running, throwing, recovery
 *
 * Exits 0 only when all checks pass.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

const S_THRESH  = 90;   // ≥ this value is S-grade
const OVR_FLOOR = 550;  // minimum OVR to have any S-grade
const MAX_S     = 2;    // max S-grades allowed for OVR ≥ 550

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);
const PITCHER_COMMON = ["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] as const;
const FIELDER_COMMON = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery"] as const;

function getCommonFields(position: string): readonly string[] {
  return PITCHER_POSITIONS.has(position) ? PITCHER_COMMON : FIELDER_COMMON;
}

let errors = 0;

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players as any[]) {
    const fields  = getCommonFields(p.position);
    const sFields = fields.filter(f => (p[f] ?? 0) >= S_THRESH);
    if (sFields.length === 0) continue;

    const ovr = calculateOVR(p as Parameters<typeof calculateOVR>[0]);
    const name = `${p.firstName} ${p.lastName}`;

    if (ovr < OVR_FLOOR) {
      console.error(
        `FAIL [low-OVR S-grade] ${team.padEnd(22)} ${name.padEnd(24)} OVR=${ovr}` +
        `  fields=${sFields.map(f => `${f}:${p[f]}`).join(", ")}`
      );
      errors++;
    } else if (sFields.length > MAX_S) {
      const sorted = [...sFields].sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0));
      console.error(
        `FAIL [too-many S-grades] ${team.padEnd(22)} ${name.padEnd(24)} OVR=${ovr}` +
        `  count=${sFields.length}  fields=${sorted.map(f => `${f}:${p[f]}`).join(", ")}`
      );
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`validate-s-grade-caps: PASS — all S-grade common ability constraints satisfied.`);
  process.exit(0);
} else {
  console.error(`\nvalidate-s-grade-caps: FAIL — ${errors} violation(s) found.`);
  process.exit(1);
}
