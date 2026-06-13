/**
 * Pitch-mix field validator.
 *
 * Schema rules (server/pitchMixHelpers.ts):
 *   - pitchFB, pitch2S, pitchFK, pitchSFF, pitchKN are binary: 0 or 1.
 *   - pitchCH and all other pitch slots must be integers in 0-7.
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
  qualityTierFromStars,
  type PitcherArchetype,
  type QualityTier,
} from "../server/pitchMixHelpers";
import { generateRecruitClass, type GeneratedRecruit } from "../server/recruit-generator";

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
// pitchKN added as binary for generated recruit validation
const BINARY_PITCH_FIELDS = new Set(["pitchFB", "pitch2S", "pitchFK", "pitchSFF", "pitchKN"]);

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
  "sweeper_specialist", "cutter_pitcher", "knuckleballer",
];
const tiers: QualityTier[] = ["elite", "great", "solid", "average"];

// Reliever and knuckleballer are capped at 3 total pitches regardless of tier.
// Knuckleballer average gets only FB + KN = 2 pitches.
const DEFAULT_TIER_RANGE: Record<QualityTier, [number, number]> = {
  elite:   [5, 6],
  great:   [4, 5],
  solid:   [3, 4],
  average: [2, 3],
};

const ARCHETYPE_TIER_RANGE: Partial<Record<PitcherArchetype, Record<QualityTier, [number, number]>>> = {
  reliever: {
    elite:   [3, 3],
    great:   [3, 3],
    solid:   [3, 3],
    average: [2, 3],
  },
  knuckleballer: {
    elite:   [3, 3],
    great:   [3, 3],
    solid:   [3, 3],
    average: [2, 2],
  },
};

// Pitches that must NEVER appear for a given archetype (not in the pool).
// pitchSPL is globally excluded from all generated recruit pools.
const DISALLOWED_PITCHES: Partial<Record<PitcherArchetype, string[]>> = {
  // power_starter pool: SL, CB, VSL, PCB, CH, HSL, CT — no 2S
  power_starter:     ["pitch2S"],
  // sweeper_specialist pool: SWP, VSL, CB, CH, SL, HSL — no 2S, SNK, CT
  sweeper_specialist: ["pitch2S", "pitchSNK", "pitchCT"],
  // cutter_pitcher pool: CT, HSL, SL, SNK, CH, CB — no 2S, SWP
  cutter_pitcher:    ["pitch2S", "pitchSWP"],
  // junkball pool: CB, CH, SCB, CCH, SHU, SL, FK — no 2S, SNK, CT, SWP
  junkball:          ["pitch2S", "pitchSNK", "pitchCT", "pitchSWP"],
  // reliever pool: SL, SWP, CB, HSL, VSL — no 2S, CT
  reliever:          ["pitch2S", "pitchCT"],
  // knuckleballer: KN always, then CH/SL/CB secondaries — no 2S, CT, SNK, SWP
  knuckleballer:     ["pitch2S", "pitchCT", "pitchSNK", "pitchSWP"],
  // sinkerballer pool: SNK, CT, SL, HSL, 2S, SHU — pitch2S IS now in pool
  // command_lefty pool: CH, CB, SL, 2S, CCH, SCB, SNK — no restrictions needed
};

let archetypeErrors = 0;

console.log("\n── Archetype pitch-mix generator checks ──");

for (const archetype of archetypes) {
  for (const tier of tiers) {
    const rangeMap = ARCHETYPE_TIER_RANGE[archetype] ?? DEFAULT_TIER_RANGE;
    const [minPitches, maxPitches] = rangeMap[tier];
    const disallowed = DISALLOWED_PITCHES[archetype] ?? [];

    let tooFew = 0;
    let tooMany = 0;
    let binaryViolation = 0;
    let levelViolation = 0;
    let eliteSignatureViolation = 0;
    let disallowedViolation = 0;

    for (let n = 0; n < SAMPLE_SIZE; n++) {
      const mix = generateArchetypePitchMix(archetype, tier);
      const pitchKeys = Object.keys(mix) as (keyof typeof mix)[];
      const activePitches = pitchKeys.filter(k => mix[k] > 0);
      const count = activePitches.length;

      if (count < minPitches) tooFew++;
      if (count > maxPitches) tooMany++;

      for (const k of activePitches) {
        const v = mix[k];
        if (BINARY_PITCH_FIELDS.has(k) && v > 1) binaryViolation++;
        if (!BINARY_PITCH_FIELDS.has(k) && k !== "pitchFB" && (v < 2 || v > 7)) levelViolation++;
        if (disallowed.includes(k as string)) disallowedViolation++;
      }

      // Elite signature: exactly one non-binary secondary should be 5-7
      // (knuckleballer KN is binary so its high level is encoded differently)
      if (tier === "elite" && archetype !== "knuckleballer") {
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
// Note: SP/P checks are run 200 times to be robust against the 2% knuckleballer roll.
// RP/CP checks are deterministic (knuckleballer is immune for relievers).
function routingFreq(
  position: string, hand: string,
  vel: number, ctrl: number, stam: number, stuff: number,
  target: PitcherArchetype | PitcherArchetype[],
  runs = 200,
  minPct = 0.90,
): boolean {
  const targets = Array.isArray(target) ? target : [target];
  let hits = 0;
  for (let i = 0; i < runs; i++) {
    if (targets.includes(assignPitcherArchetype(position, hand, vel, ctrl, stam, stuff))) hits++;
  }
  return hits / runs >= minPct;
}

const archetypeRoutingChecks: { label: string; pass: boolean }[] = [
  { label: "RP→reliever (deterministic)",
    pass: assignPitcherArchetype("RP", "R", 70, 60, 65, 55) === "reliever" },
  { label: "CP→reliever (deterministic)",
    pass: assignPitcherArchetype("CP", "R", 70, 60, 65, 55) === "reliever" },
  { label: "SP+L+ctrl≥velo→command_lefty (≥90% of 200 runs)",
    pass: routingFreq("SP", "L", 60, 70, 65, 55, "command_lefty") },
  { label: "P+R+ctrl≥velo→NOT command_lefty (0 of 200 runs should be command_lefty)",
    pass: Array.from({ length: 200 }, () =>
      assignPitcherArchetype("P", "R", 60, 70, 65, 55)
    ).every(r => r !== "command_lefty") },
  { label: "P+high velo dominant→power_starter/sweeper/cutter (≥90% of 200 runs)",
    pass: routingFreq("P", "R", 85, 55, 60, 60, ["power_starter", "sweeper_specialist", "cutter_pitcher"]) },
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
// pitchCountForTier defines the authoritative caps for standard archetypes:
//   elite   → exactly 5   (cap ≤ 5)
//   great   → exactly 4   (cap ≤ 4)
//   solid   → 3–4         (cap ≤ 4)
//   average → 2–3         (cap ≤ 3)
//
// Reliever and knuckleballer are capped at 3 regardless of tier.
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

// Per-archetype max pitch caps (overrides TIER_CAPS for cap-limited archetypes)
const ARCHETYPE_TIER_CAPS: Partial<Record<PitcherArchetype, number>> = {
  reliever:     3,
  knuckleballer: 3,
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

// 3b: generateArchetypePitchMix never produces more active pitches than the archetype cap
for (const archetype of archetypes) {
  for (const tier of tiers) {
    const cap = ARCHETYPE_TIER_CAPS[archetype] ?? TIER_CAPS[tier];
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

// ─── Section 5: Full recruit-class pipeline pitcher arsenal tier-cap check ────
//
// Calls generateRecruitClass() the same way the dynasty startup and season-
// transition code does, then inspects the FINAL stored pitch fields on every
// pitcher in the class.  This catches any regression introduced between
// generateArchetypePitchMix and the fully assembled GeneratedRecruit object
// (e.g. a spread overwrite, a retry loop that bypasses the cap, or a star-band
// → tier mapping drift).
//
// Each run produces 80 recruits.  10 runs × 80 = 800 recruits total, which
// gives solid stochastic coverage while keeping the script fast (<2 s).
// Failures report star band, archetype (re-derived from the recruit's own
// attributes), cap, and observed active pitch count.

console.log("\n── Full recruit-class pipeline pitcher arsenal tier-cap check ──");

// All 17 pitch types (no pitchSPL for generated recruits)
const RECRUIT_PITCH_FIELDS = [
  "pitchFB", "pitch2S", "pitchSL", "pitchCB", "pitchCH",
  "pitchCT", "pitchSNK", "pitchVSL", "pitchSHU", "pitchCCH",
  "pitchHSL", "pitchSWP", "pitchKN", "pitchSCB", "pitchPCB",
  "pitchFK", "pitchSFF",
] as const;

const PITCHER_POS = new Set(["P", "SP", "RP", "CP", "CL"]);

const CLASS_RUNS   = 10;   // independent recruit classes
const CLASS_SIZE   = 80;   // matches the real game default
let   pipelineErrors = 0;

interface PipelineViolation {
  run: number;
  stars: number;
  tier: QualityTier;
  cap: number;
  active: number;
  archetype: string;
}

const pipelineViolations: PipelineViolation[] = [];

for (let run = 0; run < CLASS_RUNS; run++) {
  const recruits: GeneratedRecruit[] = generateRecruitClass(CLASS_SIZE);

  for (const recruit of recruits) {
    if (!PITCHER_POS.has(recruit.position ?? "")) continue;

    const stars  = recruit.starRating ?? 3;
    const tier   = qualityTierFromStars(stars);
    // Use tier-based caps here — this matches what the trim code in
    // recruit-generator.ts enforces. Archetype-specific caps (reliever/knuckleballer=3)
    // are verified in Section 2. The archetype is NOT stored on the recruit
    // object, so re-deriving it here would introduce stochastic false positives.
    const cap = TIER_CAPS[tier];

    // Count active pitches in the fully assembled recruit object
    const raw = recruit as unknown as Record<string, unknown>;
    const active = RECRUIT_PITCH_FIELDS.filter(f => typeof raw[f] === "number" && (raw[f] as number) > 0).length;

    if (active > cap) {
      const archetype = assignPitcherArchetype(
        recruit.position ?? "P",
        recruit.throwHand ?? "R",
        recruit.velocity ?? 50,
        recruit.control ?? 50,
        recruit.stamina ?? 50,
        recruit.stuff ?? 50,
      );
      pipelineViolations.push({ run: run + 1, stars, tier, cap, active, archetype });
    }
  }
}

// Group violations and print them
if (pipelineViolations.length > 0) {
  pipelineErrors++;
  console.error(`  ✗ ${pipelineViolations.length} pitcher(s) exceeded their tier cap in ${CLASS_RUNS} generated classes:\n`);
  for (const v of pipelineViolations) {
    console.error(
      `    run ${v.run}: ${v.stars}★ recruit (tier="${v.tier}", archetype="${v.archetype}")`
      + ` — ${v.active} active pitches, cap is ${v.cap}`
    );
  }
}

// Also verify qualityTierFromStars produces the expected tier for each band
const EXPECTED_TIERS: Record<number, QualityTier> = {
  1: "average",
  2: "average",
  3: "solid",
  4: "great",
  5: "elite",
};

for (const [starsStr, want] of Object.entries(EXPECTED_TIERS)) {
  const stars = Number(starsStr);
  const got = qualityTierFromStars(stars);
  if (got !== want) {
    pipelineErrors++;
    console.error(`  ✗ qualityTierFromStars(${stars}): expected "${want}", got "${got}"`);
  }
}

if (pipelineErrors > 0) {
  console.error(
    `\n✗ ${pipelineErrors} recruit-class pitcher arsenal violation(s). ` +
    `The recruit-generator pipeline is producing arsenals above the tier cap.\n`
  );
  process.exit(1);
}

const totalPitchers = CLASS_RUNS * CLASS_SIZE;  // ≥ actual pitcher count
console.log(
  `  ✓ qualityTierFromStars: all 5 star bands map to expected tiers`
);
console.log(
  `  ✓ generateRecruitClass: ${CLASS_RUNS} runs × ${CLASS_SIZE} recruits — `
  + `all pitcher final objects at or below tier cap`
);

console.log("\n✓ All pitcher pitch-mix fields are valid.");
process.exit(0);
