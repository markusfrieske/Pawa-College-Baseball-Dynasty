---
name: Test/scratch data bloat as a root cause of DB slowness
description: How to recognize and safely clean up runaway E2E/guest test data accumulating in the primary database.
---

## Rule
Before chasing query-level optimizations for "the app feels slow," check whether the primary database has accumulated large volumes of automated-test or guest-scratch data. In this project, ~99.9% of `leagues` rows (and their cascading `teams`/`players`/`recruits`) were leftover E2E/test/guest scratch entries — the resulting table size and lock/vacuum contention was a bigger factor than any single slow query.

**Why:** E2E test suites and guest sessions create real rows in the same database as production data, with no automatic cleanup or test-data flag. Over many runs this silently grows tables to millions of rows, causing slow scans, long autovacuum passes, and lock contention that manifests as generalized app slowness rather than one obvious bug.

**How to apply:**
- Quickly check for bloat: row counts on core tables + a name/pattern scan (e.g. leagues named "E2E..."/"test"/single-word scratch names).
- All FKs referencing `leagues.id` in this schema are `ON DELETE NO ACTION` (no automatic cascade on plain DELETE). To bulk-remove league-scoped data, use `TRUNCATE TABLE leagues CASCADE` — it cascades through the whole dependency graph regardless of the declared delete rule and is far simpler/faster than manually ordering ~24 dependent tables. It does not affect `users` (leagues reference users, not vice versa).
- `TRUNCATE ... CASCADE` needs an ACCESS EXCLUSIVE lock on every cascaded table. If a background job (e.g. a startup resync doing batched UPDATEs on `players`) is actively running, it will hold `RowExclusiveLock`s that block the TRUNCATE indefinitely even with a long statement_timeout. Find the blocking pids via `pg_locks`/`pg_stat_activity` and `pg_terminate_backend()` them before retrying.
- Always get explicit user confirmation before deleting bulk data, and prefer this only when a checkpoint/rollback safety net exists.
- Longer-term fix (not just cleanup): flag or isolate test-created data so it doesn't require manual purges again.
