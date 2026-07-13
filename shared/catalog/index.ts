export {
  CONFERENCE_CATALOG,
  FULL_SEASON_CONF_NAMES,
  CONF_SIZE_MAP,
} from "./conferences";
export type { ConferenceName } from "./conferences";

export {
  CATALOG_TEAMS,
  TEAM_CONFERENCE_MAP,
  CATALOG_TEAM_NAMES,
} from "./teams";
export type { CatalogTeam } from "./teams";

import { CONFERENCE_CATALOG } from "./conferences";

export const FULL_SEASON_TOTAL: number = CONFERENCE_CATALOG.reduce((s, c) => s + c.size, 0);

/**
 * Compute the recruit pool size for a given number of teams.
 *
 * Used by ALL non-full_season leagues:
 *   Math.min(teamCount × 5 + 10, 75)
 *
 * Examples: 4→30, 6→40, 8→50, 10→60, 12→70, 13→75, 14→75
 *
 * Full-season leagues use computeFullSeasonRecruitPoolSize() instead,
 * which applies the roster-demand formula yielding ~1,081 for 149 teams.
 *
 * Callers that need preset-aware behaviour should call getRecruitPoolSize()
 * in server/utils.ts, which gates on dynastyPreset automatically.
 */
export function computeRecruitPoolSize(numTeams: number): number {
  return Math.min(numTeams * 5 + 10, 75);
}

/**
 * Full-season-only recruit pool formula (dynastyPreset === "full_season").
 *
 * Roster-demand formula guaranteeing enough recruits to replenish all rosters:
 *   steadyStateDemand  = ceil(teams × 25 / 4)  — one class replaces 1 of 4 cohorts
 *   minimumNationalBoard = ceil(teams × 7.25)   — competition depth floor
 *   result = max(steadyStateDemand, minimumNationalBoard)
 *
 * For 149 teams: max(ceil(149×25/4), ceil(149×7.25)) = max(932, 1081) = 1081
 */
export function computeFullSeasonRecruitPoolSize(numTeams: number): number {
  if (numTeams <= 20) return 80;
  const steadyStateDemand = Math.ceil(numTeams * 25 / 4);
  const minimumNationalBoard = Math.ceil(numTeams * 7.25);
  return Math.max(steadyStateDemand, minimumNationalBoard);
}

export const FULL_SEASON_RULES = {
  maxTeams:           FULL_SEASON_TOTAL,
  conferenceCount:    CONFERENCE_CATALOG.length,
  seasonLength:       "full_season" as const,
  progressionEnabled: true,
  gameMode:           "simulated" as const,
  catalogVersion:     "v1.0",
} as const;
