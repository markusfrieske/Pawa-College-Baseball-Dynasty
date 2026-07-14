/**
 * V3 Season Development Orchestrator.
 *
 * Runs the full V3 development pipeline for all players in a league that have
 * developmentModelVersion = 3. Designed to be called from applyPlayerProgression()
 * after confirming progressionEnabled = true.
 *
 * Idempotency:
 *   Each run is gated by players.lastDevelopmentSeason. If the player's
 *   lastDevelopmentSeason already equals the current season, the player is
 *   skipped. This allows safe retries of finalizeSigningDay without double-applying.
 *
 * The function writes:
 *   1. Updated attribute values to players via storage.updatePlayer()
 *   2. players.lastDevelopmentSeason = season
 *   3. players.progressionDeltas (for UI display of changes)
 *
 * Usage:
 *   const result = await runV3SeasonDevelopment(storage, leagueId, season, teams);
 */

import type { Player, Team } from "@shared/schema";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import { createRng, buildDevelopmentSeed } from "@shared/seededRng";
import { assignArchetype } from "./assignArchetype";
import { buildDevelopmentCaps, capsNeedRecalculation } from "./buildCaps";
import { computeGrowthBudget } from "./computeGrowthBudget";
import { allocateGrowthPoints, allocateRegressionPoints, mergeDeltas } from "./allocateGrowth";
import type { DevelopmentProfile } from "@shared/playerArchetypes";

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

interface V3DevResult {
  progressed: number;
  skipped: number;
  errors: number;
}

export async function runV3SeasonDevelopment(
  storage: { updatePlayer: (id: string, updates: Record<string, unknown>) => Promise<unknown> },
  leagueId: string,
  season: number,
  teams: Team[],
  allPlayers: Player[],
): Promise<V3DevResult> {
  const result: V3DevResult = { progressed: 0, skipped: 0, errors: 0 };

  // Only V3 players
  const v3Players = allPlayers.filter(p => (p.developmentModelVersion ?? 1) === 3);
  if (v3Players.length === 0) return result;

  const teamMap = new Map(teams.map(t => [t.id, t]));

  // Batch writes to avoid sequential DB round-trips
  const writes: Array<{ id: string; updates: Record<string, unknown> }> = [];

  for (const player of v3Players) {
    try {
      // Seniors graduate — no development
      if (player.eligibility === "SR") {
        await storage.updatePlayer(player.id, { progressionDeltas: null });
        result.skipped++;
        continue;
      }

      // Idempotency check
      if (player.lastDevelopmentSeason === season) {
        result.skipped++;
        continue;
      }

      // Must have potential
      if (player.potential == null) {
        result.skipped++;
        continue;
      }

      const team = teamMap.get(player.teamId);
      if (!team) { result.skipped++; continue; }

      // Ensure archetype is assigned
      let archetypeId = player.playArchetypeId;
      if (!archetypeId) {
        archetypeId = assignArchetype(player.position, player as any, player.id, leagueId);
        if (!archetypeId) { result.skipped++; continue; }
      }

      // Ensure caps are current
      let caps = (player.developmentCaps as Record<string, number> | null) ?? {};
      if (capsNeedRecalculation(caps, player.potential, archetypeId)) {
        caps = buildDevelopmentCaps(archetypeId, player.potential);
      }

      // Development profile (stored in playerArchetype column for legacy compat)
      const profile = ((player as Record<string, unknown>).playerArchetype as DevelopmentProfile | undefined) ?? "normal";

      const isPitcher = PITCHER_POSITIONS.has(player.position);

      // Compute growth budget
      const budget = computeGrowthBudget({
        potential: player.potential,
        eligibility: player.eligibility,
        developmentProfile: profile,
        facilities: team.facilities ?? 5,
        workEthicScore: player.workEthicScore ?? 70,
        coachability: player.coachability ?? 70,
        isPitcher,
      });

      // Build current ratings map
      const currentRatings = buildRatingsMap(player);

      // Seeded RNG for this player/season
      const seed = buildDevelopmentSeed(leagueId, player.id, season, 3);
      const rng = createRng(seed);

      // Allocate growth and regression
      const growthDeltas = allocateGrowthPoints(archetypeId, currentRatings, caps, budget.totalPoints, rng);
      const regrDeltas = allocateRegressionPoints(archetypeId, currentRatings, budget.regressionPoints, rng);
      const allDeltas = mergeDeltas(growthDeltas, regrDeltas);

      // Apply deltas, clamping to [1, 99]
      const updates: Record<string, unknown> = {};
      const persistedDeltas: Record<string, number> = {};

      for (const [key, delta] of Object.entries(allDeltas)) {
        if (delta === 0) continue;
        const oldVal = currentRatings[key] ?? 50;
        const newVal = Math.max(1, Math.min(99, oldVal + delta));
        const actual = newVal - oldVal;
        if (actual !== 0) {
          updates[key] = newVal;
          persistedDeltas[key] = actual;
        }
      }

      // Recompute OVR with updates applied
      const updatedPlayer = { ...player } as Record<string, unknown>;
      for (const [k, v] of Object.entries(updates)) updatedPlayer[k] = v;
      const newOvr = calculateOVR(updatedPlayer as any);
      const ovrDelta = newOvr - (player.overall ?? 0);
      if (ovrDelta !== 0) persistedDeltas["overall"] = ovrDelta;

      updates["overall"] = newOvr;
      updates["starRating"] = getStarRatingFromOVR(newOvr);
      updates["progressionDeltas"] = Object.keys(persistedDeltas).length > 0 ? persistedDeltas : null;
      updates["lastDevelopmentSeason"] = season;
      updates["playArchetypeId"] = archetypeId;
      updates["developmentCaps"] = caps;
      updates["developmentSeed"] = seed;

      writes.push({ id: player.id, updates });
      result.progressed++;
    } catch (err) {
      console.error(`[v3-dev] Error processing player ${player.id}:`, err);
      result.errors++;
    }
  }

  // Write in parallel chunks of 50
  const CHUNK = 50;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    await Promise.all(chunk.map(w => storage.updatePlayer(w.id, w.updates)));
  }

  return result;
}

function buildRatingsMap(player: Player): Record<string, number> {
  const keys = [
    "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
    "clutch", "vsLHP", "grit", "stealing", "running", "throwing",
    "recovery", "wRISP", "vsLefty", "poise", "heater", "agile", "catcherAbility",
    "velocity", "control", "stamina", "stuff",
  ] as const;
  const map: Record<string, number> = {};
  for (const k of keys) {
    const v = (player as Record<string, unknown>)[k];
    if (typeof v === "number") map[k] = v;
  }
  return map;
}
