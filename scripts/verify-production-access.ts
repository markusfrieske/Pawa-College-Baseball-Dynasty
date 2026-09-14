/**
 * W01 HTTP regression gate. Run with: tsx scripts/verify-production-access.ts
 * Deliberately not named *.test.ts: this standalone runner must not execute while
 * Playwright discovers its unrelated browser tests.
 * Requires PAWA_TEST_DATABASE_URL pointing to a disposable loopback database with
 * shared/schema.ts and numbered migrations installed, named pawa_test_* or pawa_wNN_test.
 * Never reads DATABASE_URL or imports server/index. Readiness is checked over HTTP;
 * full startup jobs and data transforms remain separate from this route gate.
 * Uses real registerRoutes, HTTP, PostgreSQL fixtures, and storage. Only authentication
 * is injected through a test-only MemoryStore session route; login/PG session storage
 * and production bootstrap are deliberately outside this gate.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import session from "express-session";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL is required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected a PostgreSQL URL");
assert(!target.search, "Connection URL overrides are forbidden for disposable tests");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test DB must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected an explicitly named disposable pawa test database");
process.env.DATABASE_URL = connection;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = randomUUID() + randomUUID();
process.env.PBP_ENABLED = "true";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "local-test-disabled";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "http://127.0.0.1:1";
process.env.OPENAI_API_KEY = "local-test-disabled";

const { pool } = await import("../server/db");
const { storage } = await import("../server/storage");
const { cacheGet, cacheDeletePrefix, leagueCacheKey } = await import("../server/cache");
const { registerRoutes } = await import("../server/routes");
const runId = `access-${randomUUID()}`;
const leagueId = `${runId}-league`;
const teamId = `${runId}-team`;
const roles = ["commissioner", "co", "member", "unassigned", "guest", "outsider"] as const;
const ids = Object.fromEntries(roles.map(role => [role, `${runId}-${role}`])) as Record<typeof roles[number], string>;
const app = express();
const httpServer = createServer(app);
app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
app.post("/__test/session", (req, res) => {
  const role = req.body.role as keyof typeof ids;
  if (role in ids) req.session.userId = ids[role];
  if (role === "guest" || req.body.role === "guest-without-id") req.session.isGuest = true;
  req.session.save(error => error ? res.sendStatus(500) : res.sendStatus(204));
});

let assertions = 0;
function check(condition: unknown, message: string): asserts condition {
  assert(condition, message);
  assertions++;
}
function noEmailKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    check(key !== "email", "Public league DTO contains an email field");
    noEmailKeys(child);
  }
}

try {
  for (const role of roles) {
    await pool.query("INSERT INTO users (id,email,password) VALUES ($1,$2,$3)",
      [ids[role], `${ids[role]}@example.test`, "test-fixture-no-login"]);
  }
  await pool.query("INSERT INTO leagues (id,name,commissioner_id,co_commissioner_ids,current_phase,is_test_data) VALUES ($1,$2,$3,$4,'dynasty_setup',true)",
    [leagueId, "W01 isolated access fixture", ids.commissioner, JSON.stringify([ids.co])]);
  await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu,coach_id) VALUES ($1,$2,'Test College','Owls','TST','Test','IA',false,$3)",
    [teamId, leagueId, `${runId}-coach-member`]);
  for (const role of ["member", "unassigned", "guest"] as const) {
    await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ($1,$2,$3,$4,'Fixture',$5)",
      [`${runId}-coach-${role}`, ids[role], role === "member" ? teamId : null, leagueId, role]);
  }
  await pool.query("INSERT INTO league_invites (id,league_id,invite_code,invited_by_id,label) VALUES ($1,$2,$3,$4,'Test invite')",
    [`${runId}-invite`, leagueId, `${runId}-code`, ids.commissioner]);
  await registerRoutes(httpServer, app);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Test HTTP handler failed:", error.message);
    res.status(500).json({ message: "Test handler failure" });
  });
  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const readiness = await fetch(`${origin}/health/ready`);
  check(readiness.status === 200, "Migration-backed HTTP readiness must pass before access tests");
  console.log("PASS migration-backed HTTP readiness");
  const cookies: Record<string, string> = {};
  for (const role of [...roles, "guest-without-id"]) {
    const response = await fetch(`${origin}/__test/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    assert.equal(response.status, 204);
    cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
  }
  const request = (role: string, suffix = "", method = "GET", body?: unknown) => fetch(`${origin}/api/leagues/${leagueId}${suffix}`, {
    method, headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const expectStatus = async (role: string, suffix: string, status: number, method = "GET") => {
    const response = await request(role, suffix, method);
    check(response.status === status, `${role} ${method} ${suffix || "/"}: expected ${status}, got ${response.status}`);
    return response;
  };
  const reads = ["", "/schedule", "/dynasty-setup", "/setup", "/team-selection"];
  for (const suffix of reads) {
    await expectStatus("anonymous", suffix, 401);
    await expectStatus("guest-without-id", suffix, 401);
    await expectStatus("outsider", suffix, 403);
    await expectStatus("outsider", suffix, 403, "HEAD");
  }
  console.log("PASS cold-cache unauthenticated, malformed guest, outsider and HEAD denial");

  for (const role of ["commissioner", "co", "member", "unassigned", "guest"]) {
    for (const suffix of reads) {
      const response = await expectStatus(role, suffix, 200);
      const data = await response.json();
      if (suffix === "" || suffix === "/schedule") {
        check(response.headers.get("cache-control")?.includes("no-store"), "Sensitive response should use no-store");
      }
      if (suffix === "" || suffix === "/dynasty-setup") {
        noEmailKeys(data.teams);
        check(!JSON.stringify(data).includes("@example.test"), "Account email escaped in league DTO");
        if (suffix === "/dynasty-setup") {
          if (role === "commissioner" || role === "co") check(data.invites.length === 1, "Commissioner invite controls lost");
          else {
            check(!data.invites || data.invites.length === 0, "Member can retrieve invite codes");
            noEmailKeys(data);
          }
        }
      }
    }
  }
  check(cacheGet(leagueCacheKey(leagueId, "main")) !== undefined, "Main cache must actually be warm");
  check(cacheGet(leagueCacheKey(leagueId, "schedule")) !== undefined, "Schedule cache must actually be warm");
  for (const suffix of reads) await expectStatus("outsider", suffix, 403);
  console.log("PASS real commissioner/co-commissioner/member/unassigned/guest fixtures; DTO privacy and warm-cache denial");

  await pool.query("DELETE FROM coaches WHERE id=$1", [`${runId}-coach-unassigned`]);
  for (const suffix of reads) await expectStatus("unassigned", suffix, 403);
  const missing = await fetch(`${origin}/api/leagues/${runId}-missing`, { headers: { Cookie: cookies.member } });
  check(missing.status === 404, "Missing league should return 404");
  // Public token preview stays available before membership; this fixture has no CPU teams.
  const invitePreview = await fetch(`${origin}/api/invites/${runId}-code`);
  check(invitePreview.status === 200, "Public invite preview was accidentally blocked");
  console.log("PASS revoked membership on warm cache, missing league and public invite compatibility");

  // Trap every storage operation and DB query/connection during unsafe legacy POSTs.
  // This is fault injection, not a mocked successful access test: all earlier GETs
  // executed actual SQL. Any path approaching the finalizer must fail this gate.
  const restores: Array<() => void> = [];
  let blockedDataCalls = 0;
  function trap(object: any, key: string) {
    const own = Object.getOwnPropertyDescriptor(object, key);
    object[key] = () => { blockedDataCalls++; throw new Error(`Forbidden PBP data access: ${key}`); };
    restores.push(() => own ? Object.defineProperty(object, key, own) : delete object[key]);
  }
  for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(storage))) {
    if (key !== "constructor" && typeof (storage as any)[key] === "function") trap(storage, key);
  }
  trap(pool, "query");
  trap(pool, "connect");
  try {
    for (const role of ["commissioner", "co", "member", "outsider", "guest"]) {
      for (const endpoint of ["play-by-play", "finalize-play-by-play"]) {
        const response = await request(role, `/games/fabricated-game/${endpoint}`, "POST", {
          homeScore: 999, awayScore: -2, homeBatting: [{ playerId: "foreign-player", hr: 900 }],
        });
        check(response.status === 404, `PBP_ENABLED=true ${role} ${endpoint} must stay disabled; got ${response.status}`);
        const body = await response.json();
        check(typeof body.message === "string" && body.message.length > 0, "Disabled PBP needs an explanation");
      }
    }
    check(blockedDataCalls === 0, "Disabled PBP attempted storage/database work");
  } finally {
    restores.reverse().forEach(restore => restore());
  }
  console.log("PASS PBP_ENABLED=true fabrication attempts: all roles denied, zero storage/database access");
  console.log(`PASS W01 production-access HTTP gate (${assertions} assertions; real PostgreSQL reads; test-only authentication)`);
} finally {
  if (httpServer.listening) await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
  cacheDeletePrefix(`league:${leagueId}:`);
  // Only delete IDs created by this invocation, even if fixture construction failed.
  try {
    await pool.query("DELETE FROM league_invites WHERE id=$1", [`${runId}-invite`]);
    await pool.query("DELETE FROM coaches WHERE league_id=$1", [leagueId]);
    await pool.query("DELETE FROM teams WHERE id=$1", [teamId]);
    await pool.query("DELETE FROM leagues WHERE id=$1", [leagueId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [Object.values(ids)]);
  } finally {
    await pool.end();
  }
}
