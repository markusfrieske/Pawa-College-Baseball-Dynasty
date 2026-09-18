# W03 batch 06 - postseason winner truth and real advance recovery

Date: September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `fa60861fc0a692d44c820136de37df89d72b7b5c`.

Full-season Super Regional wins now follow each team's identity when Game 2 reverses home field. Reported-mode advance now finds generated week-zero postseason games, preventing unresolved human games from entering simulation merely because the league week is different. The [independent audit](audits/W03_BATCH_06_AUDIT.md) separates these repairs and the bounded real advance drill from remaining recovery gates.

## Delivered behavior

- Both teams' two-game sweeps end after two games. Split series generate the correctly hosted third game and advance its actual winning team. All eight series and their league-owned participants are validated before any bracket projection write.
- Invalid scores, duplicate/nonsequential game slots, foreign participants, out-of-order completion, unknown series/type and post-clinch games require reconciliation. Contradictory completed legacy series are never silently rewritten; downstream games and awards could already depend on them. In-progress counters remain recomputable from valid games.
- Reported-mode preflight selects the current postseason phase rather than requiring its games to share the league's current week. Confirmed human-versus-human reports also need completed valid scores and a linked accepted-report receipt. Orphaned fixtures fail closed. The existing CPU/exhibition policy is unchanged.
- Normal and commissioner force-advance block unresolved generated postseason games before mutations. Existing quick-simulation routes remain disabled in reported leagues. Legacy confirmed results without accepted receipts require reconciliation.
- Super Regional reconciliation errors return actionable HTTP 409 messages through advance/quick-simulation handlers. The bracket applies through the existing storage calls under its caller's lease; it is not a single transaction across all eight series.
- Runtime testing exposed unordered checkpoint writes: the game stage's 10% write could overwrite its later 100% write. Every progress write is now awaited before the next stage, validates ownership of the running operation, and propagates persistence failure. Completion persistence is required for a successful response. Failed status writes are awaited before lease release; each request cleans up its own checkpoint writer.

## Runtime scope

The new bracket helper in the report regression uses real PostgreSQL and the production service, including either winner's sweep/three-game series, next-game hosting, replay and whole-input no-write rejection. The advance helper uses actual authenticated HTTP routes. It does not seed advance operations or checkpoints.

The advance drill begins with a synthetic completed eight-series bracket and fails the second required CWS appearance receipt insertion. The first receipt survives, the second coach update rolls back, the phase/week stay in Super Regionals, the real operation records failure and releases its lease, and no completed phase-transition checkpoint appears. After a fresh HTTP process starts, retry retains the first receipt, finishes all eight appearances and reuses the four existing CWS opening fixtures before completing the transition.

A separate fault rejects the required game-stage completion checkpoint. The actual request fails before creating CWS fixtures or awarding appearances, retains the previous checkpoint and phase/week, records failed status and releases its lease. This is a real database-trigger fault against the route's own operation record.

The final real HTTP/PostgreSQL suite passed **917 assertions** in both implementation and independent runs. The independent configured unit suite passed **129 tests** after the checkpoint repair. Audit verdict: **bounded PASS**. This is not a complete-season, hard-kill, all-writer or player-enjoyment certification.

Full TypeScript, including the expanded regression and imported helpers, passed. All owned random fixture databases and HTTP children were cleaned; the baseline synthetic database was preserved. PostgreSQL was stopped and port 55432 had no listener. The 42 original findings and their status counts remain consistent between trackers.

## Next production step and limits

Repair and test stale-operation recovery so checkpoints from a prior season/phase/week cannot be imported into the current state. Exercise completion-write failure, a hard interruption around phase flip, same-state resume, lease loss and standard-mode transitions. Checkpoints and the league phase flip are still separate writes. Failure-status persistence can itself fail during a database outage; it remains best-effort error cleanup. The successful required-write failure/restart drill does not certify those boundaries.

The pre-existing full-season CWS initializer can reset progressed opening-series state on a stale transition retry. Keep that issue coupled to checkpoint identity/replay work. All-American counters, legacy reconciliation, external coach writers, chronological pitcher rest, complete result contributions and history-safe restoration remain open. SYS-11's broader selection-policy work is still planned; TI-08/TI-09 remain implementing. No production data, main merge, deployment or art-selection change is included.
