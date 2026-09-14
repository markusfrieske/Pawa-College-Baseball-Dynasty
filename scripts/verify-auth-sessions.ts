/** Real HTTP authentication, PostgreSQL sessions and application-process restarts.
 * Requires PAWA_TEST_DATABASE_URL on loopback with a test role able to CREATE DATABASE.
 * Creates/drops only its own random test DB. Never starts server/index or backfill jobs.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected PostgreSQL URL");
assert(!target.search, "Connection URL overrides are forbidden in this disposable gate");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test DB must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected named disposable test database");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv.includes("--http-child")) {
  process.env.DATABASE_URL = connection;
  process.env.NODE_ENV = "production";
  assert(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "local-test-disabled";
  process.env.OPENAI_API_KEY = "local-test-disabled";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "http://127.0.0.1:1";
  const { default: express } = await import("express");
  const { createServer } = await import("node:http");
  const { registerRoutes } = await import("../server/routes");
  const { storage } = await import("../server/storage");
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  // No injected identity, MemoryStore or replacement session middleware.
  await registerRoutes(server, app);
  app.use((_error: Error, _req: unknown, res: any, _next: unknown) => res.status(500).json({ message: "Test middleware failure" }));
  const originalGetUser = storage.getUser.bind(storage);
  process.on("message", (message: any) => {
    if (message?.kind === "lookup-fault") {
      storage.getUser = message.enabled ? async () => { throw new Error("synthetic identity lookup failure"); } : originalGetUser;
      process.send?.({ kind: "fault-ready" });
    }
  });
  process.on("disconnect", () => process.exit(0));
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert(address && typeof address === "object");
    process.send?.({ kind: "ready", port: address.port });
  });
} else {
  const admin = new pg.Pool({ connectionString: connection });
  const name = `pawa_test_sessions_${randomUUID().replaceAll("-", "")}`;
  assert(/^pawa_test_sessions_[a-f0-9]{32}$/.test(name));
  const url = new URL(connection);
  url.pathname = `/${name}`;
  let created = false;
  let pool: pg.Pool | undefined;
  let child: ChildProcess | undefined;
  let origin = "";
  let checks = 0;
  const secret = randomUUID() + randomUUID();
  const email = "session-coach@example.test";
  const password = "synthetic-session-password";
  function equal(actual: unknown, expected: unknown, label: string) {
    assert.deepEqual(actual, expected, label); checks++;
  }
  const invoke = async (route: string, method = "GET", cookie?: string, body?: unknown) => {
    const response = await fetch(origin + route, {
      method, signal: AbortSignal.timeout(15_000),
      // Simulates the existing one-hop TLS proxy contract; not a real TLS test.
      headers: { "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data: any;
    try { data = method === "HEAD" ? undefined : JSON.parse(text); }
    catch { throw new Error(`Expected JSON from ${method} ${route}, status ${response.status}`); }
    return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const sid = (cookie: string) => decodeURIComponent(cookie.split("=")[1]).slice(2).split(".")[0];
  async function stored(cookie: string) {
    return (await pool!.query("SELECT sess,expire FROM session WHERE sid=$1", [sid(cookie)])).rows[0];
  }
  async function stop() {
    if (!child) return;
    const current = child; child = undefined;
    if (current.exitCode !== null || current.signalCode !== null) return;
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Owned HTTP child did not stop")), 10_000);
      current.once("exit", () => { clearTimeout(timer); done(); });
      current.kill();
    });
  }
  async function start(sessionSecret = secret) {
    await stop();
    child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--http-child"], {
      cwd: root, windowsHide: true,
      env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString(), SESSION_SECRET: sessionSecret },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const current = child;
    origin = await new Promise<string>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("HTTP child startup timeout")), 30_000);
      current.once("error", error => { clearTimeout(timer); reject(error); });
      current.once("exit", code => { clearTimeout(timer); reject(new Error(`HTTP child exited ${code}`)); });
      current.on("message", (message: any) => {
        if (message?.kind === "ready") { clearTimeout(timer); done(`http://127.0.0.1:${message.port}`); }
      });
    });
  }
  async function lookupFault(enabled: boolean) {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Fault-injection acknowledgement timeout")), 10_000);
      child!.once("message", () => { clearTimeout(timer); done(); });
      child!.send({ kind: "lookup-fault", enabled });
    });
  }
  async function bootstrap() {
    const code = await new Promise<number | null>((done, reject) => {
      const processChild = spawn(process.execPath, ["--import", "tsx", "scripts/bootstrap-test-db.ts"], {
        cwd: root, windowsHide: true, stdio: "ignore", env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString() },
      });
      const timer = setTimeout(() => { processChild.kill(); reject(new Error("Bootstrap child timeout")); }, 60_000);
      processChild.once("error", error => { clearTimeout(timer); reject(error); });
      processChild.once("exit", code => { clearTimeout(timer); done(code); });
    });
    equal(code, 0, "Fresh owned session DB bootstrap");
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    pool = new pg.Pool({ connectionString: url.toString() });
    await bootstrap();
    await start();
    equal((await invoke("/health/ready")).response.status, 200, "Actual route readiness");
    equal((await invoke("/api/auth/me")).response.status, 401, "Anonymous rejected");
    equal((await invoke("/api/auth/login", "POST", undefined, { email, password })).response.status, 401, "Unknown credentials rejected");
    const registered = await invoke("/api/auth/register", "POST", undefined, { email, password });
    equal(registered.response.status, 200, "Real registration succeeds");
    assert(registered.cookie);
    const userId = registered.data.id;
    const attributes = registered.response.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Expires="]) equal(attributes.includes(flag), true, `Cookie ${flag}`);
    equal(registered.response.headers.get("cache-control"), "no-store", "Authentication not cached");
    equal((await stored(registered.cookie)).sess.userId, userId, "Registration persisted before success");
    equal((await invoke("/api/auth/me", "GET", registered.cookie)).data.id, userId, "Registration cookie authenticates");
    const { default: bcrypt } = await import("bcrypt");
    const hashed = (await pool.query("SELECT password FROM users WHERE id=$1", [userId])).rows[0].password;
    equal(hashed !== password && await bcrypt.compare(password, hashed), true, "Stored bcrypt hash verifies");
    equal((await invoke("/api/auth/login", "POST", undefined, { email, password: "wrong-password" })).response.status, 401, "Wrong password rejected");
    await pool.query("UPDATE users SET email_opt_out=true WHERE id=$1", [userId]);

    const guest = await invoke("/api/auth/guest", "POST", registered.cookie, {});
    equal(guest.response.status, 200, "Guest succeeds"); assert(guest.cookie);
    equal(guest.cookie !== registered.cookie, true, "Guest identity rotates SID");
    equal(await stored(registered.cookie), undefined, "Prior SID revoked on guest switch");
    equal((await stored(guest.cookie)).sess.isGuest, true, "Guest persisted before success");
    equal((await invoke("/api/auth/me", "GET", registered.cookie)).response.status, 401, "Previous cookie rejected");
    equal((await invoke("/api/auth/me", "GET", guest.cookie)).data.email, guest.data.email, "Guest identity consistent");
    const logged = await invoke("/api/auth/login", "POST", guest.cookie, { email, password });
    equal(logged.response.status, 200, "Real password login succeeds"); assert(logged.cookie);
    equal(logged.data.emailOptOut, true, "Login preserves stored preference in cached identity");
    equal(logged.cookie !== guest.cookie, true, "Login rotates guest SID");
    equal(await stored(guest.cookie), undefined, "Guest SID revoked");
    equal((await stored(logged.cookie)).sess.isGuest, undefined, "Guest flag absent after normal login");
    equal((await stored(logged.cookie)).sess.userId, userId, "Login persisted before success");
    const firstPid = child!.pid;
    await start();
    equal(child!.pid !== firstPid, true, "Separate restarted HTTP process");
    equal((await invoke("/api/auth/me", "GET", logged.cookie)).data.id, userId, "Same secret restores identity from PG after restart");
    await lookupFault(true);
    const failedLookup = await invoke("/api/auth/me", "GET", logged.cookie);
    equal(failedLookup.response.status, 500, "Identity lookup error handled");
    equal(failedLookup.data.message, "Unable to check authentication", "Lookup details not exposed");
    for (const [route, method, body] of [
      ["/api/leagues", "GET", undefined],
      ["/api/users/email-preferences", "PATCH", { emailOptOut: false }],
    ] as const) {
      const failed = await invoke(route, method, logged.cookie, body);
      equal(failed.response.status, 500, `${method} ${route} fails closed on actor lookup failure`);
      equal(failed.data.message, "Unable to check authentication", "Protected lookup error is generic");
      equal(failed.response.headers.get("cache-control"), "no-store", "Protected lookup failure not cached");
    }
    equal((await stored(logged.cookie)).sess.userId, userId, "Lookup failure preserves legitimate session");
    equal((await pool.query("SELECT email_opt_out FROM users WHERE id=$1", [userId])).rows[0].email_opt_out, true, "Failed protected write preserves preference");
    equal((await invoke("/api/catalog", "GET", logged.cookie)).response.status, 200, "Public catalog independent of actor lookup");
    equal((await invoke("/api/presence/online-count")).response.status, 200, "Anonymous public presence remains available");
    equal((await invoke("/health/live", "GET", logged.cookie)).response.status, 200, "Liveness independent of actor lookup");
    await lookupFault(false);
    equal((await invoke("/api/auth/me", "GET", logged.cookie)).data.id, userId, "Server/session survive transient lookup error");
    equal((await invoke("/api/leagues", "GET", logged.cookie)).response.status, 200, "Protected route recovers with same SID");
    const logout = await invoke("/api/auth/logout", "POST", logged.cookie);
    equal(logout.response.status, 200, "Logout succeeds");
    equal(logout.response.headers.get("set-cookie")?.includes("Expires=Thu, 01 Jan 1970"), true, "Logout expires browser cookie");
    equal(await stored(logged.cookie), undefined, "Logout removes PG SID");
    equal((await invoke("/api/auth/me", "GET", logged.cookie)).response.status, 401, "Logged-out SID rejected");

    await pool.query("CREATE FUNCTION session_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic session write failure'; END $$");
    await pool.query("CREATE TRIGGER session_test_write BEFORE INSERT OR UPDATE ON session FOR EACH ROW EXECUTE FUNCTION session_test_fail()");
    const failedLogin = await invoke("/api/auth/login", "POST", undefined, { email, password });
    equal(failedLogin.response.status, 500, "Session write failure cannot report login success");
    equal((await pool.query("SELECT count(*)::integer AS n FROM session WHERE sess->>'userId'=$1", [userId])).rows[0].n, 0, "Failed save leaves no authenticated SID");
    equal((await invoke("/api/auth/me", "GET", failedLogin.cookie)).response.status, 401, "Failed login issues no usable authenticated cookie");
    const failedRegister = await invoke("/api/auth/register", "POST", undefined, { email: "recover@example.test", password });
    equal(failedRegister.response.status, 500, "Registration session failure is not success");
    equal(failedRegister.data.message, "Account created, but sign-in failed. Please sign in.", "Created-account recovery guidance");
    await pool.query("DROP TRIGGER session_test_write ON session");
    equal((await invoke("/api/auth/login", "POST", undefined, { email: "recover@example.test", password })).response.status, 200, "Failed-registration account can sign in after store recovery");
    const second = await invoke("/api/auth/login", "POST", undefined, { email, password });
    equal(second.response.status, 200, "Normal login recovers after storage fault"); assert(second.cookie);
    await pool.query("CREATE TRIGGER session_test_delete BEFORE DELETE ON session FOR EACH ROW EXECUTE FUNCTION session_test_fail()");
    equal((await invoke("/api/auth/logout", "POST", second.cookie)).response.status, 500, "Failed session deletion cannot claim logout");
    await pool.query("DROP TRIGGER session_test_delete ON session");
    await pool.query("UPDATE session SET expire=now()-interval '1 day' WHERE sid=$1", [sid(second.cookie)]);
    equal((await invoke("/api/auth/me", "GET", second.cookie)).response.status, 401, "Expired session rejected");

    const third = await invoke("/api/auth/login", "POST", undefined, { email, password });
    equal(third.response.status, 200, "Fresh login after expired session"); assert(third.cookie);
    await start(randomUUID() + randomUUID());
    equal((await invoke("/api/auth/me", "GET", third.cookie)).response.status, 401, "Changed signing secret rejects previous cookie");
    const other = await invoke("/api/auth/register", "POST", undefined, { email: "other@example.test", password });
    equal(other.response.status, 200, "Second account registration"); assert(other.cookie);
    const leagueId = "session-revocation-league";
    await pool.query("INSERT INTO leagues (id,name,commissioner_id,co_commissioner_ids,current_phase,is_test_data,game_mode) VALUES ($1,'Preserved companion',$2,$3,'dynasty_setup',true,'reported')", [leagueId, userId, JSON.stringify([other.data.id])]);
    await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state) VALUES ('session-team',$1,'Preserved College','Owls','OWL','Test','IA')", [leagueId]);
    await pool.query("INSERT INTO league_events (id,league_id,team_id,event_type,description) VALUES ('session-event',$1,'session-team','game_result','Preserved synthetic result')", [leagueId]);
    equal((await invoke(`/api/leagues/${leagueId}`, "GET", other.cookie)).response.status, 200, "Live co-commissioner warms private read/cache");
    const protectedRequests: Array<[string, string, unknown?]> = [
      ["/api/leagues", "GET"],
      [`/api/leagues/${leagueId}`, "GET"],
      [`/api/leagues/${leagueId}`, "HEAD"],
      [`/api/leagues/${leagueId}/team-selection`, "POST", { selectedTeams: [] }],
      ["/api/users/email-preferences", "PATCH", { emailOptOut: true }],
      ["/api/saved-rosters", "POST", { name: "Unauthorized copy", rosterData: [] }],
      [`/api/leagues/${leagueId}/storylines/events/nonexistent/vote`, "POST", { choice: "A" }],
      ["/objects/synthetic-evidence.png", "GET"],
    ];
    // Independently signed, real logins prevent a first revoked SID from masking
    // missing checks on later routes. Leave one extra SID for store-delete failure.
    const cookies = [other.cookie];
    for (let i = 0; i < protectedRequests.length; i++) {
      const extra = await invoke("/api/auth/login", "POST", undefined, { email: "other@example.test", password });
      equal(extra.response.status, 200, "Independent pre-deletion login"); assert(extra.cookie); cookies.push(extra.cookie);
    }
    const snapshot = async () => ({
      leagues: (await pool!.query("SELECT * FROM leagues ORDER BY id")).rows,
      teams: (await pool!.query("SELECT * FROM teams ORDER BY id")).rows,
      events: (await pool!.query("SELECT * FROM league_events ORDER BY id")).rows,
      rosters: (await pool!.query("SELECT * FROM saved_rosters ORDER BY id")).rows,
    });
    const beforeRevocation = await snapshot();
    await pool.query("DELETE FROM users WHERE id=$1", [other.data.id]);
    for (const [index, [route, method, body]] of protectedRequests.entries()) {
      const denied = await invoke(route, method, cookies[index], body);
      equal(denied.response.status, 401, `Deleted actor blocked directly: ${method} ${route}`);
      equal(denied.response.headers.get("cache-control"), "no-store", "Revocation response not cached");
      equal(denied.response.headers.get("set-cookie")?.includes("Expires=Thu, 01 Jan 1970"), true, "Deleted actor cookie expired");
      equal(await stored(cookies[index]), undefined, "Each deleted actor SID revoked independently");
    }
    equal(await snapshot(), beforeRevocation, "Denied reads/writes preserve league, teams, history and saved rosters");
    await pool.query("CREATE TRIGGER session_test_delete BEFORE DELETE ON session FOR EACH ROW EXECUTE FUNCTION session_test_fail()");
    const failedRevoke = await invoke("/api/saved-rosters", "POST", cookies[8], { name: "Denied while store fails", rosterData: [] });
    equal(failedRevoke.response.status, 500, "Failed SID deletion remains fail-closed");
    equal(failedRevoke.data.message, "Unable to check authentication", "SID deletion failure is generic");
    equal(failedRevoke.response.headers.get("set-cookie")?.includes("Expires=Thu, 01 Jan 1970"), true, "Cookie expires even when SID deletion fails");
    equal(await snapshot(), beforeRevocation, "Session-delete failure cannot reach write handler");
    await pool.query("DROP TRIGGER session_test_delete ON session");
    equal((await invoke("/api/leagues", "GET", cookies[8])).response.status, 401, "Retained SID still denied after store recovery");
    equal(await stored(cookies[8]), undefined, "Retained stale SID removed on retry");
    equal((await invoke("/api/auth/me", "GET", other.cookie)).response.status, 401, "Deleted normal user rejected");
    equal(await stored(other.cookie), undefined, "Deleted identity session revoked");
    const deletedGuest = await invoke("/api/auth/guest", "POST", undefined, {});
    equal(deletedGuest.response.status, 200, "Guest for deletion fixture"); assert(deletedGuest.cookie);
    await pool.query("DELETE FROM users WHERE id=$1", [deletedGuest.data.id]);
    equal((await invoke("/api/saved-rosters", "GET", deletedGuest.cookie)).response.status, 401, "Deleted guest cannot authenticate directly via flag");
    equal(await stored(deletedGuest.cookie), undefined, "Deleted guest SID revoked");
    const flagOnly = await invoke("/api/auth/guest", "POST", undefined, {});
    equal(flagOnly.response.status, 200, "Guest-only-flag fixture"); assert(flagOnly.cookie);
    await pool.query("UPDATE session SET sess=(sess::jsonb - 'userId')::json WHERE sid=$1", [sid(flagOnly.cookie)]);
    equal((await invoke("/api/leagues", "GET", flagOnly.cookie)).response.status, 401, "Guest flag without actor ID is not authentication");
    console.log(`[session-test] PASS ${checks} assertions: real auth/PgStore, process restart, revocation and fault recovery`);
  } finally {
    await stop();
    await pool?.end();
    try { if (created) await admin.query(`DROP DATABASE "${name}"`); }
    finally { await admin.end(); }
  }
}
