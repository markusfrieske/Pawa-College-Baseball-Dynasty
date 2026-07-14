# Pawa College Baseball Dynasty
## Full App Sweep, Two-Mode Improvement Plan, and In-Dynasty Commissioner Editor Specification

**Prepared for:** Replit implementation  
**Repository audited:** `Pawa-College-Baseball-Dynasty-main.zip`, supplied July 13, 2026  
**Primary experiences:** 149-team Full Season and commissioner-run 14-team multiplayer custom dynasty  
**Required outcome:** a stable, understandable, fair, auditable dynasty game that preserves both modes while making Full Season the flagship app-only experience

---

## 1. Executive decision

The repository contains a substantial amount of the requested Full Season foundation, but it is **not release-ready** and should not be treated as fully implemented yet.

The positive foundation is real:

- The Full Season preset represents 149 teams in 12 conferences.
- The pure Full Season scheduler produces exactly 4,172 regular-season games, 56 per team, over 14 weeks.
- Progression is locked on for Full Season.
- Full Season bootstrap is checkpointed and attempts to repair partial teams, rosters, recruiting classes, and schedules.
- A 16-team national postseason exists: 12 conference automatic bids plus four at-large bids, eight best-of-three Super Regionals, and an eight-team College World Series structure.
- Recruiting Balance V2 contains a sensible canonical profile for targets, points, scouting, visits, NIL, and recruit-pool size.
- Multiplayer has invites, team takeover, readiness, deadlines, autopilot, save states, audit logs, and commissioner tools.
- An initial commissioner player editor already exists.

However, several of those systems are only partially connected. The most serious current issues are:

1. TypeScript reports **66 compile errors**.
2. League setup can be called by any authenticated user without proving league membership or team availability.
3. Single-player editing spreads an unrestricted request body into the player row.
4. Invite acceptance, recruiting actions, league advancement, schedule regeneration, and job claims are not fully transactional or multi-instance safe.
5. Recruiting Balance V2 is displayed in parts of the UI, but human and CPU actions still use duplicated legacy counters and costs in important paths.
6. The Full Season schedule passes quantity checks but fails basic fairness checks.
7. A 14-team class should contain 102 recruits, but the recruiting-class wizard still caps manual classes at 80 and E2E expectations still encode the old 80-recruit ceiling.
8. Full Season is advertised as 60 games even though the app intentionally generates 56 and suppresses spring exhibitions.
9. The interface contains approximately **1,675 usages of 6–9 px text**, which is too small for a desktop management game.
10. Product copy still presents the game as a Power Pros companion in many places, conflicting with the requested app-only Full Season experience and creating avoidable platform/IP positioning risk.

The correct path is not to add more surface features first. Replit should complete the reliability, security, scheduling, and economy work below, then build the commissioner editor on top of those safe foundations.

---

## 2. Audit scope and limitations

### Reviewed

- Repository structure: 367 TypeScript/TSX files and about 161,000 lines
- 99 client page/module files
- 19 server route modules
- 31 SQL migration files
- Six Playwright E2E test files
- Full Season bootstrap, schedule generation, postseason, phase advancement, season rollover, progression, recruiting, NIL, multiplayer setup/invites, commissioner controls, roster editing, save states, and product UI copy
- Current Full Season schedule output against the 149-team catalog
- Current TypeScript status
- Existing tests and test-runner configuration
- Existing screenshot and component-level responsive/design patterns

### Verification completed

- Roster/recruit source validators reported no source-data validation errors during the build prechecks.
- The pure Full Season schedule generated:
  - 149 teams
  - 12 conferences
  - 4,172 regular-season games
  - exactly 56 games per team
  - exactly four games per team per week
  - no errors from the current quantity-oriented validator
- TypeScript was executed directly and reported 66 errors.

### Not fully verified in this environment

- A live browser walkthrough could not be performed because the available in-app browser control session failed to initialize.
- The full DB-backed E2E suite could not run without a configured test PostgreSQL database and session secret.
- Playwright test discovery imports the application database too early, so even listing the suite currently requires DB configuration.
- The client bundle result was inconclusive in this local extraction because the reused dependency directory was connected through a Windows junction and `esbuild` was denied access. TypeScript failure is independent of that environment limitation and remains a definite release blocker.

Replit must therefore perform the visual and live-database acceptance passes defined later in this document. Do not mark the plan complete based only on unit/source checks.

---

## 3. Non-negotiable product contracts

### 3.1 Full Season contract

Full Season is an app-only dynasty mode with:

- Exactly 149 catalog teams and all 12 catalog conferences
- Exactly 25 active players per initial roster
- Exactly 56 official regular-season games per team across 14 weeks
- Exactly 4,172 total regular-season games
- Progression always enabled and not editable
- App simulation for all games; no screenshot/OCR/Power Pros dependency in its setup, navigation, game flow, or copy
- One conference championship per conference
- A transparent 16-team national field:
  - 12 conference champions
  - four at-large teams
  - eight best-of-three Super Regionals
  - eight-team College World Series
- 1,081 recruits in the initial annual pool, subject to later departure-aware positional tuning without reducing the national supply floor
- CPU management for unclaimed schools and seamless human takeover by invite
- Durable season-to-season scheduling, progression, roster turnover, recruiting, NIL, record books, and history

Full Season should be the first and most prominent new-dynasty choice.

### 3.2 14-team multiplayer custom contract

The optimized multiplayer preset is:

- Exactly 14 teams
- Three conferences, default split 6/4/4
- Up to 14 human coaches, with CPU ownership until a coach joins
- Standard season default: 20 official regular-season games per team and three non-counting spring exhibitions if exhibitions remain enabled
- Every pair of human teams meets at least once in the 20-game regular season
- Conference opponents receive additional games according to the 6/4/4 structure
- Home/away balance is within one game in a season and reverses/rotates across seasons
- Exactly 102 annual recruits under Balance V2
- Readiness, deadlines, reminders, commissioner force-advance, and autopilot are reliable and auditable
- No route can expose or mutate another league through a guessed ID
- Existing companion/reporting workflows may remain optional in Custom mode, but they must never leak into Full Season

### 3.3 Shared invariants

- Stable league, conference, team, coach, player, recruit, game, and season IDs
- No duplicate coach assignments, team claims, recruiting actions, phase transitions, games, postseason entries, or awards
- No negative budgets or spending beyond a cap
- No active roster above 25 after roster-finalization/cut day
- Historical statistics are append-only; editing current identity or ratings never rewrites recorded game results
- Every competitive commissioner edit is visible in an immutable league audit trail
- Rules are frozen in a versioned league snapshot so a code deployment cannot silently rebalance an active season

---

## 4. Release blockers and required fixes

| ID | Priority | Finding | Required result |
|---|---:|---|---|
| CORE-01 | P0 | `tsc --noEmit` reports 66 errors, concentrated in recruiting, simulation, startup, save states, and storage. | TypeScript, roster validation, server build, client build, migrations, unit, integration, and E2E smoke tests are all green. |
| SEC-01 | P0 | `POST /api/leagues/:id/setup` creates a coach for any authenticated user and arbitrary `teamId` without proving membership, league ownership, availability, or one-team-per-user. | Replace with a transactionally safe claim/join service and central authorization middleware. |
| SEC-02 | P0 | Several authenticated GET routes return league/player/setup data without verifying league membership. | All league-scoped reads require membership or a deliberate public-preview policy. |
| SEC-03 | P0 | Single-player PATCH merges unrestricted `req.body` into the player record. | Strict Zod allowlist; reject unknown fields; never permit client changes to IDs, ownership, lifecycle flags, derived fields, or historical links. |
| MP-01 | P0 | Invite acceptance checks availability before multiple non-transactional writes. Concurrent accepts can create duplicate/orphan coaches. | Row lock team/invite, enforce DB unique constraints, update all records in one transaction. |
| REL-01 | P0 | Advance protection is an in-memory `Set`; it is not durable or multi-instance safe. | Database advisory lock/idempotency record per league transition. |
| REL-02 | P0 | Job runner claims jobs with process-local state. Multiple instances can execute the same job; startup resets all running jobs without a lease. | Atomic `FOR UPDATE SKIP LOCKED` claim, worker lease/heartbeat, attempts, retry policy, and idempotent checkpoints. |
| MIG-01 | P0 | The advertised sequential startup migration ends before `full-season-schema-v4`, which launches separately and can race `_startup_migrations`. | One awaited migration runner; migrate before routes/jobs/listen; transaction or mark-after-success; no fire-and-forget DDL. |
| SCH-01 | P0 | Full Season quantity is correct, but home games range from 18–36; OOC games range 14–20; unique OOC opponents range 5–17; an OOC pair can meet six times. | Deterministic seeded schedule with explicit fairness constraints and validator failures for unfair output. |
| SCH-02 | P0 | Custom regeneration can add another schedule without atomically replacing the old schedule. | Preview then transactionally replace unlocked games; schedule version and idempotency key. |
| SCH-03 | P0 | Season-two Full Season creation calls the validator with the wrong signature, currently caught by TypeScript. | Fix and cover season 1, season 2, and ten-season schedule creation. |
| PHASE-01 | P0 | Season rollover filters on nonexistent `team.userId`, which can cause automatic lineup assignment for human teams. | Determine control from `team.isCpu`/coach ownership; never overwrite a submitted human lineup. |
| REC-01 | P0 | V2 profile and ledger exist, but action routes still spend legacy coach counters, use geography-based 1/2/3/5 visit costs, and ignore failed spender results after interest/log writes. | One transactional recruiting action service is the only mutation path for humans and CPU. |
| REC-02 | P0 | Economy response hard-codes commit cap 25 and sends placeholder zero NIL spending/reserves. | Use dynamic class capacity and authoritative NIL ledger values. |
| REC-03 | P0 | V2 turn remainder distribution exists in shared code, but ledger creation uses simple floor division and loses points. | The exact sum of turn caps equals the frozen seasonal budget. |
| REC-04 | P0 | 14-team V2 pool is 102, but wizard/backend constrain manual classes to 20–80 and tests still accept 80. | Dynamic team-aware range and exact 102 acceptance for the standard 14-team preset. |
| REC-05 | P0 | Target caps, visit subcaps, CPU scouting, and CPU point spending do not consistently use the canonical V2 service. | Human/CPU parity tests prove identical caps, costs, and atomic spend behavior. |
| POST-01 | P0 | Conference championship generation/phase side effects depend on non-durable advance locking; selection silently falls back to a standings leader when a championship is absent. | Idempotent unique bracket generation; phase blocks until all required championships are resolved. |
| TEST-01 | P0 | Tests mix Playwright and Vitest assumptions; Vitest is not installed; scripts are Linux/Replit-specific. | Separate portable unit, integration, E2E, and soak commands with a disposable test DB. |
| UX-01 | P1 | Full Season is labeled “60 Games” despite generating 56 official games and no spring exhibitions. | Everywhere says “56-game regular season, 14 weeks.” |
| UX-02 | P1 | Roughly 1,675 6–9 px text utilities appear in the client. | Minimum readable token scale; desktop UI scaling and accessibility pass. |
| UX-03 | P1 | Two overlapping roster editors create inconsistent capabilities and validation. | One League Editor with Schools, Players, and Change Log. |
| BRAND-01 | P1 | Landing and game copy repeatedly position the product around Power Pros; program/team counts are stale in several places. | Separate app-only Full Season from optional Custom imports; update all facts; complete trademark/data review before Steam. |

No feature-complete or release-ready claim should be made until every P0 item has an automated acceptance test.

---

## 5. Workstream A — Build, test, and migration foundation

### A1. Make the repository deterministic and portable

1. Add missing development/runtime dependencies intentionally:
   - `@types/pg`
   - `nanoid` if the import remains; otherwise remove the import
   - `vitest` only if unit tests will use it
   - `cross-env` for Windows/Replit-compatible environment variables
2. Repair all 66 TypeScript errors. Do not suppress them with `any`, `@ts-ignore`, or a weaker `tsconfig`.
3. Correct Express 5 route parameter handling centrally. Create a helper such as `param(req, "id")` that returns one validated string and use it in every route.
4. Remove broken/nonexistent model properties such as `team.userId`, `scoutedMin`, `scoutedMax`, `signingOvr` on the wrong type, and invalid event enum values.
5. Make these scripts portable:

```json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "cross-env NODE_ENV=production node dist/index.cjs",
    "typecheck": "tsc --noEmit",
    "validate:data": "tsx script/validate-rosters.ts",
    "test:unit": "vitest run",
    "test:integration": "cross-env NODE_ENV=test vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:soak": "tsx tests/soak/run.ts",
    "verify": "npm run typecheck && npm run validate:data && npm run test:unit && npm run test:integration && npm run build"
  }
}
```

Exact runner choices may differ, but the separation and behavior must remain.

### A2. Isolate test infrastructure

- Unit tests must never import `server/db.ts`.
- Integration/E2E tests must receive a disposable PostgreSQL URL.
- Apply every migration to a blank DB before the suite.
- Also test upgrading a fixture DB from the last known production schema.
- Reset data between tests with schema/database isolation, not order-dependent cleanup.
- Seed RNG explicitly.
- Playwright `--list` must work without booting a production database.
- CI must archive traces/screenshots only on failure.

### A3. Replace startup DDL with one migration path

Current `server/index.ts` mixes migration SQL, multiple runners, and fire-and-forget promises. Replit must:

1. Move schema changes into numbered Drizzle/SQL migrations.
2. Acquire a database migration advisory lock.
3. Apply migrations sequentially and await completion.
4. Mark a migration complete only after its transaction commits.
5. Refuse to start the job worker or HTTP listener if a required migration fails.
6. Keep all migrations additive unless a separately tested data migration and rollback plan exists.
7. Remove obsolete startup migration blocks after production upgrades are proven.

### A4. Balance-version migration safety

Migration `0029_recruiting_balance_v2.sql` gives every existing league a V2 default. That can rebalance an active dynasty midseason. Change rollout behavior:

- Existing leagues with no explicit version become V1.
- Newly created leagues receive V2.
- Existing leagues may upgrade only at preseason/offseason via commissioner confirmation.
- Store the complete selected profile in `league.rulesSnapshot`, not only a version number.
- An active season reads its frozen snapshot; a deployment cannot change caps halfway through a week.

### A acceptance

- Blank and legacy databases migrate cleanly 25 consecutive times.
- Starting two server processes simultaneously runs each migration once.
- All verify scripts pass on Replit and Windows.
- The server never starts against a partially migrated schema.

---

## 6. Workstream B — Authorization, tenancy, and multiplayer integrity

### B1. Central league authorization

Create reusable middleware/services:

- `requireLeagueMember(leagueId)`
- `requirePrimaryCommissioner(leagueId)`
- `requireCommissionerPermission(leagueId, permission)`
- `requireTeamOwner(leagueId, teamId)`
- `requireLeagueEntity(leagueId, entityType, entityId)`

Apply them to every league-scoped route. Authentication alone is not authorization.

Default permission matrix:

| Capability | Coach | Co-commissioner | Primary commissioner |
|---|---:|---:|---:|
| Read league | Yes | Yes | Yes |
| Edit own lineup/strategy | Yes | Yes for own team | Yes for own team |
| Advance week | No | Configurable | Yes |
| Manage invites | No | Configurable | Yes |
| Edit school identity | No | `edit_league_data` only | Yes |
| Edit player identity | No | `edit_league_data` only | Yes |
| Edit ratings/competitive school data | No | Off by default | Explicit setting/primary only |
| Restore save | No | No by default | Yes |
| Change permissions | No | No | Yes |

### B2. Replace unsafe setup claim

`POST /api/leagues/:id/setup` must no longer be a general team-claim endpoint. Use invite acceptance for multiplayer and an explicitly scoped initial commissioner setup for league creation.

Within one transaction:

1. Lock league, invite, selected team, and any existing user coach row.
2. Verify invite is pending, unexpired, and belongs to the URL league.
3. Verify team belongs to the league and is CPU/available.
4. Verify user has no active team in the league.
5. Retire/detach the CPU coach.
6. Create the human coach.
7. Update the team.
8. Consume the invite.
9. Write structured audit/event records.

Add DB constraints:

- Unique active coach per `(league_id, user_id)` where user is not null
- Unique active coach per `(league_id, team_id)` where team is not null
- Unique pending/accepted ownership invariant for team claims
- Invite code unique

Convert unique-constraint collisions to a friendly 409 response.

### B3. Durable readiness and advance

Create a single advance command with:

- An idempotency key from the client
- A PostgreSQL advisory lock or locked `league_advances` row
- Expected `season`, `phase`, `week`, and league version
- One authoritative precondition check
- One committed phase transition
- Idempotent side effects keyed by transition ID
- A durable status the UI can poll after a lost connection

Do not tie lock cleanup to `res.finish`. A dropped response must not determine business-state safety.

### B4. Job queue safety

Add to `league_jobs`:

- `attempt_count`
- `max_attempts`
- `locked_by`
- `lease_expires_at`
- `heartbeat_at`
- `next_attempt_at`
- `finished_at`
- unique business key such as `(league_id, job_type, season)` where appropriate

Claim with `SELECT ... FOR UPDATE SKIP LOCKED` and update to running in the same transaction. Only reclaim expired leases. Never reset every running job merely because another instance started.

### B acceptance

- A nonmember with a valid session receives 403 for every private league endpoint.
- Two users accepting the same invite/team concurrently produce exactly one human coach and one 409.
- One user cannot claim two teams in one league.
- Two advance requests and two server instances produce one transition.
- Leaving/removing a coach restores a valid CPU owner without losing the roster, history, or team edits.

---

## 7. Workstream C — Phase engine and season lifecycle

### C1. One phase state machine

Make `shared/phase.ts` the only legal phase vocabulary. Remove stale names such as generic `recruiting` and `signing_day` from tests and routes.

Each transition handler should implement:

```ts
interface PhaseTransition {
  validate(ctx): Promise<Violation[]>;
  execute(ctx, tx): Promise<TransitionResult>;
  verify(ctx, tx): Promise<Violation[]>;
}
```

The state machine owns:

- game completion preconditions
- readiness/deadline handling
- CPU recruiting turn
- human autopilot turn
- standings/rank updates
- conference championship generation
- national selection
- Super Regional/CWS creation and advancement
- departures, recruiting phases, signing day, roster cuts, progression, NIL reset
- next-season schedule/recruit generation

### C2. Idempotent transition keys

All generated artifacts receive a deterministic business key:

- game: league/season/phase/week/bracket slot or schedule slot
- conference championship: league/season/conference
- postseason entry: league/season/team
- postseason series: league/season/stage/slot
- progression: league/season/player
- NIL reset: league/season/team
- recruit class: league/season/vintage

Database uniqueness, not only `if exists`, enforces one artifact.

### C3. Preserve human decisions

Fix the season rollover use of nonexistent `team.userId`. Human ownership is derived from coach/user and `team.isCpu`.

- CPU teams may receive automatic lineups.
- Human teams receive auto-lineups only at initial creation, explicit “Auto Set,” or a commissioner deadline/autopilot event.
- Never silently overwrite a submitted human lineup.
- Every forced/autopilot change is logged.

### C acceptance

- Replaying any transition command is a no-op returning the original result.
- A crash at every major checkpoint can resume without duplicates.
- Ten seasons complete in both presets without an illegal phase or orphaned record.

---

## 8. Workstream D — Scheduling and postseason quality

### D1. Full Season schedule algorithm

Keep the correct quantity contract but replace the fairness portion.

Required algorithm features:

1. Use the stored `scheduleSeed`; never rely on database return order or `Math.random()`.
2. Build conference obligations first using conference-size-aware round robin/series rotations.
3. Build OOC opponents with constrained matching.
4. Assign home/away after pairings using a balancing pass.
5. Repair constraint violations with deterministic swaps.
6. Persist a `scheduleVersion`, seed, algorithm version, and validation report.

Hard validation for every Full Season schedule:

- 149 teams and 12 conferences
- 4,172 regular games
- 56 games for every team
- four games for every team in each of 14 weeks
- no self-games or duplicate game IDs
- home games between 26 and 30 for each team
- home/away difference no greater than four
- each team has meaningful conference and OOC play
- OOC games remain within the intended 14–20 band unless a documented conference-size exception is approved
- at least `min(8, ceil(OOC games / 2))` unique OOC opponents
- no OOC pair meets more than three times, and a repeated series is grouped rather than scattered across the season
- no same pairing is repeated in another week unless a deliberate series rule requires it
- conference opponents rotate across seasons and home/away reverses over a two-season cycle

The current output’s 18–36 home range and six OOC games against the same opponent must fail the new validator.

### D2. 14-team multiplayer scheduler

For the standard 6/4/4 preset:

- exactly 20 official regular games per team (140 total)
- exactly three non-counting exhibitions per team if enabled (21 total exhibition games)
- every pair of the 14 teams plays at least once
- remaining seven games per team emphasize conference opponents/rivals
- no pair plays more than three official regular games
- 9–11 home games per team
- repeat home/away reverses next season
- no human receives a materially easier schedule because of generation order

Expose a commissioner schedule preview with:

- games per team
- conference/OOC split
- home/away split
- unique opponents
- repeat pairings
- strength estimate
- blocking errors and warnings

“Regenerate” creates a new preview only. “Publish” transactionally replaces only future, unlocked games and creates an audit record. Never append a second schedule.

### D3. Full Season postseason clarity

Preserve the current compact product structure, but make it explicit and fair:

- 12 single-game conference championships
- 12 automatic bids plus four at-large bids
- eight best-of-three Super Regionals
- eight-team double-elimination CWS and championship series

Do not silently substitute a conference standings leader if a required championship is missing. Block and surface the broken prerequisite.

Replace the current score based mostly on win percentage with a schedule-aware published formula. Recommended starting model:

- 55% RPI/SOS-aware rating
- 20% overall win percentage
- 15% conference win percentage
- 10% capped run differential

Exclude exhibitions. Display every selected team’s score, auto/at-large reason, last-four-in/first-four-out, and tiebreakers.

### D acceptance

- 1,000 seeds pass all hard constraints for each preset.
- Same seed and inputs produce byte-identical schedules.
- Different seeds produce valid opponent variety.
- Seasons 1–10 rotate pairings without systematic home bias.
- Postseason generation is idempotent under concurrent advance requests.

---

## 9. Workstream E — Recruiting, scouting, visits, commits, and NIL

### E1. One canonical rules source

`shared/recruitingBalance.ts` is the only source for:

- pool formula
- target cap
- commit capacity
- contact/scout seasonal budgets and turn caps
- action costs
- visit combined/subcaps
- NIL floor/envelopes/index

Routes and CPU simulation must not duplicate constants or formulas. The frozen league `rulesSnapshot` is passed into the service.

### E2. Required V2 starting values

| Rule | Standard 14-team custom | 149-team Full Season |
|---|---:|---:|
| Recruit pool | 102 | 1,081 |
| Recruiting turns | 10 | 19 |
| Balanced coach contact budget | 160/season | 190/season |
| Balanced coach scout budget | 100/season | 114/season |
| Email | 1 contact point | 1 |
| Phone | 2 contact points | 2 |
| Offer | 2 contact points | 2 |
| Campus visit | 4 contact points | 4 |
| Head coach visit | 5 contact points | 5 |
| Combined visits | 12 | 14 |
| Campus visits | 9 | 10 |
| Head coach visits | 4 | 5 |
| Target board | dynamic, 18–28 | dynamic, 18–28 |
| Oversign allowance | 2 over confirmed openings | 2 over confirmed openings |
| NIL floor | $750,000 | $750,000 |
| NIL envelopes | 65% recruiting / 25% retention / 10% walk-ons | same |

Geography should influence interest effectiveness and recruit preferences, not silently replace the published flat action cost.

### E3. Transactional recruiting action service

Create `server/services/recruitingActionService.ts`. Human routes and CPU logic call the same function.

Within one DB transaction:

1. Lock league/rules snapshot, team/coach, current-turn ledger, recruit, team-recruit interest, and relevant unique action row.
2. Validate phase, ownership, recruit league, action eligibility, one-per-week/season constraints, target/visit caps, and available points.
3. Insert action with a client/CPU idempotency key.
4. Atomically increment the authoritative ledger with `spent + cost <= cap`.
5. Apply interest/scouting/offer/visit state.
6. Apply NIL reservation if relevant.
7. Write structured audit/telemetry.
8. Commit and return the complete updated economy.

If spend fails, nothing else changes. The current pattern that logs/mutates interest and then ignores a failed `atomicSpendRecruitPoints` return is unacceptable.

### E4. Dynamic class capacity

Use `getClassCapacity()` everywhere:

- confirmed openings = 25 minus confirmed returning roster
- projected openings may include modeled draft/portal exits
- hard commit cap = confirmed openings + two
- signing/cut-day enforcement resolves the temporary oversign safely

Do not report a hard cap of 25 commits. Do not allow the separate route-level 30-player limit to substitute for recruiting class capacity.

### E5. Recruit class generation and upload

- Automatic pool size is `max(30, ceil(teamCount × 7.25))`.
- 14 teams must generate 102, not 80.
- 149 teams must generate 1,081.
- Wizard min/max and server validation derive from league/team count.
- Saved/imported classes must match the expected count unless the commissioner uses an explicit expert override after a blocking health report.
- Update stale test comments and assertions that encode `min(teamCount × 5 + 10, 80)`.
- Departure-aware positional targeting may alter distribution, not reduce total below the sustainable floor.
- Do not treat every junior as a confirmed departure; use actual declarations plus a probability model for projected exits.

### E6. CPU parity

CPU teams must:

- select dynamic target counts, not legacy fixed 12/16/20/24/30 boards
- spend the same contact/scout costs
- honor visit subcaps and class caps
- actually consume scouting budget and base decisions on visible/scouted information
- use the same interest formulas as humans
- use NIL envelopes and never spend negative funds
- receive strategy advantages from difficulty, not hidden rule-breaking resources

Difficulty should affect prioritization quality, risk tolerance, and evaluation noise—not action costs or cap bypasses.

### E7. NIL as an authoritative ledger

Replace placeholder header values with real ledger data:

- initial allocation
- recruiting committed/paid
- retention reserved/paid
- walk-on reserved/paid
- remaining by envelope and total

NIL transactions require unique idempotency keys. The sum of envelopes must equal the team budget after deterministic rounding. Decide explicitly whether the $750,000 V2 floor applies at new-league creation; recommended: yes for all new V2 leagues, with existing leagues upgraded next offseason.

### E8. Balance telemetry and tuning gates

Run at least 500 seeded one-season simulations and 100 ten-season simulations per preset. Report:

- class sizes, fill rate, unsigned rate, star distribution, positional shortages
- spend utilization by action and coach archetype
- target/visit/scout cap hits
- commits per action and scouting error
- NIL spend, negative/overspend attempts, distribution by prestige/conference
- roster size/position health after cuts
- talent concentration and year-over-year OVR inflation
- human vs CPU results under identical rules

Starting acceptance bands:

- no team exceeds its hard commit cap
- no negative ledger or envelope
- all point-spending actions have exactly one spend record
- median CPU contact/scout utilization is 70–95%
- Full Season opening demand can be filled without systemic position starvation
- season-start rosters are 25 or an explicitly valid emergency-repair state
- long-run national average OVR does not drift more than two points without a deliberate balance-version change

### E acceptance

- Concurrent actions cannot overspend or award free interest.
- Header, action dialog, server response, DB ledger, and audit log always agree.
- Exact pool tests pass for 4, 10, 14, 20, and 149 teams.
- Humans and CPU pass the same rules-table contract tests.

---

## 10. Workstream F — Progression, roster health, and competitive balance

### F1. Progression behavior

- Full Season always enables progression.
- Custom retains the league setting, frozen in the season rules snapshot.
- Resolve the current potential type mismatch; potential is represented canonically as a number, with grade only as a view conversion.
- Apply progression once per player per offseason via a unique key.
- Cap every attribute at its legal domain and recalculate OVR/star rating once.
- Persist per-attribute deltas for the development report.
- Separate development, aging/decline, injury, coaching, and morale modifiers for future tuning.

### F2. Roster health

At roster-finalization, every team receives a blocking report:

- active player count
- pitchers/catchers/infield/outfield minimums
- valid unique jersey numbers
- lineup and rotation legality
- duplicate player IDs/names warning
- unresolved portal/draft/departure state

Emergency CPU repair is allowed only after a failed commissioner/coach deadline and must be logged. Human rosters should not be silently rewritten.

### F3. Multi-season fairness

Use deterministic soak tests to watch:

- prestige stratification without permanent lockout
- conference strength drift
- blue-blood vs small-program recruit win rates
- player-development distribution by potential and facilities
- NIL inequality and upset rates
- roster attrition and transfer volume
- number of programs reaching the CWS over 10/25 seasons

Balance changes require a new version and migration policy, not silent constant edits.

---

## 11. Workstream G — In-dynasty Commissioner League Editor

### G1. Product placement

Replace the two overlapping roster-edit experiences with:

**Commissioner → League Editor**

Tabs:

1. **Schools**
2. **Players**
3. **Change Log**

The editor operates on the dynasty’s local copies. It must never mutate the global catalog or another dynasty.

### G2. Permission and governance defaults

- Primary commissioner can edit identity data.
- Co-commissioners need explicit `edit_league_data` permission.
- Competitive edits are disabled by default in multiplayer and require a league setting plus a confirmation.
- Single-player commissioner may enable competitive edits.
- All coaches can see the public change log.
- No edit occurs during an active advance, save restore, schedule publish, or bootstrap job.

Recommended league settings:

- `commissionerIdentityEditsEnabled` default true
- `commissionerCompetitiveEditsEnabled` default false in multiplayer
- `commissionerEditsPublic` locked true for multiplayer
- `coCommissionerEditPermission` default false

### G3. School editing scope

#### Identity fields — editable immediately

- School name
- Mascot
- Abbreviation
- Primary color
- Secondary color
- City
- State
- ZIP code
- Stadium name
- Noncompetitive description/flavor fields, if added

Validation:

- school name: trimmed, 2–60 characters, case-insensitive unique in league
- mascot: 2–40 characters
- abbreviation: 2–6 uppercase alphanumeric characters, unique in league
- colors: strict `#RRGGBB`, not identical, with automatic readable foreground and preview contrast warnings
- state: controlled enum; ZIP validated when applicable
- no HTML/script content

#### Competitive school fields — offseason/next-season by default

- prestige
- stadium rating
- facilities
- college life
- marketing
- academics
- fanbase passion/type
- enrollment
- NIL baseline/budget

These values affect recruiting, progression, revenue, or simulation. Require:

- competitive-edit setting enabled
- primary commissioner or explicit elevated permission
- reason text
- before/after impact summary
- default `effectiveSeason = currentSeason + 1`
- immediate application only through an “expert override” confirmation and public audit event

#### Out of scope for Editor V1

- Moving a team between conferences after a schedule exists
- Adding/removing teams
- Changing schedule results
- Rewriting historical champion/record/stat rows

Conference realignment belongs in a later offseason-only tool with schedule regeneration and migration rules.

### G4. Player editing scope

#### Identity/cosmetic fields

- First and last name
- Jersey number
- Position display assignment
- Bat/throw hand
- Home state and hometown
- Skin tone, hair, facial hair, eyes, eye black, headwear

#### Competitive fields

- Eligibility
- Potential
- Hitter/pitcher/common attributes
- Pitch mix and trajectory
- Abilities
- Role/depth/lineup fields through the normal lineup service

Validation:

- identity strings trimmed and length-limited
- jersey 0–99 and unique among active teammates
- position, eligibility, hands, appearance, and abilities use enums
- base attributes integers 0–100
- binary pitches exactly 0/1; breaking/secondary pitch grades 0–7
- trajectory within legal range
- incompatible hitter/pitcher fields rejected or normalized by a documented conversion flow
- OVR and star rating are server-derived and cannot be submitted directly
- `teamId`, player ID, signing/departure/portal/draft flags, season links, and historical stats are never editable through the generic endpoint

Position conversion must:

1. preserve `originalPosition` once
2. validate required attributes/pitch mix
3. recalculate OVR/star rating
4. update current-season display position
5. never rewrite past-season stats
6. warn if the current lineup/rotation becomes invalid

### G5. Data model

Add optimistic versions:

- `teams.editor_version integer not null default 1`
- `players.editor_version integer not null default 1`

Add structured audit tables:

```text
league_edit_batches
  id, league_id, actor_user_id, reason, season, phase, week,
  status, created_at, reversed_batch_id

league_edit_changes
  id, batch_id, entity_type, entity_id, field_name,
  before_json, after_json, effective_season, created_at
```

Optional but recommended identity history:

```text
team_identity_history
  team_id, league_id, effective_from_season, effective_to_season,
  name, mascot, abbreviation, colors
```

Stable entity IDs are never changed. Historical pages can either display the current identity or the identity snapshot from that season, but the choice must be consistent and documented. Recommended: historical box scores retain their season snapshot; navigation and current standings use current identity.

### G6. API contract

Suggested endpoints:

```text
GET   /api/leagues/:leagueId/editor/schools?search=&cursor=&limit=
GET   /api/leagues/:leagueId/editor/players?teamId=&search=&position=&cursor=&limit=
PATCH /api/leagues/:leagueId/editor/schools/:teamId
PATCH /api/leagues/:leagueId/editor/players/:playerId
POST  /api/leagues/:leagueId/editor/batches
GET   /api/leagues/:leagueId/editor/history?entityType=&entityId=&cursor=
POST  /api/leagues/:leagueId/editor/batches/:batchId/reverse
```

Every PATCH includes:

```json
{
  "expectedVersion": 4,
  "changes": { "name": "New Name", "primaryColor": "#123456" },
  "reason": "Commissioner-approved rebrand",
  "effectiveSeason": 3,
  "idempotencyKey": "uuid"
}
```

Server response includes the updated entity, new version, validation warnings, affected derived data, and audit batch ID.

Reject unknown fields. Use a separate strict schema for school identity, school competitive data, player identity, and player competitive data.

### G7. Transaction and concurrency rules

In one transaction:

1. Acquire league/editor lock.
2. Verify permission and phase.
3. Lock entity and compare `expectedVersion`.
4. Validate the exact allowlisted patch.
5. Save before/after structured changes.
6. Apply entity and derived-field changes.
7. Increment editor version.
8. Create league activity event.
9. Commit.

Return 409 with current data if the entity changed after the editor loaded it.

Reversal is allowed only when:

- the user has permission
- no later edit changed the same fields
- no dependent irreversible event makes reversal unsafe
- the reverse operation itself creates a new audit batch

Never delete audit history.

### G8. Editor UX

#### Schools

- Virtualized/searchable school list suitable for 149 teams
- Filters by conference and human/CPU control
- Split master/detail view on desktop; full-screen detail on mobile
- Live brand preview: abbreviation badge, header, light/dark foreground, uniform/card mock
- Sections for Identity, Location, Branding, Program Ratings, and NIL
- “Competitive impact” label next to affected fields
- Sticky Save/Discard bar
- Reason and effective-season dialog before save

#### Players

- Search and filter by team, position, class, human/CPU, and roster status
- Virtualized roster list; do not render all 3,725 players at once
- Identity, Appearance, Ratings, Pitching, Abilities, and History panels
- Before/after OVR preview calculated by the server or shared pure function
- Team roster-health indicator while editing
- Multi-select batch edit only for narrowly safe fields; no unrestricted bulk body

#### Change Log

- Actor, timestamp, season/phase/week, reason, entity, before/after fields, effective season, and reversal status
- Filters by school/player/actor/type
- Public coach-facing view in multiplayer
- Copyable audit ID for dispute resolution

### G9. Rename propagation requirements

After a school rename:

- route URLs and foreign keys remain unchanged
- headers, standings, schedules, recruiting interest, invites, matchup cards, commissioner tools, and current news resolve the new identity
- cached league queries invalidate
- old human team ownership remains intact
- save/export/restore retains the edit
- historical identity behavior follows the documented snapshot rule
- no generated opponent or conference reference relies on school name as a key

### G acceptance

- Cross-league school/player edit returns 403/404 without revealing data.
- Unknown fields such as `teamId`, `overall`, `pendingDeparture`, or `leagueId` are rejected.
- Two commissioners editing version 4 simultaneously produce one success and one 409.
- Rename, mascot, abbreviation, colors, player name, appearance, position, and ratings survive refresh, advance, save/restore, and next season.
- OVR/star recalculate correctly and historical stats remain unchanged.
- Every competitive change is visible to all multiplayer coaches.
- Editor performs smoothly with 149 schools and 3,725 players.

---

## 12. Workstream H — Usability, design, and accessibility

### H1. Establish a readable design system

The retro green/gold direction is distinctive and worth keeping. The pixel style should supply personality, not reduce readability.

Create tokens and remove ad hoc micro-text:

- body/data minimum: 14 px at 100% UI scale
- secondary labels minimum: 12 px
- pixel display font only for short headings, badges, and decorative labels
- tab/click targets at least 40–44 px high
- line height at least 1.35 for dense data
- supported UI scaling: 80%, 90%, 100%, 110%, 125%, 150%

Replace the approximately 1,675 `text-[6px]` through `text-[9px]` usages via component tokens, not a blind search/replace.

### H2. Task-centered navigation

Add a “Today” or “This Week” command center containing:

- current season/week/phase
- next games and pitching availability
- recruiting points/scouting/visits/NIL with accurate caps
- unresolved lineup/roster warnings
- commits, injuries, promises, messages, deadlines
- commissioner readiness and advance status
- primary recommended action

Reduce page hunting. Group commissioner navigation into:

- Command
- League Operations
- Teams & League Editor
- Data/Imports
- History & Audit

### H3. Large-universe performance UX

- Cursor-paginate server APIs for players, recruits, schools, logs, news, and stats.
- Virtualize large lists.
- Search/filter server-side.
- Use stable query keys and targeted cache invalidation.
- Avoid loading all 1,081 recruits or 3,725 players for a collapsed screen.
- Show skeleton/progress states; replace blank `PageLoader` behavior.
- Background Full Season bootstrap shows named stage, percentage, retry/recovery message, and safe cancel before publishing.

### H4. Recruiting screen improvements

The top cards should show:

- Targets: used/dynamic cap
- Commits: signed/hard cap, with confirmed/projected openings tooltip
- Contact: turn spend/cap and seasonal remaining
- Scouts: turn spend/cap and seasonal remaining
- Visits: combined plus campus/HC subcap tooltip
- NIL: recruiting envelope remaining, with total/envelope breakdown

Add a “Why?” popover for every cap. Disable actions with a specific reason before the click. After an action, update all cards from the server’s single economy response.

### H5. Accessibility

- Full keyboard navigation and visible focus
- Sortable table headers implemented as buttons, not clickable `<th>` only
- ARIA names for icon buttons and progress
- Contrast verified for custom colors and default theme
- Never communicate state only by red/green
- Reduced-motion and audio/music controls
- Screen-reader labels for grades and abbreviations
- Responsive testing at 1280×720, 1920×1080, 2560×1440, Steam Deck-like 1280×800, and 200% zoom

### H6. Product copy and mode separation

Replace conflicting text:

- “Full Season — 60 Games (14 weeks + 4 spring)” → “Full Season — 56-game regular season (14 weeks)”
- stale “130+ programs / 3,500 players” → current verified counts, or avoid hard-coded counts and derive them
- Full Season landing flow must not instruct users to launch or upload from Power Pros

Present two clear paths:

1. **Full Season Dynasty — Play entirely in this game**
2. **Custom Multiplayer League — Simulate in-app or use optional manual reporting tools**

Do a professional trademark, school-name/logo, player-likeness, and data-licensing review before Steam. This plan is product guidance, not legal advice.

### H acceptance

- Primary workflows can be completed at 1280×720 without clipped actions or unreadable text.
- All interactive controls work by keyboard.
- Automated axe checks have no serious/critical findings on the top 15 routes.
- A manual visual QA checklist is signed off for both presets because the initial audit could not run a live browser session.

---

## 13. Workstream I — Steam and long-term flagship architecture

This is not required before fixing P0, but current decisions should not block it.

### I1. Separate game services from web delivery

Define interfaces for:

- `ScheduleEngine`
- `RecruitingEngine`
- `ProgressionEngine`
- `GameSimulationEngine`
- `PostseasonEngine`
- `SaveRepository`

Keep deterministic seeds and event logs. This allows future desktop packaging, offline solo play, cloud saves, and a pixel gameplay client without rewriting dynasty rules.

### I2. Future watch/coach/play engine seam

Have the game engine emit a canonical event stream:

```text
GameStarted
PlateAppearanceStarted
PitchThrown
BallInPlay
RunnerAdvanced
OutRecorded
RunScored
SubstitutionMade
InningEnded
GameEnded
```

The existing quick simulation, future watch mode, coach mode, and a retro playable engine should all consume/produce the same state transitions. Do not couple future visuals to route handlers or database writes.

### I3. Desktop readiness backlog

- local/offline single-player save
- crash recovery and save validation
- optional Steam Cloud
- keyboard/controller navigation
- resolution and UI scale controls
- audio controls
- privacy/telemetry controls
- Windows packaging and update strategy
- deterministic bug-report bundle containing seed, rules version, save metadata, and recent events

---

## 14. Required automated verification matrix

### 14.1 Full Season creation

- one bootstrap request creates one league job
- retry/crash resumes without duplicates
- exactly 12 conferences, 149 teams, 149 coaches, 3,725 players, 1,081 recruits
- exactly 25 players per team
- exactly 4,172 regular games and 56 per team
- progression true and immutable
- no exhibitions or companion-only dependency
- schedule fairness validator passes

### 14.2 Full Season postseason

- 12 unique conference championships
- phase cannot advance with an unresolved championship
- exactly 12 auto bids and four at-large bids
- eight unique best-of-three Super Regionals
- eight unique CWS teams
- one champion and complete bracket history
- duplicate/concurrent advance produces no duplicate game/series/entry

### 14.3 Full Season rollover/soak

For 10 seasons:

- every season creates a valid 56-game schedule
- every season creates at least the 1,081 recruit floor unless a versioned rule explicitly changes it
- progression applies exactly once
- NIL resets exactly once
- no team/player/coach orphan
- no roster above 25 after finalization
- human lineups are not overwritten
- record books and career history remain consistent

### 14.4 14-team multiplayer creation

- exactly 14 teams and 6/4/4 conferences
- exactly 25 players per team and 102 recruits
- 20 regular games per team; three exhibitions only if enabled
- every human pair meets once
- home/away, repeat-pair, and conference rules pass
- 14 simultaneous team claims resolve to 14 unique owners

### 14.5 Multiplayer operations

- invite create/preview/accept/revoke/expire
- concurrent same-team accepts
- ready/unready and display permissions
- deadline expiration and autopilot
- commissioner/co-commissioner permission matrix
- force-advance with audit and save state
- coach leave/remove/CPU handoff
- cross-league route fuzzing

### 14.6 Recruiting economy

- exact pool sizes
- exact turn-budget remainder distribution
- every action cost and cap
- combined and sub-visit caps
- dynamic target and class caps
- atomic concurrency
- CPU/human parity
- NIL allocation/spend/reserve invariants
- header-to-ledger consistency

### 14.7 League Editor

- schema allowlists and unknown-field rejection
- cross-league access
- permission matrix
- version conflict
- school uniqueness/color validation
- player range/enum/jersey validation
- derived OVR/star and position conversion
- audit before/after and reversal
- save/restore and season rollover
- performance pagination/virtualization

### 14.8 UI E2E routes

At minimum:

- landing and new dynasty
- Full Season bootstrap progress and dashboard
- 14-team setup/invite/join
- weekly command center
- recruiting browse/detail/action/header
- lineup/roster
- commissioner readiness/advance
- schedule preview/publish
- League Editor schools/players/change log
- conference championships/Super Regionals/CWS
- offseason progression/signing/cuts/next season

---

## 15. Implementation order for Replit

Replit should work in small, reviewable checkpoints and keep the app runnable after each one.

### Checkpoint 0 — Safety baseline

- Back up the database.
- Record current migration head.
- Add CI/verification scripts.
- Capture golden fixtures for one Full Season and one 14-team league.
- No feature work yet.

### Checkpoint 1 — Green build

- Fix all 66 TypeScript errors.
- Repair dependency/test scripts.
- Establish disposable DB tests.
- Acceptance: Workstream A verification passes.

### Checkpoint 2 — Security and concurrency

- Central authorization.
- Safe claim/invite transaction and unique indexes.
- Durable advance and job claim.
- Strict player PATCH immediately, before adding more editor capabilities.
- Acceptance: Workstream B tests pass.

### Checkpoint 3 — Phase and schedule correctness

- One state machine.
- Fix rollover human-lineup bug.
- Seeded Full Season and 14-team scheduling.
- Atomic preview/publish.
- Idempotent postseason.
- Acceptance: 1,000-seed schedule suite and concurrent advance tests pass.

### Checkpoint 4 — Recruiting V2 completion

- One transactional action service.
- Frozen rules snapshot.
- Exact 102/1,081 classes and dynamic wizard.
- CPU parity and real NIL ledger.
- Acceptance: recruiting contract and balance soak tests pass.

### Checkpoint 5 — Commissioner League Editor

- Structured audit/version migrations.
- Schools API/UI.
- Consolidated Players API/UI.
- Change Log and safe reversal.
- Acceptance: Workstream G tests pass.

### Checkpoint 6 — UX/accessibility/performance

- Command center.
- Navigation grouping.
- readable typography tokens.
- pagination/virtualization.
- mode-specific copy/branding.
- manual visual QA plus accessibility automation.

### Checkpoint 7 — Release candidate soak

- Fresh Full Season from creation through season 2 interactively.
- 10-season automated Full Season and multiplayer soaks.
- 14-user concurrency test.
- restore from legacy DB and saved league.
- no P0/P1 defects open.

Do not combine all checkpoints into one unreviewable change. At each checkpoint, provide changed-file summary, migrations, tests run, output, remaining failures, and rollback instructions.

---

## 16. Definition of done

The project is ready to call these updates complete only when:

- TypeScript and production builds are green.
- Blank and legacy DB migrations are green.
- Full Season creates the exact intended universe and survives at least 10 automated seasons.
- Full Season schedules pass quantity and fairness checks, not just game-count checks.
- 14-team leagues create 102 recruits and a fair 20-game human schedule.
- Recruiting cards, action routes, CPU logic, ledgers, NIL, and audit logs all use the same frozen V2 rules.
- Concurrent requests cannot duplicate a claim, action, schedule, bracket, advance, job, or edit.
- Every private league route proves membership/permission.
- The commissioner can safely edit dynasty-local school identity/details/colors and player data after creation.
- Competitive edits are permissioned, phase-aware, versioned, and public in multiplayer.
- Historical stats/results remain intact after edits.
- Full Season never asks for or assumes Power Pros.
- UI text is readable, primary workflows are keyboard accessible, and large lists are responsive.
- Replit supplies evidence: commands, passing outputs, seeded test reports, screenshots for core routes, and migration/rollback notes.

---

## 17. Replit handoff prompt

Use the following as the implementation instruction:

> Implement `REPLIT_FULL_APP_SWEEP_AND_DYNASTY_EDITOR_PLAN.md` in checkpoint order. Treat every P0 item and product contract as mandatory. First produce a mapping from each finding ID to affected files, migration changes, and tests. Do not add the League Editor until the build, authorization, concurrency, phase, schedule, and recruiting foundations are green. Preserve existing dynasties and the 14-person multiplayer experience through versioned rules and tested migrations. Never weaken TypeScript or tests to obtain a green check. After each checkpoint, report exact commands and outputs, database migrations, files changed, unresolved findings, and how to roll back. The work is complete only when the Definition of Done and both mode-specific automated matrices pass.

