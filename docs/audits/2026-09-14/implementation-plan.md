# Improvement program — review-ready work packets

**Status: proposed scope, not implemented or approved for deployment.** Canonical context: [full audit](README.md), revision `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`.

Frisk owns product decisions. Sophia Production Director should sequence one task branch per active code workstream; overlapping result/advance/persistence work should run sequentially. Implementation can be handed to BuildLab through the Cross-Device Command Queue once the packet and canonical Git artifact are selected. This audit did not dispatch a device handoff, create external issues, publish changes, or schedule work.

## Milestone 1 — One trustworthy game

**Player-visible result:** Two coaches can prepare, report, approve, correct and recover one real Power Pros game, and every official screen agrees. The same acceptance boundary can receive a server-produced simulated game.

**Owners:** Gilfoyle Roblox Technical Director applies the web implementation; JD Player Experience Lead owns the coach workflow; Passan Baseball Expert defines the supported scoring contract; Gibs QA & Player Research Lead independently verifies it.

| Packet | Work | Acceptance proof | Dependencies |
| --- | --- | --- | --- |
| M1.1 Permissions | Apply explicit member/team/commissioner/public-view policies to every league endpoint; exclude emails from ordinary DTOs; keep unsafe PBP disabled until server-session authority is implemented. | Warm/cold-cache actor matrix; outsider/guest/foreign-team calls cannot read private fields or mutate results. Test flag on and off. | None; TI-01/02 |
| M1.2 Result contract | Normalize scores, inning/outs structure, participants, decisions and stat completeness. Use one validator for all ingress/finalization. Store roster/rules revisions. | Reject impossible counters, foreign/missing IDs under full-stat policy, and inconsistent boxes; accept all explicitly supported legal endings. | M1.1; TI-03/04, SYS-07/16 |
| M1.3 Revision and commit | Version draft/submitted/disputed/accepted reports. Atomically accept exact revision and persist per-game contributions, standings, rest, career effects, audit receipt. Fence concurrent edits. | Duplicate submit, edit/confirm, dispute/confirm, process interruption and retry all reconcile. Stale requests get a conflict instead of overwriting. | M1.2; TI-05/09 |
| M1.4 Durable game workspace | Save/resume manual and OCR drafts; explicit roster selector for unmatched batting rows; show reporting obligations upfront; unify prep/report/review/evidence/status. | Refresh, interruption, offline/reconnect and stale-device edit fixtures; correction of a name also binds correct player ID; both coaches see exact revision. | M1.2/3; UX-01/02/08/12 |
| M1.5 Evidence and correction | Freeze evidence manifests, append OCR/report revisions, preserve approvals/reasons, implement validated amendments and derived-stat reconciliation. | Evidence cannot be silently removed after approval; corrected score/box/stat/standings all agree; original remains inspectable. | M1.3; TI-04/10 |
| M1.6 Recovery | Version the league snapshot inventory; capture consistently; coordinate restoration with all writers; preserve audit/finalization identities. | Restore a mature league containing reports, evidence links, story resolutions, recruiting, rivalries and postseason; compare all intended data and retry safely. | M1.3/5; TI-06/07 |

Do not call this milestone complete because a report POST returns 200. The evidence must show both user sessions, exact accepted revision, official contributions, correction and restart/restore.

## Milestone 2 — A season that advances safely

**Player-visible result:** A week either completes all required results and effects, or stops with a clear retryable blocker. Pitcher availability follows the actual game order.

| Packet | Work | Acceptance proof |
| --- | --- | --- |
| M2.1 Calendar | Separate game kind from calendar day/order; assign conference series, byes and doubleheaders; use one calendar across prep, reporting, sim and rest. | 149-team schedules across seeds have legal slots; Friday/Saturday/Sunday starters behave correctly; second same-team game uses committed first-game workload. |
| M2.2 Durable advance | Move advance logic out of route implementation into a real command service; checkpoint critical effects, fence lease ownership inside writes, fail on uncommitted required games. | Pause/expire/resume workers, inject finalization failure, restart between stages; no unfinished game is skipped and no side effect disappears or duplicates. |
| M2.3 Commissioner operations | One blocker queue, explicit readiness and report states, advance preview/receipt, postponement/forfeit/coach-replacement policies. | Two commissioners can resolve a disputed result and a missing report, advance once, and explain every change without a database console. |
| M2.4 Reproducible release | Portable lockfile, documented supported runtimes, empty-schema bootstrap and upgrade path, migration serialization, CI gates with explicit skips. | Clean install/build, disposable-DB integrations, full 14-coach week, season transition, backup restoration and invariant report on exact release SHA. |

Dependencies: M1 result/recovery boundaries. Primary findings: SYS-02/04, TI-08/09/11/12/13/14. A safe workaround is to restrict advertised modes until their complete paths pass; a helper test alone is insufficient.

## Milestone 3 — Baseball decisions produce baseball consequences

**Player-visible result:** Legal lineup, pitching and strategy choices influence a coherent game, and quick simulation and replay describe the same events.

**Owner:** Passan Baseball Expert defines the event model and scoring; Banks Gameplay Systems & Economy Designer defines tunable decision hypotheses; Gilfoyle Roblox Technical Director implements; Gibs QA & Player Research Lead verifies.

1. Build a pure seeded state transition engine with base/out/inning/game-end state and pitcher responsibility. Return an event ledger and derive the box. Reuse the M1 official result contract.
2. Resolve actual active lineup, positions and available staff before play. Preserve participants and substitutions, including supported two-way-player rules.
3. Introduce explicit batting/pitching/baserunning tradeoffs conditioned on personnel and context. Remove unconditional run bonuses presented as styles.
4. Make quick sim, watched replay and later live coaching use the same core. Secure server-owned sessions before re-enabling play-by-play finalization.
5. Derive pitcher decisions and traditional stats correctly. Hide unavailable tracking data and label any game-specific estimates with definitions and input coverage.

Proof: at least 100,000 seeded conservation checks as a proposed engineering target; fixed fixtures for game endings, responsible runners and substitutions; paired policy experiments; unused bench changes leave game inputs unchanged; active lineup changes affect participants/outcomes appropriately. Establish calibration targets from the selected rule set and desired game pace. Do not tune a broken accounting model to look plausible on average.

Primary findings: SYS-01/03/04/05/07/08/09/16. The companion can reach quality independently of deeper simulation if external results use the corrected shared contract; do not hold its reporting fixes hostage to a full simulator rewrite.

## Milestone 4 — A coherent, comfortable daily coaching loop

**Player-visible result:** A new or returning player understands the next meaningful choice, completes it comfortably, and sees what changed.

**Owners:** JD Player Experience Lead and CeeDee Creative Director; Clarke Art Director handles the presentation pass after layout stabilizes.

- Setup begins with solo / run Power Pros league / join league, then a reviewed preset. Show advanced rules progressively.
- Consolidate the hub into Today with role/mode priorities. Fix News routing and state-preserving deep links.
- Replace blocking routine popups with inline success and persistent error feedback. Keep confirmations for consequential decisions.
- Give roster/depth/reorder tasks full keyboard and touch alternatives, visible focus and readable tables. Test narrow widths and text zoom.
- Show metric provenance, missing data, pending reports and known uncertainty consistently.
- Use compact operational artwork and reserve celebration/audio for actual milestones; preserve mute/reduced-motion preferences.

Proof: five unfamiliar coaches and two commissioners complete the core tasks independently; manual 320/390/768px, keyboard and zoom review; observe task completion, interruptions, missed errors and perceived obligations. The sample size is a formative usability gate, not statistical proof of market retention. Set reporting-speed targets after observing actual screenshot and manual-entry work.

Dependencies: M1 draft/result semantics; parts of M2 status. Primary findings: UX-03/04/05/06/07/09. Mechanical fixes should not wait for a complete reskin.

## Milestone 5 — A dynasty with strategic depth and player memory

**Player-visible result:** Recruiting, development and retention create different defensible program-building paths, and the league remembers actual achievements.

| Packet | Owner | Acceptance proof |
| --- | --- | --- |
| Truthful promises and awards | Banks Gameplay Systems & Economy Designer + Passan Baseball Expert | Championship promises use championship records; performance awards use qualified supported stats; unknown data remains pending; outcomes replay deterministically. |
| Recruiting intelligence | Banks Gameplay Systems & Economy Designer | Fix integer-potential comparisons; AI uses revealed information, needs and affordability; no alphabetical signing advantage; competing same-cost policies benchmarked. |
| Development plans | Banks Gameplay Systems & Economy Designer | Small explicit choices produce bounded explainable differences under identical seeds; roles, workload and readiness connect to their stated consequences. |
| Sustainable league economy | Banks Gameplay Systems & Economy Designer | 10–20-season campaigns measure talent/title concentration, rebuild mobility, inflation, retention affordability and CPU/human information parity. Parity presets are explicit. |
| Player history and narrative | Bookie Narrative & Character Lead + CeeDee Creative Director | Stable identity across transfers/seasons; signature games, promises, memories and departures link to sources; dilemmas have competing legitimate costs; no fabricated Power Pros moments. |
| Postseason transparency | Passan Baseball Expert | Preset states field size, qualification, strength-of-schedule policy and tiebreaks; every seed/award has an inspectable explanation. |
| Power Pros roster adapter | Gilfoyle Roblox Technical Director + Passan Baseball Expert | Edition/platform mapping validated; approved old/new roster change sheets; unsupported fields/rounding disclosed; next-season app and console roster versions reconciled by coaches. |

Dependencies: trustworthy results/calendar and declared league rules. Primary findings: SYS-06/10/11/12/13/14/15, UX-10/11. Tune one balance family at a time with controlled seeds. Existing historical inaccuracies require a labeled legacy/provisional policy; do not invent missing past data to produce a clean table.

## Explicit release gates and residual questions

**Companion release gate:** a 14-human rehearsal completes join/claim, locked roster prep, an entire reported week, confirmation, a dispute, correction, retry, commissioner advancement, reload, season transition, export and mature-state restore. No claimed DB certification may silently skip its required suite.

**Solo release gate:** coherent event accounting, meaningful active-lineup/strategy effects, chronological rest, safe advance/restart, honest season recognition and stable multi-season data, followed by actual first-session and returning-player sessions.

**Questions to resolve before implementation:** Power Pros edition/platform; game innings/tie/mercy rules; external roster capacity and update mechanism; reporting completeness policy; competitive progression/parity; asynchronous cadence and abandoned-game handling. These do not prevent this audit or the generic correctness repairs.

**Defer:** more attributes, generic news volume, larger catalogs, microservices, automatic console-sync promises, and a broad visual reskin. Reconsider only when they solve an observed player problem and do not distract from the release gates.

No calendar estimate is offered: the simulation/recovery changes are substantial and need an implementation spike plus deployment access to estimate responsibly. Size packets by verified player outcomes, and stop each milestone for independent evidence review before widening scope.
