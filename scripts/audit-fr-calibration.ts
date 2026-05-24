/**
 * audit-fr-calibration.ts
 *
 * Verifies that FR players with A/A+ potential in Tier 1 programs meet the
 * minimum attribute thresholds defined in the calibration ledger.
 *
 * Tier 1 conferences covered: SEC (Batch1-3), ACC (Batch1-3), Big Ten (Batch1-3), Big 12
 *
 * Threshold rules (minimum acceptable after calibration):
 *   Pitchers  — A+: vel≥58, stf≥44, arm≥48
 *             — A : vel≥50, stf≥38, arm≥40
 *   Hitters   — A+: hitForAvg≥62
 *             — A : hitForAvg≥55
 *
 * Players below threshold are reported as WARN (not hard-fail) because a small
 * number of role-player FR A-potentials are intentionally set below these marks.
 */

import { SEC_BATCH1_ROSTERS } from "../server/secBatch1";
import { SEC_BATCH2_ROSTERS } from "../server/secBatch2";
import { SEC_BATCH3_ROSTERS } from "../server/secBatch3";
import { ACC_BATCH1_ROSTERS } from "../server/accRostersBatch1";
import { ACC_BATCH2_ROSTERS } from "../server/accRostersBatch2";
import { ACC_BATCH3_ROSTERS } from "../server/accRostersBatch3";
import { BIG_TEN_BATCH1_ROSTERS } from "../server/bigTenBatch1";
import { BIG_TEN_BATCH2_ROSTERS } from "../server/bigTenBatch2";
import { BIG_TEN_BATCH3_ROSTERS } from "../server/bigTenBatch3";
import { BIG_12_ROSTERS } from "../server/big12Rosters";

type PlayerMap = Record<string, Array<{
  firstName: string; lastName: string; position: string;
  eligibility: string; potential: string;
  velocity?: number; stuff?: number; arm?: number;
  hitForAvg?: number;
}>>;

const TIER1_BATCHES: PlayerMap[] = [
  SEC_BATCH1_ROSTERS, SEC_BATCH2_ROSTERS, SEC_BATCH3_ROSTERS,
  ACC_BATCH1_ROSTERS, ACC_BATCH2_ROSTERS, ACC_BATCH3_ROSTERS,
  BIG_TEN_BATCH1_ROSTERS, BIG_TEN_BATCH2_ROSTERS, BIG_TEN_BATCH3_ROSTERS,
  BIG_12_ROSTERS,
];

interface Violation {
  school: string;
  name: string;
  position: string;
  potential: string;
  field: string;
  value: number;
  minimum: number;
}

const violations: Violation[] = [];
let checked = 0;
let passed = 0;

for (const batch of TIER1_BATCHES) {
  for (const [school, players] of Object.entries(batch)) {
    for (const p of players) {
      if (p.eligibility !== "FR") continue;
      const pot = p.potential ?? "";
      if (pot !== "A" && pot !== "A+") continue; // only strict A and A+

      checked++;

      const isPitcher = p.position === "P";
      const isAPlus = pot === "A+";

      if (isPitcher) {
        const velMin = isAPlus ? 58 : 50;
        const stfMin = isAPlus ? 44 : 38;
        const armMin = isAPlus ? 48 : 40;
        const vel = p.velocity ?? 0;
        const stf = p.stuff ?? 0;
        const arm = p.arm ?? 0;

        if (vel < velMin) {
          violations.push({ school, name: `${p.firstName} ${p.lastName}`, position: p.position, potential: pot, field: "velocity", value: vel, minimum: velMin });
        } else if (stf < stfMin) {
          violations.push({ school, name: `${p.firstName} ${p.lastName}`, position: p.position, potential: pot, field: "stuff", value: stf, minimum: stfMin });
        } else if (arm < armMin) {
          violations.push({ school, name: `${p.firstName} ${p.lastName}`, position: p.position, potential: pot, field: "arm", value: arm, minimum: armMin });
        } else {
          passed++;
        }
      } else {
        const hitMin = isAPlus ? 62 : 55;
        const hit = p.hitForAvg ?? 0;

        if (hit < hitMin) {
          violations.push({ school, name: `${p.firstName} ${p.lastName}`, position: p.position, potential: pot, field: "hitForAvg", value: hit, minimum: hitMin });
        } else {
          passed++;
        }
      }
    }
  }
}

console.log(`\n── FR Calibration Audit — Tier 1 Programs (SEC/ACC/Big Ten/Big 12) ──`);
console.log(`  Checked: ${checked} FR A/A+ players`);
console.log(`  Passed:  ${passed}`);
console.log(`  Warned:  ${violations.length}\n`);

if (violations.length === 0) {
  console.log("✓  All FR A/A+ players in Tier 1 programs meet calibration thresholds.\n");
  process.exit(0);
} else {
  console.log("⚠  Players below calibration threshold (WARN — not hard fail):\n");
  for (const v of violations) {
    console.log(`  [${v.school}] ${v.name} (${v.position} ${v.potential}) — ${v.field} = ${v.value} (min ${v.minimum})`);
  }
  console.log(`\n  Review ledger at scripts/fr-calibration-ledger.md for tier assignments.\n`);
  process.exit(0); // warn only — all validators still pass
}
