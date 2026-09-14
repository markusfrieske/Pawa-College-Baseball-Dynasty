# W01 batch 03 — real authentication and session continuity

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. Implementation commit: `a29ac78b5b15a5eb47fbc0440d15afe854be205d`.

**Result:** Real registration, password login and guest login persist and rotate PostgreSQL sessions before declaring success. A coach remains authenticated after the HTTP application process restarts with the same signing secret. Explicit account transitions and detected authentication expiry clear the previous identity's client caches. Independent technical/security QA accepted this bounded milestone.

## Delivered behavior

- Every successful register/login/guest transition regenerates the SID and explicitly awaits its save. A failed save discards the in-memory session, preventing response completion from silently retrying the authenticated write.
- `/api/auth/me` resolves an actual account for normal and guest sessions, revokes missing identities when requested, and catches lookup failures. Auth endpoints use `no-store`; returned identity DTOs consistently include stored email preferences.
- Successful logout deletes the SID and expires the browser cookie. A failed delete reports failure. If registration creates an account but session persistence fails, the response explains that the user should sign in; the account is preserved and recovery is tested.
- Both shared and main-route authentication helpers require a persisted user ID rather than accepting an `isGuest` flag alone.
- Login, registration, logout, explicit guest login and automatic guest creation clear previous private query/mutation cache data before publishing the new identity. Active observers reset and cancelled reads cannot restore old data. Auth 401 returns `null` and clears private data without cancelling the auth query itself. Auth becomes stale after 30 seconds and rechecks on window focus. Unexpected server/offline errors remain errors and preserve existing cached data.
- Added `npm run test:auth-sessions` to the release gate. It creates an owned, isolated database and launches actual route/session middleware in separate HTTP processes; it does not substitute a MemoryStore or inject logged-in identities.

## Evidence

| Check | Observed result |
| --- | --- |
| Independent real session regression | 52 assertions passed: registration/bcrypt, unknown and wrong credentials, durable SID rows, guest/login SID rotation, preference parity, same-secret process restart, changed-secret rejection, cookie attributes, logout/expiry, missing account checks, lookup-error recovery, session-write/delete failures and failed-registration recovery. |
| Independent client regression | Six tests passed using real QueryClient/QueryObserver and focusManager: account A → logout → B, guest transition, expired auth clearing active private data, late-response cancellation, error distinctions and actual focus refresh. |
| Full unit suite | 73 tests passed, including the six new client regressions. |
| Previous HTTP access gate | Passed, including migration-backed readiness, role/cache/privacy checks and zero-storage legacy-PBP containment. Its 1,312 assertions are largely recursive DTO checks, not independent scenarios. |
| TypeScript | Full project check passed. A separate check including the standalone session harness also passed; root tsconfig normally excludes scripts. |
| Independent audit | [W01 batch 03 audit](audits/W01_BATCH_03_AUDIT.md), accepted after final HTTP and client reruns. |
| Cleanup | Parent verified no owned session fixture databases remained, stopped the owned local PostgreSQL cluster, and verified its test port had no listener. |
| Whitespace | `git diff --check` passed. |

The HTTP test uses PostgreSQL 18.4, actual bcrypt and connect-pg-simple. Database triggers inject session save/delete failures; only the targeted account-lookup failure is injected through the test child's IPC. The production Secure-cookie configuration is exercised using a synthetic forwarded-HTTPS header under the existing one-hop proxy setting, not a real TLS/browser deployment.

## Limits and next work

This proves application-process session persistence, not database restart, full `server/index.ts` startup/backfills, backup/restore, multi-instance races, browser rendering, multi-tab synchronization, immediate expiry detection while idle, or gameplay quality. Nothing was deployed, and the full release gate remains open.

Two P2 findings from the independent audit are tracked in the existing JSON tracker's `followUps`, with owners and acceptance requirements:

- **W01-AUTH-01:** Direct protected requests can still use a session for a deleted account before `/me` validates it. No account-deletion product endpoint exists. Resolve live-actor validation or session revocation before adding account deletion or claiming immediate global revocation.
- **W01-AUTH-02:** Production entry-point middleware errors may expose `err.message`; the test child's generic handler does not certify that production behavior. Resolve and exercise this in the remaining startup milestone.

Next continuation: address W01-AUTH-02 while verifying the real production entry point, then resolve the complete-media build prerequisite and browser checks. Keep W01-AUTH-01 explicitly open and prioritize it before any account-deletion feature. Record the Power Pros edition/platform/endings/roster/reporting inputs needed by W02; do not invent them. The original TI-11 full league rehearsal and TI-12 recovery requirements remain open.
