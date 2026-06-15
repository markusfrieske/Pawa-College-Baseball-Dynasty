---
name: Startup DB lock contention
description: Parallel ALTER TABLE queries at startup exhaust the pg pool and crash the server — must be sequential.
---

## Rule
The startup block in `server/index.ts` runs ~24 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` DDL queries. These must run **sequentially** (for...of), not in parallel (`Promise.allSettled`).

**Why:** PostgreSQL's default pool size is 10. Running 24 DDL queries in parallel means 14 queue for a free connection. If autovacuum holds an `AccessExclusiveLock` on `players`, the 10 in-flight connections all wait for the lock. The 14 queued connections then time out waiting for a free pool slot, crashing the server with `EADDRINUSE` on the next restart attempt (old process still alive).

**How to apply:**
- Any new startup DDL must be added to the sequential `for...of` loop in `server/index.ts`, not fired in parallel.
- The pool has `options: "-c lock_timeout=30s"` so DDL that waits >30s for a lock fails fast with `55P03` instead of hanging forever. This is acceptable — the `IF NOT EXISTS` makes all these queries idempotent; one failure just means that column addition retries next startup.
- Do NOT add `connectionTimeoutMillis` to the pool — it causes pool-exhaustion timeouts when many queries queue simultaneously.
- If the server ever hangs (no port 5000 output): check `pg_locks` for ungranted `AccessExclusiveLock` on `players`; wait for autovacuum to finish or cancel it with `SELECT pg_cancel_backend(pid)`.
