---
name: drizzle-kit interactive create/rename ambiguity
description: How to resolve `npm run db:push` hanging on "table created or renamed from another table?" prompts
---

`drizzle-kit push` (even with `--force`) can still block on an interactive
"Is `X` table created or renamed from another table?" prompt when it detects
a brand-new table alongside other schema changes. `--force` only skips
data-loss confirmations, not this rename-ambiguity prompt. Plain `printf
'\n' | npm run db:push` or `| npx drizzle-kit push` does NOT work — the
prompt is a raw-mode TUI (clack-style) that ignores piped stdin.

**Why:** The prompt appears even when the new table has no real relationship
to the tables it's guessing might be a rename source (e.g. it flagged a new
`game_report_images`/`game_report_corrections` table as a possible rename of
unrelated `session` / `_startup_migrations` tables based on column-shape
heuristics, not intent). It requires a real TTY/pty to accept input at all.

**How to apply:** Two working options, both confirmed to work in the tool
sandbox:
1. **Raw SQL first** — query `information_schema.tables` to confirm the
   table doesn't exist yet, then `CREATE TABLE IF NOT EXISTS ...` matching
   the Drizzle column defs (+ `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for
   new columns). Re-run `npx drizzle-kit push --force < /dev/null` after —
   once DB state matches schema, drizzle-kit sees no ambiguity.
2. **Drive it via a real pty** — spawn the command with Python's
   `pty.fork()`, read output with `os.read`/`select` in a loop, and once the
   buffered output contains the option text (e.g. `"create table"`), write
   `os.write(fd, b"\r")` to select the already-highlighted "create table"
   default and press enter. A plain subprocess pipe (no pty) will not work;
   it must be a real pty file descriptor.
