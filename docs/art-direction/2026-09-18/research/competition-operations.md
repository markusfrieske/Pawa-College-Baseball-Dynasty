# Competition, reporting and operations research

Manual design review only — 2026-09-18. No game, route, component or existing screen playbook changed. The companion JSON covers all 14 Games & competition / Administration & tools screens and 14 assigned overlays in screen-designs.json. Every record contains three keeps, two removals, a concrete composition, interaction, compact variant and unapproved dependencies.

## Evidence and limits

The source list is deliberately edition-specific. Historical references establish useful workflow precedents; they do not describe current product availability or prove that their visual design is ideal. Source observations below are compact paraphrases. All PAWA compositions and acceptance criteria are our design inferences, not claims about competitor features.

- [OOTP 6.5 official gallery](https://www.ootpdevelopments.com/ootp65/screenshots.php): its captions connect daily fixtures, probable starters, completed results and player profiles. Use this relationship to reduce navigation cost; do not reproduce the old screen styling.
- [OOTP 12 Commissioner Portal](https://manuals.ootpdevelopments.com/index.php?man=ootp12&page=commissioner_portal_main): it describes readiness checks and an operation-status record within commissioner workflows. Useful precedent for actionable administration; no claim that PAWA has its automation or file exchange.
- [MLB The Show 24 official manual](https://manuals.theshow.com/en-us/24/ps4/more-ways-to-play/4.html): postseason and custom-league play are distinct modes. It supports a tournament-specific destination, not any particular PAWA bracket format.
- [NBA 2K11 publisher manual, printed page 13](https://steamcdn-a.akamaihd.net/steam/apps/65950/manuals/NBA2K11_PC_onlinemanual_v1.pdf): roster authoring, sharing and save/load are distinct menu functions. This historical semantic reference does not claim functioning contemporary 2K services.
- [FM26 developer UI explanation](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface): describes task filters, contextual detail, upcoming fixtures and accessible presentation. Borrow decision visibility; copying its tile system everywhere would repeat our current mistake.

Documentation was opened and read. No competitor was played, no geometry was measured, and no screenshot-derived pixel specification is claimed. The attempted current-host NBA 2K21 article was unavailable and is not included as verified evidence. Neither developer marketing nor these written proposals count as user testing.

## Critical findings for the next manual design review

### P0 — Entry, approval and official result must look different

Reproduction in a proposed visual set: place report, score-review and box-score next to one another. If each has the same celebratory scoreboard, green status and generic right action column, the viewer cannot reliably tell whether the result is merely entered, awaiting acceptance or official.

Direction: editable scorer workbench, report decision sheet and read-only result scorebook. Pending/disputed status occupies the same prominent location as the score. Source images, OCR completion, validation and acceptance are separate facts. Missing statistics display unavailable rather than zero. A stale version cannot inherit a freshly rendered approval action silently.

Acceptance: without reading the screen title, a reviewer can identify which screen permits entry, which makes an approval decision and which shows accepted history. Synthetic fixtures must include score-only, disputed, stale and partially reported cases. This is a proposed design gate, not a completed test.

### P1 — Changing headings on the same layout is not per-screen design

The current written plan already names many distinct purposes. The next output must actually express those differences in geometry and hierarchy. Reusing a large hero, three cards and a right inspector for all of them would fail even if the text is better.

Acceptance: a monochrome thumbnail sheet should distinguish schedule chronology, matchup comparison, editable scorebook, tournament bracket, championship presentation, operations queue, event ledger and file studio. Related editors can share controls; they should not force unrelated information into the same page skeleton. No new color palette can compensate for an identical reading order.

### P1 — Schedule is a coach's calendar; schedule health is a diagnostic instrument

Direction: coach schedule groups fixtures by actual period/series with relevant next actions. Commissioner schedule health exposes failing checks and affected team/week slices. Their shared data does not justify the same composition.

Acceptance: selecting a schedule fixture preserves browsing context; selecting a diagnostic reveals its evidence and affected fixture. Actual week-only data must not become invented calendar dates. Home/away and pending/accepted state remain textual, not color-only.

### P1 — Commissioner office should reveal obligations before power

A wall of equally prominent advance, force, edit, restore and configuration buttons rewards the wrong behavior. Start with blockers and current operation state. The readiness matrix, report exception queue, action review, settings categories, audit ledger and recovery timeline each solve different jobs.

Acceptance: the first actionable item has a concrete record behind it. Presence never substitutes for readiness. A restore restriction or rejected server preflight cannot be hidden by moving to a prettier tab. Critical operations state their actual scope before execution.

### P1 — File authoring and live-league correction must not be confused

Direction: roster/class studios use a named file workspace; live correction editors use persistent league/entity scope. Public class showcase is read-only discovery. Shared import is a directional source/destination review. Small file dialogs name the actual command rather than saying Continue.

Acceptance: a reviewer can state whether each action edits a reusable file, publishes existing supported shared data, imports to a library or loads a named league. Cancel preserves unsaved work. No proposed layout implies a Power Pros binary export, direct console sync or automatic roster upload.

### P1 — Tournament and championship screens require authoritative outcomes

A bracket is a relationship map, not a dashboard. Round columns and selected-game paths should dominate desktop; ordered round lists should dominate narrow views. Championship alone earns a celebratory composition.

Acceptance: pending scores do not draw completed advancement paths or produce a champion. Missing awards do not become placeholder stars. Skip presentation never advances the league. Existing tournament rules and actual bracket state govern the view; imported sports-game rules are out of scope.

### P1 — Recovery/status screens must expose uncertainty honestly

Direction: advance-progress uses real operation status and checkpoints. Save-state review exposes known scope and actual restrictions. A smooth progress animation or attractive snapshot thumbnail is not recovery evidence.

Acceptance: interrupted and unknown states remain legible, server confirmation determines completion, and the proposal never promises universal undo, complete recovery or safe retry without verified support. Full restore is still an engineering dependency, not an art-direction task.

### P2 — Compact layouts need a deliberate reading sequence

A scaled-down desktop scorebook, bracket or comparison table is not a narrow layout. Use one team/stat group, round or entity at a time; retain the selected game, source, revision and draft context across those moves.

Acceptance: planned 390px compositions show real long names, unresolved states and substantial tables. Keyboard focus and return location are specified. Controller support remains a separate implementation and test dependency. These research files do not add a bottom navigation bar or assume touch-only use.

## Proposed screen-family map

| Decision area | Screen IDs | Structural direction |
| --- | --- | --- |
| Find / prepare a fixture | schedule, prep | Series calendar; aligned matchup workbench |
| Enter / approve / inspect a result | report, score-review, box-score | Editable scorer workbench; decision sheet; read-only scorebook |
| Competition progression | postseason, championship, play-unavailable | Tournament topology; verified ceremony; compact return notice |
| Run the league | commissioner, commission-command, commission-reports | Current obligations; readiness matrix; report exception queue |
| Execute / configure / inspect | commission-actions, commission-settings, commission-audit | Operation runbook; category form; event ledger |
| Access / money / structure | commission-invites, commission-nil, commission-schedule, commission-editor | Access register; budget ledger; diagnostic matrix; entity inspector |
| Correct live player data | edit-rosters, edit-recruits | Team-scoped correction grid; class-scoped correction table |
| Author / compare reusable files | roster-library, roster-viewer, class-library | File studio; aligned comparison table; class authoring workspace |
| Share / import / save | class-share, import-class, file-dialogs | Public showcase; transfer review; bounded command sheet |
| Recover / monitor | commission-saves, advance-progress | Recovery timeline; operation status strip |

Next review should compare distinct compositions with representative synthetic data before implementation. The JSON is the per-screen proposal; it is not permission to add unsupported features or evidence that the current game implements the proposed interactions.
