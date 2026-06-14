---
name: Startup DB lock contention
description: ALTER TABLE players in Promise.allSettled can queue behind autovacuum AccessExclusiveLock, silently hanging the server startup.
---

## Rule
`ALTER TABLE players ADD COLUMN IF NOT EXISTS ...` in the startup `Promise.allSettled` block requires an `AccessExclusiveLock`. If PostgreSQL's autovacuum worker (or any background process) holds a conflicting lock on the `players` table at startup time, all 30+ ALTER TABLE queries will queue silently — the server produces zero output and never opens port 5000.

**Why:** PostgreSQL background workers (autovacuum, DataFileRead I/O) hold row/page-level locks that conflict with DDL AccessExclusiveLock. No error is thrown; queries just wait.

**How to apply:**
- When the server hangs silently at startup (no output, port 5000 never opens), check `pg_locks` for ungranted `AccessExclusiveLock` on `players`.
- The fix is to wait for autovacuum to finish (resolves in 1-3 min) or run `SELECT pg_cancel_backend(pid)` on the blocking autovacuum PID.
- Adding `lock_timeout` or `statement_timeout` to the pool would cause the startup migrations to fail instead of hang indefinitely.
- A `connectionTimeoutMillis` on the pool would be a useful safeguard.
