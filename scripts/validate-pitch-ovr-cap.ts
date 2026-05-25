/**
 * Pitch-level OVR-cap validator.
 *
 * Rules:
 *   - Pitchers with OVR ≤ 500: pitchSL/CB/CT/SNK/SPL must be ≤ 5
 *   - Pitchers with OVR ≤ 400: pitchSL/CB/CT/SNK/SPL must be ≤ 4
 *
 * Only true elite arms (501+ OVR) may throw a signature-level 6–7 secondary.
 * Mid-tier arms (401–500 OVR) cap at 5. Below-average arms (≤400 OVR) cap at 4.
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
import { PAC12_ROSTERS } from "../server/pac12Rosters";
import { MWC_ROSTERS } from "../server/mwcRosters";
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { BIG_12_ROSTERS } from "../server/big12Rosters";
import { AAC_ROSTERS } from "../server/aacRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

const ALL_ROSTERS: Record<string, Record<string, RealPlayer[]>> = {
  "SEC Batch 1": SEC_BATCH1_ROSTERS,
  "SEC Batch 2": SEC_BATCH2_ROSTERS,
  "SEC Batch 3": SEC_BATCH3_ROSTERS,
  "ACC Batch 1": ACC_BATCH1_ROSTERS,
  "ACC Batch 2": ACC_BATCH2_ROSTERS,
  "ACC Batch 3": ACC_BATCH3_ROSTERS,
  "Big Ten Batch 1": BIG_TEN_BATCH1_ROSTERS,
  "Big Ten Batch 2": BIG_TEN_BATCH2_ROSTERS,
  "Big Ten Batch 3": BIG_TEN_BATCH3_ROSTERS,
  "Pac-12": PAC12_ROSTERS,
  "Mountain West": MWC_ROSTERS,
  "Ivy League": IVY_LEAGUE_ROSTERS,
  "Sun Belt": SUN_BELT_ROSTERS,
  "Big West": BIG_WEST_ROSTERS,
  "HBCU": HBCU_ROSTERS,
  "Missouri Valley": MO_VALLEY_ROSTERS,
  "Big 12": BIG_12_ROSTERS,
  "AAC": AAC_ROSTERS,
  "WCC": WCC_ROSTERS,
};

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);
const LEVELED_PITCH_FIELDS = ["pitchSL", "pitchCB", "pitchCT", "pitchSNK", "pitchSPL"] as const;

interface OvrCapViolation {
  file: string;
  team: string;
  player: string;
  ovr: number;
  field: string;
  value: number;
  cap: number;
  rule: string;
}

const violations: OvrCapViolation[] = [];

for (const [fileName, rosters] of Object.entries(ALL_ROSTERS)) {
  for (const [teamName, players] of Object.entries(rosters)) {
    for (const player of players) {
      if (!PITCHER_POSITIONS.has(player.position)) continue;

      const ovr = calculateOVR(player as Parameters<typeof calculateOVR>[0]);
      const playerName = `${player.firstName} ${player.lastName}`;
      const raw = player as unknown as Record<string, number>;

      for (const field of LEVELED_PITCH_FIELDS) {
        const value = typeof raw[field] === "number" ? raw[field] : 0;
        if (value === 0) continue;

        if (ovr <= 400 && value >= 5) {
          violations.push({
            file: fileName, team: teamName, player: playerName,
            ovr, field, value, cap: 4,
            rule: "OVR ≤ 400 → leveled pitches must be ≤ 4",
          });
        } else if (ovr <= 500 && value >= 6) {
          violations.push({
            file: fileName, team: teamName, player: playerName,
            ovr, field, value, cap: 5,
            rule: "OVR ≤ 500 → leveled pitches must be ≤ 5",
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ Found ${violations.length} pitch OVR-cap violation(s):\n`);

  const byFile = new Map<string, OvrCapViolation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  for (const [file, fileViolations] of byFile) {
    console.error(`  [${file}]`);
    for (const v of fileViolations) {
      console.error(`    ${v.team} / ${v.player} (OVR ${v.ovr}): ${v.field}=${v.value} → cap ${v.cap}  [${v.rule}]`);
    }
  }

  console.error(`
Fix: lower the flagged pitch levels to their OVR-tier cap.
     ≤400 OVR: pitchSL/CB/CT/SNK/SPL must be ≤ 4
     ≤500 OVR: pitchSL/CB/CT/SNK/SPL must be ≤ 5
`);
  process.exit(1);
}

console.log("✓ All pitcher pitch levels are within OVR-tier caps.");
process.exit(0);
