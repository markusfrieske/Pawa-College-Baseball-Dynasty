# Technical integrity audit — Pawa College Baseball Dynasty

Audit date: 2026-09-14. Source: `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`.
Review lenses: Gilfoyle Roblox Technical Director (web-stack adaptation); Gibs QA & Player Research Lead.

## Verdict

Do not certify this revision as the authoritative record keeper for a competitive Power Pros league yet. The application contains substantial defensive engineering, but several paths can produce contradictory official results, erase or reject recovery history, and expose league data to outsiders. The most dangerous problems are concentrated in the commands that establish truth: finalize, dispute, advance, and restore. Adding more simulation features before fixing these would increase the repair burden.

This is a source audit plus one executed, database-free validation reproduction. No production instance, account, database, external storage, or league was accessed or modified. Database races and recovery failures below are code-traced failure scenarios, not claims of observed production incidents. The parent audit owns build, typecheck, and baseline test results. Reproducible validator evidence is preserved in [validate-box-score-repro.mjs](evidence/validate-box-score-repro.mjs) and [its captured output](evidence/validate-box-score-repro-output.json). The [global middleware and route-order trace](evidence/authorization-route-order.md) independently confirms no earlier authorization layer protects TI-01/TI-02.

## Existing work worth preserving

- `server/game-finalizer.ts:1184` locks the game and uses a unique finalization sentinel inside a transaction. Normal single-game finalization groups scores, standings, stats, rest, coach XP, and the result event. This is a useful foundation; the surrounding report workflow must use the same transaction boundary.
- `server/route-helpers.ts:40` and `:96` provide reusable membership and commissioner middleware. The failure is inconsistent adoption, not absence of an authorization design.
- Coach report submission checks involvement, game/league association, distinct nonnegative integer scores, duplicate roster IDs, and roster membership when IDs are present (`server/routes/games.ts:444-579`). Opponent confirmation and dispute do exist and enforce the opposing side in the ordinary case (`:846-863`, `:946-969`). Do not scope a rewrite around the false premise that these features are absent.
- Dynasty initialization has a durable job service; numbered migrations, readiness checks, and launch invariants exist. The July handoff explicitly admits that database verification was not executed locally. Those caveats must remain visible.

## Release blockers and high-priority defects

### TI-01 — P1: authenticated outsiders can read private league details and coach emails

**Evidence:** `server/routes.ts:852` registers GET `/api/leagues/:id` with `requireAuth` alone. The cache hit at `:858` precedes any membership test; the rest of the handler has none. `:875-889` adds every human coach's email, and `:893-899` returns the full league object. GET schedule in `server/routes/games.ts:86` likewise has no league-membership gate.

**Trigger:** A signed-in user, including a newly created guest, opens another league's known URL. League IDs need not be guessed: they are normal shared navigation identifiers.

**Impact:** Cross-league disclosure of emails, identities, settings, teams, and schedule/game identifiers. This also supplies identifiers useful to TI-02. Public standings can be a product feature; exposing account emails through the same unrestricted DTO is not necessary for it.

**Correction:** Enforce membership before cache lookup on private routes. Create an explicit public-league policy and a separately allowlisted public DTO if spectators are intended. Do not put account email into the ordinary league payload. Audit all league-scoped route registrations with an authorization matrix.

**Acceptance:** Member A, commissioner A, co-commissioner A, outsider B, and guest request warm-cache and cold-cache versions of every league read. B/guest receive 403/404 unless public mode is expressly enabled; public responses contain no account emails or private controls.

### TI-02 — P1 conditional security blocker: enabling play-by-play enables arbitrary external result submission

**Evidence:** `server/routes/simulation.ts:7164-7188` guards the finalize-play-by-play route only with `requireAuth` and global `PBP_ENABLED === "true"`. It checks that the game belongs to the URL's league, but never verifies requester membership, team ownership, commissioner authority, result mode, or current phase. Client scores are only checked for null. Client player IDs and stat lines flow into the box at `:7194-7254`; `:7257` commits them through `finalizeGameAtomic`. The initial play-by-play route at `:5864` also lacks a membership check.

**Trigger:** With the feature flag enabled, any signed-in outsider supplies a known league/game ID and chosen score. No prior server-produced simulation or authorized game session is required.

**Impact:** Unrelated users can finalize games, bypass Power Pros report/opponent-approval flow, and write fabricated or foreign-player stats. A global disabled flag reduces current exposure but does not make this safe to ship later.

**Correction:** Gate both endpoints through explicit mode and ownership policy. Persist a server-owned simulation session/result, finalize by opaque session ID plus expected game version, and derive scores/box data on the server. Put validation and scope checks in the shared finalization service as defense in depth.

**Acceptance:** With flag on and off, test outsider, unrelated league member, both involved coaches, and commissioners. Handcrafted score payloads, foreign player IDs, stale simulation sessions, reported-mode games, and games outside the permitted phase cannot mutate anything.

### TI-03 — P1: invalid box scores pass validation, and unmatched player rows silently vanish from history

**Evidence:** `server/lib/validateBoxScore.ts:25-144` checks final scores, aggregate inning/batting runs, minimum nine batters, advisory hit totals, and IP syntax. It does not validate per-player integer/range/relationship constraints, required IDs, total outs, or game structure. Submission's roster validation explicitly skips missing IDs at `server/routes/games.ts:549`. Finalization drops missing IDs at `server/game-finalizer.ts:866-867` and copies supplied AB/HR and other counters at `:868-875`. Commissioner edits at `server/routes/games.ts:698-747` omit submission's roster-membership and duplicate-ID checks entirely.

**Executed reproduction:** Imported the actual validator using Node 24 native TypeScript stripping. Supplied a 1-0 game, `inningScores=[[0,1]]`, nine batters per side, AB=-7 and HR=999 on every batter, no player IDs, and pitchers with 0.0 innings. Output was `issues: []`. This execution was pure and touched no database. An initial tsx attempt failed with the environment's `uv_os_get_passwd ENOMEM`; the native-TypeScript invocation succeeded.

**Impact:** Invalid numeric entries or deliberate input can become official impossible season stats. The missing-ID reproduction represents a crafted API payload; ordinary unmatched OCR rows receive synthetic `screenshot-*` IDs and are rejected by the normal roster-membership check. Their separate user-facing remapping problem is documented in UX-12. An accepted missing-ID payload can finalize standings while producing no player stats. Foreign IDs in commissioner edits can affect the wrong player's rest/history because the finalizer trusts identifiers. Confirmation is not a substitute for structural validation. Validator behavior was executed; HTTP acceptance and database consequences are source-traced, not live-tested.

**Correction:** Define a strict normalized result schema used at every entry point and before finalization. Validate nonnegative finite integers, H <= AB, HR+2B+3B <= H, ER <= R, pitcher/batter reconciliation and legal innings/outs with explicit shortened-game/walk-off rules. Every participating row must match a league-season-team roster identity or remain visibly unresolved and block finalization. Support an explicit score-only result with a documented stat-completeness state instead of silently accepting missing identities.

**Acceptance:** Property-based and example tests reject negative/fractional counters, impossible totals, duplicates, cross-team IDs, absent IDs, strings masquerading as arrays, and malformed innings. Tests cover substitutions, two-way players, walk-offs, extra innings, shortened games, and 31+ run results when league rules permit them. A accepted full report must generate precisely the expected per-player game ledger.

### TI-04 — P1: dispute resolution can finalize a tied or internally contradictory official game

**Evidence:** `server/routes/games.ts:977-985` accepts proposed corrected scores if they are numbers >=0; no integer, upper-bound, or no-tie checks. `:1048-1055` replaces only home/away totals and calls finalization without `validateBoxScore`, despite the validator's header claiming this route uses it. `server/game-finalizer.ts:530-554` builds the box from the original report innings and player rows and never reconciles the correction.

**Trigger:** Opponent proposes a corrected score; commissioner selects `useCorrectedScore`. Even an ordinary 5-4 to 6-4 correction leaves the innings and batting runs at 5-4. A tied correction is also accepted by this path.

**Impact:** Official score, box score, innings, winning team, player totals, and standings can disagree. Ties are treated as away wins because `homeWon` is computed by `homeScore > awayScore`. The dispute dialog and commissioner correction button also permit this tied-score path (`client/src/pages/schedule.tsx:682-719`, `client/src/pages/commissioner/tabs/GameReportsTab.tsx:318-327`). Fractional corrected scores lack route validation, but persistence is unverified because corrected-score database columns are integers; do not infer successful fractional finalization from that omission.

**Correction:** Treat correction as a new fully validated report revision. Require the appropriate affected stat/inning changes or explicit score-only downgrade with missing-stat labels. Validate again in finalization. Persist original revision, proposed revision, reason, and approver.

**Acceptance:** A tied, fractional, negative, or inconsistent correction produces 422 and no writes. A valid correction atomically changes game, report revision, box, standings, player history, rest, coach record, and audit provenance. Original evidence remains available.

### TI-05 — P1: report approval, editing, and dispute are separate unversioned writes

**Evidence:** Confirm reads pending report at `server/routes/games.ts:838-840`, performs finalization at `:882`, then separately writes confirmed status at `:883`. Edit reads status at `:710-714`, then updates report at `:740`; dispute similarly reads at `:941-943` and updates at `:980`. The finalizer locks only the game row (`server/game-finalizer.ts:1186`), not the report revision. Auto-confirmed CPU reports are inserted as confirmed before finalization (`server/routes/games.ts:628`, `:654-655`).

**Triggers and impacts:** (a) Confirm reads revision A, commissioner edits to B, confirm commits A, then marks B confirmed: visible report differs from official game. (b) Concurrent confirm/dispute can leave a completed game with disputed status or overwrite a dispute without review. (c) An error after auto-confirm report creation but before game commit leaves a confirmed report for an incomplete game; normal resubmit/confirm paths reject it. These are not prevented by game-level exactly-once finalization.

**Correction:** Implement a versioned result state machine with conditional status/version transitions inside the game finalization transaction. Atomically commit the accepted report revision, game, derived effects, and audit row. Put notifications/OCR on a retryable outbox. Idempotency keys must return the existing result and reject changed payload reuse.

**Acceptance:** Controlled two-connection barrier tests run edit-vs-confirm, dispute-vs-confirm, finalize-vs-quick-score, duplicate submits, and retries after failures at every commit boundary. Exactly one revision wins; stale callers receive 409; no complete game has an unresolved report; no confirmed report has an incomplete game.

### TI-06 — P1: save-state rollback is not a complete recovery mechanism

**Evidence:** Snapshot inventory in `server/lib/leagueSaveState.ts:57-168` omits `storyline_resolutions`, `game_recaps`, `coach_rivalries`, `game_finalizations`, `league_advances`, messages, newer recruiting ledgers, jobs, editor history, and postseason tables. Delete at `:175-227` and reinsert at `:250-295` use a separate incomplete inventory. In particular `:185` deletes storyline events without resolutions; migration `server/migrations/0038_storyline_resolutions.sql:6` gives resolutions a non-cascading event FK. `:217` deletes games without recaps; `shared/schema.ts:2051` declares recap->game FK. `shared/schema.ts:2251-2252` gives rivalries coach FKs while restore deletes coaches. Finalization sentinels cascade on game deletion (`shared/schema.ts:2443`) and are not restored. Normal `storage.deleteLeague` already knows to delete recaps/rivalries at `server/storage.ts:1965-1966`, demonstrating implementation drift.

**Trigger:** Restore a save in a league that has a resolved storyline, recap, rivalry, or other omitted dependent row.

**Impact:** FK-protected schemas can reject rollback precisely after meaningful play. Cascading tables can instead lose data. Restored completed games lose their finalization ledger. A user-visible save button therefore does not currently prove recoverability.

**Correction:** Establish one versioned league-data inventory with explicit capture/restore/retention policy for every table. Keep immutable audit/security records outside destructive snapshot replacement. Prefer restoring mutable state plus replayable result/recruiting ledgers rather than deleting and rebuilding the league identity. Add schema-version validation and explicit old-snapshot migrations. Continue real database backups; a JSON state snapshot is not a disaster-recovery backup.

**Acceptance:** Complete a game/report/OCR, resolve a storyline, recruit/sign, advance, generate postseason, edit a player, and create messages; snapshot, change state, restore, then compare every table's expected keys and values. All FKs/invariants pass, complete games retain finalization identities, and no side effects double-apply on retries. Restore a real backup to a separate disposable environment and record recovery time and recovery-point guarantees.

### TI-07 — P1: snapshots can contain states that never existed together

**Evidence:** `captureLeagueSaveState` calls `buildSnapshot` at `server/lib/leagueSaveState.ts:306` without BEGIN/REPEATABLE READ. It issues many SELECT statements. Save routes acquire an advance lock (`server/routes/saveStates.ts:43`), but game reports, recruiting commands, and editor commands do not share that lock.

**Trigger:** A report finalizes or a recruit signs between snapshot queries while the commissioner saves.

**Impact:** Snapshot may capture pre-result games and post-result standings/stats, or pre-signing team balance and post-signing recruits. Restoring a technically successful snapshot can still restore contradictory finances and records.

**Correction:** Capture under one repeatable-read transaction, plus a consistent revision/writer protocol for restore. Restore must reject or serialize all relevant live writers; locking only commissioner advance is insufficient. Include snapshot schema version and integrity hash/manifest.

**Acceptance:** Pause a multi-table mutation between commits while capturing repeatedly. Each snapshot is wholly before or after the transaction, and restoring under concurrent coach traffic either safely blocks/rejects those writes or preserves them according to an explicit policy.

### TI-08 — P1: advance swallows failed finalizations, marks the stage done, and moves on

**Evidence:** `server/routes/simulation.ts:5243-5255` catches each `finalizeGameAtomic` failure, logs it, then includes that game in `results` anyway. `:5330` marks `game_simulation` 100%. `:5343` synthesizes `isComplete:true` for the returned game results used in news. The week/phase transition at `:5812` can proceed without a fresh all-required-games-complete assertion. Similar catch-and-continue finalization patterns occur for exhibitions (`:5323`) and conference championships (`:5412`).

**Trigger:** A database error, constraint failure, or malformed generated box affects one game during advance.

**Impact:** Week advances with an unfinished game while the feed/recap may imply completion. Retry can skip the stage based on the persisted checkpoint or current week. A logged error is not sufficient handling for a failed official result.

**Correction:** Fail the critical stage; preserve successful game commits and retry only missing games. Persist per-game completion and verify required game IDs/ledger count before completing the stage or advancing the clock. Noncritical flavor text may remain best effort; scores cannot.

**Acceptance:** Inject a deterministic failure into the second of several game commits. Week and phase stay fixed, stage is failed/resumable, no article claims the failed game completed, retry finishes only missing games, and all totals match exactly once.

### TI-09 — P1: batched coach XP is lost on crashes, and postseason XP can miss the flush

**Evidence:** The advance path passes `coachXpAccum` at `server/routes/simulation.ts:5247`. In `server/game-finalizer.ts:1263-1267`, coach effects are collected in memory instead of written with the game. Sentinel/game commit happens before the accumulation at `:1304-1319`. The stage completes at `server/routes/simulation.ts:5330`, then `flushCoachXp` runs at `:5339`. Postseason game finalizers later in the same function pass that same accumulator at `:5405`, `:5504`, and `:5596`; there is no later `flushCoachXp` call in that function.

**Trigger:** Process termination after a game commits and before XP flush, or an advance that adds postseason game deltas after the sole flush.

**Impact:** Completed results survive but coach wins/losses/XP do not. Replay sees the game sentinel and cannot reconstruct the lost in-memory deltas. This contradicts the comment that all game side effects have persisted at stage completion.

**Correction:** Persist coach effects with each game's transaction, or write a uniquely keyed durable effect ledger/outbox and consume it exactly once. Do not use volatile memory as the authoritative continuation checkpoint. Align postseason counting policy explicitly.

**Acceptance:** Kill/restart at each boundary between game commit, checkpoint, XP accumulation, and flush. Career records, XP, and game wins remain reconcilable. Full-season and standard conference/super-regional/CWS results each receive their intended coach effects exactly once.

### TI-10 — P1 for competitive record keeping: finalized evidence remains deletable and re-extractable

**Evidence:** `server/routes/games.ts:1269-1282` allows uploader or commissioner to delete an image with no completed/confirmed/disputed state guard. `assertGameAccessForImages` checks involvement, not finalization immutability. OCR rerun at `:1228-1261` similarly replaces extracted fields/raw result after completion. Evidence upload at `:1151-1192` does not bind an immutable report revision or recorded content hash.

**Trigger:** An uploader deletes evidence after the opponent approved the result, or OCR is rerun after a dispute.

**Impact:** The application can no longer reconstruct what evidence was approved. An ordinary user's permissible action undermines the claimed permanent evidence vault. The raw object may remain in storage, but losing the linked accessible record still defeats auditability.

**Correction:** Freeze evidence manifests at submission/approval. Store content hash, immutable object generation, uploader/time, parser version and extraction revision. Allow additional evidence or administrative tombstones with reasons; retain prior evidence and OCR versions according to a clear retention policy.

**Acceptance:** After approval, upload/delete/rerun cannot rewrite approved evidence. A new extraction is a separate revision. A commissioner can inspect the original bytes, extracted values, corrections, accepted report revision, and approval identity months later.

## QA and delivery findings

### TI-11 — P1 release-evidence gap: the 14-human launch test does not prove the handoff's promised workflow

**Evidence:** `tests/e2e/14-human-reported-launch.test.ts:23-39` invokes the seeding script and invariant checker, then cleanup. It skips if DB/session environment is absent at `:25`. `scripts/seed-14-coach-league.ts:344-388` verifies preseason, roster/recruit/schedule counts, and blocked quick-sim, then ends at `:394-405`. It never runs all-coach readiness, opponent report approval, a commissioner advance, or balance persistence after reload. These are explicitly required in `REPLIT_LAUNCH_IMPLEMENTATION_HANDOFF.md` under “Required 14-coach rehearsal.” Other route-module smoke tests do include basic report/confirm/dispute cases; that does not make this coordinated rehearsal complete.

**Impact:** A green setup/count rehearsal can be mistaken for proof that an actual 14-person Power Pros game week is safe. Current test names and the handoff encourage more confidence than the executed assertions support.

**Correction:** Build one executable, isolated rehearsal that performs the entire promised workflow through real user sessions, including corrections and failures. Release CI must refuse to claim database certification when prerequisite suites skip. Archive commit, schema version, environment, test counts/skips, invariant output, and recovery drill evidence.

**Acceptance:** The test names the 14 distinct users; each owns one team, sets lineup/readiness, submits or confirms assigned results, handles a dispute and correction, retries a request, advances exactly once, reloads, reconciles all balances/stats, and cleans up only its own run namespace. A second isolated 149-team test covers postseason and next-season continuity.

### TI-12 — P2: the migration/release story needs a reproducible bootstrap and recovery contract

**Evidence:** Numbered migrations start with `0030_column_additions.sql`; launch instructions correctly request a disposable copy of production schema, not a guaranteed empty-database bootstrap. `server/lib/runMigrations.ts:121-200` reads applied keys then migrates without a global migration lock/checksum. Its `:170-177` attempts to continue after an SQL “already exists” error inside a transaction without a savepoint; in PostgreSQL an error aborts that transaction. `server/index.ts:208-230` also retains separate mark-before and mark-after startup data migrations, outside the numbered runner and readiness gate.

**Impact:** New environments depend on existing schema state, concurrently starting instances can race migration application, and “ready” means numbered migrations succeeded rather than all startup data work completed. None of this proves current production is broken; it makes a clean reproducible release harder to trust and diagnose.

**Correction:** Provide an authoritative empty-database baseline plus upgrades; use a mature migration runner or global advisory migration lock, checksums and proper error/savepoint handling. Move required data transformations into awaited, versioned migrations. Separate optional backfills with visible job state. Test previous-release to next-release and empty bootstrap independently.

**Acceptance:** Empty disposable PostgreSQL bootstrap, upgrade from a sanitized previous schema, concurrent startup, interrupted migration, and restore to a backup all produce the same schema/data invariants. The server cannot advertise readiness before required data transformations finish.


### TI-13 — P2 reproducibility blocker: committed package URLs depend on Replit's private network

**Evidence:** The first private resolved tarball is `package-lock.json:960`, under `http://package-firewall.replit.local/npm/`. Parent verification counted 116 such resolved URLs and 727 official npm URLs. Two clean installation attempts on CommandCenter failed with npm “Exit handler never called” and left dependencies missing. The exact cause of npm's internal error is not proved, but private-host lockfile URLs are directly observable and prevent a portable clean-install contract.

**Correction:** Regenerate or normalize the lockfile using the supported public registry while preserving intended package versions/integrity. Validate a clean clone/install on the supported BuildLab, CommandCenter, deployment, and CI environments. Record a supported Node/npm version. Parent verification succeeded after temporary URL-prefix normalization: 724 packages installed in 10 seconds. The original committed lockfile was restored clean afterward; this verification did not repair the repository.

**Acceptance:** Clean `npm ci` succeeds without access to `replit.local`, followed by the complete release gate. Missing-package typecheck failures from an incomplete install must not be presented as source defects.

### TI-14 — P1 under lease-loss conditions: a stale advancing worker is detected after it has already written

**Evidence:** `server/routes/simulation.ts:8014-8023` checks lease ownership once before and once after the entire `advanceLeagueStep` call. The step's signature at `:4974-4986` has no lease context; mutation calls inside it do not fence on the owner token. Checkpoint writes at `:8000-8006` do carry a token but are fire-and-forget; that protects checkpoint ownership, not underlying game/recruiting/phase writes. The quick-sim wrapper similarly checks between whole steps (`:5836-5839`).

**Trigger:** Worker A pauses beyond its 15-minute lease, worker B acquires the league, and A resumes while B is mutating it. This is a fault-injection scenario, not an observed production occurrence.

**Impact:** A can continue charging/resetting actions, resolving recruits, or changing phases before its end-of-step ownership check fails. Returning an error afterward cannot undo already committed effects. The July handoff promise that each long-running stage verifies ownership around mutations overstates the implemented fence.

**Correction:** Pass the acquired owner token through every durable stage and fence critical DB writes inside their transaction. Use a monotonically increasing fencing generation where appropriate, and checkpoint side effects atomically. A stale process must be unable to commit even if it never runs another JavaScript ownership check.

**Acceptance:** Suspend A, expire its lease, start B, resume A at every critical stage. A commits no further league mutations, cannot release B's lock, and B completes without duplicate economy/stat/progression effects.

## Architecture direction

The current system has the beginnings of the right boundaries, but they are not complete. Keep a modular monolith and PostgreSQL. Do not introduce microservices merely to look mature. Move command ownership out of the very large route implementation: `server/services/advance/advanceLeagueStep.ts:1-13` currently only re-exports the route implementation, so its service name does not yet create an independent tested domain boundary.

Build these concrete boundaries:

1. **League context and authorization:** resolve actor, membership, role, selected team, result mode, league revision, and permitted phase once. All commands consume this context and revalidate critical state inside transactions.
2. **Official result aggregate:** scheduled game plus immutable report/simulation revisions, accepted result revision, source (`power_pros`, simulation, commissioner), evidence manifest, approval/dispute state, external session ID, game-rules snapshot, and stat completeness. A single command owns acceptance.
3. **Per-game stat/economy ledger:** store contributions rather than only running totals. Derive season/career standings and leaderboards; corrections produce compensating or replacement contributions with full provenance. Reconciliation should detect drift and rebuild projections.
4. **Durable advance state machine:** stage transitions and critical effect ledgers committed together, fenced writes, resumable work, and clear failed/missing-game output. Make “advance succeeded” a verified invariant.
5. **Versioned recovery:** complete table inventory, repeatable-read capture, migration-aware restoration, immutable audit history, off-database backup, and routinely measured recovery drills.
6. **Retryable external work:** OCR, email, and news generation consume durable jobs/outbox records, record attempts and parser/model versions, and never control whether a game result is authoritative.

## Companion acceptance bar

A commissioner should be able to answer: who played, with which locked roster and league rules, what was reported, which screenshot proves it, what was changed, who approved the exact revision, which stats are missing, and what every affected standing/stat was before and after correction. The current application can answer parts of that chain, but cannot yet guarantee the chain end to end.

Minimum ship gate: resolve TI-01 through TI-11 or explicitly disable affected optional functionality; pass isolated concurrent report workflows and injected-failure advance tests; complete a full 14-human week and season transition; restore a mature league including postseason and evidence; publish measured verification evidence against the exact release commit. Player sessions should measure report completion time, unmatched-player frequency, correction rate, dispute resolution time, and commissioner intervention count. The highest-priority usability target is a coach finishing a truthful, reconciled game report without asking the commissioner to repair it.
