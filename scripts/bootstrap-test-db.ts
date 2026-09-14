/**
 * Provision an EMPTY disposable local test database from the shared schema,
 * then apply the numbered migrations. Never use schema push to upgrade data.
 * Usage: PAWA_TEST_DATABASE_URL=<local test URL> npm run db:bootstrap:test
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { checkMigrationVersion, runMigrations } from "../server/lib/runMigrations";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL is required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected a PostgreSQL URL");
assert(!target.search, "Connection URL overrides are forbidden for disposable tests");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test DB must be loopback");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Expected an explicitly named disposable pawa test database");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pool = new pg.Pool({ connectionString: connection });
const client = await pool.connect();
try {
  // Serialize this helper on its target database. Normal app startup and the
  // general migration runner need their separate W04 coordination contract.
  await client.query("SELECT pg_advisory_lock(hashtext('pawa:test-bootstrap'))");
  const { rows } = await client.query(
    "SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace LIMIT 1",
  );
  assert(rows.length === 0, "Refusing schema push: public schema already contains relations. Use a new empty test database.");

  const push = spawnSync(process.execPath, [
    resolve(root, "node_modules/drizzle-kit/bin.cjs"), "push", "--force",
  ], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: connection },
    stdio: "inherit",
    shell: false,
  });
  if (push.error) throw push.error;
  assert(push.status === 0, "Shared-schema bootstrap failed; discard this incomplete test database before retrying");

  const result = await runMigrations(pool);
  assert(await checkMigrationVersion(pool), "Numbered migration readiness check failed");
  console.log(`[bootstrap-test-db] applied ${result.applied.length} migrations; version=${result.version}`);
} finally {
  // Session-scoped advisory locks are released even after a failed bootstrap.
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('pawa:test-bootstrap'))");
  } finally {
    client.release();
    await pool.end();
  }
}
