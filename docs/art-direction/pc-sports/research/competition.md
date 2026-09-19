# Class of Nine: PC competition and league operations

Research and proposed screen-specific redesign; no production implementation claimed

Visual observations are limited to the official screenshots and exact video frames described. No hands-on game evaluation. C9 approval, financial, restore, permission and data-completeness rules below are design proposals and existing repository constraints, not claims about reference games.

## Visual references

- [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog): Inspected the Vancouver/Ottawa hub image: calendar ribbon above central opposing crests; projected goalies underneath; quick commands left and league leaders right. Background and oversized matchup lettering unify the screen. Use opposing team identity for prep and a narrow week ribbon for schedule. The canvas belongs to the match, with ancillary information subordinate. Evidence: Direct visual inspection of official embedded screenshot in browser, 2026-09-18. No hands-on game evaluation.
- [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog): Inspected official result images: scoreboard matrix for game selection; selected result has large team names aligned with period totals, FINAL label and broad destinations for events, team stats and stars. Build a baseball line-score anchor with team-stat chapters. Use FINAL only for accepted or authoritative simulated results; this restriction is C9-specific. Evidence: Direct visual inspection of official embedded box-score screenshots in browser, 2026-09-18. No hands-on.
- [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s): At 1:50 the official PlayStation video shows a wide free-agent table with rank/name/OVR/potential/position/age/bats/throws; a single outlined row carries selection. Week and budget remain above. Make sport-relevant rows the primary plane for player and budget work. Share selection semantics, not identical page composition. C9 knowledge boundaries replace MLB rating assumptions. Evidence: Direct visual inspection of official PlayStation video frame at 1:50 in browser, 2026-09-18; not hands-on.
- [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s): At 2:02 a player model fills the left; a response and action occupy the center; a separate right strip retains identity, demand and declined offer. The decision does not become a new generic dashboard. Use bounded action stages where target identity, consequence and exact action can be read together. C9 permission, revision and restore restrictions are proposed safeguards, not sourced MLB behavior. Evidence: Direct visual inspection of official PlayStation video frame at 2:02 in browser, 2026-09-18; not hands-on.

## Design principles

- Design a bounded game canvas around one dominant sporting task, not a page of website sections.
- Share typography, color, selection and motion while varying each screen topology: fixture wall, paired matchup, worksheet, bracket, ceremony, matrix, ledger, review stage.
- Use fixed frame with explicit chapters, paging or bounded pane scrolling; never conceal overflow or data merely to remove native scrollbar appearance.
- At PC resolutions prioritize readable rows, pointer precision, keyboard focus and window/scale behavior over mobile stacking.
- Retain Class of Nine forest, brass, cream, approved C9 gateway and restrained varsity type. Borrow hierarchy, not licensed logos, characters or exact visual trade dress.
- Entry, pending review, disputed, accepted and unknown must look different. Reference-game spectacle cannot overwrite companion data authority.

## First implementation priorities

1. **Replace the shared web-page frame.** One PC viewport, top game chapters, contextual command strip, page-specific body regions; remove mobile navigation and mobile breakpoint compositions. Acceptance: Test 1366x768, 1920x1080 and 2560x1440, keyboard traversal, 125/150 percent scaling; preserve all actions and text.
2. **Prove four genuinely different competition screens.** Implement schedule fixture wall, opposing-team prep broadcast, editable scorer room and accepted box-score record as a coherent fixture journey. Acceptance: One real synthetic fixture survives all four routes with exact identity, draft/error recovery and pending-versus-final authority.
3. **Build operations from exact obligations.** Commission readiness matrix, version-bound result review, narrow operation preflight and recovery vault; reuse semantic controls rather than a generic card layout. Acceptance: Exercise missing, stale, denied, rejected and interrupted states; no fake ready status, optimistic acceptance or unsupported restore.

## Individual screen briefs

### schedule — Season fixture wall

**Decision:** Which fixture needs my next action?

**Composition:** A full-width week ribbon feeds a series strip across the central canvas; the selected fixture expands into a horizontal matchup band beneath it.

**Zones:** Week/season rail → Series lanes with home/away marks → Selected game score/state band → Prepare, report or inspect command area

**PC interaction:** Arrow keys move fixture selection; PgUp/PgDn change verified week; Enter opens permitted game action; Back restores week and fixture.

**Art:** Faint diamond lines across forest; cream team marks and brass selected series.

**Remove:** Long vertically stacked game cards; redundant hero; mobile day accordion.

**Empty/error:** No fixtures retains week and filters with Clear filters; fetch failure says schedule unavailable, never no games.

**Acceptance:** At 1366x768 and 1920x1080, week, selected fixture and next action are visible together; a pending score never resembles FINAL. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Week and home/away context; Explicit pending, disputed and accepted labels; Prepare / Report / Review / Result according to permission

**Dependencies:** Explicit date/day grouping requires verified schedule fields; do not manufacture dates from week numbers.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog), [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### prep — Matchup broadcast

**Decision:** What lineup or availability issue should I resolve before this game?

**Composition:** Opposing teams occupy two balanced halves, with probable starters nearest the center seam and lineup comparisons below.

**Zones:** Away crest and starter → Home crest and starter → Shared matchup metrics spine → Own lineup availability band

**PC interaction:** Tab cycles lineup and starter inspection; Enter opens player; preparation returns to exact fixture.

**Art:** Stadium dusk washes behind crests; media-day portraits only when real art exists.

**Remove:** Narrow checklist column; multiple detached KPI tiles; oversized decorative banner.

**Empty/error:** Unknown starter is explicit; inaccessible opponent data does not become zero; lineup failure retains game identity.

**Acceptance:** Two actual starters, away/home and availability fit one PC viewport; companion prep never implies writing into Power Pros. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Away/home labels; Actual pitcher and lineup availability; Analysis distinguished from known facts

**Dependencies:** Any new matchup calculation, export packet or lineup-writing control needs separate approval and backend evidence.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### report — Scorer control room

**Decision:** Is the played result accurate enough to submit for review?

**Composition:** An editable line score spans the top; batting/pitching worksheet occupies center-left and a source-image light table occupies the right. Review replaces entry, preserving the same matchup anchor.

**Zones:** Editable inning strip → Team/stat worksheet → Source image and uncertainty lens → Validation and submission command strip

**PC interaction:** Spreadsheet Tab/Shift+Tab traversal; direct typing and mouse selection; error list focuses affected cell; only implemented hotkeys are printed.

**Art:** Cream scorebook surface against forest with brass active cell; no faux paper shadows that reduce contrast.

**Remove:** Narrow web form; stacked collapsible sections; upload success styled as acceptance.

**Empty/error:** Unknown stats stay blank; failed OCR stays failed; rejected submission retains draft and exact server error.

**Acceptance:** A nine-batter worksheet, game identity and review command are visible without page scrolling; rejected/stale writes cannot show submitted success. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Exact game/player identity; Unknown values remain unknown; OCR uncertainty and server validation beside the affected field

**Dependencies:** Durable cross-device draft saving and new OCR capabilities are not approved by this layout.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### play-unavailable — Game continuation interstitial

**Decision:** Where can I continue with this game?

**Composition:** A restrained matchup stage carries one availability explanation and a short row of supported continuations.

**Zones:** Known matchup title → Availability explanation → Schedule/result continuation choices

**PC interaction:** Escape returns to schedule; focus defaults to supported return, never unavailable Play.

**Art:** Dim diamond with two real team marks, no fake live playfield.

**Remove:** 404-style marketing page; dead Play button; empty dashboard.

**Empty/error:** Missing or forbidden identity is not guessed; return remains available if lookup fails.

**Acceptance:** There is no replay timeline or playable claim; one keyboard action reaches supported schedule. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Honest unavailability explanation; Game context when accessible; Return to schedule or accepted result

**Dependencies:** Playable pitch-by-pitch sessions remain a separate engineering gate.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### postseason — Championship path

**Decision:** What is the next eligible matchup, and how does it affect the path?

**Composition:** The entire bracket is the stage: rounds advance left to right with a selected matchup enlarged in a shallow lower band.

**Zones:** Round headings → Connected series nodes → Selected matchup evidence strip → Path legend and round focus

**PC interaction:** Arrow navigation follows actual bracket edges; keyboard and mouse focus the same node; selecting result preserves round context.

**Art:** Brass path only for earned advancement; forest empty rounds; no winner art before confirmation.

**Remove:** List-only postseason; repeated schedule cards; ornament covering bracket topology.

**Empty/error:** Unresolved seeds are labeled TBD; pending/disputed results leave next node unresolved; failed load is not an empty bracket.

**Acceptance:** At 1920x1080 the approved format is legible; 1366x768 uses explicit round focus rather than shrinking text or horizontal page scroll. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Existing seeds and bracket source; Accepted results determine advancement; Pending/disputed nodes stay unresolved

**Dependencies:** Do not invent elimination formats, tie rules, bracket repair or qualification guarantees.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### championship — Season closing scene

**Decision:** Celebrate this verified season or inspect its record?

**Composition:** Champion name and C9 program mark dominate a centered stadium presentation; final-series evidence sits in a quiet lower band.

**Zones:** Verified champion identity → Central trophy/program artwork → Actual final-series line → Record and skip controls

**PC interaction:** Escape or visible Skip ends animation only; record opens factual season history; reduced motion gets static composition.

**Art:** Warm brass floodlights and forest evening; use original approved C9 trophy art only.

**Remove:** Administrative cards; speculative MVP; confetti over factual evidence.

**Empty/error:** Without confirmed champion show season unfinished; missing final details remain unknown, not invented celebration.

**Acceptance:** Celebration requires server-confirmed champion; skipping cannot advance season; all facts remain readable without motion. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Confirmed champion and season; Actual final-series results; Skip/reduced-motion access

**Dependencies:** New trophies, team art, audio and ceremony animation require art/implementation approval.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### commissioner — League operations floor

**Decision:** What prevents the league from progressing safely?

**Composition:** A dominant current-week command stage uses a ranked obligation lane and a broad readiness panorama; secondary office destinations are terse top chapters.

**Zones:** Current phase/operation masthead → Blocking obligations lane → Team readiness panorama → Office chapter navigation

**PC interaction:** Keyboard selects exact blocker then opens its record; mouse supports same path; return keeps selected obligation.

**Art:** C9 league seal and subdued stadium control-room backdrop; danger uses text and restrained amber.

**Remove:** Equal-weight mutation tile grid; decorative KPIs; marketing welcome copy.

**Empty/error:** Unknown readiness remains unknown; failed preflight does not render all clear; no pending score counted as accepted.

**Acceptance:** First viewport identifies the actual next blocker and server operation state without inferring presence or offering bypass. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Actual readiness and report state; Current operation identity/status; Role-aware access

**Dependencies:** New priority scoring, presence telemetry or force-advance behavior is not implied.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### edit-rosters — Live roster correction bench

**Decision:** Which exact live player field am I correcting?

**Composition:** A broad roster ledger sits above a shallow selected-player attribute bench; team switcher is in the top scope band.

**Zones:** League/team scope band → Player correction ledger → Selected attribute bench → Named change review strip

**PC interaction:** Arrow moves record; Enter edits selected category; Tab traverses fields; Escape cancels local edit with dirty-state handling.

**Art:** Portrait stamp only beside selected identity; uniform rows remain readable on dark forest.

**Remove:** Player card stacks; all-fields modal; hidden bulk replacement.

**Empty/error:** No team selected prompts selection; failed save retains values and names player; forbidden fields stay read-only.

**Acceptance:** Correction scope stays visible while editing; one failed save cannot switch target or discard typed value. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** League and team scope; Player identity and authorization; Validation and dirty-state preservation

**Dependencies:** New bulk edits, undo guarantees and before/after persistence require dedicated validation.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### edit-recruits — Class correction board

**Decision:** Which class record needs an authorized correction?

**Composition:** Class roster forms a position-grouped ledger; an attribute drawer occupies the lower third with public/private field bands.

**Zones:** Class and visibility header → Prospect correction list → Public attribute band → Restricted trait band → Save receipt

**PC interaction:** Search and keyboard list navigation retain selected recruit; hidden traits require authorized view, never public preview.

**Art:** Small class seal, no signing celebration; restricted information visually labeled beyond color.

**Remove:** Gem/bust hero badges; sprawling per-recruit cards; private values in public summary.

**Empty/error:** Empty class names its source; permission failure closes privileged detail without substituting public guesses.

**Acceptance:** Public preview exposes no hidden trait; rejected save retains the named recruit and intended changes. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Class and recruit identity; Public/private field distinction; Save error with retained values

**Dependencies:** No new reveal rules, hidden scouting exports or unsupported class-wide edits.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### roster-library — Roster file workshop

**Decision:** Which reusable roster file am I creating or saving?

**Composition:** A file identity ribbon anchors a team tree, broad roster grid, and docked field inspector; file commands sit above the work plane.

**Zones:** File/version ribbon → Team tree → Roster grid → Attribute inspector → Save destination review

**PC interaction:** Ctrl+S only after real binding implemented; keyboard tree-to-grid-to-inspector; save-as explicitly names new file.

**Art:** C9 folio spine and restrained monogram watermark; utility outweighs athlete spectacle.

**Remove:** Live league advance chrome; ambiguous Publish; tiny nested editor dialogs.

**Empty/error:** Unsaved file stays named Untitled; unavailable source differs from empty roster; failed save keeps dirty state.

**Acceptance:** Saved receipt names file and destination; file editing never mutates a live league without a separate explicit operation. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Source file identity; Unsaved-work indication; Team/player contents

**Dependencies:** New formats, binary Power Pros export and cloud conflict merging remain unapproved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### roster-viewer — Player comparison stage

**Decision:** Which player or source roster best fits my intended use?

**Composition:** A full roster list transitions to two aligned player identity columns sharing a central metric-label spine.

**Zones:** Source roster selector → Browse ledger → Player A/B identity caps → Shared metric comparison plane

**PC interaction:** Select A then B deliberately; keyboard toggles metric chapters together; Back returns to source selection and sort.

**Art:** Paired equal-sized portrait cutouts above actual numbers, no decorative radar dominance.

**Remove:** Unequal profile cards; duplicated comparison controls; unlabeled rating scales.

**Empty/error:** Missing metric is Unknown; no second player prompts selection; load error cannot zero-fill comparator.

**Acceptance:** Both source file names and rating scales remain visible; comparison uses equivalent rows without invented conversion. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Both player identities; Source and rating scale labels; Read-only versus editable distinction

**Dependencies:** Cross-edition rating conversion and automatic roster recommendations are not approved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### class-library — Recruit class archive studio

**Decision:** Save this reusable class or deliberately load it into a named league?

**Composition:** A shallow shelf of named classes opens into one class manifest; recruit authoring occupies full width with three separate outbound command paths.

**Zones:** Class shelf and ownership → Class manifest table → Selected recruit editor → Save/share/load command review

**PC interaction:** Mouse or keyboard selects class; editing does not select a destination league; load requires named target and explicit existing permission.

**Art:** Program-year spines in brass; archive tone rather than arrival celebration.

**Remove:** Generic Publish button; endless class cards; live-season navigation within file authoring.

**Empty/error:** Empty archive offers supported create/import; source error keeps draft; failed league load cannot claim imported.

**Acceptance:** Save, Share and Load into league remain distinct outcomes with truthful destination receipts. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Class name and count; Dirty state; Explicit destination for league loading

**Dependencies:** New sharing permissions, marketplace metadata or non-destructive merge require approval.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### import-class — Transfer review stage

**Decision:** Do I want this shared file in the stated destination?

**Composition:** Source class and target destination flank a directional transfer line, with a read-only manifest across the lower half.

**Zones:** Source identity → Destination identity → Transfer consequence statement → Read-only recruit manifest → Import result

**PC interaction:** Tab follows source, destination, manifest, final command; Escape cancels without changing either side.

**Art:** Brass transfer line and C9 library stamp; no live-team signing visual.

**Remove:** One-click link importing into active league; editable source controls; stacked confirmation modals.

**Empty/error:** Revoked link explains unavailability; forbidden destination is blocked; network failure preserves selected target without success.

**Acceptance:** Before commit, library import versus league load is unmistakable; receipt names actual created artifact. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Class identity/count; Visible source and destination; Invalid or revoked-link state

**Dependencies:** Duplicate detection, provenance signing and compatibility conversions need separate implementation.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s)

### class-share — Shared class showcase

**Decision:** Is this shared class worth exploring or importing?

**Composition:** Class identity headlines a ranked prospect spread with selectable rows; source/visibility facts occupy a compact publication colophon.

**Zones:** Class cover title → Prospect ranking spread → Selected public profile → Source and import command

**PC interaction:** Keyboard browse is read-only; import opens transfer review; copying link is separate explicit action.

**Art:** Original program-cover treatment; no private scouting stickers or fake official license marks.

**Remove:** Marketing landing page funnel; hidden data teaser; auto import.

**Empty/error:** Unavailable share retains safe return; missing author/metadata says unavailable; never claims verified authenticity.

**Acceptance:** Only authorized public fields render; no imported status until real transfer completion. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Public class identity; Only token-authorized fields; Revoked/unavailable states

**Dependencies:** New ratings, download counters, public author identity and sharing modes require approval.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### score-review — Result adjudication stage

**Decision:** Can I accept this exact report revision?

**Composition:** A reported line score anchors two aligned evidence/stat planes; a compact decision band binds revision, authority and accept/dispute controls.

**Zones:** Reported matchup and revision → Submitted stat chapters → Evidence/source plane → Decision and reason band

**PC interaction:** Keyboard moves evidence and stat chapters; explicit action review; stale revision locks final command pending rereview.

**Art:** Neutral cream score line and amber pending state; no victory glow while unresolved.

**Remove:** Generic success modal; entry form look-alike; optimistic green OCR check.

**Empty/error:** Unknown numbers remain unknown; fetch error preserves known revision but disables decision; stale conflict asks rereview.

**Acceptance:** Accept/reject targets exactly displayed revision; failed request keeps reason; FINAL styling begins only after confirmed authority. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Current submitted revision and status; Unknown versus supplied values; Authorized confirmation/dispute controls

**Dependencies:** New automatic arbitration or evidence authentication is not implied.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog), [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s)

### box-score — Final broadcast record

**Decision:** What happened, and which supported performance explains it?

**Composition:** Oversized team names and baseball line score span the top; read-only batting or pitching occupies the broad central plane with a selected player inspection inset.

**Zones:** Authoritative line score → Team/stat chapter rail → Performance table → Source/completeness footnote

**PC interaction:** Mouse column sorting and keyboard row inspection; player opens real profile; Back restores fixture and chapter.

**Art:** Cream numbers over forest broadcast field; brass winner emphasis only after accepted outcome.

**Remove:** Editable report controls; invented event feed; decorative charts hiding stats.

**Empty/error:** Score-only acceptance labels missing statistics; pending report redirects to review treatment, not final; load failure is explicit.

**Acceptance:** Score-only record never manufactures batting totals or game log; result and data completeness remain separate labels. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Accepted score and source; Missing statistics labeled unavailable; Player identity links

**Dependencies:** New derived advanced metrics and factual recap claims require suitable supplied data.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### commission-command — Readiness control matrix

**Decision:** Whose unresolved obligation needs attention?

**Composition:** Team rows cross readiness/report obligations in a full-width matrix; selected obligation opens a shallow detail bay underneath.

**Zones:** Week and active operation strip → Team obligation matrix → Selected blocker detail → Server readiness summary

**PC interaction:** Arrow selection across actual cells; Enter opens linked report; no automatic messages or implicit ready toggles.

**Art:** Team monograms at row heads; restrained amber against forest for unresolved obligations.

**Remove:** Readiness donut; coach profile cards; presence used as readiness.

**Empty/error:** Stale row labeled stale; failed readiness query disables progression; unknown is never treated ready.

**Acceptance:** Each blocked cell links exact supporting record; all clear requires current server evidence. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Readiness separate from presence; Actual game/report references; Unknown or stale states

**Dependencies:** Presence tracking and new reminders require explicit scope.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### commission-actions — Progression operation stage

**Decision:** Is this specific operation currently permitted and understood?

**Composition:** A short action roster gives way to one centered preflight stage with scope on the left, actual blockers central and execution outcome on the right.

**Zones:** Selected operation identity → Affected league scope → Current preflight evidence → Execute/status bay

**PC interaction:** Select then review operation; Enter never executes from initial list; pending disables repeat; Escape leaves only when safe.

**Art:** League seal watermark; concise operational typography and amber consequential verbs.

**Remove:** Dangerous shortcut grid; many equal primary buttons; auto retry.

**Empty/error:** Failed preflight stays blocked; interrupted operation shows unknown status and operation ID, not safe-to-repeat.

**Acceptance:** One request cannot produce two operations; visual completion follows server outcome, not animation timer. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Live phase/week; Server preflight; Operation status and outcome

**Dependencies:** New force, rollback or exactly-once retry guarantees remain unapproved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s)

### commission-settings — League rules console

**Decision:** Which supported league setting should change?

**Composition:** Horizontal rule categories open a compact settings plane with saved/draft values aligned and phase restrictions below the affected control.

**Zones:** League/mode scope → Rule category rail → Saved versus draft values → Apply/discard band

**PC interaction:** Tab traversal matches categories then fields; Escape reviews dirty changes; keyboard shortcuts appear only after tested binding.

**Art:** Rulebook typography, brass category underline; no sports hero needed.

**Remove:** Long web preferences accordion; unsupported sliders; immediate operations embedded in settings.

**Empty/error:** Unavailable saved state blocks edit; validation pins to field; locked rule explains actual phase restriction.

**Acceptance:** Failed save retains draft; no rule appears adjustable unless supported by authorized endpoint. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Saved versus unsaved values; Mode/phase restrictions; Role and scope context

**Dependencies:** New rules, effective-date scheduling and role-transfer behavior require approval.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### commission-audit — League record reel

**Decision:** Who changed this record, and what evidence is available?

**Composition:** A chronological event ledger fills the canvas, with selected event expanded in a lower evidence tray rather than a timeline of cards.

**Zones:** Time/action filter strip → Immutable event rows → Selected target/actor evidence → Available payload detail

**PC interaction:** Keyboard row browsing, source filters and explicit copy nonsecret identifier; no edit action on historical row.

**Art:** Subtle scorekeeper record lines; readable tabular numerals, no drama or celebratory color.

**Remove:** Activity-card feed; reconstructed before/after claims; unexplained green checks.

**Empty/error:** Missing actor or payload remains unavailable; no events differs from query failure.

**Acceptance:** Event identity and observed evidence remain distinguishable from inference; history cannot imply unsupported undo. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Server event ordering; Actor and target identity; Restricted/missing evidence states

**Dependencies:** New diff reconstruction, export formats or audit retention promises are unapproved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### commission-invites — League access register

**Decision:** Which invitation should remain usable?

**Composition:** Invite rows pair named scope and validity; seat/coach assignment occupies a distinct shallow bay; copy and revoke enter separate action stages.

**Zones:** Invitation validity register → Selected invite scope → Seat assignment bay → Copy/revoke consequence stage

**PC interaction:** Select does not expose token; Copy is explicit; Revoke requires selected identity and server acknowledgment.

**Art:** Administrative C9 crest stamp, no welcome splash obscuring validity.

**Remove:** Token thumbnails; revoke beside harmless selection; fake expiry metadata.

**Empty/error:** Unknown validity requires refresh; unavailable invite cannot be copied as valid; failed revoke stays unresolved.

**Acceptance:** Tokens excluded from generic visual exports; a copied token is never described as accepted membership. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Actual token validity; Role-aware controls; Copy/revoke feedback

**Dependencies:** New invite expiry, seat limits or roles need backend support and approval.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### commission-reports — Report exception broadcast desk

**Decision:** Which report exception should I resolve now?

**Composition:** A narrow exception ticker becomes an ordered report list; the selected matchup dominates a broad evidence stage, with accepted history in a separate chapter.

**Zones:** Pending/disputed queue → Selected matchup/revision scoreband → Evidence and validation plane → Bound decision command

**PC interaction:** Keyboard selects report; deep review preserves queue position; filter accepted history separately from actionable exceptions.

**Art:** Amber exception stripe, neutral scores; winner art only in accepted record chapter.

**Remove:** Mixed status cards; bulk accept; detached actions lacking revision.

**Empty/error:** Queue error says unavailable; stale selection stops action; missing evidence stays missing.

**Acceptance:** Two reports with equal scores remain distinguishable by game and revision; no blind bulk approval. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Exact game and revision; Dispute/validation details; Authority and submission provenance

**Dependencies:** New dispute rules, batch decisions and automated conflict resolution require approval.

**References:** [NHL 25 official Franchise Deep Dive — box scores](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### commission-nil — Program finance sheet

**Decision:** What money is actually available, and does a correction need to be made?

**Composition:** Team allocations form one aligned accounting sheet; selecting a team opens documented obligations below, with correction in a separate exact-field stage.

**Zones:** League budget basis → Team financial columns → Selected known obligations → Correction scope and receipt

**PC interaction:** Keyboard numeric inspection and team selection; edit uses explicit field name and scope; totals are read-only when unsupported.

**Art:** Brass only for available funds; cream tabular currency; no casino or fantasy-market imagery.

**Remove:** Pie charts hiding accounting terms; synthetic transaction history; budget equals available labeling.

**Empty/error:** Unknown obligations marked unknown; failed query cannot show zero; save rejection retains requested correction.

**Acceptance:** Budget, spent and available are explicitly labeled from real data; no inferred historical ledger. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Budget distinct from spendable amount; Known obligations and gaps; Authorized adjustment context

**Dependencies:** Ledger reconstruction, currency conversion and new NIL policies remain unapproved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### commission-schedule — Schedule integrity map

**Decision:** Which proven schedule problem must be inspected before advance?

**Composition:** A week-by-team matrix provides the dominant spatial map; diagnostic selection highlights actual affected fixtures with a traceable evidence strip.

**Zones:** Week/team coverage matrix → Verified diagnostic list → Highlighted fixture detail → Check scope and timestamp

**PC interaction:** Keyboard traverses cells; selecting diagnostic highlights affected fixtures; only implemented repair actions can appear.

**Art:** Field-grid motif supports coverage reading; no invented health meter.

**Remove:** Generic health dashboard; unsupported percentages; blank automatic repair button.

**Empty/error:** Unsupported check says not evaluated; unavailable schedule stops healthy claim; no calendar dates fabricated from weeks.

**Acceptance:** Each warning identifies a real check and linked fixture; warning and blocker semantics remain distinct. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Actual diagnostic evidence; Fixture links; Scope of each check

**Dependencies:** New diagnostics, automatic repairs and calendar assumptions require specification.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### commission-editor — League entity workbench

**Decision:** Which named league entity and field should be corrected?

**Composition:** Entity categories occupy a narrow top rail; selected type opens an identity ledger above a category editor, with actual history in a separately labeled tray.

**Zones:** Entity type rail → Stable identity ledger → Editable category workspace → Read-only history/reversal boundary

**PC interaction:** Keyboard select entity/category then edit; save targets stable ID; reversal is its own reviewed operation.

**Art:** C9 seal anchors scope; minimal portrait art keeps structural fields primary.

**Remove:** All-fields megaform; automatic bulk edits; undo-looking navigation.

**Empty/error:** Permission failure blocks privileged fields; missing entity cannot retarget save; validation retains draft.

**Acceptance:** Name and ID remain visible through save; no unimplemented rollback or bulk action implied. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Stable entity identity; Actual editable fields; Validation and dirty state

**Dependencies:** Unsupported bulk mutation, reversible-history guarantees and new appearance controls need approval.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 1:50](https://www.youtube.com/watch?v=yMKktvft4Jo&t=110s)

### commission-saves — Recovery vault

**Decision:** Is this recovery point compatible and actually restorable?

**Composition:** Snapshot chronology occupies the left half; a selected recovery point opens a large coverage and restriction dossier on the right.

**Zones:** Snapshot chronology → Selected season/phase/week identity → Documented coverage and exclusions → Restore restriction/operation stage

**PC interaction:** Keyboard browse does not restore; explicit consequence review and permitted command only; Back retains selection.

**Art:** Brass archive spine and restrained vault seal; no thumbnail promising full-world backup.

**Remove:** Green restore shortcut; nested confirmation chain; complete-backup imagery without proof.

**Empty/error:** Unknown coverage says unknown; incompatible snapshot stays blocked; interrupted restore requires actual status lookup.

**Acceptance:** Restorable status comes from verified restriction checks; partial coverage is visible before action. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Snapshot identity and coverage; Current restore restrictions; Affected league and confirmed outcome

**Dependencies:** Complete restore, consistent snapshot coverage and revision-safe recovery remain engineering gates; no new promise.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s)

### advance-progress — Season transition monitor

**Decision:** Is advance complete, still running, or in need of authorized recovery?

**Composition:** A centered phase-to-phase transition strip is supported by the current server checkpoint and an expandable operation log; ordinary game navigation remains secondary.

**Zones:** Current operation identity → Confirmed phase transition strip → Checkpoint and elapsed observation → Recovery/status log

**PC interaction:** Keyboard can inspect details and safe return; reconnect looks up same operation; no unverified cancel or retry shortcut.

**Art:** Slow stadium light transition may accompany real work; reduced motion is static and never signals success itself.

**Remove:** Fake percentage based on elapsed time; full-screen loading movie; celebration before completion.

**Empty/error:** Lost connection says status unknown; failed checkpoint names actual error; no inferred success or automatic rerun.

**Acceptance:** Completion is emitted only after server terminal success; refresh retains operation identity and honest status. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Actual operation identity; Unknown/interrupted state; Server-confirmed completion

**Dependencies:** New cancellation, resumption guarantees and lease telemetry require verified endpoints.

**References:** [NHL 25 official Franchise Deep Dive — hub screenshots](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog)

### file-dialogs — File command overlay

**Decision:** What will this file action change, and where?

**Composition:** A bounded centered overlay replaces only the command stage, retaining dimmed source workspace and clearly named destination.

**Zones:** Operation verb and source → Destination and visibility → Exact consequence fields → Cancel/commit result

**PC interaction:** Focus trap, Escape cancel and restored source focus; Enter submits only from explicit control, not incidental field selection.

**Art:** Flat forest overlay with thin brass edge; source remains recognizable behind it.

**Remove:** Generic Are you sure; nested modals; mobile bottom sheet.

**Empty/error:** Failed command retains filename; destination unavailable blocks commit; cancel leaves source draft unchanged.

**Acceptance:** Every supported Save/Save as/Share/replacement has specific wording and a server-confirmed result. PC-only target: 1366x768 minimum working layout, 1920x1080 reference and 2560x1440 scale check; no mobile footer, no page-length dashboard. These are proposed validation targets, not existing certification.

**Authority:** Named destination; Unsaved draft preserved on Cancel; Separate replacement/share consequences

**Dependencies:** New overwrite detection, recovery storage and share permission modes are unapproved.

**References:** [MLB The Show 25 — Fielding Feedback: Franchise Front Office Experience, 2:02](https://www.youtube.com/watch?v=yMKktvft4Jo&t=122s)
