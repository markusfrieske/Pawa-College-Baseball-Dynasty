/**
 * One-time migration: remove Intimidator from pitchers who also have Strong Starter.
 *
 * Intimidator is a reliever-only ability. Pitchers who are classified as starters
 * (having "Strong Starter" in their abilities) should not carry it.
 *
 * Run with: npx tsx scripts/migrate-intimidator-starters.ts
 */

import { db } from "../server/db";
import { players } from "../shared/schema";
import { sql } from "drizzle-orm";

const STARTER_REPLACEMENTS = [
  "Sharpness", "Heavy Ball", "vs. Strong Batters", "Staredown",
  "Inside Pitch", "Low Ball", "Escape Pitch", "Constant Speed",
  "Decisive", "Strikeout", "Good Pickoff", "Strong Finisher",
  "Tunneling", "Guts", "Crossfire"
];

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

async function main() {
  console.log("Scanning players for Intimidator + Strong Starter violations...");

  // Fetch all pitchers with abilities containing Intimidator
  const allPlayers = await db
    .select({ id: players.id, abilities: players.abilities, position: players.position })
    .from(players);

  const violations = allPlayers.filter(p =>
    PITCHER_POSITIONS.has(p.position) &&
    Array.isArray(p.abilities) &&
    p.abilities.includes("Intimidator") &&
    p.abilities.includes("Strong Starter")
  );

  if (violations.length === 0) {
    console.log("✓ No violations found. Database is clean.");
    process.exit(0);
  }

  console.log(`Found ${violations.length} pitcher(s) with Intimidator + Strong Starter. Fixing...`);

  let fixed = 0;
  for (const player of violations) {
    const currentAbilities: string[] = Array.isArray(player.abilities) ? player.abilities : [];

    // Find a replacement that isn't already in the ability list
    const replacement = STARTER_REPLACEMENTS.find(r => !currentAbilities.includes(r));
    if (!replacement) {
      console.warn(`  Player ${player.id}: no replacement available, just removing Intimidator`);
    }

    const newAbilities = currentAbilities
      .map(a => a === "Intimidator" ? (replacement ?? "") : a)
      .filter(a => a !== "");

    await db
      .update(players)
      .set({ abilities: newAbilities })
      .where(sql`${players.id} = ${player.id}`);

    fixed++;
    console.log(`  Fixed player ${player.id}: Intimidator → ${replacement ?? "(removed)"}`);
  }

  console.log(`\n✓ Migration complete. Fixed ${fixed} player(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
