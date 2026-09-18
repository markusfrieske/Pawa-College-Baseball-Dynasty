# W03 batch 05 - durable postseason coach milestones

Date: September 17, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `66e0aee22e022379cffbe1809635661ca64d807d`.

Conference titles, College World Series appearances and national titles now persist their coach counter, legacy score, perk-adjusted XP and skill points in one transaction with a durable receipt. Retrying the same team milestone returns its original receipt. The [independent audit](audits/W03_BATCH_05_AUDIT.md) reviews this bounded milestone; TI-08 and TI-09 remain implementing.

## Delivered behavior

- Migration 0054 adds receipts identified by league, season, team and milestone. Each records its source, original coach, actual contribution and observed before/after coach state. A conflicting source rejects. No-coach teams get an explicit zero-contribution receipt so a future coach cannot claim an old reward.
- Award transactions use the same league projection lock as atomic game finalization and lock the current coach row. Competing milestone and game contributions cannot overwrite each other. Every gained level grants its skill point, alongside the legendary conference bonus.
- Receipt insertion failures roll back coach updates. A process restart, coach reassignment or season rollover does not change an existing receipt's attribution or award again. These rows are application append-only, not database-immutable.
- All four postseason callers await the required service before phase completion. The old best-effort XP helper is removed. Standard CWS entry reuses a matching opening fixture and rejects contradictory pre-flip fixtures; full-season appearance retry no longer uses bracket existence as evidence of an award. These integration paths are source-reviewed, not certified whole-stage recovery.
- Advance and quick-simulation endpoints expose award conflicts and legacy reconciliation requirements as actionable HTTP 409 messages. Generic advance failures no longer expose internal exception details.
- Restore refuses current or target postseason receipt/fence evidence until a complete historical recovery format exists. Explicit commissioner league deletion cascades owned receipts/fences and preserves unrelated state.

## Legacy upgrade boundary

Existing postseason/offseason seasons and seasons with postseason games receive an ambiguity fence. Migration neither changes old coach projections nor invents award receipts. A missing receipt in a fenced season requires reconciliation; it cannot be safely inferred from a bracket or current counter. This also conservatively blocks some scheduled-but-unplayed postseason seasons. Reconciliation tooling is still required before deploying this change to affected leagues. Removing a fence without an audited repair is not reconciliation.

## Verification

- Real HTTP/PostgreSQL regression: **771 assertions passed** in both implementation and independent runs. Independent audit verdict: **bounded PASS**.
- The suite exercises populated upgrade, preserved legacy uncertainty, no-coach receipts, concurrent duplicates/distinct milestones/game awards, actual perk and multi-level deltas, receipt failure rollback, fresh-process replay, assignment/season changes, current/target restore refusal and effect-bearing league deletion.
- Full TypeScript, including both regression scripts and their imported helper, passed. The independent configured unit suite passed **129 tests**. Fixtures use synthetic accounts and disposable databases only; no production data or client UI changed.
- All owned fixture databases and HTTP children were cleaned. PostgreSQL was stopped; no listener remained on port 55432. The baseline synthetic database was preserved.

## Next step and release gates

Exercise the actual authenticated advance/checkpoint route under required-write failure, process restart and retry in both standard and full-season modes. Address bracket replay and reported-mode postseason behavior as part of that journey. Extend per-player/standings reconciliation and history-safe recovery afterward.

The audit found an existing full-season Super Regional winner-count defect: Game 2 reverses home assignment, while counting follows home/away instead of team identity. Track its repair under SYS-11 with W05 integration coverage. A durable receipt proves a contribution was applied once; it does not prove the supplied winning team is correct. All-American counters, external coach writers, bracket resets, lease recovery, chronological pitcher rest and reported postseason acceptance remain open. The [full-media build prerequisite](BUILD_PREREQUISITES.md) and Frisk's [art-direction selection](../art-direction/2026-09-17/README.md) remain separate gates. No merge or deployment occurred.
