# Replit Remediation Plan: Full Season Flagship + 14-User Compatibility

## Purpose

Finish and verify the **Full Season** dynasty mode without breaking the existing custom dynasty experience, especially the 14-user multiplayer league.

Full Season must provide:

- All 149 teams in all 12 conferences.
- Exactly 56 official regular-season games per team across 14 weeks.
- Conference Championships.
- A 16-team national field.
- Eight best-of-three Super Regionals.
- An eight-team, double-elimination College World Series with a best-of-three championship final.
- Progression permanently enabled.
- App-simulated games only; no Power Pros reporting or companion workflow.
- A recruiting pool large enough for 149 teams and sustainable multi-season roster replacement.
- Reliable advancement through multiple seasons.

The custom mode must retain:

- The existing 14-team/3-conference 6/4/4 configuration.
- Up to 14 separate human coaches and invitations.
- Simulated or reported/Power Pros modes according to custom settings.
- Existing readiness gates and commissioner permissions.
- The pre-Full-Season custom recruiting formula.

## Current status

The repository has a strong partial implementation. The catalog and Season 1 schedule counts work, but the following issues block release:

1. Full Season bootstrap creates a CPU coach for every team, then team claim creates a second human coach. The leftover CPU coach prevents normal readiness/advancement.
2. Startup SQL recreates postseason tables with a schema that does not match `shared/schema.ts` or the new postseason services.
3. Four Full Season exhibitions are finalized into standings and coach records, producing as many as 60 decisions instead of the requested 56.
4. Season 2+ uses the legacy approximate scheduler instead of the exact 4,172-game scheduler.
5. The custom recruiting formula changed unintentionally.
6. TypeScript validation is red.
7. Full Season does not have an automated two-season/postseason acceptance suite.

## Non-negotiable implementation rules

- Do not drop gameplay tables at application startup.
- Do not rely on log warnings for hard invariants. Throw and roll back.
- Do not create separate Season 1 and Season 2 scheduling behavior.
- Do not allow two active coaches to own the same team.
- Do not count exhibitions in official records.
- Do not alter custom-league behavior unless this document explicitly requests it.
- Do not call the work complete without database-backed Full Season and 14-user test evidence.

---

# Phase 0 — Protect data and establish a baseline

## Tasks

1. Create a database backup before applying any new migration.
2. Create two test database fixtures:
   - A fresh/empty database.
   - A copy of a pre-Full-Season database containing at least one custom 14-team league.
3. Run and save baseline output from:
   - The existing 14-user ownership-resolution script.
   - The existing 14-team standard E2E.
   - TypeScript check.
   - Production build.
4. Record all existing duplicate coach/team rows before cleanup.

## Required evidence

- Backup identifier or timestamp.
- Counts of leagues, teams, coaches, games, standings, recruits, postseason records, and league jobs before migration.
- Baseline test logs attached to the final implementation summary.

---

# Phase 1 — Replace the destructive startup migration

## Affected files

- `server/index.ts`
- `shared/schema.ts`
- `migrations/0028_full_season.sql` — new
- Migration metadata/journal files used by this repository

## Required changes

### 1. Remove startup table mutation

Delete the `full-season-schema-v1`, `full-season-schema-v2`, and `full-season-schema-v3` promise-chain migrations from `server/index.ts`.

Application startup must not:

- Drop `postseason_series`.
- Drop `postseason_entries`.
- Drop `postseason_tournaments`.
- Drop `league_jobs`.
- Start routes or the job runner before required migrations are complete.

### 2. Add a real numbered PostgreSQL migration

Create `migrations/0028_full_season.sql`. It must be additive, transactional where PostgreSQL permits, and safe on both fresh and upgraded databases.

The migration must align the physical database with `shared/schema.ts`:

#### `leagues`

Ensure these columns exist:

- `dynasty_preset`
- `rules_snapshot`
- `rules_version`
- `catalog_version`
- `schedule_seed`
- `current_phase_step`

Backfill `dynasty_preset = 'custom'` only where it is null/empty.

#### `league_jobs`

Create the table and its league/status and created-time indexes if missing. Never drop it as part of an upgrade.

#### `postseason_entries`

The SQL table must support the fields used by `selectAndSeedNationalField`:

- Nullable `tournament_id`, unless the service is redesigned to always create a tournament.
- `league_id`
- `season`
- `team_id`
- `qualification_type`
- `national_seed`
- `selection_score`
- `selection_reason`
- `bracket_lane`
- Existing legacy columns needed by custom leagues

Add indexes for tournament, team, and league/season. Add a unique league/season/team constraint or partial unique index for Full Season entries.

#### `postseason_series`

The SQL table must support:

- Nullable `tournament_id`, unless all services use explicit tournaments.
- `league_id`
- `season`
- `stage`
- `best_of`
- `home_wins`
- `away_wins`
- `series_status`
- Existing bracket/game result columns used by custom mode

Add a unique league/season/stage/bracket-slot constraint or partial unique index.

### 3. Handle coach duplicates safely

Before adding uniqueness:

1. Treat `teams.coach_id` as the authoritative active coach.
2. Find coaches whose `team_id` points at a team but whose `id` is not that team’s `coach_id`.
3. If the extra row is an unused CPU coach, detach it by setting `team_id = NULL` or delete it if deletion is confirmed safe.
4. Do not silently delete a human coach. Fail the migration and report those rows for manual review.
5. Add a partial unique index ensuring only one non-null active coach can reference a given `(league_id, team_id)`.

## Acceptance tests

- Fresh migration succeeds.
- Upgrade migration succeeds on a pre-Full-Season database.
- Existing custom league counts and records are unchanged.
- Running the migration twice is safe.
- Starting the application performs no `DROP TABLE` operations.
- ORM reads/writes all Full Season postseason fields without SQL errors.

---

# Phase 2 — Create one transactional team-claim service

## Affected files

- `server/routes.ts`
- `server/routes/invites.ts`
- `server/routes/league-mgmt.ts`
- `server/storage.ts`
- `shared/schema.ts`
- Suggested new file: `server/services/claimTeam.ts`

## Required changes

Create one authoritative `claimTeamForUser` service and use it from both initial setup and invite acceptance.

The service must run in a database transaction:

1. Lock the requested team row.
2. Verify the team exists and belongs to the requested league.
3. Verify the user does not already control another team in the league.
4. Verify the team is still CPU-controlled/available.
5. Resolve the active coach from `team.coachId`, not `coaches.find(c => c.teamId === team.id)`.
6. Retire the CPU coach by either:
   - Detaching it with `team_id = NULL`, or
   - Deleting it if it has no historical references.
7. Create the human coach with the submitted appearance/archetype, or explicitly convert the CPU record after resetting CPU veteran stats. Do not accidentally give a new human the CPU coach’s veteran career record.
8. Update `teams.coach_id` and `teams.is_cpu = false` atomically.
9. Commit only if every step succeeds.

Update every team/coach lookup used by setup and readiness to respect `teams.coach_id` as the active relationship.

## Readiness correction

The readiness gate should evaluate one active coach for each human-controlled team:

- Build active coaches from each team’s `coachId`.
- Ignore detached coaches with `teamId = NULL`.
- Never let an obsolete CPU coach block a human team.
- Preserve the rule that all non-autopilot human teams must be ready.

## Acceptance tests

- Full Season bootstrap creates 149 CPU-controlled teams.
- Commissioner claims one team.
- That team has exactly one active coach relationship.
- Setup API returns the human coach, not the retired CPU coach.
- Human toggles ready.
- Commissioner advances from preseason without a false “waiting on” result.
- Two simultaneous users cannot claim the same team.
- A user cannot claim a team belonging to another league.
- Existing 14-user invite flow still produces 14 unique human teams.

---

# Phase 3 — Enforce exactly 56 official games

## Affected files

- `server/services/fullSeasonBootstrap.ts`
- `server/routes/simulation.ts`
- `server/recruit-engine.ts`
- `client/src/pages/league-create.tsx`
- Schedule/record/standings UI components as needed

## Required changes

### Preferred implementation

Remove Full Season exhibition creation entirely:

- Do not call `generateExhibitionGames` from Full Season bootstrap.
- Do not call it during Full Season season rollover.
- Keep custom-mode exhibitions unchanged.
- Change the UI label from “60 Games” to “56 Games.”
- Display “14 weeks · 56 official regular-season games.”

Ensure advancing through preseason with no exhibition games does not skip regular-season Week 1.

### Defensive protection

Even after removing Full Season exhibitions, make exhibition finalization explicitly non-official for custom modes:

- `skipStandings: true`
- `skipCoachXp: true`
- Decide and document whether exhibition player stats and pitcher rest should count; default should be no unless the game design intentionally says otherwise.

Create a central helper that defines whether a game affects official standings. Do not rely only on callers remembering flags.

## Acceptance tests

- Full Season database contains exactly 4,172 official regular-season games and zero Full Season exhibitions.
- Every team has exactly 56 scheduled official games.
- After simulation, every team’s `wins + losses` equals 56 before postseason.
- Conference Championship, Super Regional, and CWS games do not change regular-season standings.
- Custom mode keeps its existing exhibition behavior except that exhibitions never alter official standings.

---

# Phase 4 — Use the exact scheduler in every season

## Affected files

- `server/services/schedule/fullSeasonScheduler.ts`
- `server/services/fullSeasonBootstrap.ts`
- `server/routes/simulation.ts`
- `server/recruit-engine.ts`
- `server/routes/league-mgmt.ts`
- `server/storage.ts`
- Suggested new file: `server/services/schedule/createScheduleForSeason.ts`

## Required changes

Create one authoritative persistence service:

```ts
createScheduleForSeason(leagueId: string, season: number): Promise<ScheduleSummary>
```

Behavior:

1. Load the league, teams, and conferences.
2. If `dynastyPreset === "full_season"`:
   - Build with `buildFullSeasonSchedule`.
   - Validate before writing.
   - Delete/replace only that league/season’s regular-season rows in a transaction.
   - Insert all games in chunks.
   - Read back and validate persisted rows.
   - Throw and roll back on any violation.
3. Otherwise call the legacy custom scheduler unchanged.

Route all schedule entry points through this service:

- Full Season bootstrap.
- Season rollover after walk-ons.
- Commissioner schedule regeneration.
- Repair/retry jobs.
- Any test-data creation path.

Remove direct Full Season calls to the legacy `generateSchedule` path.

## Required hard invariants

- Exactly 12 conferences and 149 teams.
- Exactly 14 regular-season weeks.
- Exactly 4,172 official games.
- Exactly 56 official games per team.
- Exactly four games per team per week.
- No self-matchups.
- No duplicate game row for the same scheduled contest.
- OOC games use teams from different conferences.
- Every game references two teams in the same league.
- Violations throw; logging alone is not sufficient.

## Schedule quality improvements

The current exact scheduler passes counts but generated only 189 unique OOC pairs across 1,106 OOC games, with one pairing repeated 14 times.

Add deterministic rotation using:

- `league.scheduleSeed`
- Season number
- Week number

Track prior pairings and add quality rules:

- Avoid the same OOC opponent in consecutive weeks.
- Cap regular OOC repeats to a documented maximum; target no more than two unless mathematically required.
- Improve home/away balance; document an allowed range.
- Produce different but reproducible schedules in later seasons.

## Acceptance tests

Run the pure scheduler for at least 100 deterministic seeds and assert all hard invariants. Report min/max home games, unique opponents, and maximum repeated pairing.

Create Season 1 and Season 2 through the real database transition and assert the same 4,172/56/4 invariants for both.

---

# Phase 5 — Make postseason persistence and advancement retry-safe

## Affected files

- `server/services/postseason/selection.ts`
- `server/services/postseason/superRegionals.ts`
- `server/services/postseason/cws.ts`
- `server/routes/simulation.ts`
- `server/storage.ts`
- `shared/schema.ts`
- Postseason UI components

## Required competition structure

### Conference Championships

- Exactly one championship game or documented championship event per conference.
- Exactly 12 completed champions.
- Full Season normal flow must not silently use standings fallback while a championship is missing.
- A fallback may exist only as a documented repair path with an audit event.

### National selection

- Exactly 12 automatic bids, one per conference champion.
- Exactly four at-large bids.
- Exactly 16 unique teams.
- National seeds 1–16 are unique.
- Selection reasons and scores are persisted.

### Super Regionals

- Eight best-of-three series: 1v16 through 8v9.
- A series stops after two wins.
- Exactly eight unique winners advance.
- All postseason games skip regular-season standings.

### College World Series

- Eight teams.
- Two four-team double-elimination brackets.
- Correct if-necessary bracket final behavior.
- Best-of-three championship final.
- Exactly one champion and one runner-up.
- Champion is written once to history, coach records, news, and audit logs.

## Idempotency requirements

Every postseason step must tolerate a retry after a partial failure:

- Unique keys prevent duplicate entries, series, and bracket slots.
- Creating the same phase twice does not duplicate games.
- Re-running a completed phase does not award coach XP, championships, or appearances twice.
- Phase update and bracket creation occur transactionally where possible.
- `currentPhaseStep` reflects the persisted bracket state and can be reconstructed.

## Acceptance tests

- Seed a completed 149-team regular season and advance to conference championships.
- Simulate every postseason phase to one champion.
- Repeat each advance request once to prove idempotency.
- Confirm regular-season standings remain frozen at 56 decisions.
- Confirm exactly one championship/history record.
- Confirm the postseason UI can reload after every sub-step.

---

# Phase 6 — Correct recruiting and roster sustainability

## Affected files

- `shared/catalog/index.ts`
- `server/utils.ts`
- `server/services/recruitPoolPlanner.ts`
- `server/services/fullSeasonBootstrap.ts`
- `server/routes/simulation.ts`
- Recruiting tests

## Required changes

### Restore custom behavior

For every non-Full-Season league, restore:

```ts
Math.min(teamCount * 5 + 10, 75)
```

Expected examples:

| Teams | Custom recruits |
|---:|---:|
| 4 | 30 |
| 6 | 40 |
| 8 | 50 |
| 10 | 60 |
| 12 | 70 |
| 13 | 75 |
| 14 | 75 |

### Preserve Full Season scale

Full Season should retain the roster-demand formula and produce 1,081 recruits for 149 teams unless live departure demand requires more.

Requirements:

- Position quotas sum exactly to the pool size.
- The pool contains enough pitchers, catchers, infielders, and outfielders to replace projected departures.
- CPU recruiting distributes signings across every conference rather than concentrating the class in a few leagues.
- Walk-ons repair remaining shortages before the next season.
- No team starts a season above the roster cap.
- Every team reaches the documented minimum playable roster and required positional structure.

### Progression

- Full Season progression remains true in the server rules snapshot.
- Settings API rejects attempts to disable it.
- Progression executes at season transition for all 149 teams.
- Progression is tested for both human and CPU rosters.

## Acceptance tests

- Table-driven custom formula tests.
- Full Season formula test: 149 → 1,081.
- Position quota total test.
- Two-season test showing a fresh class and sustainable rosters.
- Conference signing distribution report.
- Post-walk-on roster health report for all 149 teams.

---

# Phase 7 — Preserve and certify 14-user multiplayer

## Affected files

- `server/routes.ts`
- `server/routes/invites.ts`
- `server/routes/league-mgmt.ts`
- `server/routes/simulation.ts`
- `server/route-helpers.ts`
- Existing multiplayer scripts/tests

## Compatibility rules

Do not change these custom-mode behaviors:

- A 14-team, three-conference league selects 6/4/4 teams.
- Fourteen separate users can own fourteen unique teams.
- No user can read or mutate another user’s team-scoped data.
- Only commissioner/co-commissioner roles can advance.
- All active human teams participate in readiness gates.
- Reported mode and Power Pros workflows remain available to custom leagues.
- Full Season-only locks never apply to a custom league.

## Full Season app-only enforcement

UI hiding is not sufficient. Server endpoints must reject manual/reporting workflows when:

- `dynastyPreset === "full_season"`, or
- `gameMode !== "reported"`.

This includes report creation, screenshot/OCR submission, confirmation, disputes, and commissioner report finalization. Return a clear 400/403 response without changing game state.

## Mandatory multiplayer tests

Run the existing 14-user scenario against the updated application and database:

1. Commissioner creates a custom 14-team league.
2. Thirteen invitees join concurrently/sequentially.
3. All users claim unique teams.
4. Every user resolves to their own coach/team.
5. Recruiting actions remain team-isolated.
6. Readiness waits for all 14 active coaches.
7. Commissioner can advance once all are ready.
8. Regular season and custom postseason complete.
9. Offseason completes into Season 2.
10. Rosters, standings, and ownership remain valid.

Also test a late invite replacing a CPU coach after a custom dynasty has started. It must not leave a duplicate active coach or block readiness.

---

# Phase 8 — Restore engineering release gates

## Affected files

- `tsconfig.json`
- `package.json`
- Dependency lockfile
- CI configuration
- Files reported by TypeScript

## TypeScript

1. Set an explicit modern compilation target such as `ES2022`.
2. Fix newly introduced errors first, including:
   - Full Season scheduler iteration errors.
   - Startup migration callback typing.
   - Season-transition errors in `server/routes/simulation.ts`.
3. Fix remaining existing errors or document and isolate them through an approved debt plan. The final release gate must still become green.
4. Add missing direct dependencies/types instead of relying on transitive packages.

## Package scripts

Add documented commands similar to:

```json
{
  "check": "tsc && tsx script/validate-rosters.ts && tsx scripts/validate-catalog.ts",
  "test:unit": "playwright test tests/unit",
  "test:full-season": "playwright test tests/e2e/full-season.test.ts",
  "test:full-season-soak": "tsx scripts/full-season-soak.ts",
  "test:14-user": "tsx script/14-user-test.ts",
  "verify:release": "npm run check && npm run test:unit && npm run test:full-season && npm run test:14-user && npm run build"
}
```

Adjust syntax to the Replit/Linux environment and ensure the test database is provisioned before database-backed scripts run.

## CI requirements

Every merge affecting leagues, schedules, recruiting, coaches, games, or postseason must run:

- Catalog validation.
- TypeScript check.
- Unit tests.
- Full Season E2E.
- 14-team custom E2E.
- Production build.

The longer Full Season soak may run nightly if it is too expensive for every commit.

---

# Required automated test matrix

## Unit tests

- Catalog: 12 conferences, 149 unique teams, exact conference sizes.
- Rules: Full Season immutable values.
- Custom recruit formula table.
- Full Season recruit formula.
- Exact scheduler invariants across 100 seeds.
- Scheduler opponent diversity and home/away limits.
- Phase transition legality.
- Selection: 12 auto + 4 at-large.
- Super Regional pairings and best-of-three stopping.
- CWS double-elimination scenarios, including both bracket-final outcomes.

## Database integration tests

- Fresh migration.
- Upgrade migration with existing custom data.
- Migration idempotency.
- Bootstrap resume after every checkpoint.
- Atomic team claim and concurrent claim conflict.
- Ready/advance after Full Season claim.
- Schedule persistence rollback on validation failure.
- Postseason retry/idempotency.
- Official-record exclusion for postseason/exhibition games.

## E2E tests

### Full Season Season 1

- Create preset.
- Complete bootstrap.
- Claim team.
- Start dynasty.
- Advance all 14 weeks.
- Complete Conference Championships, Super Regionals, CWS.
- Enter offseason.

### Full Season Season 2

- Complete departures, recruiting, signing day, and walk-ons.
- Enter Season 2.
- Revalidate schedule, progression, recruiting pool, rosters, and advancement.
- Complete at least a second regular season and postseason.

### Custom 14-user

- Run the existing 14-session script unchanged wherever possible.
- Run the existing 14-team standard E2E through Season 2.

## Soak test

Run at least five Full Season years; ten is preferred.

At the end of each season record:

- Team/conference counts.
- Official schedule counts.
- Roster min/max/average.
- Position-structure violations.
- Recruit pool size and signing distribution.
- Duplicate players/coaches/games/postseason rows.
- Phase sequence.
- Champion count.
- Bootstrap/advance/postseason duration.
- Database row growth.

The soak fails on any deadlock, duplicate active owner, missing champion, wrong game count, roster corruption, or unrecoverable phase.

---

# Database verification queries/results Replit must provide

For both Season 1 and Season 2, provide output proving:

1. `COUNT(conferences) = 12`.
2. `COUNT(teams) = 149`.
3. One active coach relationship per team.
4. Full Season recruit pool count is 1,081 or the documented higher live-demand result.
5. Official regular-season game count is 4,172.
6. Every team’s scheduled official count is 56.
7. Every team-week count is four for Weeks 1–14.
8. Every completed team record totals 56 before postseason.
9. Twelve unique conference champions exist.
10. Sixteen unique national entries exist.
11. Eight Super Regional winners exist.
12. Eight CWS teams exist.
13. Exactly one champion exists.
14. No duplicate league/season/team postseason entries.
15. No duplicate league/season/stage/bracket-slot series.

Do not provide only screenshots. Include machine-readable command/test output.

---

# Definition of done

The remediation is complete only when all boxes are true:

- [ ] No destructive Full Season startup migrations remain.
- [ ] Fresh and upgrade migrations pass without data loss.
- [ ] Database schema exactly supports the Full Season services.
- [ ] Claiming a Full Season team leaves one active coach.
- [ ] Ready/advance works normally after claim.
- [ ] Full Season is labeled and recorded as exactly 56 official games.
- [ ] Full Season has no official exhibitions.
- [ ] Season 1 and Season 2 each have exactly 4,172 games and 56/team.
- [ ] Schedule quality limits pass.
- [ ] Progression remains enabled and executes.
- [ ] Full Season recruiting sustains all 149 teams.
- [ ] Conference Championships produce 12 champions.
- [ ] Selection produces 12 automatic bids and four at-large bids.
- [ ] Eight Super Regionals and the complete CWS produce one champion.
- [ ] Postseason retries do not duplicate games, stats, XP, or championships.
- [ ] Full Season reporting/Power Pros endpoints are rejected server-side.
- [ ] Custom 14-team distribution remains 6/4/4.
- [ ] Custom 14-team recruiting returns 75 recruits.
- [ ] Existing 14-user multiplayer scenario passes.
- [ ] Existing 14-team E2E passes through Season 2.
- [ ] Five-season Full Season soak passes.
- [ ] TypeScript check passes.
- [ ] Production build passes.
- [ ] All required test commands are documented and wired into `package.json`.

---

# Required Replit handoff format

When finished, Replit must return:

1. A concise summary of every change.
2. A list of changed files.
3. The complete migration file and explanation of its upgrade behavior.
4. Proof that no existing custom league data was dropped.
5. Output from TypeScript check and production build.
6. Output from Full Season Season 1 and Season 2 E2E.
7. Output from the unchanged 14-user compatibility scenario.
8. Output from the Full Season soak test.
9. The database invariant report for both seasons.
10. Any remaining known limitation, explicitly stated rather than hidden behind warnings.

## Final instruction to Replit

Implement the phases in order. Do not skip the migration and coach-ownership blockers to work on UI polish. Do not mark the task complete after static code changes. Completion requires the database-backed evidence and compatibility results listed above.
