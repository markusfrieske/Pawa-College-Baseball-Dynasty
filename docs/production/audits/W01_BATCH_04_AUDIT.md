# W01 batch 04 independent startup and save-preservation audit

Date: 2026-09-14. Independent review lenses: Gilfoyle technical integrity, Gibs security/QA, and preservation of text-dynasty and Power Pros companion saves.

**Verdict: the bounded production-entry-point, public-error and automatic-cleanup milestone passes. No blocking finding remains in the reviewed changes. This does not certify a complete client build, mature-save migration, background-job completion, recovery or gameplay quality.**

The reviewer inspected the actual entry point before execution, identified startup side effects and reviewed the final implementation separately from its authors. All executed checks used an owned local PostgreSQL cluster and randomly named disposable databases. No production account, database, external integration or deployment was used.

## Findings resolved

| Severity | Reproduction and impact | Acceptance and verified repair |
| --- | --- | --- |
| P1 | A guest-owned dynasty more than seven days old was selected for automatic deletion using its creation time, even when recently played. Startup invoked this cleanup daily. The comment describing inactive guest saves did not match the SQL selector. | Automatic and manual cleanup require an explicit `is_test_data=true` flag. Unflagged old, active and young saves remain intact regardless of owner type. The removed `--guest-days` option refuses execution; invalid retention values fail before database work. See [cleanup implementation](../../../server/lib/cleanupStaleLeagues.ts), [manual command](../../../scripts/cleanup-test-leagues.ts) and [real PostgreSQL regression](../../../scripts/verify-stale-cleanup.ts). |
| P2 · W01-AUTH-02 | A genuine session-store read failure reaches production middleware before an authentication route's catch. The former entry-point handler returned the underlying error message, potentially exposing database details. | Return a stable public JSON error and `Cache-Control: no-store`. The actual entry-point test forces a PostgreSQL SELECT failure carrying a synthetic diagnostic canary; the response is a generic 500, the canary stays in the internal log, the process survives, and the same cookie works after recovery. See [public error handler](../../../server/lib/httpErrors.ts) and [startup regression](../../../scripts/verify-production-startup.ts). |
| P2 | The former final error handler preceded static middleware, so a failing static `sendFile` did not share the public JSON contract. | Register the error handler after route and static/Vite setup. Removing the synthetic index fixture after startup now produces a stable JSON 404 without filesystem details. |
| P2 | Production exposed the development `/__mockup` proxy, forwarding requests and headers to a loopback development service. | Production returns JSON 404 before constructing an upstream request. Source inspection verifies the early return; actual production HTTP verifies the response. |
| P2 | The initial new logger included raw request paths, bypassing the existing token-path normalization. Malformed JSON on an invite URL could expose the token and submitted body in logs. | The final handler omits the path and complete error object, logs only parser metadata for client errors, and retains limited server-failure diagnostics. Actual HTTP canary assertions show that the malformed payload and invite token are absent from logs. This checks this error path, not every application logger. |
| P2 | The entry point forced `reusePort` on Windows and ignored an explicit loopback host. `parseInt` also accepted trailing junk in `PORT`. | Honor `HOST`, retain the deployment default when omitted, disable `reusePort` on Windows, and reject malformed/out-of-range ports before starting jobs. The actual bundled process binds successfully to loopback with an ephemeral port; three invalid port forms exit with actionable diagnostics and no job-runner startup. |

## Independently executed evidence

The reviewer independently ran the final `node --import tsx scripts/verify-production-startup.ts`: **exit 0, 33 passing assertions**. This is the actual `server/index.ts` bundled into an ignored test directory, using external installed packages and a clearly labeled synthetic HTML index. It includes the real parser, authentication routes, PostgreSQL session store, static middleware and production error handler. There is no replacement test error handler or injected authenticated identity.

The assertions cover invalid-port rejection, real liveness and numbered-schema readiness, loopback serving of the synthetic fixture, malformed JSON 400, body-limit 413, no-store errors, production proxy denial, registration/session access, genuine session-store failure and recovery, static-file failure, and log canaries. The session fault uses a temporary database view/function over a renamed session backing table; the original rows are restored afterward. The fixture database and HTTP child are removed at completion.

The reviewer inspected the resulting startup log: numbered migrations were current, the empty-data backfills reported no unexpected failure, and the job runner announced startup. The final rerun also passed an assertion rejecting unexpected startup/backfill/job failure logs. This is observation of an empty fixture run, not proof that a populated migration or queued job completes correctly.

The reviewer also independently ran `node --import tsx scripts/verify-stale-cleanup.ts`: **exit 0, 21 passing assertions**. Its real PostgreSQL fixture includes simulated guest leagues and reported normal-user leagues, old/young saves, a recent synthetic game event in an old save, teams and event history, and explicitly flagged old/young test leagues. Dry-run and default cleanup preserve all unflagged saves and their inspected dependents; old explicit tests are removed, young tests survive, repeat cleanup is harmless, and the actual CLI respects the same boundary.

These are assertions across related scenarios, not 54 distinct coach journeys. The parent owns project-wide TypeScript, broader regression checks and final branch verification.

## Remaining release boundaries

- The startup gate first bootstraps the owned database from the current schema and numbered migrations. It then runs the actual production entry point. It does not prove that the entry point alone constructs a database from nothing, upgrades a historical save, or restores a backup.
- Existing startup transformations still include fire-and-forget work and mark-before-completion guards, while readiness checks numbered migration state. The job runner starts before all data transformations complete. These existing TI-12/W04 concerns remain open; do not call populated-save startup or recovery verified.
- The empty startup fixture intentionally contains no pending league jobs. A runner-start log does not certify bootstrap job processing, lease fencing or crash recovery.
- The synthetic index deliberately avoids claiming full client/media compilation, browser rendering, asset correctness, mobile use or accessibility. Those remain separate W01/release prerequisites.
- Cleanup verification establishes the corrected selection boundary and preservation of the fixture tables. It does not certify every possible mature-league foreign-key graph or concurrent changes to a test-data flag during cleanup. Full recovery and concurrency work remain separate gates.
- W01-AUTH-01, direct protected access with a retained session after account deletion, is unchanged and remains tracked. Public middleware sanitization also does not automatically sanitize custom error responses in every individual route.
- Preserving guest saves protects both long-running text dynasties and guest use of the league companion. Neither these infrastructure checks nor source review establish baseball correctness, balance, reporting usability or human enjoyment.

No merge or deployment is approved by this audit.
