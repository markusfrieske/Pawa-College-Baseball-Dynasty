---
name: Startup DB lock contention
description: Parallel ALTER TABLE queries at startup exhaust the pg pool and crash the server — must be sequential on a dedicated client with scoped lock_timeout.
---

## Rule
The startup block in `server/index.ts` runs ~24 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` DDL queries. These must run **sequentially on a single dedicated client** with `lock_timeout` scoped to that session only.

**Why sequential:** PostgreSQL's default pool size is 10. Running 24 DDL queries in parallel means 14 queue for a free connection. If autovacuum holds an `AccessExclusiveLock` on `players`, the 10 in-flight connections all wait for the lock. The 14 queued connections then time out waiting for a free pool slot, crashing the server with `EADDRINUSE` on the next restart attempt.

**Why dedicated client with scoped lock_timeout:** Setting `lock_timeout` on the pool (via `options: "-c lock_timeout=30s"`) applies to ALL connections. When a startup ALTER TABLE waits for autovacuum's lock, any concurrent API call (e.g. `startDynasty` inserting players) also queues behind it and will hit the same lock_timeout — failing the API call and breaking e2e tests.

**Correct pattern:**
```typescript
const _ddlClient = await pool.connect();
try {
  await _ddlClient.query("SET lock_timeout = '30s'");
  for (const sql of _columnMigrations) {
    try { await _ddlClient.query(sql); } catch (e) { console.warn(...); }
  }
} finally {
  _ddlClient.release();
}
```

**How to apply:**
- Any new startup DDL must be added to the sequential loop in `server/index.ts`.
- Do NOT add `lock_timeout` to the pool config in `server/db.ts` — it breaks API queries under lock contention.
- Do NOT add `connectionTimeoutMillis` to the pool — it causes pool-exhaustion timeouts when many queries queue simultaneously.
- If the server hangs at startup (no port 5000 output): check `pg_locks` for ungranted `AccessExclusiveLock` on `players`; wait for autovacuum to finish or cancel it with `SELECT pg_cancel_backend(pid)`.
