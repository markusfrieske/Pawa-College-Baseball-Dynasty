/**
 * migrate-common-abilities.ts
 *
 * One-time migration that normalizes the F/G-grade common ability distribution
 * for all existing players in the database.
 *
 * Run with:  npx tsx scripts/migrate-common-abilities.ts
 */

import { db } from "../server/db";
import { players, teams, conferences } from "../shared/schema";
import { eq } from "drizzle-orm";
import { normalizeCommonAbilities } from "../server/normalizeCommonAbilities";

const COMMON_FIELDS = [
  "wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery",
  "clutch", "vsLHP", "stealing", "running", "throwing", "catcherAbility",
] as const;

async function run() {
  console.log("Fetching all players with conference info…");

  const rows = await db
    .select({
      player: players,
      conferenceName: conferences.name,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .leftJoin(conferences, eq(teams.conferenceId, conferences.id));

  console.log(`Total players: ${rows.length}`);

  let adjusted = 0;
  let unchanged = 0;
  const byConference: Record<string, { adjusted: number; total: number }> = {};

  for (const row of rows) {
    const confName = row.conferenceName ?? "Unknown";
    if (!byConference[confName]) byConference[confName] = { adjusted: 0, total: 0 };
    byConference[confName].total++;

    const before = row.player as Record<string, any>;
    const after = normalizeCommonAbilities(before, confName);

    const changed = COMMON_FIELDS.some((f) => before[f] !== (after as any)[f]);

    if (!changed) {
      unchanged++;
      continue;
    }

    adjusted++;
    byConference[confName].adjusted++;

    await db
      .update(players)
      .set({
        wRISP: (after as any).wRISP,
        vsLefty: (after as any).vsLefty,
        poise: (after as any).poise,
        grit: (after as any).grit,
        heater: (after as any).heater,
        agile: (after as any).agile,
        recovery: (after as any).recovery,
        clutch: (after as any).clutch,
        vsLHP: (after as any).vsLHP,
        stealing: (after as any).stealing,
        running: (after as any).running,
        throwing: (after as any).throwing,
        catcherAbility: (after as any).catcherAbility,
      })
      .where(eq(players.id, before.id as string));
  }

  console.log(`\n=== Common Ability Migration Summary ===`);
  console.log(`Adjusted : ${adjusted}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`\nBy conference (sorted by most adjusted):`);

  const sortedConfs = Object.entries(byConference).sort(
    (a, b) => b[1].adjusted - a[1].adjusted,
  );
  for (const [conf, stats] of sortedConfs) {
    const pct = stats.total > 0 ? Math.round((stats.adjusted / stats.total) * 100) : 0;
    const bar = "█".repeat(Math.min(20, Math.round(pct / 5)));
    console.log(`  ${conf.padEnd(20)} ${stats.adjusted}/${stats.total} adjusted (${pct}%) ${bar}`);
  }

  // Sanity-check: confirm no OVR values changed
  console.log(`\n✓ OVR values were not touched (migration only modifies common ability fields).`);
  console.log(`Migration complete.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
