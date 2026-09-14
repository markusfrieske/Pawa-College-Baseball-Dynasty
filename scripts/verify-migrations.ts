/**
 * W01 migration regression gate, using real disposable PostgreSQL databases.
 * Run: tsx scripts/verify-migrations.ts
 * PAWA_TEST_DATABASE_URL must name an existing loopback test database whose role
 * can CREATE DATABASE. Never falls back to DATABASE_URL. Each case creates its
 * own random database; cleanup drops only databases successfully created here.
 * This verifies the numbered runner, not asynchronous application backfills,
 * concurrent startup, or an upgrade from a production snapshot.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations, checkMigrationVersion, EXPECTED_MIGRATION } from "../server/lib/runMigrations";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected PostgreSQL URL");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test cluster must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected explicitly named disposable test database");
assert(!target.search, "Connection URL overrides are forbidden in this disposable gate");

const admin = new pg.Pool({ connectionString: connection });
const owned = new Set<string>();
const expected = (await readdir(resolve(root, "server/migrations")))
  .filter(file => file.endsWith(".sql")).sort().map(file => file.slice(0, -4));
assert.equal(expected.at(-1), EXPECTED_MIGRATION, "Readiness key must match last numbered migration");
let assertions = 0;
function equal(actual: unknown, wanted: unknown, message: string) {
  assert.deepEqual(actual, wanted, message);
  assertions++;
}

function redact(output: string, url: string): string {
  const password = decodeURIComponent(new URL(url).password);
  let safe = output.split(url).join("[test database]")
    .replace(/postgres(?:ql)?:\/\/[^\s'\"]+/gi, "[test database]");
  if (password) safe = safe.split(password).join("[redacted]");
  return safe.slice(-5000);
}

async function command(args: string[], url: string, label: string, expectedCode = 0): Promise<string> {
  const result = await new Promise<{ code: number | null; output: string }>((done, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url, PAWA_TEST_DATABASE_URL: url, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("close", code => done({ code, output }));
  });
  equal(result.code, expectedCode, `${label}: unexpected exit code; ${redact(result.output, url)}`);
  return result.output;
}

const bootstrap = [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts/bootstrap-test-db.ts")];
async function baseline(url: string) {
  await command([resolve(root, "node_modules/drizzle-kit/bin.cjs"), "push", "--force"], url, "Empty owned schema push");
}

async function database(label: string, work: (pool: pg.Pool, url: string) => Promise<void>) {
  const name = `pawa_test_migrations_${randomUUID().replaceAll("-", "")}`;
  assert(/^pawa_test_migrations_[0-9a-f]{32}$/.test(name));
  await admin.query(`CREATE DATABASE "${name}"`);
  owned.add(name);
  const url = new URL(connection!);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    console.log(`[migration-test] ${label}`);
    await work(pool, url.toString());
    console.log(`[migration-test] PASS ${label}`);
  } finally {
    await pool.end();
  }
}

async function ledger(pool: pg.Pool) {
  return (await pool.query("SELECT migration_key, applied_at::text FROM db_schema_migrations ORDER BY migration_key")).rows;
}

async function fixture(pool: pg.Pool, orphan = false) {
  await pool.query("INSERT INTO users (id,email,password) VALUES ('migration-user','migration@example.test','synthetic-no-login')");
  await pool.query("INSERT INTO recruiting_class_projects (id,owner_user_id,name) VALUES ('migration-project','migration-user','Preserve this class')");
  await pool.query("INSERT INTO recruiting_class_versions (id,project_id,version_number,package_json,content_hash) VALUES ('migration-version','migration-project',1,$1,'synthetic-hash')", [JSON.stringify({ name: "Synthetic class", prospects: [] })]);
  await pool.query("INSERT INTO recruiting_class_shares (id,user_id,version_id,label) VALUES ('migration-share','migration-user',$1,'Preserve this share')", [orphan ? "missing-version" : "migration-version"]);
}

async function snapshot(pool: pg.Pool) {
  const tables = ["users", "recruiting_class_projects", "recruiting_class_versions", "recruiting_class_shares"];
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    result[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`)).rows;
  }
  return result;
}

async function fkCount(pool: pg.Pool) {
  return Number((await pool.query("SELECT count(*) FROM pg_constraint WHERE conname='fk_rcs_version_id' AND conrelid='recruiting_class_shares'::regclass AND contype='f'")).rows[0].count);
}

async function fkBehavior(pool: pg.Pool) {
  equal(await fkCount(pool), 1, "Exactly one target-table version foreign key");
  await assert.rejects(
    pool.query("UPDATE recruiting_class_shares SET version_id='unmatched-version' WHERE id='migration-share'"),
    (error: unknown) => (error as { code?: string }).code === "23503",
    "Foreign key must reject an orphan reference",
  );
  assertions++;
  await pool.query("DELETE FROM recruiting_class_versions WHERE id='migration-version'");
  equal((await pool.query("SELECT version_id,label FROM recruiting_class_shares WHERE id='migration-share'")).rows,
    [{ version_id: null, label: "Preserve this share" }], "Deleting version preserves share and sets reference null");
}

try {
  const overridden = new URL(connection);
  overridden.search = "?host=127.0.0.1&port=1";
  for (const script of ["bootstrap-test-db.ts", "verify-production-access.ts", "verify-migrations.ts"]) {
    const output = await command(
      [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts", script)],
      overridden.toString(), `${script} refuses connection overrides`, 1,
    );
    equal(output.includes("Connection URL overrides are forbidden"), true, "Override must be rejected before database work");
  }
  console.log("[migration-test] PASS connection override rejection in all three test entry points");

  await database("fresh bootstrap, readiness, preserved repeat and nonempty refusal", async (pool, url) => {
    equal(await checkMigrationVersion(pool), false, "Empty DB is not migration ready");
    await command(bootstrap, url, "Fresh bootstrap helper");
    const firstLedger = await ledger(pool);
    equal(firstLedger.map(row => row.migration_key), expected, "Fresh bootstrap records every migration");
    equal(await checkMigrationVersion(pool), true, "Completed numbered migrations are ready");
    await fixture(pool);
    const before = await snapshot(pool);
    equal(await runMigrations(pool), { applied: [], version: EXPECTED_MIGRATION }, "Repeat is a complete no-op");
    equal(await ledger(pool), firstLedger, "Repeat preserves migration timestamps");
    equal(await snapshot(pool), before, "Repeat preserves all synthetic fixture data");
    await command(bootstrap, url, "Bootstrap refuses populated database", 1);
    equal(await ledger(pool), firstLedger, "Refused bootstrap preserves ledger");
    equal(await snapshot(pool), before, "Refused bootstrap preserves data");
    await fkBehavior(pool);
  });

  await database("pre-existing target FK without migration ledger", async (pool, url) => {
    await baseline(url);
    await fixture(pool);
    await pool.query("ALTER TABLE recruiting_class_shares ADD CONSTRAINT fk_rcs_version_id FOREIGN KEY (version_id) REFERENCES recruiting_class_versions(id) ON DELETE SET NULL");
    const before = await snapshot(pool);
    equal((await runMigrations(pool)).applied, expected, "All unapplied migrations complete with pre-existing FK");
    equal(await snapshot(pool), before, "Compatibility migration preserves existing synthetic data");
    await fkBehavior(pool);
  });

  await database("orphan rollback, table-scoped constraint guard and repaired retry", async (pool, url) => {
    await baseline(url);
    await fixture(pool, true);
    await pool.query("CREATE TABLE migration_other_table (id integer CONSTRAINT fk_rcs_version_id CHECK (id > 0))");
    const before = await snapshot(pool);
    await assert.rejects(runMigrations(pool),
      (error: unknown) => (error as { code?: string }).code === "23503",
      "Orphan must abort 0032 despite same-named constraint on another table");
    assertions++;
    const previousLedger = await ledger(pool);
    equal(previousLedger.map(row => row.migration_key), expected.slice(0, 2), "Only prior successful migrations remain recorded");
    equal(await checkMigrationVersion(pool), false, "Failed bootstrap is not ready");
    equal(await fkCount(pool), 0, "Failed FK creation is rolled back");
    equal((await pool.query("SELECT to_regclass('public.idx_recruiting_class_projects_owner') AS earlier_index")).rows[0].earlier_index,
      null, "0032 index created before failing FK rolls back too");
    equal(await snapshot(pool), before, "Failed migration preserves orphan and other existing data");
    // Repair only our synthetic invalid reference, then retry through the real runner.
    await pool.query("UPDATE recruiting_class_shares SET version_id='migration-version' WHERE id='migration-share'");
    const repaired = await snapshot(pool);
    equal((await runMigrations(pool)).applied, expected.slice(2), "Retry resumes at first unrecorded migration");
    equal((await ledger(pool)).slice(0, 2), previousLedger, "Retry preserves earlier successful ledger records");
    equal(await snapshot(pool), repaired, "Successful retry preserves repaired fixture data");
    equal(await checkMigrationVersion(pool), true, "Successful retry restores numbered readiness");
    await fkBehavior(pool);
  });
  console.log(`[migration-test] PASS ${assertions} assertions across three isolated databases`);
} finally {
  const failures: Error[] = [];
  for (const name of owned) {
    try {
      // Names are generated here, validated before CREATE, and never read from user input.
      await admin.query(`DROP DATABASE "${name}"`);
      owned.delete(name);
    } catch {
      failures.push(new Error(`Could not remove owned test database ${name}; inspect local cluster`));
    }
  }
  await admin.end();
  if (failures.length) throw new AggregateError(failures, "Owned migration-test database cleanup failed");
}
