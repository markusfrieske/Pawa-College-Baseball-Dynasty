# W03 batch 05 independent postseason award audit

Date: September 17, 2026 (America/Denver; September 18 UTC). Review lenses: Gilfoyle transaction/data integrity, Gibs adversarial integration QA, and Passan competitive record truth. Audit ownership is separate from source and regression authorship.

**Verdict: bounded PASS.** No milestone-blocking defect remains in the reviewed postseason milestone receipt service, its projection transaction or history-retention containment. This is not a release or whole-postseason certification. TI-08/TI-09 remain implementing until complete advance recovery and the remaining achievement/writer paths satisfy their acceptance criteria.

## Evidence

- Independent configured unit suite: **129 passed**, exit 0, using `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts`.
- Independent real HTTP/PostgreSQL suite: **771 assertions passed**, exit 0, using `node --import tsx scripts/verify-reported-results.ts` against an owned random loopback fixture database and real HTTP child.
- The [postseason regression helper](../../../scripts/verify-postseason-awards.ts) exercises the actual service inside that server process through test-only IPC. It verifies concurrent identical/distinct milestone calls, game-plus-milestone projection preservation, real perk and multi-level point deltas, receipt insertion rollback, process restart/replay, changed coach/season attribution, no-coach receipts, known-receipt precedence over a fence, invalid identity/source rejection and history-only restore refusal. The [parent suite](../../../scripts/verify-reported-results.ts) verifies populated 0054 upgrade with unchanged legacy projections/no invented receipts, target-snapshot refusal and owned award/fence deletion with unrelated rows preserved.
- Final source review covers all four award call sites, exception propagation and 409 mapping, standard opening-game retry containment, migration/schema parity and restore/delete integration. These source checks are distinct from runtime route coverage.

The independent fixture run completed its cleanup successfully. Final cluster shutdown, TypeScript and source commit evidence belong in [batch evidence](../W03_BATCH_05.md).

## Source review

The new [milestone service](../../../server/lib/postseason-coach-awards.ts) takes the league KEY SHARE lock, the same per-league advisory lock as atomic game finalization, and then the assigned coach's row lock. Its receipt lookup precedes legacy-fence, current-season and coach-assignment checks. Exact retry therefore retains original attribution even after reassignment or season rollover; conflicting source keys reject. New awards validate the current season and team/coach league relationship. A team without a coach records a durable `no_coach` disposition and zero deltas, preventing a later assignment from inventing an old reward.

Counter, derived legacy score, actual perk-adjusted XP, every gained level's skill point and the legendary conference bonus share one transaction with the receipt. The old best-effort XP helper is removed. Receipt team and coach IDs are historical identifiers rather than foreign keys; the league FK permits explicit owned-league cascade. These rows are application append-only, **not database-immutable**: no update/delete rejection trigger exists.

[Migration 0054](../../../server/migrations/0054_postseason_coach_awards.sql) records ambiguity for existing postseason/offseason current seasons and seasons with postseason games. It deliberately does not infer receipts or alter old coach projections. This conservative fence can also block an existing scheduled-but-unplayed postseason; it is containment, not legacy reconciliation. Normal regular-season leagues without postseason evidence can create future receipts. A fenced season's missing receipt requires audited reconciliation before its new award can proceed.

The four [simulation callers](../../../server/routes/simulation.ts) await the new service before their phase flip. Full-season appearance retries no longer infer award completion from bracket-game existence. Standard CWS entry reuses one matching initial fixture and rejects conflicting finalists or duplicate pre-flip fixtures. This is source-reviewed replay containment under the existing advance lease; a select-before-insert check is not a database uniqueness constraint or lease-loss certification. The retained live-phase mismatch guard avoids inventing old post-flip awards; it does not prove whole-stage recovery.

Audit feedback also identified that generic simulation errors would hide the new legacy reconciliation requirement. Advance-week and the five sim-to/full-season handlers now map the service's reconciliation/conflict classes to HTTP 409 with their actionable message. Advance-week retains failed-operation cleanup and no longer exposes arbitrary exception detail in its generic 500 response. This mapping received source review; no new full advance/browser test is claimed.

[Restore](../../../server/lib/leagueSaveState.ts) checks both current postseason tables and corresponding target evidence before backup and again under its exclusive league lock before deletion. It refuses instead of dropping unsupported history. Capture/reinsert inventory remains incomplete; the guard does not deliver mature-league restoration.

## Required milestone acceptance

| Severity | Reproduction and impact | Required acceptance |
| --- | --- | --- |
| P1 | An old postseason path increments a championship/appearance counter, then crashes before XP, or awards XP and crashes before phase flip. Retry can miss or duplicate rewards. | Counter, legacy score, XP, all level skill points, perk bonuses and durable receipt commit together. Runtime receipt-insert fault injection rolls everything back; restart and same-event retry retain one contribution. |
| P1 | Retry a team achievement after replacing its coach, or concurrently award different achievements to the same coach. Coach-based identity duplicates the first event; unlocked projection updates lose another event. | Identity is league/season/team/milestone, independent of current coach assignment. Receipt replay preserves original attribution. Participating game and milestone writers share league serialization and locked coach observations. |
| P1 | Upgrade a season where old counter and XP writes may already have occurred without receipts. Automatic replay creates fabricated certainty and duplicate rewards. | Migration preserves existing projections, creates no invented contribution receipts and fences ambiguous seasons. An unreceipted award in a fenced season fails visibly pending reconciliation; existing receipts remain replayable. |
| P1 | A standard SR-to-CWS transition creates its opening game, then an award fails. Retry creates another opening game. Full-season code instead uses game existence to skip potentially missing awards. | Standard opening-game creation is retry-safe; full-season appearance awards retry independently of bracket existence. Required award failures propagate before phase completion. |
| P1 | Restore an old save over a league whose only durable history is a postseason award or migration fence. The old inventory loses its receipt/fence. | Current and target history-bearing restore attempts refuse before destructive writes. Explicit owned-league deletion removes only owned postseason rows. |

## Boundaries that remain release gates

- A durable receipt proves an award was applied once to the team supplied by the caller. It does not by itself certify the bracket algorithm, accepted reported results, historical roster/authority or champion identity.
- **P1 competitive truth, existing defect, source-reproduced:** Full Season SR code counts wins by the game's home/away position, even though Game 2 reverses home assignment. A high seed winning Games 1 and 2 can be recorded as 1-1 instead of 2-0, forcing an unnecessary Game 3 and potentially naming the wrong winner; see [superRegionals](../../../server/services/postseason/superRegionals.ts). A repair needs identity-based counting and runtime reversed-home series fixtures for either team, sweeps and three-game series. Track under the existing postseason truth acceptance (SYS-11); award durability does not close it.
- All-American counters, other coaching purchase/reset writers, ancillary news/events and whole advance-stage recovery need their own durability/coordination evidence. Milestone receipts do not certify these paths.
- Real authenticated advance failure/restart/checkpoint/lease recovery remains distinct from service-level receipt testing. Full-season and standard brackets, and simulated and reported modes, need explicit journey coverage. Existing postseason branches simulate incomplete games even though the ordinary weekly branch excludes reported mode; this audit does not certify Power Pros postseason source authority.
- Played-league restoration remains containment until complete, compatible and consistent capture/recovery is implemented. No generated art concept or passing component harness proves player enjoyment or a full-media release build.
