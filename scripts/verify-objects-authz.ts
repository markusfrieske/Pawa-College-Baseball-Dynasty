/**
 * verify-objects-authz.ts
 *
 * Regression guard for the /objects/* serving route's record-level authorization.
 *
 * The route gates file delivery on whether the requested objectPath exists in a
 * known table (game_report_images or dynasty_news) AND whether the requesting
 * user has the right to see that league's data.  A regression in route-helpers.ts
 * or the serving route's authz branch could silently expose stored screenshots or
 * news images to unauthenticated or unauthorized users.
 *
 * Three suites run in sequence:
 *
 *   SUITE 1 — Unauthenticated access
 *     Every request without a valid session cookie must return 401, regardless
 *     of whether the objectPath resolves to a known record.
 *
 *   SUITE 2 — News image authorization (dynasty_news)
 *     - Non-member (outsider) must receive 403.
 *     - League member must pass the authz check (receives 404 from object storage
 *       because the fake path doesn't resolve to a real file — authz passed).
 *     - Commissioner must pass the authz check (same 404).
 *
 *   SUITE 3 — Game report image authorization (game_report_images)
 *     Incomplete game:
 *       - Outsider → 403
 *       - Non-involved league member → 403
 *       - Home coach (involved) → 404 (past authz)
 *       - Away coach (involved) → 404 (past authz)
 *       - Commissioner → 404 (past authz)
 *     Completed game:
 *       - Outsider → 403 (non-members never granted, even for completed games)
 *       - Non-involved member → 404 (past authz — completed games open to all members)
 *
 * Usage:
 *   npx tsx scripts/verify-objects-authz.ts
 *
 * Requires:
 *   - App running at APP_URL (default http://localhost:5000)
 *   - SESSION_SECRET env var set (same value as the running server)
 */

import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import cookieSig from "cookie-signature";
import { pool } from "../server/db";
import { storage } from "../server/storage";

const BASE_URL    = process.env.APP_URL ?? "http://localhost:5000";
const SESS_SECRET = process.env.SESSION_SECRET ?? "";
const TAG         = "e2e-objstorage-authz";

if (!SESS_SECRET) throw new Error("SESSION_SECRET env var must be set");

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function header(msg: string): void {
  const bar = "─".repeat(Math.min(msg.length + 4, 72));
  console.log(`\n${bar}\n  ${msg}\n${bar}`);
}

/** Build a signed session cookie for the given userId. */
async function buildCookie(userId: string): Promise<string> {
  const sid      = randomUUID().replace(/-/g, "");
  const sessJson = JSON.stringify({
    cookie: {
      originalMaxAge: 7 * 24 * 60 * 60 * 1000,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      secure: false, httpOnly: true, path: "/", sameSite: "lax",
    },
    userId,
  });
  await pool.query(
    `INSERT INTO session (sid, sess, expire) VALUES ($1, $2::json, $3)`,
    [sid, sessJson, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)],
  );
  const signed = cookieSig.sign(sid, SESS_SECRET);
  return encodeURIComponent(`s:${signed}`);
}

interface GetResult { status: number; body: unknown }

async function get(path: string, cookie?: string): Promise<GetResult> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = `connect.sid=${cookie}`;
  const res  = await fetch(`${BASE_URL}${path}`, { headers });
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch { body = null; }
  return { status: res.status, body };
}

// ── Fixture ──────────────────────────────────────────────────────────────────

interface Fixture {
  // Users
  commUserId:     string;
  memberUserId:   string;  // in league, but NOT playing in the game
  outsiderUserId: string;  // not in this league at all
  homeUserId:     string;  // coach for homeTeam
  awayUserId:     string;  // coach for awayTeam

  // Cookies
  commCookie:     string;
  memberCookie:   string;
  outsiderCookie: string;
  homeCookie:     string;
  awayCookie:     string;

  // League / game data
  leagueId:     string;
  homeTeamId:   string;
  awayTeamId:   string;
  memberTeamId: string;
  incompleteGameId: string;
  completedGameId:  string;

  // Object paths stored in DB rows (fake — no real file in storage)
  newsObjectPath:              string;  // /objects/test-news-<uuid>
  incompleteGameObjectPath:    string;  // /objects/test-gamereport-incomplete-<uuid>
  completedGameObjectPath:     string;  // /objects/test-gamereport-complete-<uuid>
}

async function createUser(email: string): Promise<string> {
  const hash = await bcrypt.hash("test1234!!Aa", 10);
  const { rows: [u] } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id`,
    [email, hash],
  );
  return u.id;
}

async function buildFixture(): Promise<Fixture> {
  const uid  = randomUUID().slice(0, 8);

  // Users
  const commUserId     = await createUser(`${TAG}-comm-${uid}@test.local`);
  const memberUserId   = await createUser(`${TAG}-member-${uid}@test.local`);
  const outsiderUserId = await createUser(`${TAG}-outsider-${uid}@test.local`);
  const homeUserId     = await createUser(`${TAG}-home-${uid}@test.local`);
  const awayUserId     = await createUser(`${TAG}-away-${uid}@test.local`);

  // League (commissioner = commUserId)
  const { rows: [league] } = await pool.query<{ id: string }>(
    `INSERT INTO leagues
       (name, commissioner_id, max_teams, current_phase, current_season,
        current_week, season_length, is_test_data, dynasty_preset)
     VALUES ($1, $2, 6, 'regular_season', 1, 1, 'standard', true, 'custom')
     RETURNING id`,
    [`${TAG}-${uid}`, commUserId],
  );
  const leagueId = league.id;

  // Conference
  const { rows: [conf] } = await pool.query<{ id: string }>(
    `INSERT INTO conferences (league_id, name) VALUES ($1, 'Test Conf') RETURNING id`,
    [leagueId],
  );

  // Teams: home, away, member (uninvolved)
  async function mkTeam(name: string, abbr: string): Promise<string> {
    const { rows: [t] } = await pool.query<{ id: string }>(
      `INSERT INTO teams
         (league_id, conference_id, name, mascot, abbreviation, city, state, is_cpu,
          prestige, stadium, facilities, college_life, marketing, academics)
       VALUES ($1, $2, $3, 'Bears', $4, 'Testville', 'TX', false, 5,5,5,5,5,5)
       RETURNING id`,
      [leagueId, conf.id, name, abbr],
    );
    return t.id;
  }

  const homeTeamId   = await mkTeam(`${TAG}-Home-${uid}`,   "HME");
  const awayTeamId   = await mkTeam(`${TAG}-Away-${uid}`,   "AWY");
  const memberTeamId = await mkTeam(`${TAG}-Member-${uid}`, "MBR");

  // Coaches
  async function mkCoach(userId: string, teamId: string): Promise<void> {
    await pool.query(
      `INSERT INTO coaches
         (user_id, team_id, league_id, first_name, last_name, archetype,
          pitching_recruiting_skill, hitting_recruiting_skill, scouting_skill,
          evaluation_skill, recruit_actions_used)
       VALUES ($1, $2, $3, 'Test', 'Coach', 'Balanced', 1,1,1,1,0)`,
      [userId, teamId, leagueId],
    );
  }

  // Commissioner is identified via league.commissioner_id, so no coach row needed.
  // Home, away, and member coaches each get their own team.
  await mkCoach(homeUserId,   homeTeamId);
  await mkCoach(awayUserId,   awayTeamId);
  await mkCoach(memberUserId, memberTeamId);
  // outsiderUserId has NO coach record in this league (intentionally)

  // Games
  async function mkGame(isComplete: boolean): Promise<string> {
    const { rows: [g] } = await pool.query<{ id: string }>(
      `INSERT INTO games
         (league_id, season, week, home_team_id, away_team_id,
          home_score, away_score, is_complete, phase, is_conference)
       VALUES ($1, 1, 1, $2, $3, $4, $5, $6, 'regular', false)
       RETURNING id`,
      [leagueId, homeTeamId, awayTeamId,
       isComplete ? 5 : null,
       isComplete ? 3 : null,
       isComplete],
    );
    return g.id;
  }

  const incompleteGameId = await mkGame(false);
  const completedGameId  = await mkGame(true);

  // Dynasty news row pointing to a fake objectPath
  const newsObjectPath = `/objects/test-news-${uid}.jpg`;
  await pool.query(
    `INSERT INTO dynasty_news
       (league_id, author_id, author_name, title, content, category, image_url)
     VALUES ($1, $2, 'Test', 'Authz Test News', 'body', 'general', $3)`,
    [leagueId, commUserId, newsObjectPath],
  );

  // Game report image rows pointing to fake objectPaths
  const incompleteGameObjectPath = `/objects/test-gamereport-incomplete-${uid}.jpg`;
  const completedGameObjectPath  = `/objects/test-gamereport-complete-${uid}.jpg`;

  await pool.query(
    `INSERT INTO game_report_images
       (game_id, league_id, uploaded_by_user_id, category, object_path)
     VALUES ($1, $2, $3, 'final_score', $4)`,
    [incompleteGameId, leagueId, homeUserId, incompleteGameObjectPath],
  );
  await pool.query(
    `INSERT INTO game_report_images
       (game_id, league_id, uploaded_by_user_id, category, object_path)
     VALUES ($1, $2, $3, 'final_score', $4)`,
    [completedGameId, leagueId, homeUserId, completedGameObjectPath],
  );

  // Session cookies
  const commCookie     = await buildCookie(commUserId);
  const memberCookie   = await buildCookie(memberUserId);
  const outsiderCookie = await buildCookie(outsiderUserId);
  const homeCookie     = await buildCookie(homeUserId);
  const awayCookie     = await buildCookie(awayUserId);

  return {
    commUserId, memberUserId, outsiderUserId, homeUserId, awayUserId,
    commCookie, memberCookie, outsiderCookie, homeCookie, awayCookie,
    leagueId, homeTeamId, awayTeamId, memberTeamId,
    incompleteGameId, completedGameId,
    newsObjectPath, incompleteGameObjectPath, completedGameObjectPath,
  };
}

async function teardown(leagueId: string): Promise<void> {
  // storage.deleteLeague() handles FK-ordered teardown (coaches, games, etc.)
  await storage.deleteLeague(leagueId);
}

// ── Suite 1 — Unauthenticated access ─────────────────────────────────────────

async function suite1(fx: Fixture): Promise<void> {
  header("Suite 1 — Unauthenticated access → 401");

  const paths = [
    fx.newsObjectPath,
    fx.incompleteGameObjectPath,
    `/objects/does-not-exist-${randomUUID()}.jpg`,
  ];

  for (const path of paths) {
    const r = await get(path);
    assert(
      `No cookie → 401 for ${path}`,
      r.status === 401,
      `got ${r.status}`,
    );
  }
}

// ── Suite 2 — News image authorization ───────────────────────────────────────

async function suite2(fx: Fixture): Promise<void> {
  header("Suite 2 — dynasty_news image authorization");

  // Outsider must be blocked
  const rOutsider = await get(fx.newsObjectPath, fx.outsiderCookie);
  assert(
    "Outsider (non-member) → 403 for news image",
    rOutsider.status === 403,
    `got ${rOutsider.status}`,
  );

  // Member must pass authz (route then tries to fetch from object storage;
  // the fake path has no real file, so object storage returns 404 — not 403).
  const rMember = await get(fx.newsObjectPath, fx.memberCookie);
  assert(
    "League member passes authz — gets 404 (no real file) not 403",
    rMember.status !== 403,
    `got ${rMember.status} — member should not be blocked by authz`,
  );
  assert(
    "League member — response is 404 or 500 (file absent), confirms authz passed",
    rMember.status === 404 || rMember.status === 500,
    `got ${rMember.status}`,
  );

  // Commissioner must pass authz
  const rComm = await get(fx.newsObjectPath, fx.commCookie);
  assert(
    "Commissioner passes authz — gets 404 (no real file) not 403",
    rComm.status !== 403,
    `got ${rComm.status} — commissioner should not be blocked`,
  );
  assert(
    "Commissioner — response is 404 or 500, confirms authz passed",
    rComm.status === 404 || rComm.status === 500,
    `got ${rComm.status}`,
  );
}

// ── Suite 3 — Game report image authorization ─────────────────────────────────

async function suite3(fx: Fixture): Promise<void> {
  header("Suite 3 — game_report_images authorization");

  // ── Incomplete game ──────────────────────────────────────────────────────

  console.log("\n  [Incomplete game]");

  const rOutsiderInc = await get(fx.incompleteGameObjectPath, fx.outsiderCookie);
  assert(
    "Outsider → 403 for incomplete game report image",
    rOutsiderInc.status === 403,
    `got ${rOutsiderInc.status}`,
  );

  const rMemberInc = await get(fx.incompleteGameObjectPath, fx.memberCookie);
  assert(
    "Non-involved member → 403 for incomplete game report image",
    rMemberInc.status === 403,
    `got ${rMemberInc.status}`,
  );

  const rHomeInc = await get(fx.incompleteGameObjectPath, fx.homeCookie);
  assert(
    "Home coach (involved) passes authz — gets 404 not 403 (incomplete game)",
    rHomeInc.status !== 403,
    `got ${rHomeInc.status} — home coach blocked unexpectedly`,
  );
  assert(
    "Home coach — 404 or 500, confirms authz passed (incomplete game)",
    rHomeInc.status === 404 || rHomeInc.status === 500,
    `got ${rHomeInc.status}`,
  );

  const rAwayInc = await get(fx.incompleteGameObjectPath, fx.awayCookie);
  assert(
    "Away coach (involved) passes authz — gets 404 not 403 (incomplete game)",
    rAwayInc.status !== 403,
    `got ${rAwayInc.status} — away coach blocked unexpectedly`,
  );
  assert(
    "Away coach — 404 or 500, confirms authz passed (incomplete game)",
    rAwayInc.status === 404 || rAwayInc.status === 500,
    `got ${rAwayInc.status}`,
  );

  const rCommInc = await get(fx.incompleteGameObjectPath, fx.commCookie);
  assert(
    "Commissioner passes authz — gets 404 not 403 (incomplete game)",
    rCommInc.status !== 403,
    `got ${rCommInc.status} — commissioner blocked unexpectedly`,
  );
  assert(
    "Commissioner — 404 or 500, confirms authz passed (incomplete game)",
    rCommInc.status === 404 || rCommInc.status === 500,
    `got ${rCommInc.status}`,
  );

  // ── Completed game ───────────────────────────────────────────────────────

  console.log("\n  [Completed game]");

  const rOutsiderComp = await get(fx.completedGameObjectPath, fx.outsiderCookie);
  assert(
    "Outsider → 403 for completed game report image (non-members never allowed)",
    rOutsiderComp.status === 403,
    `got ${rOutsiderComp.status}`,
  );

  // Completed games: any league member can view (canAccessGameReportImage returns true)
  const rMemberComp = await get(fx.completedGameObjectPath, fx.memberCookie);
  assert(
    "Non-involved member passes authz for completed game — gets 404 not 403",
    rMemberComp.status !== 403,
    `got ${rMemberComp.status} — member blocked for completed game (unexpected)`,
  );
  assert(
    "Non-involved member — 404 or 500, confirms authz passed (completed game)",
    rMemberComp.status === 404 || rMemberComp.status === 500,
    `got ${rMemberComp.status}`,
  );

  const rCommComp = await get(fx.completedGameObjectPath, fx.commCookie);
  assert(
    "Commissioner passes authz for completed game — gets 404 not 403",
    rCommComp.status !== 403,
    `got ${rCommComp.status}`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│  verify-objects-authz — /objects/* serving route authz      │");
  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // Pre-flight: verify the server is reachable
  try {
    await fetch(`${BASE_URL}/api/leagues`, { method: "GET" });
  } catch (e) {
    console.error(`Cannot reach server at ${BASE_URL}. Is the app running?`);
    process.exit(1);
  }

  let fx: Fixture | null = null;
  try {
    console.log("Building test fixtures…");
    fx = await buildFixture();
    console.log(`  league: ${fx.leagueId}`);
    console.log(`  news image path:              ${fx.newsObjectPath}`);
    console.log(`  incomplete game report path:  ${fx.incompleteGameObjectPath}`);
    console.log(`  completed game report path:   ${fx.completedGameObjectPath}`);

    await suite1(fx);
    await suite2(fx);
    await suite3(fx);
  } finally {
    if (fx) {
      console.log("\nCleaning up fixtures…");
      await teardown(fx.leagueId);
      // Also clean up outsider user (no league FK)
      await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [
        [fx.commUserId, fx.memberUserId, fx.outsiderUserId, fx.homeUserId, fx.awayUserId],
      ]);
      await pool.end();
    }
  }

  console.log(`\n${"─".repeat(56)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("─".repeat(56));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
