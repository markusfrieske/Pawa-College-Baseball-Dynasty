# W03 batch 09 — atomic weekly coach reset

Date: September 18, 2026. Branch: codex/pawa-quality-overhaul.

Implementation: a17a4e1cd30b213c2e5be93a4df268bccc48fd15.

Normal advancement now commits the weekly coach action/readiness reset and its completed checkpoint in one execution-owned transaction. If the worker loses its lease during that stage, both gameplay changes and evidence roll back. This converts one real gameplay stage; it does not make every advance stage atomic.

## Delivered behavior

- Reset locks the live league source and validates phase/week/season against the operation, then updates only that league's scout actions, recruiting actions and readiness. Coach XP and foreign leagues are untouched.
- Reset effects and reset_actions:100 use the same PostgreSQL client/transaction under the existing lease and original-deadline checks. Failed, suppressed or expired checkpoint writes cannot leave committed coach resets.
- A previously completed reset is a no-op, preserving coach activity performed after the first successful stage commit. Normal advance receives an explicit atomic reset callback and publishes progress only after commit.
- Validated inherited reset evidence bypasses the already-passed human readiness gate and deadline auto-ready/CPU-fill prelude. Without this change, a later failure would leave coaches not-ready and prevent recovery, or an expired deadline would re-ready them before the inherited reset was skipped.
- Force-advance refuses unfinished recovery before changing readiness, recruiting or audit records, and points the commissioner to normal Advance. Changed-source reconciliation remains a separate refusal.
- Fast-forward retains its existing reset fallback and is not claimed to have this durable-stage guarantee. The loaded coach snapshot remains available to the later simulation/XP code.

## Actual live-worker drill

The expanded [HTTP regression](../../scripts/verify-reported-results.ts) invokes [verify-advance-reset.ts](../../scripts/verify-advance-reset.ts) through real authenticated commissioner requests.

Worker A receives a short original lease from a test-only trigger before entering reset. A is then observed waiting inside the actual coach UPDATE at a held PostgreSQL advisory barrier. After its original lease expires, concurrent HTTP worker B is observed waiting on A's lease row. Releasing A causes its reset transaction to roll back. A returns an ownership conflict.

B takes over through the real route and atomic handoff, then pauses at its own initialization checkpoint so the test can inspect the state before B performs gameplay work. Every coach reset field and the calendar remain unchanged; neither operation claims reset completion. B then proceeds, commits the reset and checkpoint, and advances once. Both requests are live in the same HTTP process; this specifically exercises same-process stale callback/cleanup ownership.

These are game-free regular-season fixtures with two human-team coach rows. They prove authenticated commissioner advancement, readiness recovery and reset-stage concurrency under both reported/simulated mode flags. They do not prove played-game integration, two human-coach login journeys, all stages, cross-process takeover or the entire season pipeline.

## Verification

Implementation verification passes **61 PostgreSQL helper/stage assertions**, **1,125 real HTTP/PostgreSQL assertions** and full TypeScript. Tests include:

- Positive normal reset in reported and simulated leagues.
- Coach-write failure, checkpoint exception and suppressed checkpoint rollback.
- Original source mismatch, zero coaches, foreign-league preservation and unchanged XP.
- Repeated completed reset preserving newly spent actions.
- Failure after committed reset followed by real retry, with and without an expired deadline.
- Force-advance recovery refusal with an unchanged full database snapshot.
- Observed live A/B reset takeover and retained predecessor/successor history.

The independent run also passes **61 PostgreSQL helper/reset assertions**, **1,125 HTTP/PostgreSQL assertions** and **129 configured unit tests**. Verdict: **bounded PASS**, recorded with findings in the [audit](audits/W03_BATCH_09_AUDIT.md). Existing batch08 metadata expiry/heartbeat/race checks remain included. Original finding statuses remain unchanged.

Cleanup verified: only the baseline synthetic database remained after owned random fixtures were removed. The owned PostgreSQL process stopped and port 55432 refused connections. The art preview remained listening on port 49744.

## Next production step and limits

TI-08/TI-09 remain implementing. Move recruit-stage progression and the remaining recruiting/storyline/game/phase effects into owned transactional stages with durable evidence, then repeat live-worker interruption drills at those boundaries. Other coach writers, background digests, fast-forward operation history, changed-state reconciliation, chronological rest and history-safe restoration remain open.

The success of this reset stage does not justify closing whole-advance lease safety or exactly-once findings. No merge, deployment, production data or art change occurred.
