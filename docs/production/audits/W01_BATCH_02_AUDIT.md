# W01 batch 02 independent game-dev technical audit

Date: 2026-09-14. Review lens: Gilfoyle technical integrity and Gibs security/QA. Conducted by an independent development agent reviewing the parent agent's implementation, with a separately authored PostgreSQL regression harness.

**Verdict: the bounded disposable-bootstrap milestone passes. No blocking finding remains in the reviewed change. TI-12 remains open; this is not approval to deploy or a full migration/recovery certification.**

The practical improvement is that a new development database can now acquire the shared schema and all numbered migrations, and failed migrations can be repaired and retried without falsifying their history. This enables subsequent game-development milestones to use real database tests.

## Findings resolved before acceptance

| Severity | Finding | Resolution | Evidence |
| --- | --- | --- | --- |
| P1 | Migration 0032 used PostgreSQL's nonexistent `ADD CONSTRAINT IF NOT EXISTS` syntax. | A dollar-quoted `DO` block checks the constraint catalog before adding the version-reference foreign key. The check includes its owning table, because other tables can reuse constraint names. | Fresh bootstrap passes; a pre-existing correct target FK is retained; a same-named constraint on another table does not bypass creation. |
| P1 | The custom SQL splitter did not understand dollar-quoted bodies, so the straightforward SQL fix would introduce a second bootstrap failure. | PostgreSQL now parses the whole migration file inside the runner's existing transaction. | All 20 files, including the new `DO` block, execute successfully on real PostgreSQL. |
| P2 | The runner swallowed text matching "already exists" after PostgreSQL had already aborted the transaction. | Removed message-based error suppression. SQL guards handle expected duplication, and unexpected errors roll back the file without recording its key. | An intentional orphan reference causes SQLSTATE 23503; the earlier index creation in 0032 rolls back, its ledger entry remains absent, and retry succeeds after repairing only the synthetic reference. |
| P1 | A validated loopback URL could contain query parameters overriding the actual PostgreSQL connection target. | Bootstrap, migration-regression, and HTTP-regression entry points reject URL query parameters before database work. | All three entry points independently reject a URL containing `?host=127.0.0.1&port=1` with their explicit override-guard message. No external host was contacted to test this case. |

Reviewed implementation: [migration runner](../../../server/lib/runMigrations.ts), [0032 SQL](../../../server/migrations/0032_class_library.sql), [bootstrap helper](../../../scripts/bootstrap-test-db.ts), and [regression harness](../../../scripts/verify-migrations.ts).

## Independently executed verification

The final regression invocation ran on the retained synthetic PostgreSQL 18.4 cluster, bound to loopback, using a process-local test credential. It created three randomly named databases exclusively for this run and removed all three successfully. It did not read production credentials, use a production database, or reset the shared local test database. The cluster remained running for the parent agent's final verification and shutdown.

`tsx scripts/verify-migrations.ts` exited **0**, reporting **39 passing assertions across three isolated databases**, plus the connection-override checks included in that assertion total.

1. **Fresh bootstrap and repeat:** the real bootstrap helper applies shared schema plus every numbered file from 0030 through 0049. The migration readiness predicate changes from false to true. Running the migration runner again applies nothing, preserves ledger timestamps, and preserves all synthetic user/class/version/share records. Running the bootstrap helper on the now-populated database refuses the operation and preserves both data and ledger.
2. **Pre-existing FK compatibility:** a new shared-schema database contains a valid version/share fixture and the correct FK but no migration ledger. All numbered migrations apply successfully without changing those fixture rows.
3. **Failure and repaired retry:** a synthetic orphan share and a same-named constraint on another table cause 0032 to fail with the expected FK violation. Only the successful 0030/0031 ledger records remain. The migration readiness predicate remains false, the target FK is absent, and 0032's earlier index is absent. Repairing the synthetic reference lets the runner resume at 0032 while preserving earlier ledger records and the repaired fixture data.

All three database cases check that the target FK rejects invalid version references and that deleting a referenced version preserves the share while setting `version_id` to null. The intentional 23503 stack trace printed during case 3 is expected regression evidence, followed by a passing result.

A targeted TypeScript invocation covering both new scripts passed with exit 0 after the final regression run. These scripts are outside the root TypeScript project's include list; the parent owns final project-wide verification. The parent separately reported successful actual-route HTTP readiness/access verification; this audit does not relabel that check as independently rerun here.

## Remaining W04 work and limits

- The general migration runner still lacks a cross-process migration lock and checksums. The bootstrap helper's advisory lock only coordinates calls to that helper on its target database. Concurrent ordinary application startups are not certified by this test.
- The development baseline is an explicitly empty database populated from current shared schema, then numbered migrations. It is not yet an immutable, versioned production baseline. Never run the helper or `drizzle-kit push --force` against an existing environment to upgrade it.
- A sanitized previous-release upgrade, interrupted process recovery, and restore from a backup still need separate scenarios. The tested SQL-error rollback is narrower than abrupt process termination or infrastructure failure.
- The existing 0043 migration temporarily creates an incorrect two-column standings uniqueness index before 0046 removes it. A multiseason database missing earlier ledger records can fail at 0043. Do not repair that condition by deleting data or manufacturing ledger entries; define and test the historical upgrade contract in W04.
- Historical migrations 0044 and 0049 include coach-data cleanup. The repeat-run test confirms applied migrations are skipped, but does not certify every possible legacy duplicate-data state or reconciliation policy.
- Required startup data transformations still include asynchronous and mark-before-completion paths in `server/index.ts`. Passing the numbered readiness predicate does not prove those transformations completed. Move required transformations into awaited, versioned work before closing TI-12.
- Full application startup, browser gameplay, game balance, save/restore integrity, production-version PostgreSQL compatibility, and release readiness are outside this narrowly tested milestone. Subsequent game-dev audits must inspect those behaviors when their milestones land.

Acceptance is restricted to W01 batch 02's bootstrap repair. Retain the original [TI-12 audit](../../audits/2026-09-14/technical-integrity.md) and its broader acceptance requirements in the production tracker.
