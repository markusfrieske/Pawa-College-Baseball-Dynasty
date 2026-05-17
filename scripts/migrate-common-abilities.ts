/**
 * migrate-common-abilities.ts
 *
 * One-time migration that normalizes the F/G-grade common ability distribution
 * for all existing players in the database. Verifies OVR is unchanged and
 * outputs per-conference F/G bucket distribution before and after.
 *
 * Run with:  npx tsx scripts/migrate-common-abilities.ts
 */

import { db } from "../server/db";
import { players, teams, conferences } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { normalizeCommonAbilities, ALL_COMMON_FIELDS } from "../server/normalizeCommonAbilities";

// --- types ---------------------------------------------------------------

interface PlayerRow {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  wRISP: number | null;
  vsLefty: number | null;
  poise: number | null;
  grit: number | null;
  heater: number | null;
  agile: number | null;
  recovery: number | null;
  clutch: number | null;
  vsLHP: number | null;
  stealing: number | null;
  running: number | null;
  throwing: number | null;
  catcherAbility: number | null;
}

interface FGBuckets { 0: number; 1: number; 2: number; 3: number; 4: number; "5+": number; total: number }

// --- helpers -------------------------------------------------------------

function countFG(player: PlayerRow): number {
  const isPitcher = ["P", "SP", "RP", "CP", "CL"].includes(player.position);
  const fields = isPitcher
    ? (["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] as const)
    : player.position === "C"
      ? (["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery", "catcherAbility"] as const)
      : (["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery"] as const);
  return fields.filter((f) => {
    const v = (player as Record<string, unknown>)[f];
    return typeof v === "number" && v < 50;
  }).length;
}

function emptyBuckets(): FGBuckets {
  return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, "5+": 0, total: 0 };
}

function addToBuckets(buckets: FGBuckets, fg: number): void {
  buckets.total++;
  if (fg === 0) buckets[0]++;
  else if (fg === 1) buckets[1]++;
  else if (fg === 2) buckets[2]++;
  else if (fg === 3) buckets[3]++;
  else if (fg === 4) buckets[4]++;
  else buckets["5+"]++;
}

function printBuckets(buckets: FGBuckets): void {
  const pct = (n: number) => buckets.total ? `${Math.round(n / buckets.total * 100)}%` : "0%";
  console.log(`    0 F/G: ${buckets[0].toString().padStart(5)} (${pct(buckets[0]).padStart(4)})  target >49%`);
  console.log(`    1 F/G: ${buckets[1].toString().padStart(5)} (${pct(buckets[1]).padStart(4)})  target <45%`);
  console.log(`    2 F/G: ${buckets[2].toString().padStart(5)} (${pct(buckets[2]).padStart(4)})  target <25%`);
  console.log(`    3 F/G: ${buckets[3].toString().padStart(5)} (${pct(buckets[3]).padStart(4)})  target <10%`);
  console.log(`    4 F/G: ${buckets[4].toString().padStart(5)} (${pct(buckets[4]).padStart(4)})  target  <5%`);
  console.log(`   5+ F/G: ${buckets["5+"].toString().padStart(5)} (${pct(buckets["5+"]).padStart(4)})  target  <3%`);
}

// --- main ----------------------------------------------------------------

async function run() {
  console.log("Fetching all players with conference info…");

  const rows = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      firstName: players.firstName,
      lastName: players.lastName,
      position: players.position,
      overall: players.overall,
      wRISP: players.wRISP,
      vsLefty: players.vsLefty,
      poise: players.poise,
      grit: players.grit,
      heater: players.heater,
      agile: players.agile,
      recovery: players.recovery,
      clutch: players.clutch,
      vsLHP: players.vsLHP,
      stealing: players.stealing,
      running: players.running,
      throwing: players.throwing,
      catcherAbility: players.catcherAbility,
      conferenceName: conferences.name,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .leftJoin(conferences, eq(teams.conferenceId, conferences.id));

  console.log(`Total players: ${rows.length}\n`);

  // Build before-snapshots for OVR verification and bucket stats
  const beforeOveralls = new Map<string, number>(rows.map((r) => [r.id, r.overall]));
  const beforeBuckets: FGBuckets = emptyBuckets();
  rows.forEach((r) => addToBuckets(beforeBuckets, countFG(r)));

  let adjusted = 0;
  let unchanged = 0;
  const byConference: Record<string, { adjusted: number; total: number; afterBuckets: FGBuckets }> = {};

  for (const row of rows) {
    const confName = row.conferenceName ?? "Unknown";
    if (!byConference[confName]) {
      byConference[confName] = { adjusted: 0, total: 0, afterBuckets: emptyBuckets() };
    }
    byConference[confName].total++;

    const after = normalizeCommonAbilities(row, confName);

    const changed = ALL_COMMON_FIELDS.some(
      (f) => (row as Record<string, unknown>)[f] !== (after as Record<string, unknown>)[f],
    );

    if (!changed) {
      unchanged++;
      addToBuckets(byConference[confName].afterBuckets, countFG(row));
      continue;
    }

    adjusted++;
    byConference[confName].adjusted++;
    addToBuckets(byConference[confName].afterBuckets, countFG(after));

    await db
      .update(players)
      .set({
        wRISP: after.wRISP ?? null,
        vsLefty: after.vsLefty ?? null,
        poise: after.poise ?? null,
        grit: after.grit ?? null,
        heater: after.heater ?? null,
        agile: after.agile ?? null,
        recovery: after.recovery ?? null,
        clutch: after.clutch ?? null,
        vsLHP: after.vsLHP ?? null,
        stealing: after.stealing ?? null,
        running: after.running ?? null,
        throwing: after.throwing ?? null,
        catcherAbility: after.catcherAbility ?? null,
      })
      .where(eq(players.id, row.id));
  }

  // --- OVR unchanged verification -------------------------------------
  console.log("Verifying OVR values are unchanged…");
  const ovrCheckRows = await db
    .select({ id: players.id, overall: players.overall })
    .from(players);
  let ovrDriftCount = 0;
  for (const r of ovrCheckRows) {
    const before = beforeOveralls.get(r.id);
    if (before !== undefined && before !== r.overall) {
      console.warn(`  OVR drift: player ${r.id} was ${before}, now ${r.overall}`);
      ovrDriftCount++;
    }
  }
  if (ovrDriftCount === 0) {
    console.log(`  ✓ All ${ovrCheckRows.length} OVR values unchanged.\n`);
  } else {
    console.error(`  ✗ ${ovrDriftCount} player(s) had OVR values change — investigate!\n`);
  }

  // --- Global distribution summary ------------------------------------
  const afterBucketsGlobal: FGBuckets = emptyBuckets();
  Object.values(byConference).forEach((c) => {
    afterBucketsGlobal[0] += c.afterBuckets[0];
    afterBucketsGlobal[1] += c.afterBuckets[1];
    afterBucketsGlobal[2] += c.afterBuckets[2];
    afterBucketsGlobal[3] += c.afterBuckets[3];
    afterBucketsGlobal[4] += c.afterBuckets[4];
    afterBucketsGlobal["5+"] += c.afterBuckets["5+"];
    afterBucketsGlobal.total += c.afterBuckets.total;
  });
  // Include unchanged players in after global
  rows.forEach((r, idx) => {
    const confName = r.conferenceName ?? "Unknown";
    const c = byConference[confName];
    // only count unchanged ones (already added adjusted above)
    // recalculate: simpler to just recount all with final state
  });

  console.log("=== Global F/G Distribution BEFORE ===");
  printBuckets(beforeBuckets);

  console.log("\n=== Global F/G Distribution AFTER ===");
  // Re-fetch for accurate after buckets
  const afterRows = await db
    .select({
      id: players.id,
      position: players.position,
      wRISP: players.wRISP,
      vsLefty: players.vsLefty,
      poise: players.poise,
      grit: players.grit,
      heater: players.heater,
      agile: players.agile,
      recovery: players.recovery,
      clutch: players.clutch,
      vsLHP: players.vsLHP,
      stealing: players.stealing,
      running: players.running,
      throwing: players.throwing,
      catcherAbility: players.catcherAbility,
      overall: players.overall,
    })
    .from(players);

  const afterBucketsReal: FGBuckets = emptyBuckets();
  afterRows.forEach((r) => addToBuckets(afterBucketsReal, countFG(r as PlayerRow)));
  printBuckets(afterBucketsReal);

  // --- Per-conference summary -----------------------------------------
  console.log("\n=== By Conference (adjusted count) ===");
  const sortedConfs = Object.entries(byConference).sort(
    (a, b) => b[1].adjusted - a[1].adjusted,
  );
  for (const [conf, stats] of sortedConfs) {
    const pct = stats.total > 0 ? Math.round((stats.adjusted / stats.total) * 100) : 0;
    const bar = "█".repeat(Math.min(20, Math.round(pct / 5)));
    console.log(`  ${conf.padEnd(20)} ${stats.adjusted}/${stats.total} (${pct}%) ${bar}`);
    if (stats.adjusted > 0) {
      printBuckets(stats.afterBuckets);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Adjusted : ${adjusted}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`OVR drift: ${ovrDriftCount}`);
  console.log(`Migration complete.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
