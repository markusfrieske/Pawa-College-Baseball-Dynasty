/**
 * Returns the recruit pool size for a given number of teams.
 * Formula: Math.min(teamCount * 5 + 10, 75)
 *
 * | Teams | Pool |
 * |-------|------|
 * | 4     | 30   |
 * | 6     | 40   |
 * | 8     | 50   |
 * | 10    | 60   |
 * | 12    | 70   |
 * | 13    | 75   |
 * | 14+   | 75   |
 */
export function getRecruitPoolSize(teamCount: number): number {
  return Math.min(teamCount * 5 + 10, 75);
}
