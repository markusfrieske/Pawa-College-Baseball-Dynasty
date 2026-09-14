# W01 batch 01 — production started

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. This batch repairs private league reads, contains the legacy play-by-play exploit, and removes private npm registry dependencies. These are branch changes, not a deployment or completion of the 42-finding overhaul.

## Delivered behavior

- **TI-01:** Every GET/HEAD under `/api/leagues/:id` passes membership authorization before domain handlers or shared response caches. Commissioners and co-commissioners retain access before claiming teams; persisted guest coaches and unassigned member coaches remain valid members. Anonymous/malformed guest sessions receive 401; authenticated outsiders receive 403; missing leagues receive 404. Revoked membership cannot reuse a warm server cache. Sensitive responses use `private, no-store`.
- Main league and dynasty-setup team responses no longer fetch or expose account emails. Team displays use coach names. Dynasty-setup invite data is available only to commissioners/co-commissioners. Token-based invite previews remain available through their separate existing route.
- **TI-02 containment:** Both legacy PBP POST endpoints terminate before authentication, storage, simulation or finalization. `PBP_ENABLED=true` cannot enable them. Existing PBP bookmarks show an unavailable page; schedule controls and the exhibition Auto-Sim mutation that used this path are removed. Dashboard and digest navigation now open the schedule. Ordinary reporting and quick-simulation implementations are unchanged. Interactive PBP and individual exhibition simulation remain unavailable until their replacements are ready.
- **TI-13:** Exactly 116 lockfile download URLs now use the public npm registry. Versions, integrity hashes and all other lock metadata are preserved. A fresh install and native dependency smoke checks passed outside Replit.
- A reusable `npm run test:production-access` check is now part of `release:gate`. It requires an explicitly selected disposable loopback database and fails if that prerequisite is missing.

## Evidence and independent review

| Check | Result and limits |
| --- | --- |
| Fresh locked install | Passed: Node 24.19.0/npm 10.9.9, Windows ARM64, lifecycle scripts enabled, 723 packages. bcrypt/esbuild and WebSocket smoke checks passed; optional bufferutil compilation lacked MSVC. See [development evidence](DEVELOPMENT.md). |
| TypeScript | `tsc --noEmit` passed after source changes. |
| Pure unit suite | 67 tests passed. The former 68th test covered the deleted email-to-display-name helper; its removal reflects removal of that behavior. |
| Data validators | All 17 passed; existing nonfatal roster warnings remain. |
| Pitcher-rest unit regression | 28/28 assertions passed. No database rest integration claim. |
| Actual HTTP/storage regression | QA run and parent rerun passed using real PostgreSQL fixtures and the production `registerRoutes`. Test-only MemoryStore sessions inject identities; actual login and PostgreSQL-backed session persistence are not covered. |
| Read permission matrix | Main, schedule, dynasty-setup, setup and team-selection: anonymous, malformed guest, outsider and HEAD denial; commissioner/co-commissioner before assignment, assigned member, unassigned member and guest member success; verified warm caches; revoked membership; missing league; public invite preview. Recursive DTO checks verify account-email removal and ordinary-member invite secrecy. |
| PBP adversarial requests | Five authenticated roles attempted both endpoints with fabricated scores/players and `PBP_ENABLED=true`. Every response was 404. Traps on all storage methods and pool query/connect observed zero calls. This proves containment, not secure replacement sessions. |
| Independent review | Gibs security/QA agent found no blocking issue in this batch after reviewing source and executing the real HTTP gate. |
| Whitespace | `git diff --check` passed. |

The HTTP script reports 1,311 assertions, mostly recursive DTO-field checks. These are not 1,311 independent scenarios. Its source is [verify-production-access.ts](../../scripts/verify-production-access.ts). Fixture cleanup deletes only uniquely named rows created by that invocation.

## Status and remaining gates

**TI-01 is verified for the audited league-read defect. TI-02 is mitigated, not closed. TI-13 remains in review pending the broader release/runtime gates.** Other audit findings remain open; the new migration evidence is attached to TI-12 without claiming a repair.

The disposable database spike succeeded in installing the shared schema, but the numbered migration runner stopped at `server/migrations/0032_class_library.sql:34`: PostgreSQL rejects `ADD CONSTRAINT IF NOT EXISTS`. Migration 0032 rolled back; no migration ledger entries were fabricated. See the [database spike](DB_SPIKE.md). This prevents certification of clean startup/readiness and is the next W01 infrastructure repair, ahead of the broader W04 migration/recovery redesign.

The complete media build, browser/mobile walkthroughs, real login/session persistence, upgrade/restart/restore, concurrency and complete release gate remain unverified. This sparse CommandCenter checkout intentionally omits heavy media assets; the prior build stopped at a missing imported media file. No full-build pass is claimed for this batch. The owned test database was shut down and its loopback port verified closed. Ignored binaries and synthetic cluster files remain available locally for the next bootstrap repair.

Next production work: repair and verify clean bootstrap through all numbered migrations, finish the W01 permission/rules contract review, then implement strict reported-result validation in W02. Power Pros edition/platform, endings, roster updates and required reporting/evidence rules remain explicit inputs to that contract. No other device or background job was dispatched.
