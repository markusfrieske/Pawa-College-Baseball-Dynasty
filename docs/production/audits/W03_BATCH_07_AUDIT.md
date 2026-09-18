# W03 batch 07 independent interrupted-advance recovery audit

Date: September 17, 2026 (America/Denver; September 18 UTC). Review lenses: Gilfoyle transaction/recovery integrity, Gibs process-interruption QA and Passan preservation of official season state. Audit ownership is separate from implementation and fixture authorship.

**Verdict: pass for bounded interrupted-advance containment and checkpoint handoff.** Independent repetition passed all **1,078 HTTP/PostgreSQL assertions** and **129 configured unit tests** against the final source. This does not certify whole-advance exactly-once behavior or automatic repair of a partially committed transition. See the [milestone record](../W03_BATCH_07.md).

## Required safe contract

| Severity | Reproduction and impact | Acceptance |
| --- | --- | --- |
| P1 | The engine changes phase/week/season, then dies before recording completion. Retry imports old checkpoints into the new state or runs the next phase as though the interrupted transition completed. | An unsettled prior operation with a different source identity produces durable, repeatable recovery-required refusal. No silent continuation into the new phase, no invented completed operation and no reset of progressed downstream brackets. |
| P1 | An old failed attempt is followed by a successful retry, but a naive recovery fence treats every historical failed row as unresolved forever. | A later completed retry of the exact same source identity settles earlier failed attempts. Completion in a different phase/season/week is insufficient evidence. |
| P1 | Failure-status persistence itself fails, the lease is released, and a subsequent running-row uniqueness conflict returns success. | Retain ownership when failure recording is uncertain. A uniqueness violation alone never proves completion; only a verified completed operation for the exact source identity may support an idempotent success. |
| P1 | Clear-stuck changes the ambiguous operation to an innocuous status or deletes the only evidence, allowing retry to bypass the fence. Quick-sim or restore may also bypass normal advance. | Cleanup preserves recovery evidence and cannot resume or erase an ambiguous transition. All applicable advance entry points consult the same durable evidence; unsupported restoration cannot discard it. |
| P1 | An expired same-state operation contains unknown stages, malformed checkpoints or a completed phase transition inconsistent with the unchanged source. | Validate checkpoint shape, known stages and finite numeric percentage bounds before reuse. Contradictory phase-transition completion requires reconciliation. Read current source state again under owned lease before mutations. |
| P1 audit-driven | Resume marks its predecessor failed, then crashes before inserting its successor, or creates a successor without inherited checkpoints. A second interruption loses prior completed-stage evidence. | Retire predecessor and insert successor with validated inherited checkpoints in one transaction. A rejected successor insert rolls back retirement. Repeated interruption preserves the same completed-stage evidence. |

## Final source review

The [recovery helper](../../../server/lib/advance-recovery.ts) derives a persistent recovery requirement from durable unsettled operation rows rather than an in-memory flag. It compares all three source fields, ignores earlier failed attempts only when a later complete attempt has the same source, distinguishes a nonexpired running operation from abandoned work, and validates allowed checkpoint shapes/percentages. This is conservative containment of uncertainty; it is not a new automatic repair algorithm.

Exact-source retry now accepts the latest failed attempt or an expired running attempt. Retirement and successor creation share one transaction, inherit validated checkpoints, and compare the predecessor's status, source and checkpoint snapshot before updating it. Failed predecessors retain their original error. Historical completed-stage evidence missing from the selected successor requires reconciliation instead of a guessed union. The engine also preserves inherited `game_simulation:100` rather than overwriting it with the initial 10% checkpoint. These fixes close audit-identified evidence-loss windows across repeated failures.

Failure-status persistence is awaited and its owned row count checked; uncertainty retains the matching lease. A uniqueness violation no longer proves success: the catch branch checks for a real completed operation with the exact source. That narrow SQL-conflict catch branch is source-reviewed only. The runtime fixture that rejects an active running operation without a lock exercises the earlier recovery guard, not this catch branch.

Normal advance, force-advance, clear-stuck and the simulation fast-forward wrapper consult this evidence. Normal advance reads source identity again under its acquired lease. Clear-stuck preserves the operation/checkpoints rather than converting them to a disposable failed row. Status exposes a recovery-required reason; the commissioner UI explains the block and disables misleading clear-stuck recovery. Client behavior is source-reviewed until separately exercised in a browser.

The [save-state guard](../../../server/lib/leagueSaveState.ts) now refuses current advance-operation history and target `leagueAdvances` evidence before destructive restore. This closes a bypass for game-free interrupted weeks; it also conservatively blocks restoration after successful recorded advances until W04 preserves that history. The old snapshot inventory remains incomplete.

## Independently repeated runtime evidence

The [reported-results runner](../../../scripts/verify-reported-results.ts), including the [recovery fixture](../../../scripts/verify-advance-recovery.ts), was independently run against the owned loopback PostgreSQL cluster. It passed 1,078 assertions with exit 0. The configured Playwright unit runner independently passed 129 tests with exit 0. The implementation author separately reported a clean full TypeScript check; this audit did not repeat that check. Fixture authorship and implementation are separate from this review.

| Evidence class | Executed behavior and observed result |
| --- | --- |
| Seeded corruption | Separate phase, week and season mismatches; malformed/unknown checkpoint entries; invalid percentages; contradictory transition completion; and legacy lost completed-stage flags all refuse recovery without table changes. |
| Seeded helper transaction | Rejected successor insertion rolls back predecessor retirement and preserves the complete snapshot. Repeated handoffs inherit the exact checkpoints. Failed-attempt handoff retains both progress and the original error. This is transaction evidence, not a process-kill fixture. |
| Seeded progress, actual route | An inherited completed game checkpoint survives an actual advance. A trigger would fail a 100-to-10 regression, so later completion cannot conceal that regression. |
| Actual double write failure | A real game checkpoint failure combined with failed-status persistence failure returns an error, preserves the running operation and matching lease, and rejects immediate retry without writes. After a fresh process and fixture-controlled expiry, exact-source retry completes one transition with eight award receipts. |
| Actual completion failure | Rejection of the terminal complete-status update occurs after the real phase flip and transition checkpoint. The recorded failed operation remains recovery-required; normal advance and clear-stuck cannot erase that uncertainty. |
| Actual process kill | A test-only PostgreSQL trigger/advisory barrier holds the real transition checkpoint after the committed Super Regional-to-CWS flip. The fixture observes the changed phase, original source operation, eight receipts and blocked backend, kills the owned HTTP child, and terminates only that identified backend before releasing the barrier. A fresh process sees the preserved ambiguity. |
| Restart containment | After the kill, status reports recovery required without writes. Repeated normal/force advance, clear-stuck and applicable quick-simulation requests refuse continuation without changing the preserved evidence, eight awards or four unsimulated opening CWS fixtures. |
| Restore containment | Current game-free operation history and target operation evidence prevent unsupported restoration before a backup or destructive mutation. |

The hard-kill drill uses real route-created operation/checkpoint rows; it does not fabricate a completed operation. It explicitly expires only the synthetic fixture's leases as a clock substitute rather than waiting fifteen minutes. Backend termination prevents the paused checkpoint query from committing after client death. This proves containment at the tested boundary, not automatic reconciliation. The runner exits cleanly after its isolated test database cleanup; the shared baseline cluster remains under the implementation author's ownership.

## Boundaries

- Refusing an ambiguous phase transition is containment, not automatic repair. Actual repair needs durable evidence of intended target state and required stage effects, plus an audited reconciliation path.
- Matching source identity and well-formed checkpoints do not independently prove every old stage's side effects were atomic. Other writer coordination, stage-version semantics, lease loss during mutations and whole-season exactly-once behavior remain distinct gates.
- A superseded live worker can still reach the global per-league checkpoint-writer registry. A future lease-takeover drill must prove that an old execution cannot use a successor's registered writer or continue its own stage mutations; a hard-killed process does not exercise that overlap.
- Fast-forward's new guard prevents bypassing existing normal-advance recovery evidence. It does not add per-step durable operation tracking to all quick-simulation work or certify its own interruption recovery.
- Reports, game/award receipts, postseason ambiguity fences and advance-operation evidence must survive restoration or make unsupported restoration unavailable. A pre-advance capture is not proof it can restore this history.
- Standard/full-season bracket behavior, All-American awards, external coach writers, chronological rest, full companion rehearsals, complete-media builds and human enjoyment remain outside this bounded recovery slice unless separately tested.
