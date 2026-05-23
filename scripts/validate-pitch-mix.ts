/**
 * Pitch-mix field validator.
 *
 * Schema rules (server/pitchMixHelpers.ts):
 *   - pitchFB, pitch2S, and pitchCH are binary: 0 or 1.
 *   - pitchSL / pitchCB / pitchCT / pitchSNK / pitchSPL must be
 *     integers in 0-7.
 *
 * A value > 7 in any field indicates the author used the wrong 0-100
 * velocity scale instead of the correct 1-7 bucket scale.  Without this
 * script the bad data ships without any author-visible warning.
 *
 * This script imports every roster file directly (bypassing the
 * normalization loop in server/realRosters.ts) so the raw authored values
 * are checked.
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
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { BIG_12_ROSTERS } from "../server/big12Rosters";
import { AAC_ROSTERS } from "../server/aacRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import type { RealPlayer } from "../server/realRosters";

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
  "Ivy League": IVY_LEAGUE_ROSTERS,
  "Sun Belt": SUN_BELT_ROSTERS,
  "Big West": BIG_WEST_ROSTERS,
  "HBCU": HBCU_ROSTERS,
  "Missouri Valley": MO_VALLEY_ROSTERS,
  "Big 12": BIG_12_ROSTERS,
  "AAC": AAC_ROSTERS,
  "WCC": WCC_ROSTERS,
  "Pac-12": PAC12_ROSTERS,
};

const PITCH_FIELDS = [
  "pitchFB",
  "pitch2S",
  "pitchSL",
  "pitchCB",
  "pitchCH",
  "pitchCT",
  "pitchSNK",
  "pitchSPL",
] as const;

// Fields that must be binary (0 or 1). Any value > 1 is a violation.
const BINARY_PITCH_FIELDS = new Set(["pitchFB", "pitch2S", "pitchCH"]);

interface PitchViolation {
  file: string;
  team: string;
  player: string;
  field: string;
  value: number;
  reason: string;
}

const violations: PitchViolation[] = [];

for (const [fileName, rosters] of Object.entries(ALL_ROSTERS)) {
  for (const [teamName, players] of Object.entries(rosters)) {
    for (const player of players) {
      if (player.position !== "P") continue;
      const playerName = `${player.firstName} ${player.lastName}`;
      const raw = player as unknown as Record<string, unknown>;
      for (const field of PITCH_FIELDS) {
        const value = typeof raw[field] === "number" ? (raw[field] as number) : 0;
        if (BINARY_PITCH_FIELDS.has(field) && value > 1) {
          violations.push({ file: fileName, team: teamName, player: playerName, field, value, reason: "binary field (must be 0 or 1); CH is presence-only" });
        } else if (!BINARY_PITCH_FIELDS.has(field) && value > 7) {
          violations.push({ file: fileName, team: teamName, player: playerName, field, value, reason: "wrong 0-100 scale (must be 0-7)" });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    "✓ All pitcher pitch-mix fields are valid: binary fields (FB/2S/CH) are 0-1, secondaries (SL/CB/CT/SNK/SPL) are 0-7."
  );
  process.exit(0);
}

console.error(
  `\n✗ Found ${violations.length} pitch-mix field violation(s):\n`
);

const byFile = new Map<string, PitchViolation[]>();
for (const v of violations) {
  const key = v.file;
  if (!byFile.has(key)) byFile.set(key, []);
  byFile.get(key)!.push(v);
}

for (const [file, fileViolations] of byFile) {
  console.error(`  [${file}]`);
  for (const v of fileViolations) {
    console.error(`    ${v.team} / ${v.player}: ${v.field}=${v.value} (${v.reason})`);
  }
}

console.error(`
Fix: use the pitchMix() helper from server/pitchMixHelpers.ts instead of
     setting pitch fields inline with 0-100 velocity values.

     Example:
       ...pitchMix(88, [0, 75, 68, 62, 0, 0, 0])
       // args: primary (any non-zero -> FB=1), [2S, SL, CB, CH, CT, SNK, SPL]

     pitchMix() automatically detects and re-buckets 0-100 inputs to 1-7.
     If you intentionally used 0-100 values inline, wrap them in pitchMix()
     so the intent is explicit and the runtime safety belt is not needed.
`);

process.exit(1);
