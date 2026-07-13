# Replit Plan: Recruiting Economy Rebalance

## Full Season (149 teams) and Custom Multiplayer (14-team default)

**Status:** Approved balance-change addendum  
**Applies to:** the updated repository audited on July 13, 2026  
**Primary modes:** `full_season` and the default 14-team custom multiplayer league

> This document deliberately supersedes the earlier remediation requirement that a 14-team custom league must retain a 75-recruit class. The user has now requested a recruiting rebalance. The new target is a sustainable, fair recruiting economy for both 149-team Full Season and 14-team multiplayer.

---

# 1. Required outcome

Recruiting should create difficult choices without requiring hundreds of repetitive actions. The same rules must apply to a human coach, a CPU coach, an auto-pilot human team, and a deadline-filled human team.

The finished system must:

- Sustain 25-player rosters over multiple seasons.
- Give a typical team enough supply to replace roughly one four-year cohort per season.
- Keep the amount of work per human-controlled team reasonable even when the universe has 149 teams and 1,081 recruits.
- Keep the 14-team multiplayer league strategically deep without making the national recruit pool too small.
- Make targets, class capacity, contact points, scouting points, visits, and NIL part of one coherent economy.
- Prevent concurrent multiplayer requests from exceeding any cap, overspending NIL, or signing the same recruit twice.
- Give CPU and auto-pilot teams the same resource limits as humans. Difficulty may change decision quality, not create hidden extra resources.
- Put every value in one versioned rules object. No cap may remain hard-coded in a route or React component.

---

# 2. Audit summary

The screenshot is not only a presentation problem. It exposes several disconnected systems.

| System | Current implementation | Problem |
|---|---|---|
| Targets | Human cap is hard-coded to 20 in `server/routes/recruiting.ts`; UI also prints `/20` | Not rules-driven; CPU can focus on as many as 30 per week and does not use the same target-board gate |
| Commits | Header uses `25 - roster.length + seniors`; signing paths allow a projected roster of 30 | The UI says 25 is the limit while manual and automatic sign paths can oversign to 30 |
| Calls | Header says `Calls`, but the counter is all recruiting points | Emails, calls, offers, campus visits, and head-coach visits all spend this counter |
| Contact points | Balanced entry coach starts near 16 per turn; `full_season` is missing from the season scaler | About 160 points are available in a standard custom season versus about 304 in Full Season |
| Scouts | Base is 25 plus skill/archetype/perk bonuses; no season-length scaling | The screenshot's 26 per turn becomes about 260 actions in standard and about 494 in Full Season |
| Scout reveal | One scout action reveals roughly 15%-25% plus bonuses | Current capacity can evaluate far more players than a team can target or sign |
| Visits | Combined campus plus head-coach cap is hard-coded to 20 in routes, CPU logic, UI, and messages | No separate premium HCV scarcity; not rules-driven; check-and-insert is raceable |
| NIL | Header shows total budget, not spent/remaining/reserved; every recruit has a fixed price | Recruiting, retention, and walk-ons draw from one pool without clear reserves or planning feedback |
| CPU resources | CPU gets a 0.75x-1.20x difficulty multiplier and does not charge actions to the coach's persisted weekly counter | Auto-pilot/deadline-filled human teams can receive CPU actions and still appear to have their full budget |
| CPU scouting | CPU has no equivalent scouting spend and signing-day fallbacks use real ratings | Human uncertainty is a cost that CPU does not pay |
| CPU visits | CPU only selects normal visits; it does not actually select `head_coach_visit` | Premium visit behavior is asymmetric; one log comparison also checks the wrong `hcVisit` string |
| Full Season pacing | Decisions are delayed until after Week 14, but per-action gains were designed around a five-week standard season | Long seasons can produce many maxed-out interest bars before decisions occur |
| Passive buzz | The reduced long-season cap checks `medium` and `long`, but not `full_season` | Full Season can receive the larger short-season passive gain for 14 regular-season weeks |
| Custom recruit supply | Current custom formula returns 80 at 14 teams | Long-run replacement demand is about 87.5 players before adding competitive depth |

## Actual recruiting-turn counts

The rules must use the number of turns the game really exposes:

```text
recruitingTurns = 1 preseason + regularSeasonWeeks + 4 offseason recruiting phases
```

| Format | Regular weeks | Recruiting turns |
|---|---:|---:|
| Custom short/standard | 5 | 10 |
| Custom medium | 10 | 15 |
| Custom long | 15 | 20 |
| Full Season | 14 | 19 |

The existing budget comments count 9/14/19 turns and omit preseason. Replit must calculate this from canonical phase data instead of maintaining another comment or lookup table.

## Measured NIL and supply evidence

The following measurements came from the current generator and catalog:

- The 149 initial team templates provide **$258,000,000 total NIL**, averaging about **$1.73M per team**.
- Thirty generated 1,081-recruit samples averaged about **$312.9M in total recruit cost**.
- The cheapest 932 recruits, equal to the nominal four-year cohort replacement demand, averaged about **$189.4M** before any retention or walk-on spending.
- A typical 1,081-player sample produced approximately 124 five-stars and 226 four-stars.
- The current 14-team custom class of 80 supplies 5.71 recruits per team. A full 25-player roster requires 6.25 replacements per team per year in steady state.

These numbers do not mean every recruit should sign. They do mean the economy needs a deliberate supply buffer, a lower V2 recruit-price index, and explicit NIL planning.

---

# 3. Balance principles

## 3.1 Scale by team need and recruiting turns, not raw universe size

A human manages one team in either format. A 149-team league should create more competition and more stories, not 10.6 times more clicking.

## 3.2 Use seasonal budgets, then distribute them by turn

Coach bonuses currently compound once per week. That makes the same coach trait nearly twice as valuable in Full Season. Contact and scouting bonuses must be calculated as seasonal bonuses before division into weekly/phase caps.

## 3.3 Preserve scarcity at three levels

- **Board scarcity:** a team cannot seriously pursue everyone.
- **Time scarcity:** contact and scout points force weekly priorities.
- **Closing scarcity:** visits and NIL decide which finalists can actually be closed.

## 3.4 CPU difficulty changes decisions, not resources

Beginner CPU may choose worse topics or misjudge competition. Elite CPU may plan better. Neither receives more points, targets, visits, signing slots, or NIL than its coach and school actually own.

## 3.5 A commit limit must describe roster reality

There is no defensible fixed national class-size cap. Capacity comes from vacancies, graduating seniors, confirmed exits, and a small explicit oversign allowance. The hard final roster remains 25.

---

# 4. Recommended V2 launch values

These are the initial values Replit should implement, simulate, and tune only if the acceptance thresholds in Section 12 fail.

## 4.1 Baseline profile

Values below are for a Balanced entry-level coach before coach modifiers.

| Resource | Custom 14, standard | Full Season 149 | Notes |
|---|---:|---:|---|
| Recruit pool | 102 | 1,081 | Both use 7.25 recruits per team, rounded up |
| Target cap | 18-28 dynamic | 18-28 dynamic | Based on planned class size, not team count |
| Contact points per turn | 16 | 10 | 160 versus 190 seasonal points |
| Scout points per turn | 10 | 6 | 100 versus 114 seasonal points |
| Combined visits per season | 12 | 14 | Campus and HCV also have subcaps |
| Campus-visit subcap | 9 | 10 | Still subject to combined cap |
| Head-coach-visit subcap | 4 | 5 | Premium closing resource |
| Commit target | Dynamic | Dynamic | Confirmed and projected openings |
| Oversign allowance | 2 | 2 | Must return to 25 at roster finalization |
| Recruit NIL price index | 0.75 | 0.75 | Applied after existing star/position/geography/scarcity math |
| Starting NIL floor | $750,000 | $750,000 | Before performance bonuses |

The combined visit cap wins over either subcap. For example, Custom can use eight campus visits and four HCVs, but not nine campus visits and four HCVs.

## 4.2 Recruit-pool formula

Use one sustainable baseline formula:

```ts
steadyStateDemand = teamCount * 25 / 4;
recruitPoolSize = Math.max(30, Math.ceil(steadyStateDemand * 1.16));
// Equivalent to ceil(teamCount * 7.25) above the minimum.
```

Expected results:

```text
4 teams   -> 30 recruits
10 teams  -> 73 recruits
14 teams  -> 102 recruits
20 teams  -> 145 recruits
149 teams -> 1,081 recruits
```

For later seasons, actual departure demand may raise the result but must never reduce it below this sustainable competition floor while progression is enabled.

Do not count every junior as a guaranteed departure. Split departure inputs into:

- Guaranteed: seniors and confirmed exits.
- Probable: draft/portal probability weighted by the existing departure model.
- Unknown: not included in the hard capacity.

## 4.3 Dynamic target-board cap

Use planned class size instead of a mode-specific fixed number:

```ts
targetCap = clamp(12 + 2 * plannedClassSize, 18, 28);
```

Examples:

| Planned class | Target cap |
|---:|---:|
| 3 | 18 |
| 4 | 20 |
| 5 | 22 |
| 6 | 24 |
| 7 | 26 |
| 8+ | 28 |

Because both recruit pools use 7.25 prospects per team, this produces comparable national target density in a 14-team and 149-team league.

Target changes are free, but a dropped target keeps previously spent actions and interest. Target order must be unique and compact after removal.

## 4.4 Class need and commit capacity

Replace the single misleading `maxCommits` calculation with these values:

```ts
confirmedOpenings = max(
  0,
  25 - returningRosterAfterVacanciesSeniorsAndConfirmedExits
);

projectedOpenings = clamp(
  confirmedOpenings + expectedDraftExits + expectedPortalExits,
  confirmedOpenings,
  10
);

hardCommitCap = confirmedOpenings + 2; // explicit oversign allowance
```

Rules:

- At preseason, show a range such as `3 confirmed / 6 projected` rather than pretending three is the whole class plan.
- Recompute confirmed openings when departures become official.
- Do not silently lower a hard cap below already accepted commits.
- A team may oversign by at most two players, with a clear warning that it must reach 25 at roster finalization.
- Human, CPU, auto-pilot, manual-sign, verbal-sign, signing-day fill, and walk-on paths must call the same capacity service.
- Delete the 30-player recruiting ceiling. It conflicts with the 25-player roster used elsewhere.
- The final roster validator remains authoritative and must block advancement above 25.

Recommended header presentation:

```text
COMMITS 0     CLASS NEED 3-6
```

If the existing six-card layout must remain, use `Commits 0/3-6` with a tooltip explaining confirmed, projected, and oversign capacity.

## 4.5 Contact-point seasonal budgets

Start with these seasonal baselines:

| Season profile | Seasonal contact baseline | Baseline per turn |
|---|---:|---:|
| Custom short/standard | 160 | 16 over 10 turns |
| Custom medium | 175 | about 12 over 15 turns |
| Custom long | 190 | about 10 over 20 turns |
| Full Season | 190 | 10 over 19 turns |

Apply coach modifiers to the seasonal total:

```ts
avgRecruitSkill = floor((pitchingRecruitingSkill + hittingRecruitingSkill) / 2);

seasonContactBudget =
  profile.contactSeasonBase
  + 8 * (avgRecruitSkill - 1)
  + archetypeSeasonContactBonus;

turnContactCap = roundSeasonBudgetAcrossTurns(
  seasonContactBudget,
  recruitingTurns,
  currentRecruitingTurnIndex
);
```

Use these initial seasonal archetype bonuses:

| Archetype | Seasonal contact modifier |
|---|---:|
| Scout Master | +20 |
| Dealmaker | +20 |
| Pure CEO | +10 |
| Player's Coach | 0 |
| Balanced | 0 |
| Academic Dean | 0 |
| Tactician | -10 |
| Old School | -20 |

Distribute rounding remainders deterministically across turns so the exact seasonal total is preserved. Do not simply use `ceil` every turn, which creates extra points in longer formats.

Rename the UI card from **Calls** to **Contact Pts** or **Recruiting Pts**. It currently includes all of the following:

| Action | V2 point cost |
|---|---:|
| Email | 1 |
| Phone call, up to three topics | 2 |
| Scholarship offer | 2 |
| Campus visit | 4 |
| Head-coach visit | 5 |

Geography should affect the visit's interest result, not also create an extreme 1-to-5 point-cost swing. This removes the current case where a local campus visit can cost the same as a low-impact email despite a 20-35 base gain.

Keep the per-recruit weekly limits of one email and one call. Keep each campus/HCV action to once per recruit per season.

## 4.6 Scouting seasonal budgets

Use these seasonal baselines:

| Season profile | Seasonal scout baseline | Baseline per turn |
|---|---:|---:|
| Custom short/standard | 100 | 10 over 10 turns |
| Custom medium | 105 | 7 over 15 turns |
| Custom long | 120 | 6 over 20 turns |
| Full Season | 114 | 6 over 19 turns |

Calculate coach bonuses as seasonal values:

```ts
avgScoutSkill = floor((scoutingSkill + evaluationSkill) / 2);

seasonScoutBudget =
  profile.scoutSeasonBase
  + 6 * (avgScoutSkill - 1)
  + archetypeSeasonScoutBonus
  + (hasQuickStudy ? 15 : 0);
```

Initial archetype scout bonuses:

| Archetype | Seasonal scout modifier |
|---|---:|
| Scout Master | +20 |
| Academic Dean | +10 |
| Player's Coach | +5 |
| Tactician | +5 |
| Balanced | 0 |
| Pure CEO | 0 |
| Dealmaker | -5 |
| Old School | -5 |

Keep one scout point per evaluation action and retain the existing reveal-quality bonuses. The lower action volume makes evaluation skill meaningful again.

Rename **Scouts** to **Scout Pts**. A scout is a staff member; the counter is action points.

## 4.7 Visit economy

Visits are season-level closing resources, not weekly spam.

Required rules:

- Custom standard: 12 combined, no more than 9 campus and 4 HCV.
- Full Season: 14 combined, no more than 10 campus and 5 HCV.
- Both cap checks and the action insert must occur in one transaction.
- Both human and CPU use exactly the same cap service.
- A campus visit costs four contact points; an HCV costs five.
- One campus visit and one HCV may be used on the same recruit, but each type only once.
- CPU must be capable of using HCV and must log the canonical `head_coach_visit` action type.
- Return all three caps and counts from the API. Remove `/20` and `20 total cap` text from React.

## 4.8 NIL economy

### Recruit prices

Keep the current star, position, geography, and position-scarcity model, then apply:

```ts
finalNilCost = roundToNearest5000(rawNilCost * 0.75);
```

The 0.75 launch index changes the 30-sample Full Season estimates from:

```text
all 1,081 recruits: about $312.9M -> about $234.7M
cheapest 932:       about $189.4M -> about $142.0M
```

This leaves room for teams to reserve NIL for retention and walk-ons while still requiring tradeoffs for elite recruits.

### Annual school budget

Preserve program identity after Season 1. The current reset replaces the team-specific template with a conference-wide base, which causes teams in the same conference to converge too abruptly.

Persist an immutable `nilBaseline` per team and calculate the next budget as:

```ts
schoolConferenceBase =
  0.60 * team.nilBaseline
  + 0.40 * conferenceTierBase;

classNeedAdjustment = clamp((plannedClassSize - 6) * 75_000, -225_000, 225_000);

nilBudget = max(
  750_000,
  roundToNearest5000(
    schoolConferenceBase
    + classNeedAdjustment
    + earnedPerformanceBonuses
  )
);
```

This keeps UCLA near its existing identity, preserves richer and poorer programs, helps unusually large classes, and prevents a low-budget team from becoming structurally unable to fill normal roster openings.

### Planning envelopes

Expose three planning envelopes from the same annual pool:

| Use | Default share |
|---|---:|
| Recruiting | 65% |
| Retention | 25% |
| Walk-ons | 10% |

For V2 launch:

- CPU treats these as enforced reserves.
- Humans may move money between envelopes only through an explicit in-app budget screen.
- Reallocation is immediate, audited, and applies equally in multiplayer.
- The signing endpoint validates against the recruiting envelope, not only total unspent NIL.
- Retention and walk-on endpoints validate their own envelopes.
- A commissioner may lock reallocation for a competitive custom league, but cannot give one team a different rule.

### Header and recruit-card presentation

Replace the screenshot's ambiguous `NIL $3.5M` with:

```text
NIL LEFT  $3.50M
Recruiting allocation: $2.28M | Committed: $0
```

Every recruit card must show:

- Expected NIL price.
- Remaining recruiting allocation after signing.
- A warning if the signing would spend the retention reserve after an allowed reallocation.

All manual and automatic NIL charges must be transactional and idempotent.

---

# 5. One canonical rules module

Create `shared/recruitingBalance.ts` and remove duplicated rule math from routes and simulation.

Recommended shape:

```ts
export type RecruitingBalanceVersion = 1 | 2;

export interface RecruitingBalanceProfile {
  version: RecruitingBalanceVersion;
  recruitPoolPerTeam: number;
  minRecruitPool: number;
  targetMin: number;
  targetMax: number;
  targetBase: number;
  targetsPerPlannedCommit: number;
  oversignAllowance: number;
  contactSeasonBase: number;
  scoutSeasonBase: number;
  visitCombinedCap: number;
  campusVisitCap: number;
  headCoachVisitCap: number;
  actionCosts: Record<RecruitingActionType, number>;
  recruitNilPriceIndex: number;
  nilFloor: number;
  nilEnvelopeShares: {
    recruiting: number;
    retention: number;
    walkons: number;
  };
}

export function getRecruitingTurnCount(seasonLength: string): number;
export function getRecruitingTurnIndex(phase: PhaseName, week: number): number;
export function getRecruitingBalanceProfile(rulesSnapshot: LeagueRulesSnapshot): RecruitingBalanceProfile;
export function getTargetCap(plannedClassSize: number, profile: RecruitingBalanceProfile): number;
export function getClassCapacity(input: ClassCapacityInput): ClassCapacityResult;
export function getTurnContactCap(input: SeasonalBudgetInput): number;
export function getTurnScoutCap(input: SeasonalBudgetInput): number;
```

The `rulesSnapshot` for every new league must include the resolved recruiting profile. Store `recruitingBalanceVersion = 2` on the league or in its rules snapshot.

Do not identify balance behavior from league name, number of teams, or UI route. Use the versioned snapshot.

---

# 6. Server implementation

## 6.1 Central action service

Create a service such as `server/services/recruitingActionService.ts`. Human routes and CPU simulation must call it.

For every action, the service must perform one database transaction:

1. Lock the team-season recruiting ledger and relevant coach row.
2. Lock the recruit/team interest row when it exists.
3. Validate league, phase, week, ownership, target status, per-recruit limit, weekly points, visit caps, and NIL where applicable.
4. Insert the action with an idempotency key.
5. Spend points or NIL.
6. Update interest/scouting/offer/commit state.
7. Commit.

If any validation fails, no interest, scouting, points, visit count, commit, or NIL state may change.

The current sequence often inserts an action and later calls an atomic point spender without checking the result. That is not sufficient for 14 simultaneous users.

## 6.2 Ledger and constraints

Add a team-season-turn ledger rather than relying only on mutable coach counters:

```text
team_recruiting_ledgers
- league_id
- team_id
- season
- recruiting_turn_index
- contact_cap
- contact_spent
- scout_cap
- scout_spent
- targets_cap
- visits_combined_cap
- campus_visit_cap
- head_coach_visit_cap
- rules_version
```

Use a unique key on `(league_id, team_id, season, recruiting_turn_index)`.

Add database uniqueness or equivalent transactional protection for:

- One email per team/recruit/season/week.
- One phone per team/recruit/season/week.
- One offer per team/recruit unless offers can be withdrawn in a later feature.
- One campus visit per team/recruit/season.
- One HCV per team/recruit/season.
- One target row per team/recruit.
- One signing winner per recruit.
- One NIL charge per team/recruit signing.

Action requests from the client must include an idempotency key. A retry returns the first result and never spends twice.

## 6.3 Replace weekly reset assumptions

The ledger determines the active turn and cap. Advancing a phase creates the next ledger row idempotently. Do not reset every coach to zero before confirming that advance completed successfully.

If the existing `recruitActionsUsed` and `scoutActionsUsed` columns remain during migration, treat them as cached display fields only and reconcile them from the ledger.

## 6.4 Stage and interest pacing

- Use `getSeasonMaxWeeks()` from `shared/phase.ts`; delete duplicated season-length ternaries.
- Add `full_season` to the reduced passive-buzz branch.
- Keep decisions in the four offseason recruiting phases, but run a simulation test proving that fewer than 25% of contested recruits sit at 100 interest for five or more turns before committing.
- If that threshold fails, apply a V2 Full Season interest-gain pace factor starting at `0.85`, not an untested global rewrite.
- Diminishing returns should apply after 85 interest so perfect bars remain difficult to maintain.

Suggested initial diminishing rule:

```ts
effectiveGain = interest < 85
  ? rawGain
  : Math.max(1, Math.round(rawGain * 0.50));
```

Apply the same rule to human and CPU actions.

---

# 7. CPU and auto-pilot parity

## Required changes

1. Remove the CPU difficulty point multiplier.
2. Resolve the CPU's target cap from the same profile and class plan as a human.
3. Persist `isTargeted` for CPU boards or introduce an equivalent canonical board row used by both paths.
4. Spend CPU actions through the central transaction service.
5. Charge auto-pilot and deadline-filled actions to the persisted ledger before the user can regain control.
6. Add HCV decision logic using `head_coach_visit`.
7. Enforce the same combined/campus/HCV caps.
8. Enforce the same commit capacity and 25-player final roster.
9. Enforce NIL envelopes and reserves.
10. Difficulty changes noise, topic choice, competition analysis, offer timing, and roster-need evaluation only.

## CPU scouting

CPU must not use the actual recruit overall or potential unless its scouting state has revealed that information.

Preferred implementation:

- Give each CPU team the same scout ledger and action cap.
- Store scout percentage and ranges in the same `recruiting_interests` record humans use.
- Rank candidates using the midpoint of visible ranges plus difficulty-dependent evaluation noise.
- Beginner has wider/noisier estimates; Elite uses the same revealed range more efficiently but does not see hidden truth.
- Signing-day emergency fill may prioritize position and affordability, but still cannot sort by hidden exact overall.

Auto-pilot for a human team must use exactly the user's coach skills, perks, remaining points, existing target board, visits, and NIL allocations.

---

# 8. Client changes

Affected areas include:

- `client/src/pages/recruiting.tsx`
- `client/src/components/recruiting/command-center.tsx`
- `client/src/components/recruiting/mobile-board.tsx`
- `client/src/hooks/use-recruiting.ts`

## Header contract

The server must return a single `economy` object:

```ts
economy: {
  balanceVersion: 2,
  recruitingTurnIndex: number,
  recruitingTurnsTotal: number,
  targets: { used: number, cap: number },
  commits: {
    signed: number,
    confirmedOpenings: number,
    projectedOpenings: number,
    hardCap: number,
    oversignAllowance: number
  },
  contactPoints: { spent: number, cap: number, seasonBudget: number },
  scoutPoints: { spent: number, cap: number, seasonBudget: number },
  visits: {
    totalUsed: number,
    totalCap: number,
    campusUsed: number,
    campusCap: number,
    headCoachUsed: number,
    headCoachCap: number
  },
  nil: {
    budget: number,
    spent: number,
    remaining: number,
    recruitingAllocated: number,
    recruitingCommitted: number,
    recruitingRemaining: number,
    retentionReserved: number,
    walkonReserved: number
  }
}
```

React must render only these server values. Delete all literal `/20` target and visit strings.

## Recommended six cards

```text
TARGETS      COMMITS       CONTACT PTS
0/24         0/3-6         0/10

SCOUT PTS    VISITS        NIL LEFT
0/6          0/14          $3.50M
```

Tooltips explain:

- Confirmed versus projected class openings.
- Campus versus HCV use.
- NIL recruiting allocation and protected reserves.
- Why Full Season has fewer points per turn but more turns.

The desktop and mobile board must show identical values and disable an action using the same `canPerform` reason returned by the server.

---

# 9. File-level change map

## Shared

- `shared/recruitingBalance.ts` - new canonical profiles and formulas.
- `shared/phase.ts` - canonical turn count/index helpers.
- `shared/catalog/index.ts` - sustainable 7.25-per-team pool formula.
- `shared/nilConfig.ts` - team/conference blend and envelope defaults.
- `shared/schema.ts` - balance version, immutable NIL baseline, ledger tables, and inferred types.
- `shared/coachPerks.ts` - convert weekly point modifiers to seasonal modifiers.

## Server

- `server/services/recruitingActionService.ts` - new transactional human/CPU action service.
- `server/services/recruitingEconomyService.ts` - resolve class plan, caps, spent amounts, and UI contract.
- `server/services/recruitPoolPlanner.ts` - use guaranteed versus probable departures correctly.
- `server/routes/recruiting.ts` - thin endpoints calling the services; remove duplicated formulas and literals.
- `server/routes/simulation.ts` - CPU parity, canonical phase math, NIL reset, no hidden rating use.
- `server/routes/league-mgmt.ts` - one commit-cap service, 25-player projection, transactional signing.
- `server/recruit-generator.ts` - V2 NIL index and $5,000 rounding.
- `server/storage.ts` - ledger methods and transaction-safe increments.
- Numbered migration - additive schema changes and V2 backfill; no startup DDL.

## Client

- `client/src/pages/recruiting.tsx` - dynamic cards and corrected labels.
- `client/src/components/recruiting/command-center.tsx` - budget and class-plan detail.
- `client/src/components/recruiting/mobile-board.tsx` - same contract on mobile.
- `client/src/hooks/use-recruiting.ts` - typed economy object and invalidation.

---

# 10. Migration and compatibility

## New leagues

- New Full Season and custom leagues use `recruitingBalanceVersion = 2`.
- The resolved profile is frozen in `rulesSnapshot`.
- Custom commissioners may select a future approved profile, but the default 14-team profile is V2 Balanced.

## Existing leagues

- Do not change caps in the middle of a recruiting turn.
- Offer the commissioner a one-time V2 migration effective at the next preseason.
- When migrating, snapshot current targets, commits, actions, visits, and NIL.
- If a team already exceeds a new target or visit cap, grandfather existing use and block only additional actions.
- Never revoke an existing commit or charge additional NIL retroactively.

## Previous remediation-plan conflict

The previous plan's checks for a 75-player custom class must be replaced with:

```text
14-team V2 custom league -> exactly 102 initial recruits
149-team Full Season     -> exactly 1,081 initial recruits
```

Legacy V1 leagues may remain at their historical class size until migrated.

---

# 11. Implementation phases

## Phase A - Integrity before tuning

1. Add the canonical profile and economy resolver.
2. Add versioned league rules.
3. Add the transaction ledger and idempotency constraints.
4. Route human actions through the transactional service.
5. Align every signing path to 25 plus the explicit two-player oversign allowance.
6. Fix UI labels and remove literals.

**Exit gate:** concurrency tests pass and the UI reflects server caps.

## Phase B - Human/CPU parity

1. Route CPU and auto-pilot actions through the same service.
2. Remove difficulty resource multipliers.
3. Add CPU targets, scouting, HCV, NIL reserves, and capacity checks.
4. Remove hidden exact-rating selection.
5. Fix passive Full Season buzz scaling.

**Exit gate:** a trace comparing two identical coaches shows equal resources and legal actions, regardless of human or CPU control.

## Phase C - Supply and NIL

1. Change V2 custom pool to 7.25 per team.
2. Apply the 0.75 NIL price index and $5,000 rounding.
3. Persist `nilBaseline`.
4. Blend team identity with conference tier.
5. Add class-need adjustment and planning envelopes.
6. Run balance simulations and adjust only through the profile constants.

**Exit gate:** roster-fill, class-size, unsigned-pool, and NIL thresholds pass for both formats.

## Phase D - UX and telemetry

1. Add class-plan and NIL-allocation panels.
2. Add dynamic tooltips and disabled-action reasons.
3. Add commissioner balance-version display.
4. Add anonymous league-level economy telemetry or an admin report.

**Exit gate:** desktop/mobile parity and the playtest rubric pass.

---

# 12. Required tests and acceptance thresholds

## 12.1 Formula unit tests

Test exact outputs for:

- Recruiting turn counts: 10, 15, 20, and 19.
- Recruit pools: 30 at four teams, 102 at 14, and 1,081 at 149.
- Target caps at planned class sizes 3 through 8.
- Seasonal-to-turn point distribution sums exactly to the seasonal budget.
- Coach skill, archetype, and perk modifiers do not multiply by season length.
- Visit combined and subcaps.
- NIL price index and $5,000 rounding.
- Team/conference NIL blend and $750,000 floor.
- Confirmed/projected/hard class capacity.

## 12.2 Transaction and concurrency tests

Use 14 parallel clients against one test league.

Required cases:

- Two simultaneous final-point actions: only one succeeds if one point remains.
- Two target requests at the cap: target count never exceeds the cap.
- Two visit requests at the combined cap: visit count never exceeds the cap.
- Two sign requests for the same recruit: one winner and one NIL charge.
- Two different sign requests with only enough NIL for one: no overspend.
- Retry with the same idempotency key: one action and one charge.
- Auto-pilot acts, control is restored, and only the actual remaining points are available.
- Failed action never changes interest or scouting.

## 12.3 14-user multiplayer E2E

Create a 14-team custom simulated league with 14 human accounts.

Verify:

- Exactly 102 V2 recruits.
- Every coach sees their own dynamic target and class caps.
- Ready/advance gates still require all non-auto-pilot humans.
- All 14 can act concurrently without counter drift.
- Deadline fill uses each team's remaining resources.
- Commissioner cannot act for another human team through a direct API call.
- At signing day, no roster exceeds 25 after required cuts.
- NIL totals and envelopes reconcile for every team.
- The league advances into Season 2 with a new sustainable class.

## 12.4 149-team Full Season soak

Run at least 100 deterministic one-season simulations and 10 deterministic three-season simulations across CPU difficulty settings.

Required thresholds:

| Metric | Acceptance |
|---|---:|
| Teams finishing signing day at 23-25 players | At least 98% |
| Teams above 25 after roster finalization | 0 |
| Confirmed roster openings filled | At least 95% league-wide |
| Unsigned recruit share after finalization | 8%-20% |
| Median class size | 5-8 |
| Teams with zero commits despite openings | Below 1% |
| Teams exceeding target/contact/scout/visit caps | 0 |
| Teams overspending total NIL or an enforced envelope | 0 |
| Median annual NIL utilization | 75%-95% |
| Contested recruits parked at 100 for 5+ turns | Below 25% |
| CPU actions using unrevealed exact OVR/potential | 0 |
| Advance failures caused by recruiting inconsistency | 0 |

Report results by conference and budget quartile, not only league averages. A league average can hide a conference or low-budget tier that is unable to maintain rosters.

## 12.5 Statistical fairness report

For identical team, coach, board, and random seed, compare human-scripted and CPU-scripted legal actions:

- Same cap values.
- Same action costs.
- Same gain formula.
- Same visit/NIL/commit gates.
- Same hidden-information boundary.

Difficulty may alter which legal action the CPU selects, never the rules applied after selection.

---

# 13. Telemetry required for tuning

Add a commissioner/admin economy report with no private user data:

- Targets used/cap by team and turn.
- Contact and scout points spent/cap.
- Unique prospects contacted and scouted.
- Campus and HCV usage.
- Confirmed/projected openings and commits.
- Commit hit rate from target board.
- Average interest at commitment.
- NIL budget, envelope allocation, spend, and unused amount.
- Unsigned recruits by star and position.
- Roster size after signing day and walk-ons.
- CPU/human/auto-pilot control type.

Use this report to tune profile constants after playtests. Do not scatter hotfix values through routes.

---

# 14. Definition of done for Replit

Replit must not claim this rebalance is complete until it provides:

- [ ] A new canonical, versioned recruiting balance module.
- [ ] No target, contact, scout, visit, commit, roster, or NIL cap hard-coded in UI/routes/simulation.
- [ ] Custom 14 V2 creates 102 recruits.
- [ ] Full Season creates 1,081 recruits.
- [ ] Full Season uses 10 baseline contact points and 6 baseline scout points per recruiting turn before coach modifiers.
- [ ] Custom standard uses 16 baseline contact points and 10 baseline scout points per recruiting turn before coach modifiers.
- [ ] Dynamic 18-28 target caps work.
- [ ] Commit display shows confirmed and projected openings.
- [ ] Every signing path uses the same 25-player rule and explicit +2 temporary oversign allowance.
- [ ] Visit combined and subcaps work for human and CPU.
- [ ] CPU/auto-pilot spends persisted resources and cannot double-dip.
- [ ] CPU difficulty no longer changes resource volume.
- [ ] CPU scouting observes hidden-information rules.
- [ ] NIL price index, baseline blend, floor, class adjustment, and envelopes reconcile.
- [ ] Desktop and mobile use the same server economy object.
- [ ] Formula, concurrency, 14-user E2E, and 149-team soak tests pass.
- [ ] Simulation output is attached, including per-conference and budget-quartile results.
- [ ] TypeScript check and production build pass.
- [ ] Existing in-progress leagues migrate only at a safe preseason boundary.

---

# 15. Replit implementation instruction

Use this exact direction when assigning the work:

> Implement `REPLIT_RECRUITING_ECONOMY_REBALANCE_PLAN.md` as Recruiting Balance V2. Start with transaction integrity and one canonical rules service. Then make human, CPU, auto-pilot, and deadline-fill teams consume the same targets, contact points, scouting points, visit caps, class capacity, and NIL rules. Do not tune by adding literals in routes or React. Run the required 14-user concurrency/E2E suite and 149-team statistical soak, attach the raw summary, and do not mark complete if any Definition of Done item is missing.

