# W03 batch 01 independent report-edit integrity audit

Date: September 15, 2026. Review lenses: Gilfoyle transaction and authority integrity, Gibs adversarial integration QA, Passan baseball-record consistency. Reviewer owns only this audit and the [revision contract](../REPORT_REVISION_CONTRACT.md), not implementation or tests.

**Verdict: bounded PASS. No milestone-blocking defect remains in the commissioner PATCH version/terminal-state/required-edit-audit slice.** Independent unit and HTTP/PostgreSQL execution passed. TI-05 remains implementing for the wider accepted-revision protocol.

## Initial critical review

| Severity | Reproduction and impact | Required acceptance |
| --- | --- | --- |
| P1 - lost edit | Two commissioners load one report, edit independently, then save. Unversioned PATCH overwrites the first edit with stale content. | A required base version is captured with each draft. Exactly one concurrent same-version edit succeeds; stale drafts return conflict without overwriting content or audit. |
| P1 - terminal mutation | Finalize a game while its report status remains pending after an interrupted separate status update. PATCH sees pending and changes report content underneath the official result. | Under game then report locks, reject both completed-game and finalization-sentinel states independently of report status. |
| P1 - untraceable mutation | Force edit-audit insertion to fail after updating report. Existing separate writes leave changed baseball data despite a failed request. | Edit content, version and required edit audit commit or roll back together. Fault injection must inspect persisted rows. |
| P1 - false version adoption | Retain a locally edited draft while query data refetches a newer report. Sending the latest query version with old local data defeats optimistic concurrency. | Version belongs to the initialized draft and does not silently refresh. Failed submissions preserve the draft/token; explicit reload is required to adopt newer content. |
| P1 - scope boundary, TI-05 | Confirm reads revision A, an edit commits B, then confirm finalizes its old snapshot and separately marks the current report confirmed. Dispute has a similar stale-read boundary. | Full W03 must bind all decisions to immutable reviewed identity and serialize transition plus receipt. PATCH-only protection must not be described as solving this race. |
| P1 - scope boundary, TI-04/09/10 | Finalization sentinel records game/finalizer but not accepted content; corrections/evidence remain separately mutable; batch XP can exist only in memory. | Preserve accepted revision/receipt and durable per-game effects with restart/retry/recovery evidence. Keep these findings open after this slice. |

Source: [report routes](../../../server/routes/games.ts), [report page](../../../client/src/pages/report-game.tsx), [finalizer](../../../server/game-finalizer.ts), [schema](../../../shared/schema.ts). Current baseball validation and authority remain mandatory; a concurrency token must not grant an exemption to score-only PATCH or invalid roster/counter payloads.

## Final verification

| Gate | Independent result | Evidence boundary |
| --- | --- | --- |
| Configured unit suite | **127 passed**, exit 0 | Existing reporting/identity/correction/validation regressions plus strict numeric edit-token boundaries. No browser hydration test is implied. |
| Real HTTP/PostgreSQL | **291 assertions passed**, exit 0 | Authenticated route requests, populated migration, concurrent edits, exact stored audit identity and injected edit-audit failure rollback. |
| Final source review | **Bounded PASS** | Transaction lock ordering, terminal guards, draft-bound token integration and preserved route authority/validation. |

Reviewer commands: `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts` and `node --import tsx scripts/verify-reported-results.ts`. The HTTP gate uses an explicit loopback test connection, creates and drops an owned randomly named database and keeps the parent's existing baseline database/cluster intact. Both independent commands completed successfully after final source and test integration. TypeScript results are recorded separately by the parent in the batch evidence.

The [edit service](../../../server/lib/edit-game-report.ts) locks the game before the report, matching the finalizer's initial lock. It reads the current game and sentinel under that game lock, rejects either complete or receipted state, then verifies report identity, league/game association, editable status and expected version under the report lock. Only pending/disputed reports with the exact current version advance. The bounded PostgreSQL integer counter cannot overflow into a successful write. Content, incremented version, timestamp and the required edit audit share one transaction.

The final HTTP gate verifies a newly submitted report exposes version 1 through GET, a valid edit returns/exposes version 2, and malformed or missing versions return actionable 422 feedback without persisted mutation. Two concurrent same-version requests return one 200 and one 409; the winning payload alone is stored and exactly one edit audit appears. That audit identifies the authenticated actor, game, report, previous version, new version and accepted score. Reusing the old version returns 409 with all public tables unchanged; a subsequent current-version edit advances to 3. The race uses concurrent HTTP requests, not a deterministic pause at every possible interleaving; full W03 concurrency acceptance remains broader.

A synthetic PostgreSQL trigger rejects the required `Game Report Edited` audit insertion. The request fails and the complete before/after public-table snapshot, excluding session expiry bookkeeping, is unchanged: report content and version rolled back together. The trigger is removed in `finally`. Separate fixtures prove rejection for a completed game with a pending report, a sentinel with an incomplete game, confirmed status and an unsupported terminal status. A current-version disputed report remains editable. Existing invalid baseball payloads and role-authority checks continue to pass.

The [0051 migration](../../../server/migrations/0051_report_edit_version.sql) adds a non-null counter defaulting to 1, without rewriting baseball content or pretending to reconstruct history. The populated upgrade fixture removes the version column and 0050/0051 markers, restores the earlier summary constraints, observes failed readiness, then applies exactly those migrations in order. All existing report fields other than the newly introduced version remain identical, every existing report receives version 1, nullable-summary semantics are retained and readiness succeeds. Fresh fixture bootstrap passes too.

The [report page](../../../client/src/pages/report-game.tsx) captures the token in the same initialization effect that hydrates that report's draft. A ref prevents later query refetches for the same report from replacing the local body or adopting a newer token. Missing/invalid tokens block submission. The payload uses the captured token; error handlers preserve local state. A game/league/mode key remounts the inner form when its identity changes. These integration claims come from source inspection; the parent records typechecking separately. No full authenticated-page browser run is claimed. Explicit page reload still discards a local draft; durable merge/conflict recovery is not delivered by this slice.

## Open integration findings

**P1 - TI-05/TI-10, existing post-commit correction gap.** PATCH still calls `persistCorrections` after the edit service transaction. If that separate insertion fails, the HTTP request returns 500 even though body, version and edit audit committed; retrying the original token then conflicts. Reproduction: fail the OCR correction insert after a valid versioned PATCH containing corrections. This branch was identified by source review, not fault-injected in the 291 assertions. Acceptance: bind required correction provenance to the exact revision inside its transaction, or define a durable recoverable operation with unambiguous retry status. Do not describe every failed PATCH response as a rollback. The required edit-audit rollback is verified specifically. Carry under the existing revision/evidence findings rather than inventing a competing backlog.

**P1 - TI-05, unresolved decision races.** Confirm/dispute/force-finalize still consume separately read report snapshots and do not require the version the user reviewed. The edit guard cannot stop an already-read confirm from finalizing older content after a new edit, or a stale dispute from attaching to a changed body. The next batch must implement the reviewed-revision guard and shared transition boundary, rather than repeat this inventory. Receipt identity, immutable revision history, against-CPU atomic acceptance and complete retry semantics remain open. See the [contract](../REPORT_REVISION_CONTRACT.md) for concrete interleaving and crash gates.

## Evidence limits

Source inspection and pure tests do not establish complete authenticated-page behavior, draft reload recovery, production CSS/media quality or human enjoyment. Existing [media prerequisites](../BUILD_PREREQUISITES.md) and [Power Pros rules inputs](../POWER_PROS_CONTRACT_INPUTS.md) remain open. This batch does not implement immutable accepted revisions, stale confirmation/dispute safety, reliable notification delivery or cross-game chronological reconciliation.
