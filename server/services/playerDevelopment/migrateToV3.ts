/**
 * V3 Migration — backfills all V1 legacy players in a league with archetype,
 * development caps, and seed, then promotes them to developmentModelVersion=3.
 *
 * The migration is strictly additive — it NEVER changes current attribute ratings
 * or OVR. It only assigns identity fields that the V3 engine needs:
 *   • playArchetypeId
 *   • developmentCaps
 *   • developmentSeed
 *   • developmentModelVersion = 3
 *
 * Idempotency: players already at model version 3 are skipped.
 * Running the migration twice produces identical results.
 *
 * Potential handling: if a player has no numeric potential we assign a
 * reasonable default (72 = C) so the caps formula always has something to
 * work with. The value is NOT written back — only caps are written.
 */

import { assignArchetype } from "./assignArchetype";
import { buildDevelopmentCaps } from "./buildCaps";
import { buildDevelopmentSeed } from "@shared/seededRng";
import type { Player } from "@shared/schema";

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
  archetypeBreakdown: Record<string, number>;
}

/**
 * Migrate all V1 players in the given player array to V3.
 *
 * @param storage    Object with an `updatePlayer` method.
 * @param leagueId   League id — used for deterministic seeding.
 * @param players    All players in the league (pre-fetched by caller).
 * @returns          Migration stats.
 */
export async function migrateLeagueToV3(
  storage: { updatePlayer: (id: string, updates: Record<string, unknown>) => Promise<unknown> },
  leagueId: string,
  players: Player[],
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: 0, archetypeBreakdown: {} };

  const v1Players = players.filter(p => (p.developmentModelVersion ?? 1) !== 3);
  if (v1Players.length === 0) return result;

  const writes: Array<{ id: string; updates: Record<string, unknown> }> = [];

  for (const player of v1Players) {
    try {
      // Determine archetype — idempotent, uses same seed every time
      let archetypeId = player.playArchetypeId;
      if (!archetypeId) {
        archetypeId = assignArchetype(player.position, player as any, player.id, leagueId);
      }
      if (!archetypeId) {
        // Position has no eligible archetypes (should not happen in practice)
        result.skipped++;
        continue;
      }

      // Resolve potential: use stored numeric value or default to 72 (C)
      const potential = resolveNumericPotential(player.potential);

      // Build caps from archetype + potential
      const caps = buildDevelopmentCaps(archetypeId, potential);

      // Deterministic seed (season 0 = pre-first-season baseline)
      const seed = buildDevelopmentSeed(leagueId, player.id, 0, 3);

      writes.push({
        id: player.id,
        updates: {
          playArchetypeId: archetypeId,
          developmentCaps: caps,
          developmentSeed: seed,
          developmentModelVersion: 3,
        },
      });

      result.migrated++;
      result.archetypeBreakdown[archetypeId] = (result.archetypeBreakdown[archetypeId] ?? 0) + 1;
    } catch (err) {
      console.error(`[v3-migrate] Error migrating player ${player.id}:`, err);
      result.errors++;
    }
  }

  // Write in parallel chunks of 50 to avoid overwhelming the DB
  const CHUNK = 50;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    await Promise.all(chunk.map(w => storage.updatePlayer(w.id, w.updates)));
  }

  return result;
}

/**
 * Resolve a player's potential to a usable numeric value.
 *
 * Legacy players may have been stored with string grades ("D", "C+", etc.)
 * or as null. This normalises all cases to an integer in [50, 99].
 */
function resolveNumericPotential(potential: number | string | null | undefined): number {
  if (potential == null) return 72; // default: C
  if (typeof potential === "number") {
    return Math.max(50, Math.min(99, Math.round(potential)));
  }
  // String grade fallback
  const GRADE_MAP: Record<string, number> = {
    "F": 51, "D-": 55, "D": 59, "D+": 63,
    "C-": 67, "C": 71, "C+": 75,
    "B-": 79, "B": 83, "B+": 87,
    "A-": 91, "A": 95, "A+": 98,
  };
  return GRADE_MAP[potential as string] ?? 72;
}
