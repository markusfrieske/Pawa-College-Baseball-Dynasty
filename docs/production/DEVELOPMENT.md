# Development setup and verification

## Runtime baseline

Use **Node.js 24.19.0 and npm 10.9.9** to reproduce the September 14, 2026 portable-install verification. This is the verified Windows ARM64 development baseline. Other devices, deployment, and CI still need their own install and release-gate evidence; this note does not certify those environments.

Install from the committed npm lockfile:

```sh
node --version
npm --version
npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund --foreground-scripts
```

If the development runtime supplies pnpm but no npm executable, the equivalent tested invocation is `pnpm dlx npm@10.9.9 ci --registry=https://registry.npmjs.org/ --no-audit --no-fund --foreground-scripts`. Keep using the npm lockfile; do not generate a pnpm lockfile as a setup workaround. `--no-audit` and `--no-fund` remove unrelated network/reporting work from this install check; dependency security triage remains a separate release task.

Do not use `--ignore-scripts` for runtime certification: bcrypt and esbuild have installation steps. On Windows ARM64, the optional `bufferutil` build can report missing Visual Studio C++ tools while npm still succeeds. The September 14 verification exercised WebSocket operation with `WS_NO_BUFFER_UTIL=1`, along with bcrypt hashing/comparison and an esbuild TypeScript transform. This proves those smoke checks, not full application compatibility or WebSocket performance under load.

## Local checks and server setup

Run the database-free checks after installing:

```sh
npm run typecheck
npm run validate:data
npm run test:unit
npm run test:rest:unit
```

The application requires a disposable PostgreSQL database supplied through `DATABASE_URL`. Bootstrap, migration, and restore verification are separate W01/W04 production work; a successful package install does not establish a valid database. Keep local configuration and credentials outside version control, and use a disposable database for integration fixtures.

The existing `dev` and `start` package scripts use POSIX environment-variable assignment. In PowerShell, launch development after configuring the disposable database and any required local application settings with:

```powershell
$env:NODE_ENV = 'development'
node --import tsx server/index.ts
```

This is a shell-compatible equivalent of the development entry point, not evidence that server startup or database bootstrap passed. On a POSIX shell, use `npm run dev`.

For a newly created, empty local test database, set `PAWA_TEST_DATABASE_URL` and run `npm run db:bootstrap:test`. The helper installs the shared schema and then all numbered migrations. It refuses an existing public relation, preventing accidental schema push over populated data. Do not run `db:push` to upgrade a played league. A failed numbered migration leaves its transaction rolled back; repair the cause and rerun the numbered runner, or create a new disposable database for a fresh-bootstrap test. The bootstrap helper deliberately refuses a nonempty retry.

Run `npm run test:migrations` with `PAWA_TEST_DATABASE_URL` naming an existing local test database and a local role allowed to create databases. The gate creates three randomly named databases, tests bootstrap, repeat-run preservation, existing-constraint compatibility, FK rollback/retry and constraint behavior, then removes only databases it created. It also verifies that all three test entry points reject URL query overrides before connecting. An unexpected failure is a failed gate, not a skip.

Run `npm run test:production-access` against the bootstrapped database. It now requires HTTP migration readiness before the access checks. All three commands require an explicit loopback PostgreSQL URL without query parameters, with a database name matching `pawa_test_*` or `pawa_wNN_test`, and refuse a `DATABASE_URL` fallback. The access script creates unique synthetic fixtures, exercises real HTTP routes/storage with test-only session authentication, and cleans up only its own rows. Login and production session storage are separate integration gates. See the [database spike](DB_SPIKE.md) for local PostgreSQL setup and [W01 batch 02](W01_BATCH_02.md) for the verified migration repair and limits.

Build on a checkout containing the required media assets and run `npm run release:gate` in the configured release-test environment. That gate includes migration and production-access checks (with their explicit local database/role requirements), build, database integrations, browser tests, rest integration, and database invariants. Review skipped tests explicitly. An incomplete media checkout or unavailable test database must be recorded as an incomplete gate.

## TI-13 implementation evidence

- Normalized exactly **116** `resolved` URL prefixes in `package-lock.json` from the Replit-private npm proxy to `https://registry.npmjs.org/`.
- Parsed the original and edited lockfiles and asserted deep structural equality after applying only that prefix transformation to the original. All **844 package entries**, dependency versions, integrity hashes, and other metadata are unchanged. Zero private-proxy prefixes remain.
- Copied only the package manifest and edited lockfile into a fresh disposable directory. Ran npm **10.9.9** `ci` with lifecycle scripts enabled using Node **24.19.0**, Windows ARM64: **exit 0; 723 packages added in 19 seconds**. The existing working checkout's `node_modules` was preserved.
- Required bcrypt and esbuild lifecycle steps succeeded. The optional bufferutil compilation reported missing Visual Studio C++ tools; npm completed successfully. Deprecation notices were also emitted and are not resolved by this URL-only repair.
- Verified bcrypt hashing/comparison, an esbuild TypeScript transform, and a loopback WebSocket round trip with bufferutil explicitly disabled. Asserted each tested package resolved from the disposable installation.
- This evidence closes the observed private-registry download defect for the tested environment. The original audit's complete release-gate requirement and cross-device/deployment verification remain outstanding; do not mark the overall TI-13 release acceptance verified from this install alone.

See the [production schedule](PRODUCTION_SCHEDULE.md), [finding tracker](FINDING_TRACKER.md), and [original technical audit](../audits/2026-09-14/technical-integrity.md) for remaining gates and ownership.
