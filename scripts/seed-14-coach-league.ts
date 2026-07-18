/**
 * seed-14-coach-league.ts
 *
 * Provisions an exact 14-team dynasty with 14 human coaches and no CPU slots via the
 * real HTTP API.  User creation and session management bypass the rate-limited
 * HTTP auth endpoints by writing directly to the DB — all other actions (league
 * creation, team-selection, invite, accept) go through real API routes.
 *
 * Steps:
 *  1. Create commissioner (DB) + build signed session cookie
 *  2. Create 14-team / 3-conference league (POST /api/leagues)
 *  3. GET /api/leagues/:id/team-selection → pick 5 teams per conference
 *  4. Commissioner claims first team (POST /api/leagues/:id/setup)
 *  5. For each of remaining 13 coaches:
 *       a. Commissioner generates single-use invite
 *       b. Create coach user (DB) + signed session
 *       c. GET /api/invites/:code → pick first available CPU team
 *       d. POST /api/invites/:code/accept → claim team
 *  6. DB verification: 14 human teams, 14 coaches
 *  7. Optionally start the dynasty
 *
 * Usage:
 *   npx tsx scripts/seed-14-coach-league.ts              # create + start
 *   npx tsx scripts/seed-14-coach-league.ts --no-start   # create only
 *   npx tsx scripts/seed-14-coach-league.ts --cleanup    # delete prior runs
 */

import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import cookieSig from "cookie-signature";
import { pool } from "../server/db";
import { storage } from "../server/storage";

const BASE_URL     = process.env.APP_URL ?? "http://localhost:5000";
const SESS_SECRET  = process.env.SESSION_SECRET ?? "";
const LEAGUE_NAME  = "e2e-14coach-multiplayer";
const PASSWORD     = "test1234!!Aa";   // meets any strength requirements
const SALT_ROUNDS  = 10;
const TOTAL_COACHES = 14;
const TOTAL_TEAMS   = 14;

const ARCHETYPES = [
  "Balanced", "Pure CEO", "Player's Coach", "Tactician",
  "Old School", "Scout Master", "Academic Dean", "Dealmaker",
];

if (!SESS_SECRET) throw new Error("SESSION_SECRET env var is not set");

// ── Logging ────────────────────────────────────────────────────────────────────
const ok   = (m: string) => console.log(`  ✓  ${m}`);
const info = (m: string) => console.log(`  ·  ${m}`);
const fail = (m: string) => console.error(`  ✗  ${m}`);
const header = (m: string) => {
  const bar = "─".repeat(Math.min(m.length + 4, 72));
  console.log(`\n${bar}\n  ${m}\n${bar}`);
};

// ── User helpers (bypass HTTP auth rate limit) ─────────────────────────────────

/** Return existing user id or insert a new one. */
async function upsertUser(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (rows.length) return rows[0].id;

  const hash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email, hash],
  );
  return ins.rows[0].id;
}

/** Sign a session id the same way express-session does and insert the row. */
async function makeSessionCookie(userId: string): Promise<string> {
  const sid = randomUUID().replace(/-/g, "");

  const sessJson = JSON.stringify({
    cookie: {
      originalMaxAge: 7 * 24 * 60 * 60 * 1000,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      secure: false,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    },
    userId,
  });

  const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO session (sid, sess, expire)
     VALUES ($1, $2::json, $3)
     ON CONFLICT (sid) DO UPDATE SET sess = $2::json, expire = $3`,
    [sid, sessJson, expire],
  );

  // cookie-signature: sign(sid, secret) = sid + '.' + base64(hmac(sid))
  const signed = cookieSig.sign(sid, SESS_SECRET);
  // express-session prefixes with 's:' and the browser receives that URL-encoded
  return encodeURIComponent(`s:${signed}`);
}

// ── Cookie-aware HTTP session client ──────────────────────────────────────────

class SessionClient {
  private cookieVal: string;

  constructor(cookieVal: string) {
    this.cookieVal = cookieVal;
  }

  async request(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Cookie": `connect.sid=${this.cookieVal}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: any;
    try { data = await res.json(); } catch { data = {}; }
    return { ok: res.ok, status: res.status, data };
  }

  async mustGet(path: string): Promise<any> {
    const r = await this.request("GET", path);
    if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    return r.data;
  }

  async mustPost(path: string, body: unknown): Promise<any> {
    const r = await this.request("POST", path, body);
    if (!r.ok) throw new Error(`POST ${path} → HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    return r.data;
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  header("Cleanup: removing previous seed runs");

  const { rows: leagues } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM leagues
      WHERE name LIKE $1 AND is_test_data = true
      ORDER BY created_at DESC`,
    [`${LEAGUE_NAME}%`],
  );

  if (leagues.length === 0) {
    info("No matching test leagues found.");
  } else {
    for (const { id, name } of leagues) {
      await storage.deleteLeague(id);
      ok(`Deleted league "${name}" (${id})`);
    }
  }

  info("Test user accounts are reused across runs (FK-safe — not deleted).");
  console.log("\nDone.\n");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args      = process.argv.slice(2);
  if (args.includes("--cleanup")) { await cleanup(); return; }
  const autoStart = !args.includes("--no-start");

  // ── Step 1: Commissioner ──────────────────────────────────────────────────
  header("Step 1 — Create commissioner account (DB-direct)");

  const commEmail = "e2e-coach-1@test.local";
  const commUserId = await upsertUser(commEmail);
  const commCookie = await makeSessionCookie(commUserId);
  const commClient = new SessionClient(commCookie);
  ok(`Commissioner: ${commEmail} (userId=${commUserId})`);

  // Verify the session is recognised by the server
  const me = await commClient.mustGet("/api/auth/me");
  ok(`Server recognised session — user id: ${me.id}`);

  // ── Step 2: Create league ─────────────────────────────────────────────────
  header("Step 2 — Create exact 14-human reported league");

  const league = await commClient.mustPost("/api/leagues", {
    name: LEAGUE_NAME,
    maxTeams: TOTAL_TEAMS,
    cpuDifficulty: "high_school",
    conferenceCount: 3,
    seasonLength: "standard",
    progressionEnabled: true,
    isTestData: true,
    gameMode: "reported",
  });
  ok(`League: "${league.name}" (id=${league.id})`);
  ok(`Phase: ${league.currentPhase}`);

  // ── Step 3: Team selection ────────────────────────────────────────────────
  header("Step 3 — Select teams (6 + 4 + 4)");

  const catalogData = await commClient.mustGet(`/api/leagues/${league.id}/team-selection`);
  const { conferences, conferenceTeamPools } = catalogData as {
    conferences: Array<{ id: string; name: string }>;
    conferenceTeamPools: Array<{
      conference: { id: string; name: string };
      teams: Array<{ name: string }>;
    }>;
  };

  if (!Array.isArray(conferenceTeamPools) || conferenceTeamPools.length === 0) {
    throw new Error(`Expected conferenceTeamPools, got: ${JSON.stringify(catalogData)}`);
  }

  const selectedTeams = conferenceTeamPools.map(({ conference, teams }, index) => ({
    conferenceId: conference.id,
    teamNames: teams.slice(0, index === 0 ? 6 : 4).map((t) => t.name),
  }));

  for (const sel of selectedTeams) {
    const conf = conferences.find((c) => c.id === sel.conferenceId);
    info(`${(conf?.name ?? sel.conferenceId).padEnd(14)}: ${sel.teamNames.join(", ")}`);
  }

  const selResult = await commClient.mustPost(`/api/leagues/${league.id}/team-selection`, { selectedTeams });
  ok(`Teams created: ${selResult.teamsCreated}`);

  // ── Step 4: Commissioner claims a team ────────────────────────────────────
  header("Step 4 — Commissioner picks a team");

  const { rows: teamRows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM teams WHERE league_id = $1 ORDER BY name LIMIT 1`,
    [league.id],
  );
  if (teamRows.length === 0) throw new Error("No teams found after team-selection");

  const commTeam = teamRows[0];
  const setupResp = await commClient.mustPost(`/api/leagues/${league.id}/setup`, {
    teamId: commTeam.id,
    coach: { firstName: "Coach", lastName: "One", archetype: "Balanced" },
  });
  ok(`Commissioner claimed: ${commTeam.name} (coachId=${setupResp.coach?.id})`);

  // ── Step 5: Remaining 13 coaches join via invite links ────────────────────
  header(`Step 5 — Join ${TOTAL_COACHES - 1} more coaches via invite links`);

  const joinLog: Array<{ email: string; teamName: string; archetype: string }> = [
    { email: commEmail, teamName: commTeam.name, archetype: "Balanced" },
  ];

  for (let i = 2; i <= TOTAL_COACHES; i++) {
    const coachEmail = `e2e-coach-${i}@test.local`;
    const archetype  = ARCHETYPES[(i - 1) % ARCHETYPES.length];

    // Commissioner generates a single-use invite
    const invite = await commClient.mustPost(`/api/leagues/${league.id}/invites`, {
      label: `coach-${i}-slot`,
    });
    const inviteCode: string = invite.inviteCode;

    // Create / reuse coach user + session (DB-direct, no rate limit)
    const coachUserId = await upsertUser(coachEmail);
    const coachCookie = await makeSessionCookie(coachUserId);
    const coachClient = new SessionClient(coachCookie);

    // Preview invite to find available CPU teams
    const preview = await coachClient.mustGet(`/api/invites/${inviteCode}`);
    const available: Array<{ id: string; name: string }> = preview.availableTeams ?? [];
    if (available.length === 0) throw new Error(`No available CPU teams for coach ${i}`);

    const pickedTeam = available[0];

    // Accept
    await coachClient.mustPost(`/api/invites/${inviteCode}/accept`, {
      teamId: pickedTeam.id,
      coachData: { firstName: "Coach", lastName: String(i), archetype },
    });

    joinLog.push({ email: coachEmail, teamName: pickedTeam.name, archetype });
    ok(`Coach ${String(i).padStart(2)}: ${coachEmail.padEnd(32)} → ${pickedTeam.name} (${archetype})`);
  }

  // ── Step 6: Verify via DB ─────────────────────────────────────────────────
  header("Step 6 — Verify final league state");

  const { rows: finalTeams } = await pool.query<{
    name: string; is_cpu: boolean; coach_count: string;
  }>(
    `SELECT t.name, t.is_cpu, COUNT(c.id) AS coach_count
       FROM teams t
       LEFT JOIN coaches c ON c.team_id = t.id
      WHERE t.league_id = $1
      GROUP BY t.id, t.name, t.is_cpu
      ORDER BY t.is_cpu, t.name`,
    [league.id],
  );

  const humanTeams = finalTeams.filter((t) => !t.is_cpu);
  const cpuTeams   = finalTeams.filter((t) =>  t.is_cpu);

  ok(`Human teams: ${humanTeams.length}  (expected ${TOTAL_COACHES})`);
  ok(`CPU teams  : ${cpuTeams.length}`);

  let allGood = true;
  if (humanTeams.length !== TOTAL_COACHES) {
    fail(`Expected ${TOTAL_COACHES} human teams, got ${humanTeams.length}`);
    allGood = false;
  }
  if (cpuTeams.length !== 0) {
    fail(`Expected 0 CPU teams in the launch profile, got ${cpuTeams.length}`);
    allGood = false;
  }
  for (const t of humanTeams) {
    if (Number(t.coach_count) !== 1) {
      fail(`Team "${t.name}" has ${t.coach_count} coaches (expected 1)`);
      allGood = false;
    }
  }
  if (!allGood) throw new Error("Verification failed — see errors above");

  const { rows: [launchRules] } = await pool.query<{
    max_teams: number; progression_enabled: boolean; game_mode: string;
  }>(
    `SELECT max_teams, progression_enabled, game_mode FROM leagues WHERE id = $1`,
    [league.id],
  );
  if (Number(launchRules?.max_teams) !== 14 || !launchRules?.progression_enabled || launchRules?.game_mode !== "reported") {
    throw new Error(`Launch rules mismatch: ${JSON.stringify(launchRules)}`);
  }
  ok("Launch rules: 14 teams, progression ON, reported results");

  // ── Step 7: Start dynasty (optional) ─────────────────────────────────────
  if (autoStart) {
    header("Step 7 — Start dynasty (commissioner)");
    info("Triggers full roster + schedule generation — may take 30–90 s…");
    await commClient.mustPost(`/api/leagues/${league.id}/start`, {});
    const startedLeague = await commClient.mustGet(`/api/leagues/${league.id}`);
    if (startedLeague.currentPhase !== "preseason") {
      throw new Error(`Expected preseason after start, got ${startedLeague.currentPhase}`);
    }
    const { rows: [startCounts] } = await pool.query<{
      teams: string; human_teams: string; players: string; recruits: string; games: string;
      regular_games: string; standings: string; storylines: string; storyline_events: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM teams WHERE league_id = $1) AS teams,
         (SELECT COUNT(*) FROM teams WHERE league_id = $1 AND is_cpu = false) AS human_teams,
         (SELECT COUNT(*) FROM players p JOIN teams t ON t.id = p.team_id WHERE t.league_id = $1) AS players,
         (SELECT COUNT(*) FROM recruits WHERE league_id = $1) AS recruits,
         (SELECT COUNT(*) FROM games WHERE league_id = $1 AND season = 1) AS games,
         (SELECT COUNT(*) FROM games WHERE league_id = $1 AND season = 1 AND phase = 'regular') AS regular_games,
         (SELECT COUNT(*) FROM standings WHERE league_id = $1 AND season = 1) AS standings,
         (SELECT COUNT(*) FROM storyline_recruits WHERE league_id = $1 AND season = 1) AS storylines,
         (SELECT COUNT(*) FROM storyline_events WHERE league_id = $1 AND season = 1) AS storyline_events`,
      [league.id],
    );
    if (Number(startCounts.teams) !== 14 || Number(startCounts.human_teams) !== 14
        || Number(startCounts.players) !== 350 || Number(startCounts.recruits) !== 102
        || Number(startCounts.regular_games) !== 140 || Number(startCounts.standings) !== 14
        || Number(startCounts.storylines) !== 10 || Number(startCounts.storyline_events) === 0
        || Number(startCounts.games) < Number(startCounts.regular_games)) {
      throw new Error(`Started dynasty invariant mismatch: ${JSON.stringify(startCounts)}`);
    }
    const { rows: [scheduleRange] } = await pool.query<{ min_games: string; max_games: string }>(
      `WITH appearances AS (
         SELECT home_team_id AS team_id FROM games WHERE league_id = $1 AND season = 1 AND phase = 'regular'
         UNION ALL
         SELECT away_team_id FROM games WHERE league_id = $1 AND season = 1 AND phase = 'regular'
       ), totals AS (
         SELECT team_id, COUNT(*) AS games FROM appearances GROUP BY team_id
       ) SELECT MIN(games)::text AS min_games, MAX(games)::text AS max_games FROM totals`,
      [league.id],
    );
    if (Number(scheduleRange.min_games) !== 20 || Number(scheduleRange.max_games) !== 20) {
      throw new Error(`14-team schedule must give every team 20 regular games: ${JSON.stringify(scheduleRange)}`);
    }
    const quickSim = await commClient.request("POST", `/api/leagues/${league.id}/sim-to-offseason`, {});
    if (quickSim.status !== 409) {
      throw new Error(`Reported-mode quick sim must return 409, got ${quickSim.status}`);
    }
    ok("Dynasty started — phase: preseason; reported quick-sim blocked");
  } else {
    header("Step 7 — Skipped (--no-start flag)");
    info("League is in dynasty_setup phase. Start from the commissioner page.");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  header("Summary");
  console.log(`  League URL : ${BASE_URL}/league/${league.id}`);
  console.log(`  League ID  : ${league.id}`);
  console.log(`  Password   : ${PASSWORD}  (all accounts)`);
  console.log();
  const emailWidth = Math.max(...joinLog.map((e) => e.email.length));
  for (const { email, teamName, archetype } of joinLog) {
    console.log(`  ${email.padEnd(emailWidth)}  →  ${teamName.padEnd(24)}  (${archetype})`);
  }
  console.log(`\n  To clean up later:\n`);
  console.log(`    npx tsx scripts/seed-14-coach-league.ts --cleanup\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
main()
  .catch((err) => { fail(`FATAL: ${(err as Error).message ?? err}`); process.exit(1); })
  .finally(() => pool.end());
