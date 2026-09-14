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

Run `npm run test:auth-sessions` with the same explicit loopback test URL and database-creation role. This gate bootstraps its own random database and exercises real auth/PgStore sessions across separate HTTP processes, then removes its database and processes. It rejects URL query overrides. It verifies secure cookie attributes through simulated proxy headers, not browser TLS; it does not start background jobs or the production entry point. See [W01 batch 03](W01_BATCH_03.md) for evidence and limits.

Run `npm run test:production-startup` and `npm run test:stale-cleanup` with the same explicit loopback test URL and database-creation role. Each bootstraps and removes its own random fixture database. The startup gate bundles the actual production entry point with a synthetic HTML index, verifies middleware faults/recovery and starts real background infrastructure against empty fixtures. It does not replace the full client/media build or prove populated backfills/job processing. The cleanup gate exercises the real helper and manual CLI while preserving unflagged guest and normal saves. See [W01 batch 04](W01_BATCH_04.md).

The entry point honors `HOST` (default `0.0.0.0`) and a strictly numeric `PORT` from 0 through 65535 (default 5000; 0 selects an ephemeral test port). Windows disables `reusePort`. For local use, set `HOST=127.0.0.1` using your shell's environment syntax. These controls do not configure TLS or a deployment proxy.

Run `npm run test:static-serving` without a database to verify production static/SPA boundaries with owned synthetic files and real HTTP. The expanded `test:auth-sessions` also verifies direct-route revocation across monolithic, modular, storyline and protected object routes before `/api/auth/me`. See [W01 batch 05](W01_BATCH_05.md).

Run `npm run test:reported-results` with the explicit loopback test URL and database-creation role. It creates its own random database, exercises real report routes/session/storage, snapshots persisted state on rejected writes, checks positive full and score-only finalization, then removes its database and HTTP process. It does not certify historical recovery, concurrency or all baseball ending rules. See [W02 batch 01](W02_BATCH_01.md).

Run `npm run test:ocr-review` without a database to bundle the actual OCR review component with synthetic host state and exercise it in a fresh headless browser context. Windows uses the installed Edge channel by default; other platforms use an already installed Playwright Chromium browser. Set `PAWA_TEST_BROWSER_PATH` locally to select another compatible installed browser executable. The command does not download a browser or access a personal profile. It checks keyboard identity selection, preserved statistics, duplicate/two-way rules and review errors over loopback, then removes its own output and server. It does not load the full report page or production CSS/media. The reported-results gate separately submits a payload remapped by the real client helper through the actual HTTP/database validation. See [W02 batch 02](W02_BATCH_02.md).

Build on a checkout containing the [required media assets](BUILD_PREREQUISITES.md) and run `npm run release:gate` in the configured release-test environment. That gate includes migration, production-access, real session, stale-cleanup, actual-entry-point, static-serving, reported-result and isolated OCR-review checks (with their explicit local database/role requirements), build, database integrations, browser tests, rest integration, and database invariants. Review skipped tests explicitly. An incomplete media checkout or unavailable test database must be recorded as an incomplete gate.

## TI-13 implementation evidence

- Normalized exactly **116** `resolved` URL prefixes in `package-lock.json` from the Replit-private npm proxy to `https://registry.npmjs.org/`.
- Parsed the original and edited lockfiles and asserted deep structural equality after applying only that prefix transformation to the original. All **844 package entries**, dependency versions, integrity hashes, and other metadata are unchanged. Zero private-proxy prefixes remain.
- Copied only the package manifest and edited lockfile into a fresh disposable directory. Ran npm **10.9.9** `ci` with lifecycle scripts enabled using Node **24.19.0**, Windows ARM64: **exit 0; 723 packages added in 19 seconds**. The existing working checkout's `node_modules` was preserved.
- Required bcrypt and esbuild lifecycle steps succeeded. The optional bufferutil compilation reported missing Visual Studio C++ tools; npm completed successfully. Deprecation notices were also emitted and are not resolved by this URL-only repair.
- Verified bcrypt hashing/comparison, an esbuild TypeScript transform, and a loopback WebSocket round trip with bufferutil explicitly disabled. Asserted each tested package resolved from the disposable installation.
- This evidence closes the observed private-registry download defect for the tested environment. The original audit's complete release-gate requirement and cross-device/deployment verification remain outstanding; do not mark the overall TI-13 release acceptance verified from this install alone.

See the [production schedule](PRODUCTION_SCHEDULE.md), [finding tracker](FINDING_TRACKER.md), and [original technical audit](../audits/2026-09-14/technical-integrity.md) for remaining gates and ownership.
