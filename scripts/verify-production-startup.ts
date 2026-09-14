/** Execute the actual production entry point on an owned empty PostgreSQL DB.
 * The server is bundled into test-results with a tiny synthetic public index.
 * This is explicitly NOT the full client/media build or a mature-save upgrade.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import pg from "pg";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected PostgreSQL URL");
assert(!target.search, "Connection URL overrides are forbidden in this disposable gate");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test DB must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected named disposable test database");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "test-results"), { recursive: true });
const output = await mkdtemp(resolve(root, "test-results/startup-"));
const entry = resolve(output, "index.cjs");
const publicDir = resolve(output, "public");
await mkdir(publicDir);
await writeFile(resolve(publicDir, "index.html"), "<!doctype html><title>Synthetic startup fixture</title>");
await build({ entryPoints: [resolve(root, "server/index.ts")], outfile: entry, absWorkingDir: root,
  platform: "node", format: "cjs", bundle: true, packages: "external", minify: true,
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
const name = `pawa_test_startup_${randomUUID().replaceAll("-", "")}`;
assert(/^pawa_test_startup_[a-f0-9]{32}$/.test(name));
const url = new URL(connection); url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: connection });
let pool: pg.Pool | undefined;
let created = false;
let child: ChildProcess | undefined;
let logs = "";
let checks = 0;
const canary = "SYNTHETIC_SESSION_ERROR_DETAILS";
const secret = randomUUID() + randomUUID();
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function childEnv(extra: Record<string, string> = {}) {
  return { ...process.env, DATABASE_URL: url.toString(), PAWA_TEST_DATABASE_URL: url.toString(),
    NODE_ENV: "production", HOST: "127.0.0.1", PORT: "0", SESSION_SECRET: secret,
    AI_INTEGRATIONS_OPENAI_API_KEY: "local-test-disabled", OPENAI_API_KEY: "local-test-disabled",
    AI_INTEGRATIONS_OPENAI_BASE_URL: "http://127.0.0.1:1", ...extra };
}
async function finiteCommand(args: string[], env = childEnv()): Promise<{ code: number | null; text: string }> {
  return new Promise((done, reject) => {
    const proc = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    const timer = setTimeout(() => { proc.kill(); reject(new Error("Test child timeout")); }, 60_000);
    proc.stdout.on("data", data => { text += data; }); proc.stderr.on("data", data => { text += data; });
    proc.once("error", error => { clearTimeout(timer); reject(error); });
    proc.once("exit", code => { clearTimeout(timer); done({ code, text }); });
  });
}
async function start(): Promise<string> {
  logs = "";
  child = spawn(process.execPath, [entry], { cwd: root, env: childEnv(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const current = child;
  return new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Actual production startup timed out")), 45_000);
    const outputHandler = (chunk: Buffer) => {
      logs += chunk.toString();
      const match = logs.match(/serving on 127\.0\.0\.1 port (\d+)/);
      if (match) { clearTimeout(timer); done(`http://127.0.0.1:${match[1]}`); }
    };
    current.stdout!.on("data", outputHandler); current.stderr!.on("data", outputHandler);
    current.once("error", error => { clearTimeout(timer); reject(error); });
    current.once("exit", code => { clearTimeout(timer); reject(new Error(`Actual production entry point exited ${code} before readiness`)); });
  });
}
async function stop() {
  if (!child) return;
  const current = child; child = undefined;
  if (current.exitCode !== null || current.signalCode !== null) return;
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Owned startup child did not stop")), 10_000);
    current.once("exit", () => { clearTimeout(timer); done(); }); current.kill();
  });
}
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  pool = new pg.Pool({ connectionString: url.toString() });
  equal((await finiteCommand(["--import", "tsx", "scripts/bootstrap-test-db.ts"])).code, 0, "Owned DB bootstrap succeeds");
  for (const value of ["5000junk", "-1", "65536"]) {
    const invalid = await finiteCommand([entry], childEnv({ PORT: value }));
    equal(invalid.code, 1, "Invalid PORT exits unsuccessfully");
    equal(invalid.text.includes("PORT must be an integer"), true, "Invalid port has actionable diagnostic");
    equal(/^\[job-runner\]/m.test(invalid.text), false, "Invalid bind configuration rejected before jobs");
  }
  const origin = await start();
  const request = (path: string, options: RequestInit = {}) => fetch(origin + path, { ...options, signal: AbortSignal.timeout(15_000) });
  equal((await request("/health/live")).status, 200, "Actual liveness");
  equal((await request("/health/ready")).status, 200, "Actual numbered readiness");
  equal((await (await request("/")).text()).includes("Synthetic startup fixture"), true, "Actual static middleware serves declared fixture");
  const headers = { "Content-Type": "application/json", "X-Forwarded-Proto": "https" };
  const malformed = await request("/api/invites/SYNTHETIC_INVITE_TOKEN", { method: "POST", headers, body: '{"SYNTHETIC_PASSWORD_BODY":' });
  equal(malformed.status, 400, "Malformed JSON status");
  equal(await malformed.json(), { message: "Invalid request" }, "Malformed JSON omits parser/body details");
  equal(malformed.headers.get("cache-control"), "no-store", "Error response not cached");
  const oversized = await request("/api/auth/login", { method: "POST", headers, body: JSON.stringify({ text: "x".repeat(110_000) }) });
  equal(oversized.status, 413, "Body limit remains enforced");
  equal(await oversized.json(), { message: "Request body too large" }, "Oversized body stable error");
  const mockup = await request("/__mockup/private-probe");
  equal(mockup.status, 404, "Production development proxy disabled");
  equal(await mockup.json(), { message: "Not found" }, "Mockup request never falls through to upstream/SPA");
  const register = await request("/api/auth/register", { method: "POST", headers, body: JSON.stringify({ email: "startup@example.test", password: "synthetic-startup-password" }) });
  equal(register.status, 200, "Registration through real entry point");
  const cookie = register.headers.get("set-cookie")!.split(";")[0];
  const me = () => request("/api/auth/me", { headers: { Cookie: cookie, "X-Forwarded-Proto": "https" } });
  equal((await me()).status, 200, "Real entry-point session read");
  // Inject a genuine SELECT error without replacing request/session middleware.
  // Preserve every session row in the renamed backing table for recovery.
  await pool.query(`BEGIN;
    ALTER TABLE session RENAME TO session_probe_backing;
    CREATE FUNCTION session_read_probe(json) RETURNS json LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${canary}'; END $$;
    CREATE VIEW session AS SELECT sid,session_read_probe(sess) AS sess,expire FROM session_probe_backing;
    COMMIT;`);
  try {
    const failure = await me();
    equal(failure.status, 500, "Real PgStore read failure status");
    equal(await failure.json(), { message: "Internal Server Error" }, "Database details not exposed publicly");
    equal((await request("/health/live")).status, 200, "Process survives PgStore middleware failure");
  } finally {
    await pool.query("DROP VIEW session; ALTER TABLE session_probe_backing RENAME TO session; DROP FUNCTION session_read_probe(json)");
  }
  equal((await me()).status, 200, "Same cookie works after store recovers");
  await rename(resolve(publicDir, "index.html"), resolve(publicDir, "index.saved.html"));
  const missingStatic = await request("/league/test/schedule");
  equal(missingStatic.status, 404, "Static sendFile error retains status");
  equal(await missingStatic.json(), { message: "Not found" }, "Final handler sanitizes static filesystem details");
  // Flush child output and retain only a redacted diagnostic artifact.
  await stop();
  equal(logs.includes(canary), true, "Internal server log retains diagnostic canary");
  equal(logs.includes("Request failed:"), true, "Error is observable internally");
  equal(logs.includes("SYNTHETIC_INVITE_TOKEN"), false, "Error logs omit request tokens");
  equal(logs.includes("SYNTHETIC_PASSWORD_BODY"), false, "Error logs omit malformed submitted payloads");
  equal(/\[(?:startup-migration|ovr-resync|cleanup-stale-leagues|job-runner)\][^\r\n]*(?:failed|error)/i.test(logs), false, "Empty-database startup logs have no unexpected backfill/job failure");
  const safeLogs = logs.replaceAll(url.toString(), "[test database]").replaceAll(decodeURIComponent(url.password), "[redacted]");
  await writeFile(resolve(output, "server.log"), safeLogs);
  console.log(`[startup-test] PASS ${checks} assertions; actual bundled entry point with synthetic static fixture`);
} finally {
  await stop();
  await pool?.end();
  try { if (created) await admin.query(`DROP DATABASE "${name}"`); }
  finally { await admin.end(); }
}
