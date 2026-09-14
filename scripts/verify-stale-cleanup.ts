/** Real PostgreSQL regression for automatic and manual-helper save preservation.
 * Requires PAWA_TEST_DATABASE_URL on loopback with CREATE DATABASE permission.
 * Creates and drops only its own random database; never uses DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { cleanupStaleLeagues } from "../server/lib/cleanupStaleLeagues";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected PostgreSQL URL");
assert(!target.search && !target.hash, "Connection URL overrides are forbidden");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test cluster must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected named disposable test database");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = `pawa_test_cleanup_${randomUUID().replaceAll("-", "")}`;
assert(/^pawa_test_cleanup_[a-f0-9]{32}$/.test(name));
const url = new URL(connection);
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: connection });
let pool: pg.Pool | undefined;
let created = false;
let checks = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label); checks++;
}

async function command(script: string, args: string[] = [], expectedCode = 0) {
  const code = await new Promise<number | null>((done, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: root, windowsHide: true, stdio: "ignore",
      env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString(), DATABASE_URL: url.toString() },
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Owned test command timed out")); }, 60_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", result => { clearTimeout(timer); done(result); });
  });
  equal(code, expectedCode, `${script} ${args.join(" ")} exit`);
}

async function snapshot(excludeOldTest = false) {
  const result: Record<string, unknown> = {};
  result.users = (await pool!.query("SELECT * FROM users ORDER BY id")).rows;
  for (const [table, column] of [["leagues", "id"], ["teams", "league_id"], ["league_events", "league_id"]]) {
    result[table] = (await pool!.query(`SELECT * FROM ${table} ${excludeOldTest ? `WHERE ${column} NOT LIKE '%-old-test'` : ""} ORDER BY id`)).rows;
  }
  return result;
}

try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  pool = new pg.Pool({ connectionString: url.toString() });
  await command("scripts/bootstrap-test-db.ts");
  for (const kind of ["guest", "normal"]) {
    await pool.query("INSERT INTO users (id,email,password) VALUES ($1,$2,'synthetic-no-login')", [kind, kind === "guest" ? "guest-cleanup@guest.local" : "cleanup@example.test"]);
    for (const variant of ["old-save", "old-active-save", "young-save", "old-test", "young-test"]) {
      const id = `${kind}-${variant}`;
      const age = variant.startsWith("old") ? "30 days" : "1 hour";
      await pool.query("INSERT INTO leagues (id,name,commissioner_id,is_test_data,created_at,game_mode) VALUES ($1,$1::varchar,$2,$3,now()-$4::interval,$5)", [id, kind, variant.endsWith("test"), age, kind === "guest" ? "simulated" : "reported"]);
      await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state) VALUES ($1,$2,'Save team','Owls','OWL','Test','IA')", [`${id}-team`, id]);
      await pool.query("INSERT INTO league_events (id,league_id,team_id,event_type,description,created_at) VALUES ($1,$2,$3,'game_result','Synthetic completed game',now()-$4::interval)", [`${id}-event`, id, `${id}-team`, variant === "old-active-save" ? "1 minute" : age]);
    }
  }
  const before = await snapshot();
  const preserved = await snapshot(true);
  const expectedIds = ["guest-old-test", "normal-old-test"];
  const dry = await cleanupStaleLeagues(pool, { dryRun: true });
  equal(dry.leagueIds.sort(), expectedIds, "Dry run targets only old explicitly flagged fixtures");
  equal([dry.leagueCount, dry.teamCount, dry.dryRun], [2, 2, true], "Dry run counts fixtures accurately");
  equal(await snapshot(), before, "Dry run preserves every fixture and real save");
  await command("scripts/cleanup-test-leagues.ts", ["--dry-run", "--test-hours=2"]);
  equal(await snapshot(), before, "Manual custom-age dry run preserves data");
  await command("scripts/cleanup-test-leagues.ts", ["--guest-days=3"], 1);
  equal(await snapshot(), before, "Removed guest-age CLI option is refused without deletion");
  for (const hours of [0, -1, NaN, Infinity]) {
    await assert.rejects(cleanupStaleLeagues(pool, { testDataMaxAgeHours: hours }), /positive finite/); checks++;
  }
  equal(await snapshot(), before, "Invalid retention values preserve data");
  const removed = await cleanupStaleLeagues(pool);
  equal(removed.leagueIds.sort(), expectedIds, "Default automatic helper deletes only old test fixtures");
  equal([removed.leagueCount, removed.teamCount, removed.dryRun], [2, 2, false], "Default helper returns deleted fixture counts");
  equal(await snapshot(), preserved, "Old, recently active and young guest/normal saves and dependents remain byte-for-byte equivalent; young tests remain");
  equal((await cleanupStaleLeagues(pool)).leagueCount, 0, "Repeat cleanup is idempotent");
  // Exercise actual manual deletion separately with an aged, explicit fixture.
  await pool.query("UPDATE leagues SET created_at=now()-interval '30 days' WHERE id='normal-young-test'");
  await command("scripts/cleanup-test-leagues.ts", ["--test-hours=2"]);
  equal((await pool.query("SELECT id FROM leagues ORDER BY id")).rows.map(row => row.id), ["guest-old-active-save", "guest-old-save", "guest-young-save", "guest-young-test", "normal-old-active-save", "normal-old-save", "normal-young-save"], "Manual custom-age deletion preserves all unflagged saves and remaining young test");
  equal((await pool.query("SELECT count(*)::int AS count FROM teams")).rows[0].count, 7, "Manual deletion removes only fixture team");
  equal((await pool.query("SELECT count(*)::int AS count FROM league_events")).rows[0].count, 7, "Manual deletion removes only fixture history");
  console.log(`[stale-cleanup-test] PASS ${checks} assertions; real PostgreSQL save preservation and explicit-test-only deletion`);
} finally {
  await pool?.end();
  try {
    if (created) {
      assert(/^pawa_test_cleanup_[a-f0-9]{32}$/.test(name));
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}
