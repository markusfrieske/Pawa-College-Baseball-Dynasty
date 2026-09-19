# Playable baseball and dynasty integration

September 18, 2026. Implements the direction in [Class of Nine vision](CLASS_OF_NINE_VISION.md). Planning only; proposed names and interfaces are not existing APIs.

## Evidence and current boundaries

Reviewed baseline: commit `000370e` on `codex/pawa-quality-overhaul`.

- React/TypeScript client, Express services and PostgreSQL/Drizzle persistence already exist.
- [Simulation routes](../server/routes/simulation.ts) contain `simulateGameWithRosters` and `simulateGame`. They are not yet a portable live-match engine.
- [Game finalizer](../server/game-finalizer.ts) contains `finalizeGameAtomic`; its documented purpose includes atomic official game, receipt, standings, player statistics, pitcher workload, coach contributions and required events. Older exported helpers explicitly lack that complete durability contract.
- [Report revision contract](production/REPORT_REVISION_CONTRACT.md) records implemented boundaries and open work, including simulation identity, authority/roster snapshots, chronology, amendments and recovery. Reuse and extend this work rather than bypassing it.
- [League rules](../shared/leagueRules.ts) currently distinguish `simulated` and `reported`; adding playable matches requires a deliberate schema and permission migration, not an arbitrary new string.
- [Seeded randomness](../shared/seededRng.ts), [pitch definitions](../shared/pitchDefs.ts), [pitcher rest](../shared/pitcherRest.ts) and [abilities](../shared/abilities.ts) are reuse candidates. Inspect actual callers and semantics before sharing them.
- [Trajectory](../shared/trajectory.ts) classifies hitter tendencies; it is not a ball-flight implementation.

## Ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| Dynasty domain | Persistent player identities, schedule, roster legality, development, season history | Animation timing or controller polling |
| Match setup adapter | Validated immutable roster/rules snapshot and rating-to-gameplay mapping | A second editable roster |
| Match core | Counts, outs, runners, lineups, substitutions, pitches, live-ball state, legal events | React, Phaser, database connections or wall-clock calls |
| Human/CPU controllers | Commands and decisions under the same rules | Direct edits to stats or predetermined final scores |
| Phaser presentation | Input collection, sprites, camera, animation, audio and feedback | Official standings, XP or result acceptance |
| Result service | Validation, source identity, exactly-once acceptance and durable effects | Trusting an arbitrary client score as official |
| Storage adapters | Hosted persistence or desktop local saves | Different baseball rules for each platform |

Use simple modules in the current repository first. Proposed homes are `shared/baseball/`, `client/src/gameplay/`, and a server match-session adapter. Do not reorganize the whole repository just to create a monorepo framework.

## Data crossing the boundary

### Match setup

`MatchSetupV1` should identify schema version, match/session ID, scheduled game ID (absent for exhibition), league/save ID, schedule revision, home/away team IDs, stable player IDs, roster revision, batting orders, positions, eligible bench and pitchers, handedness, pitch repertoire, effective attributes, current fatigue/rest, abilities, field dimensions and a complete rules profile. Record core, rating-map and tuning versions, plus the simulation seed and initial RNG state.

Create the snapshot through the dynasty service. Snapshot identity is immutable once play starts. Reject or explicitly reconcile stale eligibility on acceptance; never silently replace players or rules midgame. Use true effective gameplay attributes in local play, not stars or a display-scaled overall rating. Online services must not expose scouting secrets beyond authorized match data.

### Commands, events and saved state

Commands include pitch selection/target, swing/aim, defender movement, throw/base selection and runner decisions. Stamp live inputs with simulation ticks. Advance the core at a fixed proposed 60 Hz; rendering may run at another rate. Separate cosmetic randomness from gameplay randomness and retain RNG state, not merely a starting seed.

Events record validated baseball facts such as pitch resolved, ball contacted, ball caught, runner advanced, runner retired and plate appearance ended. Derive counters and box scores from those facts. Explicit states are pre-pitch, pitch in flight, live ball, dead ball, half-inning change and match complete. Animation completion must never decide an out or increment an inning.

Use 2D ground coordinates plus ball height/vertical velocity. Tune flight and catch windows in the core. Phaser displays them; its frame timing and rigid-body callbacks must not decide official outcomes.

Checkpoint between pitches/dead balls first, retaining runner state, lineup/substitutions, pitcher usage, count, score, RNG state, event position and versions. A crash during a live ball can return to the previous checkpoint under an explicit local-save policy. Mid-play resume is a later feature. Preserve a completed but not yet accepted result so a lost response cannot discard the game.

### Match result

`MatchResultV1` names match/setup identity, result source (`played`, `simulated`, or `reported` at the contract level), completion reason, rules and engine versions, score by inning, reconciled player batting/pitching/fielding lines, pitcher outs and workload, substitutions, supported event evidence and a canonical result fingerprint.

Use integer outs internally for innings pitched. Distinguish observed, derived and unavailable data. Do not fabricate pitch telemetry for a legacy simulation or score-only external report. Hashes establish content identity, not trust or anti-cheat.

The dynasty computes XP, progression and standings effects after acceptance; the client does not submit authoritative reward amounts. Exhibition results have no dynasty effects.

## Safe result lifecycle

1. Start a session after validating schedule, lineup, pitcher eligibility and the requested mode. Reserve the scheduled game against competing play/simulation/report finalization.
2. Save match checkpoints separately from official season totals. Session states include active, suspended, result-pending, accepted and abandoned; define reservation recovery after a crash.
3. On completion, validate setup identity, supported rules, event/stat reconciliation and allowed source. An unsupported baseball situation cannot be silently accepted as a valid game.
4. Extend the existing atomic finalizer and receipt contract with played-session identity. Recheck eligibility/authority and chronology at acceptance. Same session and same result return the original receipt; different results for an accepted game conflict.
5. Commit game, receipt and required projections together, or use an explicitly recoverable staged state. Never show an official win while required player statistics are missing.
6. Refresh the dynasty from the accepted receipt. Story and recap generation follows the durable result; their failure cannot cause the game to be recorded twice.

Hosted league play requires server validation of reproducible command/event evidence or another explicitly reviewed authority model before official playable results are enabled. Offline local play accepts a local trust model and does not promise anti-cheat. Do not automatically import local results into competitive hosted leagues.

## Coexist with the sim being refined

Keep the legacy simulation behind an adapter while the playable core is developed. Both producers initially feed the same accepted-result contract; this does not mean they already share every pitch algorithm or produce identical distributions.

Extract portable rules and rating mappings incrementally, with regression fixtures. Ultimately CPU controllers can drive the same match core without rendering for detailed simulation. Evaluate season-throughput costs before replacing the existing fast sim. Fast aggregate simulation may remain if its rules, rating direction and distributions are validated against the detailed model.

Set up reproducible tests that compare weak/average/strong rosters and fatigue states. Measure runs, strikeouts, walks, extra-base hits, errors and pitcher usage with sample uncertainty. Played games should reward skill; do not force them to reproduce an exact simulated box score.

Choose play or sim before a game in the initial implementation. Switching during a game requires a shared serializable state and resume tests and is deferred.

Separate result source from league execution policy. A local dynasty may permit play or sim; a hosted reported league may forbid both. Migrate the existing `gameMode` setting compatibly and never reinterpret old saves silently.

## Gameplay tuning

- Begin with readable pitch travel, one swing and a forgiving contact target; timing affects direction and contact quality.
- Add three distinct pitch types after one pitch feels right. Aiming and execution should not require stacked timing meters.
- Automatically select a sensible defender and show the landing spot; allow movement and directed throws. Catch when correctly positioned.
- Automate routine runner movement; expose extra-base decisions and retreats clearly.
- Map contact to the useful contact window, power to potential exit speed, speed to running/range, arm to throwing and control to pitch execution. Document caps and units; prevent perks/fatigue from being applied twice.
- Keep responsiveness consistent across ratings. Difficulty changes CPU decisions and optional visible assists, not hidden score correction.

## Desktop work is a separate milestone

Electron packages the application; it does not turn Express/PostgreSQL dependencies into offline saves. First inventory database, authentication, media, OCR, AI and network assumptions. Establish a dynasty-service/storage boundary and test a local persistence candidate (for example SQLite) with transactional receipts, migrations, backup and restore. This is a recommendation, not approval to replace hosted PostgreSQL now.

Prove a packaged application can create a local dynasty, launch a match, save/quit/reopen and retain history with the network disconnected and no developer database installed. Bundle required assets. Keep hosted league access explicit. Cloud save synchronization is not implied.

Keep Electron's renderer sandboxed with context isolation, a narrow validated preload interface, and no renderer Node integration. Validate save paths and IPC inputs. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Implementation milestones and gates

| Step | Deliverable | Completion evidence |
| --- | --- | --- |
| 0: Connection spike | Runtime-validated setup/result schemas, synthetic roster snapshot, tiny headless match fixture, adapter to a synthetic dynasty | Load lineup, resolve fixture, accept, reload; retry yields one receipt; altered duplicate and stale roster rejected; exhibition changes no season data |
| 1: Batting sandbox | One pitcher/batter, one pitch, one swing, visual/audio response | Frisk can explain contact/miss; fixed inputs remain stable at varied render rates; stronger contact/power ratings produce intended differences |
| 2: Complete live ball | Grounder/fly, defender selection, catch, throw, running | Scripted force/tag/fly/tag-up/foul/home-run cases resolve; no lost runner or stuck play; contact outcome is not preselected |
| 3: Exhibition | Two teams, field, three innings, basic CPU, controller/keyboard | Full games complete; correct inning/walk-off/scoring behavior; multiple unfamiliar testers finish and assess replay interest |
| 4: Dynasty slice | Real scheduled match, lineup, fatigue, checkpoints and receipt | Play, interrupt/resume, finish, reload; loss of acceptance response does not duplicate effects; play/sim/report race resolves to one official result |
| 5: Desktop/offline proof | Electron build and local dynasty persistence | Clean-PC/offline test; controller reconnect, pause/focus, save migration and backup/restore verified |
| 6: Demo polish | Original art/audio, onboarding, settings, difficulty and performance | External playtests and stable packaged build; release scope estimated from measured production work |

The connection spike is intentionally small and uses synthetic data. It must not delay the batting experiment for a full refactor. Full rules and recovery gates are required before real dynasty results are enabled, not before the first swing can be tested.

## Coordination

One owner changes each shared contract/finalizer at a time. Gameplay can develop against versioned synthetic snapshots while dynasty refinement continues. Integrate after contract review rather than allowing both workstreams to change player schema or acceptance semantics independently.

Frisk directs feel and scope. Banks Gameplay Systems & Economy Designer and Passan Baseball Expert own proposed ratings/rules; JD Player Experience Lead owns controls/readability; Clarke Art Director owns presentation; technical implementation owns core/adapters; Gibs QA & Player Research Lead verifies rules, persistence and player evidence; Sophia Production Director sequences milestones. These are proposed assignments, not dispatched tasks.

CommandCenter owns this specification and review. Any later BuildLab handoff must link the committed canonical artifact from the Cross-Device Command Queue. No device handoff or scheduled development is initiated by this document.
