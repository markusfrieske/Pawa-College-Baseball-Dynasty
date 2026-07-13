import { computeRecruitPoolSize, computeFullSeasonRecruitPoolSize } from "../shared/catalog";

/**
 * Returns the recruit pool size for a given number of teams, gated by dynasty preset.
 *
 * full_season preset  → roster-demand formula (computeFullSeasonRecruitPoolSize)
 *   149 teams → 1,081 recruits
 *
 * All other presets   → backward-compatible linear formula (computeRecruitPoolSize)
 *   ≤20 teams: min(80, teams × 5 + 10)
 *   >20 teams: linear 80 → 200 as teams go 20 → 149
 *
 * Pass the league's dynastyPreset value as the second argument so custom
 * leagues are unaffected by the full-season scaling.
 */
export function getRecruitPoolSize(teamCount: number, dynastyPreset?: string | null): number {
  if (dynastyPreset === "full_season") {
    return computeFullSeasonRecruitPoolSize(teamCount);
  }
  return computeRecruitPoolSize(teamCount);
}
