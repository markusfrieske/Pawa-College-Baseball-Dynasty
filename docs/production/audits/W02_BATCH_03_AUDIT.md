# W02 batch 03 independent reporting audit

Date: 2026-09-14. Review lenses: JD player experience, baseball record integrity and Gibs technical QA. The reviewer owns this audit only and did not implement the application changes or their test harnesses.

**Verdict: the bounded W02-OCR-01 correction repair passes independent pure tests and source integration review. The reporting feedback component passes independent browser checks. No blocker remains for this batch's bounded acceptance. UX-01 and UX-03 remain implementing: role-specific workflows and complete report-page interaction are not certified.**

## Findings and acceptance

| Severity | Reproduction and impact | Required acceptance |
| --- | --- | --- |
| P2 · W02-OCR-01 | Correct an OCR field in review, return to score entry, and edit it again or remove its row. Score-step callbacks bypass correction bookkeeping, so the submitted correction can disagree with the final report or refer to a deleted row. | A shared reconciliation path preserves the first observed value and latest retained value across both steps, and prunes keys with no remaining owner. Include repeated edits, reassignment, removal and ambiguous legacy duplicates. |
| P2 · derived provenance | Change an inning, remove an inning, or change a batter's hits after OCR. The submitted final score and hit totals derive from these rows. Independent score correction keys can become stale; deleted inning keys can survive. | Reconcile existing score keys against final derived values and remove provenance for omitted innings. Track the actual batting hit observation; do not invent separate OCR team-hit provenance that the form never retained. Client bookkeeping is not an immutable server ledger. |
| P1 · UX-01 | The score page labels box detail optional and starts with innings hidden. The coach POST route requires both teams' batting, pitching and innings; PATCH requires them for every edit. The pure validator's allowance for absent commissioner boxes is not the route contract. | State the applicable entry requirements before work begins and enforce the current complete-report form contract locally. Preserve pending Power Pros policy questions; no invented rules. Do not claim the commissioner score-only/on-behalf workflow is implemented unless role handling and override reason are supported. |
| P1 · UX-01/UX-03 | Submit multiple invalid fields. The HTTP response provides field-addressed issues, but the form extracts only the first message. Back to score clears the failure that explains what to repair. | Display all supported structured issues persistently, retain inputs and useful retry, and navigate to the relevant existing section/field. Unknown issues must remain readable without broken links. |
| P2 · linescore data loss | Enter distinct inning scores, hide innings, then show them. Existing synchronization rebuilds the array by putting the direct final score into inning one, discarding the entered scoring sequence; hiding can also display a stale direct score. | Preserve the actual linescore and current final score across visibility changes. If direct totals later change, do not silently invent a scoring distribution. Test this separately from metadata bookkeeping. |

## Resolution and adversarial review

Both score-step and review batting/pitching callbacks now use the same [row correction reconciler](../../../client/src/lib/report-corrections.ts). Repeated edits retain the original observation and latest value; removing a row prunes its unowned namespace without affecting the other team or a two-way player's other section. Scalar and inning handlers use the same correction state, and inning truncation also removes discarded correction keys. Manual fields without OCR provenance do not acquire invented observations.

Independent review found a blocker in the first duplicate-removal implementation: edit duplicate A from two hits to three, retain duplicate B with four hits, then remove A. Keeping the shared player-keyed correction would attribute three hits to B. The implementation now invalidates ambiguous corrected keys when a duplicate changes or disappears. Ambiguous cloned edits discard their namespace rather than guess which source row supplied the observation.

The reviewer also found the edit-then-reassign variant: remapping either duplicate could copy that three-hit correction into two different identities. The page now prunes ambiguous source provenance before invoking the actual roster helper and migrating correction keys. A regression exercises remapping both the edited and untouched row, retaining their three/four-hit statistics while preventing a sibling's correction from being copied. This conservative loss of ambiguous provenance is intentional; the underlying entered statistics remain intact. Immutable source-row identity is still a future data-model concern.

The complete-report form now states its batting, pitching, innings, current score-range and no-tie requirements before entry. Its local gate requires both teams' detailed sections and innings for submissions and edits. The existing minimum nine-batter rule remains current application policy, not an assertion about Frisk's unconfirmed Power Pros rules. Manual batting addition now allows a roster pitcher to appear as a batter.

The [feedback parser](../../../client/src/lib/report-errors.ts) retains structured issues from the actual server validator and `apiRequest` encoding, with team, one-based row and readable statistic labels. The [feedback component](../../../client/src/components/report-errors.tsx) provides an accessible persistent alert and keyboard-operable section actions. Malformed bodies receive a readable fallback; unknown paths do not invent navigation destinations; server text is rendered as text. POST/PATCH keep the raw error for this parser, and Back/forward transitions and successful identity repair no longer discard all feedback. Source review caught and corrected the header Back handler and team-hit/team-error section mappings. Navigation currently targets sections, not individual stat inputs.

The separate `hasLineScore` state makes collapse a visibility operation: the entered innings continue to determine displayed and submitted scores. Reopening no longer reallocates the total into inning one. Initial activation explicitly tells the coach to enter the scoring distribution, with final scores calculated from those innings. These page callbacks received source review; their complete browser journey remains open.

## Independent verification

| Gate | Result | Evidence boundary |
| --- | --- | --- |
| Complete configured unit suite | **117 passed**, exit 0 | Reviewer execution after final helper and field-target fixes. Includes 11 correction tests and five error-parser tests. |
| New feedback browser gate | **31 assertions passed**, exit 0 | Reviewer ran the actual feedback component in installed headless Edge, a fresh context and a synthetic draft/navigation host at 375 pixels. |
| Existing OCR browser regression | **45 assertions passed**, exit 0 | Reviewer reran the actual OCR component fixture; identity, statistics and prior interaction checks remained green. |

Commands: `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts`, `node --import tsx scripts/verify-report-errors.ts`, and `node --import tsx scripts/verify-ocr-review.ts`.

The [correction suite](../../../tests/unit/reportCorrections.test.ts) covers repeated score/review-style updates, original observation retention, reversions, manual/no-op edits, pitching strings/decisions, removals, namespace isolation, duplicate ambiguity, inning truncation and duplicate edit/reassignment with the real roster helper. The [parser suite](../../../tests/unit/reportErrors.test.ts) uses actual server-validator output and covers errors, warnings, malformed bodies, row labels and mapped destinations. These pure tests call the shared implementation; they do not mount the full report page.

The [feedback browser harness](../../../scripts/verify-report-errors.ts) checks every issue remains visible, accessible alert naming, readable row/stat context, keyboard navigation callbacks, synthetic draft retention, feedback persistence, malformed and permission responses, literal untrusted text, unknown fields and clearing. It makes no external requests and closes its browser/server and removes its owned bundle directory. The [OCR harness](../../../scripts/verify-ocr-review.ts) also cleaned its owned fixture. Neither browser fixture loads production CSS/media or executes the parent report-page callbacks, authenticated submission, reload or server persistence.

## Acceptance boundaries and remaining work

Initial source review covered the actual [POST/PATCH routes](../../../server/routes/games.ts), [supplied-data validator](../../../server/lib/validateBoxScore.ts), [roster validator](../../../server/lib/validateReportedResult.ts), [report page](../../../client/src/pages/report-game.tsx), [review component](../../../client/src/components/ocr-review-screen.tsx) and the [previous audit](W02_BATCH_02_AUDIT.md).

The route distinction matters: coach POST requires a full report; commissioner POST can omit detailed rows, and reporting on behalf of another team requires an override reason; PATCH requires nonempty detailed sections. The current form always emits both box objects. This batch improves the complete-report form; it does not deliver an explicit commissioner score-only/on-behalf flow. The missing override-reason control remains part of UX-01's open role-workflow acceptance.

No database route or schema changed in this batch, and the reviewer did not rerun the HTTP/PostgreSQL gate. The previous batch's 83-assertion result is historical evidence, not a new result. The parent owns final TypeScript validation and records that outcome in the batch evidence.

Before closing UX-01/UX-03, verify the complete report-page journey: first-entry requirements, role restrictions, actual section focus/opening, POST and PATCH failures with multiple fields, Back/forward repair, retained state and successful retry. Verify linescore activation/collapse/truncation and the final submitted correction payload through those real callbacks. Richer field focus, roster-fetch recovery, draft persistence, score-only completeness and immutable revisions remain separate acceptance; this batch does not silently close them.

Source review, pure test execution, isolated component interaction and full application journeys are different evidence. The complete client/media build and full report-page rehearsal remain open unless separately executed. This audit does not certify OCR recognition, Power Pros ending/innings policy, manual draft recovery, immutable server revision history, full-season simulation or human enjoyment.
