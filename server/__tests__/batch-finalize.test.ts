/**
 * Integration test: batch-finalize correctness
 *
 * Verifies that batchFinalizeGames (the bulk SQL path that replaced N per-game
 * round-trips) correctly writes:
 *   - game rows: is_complete=true, correct home_score / away_score
 *   - standings: wins / losses / runs_scored / runs_allowed incremented correctly
 *   - player_season_stats: rows exist for all batters + pitchers in every game
 *
 * Run: npx tsx server/__tests__/batch-finalize.test.ts
 */

import { db, pool } from "../db";
import {
  leagues,
  teams,
  games,
  standings,
  playerSeasonStats,
  leagueEvents,
  gameRecaps,
} from "@shared/schema";
import { batchFinalizeGames, CoachXpDelta } from "../game-finalizer";
import { eq, and, inArray, sql as drizzleSql } from "drizzle-orm";

// ─── helpers ────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── minimal box-score factory ───────────────────────────────────────────────

function makeBoxScore(
  homeBatters: string[],
  homePitcher: string,
  awayBatters: string[],
  awayPitcher: string,
) {
  const batting = (ids: string[], prefix: string) =>
    ids.map((id, i) => ({
      playerId: id,
      name: `${prefix} Player ${i + 1}`,
      position: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"][i % 9],
      ab: 4,
      h: 1,
      r: i === 0 ? 1 : 0,
      rbi: i === 0 ? 1 : 0,
      hr: 0,
      bb: 0,
      so: 1,
      doubles: 0,
      triples: 0,
      hbp: 0,
      sb: 0,
      cs: 0,
      exitVelo: 88,
      barrels: 0,
      ballsInPlay: 3,
      hardHits: 1,
      putouts: 1,
      assists: 0,
      fieldingErrors: 0,
      totalChances: 1,
    }));

  const pitching = (id: string, name: string, er: number) => [
    {
      playerId: id,
      name,
      ip: "7.0",
      h: 5,
      r: er,
      er,
      bb: 2,
      so: 8,
      hr: 0,
      totalPitches: 95,
      whiffs: 12,
      spinRate: 2300,
    },
  ];

  return JSON.stringify({
    innings: [[3, 1], [2, 2]],
    home: {
      batting: batting(homeBatters, "Home"),
      pitching: pitching(homePitcher, "Home Pitcher", 2),
    },
    away: {
      batting: batting(awayBatters, "Away"),
      pitching: pitching(awayPitcher, "Away Pitcher", 3),
    },
  });
}

// ─── main test ───────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const suffix = Date.now();
  const testUserId   = `test-user-${suffix}`;
  const testLeagueId = `test-league-${suffix}`;
  const teamAId      = `test-team-a-${suffix}`;
  const teamBId      = `test-team-b-${suffix}`;
  const teamCId      = `test-team-c-${suffix}`;

  // Fake player IDs — no FK constraint on player_season_stats.player_id
  const makePlayerIds = (teamPrefix: string, n = 9) =>
    Array.from({ length: n }, (_, i) => `${teamPrefix}-p${i + 1}-${suffix}`);

  const playersA = makePlayerIds("a");
  const pitcherA = `a-sp-${suffix}`;
  const playersB = makePlayerIds("b");
  const pitcherB = `b-sp-${suffix}`;
  const playersC = makePlayerIds("c");
  const pitcherC = `c-sp-${suffix}`;

  console.log("\n=== batch-finalize integration test ===");
  console.log(`  league: ${testLeagueId}\n`);

  // ── 1. Seed test fixtures ─────────────────────────────────────────────────
  try {
    // Insert a minimal user (commissioner)
    await pool.query(
      `INSERT INTO users (id, email, password) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [testUserId, `test-${suffix}@example.com`, "hash"],
    );

    // Insert league
    await pool.query(
      `INSERT INTO leagues
         (id, name, commissioner_id, max_teams, cpu_difficulty, season_length,
          current_season, current_phase, current_week, is_test_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [testLeagueId, `Test League ${suffix}`, testUserId, 3,
       "beginner", "short", 1, "regular_season", 1, true],
    );

    // Insert 3 teams (no conference required — conferenceId is nullable)
    for (const [teamId, abbr] of [
      [teamAId, "TSA"],
      [teamBId, "TSB"],
      [teamCId, "TSC"],
    ] as [string, string][]) {
      await pool.query(
        `INSERT INTO teams
           (id, league_id, name, mascot, abbreviation, city, state,
            primary_color, secondary_color, is_cpu)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [teamId, testLeagueId, `Team ${abbr}`, "Testers", abbr,
         "Testville", "TX", "#000000", "#FFD700", true],
      );
    }

    // Insert standing rows for each team (season 1)
    for (const teamId of [teamAId, teamBId, teamCId]) {
      await pool.query(
        `INSERT INTO standings (league_id, team_id, season) VALUES ($1,$2,$3)`,
        [testLeagueId, teamId, 1],
      );
    }

    // Insert 2 incomplete games (week 1, regular phase)
    //   Game 1: A (home, 5 runs) vs B (away, 3 runs)  → A wins
    //   Game 2: C (home, 2 runs) vs A (away, 4 runs)  → A wins again
    const game1Id = `test-game1-${suffix}`;
    const game2Id = `test-game2-${suffix}`;

    for (const [gid, home, away] of [
      [game1Id, teamAId, teamBId],
      [game2Id, teamCId, teamAId],
    ] as [string, string, string][]) {
      await pool.query(
        `INSERT INTO games
           (id, league_id, season, week, home_team_id, away_team_id,
            is_complete, phase, is_conference, game_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [gid, testLeagueId, 1, 1, home, away,
         false, "regular", true, "regular"],
      );
    }

    // ── 2. Call batchFinalizeGames ──────────────────────────────────────────

    const box1 = makeBoxScore(playersA, pitcherA, playersB, pitcherB);
    const box2 = makeBoxScore(playersC, pitcherC, playersA, pitcherA);

    const coachXpAccum = new Map<string, CoachXpDelta>();

    const leagueTeams = [
      { id: teamAId, coachId: null, isCpu: true },
      { id: teamBId, coachId: null, isCpu: true },
      { id: teamCId, coachId: null, isCpu: true },
    ] as any[];

    await batchFinalizeGames(
      [
        {
          game: {
            id: game1Id, homeTeamId: teamAId, awayTeamId: teamBId,
            season: 1, week: 1, isConference: true, gameType: "regular",
          },
          result: { homeScore: 5, awayScore: 3, boxScore: box1 },
        },
        {
          game: {
            id: game2Id, homeTeamId: teamCId, awayTeamId: teamAId,
            season: 1, week: 1, isConference: true, gameType: "regular",
          },
          result: { homeScore: 2, awayScore: 4, boxScore: box2 },
        },
      ],
      testLeagueId,
      1,
      coachXpAccum,
      leagueTeams,
    );

    // ── 3. Assertions: games ───────────────────────────────────────────────

    console.log("\n[games]");

    const completedGames = await db
      .select()
      .from(games)
      .where(inArray(games.id, [game1Id, game2Id]));

    assert(completedGames.length === 2, "both game rows exist");

    const g1 = completedGames.find(g => g.id === game1Id)!;
    const g2 = completedGames.find(g => g.id === game2Id)!;

    assert(g1.isComplete === true, "game1 is_complete = true");
    assert(g1.homeScore === 5,     "game1 home_score = 5");
    assert(g1.awayScore === 3,     "game1 away_score = 3");

    assert(g2.isComplete === true, "game2 is_complete = true");
    assert(g2.homeScore === 2,     "game2 home_score = 2");
    assert(g2.awayScore === 4,     "game2 away_score = 4");

    // ── 4. Assertions: standings ───────────────────────────────────────────

    console.log("\n[standings]");

    const standingRows = await db
      .select()
      .from(standings)
      .where(
        and(
          eq(standings.leagueId, testLeagueId),
          eq(standings.season, 1),
        )
      );

    const standingByTeam = new Map(standingRows.map(s => [s.teamId, s]));

    const sA = standingByTeam.get(teamAId)!;
    const sB = standingByTeam.get(teamBId)!;
    const sC = standingByTeam.get(teamCId)!;

    assert(!!sA, "standings row exists for team A");
    assert(!!sB, "standings row exists for team B");
    assert(!!sC, "standings row exists for team C");

    // Team A: home win (5-3) + away win (4-2) → 2 W, 0 L
    assert(sA.wins   === 2, `team A wins = 2  (got ${sA.wins})`);
    assert(sA.losses === 0, `team A losses = 0 (got ${sA.losses})`);
    assert(sA.runsScored   === 5 + 4, `team A runsScored = 9  (got ${sA.runsScored})`);
    assert(sA.runsAllowed  === 3 + 2, `team A runsAllowed = 5 (got ${sA.runsAllowed})`);
    assert(sA.conferenceWins   === 2, `team A confWins = 2   (got ${sA.conferenceWins})`);
    assert(sA.conferenceLosses === 0, `team A confLosses = 0 (got ${sA.conferenceLosses})`);

    // Team B: away loss (3-5) → 0 W, 1 L
    assert(sB.wins   === 0, `team B wins = 0   (got ${sB.wins})`);
    assert(sB.losses === 1, `team B losses = 1 (got ${sB.losses})`);
    assert(sB.runsScored  === 3, `team B runsScored = 3  (got ${sB.runsScored})`);
    assert(sB.runsAllowed === 5, `team B runsAllowed = 5 (got ${sB.runsAllowed})`);

    // Team C: home loss (2-4) → 0 W, 1 L
    assert(sC.wins   === 0, `team C wins = 0   (got ${sC.wins})`);
    assert(sC.losses === 1, `team C losses = 1 (got ${sC.losses})`);
    assert(sC.runsScored  === 2, `team C runsScored = 2  (got ${sC.runsScored})`);
    assert(sC.runsAllowed === 4, `team C runsAllowed = 4 (got ${sC.runsAllowed})`);

    // ── 5. Assertions: player_season_stats ───────────────────────────────────

    console.log("\n[player_season_stats]");

    const statsRows = await db
      .select()
      .from(playerSeasonStats)
      .where(
        and(
          eq(playerSeasonStats.leagueId, testLeagueId),
          eq(playerSeasonStats.season, 1),
        )
      );

    // game1: 9 home batters + 1 home pitcher + 9 away batters + 1 away pitcher = 20
    // game2: same layout, but pitcherA also pitched in game1 (away) and game2 (away)
    // After pre-aggregation, pitcherA should have a single merged row.
    // playersA appear in both games (home in g1, away in g2) → each gets 1 merged row
    // Total unique players: A-team has 9 batters + 1 pitcher = 10 unique players (2 games each)
    //                       B-team has 9 batters + 1 pitcher = 10 unique
    //                       C-team has 9 batters + 1 pitcher = 10 unique
    // All unique → 30 rows total

    const expectedPlayerCount = 30;
    assert(
      statsRows.length === expectedPlayerCount,
      `player_season_stats has ${expectedPlayerCount} rows (got ${statsRows.length})`,
    );

    // pitcherA pitched in both games (home pitcher g1 via playersA context + away pitcher g2)
    // Actually: in box1, pitcherA is the home pitcher for teamA
    //           in box2, pitcherA is the away pitcher for teamA
    // Both belong to the same (leagueId=testLeagueId, season=1, playerId=pitcherA) key
    // → pre-aggregation merges them into 1 row with pitchingGames=2
    const pitcherARow = statsRows.find(r => r.playerId === pitcherA);
    assert(!!pitcherARow, "pitcher A has a season stats row");
    assert(
      pitcherARow!.pitchingGames === 2,
      `pitcher A pitchingGames = 2 (got ${pitcherARow?.pitchingGames}) — stats from both games merged`,
    );
    assert(
      pitcherARow!.ipOuts === 42, // 7 innings × 3 outs × 2 games
      `pitcher A ipOuts = 42 (got ${pitcherARow?.ipOuts})`,
    );

    // Each teamA batter appeared in both games → games field should be 2
    const batterA1Row = statsRows.find(r => r.playerId === playersA[0]);
    assert(!!batterA1Row, "team A batter 1 has a season stats row");
    assert(
      batterA1Row!.games === 2,
      `team A batter 1 games = 2 (got ${batterA1Row?.games})`,
    );

    // teamB and teamC players appeared in only 1 game each
    const batterB1Row = statsRows.find(r => r.playerId === playersB[0]);
    assert(!!batterB1Row, "team B batter 1 has a season stats row");
    assert(
      batterB1Row!.games === 1,
      `team B batter 1 games = 1 (got ${batterB1Row?.games})`,
    );

    // pitcher wins/losses are assigned correctly
    // Game 1: A wins (homeScore 5 > 3) → pitcherA (home pitcher) gets win
    // Game 2: A wins (awayScore 4 > 2) → pitcherA (away pitcher) gets win
    //         pitcherC (home pitcher) gets loss
    assert(
      (pitcherARow!.wins ?? 0) === 2,
      `pitcher A wins = 2 (got ${pitcherARow?.wins})`,
    );
    assert(
      (pitcherARow!.losses ?? 0) === 0,
      `pitcher A losses = 0 (got ${pitcherARow?.losses})`,
    );

    const pitcherCRow = statsRows.find(r => r.playerId === pitcherC);
    assert(!!pitcherCRow, "pitcher C has a season stats row");
    assert(
      (pitcherCRow!.losses ?? 0) === 1,
      `pitcher C losses = 1 (got ${pitcherCRow?.losses})`,
    );

    console.log("\n[done]");

  } finally {
    // ── 6. Clean up all test fixtures ─────────────────────────────────────
    // Wait briefly for fire-and-forget side effects (recaps, events) to settle
    await sleep(500);

    try {
      // Order matters: children before parents (no ON DELETE CASCADE in schema)
      await pool.query(`DELETE FROM game_recaps     WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM league_events   WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM player_season_stats WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM standings        WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM games            WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM teams            WHERE league_id = $1`, [testLeagueId]);
      await pool.query(`DELETE FROM leagues          WHERE id = $1`,        [testLeagueId]);
      await pool.query(`DELETE FROM users            WHERE id = $1`,        [testUserId]);
      console.log("  cleanup: OK");
    } catch (cleanupErr) {
      console.warn("  cleanup warning (non-fatal):", cleanupErr);
    }

    await pool.end();
  }
}

run().then(() => {
  if (process.exitCode === 1) {
    console.error("\nOne or more assertions FAILED.\n");
    process.exit(1);
  } else {
    console.log("\nAll assertions passed.\n");
    process.exit(0);
  }
}).catch(err => {
  console.error("\nTest threw an unexpected error:", err);
  process.exit(1);
});
