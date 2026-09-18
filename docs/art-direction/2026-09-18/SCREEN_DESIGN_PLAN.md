# PAWA: proposed game screen design, UX and UI

Date: 2026-09-18. Status: **proposal for review**, grounded in current routes and page components. This specifies the next design pass; it does not assert that every screen has been rebuilt. The accompanying machine-readable [screen-designs.json](screen-designs.json) drives the visual review book.

## The change in direction

Frisk rejected the visible scrollbar rails, mobile website footer navigation and fragmented roster presentation. Keep the approved Varsity Club identity, but build the experience around a game workspace: clear location, a readable current decision, a selected athlete or matchup, and a small number of explicit actions. Expert information density should mean useful comparisons per screen, not dozens of unrelated cards.

The established direction remains cel illustration, miniature campus art, forest and brass, Sora display text, Inter body/stat text, sports profiles, athletic monograms, solid icons, restrained broadcast motion and clubhouse sound. New screens should not return to pixel fonts, neon dashboards, generic emoji systems or large decorative banners on every utility page.

The strongest immediate visual defect is the roster's repeated position tables. Eight table headers, large margins and one-player cards break comparison and make a full team feel empty. The proposed roster uses **one manifest plus an athlete inspector**. Position is a filter and a data column; it is not a reason to restart the page eight times. Label numerical ability **OVR**, separate it from star rating, and move hometown into the profile rather than dedicating a wide primary column to it.

## Shared game workspace

Desktop uses a persistent left command rail and top HUD containing league, season/week, current mode and session/network state. The HUD exposes a small, named audio/settings control. All core destinations remain reachable through grouped commands: Matchday; Team; Recruiting; Competition; History; Commissioner when authorized; and global Dynasty/Files. A top Menu command opens the same groups at narrower sizes. There is **no footer navigation**.

A screen normally has a command row, a main working area and, when selection is useful, a right inspector. Screen titles use 24–32px Sora; readable data defaults to 14–16px Inter with tabular numerals. Compact table rows target 44–52px, increasing with text scaling. Selected rows use both a brass marker and a named selected state. Numeric cells align; forms retain labels after entry. Do not shrink the whole interface to fit a narrow screen.

Art establishes place and personality at the title screen, hub, school profile and ceremony. In recruiting, roster, schedule and administrative workflows, the selected person or matchup gets the art. Data should not spend the first half of its viewport underneath a campus hero. Texture belongs outside dense text regions; team colors appear in bounded crests/accents, not as arbitrary low-contrast table backgrounds.

Remove native scrollbar rails without disabling scrolling. Use real reflow for summary panels; column presets or visible previous/next column controls for unavoidable wide tables; a clear selected page/row count; and subtle overflow edge cues. Wheel, touch, Page Up/Down, arrow-key focus and screen-reader access must still reach all content. A blanket overflow-hidden rule that hides needed content fails the design.

At 1280×800, core screens should retain a purposeful landscape game layout and legible text. When space is too narrow for a meaningful inspector, show one full panel at a time, with a top Back that restores selection and filters. At 390px, use the same commands and visual language, not a separate footer-tab website. At increased text size, allow content reflow rather than clipping or forcing microtype.

## Input and motion contract

Keyboard navigation and visible focus are mandatory; drag, hover and swipe are enhancements. A depth chart needs select-player/select-slot as an alternative to dragging. Data tables need named sort controls, and disclosure must be reachable without a mouse. Opening a modal records the invoking control; closing it returns focus. Enter activates a focused action, while Escape closes a transient panel without submitting or undoing a saved server mutation.

Controller descriptions in this proposal are **intended behavior, not implemented support**. Future implementation must define zone navigation, row movement, confirm/cancel, shoulder-button section changes, text entry and error focus per screen. Avoid adding gamepad button glyphs until the mapping actually works. Steam packaging, input integration, platform sign-in, cloud saves, offline guarantees and Deck verification are separate production work; this visual proposal is not Steam certification.

Broadcast motion should explain transitions: 120–220ms selection/panel movement, minimal motion in expert tables, no constant ticker crawl and no animation that hides an action or changes a value. Reduced motion uses direct state changes/fades, with the same information. Audio is optional and should never signal a result that has not been confirmed by the server.

## Two modes, one honest interface

The text sim emphasizes coach choices, simulation, season progression and understandable outcomes. The Power Pros companion emphasizes preparing an external game, recording the played result, reviewing its evidence and following the league's actual confirmation/dispute workflow. Matchup panels share identity and layout, but mode/state determine verbs.

Never make a pending report look like an official score. Missing externally reported statistics are **unavailable**, not zero. Do not imply direct Power Pros synchronization, invent league rules, manufacture pitch-by-pitch playback, or let a celebratory presentation create a roster arrival. Mutation permissions and current server state are authoritative; hiding a button is not an authorization boundary.

Own team, opposing team, commissioner, ordinary coach, guest and public share views require explicit designs. In particular, current roster commissioner-role response shapes need authenticated API validation; read-only synthetic preview fixtures do not establish role correctness.

## Arrival ceremony remains proposed

Frisk selected but has not approved: R01A Clubhouse Arrival; R02D Miniature home diamond; R03A Nameplate slide; R04A Arrival sports profile; R05B Media-day half-body; R06A Warm welcome; R07A Clubhouse signature; R08C Program scrapbook; R09A Choose the spotlight; R10B Coach's cut.

Keep the existing supported signing/class information available. The new staged ceremony, scrapbook and sharing behavior are a distinct approval and implementation dependency. Skip, replay, mute, reduced motion, actual signing status and private-information boundaries must be tested before release. Do not treat this proposal as approval of that recipe.

## Implementation order and dependencies

| Pass | Scope | Completion evidence |
|---|---|---|
| P0 foundation | Game HUD/menu, no bottom navigation, no visible scrollbar rails, reachable overflow, focus/motion/text tokens | Real route inspection at desktop/narrow sizes; keyboard and touch content reachability; no stranded destinations |
| P0 first loop | Roster, recruiting, hub, schedule, report/review, commissioner progression | Real authenticated synthetic coach/commissioner/opponent flows; correct data and mode; interruption/error states; independent gameplay and integrity review |
| P1 operations | Setup, team/coach/recruit profiles, lineup/development, transfers/departures/walk-ons, identity, inbox, postseason | Page-specific acceptance below plus role, phase and error-state coverage |
| P2 presentation and libraries | History, program legacy, championship presentation, file studios and public class views | Source/provenance checks; no private-data leaks; file save/import semantics; visual and keyboard QA |
| Separate approval | Proposed arrival recipe and scrapbook/share artifacts | Frisk's approval, asset production, replay/skip/accessibility and privacy/export QA |
| Separate platform milestone | Steam packaging, input, text entry, platform identity/saves, Deck behavior | Executable/platform tests and actual gamepad playthrough; never inferred from a responsive web preview |

Each pass should preserve the current data model and league rules unless a separate gameplay change is explicitly approved. The shell repair and compact roster are immediate corrections, not proof that the proposed inspector, controller system or all page-specific layouts exist. Visual polish, working software and player enjoyment are three different evidence categories.

## Route coverage

The inventory contains **50 screen specifications covering all 51 explicit route paths**, plus the catch-all. Three coach-profile routes share a specification. Thirty additional tab/overlay specifications capture the important nested experiences. Paths below are copied from App.tsx; query-driven roster and coach views are described as subviews rather than invented routes.

War Room remains a redirect. The current play-by-play route remains an intentional unavailable screen. Unrouted legacy files are not separate live destinations. There is no fabricated Steam settings route or player-profile route in this inventory; existing overlays remain overlays.

## Start & setup

### Title screen

**Route:** `/` · **Priority:** P1

Make returning to a dynasty feel like entering a sports game.

- **Composition:** Full-bleed miniature campus at dusk; PAWA wordmark upper left; a single vertical play menu at left; small account and audio controls top right.
- **Primary action:** Continue most recent dynasty; New dynasty and Join league are secondary.
- **Expert information:** Last played dynasty, season/week, mode and cloud/session status without a dashboard of statistics.
- **Art:** Approved campus art, restrained stadium light and a brass selected-menu marker.
- **Narrow layout:** Crop campus around diamond; retain vertical play menu and top menu button, never a bottom tab bar.
- **Input target:** Pointer or keyboard menu selection; proposed D-pad menu and confirm/cancel; no hover-only options.
- **States and restrictions:** Signed out, returning account, guest, no dynasty, unavailable server; distinguish unavailable from empty.
- **Acceptance:** Continue targets the actual last accessible dynasty; all entry actions remain visible at 1280×800 and 390px.

### Sign in

**Route:** `/login` · **Priority:** P1

Resume an account with minimal friction.

- **Composition:** A quiet club entrance backdrop and one centered credentials panel; back to title at top; recovery/help contextual.
- **Primary action:** Sign in.
- **Expert information:** Field labels, validation, pending state and intended return destination; never reveal credentials in diagnostics.
- **Art:** Cropped campus entrance with low contrast behind form; same Sora/Inter as game.
- **Narrow layout:** One-column form with inset top close/back; keyboard opening never covers submit.
- **Input target:** Normal text entry and password-manager semantics; intended controller invokes platform keyboard only after future integration.
- **States and restrictions:** Invalid credentials, disconnected, pending request and successful redirect; suppress duplicate submission.
- **Acceptance:** Labels stay visible when populated; submit errors preserve inputs safely and return focus to the failing field.

### Create account

**Route:** `/register` · **Priority:** P1

Create a durable coach identity before joining or saving a dynasty.

- **Composition:** One identity form on a muted clubhouse backdrop; explain save ownership adjacent to creation action.
- **Primary action:** Create account.
- **Expert information:** Only actual required account fields and clear password requirements; preserve destination from invite.
- **Art:** Clubhouse signage and monogram without an invented avatar customization step.
- **Narrow layout:** Stack fields in a single panel; top back action stays available.
- **Input target:** Keyboard field order and submit; planned controller text-entry flow shares same validation.
- **States and restrictions:** Duplicate identity, invalid input, network failure, guest conversion where supported; no promise of Steam authentication.
- **Acceptance:** Retry never creates duplicate accounts and successful creation preserves the requested destination.

### Guest entry

**Route:** `/guest` · **Priority:** P1

Explain temporary identity and its real persistence limits before play.

- **Composition:** Compact two-choice entry panel with a concise consequence statement, not a full-screen legal wall.
- **Primary action:** Continue as guest after reading the existing warning.
- **Expert information:** Guest-session limitations and account alternative; only describe guarantees backed by authentication behavior.
- **Art:** Small club-pass illustration and simple solid identity icon.
- **Narrow layout:** Centered readable panel; two full-width actions with no footer navigation.
- **Input target:** Focus first on explanation, then account alternative and continue; Escape returns to title.
- **States and restrictions:** Creating session, failure, sanitized internal redirect; warning cannot vanish while request is pending.
- **Acceptance:** Continue communicates the actual guest limitation and preserves safe redirect behavior.

### Dynasty selection

**Route:** `/dashboard` · **Priority:** P1

Choose a saved world and understand its state at a glance.

- **Composition:** A game library: three large dynasty tiles per desktop row; selected tile expands a right detail area; roster/class libraries occupy an explicit Tools section.
- **Primary action:** Continue selected dynasty.
- **Expert information:** League name, team, current phase/week, mode, last activity and membership; owned files in separate library view.
- **Art:** Campus postcard per dynasty with athletic monogram; art never replaces league identity.
- **Narrow layout:** One featured dynasty and a paged library; top section chooser for Dynasties / Files.
- **Input target:** Arrow navigation proposed within tiles; Enter opens; deletion remains a distinct explicit command.
- **States and restrictions:** No dynasties, unavailable memberships, guest, loading, file preview and deletion confirmation.
- **Acceptance:** No destructive icon masquerades as Play; mode and destination are legible before opening.

### New dynasty

**Route:** `/league/create` · **Priority:** P1

Configure a coherent text simulation or Power Pros companion without an intimidating form.

- **Composition:** A four-step coach desk: mode, competition, roster/class sources, review. Keep a readable configuration summary at right.
- **Primary action:** Create the reviewed dynasty.
- **Expert information:** Existing season length, conferences, team count, difficulty and source selections; clearly distinguish simulated games from reported games.
- **Art:** Small miniature diamond responding visually to selected program, not to unimplemented gameplay settings.
- **Narrow layout:** Step counter at top and one current step; review opens as a full panel.
- **Input target:** Keyboard step sequence; proposed bumpers switch completed steps; do not advance past validation failures.
- **States and restrictions:** Unavailable sources, incompatible settings, pending generation, duplicate submit and role restrictions.
- **Acceptance:** Review reproduces exact submitted configuration; no mode-dependent field silently survives incompatibly.

### Competition selection

**Route:** `/league/:id/team-selection` · **Priority:** P1

Select the participating schools and understand competition structure.

- **Composition:** Conference rail at left, athletic monogram school grid center, selected-field counter and rules summary right.
- **Primary action:** Confirm selected teams.
- **Expert information:** Team totals, conference membership, prestige and existing full-season requirements; selection capacity continuously visible.
- **Art:** Team monograms in consistent badge containers; no reliance on missing logos.
- **Narrow layout:** Conference selector then paged team grid; selected count remains in top toolbar.
- **Input target:** Keyboard toggles with named selected state; intended controller grid navigation and dedicated review action.
- **States and restrictions:** No available schools, full-season constraints, saved selection, rejected configuration and unauthorized access.
- **Acceptance:** Selection is preserved across conferences and review identifies every selected school.

### Coach and school setup

**Route:** `/league/:id/setup` · **Priority:** P1

Establish who the player is and which program they coach.

- **Composition:** School selection list beside a coach media-day profile preview; second step edits coach identity, appearance and existing skill allocation.
- **Primary action:** Confirm coach and program.
- **Expert information:** School prestige/facilities, claimed status, archetype and actual skill budget with consequences.
- **Art:** Cel coach portrait and athletic monogram; restrained campus miniature behind selected school.
- **Narrow layout:** School choice and coach editor become sequential full panels with persistent summary.
- **Input target:** Keyboard accessible sliders/selects; proposed controller changes selection, never silently spends skill points.
- **States and restrictions:** School already claimed, invalid name/allocation, unassigned coach, save error and existing coach.
- **Acceptance:** Cannot confirm a claimed team or overspent skill budget; appearance preview reflects saved values.

### Dynasty lobby

**Route:** `/league/:id/dynasty-setup` · **Priority:** P1

Show exactly what must be complete before a league can start.

- **Composition:** Clubhouse gathering scene above three compact readiness rows: coaches, recruiting class and schedule; coach seats beneath.
- **Primary action:** Start dynasty for authorized commissioner; join/claim seat for eligible coach.
- **Expert information:** Assignments, human/CPU distinction, source readiness, invite controls and explicit blockers.
- **Art:** Cel coach silhouettes in assigned seats with school monograms; avoid implying users are online unless presence says so.
- **Narrow layout:** Readiness checklist first; expandable coach list; top invite action only for permitted role.
- **Input target:** Focus moves from blocker to corrective action; future controller navigates seats and readiness items.
- **States and restrictions:** Waiting for coaches, missing class/schedule, generation pending, unauthorized start and stale setup.
- **Acceptance:** Start remains unavailable with explanation when prerequisites fail; invited coaches cannot see commissioner-only mutations.

### Creating dynasty

**Route:** `/league/:id/creating` · **Priority:** P1

Make a long setup operation understandable without fabricated progress.

- **Composition:** One stadium construction vignette and a vertical list of actual completed/current setup stages; summary panel replaces animation on failure.
- **Primary action:** Enter dynasty when ready; retry only when supported and safe.
- **Expert information:** Real operation stage, elapsed time and recoverable error explanation; no invented percentages or ETA.
- **Art:** Subtle campus lights turn on by verified milestones; reduced-motion static equivalent.
- **Narrow layout:** Single centered stage list; stage text wraps without clipping.
- **Input target:** Focus success action only after completion; Escape must not imply cancellation of server work.
- **States and restrictions:** Pending, stalled, failed, already complete and navigation away/back.
- **Acceptance:** Refresh reattaches to actual operation state; completion is based on server evidence, not animation timing.

### League invitation

**Route:** `/invite/:code` · **Priority:** P1

Let a coach verify a league before joining it.

- **Composition:** Invitation card with league monogram, commissioner-provided identity and membership context; account status in upper corner.
- **Primary action:** Accept invite or sign in to continue.
- **Expert information:** League name, available role/seat where known and validity; avoid displaying hidden league data.
- **Art:** Paper club invitation using forest and brass; no celebratory success before acceptance.
- **Narrow layout:** Centered card with clear top back and in-panel actions.
- **Input target:** Keyboard confirmation and preserved focus; proposed controller confirm/cancel.
- **States and restrictions:** Invalid, expired/revoked or exhausted invitation, existing member, signed out and joining error.
- **Acceptance:** Every invalid invitation has an honest reason when safe and a usable return path; double clicks cannot duplicate membership.

## Team & league

### Matchday brief

**Route:** `/league/:id` · **Priority:** P0

Answer what happened, what needs attention and what the coach can do next.

- **Composition:** Viewport-oriented clubhouse desk: next game and primary action center; compact objective list left; latest meaningful result and readiness right. Deep league information moves into named detail tabs.
- **Primary action:** Resolve highest-priority coach task, then mark ready when allowed.
- **Expert information:** Mode, season/week/phase, lineup readiness, remaining actions/NIL, next opponent and server-backed blockers.
- **Art:** Miniature home diamond hero kept shallow enough that useful decisions are above the fold.
- **Narrow layout:** One Matchday / League top switch; next action first, selected detail full-screen; no duplicate footer menu.
- **Input target:** Keyboard landmarks and explicit focus; proposed controller cycles three zones then selects rows.
- **States and restrictions:** No team, commissioner-only view, offseason, waiting on peers, reported games pending, offline and interrupted advance.
- **Acceptance:** Current mode changes the verb: prepare/report/review versus simulate/advance; unknown results never appear final.

### Roster command

**Route:** `/league/:id/roster` · **Priority:** P0

Evaluate the full roster and make lineup decisions without scanning repeated mini-tables.

- **Composition:** One continuous 44–52px-row manifest with pinned player identity; tabs Roster / Depth / Development. A 32% right inspector shows selected athlete, role, attributes and allowed actions. Position chips filter this one table.
- **Primary action:** Inspect player; switch to Set lineup for arrangement.
- **Expert information:** Number, portrait/name, position, year, handedness, labeled overall, captain/status; optional hitting/pitching metrics via column presets. Hometown moves to inspector.
- **Art:** Cel portrait large enough to establish identity in inspector; field diagram only in Depth; no campus banner above every table.
- **Narrow layout:** At 1280×800 retain list plus inspector; below 900px use full-width manifest and a full-screen player panel with Back to roster preserving selection.
- **Input target:** Up/down moves selected row; Enter opens detail; intended controller left/right changes zones. Depth offers select-player/select-slot instead of requiring drag.
- **States and restrictions:** Empty position, no matching filters, opponent read-only roster, development permission, incomplete lineup, saving and invalid role assignment.
- **Acceptance:** Whole roster is one table; no one-player position cards; filtering and returning from profile preserve context; no hidden offscreen columns are required.

### Team scouting dossier

**Route:** `/league/:id/team/:teamId` · **Priority:** P1

Understand another team's current strength and upcoming challenge.

- **Composition:** Team crest masthead, record and identity strip; Summary / Schedule / Roster / Coaches / School / History tabs in a fixed workspace.
- **Primary action:** Scout roster or prepare the next matchup.
- **Expert information:** Actual team record, schedule, roster, coaches, facilities and history; opponent information obeys existing visibility.
- **Art:** Monogram plus miniature campus crop and small coach portrait.
- **Narrow layout:** Selected tab consumes canvas; team selector in top toolbar rather than stacked cards.
- **Input target:** Keyboard tabs with active state; proposed controller tabs and named list/inspector zones.
- **States and restrictions:** Missing team, future opponent, own team action permissions and absent historical data.
- **Acceptance:** Opponent view never grants roster editing; summary numbers match underlying roster and schedule.

### Program profile

**Route:** `/league/:id/team/:teamId/profile` · **Priority:** P2

Tell the long-term story and identity of a school.

- **Composition:** Editorial program cover with monogram and a shallow campus scene; record ribbon; legacy timeline and factual facilities/identity panels.
- **Primary action:** Explore program history or open current team.
- **Expert information:** Prestige/facilities, titles, recruiting history and school context already available; separate current season from career totals.
- **Art:** Miniature campus is the hero; brass trophy silhouettes and photographic-style cel framing.
- **Narrow layout:** Cover shrinks; chapters open one at a time with top chapter selector.
- **Input target:** Keyboard timeline selection; proposed controller chapter movement with Back to team.
- **States and restrictions:** New program, no titles, missing school data and read-only opponent.
- **Acceptance:** No invented historical achievement fills empty space; every statistic labels its time range.

### Coach profile

**Route:** `/league/:id/coach`, `/league/:id/coach/:coachId`, `/coach/:coachId` · **Priority:** P1

Show a coach's identity, career and authorized development choices.

- **Composition:** Cel coach profile at left; Career / Attributes / Skills / Strategy / Settings become chapter panels at right with a persistent season context.
- **Primary action:** Inspect career; improve/edit only one's own authorized coach.
- **Expert information:** Career record, badges, season history, recruiting grades, personality, perk trees, coaching strategy and notification settings where actually permitted.
- **Art:** Media-day coach portrait, club credential and understated badge shapes.
- **Narrow layout:** Portrait collapses to top identity strip; full-width active chapter.
- **Input target:** Keyboard chapter navigation; perk selection previews effect before any spend; proposed controller navigates tree with explicit node labels.
- **States and restrictions:** Own versus other coach, unassigned, route without league context, unavailable career data and failed preference save.
- **Acceptance:** Public coach routes never expose private preferences or edit controls; spent/available points are unambiguous.

### Program identity

**Route:** `/league/:id/identity` · **Priority:** P1

Choose a coherent baseball philosophy with readable tradeoffs.

- **Composition:** Four playbook panels: offense, pitching, recruiting pitch, culture; selected choice at left and actual effect details at right.
- **Primary action:** Save an eligible identity change.
- **Expert information:** Current identity, candidate descriptions, real gameplay effects/costs/locks; do not invent hidden modifiers.
- **Art:** Monogram and solid baseball silhouettes; faint chalk diagram outside text area.
- **Narrow layout:** One category at a time with a four-item top selector and saved-state summary.
- **Input target:** Keyboard radio groups; proposed controller selection followed by explicit Apply.
- **States and restrictions:** Read-only observer, phase lock, unchanged draft, unsaved changes and rejected save.
- **Acceptance:** Selecting a card previews; only Apply changes state; restrictions include actionable explanation.

### Coaching rivalries

**Route:** `/league/:id/rivalries` · **Priority:** P2

Give recurring matchups personality while keeping records credible.

- **Composition:** Mine / League selector; large selected matchup card center; rivalry list left; head-to-head chronology right.
- **Primary action:** Open next matchup or inspect rivalry history.
- **Expert information:** Existing rivalry intensity/context, coach names, series record and factual moments.
- **Art:** Opposing monograms and cel coach busts; understated versus composition rather than combat imagery.
- **Narrow layout:** List opens a full rivalry panel; back preserves filter and selection.
- **Input target:** Keyboard list selection; proposed controller focus on matchup and chronology.
- **States and restrictions:** No rivalry yet, mine unavailable without team, missing opponent data and read-only history.
- **Acceptance:** No procedural insult or rivalry cause is fabricated; each record links to available game evidence.

## Recruiting & offseason

### Recruiting desk

**Route:** `/league/:id/recruiting` · **Priority:** P0

Compare targets and spend scarce attention with confidence.

- **Composition:** A two-row situation strip replaces the overflowing Command Center carousel. Below: dense searchable board 65%, selected-recruit inspector 35%; filters stay in a top command row.
- **Primary action:** Take an allowed recruiting action on selected prospect.
- **Expert information:** Interest/stage, stars and scouted attributes, offer/NIL, visits, competition, team needs and remaining actions. Unknown scouting stays explicitly unknown.
- **Art:** Cel selected recruit and quiet campus postcard in inspector; solid status icons with text; restrained rivalry accents.
- **Narrow layout:** Situation strip becomes two columns; board keeps identity, position, interest and action status; inspector opens as full panel.
- **Input target:** Keyboard sortable table and focusable filters; intended controller row selection, inspector switch and action menu; no hover-only tooltips.
- **States and restrictions:** No targets, budget/action exhausted, phase lock, signed recruit, failed mutation, CPU/read-only coach and out-of-date board.
- **Acceptance:** All six command summaries fit without horizontal clipping; costs and resulting balance shown before spend; no duplicate actions from animation or retries.

### Recruit scouting profile

**Route:** `/league/:id/recruit/:recruitId` · **Priority:** P1

Make an athlete feel like a person while exposing enough data for expert recruiting.

- **Composition:** Half-body cel portrait left; identity and fit summary center; Info / Attributes / Common / Pitches / Priorities / Abilities panel; relationship and offers at right.
- **Primary action:** Scout, recruit or review offer when authorized.
- **Expert information:** Scouting certainty, attributes/abilities, pitches only for pitchers, priorities, current competition and action cost.
- **Art:** Media-day framing and school-neutral scouting card; never use portrait styling to signal hidden gem/bust status.
- **Narrow layout:** Portrait becomes compact header; data tabs full width; action bar belongs to panel top, not global footer.
- **Input target:** Keyboard tab navigation and named action buttons; proposed controller stat groups rather than every tiny cell.
- **States and restrictions:** Unscouted, partial scouting, committed, signed, orphan/missing recruit and phase or role lock.
- **Acceptance:** Hidden ratings remain hidden in all tabs and exported views; back returns to same recruiting filters.

### Transfer portal

**Route:** `/league/:id/transfer-portal` · **Priority:** P1

Evaluate transfers as immediate roster choices with eligibility and cost context.

- **Composition:** Portal manifest with position/year filters and availability badge; selected transfer dossier; commitment/interest action panel.
- **Primary action:** Pursue or make permitted transfer offer.
- **Expert information:** Origin school, eligibility, attributes visible to coach, offer status, NIL impact and available roster slots.
- **Art:** Cel athlete with small origin monogram and neutral portal badge; no generic recruiting-star celebration.
- **Narrow layout:** Manifest to full detail panel; key year/position/status stay visible.
- **Input target:** Keyboard selection and explicit offer confirmation; proposed controller uses same list/inspector pattern.
- **States and restrictions:** Closed portal, no entrants, ineligible targets, own-team departures, filled roster and failed offer.
- **Acceptance:** Roster and budget consequences are visible before committing; stage-closed state cannot look like an empty search.

### Committed class

**Route:** `/league/:id/commits` · **Priority:** P1

Show how a class fits the program and where it ranks.

- **Composition:** Current class ribbon and a compact position-needs matrix; team-class table with selected team detail; past rankings via season selector.
- **Primary action:** Review own class or view a committed athlete.
- **Expert information:** Committed versus signed status, class count, ranks/grades from actual data, position mix and past class history.
- **Art:** Cel recruit tiles with consistent monogram frame; no card-back gimmick for already known information.
- **Narrow layout:** Own class first; switch teams in top picker; ranks remain a separate clear view.
- **Input target:** Keyboard class and season selection; proposed controller athlete carousel with explicit count and buttons.
- **States and restrictions:** No commits, teams without commits, pending signing and missing past class.
- **Acceptance:** A verbal commitment never appears as a completed roster arrival; rank and season are clearly labeled.

### Signing day and arrival ceremony

**Route:** `/league/:id/signing-day-reveal` · **Priority:** P2 — approval dependency

Celebrate actual arrivals and leave a useful class record.

- **Composition:** Proposed only: Clubhouse Arrival staged on miniature home diamond; nameplate slide; media-day half-body athlete; final arrival sports profile. My class / All teams / All recruits remain accessible.
- **Primary action:** Choose a spotlight player, play or skip reveal, then inspect the arrival card.
- **Expert information:** Actual signed status, player identity, position/year and authorized scouting/attributes; preserve class roster even after skipping.
- **Art:** Frisk's unapproved R01A R02D R03A R04A R05B R06A R07A R08C R09A R10B recipe: warm welcome, clubhouse signature, program scrapbook, choose spotlight, coach's cut.
- **Narrow layout:** Landscape stage scales around portrait and nameplate; portrait view prioritizes card; skip/replay in top controls.
- **Input target:** Skip and sound accessible before motion; keyboard Enter reveal/Escape skip; controller behavior proposed only.
- **States and restrictions:** Already viewed, no signed class, reduced motion, muted sound, missing portrait and locked/unavailable reveal.
- **Acceptance:** No new recipe ships without approval; skipping never mutates signings; scrapbook/export must exclude hidden/private data.

### League departures overview

**Route:** `/league/:id/players-leaving` · **Priority:** P1

Understand which programs are losing players and where future roster needs arise.

- **Composition:** League departure ledger with team selector and Graduation / Draft / Portal category filters; selected program shows departing athletes and source status. Any returning-roster projection is a later addition requiring verified data.
- **Primary action:** Inspect departing player or open the team's permitted departure workflow.
- **Expert information:** Existing team-by-team graduates, draft declarations, transfers and total leaving. Keep source-declared departures distinct from any future forecast.
- **Art:** Cel portrait and academic/diamond silhouettes; continuity timeline restrained.
- **Narrow layout:** Grouped list first; player detail replaces it; persistent projected roster count.
- **Input target:** Keyboard list and group navigation; proposed controller selects groups then athletes.
- **States and restrictions:** No departures, incomplete current-season data, missing player, pending versus final source status and read-only opponent.
- **Acceptance:** Category totals reconcile with actual departure rows; no assumed returners or speculative draft result is presented as confirmed.

### Departure decisions

**Route:** `/league/:id/departures` · **Priority:** P1

Resolve exits and retention choices with clear roster consequences.

- **Composition:** My team / Roster preview / League tabs; decision queue left, selected player and consequences center, remaining budget/roster summary right.
- **Primary action:** Make a permitted retention decision or finalize reviewed departures.
- **Expert information:** Graduation, draft and portal categories, relevant retention cost, finalized state and projected next roster.
- **Art:** Cel athlete and understated farewell program card; no celebratory animation on loss.
- **Narrow layout:** One decision at a time with queue count; roster preview becomes full-screen mode.
- **Input target:** Keyboard decision review; explicit confirmation for finalization; proposed controller never confirms destructive action on initial press.
- **States and restrictions:** Pending decision, impossible retention, finalized/read-only, stale roster projection and failed finalization.
- **Acceptance:** Final confirmation names affected players and irreversible effects; back/cancel cannot submit; official totals refresh after success.

### Cuts and walk-on bids

**Route:** `/league/:id/walkons` · **Priority:** P1

Fill real roster gaps while making the cost of cuts and bids visible.

- **Composition:** Roster capacity strip at top; My roster / Available walk-ons / Results views; selected athlete panel and bid summary.
- **Primary action:** Place eligible bid or review a cut.
- **Expert information:** Current/projected roster count, bid commitments, budget, role needs and signed/outbid results.
- **Art:** Cel player portraits with practice-field backdrop; distinct neutral bid versus signed states.
- **Narrow layout:** Single list view and full detail panel; capacity always remains in top strip.
- **Input target:** Keyboard numeric bid entry, named increase/decrease controls; proposed controller has discrete bid steps and explicit cut confirmation.
- **States and restrictions:** Auction open/closed, no funds/space, simultaneous outbid, won player, cut pending and network failure.
- **Acceptance:** Cut confirmation identifies player; displayed available funds reflect pending obligations under actual rules; results never imply all bids won.

## Games & competition

### Season schedule

**Route:** `/league/:id/schedule` · **Priority:** P0

Find the next game and distinguish played, reported, disputed and final results.

- **Composition:** Week ribbon above a fixture list; selected matchup details at right; team/conference filters in command row; exhibitions remain explicitly labeled.
- **Primary action:** Prepare next game; Report, Review or View result according to actual mode/state.
- **Expert information:** Week/date, teams, home/away, score/status, submission owner, confirmation/dispute state and available action.
- **Art:** Athletic monograms and a restrained scoreboard header; no repeated campus heroes.
- **Narrow layout:** Week controls and fixture list; selected matchup expands into full panel.
- **Input target:** Keyboard week previous/next and fixture selection; proposed controller bumpers change week and confirm opens details.
- **States and restrictions:** Future, simulated final, report pending, disputed, rejected, stale submission, postponed/absent data and spectator.
- **Acceptance:** A pending report is visually distinct from official score; no simulation button appears for companion-only workflow.

### Game preparation

**Route:** `/league/:id/games/:gameId/prep` · **Priority:** P1

Translate roster information into a clear pregame decision.

- **Composition:** Broadcast matchup header; probable pitchers and key comparisons center; own lineup and scouting notes in adjacent panels; Prep / Lineup / Matchup chapters.
- **Primary action:** Review lineup or open the next legal match action.
- **Expert information:** Matchup meter and keys based on existing calculations, pitcher/lineup details, head-to-head and team identity.
- **Art:** Small miniature ballpark under scoreboard, cel starter portraits and clear away/home labels.
- **Narrow layout:** Two-sided comparison becomes paired metric rows; lineup has its own full panel.
- **Input target:** Keyboard chapter navigation and select-slot lineup alternative; controller field navigation proposed.
- **States and restrictions:** Unscheduled game, missing roster/lineup, own versus observer, locked lineup and companion mode.
- **Acceptance:** Advice is labeled analysis rather than certainty; companion does not pretend to send a lineup into Power Pros.

### Report a Power Pros game

**Route:** `/league/:id/report-game/:gameId` · **Priority:** P0

Record a real played result accurately and make review errors easy to fix.

- **Composition:** Three-step scorer desk: evidence/input, review, submit; scoreboard remains fixed at top; batting and pitching panels switch by team.
- **Primary action:** Submit reviewed report or save/edit permitted draft.
- **Expert information:** Official game identity, score, innings and actual supported batting/pitching fields; OCR uncertainty and validation shown adjacent to cell.
- **Art:** Scorebook typography using Inter tabular numerals; school badges and paper-like inset on forest.
- **Narrow layout:** One team/stat group at a time; summary always reachable by top Review command; no giant horizontally clipped grid.
- **Input target:** Keyboard cell navigation, input labels and error focus; controller text entry and grid editing require later dedicated validation.
- **States and restrictions:** Wrong participant, unsupported mode, OCR incomplete, contradictory totals, stale edit, pending approval and server rejection.
- **Acceptance:** OCR never auto-confirms; review lists all blockers; submit success reflects server response and preserves source/provenance labels.

### Play-by-play unavailable

**Route:** `/league/:id/game/:gameId/play-by-play` · **Priority:** P1

Explain the unavailable feature honestly and return to useful game information.

- **Composition:** Deliberate unavailable panel within game shell with matchup context and a clear result/schedule destination.
- **Primary action:** Open schedule or supported game result.
- **Expert information:** Only current game identity/status and factual availability explanation.
- **Art:** Quiet scoreboard illustration; no fake playback timeline or Play button.
- **Narrow layout:** Compact full panel and top Back.
- **Input target:** Keyboard primary action; proposed controller back/confirm.
- **States and restrictions:** Legacy links, missing game and unsupported play-by-play.
- **Acceptance:** No fabricated pitch sequence or dead-end spinner; route remains explicitly unavailable until evidence supports a real feature.

### Postseason hub

**Route:** `/league/:id/postseason` · **Priority:** P1

Make the tournament path and next obligation instantly clear.

- **Composition:** Round selector above bracket scene; selected game inspector and qualification summary; conference/national stages get explicit stage headings.
- **Primary action:** Open next eligible postseason matchup.
- **Expert information:** Seeds, series state, advancement, next game, official/pending status and bracket source.
- **Art:** Brass tournament lines over dark forest with restrained trophy silhouette.
- **Narrow layout:** Round-by-round fixture list replaces a squeezed full bracket; previous/next round buttons maintain path.
- **Input target:** Keyboard selects game then round; proposed controller uses bracket neighbors with list alternative.
- **States and restrictions:** Before qualification, incomplete bracket, live series, disputed report, eliminated team and champion.
- **Acceptance:** Bracket does not advance on unconfirmed scores; every small node has a readable list equivalent.

### Championship presentation

**Route:** `/league/:id/championship/:season` · **Priority:** P2

Celebrate verified achievement and connect it to the season record.

- **Composition:** Champion monogram and cel team composition; short optional entrance; recap chapters for bracket, final rankings and awards.
- **Primary action:** View season recap or continue to offseason.
- **Expert information:** Champion, season, final series scores, awards and rankings from completed data; no placeholder winner.
- **Art:** Miniature diamond confetti kept subtle, brass trophy centerpiece, snapshot-ready composition.
- **Narrow layout:** Hero scales without clipping title; chapters open full-width; skip at top.
- **Input target:** Skip/replay keyboard controls and reduced motion; proposed controller chapter selection.
- **States and restrictions:** Season unfinished, championship missing, viewed before, muted sound and missing awards.
- **Acceptance:** Celebration appears only for confirmed champion; skipping never advances league or bypasses offseason decisions.

## Records & stories

### Statistics desk

**Route:** `/league/:id/stats` · **Priority:** P1

Compare baseball performance efficiently with honest data coverage.

- **Composition:** One dense sortable leaderboard with batting/pitching and team/player presets; selected athlete inspector; season/scope filters anchored top.
- **Primary action:** Sort or inspect a player/stat line.
- **Expert information:** Existing statistical columns, qualifying sample and actual season/source coverage; report missing companion stats explicitly.
- **Art:** Cel leader portrait in inspector; clean scorebook typography dominates.
- **Narrow layout:** Essential columns fit; metric presets and detail panel replace horizontal travel.
- **Input target:** Keyboard sort controls and row navigation; proposed controller metric-group cycling.
- **States and restrictions:** No recorded stats, partial reported box scores, zero denominators, unqualified player and unavailable source.
- **Acceptance:** Unknown/missing is not zero; rate stats carry sample context; all columns are reachable without native horizontal rails.

### Record book

**Route:** `/league/:id/record-book` · **Priority:** P2

Make achievements searchable and credible across seasons.

- **Composition:** Library chapter rail for supported records, coach legacy, recruiting history and Hall of Fame; selected record detail with source season.
- **Primary action:** Inspect a record holder or season.
- **Expert information:** Record value, category, holder, team, season and existing qualification rules; ties and empty categories explicit.
- **Art:** Brass record plaques used for leaders only; dense ledger for full list.
- **Narrow layout:** Chapter selector top; one ledger then full record detail; no decorative trophy walls pushing data down.
- **Input target:** Keyboard chapter/search/row selection; proposed controller page navigation.
- **States and restrictions:** No completed seasons, tied records, missing archived player and read-only historical values.
- **Acceptance:** Historical versus current records never mix without labeling; Hall of Fame eligibility remains actual game rule.

### Season archive

**Route:** `/league/:id/archive` · **Priority:** P2

Revisit an entire season without confusing it with the live league.

- **Composition:** Season spine at left; Overview / Recruiting / Departed / Games / Teams chapters; selected season always in masthead.
- **Primary action:** Open archived team or game.
- **Expert information:** Champion, rankings, leaders, class, departures and official archived fixtures with available completeness.
- **Art:** Season cover postcard and monogram with subtle aged brass; no low-contrast faded text.
- **Narrow layout:** Season chooser top and one active chapter.
- **Input target:** Keyboard season selection and chapters; intended controller bumpers change season after explicit focus.
- **States and restrictions:** No snapshots, partially archived season, missing linked entities and legacy data.
- **Acceptance:** Every panel labels archived season; no live mutation action appears inside historical views.

### Archived team

**Route:** `/league/:id/archive/team/:teamId` · **Priority:** P2

Inspect a historical team as it existed in the selected season.

- **Composition:** Archive masthead with team crest and explicit year; compact historic roster and selected player panel; season results adjacent.
- **Primary action:** Inspect archived roster or return to season.
- **Expert information:** Snapshot roster, record, results and honors actually retained; current team link clearly marked as live.
- **Art:** Program yearbook framing and era/season label; use portrait fallback for unavailable archival art.
- **Narrow layout:** Historic roster/detail pattern matches current roster but retains archive color cue and label.
- **Input target:** Keyboard rows and back; proposed controller matching roster navigation.
- **States and restrictions:** No snapshot, missing historical attributes, retired player and season ambiguity.
- **Acceptance:** No current attributes silently fill historical gaps; route must preserve selected season context from archive.

### League news digest

**Route:** `/league/:id/digests` · **Priority:** P2

Explain the meaningful changes since the last advance.

- **Composition:** Issue list left; selected weekly digest center with editorial hierarchy; action-needed section separated from achievements.
- **Primary action:** Read latest issue and open a linked game/player/task.
- **Expert information:** Completed games, performances, standings movement, commitments, battles, pending reports, readiness and commissioner events when present.
- **Art:** Campus newspaper treatment with Sora headlines, cel featured athlete and small monograms.
- **Narrow layout:** Issue selector top and a readable article; categories collapse when irrelevant.
- **Input target:** Keyboard issue list and article landmarks; proposed controller article paging with action links.
- **States and restrictions:** No digest, partial issue, current versus past week and unread state.
- **Acceptance:** Generated narrative cannot claim a final result for a pending report; links preserve relevant league context.

### League ticker

**Route:** `/league/:id/ticker` · **Priority:** P2

Provide a quick factual stream of league activity.

- **Composition:** Static chronological activity board with category filters and an expanded selected event; new entries badge replaces forced scrolling.
- **Primary action:** Inspect event details.
- **Expert information:** Event timestamp/week, category, actors and current related record; retain any factual provenance available.
- **Art:** Small solid category icons and team monograms; no perpetual marquee animation.
- **Narrow layout:** Compact vertical event rows; details open full panel.
- **Input target:** Keyboard list selection and explicit Load newer; proposed controller paging.
- **States and restrictions:** Empty stream, disconnected/stale, historical events and events without destination.
- **Acceptance:** New arrivals do not move focus or scroll the reader away; no marquee required to read information.

### Coach inbox

**Route:** `/league/:id/inbox` · **Priority:** P1

Turn messages into decisions instead of notification clutter.

- **Composition:** Category rail, message list, reading pane; unread count and archive control in toolbar; consequence/action inside message.
- **Primary action:** Resolve selected actionable message or mark/read/archive.
- **Expert information:** Actual message categories, sender/context, timestamp, unread/archive state and valid destination.
- **Art:** Club stationery with small cel sender portrait where available; urgent accent reserved for real deadline.
- **Narrow layout:** List and reader become two full panels; top Back retains unread/filter context.
- **Input target:** Keyboard list navigation and explicit archive; proposed controller list/reader zone swap.
- **States and restrictions:** Empty category, archived view, already completed linked action, stale message and offline.
- **Acceptance:** Archiving does not perform linked action; unread is not confused with unresolved; no private inbox on public coach routes.

### Storyline hub

**Route:** `/league/:id/storylines` · **Priority:** P1

Make narrative choices and their status legible without hiding rules.

- **Composition:** Vote / Arcs / Intel / Command chapters; featured active story center, decision panel and factual consequence history right.
- **Primary action:** Cast eligible vote or resolve permitted story decision.
- **Expert information:** Actual vote deadlines/state, active arcs, unlocked intel and commissioner command permissions.
- **Art:** Cel cast portrait, miniature campus vignette and warm restrained editorial copy.
- **Narrow layout:** One story at a time with chapter selector; choices fully visible before confirming.
- **Input target:** Keyboard radio choices followed by Vote; intended controller chooses then confirms; no timed input requirement.
- **States and restrictions:** No stories, already voted, expired vote, hidden intel, commissioner-only command and failed request.
- **Acceptance:** Outcome copy distinguishes projected effects from resolved effects; observers cannot infer private intel through hidden UI.

## Administration & tools

### Commissioner office

**Route:** `/league/:id/commissioner` · **Priority:** P0

Operate a shared league with clear boundaries and consequences.

- **Composition:** Dedicated office workspace: left section rail; actionable state summary center; preflight/recovery details right. Ten sections cover existing controls without a long wrapping tab row.
- **Primary action:** Resolve blockers and explicitly advance when server preflight permits.
- **Expert information:** Command center, actions, settings, audit, invites, reported results, NIL, schedule health, league editor and save states according to role/mode.
- **Art:** Small league monogram; restrained operational design, not a decorative game hero.
- **Narrow layout:** Full-height section drawer from top; current section occupies canvas; no bottom menu.
- **Input target:** Keyboard section navigation and guarded confirmation; intended controller can inspect, with complex editing explicitly requiring text input.
- **States and restrictions:** Non-commissioner denial, read-only inspection, preflight fail, pending reports, recovery required, stale operation and permitted save states.
- **Acceptance:** Advance describes actual mode, pending reports and recovery state; client progress never asserts completion without server confirmation.

### Commissioner roster editor

**Route:** `/league/:id/edit-rosters` · **Priority:** P1

Make controlled league roster corrections with visible scope.

- **Composition:** Team selector left, editable compact roster table center, selected player's field editor right; visible draft/change summary.
- **Primary action:** Save authorized player correction.
- **Expert information:** Existing editable fields, previous/new values, team and player identity; sensitive attributes retain role restrictions.
- **Art:** Cel appearance preview only in inspector; no decorative banner consuming grid space.
- **Narrow layout:** Team picker and single player editor replace a spreadsheet wider than viewport.
- **Input target:** Keyboard cell-to-editor flow; proposed controller selects records, text entry remains explicit.
- **States and restrictions:** Access denied, phase restriction, invalid value, save pending and stale player.
- **Acceptance:** Wrong-team edits cannot be mistaken for own roster changes; review identifies changed fields before commit where workflow supports it.

### Commissioner recruit editor

**Route:** `/league/:id/edit-recruits` · **Priority:** P1

Correct a recruiting class without exposing hidden evaluation data to coaches.

- **Composition:** Class filter and searchable recruit manifest; selected recruit's editable fields in inspector; hidden traits visually marked commissioner-only.
- **Primary action:** Save permitted recruit correction.
- **Expert information:** Actual class fields including hidden gem/bust traits for authorized editors, identity and affected league/class.
- **Art:** Neutral prospect cel portrait; hidden trait controls are textual and do not alter public portrait appearance.
- **Narrow layout:** Select recruit, edit category full-screen, back preserves search.
- **Input target:** Keyboard category forms with validation; proposed controller selects record and category.
- **States and restrictions:** Access denied, invalid attributes, class unavailable, stale edit and save error.
- **Acceptance:** Privileged traits never leak through public exports/previews; save result lists exactly which recruit changed.

### Roster file studio

**Route:** `/manage-rosters` · **Priority:** P2

Prepare reusable roster files without confusing files with live leagues.

- **Composition:** Library/source selector, team/player manifest and selected field editor; clear File workspace badge; Save as distinct from live editing.
- **Primary action:** Save custom roster file.
- **Expert information:** Source name, team/player counts, editable player attributes/appearance and dirty state.
- **Art:** Cel player preview and compact school badge; tooling keeps Varsity Club typography.
- **Narrow layout:** Team then player selection with full editor panels and top Save command.
- **Input target:** Keyboard field editing, explicit Save as; proposed controller browsing only until text-entry validation.
- **States and restrictions:** Unsaved changes, duplicate name, invalid data, source loading and failed save.
- **Acceptance:** Saving a file does not imply a live league changed; leaving a dirty file prompts recoverable choice.

### Roster browser and comparison

**Route:** `/roster-viewer` · **Priority:** P2

Browse source rosters and compare players before choosing a dynasty file.

- **Composition:** Conference/team navigation rail, player manifest, selected player inspector; compare mode pairs two profiles on identical stat axes.
- **Primary action:** Inspect or compare players; save a custom copy only when editing is available.
- **Expert information:** Source/file identity, team roster, ratings/appearance and editable dirty state where supported.
- **Art:** Consistent cel profiles; two-player comparison uses equal portrait and stat scale.
- **Narrow layout:** Conference/team picker then manifest; comparison switches aligned metric groups rather than compressing both profiles.
- **Input target:** Keyboard selection and Compare command; intended controller mark first/second player and switch stat group.
- **States and restrictions:** No source, missing team, read-only source, unsaved changes, compare incomplete and failed save.
- **Acceptance:** Comparison labels source and each player; custom copy never silently overwrites the original.

### Recruiting class studio

**Route:** `/manage-recruiting` · **Priority:** P2

Create and manage reusable classes with deliberate load/share actions.

- **Composition:** Class library rail; selected class manifest; recruit editor; separate top commands Save, Share and Load into league.
- **Primary action:** Save class or review an authorized load into league.
- **Expert information:** Class name/count, recruit fields/appearance, dirty state and selected destination league.
- **Art:** Cel prospect preview on a clean file-card inset; no signing ceremony in authoring.
- **Narrow layout:** Library to class to recruit as clear top-level drill-down; Save remains top command.
- **Input target:** Keyboard edit forms and explicit destination selection; intended controller browsing with text-input dependency.
- **States and restrictions:** No class, invalid fields, deletion confirmation, unsaved edits and unauthorized/incompatible destination.
- **Acceptance:** Loading names destination and replacement effects; share/export respects class visibility; saving alone changes no league.

### Shared class import

**Route:** `/import-class/:token` · **Priority:** P2

Inspect a shared class before creating a local library copy or permitted import.

- **Composition:** Read-only class cover and searchable preview; destination/action summary in side panel.
- **Primary action:** Import reviewed class using existing supported workflow.
- **Expert information:** Class name, count, visible recruits, source metadata and validity; explain actual import destination.
- **Art:** Small prospect contact sheet with file identity prominent.
- **Narrow layout:** Preview and import summary become sequential panels; no hidden submit below giant list.
- **Input target:** Keyboard preview and explicit Import; proposed controller list and confirmation.
- **States and restrictions:** Invalid/revoked link, unavailable data, signed-out user, already imported if detectable and failed import.
- **Acceptance:** Preview is not a live league mutation; successful state names exactly where the class was imported.

### Shared class showcase

**Route:** `/class-share/:token` · **Priority:** P2

Present a shareable class clearly without leaking private league data.

- **Composition:** A public class yearbook cover with compact recruit grid/list and selected profile; visible link to supported import action.
- **Primary action:** Explore shared class or open import.
- **Expert information:** Only data authorized by share token; class identity, recruit count and disclosed profile fields.
- **Art:** Cel contact-sheet portraits and athletic file monogram; tasteful share-ready composition.
- **Narrow layout:** List/detail pattern with top navigation; no authenticated league footer.
- **Input target:** Keyboard row/grid selection; proposed controller browsing; sharing through explicit supported controls.
- **States and restrictions:** Invalid/revoked link, missing artwork, partial disclosure and no authenticated account.
- **Acceptance:** Private scouting, account details and unrelated league data are absent from DOM/export as well as visual surface.

## System & recovery

### Retired War Room link

**Route:** `/league/:id/war-room` · **Priority:** P1

Keep old links useful without reviving a duplicate hub.

- **Composition:** Immediate replace-navigation to current league hub; compact loading fallback only if navigation has not completed.
- **Primary action:** Continue to Matchday brief.
- **Expert information:** Preserve league ID and valid return context; no stale parallel dashboard.
- **Art:** Reuse hub loading identity only.
- **Narrow layout:** Same current shell destination; no separate mobile presentation.
- **Input target:** Focus current hub heading after redirect; browser Back must not loop.
- **States and restrictions:** Missing league ID or inaccessible league follows normal not-found/access state.
- **Acceptance:** Route remains a redirect; no redesign work or new interactions in retired war-room.tsx.

### Page not found

**Route:** App.tsx catch-all (no explicit path) · **Priority:** P1

Recover from an invalid URL without losing the player.

- **Composition:** Simple game-shell recovery panel with safe current-league return when known and dynasty library alternative.
- **Primary action:** Return to accessible hub or dynasty selection.
- **Expert information:** Requested destination can be described safely; no raw stack trace or sensitive route tokens.
- **Art:** Unlit stadium sign and solid route icon; concise friendly copy.
- **Narrow layout:** Centered panel with readable actions and top menu.
- **Input target:** Keyboard focus heading then recovery action; intended controller confirm/back.
- **States and restrictions:** Unknown route, deleted resource, inaccessible league and stale deep link.
- **Acceptance:** No endless reload or fabricated success; destination is accessible and does not expose another league.

## Tabs, panels and overlays

These reuse the parent screen's role/mode contracts. Keyboard focus stays visible; Escape returns to the invoking control. Controller equivalence remains a future test requirement. A panel may become a full-screen workspace on narrow displays, but does not create a new footer navigation system.

### League detail — Standings

**Parent route:** `/league/:id`

Compare the pennant race.

- **Composition and action:** One conference-selectable ledger with rank, team, record and existing tiebreak context; selected team summary at right. Primary: Open selected team.
- **Information and art:** Record, games back and existing supported tie/qualification information; pending reported games excluded from official totals. Conference monograms; no decorative hero.
- **Narrow layout:** Conference selector plus essential columns and row inspector.
- **States:** No games, tied records, incomplete reported results.
- **Acceptance:** Table totals reconcile with confirmed schedule results; tiebreak unknowns are not invented.

### League detail — Teams and comparison

**Parent route:** `/league/:id`

Find and compare programs.

- **Composition and action:** Dense monogram directory with selected school inspector; comparison opens two equal-width dossiers. Primary: Compare two teams.
- **Information and art:** Existing roster strength, facilities/prestige, coach and team record. Matching monogram sizes and paired cel coaches.
- **Narrow layout:** Directory to profile; comparison by metric groups.
- **States:** Missing team, no coach, incomplete comparison selection.
- **Acceptance:** Exactly two labeled teams and matching metric periods; no unsupported composite score.

### League detail — Rankings

**Parent route:** `/league/:id`

Explain current rankings and movement.

- **Composition and action:** Ranked ledger with last/current movement, selected program context and week label. Primary: Inspect ranked program.
- **Information and art:** Existing rank, prior rank and calculated data where exposed. Small monograms; gold reserved for top achievement.
- **Narrow layout:** Essential rank/team/movement list.
- **States:** Preseason, new entrant, no previous ranking.
- **Acceptance:** Movement reflects matching published snapshots; absent prior ranking is labeled new.

### League detail — Prospects

**Parent route:** `/league/:id`

Browse the available prospect landscape.

- **Composition and action:** Prospect manifest with existing combined/group view controls and selected athlete dossier. Primary: Open recruit profile.
- **Information and art:** Only authorized prospect ratings, position and identity; scouting uncertainty retained. Cel selected prospect.
- **Narrow layout:** List/detail drill-down.
- **States:** No prospects, unscouted, class unavailable.
- **Acceptance:** Private traits never appear in summary or sort labels.

### League detail — Awards

**Parent route:** `/league/:id`

Celebrate actual award recipients.

- **Composition and action:** A compact award cabinet: league and conference awards, All-American/All-Freshman and postseason panels with recipient lists. Primary: Inspect award recipient.
- **Information and art:** Actual MVP, pitcher/freshman awards, conference and CWS honors where available. One featured recipient portrait; remaining awards use consistent brass silhouettes.
- **Narrow layout:** Award-group selector and recipient list.
- **States:** Not awarded yet, no eligible recipient, missing historic player.
- **Acceptance:** Unresolved awards remain pending, not blank winner cards or fabricated recipients.

### League detail — History

**Parent route:** `/league/:id`

Track league progress across years.

- **Composition and action:** Season timeline with championship and major factual milestones; deep history opens Archive. Primary: Open season archive.
- **Information and art:** Existing completed seasons and recorded outcomes. Yearbook cover thumbnails.
- **Narrow layout:** Paged season list.
- **States:** First season, incomplete archive.
- **Acceptance:** Every historical value labels season; current phase does not overwrite archived meaning.

### League detail — Edits

**Parent route:** `/league/:id`

Make authorized corrections visible.

- **Composition and action:** Compact chronological ledger of actual edits with actor/time and affected entity. Primary: Inspect changed record.
- **Information and art:** Existing edit provenance and authorized before/after detail. Solid edit glyph, neutral ledger.
- **Narrow layout:** Event list to detail.
- **States:** No edits, missing linked entity, restricted detail.
- **Acceptance:** Viewing logs never exposes hidden scouting or grants edit rights.

### Roster — Field, lineup and pitching

**Parent route:** `/league/:id/roster`

Arrange the team without drag-only interaction.

- **Composition and action:** Depth view uses a clean top-down diamond and selectable position slots; Lineup is nine numbered rows; Pitching shows actual rotation/role slots. Bench manifest and selected player inspector remain adjacent. Primary: Select player then assign to legal slot.
- **Information and art:** Position eligibility, batting order, FRI/SAT/SUN/MID and other supported pitching roles; incomplete/duplicate assignments clearly flagged. Flat miniature diamond, small cel tokens and readable position labels.
- **Narrow layout:** Choose Field / Lineup / Pitching at top; select slot opens eligible player list full-screen.
- **States:** Read-only opposing team, invalid position, incomplete lineup, saving and conflict.
- **Acceptance:** Mouse, keyboard and touch can assign without drag; role coverage and duplicate-player constraints match server rules.

### Roster — Development

**Parent route:** `/league/:id/roster`

Explain player progression rather than merely showing changed numbers.

- **Composition and action:** Compact before/after change ledger and selected athlete report; offseason summary first, individual detail second. Primary: Inspect player development.
- **Information and art:** Actual attribute deltas and existing reasons/season; show undisclosed data as unavailable. Cel portrait with restrained upward/downward markers; never color-only.
- **Narrow layout:** Player list then report, one metric group at a time.
- **States:** Development unavailable by role, no offseason report, unchanged player.
- **Acceptance:** Deltas use the same source and season; projections never present as achieved growth.

### Player profile and authorized edit

**Parent route:** `/league/:id/roster`

Inspect an athlete and act without losing roster context.

- **Composition and action:** Large sports profile inspector/modal with cel portrait, identity and metric chapters; Edit, captain or draft actions only when authorized. Primary: Inspect attributes or choose a permitted player action.
- **Information and art:** Info, attributes, common fields, abilities, pitches when applicable, captain/draft status and actual eligibility. Consistent sports profile; no tiny portrait floating in an oversized table cell.
- **Narrow layout:** Full-screen profile with top Back; roster selection retained.
- **States:** Missing portrait, own/opponent player, invalid action phase, save error.
- **Acceptance:** Closing restores selected row/focus; opponent profile has no mutation controls; edits revalidate permissions server-side.

### Recruit comparison and action preview

**Parent route:** `/league/:id/recruiting`

Make scarce recruiting resources comparable.

- **Composition and action:** Two or three prospects aligned by same attribute rows; separate action confirmation shows cost, remaining balance and limitations. Primary: Choose target or confirm a specific action.
- **Information and art:** Known traits, scouting certainty, interest, stage, roster fit and exact supported costs. Equal cel portraits with no implied premium on hidden traits.
- **Narrow layout:** Select comparison metric group; show one athlete plus pinned comparator values.
- **States:** Partial scouting, signed target, exhausted actions/NIL, stale data.
- **Acceptance:** Unknown remains unknown in comparisons; confirmation is bound to the selected target and action, not a stale row.

### Recruiting filters, visits and action history

**Parent route:** `/league/:id/recruiting`

Find targets and understand why their state changed.

- **Composition and action:** Filter drawer from top/side with clear active-filter count; visit planner and action log as separate inspector modes, not overflowing carousel tiles. Primary: Apply filters or select a permitted visit/action.
- **Information and art:** Existing search, position, stars/status and scouting filters; visit capacity and timestamped action history. Solid filter/visit glyphs and restrained status chips.
- **Narrow layout:** Full-screen filter or planner panel with top Apply/Reset.
- **States:** No matches, all slots full, phase lock, empty action history.
- **Acceptance:** Reset visibly clears filters; closing a filter panel cannot spend an action; visit limits use server state.

### Pending report review and dispute

**Parent route:** `/league/:id/schedule`

Verify a submitted Power Pros score before making it official.

- **Composition and action:** Matchup scoreboard over Away / Home batting and pitching chapters; review status, submitter and validation summary beside explicit review decisions. Primary: Confirm report or open dispute reason as permitted.
- **Information and art:** Submitted score, innings, supported stat lines, evidence/uncertainty and approval state. Neutral scorebook; brass only for selected tab, not unconfirmed winner.
- **Narrow layout:** One team/stat group; review summary always accessible via top tab.
- **States:** Own submission, opposing reviewer, commissioner override permissions, stale report, duplicate action and unresolved dispute.
- **Acceptance:** Confirmation binds to current report version; disputed/pending status remains distinct from final result.

### Box score and game recap

**Parent route:** `/league/:id/schedule`

Explain a finished game without faking unavailable play data.

- **Composition and action:** Scoreboard, line score and Away / Home stat panels; Recap separate tab with actual provenance. Primary: Inspect performance or return to selected fixture.
- **Information and art:** Confirmed score and supported box score/recap fields; imported missing fields shown unavailable. School monograms, cel featured athlete if supported by real performance.
- **Narrow layout:** Stat presets and full-width selected team; no clipped horizontal rails.
- **States:** Simulated versus reported result, partial imported stats, recap unavailable.
- **Acceptance:** No fabricated pitch-by-pitch sequence; unavailable stats are not populated with zeros to complete layout.

### Retention, declaration and finalization

**Parent route:** `/league/:id/departures`

Make irreversible roster decisions deliberate.

- **Composition and action:** Centered consequence sheet naming athlete(s), decision, eligible cost and projected roster impact; neutral cancel first. Primary: Confirm the explicitly reviewed decision.
- **Information and art:** Current retention/declaration rules and actual affected players; distinction between forecast and finalized change. Player portrait beside clear textual consequence, not a celebratory cutscene.
- **Narrow layout:** Readable full-screen decision panel with top close and explicit action.
- **States:** Stale eligibility, insufficient budget, already finalized, rejected request.
- **Acceptance:** No automatic confirmation on opening; double activation does not duplicate action; rejection preserves decision context.

### Walk-on auction results

**Parent route:** `/league/:id/walkons`

Explain who joined and why other bids did not succeed.

- **Composition and action:** Signed and Outbid sections with player rows, bid outcomes and updated roster capacity; each result links to profile. Primary: Inspect signed player or return to roster.
- **Information and art:** Actual auction outcomes and available cost/result details; no invented winning rival bid. Signed arrivals use sports-profile framing; outbid rows neutral.
- **Narrow layout:** Two top sections and selected result detail.
- **States:** No bids, partial results, no wins, missing player.
- **Acceptance:** No celebratory modal claims a player joined without confirmed roster state.

### Commissioner — Command center

**Parent route:** `/league/:id/commissioner`

Prioritize league operations.

- **Composition and action:** Readiness ledger, missing reports and actionable preflight blockers; no decorative KPI wall. Primary: Resolve highest-priority blocker.
- **Information and art:** Actual human/CPU coaches, ready state, report state and advance operation status. Small coach portraits and monograms.
- **Narrow layout:** Blocker queue with full detail.
- **States:** Waiting, inactive coach, stale presence and recovery required.
- **Acceptance:** Presence is not readiness; blocked advance cannot appear available through another tab.

### Commissioner — Actions and recovery

**Parent route:** `/league/:id/commissioner`

Execute deliberate league mutations.

- **Composition and action:** Action catalog grouped by normal progression, correction and recovery; selected action opens consequence/preflight panel. Primary: Run one reviewed permitted operation.
- **Information and art:** Mode, phase/week, operation identity/status, impacted entities and server preflight. Solid action icons; warning accent only for material consequences.
- **Narrow layout:** Action list to full review panel.
- **States:** Unauthorized, running operation, interrupted checkpoint, invalid phase, failed preflight.
- **Acceptance:** Never describe force/retry as safe without real server support; preserve audit trail and confirmed outcome.

### Commissioner — Settings

**Parent route:** `/league/:id/commissioner`

Configure league behavior with clear current values.

- **Composition and action:** Category list and focused settings form; saved configuration summary and dirty-state review. Primary: Save permitted changes.
- **Information and art:** Actual configurable mode/rules/deadlines and role transfer controls where available; immutable settings labeled. Minimal office stationery.
- **Narrow layout:** One category at a time; save top command.
- **States:** Role change, phase locks, invalid input, unsaved draft and stale settings.
- **Acceptance:** UI explains which changes take effect now versus future periods only when backed by actual behavior.

### Commissioner — Audit

**Parent route:** `/league/:id/commissioner`

Make changes and disputed operations traceable.

- **Composition and action:** Filterable event ledger with selected evidence pane; identifiers copyable without exposing secrets. Primary: Inspect event or affected record.
- **Information and art:** Actor, time, operation/category and authorized evidence fields; preserve server ordering. High-contrast text ledger.
- **Narrow layout:** Event list and evidence panel.
- **States:** No events, missing actor, restricted evidence.
- **Acceptance:** Log never shows credentials or fabricated before/after values; local previews are labeled synthetic.

### Commissioner — Invitations

**Parent route:** `/league/:id/commissioner`

Manage who can join the league.

- **Composition and action:** Invitation list with active/revoked status and explicit create/copy/revoke commands; coach assignment separate. Primary: Create or manage authorized invitation.
- **Information and art:** Existing code validity, usage and role/seat controls only. Club invitation icon.
- **Narrow layout:** List and selected invite actions.
- **States:** Permission lost, expired/revoked token, unavailable link and copy failure.
- **Acceptance:** Invitation tokens are never included in unrelated exports or visual diagnostics; revocation requires explicit action.

### Commissioner — Reported results

**Parent route:** `/league/:id/commissioner`

Resolve companion result exceptions.

- **Composition and action:** Queue of pending/disputed reports with selected scorebook evidence and decision panel. Primary: Review or resolve report under actual policy.
- **Information and art:** Game, submitter, current revision/status and validation/dispute details. Neutral scoreboard.
- **Narrow layout:** Queue then full report review.
- **States:** Simulation mode hides irrelevant queue; unresolved/stale/rejected report.
- **Acceptance:** Only current authorized report can be acted on; resolution never silently changes unrelated games.

### Commissioner — NIL

**Parent route:** `/league/:id/commissioner`

Inspect and correct financial state without obscuring obligations.

- **Composition and action:** Team budget ledger with selected team's allocation/spend detail and guarded edit controls. Primary: Inspect balance or apply authorized adjustment.
- **Information and art:** Actual allocation, spent/recruiting obligations and available amount; label any incomplete ledger. Brass currency glyph with tabular numbers.
- **Narrow layout:** Team list then budget detail.
- **States:** Read-only observer, invalid amount, concurrent spending and correction failure.
- **Acceptance:** Labels distinguish budget from uncommitted funds; no fabricated ledger reconstruction.

### Commissioner — Schedule health

**Parent route:** `/league/:id/commissioner`

Locate competition structure problems before progression.

- **Composition and action:** Overview / Teams / Weeks / Human views; diagnostics grouped by severity with direct fixture links. Primary: Inspect a failing check or permitted repair.
- **Information and art:** Existing balance, coverage, week and human-matchup metrics. Calendar and diamond silhouettes.
- **Narrow layout:** View selector then diagnostic list.
- **States:** No schedule, incomplete setup, warnings versus blockers.
- **Acceptance:** Each diagnostic explains actual evidence and scope; UI does not invent a Power Pros scheduling rule.

### Commissioner — League editor

**Parent route:** `/league/:id/commissioner`

Correct league structure while keeping scope explicit.

- **Composition and action:** Schools / Players / Changelog form a record list plus focused inspector; player identity, attributes and appearance are separated; reversals in changelog use explicit reason and consequence review. Primary: Save authorized entity correction.
- **Information and art:** Actual editable league entities, IDs/names and validation constraints. Small monogram preview.
- **Narrow layout:** Entity list then form.
- **States:** Permissions, missing entity, invalid edits, dirty state.
- **Acceptance:** Do not add unsupported bulk edit; correction identifies exact league and entity before save.

### Commissioner — Save states

**Parent route:** `/league/:id/commissioner`

Inspect recovery points with honest restore consequences.

- **Composition and action:** Snapshot list with created time, phase/week and scope; restore preview names changes and affected league. Primary: Create or restore only when actually supported and authorized.
- **Information and art:** Existing snapshot metadata and actual recovery restrictions. Archive-box icon and timestamp ledger.
- **Narrow layout:** Snapshot list then full restore review.
- **States:** Unavailable role/mode, absent snapshots, incompatible version, running operation and restore failure.
- **Acceptance:** Never label a snapshot a backup guarantee without verified coverage; restore remains guarded and audited.

### Advance progress and failure

**Parent route:** `/league/:id`

Explain a league transition without blocking safe navigation unnecessarily.

- **Composition and action:** Compact stage status panel with actual checkpoint and operation status; interrupted state expands recovery guidance. Primary: Wait for confirmed completion or open authorized recovery.
- **Information and art:** Real phase/week, completed stage and failure state; no time-based fake completion. Minimal broadcast progress treatment; static reduced-motion variant.
- **Narrow layout:** Top status panel with expandable detail.
- **States:** Already running, stale client, ownership lost, partial interruption and successful completion.
- **Acceptance:** Client cannot claim complete solely because animation reaches end; retry does not imply all stages are exactly-once.

### Season recap and program scrapbook

**Parent route:** `/league/:id`

Preserve a season's actual achievements.

- **Composition and action:** Yearbook cover and chapters for final record, awards, departures and arrivals; existing recap remains supported while proposed scrapbook export is dependency-gated. Primary: Review season or open historical record.
- **Information and art:** Confirmed season results and authorized class/roster information only. Approved Varsity Club yearbook treatment; arrival scrapbook remains proposed.
- **Narrow layout:** One chapter and clear top season label.
- **States:** First season, incomplete season, missing source, export unavailable.
- **Acceptance:** Shared keepsakes exclude private scouting/account data; export is not claimed implemented until file/share QA passes.

### Game menu, audio and system states

**Parent route:** `/league/:id`

Provide reliable navigation and recovery without mobile website chrome.

- **Composition and action:** Desktop left command rail and top league/season/status band; narrower view uses a top Menu opening a grouped full-screen command panel. Audio/preferences live inside named top controls. Primary: Navigate to a named game area or resume current screen.
- **Information and art:** Current location, network/save status, audio/motion settings supported by the game; future input help explicitly staged. Forest surfaces, brass focus and solid silhouettes with text labels.
- **Narrow layout:** No bottom navigation at any breakpoint; one current workspace with a top menu.
- **States:** Keyboard Escape closes menu and restores focus; controller menu/focus maps require real later implementation.
- **Acceptance:** Offline, query error, route loading, app error, no access and missing resource.

### File save, share, overwrite and unsaved changes

**Parent route:** `/manage-recruiting`

Protect authored roster/class work.

- **Composition and action:** Small file action panel naming source and destination; replace/delete consequences separated from ordinary Save. Primary: Save file or resolve unsaved draft explicitly.
- **Information and art:** File name, type, destination and changed/saved state; share visibility as actually implemented. Club file-card typography.
- **Narrow layout:** Full readable panel without nested scrollbars.
- **States:** Invalid name, duplicate file, unsaved changes, missing permission, expired share and failed save.
- **Acceptance:** Cancel leaves draft intact; Save as cannot silently replace another file or load it into a league.

## Review and release gates

A screen is ready for design acceptance when its purpose, next action, selected object and current state are clear without explanation. A screen is ready for implementation acceptance only after the matching real response shapes, permissions, errors and mutations are exercised with synthetic data. A screen is not fun merely because it passes an automated test; later human play sessions must evaluate decision clarity, repetition, baseball comprehension and attachment to players.

For every rebuilt screen capture at least a populated desktop view, narrow view and meaningful non-happy-path state. Include keyboard navigation, increased text size, reduced motion, absent art and slow/offline response. Check all data remains reachable after scrollbar suppression. Validate shared modes using separate simulated and reported-result fixtures. Inspect public/share outputs for private traits and account details. Record deficiencies rather than treating missing functionality as decorative placeholder content.

The canonical source of per-screen detail is [screen-designs.json](screen-designs.json). Route counts must be rechecked whenever App.tsx changes. This document records the design proposal and delivery criteria; it does not close platform, persistence, gameplay-balance or human-enjoyment findings.
