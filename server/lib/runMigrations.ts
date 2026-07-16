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
 * Only truly idempotent SQL errors (e.g. "already exists") are tolerated.
 */

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "../migrations");

/**
 * The last migration file key that must be present before /health/ready returns 200.
 * Update this whenever a new migration file is added.
 */
export const EXPECTED_MIGRATION = "0037_sequential_ddl";

/**
 * Errors that are safe to swallow — the statement was idempotent.
 * Only covers CREATE/INDEX "already exists" and unique-constraint "duplicate key".
 * "does not exist" is intentionally NOT in this list: FK resolution failures must
 * abort the migration, not be silently skipped.
 */
function isIdempotentError(msg: string): boolean {
  return msg.includes("already exists") || msg.includes("duplicate key");
}

/**
 * Splits a SQL file into individual statements, handling multi-line CREATE TABLE
 * blocks with balanced parentheses and skipping SQL comments.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === stringChar && next !== stringChar) inString = false;
      else if (ch === stringChar && next === stringChar) { current += next; i++; }
      continue;
    }

    if (ch === "-" && next === "-") { inLineComment = true; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (ch === "'" || ch === '"') { inString = true; stringChar = ch; current += ch; continue; }

    if (ch === "(") depth++;
    if (ch === ")") depth--;

    if (ch === ";" && depth === 0) {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = "";
    } else {
      current += ch;
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0) statements.push(remaining);
  return statements;
}

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
    } catch {
      return { applied: [], version: null };
    }

    const newlyApplied: string[] = [];

    for (const file of files) {
      const key = file.replace(/\.sql$/, "");
      if (applied.has(key)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
      const statements = splitSqlStatements(sql);

      // Run each migration inside a transaction so a partial failure rolls back
      // and the key is never recorded as applied.
      await client.query("BEGIN");
      try {
        for (const stmt of statements) {
          try {
            await client.query(stmt);
          } catch (e: unknown) {
            const msg = (e as { message?: string }).message ?? "";
            if (isIdempotentError(msg)) {
              // Safe to ignore — IF NOT EXISTS / duplicate guard already fired.
              continue;
            }
            // Unexpected error — abort this migration.
            throw e;
          }
        }

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
