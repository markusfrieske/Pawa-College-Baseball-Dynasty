/**
 * Unified pitch-mix helper for all roster files.
 *
 * Schema rules (shared/schema.ts):
 *   - pitchFB, pitch2S, pitchFK, pitchSFF, pitchKN are binary: 0 or 1.
 *   - pitchCH and all other pitch slots are integers 0-7.
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
 *   - 2S, FK, and SFF secondaries are always re-binarized after any
 *     other coercion.
 *
 * pitchMix() emits a single `[roster-sanity]` console.warn the first
 * time it has to coerce a given context, so regressions are surfaced
 * without log spam.
 *
 * pitchSPL is retained in the interface for backward compatibility with
 * real roster files but is always 0 for newly generated recruits.
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
  pitchVSL: number;
  pitchFK: number;
  pitchSFF: number;
  pitchSHU: number;
  pitchCCH: number;
  pitchHSL: number;
  pitchSWP: number;
  pitchKN: number;
  pitchSCB: number;
  pitchPCB: number;
}

export const noPitches: PitchMix = {
  pitchFB: 0, pitch2S: 0, pitchSL: 0, pitchCB: 0,
  pitchCH: 0, pitchCT: 0, pitchSNK: 0, pitchSPL: 0, pitchVSL: 0,
  pitchFK: 0, pitchSFF: 0, pitchSHU: 0,
  pitchCCH: 0, pitchHSL: 0, pitchSWP: 0, pitchKN: 0,
  pitchSCB: 0, pitchPCB: 0,
};

const SECONDARY_KEYS = [
  "pitchSL", "pitchCB", "pitchCH", "pitchCT", "pitchSNK", "pitchSPL", "pitchVSL",
  "pitchFK", "pitchSFF", "pitchSHU",
  "pitchCCH", "pitchHSL", "pitchSWP", "pitchKN", "pitchSCB", "pitchPCB",
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
 *            2S, FK, and SFF are then re-binarized (0 or 1).
 *            CH and SHU inherit SNK-level semantics (0-7).
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

  const pitchCH = coerceSecondary(safeSec[3] ?? 0, useBucket);

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
    pitchVSL: 0,
    pitchFK,
    pitchSFF,
    pitchSHU: coerceSecondary(safeSec[9] ?? 0, useBucket),
    pitchCCH: 0,
    pitchHSL: 0,
    pitchSWP: 0,
    pitchKN: 0,
    pitchSCB: 0,
    pitchPCB: 0,
  };
}

// ─── Archetype Pitch Mix System ───────────────────────────────────────────────

export type PitcherArchetype =
  | "power_starter"
  | "command_lefty"
  | "reliever"
  | "junkball"
  | "sinkerballer"
  | "sweeper_specialist"
  | "cutter_pitcher"
  | "knuckleballer";

export type QualityTier = "elite" | "great" | "solid" | "average";

/**
 * Assign a pitcher archetype based on position, handedness, and key attributes.
 *
 * Priority order (first match wins):
 *  1. 2% flat roll → knuckleballer (SP/P only; RP/CP immune)
 *  2. RP or CP → reliever
 *  3. SP/P + left-handed + control ≥ velocity → command_lefty
 *  4. stuff dominant (stuff ≥ velocity AND stuff ≥ control):
 *     35% power_starter / 30% sweeper_specialist / 20% sinkerballer / 15% cutter_pitcher
 *  5. velocity dominant (velocity ≥ stuff AND velocity ≥ control):
 *     50% power_starter / 25% cutter_pitcher / 25% sweeper_specialist
 *  6. control dominant (control is highest):
 *     40% sinkerballer / 35% cutter_pitcher / 25% junkball
 *  7. Fallback → junkball
 */
export function assignPitcherArchetype(
  position: string,
  throwHand: string,
  velocity: number,
  control: number,
  stamina: number,
  stuff: number,
): PitcherArchetype {
  const isSPorP = position === "SP" || position === "P";

  // 1. 2% knuckleballer roll (starters only)
  if (isSPorP && Math.random() < 0.02) return "knuckleballer";

  // 2. Reliever
  if (position === "RP" || position === "CP") return "reliever";

  // 3. Command lefty
  if (
    isSPorP &&
    (throwHand === "L" || throwHand === "LHP") &&
    control >= velocity
  ) return "command_lefty";

  // 4. Stuff dominant
  if (stuff >= velocity && stuff >= control) {
    const r = Math.random();
    if (r < 0.35) return "power_starter";
    if (r < 0.65) return "sweeper_specialist";
    if (r < 0.85) return "sinkerballer";
    return "cutter_pitcher";
  }

  // 5. Velocity dominant
  if (velocity >= stuff && velocity >= control) {
    const r = Math.random();
    if (r < 0.50) return "power_starter";
    if (r < 0.75) return "cutter_pitcher";
    return "sweeper_specialist";
  }

  // 6. Control dominant
  if (control >= stuff && control >= velocity) {
    const r = Math.random();
    if (r < 0.40) return "sinkerballer";
    if (r < 0.75) return "cutter_pitcher";
    return "junkball";
  }

  // 7. Fallback
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

export function pitchCountForTier(tier: QualityTier): number {
  switch (tier) {
    case "elite":   return 5; // exactly 5
    case "great":   return 4; // exactly 4
    case "solid":   return 3 + Math.floor(Math.random() * 2); // 3–4
    case "average": return 2 + Math.floor(Math.random() * 2); // 2–3
  }
}

type PoolEntry = [keyof PitchMix, number];

/**
 * Weighted pools of secondary pitches per archetype.
 * Higher weight = more likely to appear in the arsenal.
 * pitchSPL is never included in generated recruit pools.
 * pitchKN is handled via fast-path in generateArchetypePitchMix.
 */
const ARCHETYPE_POOLS: Record<PitcherArchetype, PoolEntry[]> = {
  // Power starter — Gerrit Cole, Spencer Strider profile
  // FB dominant, SL as identity pitch, CB secondary, occasional CH or CT
  power_starter: [
    ["pitchSL",  85], ["pitchCB",  65], ["pitchVSL", 35],
    ["pitchPCB", 30], ["pitchCH",  25], ["pitchHSL", 20],
    ["pitchCT",  15],
  ],

  // Command lefty — Kershaw, Sale, Sandoval profile
  // Deceptive lefties living off CH/CB combos; 2S for early count; CCH is lefty specialty
  command_lefty: [
    ["pitchCH",  70], ["pitchCB",  55], ["pitchSL",  45],
    ["pitch2S",  30], ["pitchCCH", 25], ["pitchSCB", 20],
    ["pitchSNK", 15],
  ],

  // Sinkerballer — Framber Valdez, Greinke profile
  // Ground-ball inducers pairing SNK with cutter/slider shapes; SHU for arm-side movement
  sinkerballer: [
    ["pitchSNK", 75], ["pitchCT",  50], ["pitchSL",  35],
    ["pitchHSL", 30], ["pitch2S",  25], ["pitchSHU", 20],
  ],

  // Sweeper specialist — Corbin Burnes, Bryce Miller, George Kirby profile
  // Modern pitch-design arms built around horizontal sweeper movement
  sweeper_specialist: [
    ["pitchSWP", 85], ["pitchVSL", 55], ["pitchCB",  40],
    ["pitchCH",  30], ["pitchSL",  25], ["pitchHSL", 20],
  ],

  // Cutter pitcher — Lance Lynn, Mariano Rivera era profile
  // CT as primary weapon; HSL lives between cutter and slider
  cutter_pitcher: [
    ["pitchCT",  80], ["pitchHSL", 60], ["pitchSL",  40],
    ["pitchSNK", 25], ["pitchCH",  20], ["pitchCB",  15],
  ],

  // Junkball — Jamie Moyer, soft-tosser profile
  // Survive via deception and variety; FK is binary (0 or 1) but allowed here
  junkball: [
    ["pitchCB",  55], ["pitchCH",  45], ["pitchSCB", 35],
    ["pitchCCH", 30], ["pitchSHU", 25], ["pitchSL",  20],
    ["pitchFK",  15],
  ],

  // Reliever — Edwin Díaz, Josh Hader, Félix Bautista profile
  // High-leverage arms dominating with 1-2 elite secondaries; capped at 3 pitches
  reliever: [
    ["pitchSL",  65], ["pitchSWP", 60], ["pitchCB",  45],
    ["pitchHSL", 35], ["pitchVSL", 20],
  ],

  // Knuckleballer — Wakefield, R.A. Dickey profile
  // KN always included first at level 5-7; secondary pool for backup pitches only
  knuckleballer: [
    ["pitchCH",  60], ["pitchSL",  30], ["pitchCB",  20],
  ],
};

// pitchKN added: knuckleball is binary (you either throw it or you don't)
// pitchFK and pitchSFF remain binary/real-roster-only
const BINARY_PITCH_KEYS = new Set<keyof PitchMix>([
  "pitchFB", "pitch2S", "pitchFK", "pitchSFF", "pitchKN",
]);

/**
 * Generate a PitchMix for a pitcher based on their archetype and quality tier.
 *
 * Rules enforced:
 * - FB is always included (pitchFB = 1).
 * - pitchSPL is always 0 on generated recruits.
 * - pitch2S, pitchFK, pitchSFF, pitchKN are binary (0 or 1).
 * - pitchCH and all other non-binary pitches use levels 2–4, except the elite signature pitch (5–7).
 * - Elite pitchers: exactly one non-binary secondary pitch gets level 5–7
 *   (the first drawn from the weighted pool = archetype signature pitch).
 * - Reliever: pitch count capped at 3 (FB + max 2 secondaries) regardless of tier.
 * - Knuckleballer: KN injected first at level 5–7; pitch count capped at 3 (KN + max 2 secondaries).
 * - Minimum 2 pitches guaranteed (FB + at least one secondary).
 */
export function generateArchetypePitchMix(
  archetype: PitcherArchetype,
  tier: QualityTier,
): PitchMix {
  const result: PitchMix = { ...noPitches };

  // ── Knuckleballer fast-path ──────────────────────────────────────────────
  if (archetype === "knuckleballer") {
    result.pitchFB = 1;
    result.pitchKN = 1;

    // KN always gets elite-level quality (5-7) regardless of tier
    // We track the KN level implicitly through pitchKN binary — quality is
    // expressed through the recruit's velocity/stuff stats; the binary flag
    // is sufficient for the schema. Keep KN as 1 (binary).

    // Total cap: 3 pitches (FB + KN + max 1 secondary, or FB + KN if average)
    // elite/great get 1 extra secondary; average stays at 2 total
    const maxSecondaries = tier === "average" ? 0 : 1; // after KN
    const pool: PoolEntry[] = [...ARCHETYPE_POOLS.knuckleballer];

    let secondaryCount = 0;
    while (secondaryCount < maxSecondaries && pool.length > 0) {
      const totalWeight = pool.reduce((s, [, w]) => s + w, 0);
      let roll = Math.random() * totalWeight;
      let chosen = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i][1];
        if (roll <= 0) { chosen = i; break; }
      }
      const key = pool[chosen][0];
      pool.splice(chosen, 1);

      if (BINARY_PITCH_KEYS.has(key)) {
        (result as Record<string, number>)[key as string] = 1;
      } else {
        const level = tier === "elite" ? 5 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
        (result as Record<string, number>)[key as string] = level;
      }
      secondaryCount++;
    }

    return result;
  }

  // ── Standard path ────────────────────────────────────────────────────────
  let targetCount = pitchCountForTier(tier);

  // Reliever cap: FB + max 2 secondaries = 3 pitches total
  if (archetype === "reliever") {
    targetCount = Math.min(targetCount, 3);
  }

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
