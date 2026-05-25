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
 *
 * Section 2 validates the archetype-based pitch generator (generateArchetypePitchMix)
 * against a synthetic sample to ensure pitch counts, level caps, and binary
 * field rules are all respected at runtime.
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
import {
  assignPitcherArchetype,
  generateArchetypePitchMix,
  qualityTierFromOvr,
  type PitcherArchetype,
  type QualityTier,
} from "../server/pitchMixHelpers";

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

const BINARY_PITCH_FIELDS = new Set(["pitchFB", "pitch2S", "pitchCH"]);
const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);

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
      if (!PITCHER_POSITIONS.has(player.position)) continue;
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

if (violations.length > 0) {
  console.error(
    `\n✗ Found ${violations.length} pitch-mix field violation(s):\n`
  );

  const byFile = new Map<string, PitchViolation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
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
`);
  process.exit(1);
}

// ─── Section 2: Archetype generator distribution checks ──────────────────────
// Generate a synthetic sample and validate pitch counts, level caps, and
// binary field rules for the runtime archetype system.

const SAMPLE_SIZE = 500;

const archetypes: PitcherArchetype[] = [
  "power_starter", "command_lefty", "reliever", "junkball", "sinkerballer",
];
const tiers: QualityTier[] = ["elite", "great", "solid", "average"];
const tierOvr: Record<QualityTier, number> = {
  elite: 550, great: 430, solid: 320, average: 240,
};
const tierPitchRange: Record<QualityTier, [number, number]> = {
  elite:   [5, 6],
  great:   [4, 5],
  solid:   [3, 4],
  average: [2, 3],
};

// Pitches that must NEVER appear for a given archetype (not in the pool)
const DISALLOWED_PITCHES: Partial<Record<PitcherArchetype, (keyof ReturnType<typeof generateArchetypePitchMix>)[]>> = {
  reliever:    ["pitch2S", "pitchCT"],
  junkball:    ["pitch2S"],
  sinkerballer: ["pitch2S"],
};

let archetypeErrors = 0;

console.log("\n── Archetype pitch-mix generator checks ──");

for (const archetype of archetypes) {
  for (const tier of tiers) {
    const [minPitches, maxPitches] = tierPitchRange[tier];
    const ovr = tierOvr[tier];
    const resolvedTier = qualityTierFromOvr(ovr);
    const disallowed = DISALLOWED_PITCHES[archetype] ?? [];

    let tooFew = 0;
    let tooMany = 0;
    let binaryViolation = 0;
    let levelViolation = 0;
    let eliteSignatureViolation = 0;
    let disallowedViolation = 0;

    for (let n = 0; n < SAMPLE_SIZE; n++) {
      const mix = generateArchetypePitchMix(archetype, resolvedTier);
      const pitchKeys = Object.keys(mix) as (keyof typeof mix)[];
      const activePitches = pitchKeys.filter(k => mix[k] > 0);
      const count = activePitches.length;

      if (count < minPitches) tooFew++;
      if (count > maxPitches) tooMany++;

      for (const k of activePitches) {
        const v = mix[k];
        if (BINARY_PITCH_FIELDS.has(k) && v > 1) binaryViolation++;
        if (!BINARY_PITCH_FIELDS.has(k) && k !== "pitchFB" && (v < 2 || v > 7)) levelViolation++;
        if (disallowed.includes(k as never)) disallowedViolation++;
      }

      if (tier === "elite") {
        const nonBinarySecondary = activePitches.filter(k => !BINARY_PITCH_FIELDS.has(k));
        const signature = nonBinarySecondary.filter(k => mix[k] >= 5);
        if (signature.length > 1) eliteSignatureViolation++;
      }
    }

    const label = `${archetype}/${tier}`;
    const pass = tooFew === 0 && tooMany === 0 && binaryViolation === 0 &&
                 levelViolation === 0 && eliteSignatureViolation === 0 && disallowedViolation === 0;
    if (!pass) {
      archetypeErrors++;
      console.error(`  ✗ ${label}: tooFew=${tooFew} tooMany=${tooMany} binaryViolation=${binaryViolation} levelViolation=${levelViolation} eliteSignatureViolation=${eliteSignatureViolation} disallowedViolation=${disallowedViolation}`);
    }
  }
}

// Verify assignPitcherArchetype routing
const archetypeRoutingChecks: { label: string; pass: boolean }[] = [
  { label: "RP→reliever",    pass: assignPitcherArchetype("RP", "R", 70, 60, 65, 55) === "reliever" },
  { label: "CP→reliever",    pass: assignPitcherArchetype("CP", "R", 70, 60, 65, 55) === "reliever" },
  { label: "SP+L+ctrl≥velo→command_lefty",
    pass: assignPitcherArchetype("SP", "L", 60, 70, 65, 55) === "command_lefty" },
  { label: "P+R+ctrl≥velo→NOT command_lefty",
    pass: assignPitcherArchetype("P", "R", 60, 70, 65, 55) !== "command_lefty" },
  { label: "P+high velo→power_starter",
    pass: assignPitcherArchetype("P", "R", 85, 55, 60, 60) === "power_starter" },
];

for (const check of archetypeRoutingChecks) {
  if (!check.pass) {
    archetypeErrors++;
    console.error(`  ✗ archetype routing: ${check.label}`);
  }
}

if (archetypeErrors > 0) {
  console.error(`\n✗ ${archetypeErrors} archetype validation failure(s). See above.\n`);
  process.exit(1);
}

console.log(`  ✓ ${archetypes.length * tiers.length} archetype/tier combos × ${SAMPLE_SIZE} samples: all pitch counts, level caps, and binary rules correct`);
console.log(`  ✓ Archetype routing checks: ${archetypeRoutingChecks.length}/${archetypeRoutingChecks.length} passed`);
console.log("\n✓ All pitcher pitch-mix fields are valid.");
process.exit(0);
