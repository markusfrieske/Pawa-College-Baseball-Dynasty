/**
 * Unified pitch-mix helper for real-roster files.
 *
 * Schema rules (shared/schema.ts:240-268):
 *   - pitchFB and pitch2S are binary: 0 or 1.
 *   - All other pitch slots (SL/CB/CH/CT/SNK/SPL/...) are integers 0-7.
 *
 * Real-roster files were written at three different times against three
 * different scales:
 *   1. Most files use primary=1 + secondaries 0-7 (correct).
 *   2. A few files (Big Ten Batch 3 UCLA, parts of SEC/ACC batches)
 *      pass a 3-7 "FB quality hint" as the primary slot. FB quality
 *      is already encoded in velocity/stuff/heater, so we collapse
 *      any non-zero primary to 1.
 *   3. Sun Belt, Big 12, Ivy League, and the AAC/WCC/MWC inline
 *      values use a 0-100 velocity-style scale. Those get bucketed
 *      down to 1-7 (80+ -> 7, 70-79 -> 6, ..., 1-29 -> 1).
 *
 * pitchMix() is the canonical helper for new roster code; existing
 * roster files were updated to import from this module instead of
 * defining their own per-file copy.
 *
 * pitchMix() emits a single `[roster-sanity]` console.warn the first
 * time it has to coerce a given context, so future regressions are
 * surfaced without log spam.
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
}

export const noPitches: PitchMix = {
  pitchFB: 0, pitch2S: 0, pitchSL: 0, pitchCB: 0,
  pitchCH: 0, pitchCT: 0, pitchSNK: 0, pitchSPL: 0,
};

const SECONDARY_KEYS = ["pitchSL", "pitchCB", "pitchCH", "pitchCT", "pitchSNK", "pitchSPL"] as const;

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
 * secondary  Positional 7-element array: [2S, SL, CB, CH, CT, SNK, SPL].
 *            If the largest value is > 7 the whole array is treated as
 *            a 0-100 quality scale and bucketed to 1-7.
 *            2S is then re-binarized (0 or 1).
 */
// Threshold for distinguishing a 0-100 quality scale from a near-schema
// 0-7 scale that just has a stray out-of-range value. The known 0-100
// roster files (Sun Belt, Big 12, Ivy, AAC/WCC/MWC inline) all have
// max >= 70, so 30 is a safe boundary that preserves the relative
// arsenal for files that simply pass an 8 by mistake.
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

  return {
    pitchFB: safePrimary >= 1 ? 1 : 0,
    pitch2S,
    pitchSL: coerceSecondary(safeSec[1] ?? 0, useBucket),
    pitchCB: coerceSecondary(safeSec[2] ?? 0, useBucket),
    pitchCH: coerceSecondary(safeSec[3] ?? 0, useBucket),
    pitchCT: coerceSecondary(safeSec[4] ?? 0, useBucket),
    pitchSNK: coerceSecondary(safeSec[5] ?? 0, useBucket),
    pitchSPL: coerceSecondary(safeSec[6] ?? 0, useBucket),
  };
}
