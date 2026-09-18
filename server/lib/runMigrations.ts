/**
 * Numbered SQL migration runner.
 *
 * Reads *.sql files from server/migrations/ in alphabetical order and applies
 * each one exactly once, recording the result in db_schema_migrations.
 * Safe to call multiple times — already-applied migrations are skipped.
 *
 * Each migration runs inside a single transaction.  If any statement fails
 * with an unexpected error the transaction is rolled back and the migration
 * key is NOT recorded, so the runner will retry on the next startup.
 * Expected duplicates must be guarded in SQL. Unexpected errors are never
 * swallowed: PostgreSQL aborts the transaction after a failed statement.
 */

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Pool } from "pg";

/**
 * Resolve the migrations directory in a way that works for both:
 *   - Development (tsx / ESM): import.meta.url is populated.
 *   - Production build (esbuild CJS): import.meta is {} so .url is undefined;
 *     fall back to process.cwd() + /server/migrations which matches the
 *     project root when running `node dist/index.cjs`.
 */
const MIGRATIONS_DIR = (() => {
  try {
    const metaUrl = import.meta.url;
    if (metaUrl) {
      return join(dirname(fileURLToPath(metaUrl)), "../migrations");
    }
  } catch {
    // no-op — import.meta unavailable in CJS output
  }
  return join(process.cwd(), "server/migrations");
})();

/**
 * The last migration file key that must be present before /health/ready returns 200.
 * Update this whenever a new migration file is added.
 */
export const EXPECTED_MIGRATION = "0054_postseason_coach_awards";

export async function runMigrations(pool: Pool): Promise<{ applied: string[]; version: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("SET lock_timeout = '30s'");

    await client.query(`
      CREATE TABLE IF NOT EXISTS db_schema_migrations (
        migration_key text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);

    const { rows: existing } = await client.query<{ migration_key: string }>(
      "SELECT migration_key FROM db_schema_migrations ORDER BY migration_key"
    );
    const applied = new Set(existing.map((r) => r.migration_key));

    let files: string[];
    try {
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch (err) {
      // An unreadable/missing migration directory is always fatal — do NOT
      // silently return { version: null }.  Caller must not bind the port.
      throw new Error(
        `[migration] Cannot read migrations directory "${MIGRATIONS_DIR}": ${(err as Error).message}`
      );
    }

    const newlyApplied: string[] = [];

    for (const file of files) {
      const key = file.replace(/\.sql$/, "");
      if (applied.has(key)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");

      // Run each migration inside a transaction so a partial failure rolls back
      // and the key is never recorded as applied.
      await client.query("BEGIN");
      try {
        // Let PostgreSQL parse the complete file, including dollar-quoted DO
        // blocks, strings and comments containing semicolons. Migration files
        // must not contain transaction-control statements; this runner owns it.
        await client.query(sql);

        await client.query(
          "INSERT INTO db_schema_migrations (migration_key) VALUES ($1) ON CONFLICT DO NOTHING",
          [key]
        );
        await client.query("COMMIT");
        newlyApplied.push(key);
        console.log(`[migration] applied ${key}`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`[migration] ${key}: failed — rolled back:`, e);
        // Re-throw so the caller knows migrations did not fully complete.
        throw e;
      }
    }

    const { rows: latest } = await client.query<{ migration_key: string }>(
      "SELECT migration_key FROM db_schema_migrations ORDER BY migration_key DESC LIMIT 1"
    );
    const version = latest[0]?.migration_key ?? null;

    return { applied: newlyApplied, version };
  } finally {
    client.release();
  }
}

export async function checkMigrationVersion(pool: Pool): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ migration_key: string }>(
      "SELECT migration_key FROM db_schema_migrations WHERE migration_key = $1",
      [EXPECTED_MIGRATION]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
