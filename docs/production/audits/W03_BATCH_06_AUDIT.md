# W03 batch 06 independent Super Regional integrity audit

Date: September 17, 2026 (America/Denver; September 18 UTC). Review lenses: Passan baseball truth, Gilfoyle data/recovery integrity and Gibs adversarial integration QA. Audit ownership is separate from source and regression authorship.

**Verdict: bounded PASS.** The reviewed SR winner identity, malformed/legacy-terminal rejection, week-zero reported postseason gate and ordered required-checkpoint/award failure-retry slice pass independently. This is not complete postseason or crash-recovery certification. SYS-11 and TI-08/TI-09 retain their broader open acceptance requirements.

## Independent evidence

- **917 HTTP/PostgreSQL assertions passed**, exit 0, using `node --import tsx scripts/verify-reported-results.ts` against an owned synthetic loopback database and real server process.
- **129 configured unit tests passed**, exit 0, after the checkpoint source repair, using `node node_modules/@playwright/test/cli.js test --config=playwright.unit.config.ts`.
- [Bracket fixtures](../../../scripts/verify-postseason-bracket.ts) verify either team's sweep/three-game win, next-slot hosting, replay without duplicate writes, malformed last-series no-write rejection, consistent foreign-league participants, duplicate slots, incomplete-before-complete chronology, contradictory terminal history and post-clinch ambiguity. Service invocation is test-only IPC into the real process and storage.
- [Authenticated advance fixtures](../../../scripts/verify-postseason-advance.ts) verify postseason report blockers, linked accepted results, actual required-checkpoint fault, partial required-award fault, persisted operation state, process restart/retry and preserved source games/receipts. These invoke production HTTP routes rather than seeding checkpoint rows.
- Final source review and `git diff --check` passed. The independent regression completed its fixture cleanup successfully; final cluster shutdown, TypeScript and implementation commit belong in [batch evidence](../W03_BATCH_06.md).

## Source review

[Super Regional advancement](../../../server/services/postseason/superRegionals.ts) now validates all eight distinct SR slots and their 16 league-owned participants before writing projections. Game slots must be sequential, use the prescribed alternating hosts, have valid completed scores and stop at a clinch; unrecognized bracket types and orphan series indices reject. Wins accrue to the original participant identity even when the game venue reverses. Missing opening fixtures can be generated for an otherwise valid initialized series; a partially missing bracket cannot silently become a smaller field.

Terminal series are accepted only when their completion flags, winner and totals agree with valid source games. Contradiction raises reconciliation rather than overwriting an old result. In-progress totals remain recomputable projections. This validates supplied completed results; it does not add authoritative simulated-game receipts, amend downstream awards or certify national selection policy.

The operation reads, validates and then writes through existing storage calls. It is not one database transaction across the entire bracket. A storage failure during the apply phase can leave earlier series committed, and participating writers still depend on the outer advance lease. No database uniqueness constraint for game slots or lease-loss recovery is claimed. Malformed-input zero-write acceptance is scoped to this bracket service, not to every earlier stage of the larger advance route.

## Runtime-discovered checkpoint repair

The implementation run of the real advance drill exposed another defect: the game stage reached 100%, but a previously issued asynchronous 10% write arrived later and overwrote the durable checkpoint. This is a P1 recovery-integrity issue because progress order cannot be inferred from unawaited writes.

All engine progress calls now await their registered checkpoint writer. The writer awaits its SQL update and requires one row belonging to the running operation and owner token. Marking an operation complete is also required and checked, rather than log-only. Failure-status writes are attempted and awaited before lease release; the route finally removes only its own writer registration. The expanded regression injects a failure specifically at the 100% checkpoint and requires no downstream CWS fixtures, awards or phase change. This repair orders participating route checkpoint writes; it does not make the phase flip and checkpoint one transaction.

## Required acceptance

| Severity | Reproduction and impact | Acceptance |
| --- | --- | --- |
| P1 | A Full Season SR high seed wins Game 1 at home and Game 2 away. The old counter records one win for each series participant and creates an unnecessary Game 3. Other permutations can advance the wrong team. | Determine each game's winner by actual team ID and count against stable series participant IDs. Either team's sweep ends after two games; split series generates exactly one correctly hosted Game 3; either team's third-game win advances that team. |
| P1 | Legacy data already marks a contradictory series complete, with downstream CWS games or awards potentially committed. Blindly replacing its winner rewrites one part of history while leaving downstream truth stale. | Refuse conflicting terminal records and require explicit reconciliation. Preserve source games, series, downstream fixtures and award receipts. Do not invent corrections or remove the 0054 legacy fence. |
| P1 | A tied/missing score, unrelated participant, duplicate or missing slot, out-of-order completion or post-clinch game becomes an extra win or incorrect next game. | Validate the complete supplied bracket before projection writes. Reject malformed results/identities/slot order without choosing a winner or partially modifying earlier valid series. |
| P1 integration | Required appearance award fails after CWS fixtures and an earlier winner's award have committed. Retry can skip awards or create duplicate fixtures. | Real authenticated advance fails before phase completion; process restart and retry retain prior receipts and existing opening slots, then complete remaining awards once. Distinguish this from service-only IPC tests. |

## Actual advance failure and restart evidence

The fixture creates a fresh synthetic full-season league in Super Regionals with 16 teams, eight series and two completed, identity-correct games per series. All eight winners have coaches. No new simulation is needed. A required checkpoint fault at game-stage 100% returns 500, retains the prior 10% checkpoint and SR phase, records failure, releases the lease and creates no CWS fixture or award. After removing that fault, a required receipt-insert failure for the second winner retains exactly one committed appearance receipt and four opening fixtures, with SR phase unchanged and no phase-transition completion.

After fault removal and a fresh HTTP process, the real retry produces eight appearance receipts, keeps exactly four CWS opening fixtures, preserves the earlier receipt and source games, awards each coach one appearance/300 XP, advances one week to CWS and records a complete operation/checkpoint. The history retains both failed attempts. This bounds required-write failure/restart/retry. It does not prove a hard kill during an in-flight transaction, crash between phase flip and checkpoint, expired-lease takeover, every standard-mode path or complete stage exactly-once behavior.

## Power Pros and retained recovery boundaries

- **P1 authority, bounded repair verified:** old [advance preflight](../../../server/lib/advancePreflight.ts) selected human games by `game.week === league.currentWeek`, while SR/CWS helpers create fixtures with week zero. The revised preflight selects the current postseason phase regardless of week and requires valid completed scores plus a linked accepted-report receipt for confirmed human-versus-human results. Missing/foreign/same-team identities fail closed. Independent runtime verifies conference championship, SR and CWS week-zero unreported/pending/inconsistent blockers and accepted-report clearance. Early normal-advance rejection occurs before lock, operation or save writes. Existing quick-simulation routes already reject reported leagues, and the new fixture verifies their no-write rejection. Legacy confirmed postseason reports without linked receipts need reconciliation rather than automatic acceptance. This is not a complete two-coach postseason rehearsal or a newly defined human-versus-CPU Power Pros policy.
- Current stale-operation checkpoint recovery selects a prior expired running operation by league alone. It does not compare that operation's source season/phase/week to the current league before importing completed stages. A crash after phase flip can therefore feed old-stage completion into a new phase. This remains a distinct real recovery fixture and repair.
- Failure-status persistence still catches and ignores its own database error before releasing the lease. A database failure at that secondary write can leave a running operation behind; durable failure/unique-conflict recovery needs its own fault injection. Ordered required checkpoint writes and completion checks do not certify this scenario, hard kills or lease takeover.
- Legacy postseason receipts/fences, All-American achievement counters, historical correction/reconciliation, external coach writers, chronological rest and mature-league restoration remain open. Art selection, full-media build and human usability remain separate gates.
