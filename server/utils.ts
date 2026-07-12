/**
 * Returns the recruit pool size for a given number of teams.
 *
 * Small leagues (≤20 teams): teamCount * 5 + 10, capped at 80
 *   | Teams | Pool |
 *   |-------|------|
 *   | 4     | 30   |
 *   | 6     | 40   |
 *   | 8     | 50   |
 *   | 10    | 60   |
 *   | 12    | 70   |
 *   | 14    | 80   |
 *
 * Large leagues (>20 teams): ~7 recruits per team (roster-need-driven)
 *   | Teams | Pool  |
 *   |-------|-------|
 *   | 30    | 210   |
 *   | 60    | 420   |
 *   | 149   | 1,043 |
 */
export function getRecruitPoolSize(teamCount: number): number {
  if (teamCount <= 20) {
    return Math.min(teamCount * 5 + 10, 80);
  }
  // ~7 recruits per team for large/full-season leagues; round up to nearest 5
  return Math.ceil((teamCount * 7) / 5) * 5;
}
