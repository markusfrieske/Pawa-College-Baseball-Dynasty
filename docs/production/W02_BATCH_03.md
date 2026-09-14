# W02 batch 03 — reporting feedback and correction continuity

Date: September 14, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `e66da49fcce3399126a7e7d69fd20315a649ce5e`.

**Outcome:** the reporting form retains structured validation feedback and uses the same correction bookkeeping across score entry and OCR review. The [independent audit](audits/W02_BATCH_03_AUDIT.md) passes bounded W02-OCR-01 acceptance. UX-01 and UX-03 move to implementing; their full workflow acceptance remains open.

## Delivered

- All supported server issues remain visible with readable team, section, one-based row and stat labels. Keyboard-accessible Review buttons navigate to known sections. Batting-derived hits lead to batting; errors lead to Hits/Errors; final scores lead to innings when a linescore is active. Unknown paths remain readable without invented destinations. These are section links, not exact-field focus.
- Both POST and PATCH keep their raw structured error for the persistent component. Back, forward and identity repair preserve feedback. A retry replaces it. Toasts use the same safe summary; malformed HTML/JSON responses produce a readable fallback. React renders message content as text.
- The form now states its current full-report requirements before entry: innings, both teams' batting/pitching, current nine-batter minimum, score range and reconciliation rules. Local submission gates cover missing required sections. This is the existing complete-report workflow; commissioner score-only and on-behalf override flows remain incomplete.
- One atomic correction state records repeated edits in both phases, retaining the original OCR observation and latest value. Shared row callbacks track edits and prune removed namespaces while preserving other teams and two-way players.
- Ambiguous legacy duplicate edits/removals invalidate unverifiable correction history conservatively. Reassignment first clears an ambiguous source namespace so a correction belonging to one duplicate cannot be copied onto its sibling. Actual row stats remain intact.
- Inning edits update any existing final-score provenance; shortening the linescore prunes removed inning keys. Collapsing inning entry now changes visibility only: the actual sequence and authoritative totals remain included. Reopening no longer puts the entire score into inning one. Once enabled, totals come from entered innings; the form explains this transition.
- Score-step batting permits roster pitchers to be added as two-way participants and uses row keys that tolerate legacy duplicate IDs.

See the [correction helper](../../client/src/lib/report-corrections.ts), [error parser](../../client/src/lib/report-errors.ts), [error component](../../client/src/components/report-errors.tsx) and [report page](../../client/src/pages/report-game.tsx).

## Verification

| Check | Result and scope |
| --- | --- |
| Full configured unit suite | 117 passed in parent and independent reviewer runs. |
| New affected tests | 11 correction tests and 5 feedback tests; included in the full suite and independently exercised. |
| New feedback browser gate | 31 assertions passed by implementer and independent reviewer using installed headless Edge. |
| Existing OCR browser gate | 45 assertions passed by independent reviewer as regression coverage. |
| TypeScript | Full project passed; feedback harness/fixture/tests also received a standalone check. |
| Documentation / Git | Links, tracker coverage and whitespace checked before checkpoint. |

The correction regressions include review-to-score repeated edits, removal, namespace isolation, derived-score bookkeeping, inning truncation, duplicate invalidation and the actual roster helper after ambiguous source cleanup. Feedback tests consume the actual server validator's issue shape through the API error encoding. The browser fixture checks the actual component, accessible alerts and keyboard callbacks with retained synthetic host state; it blocks external requests and cleans its owned browser, loopback server and output.

No server, database schema or route implementation changed. The previously passing HTTP/PostgreSQL report gate was not rerun for this client slice. No database was started or production data used.

## Evidence limits and next work

The browser harness uses synthetic host callbacks, not the report page. Parent callbacks, linescore visibility, payload construction and error-section focus received source review and TypeScript verification; their complete browser journey remains open on the [media-complete build](BUILD_PREREQUISITES.md). Component viewport checks do not certify mobile layout, visual quality, draft persistence or human enjoyment.

Hit totals are derived from batting rows; existing OCR metadata does not independently track score-level hits. This batch tracks actual batting-hit corrections rather than fabricating a separate observed total. Ambiguous duplicate source history is discarded when it cannot be attributed safely; this client bookkeeping is not immutable server revision history.

Next advance the remaining role-aware reporting contract: commissioner on-behalf override reason, explicit supported score-only behavior, accurate required-field guidance per role, and error destinations/retry that work in the full page. Preserve the current server authority until those paths have integration evidence. Then advance W03 revision/finalization work. [Power Pros edition and league rules](POWER_PROS_CONTRACT_INPUTS.md) remain unanswered; no edition-specific rule was invented.

The hourly development cadence continues with an independent audit before each milestone checkpoint. No merge or deployment occurred.
