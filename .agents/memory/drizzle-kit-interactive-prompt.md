---
name: drizzle-kit interactive create/rename ambiguity
description: How to resolve `npm run db:push` hanging on "table created or renamed from another table?" prompts
---

`drizzle-kit push` (even with `--force`) can still block on an interactive
"Is `X` table created or renamed from another table?" prompt when it detects
a brand-new table alongside other schema changes. `--force` only skips
data-loss confirmations, not this rename-ambiguity prompt. Piping `printf
'\n'`, `yes`, or wrapping in `script`/pty does not reliably answer this
specific clack-style prompt in the tool sandbox.

**Why:** The prompt appears even when the new table has no real relationship
to the tables it's guessing might be a rename source (e.g. it flagged a new
`game_report_images` table as a possible rename of unrelated `session` /
`_startup_migrations` tables based on column-shape heuristics, not intent).

**How to apply:** Query `information_schema.tables` directly first to see
what actually exists vs. what's in `shared/schema.ts`. If a table is
genuinely new (doesn't exist yet), just create it directly via raw SQL
(`CREATE TABLE IF NOT EXISTS ...` matching the Drizzle column defs) and add
any new columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Re-run
`npx drizzle-kit push --force < /dev/null` afterward — once the DB state
matches the schema, drizzle-kit sees no ambiguity and applies cleanly
without prompting.
