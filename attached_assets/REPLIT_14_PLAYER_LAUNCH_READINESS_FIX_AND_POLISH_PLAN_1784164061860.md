# Pawa College Baseball Dynasty
## 14-Player Multiplayer Launch Readiness, Fix, and Polish Plan

**Audit date:** July 15, 2026  
**Release candidate:** `Pawa-College-Baseball-Dynasty-main.zip`  
**ZIP SHA-256:** `9E5F4FB55568EEEC47DF61142F7327CF4A7281CE19E0035F77358D0F74355A70`  
**ZIP modified:** July 15, 2026 at 4:55:10 PM  
**Target:** First real, persistent, 14-human-coach multiplayer dynasty  
**Secondary regression target:** 149-team Full Season mode

---

## Instructions to Replit

Treat this document as a release-blocking implementation brief, not a suggestion list.

1. Fix every **P0** item before starting the real league.
2. Fix every **P1** item or explicitly feature-flag the affected feature off before launch.
3. Do not mark an item complete from code inspection alone. Supply the test or runtime evidence listed in its acceptance criteria.
4. Make database changes through numbered, reversible migrations. Do not rely on application-startup `ALTER TABLE` statements.
5. Preserve both modes:
   - **Custom Multiplayer:** 14 teams, 14 independent registered users, commissioner-controlled, reported games supported.
   - **Full Season:** 149 teams, 56 games per team, progression on, conference championships, super regionals, and College World Series.
6. Do not weaken authorization or integrity rules to make tests pass. Results, standings, stats, recruiting budgets, and phase advancement must be server-authoritative.
7. Finish with the complete release gate in this document and attach the command output, test report, migration version, database invariant report, and screenshots.

---

# 1. Executive verdict

## Current recommendation: **NO-GO for a real 14-player league**

The release candidate should not yet be used for the first persistent multiplayer season. The application has strong feature coverage and several solid foundations, but confirmed code paths can currently:

- advance a reported-game week while games are missing, pending, or disputed;
- let an uninvolved league coach submit a result for another team's game;
- let any authenticated user invoke play-by-play generation/finalization for a known game ID;
- apply the same game to standings, player stats, rest, and XP more than once under retry or concurrency;
- apply exhibition results to regular-season standings and development;
- leave a league permanently advance-locked after a crash;
- race start-dynasty, setup, quick-sim, recruiting, and season-transition actions;
- start even when a selected custom recruiting class is invalid, leaving the league with zero recruits;
- start the server after required runtime schema changes fail;
- reject normal recruiting-class saves because generated payloads exceed Express's default JSON limit;
- leak tokens and hidden/private data by logging complete JSON responses;
- invalidate sessions unpredictably across restarts or multiple deployment instances when `SESSION_SECRET` is missing.

There are also compile errors in the recruiting-class creator and AI class routes, and the current automated test command does not discover a valid test suite in the audited environment.

The safest launch sequence is:

1. complete P0 fixes;
2. pass the new 14-independent-user end-to-end test;
3. run a destructive dress rehearsal on a staging database through the start of Season 2;
4. take and restore a backup;
5. launch the first league as a clearly labeled beta on a **single application instance/Reserved VM** unless shared locks, cache, presence, and progress state have first been externalized;
6. monitor the first advance, first reported series, recruiting week, postseason transition, and offseason transition.

---

# 2. What was checked

The audit traced the following server and client workflows rather than reviewing only visible screens:

- account creation, guest access, sessions, invitations, team claims, and coach assignment;
- custom league creation, team selection, setup, start-dynasty, schedule generation, roster generation, and recruiting-pool generation;
- commissioner readiness/preflight, coach readiness, weekly advance, force advance, quick simulation, and direct season advance;
- simulated, reported, quick-score, and play-by-play game completion paths;
- standings, conference records, season stats, player rest, progression XP, news, and game event writes;
- recruiting targets, calls, scouts, visits, offers, signing, CPU recruiting, and custom recruiting classes;
- exhibitions, regular season, conference tournaments, super regionals, College World Series, offseason, and next-season transition;
- Full Season bootstrap jobs, checkpoints, leases, schedule publication, and 149-team scale;
- schema/runtime migrations, locks, deployment scripts, validation scripts, type checking, build entry points, and Playwright discovery.

## Verification results from this release candidate

| Check | Result | Interpretation |
|---|---:|---|
| ZIP inventory | 1,741 files / 78 directories | Audited the supplied release candidate |
| Roster data validation | **Passed** with 0 errors | Static roster source data is internally valid |
| Recruit-class validation | **Passed** with 0 errors | Static recruiting data is internally valid |
| TypeScript `npm run check` | **Failed** | Confirmed application compile errors remain |
| Production build | **Not proven** | Data validators passed; local client bundle was blocked by the Windows dependency-junction sandbox, so Replit must produce a clean production build artifact |
| Playwright discovery | **Failed** | DB-bound imports fail without `DATABASE_URL`; one unit file imports missing `vitest`; result was 0 tests in 0 files |
| Genuine 14-user multiplayer E2E | **Missing** | Existing “14-team” test uses one guest session and one human coach, so it does not verify multiplayer |

### Confirmed TypeScript defects

- `client/src/components/recruiting-wizard.tsx`: `RetroButton` receives unsupported `variant="default"`.
- `client/src/components/recruiting-wizard.tsx`: `WizardCastMember` lacks the used `arcDraftJson` field; related callbacks also contain implicit `any` parameters.
- `server/routes/aiClassJobs.ts`: route parameters remain typed as `string | string[]` where downstream functions require `string`.

Do not suppress these with broad casts, `skipLibCheck`, or disabled strictness. Correct the component/domain types and route parameter parsing.

## Foundations worth preserving

- Full Season creation correctly locks the flagship format to 149 teams, 56 games, progression, and simulated play.
- The Full Season schedule builder has a pure validation stage and an atomic publish design.
- Full Season bootstrap uses checkpoints and performs roster/schedule validation.
- Recruiting-pool sizing is mode-aware: the balance formula targets approximately 102 recruits for 14 teams and 1,081 for 149 teams.
- Invitation acceptance already uses a transaction and row locking, scopes the team to the league, and safely replaces its CPU coach.
- The centralized recruiting action service uses transactional coach-cost spending and interest upserts for several action types.
- Static roster and recruiting-class validators are currently green.

These good systems should be extended and reused rather than replaced by additional one-off route logic.

---

# 3. Release-blocker register

| ID | Priority | Area | Affects | Required disposition |
|---|---|---|---|---|
| MP-001 | P0 | Reported-week advance | 14-player | Fix before launch |
| MP-002 | P0 | Game-report authorization and validation | 14-player | Fix before launch |
| MP-003 | P0 | Play-by-play trust boundary | Both | Fix or feature-flag off |
| MP-004 | P0 | Quick-score league scoping/idempotency | 14-player | Fix before launch |
| MP-005 | P0 | Atomic game finalization | Both | Fix before launch |
| MP-006 | P0 | Exhibition contamination | Custom leagues | Fix before launch |
| MP-007 | P0 | Advance state machine and lock recovery | Both | Fix before launch |
| MP-008 | P0 | Setup/start/season-transition races | Both | Fix before launch |
| MP-009 | P0 | Full Season job lease | Full Season | Fix before public Full Season |
| MP-010 | P0 | Migrations/startup readiness | Both | Fix before launch |
| MP-011 | P0 | Recruiting-class payload and version integrity | Both | Fix before launch |
| MP-012 | P0 | Response logging and secrets | Both | Fix before launch |
| MP-013 | P0 | Sessions and public auth baseline | Both | Fix before launch |
| MP-014 | P1 | League-scoped resource authorization | Both | Fix before launch if routes are exposed |
| MP-015 | P1 | Recruiting concurrency | Both | Fix before competitive recruiting |
| MP-016 | P1 | Pitcher rest sequencing | Both | Fix before competitive games |
| MP-017 | P1 | Progression pitch-mix defect | Both | Fix before first offseason |
| MP-018 | P1 | Multi-instance process memory | Both | Externalize or deploy one instance |
| MP-019 | P1 | Test/CI/dependency portability | Both | Fix for release gate |
| MP-020 | P1 | Backup, monitoring, recovery | Both | Fix for live persistent league |

---

# 4. Required implementation

## MP-001 — Block weekly advance until reported games are truly final

**Evidence**

- `server/routes/simulation.ts` builds `incompleteGames` as an empty list in reported mode. This allows readiness to advance the league without requiring reports.
- `server/routes/league-mgmt.ts` commissioner preflight searches for incomplete games with an `accepted` report status.
- Actual report states are `pending`, `confirmed`, and `disputed`. An unreported game is also incomplete, so the current join cannot reliably expose it.
- The commissioner UI does not make these preflight failures a hard disable condition for Advance.

**Required change**

Create one server-owned `getAdvancePreflight(leagueId)` service and use it for:

- the commissioner preflight endpoint;
- normal advance;
- force advance;
- quick-sim eligibility;
- the client Advance button.

For the current season/phase/week, classify every scheduled game as exactly one of:

- `finalized`;
- `unreported`;
- `pending_confirmation`;
- `disputed`;
- `invalid_or_orphaned`.

Normal advance must return HTTP 409 with a structured blocker list unless all required games are finalized. It must reject the request **before any counter, storyline, recruiting, XP, cache, or league-state mutation**.

Force advance must not mean “ignore the games.” It must require the commissioner to select and audit one resolution per blocker: commissioner-entered final, forfeit, CPU simulation if league rules permit it, or postponement/reschedule. Store the reason and acting user.

In reported mode, hide/disable bulk quick-sim unless the commissioner explicitly converts the affected game or league policy and that conversion is audited.

**Acceptance criteria**

- Missing, pending, disputed, and invalid games each produce HTTP 409 and no database changes.
- The UI disables Advance and links directly to every blocking game/coach.
- Confirming the last report makes preflight pass without a page refresh.
- Two simultaneous Advance requests produce exactly one transition.
- A force resolution creates an audit record with before/after state, actor, reason, and result source.

---

## MP-002 — Authorize and validate game reports as competitive transactions

**Evidence**

`server/routes/games.ts` currently accepts a report from any league coach. It does not require the reporting coach's team to be the home or away team. If one team is CPU, the report can auto-confirm and finalize. Scores only need to be numeric, and submitted box-score player IDs are not comprehensively proven to belong to the correct participating roster.

**Required change**

For report submission:

1. Load the game by `gameId` and derive its league from the game itself.
2. Require the user to be:
   - the active coach of the home team;
   - the active coach of the away team; or
   - a commissioner using a separate override endpoint with a reason.
3. Store `reporterTeamId` and reject a null/nonparticipating team.
4. In a human-vs-human game, require the opposing participating coach to confirm.
5. In a human-vs-CPU game, auto-confirm only when the human-side coach submitted it. A commissioner override must be explicit and audited.
6. Use a transaction and lock the game/report rows. Enforce one active report per game and safe resubmission/versioning.

Use strict, shared result schemas:

- integer, finite scores within an explicit supported range;
- no tied final baseball score;
- valid innings/extra-innings relationship;
- integer and bounded counting stats;
- every hitter/pitcher ID belongs to the correct game's home/away roster;
- no duplicate player IDs in a side/category;
- team box totals reconcile to the final score and supported stat totals;
- pitching outs/innings reconcile;
- completed or already-finalizing games cannot be submitted again.

Do not accept browser-computed standings, XP, fatigue, or progression values.

**Acceptance criteria**

- A third team's coach receives 403 when submitting or confirming.
- Home and away coaches can perform only their proper actions.
- CPU auto-confirm cannot be triggered by an unrelated coach.
- Negative, decimal, infinite, tied, malformed, duplicate, or foreign-player box scores receive 400/422.
- Two simultaneous confirms result in one finalization and one set of side effects.

---

## MP-003 — Make play-by-play server-authoritative or disable it for launch

**Evidence**

Play-by-play generate/finalize routes in `server/routes/simulation.ts` require authentication but do not consistently prove league membership, team involvement, or commissioner authority. The finalize route accepts client-provided score and stat arrays.

**Required change**

For the first league, choose one safe path:

### Preferred launch path

Place play-by-play/watch/coach mode behind a production feature flag until its trust boundary is complete. Return 404 or 409 when disabled; do not merely hide the button.

### Full implementation path

- Authorize from the game-derived league and participating teams.
- Generate the simulation entirely on the server.
- Store an immutable result payload under a one-time, expiring result ID tied to game, league, user, and game version.
- Finalize by result ID only; never accept client-authored score/stat arrays.
- Consume the result ID once within the game-finalization transaction.
- Protect generation and finalization with the same game/league operation locks used elsewhere.

**Acceptance criteria**

- A user from another league and an uninvolved league coach cannot generate or finalize.
- Altering the browser payload cannot alter the final score or player stats.
- Reusing a result ID is harmless and returns the already-finalized result.

---

## MP-004 — Scope and make commissioner quick-score idempotent

**Evidence**

The quick-score patch route validates commissioner rights for the URL league, then loads a game by ID without proving that game belongs to that league. It also does not reject an already-complete game before applying standings/stat effects.

**Required change**

- Query with both `gameId` and `leagueId`, or compare and reject before any mutation.
- Require the commissioner role in the game's league.
- Route the result through the single atomic finalization service.
- Return the existing final result on an identical retry; return 409 for a conflicting result.
- Add a commissioner audit event.

**Acceptance criteria**

- A commissioner cannot patch a game from another league.
- Double-click/retry does not double standings, stats, XP, or rest.
- A conflicting second score is rejected and recorded.

---

## MP-005 — Rebuild game finalization as one atomic, idempotent operation

**Evidence**

`server/game-finalizer.ts` currently performs game score, standings, season stats, rest, XP, event, and completion writes independently. A failure or concurrent request can apply only part of the result or apply effects twice. Batch finalization marks games complete before all downstream standings/stat/rest work succeeds.

**Required change**

Create one `finalizeGameAtomic()` service used by:

- reported-game confirmation;
- commissioner quick-score;
- simulated game finalization;
- play-by-play finalization;
- force resolutions;
- batch simulation.

Inside a database transaction:

1. `SELECT ... FOR UPDATE` the game.
2. Check its finalization version/status.
3. Claim a unique finalization key such as `(game_id)` in a `game_finalizations` table.
4. Validate the immutable result.
5. Apply score and terminal game status.
6. Apply overall and conference standings.
7. Apply player/team season stats.
8. Apply rest/fatigue and XP once.
9. Insert a durable game-result/audit event.
10. Commit.

Noncritical recap/news generation may use an outbox job after commit. It may not determine whether the game is final.

Do not mark batch games complete before the rest of the transaction. Batch by a safe transaction size while retaining per-game uniqueness and resumability.

**Required database invariants**

- at most one canonical finalization per game;
- exactly one standings application per countable game;
- no completed game without a canonical result;
- no canonical result for a game still marked incomplete;
- team wins + losses equal completed, countable games;
- conference wins + losses equal completed conference games;
- player game-log totals reconcile to season totals or have a documented aggregation source.

**Acceptance criteria**

- Inject a failure after each finalization stage; retry reaches one correct final state.
- Run 20 concurrent identical and conflicting finalization requests; only one result is applied.
- Reconciliation queries return zero violations after every E2E suite.

---

## MP-006 — Keep exhibitions out of regular-season records and progression

**Evidence**

Custom-league preseason exhibitions are simulated and then passed to normal finalization without `skipStandings`, `skipCoachXp`, or `skipPlayerStats`. Custom teams can therefore enter Week 1 with wins/losses, stats, rest, and XP from exhibitions. Full Season currently avoids this particular path.

**Required change**

Add a first-class game classification, not a caller convention:

- `gameType = exhibition | regular | conference_tournament | super_regional | cws`;
- finalization derives countability from server league rules and `gameType`;
- exhibitions save their score/box score for viewing but do not alter official standings, conference record, season leaders, awards, coach/player XP, redshirt/eligibility counters, or persistent rest entering the regular season;
- if exhibition statistics are desired, store or label them separately.

**Acceptance criteria**

- After every exhibition is played, all official standings are 0-0 at regular-season start.
- Official player season stats and XP remain unchanged.
- Exhibition results remain viewable and clearly labeled.

---

## MP-007 — Make advancement durable, resumable, and recoverable

**Evidence**

Weekly advance performs multiple permanent side effects before the final phase/week update. A mid-operation failure can leave the displayed week unchanged while CPU recruiting, storylines, counters, and other effects have already moved. The database advance lock has no reliable expiry/heartbeat, while its owner token is held in process memory; a crash can brick the league. Quick-sim routes bypass the normal advance lock.

**Required change**

Implement a shared advance-operation service:

- durable `league_advances` row with operation ID, league, from-state, target-state, league version, status, owner instance ID, lease expiry, step checkpoints, timestamps, and error;
- unique operation key for a given league state;
- atomic compare-and-swap of league version/state;
- lease owner UUID per process, renewal heartbeat, and takeover only after expiry;
- idempotent, checkpointed substeps;
- one lock shared by normal advance, force advance, quick-sim, and season transition;
- commissioner recovery UI/API for an expired operation, with an audit event;
- progress reads from the database/shared store rather than process memory.

Run preflight before opening/mutating the operation. Keep the critical league state flip and counter reset atomic. Heavy game simulation may run as resumable work, but every result must use `finalizeGameAtomic()`.

The direct `advance-season` route must be removed or restricted to the single canonical end-of-offseason state. It must not skip departures, retention, transfer portal, signing day, or walk-ons.

**Acceptance criteria**

- Kill the server at each checkpoint and restart; the operation resumes or safely rolls back without duplicate effects.
- An expired lock can be recovered; an active lock cannot be stolen.
- Normal advance, quick-sim, and direct season transition cannot run concurrently.
- A repeated request for the same from-state returns the same operation/result.

---

## MP-008 — Make setup and dynasty start exact-once and league-scoped

**Evidence**

- General setup accepts a team ID without consistently proving the team belongs to the URL league or is still available.
- Team selection and start-dynasty are multi-write flows without a league-level transaction/lock/idempotency guard.
- Unknown canonical team names can be skipped while the request still returns success with fewer teams.
- Retrying/concurrently starting can create duplicate coaches, rosters, standings, schedules, or related records.
- An invalid selected recruiting-class ID can be silently skipped, while auto-generation is also skipped because an ID was supplied, starting the dynasty with zero recruits.

**Required change**

### Team selection

- Validate the entire request before mutation: exact team count, distinct names/IDs, canonical mapping, conference membership, and permitted mode.
- Reject unknown or duplicate teams; never silently continue.
- Lock the league row and apply the selection transactionally and idempotently.
- Add database uniqueness for league team identity and season standings.

### Coach/team claim

- Make invitation acceptance the only standard multiplayer claim path.
- Retire or tightly restrict the generic setup claim route.
- Require league scope, `dynasty_setup` phase, invited user/team, team availability, and one active coach per user/team.
- Keep the existing invitation transaction/row-lock pattern.

### Start dynasty

- Lock the league row and require the expected setup phase/version.
- Require exactly 14 distinct registered human users, coaches, and teams for the 14-human preset. If the commissioner deliberately allows CPU vacancies, show and audit an explicit alternative mode; do not silently fill them.
- Validate the chosen recruiting class belongs to/is shared with this league, is published/immutable, matches the class schema, and meets the mode's size/position requirements.
- If invalid, return 422. Never start with zero recruits.
- Produce rosters, standings, schedule, class, and phase transition exactly once.
- Run postcondition validation before commit/activation.

**Start postconditions for the 14-human preset**

- 14 active teams;
- 14 distinct registered human users;
- 14 active human coaches;
- zero CPU-controlled teams;
- one coach per team and one league coach per user;
- roster count and position/depth requirements pass for every team;
- official standings exactly 14 and all 0-0;
- schedule exactly matches the selected rules (current standard target: 20 games/team over 5 regular-season weeks; validate the generator's exact count and balance);
- recruiting pool meets the current 14-team target (102 unless a deliberate rules version changes it);
- no orphaned team, player, coach, standing, game, or recruit records.

**Acceptance criteria**

- Two users racing for one team yield one winner and one clean 409.
- A user cannot claim two teams or a cross-league team.
- Ten concurrent Start clicks create exactly one complete dynasty.
- Invalid/missing class selection leaves the league in setup with no partial data.

---

## MP-009 — Add lease renewal and single ownership to Full Season bootstrap

**Evidence**

Full Season jobs use a fixed lease and a generic runner owner. The lease is not renewed while the 149-team roster/schedule bootstrap runs. If work exceeds the lease or an Autoscale instance overlaps, another runner can reclaim and duplicate or conflict with checkpoint work.

**Required change**

- Give each runner instance a unique UUID.
- Claim using an atomic lease update and a per-league PostgreSQL advisory lock or equivalent durable lock.
- Renew the lease periodically (for example, every 30 seconds) using `WHERE id = ? AND locked_by = ?`.
- Stop work immediately if lease renewal loses ownership.
- Complete/fail the job only if the caller still owns it.
- Make each checkpoint operation idempotent and back it with database uniqueness.
- Add an admin recovery path for expired jobs.

**Acceptance criteria**

- Bootstrap one Full Season with 149 teams, valid rosters, 1,081 recruits, and 4,172 regular-season games (149 × 56 ÷ 2).
- Force bootstrap to run longer than the lease; a second runner cannot claim it while heartbeats succeed.
- Kill the owner; a new runner resumes after expiry without duplicates.

---

## MP-010 — Replace runtime DDL with fail-fast migrations

**Evidence**

Migration files end before several current schema tables, columns, constraints, and indexes. `server/index.ts` attempts runtime DDL, catches individual failures, and can continue serving. One statement uses `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`, which PostgreSQL does not support. Important coach and recruiting-action uniqueness protections currently depend on these runtime statements.

**Required change**

Create numbered migrations (0030 onward as needed) covering every production schema addition currently represented only in runtime code, including:

- recruiting class projects, versions, jobs, shares/imports, and storyline data;
- durable league advance operations/leases;
- game finalization/operation ledger and required report uniqueness;
- team, coach, standings, recruiting action, project-version, and bootstrap uniqueness;
- foreign keys, checks, enum/status constraints, and required indexes.

Recommended uniqueness includes, after deduplicating existing data:

- `(league_id, team_id, season)` for standings;
- active coach team uniqueness per league;
- active coach user uniqueness per league;
- `(project_id, version_number)` for recruiting-class versions;
- one canonical finalization per game;
- one active game report per game, or explicit version uniqueness;
- deterministic keys for weekly recruiting effects and advance operations.

Run migrations as a deployment/release step before application traffic. Add `/health/live` and `/health/ready`; readiness must fail if the database cannot be queried, the expected migration version is absent, or critical background services are unhealthy. Delete schema mutation from normal server startup.

**Acceptance criteria**

- A brand-new database migrates from zero and boots.
- A copy of the current production/staging database migrates forward without lost records.
- A missing/failed migration prevents readiness and background job execution.
- Schema drift comparison is clean.
- Rollback/forward recovery steps are documented and rehearsed.

---

## MP-011 — Make recruiting-class creation viable at 14-team and Full Season scale

**Evidence**

The server uses Express's default JSON body limit, approximately 100 KB. Measured generated save envelopes were approximately:

- 80 recruits: **136,078 bytes**;
- 102 recruits (current 14-team target): **173,233 bytes**;
- 1,081 recruits (Full Season target): **1,843,734 bytes**.

The wizard sends full recruit arrays to save endpoints, so even the visible 80-player class can receive 413. Version numbering uses a read/count pattern without a unique database constraint, and share import limits are not reserved atomically.

**Required change**

- Set a route-scoped, explicit body limit adequate for a validated 1,081-player class (for example 3–5 MB), not an unlimited global limit.
- Enforce `Content-Length`/stream limits, schema validation, count limits, string limits, and authorization before expensive processing.
- Prefer server-side project IDs, incremental/chunked draft saves, and immutable published versions over repeatedly sending the entire class.
- Virtualize or paginate 1,081-player editing/review screens.
- Add unique `(project_id, version_number)` and publish inside a transaction.
- Atomically enforce `maxImports` and increment use count.
- Keep published class versions immutable; a league stores the exact loaded version/snapshot.
- Correct the TypeScript errors in `recruiting-wizard.tsx` and `aiClassJobs.ts`.
- Never log class bodies, hidden ratings, share tokens, or AI prompts containing user/private data.

**Acceptance criteria**

- Create, save, publish, share, import, load into Season 1, and load into a later season for 80, 102, and 1,081 recruits.
- Two simultaneous publishes receive distinct, sequential versions.
- Concurrent imports cannot exceed the limit.
- Invalid or undersized classes cannot start a league.
- Full Season class review remains responsive and does not render 1,081 full editor rows at once.

---

## MP-012 — Stop logging complete API response bodies

**Evidence**

`server/index.ts` wraps `res.json` and logs the entire response body. This exposes invitation/share tokens, emails, hidden recruit ratings and gem/bust data, and potentially large save/class data. It also adds serialization/logging overhead to multi-megabyte responses.

**Required change**

Replace body logging with structured metadata only:

- request ID;
- method and normalized route template;
- status;
- latency;
- response byte count;
- authenticated user ID only where permitted and hashed/pseudonymous as appropriate;
- error code, not private body.

Implement a deny-by-default redaction policy for tokens, cookies, passwords, emails, hidden ratings, box-score payloads, AI prompts, and recruiting-class contents. Keep stack traces in restricted server telemetry only.

**Acceptance criteria**

- Automated log tests search for seeded secret tokens/passwords/emails/private recruit values and find none.
- Large-class responses log one metadata line rather than the response body.

---

## MP-013 — Establish a safe multiplayer authentication/session baseline

**Evidence**

If `SESSION_SECRET` is missing, the server generates a random secret. Sessions can then fail after restart or when requests hit different instances. Guest users are persisted with unrecoverable random passwords and can enter multiplayer flows, creating a risk of losing control of a team. Public auth lacks a complete rate-limit, CSRF/origin, and security-header baseline.

**Required change**

- Require a stable, strong `SESSION_SECRET`; fail startup/readiness if absent or weak.
- Configure secure cookie settings, proxy trust, same-site policy, production HTTPS, and persistent shared session storage.
- Regenerate the session ID on login/register and invalidate it on logout/password change.
- Apply rate limits to register, login, guest creation, invite redemption, class sharing, and expensive AI/generation routes.
- Raise password requirements and use generic authentication failure messages.
- Add CSRF protection or strict Origin/Referer validation for cookie-authenticated state-changing routes.
- Add Helmet/security headers and a tested CSP compatible with the client.
- Require a registered/recoverable account to create a multiplayer league or accept a team invitation. Alternatively, implement a verified guest-to-account upgrade that preserves user, coach, and league ownership before league start.
- Provide commissioner-visible account readiness (14 recoverable accounts) without exposing private account data.

**Acceptance criteria**

- Sessions survive an app restart and, if multi-instance is enabled, requests alternating across instances.
- Session IDs rotate at authentication.
- Cross-origin mutation attempts fail.
- Login/invite brute-force tests are throttled.
- No unrecoverable guest can hold a live multiplayer team at start.

---

## MP-014 — Enforce league scope for every nested resource

**Evidence**

Some lineup/departure routes allow a commissioner path to bypass the normal team-player relationship. With a guessed player ID, a commissioner may affect a player outside the URL league. Similar IDOR risk must be checked across game, team, coach, player, recruit, report, and class routes.

**Required change**

Create and use reusable loaders such as:

- `loadLeagueScopedTeam(leagueId, teamId)`;
- `loadLeagueScopedPlayer(leagueId, teamId, playerId)`;
- `loadLeagueScopedGame(leagueId, gameId)`;
- `loadLeagueScopedRecruit(leagueId, recruitId)`.

Commissioner authority broadens permitted actions **inside the league**, never the resource scope. Build an authorization matrix for guest, member, participating coach, nonparticipating coach, commissioner, and outsider for every state-changing route.

**Acceptance criteria**

- Automated IDOR tests substitute valid IDs from another league for every nested resource and receive 404/403 with no changes.

---

## MP-015 — Make competitive recruiting actions concurrency-safe

**Evidence**

Calls/visits/offers use a promising transactional action service, but critical actions remain read-then-write flows:

- signing can race on recruit availability, roster cap, and NIL budget, producing duplicate XP or lost/incorrect budget updates;
- target toggle counts then updates without an atomic desired-state operation;
- scout/bulk scout availability and action counters can race;
- required uniqueness is partly supplied only by runtime DDL.

**Required change**

- Add idempotency keys to costly recruiting commands.
- Sign inside a transaction with recruit/team/coach row locks and a conditional `UPDATE ... WHERE signed_team_id IS NULL`.
- Reserve NIL atomically; never read-modify-write balances.
- Recheck roster and positional caps under the same lock.
- Award XP/log once from the transaction/operation ledger.
- Change target APIs to explicit desired state (`targeted: true|false`) and enforce target limits atomically.
- Reserve scout/call/visit/action capacity atomically, including bulk actions.
- Move required unique indexes into migrations.

**Acceptance criteria**

- Twenty concurrent sign attempts for one recruit produce one signing, one NIL charge, and one XP award.
- Concurrent actions cannot produce negative resources or exceed targets/calls/scouts/visits/offers.
- Retried commands return the original result without additional cost.

---

## MP-016 — Sequence simulated games so pitcher rest actually matters

**Evidence**

All games in a simulated week are generated concurrently before rest is finalized. A Friday appearance therefore cannot affect Saturday/Sunday pitcher selection. Rest is then reset during advance. Reported games can observe prior finalized rest, but simulated Full Season and CPU games do not model series fatigue correctly.

**Required change**

Simulate/finalize in chronological day groups:

1. midweek/Wed;
2. Friday;
3. Saturday;
4. Sunday;
5. any supported makeup day.

Parallelize games **within one day** only when no team appears twice. Finalize the full day and commit rest before generating the next day. Define starter and reliever recovery by pitches/outs/appearance and test regular season and postseason series. Reset/decay rest according to elapsed days, not as a blanket weekly erase.

**Acceptance criteria**

- A Friday starter/reliever exceeding thresholds is unavailable or penalized on Saturday/Sunday according to rules.
- CPU selection never uses knowledge from a later game and never assigns one team twice in the same day.
- Seeded simulation produces deterministic rest transitions.

---

## MP-017 — Correct pitch-mix progression and add longitudinal balance tests

**Evidence**

The V3 development system has potential budgets, archetype weights, caps, and season idempotency. However, `pitchMix` is excluded from normal caps/allocation while its points are added to the general growth budget. The pitch repertoire fields are not then developed by a separate handler. Pitch-mix growth can therefore inflate other ratings while actual pitches do not progress/regress.

**Required change**

- Remove pitch-mix points from the general attribute pool.
- Implement a deterministic pitch repertoire development/regression allocator for actual pitch fields (`pitchFB`, `pitchSL`, etc.).
- Respect archetype, potential, age/class, existing repertoire, per-pitch caps, minimum usable pitch, and total repertoire constraints.
- Preserve `lastDevelopmentSeason` exact-once behavior.
- Keep `playerSeasonStats.ovr` or the chosen historical snapshot model consistent with updated player OVR.
- Consolidate duplicate signing/manual-conversion development logic behind one service.

**Acceptance criteria**

- Unit tests cover every potential tier, archetype family, player position, and pitch repertoire.
- Seeded 10-season Monte Carlo results stay within documented distribution bands.
- No rating exceeds caps/floors; pitch points cannot leak into unrelated ratings; development never runs twice for one season.

---

## MP-018 — Remove process-local assumptions or use one instance

**Evidence**

Presence counts, some caches/invalidation, advance progress, and lock owner tokens live in process memory. Multiple Autoscale instances can show inconsistent online counts/progress, serve stale data, and lose ownership metadata on restart.

**Required change**

Before horizontal scaling, put authoritative shared state in PostgreSQL or Redis:

- advance/job operations and leases;
- invalidation/version counters;
- presence with expiry;
- progress/status;
- rate-limit state where needed.

For the first 14-player beta, the acceptable temporary mitigation is a **single Reserved VM/application instance**, provided database locks and crash recovery from MP-005/MP-007 are complete. Document this deployment constraint.

**Acceptance criteria**

- Either multi-instance integration tests pass, or production is verifiably pinned to one instance and the commissioner knows the limitation.

---

## MP-019 — Repair the build and test pipeline

**Evidence**

- Type checking fails on current source.
- Playwright discovery imports DB-bound modules without test configuration and finds no runnable tests.
- A file imports `vitest`, but Vitest is not declared/configured.
- The existing 14-team test uses one guest session, one human coach, and simulated mode; it does not verify 14-person multiplayer.
- The lockfile contains numerous `package-firewall.replit.local` URLs, making clean installs outside Replit nonportable.

**Required change**

- Fix all TypeScript errors without suppressing checks.
- Split scripts clearly:
  - `test:unit` for a declared/configured unit runner;
  - `test:integration` for database service tests;
  - `test:e2e` for Playwright;
  - `test:14player` for the release scenario;
  - `test:fullseason` for the 149-team smoke/load scenario.
- Do not open a production DB during test discovery. Provide a dedicated resettable test database/schema.
- Add direct dependencies for packages imported by the app/tests; regenerate a portable public npm lockfile where release targets require it.
- Gate merge/deploy on clean install, typecheck, validators, unit/integration/E2E, and production build.

**Acceptance criteria**

The following equivalent release pipeline is green from a clean checkout:

```bash
npm ci
npm run check
npm run test:unit
npm run test:integration
npm run test:14player
npm run test:fullseason
npm run build
```

No suite may report zero discovered tests and pass.

---

## MP-020 — Add live-league operations, backup, and recovery

**Required change**

- Add liveness/readiness endpoints and deployment health checks.
- Take automated encrypted database backups with retention.
- Rehearse restoration into a separate database and record restore time.
- Add structured request IDs, error tracking, slow-query metrics, DB pool saturation metrics, operation/job dashboards, and alerts.
- Alert on expired/stuck advances, expired bootstrap jobs, pending/disputed reports, reconciliation failures, and repeated 5xx responses.
- Add commissioner/exportable snapshots before weekly advance, postseason transition, and offseason development. Snapshot failure must block destructive transition unless an explicitly documented safe backup exists.
- Create a rollback playbook for app version and data migration. Never roll application code backward across an incompatible migration without the tested data plan.

**Acceptance criteria**

- Restore the staging dress-rehearsal league from backup and verify users, teams, schedule, results, standings, recruits, and stories.
- Trigger each critical alert in staging.
- A commissioner can see operation ID/status and a human-readable recovery message instead of an indefinite spinner.

---

# 5. Genuine 14-player multiplayer release test

Replace or supplement the current one-session “14-team” test with this scenario. Use 14 independent browser contexts/API cookie jars and 14 registered users. The commissioner is one of the 14 coaches.

## A. League creation and claims

1. Register 14 recoverable accounts.
2. Commissioner creates the 14-team reported-game preset.
3. Select 14 distinct valid teams and validate conferences/schedule rules.
4. Create 13 distinct invitations.
5. Accept all invitations concurrently from separate sessions.
6. Race two users for one team; one succeeds and one receives 409.
7. Attempt one user on two teams and a cross-league team ID; reject both.
8. Assert 14 distinct human users/coaches/teams and zero CPU teams.

## B. Start dynasty exact-once

1. Load a published 102-player class, including its 10 storyline characters.
2. Submit 10 simultaneous Start requests.
3. Assert one schedule, one standings row per team/season, one roster per team, one active recruiting pool, and one phase transition.
4. Assert the start postconditions in MP-008.

## C. Weekly competitive flow

For at least one full regular-season week:

1. Every coach sets lineup/pitching and readiness from their own session.
2. An outsider and an uninvolved league coach attempt result submission; reject both.
3. Submit valid reports from involved coaches.
4. Confirm some, leave one unreported, one pending, and one disputed.
5. Verify advance is blocked with exact UI/API blockers and no side effects.
6. Resolve all blockers properly.
7. Race double confirm, commissioner quick-score, and Advance requests.
8. Assert every game and side effect is applied once.
9. Verify standings, conference standings, stats, XP, rest, news, and schedules reconcile.

## D. Concurrent recruiting

From all 14 sessions simultaneously:

- target/untarget the same recruits;
- call/scout/visit/offer near weekly limits;
- retry the same network request;
- attempt simultaneous signing of the same recruit;
- attempt actions at roster, target, and NIL caps.

Assert no negative budget/counters, no cap overrun, one signing winner, one charge, and one XP award.

## E. Authorization matrix

For two different leagues, substitute IDs in every state-changing endpoint:

- league, team, coach, player, game, report, recruit, class project/version/share, story, lineup, and offseason decision.

Test outsider, league member, involved coach, uninvolved coach, commissioner, and guest. Assert both response and unchanged database state.

## F. Season completion

Run the league through:

- all regular-season weeks;
- conference/postseason seeding;
- super regionals/CWS where enabled by the custom rules;
- champion/history/archive creation;
- departures, retention, transfer portal, signing, walk-ons, progression/regression;
- Season 2 schedule and recruiting-class load.

Verify the commissioner cannot skip required offseason subphases and development is applied once.

## G. Reliability/recovery

- Restart the app during report confirmation, recruiting action, weekly advance, and season transition.
- Retry after simulated connection timeouts.
- If multi-instance deployment is intended, alternate requests across two instances.
- Restore the final league from backup and rerun reconciliation.

---

# 6. Full Season regression gate

The multiplayer fixes must not break the flagship 149-team mode.

1. Bootstrap exactly 149 teams.
2. Validate every roster and conference assignment.
3. Generate/load approximately 1,081 valid recruits according to the current rules version.
4. Publish exactly 4,172 regular-season games for 56 games per team.
5. Verify no team plays itself, no duplicate game exists, no impossible same-day double-booking exists, and home/away/conference targets pass.
6. Simulate games chronologically so rest works across series.
7. Advance through conference championships, super regionals, and CWS.
8. Verify champion/history/records and Season 2 creation.
9. Run progression once and validate potential/archetype/pitch-mix distribution invariants.
10. Load a custom 1,081-player class before a later season and repeat class validation.
11. Kill/restart the bootstrap and weekly-advance workers to prove lease/operation recovery.

---

# 7. Commissioner and player-facing launch polish

These changes reduce support load and prevent avoidable commissioner mistakes.

## Preseason launch center

Add one commissioner checklist with hard status indicators for:

- 14/14 registered, recoverable accounts;
- 14/14 distinct human coaches and teams;
- zero CPU vacancies for the 14-human preset;
- roster validation per team;
- schedule count/fairness validation;
- recruiting class/version, size, position distribution, and 10 storyline cast;
- database migration and backup readiness;
- league rules summary: reported vs simulated, advance deadline, force-resolution policy, recruiting limits, progression, and postseason.

Start remains disabled until every required item is green.

## Weekly commissioner center

Show, in priority order:

1. missing/unreported games;
2. pending confirmations;
3. disputes;
4. coaches not ready;
5. invalid lineups/roster issues;
6. active/stuck operation state;
7. upcoming deadline.

Each row must link to the relevant game, team, coach, or resolution screen. Do not represent a blocking condition only by color.

## Safe controls

- Disable Advance while server preflight is red.
- Disable buttons after submission and show the durable operation ID/status.
- Require confirmation and a written reason for commissioner overrides.
- Add an expired-lock/job recovery control visible only when safe.
- After advance, show an integrity summary: games finalized, reports resolved, standings applied, recruiting week processed, stories processed, and next phase/week.

## Account and connection UX

- Do not allow a guest warning to coexist with guest ownership of a real team. Require upgrade/sign-in before invitation acceptance.
- Make reconnect/retry states explicit; do not encourage double-clicking.
- Display server time and league deadline timezone.
- Add a maintenance banner and commissioner pause control for incidents.

---

# 8. Data reconciliation queries and invariants

Implement these as reusable admin checks and run them after start, every advance, postseason transition, and offseason transition:

- duplicate active coach by `(league_id, user_id)` = 0;
- duplicate active coach by `(league_id, team_id)` = 0;
- duplicate standings by `(league_id, team_id, season)` = 0;
- orphaned team/player/coach/game/report/recruit/class-version rows = 0;
- completed games without canonical finalization = 0;
- incomplete games with applied standings = 0;
- games finalized more than once = 0;
- team W+L differs from countable completed games = 0;
- conference W+L differs from completed conference games = 0;
- negative NIL/action counters or resources over mode limits = 0;
- one recruit signed to more than one team = 0;
- signed players over roster/class limits = 0;
- development applied more than once per player/season = 0;
- current league phase/week inconsistent with its schedule/postseason state = 0;
- active advance/bootstrap operations with expired leases = 0, except visible recoverable incidents.

Expose a redacted summary in the commissioner panel and full detail to secure admin telemetry.

---

# 9. Performance and scale gates

Test with production-like PostgreSQL and the planned Replit deployment shape.

## 14-player target workload

- 14 simultaneous authenticated sessions;
- page-refresh burst at advance completion;
- all coaches submitting lineups/readiness/recruiting actions together;
- concurrent report/confirm actions;
- commissioner advance plus polling/progress traffic.

Initial targets:

- p95 ordinary reads under 500 ms;
- p95 ordinary mutations under 1 second, excluding queued simulation/advance operations;
- reported-mode advance after all results are final under 10 seconds;
- zero DB pool exhaustion and zero unbounded query fan-out;
- clear queued progress for operations expected to exceed 2 seconds.

## Full Season target workload

- 149-team bootstrap and 4,172-game schedule generation as background operations;
- one simulated week with day-sequenced rest;
- 1,081-player class save/load/publish;
- standings, rankings, stats, recruiting, and storyline hub query profiling.

If a Full Season weekly advance cannot reliably fit the request timeout, it must be an async durable operation with progress and recovery, not a longer synchronous HTTP request.

---

# 10. Implementation order

## Phase 0 — Freeze and preserve

- Freeze feature additions.
- Tag the audited commit and record the ZIP hash above.
- Clone production/staging data and take a restorable backup.
- Add error/request correlation IDs before deeper testing.

## Phase 1 — Compile, migrations, secrets, and logging

- MP-010 migrations/readiness.
- MP-012 response-log removal/redaction.
- MP-013 session/auth baseline.
- MP-011 body-size/version fixes and TypeScript corrections.
- MP-019 clean build/test harness.

## Phase 2 — Competitive result integrity

- MP-002 report authorization/validation.
- MP-003 play-by-play flag/server authority.
- MP-004 quick-score scope.
- MP-005 atomic finalization.
- MP-006 exhibitions.
- Reconciliation checks.

## Phase 3 — League state integrity

- MP-001 advance preflight.
- MP-007 durable advance/locks.
- MP-008 exact-once setup/start/season transitions.
- MP-009 Full Season job leases.
- MP-014 scope matrix.

## Phase 4 — Competitive balance integrity

- MP-015 recruiting concurrency.
- MP-016 rest sequencing.
- MP-017 progression/pitch mix.

## Phase 5 — Dress rehearsal and operations

- MP-018 deployment topology decision.
- MP-020 monitoring/backup/recovery.
- Genuine 14-user season-to-Season-2 test.
- Full Season regression/load test.
- Commissioner/player UAT and accessibility/usability pass.

---

# 11. Required Replit evidence bundle

Do not answer “implemented” without attaching all of the following:

1. Git commit hash and changed-file summary.
2. Numbered migration files and successful fresh/current-database migration logs.
3. Clean `npm ci`/equivalent install log.
4. Clean typecheck and production build logs.
5. Unit, integration, 14-user E2E, Full Season smoke, concurrency, and security test reports with nonzero test counts.
6. Database invariant report after:
   - league start;
   - a reported week;
   - postseason;
   - offseason progression;
   - Season 2 creation.
7. Failure-injection proof for game finalization and weekly advance.
8. Two-user same-team race and 20-request game/recruit race results.
9. Staging backup restore report.
10. Screenshots/video of commissioner preseason preflight, blocked advance, dispute resolution, operation recovery, and post-advance integrity summary.
11. Production environment checklist showing stable session secret, database, HTTPS/cookies, deployment instance count, health checks, backup schedule, and alert destinations—with secret values redacted.

---

# 12. Final launch checklist

The first real league can start only when every required box is checked.

## Code and data

- [ ] All P0 items are fixed.
- [ ] All exposed P1 paths are fixed; unfinished paths are server-side feature-flagged off.
- [ ] TypeScript and production build are green.
- [ ] Fresh and upgrade migrations are green; runtime DDL is removed.
- [ ] Static roster and recruiting validators remain green.
- [ ] Reconciliation reports zero violations.

## Multiplayer

- [ ] Genuine 14-session test passes through Season 2.
- [ ] Exactly 14 registered humans own 14 distinct teams.
- [ ] Report authorization, confirmation, dispute, and forced-resolution tests pass.
- [ ] Missing/pending/disputed games block advance without side effects.
- [ ] Finalization and advance concurrency/failure-injection tests pass.
- [ ] Recruiting concurrency and budget/cap tests pass.
- [ ] Cross-league IDOR matrix passes.

## Game systems

- [ ] Exhibition games do not affect official records/stats/XP/rest.
- [ ] Pitcher rest affects later games in a series.
- [ ] Progression/regression and pitch-mix tests pass.
- [ ] Postseason and offseason cannot be skipped and complete exactly once.
- [ ] Full Season smoke/regression passes.

## Operations

- [ ] Stable session secret and secure cookie/auth controls are configured.
- [ ] API bodies and secrets are absent from logs.
- [ ] Health/readiness and alerts are live.
- [ ] Backup restore has been rehearsed.
- [ ] Deployment is single-instance for beta or multi-instance shared-state tests pass.
- [ ] Commissioner recovery and incident playbook are available.
- [ ] A staging dress rehearsal has been approved by the commissioner and at least two other coaches.

## Launch recommendation after passing the gate

Launch as a private 14-player beta first. Schedule a commissioner/admin support window for the initial team-claim period, dynasty start, first recruiting deadline, first reported-game confirmation, and first weekly advance. Take a verified snapshot immediately before each of those first transitions. Expand to public leagues only after one full season and Season 2 rollover complete without reconciliation errors.

