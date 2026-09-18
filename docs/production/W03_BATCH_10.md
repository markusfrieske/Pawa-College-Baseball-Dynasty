# W03 batch 10 — atomic recruit progression

Date: September 18, 2026. Branch: codex/pawa-quality-overhaul.

Implementation: bc5e393b0791679433ac37e18b74caad15de65b5.

Normal advancement now commits each recruit-progression pass and its completed checkpoint in one execution-owned PostgreSQL transaction. Recruit stages, passive interest gains, signings, both NIL spending counters and required decommit events roll back together on a failed write or expired original lease.

## Delivered behavior

- The extracted [progression runner](../../server/lib/recruit-stage-progression.ts) accepts a narrow storage interface. Its [owned adapter](../../server/lib/recruit-stage-store.ts) reads and writes through the same client as the operation/checkpoint; reads and writes exclude interests whose recruit or team belongs to another league.
- The adapter locks existing recruits before teams, matching manual signing's lock order, then interests, players and storyline inputs. Scoped writes require one returned row. This does not certify all external writers or stale application snapshots.
- [Owned execution](../../server/lib/advance-execution.ts) checks phase/week/season and both captured lease deadlines. Primary progression requires source week + 1. The existing second offseason pass has a distinct offseason_recruit_stages checkpoint, requires source week, and is valid only in offseason_recruiting_1 through _4.
- Completed passes are no-ops. Recovery recognizes both stage names and publishes progress only after a successful commit. The client maps the second pass to its recruiting label.
- Recruits process sequentially in stable ID order, preventing same-team NIL totals from racing. This intentionally replaces timing-dependent allocation with a technical ordering policy; it is not a fairness/balance approval.
- Existing pre-buzz decision inputs, signing thresholds, random decommit decisions and two-pass offseason buzz are preserved. Owned decommit event errors now propagate and roll back the whole pass; fast-forward retains its unfenced storage fallback.

## Verification

Implementation verification: **121 PostgreSQL helper assertions**, **1,213 authenticated HTTP/PostgreSQL assertions**, **129 configured unit tests**, full TypeScript and full production client/server build pass. Existing Browserslist age and PostCSS source warnings remain.

The [helper regression](../../scripts/verify-advance-execution.ts) covers checkpoint exceptions/suppression, recruit/team write failure, cumulative same-team NIL, insufficient remaining allocation, stable winning IDs, source/week/owner refusal, empty pools, later manual activity preservation, all four offseason pass identities, malformed cross-league interests, and a forced real decommit branch. Failure on the second decommit notification rolls back the first notification, stage, buzz and checkpoint. The isolated test temporarily fixes Math.random and restores it; production randomness is unchanged.

The [HTTP recruiting drill](../../scripts/verify-advance-recruits.ts), invoked by the existing [reported-results harness](../../scripts/verify-reported-results.ts), verifies populated recruiting advances in both mode flags, checkpoint rollback/retry, committed-stage recovery after reset failure, independent offseason second-pass rollback/retry and actual overlapping live HTTP workers. Worker A is observed paused inside its recruit UPDATE after its interest write. Its original lease expires; B waits on its lock. A rolls back before B's gameplay starts. B commits recruiting and advances the calendar once. The observer verifies that partial writes and false checkpoint evidence never become visible.

Independent verification and findings are recorded in the [batch audit](audits/W03_BATCH_10_AUDIT.md).

## Boundaries and next milestone

These authenticated commissioner fixtures contain real synthetic recruit/team/coach/interest rows but no games and no active CPU teams. The live takeover is within one HTTP process. They do not certify populated-game integration, separate-process takeover, full season recovery, all roles, Power Pros edition rules or human enjoyment.

TI-08/TI-09 remain implementing. Next fence CPU recruiting, storyline and offseason portal effects with owned durable evidence; the unconditional CPU/portal prelude before the second offseason pass can still repeat on retry. Then cover populated games/cross-process takeover, changed-source reconciliation, external writers and history-safe recovery.

Existing economy issues remain in SYS-12/13/15: storyline signing resolver metadata, overlapping departure/portal roster subtraction, full-roster leader preventing runner-up consideration, signing priority fairness and the two-pass offseason buzz policy. A completely rolled-back decommit attempt may reroll; deterministic whole-advance replay is not established. Earlier checkpoints written before this migration are not retroactively certified.

No merge, deployment, production data or reveal-selection changes occurred.

Cleanup verified: only the retained baseline synthetic database remained; PostgreSQL stopped and port 55432 no longer had a listener.
