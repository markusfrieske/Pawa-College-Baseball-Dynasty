#!/usr/bin/env tsx
/**
 * One-time migration: assign role-based stamina bands to all pitchers in the DB.
 *
 * Pitchers are ordered by `id ASC` within each team — this matches the order
 * they were seeded from the batch files. Stamina bands:
 *   Ranks 1–4   → Starters:    80–99
 *   Rank  5     → Long relief: 50–79
 *   Ranks 6–N-1 → Mid relief:  30–49
 *   Rank  N     → Closer:       1–29
 * (N = total pitchers on the team.)
 *
 * Players with stamina already 0 (non-pitchers seeded from hitter rows) are
 * skipped by the position filter.
 *
 * Run: npx tsx scripts/migrate-pitcher-stamina.ts
 */

import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function assignStaminaBand(rank: number, total: number): number {
  if (rank <= 4) return randInt(80, 99);         // starter
  if (rank === 5) return randInt(50, 79);         // long relief
  if (rank === total) return randInt(1, 29);      // closer
  return randInt(30, 49);                          // mid relief
}

async function main() {
  console.log("Fetching all pitchers from database...");

  const allPitchers = await db
    .select({ id: players.id, teamId: players.teamId, stamina: players.stamina, position: players.position })
    .from(players)
    .orderBy(players.id);

  const pitchers = allPitchers.filter((p) => PITCHER_POSITIONS.has(p.position));
  console.log(`Found ${pitchers.length} pitchers across all leagues.`);

  // Group by teamId to assign ordinal ranks
  const byTeam = new Map<number, typeof pitchers>();
  for (const p of pitchers) {
    if (!p.teamId) continue;
    const arr = byTeam.get(p.teamId) ?? [];
    arr.push(p);
    byTeam.set(p.teamId, arr);
  }

  // Build update list: { id, newStamina }
  const updates: Array<{ id: number; newStamina: number }> = [];

  for (const [, teamPitchers] of byTeam) {
    const total = teamPitchers.length;
    for (let i = 0; i < total; i++) {
      const p = teamPitchers[i];
      updates.push({ id: p.id, newStamina: assignStaminaBand(i + 1, total) });
    }
  }

  if (updates.length === 0) {
    console.log("✓ No pitchers found to update. Database may be empty.");
    process.exit(0);
  }

  console.log(`Updating ${updates.length} pitcher stamina values...`);

  // Apply updates in batches of 500 to avoid parameter limits
  const BATCH = 500;
  let updated = 0;
  for (let start = 0; start < updates.length; start += BATCH) {
    const batch = updates.slice(start, start + BATCH);
    for (const { id, newStamina } of batch) {
      await db
        .update(players)
        .set({ stamina: newStamina })
        .where(eq(players.id, id));
    }
    updated += batch.length;
    console.log(`  ${updated}/${updates.length} updated...`);
  }

  console.log(`\n✓ Done: ${updates.length} pitcher stamina values updated with role-based bands.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
