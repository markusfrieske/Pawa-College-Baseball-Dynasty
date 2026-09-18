# W03 batch 04 - durable coach effects and required-result failures

Date: September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: 6640dd570eac949777af7a28e02c2813c4006fb3.

Atomic game finalization now persists coach XP and records with the accepted game, including callers that supply the old batch accumulator. A process restart before a later XP flush cannot discard those rewards. Required rivalry failures roll back acceptance. The [independent audit](audits/W03_BATCH_04_AUDIT.md) evaluates this bounded milestone; TI-08 and TI-09 remain implementing.

## Delivered behavior

- Migration 0053 adds one durable coach contribution per game/coach, linked to the finalization receipt. It records actual XP, record and skill-point deltas plus observed before/after coach state. Existing receipts receive no invented contributions. Effects are application append-only; this table has no database immutability trigger.
- Atomic callers persist coach changes inside the result transaction and leave the legacy accumulator untouched. Current team assignments are read inside that transaction; coach rows lock in stable ID order. Tactician/conference bonuses and every gained level's skill point apply consistently.
- A transaction-scoped league advisory lock serializes participating finalizers across different games, protecting read/modify/write coach, standings and player-stat totals. This does not order games by their scheduled chronology or coordinate every other writer of those tables.
- Rivalries retain cumulative regular-season runs, latest scores and largest win margins. Rivalry failures propagate so required game effects commit together or roll back.
- Initial report creation and atomic finalization acquire a shared league lock before the game lock, coordinating with restore's exclusive league lock. Stale prepared schedule fields and completed games without a matching receipt fail closed.
- Restore refuses current or target report-bearing/played states, including receipt/effect evidence without a complete-game flag. This prevents the old snapshot format from discarding durable history. Safe restoration of a played league remains an open W04 requirement.
- Regular, exhibition and conference advancement now propagate required finalizer failures. Exhibitions no longer set completion before finalization; sequential exhibition writes finish or fail before the caller can release its lease. This is source-reviewed containment, not a certified crash-resumable advance workflow.

## Audit-driven repair

The expanded effect-bearing league-deletion fixture exposed an existing foreign-key failure: coach rivalries were removed after coaches. Cleanup now deletes the target league's rivalries first. The regression retains unrelated league/user checks; it does not certify every mature-league deletion combination.

## Verification

- Real HTTP/PostgreSQL: **714 assertions passed**, independently repeated against the final implementation. Covers populated migration upgrade, durable coach effects before batch flush, restart/replay, concurrent same-coach and first-season standings/player totals, rivalry records, effect/rivalry fault rollback, skipped/exhibition effects, restore refusal and effect-bearing league deletion with unrelated-state preservation.
- Configured unit suite: **129 passed** independently.
- TypeScript: full project plus both report/history regression scripts passed after final source repair.
- All owned report fixture databases and HTTP children were cleaned. The local PostgreSQL fixture is stopped with no listener on port 55432; baseline data was preserved.
- The 42 original finding IDs, readable statuses and linked evidence remain consistent. No client UI changed; prior component evidence does not substitute for full-page or full-media release verification. The complete [media/build release gate](BUILD_PREREQUISITES.md) remains open.

## Next production step and limits

Implement durable postseason milestone awards and exercise the actual advance/checkpoint route under required-write failure, process restart and retry. Then extend per-player/standings contributions and reconciliation, identity-bearing simulated results, and history-safe mature-league restoration. Keep evidence/authority/roster snapshots and authorized amendments in the existing W03 contract.

Legacy non-atomic finalization helpers remain exported for compatibility/tests; audited production call sites use the atomic path. External coach purchases, resets and postseason achievement writers are outside its locking protocol. Doubleheader simulation inputs and pitcher-rest chronology still require W05 work; advisory serialization alone does not fix historical order. No merge, deployment or production-data operation occurred.
