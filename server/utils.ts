/**
 * Returns the recruit pool size for a given number of teams.
 * Formula: Math.min(teamCount * 4 + 5, 80)
 *
 * | Teams | Pool |
 * |-------|------|
 * | 4     | 21   |
 * | 6     | 29   |
 * | 8     | 37   |
 * | 10    | 45   |
 * | 12    | 53   |
 * | 13    | 57   |
 * | 19+   | 80   |
 */
export function getRecruitPoolSize(teamCount: number): number {
  return Math.min(teamCount * 5 + 10, 80);
}
