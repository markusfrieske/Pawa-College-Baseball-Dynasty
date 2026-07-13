/**
 * Recruit Pool Planner
 *
 * Server-side utilities for determining recruit pool size and per-position-group
 * quotas for a given league season. Wraps the canonical pool-size formulas from
 * shared/catalog so all server-side callers share one authoritative source.
 *
 * Key exports:
 *   getRecruitPoolSizeForTeamCount — preset-unaware thin alias (internal use)
 *   getPositionGroupQuotas        — static-ratio quotas (fallback)
 *   computePositionTargetsFromDepartures — departure-driven quotas (preferred)
 */

import { computeRecruitPoolSize, computeFullSeasonRecruitPoolSize } from "../../shared/catalog";

export { computeRecruitPoolSize };

/**
 * Returns the recruit pool size for the given team count using the
 * full-season formula.  Thin named alias kept for ergonomics in server-side
 * callers that already know the preset.
 */
export function getRecruitPoolSizeForTeamCount(teamCount: number): number {
  return computeFullSeasonRecruitPoolSize(teamCount);
}

/**
 * Returns per-position-group quota targets for a pool of the given size,
 * using static ratios.  Used as a fallback when no roster departure data is
 * available.
 *
 * Groups:
 *   P  = pitchers (SP + RP + CP)
 *   C  = catchers
 *   IF = infielders (1B + 2B + SS + 3B)
 *   OF = outfielders (LF + CF + RF)
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

/** Maps a player position string to one of the 4 major position groups. */
function positionToGroup(pos: string): string {
  if (!pos) return "OF";
  const p = pos.toUpperCase();
  if (p === "P" || p === "SP" || p === "RP" || p === "CP") return "P";
  if (p === "C") return "C";
  if (p === "1B" || p === "2B" || p === "3B" || p === "SS") return "IF";
  return "OF"; // LF, CF, RF, DH, OF, etc.
}

/**
 * Computes per-position-group recruit targets from actual projected departures.
 *
 * Algorithm:
 *   1. Count seniors (always depart) + juniors (treated as likely declarers).
 *   2. Group departure counts by position group (P / C / IF / OF).
 *   3. Add a 20% planning buffer per group to ensure healthy competition depth.
 *   4. Normalize the buffered counts to the requested poolSize.
 *
 * Falls back to getPositionGroupQuotas() when the player list is empty or
 * yields zero departures (e.g. first season before any SR/JR players exist).
 *
 * @param players   Flat list of current-season roster players across all teams.
 * @param poolSize  Target total pool size to normalize quotas against.
 */
export function computePositionTargetsFromDepartures(
  players: Array<{ eligibility?: string | null; position?: string | null }>,
  poolSize: number,
): Record<string, number> {
  const departures: Record<string, number> = { P: 0, C: 0, IF: 0, OF: 0 };

  for (const player of players) {
    // Seniors always depart; JRs are treated as likely to declare for the draft
    if (player.eligibility === "SR" || player.eligibility === "JR") {
      const group = positionToGroup(player.position ?? "");
      departures[group] = (departures[group] || 0) + 1;
    }
  }

  const totalDepartures = Object.values(departures).reduce((s, n) => s + n, 0);
  if (totalDepartures === 0) {
    // No departure data available — use static ratio fallback
    return getPositionGroupQuotas(poolSize);
  }

  // Apply 20% planning buffer per group
  const buffered: Record<string, number> = {};
  for (const [group, count] of Object.entries(departures)) {
    buffered[group] = Math.ceil(count * 1.2);
  }

  // Normalize to poolSize
  const totalBuffered = Object.values(buffered).reduce((s, n) => s + n, 0);
  const result: Record<string, number> = {};
  for (const [group, count] of Object.entries(buffered)) {
    result[group] = Math.max(1, Math.round(poolSize * count / totalBuffered));
  }

  // Adjust for rounding drift so sum exactly equals poolSize
  const resultTotal = Object.values(result).reduce((s, n) => s + n, 0);
  const diff = poolSize - resultTotal;
  if (diff !== 0) {
    // Add/subtract from the largest group to absorb rounding error
    const largestGroup = Object.entries(result).sort((a, b) => b[1] - a[1])[0][0];
    result[largestGroup] = Math.max(1, result[largestGroup] + diff);
  }

  return result;
}

/**
 * Computes the recruit pool size from actual roster departure data.
 *
 * Used by full_season leagues in finalizeWalkonsPhase when live roster data is
 * available.  Incorporates projected open slots (departures + 20% competition
 * buffer) rather than relying solely on a team-count formula.
 *
 * Algorithm:
 *   1. Count seniors (always depart) + juniors (treated as likely declarers).
 *   2. Add a 20% planning buffer for competitive depth.
 *   3. Return max(departure-based size, minimumNationalBoard per team count).
 *
 * Falls back to the static computeFullSeasonRecruitPoolSize when departure data
 * is unavailable (e.g. first season with no SR/JR players).
 */
export function computePoolSizeFromDepartures(
  players: Array<{ eligibility?: string | null; position?: string | null }>,
  teamCount: number,
): number {
  const staticSize = computeFullSeasonRecruitPoolSize(teamCount);
  const totalDepartures = players.filter(p => p.eligibility === "SR" || p.eligibility === "JR").length;
  if (totalDepartures === 0) return staticSize;

  // Open slots with 20% competition buffer
  const openWithBuffer = Math.ceil(totalDepartures * 1.2);
  // Minimum national board depth floor (= minimumNationalBoard from static formula)
  const minBoard = Math.ceil(teamCount * 7.25);

  return Math.max(openWithBuffer, minBoard);
}

/**
 * Derives the pitcher ratio (0-1) for generateRecruitClass from departure-based
 * position targets.  Returns 0.42 (the static default) if no departure data
 * is available.
 */
export function derivePitcherRatioFromTargets(
  targets: Record<string, number>,
  poolSize: number,
): number {
  const pitcherTarget = targets["P"] ?? 0;
  if (poolSize <= 0 || pitcherTarget <= 0) return 0.42;
  return Math.min(0.65, Math.max(0.30, pitcherTarget / poolSize));
}
