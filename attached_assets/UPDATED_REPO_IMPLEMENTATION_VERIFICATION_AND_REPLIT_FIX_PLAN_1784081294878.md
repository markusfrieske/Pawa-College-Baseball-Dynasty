# Updated Repository Verification and Replit Fix Plan

**Repository audited:** `Pawa-College-Baseball-Dynasty-main.zip`  
**ZIP supplied:** July 14, 2026  
**Scope:** Full Season (149 teams), 14-team multiplayer custom leagues, League Hub, Game Prep, pitcher rest, school/player navigation, team logos, Storyline Hub, commissioner editing, typography, player progression, regression, and archetypes.

This document supersedes the earlier League Hub, rest, logo, progression, and typography proposals where the updated repository now contains implemented work.

---

## 1. Executive verdict

The update contains substantial real implementation—not just placeholders. The new typography system and commissioner school/player editor are broadly in place, and the player archetype architecture is much farther along than before.

However, the update is **not ready for a long-running Full Season dynasty**. Three simulation defects are release blockers:

1. V3 regression currently cannot change any rating.
2. Existing V1/V2 players can receive both legacy and V3 development during the migration offseason.
3. Game Prep's pitcher-rest result is not the authoritative plan used by the game simulation and box score.

Most of the requested League Hub redesign also remains unfinished: Quick Access still sits below national content, Power Rankings and National Pulse still duplicate the same data, the commissioner School tile can be a self-link, actual team logo support does not exist, Game Prep remains narrow, and Storyline Hub remains constrained to `max-w-lg`.

### Status summary

| Area | Verdict | Notes |
|---|---|---|
| Global typography cleanup | **Pass** | Self-hosted Inter, Barlow Semi Condensed, and IBM Plex Mono are present and wired into semantic tokens. Runtime pixel-font usage has been removed. |
| Commissioner school editing | **Mostly pass** | Identity and competitive edits, optimistic versioning, reasons, audit batches, history, and reversal exist. Logo upload is absent. |
| Commissioner player editing | **Mostly pass** | Identity and rating editing exists with audit/history behavior. Focused endpoint tests are absent. |
| League Hub weekly summary | **Partial** | `ThisWeekPanel` was added, but overlaps with existing readiness/advance panels. |
| League Hub priority/order | **Fail** | Quick Access remains below rankings, prospects, and National Pulse. |
| Power Rankings vs. National Pulse | **Fail** | Both query `/power-rankings`; the second panel repeats the first. |
| National “bubble” | **Fail** | It is ranks 6–12 filtered by overall percentile, not a postseason bubble model. |
| School navigation | **Partial** | Assigned-team route works; commissioner/no-team state can link back to the current League Hub. |
| Clickable school/player names | **Fail/partial** | Some ranking/recruit links work, but standings, leaders, Game Prep starters/batters, and several school names remain plain text. |
| Actual team logos | **Fail** | No logo schema/storage/editor field exists. Current “badges” are abbreviation circles. |
| Storyline Hub width | **Fail** | Desktop header and body are still `max-w-lg`. |
| Game Prep layout | **Fail** | Still `max-w-2xl` and a narrow, phone-first stack. |
| Pitcher rest presentation | **Partial** | Shared availability calculations and UI labels exist. |
| Pitcher rest simulation enforcement | **Critical fail** | Starter selection is repeated inconsistently; suggested IP caps and reliever rest are not enforced. |
| Archetype definitions/data model | **Pass with defects downstream** | 24 archetypes, development caps/seeds/version fields, and player-profile display exist. |
| Potential-scaled progression | **Partial** | V3 growth budgeting exists, but migration, regression, and pitch-mix defects make season results unsafe. |
| Full Season and 14-team regression suite | **Not proven** | No focused automated coverage found for these high-risk paths. |

---

## 2. Stop-ship defects

Replit should fix and test these before continuing the visual redesign.

### P0-1: Regression points are calculated but can never be allocated

**Files:**

- `server/services/playerDevelopment/allocateGrowth.ts`
- `server/services/playerDevelopment/computeGrowthBudget.ts`

`allocateRegressionPoints()` calls `buildWorkAttrs(archetypeId, currentRatings, {})`. `buildWorkAttrs()` treats a missing cap as zero and skips every attribute whose cap is zero. Passing an empty cap object therefore produces an empty eligible set, so every regression result is `{}`.

This means low-potential players, declining players, and any player assigned a negative budget do not actually regress.

#### Required correction

Create a separate regression work-set builder. Regression eligibility must not depend on upward-development caps.

Suggested contract:

```ts
type RegressionContext = {
  archetypeId: PlayerArchetypeId;
  currentRatings: PlayerRatings;
  floorRatings?: Partial<PlayerRatings>;
  ageOrClass?: string;
};

allocateRegressionPoints(
  points: number,
  context: RegressionContext,
  rng: SeededRng,
): RatingDeltaMap;
```

Rules:

- Only regress attributes currently above their configured floor.
- Use archetype regression resistance to make core attributes less likely to fall, not immune.
- Non-core attributes may regress more often.
- Apply negative deltas only.
- Clamp final ratings to the global rating floor and never below a position-specific playable floor.
- Preserve deterministic output for the same player, season, and development seed.

#### Minimum tests

- A C-potential upperclassman with a negative budget loses at least one eligible rating.
- An A+-potential player does not regress under normal positive-development conditions.
- Core archetype attributes regress less frequently than non-core attributes across a seeded sample.
- Regression never produces a positive delta or a rating below the floor.
- Same seed and season produce identical deltas.

### P0-2: Existing players can progress twice during the V3 migration offseason

**File:** `server/routes/simulation.ts`

The offseason flow currently:

1. Runs legacy progression for players who are not V3.
2. Migrates those players to V3.
3. Refetches the roster.
4. Runs V3 development for the newly migrated players because they have no `lastDevelopmentSeason` marker.

An existing dynasty entering its first V3 offseason can therefore receive both legacy and V3 gains. In a 149-team league, this can inflate thousands of players in a single advance and permanently damage competitive balance.

#### Required correction

Perform migration before selecting any progression engine, then run exactly one engine per player.

Preferred flow:

```text
load active players
  -> migrate all old-model players to V3 metadata
  -> persist migration in one transaction/batched transactions
  -> reload/normalize players
  -> filter out players already developed for this season
  -> run V3 once
  -> write deltas + lastDevelopmentSeason atomically
```

Remove the legacy progression pass from the normal offseason advance after the V3 migration is available. If legacy saves must remain supported, make migration a dedicated idempotent step—not a second progression step.

#### Required safeguards

- Unique logical key: `(playerId, season, developmentModelVersion)` for a development event.
- `lastDevelopmentSeason` must be updated in the same transaction as rating deltas.
- Retrying an interrupted offseason must not apply gains twice.
- Log counts for migrated, developed, skipped-as-already-processed, and failed players.

#### Minimum tests

- V1 player entering migration receives one and only one season delta.
- V3 player receives one and only one season delta.
- Retrying the same offseason produces no further changes.
- Mixed V1/V2/V3 roster is handled in one advance without double application.
- Test on both a 149-team fixture and a 14-team fixture.

### P0-3: Pitcher rest shown in Game Prep is not enforced by simulation

**Files:**

- `shared/pitcherRest.ts`
- `server/game-engine.ts`
- `server/routes/simulation.ts`
- `client/src/pages/game-prep.tsx`

The repository has a useful shared rest calculator, but the game pipeline does not use one authoritative pitching plan.

Observed problems:

1. Simulation chooses an available starter for team-strength calculations.
2. `generateBoxScore()` independently chooses a starter again by roster role.
3. The second choice can be a different, unavailable pitcher.
4. `suggestedMaxIP` is displayed but not passed into or enforced by the box-score innings allocator.
5. Relievers are selected in fixed order without authoritative availability checks.
6. The normal box-score call does not supply meaningful `pitcherFatigueIn`, so the bullpen fatigue path is usually inactive.
7. `server/game-engine.ts` can store the literal fallback `"midweek"` in `lastPitchedDay`, while the shared rest model only accepts `WED | FRI | SAT | SUN`. This can produce invalid/`NaN` rest calculations.

#### Required correction: one `PitchingPlan`

Introduce a server-owned service used by Game Prep, score simulation, box-score generation, and appearance finalization.

```ts
type GameSlot = "WED" | "FRI" | "SAT" | "SUN";

type PlannedPitcher = {
  playerId: number;
  role: "starter" | "reliever" | "emergency";
  availability: "available" | "limited" | "unavailable";
  maxOuts: number;
  fatiguePenalty: number;
  reason: string;
};

type PitchingPlan = {
  gameId: number;
  teamId: number;
  slot: GameSlot;
  starter: PlannedPitcher;
  bullpen: PlannedPitcher[];
  warnings: string[];
};
```

Required behavior:

- Compute the plan once per team/game.
- Pass the exact selected starter to team-strength and box-score generation.
- Allocate innings as outs and never exceed each pitcher's `maxOuts`.
- Use only available relievers until no valid option remains.
- If the roster is exhausted, use a clearly identified emergency pitcher with a severe performance/injury/fatigue penalty.
- Persist appearances and workloads only after the game is finalized.
- Store canonical `GameSlot` values. Unknown game types must throw/log and use an explicit safe conversion—not store `"midweek"` as a slot.
- For full-week simulation, process games chronologically and update appearance state after every game. Wednesday results must affect Friday; Friday must affect Saturday; Saturday must affect Sunday.

An appearance ledger is safer than only storing the last pitched day:

```text
pitcher_appearances
- id
- league_id
- season
- game_id
- player_id
- game_slot
- game_date_or_week_ordinal
- outs_recorded
- pitches_estimated
- role
- finalized_at
```

Game Prep should call the same service in read-only preview mode. The UI should never promise “RESTED” or “Max this game: 7 IP” unless the simulator will honor it.

#### Minimum tests

- Starter throws Wednesday and is limited/unavailable Friday according to the configured model.
- Friday starter cannot be silently chosen again Saturday by `generateBoxScore()`.
- Suggested seven-inning cap results in at most 21 outs.
- Reliever workload carries into the next game.
- Whole-week simulation and one-game-at-a-time simulation produce the same eligibility decisions from the same seed/state.
- Invalid `gameType` never stores an invalid rest slot.
- Simulate a representative 56-game season without a team repeatedly using an unavailable pitcher.

### P0-4: Pitch-mix development budget is unused

**Files:**

- `server/services/playerDevelopment/computeGrowthBudget.ts`
- `server/services/playerDevelopment/runSeasonDevelopment.ts`
- `server/services/playerDevelopment/allocateGrowth.ts`

`computeGrowthBudget()` calculates `pitchMixPoints`, but `runSeasonDevelopment()` never consumes that value. General growth allocation explicitly skips `pitchMix`. Pitcher archetypes therefore cannot deliver their advertised pitch-development behavior.

#### Required correction

- Allocate `pitchMixPoints` only across pitches already in the player's repertoire unless a separate, rare “learn new pitch” event is intentionally implemented.
- Weight pitch growth by archetype; e.g. power pitchers favor velocity/breaking strengths, command artists favor control/command-related pitch quality.
- Set a per-pitch seasonal limit and a total pitch-mix limit.
- Include pitch-mix changes in the development report and audit event.
- Add deterministic tests for a power pitcher, command pitcher, and two-way player.

---

## 3. League Hub redesign still required

### Current source findings

`client/src/pages/league-view.tsx` still renders the major sections in this order:

1. Weekly/advance cockpit
2. Needs-attention and team panels
3. Stats leaders
4. Power Rankings
5. Top Prospects
6. Full National Pulse
7. Navigation dock

This leaves the requested navigation cards below large national-data panels. `NavDock` also uses a nine-column desktop grid, creating cramped tiles and uneven scanning.

### Required information hierarchy

Render the page in this order:

1. **This Week / Advance**
2. **Primary Quick Access**
3. **Needs Attention**
4. **Next Game / Game Prep**
5. **Program snapshot**
6. **League newsroom**
7. **One national snapshot**
8. **Secondary tools / records / archives**

### 3.1 Consolidate the top-of-page action area

`ThisWeekPanel`, `WaitingOnWidget`, and `PrimaryPhaseCTA` overlap conceptually. Replace them with one responsive `LeagueCommandCenter` component.

It should contain:

- Current season, week, phase, and next advance.
- Human readiness count for multiplayer leagues.
- Clear blocking actions with deep links.
- One primary Advance CTA, commissioner-only when appropriate.
- Next opponent and Game Prep link during the regular season.
- Compact NIL/recruiting/roster warnings when actionable.

For a single-player Full Season dynasty, hide meaningless multiplayer readiness copy. For a 14-person league, show `12/14 Ready`, the two outstanding coaches, and commissioner override rules.

### 3.2 Put primary navigation immediately below Advance

Use six primary cards in a responsive grid:

1. Team/School
2. Roster
3. Lineup
4. Schedule
5. Recruiting
6. Game Prep or Storylines, depending on phase

Use `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`. Do not use nine compressed columns.

Move Coach, Commits, Stats, Record Book, Archive, Postseason, and Commissioner into a clearly labeled secondary grid or `More` section. Commissioner should only appear for authorized users.

### 3.3 Remove rankings duplication

Both `NationalPulsePanel` and `PowerRankingsWidget` query `/power-rankings`. Keep only one Hub component.

Recommended replacement: `NationalSnapshot` with three distinct modules:

- Top 10 power rankings.
- Biggest movers this week.
- Postseason outlook only when the selection model has meaningful data.

Before postseason-resume/selection data exists, label the third module **Next 10** or **Teams to Watch**, not **Bubble**.

The present “Bubble” calculation—ranking positions 6–12 filtered by overall percentile—is not a bubble model. A true bubble needs, at minimum:

- Overall and conference record.
- RPI/strength of schedule or the game's equivalent.
- Automatic-bid status.
- Projected regional seed or at-large cutoff.
- Quality wins/bad losses.
- A transparent selection score or probability.

### 3.4 Remove raw abbreviations from visual team marks

The small quick-nav matchup in `ThisWeekPanel` still prints opponent abbreviations. Once real logo support is added, use `TeamMark` there and in all ranking, standings, schedule, matchup, and leader surfaces.

Abbreviations remain acceptable in compact textual contexts, accessible labels, export files, and fallback text. They should not be the primary visual identity when a logo exists.

---

## 4. School route and entity-link system

### 4.1 Fix the School tile for commissioner/no-team users

The School tile correctly links to `/league/:leagueId/team/:teamId` when the user has a team. When there is no assigned user team, it links back to the League Hub itself, which appears broken.

Implement a league-wide school directory:

```text
/league/:leagueId/schools
/league/:leagueId/team/:teamId
```

Routing rules:

- Assigned coach: `School` opens their school profile.
- Commissioner without a team: `Schools` opens the directory.
- Spectator: `Schools` opens the directory.
- Never use the current League Hub URL as the School fallback.

Also make Coach, Roster, and Lineup persona-aware. Do not route a commissioner without an assigned team into a personal-team page that cannot resolve.

### 4.2 Create canonical reusable entity links

Implement:

- `TeamLink`
- `PlayerLink`
- `CoachLink`
- `RecruitLink`
- `TeamMarkLink`

Each should handle league ID, entity ID, hover/focus states, keyboard access, truncation, and event propagation when embedded inside a larger clickable row.

Replace plain text in at least:

- Standings preview team names.
- Stats leaders player and team names.
- League Hub school/team lists.
- Game Prep team names.
- Game Prep probable starters.
- Opponent lineup threats.
- Bullpen pitcher names.
- National and conference tables.
- Schedule and results rows.

Acceptance rule: if a visible school or player name represents a persisted entity and the current page has enough IDs to resolve it, it should be navigable.

---

## 5. Real team logo system

The current `TeamBadge` is a colored circle containing an abbreviation. No team-logo column, asset key, migration, uploader, or image renderer exists.

### 5.1 Data model

Add fields such as:

```text
teams.logoAssetKey nullable
teams.logoVersion nullable/default 0
teams.logoUpdatedAt nullable
```

Prefer a controlled asset key over an unrestricted external URL. If remote URLs are allowed, enforce HTTPS, an image MIME allowlist, size limits, and safe proxy/storage behavior.

### 5.2 Upload and commissioner editor

Add logo management to the existing League Editor:

- PNG, WebP, or SVG only.
- Transparent background supported.
- Validate MIME type and actual file signature.
- Enforce maximum byte and dimension limits.
- Create normalized sizes for table, card, header, and high-DPI use.
- Preview on light and dark backgrounds.
- Allow reset to generated fallback.
- Record upload/reset in commissioner audit history.

### 5.3 Replace `TeamBadge` with `TeamMark`

```ts
type TeamMarkProps = {
  team: Pick<Team, "id" | "name" | "abbreviation" | "primaryColor" | "secondaryColor" | "logoAssetKey">;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  shape?: "contain" | "circle" | "square";
  decorative?: boolean;
};
```

Fallback order:

1. Valid uploaded logo.
2. Bundled/default school logo if available.
3. Generated color badge with abbreviation.
4. Neutral baseball fallback.

The image needs meaningful `alt` text when it is the only school identifier. It should use empty alt text when the adjacent school name already identifies the team.

### 5.4 Migration strategy

Do not break existing dynasties. New logo columns must be nullable and all UI must preserve the generated abbreviation fallback until a real logo is available.

---

## 6. Game Prep desktop redesign

The page remains constrained to `max-w-2xl`, including its skeleton, header, and content. It reads as a narrow companion view instead of the app-only flagship experience requested for Full Season.

### Required layout

Use `max-w-6xl` or the shared application content container.

Desktop:

```text
Game header / matchup identity / date / venue

Main column (8)                     Side rail (4)
-------------------------------     ----------------------------
Matchup meter                       Availability / rest summary
Probable starters                   Weather/park/context if used
Opponent lineup threats             Action links
Bullpen availability
Tactical notes
```

Tablet and mobile collapse to one column.

### Alignment requirements

- Give both team identity blocks the same grid columns and baseline.
- Use a fixed label column for matchup metrics.
- Align left/right values by tabular numerals.
- Give both starter cards identical header/min-height structure.
- Keep rating labels on one baseline and avoid hand-tuned spacer margins.
- Long school/player names must truncate or wrap deliberately without shifting the opposing card.
- Use actual team logos through `TeamMark`.

### Rest presentation

Display server-derived state from the authoritative `PitchingPlan`:

- Rested / Limited / Unavailable.
- Maximum innings or outs.
- Last appearance and workload.
- Why the limit exists.
- Emergency-pitching warning if applicable.

Remove companion-product language and assumptions. Full Season must be completely playable and understandable inside this app.

---

## 7. Storyline Hub responsive redesign

`client/src/pages/storylines.tsx` still applies `max-w-lg` to the sticky header and content area. This creates the large unused desktop region seen in the screenshot.

### Required layout

- Shared `max-w-6xl` container.
- Desktop 12-column grid.
- Story cards/feed: 8 columns.
- Filter/status rail: 4 columns.
- On smaller screens, stack the rail above the feed or use a drawer.

Suggested sidebar content:

- Vote counts and deadlines.
- Open/signed/done filters.
- Story types.
- Team/conference filter.
- Stakes legend.
- Recently resolved arcs.

Keep individual story choices readable; do not stretch paragraph lines across the entire screen. The outer page should use the width, while text inside a story card should retain a sensible reading measure.

---

## 8. Commissioner editor follow-up work

The editor implementation is a strong foundation. Preserve its role checks, version checks, reason fields, effective-season controls, and audit/reversal behavior.

Add or verify:

1. Logo upload/reset and audit events.
2. `stadiumName` in the client-side `EditorTeam` interface if omitted.
3. Archetype editing with validation against position-eligible archetypes.
4. Potential/archetype edits trigger an intentional cap policy:
   - Recalculate future development caps, or
   - Preserve established caps and show the commissioner that the edit changes future budget only.
5. Player edits never implicitly run development.
6. Reversal restores all values from one batch atomically.
7. Competitive edits cannot bypass scheduled/effective-season rules through direct API calls.

### Focused endpoint tests

- Non-commissioner gets 403.
- Wrong league/entity association gets 404/403.
- Stale `editorVersion` gets 409.
- A successful edit creates one batch and the expected field changes.
- Reverse restores the prior values and creates a reversal audit record.
- Identity edits can be immediate.
- Competitive edits obey effective-season policy.
- Logo upload rejects invalid type, oversized files, SVG scripts/external references, and cross-league access.

---

## 9. Progression/archetype balance after correctness fixes

Do not tune outcome percentages until the P0 development defects are fixed. Otherwise the calibration dataset will be contaminated.

### Recommended seasonal targets

Use these as starting telemetry targets, not hard-coded guarantees:

| Potential | Typical underclassman total OVR movement | Design intent |
|---|---:|---|
| A+ | +4 to +8 | Rare stars; archetype core growth is clearly visible. |
| A / A- | +3 to +6 | High-end development with some variance. |
| B range | +1 to +4 | Reliable but not automatic starters. |
| C range | -1 to +2 | Plateau risk; coaching/context matters. |
| D/F | -3 to +1 | High bust/regression risk. |

Senior/late-career behavior can be flatter, but class year should not overpower potential, coaching, facilities, work ethic, and playing opportunity.

### Archetype identity rules

- Roughly 55–70% of positive rating points should go to primary/core attributes.
- Roughly 20–35% should go to supporting attributes.
- At most 10–15% should be true off-archetype surprise growth.
- Development caps prevent all A+ players from becoming identical 99-rated athletes.
- A `Speedy Slugger` outfielder should visibly favor speed and power, while hit/field/arm can improve more slowly.
- Regression should erode non-core attributes somewhat faster, while no attribute is permanently protected.
- Two players with the same potential/archetype must still diverge through caps, seed, work ethic, coaching, playing time, injuries if modeled, and controlled variance.

### Required telemetry

Create a development diagnostics command/report for QA that outputs:

- Player counts by position, class, potential, and archetype.
- Average/median OVR delta by potential and archetype.
- Rating deltas by attribute and archetype.
- Percentage improving, flat, and regressing.
- Cap-hit rate.
- Pitch-mix delta rate.
- Model-version and double-application count.
- Team/conference distribution for 149-team and 14-team runs.

Run at least 25 seeded multi-season simulations for each league size before final tuning.

---

## 10. Full Season and 14-team multiplayer compatibility requirements

Every change must be validated in both modes. Avoid separate game rules unless the product deliberately exposes them as settings.

### Full Season, 149 teams

Verify:

- All weekly games are processed chronologically for pitcher rest.
- Advance operations complete within an acceptable server time and can resume safely after failure.
- Development runs once for every eligible player.
- Recruiting pool replenishment remains sufficient after roster turnover.
- National Snapshot queries are paginated/cached and do not render 149 heavy rows on the Hub.
- Commissioner school/player search handles the full dataset.
- School logos and profiles resolve for every team.

### Custom 14-team multiplayer

Verify:

- Human readiness and commissioner override remain visible and correct.
- No single-player copy such as “All ready” is shown without human-coach context.
- Team/School routes reflect each signed-in coach's assignment.
- Commissioner-only editing cannot be reached or called by coaches.
- Advancing cannot double-process when two users submit near-simultaneously.
- Rest state and results are server-authoritative, not client-derived.
- Rankings/national UI adapts gracefully when the league has fewer than 25 teams.
- Top 10/Next 10 sections do not duplicate or request nonexistent ranks.

---

## 11. Implementation order for Replit

### Phase 1 — Simulation integrity

1. Fix regression allocation.
2. Fix V3 migration/double progression.
3. Consume pitch-mix development points.
4. Build authoritative `PitchingPlan` and appearance ledger.
5. Process weekly games chronologically.
6. Add focused unit and integration tests.

**Exit gate:** repeated seeded runs are deterministic, idempotent, and produce no invalid rest slots or double development events.

### Phase 2 — Navigation and Hub hierarchy

1. Consolidate weekly/advance widgets.
2. Move Quick Access directly below the command center.
3. Make navigation persona-aware.
4. Add Schools directory and fix the no-team School route.
5. Remove duplicate national panels.
6. Replace fake Bubble with Next 10 until real selection logic exists.

**Exit gate:** a coach or commissioner can reach their top six tasks without scrolling past rankings.

### Phase 3 — Identity and linking

1. Add logo schema/storage/migration.
2. Add commissioner logo upload/reset.
3. Create `TeamMark` and fallbacks.
4. Replace abbreviation badges across shared surfaces.
5. Implement canonical entity links.

**Exit gate:** all persisted schools/players in core tables and Game Prep are navigable, and every school renders a valid visual mark or fallback.

### Phase 4 — Responsive flagship screens

1. Redesign Game Prep for desktop while preserving mobile.
2. Expand Storyline Hub and add desktop rail.
3. Normalize card spacing, metric alignment, focus states, and long-name behavior.

**Exit gate:** 1366×768, 1440×900, 1920×1080, tablet, and mobile screenshots have no overlap, clipping, excessive empty gutters, or collapsed text.

### Phase 5 — Balance and soak testing

1. Run development telemetry suites.
2. Tune potential/archetype distributions.
3. Run full 56-game seasons with 149 teams.
4. Run 14-human readiness/concurrency flows.
5. Review logs, performance, and save idempotency.

---

## 12. Required automated test matrix

### Unit tests

- Growth budget by potential band.
- Regression allocation and floors.
- Archetype core/support weighting.
- Development caps.
- Pitch-mix allocation.
- Seed determinism.
- Migration idempotency.
- Game-slot normalization.
- Starter and bullpen rest.
- Outs caps and emergency fallback.
- National Snapshot behavior for 8, 14, 25, and 149 teams.

### Integration tests

- Offseason migration plus development transaction.
- Retry the same offseason advance.
- Simulate Wednesday/Friday/Saturday/Sunday in order.
- Game Prep selection equals the box-score starter.
- Box-score outs do not exceed availability caps.
- Commissioner editor role/version/audit/reverse behavior.
- Logo upload, serving, fallback, and cross-league isolation.
- 14-person simultaneous readiness/advance attempt.

### UI/E2E tests

- Quick Access appears before rankings in DOM and visual order.
- Only one national rankings summary exists on the Hub.
- Assigned coach School tile opens their team.
- Commissioner School tile opens Schools directory.
- Standings team opens school profile.
- Stats leader/player in Game Prep opens player profile.
- Storyline Hub uses desktop width but keeps readable story text.
- Game Prep has aligned team and pitcher cards with long names.
- Uploaded logo renders; missing logo renders fallback.
- Keyboard focus and activation work for every entity link and Quick Access card.

### Visual regression viewports

- 390×844
- 768×1024
- 1366×768
- 1440×900
- 1920×1080

Use fixtures with short and unusually long school, mascot, coach, and player names.

---

## 13. Definition of done

Do not mark this project complete until all statements below are true:

- [ ] An existing dynasty can migrate to V3 without any player developing twice.
- [ ] Negative development budgets produce real, bounded regression.
- [ ] Pitch-mix points change active pitch ratings and appear in reports.
- [ ] Game Prep, score calculation, box score, and stored appearance all use the same selected starter and bullpen plan.
- [ ] Rest/IP limits are enforced in outs by the simulator.
- [ ] A full simulated week updates rest chronologically.
- [ ] Quick Access is directly below the weekly Advance command center.
- [ ] Power Rankings/National Pulse duplication is removed.
- [ ] No fake postseason “Bubble” label is shown.
- [ ] Commissioner/no-team School navigation opens a valid directory.
- [ ] Core school and player names are links.
- [ ] Real logo upload/storage/rendering exists with a safe fallback.
- [ ] Storyline Hub uses the desktop canvas responsibly.
- [ ] Game Prep is a polished app-native desktop experience.
- [ ] Commissioner editor security, concurrency, audit, and reversal tests pass.
- [ ] The same core flows pass in 149-team Full Season and 14-team multiplayer fixtures.
- [ ] Production build, typecheck, migrations, unit tests, integration tests, E2E tests, and seeded soak tests pass in Replit.

---

## 14. Copy/paste implementation brief for Replit

> Audit and implement `UPDATED_REPO_IMPLEMENTATION_VERIFICATION_AND_REPLIT_FIX_PLAN.md` in priority order. Do not begin balance tuning or visual polish until the P0 simulation-integrity defects are fixed. Specifically: make regression allocate negative deltas; prevent legacy-plus-V3 double progression during migration; consume `pitchMixPoints`; and create one authoritative server-side `PitchingPlan` used by Game Prep, team-strength calculation, box-score generation, innings/outs limits, reliever selection, and persisted appearances. Process games chronologically so workload carries through a week.
>
> Then rebuild the League Hub hierarchy: one weekly command center, Quick Access immediately beneath it, needs-attention/game/program content next, and only one national snapshot later. Remove the duplicate Power Rankings/National Pulse query and do not call ranks 6–12 a postseason Bubble. Add a league Schools directory and persona-aware School navigation. Implement canonical school/player links.
>
> Add true team logo support through schema, safe storage, commissioner upload/reset with audit history, and a reusable `TeamMark` with fallback. Expand Game Prep and Storyline Hub to responsive desktop layouts. Preserve the completed semantic typography system and the existing commissioner editor safeguards.
>
> Add the complete unit, integration, UI/E2E, visual-regression, 149-team, and 14-team test matrix in the plan. Report each changed file, migration, test command, test result, seeded-simulation result, and any intentionally deferred item. Do not claim completion based only on screenshots or a successful build.

---

## 15. Audit limitations

This was a source-level audit of the supplied ZIP. The repository did not include installed dependencies. Its lockfile references Replit-private package proxy URLs, so a clean local dependency install and full production typecheck/E2E run could not be completed outside Replit. The findings above are based on direct inspection of the implemented source, routes, schema, migration behavior, and simulation call flow. Replit should execute the complete build and test matrix in its native environment and include the command output with the handoff.
