# College Baseball Dynasty — Full Season Flagship Plan

**Prepared for:** Replit implementation, testing, and verification  
**Repository audited:** `Pawa-College-Baseball-Dynasty-main.zip`  
**Audit date:** July 12, 2026  
**Recommendation:** Build **Full Season** as a versioned, server-owned dynasty preset and make it the primary single-player experience.

---

## 1. Executive decision

The repository has much of the feature depth needed for a strong college baseball management game—real rosters, recruiting, progression, transfers, development, history, simulation, statistics, postseason views, and a retro presentation—but the current league-size assumptions are built around roughly 6–20 teams. The existing code cannot safely create or advance a 149-team dynasty without structural changes.

This is not a UI-only feature. The following systems must be changed together:

1. League creation and team catalog
2. Schedule generation and schedule validation
3. Season/phase advancement
4. Postseason selection and brackets
5. Recruiting-class sizing and CPU recruiting
6. Bootstrap and simulation performance
7. Full Season UI and in-app-only enforcement
8. Scale, recovery, and multi-season tests

The recommended Full Season rules are:

| Rule | Full Season value |
|---|---:|
| Programs | 149, derived from the canonical catalog |
| Conferences | 12, all canonical conferences |
| Human-controlled programs | 1 by default |
| CPU-controlled programs | 148 by default |
| Official regular-season games per team | Exactly 56 |
| Regular-season weeks | 14 |
| Weekly target | Exactly 4 official games per team |
| Conference weekend | One three-game series when the conference rotation permits |
| OOC games | Fill the remaining weekly degree to four |
| Exhibition games | 0 for the preset; they may remain available in custom leagues |
| Game source | In-app simulation/gameplay only |
| Power Pros reported/OCR mode | Prohibited for this preset |
| Player progression | Always on |
| Conference postseason | One championship game per conference for the first release |
| National field | 16: 12 conference champions + 4 at-large teams |
| Super Regionals | Eight best-of-three series |
| College World Series | Eight teams, two four-team double-elimination brackets, then a best-of-three final |
| Recruiting pool | Roster-need-driven; approximately 1,050–1,150 in a 149-team universe, not a fixed cap |

This recommended postseason satisfies the requested phase list without inventing a mislabeled 149-team “Super Regional” bracket. A later realism expansion can add a 64-team Regional round before Super Regionals.

---

## 2. What the research suggests the flagship should be

The comparison games point to a useful product position: deep simulation that remains easy to navigate, with several ways to experience game day.

### Football Coach: College Dynasty

Its strongest lesson is accessibility around a complete dynasty loop: coach progression, recruiting, tactical decisions, histories, records, and long-term program building. It also supports Steam-native features such as achievements and Workshop. The takeaway is not to copy football systems; it is to make the weekly decision loop understandable and rewarding while preserving depth.  
Source: [Football Coach: College Dynasty on Steam](https://store.steampowered.com/app/2151290?l=english)

### Football Manager 26

The official FM26 UI design emphasizes tiles that expand into cards, a unified Portal that combines home and inbox functions, decision filters, advice, calendar context, and bookmarks. That is directly relevant to a 149-team universe: the player should see the few decisions that matter now, with deeper data one click away.  
Source: [FM26’s reimagined user interface](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface)

### Out of the Park Baseball 27

OOTP’s durable value proposition is breadth and choice: run the organization at a high level, manage lineups and pitching staffs, or play games out play-by-play or pitch-by-pitch. The Full Season mode should follow the same “one authoritative universe, multiple interaction depths” principle.  
Source: [Out of the Park Baseball 27 on Steam](https://store.steampowered.com/app/4045750/Out_of_the_Park_Baseball_27/?l=english)

### Retro baseball references

- **Baseball Stars** demonstrates that persistent player development, team building, league play, and stored statistics can make a simple on-field game feel like a dynasty. Its manual explicitly covers creating leagues, managing players, and developing them. [Baseball Stars manual](https://www.world-of-nintendo.com/manuals/nes/baseball_stars.shtml)
- **Little League Baseball: Championship Series** is useful for its compact presentation, power comparison, and CPU watch-game concept. [Game reference](https://en.wikipedia.org/wiki/Little_League_Baseball%3A_Championship_Series)
- **Tecmo Baseball** included a zero-player watch mode. That validates watch mode as a core experience rather than a novelty. [Tecmo Baseball](https://en.wikipedia.org/wiki/Tecmo_Baseball)

The future gameplay engine should be original in art, animation, rules implementation, UI, and audio. “Inspired by” these games must not become copied sprites, screens, code, sound, or trade dress.

### Real college baseball structure

The 56-game target matches the NCAA Division I maximum for the championship segment. The real national tournament uses 64 four-team double-elimination Regionals, 16 teams in eight best-of-three Super Regionals, and an eight-team College World Series with two double-elimination brackets and a best-of-three final.  
Sources: [NCAA Division I baseball contest limit](https://web3.ncaa.org/lsdbi/reports/pdf/searchPdfView?businessCode=PROPOSAL_SEARCH_VIEW&division=1&id=109235), [how the Men’s College World Series works](https://www.ncaa.com/news/baseball/article/2025-06-10/how-mens-college-world-series-works?amp=)

For the requested first release, the plan begins at a 16-team Super Regional field after conference championships. The data model and engine should be designed so a 64-team Regional phase can be inserted later without another rewrite.

---

## 3. Repository architecture observed

The application is a React/TypeScript/Vite frontend with an Express/TypeScript backend, PostgreSQL, Drizzle ORM, TanStack Query, Wouter, and Playwright tests.

Important current locations:

- League schema: `shared/schema.ts`
- League creation and team selection: `server/routes.ts`
- Dynasty start and schedule health: `server/routes/league-mgmt.ts`
- Schedule, roster, and recruit generation: `server/recruit-engine.ts`
- Phase advancement, simulation, progression, signing, walk-ons, and postseason: `server/routes/simulation.ts`
- Recruit-pool formula: `server/utils.ts`
- Recruit generation: `server/recruit-generator.ts`
- League creation UI: `client/src/pages/league-create.tsx`
- Team selection UI: `client/src/pages/team-selection.tsx`
- Commissioner phase UI: `client/src/pages/commissioner/**`
- Existing season tests: `tests/e2e/season-flow.test.ts`, `tests/smoke/02-full-season.spec.ts`, and `tests/smoke/04-phase-transitions.spec.ts`

`server/routes/simulation.ts` is over 8,500 lines and contains several independent fast-forward implementations. This concentration of responsibilities is the main season-integrity risk.

---

## 4. Audit findings

### P0 — blockers that must be fixed before Full Season can ship

| Finding | Evidence in current repository | Impact |
|---|---|---|
| API limits leagues to 64 teams | `server/routes.ts:94` and `server/route-helpers.ts:112` | Cannot create all 149 programs |
| API limits selected conferences to four | `server/routes.ts:96-97` and `server/route-helpers.ts:114-115` | Cannot select all 12 conferences |
| Frontend only offers small team counts | `client/src/pages/league-create.tsx:91-97` | No all-program option |
| Frontend conference totals are stale | UI says ACC 17, Big Ten 18, Sun Belt 13; canonical catalog contains 16, 17, and 12 | UI totals 152 while the server catalog contains 149 |
| Team selection forces an equal conference split | `server/routes.ts:1144-1151` and `client/src/pages/team-selection.tsx:17-21` | Cannot select every member of conferences with different sizes |
| National-team constants disagree | Server uses 149 in `server/rosterScaleFactors.ts:12`; client uses 142 in `client/src/pages/team-selection.tsx:15` | Rankings and scouting displays drift |
| No 56-game profile exists | Current targets are 20, 40, or 60 in `server/recruit-engine.ts:388` | Requested schedule cannot be represented |
| Season duration is duplicated | Week counts appear in schedule generation, schedule health, normal advance, and four fast-sim routes | Adding one enum will leave paths inconsistent |
| Storyline defaults disagree with the live long season | `server/storyline-routes.ts:1109` defaults long to 10 while live routes use 15 | Events can stop early or be assigned to wrong slots |
| Current “16-team” bracket includes every league team | `generateSuperRegionalBracket()` seeds `leagueTeams` and never slices the field | A 149-team league enters the bracket wholesale |
| Current double-elimination algorithm drops entrants | It gives only seed 1 a bye, pairs the remaining odd field, and later selects only portions of winner lists | It is not safe even at the documented 16-team size |
| Current CWS is only a two-team best-of-three | `advanceCWS()` receives two teams | It is a final series, not an eight-team CWS |
| Recruiting is capped at 75 players | `server/utils.ts:15-16` | A national universe cannot replenish 149 rosters |
| Tests and implementation disagree on the cap | Tests expect a cap of 80; implementation returns 75 | Existing tests do not describe production behavior |
| Power Pros can be enabled later | Commissioner settings can patch `gameMode` | Full Season’s in-app-only rule is not enforceable |
| Exhibition and conference-title games can affect overall standings | Their finalization does not consistently use `skipStandings` | “56-game record” and postseason selection become contaminated |

### P1 — scale and reliability risks

| Finding | Current behavior | Needed change |
|---|---|---|
| Schedule writes | Each game is inserted individually | Batch insert 4,172 regular games |
| Roster bootstrap | Teams and players are generated in nested sequential loops | Batch players and use a resumable job |
| Weekly simulation | Hundreds of games can run in one unbounded `Promise.all` | Preload rosters; use bounded concurrency |
| Simulation roster reads | The same team roster is fetched for multiple games | One league roster snapshot per advance |
| Progression | Rosters are fetched twice, then players update sequentially | One league read and batched updates |
| Signing resolution | Interests can be fetched once per recruit | Load league-wide interests once and group in memory |
| CPU recruiting | Up to 148 teams run concurrently and each performs several reads/writes | Concurrency limit and batched logs/actions |
| Advance state | Lock and progress live in process memory | Persist jobs/checkpoints; use a DB lock |
| Bootstrap transactionality | A failure can leave a partially populated league | Idempotent checkpoints and transaction boundaries |
| Phase type safety | Phases and season lengths are free-form strings | Shared enums/Zod rules and exhaustive transitions |
| Fast-forward correctness | Multiple endpoints reproduce only parts of normal advance side effects | One authoritative transition engine |

### P2 — product-quality issues revealed by Full Season

- A 149-team league needs global search, bookmarks, filters, and an actionable home hub.
- Rankings need strength of schedule and deterministic tie-breaking, not only win percentage and runs scored.
- Conference title and postseason records should be stored separately from regular-season standings.
- Recruiting rarity rules must scale. Five to ten regular gems and a ten-gold-ability cap may work for 75 recruits but collapse in a 1,000-player class.
- A commercial Steam release must address licensing of school marks, conference marks, NCAA marks, real-player names/likenesses, music, and all imported media.

---

## 5. Full Season product contract

The preset must be authoritative. The client selects it; the server derives and validates every locked rule.

### API request

```json
{
  "name": "My College Baseball Dynasty",
  "preset": "full_season",
  "cpuDifficulty": "high_school"
}
```

The server must ignore or reject conflicting fields such as `maxTeams`, `selectedConferences`, `seasonLength`, `progressionEnabled`, and `gameMode` when `preset` is `full_season`.

### Persisted rules

Do not rely only on a mutable registry value. Each league should store:

```ts
type DynastyPreset = "custom" | "full_season";

interface LeagueRulesSnapshot {
  version: 1;
  preset: DynastyPreset;
  catalogVersion: string;
  rosterLimit: 25;
  eligibilityYears: 4;
  regularSeasonWeeks: number;
  regularSeasonGames: number;
  officialGamesPerWeek: number;
  exhibitionGames: number;
  progressionEnabled: boolean;
  gameSource: "in_app" | "reported";
  conferenceChampionship: {
    enabled: boolean;
    qualifiersPerConference: 2;
    format: "single_game";
  };
  postseason: {
    superRegionalFieldSize: 16;
    automaticBids: "conference_champions";
    superRegionalFormat: "best_of_3";
    cwsFieldSize: 8;
    cwsBracketFormat: "two_4_team_double_elimination";
    cwsFinalFormat: "best_of_3";
  };
}
```

Store `preset`, `rulesVersion`, and a `rulesSnapshot` JSONB column. This prevents a future balance patch from silently changing an existing save.

### Locked invariants

For `full_season`:

- `progressionEnabled === true`
- `gameMode === "simulated"` or, preferably, `gameSource === "in_app"`
- all canonical conferences exist
- all canonical programs exist exactly once
- reported-game/OCR endpoints return `409` with a clear preset explanation
- reported-game UI and settings are hidden
- one human program is selected; all remaining programs get CPU coaches
- no invite/deadline/readiness ceremony is required for normal single-player advancement

---

## 6. Canonical catalog correction

Move conference and team metadata out of `server/recruit-engine.ts` into one canonical catalog module. The frontend must fetch this catalog rather than hard-code counts.

Recommended files:

- `shared/catalog/conferences.ts`
- `shared/catalog/teams.ts`
- `shared/catalog/catalogVersion.ts`
- `server/services/catalogValidation.ts`

Required catalog assertions:

1. Exactly 12 conference records
2. Exactly 149 team records for the current repository data
3. Unique team name, abbreviation, and stable catalog ID
4. Every team has a valid conference
5. Every team resolves to a real roster or an explicitly approved generated-roster fallback
6. Every team has a national-rank entry or a deterministic fallback
7. UI counts are derived from the same response

Current canonical counts found in the server catalog:

| Conference | Programs |
|---|---:|
| SEC | 16 |
| ACC | 16 |
| Big 12 | 14 |
| Big Ten | 17 |
| Pac-12 | 8 |
| AAC | 11 |
| WCC | 8 |
| Ivy League | 8 |
| Sun Belt | 12 |
| Big West | 10 |
| HBCU | 16 |
| Missouri Valley | 13 |
| **Total** | **149** |

Do not preserve `maxTeams` as a manually maintained catalog fact. For Full Season, derive it from the catalog selected by the league’s `catalogVersion`.

---

## 7. Schedule design: exactly 56 games

### Required arithmetic

- 149 teams × 56 team-games = 8,344 team-games
- 8,344 ÷ 2 = **4,172 regular-season games**
- 56 games ÷ 14 weeks = **4 games per team per week**
- 4,172 games ÷ 14 weeks = **298 games per week**

These values should be asserted, not treated as soft targets.

### Recommended weekly construction

For each of 14 weeks:

1. Generate a conference round for each conference using a circle/round-robin method.
2. Schedule a three-game series for every paired conference matchup.
3. Compute each team’s remaining weekly degree: `4 - conferenceGamesThisWeek`.
   - Team in a conference series: remaining degree 1.
   - Team on a conference bye: remaining degree 4.
4. Fill remaining degree with cross-conference games using a constrained graph matcher.
5. Balance home/away assignment and opponent repetition.
6. Validate the completed week before inserting anything.

Because the Big Ten, AAC, and Missouri Valley have odd membership, three teams will have a conference bye in a typical round. Their four OOC games are not an error; they fill the same four-game weekly inventory without creating a fifth game.

### Conference rotation rules

- Prefer unique conference opponents before repeats.
- For conferences with fewer than 15 possible opponents, begin a reverse-home rotation after exhausting unique matchups.
- For 16- and 17-team conferences, use 14 unique opponents in the first season, rotating omitted opponents in subsequent seasons.
- Store or derive a `scheduleRotationSeed` so Season 2 does not reproduce Season 1.

### OOC matching constraints

Hard constraints:

- No self-matchups
- Opponents must be in different conferences
- Every team has degree exactly four for the week
- Every team has 56 games for the season
- No duplicate game for the same opponent pair on the same day unless it is an explicit series
- No team has two games assigned to the same day

Soft constraints, optimized in this order:

1. Fewest repeat OOC opponents
2. Home/away season balance, target 28/28 and tolerance ±2
3. Geographic reasonableness for some OOC games
4. Rivalry preservation
5. Strength-of-schedule balance

Use a deterministic seeded RNG. A schedule generated with the same league ID, season, catalog version, and schedule seed must be identical.

### Do not use the existing top-up approach for Full Season

The current generator creates a base schedule and then adds games until teams are near a target, with a ceiling above the target. That is acceptable for a flexible custom league but not for this preset. Full Season requires an exact degree-constrained construction and a fail-fast validator.

### Schedule health must become exact

For Full Season, health is green only when:

- 4,172 regular games exist
- min team games = max team games = 56
- all game weeks are 1–14
- every team has exactly four games each week
- no invalid opponent or duplicate-slot errors exist
- official standings contain no exhibition or postseason results

If any invariant fails, dynasty start or season transition must fail before the phase changes.

---

## 8. Recruiting and roster sustainability

### Why the existing formula fails

The current formula is:

```ts
Math.min(teamCount * 5 + 10, 75)
```

At 149 teams, it still creates only 75 recruits—about half a recruit per program. A 25-player roster with four eligibility classes needs roughly 6.25 replacements per program per season before draft and transfer attrition. The signing-day logic already attempts to fill open roster slots, so it will exhaust the pool almost immediately.

### Recommended pool planner

Create `server/services/recruitPoolPlanner.ts` and calculate a class from projected roster demand.

```ts
const steadyStateDemand = Math.ceil(teamCount * (rosterLimit / eligibilityYears));
const projectedOpenSlots = sumProjectedOpenSlots(allRosters, departuresModel);
const demand = Math.max(steadyStateDemand, projectedOpenSlots);
const competitionBuffer = Math.max(teamCount, Math.ceil(demand * 0.20));
const minimumNationalBoard = Math.ceil(teamCount * 7.25);
const poolSize = Math.max(minimumNationalBoard, demand + competitionBuffer);
```

For 149 teams, `minimumNationalBoard` is 1,081. The final count may move modestly based on actual seniors, projected junior declarations, and transfer attrition.

Do not add another arbitrary cap. If an operational limit is necessary, treat exceeding it as a configuration error with metrics, not as silent truncation.

### Position planning

Generate from aggregate projected needs, then add a 20% competition buffer by position group.

Suggested roster targets for the current 25-player model:

| Position group | Target per team | National steady-state annual need before buffer |
|---|---:|---:|
| Pitchers | 11–12 | about 410–447 |
| Catchers | 2 | about 75 |
| Middle infield | 4 | about 149 |
| Corner infield | 4 | about 149 |
| Outfield/DH | 5–6 | about 186–224 |

Use the actual catalog rosters to compute shortages; do not hard-code the final class distribution from this illustrative table.

### Scale rarity rules

Review these current class-wide rules:

- exactly one generational gem
- exactly one generational bust
- only 5–10 guaranteed regular gems
- class-wide cap of ten gold abilities

At roughly 1,081 recruits, fixed regular-gem and gold counts become proportionally much rarer than in a 75-player class. Decide explicitly which items are national once-per-year events and which are percentages.

Recommended default:

- Generational gem: exactly 1 nationally
- Generational bust: exactly 1 nationally
- Regular gem/bust and archetype rates: percentage-based, with bounded minimum and maximum
- Gold abilities: rate-based cap such as `round(poolSize / 8)` after calibration, not ten nationally

### Top schools and recruiting performance

The current top-schools calculation is already batch-inserted, which is a good foundation. At national scale:

- score recruits against all teams in memory
- batch-insert top-school rows
- index `recruit_top_schools(recruit_id, team_id)` uniquely
- preload league-wide interests for signing resolution
- limit CPU recruiting concurrency to a measured value such as 8–16 teams
- keep the virtualized recruiting list; it already uses TanStack Virtual

### Roster guarantees after each offseason

After signing day and walk-ons:

- every team must have 22–25 players before the new season starts
- every team must have minimum viable position depth
- no team may exceed 25
- no recruit may be assigned to two teams
- no source recruit may create duplicate players on retry
- progression must run exactly once per returning eligible player

If a team remains below minimum depth, generate emergency replacement-level walk-ons for that team and emit a health event. Do not start the next season with an invalid roster.

---

## 9. Postseason replacement

### Conference championships

For the first Full Season release:

- top two teams in each conference qualify
- seed by conference winning percentage
- tie-break in order: head-to-head, conference run differential, overall strength rating, stable team ID
- higher seed hosts one championship game
- exactly 12 champions are produced
- championship games do not mutate regular-season standings

Conference tournaments can be a later configurable format.

### National selection

Create a persisted `postseason_entries` set with:

- 12 automatic bids: conference champions
- 4 at-large bids: highest selection scores among non-champions
- national seed 1–16
- selection score and human-readable selection reason
- original bracket lane

Recommended first selection metric:

1. RPI-style strength score or the existing league power-ranking service after it is made deterministic
2. Overall win percentage
3. Strength of schedule
4. Run differential per game, capped to prevent score-margin exploitation
5. Head-to-head
6. Stable team ID

Conference champions receive bids, not automatic top seeds. Seed all 16 entrants by the same national metric.

### Super Regionals

- Pair 1–16, 2–15, …, 8–9.
- Preserve bracket lanes; do not reseed between phases.
- Each pairing is best-of-three.
- Higher seed hosts Games 1 and 3; lower seed is home for Game 2.
- Stop creating games as soon as one team earns two wins.
- Exactly eight winners advance.

### College World Series

Place the eight winners into two four-team double-elimination brackets based on their original bracket lanes. Each team must be eliminated only after two losses.

Each bracket produces one winner. Those two winners play a best-of-three final. Keep the top-level league phase as `cws` and store a postseason stage such as:

- `cws_opening`
- `cws_winners`
- `cws_elimination`
- `cws_bracket_final`
- `cws_finals`

This avoids adding another top-level phase to dozens of UI files while still making the state explicit.

### Required data model

Recommended tables:

```text
postseason_tournaments
  id, league_id, season, type, status, rules_version

postseason_entries
  tournament_id, team_id, qualification_type, national_seed,
  selection_score, selection_reason, bracket_lane

postseason_series
  id, tournament_id, stage, best_of, higher_seed_team_id,
  lower_seed_team_id, higher_seed_wins, lower_seed_wins, status

postseason_games
  series_id or bracket_game_id, game_id, sequence, dependency metadata
```

The existing `games` table remains the authoritative played-game record. The tournament tables describe qualification, dependencies, and series state.

### Idempotency requirements

Every postseason transition must be safe to retry:

- unique tournament per league/season/type
- unique entry per tournament/team
- unique series per tournament/stage/lane
- unique game per series/sequence
- advancing a completed stage returns its existing result
- no duplicate coach XP, awards, news, or history on retry

---

## 10. One authoritative season-advance engine

### Current issue

The normal `/advance` route, `sim-to-offseason`, `sim-full-season`, `sim-to-postseason`, and `sim-to-cws` each contain season-week and phase logic. Some paths run storylines, readiness, progression, coach XP, news, standings, or roster work differently. Full Season will amplify every difference.

### Target design

Create a domain service that executes one atomic transition at a time:

```ts
advanceLeagueStep({
  leagueId,
  actorUserId,
  mode: "interactive" | "fast_forward",
}): Promise<AdvanceResult>
```

Fast-forward endpoints must call this same function repeatedly until a predicate is met:

```ts
simulateUntil(leagueId, state => state.phase === "cws")
```

They must not reproduce transition logic.

### Recommended transition graph

```text
dynasty_setup
  -> preseason
  -> regular_season (weeks 1–14)
  -> conference_championship
  -> super_regionals (series steps)
  -> cws (bracket and finals steps)
  -> offseason_departures
  -> offseason_recruiting_1
  -> offseason_recruiting_2
  -> offseason_recruiting_3
  -> offseason_recruiting_4
  -> offseason_signing_day
  -> offseason_walkons
  -> preseason (season + 1)
```

Full Season does not need a separate `spring_training` phase. Custom leagues may retain it through their rules snapshot. If it remains in shared phase types, every path must handle it exhaustively.

### Transition preconditions

Examples:

- Regular week cannot advance until all scheduled official games for the week are complete or simulated.
- Conference championships cannot be created until all 4,172 regular games are complete.
- Super Regionals cannot begin until all 12 conference champions and 16 national entries exist.
- CWS cannot begin until eight Super Regional winners exist.
- Departures cannot begin until a national champion is persisted.
- Signing day cannot finalize twice.
- New season cannot start until all rosters pass health checks and next season’s schedule exists.

### Transaction and job behavior

Use a PostgreSQL advisory lock or persisted league lock, not only the current in-memory `Set`. For large work:

1. Create a `league_jobs` record.
2. Commit.
3. Process bounded batches with checkpoints.
4. Update progress and heartbeat.
5. Mark complete only after validation.
6. Resume safely after process restart.

The UI should poll the persisted job and display meaningful stages such as “Building rosters,” “Creating schedule,” “Generating recruiting class,” and “Validating universe.”

---

## 11. Performance plan for 149 teams

### Expected data volume per season

| Data | Approximate count |
|---|---:|
| Teams | 149 |
| Active players | 3,725 at 25/team |
| Regular games | 4,172 |
| Games per regular week | 298 |
| Initial national recruits | about 1,081 |
| Recruit top-school rows | about 5,400–8,600 |
| CPU recruiting teams | 148 in single-player |

### Required engineering changes

- Add `batchCreateGames()`.
- Add `batchCreatePlayers()`.
- Add batch progression/player update helpers.
- Fetch all league players once and group by team.
- Pass roster snapshots into `simulateGame` rather than re-querying both teams for every game.
- Use `p-limit` for game simulation and CPU systems; start with concurrency 8 and benchmark.
- Separate CPU calculation from persistence: compute results in memory, write in batches.
- Avoid per-recruit signing queries; group all interests by recruit.
- Paginate or summarize large API responses. Never send every box score on the league hub.
- Keep recruiting and roster tables virtualized.
- Add composite indexes for common full-season reads.

Recommended indexes to verify or add:

```sql
games (league_id, season, phase, week, is_complete)
games (league_id, season, home_team_id)
games (league_id, season, away_team_id)
players (league_id, team_id)
standings (league_id, season, team_id) UNIQUE
recruits (league_id, signed_team_id)
recruit_top_schools (recruit_id, team_id) UNIQUE
recruiting_interests (team_id, recruit_id) UNIQUE
postseason_entries (tournament_id, team_id) UNIQUE
postseason_series (tournament_id, stage, bracket_lane) UNIQUE
league_jobs (league_id, status)
```

### Performance gates

Use jobs so HTTP requests acknowledge within 2 seconds. Initial suggested internal targets:

- Full universe bootstrap: under 120 seconds in the production Replit environment
- Normal weekly simulation: under 30 seconds p95, executed as a job if it exceeds 10 seconds
- Full-season fast-forward: under 10 minutes in CI benchmark mode
- League hub cached response: under 500 ms server time
- No unbounded `Promise.all` over teams, games, recruits, or players
- Peak process memory under 1 GB during a full-week advance

Measure before changing these numbers; record benchmark hardware and database tier.

---

## 12. UI/UX plan

### Creation screen

Place two clear experience cards at the top:

1. **Full Season — Recommended**
   - All 149 programs
   - All 12 conferences
   - 56-game season
   - Conference Championships, Super Regionals, and CWS
   - Player progression on
   - In-app simulation/gameplay only

2. **Custom Dynasty**
   - Existing configurable league flow
   - Optional reported/Power Pros mode

Selecting Full Season should reduce setup to dynasty name, difficulty, user program, coach, and optional accessibility settings. Do not show locked switches that invite confusion.

### Program selection

Replace “select all 149 teams” with “choose the program you will coach.” All programs are already included. Support:

- search by school, mascot, state, or conference
- conference filter
- prestige and roster-strength sort
- favorites/bookmarks
- scouting card on focus

### Dynasty hub

Adopt a Portal-like hierarchy:

- **Needs attention:** lineup issue, recruiting action, injured/tired pitcher, advance blocker
- **Next up:** opponent, series, calendar, postseason status
- **Program pulse:** record, conference standing, ranking, development, recruiting class
- **National pulse:** top 25, major results, storylines, bubble/at-large projection
- **Quick actions:** roster, recruiting board, game plan, advance

Use summary cards that expand to existing detailed pages. A national universe should feel large without forcing the user to read 149 rows every week.

### Game-day interaction ladder

Expose four modes over time:

1. Quick Sim
2. Watch
3. Coach
4. Play

All four must consume the same authoritative simulation event stream. Only the presentation and decision points differ.

---

## 13. File-by-file implementation plan

### Work package A — rules and catalog foundation

Create:

- `shared/leagueRules.ts`
- `shared/catalog/conferences.ts`
- `shared/catalog/teams.ts`
- `shared/catalog/index.ts`

Modify:

- `shared/schema.ts`
- `server/routes.ts`
- `server/route-helpers.ts`
- `client/src/pages/league-create.tsx`
- `client/src/pages/team-selection.tsx`
- `server/rosterScaleFactors.ts`

Tasks:

1. Define `DynastyPreset`, `LeagueRulesSnapshot`, and Zod validation.
2. Move the 12-conference/149-team catalog into one module.
3. Serve `/api/catalog` with catalog version and derived counts.
4. Remove client-maintained conference/team totals.
5. Add `preset: "full_season"` creation path.
6. Keep legacy/custom requests backward-compatible.

### Work package B — schema and migration

Create migration `migrations/0028_full_season_foundation.sql`.

Add to `leagues`:

- `dynasty_preset text not null default 'custom'`
- `rules_version integer not null default 1`
- `rules_snapshot jsonb`
- `catalog_version text`
- `schedule_seed text`
- `current_phase_step text`

Add tournament and job tables described above.

Backfill existing leagues as `custom` using their current settings. Do not reinterpret existing saves as Full Season.

### Work package C — bootstrap service

Create:

- `server/services/fullSeasonBootstrap.ts`
- `server/services/leagueHealth.ts`
- `server/jobs/leagueJobRunner.ts`

Move Full Season creation out of one HTTP transaction. Checkpoints:

1. league created
2. 12 conferences created
3. 149 teams + standings created
4. 3,725-player roster target validated
5. CPU coaches created after human team selection
6. recruiting class generated
7. 4,172-game schedule generated
8. final health validation passed

Every checkpoint must be idempotent.

### Work package D — exact scheduler

Create `server/services/schedule/fullSeasonScheduler.ts` and unit-test it as a pure function before DB integration.

Modify:

- `server/recruit-engine.ts`
- `server/routes/league-mgmt.ts`
- `client/src/pages/commissioner/tabs/ScheduleHealthTab.tsx`
- season setup and transition callers

Add batch game insertion and exact Full Season validation. Preserve the current flexible generator for custom leagues until it can be migrated safely.

### Work package E — recruiting scale

Create `server/services/recruitPoolPlanner.ts`.

Modify:

- `server/utils.ts`
- `server/recruit-generator.ts`
- `server/recruit-engine.ts`
- `server/routes/simulation.ts`
- any test helper that embeds the 75/80 formula

Tasks:

1. Replace Full Season’s fixed cap with the roster-demand formula.
2. Generate position quotas from projected needs.
3. Scale non-generational rarity rules.
4. Load signing interests league-wide.
5. Batch progression and signing writes.
6. Guarantee 22–25 healthy players per team.

Keep `getRecruitPoolSize()` only for legacy/custom leagues or replace it with a rules-aware planner everywhere.

### Work package F — postseason engine

Create:

- `server/services/postseason/selection.ts`
- `server/services/postseason/conferenceChampionships.ts`
- `server/services/postseason/superRegionals.ts`
- `server/services/postseason/cws.ts`
- `server/services/postseason/invariants.ts`

Delete or retire the current fixed-stage `processDoubleElim()` after parity tests pass. Do not patch it with more conditionals.

Modify postseason API/UI:

- `server/routes/postseason.ts`
- `client/src/pages/postseason-hub.tsx`
- `client/src/pages/commissioner/components/PostseasonBracket.tsx`
- `client/src/pages/championship-screen.tsx`
- league history and archive views

### Work package G — advance engine extraction

Create:

- `server/services/advance/advanceLeagueStep.ts`
- `server/services/advance/transitions.ts`
- `server/services/advance/simulateUntil.ts`
- `shared/phase.ts`

Modify:

- `server/routes/simulation.ts`
- `server/storyline-routes.ts`
- `client/src/pages/commissioner/helpers/phaseHelpers.ts`
- all fast-forward endpoints

Centralize season weeks, phase labels, storyline slots, side effects, and preconditions.

### Work package H — Full Season UX and enforcement

Modify:

- `client/src/pages/league-create.tsx`
- `client/src/pages/team-selection.tsx`
- `client/src/pages/league-setup.tsx`
- `client/src/pages/league-view/**`
- `client/src/pages/commissioner/tabs/SettingsTab.tsx`
- report-game routes and navigation

Hide reported-game features and reject reported-game API calls for Full Season. Make the normal user flow single-player and program-centric, not commissioner-centric.

### Work package I — performance refactor

Modify:

- `server/storage.ts`
- `server/routes/simulation.ts`
- `server/game-engine.ts`
- `server/game-finalizer.ts`

Add batch methods, roster snapshots, bounded concurrency, persisted job state, and metrics.

---

## 14. Test and verification specification

### Unit tests

Create:

- `tests/unit/fullSeasonRules.test.ts`
- `tests/unit/catalogIntegrity.test.ts`
- `tests/unit/fullSeasonScheduler.test.ts`
- `tests/unit/recruitPoolPlanner.test.ts`
- `tests/unit/postseasonSelection.test.ts`
- `tests/unit/superRegionalSeries.test.ts`
- `tests/unit/cwsDoubleElimination.test.ts`
- `tests/unit/phaseTransitionsFullSeason.test.ts`

Required assertions:

#### Catalog

- 12 conferences
- 149 unique teams
- expected per-conference counts
- no duplicate names or abbreviations
- every team has a roster source or explicit fallback

#### Rules

- Full Season always resolves to 149 teams, 12 conferences, 14 weeks, 56 games, progression on, in-app game source
- conflicting client overrides are rejected
- saved rules snapshot round-trips

#### Schedule

- exactly 4,172 regular games
- every team exactly 56 games
- every team exactly four games in each of weeks 1–14
- no self-game
- no same-day double booking
- conference games occur in three-game series
- OOC games cross conferences
- home/away within configured tolerance
- deterministic output for a fixed seed
- different season seed rotates opponents

#### Recruiting

- 149-team pool is at least the calculated demand
- illustrative initial default is approximately 1,081, subject to actual roster forecast
- every position group meets forecast + buffer
- class ranks are contiguous and unique
- top schools have valid team IDs
- generational counts follow national rules
- regular rarity rates remain within tolerance

#### Postseason

- 12 unique conference champions
- 16 unique national entries
- 12 automatic bids + 4 at-large bids
- eight Super Regional series
- every series ends in two or three games
- exactly eight CWS entries
- no CWS team is eliminated before its second loss
- exactly two bracket winners
- final ends in two or three games
- exactly one champion and runner-up
- no entrant disappears from a bracket

### API/integration tests

Create `tests/e2e/full-season-149.test.ts` with a special test-data path that skips media and story generation only when those systems are not under test.

Assertions after bootstrap:

```text
league.preset = full_season
league.progressionEnabled = true
league.gameMode = simulated
conferences = 12
teams = 149
players = 3,725 when all rosters are normalized to 25
regular games = 4,172
recruits >= recruit planner requirement
health status = pass
```

Assertions after one complete season:

- all 4,172 regular games complete exactly once
- standings contain exactly 56 decisions per team before postseason
- 12 conference champions stored
- Super Regionals and CWS complete
- champion stored in history
- all returning eligible players progressed once
- next recruiting class meets demand
- next season schedule has 4,172 games
- every roster is 22–25 with viable position depth
- no duplicate team, player, recruit signing, game, series, award, or history row

### Multi-season soak

Nightly or manual benchmark, not every pull request:

- advance five Full Season years
- verify every phase sequence
- verify roster sizes and position health each year
- verify progression distribution by potential
- verify class-size demand and signing completion
- verify schedules rotate
- verify histories accumulate without overwrite
- verify no job is stuck or duplicated
- record time, query count, and peak memory per phase

### Failure-recovery tests

At least once each, terminate the process during:

- team bootstrap
- roster generation
- schedule insertion
- weekly game simulation
- signing day
- postseason series creation

Restart and resume. Final counts must match a clean run with no duplicates.

### Existing tests to repair

- Replace embedded recruit-count formulas with the rules-aware planner.
- Rename the current `tests/smoke/02-full-season.spec.ts`; it is a multi-season small-league smoke test, not the new Full Season preset.
- Strengthen phase tests to assert bracket membership and completion, not only that a phase name appeared.
- Add exact schedule-count assertions; current soft health tolerances are insufficient for the preset.

### Commands Replit must run

```bash
npm ci
npm run check
npx playwright test tests/unit
npx playwright test tests/e2e/full-season-149.test.ts
npm run test:smoke
npm run test:full-season-soak
npm run benchmark:full-season
npm run build
```

Add the last two scripts to `package.json`.

---

## 15. Acceptance criteria / definition of done

Full Season is complete only when all items below are true.

### Creation

- [ ] A visible Full Season option exists.
- [ ] Creation requires no manual conference or league-team selection.
- [ ] All 149 canonical teams and all 12 conferences are created exactly once.
- [ ] User chooses one team to coach.
- [ ] Remaining teams have CPU coaches.
- [ ] Progression is on and cannot be disabled for this preset.
- [ ] Reported/Power Pros mode is unavailable in UI and API.

### Schedule

- [ ] Each team has exactly 56 official regular-season games.
- [ ] Exactly 4,172 regular games exist.
- [ ] Exactly 14 regular weeks exist.
- [ ] Every team has four games per week.
- [ ] No exhibition result affects official standings.
- [ ] No postseason result affects regular-season standings.
- [ ] Schedule health passes exact invariants.

### Postseason

- [ ] Each conference crowns one champion.
- [ ] National field contains 12 champions and four at-large teams.
- [ ] Eight best-of-three Super Regionals produce eight winners.
- [ ] Eight-team CWS double-elimination brackets produce two finalists.
- [ ] Best-of-three final produces one champion.
- [ ] All games, series, seeds, and reasons are visible in UI/history.

### Recruiting and progression

- [ ] Recruit pool is calculated from national roster demand.
- [ ] Position supply supports every team’s projected needs.
- [ ] CPU teams can build valid rosters without consuming recruits twice.
- [ ] Human team always has a valid walk-on recovery path.
- [ ] Every returning eligible player progresses exactly once.
- [ ] New season does not begin until all 149 rosters pass health checks.

### Reliability

- [ ] Normal advance and every fast-forward option call the same transition service.
- [ ] Advance and bootstrap jobs survive restart.
- [ ] Duplicate requests are idempotent.
- [ ] Five-season scale soak passes.
- [ ] Performance targets and query counts are recorded.
- [ ] Production build succeeds.

---

## 16. Recommended delivery sequence

### Milestone 0 — lock the rules

Before coding, approve:

- 149 as the current catalog size
- 14 weeks × 4 games = 56
- no exhibitions in Full Season
- 12 conference champions + four at-large teams
- eight best-of-three Super Regionals
- eight-team CWS and best-of-three final
- approximately 1,081 initial recruits, adjusted by forecast

### Milestone 1 — catalog, preset, and bootstrap

Deliver the preset, canonical catalog, DB migration, background job, all teams, rosters, recruits, and health report. Do not expose the option publicly until schedule and postseason work lands.

### Milestone 2 — exact 56-game scheduler

Deliver pure scheduler tests, batch persistence, schedule health, rotation, and full-universe benchmark.

### Milestone 3 — postseason replacement

Deliver selection, series engine, CWS brackets, UI, history, and retry tests.

### Milestone 4 — authoritative advancement

Extract one transition engine and route all normal and fast-forward actions through it. Run one- and five-season scale tests.

### Milestone 5 — flagship UX

Deliver simplified setup, program picker, decision hub, national pulse, advance progress, and actionable health messages.

### Milestone 6 — Steam technical alpha

Package the game, implement local saves and recovery, controller/keyboard navigation, Steam Cloud, achievements, crash reporting, and an internal alpha branch.

---

## 17. Steam roadmap

The current application depends on a hosted Express/PostgreSQL stack and session authentication. That can power the web version, but a flagship single-player Steam game should not require a live Replit server to open a dynasty.

### Recommended desktop path

1. Keep React/TypeScript as the UI.
2. Use Electron for the first desktop alpha because the existing Node/Express code can be reused more directly than with a Rust-based shell.
3. Introduce a storage interface that supports:
   - hosted PostgreSQL for web/multiplayer
   - embedded SQLite for local single-player saves
4. Treat a dynasty as a versioned save database with migration support.
5. Add automatic rolling backups and manual save slots.
6. Sync closed save files through Steam Cloud.
7. Add Steam achievements and, later, Workshop support for fictional rosters, logos, leagues, and rules packs.

Official references: [Steam Cloud](https://partner.steamgames.com/doc/features/cloud), [Steam stats and achievements](https://partner.steamgames.com/doc/features/achievements?l=english&language=english)

Do not make desktop packaging part of the first Full Season correctness milestone. First make the universe deterministic, resumable, and storage-agnostic.

---

## 18. Future playable/watch/coach engine

### Core principle

Build one deterministic, headless baseball engine and place multiple experiences on top of it. Do not maintain a quick-sim engine and a separate playable engine that produce different baseball worlds.

### Engine layers

```text
Rules + player ratings + strategy
            ↓
Seeded simulation state machine
            ↓
Pitch / plate-appearance / fielding event log
            ↓
Stats + fatigue + injuries + result
            ↓
Quick Sim | Watch | Coach | Play renderers
```

### Required engine properties

- deterministic RNG seed per game
- versioned rules and event schema
- replayable event log
- pure or mostly pure state transitions
- no database calls inside pitch resolution
- same result whether events are animated or consumed instantly
- substitution, bullpen, fatigue, handedness, lineup, steal, bunt, and tactical hooks
- calibration suite for run environment and player-rating impact

### Release ladder

#### 1. Watch mode

Use existing simulation results to drive an original pixel presentation. Start with pitch location, swing/contact result, ball trajectory, runners, fielders, scoreboard, and text commentary. This is the lowest-risk way to prove the renderer and event stream.

#### 2. Coach mode

Pause at decisions:

- pitching changes
- defensive alignment
- pitch-around/intentional walk
- bunt, steal, hit-and-run
- pinch hitter/runner
- bullpen warm-up and fatigue risk

#### 3. Play mode

Add player input only after Watch and Coach use the same event engine reliably:

- batting timing and aim
- pitch selection, aim, and execution
- baserunning decisions
- assisted fielding first, manual fielding later

### Calibration targets

For thousands of seeded games, track:

- runs/game and run distribution
- hit, walk, strikeout, home-run, error, steal, and extra-base-hit rates
- starter innings and bullpen usage
- home advantage
- stronger-team win probability by rating gap
- platoon effect
- fatigue and rest effect
- season leader distributions

Persist the engine version on every game so old saves and replays remain understandable after balance patches.

---

## 19. Commercial and licensing gate

This is a product risk, not a later polish task.

The repository contains real school/conference identities and real 2026 player rosters. Before charging money or publishing a Steam page that uses those identities:

1. Obtain qualified games/IP counsel.
2. Inventory every school name, mascot, abbreviation, color treatment, logo, conference mark, NCAA/championship term, real player name/likeness, photo, music track, sound, font, and imported asset.
3. Determine what is licensed, what must be removed, and what can be replaced.
4. Contact applicable collegiate licensing bodies and schools if pursuing an officially licensed product.
5. Handle player name/image/likeness rights separately from school marks.

The NCAA states that use of its name or logo on a product or in advertising requires a license, and CLC operates licensing processes for collegiate institutions and conference/event marks.  
Sources: [NCAA Brand and Licensing](https://www.ncaa.org/championships/brand-licensing/), [CLC licensing](https://clc.com/home/get-licensed/)

If licenses are not feasible, the safest product path is:

- ship a fully fictional universe by default
- provide robust team/league/roster editors
- support user-created data packs through a reviewed mod workflow
- do not bundle unlicensed real-world marks or player data

This section is risk identification, not legal advice.

---

## 20. Instructions to give Replit

Use the following as the implementation brief:

> Implement the Full Season preset described in `FULL_SEASON_FLAGSHIP_PLAN.md` in dependency order. Do not treat it as a frontend-only season-length option. First centralize league rules and the 149-team/12-conference catalog. Add a versioned rules snapshot and idempotent bootstrap job. Then implement an exact 14-week, 56-game-per-team scheduler producing 4,172 regular games. Replace Full Season recruiting’s fixed cap with roster-demand planning. Replace the current national bracket with 12 automatic bids + four at-large bids, eight best-of-three Super Regionals, and an eight-team double-elimination CWS followed by a best-of-three final. Finally route all normal and fast-forward actions through one transition engine. Full Season must force progression on and in-app simulation only. Add the unit, E2E, recovery, soak, and benchmark tests in this document. Do not mark the task complete until exact counts, five-season continuity, idempotency, and the production build pass.

### Required Replit reporting after each work package

Replit should return:

1. Files changed
2. Migration applied
3. Tests added
4. Commands run and exact results
5. Full Season counts observed
6. Timing and query metrics
7. Known deviations from this plan
8. Screenshots of creation, program selection, schedule health, Super Regionals, and CWS

### Stop conditions

Replit must stop and report rather than paper over any of these:

- canonical catalog does not resolve to 149 valid rosters
- scheduler cannot give every team exactly 56 games
- recruiting demand exceeds operational assumptions
- postseason loses or duplicates an entrant
- any advance path produces different side effects
- a failed job cannot resume without duplicates
- commercial assets lack a documented rights status

---

## 21. Final recommendation

Proceed with Full Season, but make correctness and scale the feature. The strongest version of this game is not “the current custom league with more teams.” It is a living national college-baseball universe in which the player can understand today’s decisions, trust every simulated result, follow stories for decades, and eventually experience the same game by simming, watching, coaching, or playing.

The immediate flagship threshold is:

> One click creates a valid 149-team universe; every team plays exactly 56 official games; all 12 conferences crown champions; a deterministic 16-team national field produces eight Super Regional winners and one CWS champion; progression and recruiting sustain every roster for at least five verified seasons; and the entire experience runs inside the game without Power Pros.

