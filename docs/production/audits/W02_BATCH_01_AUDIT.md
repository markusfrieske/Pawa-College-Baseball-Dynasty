# W02 batch 01 independent reported-result audit

Date: 2026-09-14. Review lenses: baseball data integrity, Power Pros companion compatibility and technical QA. The reviewer did not implement the validator, route changes or verification harness.

**Verdict: the bounded supplied-data and roster-validation changes pass independent review and runtime checks. No blocking finding remains in this batch. TI-03 remains in progress; TI-04 is contained at validation boundaries, with atomic correction work still open.**

## Findings and acceptance

| Severity | Reproduction and impact | Required acceptance |
| --- | --- | --- |
| P1 · TI-03 | Supply negative, fractional or nonnumeric player counters, missing player IDs, duplicate rows or a foreign team's player ID. Previously the validator could accept impossible history, finalization could silently discard missing IDs, and commissioner edits bypassed submission's roster checks. | Reject malformed or impossible supplied data before report or official-result writes. Validate each supplied row's identity on submission, editing and finalization. Revalidate stored reports rather than trusting earlier acceptance. |
| P1 · TI-04 | Propose a tied score, or apply a corrected final score while retaining the previous inning and batting totals. The previous force-finalize path bypassed the validator. | Reject invalid proposals and inconsistent corrected reports before writes. An accepted correction must reconcile the supplied score, innings and player totals. Atomic revisions remain a separate W03 requirement. |
| P2 · compatibility risk | Overly restrictive validation can reject substitutes, a player who bats and pitches, a pinch runner with runs but no at-bats, or a pitcher who records more strikeouts than outs after an uncaught third strike. | Check per-section duplicates while permitting the same roster player in batting and pitching. Do not require exactly nine rows, runs at most at-bats, RBI equal to runs, or strikeouts at most pitching outs. |
| P1 · gap found during implementation review | Validate only the visible form's numeric fields, then supply negative or nonnumeric advanced counters such as barrels, putouts or total chances. The finalizer also persists those fields. | Validate every known persisted counter when supplied, retain optional telemetry, and respect database integer bounds. The implementation was expanded before acceptance. |
| P2 · gap found during integration review | Submit positive batting hits while omitting the summary hit field. Validating an omitted value and subsequently storing its default zero would produce an accepted report that fails later revalidation. | Validate the exact summary defaults that will be persisted. A rejected report must leave no writes, and normal complete reports must still finalize. |

## Verification

The reviewer independently ran `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts tests/unit/boxScoreValidation.test.ts`. All **15 tests passed**, exit 0. These include table-driven invalid values for every known persisted counting field, missing core observations, malformed arrays and rows, identities, inning pairs, IP notation, safe baseball counting relations and compatibility with two-way players and substitutes.

The reviewer independently ran `node --import tsx scripts/verify-reported-results.ts` using the explicitly named loopback test database. It exited **0 with 81 passing assertions**. The [HTTP harness](../../../scripts/verify-reported-results.ts) uses real route registration, registration/session handling and PostgreSQL storage in a random owned loopback database. Rejected mutations compare snapshots of every public table except session housekeeping; the harness does not substitute a fake report repository. It removed its owned database and stopped its owned HTTP child on completion.

The HTTP checks cover invalid initial submissions and commissioner edits, including omitted summary hits after normalization; invalid score proposals; a valid proposed correction that contradicts the existing innings and therefore cannot finalize; stored foreign IDs rejected by both confirmation and force-finalization; direct service invocation; and the already-complete confirmation branch. A separate valid report finalizes successfully with exactly 18 mapped player season rows, one total run and hit, and the submitted 24/27 pitching outs assigned to the two roster pitchers. The same player appearing in batting and pitching produces one season row. Commissioner score-only finalization still succeeds without adding fabricated player lines. These are bounded positive examples, not a complete player-ledger or season certification.

Reviewed integration paths: [pure validator](../../../server/lib/validateBoxScore.ts), [roster and result validation](../../../server/lib/validateReportedResult.ts), [game routes](../../../server/routes/games.ts) and [reported finalization](../../../server/game-finalizer.ts). The service-level assertion runs before enrichment and official-result writes; route handlers convert its typed failure into a validation response.

## Remaining acceptance boundaries

- The league's Power Pros edition, innings, tie, mercy and other ending policies are not approved. Existing score bounds and supported-result restrictions must be identified as application behavior, not universal baseball rules. Legal innings and outs, walk-offs, shortened games and 31-plus-run rules remain TI-03 work. Pitching/batting reconciliation and complete game structures are not enforced by this batch.
- Commissioner score-only reporting already exists. Absence of statistics needs an explicit completeness state before this application can certify a league's complete record. Uncollected advanced metrics and missing observations must not be marketed as verified zeros.
- W03 still owns immutable revisions, roster snapshots, correction provenance, report/game atomicity and concurrency or fault-injection gates. A validation check before a transaction does not prove race safety.
- Pitcher decisions and derived statistics require separate baseball systems review. Existing finalizer inference of pitcher wins/losses and trust in supplied AVG/ERA display fields are not certified by checking numeric inputs.
- A server gate does not demonstrate the coach's OCR remapping experience, browser layout, draft recovery or human enjoyment. Full companion rehearsal remains open.
