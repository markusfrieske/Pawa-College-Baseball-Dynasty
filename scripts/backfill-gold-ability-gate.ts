/**
 * backfill-gold-ability-gate.ts
 *
 * One-time (idempotent) backfill that enforces the OVR 450+ gate on gold
 * special abilities for all players currently in the database.
 *
 * Rules:
 *  - Any player with overall < 450 who has a gold-tier special ability gets
 *    that gold ability replaced with a randomly-chosen blue ability for their
 *    position (same logic as enforceGoldOvrGate in shared/abilities.ts).
 *  - The script is safe to run multiple times — rows that are already clean
 *    are skipped without writes.
 *  - No record_book exemption table exists yet; add it here when it does.
 *
 * Run with:  npx tsx scripts/backfill-gold-ability-gate.ts
 */

import { Pool } from "pg";
import { enforceGoldOvrGate, ALL_ABILITIES } from "../shared/abilities";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const UPDATE_BATCH = 1000; // rows per single UPDATE...FROM VALUES statement

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Gold Ability OVR Gate Backfill ===\n");

    const goldNames: string[] = ALL_ABILITIES
      .filter(a => a.tier === "gold")
      .map(a => a.name);

    console.log(`Gold abilities (${goldNames.length}): ${goldNames.slice(0, 4).join(", ")} ...`);

    // Build IN list for SQL — parameterised
    const goldPlaceholders = goldNames.map((_, i) => `$${i + 1}`).join(", ");

    // Fetch ALL affected rows in one shot (just id, position, overall, abilities)
    console.log("Fetching affected players...");
    const selectRes = await client.query(
      `SELECT id, position, overall, abilities
       FROM players
       WHERE overall < 450
         AND abilities IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM json_array_elements_text(abilities) AS elem
           WHERE elem IN (${goldPlaceholders})
         )
       ORDER BY id`,
      goldNames
    );

    const rows: Array<{
      id: string;
      position: string;
      overall: number;
      abilities: string[];
    }> = selectRes.rows;

    console.log(`Found ${rows.length} players with gold abilities and OVR < 450.\n`);

    if (rows.length === 0) {
      console.log("Nothing to do — database is already clean.");
      return;
    }

    // Apply gate logic in-memory for all rows
    const updates: Array<{ id: string; abilities: string[] }> = [];
    for (const row of rows) {
      const abilities: string[] = Array.isArray(row.abilities) ? row.abilities : [];
      const gated = enforceGoldOvrGate(abilities, row.position, row.overall);
      if (gated !== abilities) {
        updates.push({ id: row.id, abilities: gated });
      }
    }

    console.log(`Applying ${updates.length} updates in batches of ${UPDATE_BATCH}...\n`);

    let totalChanged = 0;
    for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
      const batch = updates.slice(i, i + UPDATE_BATCH);

      // Build a single UPDATE ... FROM (VALUES ...) statement for the whole batch
      // Each value pair: (id::uuid, abilities::json)
      const valueParts: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;
      for (const u of batch) {
        valueParts.push(`($${pIdx}::text, $${pIdx + 1}::json)`);
        params.push(u.id, JSON.stringify(u.abilities));
        pIdx += 2;
      }

      await client.query(
        `UPDATE players AS p
         SET abilities = v.abilities
         FROM (VALUES ${valueParts.join(", ")}) AS v(id, abilities)
         WHERE p.id = v.id`,
        params
      );

      totalChanged += batch.length;
      process.stdout.write(
        `\r  Progress: ${totalChanged}/${updates.length} updated...`
      );
    }

    console.log(`\n\n=== Done ===`);
    console.log(`  Players cleaned : ${totalChanged}`);
    console.log(`  Total checked   : ${rows.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
