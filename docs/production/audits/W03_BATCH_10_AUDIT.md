# W03 batch 10 independent recruit-stage audit

Date: September 18, 2026. Lenses: transaction/lease integrity, baseball recruiting/NIL economy and recovery QA. Implementation and review were performed by separate agents.

## Findings and acceptance

| Severity | Reproduction / impact | Acceptance and resolution |
| --- | --- | --- |
| P1 | Fail the recruiting checkpoint after buzz/signing/NIL writes. Separate commits leave effects without recovery evidence. | Same-client owned transaction; exceptions, suppression and lease loss roll effects and checkpoint back. Helper and HTTP tests pass. |
| P1 | Offseason recruiting calls progression twice, with different week arguments. A single checkpoint cannot distinguish their effects. | Separate primary and offseason checkpoints, source/week/phase checks, and independent second-pass recovery. All four source phases pass helper checks; reported-mode HTTP retry passes. |
| P1 | Separate team/recruit foreign keys allow malformed cross-league interest rows. Filtering one side permits foreign influence. | Filter and guard both memberships. Explicit malformed-relationship fixtures preserve foreign state and exclude foreign signing influence. |
| P1 | Decommit notification errors were caught after changing the recruit. Partial news could survive a retry. | Owned execution propagates errors; forced second-event failure rolls back both notifications, recruit stage, buzz and checkpoint. |
| P1 | Parallel signings share a team's balances and can persist a stale total. | Sequential stable-ID progression accumulates both counters, blocks unaffordable later recruits and regression-locks exact winners. |
| P2 integration | Teams-first prelocking would invert manual signing's recruit-to-team lock order. | New adapter locks recruits first, then teams. Other writer coordination is still an open release gate. |
| P2 policy | Stable-ID order determines who receives scarce NIL/roster capacity. | Explicitly documented technical ordering; fairness, coach priority and long-run parity remain SYS-13/15 work. |

## Evidence and verdict

**Bounded source-review PASS:** both normal calls use owned writes/checkpoint; source/week validation, original lease checks, one-row write guards, strict event propagation and two-sided league scope were independently inspected. The extracted rules were compared with the prior implementation; intentional changes are sequential ID order and strict owned-event failure propagation.

**Independent runtime rerun:** 121/121 PostgreSQL helper assertions and 1,213/1,213 authenticated HTTP/PostgreSQL assertions passed on the frozen implementation, both processes exiting successfully. The reviewer did not independently rerun TypeScript, unit tests or build.

Implementation-owner evidence separately passes 129 configured unit tests, full TypeScript and full production client/server build. Existing build warnings remain. Source inspection, runtime evidence and player enjoyment are distinct; no human playtest occurred.

The HTTP fixtures contain recruits and interests but no games or active CPU teams, and use a commissioner session. Actual takeover is between two live requests in one server process. These tests do not establish all-role or full-season behavior, separate-process takeover, manual-writer isolation or a balance verdict.

## Unresolved audit findings

- **P1 whole-advance recovery:** offseason CPU/portal work still runs before the second recruiting pass on every retry, and other stages remain outside this fence. Reproduce by failing after that prelude in a CPU-populated league. Acceptance: migrate those effects/checkpoints together and prove replay/takeover preserves offers, resources and results. Tracked under TI-08/TI-09 and the existing schedule.
- **P2 recruiting rules:** storyline threshold metadata is omitted from resolver calls; departure and portal sets can overlap; a full-roster leader prevents considering another eligible team. Reproduce with focused signing fixtures before deciding corrections. Acceptance: explicit policy and shared resolver coverage, then economy tests under SYS-12/13/15.
- **P2 replay policy:** random decommit decisions may differ after a fully rolled-back attempt. Acceptance for deterministic replay requires stored/seeded inputs; this milestone claims atomicity only.
- **P2 balance evidence:** preserved double offseason buzz and stable-ID allocation are not a strategy/parity certification. Measure with repeatable campaigns before making fairness claims.

Sources: [owned stages](../../../server/lib/advance-execution.ts), [transaction store](../../../server/lib/recruit-stage-store.ts), [progression rules](../../../server/lib/recruit-stage-progression.ts), [normal engine integration](../../../server/routes/simulation.ts), [helper faults](../../../scripts/verify-advance-execution.ts), [HTTP takeover](../../../scripts/verify-advance-recruits.ts).
