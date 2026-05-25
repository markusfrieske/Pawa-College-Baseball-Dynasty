/**
 * Unified pitch-mix helper for all roster files.
 *
 * Schema rules (shared/schema.ts):
 *   - pitchFB, pitch2S, pitchCH, pitchFK, and pitchSFF are binary: 0 or 1.
 *   - All other pitch slots (SL/CB/CT/SNK/SPL/SHU/...) are integers 0-7.
 *
 * Canonical usage — all new roster files should call:
 *   pitchMix(1, [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU])
 * where secondaries are 0-7 integers (binary fields auto-clamped).
 *
 * Defensive coercions (applied automatically, logged once per context):
 *   - Primary > 1: collapsed to 1. pitchFB is binary; FB quality lives
 *     in the velocity/stuff/heater attributes, not this slot.
 *   - Any secondary value >= 30: the entire array is treated as a
 *     0-100 quality scale and bucketed to 1-7
 *     (80+ → 7, 70-79 → 6, 60-69 → 5, 50-59 → 4, 40-49 → 3,
 *      30-39 → 2, 1-29 → 1). The threshold 30 is chosen to distinguish
 *     true 0-100 inputs from a near-schema array that simply has a
 *     stray 8.
 *   - 2S, CH, FK, and SFF secondaries are always re-binarized after any
 *     other coercion.
 *
 * pitchMix() emits a single `[roster-sanity]` console.warn the first
 * time it has to coerce a given context, so regressions are surfaced
 * without log spam.
 */

export interface PitchMix {
  pitchFB: number;
  pitch2S: number;
  pitchSL: number;
  pitchCB: number;
  pitchCH: number;
  pitchCT: number;
  pitchSNK: number;
  pitchSPL: number;
  pitchFK: number;
  pitchSFF: number;
  pitchSHU: number;
}

export const noPitches: PitchMix = {
  pitchFB: 0, pitch2S: 0, pitchSL: 0, pitchCB: 0,
  pitchCH: 0, pitchCT: 0, pitchSNK: 0, pitchSPL: 0,
  pitchFK: 0, pitchSFF: 0, pitchSHU: 0,
};

const SECONDARY_KEYS = [
  "pitchSL", "pitchCB", "pitchCH", "pitchCT", "pitchSNK", "pitchSPL",
  "pitchFK", "pitchSFF", "pitchSHU",
] as const;

const warnedKeys = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[roster-sanity] ${msg}`);
}

function bucketFromVelocityScale(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 80) return 7;
  if (v >= 70) return 6;
  if (v >= 60) return 5;
  if (v >= 50) return 4;
  if (v >= 40) return 3;
  if (v >= 30) return 2;
  return 1;
}

function coerceSecondary(v: number, useBucket: boolean): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (useBucket) return bucketFromVelocityScale(v);
  if (v > 7) return 7;
  return Math.round(v);
}

/**
 * Unified pitchMix(primary, secondary) helper.
 *
 * primary    Any non-zero value -> pitchFB = 1 (FB is binary; quality
 *            lives in velocity/stuff/heater).
 * secondary  Positional 10-element array: [2S, SL, CB, CH, CT, SNK, SPL, FK, SFF, SHU].
 *            Trailing elements are optional (omitted = 0).
 *            If the largest value is >= 30 (VELOCITY_SCALE_THRESHOLD),
 *            the whole array is treated as a 0-100 quality scale and
 *            bucketed to 1-7.
 *            2S, CH, FK, and SFF are then re-binarized (0 or 1).
 *            SHU inherits SNK-level semantics (0-7).
 */
const VELOCITY_SCALE_THRESHOLD = 30;

export function pitchMix(primary: number, secondary: number[], context: string = "anonymous"): PitchMix {
  const safePrimary = Number.isFinite(primary) ? primary : 0;
  const safeSec = secondary.map(v => (Number.isFinite(v) ? v : 0));
  const max = Math.max(safePrimary, ...safeSec);
  const useBucket = max >= VELOCITY_SCALE_THRESHOLD;

  if (safePrimary > 1) {
    warnOnce(`${context}:fb`, `pitchMix(${context}): primary FB quality ${safePrimary} clamped to 1 (FB is binary)`);
  }
  if (useBucket) {
    warnOnce(`${context}:scale`, `pitchMix(${context}): inputs on 0-100 quality scale (max=${max}); rescaled to 1-7 buckets`);
  }

  const raw2S = safeSec[0] ?? 0;
  const pitch2S = raw2S >= 1 ? 1 : 0;

  const rawCH = coerceSecondary(safeSec[3] ?? 0, useBucket);
  if (rawCH > 1) {
    warnOnce(`${context}:ch`, `pitchMix(${context}): pitchCH quality ${rawCH} collapsed to 1 (CH is binary)`);
  }
  const pitchCH = rawCH >= 1 ? 1 : 0;

  const rawFK = coerceSecondary(safeSec[7] ?? 0, useBucket);
  if (rawFK > 1) {
    warnOnce(`${context}:fk`, `pitchMix(${context}): pitchFK quality ${rawFK} collapsed to 1 (FK is binary)`);
  }
  const pitchFK = rawFK >= 1 ? 1 : 0;

  const rawSFF = coerceSecondary(safeSec[8] ?? 0, useBucket);
  if (rawSFF > 1) {
    warnOnce(`${context}:sff`, `pitchMix(${context}): pitchSFF quality ${rawSFF} collapsed to 1 (SFF is binary)`);
  }
  const pitchSFF = rawSFF >= 1 ? 1 : 0;

  return {
    pitchFB: safePrimary >= 1 ? 1 : 0,
    pitch2S,
    pitchSL: coerceSecondary(safeSec[1] ?? 0, useBucket),
    pitchCB: coerceSecondary(safeSec[2] ?? 0, useBucket),
    pitchCH,
    pitchCT: coerceSecondary(safeSec[4] ?? 0, useBucket),
    pitchSNK: coerceSecondary(safeSec[5] ?? 0, useBucket),
    pitchSPL: coerceSecondary(safeSec[6] ?? 0, useBucket),
    pitchFK,
    pitchSFF,
    pitchSHU: coerceSecondary(safeSec[9] ?? 0, useBucket),
  };
}

// ─── Archetype Pitch Mix System ───────────────────────────────────────────────

export type PitcherArchetype =
  | "power_starter"
  | "command_lefty"
  | "reliever"
  | "junkball"
  | "sinkerballer";

export type QualityTier = "elite" | "great" | "solid" | "average";

/**
 * Assign a pitcher archetype based on position, handedness, and key attributes.
 *
 * Priority order (first match wins):
 *  1. RP or CP → reliever
 *  2. SP/P + left-handed + control ≥ velocity → command_lefty
 *  3. stuff is highest attribute → power_starter (75%) or sinkerballer (25%)
 *  4. velocity is highest attribute → power_starter
 *  5. otherwise → junkball
 */
export function assignPitcherArchetype(
  position: string,
  throwHand: string,
  velocity: number,
  control: number,
  stamina: number,
  stuff: number,
): PitcherArchetype {
  if (position === "RP" || position === "CP") return "reliever";
  if (
    (position === "SP" || position === "P") &&
    (throwHand === "L" || throwHand === "LHP") &&
    control >= velocity
  ) return "command_lefty";
  if (stuff >= velocity && stuff >= control && stuff >= stamina) {
    return Math.random() < 0.25 ? "sinkerballer" : "power_starter";
  }
  if (velocity >= control && velocity >= stuff && velocity >= stamina) {
    return "power_starter";
  }
  return "junkball";
}

/** Map OVR to quality tier (for player-creation in routes.ts). */
export function qualityTierFromOvr(ovr: number): QualityTier {
  if (ovr >= 500) return "elite";
  if (ovr >= 400) return "great";
  if (ovr >= 300) return "solid";
  return "average";
}

/** Map star rating to quality tier (for recruit-generator.ts). */
export function qualityTierFromStars(stars: number): QualityTier {
  if (stars >= 5) return "elite";
  if (stars >= 4) return "great";
  if (stars >= 3) return "solid";
  return "average";
}

function pitchCountForTier(tier: QualityTier): number {
  switch (tier) {
    case "elite":   return 5 + Math.floor(Math.random() * 2); // 5–6
    case "great":   return 4 + Math.floor(Math.random() * 2); // 4–5
    case "solid":   return 3 + Math.floor(Math.random() * 2); // 3–4
    case "average": return 2 + Math.floor(Math.random() * 2); // 2–3
  }
}

type PoolEntry = [keyof PitchMix, number];

// Weighted pool of secondary pitches per archetype.
// Higher weight = more likely to appear in the arsenal.
// FK, SFF, SHU not yet added to archetype pools (real-roster-only for now).
const ARCHETYPE_POOLS: Record<PitcherArchetype, PoolEntry[]> = {
  // 55% FB/2S · 30% SL · 10% CH · 5% CB/SNK/SPL
  power_starter: [
    ["pitchSL",  80], ["pitch2S",  55], ["pitchCH",  30],
    ["pitchCB",  10], ["pitchSNK",  8], ["pitchSPL",  7],
  ],
  // 45% FB/2S · 25% CH · 20% SL · 10% CB/SNK/SPL
  command_lefty: [
    ["pitchCH",  70], ["pitchSL",  50], ["pitch2S",  45],
    ["pitchCB",  15], ["pitchSNK", 10], ["pitchSPL", 10],
  ],
  // 65% FB · 35% SL/CB/SNK/SPL — NO 2S, NO CT
  reliever: [
    ["pitchSL",  65], ["pitchCB",  25],
    ["pitchSNK", 20], ["pitchSPL", 20],
  ],
  // 40% FB · 20% CH/SPL · 20% CB/SL · 20% SL/SNK — NO 2S
  junkball: [
    ["pitchCH",  45], ["pitchCB",  42], ["pitchSL",  38],
    ["pitchSNK", 32], ["pitchSPL", 28],
  ],
  // 50% SNK/SPL · 20% SL · 20% CH · 10% CT — NO 2S
  sinkerballer: [
    ["pitchSNK", 75], ["pitchSPL", 60], ["pitchSL",  55],
    ["pitchCH",  50], ["pitchCT",  35],
  ],
};

const BINARY_PITCH_KEYS = new Set<keyof PitchMix>(["pitchFB", "pitch2S", "pitchCH", "pitchFK", "pitchSFF"]);

/**
 * Generate a PitchMix for a pitcher based on their archetype and quality tier.
 *
 * Rules enforced:
 * - FB is always included (pitchFB = 1).
 * - pitch2S, pitchCH, pitchFK, and pitchSFF are binary (0 or 1).
 * - All other pitches use levels 2–4.
 * - Elite pitchers: exactly one non-binary secondary pitch gets level 5–7
 *   (the first drawn from the weighted pool = archetype signature pitch).
 * - Minimum 2 pitches guaranteed (FB + at least one secondary).
 */
export function generateArchetypePitchMix(
  archetype: PitcherArchetype,
  tier: QualityTier,
): PitchMix {
  const targetCount = pitchCountForTier(tier);
  const pool: PoolEntry[] = [...ARCHETYPE_POOLS[archetype]];
  const selected: (keyof PitchMix)[] = ["pitchFB"];

  while (selected.length < targetCount && pool.length > 0) {
    const totalWeight = pool.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * totalWeight;
    let chosen = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i][1];
      if (roll <= 0) { chosen = i; break; }
    }
    selected.push(pool[chosen][0]);
    pool.splice(chosen, 1);
  }

  const isElite = tier === "elite";
  let eliteSignatureDone = false;
  const result: PitchMix = { ...noPitches };

  for (const key of selected) {
    if (key === "pitchFB") {
      result.pitchFB = 1;
    } else if (BINARY_PITCH_KEYS.has(key)) {
      (result as Record<string, number>)[key as string] = 1;
    } else if (isElite && !eliteSignatureDone) {
      (result as Record<string, number>)[key as string] = 5 + Math.floor(Math.random() * 3); // 5–7
      eliteSignatureDone = true;
    } else {
      (result as Record<string, number>)[key as string] = 2 + Math.floor(Math.random() * 3); // 2–4
    }
  }

  return result;
}
