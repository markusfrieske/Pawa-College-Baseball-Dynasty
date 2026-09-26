# Class of Nine — Revised Production Plan

**Revision:** September 26, 2026 · **Branch:** codex/pawa-quality-overhaul
**Accountable producer:** Sophia · **Product/art authority:** Frisk
**Execution:** manual continuation only; scheduled development remains paused.

## 1. Purpose and authority

Deliver a PC sports management game with two credible modes: a standalone college-baseball text simulator and a Power Pros online-league companion. The skill update improves how the team produces and verifies assets; it does not remove the outstanding gameplay, data-integrity or release gates.

This revision supersedes the old calendar's sequencing and asset-production process, not its unresolved scope. The original W01–W14 identifiers remain traceability labels. The September–December dates are a historical estimate, not a renewed release commitment. Reforecast dates after recovery passes and the first asset benchmark is measured.

Canonical supporting records:

- [Original schedule and batch history](PRODUCTION_SCHEDULE.md)
- [Finding tracker](finding-tracker.json): retain every open finding and supplemental follow-up; no status closes through this planning update.
- [PC game UI guide](../art-direction/pc-sports/GAMEDEV_GUIDE.md)
- [Approved flat-card information/design contract](../art-direction/pc-sports/research/COACHING_INFORMATION_PASS.md)
- [Latest committed milestone: W12 batch 13](W12_BATCH_13.md)

## 2. Verified starting point and unfinished work

| Area | September 26 planning status | Consequence |
| --- | --- | --- |
| Brand and art authority | Class of Nine name; approved symmetric C9 campus/stadium gateway and wordmark; Varsity Club forest/brass/cream; cel portraits; flat card surfaces; PAWA rating/ability colors | Preserve these choices. No new brand exploration or wholesale regeneration. |
| Roster, Team, Recruiting, Arrival | Multiple implemented slices; broader W12 remains open | Reuse approved components while giving each screen its own management composition. |
| Arrival history and presentation | Commit 0080b53 includes scrapbook, sound and keepsakes; batch 13 records 387 checks and build/typecheck passes | Historical evidence for that commit, not verification of today's modified recovery tree. Human sound/enjoyment review remains distinct. |
| Signing Day recovery | Local, uncommitted work: stage receipts, scoped transactions, commissioner panel, migration 0057 and fault/restart harness | First implementation priority. Do not describe as shipped, fully tested or safe to release. |
| Recovery audit blockers | Concurrent manual signing/NIL writers are not yet safely serialized; all-errors/zero-success development can bypass failure handling | Fix and reproduce both before accepting the recovery milestone. |
| Crash/restart evidence | A worker harness was added; the final restart run was interrupted before execution by a tool approval-service usage error | Rerun actual process-kill/restart checks; do not count the harness as passing evidence. |
| Updated asset capability | Local game-asset-production skill and its reference recipes are available | Use now for briefs, review rubrics, manifests and integration planning. |
| Scenario service | No callable Scenario tools discovered in this task | Generation, pricing, training and vendor job execution are unverified. Existing local assets and native UI work remain usable. |

The game remains PC-only. Mobile navigation and mobile optimization are outside scope. Steam is the intended distribution target; packaging, input and release readiness still require explicit verification.

## 3. What changes with the updated game-dev skills

The local adaptation records upstream commit **9624e295fa33168bc1be22a628c23ba132d1c959**. Its production rules now apply to every new asset family:

1. Write a small asset contract before production: approved reference, purpose, camera/size, silhouette, palette, output type, destination and acceptance criteria.
2. Prove one representative asset in the actual game before expanding a batch.
3. Anchor every variant to the approved baseline. Separate identity, style and pose references; changing seeds alone is not proof of consistency.
4. Preserve vector/native UI for logos, functional icons, exact labels and ratings. Use bitmap generation for illustration needs.
5. Inspect real transparency, edge quality, crop, team recoloring, dimensions and loading behavior at gameplay size.
6. Keep visual approval, technical checks, in-game verification and human enjoyment as separate evidence.
7. Maintain provenance and a revision budget. Fix a specific defect; do not repeatedly regenerate passing work.

The upstream catalog describes game-asset, consistency and refinement workflows, with an optional Scenario MCP connection. Its Blender/Unity examples do not establish this project's engine or toolchain. [Upstream repository](https://github.com/scenario-labs/skills), [pinned adaptation source](https://github.com/scenario-labs/skills/tree/9624e295fa33168bc1be22a628c23ba132d1c959).

**Explicit exclusions:** no engine migration, automatic model training, paid generation, bridge installation, new brand direction or large source-asset download is authorized by this plan. The approved TypeScript/React game remains the integration target. Blender/3D work is optional source-art work only if an approved brief needs it.

## 4. Dependency-driven production sequence

Effort ranges below are **proposed focused workdays**, not elapsed calendar promises. They assume one integration writer and targeted independent review. Re-estimate after each exit gate; do not add the ranges into a launch date without measured throughput.

| Milestone | Outcome / scope | Lead and review | Dependency | Proposed effort / exit gate |
| --- | --- | --- | --- | --- |
| P0 — Finish recovery | Close pending signing concurrency and development-error defects; atomic effects/receipts; lease loss; bounded retries; truthful commissioner status; legacy ambiguity containment | Gilfoyle; Gibs + Passan review | Existing unfinished changes first | 4–7 days. Actual rollback, hard kill, fresh-process retry, duplicate recovery, concurrent signing/NIL, stale-worker and both-mode tests pass. No repeated eligibility, XP, recruits, budget debit or history. |
| P1 — Asset baseline and pilot | Inventory approved art and consumers; manifest; one current portrait/card benchmark spanning Roster, Team, Recruiting and Arrival | Clarke + CeeDee; JD + Gibs review | Briefing can overlap P0; integration follows P0 | 2–3 days. One asset passes reference, alpha/crop/color, disclosure, rendered export and PC-size checks before variants. |
| P2 — Recovery beyond Signing Day | Complete consistent save inventory, history/evidence preservation, migration readiness and mature-league restore; chronological workload and broader advancement fences | Gilfoyle + Passan; Gibs review | P0 | 5–10 days. Played-league recovery and concurrent capture drill passes; preserved reports, receipts, arrivals, stats and awards. Original W03–W05 scope remains traceable. |
| P3 — Complete companion workflow | Schedule → game prep → report/draft → opponent confirmation/dispute → accepted result → history; commissioner blockers; versioned Power Pros mapping | JD + Passan; Gilfoyle + Gibs review | P2; approved asset benchmark | 5–8 days. Two-coach interrupted workflow works without OCR; unknown stats remain unknown; corrections/evidence stay traceable. Resolve edition-specific rules explicitly. |
| P4 — Simulation and balance | One seeded event history for quick sim/replay; legal scoring/pitcher responsibility; lineup/fatigue; factual promises/awards; recruiting, NIL and development experiments | Passan + Banks; Gibs review | P2; result contract from P3 | 10–18 days. Conservation and replay equivalence; paired strategy tests; multi-season economy/development results. Do not change balance hypotheses without measurement. |
| P5 — Screen-by-screen art rollout | Complete remaining management scenes and approved asset families using P1 contracts; narrative identity; loading/error/empty states; arrival/keepsake finish | CeeDee + Clarke + Bookie; JD + Gibs review | P1; each screen's gameplay/data contract | 6–10 days, staged alongside stable P3/P4 screens. Each scene has distinct composition, keyboard flow, honest state and verified assets. |
| P6 — PC/Steam candidate | Desktop packaging spike; save locations/upgrade/recovery; target-PC performance; input and accessibility; licensing/provenance; install/update/uninstall behavior | Gilfoyle + Sophia; Gibs review | P2–P5 | 4–7 days. Candidate build runs on a clean target PC with measured evidence. Do not infer controller or Steam Deck support. |
| P7 — Final rehearsal and review | 14-coach companion rehearsal; 149-team season/postseason/next-season run; multi-season balance; restart/restore; independent final audit | Gibs + Sophia; all relevant specialists | P6 | 3–5 days plus defect reserve. No unresolved release blockers; Frisk reviews the candidate before release. |

**Parallelism rule:** brief writing and read-only reviews may proceed independently. One task/device writes the branch. This table assigns accountability; it does not launch agents, handoffs or scheduled jobs.

## 5. Screen and asset rollout order

| Order / scene | Player decision and art work | Acceptance evidence |
| --- | --- | --- |
| 1. Shared athlete identity | Keep the approved 30 faces; stable identity across lifecycle; team-variable uniform color; consistent crop and biography | Same player across all four workspaces; original scrapbook identity survives rebrand/transfer; no retired cartoon fallback. |
| 2. Roster | Compare players, choose a role, inspect the complete front card | Dense readable ledger; all supported ratings/stats/abilities; approved pitch segments; no false zero or lost selection. |
| 3. Team and lineup | Assign the diamond, batting order and staff; compare rating and potential | Assignment persistence and legal constraints; click-through complete profiles; bounded PC layout. |
| 4. Recruiting/scouting | Compare what is known, uncertain and undiscovered; spend contact/scouting resources | Exact/range/unknown states; meaningful action costs/results; no hidden-rating leak in transport, art labels or exports. |
| 5. Arrival and scrapbook | Choose the spotlight and keep a dated class record | Original faces and full disclosed front cards; mute/reduced motion; readable long names, class sheets and downloaded images; Frisk listening review. |
| 6. Schedule, prep and result | Understand the next series, submit/confirm, then read an official recap | Distinct calendar/prep/scorer/result scenes; reported versus simulated provenance remains visible. |
| 7. Development, legacy, news and stories | Understand change over time and the people involved | Before/after data, dated artifacts, stable cast, earned achievements and narrative continuity. |
| 8. Entry, settings and commissioner | Continue/join/configure or resolve an actionable problem | Clear startup/save failures, accessible controls, factual recovery status; no decorative success states. |

Only fill demonstrated asset gaps. Coach portraits, new campus variants, animation families and additional faces require their own pilot; the new skill is not a reason to replace approved art.

## 6. Asset production packet and acceptance gates

Proposed canonical location: docs/art-direction/production/. Create packets when the corresponding work starts; the paths below are planned deliverables, not existing files.

- ASSET_REGISTER.json: stable asset ID, family, approved baseline/version, source/license record, destination/consumers, dimensions/format/alpha, tint/mask rules, status and evidence links.
- briefs/<asset-id>.md: purpose, approved references, invariant versus requested change, target gameplay size, required outputs, proposed/approved budgets, owner and rubric.
- reviews/<asset-id>.md: pass/revise/fail by criterion, exact artifact revision, before/after captures, technical/runtime checks, remaining issues and next owner.

Workflow: **brief → representative candidate → technical cleanup → actual-game integration → review → family expansion**.

Use these gates proportionally:

| Gate | Required proof |
| --- | --- |
| Authority | Approved reference and explicit scope; existing logo, palette and flat styling preserved. |
| File quality | True alpha where needed; no painted checkerboard; consistent padding/crop; no clipped text; versioned source/export pairing. |
| Identity | Face remains the same under pose/crop/team tint; skin/hair/eyes do not get recolored with the uniform; varied family remains coherent. |
| Game rendering | Intended scene and card size, loading/fallback behavior, light/dark edges and export match. Ratings, names and labels are native runtime data. |
| PC access | 1280×720, 1366×768, 1920×1080, 2560×1440 and 3440×1440; keyboard/focus; 125% and 150% scaling; reduced motion; audio settings. Run affected combinations, not a blanket claim from one capture. |
| Performance | Measure representative asset load time, frame hitches and memory on the target PC class; set budgets from baseline before expanding the family. |
| Human review | Frisk accepts new visual choices and judges feel/readability; automated critics are advisory. |

For optional mesh work, add units/scale, pivot, topology, material slots, texture-map conventions, collision and rig/deformation checks. Mark any unsupplied budgets as proposed; no generic platform limits are invented.

## 7. Optional Scenario execution lane

When an asset task actually needs Scenario: verify callable tools and the authorized project, inspect the selected model's live schema, price the intended input and downstream passes, obtain an explicit spend cap, then run one informative pilot. Record job/output IDs; reconcile timed-out or ambiguous jobs before retrying. Never assume a local file path is an uploaded reference.

Without an agreed revision budget, propose at most three paid rounds. Stop earlier if the cap is exhausted or the same criterion fails under two distinct fixes. Preserve passing work; escalate reference-driven inconsistency to custom training only with a justified dataset and explicit cost authorization. Current plan performs no paid operations.

This lane must not block native SVG/CSS/UI work or reuse of approved local portraits. Sound already has an original procedural implementation; vendor audio is an optional alternative only after a listening review identifies a specific need.

## 8. Ownership, audits and reporting

Sophia owns scope/dependencies and evidence links. Gilfoyle owns TypeScript/database/integration work; the legacy role title does not make this a Roblox project. Passan owns baseball correctness and external-game mapping. Banks owns strategy/economy experiments. JD owns PC workflows/accessibility. Clarke owns art consistency and asset contracts. CeeDee owns overall cohesion. Bookie owns narrative/character continuity. Gibs independently reviews tests, failure cases and player research. Frisk owns new design choices, spending and release approval.

At every milestone:

1. Read current evidence and choose a dependency-ready scope.
2. Implement with synthetic local data; preserve saves and unrelated work.
3. Have an independent reviewer inspect the relevant integrity/baseball/UX/art risks.
4. Record severity, reproduction, acceptance criteria and evidence; fix milestone blockers.
5. Rerun affected checks and distinguish source review, runtime evidence and human approval.
6. Commit verified code plus tracker/batch evidence to the authorized branch. Do not merge/deploy implicitly.

CommandCenter handles planning, reviews and lightweight work. Resolve actual build/art device roots from ignored device configuration. If a handoff is needed, use the Cross-Device Command Queue with a canonical artifact link and disjoint ownership; no device is dispatched by this plan.

## 9. Immediate next work packet

**Resume P0 before expanding assets.** Preserve the current recovery edits. Fix the two known audit blockers, then verify transaction-scope poisoning/late work, stage rollback, lease expiry, concurrency and actual process restart in simulator and companion modes. Verify commissioner UI against the built application. Update the tracker and recovery batch only after those tests pass.

In parallel, prepare P1's asset register and one portrait/card benchmark brief using existing approved art. No new generation or visual redesign is needed to start. After P0 and the pilot pass, Sophia reforecasts the remaining milestone dates using measured effort and the unresolved finding inventory.
