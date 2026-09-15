# W02 batch 05 — score-only entry and participating-coach notifications

Date: September 15, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `72874e25c3eb9e8bd751cb44c0e205836370353a`.

**Outcome:** commissioners have an explicit score-only option for new reports. Missing statistics remain unknown, and on-behalf pending reports notify both participating coaches. The [independent audit](audits/W02_BATCH_05_AUDIT.md) separates these verified behaviors from the still-open full application and release gates.

## Delivered behavior

- New commissioner reports offer Full report and Score-only modes. Full mode remains the default. Score-only is unavailable to ordinary coaches and on edit/PATCH; current server authority and on-behalf reasons still apply. Missing role data fails closed.
- Score-only entry has separate final-score draft values. Switching modes retains the full report's innings, rows and correction state. Its shared payload builder deliberately omits corrections and sends null hits, errors, inning scores and box data, preventing retained full-report data from leaking into submission.
- Score-only review explicitly labels unrecorded data and does not show zero-filled batting or pitching summaries. It does not depend on roster loading or hidden full-report validation. The current 0–30/no-tie checks still apply; these remain existing app restrictions, not newly approved Power Pros rules.
- Migration `0050_report_unknown_summaries` allows null hits/errors in game reports. It changes no historical values and retains existing defaults. Server startup/readiness now requires that migration. No historical zero is guessed to mean missing.
- Explicitly unknown score-only reports finalize with the actual score and no fabricated box score or player-season lines. Known summary-only totals remain preserved; mixed known/null summaries retain their null values. Sparse summary boxes do not invent unreported AB, RBI or other counters.
- Pending-report recipients come from the game's actual teams. On-behalf reports notify both participating coaches; ordinary coaching reports notify the opponent. Recipient IDs are deduplicated and exclude the reporter and unrelated coaches. Wording identifies a commissioner submission accurately. Confirmation notices say the result was recorded without claiming missing player stats were updated.

Source: [mode control](../../client/src/components/report-entry-mode.tsx), [payload builder](../../shared/reporting.ts), [form integration](../../client/src/pages/report-game.tsx), [report routes](../../server/routes/games.ts), [finalizer](../../server/game-finalizer.ts), [recipient helper](../../server/lib/report-notification-recipients.ts), [migration](../../server/migrations/0050_report_unknown_summaries.sql).

## Verification

- Full configured unit suite: **126 passed** in parent and independent QA runs. Includes payload omission, retained input, reason handling and recipient selection/deduplication.
- New mode browser gate: **31 assertions passed** by implementer and independent QA. Uses the actual component and shared builder with synthetic parent state at 375 pixels; keyboard selection, focus, retained draft and unknown payload fields are covered.
- Real HTTP/PostgreSQL gate: **229 assertions passed** by implementer and independent QA. Retains prior authority, invalid-result and finalization checks; adds actual inbox rows, exact score-only payload storage, finalization without invented lines and preservation of supplied totals.
- Populated upgrade: recreate the prior NOT NULL constraints, remove only the new fixture migration marker, confirm readiness fails, run the real migration runner, confirm only `0050` applies and readiness succeeds, and compare existing report rows unchanged. Subsequent explicit-null submissions prove the new schema accepts unknown values.
- TypeScript: full project plus updated HTTP script passed; mode component and harness passed standalone checking. Git whitespace, documentation links and tracker coverage also passed.

The integration fixture uses owned synthetic databases and real authenticated sessions. Tests verify both primary and co-commissioners, no-team and unrelated-team reporting, unauthorized coach bypass rejection, missing reasons, normal opponent-only routing, and finalization through confirmation and force-finalization. Notification evidence is persisted inbox rows, not messages sent to real people. All owned report databases and browser output were cleaned; the local PostgreSQL cluster was stopped with no listener on its fixture port. Existing baseline data was preserved.

## Remaining gates and next production step

W02-NOTIFY-01 is verified on recipient correctness and persisted inbox evidence. Inbox writes remain best-effort service calls; this does not establish an atomic outbox, durable retries or human delivery. Report creation, corrections, audit and finalization still need W03's coherent revision/receipt and recovery design.

UX-01/UX-03/UX-07 remain implementing until full-page role/error/retry journeys pass on the [complete-media build](BUILD_PREREQUISITES.md). Mode state, form callbacks and visibility guards received source review and typechecking; the component harness does not run the complete authenticated report page or prove reload recovery. Mobile visual quality and human usability are still unverified.

Unknown-stat handling here covers the explicit new score-only path and preservation of supplied summary values. Legacy omission defaults, historical zeroes, broad partial-report displays, external roster revisions and editing score-only reports remain separate work. The existing against-CPU behavior is unchanged by source inspection; do not infer a new rules decision or broad mode certification.

The audit retains mixed-summary display and recap completeness under UX-07: existing box-score UI can coerce null H/E to zero and summary boxes can be treated as complete. These are not certified by the new all-unknown path.

Next advance dependency-ready W03 report revision and finalization work: inventory accepted-result mutations, specify revision/receipt invariants, and implement a first verified integrity slice. Continue full-page prerequisites and [Power Pros contract inputs](POWER_PROS_CONTRACT_INPUTS.md) independently without inventing missing league rules. No merge, deployment or production-data operation occurred.
