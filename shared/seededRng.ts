/**
 * Deterministic seeded PRNG utilities for player development.
 *
 * Uses the mulberry32 algorithm — fast, high statistical quality,
 * and produces identical sequences for identical seeds on any JS runtime.
 * All development randomness is funneled through this module so that
 * a given league/season/player combination always produces the same result,
 * enabling idempotent progression retries and reproducible debugging.
 */

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/**
 * Create a deterministic PRNG from a string seed.
 * Returns a function that produces numbers in [0, 1) — same interface as Math.random().
 */
export function createRng(seed: string): () => number {
  return mulberry32(hashString(seed));
}

/**
 * Weighted random selection using a seeded RNG.
 * items must be a non-empty array of { value, weight } objects.
 * Returns the selected value.
 */
export function weightedChoice<T>(
  items: Array<{ value: T; weight: number }>,
  rng: () => number,
): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

/**
 * Sample a normal-ish random value via Box-Muller with a seeded RNG.
 * Returns a value near 0 with ~68% in [-stdDev, +stdDev].
 */
export function normalRand(rng: () => number, stdDev = 1): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

/**
 * Build the development seed string for a player in a given season.
 * This encodes league + player + season + model version so the PRNG
 * produces a unique sequence for every (player, season) pair.
 */
export function buildDevelopmentSeed(
  leagueId: string,
  playerId: string,
  season: number,
  modelVersion: number,
): string {
  return `dev:${leagueId}:${playerId}:${season}:v${modelVersion}`;
}

/**
 * Build the archetype assignment seed for a player (deterministic backfill).
 * Uses only league + player so it remains stable across seasons.
 */
export function buildArchetypeSeed(leagueId: string, playerId: string): string {
  return `arch:${leagueId}:${playerId}`;
}
