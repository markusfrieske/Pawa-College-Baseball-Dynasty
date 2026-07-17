/**
 * verify-recruiting-action-dedup.ts
 *
 * Regression guard for the recruiting-action idempotency + cap enforcement gates.
 *
 * Three suites run in sequence:
 *
 *   SUITE 1 — Service-layer concurrency (no HTTP, pure DB)
 *     Calls executeRecruitingAction() via Promise.all to simulate concurrent
 *     double-submissions at the transaction layer.  Verifies:
 *       - Exactly 1 row inserted per (action, recruit, team, season, week) tuple
 *       - Exactly 1 success + 1 alreadyDone (order-agnostic)
 *       - coach.recruit_actions_used incremented by exactly the action cost
 *
 *   SUITE 2 — HTTP concurrent requests (real Express routes)
 *     Sends two identical fetch() calls in parallel to the live server for
 *     phone, visit, and offer actions.  Verifies:
 *       - Exactly one HTTP 200 and one HTTP 409 per pair
 *       - The 409 body carries alreadyDone: true
 *       - Exactly 1 row remains in recruiting_actions_log for each action type
 *
 *   SUITE 3 — Concurrent visit-cap enforcement (different recruits, same cap slot)
 *     The unique indexes only prevent duplicate actions against the *same* recruit.
 *     Two simultaneous visits to *different* recruits when cap=1 previously raced
 *     past the pre-check and both committed, exceeding the cap.  This suite verifies
 *     the team-row lock + in-transaction count prevents that:
 *       - Promise.all(×2) on two different recruits with visitCap=1 → 1 success, 1 capExceeded
 *       - HTTP concurrent visits to two different recruits with cap=1 → 1 HTTP 200, 1 HTTP 409
 *
 * Usage:
 *   npx tsx scripts/verify-recruiting-action-dedup.ts
 *   npx tsx scripts/verify-recruiting-action-dedup.ts --suite1-only
 *   npx tsx scripts/verify-recruiting-action-dedup.ts --suite2-only
 *   npx tsx scripts/verify-recruiting-action-dedup.ts --suite3-only
 */

import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import cookieSig from "cookie-signature";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { executeRecruitingAction } from "../server/services/recruitingActionService";

const BASE_URL    = process.env.APP_URL ?? "http://localhost:5000";
const SESS_SECRET = process.env.SESSION_SECRET ?? "";
const LEAGUE_NAME = "e2e-dedup-action-test";

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

function header(msg: string) {
  const bar = "─".repeat(Math.min(msg.length + 4, 72));
  console.log(`\n${bar}\n  ${msg}\n${bar}`);
}

// ── Fixture setup ─────────────────────────────────────────────────────────────

interface Fixture {
  userId: string;
  leagueId: string;
  teamId: string;
  coachId: string;
  recruitId: string;
  /** Second recruit — needed for Suite 3 concurrent cap test (different recruits, same cap slot) */
  recruitId2: string;
  cookie: string;
}

async function buildFixture(): Promise<Fixture> {
  // User
  const email = `dedup-test-${randomUUID().slice(0, 8)}@test.local`;
  const hash  = await bcrypt.hash("test1234!!Aa", 10);
  const { rows: [user] } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id`,
    [email, hash],
  );
  const userId = user.id;

  // League (direct DB — no full setup needed)
  const { rows: [league] } = await pool.query<{ id: string }>(
    `INSERT INTO leagues
       (name, commissioner_id, max_teams, current_phase, current_season,
        current_week, season_length, is_test_data, dynasty_preset)
     VALUES ($1, $2, 2, 'regular_season', 1, 1, 'standard', true, 'custom')
     RETURNING id`,
    [LEAGUE_NAME, userId],
  );
  const leagueId = league.id;

  // Conference
  const { rows: [conf] } = await pool.query<{ id: string }>(
    `INSERT INTO conferences (league_id, name) VALUES ($1, 'Test Conf') RETURNING id`,
    [leagueId],
  );

  // Team
  const { rows: [team] } = await pool.query<{ id: string }>(
    `INSERT INTO teams
       (league_id, conference_id, name, mascot, abbreviation, city, state, is_cpu,
        prestige, stadium, facilities, college_life, marketing, academics)
     VALUES ($1, $2, 'Test Tigers', 'Tigers', 'TST', 'Test City', 'TX', false,
             5, 5, 5, 5, 5, 5)
     RETURNING id`,
    [leagueId, conf.id],
  );
  const teamId = team.id;

  // Coach (generous action budget: skill=5 gives ~12-16 actions/turn, well above any action cost)
  const { rows: [coach] } = await pool.query<{ id: string }>(
    `INSERT INTO coaches
       (user_id, team_id, league_id, first_name, last_name, archetype,
        pitching_recruiting_skill, hitting_recruiting_skill, scouting_skill,
        evaluation_skill, recruit_actions_used)
     VALUES ($1, $2, $3, 'Test', 'Coach', 'Balanced', 5, 5, 5, 5, 0)
     RETURNING id`,
    [userId, teamId, leagueId],
  );
  const coachId = coach.id;

  // Recruit 1
  const { rows: [recruit] } = await pool.query<{ id: string }>(
    `INSERT INTO recruits
       (league_id, first_name, last_name, position, home_state, hometown,
        class_rank, position_rank)
     VALUES ($1, 'John', 'Testman', 'OF', 'TX', 'Dallas', 1, 1)
     RETURNING id`,
    [leagueId],
  );
  const recruitId = recruit.id;

  // Recruit 2 — used by Suite 3 concurrent cap tests
  const { rows: [recruit2] } = await pool.query<{ id: string }>(
    `INSERT INTO recruits
       (league_id, first_name, last_name, position, home_state, hometown,
        class_rank, position_rank)
     VALUES ($1, 'Jake', 'Secondman', 'P', 'TX', 'Austin', 2, 2)
     RETURNING id`,
    [leagueId],
  );
  const recruitId2 = recruit2.id;

  // recruit_top_schools rows so the UPDATE inside executeRecruitingAction doesn't update 0 rows
  // (safe to omit — the UPDATE is non-fatal if it matches 0 rows, but we add it for completeness)
  await pool.query(
    `INSERT INTO recruit_top_schools (recruit_id, team_id, accumulated_interest)
     VALUES ($1, $2, 0), ($3, $2, 0) ON CONFLICT DO NOTHING`,
    [recruitId, teamId, recruitId2],
  );

  // Session cookie (same signing pattern as express-session / seed-14-coach-league.ts)
  const sid = randomUUID().replace(/-/g, "");
  const sessJson = JSON.stringify({
    cookie: {
      originalMaxAge: 7 * 24 * 60 * 60 * 1000,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      secure: false, httpOnly: true, path: "/", sameSite: "lax",
    },
    userId,
  });
  await pool.query(
    `INSERT INTO session (sid, sess, expire)
     VALUES ($1, $2::json, $3)`,
    [sid, sessJson, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)],
  );
  const signed = cookieSig.sign(sid, SESS_SECRET);
  const cookie = encodeURIComponent(`s:${signed}`);

  return { userId, leagueId, teamId, coachId, recruitId, recruitId2, cookie };
}

async function teardownFixture(leagueId: string, userId: string): Promise<void> {
  await storage.deleteLeague(leagueId);
  // User row is reusable across runs; leave it to avoid FK issues in parallel test envs
}

// ── Reset coach budget between action types ───────────────────────────────────

async function resetCoachActions(coachId: string): Promise<void> {
  await pool.query(
    `UPDATE coaches SET recruit_actions_used = 0 WHERE id = $1`,
    [coachId],
  );
}

async function getCoachActionsUsed(coachId: string): Promise<number> {
  const { rows: [c] } = await pool.query<{ recruit_actions_used: number }>(
    `SELECT recruit_actions_used FROM coaches WHERE id = $1`,
    [coachId],
  );
  return c?.recruit_actions_used ?? -1;
}

async function countActionLogRows(
  recruitId: string, teamId: string, leagueId: string,
  actionType: string, season: number, week: number,
): Promise<number> {
  const { rows: [r] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM recruiting_actions_log
      WHERE recruit_id = $1 AND team_id = $2 AND league_id = $3
        AND action_type = $4 AND season = $5 AND week = $6`,
    [recruitId, teamId, leagueId, actionType, season, week],
  );
  return parseInt(r.cnt, 10);
}

async function countSeasonalActionLogRows(
  recruitId: string, teamId: string, leagueId: string,
  actionType: string, season: number,
): Promise<number> {
  const { rows: [r] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM recruiting_actions_log
      WHERE recruit_id = $1 AND team_id = $2 AND league_id = $3
        AND action_type = $4 AND season = $5`,
    [recruitId, teamId, leagueId, actionType, season],
  );
  return parseInt(r.cnt, 10);
}

async function clearActionLog(leagueId: string): Promise<void> {
  await pool.query(
    `DELETE FROM recruiting_actions_log WHERE league_id = $1`,
    [leagueId],
  );
  await pool.query(
    `DELETE FROM recruiting_interests WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)`,
    [leagueId],
  );
}

// ── SUITE 1 — Direct service-layer concurrency ────────────────────────────────

async function runSuite1(fix: Fixture): Promise<void> {
  header("SUITE 1 — Service-layer concurrency (no HTTP)");

  const baseParams = {
    recruitId: fix.recruitId,
    teamId:    fix.teamId,
    leagueId:  fix.leagueId,
    coachId:   fix.coachId,
    week:      1,
    season:    1,
    maxAllowed: 50, // generous cap so budget never blocks the test
    notes:     "dedup-test",
  };

  // ── 1a: phone (weekly index) ──────────────────────────────────────────────
  console.log("\n  1a — phone: two concurrent calls, uq_action_log_weekly fires");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const phoneResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "phone", interestGain: 5, cost: 1 }),
    executeRecruitingAction({ ...baseParams, actionType: "phone", interestGain: 5, cost: 1 }),
  ]);

  const phoneSuccesses  = phoneResults.filter(r => r.success).length;
  const phoneAlreadyDone = phoneResults.filter(r => r.alreadyDone).length;
  const phoneRows       = await countActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "phone", 1, 1);
  const phoneActionsUsed = await getCoachActionsUsed(fix.coachId);

  assert("phone: exactly 1 success",          phoneSuccesses === 1,    `got ${phoneSuccesses}`);
  assert("phone: exactly 1 alreadyDone",      phoneAlreadyDone === 1,  `got ${phoneAlreadyDone}`);
  assert("phone: exactly 1 log row inserted", phoneRows === 1,         `got ${phoneRows}`);
  assert("phone: cost deducted exactly once", phoneActionsUsed === 1,  `recruit_actions_used=${phoneActionsUsed}`);

  // ── 1b: visit (seasonal index) ────────────────────────────────────────────
  console.log("\n  1b — visit: two concurrent calls, uq_action_log_seasonal fires");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const visitResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "visit", interestGain: 20, cost: 2 }),
    executeRecruitingAction({ ...baseParams, actionType: "visit", interestGain: 20, cost: 2 }),
  ]);

  const visitSuccesses  = visitResults.filter(r => r.success).length;
  const visitAlreadyDone = visitResults.filter(r => r.alreadyDone).length;
  const visitRows       = await countSeasonalActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "visit", 1);
  const visitActionsUsed = await getCoachActionsUsed(fix.coachId);

  assert("visit: exactly 1 success",          visitSuccesses === 1,    `got ${visitSuccesses}`);
  assert("visit: exactly 1 alreadyDone",      visitAlreadyDone === 1,  `got ${visitAlreadyDone}`);
  assert("visit: exactly 1 log row inserted", visitRows === 1,         `got ${visitRows}`);
  assert("visit: cost deducted exactly once", visitActionsUsed === 2,  `recruit_actions_used=${visitActionsUsed}`);

  // ── 1c: offer (seasonal index) ────────────────────────────────────────────
  console.log("\n  1c — offer: two concurrent calls, uq_action_log_seasonal fires");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const offerResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "offer", interestGain: 10, cost: 1, hasOffer: true }),
    executeRecruitingAction({ ...baseParams, actionType: "offer", interestGain: 10, cost: 1, hasOffer: true }),
  ]);

  const offerSuccesses  = offerResults.filter(r => r.success).length;
  const offerAlreadyDone = offerResults.filter(r => r.alreadyDone).length;
  const offerRows       = await countSeasonalActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "offer", 1);
  const offerActionsUsed = await getCoachActionsUsed(fix.coachId);

  assert("offer: exactly 1 success",          offerSuccesses === 1,    `got ${offerSuccesses}`);
  assert("offer: exactly 1 alreadyDone",      offerAlreadyDone === 1,  `got ${offerAlreadyDone}`);
  assert("offer: exactly 1 log row inserted", offerRows === 1,         `got ${offerRows}`);
  assert("offer: cost deducted exactly once", offerActionsUsed === 1,  `recruit_actions_used=${offerActionsUsed}`);

  // ── 1d: head_coach_visit (seasonal index) ─────────────────────────────────
  console.log("\n  1d — head_coach_visit: two concurrent calls, uq_action_log_seasonal fires");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const hcvResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "head_coach_visit", interestGain: 15, cost: 2 }),
    executeRecruitingAction({ ...baseParams, actionType: "head_coach_visit", interestGain: 15, cost: 2 }),
  ]);

  const hcvSuccesses   = hcvResults.filter(r => r.success).length;
  const hcvAlreadyDone = hcvResults.filter(r => r.alreadyDone).length;
  const hcvRows        = await countSeasonalActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "head_coach_visit", 1);
  const hcvActionsUsed = await getCoachActionsUsed(fix.coachId);

  assert("hcv: exactly 1 success",          hcvSuccesses === 1,   `got ${hcvSuccesses}`);
  assert("hcv: exactly 1 alreadyDone",      hcvAlreadyDone === 1, `got ${hcvAlreadyDone}`);
  assert("hcv: exactly 1 log row inserted", hcvRows === 1,        `got ${hcvRows}`);
  assert("hcv: cost deducted exactly once", hcvActionsUsed === 2, `recruit_actions_used=${hcvActionsUsed}`);

  // ── 1e: email (weekly index — same action different type from phone) ───────
  console.log("\n  1e — email: two concurrent calls, uq_action_log_weekly fires");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const emailResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "email", interestGain: 6, cost: 1 }),
    executeRecruitingAction({ ...baseParams, actionType: "email", interestGain: 6, cost: 1 }),
  ]);

  const emailSuccesses   = emailResults.filter(r => r.success).length;
  const emailAlreadyDone = emailResults.filter(r => r.alreadyDone).length;
  const emailRows        = await countActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "email", 1, 1);
  const emailActionsUsed = await getCoachActionsUsed(fix.coachId);

  assert("email: exactly 1 success",          emailSuccesses === 1,   `got ${emailSuccesses}`);
  assert("email: exactly 1 alreadyDone",      emailAlreadyDone === 1, `got ${emailAlreadyDone}`);
  assert("email: exactly 1 log row inserted", emailRows === 1,        `got ${emailRows}`);
  assert("email: cost deducted exactly once", emailActionsUsed === 1, `recruit_actions_used=${emailActionsUsed}`);

  // ── 1f: same-recruit different-week — weekly constraint does NOT block ─────
  console.log("\n  1f — phone different week: weekly index is (recruit,team,season,WEEK,type) — no collision");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const crossWeekResults = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "phone", week: 1, interestGain: 5, cost: 1 }),
    executeRecruitingAction({ ...baseParams, actionType: "phone", week: 2, interestGain: 5, cost: 1 }),
  ]);

  const crossWeekSuccesses = crossWeekResults.filter(r => r.success).length;
  assert("cross-week phone: both calls succeed (different weeks)", crossWeekSuccesses === 2, `got ${crossWeekSuccesses}`);

  // ── 1g: budget-exhaustion block still works after dedup blocks ────────────
  console.log("\n  1g — budget guard: 2nd action type blocked by budget after 1st dedup");
  await clearActionLog(fix.leagueId);
  // Set actions used to max (50) to trigger budget block on a new action
  await pool.query(`UPDATE coaches SET recruit_actions_used = 50 WHERE id = $1`, [fix.coachId]);
  const budgetBlockResult = await executeRecruitingAction({
    ...baseParams, actionType: "phone", week: 99, interestGain: 5, cost: 1,
    maxAllowed: 50,
  });
  assert("budget guard: spendFailed=true when exhausted",  budgetBlockResult.spendFailed === true,  `got ${JSON.stringify(budgetBlockResult)}`);
  assert("budget guard: success=false when budget exhausted", budgetBlockResult.success === false, `got ${JSON.stringify(budgetBlockResult)}`);
  // No log row should have been inserted (the tx rolled back)
  const budgetBlockRows = await countActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "phone", 1, 99);
  assert("budget guard: 0 log rows after budget rollback", budgetBlockRows === 0, `got ${budgetBlockRows}`);

  console.log(`\n  Suite 1 complete — ${passed} pass, ${failed} fail so far`);
}

// ── SUITE 2 — HTTP concurrent requests ───────────────────────────────────────

async function httpPost(path: string, cookie: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `connect.sid=${cookie}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function runSuite2(fix: Fixture): Promise<void> {
  header("SUITE 2 — HTTP concurrent requests (real Express routes)");

  const phoneUrl = `/api/leagues/${fix.leagueId}/recruiting/${fix.recruitId}/phone`;
  const visitUrl = `/api/leagues/${fix.leagueId}/recruiting/${fix.recruitId}/visit`;
  const offerUrl = `/api/leagues/${fix.leagueId}/recruiting/${fix.recruitId}/offer`;

  // ── 2a: phone (weekly) ───────────────────────────────────────────────────
  console.log("\n  2a — HTTP phone: concurrent POST×2");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const [phone1, phone2] = await Promise.all([
    httpPost(phoneUrl, fix.cookie, { pitchTopic: "reputation" }),
    httpPost(phoneUrl, fix.cookie, { pitchTopic: "reputation" }),
  ]);

  const phoneStatuses = [phone1.status, phone2.status].sort();
  const phoneHas409 = phoneStatuses.includes(409);
  const phoneHas200 = phoneStatuses.includes(200);
  const phoneDbRows = await countActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "phone", 1, 1);

  assert("HTTP phone: one 200 received",                  phoneHas200,                   `statuses: ${phoneStatuses}`);
  assert("HTTP phone: one 409 received",                  phoneHas409,                   `statuses: ${phoneStatuses}`);
  assert("HTTP phone: 409 body alreadyDone=true",         phone1.status === 409 ? phone1.data?.alreadyDone === true : phone2.data?.alreadyDone === true, "alreadyDone missing");
  assert("HTTP phone: exactly 1 DB row after pair",       phoneDbRows === 1,             `got ${phoneDbRows}`);

  // ── 2b: visit (seasonal) ─────────────────────────────────────────────────
  console.log("\n  2b — HTTP visit: concurrent POST×2");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const [visit1, visit2] = await Promise.all([
    httpPost(visitUrl, fix.cookie),
    httpPost(visitUrl, fix.cookie),
  ]);

  const visitStatuses = [visit1.status, visit2.status].sort();
  const visitHas409 = visitStatuses.includes(409);
  const visitHas200 = visitStatuses.includes(200);
  const visitDbRows = await countSeasonalActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "visit", 1);

  assert("HTTP visit: one 200 received",                  visitHas200,                   `statuses: ${visitStatuses}`);
  assert("HTTP visit: one 409 received",                  visitHas409,                   `statuses: ${visitStatuses}`);
  assert("HTTP visit: 409 body alreadyDone=true",         visit1.status === 409 ? visit1.data?.alreadyDone === true : visit2.data?.alreadyDone === true, "alreadyDone missing");
  assert("HTTP visit: exactly 1 DB row after pair",       visitDbRows === 1,             `got ${visitDbRows}`);

  // ── 2c: offer (seasonal) ─────────────────────────────────────────────────
  console.log("\n  2c — HTTP offer: concurrent POST×2");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const [offer1, offer2] = await Promise.all([
    httpPost(offerUrl, fix.cookie),
    httpPost(offerUrl, fix.cookie),
  ]);

  const offerStatuses = [offer1.status, offer2.status].sort();
  const offerHas409 = offerStatuses.includes(409);
  const offerHas200 = offerStatuses.includes(200);
  const offerDbRows = await countSeasonalActionLogRows(fix.recruitId, fix.teamId, fix.leagueId, "offer", 1);

  assert("HTTP offer: one 200 received",                  offerHas200,                   `statuses: ${offerStatuses}`);
  assert("HTTP offer: one 409 received",                  offerHas409,                   `statuses: ${offerStatuses}`);
  assert("HTTP offer: 409 body alreadyDone=true",         offer1.status === 409 ? offer1.data?.alreadyDone === true : offer2.data?.alreadyDone === true, "alreadyDone missing");
  assert("HTTP offer: exactly 1 DB row after pair",       offerDbRows === 1,             `got ${offerDbRows}`);

  // ── 2d: sequential repeat is also blocked (sanity) ───────────────────────
  console.log("\n  2d — HTTP phone sequential repeat: second call also gets 409");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const seqFirst  = await httpPost(phoneUrl, fix.cookie, { pitchTopic: "reputation" });
  const seqSecond = await httpPost(phoneUrl, fix.cookie, { pitchTopic: "reputation" });

  assert("HTTP sequential: first call 200",               seqFirst.status === 200,       `got ${seqFirst.status}`);
  assert("HTTP sequential: second call 409",              seqSecond.status === 409,      `got ${seqSecond.status}`);
  assert("HTTP sequential: second 409 alreadyDone=true",  seqSecond.data?.alreadyDone === true, `body=${JSON.stringify(seqSecond.data)}`);

  console.log(`\n  Suite 2 complete — ${passed} pass, ${failed} fail so far`);
}

// ── SUITE 3 — Concurrent visit-cap enforcement (different recruits) ───────────

async function runSuite3(fix: Fixture): Promise<void> {
  header("SUITE 3 — Concurrent visit cap enforcement (different recruits)");

  console.log("\n  Rationale: the unique indexes only guard duplicate actions to the SAME");
  console.log("  recruit. Two simultaneous visits to DIFFERENT recruits could both pass a");
  console.log("  pre-check when the team is at cap-1 and both commit, exceeding the cap.");
  console.log("  The team-row lock + in-transaction count prevents this.\n");

  const VISIT_CAP = 1; // artificially tight so we can test with 2 recruits

  const baseParams = {
    teamId:     fix.teamId,
    leagueId:   fix.leagueId,
    coachId:    fix.coachId,
    week:       1,
    season:     1,
    cost:       2,
    maxAllowed: 50,
    interestGain: 20,
    notes:      "cap-test",
    visitCap:   VISIT_CAP,
  };

  // ── 3a: service-layer — two concurrent visits to DIFFERENT recruits, cap=1 ──
  console.log("  3a — Service-layer: two concurrent visits to different recruits, cap=1");
  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  const [capA, capB] = await Promise.all([
    executeRecruitingAction({ ...baseParams, actionType: "visit", recruitId: fix.recruitId }),
    executeRecruitingAction({ ...baseParams, actionType: "visit", recruitId: fix.recruitId2 }),
  ]);

  const capSuccesses    = [capA, capB].filter(r => r.success).length;
  const capExceededCnt  = [capA, capB].filter(r => r.capExceeded).length;
  const capAlreadyDone  = [capA, capB].filter(r => r.alreadyDone).length;

  // Count total visits for this team this season
  const { rows: [totalRow] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM recruiting_actions_log
      WHERE team_id = $1 AND league_id = $2 AND season = 1
        AND action_type IN ('visit', 'head_coach_visit')`,
    [fix.teamId, fix.leagueId],
  );
  const totalVisits = parseInt(totalRow.cnt, 10);
  const actionsUsedAfterCap = await getCoachActionsUsed(fix.coachId);

  assert("cap-service: exactly 1 success",               capSuccesses === 1,           `got ${capSuccesses}`);
  assert("cap-service: exactly 1 capExceeded",           capExceededCnt === 1,         `got ${capExceededCnt}`);
  assert("cap-service: 0 alreadyDone (different recruits)", capAlreadyDone === 0,      `got ${capAlreadyDone}`);
  assert("cap-service: total visits = 1 (cap held)",    totalVisits === 1,             `got ${totalVisits}`);
  assert("cap-service: budget deducted exactly once",   actionsUsedAfterCap === 2,     `recruit_actions_used=${actionsUsedAfterCap}`);

  // ── 3b: service-layer — third request after cap is full → capExceeded ───────
  console.log("\n  3b — Service-layer: additional visit when already at cap → capExceeded");
  await resetCoachActions(fix.coachId);

  // Create a third recruit for this sub-test
  const { rows: [r3] } = await pool.query<{ id: string }>(
    `INSERT INTO recruits
       (league_id, first_name, last_name, position, home_state, hometown, class_rank, position_rank)
     VALUES ($1, 'Third', 'Recruit', 'C', 'TX', 'Houston', 3, 3) RETURNING id`,
    [fix.leagueId],
  );
  const thirdRecruitId = r3.id;

  const thirdResult = await executeRecruitingAction({
    ...baseParams,
    actionType: "visit",
    recruitId: thirdRecruitId,
  });

  assert("cap-service: third visit also capExceeded", thirdResult.capExceeded === true,  `got ${JSON.stringify(thirdResult)}`);
  assert("cap-service: third visit not alreadyDone",  thirdResult.alreadyDone === false, `got alreadyDone=${thirdResult.alreadyDone}`);
  const visitsAfterThird = parseInt(
    (await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM recruiting_actions_log
        WHERE team_id = $1 AND league_id = $2 AND season = 1
          AND action_type IN ('visit', 'head_coach_visit')`,
      [fix.teamId, fix.leagueId],
    )).rows[0]?.cnt ?? "0",
    10,
  );
  assert("cap-service: total visits still = 1 after third blocked", visitsAfterThird === 1, `got ${visitsAfterThird}`);

  // ── 3c: HTTP — concurrent visits to two different recruits, real cap ──────────
  console.log("\n  3c — HTTP: concurrent visits to two different recruits when cap=1");
  console.log("       Note: HTTP cap uses real visitCombinedCap from league profile.");
  console.log("       We pre-fill cap-1 visits, then fire two concurrent visits to the last slot.");

  await resetCoachActions(fix.coachId);
  await clearActionLog(fix.leagueId);

  // First, get the real visitCombinedCap by hitting the league profile
  // The fixture league is 'standard' season → visitCombinedCap should be 12
  // Pre-fill cap-1 visits so only 1 slot remains
  const { rows: [capRow] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM recruiting_actions_log
      WHERE team_id = $1 AND league_id = $2 AND season = 1`,
    [fix.teamId, fix.leagueId],
  );

  // Get real combined cap from a quick GET to the recruiting page balance profile endpoint
  // Since we can't easily hit the balance profile API without a recruit, we'll determine
  // the cap by querying what the server knows — instead, seed cap-1 = 11 visits directly
  // then the two concurrent requests race for the last slot.
  const REAL_CAP = 12; // standard season visitCombinedCap
  const PREFILL  = REAL_CAP - 1;

  // Insert PREFILL synthetic visit rows for existing recruits (season 1 only)
  // We need PREFILL different recruits; create them now
  const prefillRecruitIds: string[] = [];
  for (let i = 0; i < PREFILL; i++) {
    const { rows: [pr] } = await pool.query<{ id: string }>(
      `INSERT INTO recruits
         (league_id, first_name, last_name, position, home_state, hometown, class_rank, position_rank)
       VALUES ($1, $2, $3, 'OF', 'TX', 'Test', $4, $4) RETURNING id`,
      [fix.leagueId, `Prefill${i}`, "Visitee", i + 10],
    );
    prefillRecruitIds.push(pr.id);
  }

  // Insert pre-fill visit log rows directly
  for (const pid of prefillRecruitIds) {
    await pool.query(
      `INSERT INTO recruiting_actions_log
         (id, recruit_id, team_id, league_id, week, season, action_type, interest_change, notes, is_auto_pilot)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 1, 'visit', 10, 'prefill', false)`,
      [pid, fix.teamId, fix.leagueId],
    );
  }

  // Verify pre-fill count
  const { rows: [preCheck] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM recruiting_actions_log
      WHERE team_id = $1 AND league_id = $2 AND season = 1
        AND action_type IN ('visit', 'head_coach_visit')`,
    [fix.teamId, fix.leagueId],
  );
  assert(`cap-http pre-fill: ${PREFILL} visits already in DB`, parseInt(preCheck.cnt, 10) === PREFILL, `got ${preCheck.cnt}`);

  // Now concurrently hit the visit endpoint for two different recruits
  const visitUrl1 = `/api/leagues/${fix.leagueId}/recruiting/${fix.recruitId}/visit`;
  const visitUrl2 = `/api/leagues/${fix.leagueId}/recruiting/${fix.recruitId2}/visit`;

  const [httpCap1, httpCap2] = await Promise.all([
    httpPost(visitUrl1, fix.cookie),
    httpPost(visitUrl2, fix.cookie),
  ]);

  const httpCapStatuses = [httpCap1.status, httpCap2.status].sort();
  const httpCapHas200   = httpCapStatuses.includes(200);
  const httpCapHas409   = httpCapStatuses.includes(409);

  // Verify the 409 carries capExceeded (not alreadyDone)
  const rejected = httpCap1.status === 409 ? httpCap1 : httpCap2;

  const { rows: [afterRow] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM recruiting_actions_log
      WHERE team_id = $1 AND league_id = $2 AND season = 1
        AND action_type IN ('visit', 'head_coach_visit')`,
    [fix.teamId, fix.leagueId],
  );
  const totalAfter = parseInt(afterRow.cnt, 10);

  assert("cap-http: one 200 received",                   httpCapHas200,                  `statuses: ${httpCapStatuses}`);
  assert("cap-http: one 409 received",                   httpCapHas409,                  `statuses: ${httpCapStatuses}`);
  assert("cap-http: 409 body has capExceeded=true",      rejected.data?.capExceeded === true, `body=${JSON.stringify(rejected.data)}`);
  assert("cap-http: total visits = REAL_CAP (not over)", totalAfter === REAL_CAP,        `got ${totalAfter}, expected ${REAL_CAP}`);

  console.log(`\n  Suite 3 complete — ${passed} pass, ${failed} fail so far`);
}

// ── Schema guard — partial indexes must exist ─────────────────────────────────

async function assertIndexesExist(): Promise<void> {
  header("Schema guard — partial unique indexes must exist");

  const { rows } = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('uq_action_log_weekly', 'uq_action_log_seasonal')`,
  );
  const names = rows.map(r => r.indexname);
  assert(
    "uq_action_log_weekly index exists",
    names.includes("uq_action_log_weekly"),
    "Index missing — migration 0047 may not have run",
  );
  assert(
    "uq_action_log_seasonal index exists",
    names.includes("uq_action_log_seasonal"),
    "Index missing — migration 0047 may not have run",
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const suite1Only = args.includes("--suite1-only");
  const suite2Only = args.includes("--suite2-only");
  const suite3Only = args.includes("--suite3-only");

  console.log("\n  verify-recruiting-action-dedup.ts\n");

  await assertIndexesExist();

  if (failed > 0) {
    console.error("\n  ✗  Schema guard failed — aborting further tests.\n");
    process.exit(1);
  }

  let fix: Fixture | undefined;
  try {
    header("Fixture setup");
    fix = await buildFixture();
    console.log(`  ·  league=${fix.leagueId}  team=${fix.teamId}  coach=${fix.coachId}  recruit=${fix.recruitId}  recruit2=${fix.recruitId2}`);

    const runAll = !suite1Only && !suite2Only && !suite3Only;
    if (runAll || suite1Only) await runSuite1(fix);
    if (runAll || suite2Only) await runSuite2(fix);
    if (runAll || suite3Only) await runSuite3(fix);

    header("Results");
    console.log(`  Total: ${passed} assertions passed, ${failed} failed`);

    if (failed > 0) {
      console.error("\n  ✗  One or more assertions failed.\n");
      process.exit(1);
    }
    console.log("\n  ✓  All assertions passed.\n");
  } finally {
    if (fix) {
      header("Teardown");
      try {
        await teardownFixture(fix.leagueId, fix.userId);
        console.log("  ·  League and fixtures deleted.");
      } catch (err) {
        console.warn("  ⚠  Teardown error (non-fatal):", err);
      }
    }
    await pool.end();
  }
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
