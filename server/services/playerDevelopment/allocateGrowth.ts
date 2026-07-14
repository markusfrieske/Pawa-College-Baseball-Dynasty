/**
 * Point allocation — V3.
 *
 * Spends growth points on individual attribute upgrades using:
 *   • Archetype attr weights (primary > secondary > positionCore > weakness > irrelevant=0)
 *   • Upgrade cost table (plan §4.5):
 *       current value 1–79  → 1 pt per +1
 *       current value 80–89 → 2 pts per +1
 *       current value 90–94 → 3 pts per +1
 *       current value 95–99 → 4 pts per +1
 *   • Per-attribute development cap from buildDevelopmentCaps()
 *
 * Regression:
 *   Regression points are spent by reducing attrs that are ranked as weaknesses
 *   first, then positionCore, then secondary. Primary attrs never regress.
 *   Each regression point reduces an attr by 1 (reversing the upgrade cost).
 *
 * Seeded RNG:
 *   Each call to allocateGrowth accepts a deterministic rng() function so that
 *   the same player always receives the same deltas for a given season.
 */

import {
  ARCHETYPES_BY_ID,
  growthWeight,
  regressionWeight,
  type ArchetypeRelationship,
} from "@shared/playerArchetypes";
import { weightedChoice } from "@shared/seededRng";

export type AttrDelta = Record<string, number>;

/** Cost in points to increase an attribute from its current value by 1. */
function upgradeCost(currentVal: number): number {
  if (currentVal >= 95) return 4;
  if (currentVal >= 90) return 3;
  if (currentVal >= 80) return 2;
  return 1;
}

/** Cost in points to decrease an attribute by 1 (mirror of upgrade cost). */
function regressionCost(currentVal: number): number {
  return upgradeCost(currentVal - 1);
}

type WorkAttr = {
  key: string;
  currentVal: number;
  cap: number;
  growthW: number;
  regrW: number;
};

/** Build the working set of attrs for a given archetype and player state. */
function buildWorkAttrs(
  archetypeId: string,
  currentRatings: Record<string, number>,
  caps: Record<string, number>,
): WorkAttr[] {
  const archetype = ARCHETYPES_BY_ID[archetypeId];
  if (!archetype) return [];

  const result: WorkAttr[] = [];
  for (const { attr, relationship } of archetype.attrs) {
    if (attr === "pitchMix") continue;
    const cap = caps[attr] ?? 0;
    if (cap === 0) continue; // irrelevant
    const currentVal = currentRatings[attr] ?? 50;
    const gw = growthWeight(relationship);
    const rw = regressionWeight(relationship);
    result.push({ key: attr, currentVal, cap, growthW: gw, regrW: rw });
  }
  return result;
}

/**
 * Spend growth points on attribute upgrades.
 *
 * @param archetypeId     The player's archetype.
 * @param currentRatings  Current attribute values (key → value).
 * @param caps            Per-attr development caps.
 * @param totalPoints     Total growth points to spend.
 * @param rng             Seeded PRNG.
 * @returns               Map of attribute deltas (only changed attrs included).
 */
export function allocateGrowthPoints(
  archetypeId: string,
  currentRatings: Record<string, number>,
  caps: Record<string, number>,
  totalPoints: number,
  rng: () => number,
): AttrDelta {
  const deltas: AttrDelta = {};
  if (totalPoints <= 0) return deltas;

  const work = buildWorkAttrs(archetypeId, currentRatings, caps);
  let remainingPts = totalPoints;

  while (remainingPts > 0) {
    // Filter to attrs that are below their cap and have growth weight
    const eligible = work.filter(w => {
      if (w.growthW <= 0) return false;
      const cur = w.currentVal + (deltas[w.key] ?? 0);
      return cur < w.cap;
    });
    if (eligible.length === 0) break;

    // Weighted random selection
    const chosen = weightedChoice(
      eligible.map(w => ({ value: w, weight: w.growthW })),
      rng,
    );

    const curVal = chosen.currentVal + (deltas[chosen.key] ?? 0);
    const cost = upgradeCost(curVal);
    if (cost > remainingPts) {
      // Can't afford this upgrade — try a cheaper attr
      const cheaper = eligible.filter(w => {
        const cv = w.currentVal + (deltas[w.key] ?? 0);
        return upgradeCost(cv) <= remainingPts;
      });
      if (cheaper.length === 0) break;
      // Just pick the first affordable one
      const c = cheaper[0];
      deltas[c.key] = (deltas[c.key] ?? 0) + 1;
      remainingPts -= upgradeCost(c.currentVal + (deltas[c.key] ?? 0) - 1);
    } else {
      deltas[chosen.key] = (deltas[chosen.key] ?? 0) + 1;
      remainingPts -= cost;
    }
  }

  return deltas;
}

/**
 * Spend regression points on attribute reductions.
 * Regression targets weaknesses first, then position core, then secondary.
 * Primary attrs are never regressed.
 */
export function allocateRegressionPoints(
  archetypeId: string,
  currentRatings: Record<string, number>,
  regressionPoints: number,
  rng: () => number,
): AttrDelta {
  const deltas: AttrDelta = {};
  if (regressionPoints <= 0) return deltas;

  const archetype = ARCHETYPES_BY_ID[archetypeId];
  if (!archetype) return deltas;

  const work = buildWorkAttrs(archetypeId, currentRatings, {});
  let remainingPts = regressionPoints;

  while (remainingPts > 0) {
    const eligible = work.filter(w => {
      if (w.regrW <= 0) return false; // primary attrs never regress
      const cur = w.currentVal + (deltas[w.key] ?? 0);
      return cur > 1;
    });
    if (eligible.length === 0) break;

    const chosen = weightedChoice(
      eligible.map(w => ({ value: w, weight: w.regrW })),
      rng,
    );

    deltas[chosen.key] = (deltas[chosen.key] ?? 0) - 1;
    const curAfter = chosen.currentVal + (deltas[chosen.key] ?? 0);
    remainingPts -= regressionCost(curAfter + 1);
  }

  return deltas;
}

/** Merge growth deltas and regression deltas into a single delta map. */
export function mergeDeltas(growth: AttrDelta, regression: AttrDelta): AttrDelta {
  const merged: AttrDelta = { ...growth };
  for (const [key, delta] of Object.entries(regression)) {
    merged[key] = (merged[key] ?? 0) + delta;
  }
  return merged;
}
