/**
 * Development cap calculator — V3.
 *
 * A development cap is the maximum attribute rating a player can reach through
 * the normal progression system for a given season. Caps are derived from:
 *   • potential (the primary driver)
 *   • archetype relationship for each attribute (primary / secondary / positionCore / weakness)
 *
 * Formula (plan §4.3):
 *   baseCap = clamp(round(55 + 0.82 × (potential − 50)), 50, 99)
 *
 * Per-attribute ceiling = clamp(baseCap + capModifier(relationship), 50, 99)
 *
 * Special cases:
 *   • Irrelevant attrs get cap = 0 (no development points allocated at all).
 *   • pitchMix pseudo-attr maps to all pitch-level fields — handled separately.
 *   • The caps object is stored in players.developmentCaps (jsonb) and recalculated
 *     if potential changes by ≥ 5 points between seasons.
 */

import {
  ARCHETYPES_BY_ID,
  capModifier,
  type AttrKey,
  type ArchetypeRelationship,
} from "@shared/playerArchetypes";

const ALL_HITTER_ATTRS: AttrKey[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "catcherAbility",
];

const ALL_PITCHER_ATTRS: AttrKey[] = [
  "velocity", "control", "stamina", "stuff",
  "wRISP", "vsLefty", "poise", "heater", "agile", "recovery",
];

const ALL_ATTRS: AttrKey[] = [...ALL_HITTER_ATTRS, ...ALL_PITCHER_ATTRS];

/** Compute the base cap from potential (50–99 integer scale). */
export function computeBaseCap(potential: number): number {
  const raw = Math.round(55 + 0.82 * (potential - 50));
  return Math.max(50, Math.min(99, raw));
}

/**
 * Build the full development caps map for a player.
 *
 * @param archetypeId  One of the archetype ids from playerArchetypes.ts.
 * @param potential    Player potential as an integer (e.g. 75 for a B grade).
 * @returns            Map of attrKey → ceiling (0 means irrelevant / no allocation).
 */
export function buildDevelopmentCaps(
  archetypeId: string,
  potential: number,
): Record<string, number> {
  const archetype = ARCHETYPES_BY_ID[archetypeId];
  if (!archetype) return {};

  const baseCap = computeBaseCap(potential);

  // Build a quick lookup: attrKey → relationship
  const relMap = new Map<string, ArchetypeRelationship>();
  for (const { attr, relationship } of archetype.attrs) {
    if (attr !== "pitchMix") relMap.set(attr, relationship);
  }

  const caps: Record<string, number> = {};
  for (const attr of ALL_ATTRS) {
    const rel = relMap.get(attr);
    if (rel === undefined) {
      // Attr not mentioned in archetype — use positionCore treatment
      caps[attr] = Math.max(50, Math.min(99, baseCap));
    } else if (rel === "irrelevant") {
      caps[attr] = 0;
    } else {
      const ceiling = baseCap + capModifier(rel);
      caps[attr] = Math.max(50, Math.min(99, ceiling));
    }
  }

  return caps;
}

/**
 * Determine if the stored developmentCaps needs to be recalculated.
 * Recalculate if potential changed by ≥ 5 points since caps were built.
 */
export function capsNeedRecalculation(
  storedCaps: Record<string, number>,
  currentPotential: number,
  archetypeId: string,
): boolean {
  if (Object.keys(storedCaps).length === 0) return true;
  // Reconstruct what the baseCap would have been from stored caps.
  // Take the median of stored values to back-estimate the original baseCap.
  const vals = Object.values(storedCaps).filter(v => v > 0);
  if (vals.length === 0) return true;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const storedPotentialEst = Math.round((median - 55) / 0.82 + 50);
  return Math.abs(currentPotential - storedPotentialEst) >= 5;
}
