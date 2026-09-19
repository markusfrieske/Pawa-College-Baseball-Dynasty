# W12 batch 03 - Recruiting ledger and scorer workspace

September 18, 2026. Frisk manually authorized continuing after the roster milestone. Scheduled development remains paused. This is a bounded screen/workflow slice, not completion of W12 or a release candidate.

## Delivered

- Recruiting opens with a resource band, searchable 24-row ledger and expandable action trays. Filters, weekly intelligence and history are disclosures. All widths use the same row and action eligibility. Pagination moves keyboard focus to the new page. Comparison wraps inline and its bounded dialog scrolls vertically.
- Open dossiers and comparisons use current query records after scouting. Mutations await query invalidation. Notes retain failed drafts and protect pending writes. Call/email confirmation checks current limits; exhausted contact points disable Offer. Affordability filtering excludes undisclosed NIL. Malformed saved presets no longer crash entry.
- Reporting has a wide scorebook and a separate matchup/status/section panel. Evidence uploads are expandable so they do not dominate entry. Section navigation opens, focuses and scrolls to the chosen editor. SP/RP players initialize alongside P pitchers.
- Failed screenshot reading cannot show an all-read success. Manual typed and button-driven edits warn before navigation; pending writes freeze editor and back/section controls. Failed submissions retain the draft for retry. These changes do not provide durable draft recovery.

## Verification

node --import tsx scripts/verify-management-workspaces.ts passes **77 checks** against the built UI, registered HTTP routes and a new numbered-migration PostgreSQL database. Recruiting is exercised in simulated and reported modes: pagination, targeting/scouting, one-point spend, current dossier/comparison knowledge, notes failure/retry and reload persistence. Three-name comparison fits at 390px; the third card and footer Close are reachable within a bounded dialog. Width checks cover 1440, 768 and 390 CSS pixels.

Reporting verifies commissioner score-only failure/retry, pending controls, actual pending SQL storage with unknown statistics remaining null and no premature official game. Coach entry initializes SP/RP and nine batters per team; row removal before score metadata, inning-button changes and typed changes trigger navigation protection. Full review identifies invalid pitching IP and blocks submission. A local failed-image response verifies honest OCR messaging without invoking cloud OCR or uploads. Runtime error collections are empty. TypeScript and production build pass.

Independent recruiting/player-experience and reporting/integrity source reviews found additional defects that were fixed before the passing run. See [audit](audits/W12_BATCH_03_AUDIT.md). Parent visual review covers desktop recruiting/report composition. Automated width checks are not a native-device, controller or enjoyment assessment. Earlier test runs exposed selector ambiguity, a dialog-wait deadlock and incorrect fixture review assumptions; these were corrected before the passing gate.

## Review and boundaries

With an explicitly supplied loopback test database URL, PAWA_WORKSPACE_REVIEW=1 retains the passing gate's disposable league and prints recruiting/report review URLs. Test sessions, synthetic-data banner and review routes exist only in this loopback harness, not the production server. Default/failed runs clean up their random database. A hidden local process keeps the review fixture available. No local paths or credentials are committed.

No baseball rules, server authority, report acceptance or finalization contracts changed. The OCR check uses a failed transport fixture, not real image recognition. Native Steam/controller use, complete compact table editing, durable drafts, bespoke recruit dossier design, complete scouting-disclosure consistency and enjoyment testing remain open. Source budget checks do not prove every recruiting economy action end-to-end. UX-01/02/03/06/08 stay open. The proposed arrival reveal is still unapproved.

## Next manual milestone

Review this slice with Frisk, then the schedule/game-day workspace: matchup preparation, result status, evidence and confirm/dispute actions. Address retained approval failure and missing-report-versus-fetch-error distinctions (W12-SCHEDULE-01) before claiming the companion workflow complete. Backend ownership work remains at W03 batch 10; do not resume it from stale automation.
