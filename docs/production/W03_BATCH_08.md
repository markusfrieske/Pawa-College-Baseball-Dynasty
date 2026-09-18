# W03 batch 08 — checkpoint and operation ownership

Date: September 17, 2026 (America/Denver; September 18 UTC). Branch: codex/pawa-quality-overhaul.

Implementation: ab4066f302f88d24c28abda420c0d2910dc67a92.

An old execution no longer looks up a newer execution's checkpoint writer by league ID. Checkpoints, heartbeat renewal, terminal status and successor creation now require the execution's own live database lease. This is a bounded metadata milestone: gameplay writes inside an already-running stage are not yet fenced.

## Delivered behavior

- The engine receives an explicit progress callback bound to one immutable league/operation/token identity. Fast-forward calls without that callback cannot accidentally borrow the normal advance writer.
- Progress publishes only after its checkpoint succeeds. Each execution has its own cleanup handle; a late old callback or finally block cannot replace or erase a successor's progress.
- Metadata transactions lock the league lease row before the operation row, then check ownership and real database time. Original expiry deadlines are checked again after the write, including renewals, so delayed SQL cannot hide expiration by extending its own deadline.
- Heartbeat renews the operation and league leases atomically. An expired operation cannot resurrect itself through a still-live league lease, and an expired league lease cannot be revived through its operation.
- Handoff verifies the live league owner inside the same transaction as predecessor retirement and successor insertion. Terminal failure/completion is refused after ownership loss. Failure-write uncertainty still retains the lease for recovery.

Implementation files: [execution metadata](../../server/lib/advance-execution.ts), [owned progress](../../server/lib/advance-progress.ts), [handoff](../../server/lib/advance-recovery.ts), and [normal advance integration](../../server/routes/simulation.ts).

## Evidence

[verify-advance-execution.ts](../../scripts/verify-advance-execution.ts) creates a randomly named local PostgreSQL database using the real bootstrap, runs the real helpers, and removes only its owned database.

It tests a paused old async callback resumed after successor registration, stale heartbeat/completion/failure rejection, caller mutation of identity, scoped UI cleanup, independent league/operation expiry, slow SQL crossing either original deadline, row-lock acquisition after expiry and a checkpoint SQL takeover race. The latter observes the old checkpoint UPDATE inside the fixture trigger through pg_stat_activity before attempting takeover. These are live helper/SQL interleavings, not an end-to-end live gameplay-worker drill.

The existing HTTP/report/recovery suite passes **1,078 assertions**, including the prior actual process-kill and phase-flip containment drills. The final full TypeScript check passes. The independent run passes **47 PostgreSQL metadata assertions** and **129 configured unit tests**. Verdict: **bounded PASS**, recorded in the [audit](audits/W03_BATCH_08_AUDIT.md). Original finding statuses remain unchanged.

Run npm run test:advance-execution with the same explicit loopback test database and create-database role used by the other DB gates. It is included in release:gate. No production data or external game service is used.

Cleanup verified: all owned random fixture databases were removed, the baseline synthetic database was preserved, and the owned PostgreSQL process was stopped with no listener on port 55432. The existing art preview on port 49744 remained running.

## Review corrections

Independent review found two expiry-resurrection gaps in the first helper draft: operation renewal could hide an expired original operation deadline, and league renewal could hide a deadline crossed during delayed SQL. Captured original deadlines and post-write validation now roll back the entire metadata transaction in both cases. The test also now observes the in-flight SQL wait rather than inferring it from a fixed delay.

## Limits and next milestone

TI-08 and TI-09 remain implementing. A superseded worker can still finish gameplay effects within an already-running stage before reaching its next checkpoint. Required next work is transactionally fencing those effects together with their stage evidence, plus an actual live gameplay-worker takeover drill. Background digest effects, quick-simulation durable step tracking, changed-state reconciliation, chronological rest, other achievement writers and history-safe restore remain open.

The existing client progress label vocabulary differs from some engine stage names; this pre-existing presentation issue is recorded for the shared progress UI pass. This milestone does not certify production UI, full media builds, human enjoyment or a finished recovery system.
