# W03 batch 01 - commissioner report edit integrity

Date: September 15, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: 679a2034c4358abe3cfafc30c7c638ce36fa46c4.

Commissioners can no longer silently overwrite another commissioner's report edit from an older draft. The report body, edit version and required edit audit now commit together. This is the first bounded W03 slice; TI-05 moves to implementing, not verified. See the [independent audit](audits/W03_BATCH_01_AUDIT.md) and [accepted-revision contract](REPORT_REVISION_CONTRACT.md).

## Delivered behavior

- Migration 0051 gives existing and new reports edit version 1 and advances migration readiness. GET returns that version. PATCH requires a positive PostgreSQL-range integer `expectedEditVersion`; missing or malformed values return field-addressed 422 errors.
- The edit service locks the game then report, matching finalization's game-first order. It checks game completion and the finalization receipt independently, permits only pending/disputed reports, and rejects stale versions with 409. Two requests based on the same version cannot both succeed.
- Validated report content, exactly one version increment and the authenticated edit audit share one transaction. Audit details bind game, report, prior/new versions and resulting scores. An audit insert failure rolls back all three.
- The report page captures the version alongside the initial draft. Background refetches do not overwrite that draft or adopt a newer token. Game/mode changes remount the draft; absent version data blocks submission. Existing structured error handling preserves a rejected draft for review, with a reload instruction on conflict.
- Existing commissioner authority, full-box-score PATCH requirements, current-roster and baseball validation remain enforced.

## Verification

- Existing unit suite: **127 passed**, independently repeated by QA.
- Real HTTP/PostgreSQL regression: **291 assertions passed**, independently repeated by QA. Covers authenticated roles, malformed tokens, exact audit actor/details, GET version round trips, simultaneous same-version edits, stale all-table no-write snapshots, subsequent valid edits, pending/disputed policy, completed-game and receipt-only rejection, and injected audit-failure rollback.
- Populated migration fixture removes the new edit column and 0050/0051 receipts, reruns the real migration runner and verifies old report content is preserved, versions backfill to 1, nullable summaries remain supported and readiness reaches 0051. Fresh synthetic bootstrap is covered too.
- TypeScript: full project and the extended report-HTTP configuration passed. Git whitespace and tracker/link consistency checked before checkpoint.

Only owned disposable report databases and HTTP processes are used. Cleanup status: no disposable report databases remain, the local PostgreSQL cluster is stopped and port 55432 has no listener. The existing local baseline is preserved.

## Critical limits and next batch

This counter versions commissioner body edits only. It is not immutable revision history or the identity of an accepted result. Confirm/dispute currently read a report before locking finalization and can act on stale content. The next dependency-ready batch must implement reviewed-snapshot guards and transactional transitions with controlled edit/confirm/dispute interleaving tests; do not repeat the now-completed mutation inventory as a substitute for development.

OCR correction persistence still runs after the edit transaction. A correction failure may return 500 after the body/version/audit have committed; retrying the old token then conflicts. Only edit-audit failure rollback is certified here, not all PATCH failures. Move required correction provenance into the revision transaction under TI-05/TI-10. Accepted receipt identity, per-game durable effects, replay/recovery and corrected-result reconciliation remain W03 gates.

Client hydration/refetch integration is source-reviewed and typechecked, not exercised in the full authenticated browser page. The [complete-media prerequisite](BUILD_PREREQUISITES.md), broader UX-01/03/07 gates and [Power Pros rules inputs](POWER_PROS_CONTRACT_INPUTS.md) remain open. No merge, deployment or production-data operation occurred.
