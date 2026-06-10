/**
 * Pitch-mix field validator.
 *
 * Schema rules (server/pitchMixHelpers.ts):
 *   - pitchFB, pitch2S, pitchCH, pitchFK, and pitchSFF are binary: 0 or 1.
 *   - pitchSL / pitchCB / pitchCT / pitchSNK / pitchSPL / pitchSHU must be
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
 *
 * Section 3 reports the actual pitch distribution across all roster pitchers.
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
import {
  assignPitcherArchetype,
  generateArchetypePitchMix,
  pitchCountForTier,
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

const PITCH_FIELDS = [
  "pitchFB",
  "pitch2S",
  "pitchSL",
  "pitchCB",
  "pitchCH",
  "pitchCT",
  "pitchSNK",
  "pitchSPL",
  "pitchFK",
  "pitchSFF",
  "pitchSHU",
] as const;

// Binary fields: must be 0 or 1
const BINARY_PITCH_FIELDS = new Set(["pitchFB", "pitch2S", "pitchCH", "pitchFK", "pitchSFF"]);

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

// ─── Section 1: Field-level validation ───────────────────────────────────────
for (const [fileName, rosters] of Object.entries(ALL_ROSTERS)) {
  for (const [teamName, players] of Object.entries(rosters)) {
    for (const player of players) {
      if (!PITCHER_POSITIONS.has(player.position)) continue;
      const playerName = `${player.firstName} ${player.lastName}`;
      const raw = player as unknown as Record<string, unknown>;
      for (const field of PITCH_FIELDS) {
        const value = typeof raw[field] === "number" ? (raw[field] as number) : 0;
        if (BINARY_PITCH_FIELDS.has(field) && value > 1) {
          violations.push({ file: fileName, team: teamName, player: playerName, field, value, reason: "binary field (must be 0 or 1)" });
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

// ─── Section 3: Per-tier pitch count cap assertions ───────────────────────────
//
// pitchCountForTier defines the authoritative caps:
//   elite   → exactly 5   (cap ≤ 5)
//   great   → exactly 4   (cap ≤ 4)
//   solid   → 3–4         (cap ≤ 4)
//   average → 2–3         (cap ≤ 3)
//
// Two sub-checks:
//   3a. pitchCountForTier itself never returns above cap.
//   3b. generateArchetypePitchMix never produces more active pitches than cap.
//       (FB counts as one active pitch, so elite cap=5 means at most 5 total.)

const TIER_CAPS: Record<QualityTier, number> = {
  elite:   5,
  great:   4,
  solid:   4,
  average: 3,
};

const TIER_FLOORS: Record<QualityTier, number> = {
  elite:   5,
  great:   4,
  solid:   3,
  average: 2,
};

const CAP_SAMPLE = 2000;
let capErrors = 0;

console.log("\n── Per-tier pitch count cap assertions ──");

// 3a: pitchCountForTier never returns above cap or below floor
for (const tier of tiers) {
  const cap   = TIER_CAPS[tier];
  const floor = TIER_FLOORS[tier];
  let aboveCap  = 0;
  let belowFloor = 0;
  for (let n = 0; n < CAP_SAMPLE; n++) {
    const count = pitchCountForTier(tier);
    if (count > cap)   aboveCap++;
    if (count < floor) belowFloor++;
  }
  if (aboveCap > 0 || belowFloor > 0) {
    capErrors++;
    console.error(`  ✗ pitchCountForTier("${tier}"): aboveCap(>${cap})=${aboveCap} belowFloor(<${floor})=${belowFloor} / ${CAP_SAMPLE} samples`);
  }
}

// 3b: generateArchetypePitchMix never produces more active pitches than cap
for (const archetype of archetypes) {
  for (const tier of tiers) {
    const cap = TIER_CAPS[tier];
    let exceeded = 0;
    for (let n = 0; n < CAP_SAMPLE; n++) {
      const mix = generateArchetypePitchMix(archetype, tier);
      const active = (Object.keys(mix) as (keyof typeof mix)[]).filter(k => mix[k] > 0).length;
      if (active > cap) exceeded++;
    }
    if (exceeded > 0) {
      capErrors++;
      console.error(`  ✗ generateArchetypePitchMix("${archetype}", "${tier}"): ${exceeded}/${CAP_SAMPLE} mixes exceeded cap of ${cap} active pitches`);
    }
  }
}

if (capErrors > 0) {
  console.error(`\n✗ ${capErrors} pitch count cap violation(s). pitchCountForTier or generateArchetypePitchMix is producing arsenals above the tier cap.\n`);
  process.exit(1);
}

console.log(`  ✓ pitchCountForTier: all ${tiers.length} tiers × ${CAP_SAMPLE} samples within [floor, cap]`);
console.log(`  ✓ generateArchetypePitchMix: all ${archetypes.length * tiers.length} archetype/tier combos × ${CAP_SAMPLE} samples at or below cap`);

// ─── Section 4: Distribution report ──────────────────────────────────────────
console.log("\n── Pitch distribution across all real pitchers ──");

const counts: Record<string, number> = {
  pitchFB: 0, pitch2S: 0, pitchSL: 0, pitchCB: 0, pitchCH: 0,
  pitchCT: 0, pitchSNK: 0, pitchSPL: 0, pitchFK: 0, pitchSFF: 0, pitchSHU: 0,
};
let pitcherTotal = 0;

for (const rosters of Object.values(ALL_ROSTERS)) {
  for (const players of Object.values(rosters)) {
    for (const player of players) {
      if (!PITCHER_POSITIONS.has(player.position)) continue;
      pitcherTotal++;
      const raw = player as unknown as Record<string, unknown>;
      for (const field of PITCH_FIELDS) {
        const value = typeof raw[field] === "number" ? (raw[field] as number) : 0;
        if (value > 0) counts[field]++;
      }
    }
  }
}

const targets: Record<string, string> = {
  pitchFB:  "100%",  pitch2S:  "~18%", pitchSL:  "~40%", pitchCB:  "~40%",
  pitchCH:  "~35%",  pitchCT:  "~15%", pitchSNK: "~45%", pitchSPL: "~45%",
  pitchFK:  "~18%",  pitchSFF: "~18%", pitchSHU: "~25%",
};

const labels: Record<string, string> = {
  pitchFB: "FB ", pitch2S: "2S ", pitchSL: "SL ", pitchCB: "CB ",
  pitchCH: "CH ", pitchCT: "CT ", pitchSNK: "SNK", pitchSPL: "SPL",
  pitchFK: "FK ", pitchSFF: "SFF", pitchSHU: "SHU",
};

console.log(`  ${pitcherTotal} total pitchers\n`);
for (const field of PITCH_FIELDS) {
  const n = counts[field];
  const pct = ((n / pitcherTotal) * 100).toFixed(1);
  console.log(`  ${labels[field]}  ${String(n).padStart(4)}  (${pct.padStart(5)}%)   target ${targets[field]}`);
}

console.log("\n✓ All pitcher pitch-mix fields are valid.");
process.exit(0);
