/**
 * Recruit Pool Planner
 *
 * Server-side wrapper around the canonical pool-size formula in shared/catalog.
 * Use this module for any server-side code that needs to know how many recruits
 * to generate so that callers get the authoritative formula without importing
 * directly from the shared catalog.
 *
 * The formula (see shared/catalog/index.ts for full documentation):
 *   ≤20 teams  → 80 (custom league, unchanged)
 *   >20 teams  → max(ceil(teams × 25 / 4), ceil(teams × 7.25))
 *   149 teams  → 1081
 */

import { computeRecruitPoolSize } from "../../shared/catalog";

export { computeRecruitPoolSize };

/**
 * Returns the recruit pool size for the given team count.
 * Thin named alias kept for ergonomics in server-side callers.
 */
export function getRecruitPoolSizeForTeamCount(teamCount: number): number {
  return computeRecruitPoolSize(teamCount);
}

/**
 * Returns per-position-group quota targets for a pool of the given size.
 * These quotas are advisory — the generator picks positions stochastically —
 * but they ensure the overall distribution has enough coverage for large pools.
 *
 * Groups:
 *   P  = pitchers (SP + RP + CP)
 *   C  = catchers
 *   IF = infielders (1B + 2B + SS + 3B)
 *   OF = outfielders
 *   DH = designated hitters / utility
 *
 * The ratios mirror the default pitcherRatio (0.42) used in generateRecruitClass.
 */
export function getPositionGroupQuotas(poolSize: number): Record<string, number> {
  const pitchers = Math.round(poolSize * 0.42);
  const remaining = poolSize - pitchers;
  return {
    P:  pitchers,
    C:  Math.round(remaining * 0.10),
    IF: Math.round(remaining * 0.45),
    OF: Math.round(remaining * 0.38),
    DH: Math.max(0, remaining - Math.round(remaining * 0.10) - Math.round(remaining * 0.45) - Math.round(remaining * 0.38)),
  };
}
