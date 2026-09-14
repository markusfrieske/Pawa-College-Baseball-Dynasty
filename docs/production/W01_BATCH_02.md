# W01 batch 02 — PostgreSQL bootstrap repair

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. Implementation commit: `fe77dde7157eb50deb77293dc7142a7008e5be5f`.

**Result:** An empty disposable development database can now install the shared schema and all 20 numbered migrations. The previously blocked synthetic database resumed at 0032 and completed through 0049. Real HTTP readiness and the previous league-access/legacy-PBP containment checks pass after migration.

## Changes

- Replaced invalid `ADD CONSTRAINT IF NOT EXISTS` in migration 0032 with a PostgreSQL `DO` block. Its catalog guard is scoped to the target table, preserving a correct pre-existing foreign key without confusing a same-named constraint on another table.
- Removed the custom SQL statement splitter. PostgreSQL parses each entire migration file within the runner's transaction, including dollar-quoted blocks. Removed error-message swallowing; an unexpected SQL error rolls back that migration and does not add a successful ledger entry.
- Added `npm run db:bootstrap:test`, restricted to an explicitly selected, empty loopback test database. It installs current shared schema, then numbered migrations, and refuses schema push over existing relations. This helper is not an upgrade procedure for a played league.
- Added `npm run test:migrations` to the release gate. It creates and cleans up its own randomly named test databases. Bootstrap, migration tests and access tests reject URL query overrides that could change the actual connection target.
- The production-access regression now checks actual HTTP migration readiness before its role/cache/DTO/PBP checks. It therefore requires a fully bootstrapped test database rather than shared schema alone.

The edited historical migration runs only where its ledger entry is absent. The repair does not delete or falsify ledger records to force replay on an already migrated environment.

## Verification and milestone audit

The [independent game-dev technical audit](audits/W01_BATCH_02_AUDIT.md) accepted this bounded milestone after resolving SQL, parser, transaction-error and test-connection findings. No blocking finding remains in this change. Technical integrity and security/QA were the relevant review lenses for this infrastructure milestone; no gameplay-enjoyment claim is made.

| Evidence | Result |
| --- | --- |
| Independent migration regression | 39 assertions passed across three isolated PostgreSQL 18.4 databases, including six assertions for connection-override rejection. |
| Fresh bootstrap | All 20 numbered migrations recorded; readiness changes from false to true. |
| Repeated runner and unsafe helper retry | Runner applies nothing and preserves timestamps/data. Bootstrap helper refuses a populated database and preserves it. |
| Existing foreign key | All migrations complete with a correct pre-existing target FK and no prior ledger, preserving the synthetic fixture records. |
| Failure and retry | An intentional orphan produces SQLSTATE 23503; 0032 and its earlier index creation roll back, prior successful migrations stay recorded, and readiness remains false. Repairing the synthetic reference permits a successful retry from 0032. |
| FK behavior | Invalid references are rejected; deleting a referenced version preserves the share and sets its reference to null. A same-named constraint on another table cannot bypass the guard. |
| Previously blocked database | Parent resumed the retained W01 synthetic database from 0032 through 0049 successfully. |
| HTTP regression | Actual `/health/ready` returns 200; all prior role/cache/DTO/PBP checks pass. The script reports 1,312 assertions, mainly recursive DTO-field checks, not independent scenarios. Authentication remains test-only session injection. |
| TypeScript | Project check passed; independent targeted checks for the new standalone scripts passed. |
| Cleanup | Parent verified zero migration fixture databases remained and stopped the owned local cluster; no listener remained on its test port. |
| Whitespace | `git diff --check` passed. |

## Limits and next work

TI-12 is **implementing**, not verified. The bootstrap slice has evidence; concurrent startup locking, migration checksums, an immutable production baseline, sanitized historical upgrades, crash/restart/backup recovery and required asynchronous startup transformations remain open. The independent audit also records the older 0043 standings-index compatibility risk for a multiseason database with missing migration history. Do not bypass such failures by deleting user data or manufacturing ledger entries.

Full application startup, actual login/session persistence, a complete media build and browser/mobile testing remain W01 runtime gates. PostgreSQL compatibility beyond the tested local version remains unverified. The full release gate has not passed, and these changes have not been deployed.

Next continuation: verify real login, PostgreSQL-backed sessions and restart behavior in a disposable runtime, and resolve the complete-media build prerequisite on an appropriate checkout/device. Capture the essential Power Pros edition/endings/roster/reporting inputs before finalizing W02's result-validation contract. Consult updated tracker evidence before selecting work; do not repeat the now-passing 0032 bootstrap investigation.
