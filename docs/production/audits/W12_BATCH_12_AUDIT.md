# W12 batch 12 — Independent scrapbook audit

Read-only game-dev source review; parent owns implementation and runtime checks. Evidence: [batch](../W12_BATCH_12.md), [regression](../../../scripts/verify-arrival-scrapbook.ts).

## P1 — Original identity lost when a team changes colors between captures

Reproduction: capture one signing, rebrand the team, capture another, open both historical cards. Group-level identity made one card use another capture's colors.
Acceptance: each historical card retains its own captured team identity, in gallery and spotlight.
Resolution: per-record arrivalTeam accompanies the immutable player snapshot. Both renderers consume it. Differing capture colors tested. Source reviewer verified the correction.

## P1 — Finalization retry advances eligibility twice

Reproduction: inject archive insertion failure after player conversion; retry the partially completed Signing Day. Returning players could age twice; newly converted players could also age.
Acceptance: a retry must not repeat partial mutations; preserve failed operation and roster for reconciliation until recovery is safe.
Resolution: current-class newcomer guard; durable transition entry before finalization; recovery inspection rejects interrupted Signing Day. Injected-failure HTTP test verifies500 then409 with unchanged roster on retry. This is containment. W03 remains open.

## P1 — Legacy season endpoint bypasses failure fence

Reproduction: after the above failure, POST advance-season as commissioner. It previously called finalization directly.
Acceptance: no alternate endpoint may rerun the interrupted operation.
Resolution: legacy endpoint returns409 after existing authorization, directs normal advance controls. Regression confirms both retry endpoints leave player eligibility unchanged.

## Final review

Reviewer found no remaining scrapbook milestone blockers after these fixes. Verified source: membership protection, explicit snapshot whitelist and pinned portrait, original per-record identity, source-independent archive, same-league roster links, and failure containment. Runtime results belong to parent:362 normal checks,341 failure-mode checks,39 migration assertions. Automatic recovery, historical backfill, large-class enjoyment and audio are not certified.
