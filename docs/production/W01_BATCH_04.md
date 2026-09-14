# W01 batch 04 — production startup and guest-save preservation

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. Implementation commit: `49c55dbb0bc8191a9dfe3271de53d04c6a6e0b7b`.

**Result:** Automatic cleanup preserves guest dynasties regardless of creation date. The actual production entry point returns stable public middleware errors, denies the development mockup proxy, and starts successfully on Windows with an explicit loopback host. Independent technical/security QA accepted this bounded milestone.

## Delivered behavior

- Removed the destructive seven-day guest-age cleanup rule. Automatic and manual cleanup now select only stale records explicitly marked `is_test_data=true`. A save's creation date is not inactivity or deletion consent. Invalid retention values and the obsolete `--guest-days` option refuse execution.
- Centralized public middleware errors after route and static setup. Database/parser/filesystem failures return stable JSON messages with `Cache-Control: no-store`. The handler avoids logging raw request URLs and complete parser error objects, which can contain invite tokens or credentials; limited server diagnostics remain internal.
- Production `/__mockup` returns 404 before creating a development proxy request. The development proxy remains available in development.
- Validate `PORT` before starting jobs; honor `HOST`; disable unsupported `reusePort` on Windows; report the actual bound port, including ephemeral test ports.
- Added `test:production-startup` and `test:stale-cleanup` to the release gate. Both use explicitly authorized loopback test URLs, own their random fixture databases and remove them afterward.

## Verification

| Check | Observed result |
| --- | --- |
| Independent actual-entry-point gate | 33 assertions passed: invalid ports, live/ready endpoints, synthetic static serving, parser/body-limit errors, no-store, proxy denial, registration, genuine PgStore SELECT failure/recovery, static failure and log privacy canaries. |
| Independent save-preservation gate | 21 assertions passed: old/active/young unflagged saves and inspected dependents survive; dry-run, stale explicit test deletion, custom age, repeat execution and manual CLI boundaries behave correctly. |
| TypeScript | Full project and separate configuration including both new harnesses and the modified cleanup script passed. |
| Independent audit | [W01 batch 04 audit](audits/W01_BATCH_04_AUDIT.md): no remaining blocker in the reviewed milestone. |
| Cleanup | Parent verified zero owned startup/cleanup fixture databases remained, stopped the owned PostgreSQL cluster and confirmed the test port had no listener. |
| Whitespace | `git diff --check` passed. |

The startup harness bundles the actual `server/index.ts` with installed packages external and a clearly labeled synthetic HTML index. It uses the real middleware, routes, PgStore, static handler and startup code. It first bootstraps its owned empty database; the process then checks the numbered migration state. The session fault uses a temporary database view/function and restores the original session rows. These are 54 assertions across related scenarios, not 54 independent coach journeys.

## Limits and next milestone

This is not a full client/media production build or browser playtest. Empty-fixture startup does not prove populated-save upgrades, completion of asynchronous backfills or queued jobs, migration concurrency, backup recovery or baseball/gameplay correctness. The original TI-12 remains implementing, TI-13 remains in review, and the full release gate is open. Nothing was merged or deployed.

W01-AUTH-02 is verified. The independently discovered guest-save deletion defect is recorded as verified follow-up W01-SAVE-01 in the existing tracker. W01-AUTH-01 remains open for direct-route revocation after account deletion.

Next: resolve the [complete-media build prerequisite](BUILD_PREREQUISITES.md), then verify the built app's real browser startup and core coach workflows with independent player-experience QA. Preserve explicit Power Pros rules inputs for W02; do not invent edition-specific behavior or repeat this passing infrastructure milestone as a substitute for that work.
