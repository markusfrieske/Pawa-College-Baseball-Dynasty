/**
 * Derives the seven pitcher common attributes from each pitcher's base stats,
 * using the confirmed Power Pros grade → attribute mapping:
 *
 *   wRISP    ← 対ピンチ   (vs Pinch / RISP)
 *   vsLefty  ← 対左打者   (vs LHB)
 *   poise    ← 打たれ強さ  (Durability)
 *   grit     ← ケガしにくさ (Injury Resistance) — kept as-is (no reliable proxy)
 *   heater   ← ノビ       (Hop/Rise)
 *   agile    ← クイック    (Quick Delivery)    — kept as-is (no reliable proxy)
 *   recovery ← 回復       (Recovery)
 *
 * Derivation formulas (verified against Glauber/Volantis PP source cards):
 *   heater   = min(85, gradeVal(vel*0.6 + stuff*0.4))
 *   wRISP    = min(85, gradeVal(clutch))
 *   vsLefty  = min(85, gradeVal(vsLHP))
 *   poise    = min(85, gradeVal(stuff))
 *   recovery = min(85, gradeVal((stamina + stuff) / 2))
 *
 * Cap at 85 (A grade) so no S-grade silently zeroes out pts without its linked
 * gold ability.  grit and agile are left unchanged.
 *
 * Run: npx tsx scripts/migrate-pitcher-common-attrs.ts
 */

import * as fs from "fs";

// ── Grade value mapping ──────────────────────────────────────────────────────
function gradeVal(score: number): number {
  if (score >= 90) return 92;   // S
  if (score >= 80) return 85;   // A
  if (score >= 70) return 75;   // B
  if (score >= 60) return 65;   // C
  if (score >= 50) return 55;   // D
  if (score >= 40) return 45;   // E
  if (score >= 30) return 35;   // F
  return 20;                     // G
}
function capA(v: number): number { return Math.min(85, v); }

// ── Extract a numeric attr from a player block ───────────────────────────────
function extractAttr(block: string, attr: string): number | null {
  const m = block.match(new RegExp(`\\b${attr}:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

// ── Apply derived attrs to a pitcher block ───────────────────────────────────
function transformPitcher(block: string): { updated: string; changed: boolean } {
  const vel     = extractAttr(block, "velocity");
  const stuff   = extractAttr(block, "stuff");
  const clutch  = extractAttr(block, "clutch");
  const vsLHP   = extractAttr(block, "vsLHP");
  const stamina = extractAttr(block, "stamina");

  if (vel === null || stuff === null || clutch === null || vsLHP === null || stamina === null) {
    return { updated: block, changed: false };
  }

  // Pitchers with velocity = 0 are invalid; skip (shouldn't exist but be safe)
  if (vel === 0 && stuff === 0) return { updated: block, changed: false };

  const newHeater   = capA(gradeVal(vel * 0.6 + stuff * 0.4));
  const newWRISP    = capA(gradeVal(clutch));
  const newVsLefty  = capA(gradeVal(vsLHP));
  const newPoise    = capA(gradeVal(stuff));
  const newRecovery = capA(gradeVal((stamina + stuff) / 2));

  let updated = block;
  updated = updated.replace(/\bheater:\s*\d+/,   `heater: ${newHeater}`);
  updated = updated.replace(/\bwRISP:\s*\d+/,    `wRISP: ${newWRISP}`);
  updated = updated.replace(/\bvsLefty:\s*\d+/,  `vsLefty: ${newVsLefty}`);
  updated = updated.replace(/\bpoise:\s*\d+/,    `poise: ${newPoise}`);
  updated = updated.replace(/\brecovery:\s*\d+/, `recovery: ${newRecovery}`);

  return { updated, changed: updated !== block };
}

// ── Roster files ─────────────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
let grandTotal = 0;
let grandChanged = 0;

for (const filePath of ROSTER_FILES) {
  if (!fs.existsSync(filePath)) {
    console.log(`  skip ${filePath} (not found)`);
    continue;
  }

  const original = fs.readFileSync(filePath, "utf-8");
  let fileChanged = 0;
  let filePitchers = 0;

  // Player entries are `{ ... }` blocks with NO nested braces
  // (pitchMix args use [] not {}).  /\{[^{}]+\}/gms matches each player entry.
  const updated = original.replace(/\{([^{}]+)\}/gms, (match) => {
    if (!match.includes('position: "P"')) return match;
    filePitchers++;
    grandTotal++;
    const { updated: u, changed } = transformPitcher(match);
    if (changed) { fileChanged++; grandChanged++; }
    return u;
  });

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, "utf-8");
    console.log(`✓ ${filePath}: ${filePitchers} pitchers, ${fileChanged} updated`);
  } else {
    console.log(`  ${filePath}: ${filePitchers} pitchers, 0 changes`);
  }
}

console.log(`\nDone — ${grandTotal} pitchers scanned, ${grandChanged} updated.`);
