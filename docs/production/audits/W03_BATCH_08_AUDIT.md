# W03 batch 08 independent execution-metadata audit

Date: September 17, 2026 (America/Denver; September 18 UTC). Lenses: technical integrity, interruption/concurrency QA, preservation of official baseball state. Implementation and independent review are separate agents.

## Findings and acceptance

| Severity | Reproduction / impact | Resolution and acceptance |
| --- | --- | --- |
| P0 within the existing recovery work | Pause worker A, expire its lease, register B's global per-league writer, then resume A's checkpoint. A invokes B's closure and can falsely mark B's stage complete. | Remove mutable writer lookup. Pass an execution-bound callback into the engine. Paused A must fail and preserve B's checkpoint/progress/status/lease. |
| P1 | A stale heartbeat extends its operation independently of a lost league lease, or completion/failure writes occur after expiry. | League-first row locking, matching immutable identity and both live deadlines for every metadata transaction. |
| P1 found during review | UPDATE blocks inside a trigger until the original deadline passes, then writes a fresh lease; checking only refreshed expiry incorrectly accepts the renewal. | Capture original league and operation deadlines, validate after SQL and roll back both renewals/status/checkpoints on expiration. Test asymmetric deadlines independently. |
| P1 evidence gap | A fixed sleep assumes the checkpoint SQL is already in flight; a slow runner can instead reject before reaching the SQL, producing a false claim about race coverage. | Observe the checkpoint UPDATE waiting inside the owned test trigger before takeover. |
| Follow-up, still open | Stage gameplay mutations occur before the next checkpoint and are not in the metadata transaction. | Do not mark whole-operation lease safety complete. Fence stage effects and prove a live gameplay-worker takeover separately. |

## Verification scope

**Verdict: bounded PASS; no remaining blocker within metadata scope.** The implementation run passed 1,078 real HTTP/PostgreSQL assertions and full TypeScript. The independent configured unit run passed 129 tests and the final observed-wait metadata fixture passed 47 PostgreSQL assertions. The reviewer did not repeat the HTTP regression or TypeScript check; those are implementation-owner evidence.

The separate metadata script bootstraps and drops its random fixture database; it does not use official league state. Its interleavings execute the real ownership/progress/handoff helpers against PostgreSQL. They do not execute a complete paused gameplay worker.

Source links: [execution](../../../server/lib/advance-execution.ts), [progress](../../../server/lib/advance-progress.ts), [handoff](../../../server/lib/advance-recovery.ts), [engine/route](../../../server/routes/simulation.ts), [metadata tests](../../../scripts/verify-advance-execution.ts), [HTTP regression](../../../scripts/verify-reported-results.ts).
