# W03 batch 02 - reviewed report decisions and atomic provenance

Work begun September 16; checkpointed September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: 1c7b244ab4e64c0395e8c292180f3039b1033c71.

Confirmation, dispute and commissioner finalization now act only on the report version actually reviewed, and required decision records share their transaction. This advances TI-05 without closing immutable accepted-result identity, creation or recovery gaps. See the [independent audit](audits/W03_BATCH_02_AUDIT.md) and updated [revision contract](REPORT_REVISION_CONTRACT.md).

## Delivered behavior

- All three decision endpoints require `expectedEditVersion`. Invalid/missing tokens produce field-addressed 422 errors. Stale or terminal report decisions conflict with 409 and no mutation. The field retains its name but now increments on disputes and acceptance as well as commissioner body edits.
- Game then report locks recheck the requested version, the server's prepared report version/status, and legal state before decision writes. Reported finalization also rejects changed schedule fields used during preparation. A game-complete flag or finalization receipt independently blocks a new acceptance.
- Confirmation and commissioner finalization update report status/version/actor and required audit in the same transaction as the existing game receipt, result, standings, stats, rest, single-game coach effects and GAME_RESULT event. Force-finalization audit retains original and resulting scores plus reported/corrected resolution source. Invalid corrected baseball data remains rejected.
- Dispute reason/proposed score, disputed state, version and audit commit together. Supplied PATCH correction provenance now commits with body/version/edit audit, closing batch 01's postcommit correction-write gap.
- CPU submissions create pending reports and use the same guarded acceptance. A failed acceptance cannot leave a falsely confirmed report; its earlier submission audit says automatic confirmation was requested. Initial creation and submission audit/corrections still need a shared transaction.
- Schedule and commissioner actions send the version associated with displayed content. An open dispute copies its game/version/scores, retains them on errors and closes only after success or explicit cancellation. Missing version data disables decisions. Schedule DTOs expose the version; edits/decisions invalidate cache.
- Secondary report-feed/inbox lookup failures are logged after committed decisions and cannot turn those successes into HTTP 500. This is best-effort delivery containment; it is not a durable notification outbox.

## Verification

- Real HTTP/PostgreSQL: **534 passed** assertions, independently repeated by QA. Covers token validation, stale/terminal no-write snapshots, authority and existing baseball rules, transaction fault rollback, correction provenance, CPU outcomes and secondary-feed failures.
- Seven deterministic lock-queued races exercise both edit/confirm orders, both dispute/confirm orders, both edit/finalize orders and duplicate confirmation. Each same-version pair has one success and one conflict; persisted report status, version, receipt and audit agree.
- Unit suite: **129 passed**, including copied reviewed-state preservation and invalid-token fail-closed behavior.
- TypeScript: full project and final extended report-HTTP configuration passed. Whitespace, tracker coverage and evidence links checked before checkpoint.
- All owned disposable report databases and HTTP children were cleaned. The fixture PostgreSQL cluster is stopped and port 55432 has no listener; existing baseline data was preserved.

## Audit and next gate

The independent review required three integration fixes before acceptance: preserve success after ancillary feed failure; retain original/corrected-score resolution in the decision audit; and remove the submission audit's premature CPU-confirmation claim. All are included and fault cases are exercised.

TI-05 remains implementing. The unique game sentinel still lacks an immutable accepted content reference; repeated completed decisions return conflict rather than the same receipt. Next implement append-only report revisions, receipt-to-content identity and retry/recovery semantics, including initial creation under the shared game eligibility lock. Required role/roster snapshots, immutable evidence, cross-game coach/rest ordering, durable batch effects, amendments and full restoration remain open. No claim is made that all simulation advancement or concurrent league-wide projections are safe.

Full authenticated browser journeys, conflict comparison/reload usability and visual quality remain open behind the [media prerequisite](BUILD_PREREQUISITES.md). Client token flow received source review, typechecking and pure regression tests; these do not prove human usability. No unknown [Power Pros rules](POWER_PROS_CONTRACT_INPUTS.md) were invented. No merge, deployment or production-data operation occurred.
