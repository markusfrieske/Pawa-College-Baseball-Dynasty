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
 * ≤20 teams (custom): teamCount × 5 + 10, capped at 80.
 *   4 teams → 30 | 10 teams → 60 | 14+ teams → 80
 *
 * >20 teams (large / full_season): linear interpolation 80 → 200 as
 *   team count goes from 20 → FULL_SEASON_TOTAL (149).
 *   Target: ~1.25 recruits per team, matching the real NCAA signing-day
 *   ratio. Capped at 200 so generation stays performant at full scale.
 *   149 teams → 200 recruits
 *
 * This is the canonical source of truth — imported by server/utils.ts
 * and scripts that need the same pool-size arithmetic.
 */
export function computeRecruitPoolSize(numTeams: number): number {
  if (numTeams <= 20) return 80;
  return Math.min(
    200,
    Math.round(80 + (numTeams - 20) * (200 - 80) / (FULL_SEASON_TOTAL - 20)),
  );
}

export const FULL_SEASON_RULES = {
  maxTeams:           FULL_SEASON_TOTAL,
  conferenceCount:    CONFERENCE_CATALOG.length,
  seasonLength:       "full_season" as const,
  progressionEnabled: true,
  gameMode:           "simulated" as const,
  catalogVersion:     "v1.0",
} as const;
