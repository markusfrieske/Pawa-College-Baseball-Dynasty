# Pawa College Baseball Dynasty — Launch Readiness Audit and Replit Remediation Plan

**Audit date:** July 16, 2026  
**Candidate ZIP:** `Pawa-College-Baseball-Dynasty-main.zip`  
**SHA-256:** `E75EF896D1A2A81F5900D01FD7EBF51F63E1B3BDC953B517BDC362807AD85B3E`  
**Primary launch target:** One competitive, reported-score, 14-human-coach multiplayer dynasty  
**Secondary launch target:** 149-team Full Season, entirely in-app, progression enabled

## Launch verdict

**NO-GO. Do not publish this candidate or start the real 14-person league yet.**

The update contains several meaningful improvements, but it still fails the source typecheck and has confirmed defects that can stop season 2, bypass reported-game safeguards, partially initialize a league, double-apply simulated game effects after a retry, or let concurrent recruiting actions exceed their caps.

This is not a theoretical “needs more polish” verdict. The release candidate has immediately reproducible release-gate failures:

1. TypeScript reports three source errors.
2. Migration `0043` creates a standings unique index without `season`, which conflicts with the multi-season data model and prevents a team from receiving a season-2 standings row.
3. The migration runner can swallow a failed unique-index build as an “idempotent” duplicate-key condition and record the migration as applied.
4. Playwright cannot discover a clean test suite: the suite imports the database during discovery and one test imports missing `vitest`; the result was zero listed tests.
5. The supplied 14-user script is not wired to a package command and does not model the intended live league.

The recommended launch sequence is: fix every P0 item below, run the specified automated gates against a fresh PostgreSQL database, complete the 14-user rehearsal, then conduct a short commissioner acceptance test before inviting the real coaches.

## Audit results at a glance

| Gate | Result | Evidence |
|---|---:|---|
| Candidate fingerprinted | PASS | ZIP hash recorded above; candidate differs from the prior audit |
| Static canonical roster validation | PASS | `Roster validation: 0 error(s)` |
| Recruit generator validation | PASS | `Recruit-class validation: 0 error(s)` |
| TypeScript | **FAIL** | 3 confirmed source errors |
| Automated test discovery | **FAIL** | `DATABASE_URL` imports during discovery, missing `vitest`, `Total: 0 tests in 0 files` |
| Production build | INCONCLUSIVE LOCALLY | Validators ran, but client build was blocked by the audit environment's dependency junction/sandbox; this is not counted as a repo defect |
| Fresh-database migrations | **FAIL BY INSPECTION** | Incomplete migration source, stale readiness key, unsafe error swallowing, bad standings uniqueness |
| 14-human multiplayer proof | **FAIL** | Existing script uses guests, simulated/short mode, starts before invites, and does not test reported games or real concurrency |
| Season-2 transition | **FAIL BY INSPECTION** | `0043` prevents the standings inserts performed for the next season |
| Reported-score advance protection | **FAIL** | Preflight does not compile and quick-sim routes bypass the shared advance lock/gate |
| Single-game exactly-once finalization | PASS WITH CAVEATS | New transaction and `game_finalizations` sentinel are good |
| Batch simulated-game exactly-once finalization | **FAIL** | Game completion is committed before standings/stats/rest/XP, without a sentinel transaction |
| Atomic recruit signing/NIL debit | PASS | New `atomicSignAndDebitNil` is a substantial improvement |
| Other recruiting caps under concurrency | **FAIL** | Target/scout flows remain read-check-write; bulk scout can apply excess effects and accepts cross-league recruit IDs |
| Full Season job ownership | PASS WITH CAVEATS | UUID owner and heartbeat are improved; duplicate active jobs per league/type remain possible |

## Improvements that are genuinely present

Keep these changes while implementing the remaining work:

- Game-report submission now requires an involved coach or commissioner.
- Human-vs-CPU reports can auto-confirm, while human-vs-human reports require confirmation.
- Quick score uses the atomic single-game finalizer and verifies league scope.
- `finalizeGameAtomic` locks the game, inserts an idempotency sentinel, and updates official game effects in one transaction.
- Exhibition games suppress standings, player stats, pitcher rest, and coach XP.
- Simulated schedules are processed in logical-day order so pitcher rest can reflect multi-game weeks.
- Full Season jobs now use a per-process UUID, lease heartbeat, ownership-aware completion, and abort signaling.
- Recruit signing and NIL debit are now protected by a database transaction.
- A stable `SESSION_SECRET` is required; Helmet and authentication rate limits were added.
- Response-body logging was removed.
- Health/readiness endpoints were added.
- The static roster and generated-recruit validators pass.

These improvements are valuable, but they do not offset the blockers below.

---

# P0 — Required before launch

## LR-001 — Restore a clean compile and make it a mandatory gate

### Evidence

`tsc` reports:

```text
server/game-finalizer.ts(1308,36): TS2488: Type 'never' must have a '[Symbol.iterator]()' method
server/lib/advancePreflight.ts(123,27): TS2339: Property 'season' does not exist on GameReport
server/lib/advancePreflight.ts(123,60): TS2339: Property 'week' does not exist on GameReport
```

Relevant code:

- `server/game-finalizer.ts:1177-1184, 1263-1267, 1302-1317`
- `server/lib/advancePreflight.ts:119-136`

### Required change

1. Do not read `season` or `week` from a `game_reports` row unless those fields are deliberately added to the schema and migration. They are redundant because the report references a league-scoped game. Prefer validating the report by `gameId`, `leagueId`, and the loaded game.
2. Make the finalizer transaction return its post-commit coach deltas instead of assigning `pendingCoachDeltas` from inside an async callback. For example, return `{ alreadyFinalized, coachDeltas }` from `db.transaction(...)`, then mutate the accumulator after commit.
3. Update `npm run check` to run all static gates:

```json
{
  "check": "tsc --noEmit && tsx script/validate-rosters.ts && tsx script/validate-recruits.ts"
}
```

### Acceptance

- `npm ci`
- `npm run check`
- `npm run build`

All three must exit 0 from a clean checkout with no local declaration stubs.

## LR-002 — Repair the migration chain before it touches the production database

### Evidence

1. `server/migrations/0033_uniqueness_constraints.sql:15-16` correctly defines standings uniqueness as `(league_id, team_id, season)`.
2. `server/migrations/0043_uniqueness_constraints.sql:23-24` incorrectly creates `uidx_standings_league_team` on only `(league_id, team_id)`.
3. The offseason transition inserts new standings rows at `server/routes/simulation.ts:3982-3990`.
4. `EXPECTED_MIGRATION` is still `0041_game_finalizations` at `server/lib/runMigrations.ts:42`, even though `0042` through `0045` and an unnumbered migration exist.
5. The runner only scans `server/migrations`, while migrations `0000` through `0029` live in the root `migrations` folder. An empty database does not have one complete, automated zero-to-latest path.
6. `server/lib/runMigrations.ts:50-52, 146-154` treats any error containing `duplicate key` as safe and continues. A unique-index build fails with duplicate-key when existing rows violate the intended invariant; swallowing that error records a schema guarantee that was never created.
7. `server/migrations/0044_coach_team_uniqueness.sql:13-25` deletes duplicate coaches based on ID ordering, without proving which record is human or referenced by the team.

### Required change

1. Add a new forward migration; do not merely edit a migration that may already be recorded as applied:

```sql
-- 0046_fix_standings_uniqueness.sql
DROP INDEX IF EXISTS uidx_standings_league_team;

-- Abort if duplicate season rows exist; do not silently delete them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM standings
    GROUP BY league_id, team_id, season
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate standings rows require manual reconciliation';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_standings_league_team_season
  ON standings (league_id, team_id, season);
```

2. Remove generic `duplicate key` swallowing. `IF NOT EXISTS` and explicit SQLSTATE handling should cover genuinely idempotent DDL. A constraint violation during data validation must fail the migration and readiness.
3. Replace the hard-coded stale migration key with a committed ordered manifest or compute the required final key from the same migration manifest used by the runner. Readiness must prove **no pending migrations**, not merely the presence of an old key.
4. Use one migration directory and one numbering scheme. Move/port `0000-0029` into the production runner or establish a schema baseline migration that can build an empty database, followed by every incremental migration.
5. Make migration failure stop the process before routes listen. A 503 readiness endpoint is useful, but the app should not serve mutating routes with a broken schema.
6. Replace destructive duplicate-coach cleanup with a report-first migration/tool. Resolve each duplicate by explicit rules: retain the human user coach, preserve the team-referenced coach, migrate dependent rows, and abort on ambiguity.

### Acceptance

- Apply the complete migration chain to an empty PostgreSQL database.
- Apply it to a copy of the current Replit database.
- Restart twice and prove the second run is a no-op.
- Verify the required indexes using `pg_indexes`.
- Complete season 1 and create season-2 standings for every team.
- Intentionally seed a duplicate standings triple and prove migration/readiness fails without recording the migration.

## LR-003 — Make league creation, team selection, team claiming, and dynasty start transactional

### Evidence

`POST /api/leagues/:id/team-selection` at `server/routes.ts:1251-1375`:

- Performs a read-then-write check with no league-row lock or idempotency key.
- Silently continues on unknown conferences and team names at lines `1347` and `1350`.
- Does not reject duplicate team names in the payload.
- Creates teams, standings, and recruits across many commits, allowing partial leagues.

`POST /api/leagues/:id/setup` at `server/routes.ts:1420+`:

- Accepts an arbitrary `teamId` and creates a coach under the URL league without first proving the team belongs to that league.
- Does not lock the team, prove it is available, enforce the appropriate phase, or require an invitation/commissioner grant.
- Updates the supplied team after the coach insert, so failure can leave partial ownership.
- Generates rosters and schedule data from a claim request.

`POST /api/leagues/:id/start` at `server/routes/league-mgmt.ts:2195-2375`:

- Atomically claims the phase, which is good, but performs every setup mutation outside one transaction.
- On failure, resets the phase to `dynasty_setup` while partial roster/recruit/schedule/coach mutations remain.
- A concurrent losing request gets `alreadyStarted: true` even while the winning request is still running and may fail.
- Calls `generateCpuCoaches` without requiring the intended 14 human coaches.

### Required change

1. Create a single transactional league-bootstrap service with explicit stages and an operation/idempotency key.
2. Lock the league row before team creation. Validate the entire payload before any writes:
   - exact team count;
   - exact conference distribution;
   - unique conference IDs;
   - unique canonical team names;
   - every team name exists in the permitted pool;
   - final postconditions match the league preset.
3. Replace silent `continue` branches with a 422 response containing every invalid item.
4. Create one transactional `claimTeamForUser` service and use it for commissioner setup and invite acceptance:
   - lock the league and team rows;
   - require `team.leagueId === league.id`;
   - require an unused invitation or commissioner self-claim permission;
   - require team unclaimed/CPU-replaceable under an explicit rule;
   - enforce one user per league and one coach per team;
   - update coach/team references together;
   - return the existing claim on an idempotent retry.
5. Team claiming must never generate league-wide rosters or schedules.
6. Add a start preflight response and UI. For the real 14-person league, block start unless:
   - 14 teams exist;
   - 14 distinct registered users have 14 distinct teams;
   - no team is CPU;
   - all teams have valid rosters and lineups;
   - schedule/recruiting-class settings are valid;
   - progression is enabled;
   - reported game mode is enabled.
7. Do not auto-create CPU coaches when the league is configured as all-human. CPU fallback must be an explicit commissioner action with a warning and audit entry.
8. Keep the league in a non-playable `starting` state until postconditions pass. On retry, resume missing idempotent stages; do not reset the phase while keeping partial data.

### Acceptance

- Two simultaneous team-selection requests produce one complete league and one idempotent success/409, never duplicates.
- Two users race for the same team; exactly one succeeds.
- A user supplies a team ID from another league; the request returns 404/403 and neither league changes.
- Inject failure after every bootstrap stage, restart, retry, and obtain exactly one complete league.
- Two simultaneous start requests eventually return the same completed result; neither reports success before setup finishes.

## LR-004 — Fix the reported-game advance gate and disable unsafe quick-sim paths

### Evidence

- `server/lib/advancePreflight.ts:123` does not compile because reports have no `season`/`week` fields.
- At `server/lib/advancePreflight.ts:141-148`, only `pending` and `disputed` reports block. Unknown statuses pass; the comment says `accepted`, while the implemented confirmed status is `confirmed`.
- Preflight does not prove both `report.status === 'confirmed'` and official game finalization (`games.is_complete` plus the finalization sentinel).
- It checks only two-human-team games. That is reasonable for automatically simulated CPU games, but the final contract needs to state this explicitly and detect orphaned/invalid scheduled games separately.
- Quick-sim endpoints at `server/routes/simulation.ts:7891, 7932, 7967, 7989, 8023` call `simulateUntil`, which repeatedly calls `advanceLeagueStep` directly.
- Quick-sim routes do not acquire the normal DB advance lock.
- Several routes run preflight only once at the beginning. They then simulate later reported weeks without requiring later reports. `sim-full-season` and `sim-to-cws` do not even run the initial preflight.

### Required change

1. Make preflight fail closed. A scheduled human-vs-human game for the current stage is complete only when:
   - a league-scoped report exists;
   - its status is exactly `confirmed`;
   - the game is complete;
   - a `game_finalizations` row exists;
   - score values agree across report and game.
2. Treat every other status as a blocker, including unknown future statuses.
3. Delete the invalid report season/week check or add fields deliberately; do not use properties outside the schema.
4. For the launch version, return 409 for every quick-sim endpoint in `reported` leagues. This is the safest rule for the all-human league.
5. For simulated leagues, route normal advance and every quick-sim step through one shared lock/operation/preflight service. Do not call `advanceLeagueStep` directly from route-specific loops.
6. Add an explicit commissioner resolution workflow for missing/disputed games. “Force advance” must not silently skip official results.

### Acceptance

- Pending, disputed, unknown-status, missing, mismatched, and confirmed-but-unfinalized reports all block.
- A confirmed and atomically finalized report allows advance.
- Reported leagues reject every quick-sim shortcut.
- Two simultaneous advance/quick-sim requests cannot both mutate the league.

## LR-005 — Replace the advance lock with one renewable database lease

### Evidence

- `server/route-helpers.ts:248-305` stores the owner token in an in-process map and writes a DB row with `locked_at`, but no lease expiry.
- The advance operation heartbeat renews `league_advances.lease_expires_at` at `server/routes/simulation.ts:7787-7800`, not the lock row.
- The clear-stuck endpoint treats a lock older than 15 minutes as removable at `server/routes/simulation.ts:7479-7517`.

An active advance that takes more than 15 minutes can therefore have its lock deleted while its separate operation heartbeat is healthy. Another request can then acquire the lock and run concurrently.

### Required change

Use one DB-owned lease model:

- `league_id` primary key;
- `owner_token` UUID;
- `lease_expires_at`;
- atomic acquire that inserts or takes over only an expired lease;
- heartbeat that updates only when owner matches;
- release that deletes only when owner matches;
- clear-stuck that only clears an expired lease;
- work aborts immediately if heartbeat loses ownership.

The durable advance-operation row should reference the same owner token. Do not rely on the in-memory map as proof of ownership.

### Acceptance

- Run an advance longer than 15 minutes with a short test lease; clear-stuck must refuse while heartbeats succeed.
- Kill the process; a second process can take over only after expiry.
- Old owner completion cannot overwrite the new owner.

## LR-006 — Make batch game finalization exactly-once

### Evidence

`batchFinalizeGames` at `server/game-finalizer.ts:673+` performs separate commits:

1. Marks all games complete at lines `687-695`.
2. Updates standings afterward.
3. Updates player stats afterward.
4. Applies rest and accumulated coach XP afterward.

It does not use `game_finalizations` sentinels or one transaction. A crash after step 1 leaves completed games with missing standings/stats. A retry or manual recovery can double-apply downstream effects. This path is used by simulated game advancement, including Full Season.

### Required change

For correctness-first launch:

1. Route every official game through `finalizeGameAtomic`, processing games sequentially by logical day. Fourteen teams and seven matchups per slot do not require unsafe batching.
2. If batching is retained for 149-team performance, implement it inside a DB transaction:
   - lock selected game rows;
   - insert one sentinel per unfinalized game with `ON CONFLICT DO NOTHING`;
   - operate only on newly claimed games;
   - update game, standings, stats, rest, and persisted coach XP in that transaction;
   - commit once;
   - run only non-critical cache/recap work post-commit.
3. Do not accumulate official XP only in memory across a commit boundary.

### Acceptance

- Retry the same single game and batch 10 times; official rows change exactly once.
- Inject a crash after each internal stage and retry; results converge to the same database state as one uninterrupted run.
- Validate totals: sum of standings wins equals completed official games; player team-game counts and coach records reconcile.

## LR-007 — Make every scarce recruiting action atomic and league-scoped

### Evidence

Atomic signing/NIL debit is improved, but the other competitive actions remain unsafe:

- Target toggling at `server/routes/recruiting.ts:1490-1535` reads the current target count and later toggles state outside a transaction. Concurrent calls can exceed the target cap, and retries can invert state.
- The target route does not first load and verify that the recruit belongs to `req.params.id`.
- Single scout at `server/routes/recruiting.ts:2804+` checks a stale coach counter, applies reveals/logs, and then performs a read-derived counter update.
- Bulk scout at `server/routes/recruiting.ts:2991-3144` reads remaining actions, applies all reveals, and only afterward caps the stored counter with `LEAST`. Two concurrent requests can each apply a full set of reveals while the final counter merely appears capped.
- Bulk scout loads recruit IDs at lines `3068-3071` without rejecting a recruit from another league.
- The comment claiming there is no race at line `3019` is incorrect.

### Required change

1. Replace toggle semantics with explicit idempotent commands: `PUT target` and `DELETE target`, or a body `{ targeted: true|false }` plus an idempotency key.
2. Validate every recruit by `(recruit_id, league_id)` before mutation.
3. Reserve counters first using a conditional atomic update or a per-turn ledger transaction:

```sql
UPDATE coaches
SET scout_actions_used = scout_actions_used + $n
WHERE id = $coach
  AND scout_actions_used + $n <= $cap
RETURNING scout_actions_used;
```

4. Apply counter reservation, interest mutation, action log, and reveals in the same transaction. Roll back the reservation if any effect fails.
5. Deduplicate bulk recruit IDs before calculating the cost.
6. Apply the same pattern to calls/emails, visits, offers, NIL spending, walk-on bids, and any other capped weekly/seasonal action. Database uniqueness should support, not replace, the transaction.
7. Add request idempotency keys so a client retry returns the prior result without consuming a second action.

### Acceptance

- Fire 50 simultaneous target requests at a cap of 20; the final count and successful results are exactly 20.
- Fire simultaneous scout batches that exceed the remaining cap; applied reveal/log rows equal the reserved count and never exceed it.
- Cross-league recruit IDs return 404 with zero mutations.
- Retry the same idempotency key; counters and effects do not change.
- Race 14 teams to sign one recruit; one team signs, one NIL debit occurs, and every loser receives a deterministic conflict.

## LR-008 — Fix the automated test system before treating it as release evidence

### Evidence

- `package.json` has no unit, integration, 14-user, migration, or Full Season test commands.
- `playwright.config.ts` points `testDir` at all of `tests`.
- `tests/unit/storyline-health.test.ts:10` imports `vitest`, but `vitest` is absent from dependencies.
- Several files under `tests/unit` are actually Playwright/DB integration tests.
- `playwright test --list` attempted DB imports during collection, failed without `DATABASE_URL`, hit the missing `vitest` package, and listed zero tests.
- `server/__tests__/batch-finalize.test.ts` is a standalone script not connected to a package gate.

### Required change

1. Separate the suites by runner and responsibility:
   - `tests/unit`: Vitest, no real DB;
   - `tests/integration`: Vitest or Node test runner with isolated PostgreSQL;
   - `tests/e2e` and `tests/smoke`: Playwright only;
   - `tests/load`: concurrency/retry harness.
2. Install and configure Vitest, or convert the lone Vitest test. Do not let Playwright collect Vitest files.
3. Add package scripts:

```json
{
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test tests/e2e tests/smoke",
  "test:14-player": "tsx script/14-user-test.ts",
  "test:full-season": "tsx script/full-season-test.ts",
  "test:migrations": "tsx script/migration-test.ts",
  "test:release": "npm run check && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e && npm run test:14-player && npm run test:full-season && npm run test:migrations"
}
```

4. Provision a throwaway database per integration/E2E run and run migrations before tests.
5. Always clean test leagues/users or drop the test schema after the run.

### Acceptance

`npm run test:release` exits 0 from a clean clone and produces a machine-readable result artifact.

## LR-009 — Replace the current 14-user script with a faithful league rehearsal

### Evidence

`script/14-user-test.ts` currently:

- Creates 14 guest sessions at lines `267-277`, not 14 registered/recoverable users.
- Uses `seasonLength: 'short'` and `progressionEnabled: false` at lines `290-292`.
- Does not configure reported game mode.
- Starts the dynasty at line `320` before the commissioner creates a coach and before the 13 invitations are issued/accepted.
- Uses generic `/setup` after start at line `340`.
- Accepts invites sequentially, not concurrently.
- Emails the same recruit in a sequential loop at lines `486-499`.
- Simulates to the offseason at line `520`; it never submits, confirms, disputes, or resolves a full slate of reported human games.
- Accepts `dynasty_setup` as a possible result after start.
- Is not connected to a package script.

### Required replacement test

The release rehearsal must:

1. Create 14 **registered** users with distinct credentials.
2. Create the exact production league configuration: 14 teams, all-human, reported-score mode, intended schedule length, progression on, intended recruiting balance profile.
3. Select teams, have the commissioner claim a team, issue invitations, and have the other 13 users claim distinct teams **before start**.
4. Assert the start preflight sees exactly 14 humans and zero CPU teams.
5. Race two users for one team with `Promise.all`; exactly one may succeed.
6. Start using two concurrent requests and verify one complete idempotent outcome.
7. Assert every roster, lineup, schedule, recruiting pool, coach link, and standings row.
8. Play at least one reported week:
   - only involved coaches can submit;
   - opponent confirms;
   - one game is disputed and commissioner-resolved;
   - invalid/negative/fractional/tied/out-of-range data is rejected;
   - advance is blocked until every official game is finalized.
9. Fire concurrent recruiting actions and signing attempts.
10. Double-click advance from multiple sessions and verify exactly one phase transition.
11. Complete season 1 and the full offseason with progression on.
12. Assert season 2 has one standings row per team, valid rosters, a new class, a valid schedule, retained human ownership, and no duplicated stats/XP/events.

## LR-010 — Expand request-body handling to every recruiting-class endpoint

### Evidence

The route-specific 5 MB parser in `server/index.ts:62-78` only selects:

- `POST /api/saved-recruiting-classes`
- `PATCH /api/saved-recruiting-classes/:id`

The wizard sends a full generated class to `/api/leagues/:id/recruiting/save-wizard-class` at `client/src/components/recruiting-wizard.tsx:2781`, which remains on the default 100 KB parser. Full class project data sent to `POST /api/class-projects` and `PATCH /api/class-projects/:projectId/draft` also remains on the default parser.

An 80-player class can plausibly exceed 100 KB; a Full Season class is much larger.

### Required change

1. Use a small default body limit globally.
2. Apply an authenticated, rate-limited 5–10 MB parser to every endpoint that legitimately receives complete class data:
   - save wizard class;
   - saved class create/update/import;
   - class project create/draft update;
   - commissioner season-class load if it accepts the class body.
3. Validate `Content-Length` when present, enforce the limit while streaming/parsing, and return a clear 413.
4. Keep strict schema caps: maximum recruits, string lengths, 10 storyline characters, and bounded nested arrays.
5. Prefer saving large drafts by project ID/version rather than retransmitting the full class through multiple endpoints.

### Acceptance

- Save/load/edit/share a normal 80-player class.
- Save/load a production-size 14-team class.
- Save/load a 149-team Full Season class.
- Payload over the configured maximum returns 413 without high memory usage or a partial database write.

## LR-011 — Validate all game-report and commissioner-correction data with one strict schema

### Evidence

- Initial score submission now checks integer scores from 0–30, which is good.
- Commissioner edit at `server/routes/games.ts:698-747` checks only that scores are numbers before calling `validateBoxScore`.
- `validateBoxScore` at `server/lib/validateBoxScore.ts` does not reject fractional/NaN/infinite/over-30/tied scores and does not validate all individual batting/pitching values as finite, non-negative, bounded integers.
- Hits mismatch is only a warning.
- Dispute corrections at `server/routes/games.ts:972-985` accept any non-negative numbers, and force-finalize at lines `1046-1055` does not revalidate the corrected report.

### Required change

Define one strict Zod schema used by submit, commissioner edit, dispute correction, confirmation, and force-finalize:

- scores: finite integers, 0–30, not tied;
- inning arrays: finite non-negative integers and correct total;
- hits/errors and every batting/pitching field: finite non-negative integers with sensible upper bounds;
- player IDs: unique, on the correct game's team roster;
- innings pitched: valid baseball outs representation and team totals;
- cross-field reconciliation for runs, hits, outs, and totals.

Warnings can remain for unusual but legal baseball results; data-integrity conditions must block.

### Acceptance

The same invalid fixture must be rejected through every edit/finalization path. A commissioner correction must never bypass the normal schema.

## LR-012 — Make phase advancement restartable, not merely locked

### Evidence

The new durable operation row and checkpoints are a good start, but `advanceLeagueStep` still performs many side effects outside one transaction. Several checkpoint writes are best-effort/fire-and-forget. Locking prevents concurrent entry but does not guarantee that a crash halfway through a phase can safely resume without duplicated or omitted work.

### Required change

1. Give every advance an immutable operation key such as `(league_id, from_season, from_phase, from_week)` with one active/completed row.
2. Persist stage state synchronously before returning success.
3. Make each stage either:
   - one database transaction, or
   - independently idempotent with a unique stage-effect key.
4. Resume the same operation after a crash. Never start a second logical advance from a partially mutated league.
5. Add failure-injection hooks in test only, after each stage.

### Acceptance

Kill and restart after every stage of regular-week, conference championship, super regional, CWS, departures, recruiting, signing, walk-ons, and new-season creation. The resumed result must equal one uninterrupted run.

---

# P1 — Complete before public release; strongly recommended before the first league

## LR-013 — Keep play-by-play disabled until it has league authorization and trusted finalization

`PBP_ENABLED` is safely off unless it equals the exact string `true`. Keep it explicitly set to `false` in production.

If enabled, routes at `server/routes/simulation.ts:5715+` and `7015+` verify authentication and game league scope but do not require the user to coach an involved team or be commissioner. Finalization trusts client-supplied score/stat arrays. Before enabling:

- authorize involved coach/commissioner;
- make simulation server-owned with a signed result token or persisted simulation record;
- finalize only the stored server result;
- apply the same score/stat schema and idempotent finalizer.

## LR-014 — Add CSRF/origin protection and restrict guest ownership

Cookie security, session-secret enforcement, Helmet, and rate limiting improved. Remaining public-launch work:

- validate `Origin`/`Referer` or use CSRF tokens for state-changing requests;
- raise password minimum from 6 to at least 12 and add breached/common-password defense;
- require registered accounts for league creation, invitation acceptance, and persistent coach ownership;
- provide guest-to-account upgrade before a guest can own permanent data;
- verify the real 14 coaches are not guest accounts;
- document account recovery before launch.

## LR-015 — Add an active-job uniqueness invariant per league/type

The job runner's UUID ownership and heartbeat are improved. Add database uniqueness that prevents more than one pending/running bootstrap job for the same `(league_id, job_type)`, and use an idempotent job-create operation. Make expired-job reset owner-aware so startup recovery cannot reset a job just claimed by another instance.

## LR-016 — Verify progression budgets longitudinally

Pitch-repertoire development now exists. However, `computeGrowthBudget` calculates `pitchMixPoints` as 25% of `totalPoints`, while `runSeasonDevelopment` still sends the full `totalPoints` to normal rating growth and applies pitch-mix growth separately. If `totalPoints` is the total development budget, pitchers receive roughly 125% of it.

Decide and document the intended model:

- either carve pitch points out of total growth; or
- rename/document them as an intentional additional pitcher budget.

Add seeded Monte Carlo tests across 10,000 player-seasons, grouped by position, class year, potential grade, archetype, and current OVR. Verify caps, archetype-weighted growth, regression, pitcher repertoires, and league OVR distribution through 10 seasons. Ensure season-history OVR snapshots use the post-development value.

## LR-017 — Make the dependency lock portable

`package-lock.json` contains 116 references to `package-firewall.replit.local`. Confirm the production builder can resolve them. Prefer a lock file containing public registry URLs or a committed Replit-supported install configuration. Prove `npm ci` works in a clean deploy environment with no pre-existing package cache.

## LR-018 — Add operational safeguards for the inaugural league

Before invitations go live:

- automated daily PostgreSQL backups;
- tested restore procedure;
- one-click commissioner export/save snapshot;
- structured error logging with request ID, league ID, operation ID, and user ID—never passwords/session cookies/full request bodies;
- alerts on readiness failure, migration failure, stuck advance/job, failed finalization, and standings reconciliation drift;
- a documented rollback release and database migration rollback/forward-fix plan.

For the first league, deploy one application instance unless and until the multi-instance concurrency suite passes. In-process presence counts are not authoritative across replicas.

---

# Required automated release suites

## 1. Database migration suite

Run against both an empty DB and a sanitized clone of production:

- apply zero-to-latest;
- restart twice;
- verify no pending keys;
- verify every expected index/constraint;
- detect duplicate coaches, standings, interests, action logs, and active advances;
- prove season-2 standings creation;
- prove a data conflict fails without recording the migration.

## 2. 14-human reported league suite

Use the exact launch settings and 14 registered users. Cover:

- invite creation, preview, acceptance, expiry, revocation, and replay;
- cross-league team/recruit/player/game IDs;
- simultaneous team claims;
- all-human start preflight;
- complete rosters/lineups/schedule/recruit class;
- report submit/confirm/dispute/commissioner resolution;
- advance blocking and double-click concurrency;
- target/scout/call/visit/NIL/signing concurrency;
- pitcher rest across a series;
- full season, postseason/offseason, progression, and season 2;
- retained users, coaches, teams, archives, stats, and records.

## 3. Full Season suite

Create a fresh 149-team Full Season and assert:

- canonical team/conference counts;
- one complete valid roster per team;
- progression enabled and game mode in-app/simulated;
- sufficient recruiting pool and 10 storyline recruits;
- 56 regular-season games per team with no invalid self/duplicate slots;
- conference championships;
- Super Regionals;
- College World Series;
- official-game/stat/standings/rest reconciliation;
- completion through offseason and season 2;
- job crash/reclaim and duplicate-job prevention.

## 4. Failure-injection suite

At minimum, terminate the worker after:

- team inserted but before standings;
- roster team N of 14/149;
- schedule inserted but before phase update;
- game marked complete but before standings/stats/rest/XP;
- report finalized but before report status update;
- each advance checkpoint;
- season-2 standings team N;
- job heartbeat loss.

Every retry must converge without duplicates or missing effects.

## 5. Security/authorization suite

For every mutating resource route:

- anonymous user;
- league non-member;
- member of a different league using a valid foreign resource ID;
- member on an uninvolved team;
- co-commissioner;
- commissioner;
- guest account where persistent ownership is forbidden.

Expect 401/403/404 consistently and assert the database is unchanged.

---

# Pre-deploy database checks

Run these on a database copy first. Any returned row requires investigation.

```sql
-- Duplicate standings for the correct multi-season key
SELECT league_id, team_id, season, COUNT(*)
FROM standings
GROUP BY league_id, team_id, season
HAVING COUNT(*) > 1;

-- Duplicate coach ownership
SELECT league_id, team_id, COUNT(*)
FROM coaches
WHERE team_id IS NOT NULL
GROUP BY league_id, team_id
HAVING COUNT(*) > 1;

SELECT league_id, user_id, COUNT(*)
FROM coaches
WHERE user_id IS NOT NULL
GROUP BY league_id, user_id
HAVING COUNT(*) > 1;

-- Completed official games missing an idempotency sentinel
SELECT g.id, g.league_id, g.season, g.week
FROM games g
LEFT JOIN game_finalizations f ON f.game_id = g.id
WHERE g.is_complete = true
  AND COALESCE(g.game_type, '') <> 'exhibition'
  AND f.game_id IS NULL;

-- Multiple active advance operations
SELECT league_id, COUNT(*)
FROM league_advances
WHERE status = 'running'
GROUP BY league_id
HAVING COUNT(*) > 1;

-- Active/stuck locks and jobs
SELECT * FROM league_advance_locks;
SELECT * FROM league_jobs WHERE status IN ('pending', 'running');
```

Also inspect `pg_indexes` and confirm that `uidx_standings_league_team` is absent and `(league_id, team_id, season)` uniqueness is present.

---

# Inaugural 14-person launch runbook

Do this only after all P0 items and automated gates pass.

## Staging rehearsal

1. Deploy the exact release commit to staging with a new empty database.
2. Confirm migrations complete and `/health/ready` returns 200.
3. Create the league with the exact production settings.
4. Use 14 registered staging accounts and accept all invitations before start.
5. Verify the commissioner start-preflight screen shows 14/14 humans, zero CPU teams, progression on, reported mode, and all green roster/schedule/class checks.
6. Run the full 14-user test through season 2.
7. Export the league, restore the database backup to a second staging database, and verify the restored league.

## Production creation

1. Take a database backup immediately before deployment.
2. Deploy one instance with:
   - a stable 32+ character `SESSION_SECRET`;
   - production `DATABASE_URL`;
   - `PBP_ENABLED=false`;
   - no debug or body logging;
   - readiness configured as a deployment health gate.
3. Confirm the exact migration version and zero pending migrations.
4. Create the real league, claim the commissioner team, and invite all 13 coaches.
5. Confirm every coach is a registered account and every team is uniquely claimed.
6. Export/backup before pressing Start.
7. Start once and wait for the completed postcondition report.
8. Verify all 14 dashboards before allowing recruiting actions.

## First-week commissioner checklist

- Every matchup is visible to the correct two coaches.
- A non-involved coach cannot submit/confirm it.
- Reports reconcile and confirmation creates exactly one official result.
- Dispute resolution is tested on a staging copy, not improvised in production.
- Recruiting counters match the authoritative server ledger after simultaneous activity.
- Advance remains blocked until every required result is confirmed/finalized.
- Take a backup before the first advance and after it succeeds.

---

# Final launch gates

Replit should return this exact evidence package before approval:

- [ ] Clean commit SHA and deployment SHA match.
- [ ] `npm ci` passes from an empty dependency cache.
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:release` passes.
- [ ] Empty-DB and production-clone migration logs pass.
- [ ] Bad standings index is removed and season-aware uniqueness is verified.
- [ ] 14 registered-user reported-mode test passes through season 2.
- [ ] 149-team Full Season test passes through season 2.
- [ ] Concurrency/failure-injection tests pass.
- [ ] No unresolved P0 findings.
- [ ] `PBP_ENABLED=false` is confirmed.
- [ ] Backups and restore are verified.
- [ ] `/health/ready` is 200 after deploy.
- [ ] Commissioner staging acceptance is signed off.

**Launch decision after these gates:** GO only when every checkbox is backed by fresh logs from the exact release commit and a clean database environment.
