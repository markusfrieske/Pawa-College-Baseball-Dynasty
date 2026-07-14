/**
 * Archetype assignment — deterministic scoring of which baseball archetype
 * best fits a player based on their current attribute ratings and position.
 *
 * The algorithm:
 *   1. Filter to archetypes eligible for the player's position.
 *   2. Score each archetype by summing (attr_value * relationshipWeight) for
 *      each primary/secondary attr in the archetype definition.
 *   3. Use a seeded RNG (player-specific seed) to break ties, adding a small
 *      random nudge so two otherwise-identical players may differ.
 *   4. Return the highest-scoring archetype id, or null if position has no match.
 *
 * Assignment is idempotent: the same player will always receive the same
 * archetype unless their attribute ratings change significantly.
 */

import {
  getArchetypesForPosition,
  growthWeight,
  ARCHETYPES_BY_ID,
  type PlayerArchetype,
} from "@shared/playerArchetypes";
import { createRng, buildArchetypeSeed } from "@shared/seededRng";

type MinPlayer = {
  position: string;
  hitForAvg?: number | null;
  power?: number | null;
  speed?: number | null;
  arm?: number | null;
  fielding?: number | null;
  errorResistance?: number | null;
  velocity?: number | null;
  control?: number | null;
  stamina?: number | null;
  stuff?: number | null;
  clutch?: number | null;
  vsLHP?: number | null;
  grit?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  recovery?: number | null;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  heater?: number | null;
  agile?: number | null;
  catcherAbility?: number | null;
};

function attrValue(player: MinPlayer, attr: string): number {
  return ((player as Record<string, unknown>)[attr] as number | null | undefined) ?? 50;
}

function scoreArchetype(archetype: PlayerArchetype, player: MinPlayer): number {
  let score = 0;
  for (const { attr, relationship } of archetype.attrs) {
    if (attr === "pitchMix") continue; // not a single attr
    const w = growthWeight(relationship);
    if (w <= 0) continue;
    score += attrValue(player, attr) * w;
  }
  return score;
}

/**
 * Assign a baseball archetype to a player.
 *
 * @param position  The player's current position string (e.g. "P", "SS", "CF").
 * @param player    Player attribute ratings (any object with relevant numeric fields).
 * @param playerId  Optional stable player id for deterministic tie-breaking. When
 *                  omitted the tie-break is random but still seeded per archetype.
 * @param leagueId  Optional league id for the seed.
 * @returns         Archetype id string, or null if no eligible archetype exists.
 */
export function assignArchetype(
  position: string,
  player: MinPlayer,
  playerId?: string,
  leagueId?: string,
): string | null {
  const candidates = getArchetypesForPosition(position);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const seed = playerId && leagueId
    ? buildArchetypeSeed(leagueId, playerId)
    : `arch:${position}:${Date.now()}`;
  const rng = createRng(seed);

  // Score each archetype; add a small RNG nudge for tie-breaking.
  const scored = candidates.map(a => ({
    id: a.id,
    score: scoreArchetype(a, player) + rng() * 3.0,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}

/**
 * Backfill archetype assignment for a batch of existing players.
 * Returns a map of playerId → archetypeId.
 */
export function assignArchetypeBatch(
  players: Array<MinPlayer & { id: string; position: string }>,
  leagueId: string,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const player of players) {
    const id = assignArchetype(player.position, player, player.id, leagueId);
    if (id) result.set(player.id, id);
  }
  return result;
}

/** Retrieve archetype object for a given id. Returns undefined if not found. */
export function getArchetypeById(id: string): PlayerArchetype | undefined {
  return ARCHETYPES_BY_ID[id];
}
