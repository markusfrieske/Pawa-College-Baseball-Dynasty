# Pawa College Baseball Dynasty — full studio audit

**For Frisk · September 14, 2026 · Audited revision `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`**

## Verdict

**The game has substantial useful foundations, but this revision is not ready to be trusted as the authoritative record of a competitive Power Pros league. Its standalone simulation also needs fundamental work before it can deliver a convincing baseball-management fantasy.**

The central problem is broken cause and effect. The game asks coaches to care about lineups, pitching availability, promises, development, statistics, and history. Several important paths do not preserve the relationship between the decision, the actual game, and the resulting record. More menus, ratings, fictional news, or decorative art would make that weakness more expensive to repair.

The recommendation is a focused reconstruction of the result, season, and decision systems inside the existing application. Keep the useful work. Establish truthful baseball and recoverable league records, simplify the daily work, then deepen the choices and memories that make a dynasty worth returning to.

This audit provides proposed direction and implementation work packets. It does not claim that fixes have been implemented, that the current production deployment has been inspected, or that Frisk has approved a new game design.

## Who reviewed what

Three independent agent workstreams used the established studio roles. These are review lenses adapted to this TypeScript game; Varsity Dreams' Roblox rules and creative canon were not imported.

| Workstream | Accountable review lens | Coverage |
| --- | --- | --- |
| Baseball and systems | Banks Gameplay Systems & Economy Designer, with Passan Baseball Expert lens | Simulation, roster causality, strategy, schedule, rest, recruiting, economy, progression, awards and season continuity |
| Technical integrity | Gilfoyle Roblox Technical Director, applying web-stack judgment, with Gibs QA & Player Research Lead lens | Permissions, official results, concurrency, database transactions, recovery, advance, evidence, release claims |
| Player experience | JD Player Experience Lead, with CeeDee Creative Director, Bookie Narrative & Character Lead and Clarke Art Director lenses | Onboarding, phone/keyboard usability, information hierarchy, companion workflow, narrative, identity and presentation |

The parent review reconciled findings, ran local checks, and organized delivery using Sophia Production Director's sequencing responsibilities. Named lenses do not mean eight separate agents or eight observed playtests.

Read the detailed reports for exact file/line evidence, triggers, impact, corrections and acceptance criteria:

- [Baseball, simulation and dynasty systems](systems-baseball.md)
- [Technical integrity and league reliability](technical-integrity.md)
- [Player experience and creative direction](player-experience.md)
- [Verification record and remaining coverage](verification.md)
- [Implementation packets](implementation-plan.md)
- [Dated production schedule and 42-finding tracker](../../production/PRODUCTION_SCHEDULE.md)

## The findings that should change the plan

Severity here is relative to the stated product goal. P1 means fix before relying on the affected mode or workflow; P2 means important follow-on quality work. A conditional finding is a blocker when that feature or failure condition is present, not a claim of an observed production incident.

| Priority | Finding | Why it matters | Evidence |
| --- | --- | --- | --- |
| P1 | Quick simulation produces the score and much of the box score through separate random processes. | The published game can contradict itself. Scouting and statistical analysis become unreliable when the record is not a coherent account of a game. | Systems report; executed engine probe |
| P1 | Full Season labels conference games `weekend`, while the rest pipeline expects distinct Friday/Saturday/Sunday labels. Bye-team OOC games also share the midweek label. | Rotation and rest behavior do not match the schedule. Passing pitcher-rest helper tests does not establish a working season. | Systems report; executed 4,172-game schedule probe |
| P1 | The ordinary score model largely uses roster OVR; batting-order changes do not drive the result. `power_ball` adds an expected-run benefit without an equivalent cost in that model. | The interface offers baseball decisions that the outcome does not adequately respect. The most attractive strategy risks being a preset advantage. | Systems report; source trace and paired-seed probe |
| P1 | Invalid individual box-score counters pass validation; missing player IDs can be skipped during stat writes. | A finalized game can record impossible numbers or have no player history even though the report looked complete. | TI-03; executed validator reproduction |
| P1 | Corrected scores can be accepted without reconciling the original innings and box; approval/edit/dispute transitions are not one versioned transaction. | Two screens can disagree about the same official result; concurrent users can approve a different revision than the one displayed. | TI-04 and TI-05 |
| P1 | Some authenticated league reads expose coach emails to outsiders. Enabling play-by-play exposes a separate unauthorized result-finalization path. | League privacy and competition integrity depend on consistent server permissions. The play-by-play finding is conditional on its feature flag being enabled. | TI-01 and TI-02; independent middleware trace |
| P1 | Save-state capture and restore do not cover a consistent, complete league state. | Recovery can fail after meaningful play or restore contradictory records. A Save button is not proof that a season is recoverable. | TI-06 and TI-07; schema/restore trace |
| P1 | Advance can catch a failed game commit and still move the clock; coach effects can remain in memory across durable result commits. | A season can move forward with missing games or missing career effects. | TI-08, TI-09 and TI-14 |
| P1/P2 | Awards and some promise outcomes depend on OVR/random proxies rather than the actual achieved season. | Players cannot trust recognition or consequences. A breakout season should matter more than a preseason rating. | Systems report |
| P1 | Manual report drafts lack durable recovery; the UI calls box details optional before requiring them; feedback can block the screen and disappear in 2.5 seconds. | Recording a game becomes fragile paperwork. This directly threatens participation and timely league advancement. | UX-01 through UX-03 |
| P1/P2 | The hub repeats next-action surfaces, navigation has a misdirected News destination, and depth-chart controls lack keyboard equivalents. | The amount of interface hides the next useful decision and excludes otherwise capable users. | UX-04 through UX-06 |
| P1 | Advanced statistics lack adequate source/completeness distinctions; finalized evidence can still be changed or unlinked. | Coaches cannot reliably distinguish observed results, estimates, missing data, and the evidence that was actually approved. | UX-07 and TI-10 |
| P1/P2 | Launch-rehearsal coverage falls short of the documented end-to-end promises; 116 lockfile downloads point at a Replit-only host. | The project can appear more verified and portable than the evidence supports. | TI-11 through TI-13; local install reproduction |

These are not all cosmetic or speculative concerns. A database-free reproduction submitted negative at-bats, 999 home runs, missing player IDs and zero-out pitchers to the actual box-score validator and received no issues. A seeded 1,000-game probe found opponent batting/pitching hit totals disagreed in 988 games. The exact probe setup and its limits are preserved in the systems report and evidence files; these rates are not estimates of production incident frequency.

## Keep the useful foundation

The project already has serious implementation work: league membership and commissioner helpers, an atomic game finalizer, a durable dynasty-start job, recruiting transactions, opponent confirmation and disputes, screenshot OCR with explicit review, roster and recruiting editors, pitcher availability, career records, storyline history, and numerous validators. Several of these have defects at their boundaries, but they are useful starting points.

Preserve the college-program fantasy, Power Pros vocabulary, recognizable player cards, program identity, fog-of-war scouting, recruiting variety, transfer/departure cycle, rivalry context, and season history. Preserve the dark green/gold direction where it supports readability. The product does not need a new framework or a wholesale visual identity replacement to become substantially better.

Documentation must be reconciled with code. For example, `replit.md` still describes opponent disputes as out of scope, although the routes implement them. It also describes different notification timing and older team/season details. Use the exact audited implementation as the starting point, and replace scattered feature claims with a versioned capability matrix.

## One program world, two clear ways to play

Choose the mode from the player's intent at setup. Share the roster, recruiting, progression, schedule, identity, results ledger and history where their rules agree. Keep mode-specific authorities explicit.

| Question | Standalone dynasty | Power Pros league companion |
| --- | --- | --- |
| Who produces the baseball result? | A versioned server simulation using a locked lineup, rules and seed. | The externally played game, represented by evidence and an approved report revision. |
| What does the app own? | Coaching choices, simulation, season management and records. | League rules, schedule, roster/eligibility records, reporting, approvals, disputes, history; recruiting/progression only when adopted by league policy. |
| What must never happen? | A displayed choice is mechanically irrelevant without disclosure; a replay differs because the seed/state was not preserved. | The app invents measured statistics or replaces a human result with an automatic sim. |
| What counts as complete? | A valid official game record with all required downstream effects committed. | The accepted result revision and its evidence/completeness policy, with required approval and committed downstream effects. |
| How does the coach return? | A short recap explains the result and the next consequential choice. | The same game workspace shows its status, whose action is next, and what is blocking the league. |

For planning, the initial companion proof uses the repository's 14-human launch profile. The exact Power Pros edition/platform, tie/mercy/innings rules, live console roster constraints, and league cadence remain inputs to confirm before implementation. No direct Power Pros API or console synchronization is assumed.

A league constitution should freeze or version: mode, season schedule, game rules, postseason, roster/eligibility, rest, reporting completeness, confirmation deadline, disconnect/forfeit/reschedule handling, commissioner powers, competitive edits, recruiting/progression and rating export policy. The current rules snapshot is only a starting point. A league must know which rules governed a game even after next season changes them.

## Make the solo game worth mastering

### Give baseball one coherent event history

Build one authoritative simulator that resolves plate appearances and base/out state. Fast simulation, animated text replay and live coaching should consume the same result model. A replay is a presentation of what happened; it should not run a competing outcome engine.

Lineup order, handedness, defensive position, batting approach, pitcher choice, workload, bullpen usage and substitutions should affect appropriate events. Do not make every attribute affect everything. Show a plain explanation of the important matchup factors and acknowledge uncertainty. A correct probability model does not promise that the higher-rated team wins every game.

Record a seed, engine version, rules version and input snapshot. Derive score, innings, batting, pitching, fielding and milestones from events. Reconcile both sides before committing. Include walk-offs, extra innings, shortened games and two-way players under explicit supported rules. Avoid silently importing a universal professional or college rule set.

### Replace repetitive optimization with competing priorities

The weekly loop should be: understand the opponent and roster constraints, choose a small number of meaningful interventions, play/simulate, understand the consequences, adjust the program. Recruiting should ask which needs to cover, which uncertainty is worth investigating, and which opportunity to abandon. Development should ask what role the player can become useful in and what opportunity cost that entails.

Scouting uncertainty needs calibration and player-readable reasons. Interest and commitments need understandable costs and feedback. NIL, scholarship/roster capacity and retention need a single visible budget with reconciled reservations. CPU teams need the same legal actions and resource constraints; disclosed difficulty advantages should be measured separately from decision quality.

Tie promises to recorded opportunities and achievements. Tie awards to eligible, qualified performance. Connect departure and retention to explainable player expectations. Do not punish a coach for a championship promise with a random proxy after the team actually wins it.

Balance after the event model is trustworthy. Use repeated seeds to compare strategy families and distributions across weak, average and strong programs, league sizes, season lengths and difficulty. Examine individual stories and dominant policies, not only average scores. Tune one family at a time.

### Make players worth remembering

Unify each player's recruitment, development, choices, games, transfers, awards, promises and departure under a stable identity. Let coaches pin a signature game or write a short memory. Carry those links into the archive.

Use authored dilemmas with two defensible choices and visible costs. Sensitive personal events should not become predictable rating-upgrade buttons. Separate a coach's decision from a league-wide story vote. A recap should connect confirmed events to stakes: the walk-on's hit, an exhausted bullpen, a recruit's first start. Generated prose must never invent an externally played moment or a quote.

## Make the companion save the league time

The critical unit is a durable game workspace, not an upload form.

1. **Before play:** both coaches see the same fixture, approved roster revision, availability and rules. A short Power Pros prep packet shows what must be represented on the console and what changed since the last approved roster.
2. **After play:** a coach opens that same game, captures the score and required categories, then saves immediately. Manual entry works if OCR is unavailable. The league policy explains required detail before the coach starts.
3. **Review:** OCR extracts a draft with uncertainty flags. Player mappings bind to roster IDs, and the UI guides the coach through unresolved rows and reconciliation errors. Missing values stay missing.
4. **Submit and confirm:** the other coach reviews the exact immutable revision and evidence manifest. Confirmation, dispute and commissioner resolution use version checks. A retry cannot double-count the game.
5. **Finalize:** commit the result, contributions to statistics/standings/rest, approval record and audit receipt atomically. A failed critical write leaves a clear retryable state.
6. **Correct and recover:** preserve prior revisions and reasons; recompute affected projections from official per-game contributions. Export and restore the complete league with tested invariants.

Provide an explicit lightweight reporting policy only if the league wants it. Score-only reporting must not silently supply fake batting lines or make unknown workload look like full pitcher availability. If rest is enforced, collect the minimum workload evidence that rule requires. Completeness is a property of the result, not an inconvenience to hide.

Do not make coaches reenter unchanged rosters. Provide versioned mappings for Power Pros names, aliases, numbers, handedness, ratings, abilities and pitch repertoires, plus an export/change sheet appropriate to the selected edition. Treat this as an adapter with rounding, unsupported-field warnings and round-trip validation. It is not a claim of automated console import.

For commissioners, the default screen should list what blocks the next step, who owns it, its deadline, and the direct resolution. Distinguish unplayed, unreported, unconfirmed, disputed and invalid games. Provide safe delegation, replacement-coach history, postponements and explicit forfeits. A normal week should not require database repairs or undocumented commissioner overrides.

## Reduce interface work before adding presentation work

Use a consistent navigation structure: **Today, Program, Games, League, More**. Elevate recruiting in the current phase without adding another permanent command center. Today should show phase/deadline, one primary action, a short obligation list, the next matchup and a brief change summary. Commissioner and coach priorities differ; use their role rather than showing everyone every system.

Replace routine blocking notifications with inline feedback. Preserve errors and inputs. Fix dead navigation and keyboard controls. Save drafts and show their sync status. Use accessible dialogs only for actual decisions. Test narrow phones, text zoom, touch and keyboard with real tasks, not only screenshots.

Retain expressive art at commitments, milestones and championships. Use quieter typography and compact headers for repetitive management. The supplied historical homepage screenshot has a coherent identity but is not evidence of current authenticated desktop/mobile layouts. Current visual composition, contrast and audio require a running-app review after the workflow changes.

## What “dramatically improved” should mean

- Every accepted game reconciles, has a known source, survives retries, and can be corrected and recovered without hand-editing the database.
- Coaches can explain why their decisions matter. The engine can demonstrate those effects across repeated controlled experiments.
- A returning coach can identify the next useful action, complete it on a phone or keyboard, and recover interrupted work.
- A commissioner can complete a full league week, resolve a dispute, advance a season and restore a mature league using supported tools.
- After several seasons, players, achievements and rivalries remain recognizable, statistically consistent and easy to find.

The [implementation plan](implementation-plan.md) turns these outcomes into bounded work packets with owners and proof gates. Start with those gates; feature quantity is not the quality target.
