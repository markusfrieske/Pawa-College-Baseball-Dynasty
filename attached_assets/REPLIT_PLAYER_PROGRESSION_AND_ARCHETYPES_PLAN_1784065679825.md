# Pawa College Baseball Dynasty
## Player Progression, Regression, Potential Scaling, and Baseball Archetypes Plan

**Prepared for:** Replit implementation  
**Repository audited:** July 13, 2026 ZIP supplied by the owner  
**Plan date:** July 14, 2026  
**Applies to:** 149-team Full Season and all custom leagues, including the optimized 14-team multiplayer preset  
**Relationship to prior plan:** This is a focused companion specification to `REPLIT_FULL_APP_SWEEP_AND_DYNASTY_EDITOR_PLAN.md`.

---

## 1. Decision

The current progression system should be replaced, not merely retuned.

Potential currently controls a large direct annual OVR target. The engine then applies similar changes to nearly every non-null rating, regardless of position, and relies on a stored OVR floor to hide some recalculation failures. That produces extreme hitter growth, weak or contradictory pitcher growth, a severe talent cliff between the initial catalog and generated recruiting classes, and automatic regression for many college-aged players solely because they have low potential.

The replacement should separate five concepts:

1. **Current ability** — the ratings a player has today.
2. **Potential** — the ceiling and remaining room for growth.
3. **Baseball archetype** — the position-specific development path that determines which ratings receive most growth and which are most exposed during a genuine regression event.
4. **Development trait** — Normal, Raw, Late Bloomer, or Early Peaker; this controls the timing and volatility of growth.
5. **Development environment** — work ethic, coachability, facilities, playing opportunity, health, and a small deterministic variance.

Every player and recruit should have one persisted, visible baseball archetype. The user’s example becomes a first-class archetype:

> An A+ potential **Speed-Power Outfielder** has high caps and strong development weights for Power, Speed, Running, and Stealing. Contact and Arm grow at a secondary rate. Defense still can improve, but more slowly. If a general regression event occurs, weaker non-primary ratings are normally exposed first. A specific hamstring injury may still affect Speed because injury context overrides generic archetype protection.

Potential must no longer mean “low-potential freshmen get worse every year.” Low potential should usually mean an earlier plateau and lower caps. Regression should be caused by an actual regression trigger.

---

## 2. Useful benchmark principles from College Football 27

The design should borrow principles, not names, UI art, formulas, or proprietary data.

EA’s official College Football 27 material describes position-archetype paths that improve a randomly selected subset of ratings tied to the playstyle, while allowing overlap in core position attributes. It also separates current ratings from maximum potential and makes skill groups, potential, and caps visible in roster/player views. Those are the useful concepts for this baseball dynasty. See EA’s [Dynamic Upgrade by Archetype explanation](https://www.ea.com/games/ea-sports-college-football/college-football-27/news/college-football-27-ultimate-team), [Dynasty development UI notes](https://www.ea.com/games/ea-sports-college-football/college-football-27/news/college-football-27-dynasty), and [Max Potential explanation](https://www.ea.com/games/ea-sports-college-football/college-football-27/news/college-football-27-road-to-glory).

Use these principles:

- position-specific development identities
- clear strengths and tradeoffs
- attribute-specific caps separate from starting ratings
- some shared core development within a position
- variation inside an archetype, so two players do not develop identically
- visible skill groups and ceilings
- development history surfaced in roster management

Do not add an Ultimate Team currency or require manual upgrades for thousands of CPU players. This remains a deterministic dynasty simulation.

---

## 3. Current-system audit

### 3.1 Current potential-to-OVR targets are too extreme

`server/routes/simulation.ts` currently uses these annual OVR targets before facility scaling:

| Potential | Current target |
|---|---:|
| A+ | +40 to +50 |
| A | +25 to +35 |
| A- | +20 to +30 |
| B+ | +15 to +25 |
| B | +10 to +20 |
| B- | +10 to +15 |
| C+ | +3 to +8 |
| C | -2 to +2 |
| C- | -5 to 0 |
| D+ | -5 to -10 |
| D | -10 to -20 |
| D- | -15 to -25 |
| F | -25 to -40 |

Consequences:

- Potential conflates ceiling, growth rate, and decline.
- A low-potential freshman can lose massive ability despite being college-aged and healthy.
- An A+ player can gain more than a full star tier in one offseason after nonlinear OVR recalculation.
- There is no “limited but stable” player. A large portion of future classes are programmed to erode.

### 3.2 Initial-roster and generated-class potential are incompatible

The 3,725-player catalog currently contains:

| Grade | Players |
|---|---:|
| A+ | 97 |
| A | 232 |
| A- | 619 |
| B+ | 1,372 |
| B | 862 |
| B- | 170 |
| C+ | 119 |
| C | 254 |

The catalog’s mean numeric potential is approximately **85.68**.

The weighted future-class function in `shared/potential.ts` has a mean of approximately **67.15**. Under the current direct target table, that future distribution has an expected target of approximately **-4.45 OVR per offseason** before facilities and nonlinear recalculation.

This creates a structural dynasty cliff:

- early seasons are populated by B+/A catalog players who grow quickly
- replacement classes are dominated by C-/D potential players who plateau through decline
- league talent can crash after the original roster cycles out, even if recruiting and facilities work correctly

### 3.3 Position development is not position-aware

The progression function changes these core fields for all players when non-null:

- hitter ratings
- speed/arm/defense
- pitcher velocity/control/stamina/stuff
- hitter and pitcher common ratings

Because schema defaults make most fields non-null, hitters spend development on pitcher attributes and pitchers spend development on hitter attributes. Irrelevant changes do not contribute to the player’s role or OVR.

Missing relevant development includes:

- `catcherAbility`
- pitcher pitch levels and pitch repertoire
- meaningful pitcher `stuff` development when pitch data exists, because the OVR formula ignores `stuff` in favor of the stored pitch mix
- ability acquisition/evolution

### 3.4 Pitcher and hitter scaling diverges dramatically

A seeded pure-code audit copied the current algorithm and applied it to 3,038 non-senior catalog players with a neutral facility multiplier.

| Group | Mean target | Mean raw recalculated OVR | Mean stored OVR | No stored growth |
|---|---:|---:|---:|---:|
| All players | +19.17 | +24.34 | +26.95 | 10.8% |
| Pitchers | +19.48 | **-1.01** | **+6.03** | 22.0% |
| Hitters | +19.00 | **+39.28** | **+39.28** | 4.2% |

The same potential target therefore produces radically different role outcomes.

For the 90 non-senior A+ players in that snapshot:

- mean intended target: +45.58
- mean stored change: +83.86
- median stored change: +108
- 90th percentile: +178
- no stored growth: 36.7%

An A+ player can therefore explode upward or receive zero OVR growth depending heavily on position and rating thresholds, not on a coherent development model.

### 3.5 Pitcher OVR can decrease when attributes improve

The pitcher OVR formula handles linked gold/S-tier common ratings inconsistently. Before a common rating reaches S, the calculation may count both its common contribution and the linked gold ability. At S, it zeroes the common row and retains the gold contribution. Crossing the threshold can therefore reduce OVR even though the rating increased.

The progression function hides this for A/B potential by storing `max(old OVR, recalculated OVR)`. That creates a second problem:

- stored `overall` can disagree with `calculateOVR(current attributes)`
- a later recalculation can unexpectedly change the player
- an improved player may display no OVR growth

OVR must be monotonic before progression can be calibrated. A stored floor is not a valid repair.

### 3.6 Existing development inputs are generated but ignored

Recruits already receive:

- `workEthicScore`
- `coachability`
- `tools`
- a field named `playerArchetype`, currently meaning `normal`, `raw`, `late_bloomer`, or `overdraft`

The progression code explicitly ignores work ethic, coachability, coach development, and development profile. Facilities only help positive growth at ratings 7–9; programs at facilities 1–6 are treated identically.

### 3.7 Recruit development identity is lost at signing

When a recruit becomes a roster player, the current copy operation does not preserve all important development data. Notably:

- existing recruit `playerArchetype` is not copied
- `tools` are not copied
- `trajectory` is not copied and may fall back to the player default
- several appearance fields are also omitted

The hidden Late Bloomer/Raw/Overdraft profile therefore does not persist as a profile on the roster. Its potential value may persist, but the identity and intended timing do not.

### 3.8 Progression is not safely idempotent

`applyPlayerProgression()` has no unique player/season development event. It writes players in multiple parallel batches outside one durable development transaction.

If the transition crashes after some batches and is retried:

- completed players may progress twice
- unfinished players may progress once
- the league can have a mixed, unverifiable offseason

The global advance lock is currently process-local, as documented in the larger app audit. Progression must protect itself with database idempotency even after advance locking is fixed.

### 3.9 Randomness is not reproducible

The current engine uses `Math.random()`. The same save state and offseason can produce different player outcomes after a retry or restore.

### 3.10 Potential has inconsistent types in repair paths

Player potential is an integer field. At least one roster-health filler path writes `potential: "D"`. All paths must use the same numeric representation and convert grades only for display.

### 3.11 Existing tests are insufficient

The main season-flow assertion only proves that at least one returning player’s OVR changed. It does not test:

- grade ordering
- caps
- role parity
- archetype allocation
- negative outcomes
- determinism
- double application
- long-run talent drift
- stored OVR consistency

---

## 4. New development model

### 4.1 Canonical meanings

| Concept | Meaning | Visible? | Changes? |
|---|---|---:|---:|
| Ratings | Current baseball ability | Yes | Through development/regression/editor |
| Potential | General ceiling and growth opportunity | Range while scouting; grade when known | Normally fixed |
| Baseball Archetype | Which baseball abilities are most likely and able to improve | Yes after scouting threshold; always on roster | Rare position conversion/editor change |
| Development Trait | Timing/volatility: Normal, Raw, Late Bloomer, Early Peaker | Hidden until highly scouted; visible on roster if league setting allows | Fixed |
| Work Ethic | Consistency and self-driven development | Scouted range; coach-visible on roster | Normally fixed |
| Coachability | Benefit gained from coaching/environment | Scouted range; coach-visible on roster | Normally fixed |
| Development Focus | Optional team/player emphasis | Coach-only setting | May change each offseason |

The existing database name `playerArchetype` conflicts with the visible baseball archetype. Rename its domain meaning to `developmentProfile` or `developmentTrait`. Keep legacy values for save compatibility:

- `normal` → Normal
- `raw` → Raw
- `late_bloomer` → Late Bloomer
- `overdraft` → Early Peaker in the roster UI

Add a separate `playArchetypeId` for the visible baseball archetype.

### 4.2 Potential should define caps, not direct decline

For new model V3, calculate a player’s base attribute ceiling:

```ts
baseCap = round(55 + 0.82 * (potential - 50));
```

Illustrative results:

| Potential | Base cap before archetype |
|---:|---:|
| 50 | 55 |
| 59 | 62 |
| 71 | 72 |
| 83 | 82 |
| 91 | 89 |
| 95 | 92 |
| 98 | 94 |
| 99 | 95 |

Each attribute cap then receives:

- archetype modifier
- position modifier where needed
- deterministic player-specific variance from -2 to +2
- hard domain clamp from 1 to 100

Recommended archetype cap modifiers:

| Archetype relationship | Cap modifier |
|---|---:|
| Primary | +6 |
| Secondary | +2 |
| Position core | 0 |
| Weakness | -4 |
| Irrelevant | no development |

The effective cap is never lower than the player’s rating when V3 is first assigned:

```ts
effectiveCap = max(currentRatingAtMigrationOrSigning, calculatedCap);
```

This prevents a migration from degrading existing players. A rating already above its calculated cap simply has no normal growth room. It does not fall unless a real regression event occurs.

Persist the cap snapshot. Do not recalculate active-player caps whenever code constants change.

### 4.3 New-potential distribution

Replace the current future-class distribution with a moderately correlated star/potential model:

```ts
potential = clamp(
  round(76 + starOffset + profileOffset + normalRandom(0, 9)),
  50,
  99
);
```

Starting star offsets:

| Stars | Offset |
|---:|---:|
| 1 | -6 |
| 2 | -3 |
| 3 | 0 |
| 4 | +3 |
| 5 | +6 |

Starting profile/special modifiers:

- Normal: 0
- Raw: +2 with extra variance
- Late Bloomer: +8, or preserve the existing 90–99 special band
- Early Peaker/Overdraft: -14, or preserve the existing 50–57 band
- Gem: +8
- Bust: -10
- Generational Gem: +15
- Generational Bust: -20

Do not make current rating and potential perfectly correlated. Hidden gems, polished low-ceiling players, and raw high-ceiling projects should remain possible.

Initial calibration targets for generated cohorts:

- mean numeric potential: 74–78
- A-range: approximately 7–12%
- B-range: approximately 35–45%
- C-range: approximately 35–45%
- D/F: approximately 10–18%
- correlation between current OVR and potential: positive but below 0.55

Treat these as tuning bands. The 10-season league-talent tests determine final values.

Do not rewrite existing dynasty potential silently. New dynasties use V3. Existing dynasties may upgrade at offseason, preserving existing numeric potential but generating caps and archetypes under V3.

### 4.4 Annual growth budget

Development should allocate attribute points rather than request a direct OVR increase.

Starting base point budget by potential:

| Potential | Base development points |
|---|---:|
| A+ | 24 |
| A | 21 |
| A- | 18 |
| B+ | 15 |
| B | 12 |
| B- | 10 |
| C+ | 8 |
| C | 6 |
| C- | 5 |
| D+ | 4 |
| D | 3 |
| D- | 2 |
| F | 1 |

Apply these multiplicative factors:

```ts
points = basePoints
  * classMultiplier
  * workEthicMultiplier
  * coachabilityMultiplier
  * facilitiesMultiplier
  * developmentTraitMultiplier
  * opportunityMultiplier
  * remainingGapMultiplier
  * seededVariance;
```

Starting factors:

#### Class

- FR: 1.10
- SO: 1.05
- JR: 0.95
- SR: no offseason progression because the player departs; redshirt rules should be modeled explicitly rather than treating `RS` as a grade

#### Work ethic

```ts
workEthicMultiplier = clamp(0.65 + workEthicScore / 200, 0.75, 1.15);
```

Score 70 equals 1.00.

#### Coachability

```ts
coachabilityMultiplier = clamp(0.825 + coachability / 400, 0.85, 1.075);
```

Score 70 equals 1.00.

#### Facilities

Use a smooth curve rather than making ratings 1–6 identical:

| Facilities | Multiplier |
|---:|---:|
| 1 | 0.92 |
| 2 | 0.94 |
| 3 | 0.96 |
| 4 | 0.98 |
| 5 | 1.00 |
| 6 | 1.02 |
| 7 | 1.04 |
| 8 | 1.06 |
| 9+ | 1.08 |

Facilities must help, but should not overpower potential and archetype.

#### Opportunity

- limited role: 0.95
- rotation/platoon: 1.00
- regular starter: 1.05

Keep this effect small so a backup can still develop.

#### Remaining cap gap

Measure remaining room only across relevant, non-capped attributes:

```ts
remainingGapMultiplier = 0.35 + 0.65 * sqrt(clamp(avgRemainingGap / 40, 0, 1));
```

A player near all caps naturally slows and eventually plateaus.

#### Development trait timing

| Trait | FR | SO | JR | Variance |
|---|---:|---:|---:|---:|
| Normal | 1.00 | 1.00 | 1.00 | ±10% |
| Raw | 0.80 | 1.05 | 1.20 | ±25% |
| Late Bloomer | 0.65 | 0.90 | 1.30 | ±20% |
| Early Peaker | 0.80 | 0.70 | 0.60 | ±10% |

Early Peaker means plateau risk, not automatic catastrophic regression.

### 4.5 Upgrade cost curve

Higher ratings should cost more development points:

| Current rating | Cost for +1 |
|---:|---:|
| 1–79 | 1 |
| 80–89 | 2 |
| 90–94 | 3 |
| 95–99 | 4 |

This produces diminishing returns and prevents a high-potential player from maxing several attributes in one offseason.

### 4.6 Archetype allocation weights

For each affordable development step, choose among eligible ratings using deterministic weighted selection:

| Relationship | Growth selection weight | Regression selection weight |
|---|---:|---:|
| Primary | 3.0 | 0.35 |
| Secondary | 1.6 | 0.75 |
| Position core | 1.0 | 1.00 |
| Weakness | 0.35 | 1.50 |
| Irrelevant | 0 | 0 |

Skip capped attributes and redistribute selection to other relevant ratings. Two players with the same archetype should usually emphasize the same skills but receive different exact deltas.

### 4.7 OVR calibration targets

The engine spends attribute points. OVR remains a derived output, not an input. Use these only as statistical acceptance bands when at least 35% cap room remains:

| Potential | Typical annual OVR band |
|---|---:|
| A+ | +26 to +40 |
| A | +22 to +34 |
| A- | +18 to +30 |
| B+ | +14 to +24 |
| B | +10 to +20 |
| B- | +8 to +16 |
| C+ | +5 to +12 |
| C | +3 to +9 |
| C- | +2 to +7 |
| D+ | +1 to +5 |
| D | 0 to +4 |
| D-/F | 0 to +3 |

Normal one-offseason growth should not exceed +50 OVR. A specifically logged Late Bloomer/Generational breakout may reach +75. Values above those limits indicate an OVR curve or allocation bug.

Pitchers and hitters with the same potential, cap gap, class, traits, and environment should have mean OVR growth within 15% of each other across a large sample.

### 4.8 Regression is a separate engine

Potential alone must not create regression.

Valid regression triggers:

- major or lingering injury
- very poor conditioning/recovery when that system exists
- repeated severe fatigue/overuse
- very low work ethic combined with an adverse offseason event
- position conversion and skill rust
- an explicitly modeled Early Peaker plateau event
- commissioner edit

Routine college-age regression should be rare and small:

- ordinary adverse event: 1–5 total rating points
- serious injury: up to 12 total points with an injury-specific allocation
- no unlogged annual -25 to -40 OVR outcomes

Archetype regression weights normally protect the player’s primary identity and expose weaknesses first. Context overrides this rule:

- a hamstring injury can reduce Speed/Running even for a Speed-Power Outfielder
- an elbow/shoulder injury can reduce Velocity/Arm
- overuse can reduce Stamina/Recovery
- a defensive position conversion can temporarily affect Fielding/Error Resistance

Every regression requires a reason code and a development event visible in history.

---

## 5. Baseball archetype catalog V1

The catalog should be data-driven in `shared/playerArchetypes.ts`, not distributed through route conditionals.

Each archetype defines:

```ts
type PlayerArchetype = {
  id: string;
  label: string;
  description: string;
  eligiblePositions: string[];
  primary: DevelopmentAttribute[];
  secondary: DevelopmentAttribute[];
  weaknesses: DevelopmentAttribute[];
  positionCore: DevelopmentAttribute[];
  abilityAffinities?: string[];
  iconKey: string;
  colorToken: string;
};
```

### 5.1 Pitchers — P, SP, RP, CP

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Power Ace | Velocity, Heater, high-quality pitch development | Control, Poise | Recovery, fielding |
| Command Artist | Control, Poise, W/RISP, Vs Lefty | secondary pitch quality, Recovery | raw Velocity |
| Movement Specialist | existing pitch levels, pitch diversity, derived Stuff | Control, Poise | Stamina, fielding |
| Workhorse | Stamina, Recovery, Grit, Control | Velocity, Poise | pitch diversity |
| High-Leverage Power | Velocity, Heater, Poise, Recovery | Control, pitch quality | Stamina |
| High-Leverage Finesse | Control, movement, Poise, Vs Lefty, Recovery | W/RISP | Velocity, Stamina |

Pitching role and archetype are separate. A Power Ace can be used in relief, and a High-Leverage Power player can be developed into a starter if stamina eventually permits it.

### 5.2 Catchers — C

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Field General | Catcher Ability, Poise, Throwing, Error Resistance | Contact, Fielding | Speed, Power |
| Power Backstop | Power, Clutch, Arm | Catcher Ability, Contact | Speed, Running |
| Contact Receiver | Contact, Vs LHP, Catcher Ability, Error Resistance | Fielding, Clutch | Power, Speed |
| Athletic Catcher | Speed, Running, Arm, Fielding, Contact | Throwing, Error Resistance | Power, Catcher Ability |

### 5.3 Corner infield and DH — 1B, 3B, DH

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Middle-Order Slugger | Power, Clutch, W/RISP | Contact, Vs LHP | Speed, Stealing |
| Pure Hitter | Contact, Vs LHP, Clutch | Power, Error Resistance | Speed, Arm |
| Two-Way Corner | Power, Arm, Fielding, Error Resistance | Contact, Throwing | Speed, Stealing |
| Defensive Anchor | Fielding, Error Resistance, Arm, Throwing | Contact, Recovery | Speed, Power |

### 5.4 Middle infield — 2B, SS

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Table Setter | Contact, Speed, Running, Stealing | Vs LHP, Error Resistance | Power |
| Defensive Wizard | Fielding, Error Resistance, Arm, Throwing, Agile | Contact, Speed | Power, Clutch |
| Power-Speed Infielder | Power, Speed, Arm | Fielding, Contact, Running | Error Resistance |
| Contact Technician | Contact, Vs LHP, Clutch, Error Resistance | Agile, Fielding | Power, Arm |

### 5.5 Outfield — LF, CF, RF, OF

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Speed-Power Outfielder | Power, Speed, Running, Stealing | Contact, Arm | Error Resistance |
| Center-Field Catalyst | Speed, Fielding, Error Resistance, Running | Contact, Arm | Power |
| Corner Masher | Power, Contact, Clutch, W/RISP | Arm, Vs LHP | Speed, Stealing |
| Cannon Defender | Arm, Throwing, Fielding, Error Resistance | Power, Recovery | Contact, Stealing |
| Five-Tool Outfielder | Contact, Power, Speed, Arm, Fielding | Error Resistance, Running | none; lower specialization weight across all primaries |

Five-Tool is a balanced development path, not a guarantee of elite ratings. Potential determines whether the player can actually become elite in all five tools.

### 5.6 Utility — all nonpitchers

| Archetype | Primary | Secondary | Lower emphasis |
|---|---|---|---|
| Super Utility | Contact, Fielding, Error Resistance, Arm, Speed, Agile | Running, Throwing, Recovery | Power |

Super Utility receives a smaller position-conversion penalty and can retain its archetype across compatible nonpitcher moves.

### 5.7 Pitch development specifics

Do not increase `stuff` while ignoring the pitch mix that drives pitcher OVR.

Recommended V1 behavior:

- `stuff` becomes a derived summary of pitch quality/diversity, recalculated after pitch changes.
- Existing pitch upgrade cost:
  - level 1→2: 2 points
  - 2→3: 2
  - 3→4: 3
  - 4→5: 4
  - 5→6: 5
  - 6→7: 6
- Learning a new pitch costs six points, requires available arsenal capacity, and may happen at most once per offseason.
- Movement Specialist receives the highest new-pitch/grade weight.
- Command and Finesse types favor command and existing pitch refinement.
- Power types favor Velocity/Heater before repertoire breadth.
- Fastball binary fields remain binary.
- Never add or raise a pitch outside its legal 0–7 domain.

### 5.8 Abilities

For the first release, archetypes should govern ratings only. Do not simultaneously redesign special abilities unless tests already cover them.

Later, `abilityAffinities` may unlock an eligible blue ability when a player crosses an attribute threshold and has an available ability slot. Gold abilities should remain rare and milestone-based. Ability changes must be deterministic and logged.

---

## 6. Archetype assignment and persistence

### 6.1 Generated recruits

Preferred order:

1. Choose position.
2. Choose a valid baseball archetype using position-aware distribution.
3. Generate current ratings with mild archetype bias.
4. Generate potential/development trait/work ethic/coachability.
5. Generate persistent caps.
6. Derive scouting `tools` from current strengths.

This makes current ability and future path related without making them identical. Allow approximately 15% of recruits to have an atypical mismatch—such as a currently speedy player with a future Cannon Defender path—to preserve scouting discovery.

### 6.2 Existing catalog and legacy players

Backfill deterministically:

1. Collect eligible archetypes for the player’s position.
2. Normalize current relevant ratings against position-group means.
3. Score each archetype using its primary and secondary ratings.
4. Add existing `tools` as a small bonus.
5. Break ties with a stable hash of player ID.
6. Persist the result and generated caps.

Running the backfill twice must produce the same result.

### 6.3 Signed recruits

The recruit-to-player copy service must preserve:

- `playArchetypeId`
- renamed `developmentProfile`
- potential
- development caps and seed
- work ethic
- coachability
- tools
- trajectory
- complete pitch mix
- abilities
- complete appearance
- source recruit ID
- signing OVR

Create one shared conversion function and use it for humans, CPU signing, transfers, JUCOs, and any commissioner import.

### 6.4 Walk-ons and emergency fillers

- Walk-ons receive numeric potential, work ethic, coachability, archetype, caps, and seed when created.
- Emergency fillers use numeric potential such as 59 for displayed D, never string `"D"`.
- Filler development is limited but stable; it must not automatically lose 10–20 OVR each offseason.

### 6.5 Transfers

Transfers retain archetype, development trait, caps, seed, work ethic, coachability, and development history. A new school changes environment multipliers, not player identity.

### 6.6 Position changes

- Compatible move inside an archetype’s eligible set retains archetype.
- Incompatible moves require a new valid archetype selection.
- Apply a one-off 0.85 position-transition development multiplier for one offseason.
- Preserve the old archetype in history.
- Never silently recalculate past seasons.

### 6.7 Commissioner editing

Integrate with the planned League Editor:

- Baseball archetype is a competitive player field.
- Primary commissioner or permitted co-commissioner may edit it.
- Multiplayer default: change becomes effective next offseason.
- Immediate override requires a warning and public reason.
- Potential, development trait, caps, and archetype edits are structured and auditable.

---

## 7. Data model and rules snapshot

### 7.1 Players

Add:

```text
play_archetype_id text not null
development_profile text not null default 'normal'
development_caps jsonb not null
development_seed text not null
development_model_version integer not null default 3
archetype_catalog_version integer not null default 1
development_focus text not null default 'archetype'
last_development_season integer
position_transition_season integer
```

Keep `progression_deltas` as the most recent summary for existing UI compatibility, but do not use it as the authoritative history/idempotency marker.

### 7.2 Recruits

- Rename code/domain use of `player_archetype` to `development_profile` through an additive migration or compatibility mapping.
- Add the same `play_archetype_id`, caps, seed, and model/catalog versions.
- Keep `tools` as scouting descriptors, not the visible development path.

If renaming the physical column is risky, keep the existing column temporarily and expose it through schema code as `developmentProfile`. Do not use one column for both meanings.

### 7.3 Walk-ons

Add:

- `play_archetype_id`
- `development_profile`
- `development_caps`
- `development_seed`
- `work_ethic_score`
- `coachability`
- `tools`
- numeric potential constraint

### 7.4 Development event history

Create:

```text
player_development_events
  id
  league_id
  player_id
  season
  model_version
  archetype_id
  development_profile
  potential_at_event
  eligibility_at_event
  seed
  factors_json
  caps_json
  before_ratings_json
  deltas_json
  after_ratings_json
  ovr_before
  ovr_after
  regression_reasons_json
  created_at

UNIQUE (league_id, player_id, season, model_version)
```

This unique key prevents double development.

### 7.5 League rules

Freeze in `rulesSnapshot`:

- player development model version
- archetype catalog version
- potential distribution version
- cap formula version
- factor tables
- maximum growth/regression limits

Deploying code must not silently change an active dynasty’s model.

---

## 8. Engine architecture

Create pure modules:

```text
shared/playerArchetypes.ts
shared/playerDevelopmentRules.ts
server/services/playerDevelopment/
  assignArchetype.ts
  buildCaps.ts
  computeGrowthBudget.ts
  allocateGrowth.ts
  computeRegression.ts
  developPitcher.ts
  validateDevelopment.ts
  runSeasonDevelopment.ts
```

### 8.1 Deterministic seed

```ts
seed = hash(leagueId, season, playerId, developmentModelVersion);
```

Use a seeded PRNG passed explicitly through pure functions. Do not call `Math.random()` inside development.

### 8.2 Transition order

Recommended offseason order:

1. Resolve graduates, draft decisions, and portal departures.
2. Lock the returning-player snapshot.
3. Create/reserve development-event keys.
4. Compute development/regression for returning players.
5. Validate every result.
6. Commit ratings and events atomically or through an idempotent staging/finalization process.
7. Add the new recruiting class/transfers/walk-ons without immediately progressing them.
8. Finalize roster cuts and lineups.

### 8.3 Transaction and crash behavior

For a 149-team league, one enormous transaction may be undesirable. Use an idempotent staged job:

- create one development run row for league/season/model
- reserve unique event rows for all returning players
- compute deterministic results in chunks
- write each player only if its event is not finalized
- mark run complete only after every expected player event is finalized
- phase cannot advance while run is incomplete
- retry resumes missing players and returns existing results for completed players

No player can receive two events for the same season/model.

### 8.4 OVR and star rating

1. Fix `calculateOVR` monotonicity first.
2. Apply only actual rating changes.
3. Recalculate OVR once from final attributes.
4. Recalculate star rating from OVR.
5. Assert stored OVR equals pure recalculation.

Remove the potential-grade OVR floor. If ratings rose but OVR fell, the OVR function/test is broken and the transaction should fail.

### 8.5 OVR monotonicity repair

For pitcher linked gold/common ratings, use the same principle as the hitter calculation:

- retain the S common contribution
- suppress the linked gold contribution when the S row already represents it, or otherwise use `max(common contribution, gold replacement)`
- never remove a contribution simply because the underlying rating increased

Add property tests before choosing the exact implementation.

---

## 9. User experience

### 9.1 Player profile

Header:

```text
Marcus Hill • CF • SO
OVR 387 (+28)   Potential A+   Speed-Power Outfielder   Late Bloomer
```

Development panel:

- archetype description
- Primary Growth: Power, Speed, Running, Stealing
- Secondary Growth: Contact, Arm
- Development trait and timing
- current/cap bars by skill group
- last-offseason deltas
- reasons/factors: potential, work ethic, facilities, opportunity, cap pressure

Do not expose exact hidden recruit potential/caps before scouting unlocks them.

### 9.2 Roster

Add sortable/filterable columns:

- Archetype
- Potential
- Development trait
- Last OVR change
- Cap status: Developing / Near Ceiling / At Ceiling

College Football 27 surfaces development traits and skill groups in roster/player views; the useful lesson is to make development information easy to scan, not buried in an offseason log.

### 9.3 Recruiting

Recommended reveal levels:

- 0–24%: position and current visible ratings only
- 25%: likely baseball archetype family
- 50%: exact baseball archetype
- 70%: potential range and likely primary caps
- 85%: development trait, work ethic, coachability ranges
- 100%: exact known scouting report, subject to evaluation-skill accuracy rules

The exact thresholds should use the existing scouting system’s canonical reveal service.

### 9.4 Offseason development report

Provide:

- biggest breakouts
- players near/at caps
- regression and reason
- pitcher/hitter development split
- archetype-group results
- team development summary
- comparison to conference/national average

For each player, show rating-by-rating deltas and cap status, not only OVR.

### 9.5 Optional coach agency

V1 can be fully automatic. A later safe enhancement is one team development emphasis per offseason:

- Follow Archetypes
- Hitting
- Power
- Speed & Defense
- Pitching Velocity
- Pitching Command
- Balanced

Keep the modifier around ±5%. CPU teams select based on roster need. Do not give humans a resource advantage in 14-team multiplayer.

---

## 10. Required tests

### 10.1 OVR invariants — P0

- For every developable rating and representative boundary values, increasing a rating by one cannot lower OVR when all other inputs are fixed.
- Explicitly test 19→20, 39→40, 49→50, 59→60, 69→70, 79→80, 89→90, 90→91, 94→95, and 99→100.
- Test linked gold/common pitcher abilities at every threshold.
- Stored OVR always equals `calculateOVR(stored attributes)`.
- Star rating always equals `getStarRatingFromOVR(overall)`.

### 10.2 Potential semantics

- Potential never directly creates a negative rating change.
- With all factors/gaps equal over many seeds, higher potential stochastically dominates lower potential.
- A player at cap plateaus instead of exceeding the cap.
- A legacy rating above calculated cap is preserved until a genuine regression event.

### 10.3 Archetype allocation

- Every player/recruit/walk-on has exactly one valid archetype.
- Archetype is valid for position.
- Primary ratings receive the largest share over large samples.
- Irrelevant ratings receive no points.
- C develops Catcher Ability.
- Pitchers develop pitch mix/command/durability instead of hitter ratings.
- Speed-Power Outfielder sample demonstrates faster Power/Speed growth than Defense across 10,000 seeds.

### 10.4 Determinism and idempotency

- Same league/season/player/model inputs return byte-identical deltas.
- Retry after every chunk boundary never double-progresses a player.
- Two server workers produce one event per player.
- Restore and rerun reproduces the same outcome when the same development event is intentionally replayed.

### 10.5 Role parity

For matched synthetic players across 10,000 seeds:

- pitcher and hitter mean OVR growth differs by no more than 15%
- no role has more than double the no-growth rate of another unless more players are at caps
- archetypes within a position have different rating shapes but comparable total value bands

### 10.6 Distribution calibration

Generate at least one million potentials across star/profile combinations:

- means and grade distributions meet target bands
- A+ remains rare
- gems and busts remain discoverable
- current OVR/potential correlation remains below 0.55

### 10.7 Persistence

- Recruit signing preserves archetype, trait, tools, trajectory, caps, seed, work ethic, coachability, pitches, abilities, appearance, source ID, and signing OVR.
- Transfer preserves development identity/history.
- Commissioner edit writes structured audit and affects only the configured effective season.
- Save/export/restore preserves all development fields and events.

### 10.8 Full Season soak

Run at least 100 seeded 10-season 149-team dynasties and report annually:

- mean/median OVR by position and class
- potential distribution
- OVR change by potential/archetype/role
- percentage at caps
- star distribution
- pitcher/hitter parity
- breakouts and regressions
- talent distribution by prestige/facilities
- roster health
- draft/portal/departure outcomes

Acceptance:

- national mean OVR after season 5 and season 10 remains within ±3% of the calibrated target
- no initial-roster talent cliff when generated classes replace catalog players
- no position group drifts more than ±5% without an intentional rule
- no ordinary offseason change above +50 or below -5
- no unexplained regression
- no double development event

### 10.9 14-team multiplayer soak

- all teams use the same frozen development rules
- commissioner advance/retry is deterministic
- CPU and human teams receive identical environment formulas
- no hidden human/CPU bonus
- public development history supports commissioner dispute resolution
- changing a commissioner-edited archetype follows permission/effective-season rules

---

## 11. Migration and rollout

### Phase 0 — Freeze and measure

- Add the current audit script as a supported test utility.
- Capture catalog/future-class distributions and 10-season baseline.
- Fix the general repository typecheck blockers from the larger plan.

### Phase 1 — Correctness prerequisites

- Fix OVR monotonicity.
- Add OVR property tests.
- Normalize potential to numeric values in every creation/import/repair path.
- Create one recruit-to-player conversion service and preserve all fields.
- Add deterministic RNG utilities.

Do not begin archetype tuning until Phase 1 is green.

### Phase 2 — Data foundation

- Add archetype catalog.
- Add V3 player/recruit/walk-on fields.
- Add development event/run tables and unique keys.
- Backfill existing players deterministically.
- Generate/persist caps without changing ratings.
- Add compatibility mapping from existing recruit `playerArchetype` to `developmentProfile`.

### Phase 3 — Shadow engine

- Run old and new development on copied player snapshots.
- Persist/report V3 results without mutating live ratings.
- Compare position, grade, archetype, and cohort distributions.
- Tune until acceptance bands pass.

### Phase 4 — V3 activation

- New Full Season and Custom dynasties default to V3.
- Existing leagues remain on their frozen version.
- Offer commissioner upgrade only during offseason with a preview of expected effects.
- Upgrade generates caps/archetypes but does not immediately progress players.

### Phase 5 — UI

- Player profile, roster columns, recruiting reveal, offseason report, and commissioner editor integration.
- Add accessibility and responsive tests.

### Phase 6 — Long-run certification

- 100 × 10-season Full Season soaks.
- 14-team multiplayer concurrency/restore test.
- Publish aggregate tuning output with the Replit handoff.

---

## 12. Definition of done

This feature is complete only when:

- OVR is monotonic for rating increases.
- Stored OVR always matches ratings.
- Potential is a ceiling/growth input, not an automatic decline command.
- Initial and future cohorts no longer create a talent cliff.
- Every player, recruit, transfer, walk-on, and filler has a valid persisted baseball archetype.
- Existing hidden Raw/Late Bloomer/Overdraft meaning survives under `developmentProfile` and is not confused with baseball archetype.
- An A+ Speed-Power Outfielder develops Power and Speed materially faster than unrelated ratings over large samples.
- Catchers and pitchers develop their actually relevant skills.
- Pitcher/hitter development is statistically comparable.
- Regression has an explicit reason and reasonable magnitude.
- Development is deterministic, idempotent, versioned, and auditable.
- Recruit-to-player conversion preserves all development identity.
- Both 149-team and 14-team multi-season soaks pass.
- Replit provides commands, outputs, distributions, migration notes, screenshots, and unresolved deviations.

---

## 13. Replit handoff prompt

> Implement `REPLIT_PLAYER_PROGRESSION_AND_ARCHETYPES_PLAN.md` as a versioned replacement for the current progression function. Start with OVR monotonicity, potential type consistency, signed-recruit field preservation, deterministic RNG, and development idempotency. Do not tune archetypes on top of the current non-monotonic OVR behavior. Preserve the existing recruit `normal/raw/late_bloomer/overdraft` concept under the new name `developmentProfile`; create a separate visible `playArchetypeId`. Run the V3 engine in shadow mode against catalog and generated cohorts before activating it. Do not claim completion until pitcher/hitter parity, archetype allocation, 10-season Full Season stability, 14-team multiplayer determinism, and every Definition of Done item pass with published test output.

