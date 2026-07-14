import { computeRecruitPoolSize, computeFullSeasonRecruitPoolSize } from "../shared/catalog";

/**
 * Returns the recruit pool size for a given number of teams, gated by dynasty preset.
 *
 * full_season preset  → roster-demand formula (computeFullSeasonRecruitPoolSize)
 *   149 teams → 1,081 recruits
 *
 * All other presets   → V2 formula: max(30, ceil(teamCount × 7.25))
 *   14 teams → 102 recruits
 *   20 teams → 145 recruits
 *
 * Pass the league's dynastyPreset value as the second argument so custom
 * leagues use the correct V2 formula.
 */
export function getRecruitPoolSize(teamCount: number, dynastyPreset?: string | null): number {
  if (dynastyPreset === "full_season") {
    return computeFullSeasonRecruitPoolSize(teamCount);
  }
  return computeRecruitPoolSize(teamCount);
}
