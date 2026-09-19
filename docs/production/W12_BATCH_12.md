# W12 batch 12 — Permanent arrival scrapbook

Frisk authorized continuing the approved Clubhouse Arrival. Manual development only; automation remains paused.

## Delivered

Migration 0056 stores immutable, versioned arrival cards with original season, recruit identity, portrait ID, complete ratings/pitches/abilities, and per-record team identity/colors. Capture and public reveal commit atomically. Conversion creates stable source-recruit links rather than matching names. Same-name recruits remain separate players. History survives recruiting-pool replacement, player development, transfers and deletion; current roster links resolve only inside the same league. Legacy classes without trustworthy captured history are not backfilled or relabeled.

The Arrival screen has a season selector and replayable scrapbook cards, full-card/class PNG keepsakes, and links to actual current roster profiles. Original cards do not request career stats under recruit IDs or invent college statistics. Existing save snapshots include arrival records; history-unsafe restore stays explicitly blocked pending W03.

## Verification

- TypeScript and production build pass.
- verify-arrival-scrapbook.ts: 362 real PostgreSQL/HTTP/built-browser checks in normal mode, including all inherited disclosure and Arrival gates, atomic capture failure, same-name conversion, season rollover, source deletion, immutable card values, per-record original colors, save capture, restore containment, outsider access denial and current roster deep links.
- PAWA_TEST_ARCHIVE_FAILURE=1: 341 checks including an injected conversion-capture failure, blocked normal retry and blocked legacy season shortcut, with roster identity/eligibility unchanged by retries.
- verify-migrations.ts: 39 assertions across three disposable databases, through 0056.
- Original-card screenshot visually inspected. Five inherited PC viewport gates and PNG download checks pass; no human enjoyment verdict is inferred.
- Independent read-only game-dev review found and verified the corrections in [audit](audits/W12_BATCH_12_AUDIT.md). The reviewer did not independently rerun runtime tests.

## Recovery limitation and next step

Finalization is not fully transactional. An interrupted Signing Day now persists its entry checkpoint and requires reconciliation before retry. The legacy direct season endpoint returns409 and directs normal phase controls so it cannot bypass this fence. This is containment, not rollback or complete W03 recovery. Synthetic undersized rosters produce expected structure warnings; CPU class balance is not certified.

W12/UX-06 remains implementing. Next: Frisk review, then Clubhouse audio with mute/reduced-motion behavior and sharing polish. Large-class curation, controller support, broader recovery and final enjoyment audits remain open. No production data, deployment or main merge.
