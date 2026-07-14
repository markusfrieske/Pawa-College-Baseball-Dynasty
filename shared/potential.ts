export const POTENTIAL_GRADES = [
  { min: 50, max: 53, grade: "F" },
  { min: 54, max: 57, grade: "D-" },
  { min: 58, max: 61, grade: "D" },
  { min: 62, max: 65, grade: "D+" },
  { min: 66, max: 69, grade: "C-" },
  { min: 70, max: 73, grade: "C" },
  { min: 74, max: 77, grade: "C+" },
  { min: 78, max: 81, grade: "B-" },
  { min: 82, max: 85, grade: "B" },
  { min: 86, max: 89, grade: "B+" },
  { min: 90, max: 93, grade: "A-" },
  { min: 94, max: 97, grade: "A" },
  { min: 98, max: 99, grade: "A+" },
] as const;

export function getPotentialGrade(value: number): string {
  for (const g of POTENTIAL_GRADES) {
    if (value >= g.min && value <= g.max) return g.grade;
  }
  if (value < 50) return "F";
  return "A+";
}

export function getPotentialGradeIndex(value: number): number {
  for (let i = 0; i < POTENTIAL_GRADES.length; i++) {
    if (value >= POTENTIAL_GRADES[i].min && value <= POTENTIAL_GRADES[i].max) return i;
  }
  if (value < 50) return 0;
  return POTENTIAL_GRADES.length - 1;
}

export function getPotentialRange(actual: number, evaluationSkill: number = 1): { floor: number; ceiling: number } {
  const baseRange = 12;
  const reduction = Math.max(0, (evaluationSkill - 1) * 2);
  const range = Math.max(3, baseRange - reduction);
  return {
    floor: Math.max(50, actual - range),
    ceiling: Math.min(99, actual + range),
  };
}

export function getPotentialRangeLabel(floor: number, ceiling: number): string {
  const floorGrade = getPotentialGrade(floor);
  const ceilGrade = getPotentialGrade(ceiling);
  if (floorGrade === ceilGrade) return floorGrade;
  return `${floorGrade} - ${ceilGrade}`;
}

/**
 * Legacy distribution (V1) — kept for reference only.
 * Mean ~67.7. Used by rollWeightedPotential() which remains for backward compat.
 */
const POTENTIAL_DISTRIBUTION_V1 = [
  { grade: "F",  weight: 8,  min: 50, max: 53 },
  { grade: "D-", weight: 12, min: 54, max: 57 },
  { grade: "D",  weight: 14, min: 58, max: 61 },
  { grade: "D+", weight: 12, min: 62, max: 65 },
  { grade: "C-", weight: 14, min: 66, max: 69 },
  { grade: "C",  weight: 12, min: 70, max: 73 },
  { grade: "C+", weight: 10, min: 74, max: 77 },
  { grade: "B-", weight: 6,  min: 78, max: 81 },
  { grade: "B",  weight: 5,  min: 82, max: 85 },
  { grade: "B+", weight: 3,  min: 86, max: 89 },
  { grade: "A-", weight: 2,  min: 90, max: 93 },
  { grade: "A",  weight: 1,  min: 94, max: 97 },
  { grade: "A+", weight: 1,  min: 98, max: 99 },
] as const;

/**
 * V3 distribution — targets mean 74–78 per plan §4.3.
 *
 * Calibration: mean ≈ 76.2, D/F ≈ 14%, C ≈ 39%, B ≈ 35%, A ≈ 10%.
 * Eliminates the dynasty talent cliff caused by the old left-heavy V1 distribution.
 */
export const POTENTIAL_DISTRIBUTION = [
  { grade: "F",  weight: 2,  min: 50, max: 53 },
  { grade: "D-", weight: 3,  min: 54, max: 57 },
  { grade: "D",  weight: 4,  min: 58, max: 61 },
  { grade: "D+", weight: 5,  min: 62, max: 65 },
  { grade: "C-", weight: 11, min: 66, max: 69 },
  { grade: "C",  weight: 16, min: 70, max: 73 },
  { grade: "C+", weight: 14, min: 74, max: 77 },
  { grade: "B-", weight: 12, min: 78, max: 81 },
  { grade: "B",  weight: 14, min: 82, max: 85 },
  { grade: "B+", weight: 9,  min: 86, max: 89 },
  { grade: "A-", weight: 5,  min: 90, max: 93 },
  { grade: "A",  weight: 3,  min: 94, max: 97 },
  { grade: "A+", weight: 2,  min: 98, max: 99 },
] as const;

/** Roll a potential value from the V1 legacy distribution (kept for compat). */
export function rollWeightedPotential(): number {
  const totalWeight = POTENTIAL_DISTRIBUTION_V1.reduce((s, d) => s + d.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const tier of POTENTIAL_DISTRIBUTION_V1) {
    roll -= tier.weight;
    if (roll <= 0) {
      return tier.min + Math.floor(Math.random() * (tier.max - tier.min + 1));
    }
  }
  return 70;
}

/**
 * Roll a V3 potential value from the new distribution (plan §4.3).
 *
 * Applies a star offset and profile modifier on top of the base roll so that
 * higher-star recruits and special profiles have meaningfully different potential.
 *
 * @param stars    Recruit star rating (1–5, or 6 for Blue Chip). Optional.
 * @param profile  Development profile. Optional — defaults to "normal".
 * @param rng      Optional seeded RNG; falls back to Math.random.
 */
export function rollV3Potential(
  stars?: number,
  profile?: string,
  rng?: () => number,
): number {
  const rand = rng ?? Math.random;

  // Base roll from V3 distribution
  const totalWeight = POTENTIAL_DISTRIBUTION.reduce((s, d) => s + d.weight, 0);
  let roll = rand() * totalWeight;
  let base = 76;
  for (const tier of POTENTIAL_DISTRIBUTION) {
    roll -= tier.weight;
    if (roll <= 0) {
      base = tier.min + Math.floor(rand() * (tier.max - tier.min + 1));
      break;
    }
  }

  // Star offset (plan §4.3)
  const starOffsets: Record<number, number> = { 1: -6, 2: -3, 3: 0, 4: 3, 5: 6, 6: 9 };
  const starOffset = stars != null ? (starOffsets[stars] ?? 0) : 0;

  // Profile modifier
  let profileOffset = 0;
  switch (profile) {
    case "raw":          profileOffset = 2; break;
    case "late_bloomer": profileOffset = 8; break;
    case "overdraft":    profileOffset = -14; break;
    case "gem":          profileOffset = 8; break;
    case "bust":         profileOffset = -10; break;
    case "generational_gem": profileOffset = 15; break;
    case "generational_bust": profileOffset = -20; break;
    default:             profileOffset = 0;
  }

  // Small Gaussian-ish variance via CLT (sum of uniforms)
  const variance = (rand() + rand() + rand() - 1.5) * 6; // ≈ Normal(0, 9) per plan

  const result = Math.round(base + starOffset + profileOffset + variance);
  return Math.max(50, Math.min(99, result));
}

export type ProgressionZone = "declining" | "stable" | "improving";

export function getProgressionZone(potential: number): ProgressionZone {
  const idx = getPotentialGradeIndex(potential);
  if (idx <= 3) return "declining";
  if (idx <= 6) return "stable";
  return "improving";
}

export function getProgressionColor(zone: ProgressionZone): string {
  switch (zone) {
    case "declining": return "text-red-400";
    case "stable": return "text-muted-foreground";
    case "improving": return "text-green-400";
  }
}

export function getDevTraitGrade(score: number): string {
  return getPotentialGrade(score);
}
