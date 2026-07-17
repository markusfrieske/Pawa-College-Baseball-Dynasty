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
 * A real test file is uploaded at fixture-build time so that authorized users
 * receive HTTP 200 (actual serving path exercised), not 404/500.  Unauthorized
 * users always receive 403 regardless of whether the file exists in storage.
 *
 * Three suites run in sequence:
 *
 *   SUITE 1 — Unauthenticated access
 *     Every request without a valid session cookie must return 401, even for a
 *     valid objectPath with a real stored file — requireAuth fires before any
 *     DB or storage lookup.
 *
 *   SUITE 2 — News image authorization (dynasty_news)
 *     - Non-member (outsider) → 403
 *     - League member         → 200 (real file served)
 *     - Commissioner          → 200 (real file served)
 *
 *   SUITE 3 — Game report image authorization (game_report_images)
 *     Incomplete game:
 *       - Outsider               → 403
 *       - Non-involved member    → 403 (only involved coaches allowed pre-completion)
 *       - Home coach (involved)  → 200
 *       - Away coach (involved)  → 200
 *       - Commissioner           → 200
 *     Completed game:
 *       - Outsider               → 403 (non-members never granted)
 *       - Non-involved member    → 200 (completed games open to all league members)
 *       - Commissioner           → 200
 *
 * Usage:
 *   npx tsx scripts/verify-objects-authz.ts
 *
 * Requires:
 *   - App running at APP_URL (default http://localhost:5000)
 *   - SESSION_SECRET env var set (same value as the running server)
 *   - Object storage bucket configured (PRIVATE_OBJECT_DIR env var set)
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

interface FetchResult { status: number; body: unknown }

async function get(path: string, cookie?: string): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = `connect.sid=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch { body = null; }
  return { status: res.status, body };
}

/**
 * Upload a minimal test image to object storage via the presigned-URL flow.
 * Returns the /objects/... path that can be stored in DB rows.
 * Throws if the upload fails (likely means object storage is not configured).
 */
async function uploadTestFile(cookie: string): Promise<string> {
  // Minimal 1×1 white JPEG (53 bytes — a valid, non-empty image).
  const tinyJpeg = Buffer.from(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda00080101000005021affd9",
    "hex",
  );

  const uploadRes = await fetch(`${BASE_URL}/api/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `connect.sid=${cookie}`,
    },
    body: JSON.stringify({
      name: "authz-test.jpg",
      size: tinyJpeg.length,
      contentType: "image/jpeg",
    }),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Failed to get upload URL (${uploadRes.status}): ${err}`);
  }

  const { uploadURL, objectPath } = await uploadRes.json() as { uploadURL: string; objectPath: string };

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: tinyJpeg,
  });

  if (!putRes.ok) {
    throw new Error(`Failed to PUT test file to presigned URL (${putRes.status})`);
  }

  return objectPath;
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
  leagueId:        string;
  homeTeamId:      string;
  awayTeamId:      string;
  memberTeamId:    string;
  incompleteGameId: string;
  completedGameId:  string;

  // Real uploaded /objects/ paths — one per DB row so route lookups are unambiguous
  newsObjectPath:           string;
  incompleteGameObjectPath: string;
  completedGameObjectPath:  string;
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
  const uid = randomUUID().slice(0, 8);

  // ── Users ──────────────────────────────────────────────────────────────────
  const commUserId     = await createUser(`${TAG}-comm-${uid}@test.local`);
  const memberUserId   = await createUser(`${TAG}-member-${uid}@test.local`);
  const outsiderUserId = await createUser(`${TAG}-outsider-${uid}@test.local`);
  const homeUserId     = await createUser(`${TAG}-home-${uid}@test.local`);
  const awayUserId     = await createUser(`${TAG}-away-${uid}@test.local`);

  // ── League ─────────────────────────────────────────────────────────────────
  const { rows: [league] } = await pool.query<{ id: string }>(
    `INSERT INTO leagues
       (name, commissioner_id, max_teams, current_phase, current_season,
        current_week, season_length, is_test_data, dynasty_preset)
     VALUES ($1, $2, 6, 'regular_season', 1, 1, 'standard', true, 'custom')
     RETURNING id`,
    [`${TAG}-${uid}`, commUserId],
  );
  const leagueId = league.id;

  // ── Conference ─────────────────────────────────────────────────────────────
  const { rows: [conf] } = await pool.query<{ id: string }>(
    `INSERT INTO conferences (league_id, name) VALUES ($1, 'Test Conf') RETURNING id`,
    [leagueId],
  );

  // ── Teams ──────────────────────────────────────────────────────────────────
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

  // ── Coaches ────────────────────────────────────────────────────────────────
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

  // Commissioner is identified via league.commissioner_id (no coach row needed).
  await mkCoach(homeUserId,   homeTeamId);
  await mkCoach(awayUserId,   awayTeamId);
  await mkCoach(memberUserId, memberTeamId);
  // outsiderUserId intentionally has no coach record in this league.

  // ── Session cookies (before upload — we need commCookie for the upload call) ─
  const commCookie     = await buildCookie(commUserId);
  const memberCookie   = await buildCookie(memberUserId);
  const outsiderCookie = await buildCookie(outsiderUserId);
  const homeCookie     = await buildCookie(homeUserId);
  const awayCookie     = await buildCookie(awayUserId);

  // ── Upload 3 distinct test files (one per DB row) so objectPath lookups are
  //    unambiguous.  The /objects/* route checks game_report_images first, so
  //    reusing the same path across tables would cause the wrong authz branch
  //    to fire (e.g. a news-image request would be treated as a game-report).
  console.log("  Uploading test files to object storage…");
  const newsRealPath              = await uploadTestFile(commCookie);
  const incompleteGameRealPath    = await uploadTestFile(commCookie);
  const completedGameRealPath     = await uploadTestFile(commCookie);
  console.log(`  news path:            ${newsRealPath}`);
  console.log(`  incomplete game path: ${incompleteGameRealPath}`);
  console.log(`  completed game path:  ${completedGameRealPath}`);

  // ── Games ──────────────────────────────────────────────────────────────────
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

  // ── DB rows — each row has its own unique objectPath ─────────────────────
  const newsObjectPath           = newsRealPath;
  const incompleteGameObjectPath = incompleteGameRealPath;
  const completedGameObjectPath  = completedGameRealPath;

  await pool.query(
    `INSERT INTO dynasty_news
       (league_id, author_id, author_name, title, content, category, image_url)
     VALUES ($1, $2, 'Test', 'Authz Test News', 'body', 'general', $3)`,
    [leagueId, commUserId, newsObjectPath],
  );

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

  return {
    commUserId, memberUserId, outsiderUserId, homeUserId, awayUserId,
    commCookie, memberCookie, outsiderCookie, homeCookie, awayCookie,
    leagueId, homeTeamId, awayTeamId, memberTeamId,
    incompleteGameId, completedGameId,
    newsObjectPath, incompleteGameObjectPath, completedGameObjectPath,
  };
}

async function teardown(leagueId: string, userIds: string[]): Promise<void> {
  // storage.deleteLeague() handles FK-ordered cascade cleanup.
  await storage.deleteLeague(leagueId);
  // Clean up user rows that have no league FK.
  if (userIds.length) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
  }
  // Note: the uploaded test file remains in object storage (no delete API),
  // but it is tiny (< 1 KB) and effectively orphaned after the DB rows are gone.
}

// ── Suite 1 — Unauthenticated access ─────────────────────────────────────────

async function suite1(fx: Fixture): Promise<void> {
  header("Suite 1 — Unauthenticated access → 401");

  const paths = [
    // Real path with a real file — auth still required before any DB check
    fx.newsObjectPath,
    fx.incompleteGameObjectPath,
    // Completely unknown path — still 401, not 404
    `/objects/no-such-file-${randomUUID()}.jpg`,
  ];

  for (const path of paths) {
    const r = await get(path);
    assert(`No cookie → 401 for ${path.slice(0, 50)}…`, r.status === 401, `got ${r.status}`);
  }
}

// ── Suite 2 — News image authorization ───────────────────────────────────────

async function suite2(fx: Fixture): Promise<void> {
  header("Suite 2 — dynasty_news image authorization");

  // Outsider must be blocked before the file is served.
  const rOutsider = await get(fx.newsObjectPath, fx.outsiderCookie);
  assert("Outsider (non-member) → 403 for news image", rOutsider.status === 403, `got ${rOutsider.status}`);

  // League member must receive the actual file (200).
  const rMember = await get(fx.newsObjectPath, fx.memberCookie);
  assert("League member → 200 for news image (authz passed, real file served)", rMember.status === 200, `got ${rMember.status}`);

  // Commissioner must receive the actual file (200).
  const rComm = await get(fx.newsObjectPath, fx.commCookie);
  assert("Commissioner → 200 for news image (authz passed, real file served)", rComm.status === 200, `got ${rComm.status}`);
}

// ── Suite 3 — Game report image authorization ─────────────────────────────────

async function suite3(fx: Fixture): Promise<void> {
  header("Suite 3 — game_report_images authorization");

  // ── Incomplete game ──────────────────────────────────────────────────────

  console.log("\n  [Incomplete game]");

  const rOutsiderInc = await get(fx.incompleteGameObjectPath, fx.outsiderCookie);
  assert("Outsider → 403 (incomplete game report image)", rOutsiderInc.status === 403, `got ${rOutsiderInc.status}`);

  const rMemberInc = await get(fx.incompleteGameObjectPath, fx.memberCookie);
  assert("Non-involved member → 403 (incomplete game — only involved coaches allowed)", rMemberInc.status === 403, `got ${rMemberInc.status}`);

  const rHomeInc = await get(fx.incompleteGameObjectPath, fx.homeCookie);
  assert("Home coach (involved) → 200 (incomplete game, real file served)", rHomeInc.status === 200, `got ${rHomeInc.status}`);

  const rAwayInc = await get(fx.incompleteGameObjectPath, fx.awayCookie);
  assert("Away coach (involved) → 200 (incomplete game, real file served)", rAwayInc.status === 200, `got ${rAwayInc.status}`);

  const rCommInc = await get(fx.incompleteGameObjectPath, fx.commCookie);
  assert("Commissioner → 200 (incomplete game, real file served)", rCommInc.status === 200, `got ${rCommInc.status}`);

  // ── Completed game ───────────────────────────────────────────────────────

  console.log("\n  [Completed game]");

  const rOutsiderComp = await get(fx.completedGameObjectPath, fx.outsiderCookie);
  assert("Outsider → 403 (completed game — non-members never allowed)", rOutsiderComp.status === 403, `got ${rOutsiderComp.status}`);

  // Completed games: any league member can view.
  const rMemberComp = await get(fx.completedGameObjectPath, fx.memberCookie);
  assert("Non-involved member → 200 (completed game, authz open to all members)", rMemberComp.status === 200, `got ${rMemberComp.status}`);

  const rCommComp = await get(fx.completedGameObjectPath, fx.commCookie);
  assert("Commissioner → 200 (completed game, real file served)", rCommComp.status === 200, `got ${rCommComp.status}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│  verify-objects-authz — /objects/* serving route authz      │");
  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // Pre-flight: verify the server is reachable.
  try {
    const pf = await fetch(`${BASE_URL}/api/leagues`, { method: "GET" });
    if (!pf) throw new Error("no response");
  } catch {
    console.error(`Cannot reach server at ${BASE_URL}. Is the app running?`);
    process.exit(1);
  }

  let fx: Fixture | null = null;
  try {
    console.log("Building test fixtures…");
    fx = await buildFixture();
    console.log(`  league:                       ${fx.leagueId}`);
    console.log(`  news path:                    ${fx.newsObjectPath}`);
    console.log(`  incomplete game path:         ${fx.incompleteGameObjectPath}`);
    console.log(`  completed game path:          ${fx.completedGameObjectPath}`);

    await suite1(fx);
    await suite2(fx);
    await suite3(fx);
  } finally {
    if (fx) {
      console.log("\nCleaning up fixtures…");
      await teardown(fx.leagueId, [
        fx.commUserId, fx.memberUserId, fx.outsiderUserId,
        fx.homeUserId, fx.awayUserId,
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
