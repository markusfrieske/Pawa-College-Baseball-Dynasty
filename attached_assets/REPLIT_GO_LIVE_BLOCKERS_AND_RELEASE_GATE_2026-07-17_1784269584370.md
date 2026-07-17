# Pawa College Baseball Dynasty — Final Go-Live Audit and Replit Remediation Plan

**Audit date:** July 17, 2026  
**Candidate ZIP:** `Pawa-College-Baseball-Dynasty-main.zip`  
**Candidate SHA-256:** `5B121CD8D4463B142894B340DED83071266679805818FF324F5CD91B37123C05`  
**Decision:** **NO-GO for an official/public launch**  
**Scope:** 149-team Full Season and the first 14-human multiplayer league

This candidate is substantially closer than the July 16 candidate. Several important fixes are real and correctly implemented. However, the application still has integrity-critical gaps in dynasty setup, reported-mode advancement, postseason finalization, recruiting concurrency, migration/startup behavior, and the actual launch test suite. These are capable of producing partial league setup, skipped reported games, double or missing game side effects, exceeded recruiting limits, or an application serving traffic on an incompletely migrated database.

The application is suitable for continued disposable staging. It is not yet suitable for the first official 14-person dynasty or a public Full Season release.

---

## Instructions to Replit

Implement every **P0** item in this document before claiming launch readiness. Do not replace the requested tests with seed scripts or simulated single-user tests. Preserve both supported experiences:

1. **Full Season:** all 149 teams, all conferences, 56 regular-season games per team, progression enabled, simulated in-app results, conference championships, Super Regionals, and College World Series.
2. **14-human custom multiplayer:** exactly 14 independently authenticated users controlling 14 distinct teams, using the intended production settings and the reported-results workflow.

When complete, return all of the following:

- Git commit SHA.
- Migration log for a brand-new empty database.
- Migration log for a clone of the current production/staging database.
- Production build log from a clean install.
- Complete release-gate test log.
- Database invariant report after both mode-faithful lifecycle tests.
- Failure-injection test log for dynasty start, game finalization, and weekly advance.
- Confirmation that the deployment ran with at least two application instances for the concurrency suite, or an explicit temporary single-instance deployment configuration.

Do not report “implemented” if a required test was not executed.

---

## What is now fixed

The following changes were verified in the source and should be retained:

| Area | Verified improvement |
|---|---|
| Standings uniqueness | `server/migrations/0046_fix_standings_uniqueness.sql` replaces the incorrect league/team uniqueness rule with league/team/season uniqueness. |
| Recruiting action uniqueness | `0047_recruiting_actions_unique_indexes.sql` restores deterministic weekly and seasonal action constraints. |
| Migration errors | `runMigrations.ts` no longer treats a duplicate-key/data-integrity failure as harmless. |
| Migration version | `EXPECTED_MIGRATION` is updated to migration 0047. |
| Advance preflight compile issue | The stale report season/week references were removed and unknown report statuses now fail closed. |
| Invite acceptance | Invite claims now use a transaction and row locks, materially reducing duplicate team claims. |
| Regular-season finalization | The regular-season simulation path now uses `finalizeGameAtomic` sequentially by logical day. |
| Game scores | Scores must be finite integers from 0–30 and ties are rejected. |
| Reported fast-forward | `sim-full-season` and `sim-to-cws` now reject reported-mode leagues. |
| Recruiting contacts | Phone, email, visit, head-coach visit, and offer actions use the transactional recruiting action service. |
| Upload limits | Recruiting-class creator/import routes have appropriately expanded request-body limits. |
| Object authorization | A new object-storage authorization verifier exists. |
| Rest logic | The pitcher-rest unit-only harness passed 28 of 28 checks in this audit environment. |
| Test discovery | Playwright ignores the incompatible `tests/unit` directory and now discovers 47 tests in 14 browser/API files. |
| Static data | Roster, recruiting-class, ability, pitch-mix, roster-structure, and OVR-distribution validators passed when run individually. |

These improvements lower risk, but they do not close the blockers below.

---

## Audit evidence and limitations

### Checks that passed

- Main client/shared/server TypeScript source passed a focused strict type-check after supplying declarations missing from the audit machine’s cached dependency tree.
- Roster validation: **0 errors**.
- Recruiting-class validation: **0 errors**.
- Ability validation: passed with four non-fatal empty-ability warnings.
- Pitch-mix validation: passed.
- Roster-structure validation: passed.
- OVR-distribution validation: passed.
- Pitcher-rest unit harness: **28/28 passed**.
- Playwright discovery: **47 tests in 14 files**.

### Checks that were not conclusive locally

- The database-backed Playwright suite could not be executed without a disposable PostgreSQL database and running application environment.
- The production bundle reached and passed roster and recruit validators, then the local audit’s linked dependency directory caused Vite/esbuild to hit a Windows sandbox access error. Replit must provide the authoritative clean-install build result.
- `npm run check` could not use the audit machine’s stale pnpm-based dependency cache for packages present in `package-lock.json`. Replit must run it after `npm ci` or a clean deterministic install.
- The aggregate `validate-all.ts` process launcher produced a Windows child-process signal error, although every underlying validator passed individually.

### Problems in the verification tooling itself

- `scripts/verify-pitcher-rest.ts` is not type-clean: the team fixture supplies numeric `fanbasePassion` where the schema expects a string (`lines 332, 341, 343` in this candidate).
- New verification scripts import `cookie-signature` directly without declaring it as a direct dependency or its type package.
- The new verification scripts are not part of `npm test`, `npm run check`, the deployment build, or a single release-gate command.
- `tests/unit/storyline-health.test.ts` uses Vitest, but Vitest is not declared. Playwright now ignores all unit tests, so those tests are currently outside the release gate.

---

# P0 launch blockers

## P0-1 — The test suite does not reproduce either production experience

### Evidence

`tests/e2e/14-team-standard.test.ts` is not a 14-person multiplayer test:

- It creates one guest session.
- It starts the dynasty before assigning the one human coach.
- The remaining teams are CPU-controlled.
- `progressionEnabled` defaults to `false` in `tests/helpers/api.ts`.
- It uses simulated results and `sim-to-offseason`.
- It never runs 14 simultaneous sessions, 14 invite claims, reported games, readiness, disputes, or concurrent recruiting.

`scripts/seed-14-coach-league.ts` also does not reproduce the intended league:

- It creates **15 teams**, not 14.
- It creates 14 humans plus one CPU team.
- It explicitly sets `progressionEnabled: false`.
- It explicitly sets `gameMode: "simulated"`.
- It provisions data but does not test a reported season, concurrent user actions, or season rollover.
- It is not connected to a release gate.

The files named “full season” do not test the 149-team Full Season preset. `tests/smoke/02-full-season.spec.ts` creates a 13-team medium custom dynasty; “full season” only means it loops across an entire small season. No discovered test creates `preset: "full_season"`, 149 teams, all conferences, or a 56-game schedule.

### Required implementation

Create two deterministic, mode-faithful test profiles. They may be tagged `@release` and split into normal and nightly jobs, but both must run successfully against the release candidate before launch.

#### A. `release:14-human-reported`

The test must:

1. Start from an empty disposable database at the latest migration.
2. Create exactly 14 independently authenticated users.
3. Create a custom league with exactly 14 teams and the same options intended for the first official league.
4. Explicitly set and assert `gameMode: "reported"`.
5. Explicitly set and assert the intended progression setting; use `true` for the production profile unless the commissioner deliberately chooses otherwise.
6. Have the commissioner claim one valid team.
7. Generate 13 single-use invitations.
8. Accept all 13 invitations concurrently from separate sessions.
9. Assert 14 human teams, 14 coaches, 14 distinct users, 14 distinct teams, and zero CPU teams.
10. Assert a user cannot claim a second team, a claimed team, or a team belonging to another league.
11. Assert a non-member cannot read or mutate protected league data.
12. Submit a complete week of reported results, including at least one confirmation and one dispute/commissioner resolution.
13. Assert advance is blocked while any required report is unreported, pending, disputed, invalid, or not atomically finalized.
14. Assert exactly one advance occurs under 10–20 simultaneous advance requests.
15. Run concurrent recruiting actions for the same coach and verify targets, scouts, contacts, visits, offers, and NIL never exceed caps or double-apply.
16. Advance through conference championship, Super Regionals, CWS, departures, signing day, walk-ons, and Season 2.
17. Verify roster eligibility, progression/regression, new recruits, standings isolation, schedules, stats, pitcher rest, coach XP, and postseason records.

#### B. `release:149-full-season`

The test must:

1. Create the league through the public API with `preset: "full_season"`.
2. Assert the immutable rules snapshot:
   - 149 teams.
   - Every canonical conference.
   - `seasonLength: "full_season"`.
   - progression enabled.
   - in-app simulated game mode.
3. Assert exactly 149 unique teams with correct conference membership.
4. Assert each team has a structurally valid initial roster.
5. Assert the initial recruit pool equals the canonical calculated target, currently 1,081 for 149 teams.
6. Assert every team has exactly 56 regular-season games, with no self-games, duplicate logical matchups, or illegal conference assignment.
7. Advance the full season through conference championships, Super Regionals, and CWS.
8. Assert each scheduled game has one finalization sentinel and one set of stats/rest/XP side effects.
9. Assert postseason games do not mutate regular-season standings.
10. Complete the offseason and begin Season 2.
11. Assert Season 2 has a separate standings row per team, a new schedule, sufficient recruits, progression/regression outcomes, and no duplicate player or recruit IDs.

### Acceptance criteria

- Both profiles pass from a clean database without manual intervention.
- Both profiles pass twice consecutively using different deterministic seeds.
- The 14-human profile passes with at least two application instances or with an explicit documented single-instance launch restriction.
- Test logs and post-run invariant reports are retained as release artifacts.

---

## P0-2 — Team selection, coach setup, and dynasty start can leave partial or unauthorized state

### Evidence

#### Team selection

`server/routes.ts:1251-1377` validates counts, but then writes teams, standings, recruits, and audit data without a transaction.

Additional problems:

- Unknown conferences and unknown team names are silently skipped at `1347` and `1350` after validation has passed.
- The payload is not rejected for duplicate team names.
- Custom teams are looked up in a global team pool, so a team can be assigned to the wrong conference.
- A failure after several team/standings inserts leaves a partially configured league.
- Recruit generation is based on `totalTeamsCreated`, which may be below `maxTeams` after silent skips.

#### Generic coach setup

`server/routes.ts:1420-1499` creates a coach using the submitted `teamId` before validating the team against the league. It does not atomically enforce:

- Team belongs to `req.params.id`.
- League is still in `dynasty_setup`.
- Team is unclaimed.
- User does not already coach another team in the league.
- User is authorized by the commissioner/invitation workflow.

It creates the coach, updates the team, generates league-wide rosters and lineups, creates a schedule, and writes an audit log through many independent operations. A failure can leave an orphan coach, claimed team, partial rosters, or partial schedule. It also permits a cross-league `teamId` to be paired with the requested league ID.

#### Dynasty start

`server/routes/league-mgmt.ts:2242-2422` atomically claims the `starting` phase, but every setup mutation after that is non-transactional. If one of those operations fails, the catch block resets the phase to `dynasty_setup` while already-applied player, coach, recruit, or schedule changes remain.

A losing concurrent start request receives `{ alreadyStarted: true }` while the winning request may still be executing and may later fail. Start also lacks a production-profile preflight that verifies exact team count, required human count, unique coach assignments, progression/game-mode settings, roster completeness, recruit-pool completeness, and schedule invariants.

### Required implementation

#### Team selection transaction

Before any write:

- Parse the complete payload with Zod.
- Reject duplicate conferences and duplicate team names.
- Reject every unknown team instead of skipping it.
- Resolve each team only from the selected conference’s canonical pool.
- Assert the resolved set has exactly `league.maxTeams` unique teams.
- Lock the league row and require `current_phase = 'dynasty_setup'` and zero existing teams.

In one database transaction, create teams and Season 1 standings. Generate the recruiting class either inside the same transaction or through an idempotent, durable next stage that cannot expose a partially configured league.

#### Coach claim service

Replace the generic setup mutation with one shared transactional claim service used by the commissioner and invite acceptance. It must:

- Lock the league, team, and relevant coach rows.
- Verify the team belongs to the league.
- Verify the league is in `dynasty_setup`.
- Verify the team is CPU/unclaimed and `coach_id IS NULL`.
- Verify the user has no coach/team in that league.
- Verify the user has the correct commissioner or single-use invite authority.
- Insert the coach and claim the team in one transaction.
- Return 409 for a lost race rather than 500.

Do not generate all league rosters, lineups, or schedules inside an individual coach-claim request. Those are dynasty bootstrap responsibilities.

#### Durable start operation

Implement start as a durable idempotent operation, for example `league_start_operations`, with explicit stages:

1. preflight
2. rosters
3. lineups
4. CPU coaches where allowed
5. recruiting class
6. schedule
7. postcondition validation
8. commit league to `preseason`

Each stage must be transactional and safely retryable, or the entire start must be one transaction if performance permits. Never reset the phase while leaving stage mutations in place.

Add a league setting such as `expectedHumanTeams` or `requireAllTeamsClaimed`. For the first official league, start must refuse unless exactly 14 distinct human users control exactly 14 distinct teams and there are no CPU teams.

Concurrent start requests must either wait for the same operation result or return 409/202 with a start-operation status URL. They must not report success before the winning operation finishes.

### Acceptance criteria

- Failure injection after every start stage leaves either a clean pre-start league or a resumable operation with correct checkpoints.
- Repeating team selection, claim, or start does not create duplicates.
- Cross-league team IDs return 404/403 and make zero writes.
- Two users racing for one team produce one winner and one 409.
- Two teams cannot receive the same human coach/user.
- A 14-human required league cannot start at 13 humans or with a CPU placeholder.
- A valid 149-team Full Season start reaches preseason with every postcondition satisfied.

---

## P0-3 — Reported-mode quick-sim can skip future game-report gates, and quick-sim bypasses the shared advance lock

### Evidence

The following routes in `server/routes/simulation.ts` do not include `requireAuth` middleware and call `simulateUntil` directly:

- `sim-to-offseason` at `7986`.
- `sim-to-signing-day` at `8027`.
- `sim-full-season` at `8062`.
- `sim-to-postseason` at `8087`.
- `sim-to-cws` at `8121`.

Commissioner checks reduce unauthorized use, but explicit authentication should be consistent on every mutation.

`sim-full-season` and `sim-to-cws` correctly reject reported leagues. `sim-to-offseason` and `sim-to-postseason` only run `getAdvancePreflight()` once, for the league’s starting week, and then `simulateUntil()` advances multiple future weeks. Future reported games are never preflighted.

This is especially dangerous because `advanceLeagueStep` suppresses normal regular-season simulation in reported mode. A fast loop can move phases while later scheduled games remain unreported/incomplete.

All quick-sim routes also bypass the durable `/advance` acquisition path and can race with normal advance or another quick-sim request.

### Required implementation

- Add `requireAuth` to every quick-sim mutation.
- In reported mode, reject every in-season multi-week quick-sim route with 409. This includes at minimum `sim-to-offseason` and `sim-to-postseason`.
- It is acceptable to retain `sim-to-signing-day` during purely offseason phases, but it must use the same league operation lock and durable operation model.
- Move advance locking into a shared service that both `/advance` and `simulateUntil` must call. Do not rely on route authors remembering to acquire it.
- A multi-step simulated-mode fast-forward must hold one owner-token lease for the whole operation and persist its progress.
- Re-check the league state after lock acquisition; do not operate on the pre-lock snapshot.

### Acceptance criteria

- Every reported-mode in-season quick-sim route returns 409 before any write.
- A reported league cannot change week or phase while any required report is unresolved.
- Simultaneous `/advance`, `sim-to-offseason`, and `sim-full-season` requests result in exactly one operation.
- The losing requests do not return success until the winning operation has committed.
- Audit logs contain exactly one fast-forward/advance record for one logical operation.

---

## P0-4 — Super Regional and CWS batch finalization is not atomic or idempotent

### Evidence

`server/game-finalizer.ts:673-823` still uses the legacy `batchFinalizeGames` implementation. It:

1. marks all games complete,
2. updates standings when enabled,
3. updates player stats,
4. updates pitcher rest,
5. accumulates coach XP and other side effects,

as independent operations without a transaction or `game_finalizations` sentinel per game.

If the process fails after step 1, the completed game can permanently lack stats/rest/XP. Retrying may also double-apply whichever later steps completed before the failure.

The unsafe batch function remains active in:

- Custom Super Regionals: `server/routes/simulation.ts:1468`.
- Custom CWS: `server/routes/simulation.ts:1505`.
- Full Season Super Regionals: `server/routes/simulation.ts:5478`.
- Full Season CWS: `server/routes/simulation.ts:5557`.

The regular-season path was correctly migrated to `finalizeGameAtomic`; the postseason paths were not.

### Required implementation

Preferred low-risk fix:

- Replace all four postseason batch calls with `finalizeGameAtomic` for each game.
- Process games sequentially or with a small bounded concurrency limit.
- Preserve `skipStandings: true` for postseason games.
- Preserve the correct player stats, pitcher rest, coach XP, rivalry, event, and recap behavior.
- Do not simulate an already finalized game.

If a batch implementation is retained, it must execute all durable game effects in a transaction and insert one unique finalization sentinel per game. A retry must skip already finalized games without reapplying any effect.

### Acceptance criteria

- Failure injection after score write, stat write, rest write, and XP write rolls back the entire game finalization.
- Retrying the same SR/CWS stage produces the same scores and exactly one set of side effects.
- Every completed postseason game has exactly one `game_finalizations` row.
- Postseason results never change regular-season wins/losses.
- Full Season completes SR and CWS under the 149-team release test and begins the offseason cleanly.

---

## P0-5 — Targets and scouting can exceed caps or partially apply under concurrent requests

### Evidence

Phone, email, visit, head-coach visit, and offer are now materially safer through `executeRecruitingAction`. Keep that work.

Remaining unsafe paths:

#### Targets

`server/routes/recruiting.ts:1456-1515` performs a read-count-check-toggle sequence without a transaction or per-team lock. Two concurrent target requests can both see the same count below the cap and both enable a target. A rapid double-toggle can also produce an unexpected final state.

#### Single scout

`server/routes/recruiting.ts:2776-2961`:

- Reads the stale coach counter.
- Checks the cap in application code.
- Mutates/reveals recruiting interest.
- Logs the action.
- Finally increments `scoutActionsUsed` using the original stale value.

Concurrent requests can exceed the cap, lose counter increments, double-reveal, or leave a reveal without the corresponding action/counter.

#### Bulk scout

`server/routes/recruiting.ts:2974-3146` now reserves a counter atomically, which is an improvement. However, the reservation and all subsequent interest/action writes are not one transaction. If processing fails after reservation, the coach loses scouting points with partial or zero scouting results. Concurrent bulk requests against the same recruit can also compute from stale interest state.

### Required implementation

Create a shared transactional scouting service for both single and bulk actions.

- Lock the coach/team budget row.
- Validate every recruit belongs to the league before mutation.
- Reserve the exact action count in the same transaction.
- Lock or upsert each `(recruit_id, team_id)` interest row.
- Apply reveal changes, counter changes, and action logs in the same transaction.
- Roll back the entire request on failure.
- Accept an `Idempotency-Key` for client retries and store it under a unique constraint.
- Return the committed counter and interest values from the transaction.

For target changes, use a per-team transactional/advisory lock, recount targeted interests inside the transaction, and apply an explicit requested state (`targeted: true/false`) instead of a blind toggle. Repeated identical requests must be idempotent.

### Acceptance criteria

- 20 simultaneous single-scout requests at a remaining cap of 1 produce one success and 19 deterministic 409/idempotent responses.
- Counter, action-log count, and reveal count agree after the race.
- A forced error after reservation leaves counter and interests unchanged.
- Concurrent bulk and single scouting cannot exceed the shared cap.
- Two different target requests racing for one remaining slot produce one enabled target.
- Repeating `targeted: true` or the same idempotency key causes no additional mutation.
- Cross-league recruit IDs consume no budget and reveal no data.

---

## P0-6 — Migration and startup behavior is not release-safe

### Evidence

The migration fixes in 0046 and 0047 are good, but the overall delivery path remains risky:

- Runtime migration discovery only scans `server/migrations`. The repository also has root migrations `0000` through `0029`; the zero-to-latest database construction path is not demonstrated.
- `server/migrations/add-coach-strategy-columns.sql` is unnumbered and sorts after 0047, while readiness only checks that 0047 exists.
- `runMigrations()` returns `{ version: null }` if the migration directory cannot be read instead of treating that as fatal.
- `server/index.ts:160-176` logs a migration failure and skips the job runner, but continues registering routes and listening on the public port at `1378`.
- Replit’s `scripts/post-merge.sh` runs `npm run db:push -- --force`, which can mutate production schema outside the numbered migration history.
- A large legacy startup-mutation IIFE still performs data repair/backfill separately from the numbered migration runner.
- Migration 0044 contains destructive duplicate-coach cleanup; its result must be reviewed on a production clone before launch.

### Required implementation

- Establish one authoritative schema bootstrap/migration chain from an empty database to 0047+.
- Number every migration; rename or absorb `add-coach-strategy-columns.sql`.
- Treat an unreadable/missing migration directory as fatal.
- Do not bind the public listener if migrations fail or the expected final migration is absent.
- Remove `db:push --force` from post-merge and production deployment workflows.
- Convert remaining startup DDL/data repairs into reviewed numbered migrations or explicit admin maintenance commands.
- Make the deployment run migrations as a separate release phase with an advisory lock so only one instance migrates.
- Run and retain migration tests against:
  1. an empty database,
  2. the current staging schema/data,
  3. a production clone with realistic duplicate/legacy rows.
- Prove rollback/restore from a pre-migration backup.

### Acceptance criteria

- Empty database reaches the final schema with all migrations recorded exactly once.
- A second migration run makes zero changes.
- Production clone reaches the same schema without silent errors or unintended row loss.
- An intentionally failing migration causes process exit before the port opens.
- `/health/ready` returns 503 until every migration and startup invariant is complete.
- No deployment or post-merge step uses `drizzle-kit push --force`.

---

## P0-7 — The advance lock is not fully owner-safe for autoscale deployment

### Evidence

`server/route-helpers.ts:272-305` correctly stores an owner token in `league_advance_locks` and checks that token when releasing. This is an improvement.

However, the heartbeat in `server/routes/simulation.ts:7878-7893` updates the lock with:

```sql
UPDATE league_advance_locks
SET locked_at = now()
WHERE league_id = $1
```

It does not require the current `locked_by` owner token. If an old process loses/has its lock cleared and a new instance acquires a replacement row, the old heartbeat can renew the new owner’s row. The lock owner is also held only in an in-memory map, and the fast-forward routes do not use the lock at all.

This conflicts with `.replit` using `deploymentTarget = "autoscale"`.

### Required implementation

- Return an explicit lock handle `{ leagueId, ownerToken }` from acquisition.
- Require that handle for heartbeat and release.
- Heartbeat with `WHERE league_id = $1 AND locked_by = $2` and verify one row was updated.
- Stop the operation immediately if lease renewal updates zero rows.
- Store `lease_expires_at` on the lock row and use the owner token for compare-and-swap takeover after expiry.
- Make every advance and fast-forward operation use the same lock service.
- Do not allow restore/save-state operations to release another operation’s lock.

### Acceptance criteria

- Two server processes racing to advance one league produce one owner.
- A stale owner cannot heartbeat or release a replacement owner’s lock.
- Killing the owner permits a safe takeover only after lease expiry.
- Takeover resumes or safely rejects based on durable checkpoints; it never double-applies a stage.
- If this cannot be completed before the first league, change deployment to one fixed instance and document that as a temporary launch constraint. The reported quick-sim and transaction fixes are still required.

---

# P1 fixes required for release polish and defensive correctness

These should be completed before public marketing or a wider launch. Any P1 that fails under the mode-faithful release tests should be promoted to P0.

## P1-1 — Make report confirmation and finalization one atomic state transition

`finalizeGameAtomic` correctly commits the game sentinel, score, standings, stats, rest, XP, and event. The report status is updated afterward in `server/routes/games.ts:882-883` and `1055-1060`.

Move report confirmation into the same transaction as game finalization, or add a deterministic reconciliation job/invariant. Preflight should require all of:

- report status is confirmed,
- game is complete,
- one finalization sentinel exists,
- game scores match the confirmed report,
- game/report belong to the current league, season, week, and phase.

Do not automatically confirm a report merely because `game.isComplete` is true.

## P1-2 — Validate corrected scores and every numeric box-score field

Dispute corrections at `server/routes/games.ts:972-985` only require two nonnegative JavaScript numbers. Commissioner finalization can use them without rerunning the shared validator.

- Apply the same finite integer 0–30, no-tie validation to corrected scores.
- Re-run `validateBoxScore()` on the final selected score before commissioner finalization.
- Validate batting and pitching numbers as finite, nonnegative integers with sensible bounds.
- Reject `NaN`, `Infinity`, negative stats, malformed innings, and impossible totals.

## P1-3 — Create one deterministic release command

Add scripts similar to:

```json
{
  "check": "tsc && tsx script/validate-rosters.ts && tsx script/validate-recruits.ts",
  "test:unit": "vitest run",
  "test:release:14": "playwright test tests/release/14-human-reported.spec.ts",
  "test:release:full": "playwright test tests/release/149-full-season.spec.ts",
  "verify:db": "tsx scripts/verify-db-invariants.ts",
  "release:gate": "npm run check && npm run test:unit && npm run build && npm run test:release:14 && npm run test:release:full && npm run verify:db"
}
```

Install Vitest or convert every legitimate unit test to one supported runner. Fix and include all new `verify-*` scripts. Make the release command fail on any skipped required suite.

## P1-4 — Make builds portable and deterministic

- Use `npm ci` for release builds.
- Declare every directly imported package and type package directly, including `cookie-signature` if the scripts retain it.
- Add `@types/pg` directly rather than relying on a transitive installation.
- Regenerate `package-lock.json` so public registry builds do not depend on `package-firewall.replit.local` URLs.
- Publish the build artifact produced by the tested commit; do not rebuild from a different dependency graph.

## P1-5 — Add operational protection for the first official dynasty

- Automated PostgreSQL backups with a tested point-in-time restore procedure.
- A pre-advance autosave retention policy.
- Alerts for failed migration, stuck start/advance job, 5xx rate, database pool exhaustion, duplicate constraint violation, and invariant failure.
- Commissioner-facing operation status and recovery UI.
- A read-only maintenance mode switch.
- A post-advance invariant checker that alerts but never silently “repairs” official standings.
- Structured logs containing league ID, operation ID, owner token hash, phase, season, and week.
- Rate limits appropriate for authentication, invites, reports, recruiting mutations, uploads, and expensive simulation endpoints.

---

# Required database invariant report

Create `scripts/verify-db-invariants.ts` and run it after every release lifecycle. It must exit nonzero on any violation and report at least:

## League/team/coach

- Team count equals configured count.
- Conference count and membership equal the immutable rules snapshot.
- No duplicate team names within a league.
- No coach controls more than one team in a league.
- No team has more than one coach.
- Every human team has one user-backed coach.
- The 14-human profile has exactly 14 human teams and zero CPU teams.
- Full Season has exactly 149 teams and the expected CPU/in-app configuration.

## Rosters and recruiting

- No player or recruit belongs to a different league than its team/interest/action rows.
- No duplicate player IDs or duplicate active recruit-interest pairs.
- Every roster satisfies positional structure and size rules.
- Recruiting pool meets the canonical target for the team count.
- Target, scouting, visit, call, offer, commit, and NIL counters do not exceed caps.
- Counter totals reconcile with committed action logs.
- No signed recruit is assigned to multiple teams.

## Games and standings

- No self-games.
- No duplicate schedule slot for the same league/season/phase/week/teams.
- Every completed game has one finalization sentinel.
- No incomplete game has a finalization sentinel.
- One game contributes at most one win and one loss.
- Team regular-season game counts reconcile with standings.
- Postseason games are excluded from regular-season standings.
- Player season stats reconcile with finalized box scores.
- Pitcher rest state reconciles with the most recent finalized appearances.

## Season rollover

- Exactly one standings row per league/team/season.
- No Season 1 row is reused for Season 2.
- Eligibility advances exactly once.
- Graduated/departed players do not remain active on a roster.
- A new recruiting class and schedule exist for the new season.

---

# Minimum concurrency and failure-injection matrix

| Scenario | Required result |
|---|---|
| 13 invitees accept at once | 13 distinct claims; no duplicate team/user/coach rows. |
| Two users claim one team | One success, one 409, no orphan coach. |
| Two start requests | One durable operation; other waits or reports in-progress. |
| 20 advance requests | One phase/week transition and one set of effects. |
| Advance plus quick-sim | One owner; no mixed operation. |
| Crash during dynasty start | Clean rollback or safe resumable checkpoint. |
| Crash after game score | No complete game missing stats/rest/XP. |
| Retry SR/CWS finalization | No duplicate finalization/stat/rest/XP effects. |
| 20 scout requests with one action left | Exactly one action committed. |
| Bulk scout fails after reservation | No points lost and no partial reveal. |
| Two targets with one slot left | Exactly one target enabled. |
| Duplicate phone/email/visit/offer | Exactly one budget/action/interest effect. |
| Stale advance heartbeat | Cannot renew or release a new owner’s lock. |
| Migration statement fails | Server exits before accepting traffic. |

---

# Final go-live gate

The release is **GO** only when every statement below is true:

- [ ] All seven P0 work packages are implemented.
- [ ] Clean `npm ci` succeeds.
- [ ] `npm run check` succeeds.
- [ ] Unit tests execute under a declared runner and pass.
- [ ] Production build succeeds from the exact release commit.
- [ ] Empty-database migrations succeed through the final numbered migration.
- [ ] Production-clone migrations succeed and row-loss review is signed off.
- [ ] Failed migration prevents the application from listening.
- [ ] The exact 14-human reported profile passes through Season 2.
- [ ] The exact 149-team Full Season profile passes through Season 2.
- [ ] Post-run database invariant checks report zero violations for both profiles.
- [ ] Concurrency tests pass against the intended deployment topology.
- [ ] Failure-injection tests prove start, advance, and finalization are retry-safe.
- [ ] Backups and a restore drill are complete.
- [ ] Commissioner recovery/maintenance procedure is documented.
- [ ] Release artifacts and logs are retained.

Until then, use only disposable staging data. Do not begin the official 14-person league, because the remaining problems can corrupt results that are difficult to repair fairly after coaches have started recruiting and reporting games.
