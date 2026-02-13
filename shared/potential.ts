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

export const POTENTIAL_DISTRIBUTION = [
  { grade: "F",  weight: 4,  min: 50, max: 53 },
  { grade: "D-", weight: 8,  min: 54, max: 57 },
  { grade: "D",  weight: 10, min: 58, max: 61 },
  { grade: "D+", weight: 14, min: 62, max: 65 },
  { grade: "C-", weight: 20, min: 66, max: 69 },
  { grade: "C",  weight: 18, min: 70, max: 73 },
  { grade: "C+", weight: 14, min: 74, max: 77 },
  { grade: "B-", weight: 10, min: 78, max: 81 },
  { grade: "B",  weight: 8,  min: 82, max: 85 },
  { grade: "B+", weight: 6,  min: 86, max: 89 },
  { grade: "A-", weight: 4,  min: 90, max: 93 },
  { grade: "A",  weight: 3,  min: 94, max: 97 },
  { grade: "A+", weight: 1,  min: 98, max: 99 },
] as const;

export function rollWeightedPotential(): number {
  const totalWeight = POTENTIAL_DISTRIBUTION.reduce((s, d) => s + d.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const tier of POTENTIAL_DISTRIBUTION) {
    roll -= tier.weight;
    if (roll <= 0) {
      return tier.min + Math.floor(Math.random() * (tier.max - tier.min + 1));
    }
  }
  return 70;
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
