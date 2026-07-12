import { computeRecruitPoolSize } from "../shared/catalog";

/**
 * Returns the recruit pool size for a given number of teams.
 *
 * Delegates to computeRecruitPoolSize (shared/catalog.ts) which is the
 * canonical formula used by both the server and validation scripts.
 *
 * ≤20 teams: teamCount × 5 + 10, capped at 80 (custom leagues)
 * >20 teams: linear 80 → 200 as teams go 20 → 149 (full_season)
 */
export function getRecruitPoolSize(teamCount: number): number {
  return computeRecruitPoolSize(teamCount);
}
