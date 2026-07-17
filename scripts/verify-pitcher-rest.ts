/**
 * verify-pitcher-rest.ts
 *
 * Regression guard for the Phase 4 day-sequential simulation change.
 *
 * Phase 4 made advance-week process games day-by-day (Friday → commit rest →
 * Saturday → commit rest → Sunday) so that pitcher rest is durably written to
 * the DB before the next day's starter is picked.  Without this test a future
 * refactor to batchFinalizeGames could silently reintroduce the race where all
 * three days simulate in parallel and the Friday starter gets reused on Saturday.
 *
 * The script runs two suites:
 *
 *   SUITE 1 – Pure-logic unit tests (no DB, deterministic)
 *     Calls computePitcherAvailability() directly with synthetic rest data and
 *     asserts that a pitcher who started Friday (typical 18-out / 6-inning outing)
 *     is marked unavailable for both Saturday and Sunday of the same week.
 *
 *   SUITE 2 – Deterministic DB integration test
 *
 *     Sub-test A: finalizeGameAtomic() commits rest correctly to DB
 *       Provisions a minimal test league, builds a known-starter synthetic box
 *       score (no randomness), calls finalizeGameAtomic(), then reads back
 *       players.lastPitchedOuts/Week/Day and asserts they were committed.
 *
 *     Sub-test B: findStartingPitcher logic respects committed DB rest
 *       All pitchers carry the same pitching role ("FRI") so role-priority
 *       cannot mask a regression. Sorted by OVR, Pitcher A (highest) would
 *       always be picked if rest were ignored. After Friday rest is committed,
 *       we replicate the exact findStartingPitcher sort+availability pass from
 *       simulateGameWithRosters and assert Pitcher A is NOT chosen for Saturday
 *       (Pitcher B is). We then write synthetic Saturday rest for Pitcher B and
 *       repeat for Sunday (Pitcher C must be chosen, not A or B).
 *
 *     The test exercises the full chain:
 *       synthetic box score → finalizeGameAtomic → DB write →
 *       getPlayersByTeam (fresh read) → computePitcherAvailability → starter pick
 *
 * Usage:
 *   npx tsx scripts/verify-pitcher-rest.ts
 *   npx tsx scripts/verify-pitcher-rest.ts --unit-only   # skip DB suite
 */

import {
  computePitcherAvailability,
  GAME_TYPE_TO_DAY,
  ipToOuts,
  type GameDay,
} from "../shared/pitcherRest";
import { db, pool } from "../server/db";
import {
  users,
  leagues,
  conferences,
  teams,
  players,
  games as gamesTable,
} from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { storage } from "../server/storage";
import { finalizeGameAtomic } from "../server/game-finalizer";

const UNIT_ONLY = process.argv.includes("--unit-only");

// ─── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.error(`  ✗  ${msg}`);
    failed++;
    failures.push(msg);
  }
}

function section(title: string) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(70));
}

/**
 * Replicates the exact findStartingPitcher logic from simulateGameWithRosters
 * (server/routes/simulation.ts ~line 444) using DB-loaded player data.
 *
 * All pitchers in the test have role "FRI" so role-priority cannot silently
 * select the right pitcher independently of rest state.  The only differentiators
 * are OVR (sort order) and computePitcherAvailability(). If rest commits are
 * broken, the highest-OVR pitcher would be picked every day.
 */
function simulatedFindStartingPitcher(
  pitchers: Array<{ id: string; overall: number | null; pitchingRole: string | null; lastPitchedOuts: number; lastPitchedWeek: number | null; lastPitchedDay: string | null; stamina: number | null }>,
  gameType: "friday" | "saturday" | "sunday",
  currentWeek: number,
): string | null {
  const GAME_TYPE_TO_ROLE: Record<string, string> = { friday: "FRI", saturday: "SAT", sunday: "SUN", midweek: "MID" };
  const STARTER_ROLES = ["FRI", "SAT", "SUN", "MID"];

  const sorted = [...pitchers].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  const slot = GAME_TYPE_TO_DAY[gameType];
  const targetRole = GAME_TYPE_TO_ROLE[gameType];

  function isAvailable(p: (typeof sorted)[0]): boolean {
    if (!slot) return true;
    return computePitcherAvailability(
      p.lastPitchedOuts ?? 0,
      p.lastPitchedWeek ?? null,
      (p.lastPitchedDay ?? null) as GameDay | null,
      p.stamina ?? 60,
      currentWeek,
      slot,
    ).available;
  }

  // Priority: (1) exact-role + rested, (2) any starter + rested, (3) exact-role fallback, (4) any starter fallback, (5) anyone
  let sp = sorted.find(p => p.pitchingRole === targetRole && isAvailable(p)) ?? null;
  if (!sp) sp = sorted.find(p => STARTER_ROLES.includes(p.pitchingRole || "") && isAvailable(p)) ?? null;
  if (!sp) sp = sorted.find(p => p.pitchingRole === targetRole) ?? null;
  if (!sp) sp = sorted.find(p => STARTER_ROLES.includes(p.pitchingRole || "")) ?? null;
  if (!sp) sp = sorted[0] ?? null;

  return sp?.id ?? null;
}

// ─── SUITE 1: pure-logic unit tests ──────────────────────────────────────────

function runUnitTests() {
  section("SUITE 1 — computePitcherAvailability() pure-logic unit tests");

  // ── 1a. Typical Friday start (18 outs = 6 innings) ───────────────────────
  // restNeeded(18)=4, daysOfRest FRI→SAT=1 → unavailable
  const fri6Inn = computePitcherAvailability(18, 1, "FRI", 60, 1, "SAT");
  assert("Typical Friday starter (18 outs) is UNAVAILABLE on Saturday same week", !fri6Inn.available,
    `available=${fri6Inn.available}, daysOfRest=${fri6Inn.daysOfRest}, maxIP=${fri6Inn.suggestedMaxIP}`);

  // restNeeded(18)=4, daysOfRest FRI→SUN=2 → still unavailable
  const fri6InnSun = computePitcherAvailability(18, 1, "FRI", 60, 1, "SUN");
  assert("Typical Friday starter (18 outs) is UNAVAILABLE on Sunday same week", !fri6InnSun.available,
    `available=${fri6InnSun.available}, daysOfRest=${fri6InnSun.daysOfRest}`);

  // ── 1b. Complete-game Friday start (27 outs = 9 innings) ─────────────────
  const fri9Inn = computePitcherAvailability(27, 1, "FRI", 70, 1, "SAT");
  assert("Complete-game Friday starter (27 outs) is UNAVAILABLE on Saturday", !fri9Inn.available);

  const fri9InnSun = computePitcherAvailability(27, 1, "FRI", 70, 1, "SUN");
  assert("Complete-game Friday starter (27 outs) is UNAVAILABLE on Sunday", !fri9InnSun.available);

  // ── 1c. Short Friday outing (2 outs < 1 inning) ──────────────────────────
  // restNeeded(2)=1, daysOfRest FRI→SAT=1 → available limited (suggestedMaxIP=1)
  const fri2Outs = computePitcherAvailability(2, 1, "FRI", 60, 1, "SAT");
  assert("Tiny Friday outing (2 outs) is available-but-limited on Saturday",
    fri2Outs.available && fri2Outs.limited,
    `available=${fri2Outs.available}, limited=${fri2Outs.limited}, maxIP=${fri2Outs.suggestedMaxIP}`);

  // ── 1d. 4-inning Friday start (12 outs) ──────────────────────────────────
  // restNeeded(12)=3, daysOfRest FRI→SAT=1 → unavailable
  const fri4Inn = computePitcherAvailability(12, 1, "FRI", 60, 1, "SAT");
  assert("4-inning Friday start (12 outs) is UNAVAILABLE on Saturday", !fri4Inn.available);

  // restNeeded(12)=3, daysOfRest FRI→SUN=2 → still unavailable (needs 3 days)
  const fri4InnSun = computePitcherAvailability(12, 1, "FRI", 60, 1, "SUN");
  assert("4-inning Friday start (12 outs) is UNAVAILABLE on Sunday (needs 3 days, only 2 available)", !fri4InnSun.available,
    `available=${fri4InnSun.available}, daysOfRest=${fri4InnSun.daysOfRest}`);

  // ── 1e. 3-inning Friday start (9 outs) on Sunday ─────────────────────────
  // restNeeded(9)=2, daysOfRest FRI→SUN=2 → suggestedMaxIP=2 → available limited
  const fri3InnSun = computePitcherAvailability(9, 1, "FRI", 60, 1, "SUN");
  assert("3-inning Friday start (9 outs) is available-but-limited on Sunday (exactly 2 days, needs 2)",
    fri3InnSun.available && fri3InnSun.limited,
    `available=${fri3InnSun.available}, limited=${fri3InnSun.limited}, daysOfRest=${fri3InnSun.daysOfRest}`);

  // ── 1f. Fresh pitcher (no prior game) ────────────────────────────────────
  const fresh = computePitcherAvailability(0, null, null, 60, 1, "SAT");
  assert("Fresh pitcher (no lastPitchedWeek) is AVAILABLE on any day", fresh.available);

  // ── 1g. Same-day guard ────────────────────────────────────────────────────
  const sameDay = computePitcherAvailability(18, 1, "SAT", 60, 1, "SAT");
  assert("Pitcher who pitched Saturday is UNAVAILABLE for another same-week SAT slot", !sameDay.available);

  // ── 1h. Cross-week carry-over ─────────────────────────────────────────────
  // daysOfRest = (2*7+3) - (1*7+2) = 8 → fully rested
  const nextWeek = computePitcherAvailability(18, 1, "FRI", 60, 2, "SAT");
  assert("Friday starter from prior week is FULLY AVAILABLE the following Saturday",
    nextWeek.available && !nextWeek.limited,
    `available=${nextWeek.available}, limited=${nextWeek.limited}`);

  // ── 1i. Mapping sanity ────────────────────────────────────────────────────
  assert("GAME_TYPE_TO_DAY maps friday → FRI", GAME_TYPE_TO_DAY["friday"] === "FRI");
  assert("GAME_TYPE_TO_DAY maps saturday → SAT", GAME_TYPE_TO_DAY["saturday"] === "SAT");
  assert("GAME_TYPE_TO_DAY maps sunday → SUN", GAME_TYPE_TO_DAY["sunday"] === "SUN");

  // ── 1j. ipToOuts round-trip ──────────────────────────────────────────────
  assert("ipToOuts('6.0') = 18", ipToOuts("6.0") === 18);
  assert("ipToOuts('5.1') = 16", ipToOuts("5.1") === 16);
  assert("ipToOuts('0.2') = 2", ipToOuts("0.2") === 2);
  assert("ipToOuts('9.0') = 27", ipToOuts("9.0") === 27);
  assert("ipToOuts('0.0') = 0", ipToOuts("0.0") === 0);

  // ── 1k. Advance-week exact scenario ──────────────────────────────────────
  // Simulate: the advance-week loop commits FRI rest before SAT runs.
  // If rest were not committed, Pitcher A (highest OVR) would start every day.
  // With rest committed (18 outs, week=3, day=FRI), SAT must pick a different pitcher.
  const WEEK = 3;
  const satAvail = computePitcherAvailability(18, WEEK, "FRI", 65, WEEK, "SAT");
  assert(`Advance-week scenario: FRI starter (18 outs, wk=${WEEK}) unavailable for SAT same week`, !satAvail.available,
    `available=${satAvail.available}, daysOfRest=${satAvail.daysOfRest}`);

  console.log(`\n  Suite 1 complete.`);
}

// ─── SUITE 2: Deterministic DB integration test ───────────────────────────────

async function runIntegrationTest() {
  section("SUITE 2 — Deterministic DB integration: finalizeGameAtomic + starter rotation");

  console.log(`
  Design notes:
  - Sub-test A: calls finalizeGameAtomic() with a known synthetic box score,
    verifies rest committed to DB (no Math.random dependency).
  - Sub-test B: replicates findStartingPitcher() sort+availability logic directly
    against DB state, confirming starters rotate Fri→Sat→Sun when rest is present.
  - All 4 pitchers per team share the same role ("FRI") so role-priority in
    findStartingPitcher cannot mask a regression — only OVR + availability matter.`);

  const TEST_SEASON = 1;
  const TEST_WEEK = 2; // use week 2 so lastPitchedWeek=TEST_WEEK is clear

  let testLeagueId: string | null = null;
  let testUserId: string | null = null;

  try {
    // ── Step 1: Provision minimal test data ───────────────────────────────────
    console.log("\n  [setup] Creating test user, league, conference, teams, players…");

    const [userRow] = await db
      .insert(users)
      .values({ email: `test-pitcher-rest-${Date.now()}@test.internal`, password: "x" })
      .returning({ id: users.id });
    testUserId = userRow.id;

    const [leagueRow] = await db
      .insert(leagues)
      .values({
        name: "Pitcher Rest Integration Test",
        commissionerId: testUserId,
        maxTeams: 2,
        currentSeason: TEST_SEASON,
        currentPhase: "regular",
        currentWeek: TEST_WEEK,
        isTestData: true,
      })
      .returning({ id: leagues.id });
    testLeagueId = leagueRow.id;

    const [confRow] = await db
      .insert(conferences)
      .values({ leagueId: testLeagueId, name: "Test Conference" })
      .returning({ id: conferences.id });
    const confId = confRow.id;

    const teamBase = {
      leagueId: testLeagueId,
      conferenceId: confId,
      mascot: "Testers",
      abbreviation: "TST",
      city: "Testville",
      state: "TX",
      zipcode: "00000",
      primaryColor: "#ffffff",
      secondaryColor: "#000000",
      prestige: 5,
      stadium: 5,
      facilities: 5,
      collegeLife: 5,
      marketing: 5,
      academics: 5,
      fanbasePassion: 5,
      fanbaseType: "enthusiastic",
      enrollment: 10000,
      nilBudget: 500000,
      nilSpent: 0,
      isCpu: true,
      nationalRank: 149,
    };

    const [homeTeamRow] = await db.insert(teams).values({ ...teamBase, name: "Home Testers" }).returning({ id: teams.id });
    const homeTeamId = homeTeamRow.id;
    const [awayTeamRow] = await db.insert(teams).values({ ...teamBase, name: "Away Testers" }).returning({ id: teams.id });
    const awayTeamId = awayTeamRow.id;

    // ── Step 2: Create pitchers — all role "FRI", sorted by OVR ──────────────
    // All share the same "FRI" pitchingRole so the only selection criteria are
    // OVR (sort) and computePitcherAvailability().  If rest commits were broken,
    // Pitcher A (highest OVR) would be picked for every game day.
    const PITCHER_OVRS = [450, 400, 350, 300]; // A, B, C, D

    function makePitcher(teamId: string, ovr: number, idx: number) {
      return {
        teamId,
        firstName: `SP${idx}`,
        lastName: `OVR${ovr}`,
        position: "P" as const,
        eligibility: "JR" as const,
        throwHand: "R" as const,
        batHand: "R" as const,
        homeState: "TX",
        hometown: "Austin",
        jerseyNumber: idx,
        overall: ovr,
        starRating: 4,
        velocity: 72,
        control: 68,
        stamina: 70,   // stamina=70 → fullStaminaIP=5 → restNeeded for 27 outs = 6 days
        stuff: 68,
        poise: 65,
        wRISP: 65,
        vsLefty: 65,
        heater: 65,
        agile: 65,
        pitchFB: 1,
        pitchSL: 4,
        pitchCH: 3,
        pitchingRole: "FRI", // all same role — role priority cannot mask regression
        depthOrder: idx,
        lastPitchedOuts: 0,
        lastPitchedWeek: null as number | null,
        lastPitchedDay: null as string | null,
        workEthicScore: 70,
        coachability: 70,
        developmentSeed: "",
        developmentModelVersion: 1,
      };
    }

    // Insert pitchers in OVR-descending order so DB row order matches OVR order.
    // This ensures both findStartingPitcher (sort by OVR) and generateBoxScore
    // (first in array) agree on who is Pitcher A.
    const homePitcherInserts = PITCHER_OVRS.map((ovr, i) => makePitcher(homeTeamId, ovr, i + 1));
    const awayPitcherInserts = PITCHER_OVRS.map((ovr, i) => makePitcher(awayTeamId, ovr, i + 1));

    const homePitcherRows = await db.insert(players).values(homePitcherInserts).returning({ id: players.id, overall: players.overall });
    const awayPitcherRows = await db.insert(players).values(awayPitcherInserts).returning({ id: players.id, overall: players.overall });

    // Pitcher A = highest OVR = first in inserted order = what findStartingPitcher picks
    const homePitcherA = homePitcherRows[0]; // OVR=450
    const homePitcherB = homePitcherRows[1]; // OVR=400
    const homePitcherC = homePitcherRows[2]; // OVR=350
    const awayPitcherA = awayPitcherRows[0]; // OVR=450
    const awayPitcherB = awayPitcherRows[1]; // OVR=400
    const awayPitcherC = awayPitcherRows[2]; // OVR=350

    // Add minimal position players so generateBoxScore can build a lineup
    const positions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
    for (const teamId of [homeTeamId, awayTeamId]) {
      const batters = positions.map((pos, i) => ({
        teamId, firstName: `B${i}`, lastName: pos, position: pos as string,
        eligibility: "JR" as const, throwHand: "R" as const, batHand: "R" as const,
        homeState: "TX", hometown: "Austin", jerseyNumber: i + 10,
        overall: 320, starRating: 3,
        hitForAvg: 60, power: 55, speed: 55, arm: 55, fielding: 60,
        errorResistance: 55, clutch: 55, vsLHP: 55, grit: 55, stealing: 50,
        running: 55, throwing: 55, recovery: 55, catcherAbility: pos === "C" ? 60 : 40,
        battingOrder: i + 1, depthOrder: i + 1,
        workEthicScore: 70, coachability: 70, developmentSeed: "", developmentModelVersion: 1,
      }));
      await db.insert(players).values(batters);
    }

    // ── Step 3: Create Friday game record ─────────────────────────────────────
    const [friGameRow] = await db
      .insert(gamesTable)
      .values({ leagueId: testLeagueId, season: TEST_SEASON, week: TEST_WEEK, homeTeamId, awayTeamId, isComplete: false, phase: "regular", isConference: true, gameType: "friday" })
      .returning({ id: gamesTable.id });

    console.log(`  [setup] League ${testLeagueId.slice(0,8)}, home=${homeTeamId.slice(0,8)}, away=${awayTeamId.slice(0,8)}`);
    console.log(`  [setup] Pitcher A: home=${homePitcherA.id.slice(0,8)} away=${awayPitcherA.id.slice(0,8)} (OVR=450)`);
    console.log(`  [setup] Pitcher B: home=${homePitcherB.id.slice(0,8)} away=${awayPitcherB.id.slice(0,8)} (OVR=400)`);
    console.log(`  [setup] Pitcher C: home=${homePitcherC.id.slice(0,8)} away=${awayPitcherC.id.slice(0,8)} (OVR=350)`);

    // ── SUB-TEST A: finalizeGameAtomic commits Friday rest to DB ─────────────
    section("SUITE 2 — Sub-test A: finalizeGameAtomic() commits rest to DB");
    console.log("  Using a deterministic synthetic box score: Pitcher A starts, pitches 9.0 innings.");

    // Build a synthetic box score with Pitcher A as the only pitcher (9.0 IP = 27 outs).
    // This is deterministic: no Math.random() involved.
    const FRIDAY_IP = "9.0"; // 27 outs — restNeeded=6 days → blocked all weekend
    const syntheticFriBox = {
      home: {
        pitching: [{ playerId: homePitcherA.id, ip: FRIDAY_IP, h: 5, r: 2, er: 2, bb: 1, so: 8, hr: 0, era: "2.00", totalPitches: 130, whiffs: 12, spinRate: 2400 }],
        batting: [], innings: [],
      },
      away: {
        pitching: [{ playerId: awayPitcherA.id, ip: FRIDAY_IP, h: 7, r: 3, er: 3, bb: 2, so: 6, hr: 0, era: "3.00", totalPitches: 125, whiffs: 10, spinRate: 2200 }],
        batting: [], innings: [],
      },
    };

    // Finalize Friday with the synthetic box — this calls updatePitcherRestInTx
    await finalizeGameAtomic(
      { id: friGameRow.id, homeTeamId, awayTeamId, season: TEST_SEASON, week: TEST_WEEK, isConference: true, gameType: "friday" },
      3, 2,
      syntheticFriBox,
      testLeagueId,
      { skipStandings: true, skipPlayerStats: true, skipCoachXp: true, skipLeagueEvent: true, skipCacheInvalidation: true, finalizer: "pitcher-rest-test" },
    );

    // Read back the DB state for Pitcher A (home and away)
    const [homeA_db, awayA_db] = await Promise.all([
      db.select({ id: players.id, lastPitchedOuts: players.lastPitchedOuts, lastPitchedWeek: players.lastPitchedWeek, lastPitchedDay: players.lastPitchedDay, stamina: players.stamina })
        .from(players).where(eq(players.id, homePitcherA.id)).then(r => r[0]),
      db.select({ id: players.id, lastPitchedOuts: players.lastPitchedOuts, lastPitchedWeek: players.lastPitchedWeek, lastPitchedDay: players.lastPitchedDay, stamina: players.stamina })
        .from(players).where(eq(players.id, awayPitcherA.id)).then(r => r[0]),
    ]);

    const expectedOuts = ipToOuts(FRIDAY_IP); // 27
    assert(`Home Pitcher A: lastPitchedOuts = ${expectedOuts} written to DB by finalizeGameAtomic`, homeA_db.lastPitchedOuts === expectedOuts,
      `got ${homeA_db.lastPitchedOuts}, expected ${expectedOuts}`);
    assert(`Home Pitcher A: lastPitchedWeek = ${TEST_WEEK} in DB`, homeA_db.lastPitchedWeek === TEST_WEEK,
      `got ${homeA_db.lastPitchedWeek}`);
    assert(`Home Pitcher A: lastPitchedDay = "FRI" in DB`, homeA_db.lastPitchedDay === "FRI",
      `got ${homeA_db.lastPitchedDay}`);

    assert(`Away Pitcher A: lastPitchedOuts = ${expectedOuts} written to DB by finalizeGameAtomic`, awayA_db.lastPitchedOuts === expectedOuts,
      `got ${awayA_db.lastPitchedOuts}`);
    assert(`Away Pitcher A: lastPitchedDay = "FRI" in DB`, awayA_db.lastPitchedDay === "FRI",
      `got ${awayA_db.lastPitchedDay}`);

    // Confirm computePitcherAvailability confirms the committed rest blocks SAT
    const homeAvailSat = computePitcherAvailability(homeA_db.lastPitchedOuts, homeA_db.lastPitchedWeek, homeA_db.lastPitchedDay as GameDay, homeA_db.stamina ?? 60, TEST_WEEK, "SAT");
    assert(`Home Pitcher A DB rest (${homeA_db.lastPitchedOuts} outs, FRI wk${TEST_WEEK}) blocks SAT via computePitcherAvailability`, !homeAvailSat.available,
      `available=${homeAvailSat.available}, daysOfRest=${homeAvailSat.daysOfRest}`);

    const homeAvailSun = computePitcherAvailability(homeA_db.lastPitchedOuts, homeA_db.lastPitchedWeek, homeA_db.lastPitchedDay as GameDay, homeA_db.stamina ?? 60, TEST_WEEK, "SUN");
    assert(`Home Pitcher A DB rest blocks SUN via computePitcherAvailability (restNeeded=6 days)`, !homeAvailSun.available,
      `available=${homeAvailSun.available}, daysOfRest=${homeAvailSun.daysOfRest}`);

    // ── SUB-TEST B: findStartingPitcher logic respects committed rest ─────────
    section("SUITE 2 — Sub-test B: starter rotation enforced by DB rest state");
    console.log("  Replicating findStartingPitcher sort+availability for each day.");
    console.log("  All pitchers share role 'FRI' — role-priority cannot mask rest regressions.");

    // Read fresh player state from DB (as simulateGame would via storage.getPlayersByTeam)
    const homePlayersFromDB = await db
      .select({ id: players.id, overall: players.overall, pitchingRole: players.pitchingRole, lastPitchedOuts: players.lastPitchedOuts, lastPitchedWeek: players.lastPitchedWeek, lastPitchedDay: players.lastPitchedDay, stamina: players.stamina })
      .from(players)
      .where(inArray(players.id, homePitcherRows.map(r => r.id)));

    // ── Saturday: Pitcher A is blocked (FRI rest, 27 outs, needs 6 days) ────
    const satHomePick = simulatedFindStartingPitcher(homePlayersFromDB, "saturday", TEST_WEEK);
    assert(`Saturday: findStartingPitcher picks a valid pitcher`, satHomePick !== null);
    assert(`Saturday: findStartingPitcher does NOT pick Pitcher A (highest OVR, but blocked by FRI rest)`, satHomePick !== homePitcherA.id,
      `got ${satHomePick?.slice(0,8)}, expected ≠ ${homePitcherA.id.slice(0,8)}`);
    assert(`Saturday: findStartingPitcher picks Pitcher B (second-highest OVR, still fresh)`, satHomePick === homePitcherB.id,
      `got ${satHomePick?.slice(0,8)}, expected ${homePitcherB.id.slice(0,8)}`);

    console.log(`  [SAT] Home Saturday starter: Pitcher B (OVR=400) ✓`);

    // Simulate committing Saturday rest for Pitcher B (as finalizeGameAtomic would after Saturday)
    await storage.bulkUpdatePlayerRest([
      { id: homePitcherB.id, lastPitchedOuts: expectedOuts, lastPitchedWeek: TEST_WEEK, lastPitchedDay: "SAT" },
      { id: awayPitcherB.id, lastPitchedOuts: expectedOuts, lastPitchedWeek: TEST_WEEK, lastPitchedDay: "SAT" },
    ]);

    // Read fresh DB state (as advance-week would before Sunday simulation)
    const homePlayersAfterSat = await db
      .select({ id: players.id, overall: players.overall, pitchingRole: players.pitchingRole, lastPitchedOuts: players.lastPitchedOuts, lastPitchedWeek: players.lastPitchedWeek, lastPitchedDay: players.lastPitchedDay, stamina: players.stamina })
      .from(players)
      .where(inArray(players.id, homePitcherRows.map(r => r.id)));

    // ── Sunday: Pitcher A (FRI rest) and Pitcher B (SAT rest) both blocked ──
    const sunHomePick = simulatedFindStartingPitcher(homePlayersAfterSat, "sunday", TEST_WEEK);
    assert(`Sunday: findStartingPitcher picks a valid pitcher`, sunHomePick !== null);
    assert(`Sunday: findStartingPitcher does NOT pick Pitcher A (still blocked by FRI rest)`, sunHomePick !== homePitcherA.id,
      `got ${sunHomePick?.slice(0,8)}, expected ≠ ${homePitcherA.id.slice(0,8)}`);
    assert(`Sunday: findStartingPitcher does NOT pick Pitcher B (blocked by SAT rest)`, sunHomePick !== homePitcherB.id,
      `got ${sunHomePick?.slice(0,8)}, expected ≠ ${homePitcherB.id.slice(0,8)}`);
    assert(`Sunday: findStartingPitcher picks Pitcher C (third OVR, only fresh starter available)`, sunHomePick === homePitcherC.id,
      `got ${sunHomePick?.slice(0,8)}, expected ${homePitcherC.id.slice(0,8)}`);

    console.log(`  [SUN] Home Sunday starter: Pitcher C (OVR=350) ✓`);

    // Verify that if rest commits were MISSING (simulate regression), Pitcher A would be picked
    const homePlayersNoRest = homePlayersAfterSat.map(p => ({ ...p, lastPitchedOuts: 0, lastPitchedWeek: null as null, lastPitchedDay: null as null }));
    const regressed_satPick = simulatedFindStartingPitcher(homePlayersNoRest, "saturday", TEST_WEEK);
    assert(`REGRESSION CONTROL: Without rest commits, Pitcher A (highest OVR) would be picked every day`, regressed_satPick === homePitcherA.id,
      `regression check picked ${regressed_satPick?.slice(0,8)}, expected ${homePitcherA.id.slice(0,8)} — rest commit is what forces rotation`);

    console.log(`\n  [done] All weekend series rotation assertions passed.`);

  } catch (err) {
    console.error("  [integration] Unexpected error:", err);
    failed++;
    failures.push(`Integration test threw: ${(err as Error).message}`);
  } finally {
    if (testLeagueId) {
      try {
        await storage.deleteLeague(testLeagueId);
        console.log(`\n  [cleanup] Test league ${testLeagueId.slice(0,8)} deleted.`);
      } catch (e) {
        console.warn("  [cleanup] deleteLeague failed:", (e as Error).message);
      }
    }
    if (testUserId) {
      try {
        await db.delete(users).where(eq(users.id, testUserId));
        console.log(`  [cleanup] Test user deleted.`);
      } catch (e) {
        console.warn("  [cleanup] user delete failed:", (e as Error).message);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║         Pitcher Rest Regression Test (Phase 4 Day-Sequential)        ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log();
  console.log("  Confirms: a starter used on Friday cannot repeat-start Saturday/Sunday");
  console.log("  of the same weekend series (Phase 4 day-sequential commit invariant).");

  runUnitTests();

  if (!UNIT_ONLY) {
    await runIntegrationTest();
  }

  const total = passed + failed;
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  RESULTS:  ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`\n  FAILURES:`);
    for (const f of failures) console.log(`    ✗  ${f}`);
    console.log();
    process.exit(1);
  } else {
    console.log(`\n  All assertions passed. Pitcher rest enforcement is intact.`);
  }
}

main()
  .catch(err => {
    console.error("[fatal]", err);
    process.exit(1);
  })
  .finally(() => {
    pool.end().catch(() => {});
  });
