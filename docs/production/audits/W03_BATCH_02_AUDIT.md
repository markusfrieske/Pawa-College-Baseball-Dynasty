# W03 batch 02 independent report-decision integrity audit

Date: September 16, 2026. Review lenses: Gilfoyle transaction and authority integrity, Gibs adversarial integration QA, Passan baseball-record consistency. The reviewer owns only this audit, independently of source and test implementation.

**Verdict: bounded PASS.** No milestone-blocking defect remains in the reviewed-version decision, required transition-audit and PATCH correction-transaction slice. Independent unit and HTTP/PostgreSQL execution passed. TI-05 remains implementing: an incrementing decision token is not an immutable accepted-result ledger.

## Adversarial acceptance

| Severity | Reproduction and impact | Accepted resolution |
| --- | --- | --- |
| P1 - stale prepared result | Confirmation reads report A, PATCH commits B, then confirmation obtains the game lock and finalizes A. Checking a token only before the lock leaves the race open. | Under game then report locks, compare both expected and server-prepared versions with persisted version/status before official writes. Deterministically queued edit/confirm races pass in both orders. |
| P1 - split approval | Required confirmation audit/status fails after game, standings and finalization sentinel commit. Report and official result disagree. | Status, incremented token, approving actor and audit share the official-result transaction. Injected audit failure leaves all public tables unchanged, excluding session bookkeeping. |
| P1 - stale dispute | A coach opens a dispute for A; an edit or acceptance commits before the dispute arrives. | Dispute binds displayed version and locks game then report. It checks pending state and terminal game/receipt, then changes version and required audit atomically. Both dispute/confirm orderings pass. |
| P1 - split correction provenance | Correction insertion fails after a versioned PATCH committed, disguising changed content behind a failed request. | Correction rows, report content, token and edit audit roll back together. The same token succeeds after the synthetic fault is removed. |
| P1 - CPU false confirmation | Against-CPU report is created confirmed before its finalizer fails. | Report starts pending; acceptance moves report and official effects together. Failed acceptance leaves pending version 1, no official score/stats or receipt, and remains recoverable through confirmation. Submission is a separate boundary. |
| P1 - correction bypass | Commissioner selects a proposed score contradicting retained inning/player data. | Complete candidate baseball validation remains mandatory. The inconsistent full-box correction fixture still fails before acceptance. |
| P1 - UI version adoption | A dispute draft remains open while refetch changes the source; old reasoning is sent with a new token. | Opening a dispute copies its game, version and displayed scores. Errors retain that draft/token; success or explicit cancellation clears it. Missing tokens disable decisions. |

## Independent verification

| Gate | Independent result | Boundary |
| --- | --- | --- |
| Configured unit suite | **129 passed**, exit 0 | Includes review-target copy and invalid-version checks. This is pure state behavior, not an authenticated page test. |
| Real HTTP/PostgreSQL | **534 assertions passed**, exit 0 | Real authenticated requests, loopback disposable database, queued races, exact persisted identities and fault rollback. |
| Final source review | **Bounded PASS** | Locks, prepared and reviewed version checks, transition/audit boundary, CPU path, correction transaction and client token integration. |

Reviewer commands: `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts` and `node --import tsx scripts/verify-reported-results.ts`. The HTTP gate explicitly requires a named loopback test connection, creates and drops its own random database and preserves the parent's baseline database/cluster. Parent typecheck and final cleanup evidence are recorded in [batch evidence](../W03_BATCH_02.md).

The [transition service](../../../server/lib/report-transition.ts) uses the same game-then-report lock order as the [edit service](../../../server/lib/edit-game-report.ts). It rejects a completed game or finalization sentinel independently of report status, checks league/game/report association, checks allowed current state, and compares the current token with both the caller's reviewed token and the prepared report snapshot. This second comparison matters: the client might name a current version while server preparation used an earlier snapshot. Reported finalization additionally rejects changed schedule fields used by its prepared result. The terminal increment guard prevents an overflowing PostgreSQL integer from becoming a successful transition.

The [finalizer](../../../server/game-finalizer.ts) updates report status, actor, scores and version, then writes the required confirmation/resolution audit before committing the existing receipt, official game and projection transaction. The previous already-complete route shortcut no longer confirms arbitrary report content against an existing official game. Duplicate completed decisions conflict; they are not identity-bearing idempotent successes. Disputes increment the same token, invalidating earlier edit, confirmation and resolution drafts. Correction persistence now occurs inside PATCH's transaction; correction history is still associated with the mutable report rather than an immutable historical revision.

Seven deterministic races hold the real game row lock, start the first HTTP request and observe its database lock wait, start the second and observe both waiting, then release the blocker. Both edit/confirm orders, both dispute/confirm orders, both edit/finalize orders and duplicate confirm each return one success and one conflict. Stored status, token, edit body, completion flag, receipt count and exact authenticated mutation audit agree with the winning decision. These tests deliberately reach the former read-before-lock window rather than merely firing requests at roughly the same time. They do not claim exhaustive interleavings across different games or concurrent roster/authority changes.

Missing/malformed tokens produce field-addressed 422 responses on all three decision routes, with full-table no-write snapshots. Stale and terminal-state decisions return conflicts without writes. Audit triggers separately fail confirm, force-finalize and dispute; whole-table snapshots prove required report and official effects roll back. A correction trigger proves body, token, edit audit and corrections roll back together. Removing each fault permits the unchanged token to succeed. CPU-specific fixtures prove successful guarded acceptance and failed acceptance recovery from pending status.

## Findings fixed during independent review

**P1 - misleading failure after acceptance.** Awaited secondary report-feed writes and notification lookups could throw after the official decision committed, returning HTTP 500 and potentially skipping schedule-cache invalidation. The routes now invalidate after successful acceptance and catch/log secondary failures while returning committed success. A trigger rejecting only `GAME_REPORT` events verifies successful confirm/dispute/finalize responses with the expected committed state and receipt. Required `GAME_RESULT` remains in the official transaction. Reliable notification delivery still needs an outbox; the containment does not promise delivery or receipt by players.

**P2 - lost resolution context.** Moving force-finalization audit into the transaction initially omitted the original score and whether a proposed correction was chosen. The final audit retains previous and resulting scores and explicit `reported`/`corrected` resolution source. An additional runtime regression accepts a score-only correction from 2-1 to 3-1, verifies version 2-to-3, the actor and exact audit JSON, and separately checks the default reported resolution source. This preserves the specific resolution explanation while the full append-only ledger remains unfinished.

**P2 - premature CPU audit claim.** Submission audit originally said auto-confirmed before the guarded acceptance ran. It now says automatic confirmation was requested; only the successful atomic confirmation audit certifies acceptance. The failed-CPU fixture checks the truthful submission wording.

The [schedule page](../../../client/src/pages/schedule.tsx) and [commissioner report tab](../../../client/src/pages/commissioner/tabs/GameReportsTab.tsx) submit the token associated with the report actually rendered. Open disputes use [copied review state](../../../client/src/lib/reportTransition.ts), so refetch cannot retarget the retained draft. The schedule DTO includes the token; PATCH and decisions invalidate its cache. These are source-review and pure-test conclusions. No full-page browser run, keyboard/mobile journey or human comprehension result is claimed.

## Retained scope limits

- Tokens do not preserve immutable historical content. The sentinel lacks an accepted revision reference. Response-loss retries cannot return the same inspectable accepted receipt; completed retries conflict.
- Route authority and baseball roster validation occur before the final transaction. This slice does not establish stable transactional membership, roster eligibility or authority revocation.
- Per-game locks do not serialize different games sharing coaches, players or teams. Cross-game coach read/modify/write and pitcher-rest chronology need separate gates. Batch coach XP retains an in-memory durability boundary.
- Initial report submission, its required audit/corrections and CPU acceptance are not one transaction. A pending report can remain after failed acceptance; creation eligibility still needs the common game lock.
- Evidence remains mutable and corrections lack immutable revision identity. Superseding accepted results, reversing contributions, restart/recovery, durable outbox delivery and fail-closed advancement remain open.
- Full-page authenticated behavior, production media, interrupted draft recovery and human enjoyment remain separate gates. Source checks and synthetic database assertions cannot replace them.

The [report revision contract](../REPORT_REVISION_CONTRACT.md) retains these obligations. No Power Pros rule was invented to claim acceptance.

