# W01 disposable database spike

Date: 2026-09-14. Scope: synthetic local HTTP authorization/cache tests, with no production credentials, records, or connections.

## Findings

- No PostgreSQL, psql or Docker command was available on CommandCenter. Common installation and app-cache locations did not contain PostgreSQL executables.
- The [official Windows download page](https://www.postgresql.org/download/windows/) links to [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries). The PostgreSQL 17.11 Windows archive measured 341,325,378 bytes; it was not downloaded.
- A smaller actual PostgreSQL distribution is available through the upstream [embedded-postgres project](https://github.com/leinelissen/embedded-postgres): `@embedded-postgres/windows-x64@18.4.0-beta.17`. The npm archive measured 40,606,855 bytes, with 109,333,174 unpacked bytes. This is a third-party distribution of PostgreSQL binaries, not a mock database. Its upstream downloader sources Zonky's embedded PostgreSQL binaries.
- Registry integrity for that exact package: `sha512-AwRerliA4IGWyW5jWBvHt5vidVUSB0QQW9Tt2y7ScnmifnCb/awfxZr4BkBSTv+gNt8Djcddqs+xSF5Z6/CkTg==`. Verify it before extraction. Direct archive extraction avoids modifying the main npm dependency tree and avoids automatic package scripts.

## Bootstrap contract

1. Keep archive, binaries, synthetic cluster, logs and harness inside an ignored `.local-db/` directory. Add `/.local-db/` to `.git/info/exclude` before creating it. Do not register a service or change global PATH.
2. Use `initdb` to create a new cluster with UTF-8 encoding and an explicitly selected test role. Start `postgres` with `listen_addresses=127.0.0.1` on an unused high port. Use `Start-Process -WindowStyle Hidden` for any background helper. PostgreSQL documents [cluster initialization](https://www.postgresql.org/docs/current/app-initdb.html) and [lifecycle commands](https://www.postgresql.org/docs/current/app-pg-ctl.html).
3. Set a process-local `DATABASE_URL` referring exclusively to that loopback cluster and a distinctive disposable database. Refuse non-loopback hosts or an unexpected database name before any bootstrap/cleanup operation. Never source an existing environment file.
4. Create the empty database, then run the repository's `drizzle-kit push` against `shared/schema.ts`. Numbered migrations begin at `0030_column_additions.sql` with `ALTER TABLE leagues`; migrations alone cannot create a fresh database.
5. Run the numbered migration runner after schema push. Successful schema push alone does not prove readiness: numbered files add constraints, indexes and tables outside the shared schema, including the session store. Verify `0049_launch_integrity` is recorded and `/health/ready` succeeds.
6. Generate a disposable `SESSION_SECRET` of at least 32 characters. Use a loopback application harness or configurable application bind address: the original server binds `0.0.0.0` with `reusePort: true`, which is unsuitable for isolated Windows QA.
7. Use synthetic accounts and league rows to exercise actual session cookies and member/outsider requests against warmed and cold caches. Shut down only the owned app and cluster when finished.

## Limits

The original integration configuration starts the Unix-style `npm run dev` command, and some tests import database-connected route helpers despite testing pure logic. A disposable database enables real integration coverage but does not by itself fix that test organization. Neither a database-free test pass nor schema inspection is evidence that the HTTP authorization/cache contract works. Concurrent approvals, rollback and restart recovery need explicit database scenarios in later production batches.

## Executed results

- Downloaded the exact 40,606,855-byte npm archive into ignored `.local-db/`, verified its SHA-512 against the registry integrity above, and extracted it with Windows `tar`. The package's symlink manifest was empty; no npm install or postinstall script ran.
- `postgres --version` returned PostgreSQL 18.4. `initdb` completed with UTF-8, locale C and SCRAM authentication. The sandbox printed restricted-token warnings, but initialization succeeded and the actual server accepted an authenticated connection.
- Started the owned PostgreSQL process hidden, bound exclusively to `127.0.0.1:55432`. Created synthetic database `pawa_w01_test` and ran `node node_modules/drizzle-kit/bin.cjs push --force` successfully with a process-local connection string.
- Invoked the unchanged `runMigrations` implementation using Node 24's native TypeScript support. Migrations 0030 and 0031 applied; **0032 failed and rolled back** at `server/migrations/0032_class_library.sql:34`, because `ADD CONSTRAINT IF NOT EXISTS` is invalid PostgreSQL syntax. This blocks clean-install readiness and needs a production fix. No migration records were manually falsified.
- The schema-backed synthetic database is available for focused route tests while that bootstrap defect is repaired. This does not constitute a successful full application startup or a release gate pass.
- The default sandbox's `tsx` import failed in `os.userInfo()` with `uv_os_get_passwd ... ENOMEM`. Native Node 24 can execute the migration runner's erasable TypeScript directly. This is a host/tooling limitation separate from the database's SQL error.
- The production team ran the actual-route regression harness against this real PostgreSQL schema successfully, then independently reran the final `scripts/verify-production-access.ts` successfully (exit 0). The harness removed its synthetic fixture rows and closed its pool. This verifies the targeted HTTP access/cache checks; it does not override the separate migration failure.
- After the final test, the owned PostgreSQL cluster shut down successfully with `pg_ctl -m fast -w stop`. No listener remained on port 55432, and a direct connection attempt to `127.0.0.1:55432` returned `ECONNREFUSED`. Ignored binaries and cluster files were retained for later bootstrap work; no service was installed.

## Repeatable local commands

Run from the repository root with an ignored `.local-db/` directory and the verified archive already extracted. `PawaTestPassword` below is a newly generated disposable test credential, never a production credential. Ensure the selected port is free and the data directory is new before initialization.

```powershell
$pawaRoot = (Get-Location).Path
$pawaNative = Join-Path $pawaRoot '.local-db/package/native/bin'
$pawaData = Join-Path $pawaRoot '.local-db/data'
$pawaPasswordFile = Join-Path $pawaRoot '.local-db/init-password.txt'
$PawaTestPassword = [guid]::NewGuid().ToString('N')
$PawaTestPassword | Set-Content -LiteralPath $pawaPasswordFile -NoNewline
& (Join-Path $pawaNative 'initdb.exe') -D $pawaData -U pawa_test `
  --pwfile=$pawaPasswordFile --auth=scram-sha-256 --encoding=UTF8 --locale=C
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
$pawaArgs = '-D "' + $pawaData + '" -h 127.0.0.1 -p 55432'
Start-Process -FilePath (Join-Path $pawaNative 'postgres.exe') `
  -ArgumentList $pawaArgs -WindowStyle Hidden `
  -RedirectStandardOutput '.local-db/postgres.stdout.log' `
  -RedirectStandardError '.local-db/postgres.stderr.log' -PassThru
```

Create `pawa_w01_test` using the existing `pg` Node client connected to the new local cluster's `postgres` database. Then set the process-local URL to `pawa_w01_test` and run schema push. The numbered migration runner must pass before treating the resulting application as ready. For shutdown, use the same extracted executable and exact owned cluster directory:

```powershell
& (Join-Path $pawaNative 'pg_ctl.exe') -D $pawaData -m fast -w stop
```
