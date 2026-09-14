# Gameplay systems, economy, and baseball audit

Date: 2026-09-14. Source: `8a1e113070c1e809da83cc66fc7eb84ffb9bec21` (fresh main). Review lenses: Banks Gameplay Systems & Economy Designer; Passan Baseball Expert. This is an analytical role review, not a claim that outside people reviewed the project. Scope: source inspection plus isolated pure-function probes; no database, live league, production account, or source mutation. Paths and one-based lines refer to this commit.

## Verdict

The breadth of systems promises a substantially deeper baseball game than the match engine currently delivers. The biggest problem is not a shortage of features. It is that decisions, baseball events, statistics, and long-term consequences do not consistently describe the same reality. A manager can rearrange a lineup without changing the quick-sim result model; the starter credited in the box can differ from the starter used to determine the score; a championship promise can be broken after winning the championship because fulfillment is random. Those failures undermine every polished screen layered above them.

The standalone simulation is not yet trustworthy enough for a serious dynasty. The Power Pros companion is a valuable direction, but it must use reported evidence and explicit house rules as its authority. Synthetic stats, approximations, and random promise judgments must never masquerade as verified league history. Ship one coherent competitive record, with simulation and external reporting as two clearly distinguished ways of supplying that record.

Severity: P1 means a major trust/gameplay failure to fix before relying on the affected mode; P2 means significant depth, balance, or clarity deficiency. SYS-01 and SYS-02 are immediate simulation release blockers. “Proven” means direct code evidence; “probed” means executed extracted source; “design judgment” and “hypothesis” are explicitly labeled. These are not findings from an end-to-end deployed playtest.

## Executed evidence

Reproduction: run `node docs/audits/2026-09-14/evidence/systems-baseball-probes.cjs` from this checkout. Script and machine-readable output are retained in [`evidence/systems-baseball-probes.cjs`](evidence/systems-baseball-probes.cjs) and [`evidence/systems-baseball-probes.json`](evidence/systems-baseball-probes.json). Output includes source SHA-256 hashes and all extraction/stubbing caveats. No dependency installation is needed. The expected scoring starter in the rest probe is derived from the inspected source branch; the returned box starter is directly observed.

Used existing Node v24.19.0 and `node:module.stripTypeScriptTypes`, with `node:vm`, to execute only the actual source of `simulateGameWithRosters`, `generateBoxScore`, and `shared/pitcherRest.ts`. No application imports or storage calls were executed. Fixtures used nine hitters with ratings 60 / OVR 300 and seven pitchers with ratings 60 / OVR 300, roles FRI/SAT/SUN/MID/MR1/MR2/CP. Randomness was replaced with an LCG, initial seed 1, recurrence `seed = (Math.imul(seed,1664525)+1013904223) >>> 0`, divided by 4294967296.

Across 1,000 games:

| Failed accounting check, on either team | Games affected |
| --- | ---: |
| Pitching outs not equal to the engine's allocated 27 | 963 |
| Opponent batting H differs from pitching H | 988 |
| Opponent batting BB differs from pitching BB | 943 |
| Opponent batting K differs from pitching K | 999 |
| Opponent batting HR differs from pitching HR | 914 |
| Sum of individual runs differs from team score | 261 |

The 27-out check tests the current generator's own always-nine-innings structure, not a complete baseball legality validator: a proper engine must also handle an unplayed bottom ninth, walk-offs, and extras. First fixture game was away 3, home 4, with 29 outs assigned to home pitching. Same seed 42 with the batting order reversed yielded the same 3–2 score. A separate rest fixture made FRI pitcher `hp0` unavailable after 27 outs on Wednesday of week 1: the scoring path selected rested SAT pitcher `hp1`, but the generated box credited `hp0` as starter.

A second probe executed actual `fullSeasonScheduler.ts` with actual `shared/catalog/{teams,conferences}.ts`, synthetic IDs preserving catalog order, season 1, seed 0. Output: 149 teams, 4,172 games, **zero validation errors**, but **2,086 team/week/gameType groups contained multiple games**, with a maximum of four. Conference series all carry `weekend`; conference-bye teams receive multiple `midweek` games. This is not merely a hypothetical custom-league problem.

## Findings and required corrections

### SYS-01 — P1: Generated box scores are not accounts of the game [probed]

Evidence: `server/routes/simulation.ts:565–579` samples final scores first, then calls a separate box generator. `:740–806` creates batting hits/walks/K independently. `:941–1001` independently creates opposing pitching hits/walks/K/HR. `:949–961` allocates nine **full** innings and then adds random fractional outs for each pitcher. `:830–835` can decrement `runsLeft` twice while leaving the batter's run count at one; the later fix only removes excess, not missing runs (`:879–887`). `:1020` samples team errors separately from player errors.

Impact: game logs, career records, ERA, WHIP, awards, recaps, player comparison, fatigue, and league disputes rest on contradictory facts. A 4–3 win can have nine and two-thirds defensive innings. Fixing visual totals alone would hide the defect.

Correction: a pure baseball state transition engine must produce plate-appearance/baserunning events; a single reducer must derive score, innings, batting, pitching, fielding, pitcher responsibility, and rest. Quick sim should batch those same events without animation. Reject impossible ledgers before finalization.

Acceptance: property checks over at least 100,000 seeded games: batting H/BB/K/HR equal opponent allowed values; runs reconcile; legal outs; runner conservation; no plate appearance after game end; pitcher responsibility reconciles; aggregate and replay reducers match. Add fixtures for a walk-off with fewer than three outs, no bottom ninth, inherited runners, and extras.

### SYS-02 — P1: Full-season schedule bypasses the rotation/rest model [probed + proven]

Evidence: `server/services/schedule/fullSeasonScheduler.ts:520–533` writes all three series games with `gameType: "weekend"`. OOC output at `:284–295` writes every game as `midweek`, including four-game bye-week allocations. `server/services/schedule/createScheduleForSeason.ts:262–263` directly inserts generated values. `shared/pitcherRest.ts:9–14` recognizes only midweek/friday/saturday/sunday. `server/routes/simulation.ts:432–437` disables availability checks when that mapping is absent; `:5165`, `:5203` place unknown weekend games into a single day bucket. `:5228–5246` simulates every conflict-free batch before finalizing any game's rest changes. Partitioning prevents simultaneous team calls but does not make usage visible between those simulations.

Impact: the signature 56-game mode does not actually play a Fri/Sat/Sun rotation. The best starter can be reused for the entire series, and unknown rest slots fall back to Wednesday (`server/game-engine.ts:283–287`). Schedule validation says this is healthy.

Correction: separate `gameKind` from actual ordered calendar slot. Assign all games an unambiguous day and doubleheader index, preserve series number, and use that calendar for scheduling, starter selection, rest, reporting, and advancement. Commit each team-conflicting game before calculating its next game. Validate calendar feasibility, not only counts.

Acceptance: full catalog schedules across many seeds have legal team/day capacity, three distinct series slots, explicit bye-week allocation, and correct FRI/SAT/SUN starter usage. A same-day doubleheader consumes first-game pitcher availability before game two. The existing zero-error fixture must be rejected until normalized.

### SYS-03 — P1: Quick-sim lineup decisions barely exist in the result model [proven]

Evidence: `server/routes/simulation.ts:483–489` averages **all** non-pitcher roster OVR for offense. `battingOrder` is consulted only later in the invented box (`:686–701`). No active-lineup strength is passed into scoring.

Impact: benching the best hitter, reversing the order, and platooning do not change quick-sim expected runs as they should. Signing a weak reserve lowers the entire team's attack even if that reserve never plays. Conversely, a star on the bench boosts the attack. This punishes roster depth and makes lineup screens misleading.

Correction: lineup validation and lineup choice must precede game simulation; offense uses only actual participants. Model defense by assigned defensive position. Let bench quality matter when a substitute actually enters.

Acceptance: seeded paired tests show that changing only an unused bench player leaves the game invariant; replacing an active hitter changes the distribution; swapping lineup slots changes who takes plate appearances; valid position assignments matter to fielding.

### SYS-04 — P1: Starter selection and fatigue use different realities [probed + proven]

Evidence: rested, OVR-sorted selection at `server/routes/simulation.ts:448–460` versus unsorted, rest-blind box selection at `:906–925`. `simulateGame` passes `undefined` for `pitcherFatigueIn` at `:641`, so the bullpen fatigue penalty at `:497–509` always gets empty maps on this wrapper path. Both scoring and box paths use `position === "P"`; shared helpers accept additional pitcher aliases (`shared/positions.ts:1–7`).

Impact: the wrong pitcher receives stats and rest; tired relief corps does not suffer the promised quick-sim penalty; imported SP/RP/CP aliases can be treated as hitters unless normalized upstream. Alias risk requires import-path validation; the first two defects are proven.

Correction: pick one legal roster/staff snapshot once, pass it to one engine, and return usage from that engine. Store workload on an actual game calendar, include zero-out outings with pitches, and use one canonical position normalization function.

Acceptance: scoring pitcher, event pitcher, box pitcher, and saved rest pitcher are identical; high recent bullpen workload changes the appropriate choices or effectiveness; aliases normalize on ingress; a pitcher allowing three walks and recording no out still accrues workload.

### SYS-05 — P1: Power-ball is a dominant quick-sim strategy [proven; dominance is design analysis]

Evidence: `server/routes/simulation.ts:532–560` adds +0.8 to the selecting team's expected runs for `power_ball`, subtracts 0.8 for `small_ball`, and applies no corresponding situational cost. The setting does not require power hitters or sacrifice any defense/strikeouts/other resource in this result formula. “Play Small Ball” coaching adds a separate free run bonus.

Impact: players eventually discover that an apparent stylistic choice is a difficulty modifier. Small-ball identity is mechanically punished even with the perfect personnel. There is no interesting tactical tradeoff.

Correction: strategy should change event selection and risk conditioned on personnel and situation: extra-base targeting versus strikeouts, steal/bunt attempts versus outs, pitching aggression versus walk/contact profiles. It should not grant unconditional runs.

Acceptance: strategy matrices over balanced, power, speed/OBP, and weak lineups identify no universal best setting; publish expected tradeoffs and calibration. Weak and strong teams should have different rational risk preferences.

### SYS-06 — P1: Promise fulfillment is random, including championships [proven]

Evidence: `server/offseason-helpers.ts:46–60` evaluates player promises by OVR and random probability. `:69–72` evaluates conference and CWS championship promises using random win-percentage multipliers. `:90–99` sends a player into the portal for a failed roll. The comment says per-game stats are not tracked, despite the game now maintaining season stats and finalizations.

Impact: a champion can be accused of breaking a championship promise. An unused player can be judged to have received promised performance. In a Power Pros league, documented user achievements can lose to an unrelated server coin flip. This is a direct breach of player trust.

Correction: store typed promise criteria, target and deadline; evaluate against authoritative season facts. Where reported data is insufficient, mark “unverifiable / commissioner review,” not met or broken. Save evidence for each evaluation.

Acceptance: winning a championship always fulfills its promise; losing never does; stat thresholds use verified stats; missing reports yield pending evaluation; replaying the same season never changes the outcome.

### SYS-07 — P1: Pitcher wins/losses do not mean pitcher of record [proven]

Evidence: `server/game-engine.ts:190–209` gives a win to the last pitcher listed and loss to whoever allowed the most ER. The atomic finalizer duplicates this at `server/game-finalizer.ts:608–623` and `:883–898`. An explicit pitching decision in an imported box is not used by these branches.

Impact: closers receive starter wins and actual losing pitchers escape losses. Sim and reported games share corrupted decision accounting.

Correction: for simulated games derive pitcher decisions from lead changes, eligibility, responsible runners, and relief rules. For external games accept explicit verified W/L/SV decisions from the report, validate one winner/loser where required, and leave unknown decisions null. Never guess using ER.

Acceptance: fixtures include starter 6 IP with permanent lead / closer saves, blown save followed by win, inherited winning run charged to departed pitcher, and a manual box with explicit decisions. All preserve correct W/L/SV.

### SYS-08 — P1: Play-by-play is a second incompatible simulator, not presentation [proven]

Evidence: quick-sim logic at `server/routes/simulation.ts:424–1052`, separate pitch/PA simulator at `:6168–6990`. PBP uses contact/power/trajectory/platoon/individual outcomes (`:6458–6497`); quick score uses whole-roster OVR and Poisson runs. PBP finalize forces HBP/SB/CS/pitcher HR/pitches/errors/fielding metrics to zero (`:7192–7253`). PBP is gated by `PBP_ENABLED` (`:7163`), so this is a conditional active-path risk, not an assertion it is live in production.

Impact: watching instead of quick-simming changes the sporting model and the richness/meaning of saved stats. Enabling PBP does not repair quick sim and creates mode-dependent career results.

Correction: one deterministic engine with selectable output/detail/rendering. Persist all events server-side and finalize by simulation ID, not client-supplied stats. Report ingestion uses the same normalized ledger and stat reducers, with explicit missing-data status.

Acceptance: same seed, lineups, rules, and decisions produce identical score/box in quick and watch modes. Saved season stats exactly match the replay. HBP/SB/CS and pitcher HR survive. Client content cannot change a completed simulation.

### SYS-09 — P1: PBP has baseball state/scoring errors [proven from branches; not live-tested]

Evidence:

- `server/routes/simulation.ts:6370` runs half-innings until three outs; there is no walk-off stop when the home team takes the lead in the ninth or extras (`:6912–6941`). The `isHome` half-inning argument does not implement that stop.
- `:6699–6708` double-play logic scores a third-base runner whenever pre-play outs < 2, including a one-out double play ending the inning, and can independently remove a runner from second without a corresponding third recorded out.
- `:6388–6402` intentional walks bypass batter/pitcher walk statistics via `continue`.
- `:6828–6842` caught stealing adds an inning out without adding the pitcher's out.
- `:6734–6743` credits RBI and ER for every `runsScored`, including errors and double plays, and assigns runs to the current pitcher without inherited-runner responsibility.
- `:6627`, `:6641` uses the **batter's** speed normalization for an existing runner's advancement on hits.
- `:6945–6978` resolves ties after inning 12 by inventing a run and a single after the simulated inning rather than continuing valid baseball state.

Impact: even the richer engine cannot yet be treated as an authoritative sports ledger. Match narratives can disagree with outs, earned runs, and final scores.

Correction: implement legal state transitions with explicit runner identity/responsibility, scoring decisions, and a game-over predicate. A house-rule inning cap must be explicit and must resolve within that rule, not fabricate a retroactive event.

Acceptance: focused transition tests for each bullet, with conservation of outs/runners/runs. No player can score twice from one base-state event; force-out third outs suppress runs; proper walk-off handling preserves home-run exceptions. Rules for automatic runners are configurable and labeled rather than embedded as universal “college baseball.”

### SYS-10 — P1: Awards and legacy reward ratings, not the season [proven]

Evidence: `server/routes/simulation.ts:1059–1110` selects All-Americans and All-Conference teams solely from roster OVR; `:5617` adds both sets to `coach.allAmericans`. Same duplicated helper exists in `server/game-engine.ts:337–390`. Neither accepts season stats or a minimum workload. Position slots use OF, while other lineup code uses LF/CF/RF.

Impact: an unplayed star can beat the league's best performer. A coach's All-American count includes conference awards. For externally played leagues this deprives results of their primary reward: recognition and historical meaning.

Correction: snapshot award ballots by season with criteria and eligibility. Distinguish performance awards, prospect rankings, All-Conference, and All-American counters. Normalize positions. Offer commissioner adjudication for missing data.

Acceptance: a zero-appearance player cannot earn a performance award; an actual exceptional season competes on that performance; All-Conference increments only that award; prior awards remain unchanged after player growth or graduation.

### SYS-11 — P2: National selection incentivizes record accumulation without opponent quality [proven model; design judgment]

Evidence: `server/services/postseason/selection.ts:18–39` fixes a 16-team field and weights win percentage 60%, conference win percentage 30%, and raw run differential 10%. Opponent strength does not enter the selection formula. `:132–160` fills at-large slots by this score. The catalog has 12 conferences, leaving only four at-large bids in the full-season preset.

Impact: full-season scope suggests national baseball authenticity but uses a compressed championship with little room for strong non-champions. Winning easier schedules can outperform difficult schedules. This can be a valid custom format, but the game needs to say so and explain selection transparently.

Correction: explicitly select “compressed dynasty” or a configurable larger tournament. Add schedule-strength/context and published tiebreaks, plus selection explanation and bubble view. For a Power Pros league allow commissioner-seeded brackets and rule presets instead of imposing a national model.

Acceptance: tests demonstrate that otherwise comparable records against stronger opponents are valued appropriately; every seed has a reproducible explanation; users see field size, autobids, and tiebreaks before season creation.

### SYS-12 — P2: Recruiting AI's high-potential strategy is partially dead [proven]

Evidence: `server/routes/simulation.ts:4650` compares `String(r.potential)` with `"A"`, `"B"`, `"B+"`, while recruit potential is an integer (`shared/schema.ts:631`). The other branch (`visibleOvr > stars*100`) treats current-rating noise as evidence of growth potential. `:4662–4666` does not add the computed visible OVR to the final score except indirectly through style bonus.

Impact: a scout-style CPU does not value revealed high potential as described. Team identity and difficulty labels risk becoming cosmetic. Star bands alone determine too much prospect-quality preference.

Correction: normalize potential through `getPotentialGrade`, use only actually revealed values, and separate current ability, expected growth, uncertainty, position need, affordability, and competition in the AI utility function. Record a readable reason for major CPU actions.

Acceptance: controlled fixtures with equal stars, interest, affordability, and needs show high-potential strategy favors a revealed A prospect over revealed F; unknown potential does not leak; current-quality strategy prefers genuinely better scouted ability.

### SYS-13 — P2: Recruiting design rewards clicking the best multiplier and protecting sunk cost [design judgment grounded in code]

Evidence: action gain multiplication at `server/routes/simulation.ts:338–404`; best-priority CPU selection at `:4680–4693`; final target score is `currentInterest*3 + offerBonus + need...` (`:4662–4666`); random single action per target at `:4710–4755`. Canonical signing picks highest accumulated eligible interest and resolves ties alphabetically (`server/signing-resolver.ts:119–128`).

Impact: raw interest becomes an overwhelming self-reinforcing signal. Repeated best-topic contacts can crowd out evaluation of roster fit, actual probability of winning, and marginal value. Alphabetical signing ties create a systematic team-name advantage. This is readable and deterministic, but not yet a rich recruitment negotiation.

Correction: preserve the shared action-cost and transaction architecture, but introduce diminishing returns to repeat pitches, recruit deadlines, explicit role/financial promises, visible uncertainty, and meaningful information-gathering tradeoffs. CPU should spend by marginal improvement in expected class value, with affordability and position coverage. Use a disclosed stable seeded tiebreak or substantive recruit preference, not team-name order.

Acceptance: same-cost recruiting policies are benchmarked across difficulty and program tiers; blindly repeating one topic is not universally optimal; ties have no alphabetical advantage; the CPU fills viable future roster roles without omniscience. Treat rates of missed classes and over-recruitment as measured telemetry, not assumed outcomes.

### SYS-14 — P2: Development has good structure but insufficient coaching agency [proven inputs + design judgment]

Evidence: V3 uses seeded per-player/season progression (`server/services/playerDevelopment/runSeasonDevelopment.ts:109–124`), budget from potential/profile/facilities/work ethic/coachability (`computeGrowthBudget.ts:55–102`), weighted allocation/caps (`allocateGrowth.ts:58–78`). Its inputs contain no playing time, innings, workload, training assignment, or season performance. Pitch quality gets a separate approximately 25% growth budget with one point per level (`runSeasonDevelopment.ts:265–284`) while general attribute upgrade costs increase at elite ratings (`allocateGrowth.ts:36–44`).

Impact: management largely means buying better potential/facilities and waiting. A documented development plan does not visibly connect to player use. Pitch quality may saturate quickly in high-potential cohorts; that is a balance hypothesis needing multi-season measurement, not a proven exploit.

Correction: add small, bounded coaching choices: one primary development goal, one role transition, a workload plan, and a mentor allocation. Separate readiness from long-term ceiling. Keep reproducibility and cap logic. Avoid requiring busywork per player every week. Companion mode must produce an approved roster-change sheet for Power Pros rather than silently changing a parallel roster.

Acceptance: identical seeds plus different legitimate plans produce bounded, explainable distribution differences; overuse trades short-term output for recovery cost; all progression deltas have reasons and exportable old/new values; 10–20-season tests track quality saturation, positional scarcity, draft churn, and competitive mobility.

### SYS-15 — P2: Rich-get-richer economy needs proof of sustainable competition [proven multipliers; balance hypothesis]

Evidence: `shared/nilConfig.ts:6–30` grants conference tiers from $1.25m to $3.5m. `server/routes/simulation.ts:3411–3426` blends budget baseline/conference tier/class need; `:3432–3469` adds class-rank, postseason, and record rewards, including $400k for top-10% classes and $750k for CWS. Facilities also improve growth; powerful programs gain multiple reinforcing advantages. `:3523–3527` reserves 65% recruiting / 25% retention / 10% walk-ons.

Impact: winning recruiting can fund still better recruiting, while successful teams compound progression and postseason income. This may be an intended challenge in solo mode but can lock human league members into structurally unequal starts. Actual long-run dominance has not been measured in this audit.

Correction: keep asymmetric solo programs but expose an online-league parity preset: budget tiers/caps, shared roster valuation, catch-up support, transparent inflation, and configurable progression. Measure reserve utilization and allow deliberate transfers between envelopes under clear rules. Rewards should offer several viable program-building paths.

Acceptance: multi-season simulations report concentration of titles/talent, median rebuild time, budget utilization, retention affordability, and human-vs-CPU win rates. League members can inspect next-season budget formula before committing.

### SYS-16 — P1: Advanced stats are more confident than their data [proven]

Evidence: synthetic exit velocity/spin/whiffs at `server/routes/simulation.ts:808–817`, `:1006–1011`. Career calculations at `server/routes/stats.ts:556–576` omit SF from OBP/BABIP, use a fixed FIP constant, average exit velocity by **games**, and label whiffs divided by **all pitches** as whiff rate. Record-book pitching “WAR” is `max(0,(4-ERA)*IP/9)` (`:264`), while batting “WAR” is wRAA/10 (`:211`); the pitching expression is not even converted from runs to wins. These values are displayed as WAR (`client/src/pages/record-book.tsx:353`, `:489`) and affect historical ranking (`server/routes/stats.ts:456–467`, `:518`).

Impact: fabricated precision looks like analytical authority. Mixed reported/simulated leagues can compare unavailable real-world measurements to invented synthetic readings. A reported missing value becomes zero in several paths, polluting averages. WAR rankings are not on a common scale.

Correction: first make traditional baseball counting stats correct. Mark each metric as reported/measured, derived, estimated, or unavailable; store denominators and coverage. Hide unavailable tracking metrics. Rename approximations to an explicit game-specific rating unless implementing and documenting a defensible model. Do not use opaque proxy WAR as a primary historical ranking.

Acceptance: unknown data renders as unknown; two games with different batted-ball counts average EV by measured balls; K/whiff denominators are explicit; field/league constants are versioned; all ranking formulas have documented units and reproducible fixtures.

## What is worth keeping

There is substantial groundwork worth preserving: canonical signing resolution, centralized finalization with an atomic path, contact/scouting/visit budgets, NIL envelopes, seeded V3 development, explicit phase handling, calendar-rest helpers, and full-season count validation. These are the right categories of infrastructure. Their integration and baseball invariants need to become more rigorous; adding more narrative and polish before that repair would increase the discrepancy between what the game promises and what it actually decides.

## Target experience and decision loop

The best version is a college-baseball management game whose weekly decisions have visible, baseball-specific consequences, with a Power Pros companion mode that treats actual human games as the source of truth.

1. **Review the week:** one concise inbox with series stakes, confirmed injuries/workload, recruit deadlines, roster promises, and required league actions. Every consequence links to evidence.
2. **Prepare:** choose starters and legal lineups against probable opponents, set one or two risk preferences, and see fatigue/coverage warnings with meaningful alternatives. A reserve can solve an actual matchup or durability problem.
3. **Play or report:** quick sim and watch use the same events; Power Pros users get an immutable matchup/roster packet, play externally, then submit results against that packet. A commissioner approves exceptions or disputes under visible rules.
4. **Learn:** show the decisions that mattered, not a random generic recap. “Your rested Saturday starter covered seven innings; the tired bullpen faced one hitter,” or “The submitted box is missing opposing pitching innings, so ERA remains provisional.”
5. **Build:** allocate a small number of consequential recruitment/development resources. Put uncertain upside, role fit, money, and immediate holes in tension. Skip low-value repeated clicking through saved plans and accountable delegation.
6. **Carry history forward:** freeze season awards, records, promises, roster versions, and financial decisions. In companion mode publish a commissioner-reviewed offseason change sheet so Power Pros and the app enter the next season with the same roster.

## Explicit simulation/companion contract

| Concern | Standalone text sim | Power Pros league companion |
| --- | --- | --- |
| Game authority | Seed + roster snapshot + rules + decisions produce server events | Approved report/evidence produces verified normalized record |
| Statistics | Derived once from events | Supplied/verified counts; absent fields remain absent |
| Fatigue | Engine workload ledger | House-rule workload from verified game use; exception audit |
| Player attributes | Engine ratings with explained growth | Versioned mapping to named Power Pros edition, platform, and league conventions |
| Progression | Applied on approved season transition | Proposed old/new roster changes exported for commissioner reconciliation |
| Awards/promises | Actual season facts | Verified facts, or explicitly pending where data is insufficient |
| Corrections | Replay/reduce from immutable event revision | Amendment with reviewer, reason, evidence, before/after, and recomputed dependent records |
| Mixed CPU/human games | Same normalized history and provenance | Simulated stats visibly distinguished from externally measured stats |

The edition/platform and house-rule details must be specified during companion setup; this audit does not assume a universal Power Pros roster or import format. Treat game compatibility as a tested adapter, not a claim based only on similar stat names.

## Delivery order and release gates

**First: competitive truth.** SYS-01/02/04/06/07/08/09/10/16. Create one authoritative game ledger/reducer, legal calendar, real promise/award evaluation, and provenance-aware stats. Do not broaden PBP deployment until its authority/security path is audited separately. Archive existing inaccurate stats as legacy/provisional instead of retroactively inventing corrections.

**Second: meaningful decisions.** SYS-03/05/12/13/14. Prove lineup, pitching, strategy, recruiting, and development choices influence the intended outcomes. Build one polished season loop before adding systems.

**Third: durable league economics and format.** SYS-11/15. Add transparent rulesets and parity options, then benchmark across multiple seasons. Companion release gate: two human teams can complete an external series, correct a report, finish playoffs, apply approved offseason changes, and begin the next season with fully reconciled rosters/history.

Required validation suite: seeded baseball conservation properties; quick/watch equivalence; chronological fatigue including doubleheaders; authoritative pitcher decisions; promise/award truth; report missing-data semantics; old/new roster reconciliation; simulated multi-year economy and talent distributions; human/CPU AI information parity. This is a focused systems-quality program, not a request to write exhaustive tests for cosmetic screens.

## Limits and unresolved measurements

No live API or database calls were made. PBP transition issues were established through direct code branches, not full endpoint execution. The empirical quick-sim counts use deliberately simple fixtures and deterministic RNG; they demonstrate accounting failures, not calibrated NCAA league averages. Long-run economic dominance, recruiting policy strength, pitch-development saturation, and human engagement need actual benchmark campaigns/playtests. Real-world baseball format assumptions and Power Pros-specific settings should be checked against authoritative current rules for the selected competition/edition before implementation. No production credentials or private player data were accessed.
