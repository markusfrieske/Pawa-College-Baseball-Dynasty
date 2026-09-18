# W03 batch 03 independent report-history audit

Date: September 17, 2026. Review lenses: Gilfoyle transaction/data integrity, Gibs adversarial integration QA, Passan baseball-record truth, and JD history comprehension. Reviewer ownership is limited to this audit, independent of implementation and test authorship.

**Verdict: bounded PASS.** No milestone-blocking defect remains in retained report-state snapshots, receipt-to-accepted-content identity, exact reported-decision retry, transactional initial submission, and the bounded history viewer. TI-05 remains implementing. Snapshot recovery is explicitly contained, not repaired.

## Independent evidence

| Gate | Independent result | What this proves |
| --- | --- | --- |
| Real HTTP/PostgreSQL | **654 assertions passed**, exit 0 | Authenticated routes, populated upgrade, preserved legacy uncertainty, lifecycle snapshots, atomic rollback, deterministic races, receipt restart/retry, authorized history reads, cleanup and restore containment. |
| Configured unit suite | **129 tests passed**, exit 0 | Existing shared reporting, roster, permission, correction and reviewed-state regressions remain passing. |
| Real history component in browser | **47 assertions passed**, exit 0 | Lazy fetching, retained observations, exact official badge, unknown-versus-zero display, keyboard controls, error/retry and hidden cached history after 403. |
| Final source review | **Bounded PASS** | Common game locks, immutable-history boundary, receipt identity, normalized correction snapshots, history privacy, restore guard and deletion compatibility. |

Reviewer commands: `node --import tsx scripts/verify-reported-results.ts`, `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts`, and `node --import tsx scripts/verify-report-history-ui.ts`. The database harness owns a random loopback database and HTTP child; browser verification bundles the actual component with synthetic local HTTP data and installed headless Edge. Its 375px/1280px checks cover basic native layout, not production CSS, the complete application, authenticated navigation or human enjoyment. Parent TypeScript, source checkpoint and cluster cleanup evidence belong in [batch evidence](../W03_BATCH_03.md).

## Adversarial acceptance

| Severity | Reproduction and impact | Verified resolution |
| --- | --- | --- |
| P1 | Edit or resolve a report; original content disappears from its mutable current row. | Each submitted, edited, disputed and accepted state has a stable report/version snapshot. Original content stays unchanged, and corrected acceptance preserves both original and actual accepted scores. |
| P1 | Lose an accepted confirmation response and retry; projections or notices duplicate, or a different request is falsely acknowledged. | Exact actor, report, requested version, action and resolution return the original receipt. Different identities conflict. Post-restart retry leaves every public table unchanged, excluding session bookkeeping. |
| P1 | Initial submission and quick-score both pass unlocked eligibility checks. | Common game locking and current eligibility checks produce one winner in both deterministic request orders. A generic non-report finalizer also refuses an extant report without writes. |
| P1 | Required history/correction/audit insertion fails after content or official effects change. | Fault injection proves initial creation, edit, dispute and acceptance roll back their respective required transactions. The unchanged request can succeed after removing the fault. |
| P1 | Delete a historical row and cascade away its official receipt while the live report survives. | Database triggers reject direct UPDATE and DELETE of revisions. Explicit parent-report cleanup is allowed; real commissioner deletion of an accepted fixture league removes owned history/receipt and preserves unrelated data. |
| P1 | Restore a save whose old inventory silently omits new revisions and receipts. | Report-bearing current leagues and report-bearing target snapshots return 409 before backup/deletion. Tests verify all tables unchanged for both branches. A second guard under the league row lock protects the destructive boundary; that exact concurrent restore interleaving received source review, not a deterministic race test. |
| P2 | Backfill authors, earlier versions, historical corrections or timezone certainty from today's record. | Migration creates one `legacy-observed` baseline per existing report, with null observation actor, explicit unknown timestamp timezone and no inferred historical correction attribution. Legacy receipts retain unknown revision/actor fields. |
| P2 | History refetch loses permission but cached private actors and snapshots stay on screen. | The component consumes the query abort signal and hides retained content on errors. The browser regression first loads history, then returns 403 and verifies actor names and revisions disappear. |

## Source and integration findings

The [history migration](../../../server/migrations/0052_report_history.sql) enforces unique report/version identity and blocks revision updates or deletion while the parent report exists. Parent report deletion cascades revisions and their linked receipt. This is preservation within a live league, not indefinite archival against authorized league deletion or privileged database administration. Receipt rows themselves retain the existing mutable database representation; this batch verifies API transaction and identity behavior, not a database trigger making receipts immutable.

[Initial submission](../../../server/lib/create-game-report.ts) now locks the game, checks completion, receipt and existing-report state, and rejects changed schedule fields used during preparation. Report, audit, normalized corrections and initial snapshot commit together. CPU acceptance remains a subsequent transaction: failed acceptance intentionally leaves an inspectable pending submission. Initial POST response-loss retry and CPU resubmission are not promised to return the same operation receipt.

[Acceptance](../../../server/game-finalizer.ts) appends the actual confirmed report after applying the validated resolution, then binds its revision to the receipt inside the existing official-result transaction. A 2-1 score-only report disputed and resolved to 3-1 retains all three observations; the receipt names the 3-1 accepted snapshot. Unknown box summaries remain null across submitted and accepted snapshots. New exact retries are limited to reported confirmation and commissioner acceptance; edit/dispute replay still uses stale-version conflict semantics.

[History routes](../../../server/routes/games.ts) check current authenticated league/game authority before returning history or matching a retry. History and receipt are read in a repeatable-read transaction and sent with private/no-store cache policy. Actor display names come from current league coach profiles and are labeled accordingly; historical authorship is stored as identity, not fabricated from a present name. Revoked, unrelated, anonymous and wrong-league requests disclose no history/receipt. Membership and roster revocation during the mutation transaction remain an open contract rather than being silently claimed solved.

Review prompted additional containment for generic simulated-result writers: they cannot create an official result over an existing report. This does not repair advancement callers that swallow finalization errors. Exact result identity for direct quick-score and simulation retries, durable batch coach effects and cross-game ordering remain open.

The [history viewer](../../../client/src/components/report-history.tsx) identifies observed legacy baselines, marks only the receipt-linked revision official, distinguishes unknown statistics from zero, and uses neutral wording for unlinked receipts. Null revision links also occur on new simulation/direct-score receipts, so they must not be described as proof that a result predates tracking. Submission notification error catching is defensive source hardening; the underlying inbox helper already catches ordinary database errors, so this audit does not claim a newly reproduced P1 notification failure was fixed.

Owned-league deletion testing exposed a pre-existing missing `league_events` cleanup in `DatabaseStorage.deleteLeague`; the fix deletes those league-owned rows before removing the league. The accepted-history fixture verifies the complete authorized route while retaining all unrelated public data.

## Retained release limits

- Report-bearing restore is temporarily unavailable until W04 implements complete history/receipt capture, consistent snapshots, backward compatibility and recovery. Save capture is available but is not certified as complete restoration evidence.
- Screenshot/extraction manifests, stable rules/roster/authority versions, accepted-result amendments and contribution reversal remain open.
- Per-game locks do not prove shared-player/coach/rest chronology across games. Batch coach effects, fail-closed advancement and durable notification delivery remain open.
- Historical receipt supersession, immutable effect contributions, simulation identity and whole-league replay/recovery are not delivered by report snapshots alone.
- Full application/media build, authenticated end-to-end history/retry journeys, production styling, unfamiliar-player comprehension and enjoyment remain separate gates. No unknown Power Pros rule was invented.

The [revision contract](../REPORT_REVISION_CONTRACT.md) and existing production tracker retain these obligations. This bounded pass is permission to continue development, not a release certification.
