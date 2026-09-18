# W03 batch 07 - interrupted advance identity and durable handoff

Date: September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `dd159daf3129873abafccc9944ff29b5efee121d`.

An interrupted advance can no longer reuse an earlier phase's checkpoints against the current league state. Ambiguous phase changes refuse further advancement and preserve their evidence. Exact-source retries inherit validated progress through an atomic operation handoff. See the [independent audit](audits/W03_BATCH_07_AUDIT.md); TI-08 and TI-09 remain implementing.

## Delivered behavior

- The shared recovery check compares the operation's source phase, week and season with the live league. Unsettled changed-source operations require reconciliation. A later completed retry settles earlier failures only for that exact source identity; ordinary historical failures do not permanently block a successfully recovered league.
- Known checkpoint names, object shape and finite numeric progress from zero through 100 are required. A completed transition against an unchanged source is contradictory. Older failed attempts whose completed-stage evidence disappeared in a later attempt are blocked rather than silently merged or replayed.
- Normal advance reads live identity again under its acquired lease. Same-source failed or expired running work can transfer to a successor. Predecessor retirement and successor creation share a transaction, copy validated checkpoints, and compare the predecessor's checkpoint snapshot before committing. Failed insertion leaves the predecessor intact. Original failure messages survive retry; inherited completed game stages are not downgraded to 10%.
- Failure to record terminal failure retains the operation's matching lease. Immediate retry reports unfinished work instead of claiming success. A uniqueness conflict alone no longer produces success; the catch branch requires an actual completed operation with the exact source identity. That narrow catch branch is source-reviewed; the early running-operation rejection is runtime-tested.
- Normal advance, force-advance, clear-stuck and quick-simulation entry points consult recovery evidence. Clear-stuck only removes expired locks and preserves operations/checkpoints for normal resume. Status exposes the reconciliation requirement. The commissioner panel explains it, disables misleading lock-clearing, and no longer labels every healthy active lock as stuck.
- Restore refuses current advance-operation history or target `leagueAdvances` evidence. This also conservatively blocks old-format restoration after successful recorded advances until W04 can preserve operation history. It is loss prevention, not complete recovery.

## Runtime evidence and limits

The recovery regression uses real authenticated routes, PostgreSQL and fresh HTTP processes. It distinguishes seeded malformed/stale-operation scenarios, seeded helper transaction tests, real route fault injection and an actual process kill.

For the kill drill, a test-only PostgreSQL trigger pauses the real phase-transition checkpoint after Super Regionals have committed their CWS phase flip. The test observes that changed phase, the true source operation and all eight award receipts, hard-kills its HTTP child, and terminates only the identified blocked PostgreSQL test backend before releasing the barrier. This prevents the held checkpoint from committing after client death. Lease expiry is advanced only for the synthetic fixture rather than waiting fifteen minutes. No operation or checkpoint is fabricated for this drill.

After restart, normal/force advance, clear-stuck and applicable quick-simulation calls repeatedly return recovery-required refusal without writes. The already committed awards and four CWS games remain unchanged. This proves containment after that real interruption; it does not automatically repair the partial transition.

Separate real-route tests cover a completion-status write failure after phase flip, a checkpoint failure combined with failure-status persistence failure, retained ownership, and successful exact-source recovery after a fresh process starts. Seeded tests prove handoff insert rollback, repeated inherited checkpoint preservation, original error retention, malformed/unknown checkpoints, independent phase/week/season mismatch, game-free restore containment and legacy progress regression refusal.

Final verification: **1,078 real HTTP/PostgreSQL assertions passed** in both implementation and independent runs. The independent configured unit suite passed **129 tests**. Full TypeScript, including the recovery regression and commissioner panel, passed. Audit verdict: **bounded PASS**. The 42 original findings retain their existing status counts; none of these containment measures closes the broader recovery findings.

Owned random fixture databases and HTTP children were cleaned. The baseline synthetic database was preserved; PostgreSQL was stopped with no listener on port 55432. No unrelated preview or application process was stopped.

## Next production step

Fence each running execution's stage writes and checkpoints against its own immutable lease token. The current global per-league checkpoint writer can still be reached by a superseded live worker; this milestone kills the old worker and does not certify overlapping takeover. Add a live-old-worker takeover drill before claiming lease-loss safety.

Then define durable intended target state and stage-effect evidence so a phase-flipped interrupted operation can be reconciled safely. Existing refusal is containment and still needs an audited repair path. Quick-simulation now respects normal-advance recovery evidence but does not yet record every fast-forward step as its own durable operation. Stage side effects, All-American counters, external writers, standard-mode journeys, chronological rest, complete result contributions and mature-state restoration remain open. The commissioner change is type/source-checked; full-page/media and human-usability validation remain separate gates. No deployment, merge, production-data change or art-direction approval occurred.
