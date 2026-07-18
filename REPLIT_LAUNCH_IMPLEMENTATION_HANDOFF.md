# Replit Launch Implementation Handoff

Date: July 17, 2026  
Scope: launch-critical fixes for both the 14-human reported-score multiplayer league and the 149-team Full Season game mode

## Outcome

The launch-risk fixes in this repository are implemented. Replit's remaining job is deployment verification against a disposable PostgreSQL database, followed by the production migration and smoke check. Do not replace these changes with a new implementation.

The implementation protects the operations most likely to corrupt a live multiplayer dynasty:

- league creation, team selection, coach claiming, invite acceptance, and dynasty start;
- commissioner phase advancement and long-running simulation leases;
- concurrent recruiting targets, scouting, visits, and signing;
- schedule replacement and initial data generation;
- saved recruiting-class storyline metadata;
- pitcher-rest enforcement;
- database integrity and launch-profile certification.

## Required deployment order

1. Take a PostgreSQL backup or snapshot.
2. Pull this repository revision.
3. Run a clean dependency install. Do not reuse the old `node_modules` directory.
4. Run the complete release gate against a disposable copy of the production schema.
5. Start the app once so the numbered migration runner applies `0049_launch_integrity.sql`.
6. Confirm `/health/ready` is healthy and migration `0049_launch_integrity` is recorded.
7. Run the production invariant audit.
8. Create and complete a throwaway 14-coach launch rehearsal.
9. Only then open the real league to coaches.

Commands:

```bash
npm ci
npm run release:gate
```

The database-backed portions require `DATABASE_URL` and the normal test authentication secrets. Use a disposable database for `release:gate`, because the integration and end-to-end suites create and delete test records.

After production startup and migration:

```bash
npm run verify:invariants
```

Do not run `drizzle-kit push --force` or any other forced schema synchronization in production. The numbered migrations are the source of truth.

## Implemented fixes

### 1. Durable dynasty start

`server/services/dynastyStartService.ts` now owns dynasty initialization as a durable, resumable job. It:

- uses a database job record and lease token;
- allows only one active start job per league;
- checkpoints roster application, roster generation, coach generation, recruiting, schedule generation, and final validation;
- resumes incomplete work instead of resetting the league to a misleading setup state;
- finishes the league phase only after all validation passes;
- requires every selected team to have a structurally valid 25-player roster and lineup;
- validates coaches, standings, recruits, storylines, and schedules before reporting success;
- enforces the Full Season profile of 149 teams, 4,172 regular-season games, progression on, and a full recruiting pool;
- preserves a commissioner's saved recruiting class, deterministic seed, and authored storyline plan.

The `/api/leagues/:id/start` route is commissioner-only and delegates to this service. A running start returns `202`; an incompatible retry returns `409`; a failed durable job can be retried safely.

### 2. Team selection and coach ownership

Team selection and setup mutations now use database transactions and league/team locks. The server rechecks league phase inside the transaction and atomically writes teams, standings, coach ownership, and audit history.

The implementation rejects:

- duplicate schools, including case-only duplicates;
- teams outside the selected conference catalog;
- team claims after setup has ended;
- multiple coaches for one team;
- one human user controlling multiple teams in one league;
- invite acceptance after the dynasty has left setup.

Roster, recruiting, and schedule generation no longer occur inside a team-selection request. They are centralized in the durable start job.

### 3. Safe phase advancement

Commissioner advancement and quick simulation now use an owner-token lease with expiration and renewal. Each long-running stage verifies ownership before and after mutations. An expired worker cannot release or continue using a lock that has been acquired by another process.

Reported-score leagues reject quick simulation. Postseason games are not finalized when simulation fails to produce a valid box score.

### 4. Recruiting concurrency and limits

Targets and scouting use team-scoped transactional locks. The cap check, reveal/counter update, and recruiting action log are committed together.

Visits enforce both:

- the combined weekly visit limit; and
- the separate visit-type limit.

Signing remains atomic, so simultaneous coaches cannot sign the same recruit or overspend a team's NIL balance.

The invariant audit applies dynamic team-count-aware recruiting expectations, with exact certification values for the 14-team launch profile and the 149-team Full Season profile.

### 5. Schedule and generated data integrity

Regular-season schedule replacement is atomic: old regular games are replaced only as part of the same transaction that writes the new schedule. Batch inserts are also atomic.

The 14-team launch profile is certified as:

- 14 human coaches;
- 0 CPU coaches;
- reported-score mode;
- progression enabled;
- 14 standings rows;
- 350 roster players;
- 102 recruits;
- 140 regular-season games;
- 20 regular-season games per team;
- exactly 10 storyline recruits with generated events.

Full Season certification requires:

- 149 teams;
- progression enabled;
- 1,081 recruits;
- 4,172 regular-season games;
- 56 regular-season games per team;
- exactly 10 storyline recruits with generated events;
- canonical conference membership.

### 6. Recruiting-class story plans

Saved-class envelope building, migration, importing, patching, and sharing now preserve:

- `storyPlan`;
- deterministic generation metadata and seed.

The backend validates custom cast entries, template IDs, archetype keys, and duplicate cast members before applying the class. Dynasty start initializes storylines synchronously and refuses to complete unless the resulting class has exactly 10 storyline recruits and at least one storyline event.

The prior league vintage update used the wrong raw SQL column name. It now uses the typed Drizzle schema and updates `current_class_vintage` correctly.

### 7. Pitcher rest

The pitcher-rest regression script now truly supports `--unit-only`; database modules are loaded only for its integration suite. The pure suite checks Friday-to-Saturday, Friday-to-Sunday, Saturday-to-Sunday, same-day, limited-availability, and cross-week behavior.

Commands:

```bash
npm run test:rest:unit
npm run test:rest:integration
```

The integration command requires a disposable database and verifies the complete box-score-to-rest-to-next-starter chain.

### 8. Migrations and startup

`server/migrations/0049_launch_integrity.sql`:

- adds and backfills advance-lock lease data;
- enforces case-insensitive unique team names within a league;
- retires duplicate userless placeholder coaches before adding constraints;
- enforces one coach per league/team;
- enforces one human coach per league/user;
- enforces one active dynasty-start job per league.

The expected startup migration is now `0049_launch_integrity`. Ad hoc startup DDL for the advance table was removed; the numbered migration is authoritative.

If migration `0049` fails, stop the deployment and inspect the reported duplicate data. Do not remove the constraints to make the migration pass.

## Release gate

`npm run release:gate` performs, in order:

1. strict TypeScript checking;
2. all roster/recruit data validators;
3. pure unit tests;
4. pitcher-rest unit regression;
5. production build;
6. database-backed integration tests;
7. pitcher-rest database integration;
8. end-to-end tests;
9. database invariant checks.

Test suites are deliberately separated:

- `playwright.unit.config.ts` contains pure, database-free unit tests;
- `playwright.integration.config.ts` contains API/database integration tests;
- `playwright.config.ts` contains end-to-end and smoke coverage.

Do not merge the categories back together or silently skip failed database tests.

## Required 14-coach rehearsal

Run this only against a disposable database:

```bash
npm run test:launch:14
```

The rehearsal must prove all of the following before launch:

- exactly 14 distinct human accounts accept invitations;
- each account owns exactly one distinct team;
- the commissioner starts the dynasty successfully;
- a repeated start request is safe;
- the generated roster, recruit, schedule, standing, and storyline counts match the launch profile;
- quick simulation receives `409` in reported-score mode;
- all 14 coaches can set readiness;
- the commissioner can advance once after all required reports/readiness conditions are met;
- reloading the app preserves the new phase and all balances.

After the rehearsal, run:

```bash
npm run verify:invariants
```

Expected result: zero errors.

## Required Full Season rehearsal

On a separate disposable database:

1. Create a Full Season dynasty.
2. Confirm 149 teams and all canonical conferences.
3. Start the dynasty and wait for the durable job to complete.
4. Confirm 25 players on every roster and valid lineups.
5. Confirm 1,081 recruits and exactly 10 storyline recruits with events.
6. Confirm every team has 56 regular-season games and the league has 4,172 total.
7. Advance through one full weekend and verify pitcher rest and statistics.
8. Advance a cloned league through conference championships, super regionals, and the College World Series.
9. Run `npm run verify:invariants` and require zero errors.

## Evidence from the local implementation environment

Passed:

- 17 data validators;
- 149-team catalog validation;
- 3,725-player roster structure validation;
- 68 pure Playwright unit tests;
- 28 pitcher-rest pure regression assertions;
- strict source TypeScript audit with local declarations substituting only for packages unavailable in the cached dependency junction;
- client production bundle.

Not executable in the local sandbox:

- clean `npm ci`, because outbound package downloads are unavailable;
- database integration, end-to-end launch rehearsal, migration execution, and production invariant checks, because no `DATABASE_URL` or test session secret was supplied;
- final server esbuild bundle from the cached `node_modules` junction, because the Windows sandbox blocks esbuild from traversing the junction's parent path.

These are environment limitations, not permission to skip the corresponding Replit release-gate steps. Replit must use a clean install and a disposable PostgreSQL database to produce the final launch evidence.

## Final go-live rule

Go live only when all of these are true:

- clean `npm ci` succeeds;
- `npm run release:gate` exits 0 against the disposable database;
- production startup applies migration `0049_launch_integrity`;
- `/health/ready` is healthy;
- `npm run verify:invariants` exits 0 against production;
- the 14-coach rehearsal exits 0;
- a database backup and rollback point exist.

If any item fails, the launch is a no-go until the failure is understood and corrected.
