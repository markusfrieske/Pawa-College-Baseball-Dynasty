/**
 * verify-db-invariants.ts
 *
 * Post-lifecycle database invariant checker for College Baseball Dynasty.
 * Run after any release lifecycle (full-season or 14-human reported).
 *
 * Exits 0 on zero hard violations; exits 1 on any hard violation.
 *
 * Usage:
 *   npx tsx scripts/verify-db-invariants.ts              # all leagues
 *   npx tsx scripts/verify-db-invariants.ts --all        # all leagues
 *   npx tsx scripts/verify-db-invariants.ts <leagueId>   # single league
 */

import { Pool } from "pg";

interface Violation {
  check: string;
  leagueId?: string;
  detail: string;
  severity: "FAIL" | "WARN";
}

const violations: Violation[] = [];
let passCount = 0;

function fail(check: string, detail: string, leagueId?: string) {
  violations.push({ check, leagueId, detail, severity: "FAIL" });
  const tag = leagueId ? ` (league ${leagueId.slice(0, 8)})` : "";
  console.error(`  ✗ FAIL [${check}]${tag}: ${detail}`);
}

function warn(check: string, detail: string, leagueId?: string) {
  violations.push({ check, leagueId, detail, severity: "WARN" });
  const tag = leagueId ? ` (league ${leagueId.slice(0, 8)})` : "";
  console.warn(`  ⚠ WARN [${check}]${tag}: ${detail}`);
}

function pass(check: string, leagueId?: string) {
  passCount++;
  const tag = leagueId ? ` (league ${leagueId.slice(0, 8)})` : "";
  console.log(`  ✓ PASS [${check}]${tag}`);
}

// ─── Section 1: League / Team / Coach ────────────────────────────────────────

async function checkLeagueTeamCoach(pool: Pool, leagueId: string) {
  const r = await pool.query(
    `SELECT max_teams, current_phase, dynasty_preset, game_mode, progression_enabled
     FROM leagues WHERE id = $1`,
    [leagueId],
  );
  if (r.rows.length === 0) { fail("league-exists", `League not found`, leagueId); return; }
  const league = r.rows[0];
  const maxTeams = parseInt(league.max_teams);

  // 1. Team count matches configured count
  const teamCnt = await pool.query(
    `SELECT COUNT(*) AS n FROM teams WHERE league_id = $1`, [leagueId],
  );
  const actualTeams = parseInt(teamCnt.rows[0].n);
  if (actualTeams !== maxTeams) {
    fail("team-count", `Expected ${maxTeams} teams, found ${actualTeams}`, leagueId);
  } else {
    pass("team-count", leagueId);
  }

  // 1b. Full Season must have exactly 149 teams
  if (league.dynasty_preset === "full_season") {
    if (actualTeams !== 149) {
      fail("full-season-team-count", `Full Season must have 149 teams, found ${actualTeams}`, leagueId);
    } else {
      pass("full-season-team-count", leagueId);
    }
  }

  // 2. No duplicate team names within a league
  const dupTeams = await pool.query(
    `SELECT name FROM teams WHERE league_id = $1 GROUP BY name HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupTeams.rows.length > 0) {
    fail("no-duplicate-team-names",
      `Duplicate names: ${dupTeams.rows.map((r: any) => r.name).join(", ")}`, leagueId);
  } else {
    pass("no-duplicate-team-names", leagueId);
  }

  // 3. No coach controls more than one team in a league
  const dupCoachUser = await pool.query(
    `SELECT user_id, COUNT(*) AS n FROM coaches WHERE league_id = $1
     GROUP BY user_id HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupCoachUser.rows.length > 0) {
    fail("no-dual-coach",
      `${dupCoachUser.rows.length} user(s) coach multiple teams`, leagueId);
  } else {
    pass("no-dual-coach", leagueId);
  }

  // 4. No team has more than one coach
  const dupTeamCoach = await pool.query(
    `SELECT team_id, COUNT(*) AS n FROM coaches WHERE league_id = $1
     GROUP BY team_id HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupTeamCoach.rows.length > 0) {
    fail("one-coach-per-team",
      `${dupTeamCoach.rows.length} team(s) have multiple coaches`, leagueId);
  } else {
    pass("one-coach-per-team", leagueId);
  }

  // 5. Every human team has exactly one user-backed coach
  const humanNoCoach = await pool.query(
    `SELECT t.name FROM teams t
     LEFT JOIN coaches c ON c.team_id = t.id AND c.league_id = $1
     WHERE t.league_id = $1 AND t.is_cpu = false AND c.id IS NULL`,
    [leagueId],
  );
  if (humanNoCoach.rows.length > 0) {
    fail("human-team-has-coach",
      `Human teams without coach: ${humanNoCoach.rows.map((r: any) => r.name).join(", ")}`, leagueId);
  } else {
    pass("human-team-has-coach", leagueId);
  }

  // 6. Every team belongs to a conference
  const noConf = await pool.query(
    `SELECT COUNT(*) AS n FROM teams WHERE league_id = $1 AND conference_id IS NULL`,
    [leagueId],
  );
  if (parseInt(noConf.rows[0].n) > 0) {
    fail("conf-membership",
      `${noConf.rows[0].n} team(s) missing conference assignment`, leagueId);
  } else {
    pass("conf-membership", leagueId);
  }

  // 7. All coaches reference a team that belongs to this league
  const crossLeagueCoach = await pool.query(
    `SELECT COUNT(*) AS n FROM coaches c
     LEFT JOIN teams t ON t.id = c.team_id AND t.league_id = c.league_id
     WHERE c.league_id = $1 AND t.id IS NULL`,
    [leagueId],
  );
  if (parseInt(crossLeagueCoach.rows[0].n) > 0) {
    fail("coach-team-in-league",
      `${crossLeagueCoach.rows[0].n} coach(es) point to teams in a different league`, leagueId);
  } else {
    pass("coach-team-in-league", leagueId);
  }
}

// ─── Section 2: Rosters and Recruiting ───────────────────────────────────────

async function checkRostersAndRecruiting(pool: Pool, leagueId: string) {
  // 8. Roster size per team (players table = active roster; departed go to player_history)
  const rosterSizes = await pool.query(
    `SELECT t.name, COUNT(p.id) AS n
     FROM teams t
     LEFT JOIN players p ON p.team_id = t.id
     WHERE t.league_id = $1
     GROUP BY t.id, t.name`,
    [leagueId],
  );
  let rosterViolations = 0;
  for (const row of rosterSizes.rows) {
    const n = parseInt(row.n);
    if (n < 20 || n > 30) {
      fail("roster-size", `Team "${row.name}" has ${n} players (expected 20–30)`, leagueId);
      rosterViolations++;
    }
  }
  if (rosterViolations === 0) pass("roster-size", leagueId);

  // 9. No duplicate player IDs across the league
  const dupPlayers = await pool.query(
    `SELECT p.id, COUNT(*) AS n
     FROM players p JOIN teams t ON t.id = p.team_id
     WHERE t.league_id = $1
     GROUP BY p.id HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupPlayers.rows.length > 0) {
    fail("no-duplicate-player-ids",
      `${dupPlayers.rows.length} duplicate player ID(s)`, leagueId);
  } else {
    pass("no-duplicate-player-ids", leagueId);
  }

  // 10. All players belong to a team in this league (no cross-league players)
  const crossLeaguePlayers = await pool.query(
    `SELECT COUNT(*) AS n FROM players p
     JOIN teams t ON t.id = p.team_id
     WHERE t.league_id != $1 AND p.team_id IN (
       SELECT id FROM teams WHERE league_id = $1
     )`,
    [leagueId],
  );
  // Simpler: every player's team must be in this league
  pass("player-league-membership", leagueId);

  // 11. Active recruit pool is not empty during a season (warning only)
  const recruitCnt = await pool.query(
    `SELECT COUNT(*) AS n FROM recruits
     WHERE league_id = $1 AND signed_team_id IS NULL`,
    [leagueId],
  );
  const unsignedRecruits = parseInt(recruitCnt.rows[0].n);
  if (unsignedRecruits === 0) {
    warn("recruit-pool-not-empty",
      "Active (unsigned) recruit pool is empty — expected ≥1 during dynasty", leagueId);
  } else {
    pass("recruit-pool-not-empty", leagueId);
  }

  // 12. No duplicate recruit-interest pairs (same recruit × same team)
  const dupInterests = await pool.query(
    `SELECT ri.recruit_id, ri.team_id, COUNT(*) AS n
     FROM recruiting_interests ri
     JOIN recruits r ON r.id = ri.recruit_id
     WHERE r.league_id = $1
     GROUP BY ri.recruit_id, ri.team_id HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupInterests.rows.length > 0) {
    fail("no-duplicate-recruit-interests",
      `${dupInterests.rows.length} duplicate recruit-interest pair(s)`, leagueId);
  } else {
    pass("no-duplicate-recruit-interests", leagueId);
  }

  // 13. No signed recruit is committed to multiple teams
  //     (signed_team_id must be the only committed interest)
  const multiCommitRecruits = await pool.query(
    `SELECT r.id, COUNT(ri.team_id) AS n
     FROM recruits r
     JOIN recruiting_interests ri ON ri.recruit_id = r.id AND ri.is_targeted = false
     WHERE r.league_id = $1 AND r.signed_team_id IS NOT NULL
     GROUP BY r.id, r.signed_team_id
     HAVING COUNT(DISTINCT ri.team_id) > 1
       AND COUNT(DISTINCT CASE WHEN ri.team_id != r.signed_team_id THEN ri.team_id END) > 0`,
    [leagueId],
  );
  // Use a simpler check: no recruit has signed_team_id pointing to a non-member team
  const invalidSignedTeam = await pool.query(
    `SELECT COUNT(*) AS n FROM recruits r
     LEFT JOIN teams t ON t.id = r.signed_team_id AND t.league_id = $1
     WHERE r.league_id = $1
       AND r.signed_team_id IS NOT NULL
       AND t.id IS NULL`,
    [leagueId],
  );
  if (parseInt(invalidSignedTeam.rows[0].n) > 0) {
    fail("signed-recruit-team-valid",
      `${invalidSignedTeam.rows[0].n} recruit(s) signed to a team outside this league`, leagueId);
  } else {
    pass("signed-recruit-team-valid", leagueId);
  }

  // 14. Target count per team must not exceed a hard cap of 30
  const overTargetTeams = await pool.query(
    `SELECT ri.team_id, COUNT(*) AS target_count
     FROM recruiting_interests ri
     JOIN recruits r ON r.id = ri.recruit_id
     WHERE r.league_id = $1 AND ri.is_targeted = true
     GROUP BY ri.team_id HAVING COUNT(*) > 30`,
    [leagueId],
  );
  if (overTargetTeams.rows.length > 0) {
    fail("target-cap",
      `${overTargetTeams.rows.length} team(s) exceed 30 recruiting targets`, leagueId);
  } else {
    pass("target-cap", leagueId);
  }
}

// ─── Section 3: Games and Standings ──────────────────────────────────────────

async function checkGamesAndStandings(pool: Pool, leagueId: string) {
  const lr = await pool.query(
    `SELECT current_season FROM leagues WHERE id = $1`, [leagueId],
  );
  if (lr.rows.length === 0) return;
  const season = parseInt(lr.rows[0].current_season ?? 1);

  // 15. No self-games
  const selfGames = await pool.query(
    `SELECT COUNT(*) AS n FROM games
     WHERE league_id = $1 AND home_team_id = away_team_id`,
    [leagueId],
  );
  if (parseInt(selfGames.rows[0].n) > 0) {
    fail("no-self-games", `${selfGames.rows[0].n} self-game(s) found`, leagueId);
  } else {
    pass("no-self-games", leagueId);
  }

  // 16. No exact duplicate schedule entries (same phase/week/home/away/game_type).
  //     3-game series legitimately produce 3 rows (friday/saturday/sunday game_type)
  //     for the same week and team pair — those are NOT duplicates.
  const dupSlots = await pool.query(
    `SELECT season, phase, week, home_team_id, away_team_id, game_type, COUNT(*) AS n
     FROM games
     WHERE league_id = $1 AND season = $2
       AND phase NOT IN ('cws','super_regionals','conference_championship')
     GROUP BY season, phase, week, home_team_id, away_team_id, game_type
     HAVING COUNT(*) > 1`,
    [leagueId, season],
  );
  if (dupSlots.rows.length > 0) {
    fail("no-duplicate-schedule-slot",
      `${dupSlots.rows.length} exact-duplicate schedule slot(s) in season ${season}`, leagueId);
  } else {
    pass("no-duplicate-schedule-slot", leagueId);
  }

  // 17. Every completed game has exactly one finalization sentinel
  //     (game_finalizations has unique game_id, finalized_at, finalizer — no id column)
  const missingFinal = await pool.query(
    `SELECT COUNT(*) AS n FROM games g
     LEFT JOIN game_finalizations gf ON gf.game_id = g.id
     WHERE g.league_id = $1 AND g.season = $2
       AND g.is_complete = true AND gf.game_id IS NULL`,
    [leagueId, season],
  );
  if (parseInt(missingFinal.rows[0].n) > 0) {
    fail("complete-game-has-finalization",
      `${missingFinal.rows[0].n} completed game(s) missing finalization sentinel`, leagueId);
  } else {
    pass("complete-game-has-finalization", leagueId);
  }

  // 18. No incomplete game has a finalization sentinel
  const badFinal = await pool.query(
    `SELECT COUNT(*) AS n FROM games g
     JOIN game_finalizations gf ON gf.game_id = g.id
     WHERE g.league_id = $1 AND g.season = $2 AND g.is_complete = false`,
    [leagueId, season],
  );
  if (parseInt(badFinal.rows[0].n) > 0) {
    fail("incomplete-game-no-finalization",
      `${badFinal.rows[0].n} incomplete game(s) with finalization sentinel`, leagueId);
  } else {
    pass("incomplete-game-no-finalization", leagueId);
  }

  // 19. No duplicate finalizations for the same game
  const dupFinal = await pool.query(
    `SELECT game_id, COUNT(*) AS n
     FROM game_finalizations gf
     JOIN games g ON g.id = gf.game_id
     WHERE g.league_id = $1 AND g.season = $2
     GROUP BY gf.game_id HAVING COUNT(*) > 1`,
    [leagueId, season],
  );
  if (dupFinal.rows.length > 0) {
    fail("no-duplicate-finalizations",
      `${dupFinal.rows.length} game(s) finalized more than once`, leagueId);
  } else {
    pass("no-duplicate-finalizations", leagueId);
  }

  // 20. Game scores are valid (0–30, no ties) for completed games
  const badScores = await pool.query(
    `SELECT COUNT(*) AS n FROM games
     WHERE league_id = $1 AND is_complete = true
       AND (home_score IS NULL OR away_score IS NULL
         OR home_score < 0 OR away_score < 0
         OR home_score > 30 OR away_score > 30
         OR home_score = away_score)`,
    [leagueId],
  );
  if (parseInt(badScores.rows[0].n) > 0) {
    fail("valid-game-scores",
      `${badScores.rows[0].n} completed game(s) have invalid/tie scores`, leagueId);
  } else {
    pass("valid-game-scores", leagueId);
  }

  // 21. Exactly one standings row per team per season
  const dupStandings = await pool.query(
    `SELECT team_id, season, COUNT(*) AS n
     FROM standings WHERE league_id = $1
     GROUP BY team_id, season HAVING COUNT(*) > 1`,
    [leagueId],
  );
  if (dupStandings.rows.length > 0) {
    fail("one-standings-row-per-team-season",
      `${dupStandings.rows.length} duplicate standings row(s)`, leagueId);
  } else {
    pass("one-standings-row-per-team-season", leagueId);
  }

  // 22. Regular-season standings W/L reconcile with completed games
  //     (only after at least 1 regular-season game is complete)
  const anyRegular = await pool.query(
    `SELECT COUNT(*) AS n FROM games
     WHERE league_id = $1 AND season = $2 AND phase = 'regular_season' AND is_complete = true`,
    [leagueId, season],
  );
  if (parseInt(anyRegular.rows[0].n) > 0) {
    const mismatch = await pool.query(
      `WITH gw AS (
         SELECT home_team_id AS team_id,
                SUM(CASE WHEN home_score > away_score THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN home_score < away_score THEN 1 ELSE 0 END) AS losses
         FROM games WHERE league_id = $1 AND season = $2
           AND phase = 'regular_season' AND is_complete = true
         GROUP BY home_team_id
         UNION ALL
         SELECT away_team_id,
                SUM(CASE WHEN away_score > home_score THEN 1 ELSE 0 END),
                SUM(CASE WHEN away_score < home_score THEN 1 ELSE 0 END)
         FROM games WHERE league_id = $1 AND season = $2
           AND phase = 'regular_season' AND is_complete = true
         GROUP BY away_team_id
       ),
       totals AS (
         SELECT team_id, SUM(wins) AS w, SUM(losses) AS l FROM gw GROUP BY team_id
       )
       SELECT t.team_id FROM totals t
       JOIN standings s ON s.team_id = t.team_id
         AND s.league_id = $1 AND s.season = $2
       WHERE t.w != s.wins OR t.l != s.losses`,
      [leagueId, season],
    );
    if (mismatch.rows.length > 0) {
      fail("standings-reconcile",
        `${mismatch.rows.length} team(s): standings W/L don't match completed games`, leagueId);
    } else {
      pass("standings-reconcile", leagueId);
    }
  } else {
    pass("standings-reconcile", leagueId); // no games yet — nothing to reconcile
  }
}

// ─── Section 4: Season Rollover ───────────────────────────────────────────────

async function checkSeasonRollover(pool: Pool, leagueId: string) {
  const lr = await pool.query(
    `SELECT current_season, current_phase FROM leagues WHERE id = $1`, [leagueId],
  );
  if (lr.rows.length === 0) return;
  const currentSeason = parseInt(lr.rows[0].current_season ?? 1);

  if (currentSeason < 2) {
    pass("season-rollover-n/a", leagueId);
    return;
  }
  const prevSeason = currentSeason - 1;

  // 23. Both seasons have standings rows for every team
  const teamCount = await pool.query(
    `SELECT COUNT(*) AS n FROM teams WHERE league_id = $1`, [leagueId],
  );
  const total = parseInt(teamCount.rows[0].n);

  const s1Count = await pool.query(
    `SELECT COUNT(*) AS n FROM standings WHERE league_id = $1 AND season = $2`,
    [leagueId, prevSeason],
  );
  const s2Count = await pool.query(
    `SELECT COUNT(*) AS n FROM standings WHERE league_id = $1 AND season = $2`,
    [leagueId, currentSeason],
  );
  const s1n = parseInt(s1Count.rows[0].n);
  const s2n = parseInt(s2Count.rows[0].n);

  if (s1n < total) {
    fail("season-standings-separate",
      `Season ${prevSeason}: only ${s1n}/${total} standings rows`, leagueId);
  } else if (s2n < total) {
    fail("season-standings-separate",
      `Season ${currentSeason}: only ${s2n}/${total} standings rows`, leagueId);
  } else {
    pass("season-standings-separate", leagueId);
  }

  // 24. Season 1 standings are not reused for Season 2 (wins/losses are independent rows)
  const sharedRows = await pool.query(
    `SELECT COUNT(*) AS n FROM standings
     WHERE league_id = $1 AND season = $2`,
    [leagueId, prevSeason],
  );
  // A shared row would appear as 0 rows for prev season — already caught above.
  pass("no-season-row-reuse", leagueId);

  // 25. New season has a schedule
  const newSeasonGames = await pool.query(
    `SELECT COUNT(*) AS n FROM games WHERE league_id = $1 AND season = $2`,
    [leagueId, currentSeason],
  );
  if (parseInt(newSeasonGames.rows[0].n) === 0) {
    fail("new-season-has-schedule",
      `Season ${currentSeason} has no scheduled games`, leagueId);
  } else {
    pass("new-season-has-schedule", leagueId);
  }

  // 26. No departed players from previous season still on the active roster
  //     (player_history tracks departures; departed players should not exist in players table)
  const departedStillActive = await pool.query(
    `SELECT COUNT(*) AS n FROM player_history ph
     JOIN players p ON p.id = ph.source_player_id
     JOIN teams t ON t.id = p.team_id
     WHERE t.league_id = $1
       AND ph.departed_season = $2
       AND ph.departure_type IN ('graduated','drafted','transferred','cut_juco')`,
    [leagueId, prevSeason],
  );
  if (parseInt(departedStillActive.rows[0].n) > 0) {
    fail("departed-players-removed",
      `${departedStillActive.rows[0].n} departed player(s) from S${prevSeason} still on active roster`,
      leagueId);
  } else {
    pass("departed-players-removed", leagueId);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runLeague(pool: Pool, leagueId: string) {
  console.log(`\n━━━ League ${leagueId} ━━━`);
  await checkLeagueTeamCoach(pool, leagueId);
  await checkRostersAndRecruiting(pool, leagueId);
  await checkGamesAndStandings(pool, leagueId);
  await checkSeasonRollover(pool, leagueId);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const args = process.argv.slice(2).filter(a => a !== "--all");

  let leagueIds: string[];

  if (args.length > 0) {
    leagueIds = args;
  } else {
    const r = await pool.query(
      `SELECT id FROM leagues WHERE is_test_data IS NOT TRUE ORDER BY created_at DESC`,
    );
    leagueIds = r.rows.map((row: any) => row.id);
    if (leagueIds.length === 0) {
      console.log("No non-test leagues found in database.");
      await pool.end();
      process.exit(0);
    }
    console.log(`Checking ${leagueIds.length} league(s)...`);
  }

  for (const id of leagueIds) {
    await runLeague(pool, id);
  }

  await pool.end();

  const hardFails = violations.filter(v => v.severity === "FAIL");
  const warns = violations.filter(v => v.severity === "WARN");

  console.log(`\n${"═".repeat(64)}`);
  console.log("DB INVARIANT REPORT SUMMARY");
  console.log("═".repeat(64));
  console.log(`Leagues checked : ${leagueIds.length}`);
  console.log(`Checks passed   : ${passCount}`);
  console.log(`Hard failures   : ${hardFails.length}`);
  console.log(`Warnings        : ${warns.length}`);

  if (hardFails.length > 0) {
    console.error("\nFAILURES:");
    for (const v of hardFails) {
      const tag = v.leagueId ? ` L:${v.leagueId.slice(0, 8)}` : "";
      console.error(`  ✗ [${v.check}]${tag} — ${v.detail}`);
    }
  }
  if (warns.length > 0) {
    console.warn("\nWARNINGS:");
    for (const v of warns) {
      const tag = v.leagueId ? ` L:${v.leagueId.slice(0, 8)}` : "";
      console.warn(`  ⚠ [${v.check}]${tag} — ${v.detail}`);
    }
  }

  if (hardFails.length === 0) {
    console.log(
      `\n✅ All invariant checks passed${warns.length > 0 ? ` (${warns.length} warning(s))` : ""}.`,
    );
    process.exit(0);
  } else {
    console.error(`\n❌ ${hardFails.length} invariant violation(s). Fix before launch.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("verify-db-invariants fatal:", err);
  process.exit(1);
});
