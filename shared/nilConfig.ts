/**
 * NIL (Name, Image, Likeness) conference tier base allocations.
 * All teams in the same conference receive the same base allocation each season.
 * Teams earn additional bonuses on top of this based on prior-season performance.
 */
export const CONFERENCE_TIER_NIL: Record<string, number> = {
  // Tier 1: $3.5M — Power conferences
  "SEC": 3_500_000,
  "ACC": 3_500_000,
  "Big Ten": 3_500_000,
  "Big 12": 3_500_000,
  // Tier 2: $2.5M — Mid-major power
  "Pac-12": 2_500_000,
  "AAC": 2_500_000,
  "Sun Belt": 2_500_000,
  // Tier 3: $1.75M — Mid-majors
  "WCC": 1_750_000,
  "Mountain West": 1_750_000,
  "Big West": 1_750_000,
  "Missouri Valley": 1_750_000,
  // Tier 4: $1.5M — Ivy League
  "Ivy League": 1_500_000,
  // Tier 5: $1.25M — HBCU
  "HBCU": 1_250_000,
};

export const DEFAULT_CONFERENCE_NIL = 2_000_000;
