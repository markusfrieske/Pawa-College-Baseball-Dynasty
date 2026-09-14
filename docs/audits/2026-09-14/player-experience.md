# Player experience, creative direction, narrative, and companion audit

Date: 2026-09-14
Source: `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`
Standing reviewer roles: JD Player Experience Lead; CeeDee Creative Director; Bookie Narrative & Character Lead; Clarke Art Director.

## Verdict

This project has the ingredients of an unusually personal baseball dynasty game, but its player experience is organized around accumulated features rather than a clear coaching loop. There is real value here: recruiting uncertainty, program identity, depth charts, pitcher availability, game prep, screenshot-assisted reporting, opponent confirmation, story arcs, career statistics, and a commissioner preflight. The next leap will come from making those systems coherent and trustworthy, not adding another dashboard or layer of narrative decoration.

For a text sim, the central promise should be **make a baseball decision, understand its stakes, see the result, remember the people involved**. For the Power Pros companion, it should be **know what to play, play with the correct roster and rules, submit evidence once, settle the result, see the league move**. These can share one dynasty world, but they need different primary actions and clearly defined sources of truth.

This is a source audit, not observed usability testing. I inspected the actual client implementation and selected server narrative contracts. Layout risks below are inferred from CSS and DOM order unless specifically described as deterministic code behavior. No claim is made that screenshots, contrast, browser focus, OCR accuracy, or a live 14-coach season were tested in this workstream. `replit.md` describes intent; actual source takes precedence where they disagree. The July launch handoff documents substantial integrity work and still requires deployment rehearsal; it is not proof that the player experience is finished.

## What deserves preservation

- The game already has a recognizable dark green, gold, retro baseball identity. Preserve that direction and make it calmer and easier to read. Do not replace it with a generic enterprise dashboard.
- The mobile navigation has real labels, safe-area handling, and 44px primary targets (`client/src/components/mobile-nav.tsx:98`). Recruiting has dedicated mobile components. The CSS already includes reduced-motion accommodations (`client/src/index.css:1014`, `:1059`, `:1073`). Accessibility is inconsistent, not wholly absent.
- The game-report flow already separates entry, review, and submission; tracks OCR provenance and corrections; merges multiple batting screenshots; protects corrected categories; and distinguishes hard validation from acknowledged warnings (`client/src/pages/report-game.tsx:295`, `:310`, `:318`, `:756`). Build on this rather than restarting OCR.
- Opponent confirmation and disputes already exist (`client/src/pages/schedule.tsx:317`, `:330`, `:1024`). Any plan describing them as missing would be wrong. The old `replit.md` scope exclusion is stale.
- Commissioner preflight already returns blockers and repair destinations, handles game reporting states, and displays save states (`client/src/pages/commissioner/tabs/CommandCenterTab.tsx:25`, `:39`, `:89`, `:160`). Refine this into the league operator's default daily workspace.
- Player cards already show career seasons, OVR development, and story-acquired ability markers (`client/src/components/player-profile-card.tsx:596`, `:933`, `:1046`). These are useful foundations for player attachment.

## Findings and required improvements

Priority labels here mean P1 = fix before a broad player-facing launch; P2 = important quality/depth work after the trust-critical loop works. They do not assert a security severity.

### UX-01 — P1: The report form breaks its own promise about required work

**Evidence:** The entry screen calls its batting/pitching sections “Box score detail (optional)” (`client/src/pages/report-game.tsx:883`). The review step injects a hard error when no detail exists: “Full box score (batting + pitching) is required” (`:765`). The submit button is blocked by hard errors (`:770`, `:1061`). The contradiction occurs on the normal new-report path.

**Impact:** A coach can enter a score, believe they are done, and only discover the larger obligation afterward. A league companion that surprises players with additional paperwork after the game will struggle to keep its statistics complete.

**Required change:** Make the league's reporting policy visible before play and at the start of entry. State the required evidence, which team each person reports, whether complete batting/pitching is mandatory, and what can be saved for later. One shared policy should drive labels, sections, server validation, and commissioner preflight. If score-only reporting is permitted, mark player statistics as incomplete and keep affected rest/stat calculations explicitly pending; do not invent complete statistics.

**Acceptance:** A new coach can see every mandatory field/category before typing. The strict policy blocks incomplete reports with a link to the exact section. If a lightweight policy is implemented, a score-only report never presents absent statistics as observed zeros. Copy and validation agree in every supported policy.

### UX-02 — P1: Manual reporting work can disappear without even the OCR warning

**Evidence:** Scores, innings, batting, and pitching are component state (`client/src/pages/report-game.tsx:278`–`:304`). The unsaved guard depends only on nonempty OCR `fieldMeta` (`:331`–`:340`). Manual corrections create no provenance key if one did not already exist (`:400`–`:403`). Saved report hydration runs only in edit mode (`:446`–`:480`). No new-report draft persistence is present in this component.

**Impact:** Manual entry and reviewed OCR corrections need to survive phone sleep, refresh, accidental Back, route changes, and a later desktop session. Uploaded screenshots surviving does not mean the coach's corrected form survives. A confirmation dialog is not recovery.

**Required change:** Introduce a durable report draft keyed by user, league, game, and revision. Save score edits, mappings, ignored rows, corrections, and upload references. Show “Saved,” “Saving,” “Offline — saved on this device,” and conflict states. Never silently replace a newer revision from another device. Replace the page's global `history.pushState` patch (`:356`) with scoped navigation protection for outstanding writes.

**Acceptance:** Enter manual stats and OCR corrections; refresh; close and resume; disconnect and reconnect; switch devices after a completed save. Each supported path restores the exact latest saved draft. Unsynced work is visibly identified. Submitted official results are separate from drafts. Retried submission cannot create duplicate effective reports.

### UX-03 — P1: Everyday feedback blocks the entire game, then vanishes too quickly

**Evidence:** Every active toast renders a full-screen backdrop at z-index 99998 and a centered popup (`client/src/components/ui/toaster.tsx:49`–`:73`). All variants, including errors, auto-dismiss after 2.5 seconds (`:33`–`:35`). This custom replacement has no dialog/live-region semantics, focus trap, or focus restoration. The hook permits only one toast (`client/src/hooks/use-toast.ts:8`), so subsequent events replace the previous notice. The component does not render the hook's action field.

**Impact:** Repeated recruiting and roster actions lose flow; a coach can miss the reason for a failed action; keyboard focus and the visual blocking state can disagree. The code also differs from `replit.md`'s stated 30-second notification behavior.

**Required change:** Success feedback should be inline or a nonblocking status announcement. Validation belongs beside the field and in a persistent error summary. Connection/server failures remain visible with retry and retained inputs. Reserve modal dialogs for actual decisions and use the existing accessible dialog primitive. Important outcomes should also live in the activity history.

**Acceptance:** Completing ten recruiting actions does not require ten interruptions. A failed save remains discoverable until resolved/dismissed. Keyboard and screen-reader users receive equivalent feedback. Focus stays on the action during nonmodal notices and returns correctly after modal decisions.

### UX-04 — P1: The hub has too many competing definitions of “what to do next”

**Evidence:** The hero has a minimum height of 240px (`client/src/pages/league-view.tsx:427`). It is followed by ThisWeekPanel (`:538`), WaitingOnWidget (`:557`), PrimaryPhaseCTA (`:563`), NeedsAttentionPanel (`:572`), and CoachActionQueue (`:600`). The weekly opponent appears afterward in the second column (`:626`). On mobile, the one-column grid stacks the entire left column before the opponent (`:553`). Newsroom, navigation dock, leaders, and detail tabs follow more content (`:669`–`:697`).

**Impact:** The source predicts an overly long mobile work surface with repeated readiness concepts. Even useful cards become competing instructions. The next matchup should not lose its place because several systems each want their own command center.

**Required change:** Make Today one curated brief: phase/deadline, one next action, up to three remaining obligations, next matchup, and a short “since your last visit.” Move full standings, news, and historical exploration to their own destinations. Use role and mode to rank actions. Commissioners need the next unresolved league blocker; coaches need their own next action. Art should frame that brief, with an optional compact header after the first visit.

**Acceptance:** At 390×844 and 200% zoom, a returning coach can identify the current phase, deadline, and primary next action without hunting through multiple cards. Reported mode prioritizes playing/reporting/confirming; sim mode prioritizes decisions and advancing. The same obligation is not repeated in multiple actionable lists.

### UX-05 — P1: Navigation includes a destination that does not resolve to its promised content

**Evidence:** Mobile More includes News linking to `?tab=news` (`client/src/components/mobile-nav.tsx:69`). The hub accepts only the set in `client/src/pages/league-view/types.ts:198`, which excludes news. Unknown values default to standings (`client/src/pages/league-view.tsx:74`–`:81`). The actual detail tabs do not include a news tab (`:700`–`:725`). Newsroom is an unrelated section farther down the page.

**Impact:** A named destination silently opens a different view. Returning visitors cannot trust navigation, copied links, or the browser's history as a stable location model.

**Required change:** Give destinations canonical routes or functioning anchors, synchronize selected filters/tabs with the URL, and place global navigation consistently. Do not make a dashboard scroll position the implicit location of a core feature.

**Acceptance:** Every nav destination has a route test asserting the destination heading/content, not only a successful response. News opens news, refresh preserves it, Back restores the previous view, and the active item is announced through `aria-current`.

### UX-06 — P1: The keyboard and touch experience is inconsistent in core management controls

**Evidence:** Depth-chart player rows are clickable draggable `div`s without keyboard semantics (`client/src/pages/roster/components/depth-chart/DepthPlayerRow.tsx:47`–`:58`). PositionCard's depth reorder operation is exposed through drag handlers only (`client/src/pages/roster/components/depth-chart/PositionCard.tsx:20`–`:42`). Other lineup views have click assignment, so this is not a claim that all roster assignment requires dragging. Small and icon RetroButtons default to 36px; medium defaults to 40px (`client/src/components/ui/retro-button.tsx:27`–`:31`). The custom conference picker uses six columns containing 56px-wide buttons with gaps (`client/src/pages/league-create.tsx:328`–`:337`), a 376px natural row before surrounding padding.

**Impact:** Important rows cannot be reached and activated through normal keyboard navigation. Drag-based depth ordering needs a robust phone alternative. The conference picker is a concrete narrow-width overflow risk; browser confirmation is still required.

**Required change:** Use actual buttons for player opening and a named “Move up/down” or “Set depth” action. Keep drag as an enhancement. Use responsive wrapping for conference choices, explicit selected semantics, 44px key touch targets, visible focus, and table alternatives where horizontal comparison is essential.

**Acceptance:** A keyboard-only user can inspect, reorder, assign, and clear a complete lineup. A touch user can do the same without drag. Test 320px, 390px, and 768px widths; no page-level horizontal overflow. Tables may scroll within clearly identified containers. Verify focus order and screen-reader labels manually as well as with automated checks.

### UX-07 — P1: Statistics are presented with more certainty than the companion UI can justify

**Evidence:** Stats view models carry numeric/string statistics without source or completeness metadata (`client/src/pages/stats.tsx:14`–`:28`). Statcast and Defense choices render unconditionally (`:283`–`:285`); exit velocity, barrel%, OAA, DRS, and errors render as plain values (`:399`–`:411`). The report form explicitly treats the advanced-screenshot category as reference-only (`client/src/pages/report-game.tsx:623`). `replit.md` describes simulated Statcast values as synthetic. This finding concerns display provenance; it does not claim all reported-game records are fabricated.

**Impact:** A phone screenshot cannot supply measurements that were never recorded. A serious online league cannot treat a model estimate, an unreported field, and an observed zero as the same fact. Impressive metric breadth is harmful if players misunderstand what it means.

**Required change:** Carry observed/derived/estimated/unavailable source metadata, input coverage, and definitions through the API. Hide or explain unsupported metric views in reported mode. State which games/phases contribute, qualification criteria, and formula assumptions. Show missing values as unavailable, not zero. Add leaderboards by games/PA qualification appropriate to season length.

**Acceptance:** A reported league with no exit-velocity evidence shows no purported measured exit velocity. Partial box scores visibly reduce coverage. Derived rates identify their input basis. Clicking a statistic explains what it means and how this league produced it. Commissioner corrections refresh affected statistics and source indicators together.

### UX-08 — P2: The companion is a collection of screens rather than one game workspace

**Evidence:** Game prep is explicitly designed for the phone before Power Pros (`client/src/pages/game-prep.tsx:1`–`:5`). Its header offers Back and Schedule (`:845`–`:872`), while reporting, pending confirmation, and completed box scores are separate routes/dialogs in `client/src/pages/schedule.tsx:821`, `:1402`, `:1413`. The report form loads the current home/away rosters (`client/src/pages/report-game.tsx:424`–`:442`).

**Impact:** A coach must repeatedly relocate the same fixture. Roster matching needs to be grounded in the roster actually used for that game, especially when reports arrive after edits or progression. Prep, evidence, review, dispute, and history should belong to one durable game identity.

**Required change:** One game workspace with state-aware actions: Scheduled → Preparing → Played/draft → Submitted → Awaiting confirmation → Finalized, with a dispute branch and revision history. Snapshot participants, eligibility, roster revision, and relevant rules at the agreed lock point. Provide a Power Pros preparation checklist and a versioned roster-change packet for manual console work. Do not imply direct console synchronization unless a supported integration is actually implemented and verified.

**Acceptance:** Opening the same game URL always shows its latest authoritative state and the viewer's next permitted action. Both coaches see the same locked roster/rules version. OCR mapping cannot silently substitute a different player after a roster change. Finalized results link back to evidence and onward to updated standings, fatigue/rest, and the next game.

### UX-09 — P2: Creation starts with configuration scale instead of player intent

**Evidence:** League creation defaults to Full Season and simulated games (`client/src/pages/league-create.tsx:74`–`:83`). The top choice is Full Season versus Custom (`:277`–`:314`). Power Pros-style reporting is a toggle inside Custom, near the bottom (`:479`–`:505`). Player progression defaults off for Custom (`:82`), despite long-term development being part of the dynasty fantasy. The reported-mode instructions say “after each series,” but actual reporting is attached to an individual `gameId` (`client/src/pages/report-game.tsx:269`, `:670`).

**Required change:** Start with “Play a solo dynasty,” “Run a Power Pros league,” or “Join a league.” Then choose a ready-to-play preset and show advanced settings progressively. Explain what the app owns versus Power Pros before a commissioner invites anyone. Show a concrete setup review: teams/coaches, game count, progression, schedule cadence, report policy, rules, and postseason format. Existing custom flexibility should remain available.

**Acceptance:** A first-time commissioner can choose the 14-human reported launch profile without reverse-engineering toggles. An invited coach sees only the tasks needed to join and prepare their team. A solo coach reaches a meaningful decision before encountering league-admin options. The word “series” never implies batch import unless batch import exists.

### UX-10 — P2: Narrative has personalities and consequences, but many choices read like answer-key tests

**Evidence:** Storyline cards expose choices, voting, history, resolved outcome text, OVR deltas, and acquired abilities (`client/src/pages/storylines.tsx:232`, `:323`, `:398`, `:419`). The server maps six broad weight classes into fixed attribute/ability outcome packages (`server/storylineEngine.ts:78`–`:140`). Several authored arcs repeatedly reward immediate emotional outreach and penalize delay, including the grief arc (`:623`–`:664`).

**Impact:** Repeated “call now and care” versus “wait and lose” choices can become pattern recognition. Coaching humanity turning into interchangeable velocity/power boosts weakens the emotional credibility of the stories. League-wide voting can be fun social play, but it should be clearly distinguished from what an individual coach personally promised or controlled.

**Required change:** Keep authored arcs and their existing history. Add competing legitimate priorities: staff time, player readiness, lineup opportunity, scholarship capacity, uncertainty, and relationships. Choices should alter obligations and future situations as well as ratings. Let program identity explain a coach's reasoning without requiring one universally correct answer. Separate league story votes from team decisions in labels, ownership, and consequence summaries. Avoid treating sensitive life events as automatic performance-upgrade vending machines.

**Acceptance:** In a reviewed set of 20 dilemmas, each has at least two defensible options with different costs, and the explanation cannot be reduced to “always choose the compassionate text.” Each major outcome records the triggering state, choice owner, observable result, and future follow-up. Scenario repetition is tracked across a dynasty. No story claims an actual Power Pros play occurred without evidence.

### UX-11 — P2: History should explain why these players mattered

**Evidence:** Career tables and story-ability markers exist, but the inspected player-card career presentation is primarily season rows and OVR deltas (`client/src/components/player-profile-card.tsx:933`, `:950`, `:996`, `:1046`). Story arcs have a separate timeline (`client/src/pages/storylines.tsx:419`), and the app also has archive, record-book, dynasty-history, digests, news, and ticker destinations (`client/src/App.tsx:149`–`:178`).

**Impact:** Many history surfaces do not automatically create attachment. The memorable walk-on, recruit who changed a program, and senior who won a rivalry series should remain recognizable after departure, not be scattered across statistical and narrative views.

**Required change:** A unified player life record: recruitment/scouting history, commitments and promises, roster moves, development, game milestones, awards, user-authored memories, screenshots, departure, and alumni results. Every item links to its source game/event and preserves identity across transfers and archived seasons. Offer one concise season scrapbook built from those records, with corrections inherited from the official record. Let coaches pin moments and write short notes.

**Acceptance:** Starting from an archived season, a coach can trace a departed player's recruitment, team changes, signature game, and final career totals without losing identity. Correcting a game updates statistical milestones without erasing authored notes. Generated summaries distinguish confirmed facts from interpretation and never fabricate quotes.

### UX-12 — P1: Correcting an OCR batter's displayed name does not repair its roster identity

**Evidence:** Unmatched OCR batters receive a synthetic `screenshot-*` player ID (`client/src/lib/ocr-batting-merge.ts:130`). The review screen exposes a name text field whose update changes only `name`, preserving `playerId` (`client/src/components/ocr-review-screen.tsx:299`–`:304`, `:329`–`:334`). Missing readable names are only acknowledgeable soft warnings (`:103`–`:118`). Normal full-report submission rejects nonempty player IDs outside the corresponding team roster (`server/routes/games.ts:548`–`:564`).

**Impact:** A coach can correct the spelling, preserve all extracted statistics, and reasonably believe the row is fixed, yet submission still fails on its synthetic identity. This is a recoverability problem in the ordinary screenshot workflow. It should not be confused with crafted API payloads that omit IDs, which the server currently skips during roster validation. The inspected code supports these consequences; neither route was exercised against a live database here.

**Required change:** Add an explicit roster-player matching control that shows the screenshot name, suggested match, selected canonical player, and match status. Selecting a player must replace the identity while preserving the entered statistics. Include eligible substitutes and the fixture's roster snapshot. Exclude already-used identities where duplicate rows are not legitimate; handle multi-screenshot merges without duplicating appearances. Do not ask users to fix an internal player ID themselves.

**Acceptance:** Upload a batter whose OCR name cannot be matched; select the actual player in review; verify the payload contains that player's canonical ID and all prior stat edits. The form visibly blocks unresolved identities before the server round trip. A spelling change alone cannot falsely mark a row resolved.

## Recommended information architecture

Keep five mobile destinations and a persistent matching desktop shell. Do not add more top-level navigation to accommodate every feature.

| Destination | Default content | Secondary content |
| --- | --- | --- |
| Today | Current phase/deadline, one next action, personal obligations, next matchup, since-last-visit brief | Inbox and completed actions |
| Program | Team identity, roster readiness, lineup/rotation, availability | Player development, coach, NIL, recruiting, transfers, departures |
| Games | Current series/week and unresolved results | The single game workspace: prep, report, review, confirmation, recap |
| League | Standings and results | Rankings, leaders, postseason, newsroom, rivals, rules |
| More | Search, history, preferences, league switch | Commissioner workspace for eligible users, archives, saved views |

Recruiting should become a pinned phase-specific action in Today during recruiting windows. If usage testing shows it deserves permanent primary navigation, replace a destination based on measured behavior; do not expand to six or seven bottom tabs. Inbox, ticker, digests, and newsroom should use one underlying event model with audience/urgency filters. They should not create four separate obligations to read the same fact.

The commissioner workspace should default to **what is blocking the next league step**: owner, game/phase, age/deadline, reason, and direct resolution action. Preserve the existing preflight and save-state foundations. Group settings, editors, and recovery tools beneath this daily view. Show the exact next-phase impact before advancing; after completion, show a durable receipt describing what changed. Do not equate an empty pending-report list with the whole league being ready: unreported games and invalid rosters also matter.

## First-session design

### Solo text sim: one meaningful coaching choice within the first session

1. Choose a dynasty preset and program. Show program strengths, weaknesses, and a plausible season ambition in plain language.
2. Meet three players: the anchor, the development project, and the uncertain roster spot. Explain ratings through baseball roles, not an encyclopedia of attributes.
3. Present one real dilemma, such as a stronger veteran versus a promising freshman at a position. Show what is known, what is uncertain, likely short-term cost, and longer-term opportunity. Provide a recommendation with a reason; keep the choice the user's.
4. Confirm the lineup and one development/recruiting priority. Make delegation available for secondary systems.
5. Play/advance a short segment. Return a concise baseball report: result, decisive events supported by the sim, decision consequences, updated availability, and one next choice.
6. Save the moment in the player's history and show that the dynasty is safely saved. Teach the next system when it first matters.

The lesson is the loop itself. A welcome modal explaining 15 tabs is not onboarding. Measure whether new players can explain their decision and consequence afterward, not simply whether they clicked Continue.

### Invited Power Pros coach: ready to play without becoming an administrator

1. Accept the invite; confirm league, role, team, identity, and account continuity.
2. Read a one-screen rules brief: game settings/version as configured by the commissioner, reporting requirements, deadline with timezone, roster lock/update process, rest policy, dispute procedure.
3. Verify the team roster against the league's published console preparation packet. Confirm the roster version used; flag a mismatch.
4. Set lineup/rotation and inspect availability. Explain which adjustments must also be made manually in Power Pros.
5. Open the first game workspace. Show opponent, series game number, schedule deadline, prep card, and the screenshot checklist.
6. Practice one sample screenshot/report in a clearly labeled rehearsal, without modifying official standings. Then return to the actual scheduled fixture.

## The post-Power-Pros-game loop

1. Open the fixture already used for prep. The app knows the game, teams, league, and roster revision; the coach should not reselect them.
2. Upload the required screenshot set in any order. Show category completeness and upload/OCR progress. Permit resuming later.
3. Resolve uncertain fields and player matches first. Present evidence next to the relevant rows on desktop and via an accessible image drawer on phone. Preserve all corrections.
4. Review final score, totals, outs/innings, pitcher usage/rest implications, substitutions, and warnings. Show the league's required checklist and what remains unverified.
5. Submit once; show a durable receipt and exact status. The opposing coach receives an in-app task with the same evidence and full report, not merely a score prompt.
6. Confirm or dispute a specific field/category. A dispute has a reason, proposed correction, evidence, owner, and state. The commissioner compares revisions and records a resolution reason.
7. Finalization updates standings, player totals, rest availability, milestones, and the game recap coherently. Show the change summary and the next fixture. Both coaches can revisit evidence and history.

The minimum strong companion is this loop plus rules/roster continuity. Expanded media, predictive analytics, or AI-generated headlines should wait until it is reliable.

## Creative and art direction

**Aim:** a college baseball coach's desk and season scrapbook, with retro game accents. The personality should come from programs and players; the UI should make decisions feel consequential.

- Use pixel type for short titles, scores, or celebratory moments. Keep explanatory prose, error messages, player comparisons, and statistics in a readable body font. Avoid tiny text and faded text for required instructions.
- Establish a strict hierarchy: one primary action, readable section title, quiet metadata. Gold should identify the important action and meaningful achievement rather than every border and label.
- Keep phase artwork, but allocate desktop and mobile space separately. Do not place a 240px art minimum ahead of a returning coach's urgent report task by default.
- Give every player a stable recognizable portrait, number, role, and history. Add actual personality through short, specific, source-grounded facts rather than more decorative badges.
- Reserve bigger audio/animation for rare moments: a commitment, rivalry win, milestone, or championship. Everyday edits should be quiet and fast. Preserve existing mute and reduced-motion work.
- Use accessible redundant signals: text plus icon for report state, availability, and grade changes. Test actual team colors against the shared dark surfaces before allowing color to convey importance.
- Distinguish a statistical recap, an authored fiction event, and a coach's personal note visually and textually. This is essential when simulated and externally played baseball coexist.

## Delivery order and proof of quality

1. **Trust pass:** UX-01/02/03/05/06/07/12. Fix contradictory instructions, draft recovery, feedback, navigation, keyboard controls, data-source labeling, and roster matching before increasing system breadth.
2. **One complete game workspace:** UX-08 and the post-game loop, with an actual two-coach report/confirm/dispute rehearsal and commissioner resolution.
3. **Coherent daily loop:** UX-04/09, role-specific Today, presets, and progressive onboarding. Reuse the existing backend and component strengths.
4. **Baseball decisions and memory:** UX-10/11, player continuity, credible tradeoffs, and grounded recaps. Coordinate mechanical consequences with simulation design rather than making narrative-only promises.
5. **Art polish:** after the hierarchy and workflows are stable, verify typography, spacing, contrast, responsive tables, portraits, motion, and audio in the actual app.

Proposed usability gates, not measured results: five first-time coaches can independently identify their next task, prepare a legal lineup, report a game, recover a interrupted draft, and find a past result; two commissioners can advance a rehearsal week while resolving a dispute and a missing report; every mandatory task is possible on a 390px phone and with keyboard alone. Track time-to-first-meaningful-decision, time from completed game to finalized report, draft-loss incidents, dispute causes, missed-deadline causes, and commissioner interventions per week. Set speed targets from the first rehearsal, not invented confidence about how fast a 40-field box score should take.

Do not use more tabs, more attributes, more statistics, more story text, or a larger team catalog as the definition of “dramatically improved.” The definition should be a coach who understands what matters, trusts what happened, cares about the players, and wants to play the next week.
