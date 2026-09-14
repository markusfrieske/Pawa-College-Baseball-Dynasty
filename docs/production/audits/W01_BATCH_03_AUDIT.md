# W01 batch 03 independent session and identity audit

Date: 2026-09-14. Review lenses: Gilfoyle technical integrity, Gibs security/QA and the shared-device coaching experience. An independent agent reviewed the server implementation, the separately implemented client changes and the real HTTP regression harness.

**Verdict: the bounded session/identity milestone passes. No blocking finding remains within the tested change. Two explicit security follow-ups remain below; full application startup and deployment are not certified.**

The milestone concerns reliably retaining a coach's identity across an application restart and safely switching accounts on the same browser. Those behaviors support both a solo text dynasty and a Power Pros commissioner/coach using the companion. It does not test baseball rules, simulation quality or enjoyment.

## Findings addressed in this milestone

| Severity | Reproduction and impact | Acceptance and implementation |
| --- | --- | --- |
| P1 | Start a guest session while signed in. The old implementation retained the previous SID while changing its owner. | Every successful register/login/guest transition regenerates its SID, removes the old SID and persists the new identity before returning success. See [auth routes](../../../server/routes/auth.ts) and the [real HTTP harness](../../../scripts/verify-auth-sessions.ts). |
| P1 | Fail PostgreSQL session writes during login. Returning success before confirming persistence can leave the coach apparently signed in with no durable session. | Explicitly await session save; on failure discard the in-memory session so response completion cannot silently retry the authenticated write. Fault-injection verification requires a non-success response and no authenticated SID. |
| P2 | Call `/api/auth/me` for a deleted guest account, or force the account lookup to reject. The old route trusted the guest flag and had an unhandled normal-user lookup promise. | Resolve a real account for both account types; reject and revoke missing identities when `/me` is requested; handle lookup failures with a generic error while keeping the process alive. This is narrower than global account-deletion revocation, noted below. |
| P2 | Log out. The server previously removed its session but retained the browser cookie. A session-store delete failure also needs an honest result. | Successful logout removes the database SID and expires its matching browser cookie. Failed deletion must not claim success. |
| P1 | Sign in as A, then sign out or switch accounts without reloading the app. Private queries used infinite stale time; login did not refresh identity, and logout only invalidated an auth query whose 401 remained an error retaining A's data. | Cancel in-flight queries, clear previous-account query/mutation data and update mounted identity observers before navigation. An auth 401 also clears private caches; stale auth rechecks on returning focus. Retain actual non-auth 401 and server failures as errors. See [query client](../../../client/src/lib/queryClient.ts) and [client regression tests](../../../tests/unit/authSession.test.ts). |
| P2 | Seed the client cache directly from a login response while the account has opted out of digest email. An incomplete response omits the stored preference and remains fresh indefinitely. | Register/login/guest responses include the same identity/preference fields used by `/me`. |
| P2 | Registration creates an account before session persistence; when the latter fails, blindly repeating registration reports an existing email. | The error now explicitly says the account was created but sign-in failed and asks the coach to sign in. A real HTTP fault/recovery test confirms subsequent login works after storage recovers. |

## Evidence and verification boundaries

The reviewer independently reproduced the original client bug using the installed React Query `QueryClient` and a mounted `QueryObserver`: after changing a successful account-A query to a 401 error and invalidating it, its status became `error` while its data remained account A. This is executed library behavior, not a browser usability observation.

The reviewer independently ran the final client regressions: `playwright test --config=playwright.unit.config.ts authSession.test.ts` exited **0 with six passing tests**. They cover A → logout → B; a guest switch; auth expiry clearing mounted private data and cancelling late responses; preservation of identity/private cache on transient 503 errors; returning focus with an auth record older than 30 seconds; and cancellation during explicit identity change. The account-switch regression updates an existing league observer's options as React's hook would do on rerender and verifies it receives B's data, rather than checking only the cache. The focus test drives React Query's focus manager; it does not run a browser.

The HTTP harness creates its own randomly named loopback PostgreSQL database, bootstraps schema/migrations and launches actual `registerRoutes` in separate child processes. It uses the real authentication endpoints, bcrypt and `connect-pg-simple`; it does not inject authenticated sessions or substitute a MemoryStore. Session-write/delete faults use PostgreSQL triggers. The identity-lookup failure alone replaces the storage lookup through test-child IPC. The harness removes its own database and stops its owned processes.

The reviewer independently ran the final `node --import tsx scripts/verify-auth-sessions.ts` against the task's synthetic local PostgreSQL cluster. It exited **0 with 52 passing assertions** in approximately eight seconds. Its isolated database was removed successfully; the shared test cluster was left for the parent agent's remaining checks and shutdown. No production data or account was used. The assertions cover:

1. Real readiness, anonymous/unknown-user/wrong-password denial, registration, bcrypt storage, cookie attributes and an immediately durable SID.
2. Account → guest → account transitions, changed SIDs, removal/rejection of prior SIDs, removal of the guest flag, consistent guest identity and preservation of stored email preferences.
3. A distinct HTTP process restoring the signed-in account from PostgreSQL with the same secret; an intentionally changed secret rejecting the old cookie.
4. A transient identity lookup failure returning a generic 500, followed by successful use of the same session after recovery.
5. Successful logout expiring the cookie and removing the SID; PostgreSQL write failure returning unsuccessful login with no usable authenticated cookie; registration failure/recovery guidance; and failed session deletion refusing to claim logout.
6. Expired sessions being denied and `/me` revoking sessions for deleted normal/guest accounts. This last scenario does not establish revocation before `/me`.

These are 52 assertions across related scenarios, not 52 independent end-to-end user journeys. The parent owns project-wide TypeScript, broader unit/access regression and final branch verification.

The HTTP child deliberately does not start `server/index.ts`, application backfills or external jobs. It supplies a generic test error handler. Consequently, an auth-route error result cannot certify the production entry point's handling of errors originating in earlier middleware.

## Explicit follow-up findings and limits

| Severity | Open finding and reproduction | Acceptance / ownership |
| --- | --- | --- |
| P2 · W01-AUTH-01 | **Direct access after account deletion remains possible until identity validation.** Source-traced reproduction: delete a user row while retaining its SID and then call a protected endpoint directly, without first requesting `/api/auth/me`. Existing authorization helpers check the persisted `userId` and league role without resolving the account row. No product account-deletion endpoint was found in this audit. | Owner: Gilfoyle technical implementation, Gibs verification. Before offering account deletion or claiming immediate account revocation, validate the live actor centrally or revoke all affected sessions in the account-removal operation; test protected reads and writes before `/me`. This row is the canonical follow-up record. |
| P2 · W01-AUTH-02 | **Production middleware error sanitization is not covered.** Source evidence: `server/index.ts` returns `err.message`; a PgStore read failure happens before the auth route's own catch. | Owner: Gilfoyle technical implementation, Gibs verification. In the remaining W01 startup gate, add production-entry-point session-store failure coverage and return a stable public error without database details. This row is the canonical follow-up record. |

- Production `Secure`, `HttpOnly`, `SameSite` and expiry attributes can be checked using the existing one-hop proxy contract and a synthetic `X-Forwarded-Proto: https` request. This is not an actual TLS/browser/proxy deployment test. Review the real trusted-proxy boundary at deployment time.
- Process restart testing preserves PostgreSQL and the signing secret while replacing the HTTP process. It does not test a database server restart, backups, multi-instance races or durable-game-state recovery.
- Browser rendering, mobile controls, multi-tab synchronization, expiry detection while idle, game progress and human enjoyment remain separate gates. Do not infer them from HTTP or React Query tests.
- Broader TI-11 release rehearsal and TI-12 migration/recovery acceptance remain open. This session milestone does not close either audit finding.
