# W02 batch 01 — supplied report data and roster integrity

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. Implementation commit: `1b6c24633654798793f50d80eb4d6b74b36d1639`. This dependency-ready W02 slice began ahead of the provisional calendar while the complete-media build remained unavailable.

**Result:** Malformed stat rows, impossible supplied counters, missing or foreign player IDs, and inconsistent score corrections are rejected before the reviewed report/result writes. Commissioner edits and persisted reports now receive the same roster checks as submissions. Valid full reports and the existing commissioner score-only path still finalize.

## Behavior delivered

- The pure validator accepts untrusted input safely and reports field-addressable issues. It checks array/object shapes, inning pairs and supplied totals, required form counters, IP notation, duplicate/missing IDs, nonnegative numeric values and storage bounds. Core fields match the existing report form; advanced fields remain optional but are checked when supplied.
- Safe arithmetic checks include hits and strikeouts versus at-bats, extra-base hits versus hits, home runs versus relevant runs/RBI/hits, and earned runs versus runs allowed. The same player may bat and pitch; substitutes and valid runs without at-bats are not rejected by invented restrictions.
- Shared service validation binds a report to the game/league and checks every supplied batting/pitching ID against the corresponding current team roster, including partial commissioner data. Names remain display labels; roster IDs determine membership.
- Submit and edit validate summary-hit defaults exactly as persisted, preventing omission from passing initially and failing only after storage supplies zero. Stored reports are checked again before confirmation, already-complete confirmation, force-finalization and direct reported-finalizer invocation.
- Dispute score proposals must satisfy the existing score policy. Applying a correction that contradicts retained innings or batting totals now returns 422 without finalization writes. The commissioner must edit the affected report data consistently first; a new atomic revision workflow remains W03 work.
- Added `test:reported-results` to the release gate and the new pure validator tests to `test:unit`.

## Verification

| Gate | Evidence |
| --- | --- |
| Independent pure validator review/run | 15 tests passed, with table-driven adversarial values across known persisted fields and compatibility cases. |
| Independent HTTP/PostgreSQL gate | 81 assertions passed using actual routes, registration/PgStore and an owned random database. Invalid mutations left snapshots of every public table except session housekeeping unchanged. |
| Positive finalization | A valid full report produced 18 mapped player-season rows, one total run/hit, and the submitted 24/27 outs on the two mapped pitchers. A two-way player has one season row. Score-only finalization added no player lines. |
| Complete unit suite | 88 tests passed. |
| TypeScript | Full project plus new HTTP harness and validator tests passed. |
| Independent audit | [W02 batch 01 audit](audits/W02_BATCH_01_AUDIT.md), no remaining blocker for this bounded slice. |
| Cleanup | Parent verified zero owned report fixture databases remained, stopped the local test cluster and confirmed its port had no listener. |
| Whitespace | `git diff --check` passed. |

Two initial test runs stopped during fixture creation because a reused SQL parameter inferred conflicting types and fixture teams violated the league-name uniqueness rule. Both fixture defects were repaired before final passing runs. No application validation was weakened to pass the tests.

## Remaining work and policy boundaries

TI-03 remains **implementing**: current-team membership is not an immutable season/roster revision, all game structures and pitching/batting aggregates are not reconciled, and complete per-game ledger acceptance has not been established. TI-04 is **mitigated** at validation boundaries; correction provenance, versioning, atomicity and races remain open. A check before a transaction cannot certify concurrent edits or stale finalization.

The existing application still permits only non-tied 0–30 scores and requires at least nine batting rows when batting is supplied. Those are current application limits, not approved universal Power Pros rules. Commissioner score-only and partially supplied data still need explicit completeness/provenance metadata. Uncollected advanced metrics, inferred pitcher decisions and trusted AVG/ERA display fields are not certified by these checks. See the [Power Pros contract inputs](POWER_PROS_CONTRACT_INPUTS.md).

No complete client build, browser workflow, mature-save recovery, release rehearsal or human enjoyment is established here. Nothing was merged or deployed.

**Next:** continue W02 with the OCR roster-identity correction defect (UX-12) and reporting requirements/error feedback, which can advance without inventing game-ending rules. Use existing merge helpers and real form data to test that selecting a roster player updates its ID while preserving extracted stats. Continue generic result reconciliation where valid independently of the pending rules. Keep complete-media/browser and rule decisions explicit; do not repeat this passing gate as a substitute for the next implementation.
