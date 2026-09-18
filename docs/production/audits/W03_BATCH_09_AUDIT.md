# W03 batch 09 independent weekly-reset audit

Date: September 18, 2026. Lenses: database transaction/lease integrity, gameplay action economy, recovery QA. Implementation and independent audit are separate agents.

## Findings addressed

| Severity | Reproduction and impact | Required acceptance / resolution |
| --- | --- | --- |
| P1 | Coach resets commit separately from reset_actions:100. Checkpoint failure or worker expiry leaves spent actions/readiness changed without stage evidence. | Reset coach fields and checkpoint in one execution-owned transaction. Failure rolls both back. |
| P1 | Reset commits, later work fails, and normal regular-season retry sees not-ready coaches before consulting the inherited reset. Recovery becomes blocked. | Validated same-source reset completion bypasses the already-passed readiness gate. |
| P1 | A deadline expires before retry; auto-ready/CPU-fill runs again, then inherited reset is skipped, leaving coaches ready in the next week. | Apply the same inherited-reset guard to deadline mutation/fill and prove retry with an expired deadline. |
| P1 found during review | A BEFORE UPDATE trigger returns NULL for the checkpoint. Ignoring affected-row count would commit coach effects without evidence. | Require exactly one checkpoint update; injected suppressed-write fixture rolls all changes back. |
| P1 found during review | Force-advance ignores a returned resume, re-readies coaches and runs CPU-fill before redirecting to normal recovery. | Reject force recovery before writes; full database snapshots stay equal in both mode fixtures. |

## Evidence boundaries

Source review verifies explicit normal-advance callback integration, source identity checking, league-scoped coach SQL, owned progress publication and preserved later coach snapshot. Actual HTTP tests observe A blocked inside coach reset, B blocked on the lease row, A rollback before B gameplay, and exactly one resulting calendar advance.

The populated rows are synthetic coach/team state in otherwise game-free regular-season leagues. Authentication is the commissioner session. Source reasoning that A aborts before later gameplay is not presented as a populated-game no-write test. Fast-forward fallback is source-preserved, not certified as a fenced stage.

**Verdict: bounded PASS for the normal-advance weekly reset.** Implementation results: 61 PostgreSQL helper/stage assertions, 1,125 HTTP/PostgreSQL assertions and full TypeScript pass. The independent frozen-source rerun passed all 61 helper/reset assertions, all 1,125 HTTP/PostgreSQL assertions and 129 configured unit tests. TypeScript was not repeated by the reviewer and remains implementation-owner evidence.

## Remaining gates

All other gameplay stages, external coach writes, background effects, cross-process stage takeover, full fast-forward operation history and changed-state reconciliation remain open. The bounded reset-stage milestone must not close TI-08 or TI-09.

Sources: [owned reset](../../../server/lib/advance-execution.ts), [progress](../../../server/lib/advance-progress.ts), [engine and force recovery](../../../server/routes/simulation.ts), [helper rollback tests](../../../scripts/verify-advance-execution.ts), [live HTTP stage drill](../../../scripts/verify-advance-reset.ts).
