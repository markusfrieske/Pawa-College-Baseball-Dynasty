# W03 batch 03 - retained report history and accepted-result receipts

Date: September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: f1df9046d8198d70e2dbe6f586351155b461e37c.

Submitted reports, edits, disputes and acceptance now preserve their observed content as immutable report-state snapshots. An accepted reported result identifies its exact snapshot and decision; repeating that same authorized decision returns the existing receipt without applying effects again. The [independent audit](audits/W03_BATCH_03_AUDIT.md) covers the bounded history/retry slice. TI-05 remains implementing for the wider authority, evidence and recovery contract.

## Delivered behavior

- Migration 0052 creates unique report/version snapshots with actor, event, content and supplied edit/submission correction provenance. Direct snapshot updates/deletes are rejected by PostgreSQL. Explicit parent report/league deletion still removes its owned history and linked receipt; this is retention within the league, not an undeletable archive.
- Existing reports receive one `legacy-observed` baseline of the current stored version. Earlier versions, historical correction attribution and observing actor remain unknown. Timezone-less historical dates stay explicitly unspecified. Legacy finalization receipts receive no invented accepted revision or approving identity.
- New report creation takes the game lock, rechecks eligibility and the prepared schedule fields, and commits report, submission audit, corrections and first revision together. Edits, disputes and accepted results append snapshots inside their existing required transaction. Corrected-score acceptance preserves the actual accepted scores while prior versions remain intact.
- Accepted report receipts retain revision ID, report ID, approving actor, requested version, action and reported/corrected choice. Matching authorized confirm/finalize retries return that same receipt even after HTTP-process restart. Different actors, actions, versions or choices conflict. Concurrent identical confirmation requests each succeed with one receipt and one set of effects; replays skip ancillary notifications/events.
- Quick-score and other generic finalization paths cannot write a new result over an existing report under the common game lock. Existing generic finalization receipts preserve prior behavior; exact simulated-result retry identity and fail-closed advancement remain separate gates.
- An authorized history API serves a consistent snapshot to participating coaches and commissioners. Schedule box-score and commissioner report views expose a lazy-loaded history panel with official-version identification, current profile names, unknown statistics, correction counts, legacy uncertainty and refresh/error controls. Access failures hide cached history; query cancellation follows the authentication cache lifecycle.

## Audit-driven integration repairs

The existing save-restore format does not preserve the new ledger or accepted receipts. Restoring a league with current reports, or a snapshot containing reports, now fails clearly with 409 before destructive changes. A second check under the league lock covers concurrent insertion. **History-safe restore is not implemented:** W04 must replace this temporary guard after complete recovery tests. Capturing a save is not proof that all history can be restored.

An accepted reported-result league also exposed an existing deletion defect: league activity events were omitted from cleanup, causing the deletion transaction to fail. Cleanup now removes only the target league's events before its teams/games. The regression verifies owned history/receipt cleanup and unchanged unrelated league/users. It does not certify every mature-league deletion combination.

Review also corrected a history label that would have called every unlinked receipt old: newly simulated games can have unlinked receipts too. UI wording now states only that no accepted report version is linked. Existing inbox helpers already catch delivery failures; the additional submission catch is defensive containment, not evidence of a previously reproduced inbox failure.

## Verification

- Real HTTP/PostgreSQL: **654 assertions passed**, including populated migration, immutable snapshots, exact corrected content/actor/receipt linkage, initial/edit/dispute/accept fault rollback, deterministic creation/finalization races, process-restart no-op replay, authority, restore refusal and deletion isolation. The independent reviewer reran the final suite successfully.
- Real component browser: **47 assertions passed**, independently repeated. Covers lazy loading, keyboard controls, labels/unknowns, receipt badge, errors/retry, game switching, cached-success to access-denied removal, and basic native overflow at 375/1280 pixels. Uses real component with synthetic HTTP/React Query; production CSS and full authenticated page are not exercised.
- Unit suite: **129 passed**, independently repeated by QA.
- TypeScript: full project plus both updated regression scripts passed. The reusable UI script is included in `npm run test:report-history` and the release gate. The complete release gate remains blocked by the existing [media prerequisite](BUILD_PREREQUISITES.md).
- All owned report databases, HTTP fixtures and component browsers were cleaned. The local PostgreSQL fixture is stopped and port 55432 has no listener; existing baseline data was preserved.

## Next production step and limits

Next define and persist durable per-game effects so accepted results can be reconciled safely across games, retries and restoration. Address shared coach/player ordering and batch XP durability, then implement history-safe recovery before removing the restore guard. Continue stable authority/roster/rules and evidence manifests without inventing [Power Pros rules](POWER_PROS_CONTRACT_INPUTS.md).

Initial submission retries are not identity-bearing receipt replays, and CPU creation and automatic acceptance remain separate transactions: a failed acceptance leaves a valid pending report for recovery. Receipt mutation protection is enforced by application paths; historical snapshots have database immutability guards. Immutable evidence, authorized amendments/reversal, full simulated-result identity, outbox delivery and mature-save recovery remain open. Human usability, complete-page navigation and production visual quality require separate evidence. No merge, deployment or production-data operation occurred.
