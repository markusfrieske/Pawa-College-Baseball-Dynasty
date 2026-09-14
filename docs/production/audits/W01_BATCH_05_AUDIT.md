# W01 batch 05 independent authentication and static-serving audit

Date: 2026-09-14. Review lenses: technical integrity, security/QA and preservation of a coach's saved work in both the text simulator and Power Pros companion. The reviewer did not implement the authentication or static-serving changes.

**Verdict: the bounded direct-route revocation and static-serving changes pass. Authentication has independent reviewer runtime verification; the parent independently ran the static implementation agent's gate. No blocking finding remains in the reviewed changes; the complete media build and browser milestone remain open.**

## Findings and acceptance

| Severity | Reproduction and impact | Acceptance and disposition |
| --- | --- | --- |
| P2 · W01-AUTH-01 | Delete an account while its genuine PostgreSQL session remains, then request a protected route before `/api/auth/me`. Existing helpers accepted the stale `userId`; a retained co-commissioner ID could authorize private league reads. | Resolve the current account on each protected request. Missing actors receive 401, their browser cookie expires and their SID is removed. Requests with failed account lookup or failed SID deletion must never execute the protected handler. Verified in the real-session harness. |
| P2 · integration gap addressed during review | Changing only one helper would leave the local implementations in `routes.ts` and `storyline-routes.ts` unchanged. League GET/HEAD membership checks also run before individual route middleware, and protected evidence URLs live outside `/api`. | Consolidate all three `requireAuth` implementations and validate before the league-read membership/cache boundary. Retain protection for `/objects/*objectPath`. Source review and separate real SIDs exercise these boundaries. |
| P2 · missing-resource failure disguised as success | Request an absent JavaScript, image, font or audio file, or an unmatched API/object URL. The previous unconditional SPA fallback returned the HTML document with status 200. This can hide an incomplete build and mislead the companion's fetch/error handling. | Return stable, uncached 404 errors for missing resource/API/object requests. Preserve known routes, exact static bytes/MIME types, GET/HEAD page navigation and proper malformed-path errors. Reviewed in [static serving](../../../server/static.ts) and its [HTTP regression harness](../../../scripts/verify-static-serving.ts). |

## Independent verification

The reviewer independently ran `node --import tsx scripts/verify-auth-sessions.ts` against the explicitly named loopback test database. It exited **0 with 114 passing assertions** in approximately 8.7 seconds. The harness created and removed its own random database and stopped its own HTTP processes. It used real registration/login, bcrypt and `connect-pg-simple`; it did not inject authenticated identities or use a replacement session store.

The expanded scenarios demonstrate:

1. Direct account lookup failures on protected GET and PATCH return a generic, uncached 500. The attempted preference change is not persisted, and the legitimate SID works again after recovery. Public catalog, presence and liveness requests remain available without the actor lookup.
2. A real co-commissioner first accesses a private league, then obtains a distinct genuine SID for each subsequent route test. After the account is deleted, direct league-list and private league GET/HEAD, monolithic team-selection POST, modular preference PATCH, saved-roster POST, storyline-vote POST and protected object GET all return 401 before `/me`. Each tested SID is independently removed and each response expires the cookie. Revoking the first SID cannot conceal a missing guard on a later route.
3. A PostgreSQL trigger makes session deletion fail for an additional stale SID. The request returns a generic 500, expires its browser cookie and does not execute the protected write. After the store recovers, the retained SID is still denied and is removed on retry.
4. Deleted guest accounts cannot authenticate directly through their stored guest flag. A session containing only that flag and no actor ID is also rejected.
5. Snapshots of the fixture's leagues, teams, league events and saved rosters are identical before and after the denied operations. The retained league belongs to a different live account and stores the deleted actor in its co-commissioner list, so this test does not disable foreign keys or delete a league to make the account-removal fixture possible.

The pre-existing session scenarios also pass, including account switching, persistence through HTTP-process restart, expiry, logout and write-failure recovery. These are 114 assertions across related scenarios, not 114 independent coach journeys.

Source review used both a repository-wide helper search and a TypeScript syntax-tree inventory of route calls that reference `req.session`. The remaining intentional routes without `requireAuth` are `/api/auth/me`, which validates identity itself, and logout. The shared helper's successful-account memoization is limited to one request and keyed by its actor ID; there is no cross-request authorization cache.

For static serving, the reviewer inspected the final implementation and regression harness. The harness uses synthetic files with exact known bytes and tests reserved API/object namespaces, encoded path variants, malformed paths, missing asset namespaces, non-GET methods, explicit JSON requests, HEAD behavior and missing-index error sanitization. These fixtures prove server behavior without fetching game media.

The parent reported the following final verification of the same stable source. These are attributed parent results, not additional executions by this reviewer:

| Gate | Result |
| --- | --- |
| Static HTTP gate, independently rerun from the static implementer | 86 assertions passed. |
| Actual production entry point | 33 startup assertions passed. |
| Existing private-league access regression | 1,312 assertions passed, predominantly DTO field checks. |
| Pure unit suite | 73 tests passed. |
| TypeScript | Full project and configuration including the new/changed harnesses passed. |

`test:static-serving` is included in the release gate before the build. The complete release gate has not passed because full client/media and browser prerequisites remain unresolved. W01-AUTH-01 can be marked verified for its stated direct-request acceptance. Proceed next to dependency-ready strict reported-result validation using established policy; preserve unknown edition-specific Power Pros rules as explicit inputs.

## Verification limits and remaining work

- The auth harness launches actual `registerRoutes`, not the full production entry point, and uses its existing generic test error handler. Its account-lookup fault is injected through test-child IPC; session write/delete faults use genuine PostgreSQL triggers. The separate production-startup gate is responsible for the real entry point and public error middleware.
- Account existence is checked when a protected request begins. This does not cancel an already executing request or queued job after a later account deletion, provide an account-deletion product workflow, or establish transaction-level revocation.
- The save-preservation comparison covers the named synthetic tables only. There is no populated `games` fixture, mature dynasty, restore drill or full Power Pros reporting lifecycle in this test. Broader TI-06/07/11/12 acceptance remains open.
- Static fixtures do not prove that the actual client builds, media files are present, browsers render correctly, or a coach can finish the core workflow. The complete-media build remains blocked by this device's asset-download restriction, as recorded in the batch report and [build prerequisites](../BUILD_PREREQUISITES.md). Do not substitute HTTP status assertions for byte/MIME verification or browser evidence.
- No gameplay balance, baseball correctness or human-enjoyment claim follows from this infrastructure milestone. No merge, deployment or production-data operation was part of this audit.
