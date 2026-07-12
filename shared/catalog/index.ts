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
 * ≤20 teams (custom leagues): fixed 80 recruits.
 *   Unchanged from original formula — custom league balance is unaffected.
 *
 * >20 teams (large / full_season): roster-demand formula.
 *   steadyStateDemand  = ceil(teams × rosterLimit / eligibilityYears)
 *   minimumNationalBoard = ceil(teams × 7.25)   — competition depth floor
 *   result = max(steadyStateDemand, minimumNationalBoard)
 *
 *   For 149 teams: max(ceil(149×25/4), ceil(149×7.25)) = max(932, 1081) = 1081
 *
 * This is the canonical source of truth — imported by server/utils.ts,
 * server/services/recruitPoolPlanner.ts, and validation scripts.
 */
export function computeRecruitPoolSize(numTeams: number): number {
  if (numTeams <= 20) return 80;
  const ROSTER_LIMIT = 25;
  const ELIGIBILITY_YEARS = 4;
  const steadyStateDemand = Math.ceil(numTeams * ROSTER_LIMIT / ELIGIBILITY_YEARS);
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
