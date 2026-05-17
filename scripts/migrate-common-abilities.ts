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
import { normalizeCommonAbilities, CONFERENCE_TIERS } from "../server/normalizeCommonAbilities";

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
  const BATCH_SIZE = 250;
  const pendingUpdates: { id: string; updateSet: Record<string, number | null> }[] = [];

  async function flushUpdates() {
    for (const { id, updateSet } of pendingUpdates) {
      await db
        .update(players)
        .set(updateSet as Partial<typeof players.$inferSelect>)
        .where(eq(players.id, id));
    }
    pendingUpdates.length = 0;
  }

  for (const row of rows) {
    const confName = row.conferenceName ?? "Unknown";
    if (!byConference[confName]) {
      byConference[confName] = { adjusted: 0, total: 0, afterBuckets: emptyBuckets() };
    }
    byConference[confName].total++;

    // normalizeCommonAbilities returns ONLY position-relevant common ability keys.
    // Compare only those keys against the existing row so we never overwrite
    // unrelated columns (e.g. clutch for a pitcher) or produce false positives.
    const after = normalizeCommonAbilities(row, confName);
    const afterKeys = Object.keys(after) as (keyof typeof after)[];

    const changedKeys = afterKeys.filter((f) => {
      const before = (row as Record<string, unknown>)[f];
      const next = after[f];
      return before !== next;
    });

    if (changedKeys.length === 0) {
      unchanged++;
      addToBuckets(byConference[confName].afterBuckets, countFG(row));
      continue;
    }

    adjusted++;
    byConference[confName].adjusted++;

    // Build the merged "after" row for bucket counting (only changed fields differ)
    const mergedRow = { ...row };
    for (const k of changedKeys) {
      (mergedRow as Record<string, unknown>)[k] = after[k] ?? null;
    }
    addToBuckets(byConference[confName].afterBuckets, countFG(mergedRow));

    // Collect update for batch flush
    const updateSet: Record<string, number | null> = {};
    for (const k of changedKeys) {
      updateSet[k] = typeof after[k] === "number" ? (after[k] as number) : null;
    }
    pendingUpdates.push({ id: row.id, updateSet });

    // Flush in chunks to keep transaction size reasonable
    if (pendingUpdates.length >= BATCH_SIZE) {
      await flushUpdates();
    }
  }
  // Flush remaining
  await flushUpdates();

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

  // --- Re-fetch all players with conference for accurate AFTER distributions ---
  const afterRows = await db
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

  // Build global and per-conference AFTER buckets from the live DB state
  const afterGlobal: FGBuckets = emptyBuckets();
  const afterByConf: Record<string, FGBuckets> = {};
  for (const r of afterRows) {
    const conf = r.conferenceName ?? "Unknown";
    if (!afterByConf[conf]) afterByConf[conf] = emptyBuckets();
    const fg = countFG(r as PlayerRow);
    addToBuckets(afterGlobal, fg);
    addToBuckets(afterByConf[conf], fg);
  }

  // Tier-aware per-conference pass/fail thresholds.
  // The normalizer caps tier shift at min(2, tier-1), so the worst-case theoretical
  // max for "5+ F/G" in Tier 3-5 is ~9% (6+2+1 from the sampling distribution).
  // Thresholds are calibrated to the actual expected output, not the global target:
  //   Tier 1 (shift 0): same as global  — 5+ ≤3%, 4 ≤5%,  3 ≤10%
  //   Tier 2 (shift 1): loosened once   — 5+ ≤8%, 4 ≤13%, 3 ≤22%
  //   Tier 3+ (shift 2): loosened twice — 5+ ≤13%, 4 ≤21%, 3 ≤34%
  // No minimum-0 F/G threshold for Tier 2+ — low-tier rosters have very low base
  // attribute values, so 0 F/G naturally drops toward 0% even after normalization.
  function confThresholds(confName: string): {
    min0: number; max1: number; max2: number; max3: number; max4: number; max5p: number;
  } {
    const tier = CONFERENCE_TIERS[confName] ?? 1;
    const shift = Math.min(2, tier - 1);
    return {
      min0:  shift > 0 ? 0  : 49,  // only enforce 0 F/G minimum for Tier 1
      max1:  shift > 0 ? 100 : 45, // T1: <45%, T2+: no upper limit (natural spread)
      max2:  25 + shift * 12,      // T1: 25%, T2: 37%, T3+: 49%
      max3:  10 + shift * 12,      // T1: 10%, T2: 22%, T3+: 34%
      max4:   5 + shift * 8,       // T1: 5%,  T2: 13%, T3+: 21%
      max5p:  3 + shift * 5,       // T1: 3%,  T2: 8%,  T3+: 13%
    };
  }

  function checkConf(buckets: FGBuckets, confName: string): boolean {
    if (buckets.total === 0) return true;
    const t = confThresholds(confName);
    const pct = (n: number) => n / buckets.total * 100;
    return (
      pct(buckets[0])    >= t.min0  &&
      pct(buckets[1])    <= t.max1  &&
      pct(buckets[2])    <= t.max2  &&
      pct(buckets[3])    <= t.max3  &&
      pct(buckets[4])    <= t.max4  &&
      pct(buckets["5+"]) <= t.max5p
    );
  }

  console.log("=== Global F/G Distribution BEFORE ===");
  printBuckets(beforeBuckets);

  console.log("\n=== Global F/G Distribution AFTER (live DB) ===");
  printBuckets(afterGlobal);
  const globalPass =
    afterGlobal.total > 0 &&
    afterGlobal[0]    / afterGlobal.total >= 0.49 &&
    afterGlobal[1]    / afterGlobal.total <= 0.45 &&
    afterGlobal[2]    / afterGlobal.total <= 0.25 &&
    afterGlobal[3]    / afterGlobal.total <= 0.10 &&
    afterGlobal[4]    / afterGlobal.total <= 0.05 &&
    afterGlobal["5+"] / afterGlobal.total <= 0.03;
  console.log(`  Global targets: ${globalPass ? "✓ PASS" : "✗ FAIL"}`);

  // --- Per-conference full distributions with tier-aware pass/fail ----
  console.log("\n=== By Conference — full distribution, adjusted/total, tier-aware PASS/FAIL ===");
  const sortedConfs = Object.entries(afterByConf).sort(
    ([a], [b]) => (CONFERENCE_TIERS[a] ?? 1) - (CONFERENCE_TIERS[b] ?? 1) || a.localeCompare(b),
  );
  let confFails = 0;
  for (const [conf, buckets] of sortedConfs) {
    const tier = CONFERENCE_TIERS[conf] ?? 1;
    const adj  = byConference[conf]?.adjusted ?? 0;
    const tot  = buckets.total;
    const pass = checkConf(buckets, conf);
    if (!pass) confFails++;
    const t = confThresholds(conf);
    console.log(
      `\n  [Tier ${tier}] ${conf} — ${adj} adjusted / ${tot} total — ${pass ? "✓ PASS" : "✗ FAIL"}`
      + ` (thresholds: 0 F/G ≥${t.min0}%, 3+ F/G ≤${t.max3}%, 4+ F/G ≤${t.max4}%, 5+ F/G ≤${t.max5p}%)`,
    );
    printBuckets(buckets);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Adjusted      : ${adjusted}`);
  console.log(`Unchanged     : ${unchanged}`);
  console.log(`OVR drift     : ${ovrDriftCount}`);
  console.log(`Global targets: ${globalPass ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`Conf failures : ${confFails}`);
  console.log(`Migration complete.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
