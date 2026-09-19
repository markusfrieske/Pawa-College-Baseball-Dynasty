# Class of Nine — PC team and recruiting screen direction

Research date: September 18, 2026. These are proposed screen briefs, not completed implementation or claims of playability. All 23 previous team/recruiting screen identifiers are preserved in `team.json`.

## Diagnosis

The current repeated rounded panels, web navigation rail, expandable rows and long document flow make management feel like visiting pages. Changing colors cannot fix that. A sports game composes a whole view around the current decision, with stable context, deliberate selection and a credible sporting scene. The roster, recruiting board, coach profile and lineup should be recognizably different even when every word is blurred.

## What the references actually show

### College Football 26 — Dynasty Hub / Marcus Freeman

[Source](https://drop-assets.ea.com/images/6vm4cGTcc50es0MAL1i008/f5732bd7946afa16ec16b87e2231b721/MarcusFreeman4.png)

**Observed:** Parent research agent directly viewed official 1920x1080 image: top dynasty/week context, horizontal categories, quarter-width actions, selected cream Play Game, oversized matchup scene, full-height coach on right, bottom input/status band.

**Evidence:** Official screenshot visually inspected by parent through browser; no game execution.

**Class of Nine inference:** Let the selected weekly decision own a baseball scene; use a small context HUD instead of a web sidebar.

### College Football 26 — ASU prospect list

[Source](https://drop-assets.ea.com/images/6SFdNjQrT1bFHVUXZR6yM3/7d14b85340c8c3d8e61408a00b874db8/ASURecruiting5.png)

**Observed:** Direct image inspection: 16:9 canvas, title and category tabs top-left; resource counters top-right; pinned positional-needs band above a roughly ten-row table; selected row cream; portrait, identity and dealbreaker panel on right; textured school-color perimeter.

**Evidence:** Official screenshot visually inspected in CUA on September 18, 2026; source image itself, not only caption.

**Class of Nine inference:** A baseball recruiting operations surface can reserve space for a selected target and needs without placing every action in every row.

### College Football 26 — Dynasty & Team Builder Deep Dive

[Source](https://www.ea.com/games/ea-sports-college-football/college-football-26/news/cfb26-campus-huddle-dynasty-deep-dive)

**Observed:** EA describes pinned team needs and board indicators intended to reduce view switching. Historical records have a dedicated destination.

**Evidence:** Official developer text read; workflow intent, not hands-on usability proof.

**Class of Nine inference:** Keep the decision's constraints in view. Separate active operations from institutional memory; import no football budgets or mechanics.

### Madden NFL 26 — Coach Central approval overview

[Source](https://drop-assets.ea.com/images/5x8ukJeBjIaKPNGPYTYZp/3726f1b7d310f8d64fc6d31d93a3cedd/APPROVALRATING.jpg)

**Observed:** Direct inspection: dark field environment fills the canvas; chapter tabs sit top-left; four staff entries occupy a scoped left selector; coach portrait/name leads center; selected approval metric dominates upper-right; restrained rules divide supporting data.

**Evidence:** Official screenshot visually inspected in CUA on September 18, 2026.

**Class of Nine inference:** Make coach identity physically present and give each chapter a focused surface; avoid repeating summary cards around an avatar.

### Madden NFL 26 — Franchise Deep Dive

[Source](https://www.ea.com/games/madden-nfl/madden-nfl-26/news/madden-26-gridiron-notes-franchise-deep-dive)

**Observed:** Developer text places overview, abilities and playsheets in Coach Central and describes separate weekly preparation choices.

**Evidence:** Official developer text read; no hands-on test.

**Class of Nine inference:** Use contextual chapters and explicit preparation state. Do not import coach approval, staff simulation or playsheets absent from Class of Nine.

### Retro Bowl — publisher Google Play season hub screenshot

[Source](https://play-lh.googleusercontent.com/FUOnDDnAcauy7egG6rISBqOiPEw6D41pxk_17WqkLaFSA6LWhBtNUkkysAFcO4ThW9WKYANDA5JCArzy541i%3Dw526-h296)

**Observed:** Publisher screenshot viewed directly: bounded landscape screen; week timeline across top; compact division standings and team condition below; clear Continue at bottom-right. Its bottom destination buttons are visible and intentionally rejected for this project.

**Evidence:** Publisher-provided Google Play screenshot visually inspected in CUA, September 18, 2026; original asset 526x296.

**Class of Nine inference:** Keep an immediately legible next step and whole-screen rhythm. Do not copy bottom navigation, pixel typography or simplified football stats.

### Retro Bowl — New Star Games

[Source](https://www.newstargames.com/retro-bowl)

**Observed:** Developer describes simple roster management alongside on-field play.

**Evidence:** Official developer description read; simplicity principle is our design inference, not a measured usability finding.

**Class of Nine inference:** Reduce the number of decisions competing on one screen while retaining baseball simulation depth in deliberate chapters.

## PC production principles

- Design each screen as a bounded game scene whose spatial hierarchy answers one decision, not a repeated web dashboard.
- Use 1920x1080 as composition target and validate 1366x768 and 2560x1440; no mobile layout or touch navigation.
- Use a stable small top game HUD and contextual horizontal chapters; persistent site sidebar and footer destinations are removed.
- Keyboard and mouse are primary. Controller mapping is a separate implementation task, never implied by a drawn glyph.
- Lists may scroll within a named pane with visible range, keyboard paging and subtle boundary cues; never hide overflow and strand content.
- Preserve Class of Nine C9 gateway, Georgia bold italic display typography, forest/brass/cream and original cel/campus art.
- Source screenshots demonstrate composition only; all proposed baseball consequences use existing authoritative rules.

## Three implementation priorities

### 1. Replace the app shell with a bounded PC game stage

One top context HUD, named contextual chapters, a viewport-owned scene and documented keyboard focus/back history. Remove footer destinations and the always-on website sidebar.

Acceptance: Hub, roster and recruiting each fit 1366x768 without document scroll and retain distinct composition.

### 2. Rebuild recruiting as selected-target operations

Pinned needs/resource line, stable candidate table and one selected prospect action surface. Eliminate row-expansion pages, preserve uncertainty and exact action costs.

Acceptance: A keyboard user can select, scout, inspect refreshed known data and return to same row; failed action preserves context; no private values leak.

### 3. Make roster, depth and profile visually baseball-specific

Roster comparison sheet, separate field/order/pitching canvases, and a true media-day player stage. Share tokens and controls, not layouts.

Acceptance: Eight roster rows and nine batting slots legible at768p; every assignment has non-drag path; both simulation and companion labels are truthful.

## Screen-specific briefs

### hub — Clubhouse command scene

A full-viewport clubhouse overlooks the miniature home diamond. A five-item weekly agenda overlays the left wall; selecting a task changes the central scene treatment. Next matchup is a broadcast plate across the lower center, not another card.

**Decision:** What is the next meaningful action this week?

**Spatial hierarchy:**

- Top 72px: Class of Nine gateway, team, season/week and mode
- Left 24%: ranked actual tasks with selected brass rule
- Center 51%: matchup or selected task's scene
- Right 25%: coach half-body and current readiness
- Lower scene: next/last game strip, not navigation

**PC interaction:** Up/Down moves agenda focus; Enter opens; Escape returns from a task to the same selection. Next week requires a separate explicit action.

**Art:** Original clubhouse and campus depth, cel coach, Georgia italic matchup title; subdued moving light only.

**Remove:** Remove permanent app sidebar, six-stat card grid, breadcrumb, page-sized welcome paragraph and repeated giant Continue buttons.

**Empty/error:** No next fixture displays phase-specific preparation. Failed readiness loads block advance and offer retry in the agenda.

**Acceptance:** At 1920x1080 and 1366x768 the next action and blocker fit without document scroll; simulated and reported modes show different supported actions.

**References:** cfb26-hub-image, retro-bowl-hub-image.

### roster — Clubhouse roster wall

A uniform dense roster sheet occupies three quarters of a locker-room wall; a selected athlete appears as a waist-up cel figure on the remaining quarter. Position chips are attached to the table header, not stacked cards.

**Decision:** Which player fills this role?

**Spatial hierarchy:**

- Top: team identity plus roster count
- Left 72%: 12–16 aligned rows in current metric view
- Right 28%: selected player's portrait, role and three relevant facts
- Above rows: position and Ratings/Batting/Pitching lens
- Bottom of sheet: row range and local controls

**PC interaction:** Arrow keys move selected row; click headers sorts; slash focuses search; Enter opens profile; Escape restores selected row. Wheel scrolls roster only.

**Art:** Dark locker scene behind a crisp cream/forest manifest, brass selection rail; player art is linked to selection.

**Remove:** Remove position section boxes, per-row Manage buttons, repeated card margins and persistent web sidebar.

**Empty/error:** Unknown stats print em dash with reason; empty filter offers Clear filters; failed roster load never displays zero players.

**Acceptance:** At least 12 comparable rows at 1080p and eight at 768p; no horizontal page overflow; ratings and performance never share unlabeled scale.

**References:** cfb26-recruit-image, retro-bowl-official.

### team — Diamond team tableau

The entire working canvas is a stylized home diamond with readable assigned-player nameplates at field positions. Batting-order rail belongs to the dugout edge; pitching staff is in a separate bullpen alcove.

**Decision:** Where is the team's current on-field weakness or vacancy?

**Spatial hierarchy:**

- Top: team record and actual next opponent
- Center 65%: nine labeled field assignments
- Left dugout: ordered batting names
- Right bullpen: named rotation/relief roles
- Upper-right: inspect versus edit permission

**PC interaction:** Click a position to illuminate eligible alternatives; arrows traverse logical baseball slots; Enter inspects. Assignment requires entering the edit state.

**Art:** Miniature stadium at low oblique angle, restrained depth; field labels stay flat screen-space for legibility.

**Remove:** Remove roster table above the diamond, campus hero strip and generic strengths cards.

**Empty/error:** Unassigned slots remain visible; no fabricated starters. Failed lineup loads retain a retry marker instead of an empty projected team.

**Acceptance:** Every actual assigned slot readable at 1366x768; no portrait overlaps another position; opponent team cannot expose edit actions.

**References:** cfb26-hub-image.

### program — Program heritage room

A full-screen trophy-room wall frames one selected season. Three archival objects—season plate, honors case, alumni photograph—are interactive destinations, with a horizontal year selector below the title.

**Decision:** Which earned season or achievement do I want to revisit?

**Spatial hierarchy:**

- Top: crest, school name and selected year
- Left 25%: season/year rail
- Center 50%: selected season's large editorial record
- Right 25%: verified honors and alumni caption
- Back wall: campus/heritage art

**PC interaction:** Left/Right changes year; Tab cycles archival objects; Enter opens evidence; Escape returns to the same year.

**Art:** Warm brass trophy-room lighting and original campus miniature; no invented trophies rendered as earned.

**Remove:** Remove profile dashboard cards, current recruiting meters and infinite milestone feed.

**Empty/error:** No archived seasons shows an unfilled display with Start your story copy; missing evidence labels unavailable.

**Acceptance:** Season changes update all facts together; latest roster cannot masquerade as historical alumni; only stored honors populate objects.

**References:** cfb26-dynasty-text, cfb26-hub-image.

### coach — Coach sideline portrait

A large standing coach anchors the left third over the dugout environment. Career, Skills and Strategy are chapter tabs; the right two thirds becomes a different surface for each, with skills arranged in actual prerequisite lanes.

**Decision:** What defines my coach and which eligible upgrade matters?

**Spatial hierarchy:**

- Top: coach name, team and chapter tabs
- Left 30%: full coach portrait and career identity
- Right 70%: one selected chapter
- Skills chapter header: actual points and prerequisite legend
- Context action beside selected skill

**PC interaction:** Q/E cycles chapters outside text fields; arrows move skill nodes; mouse hover or focus shows exact effect; purchase requires confirmation and persists selection.

**Art:** Cel coach at human scale, Georgian italic surname, thin brass skill links; career chapter uses a timeline instead of nodes.

**Remove:** Remove badge-card collage, public settings and large avatar inside a small rounded box.

**Empty/error:** Missing portrait uses an intentional silhouette; locked skill states reason and actual unmet requirement.

**Acceptance:** Read-only opposing coach has no private settings; prerequisite focus path and click path yield the same selection; no invented XP.

**References:** madden26-coach-image, madden26-franchise-text.

### identity — Strategy board

Four tabs printed on a dugout strategy board select offense, pitching, recruiting pitch or culture. The canvas shows current approach as a fixed left notation and highlighted candidate as the right tactical plate; the exact difference is between them.

**Decision:** Which existing philosophy should become active?

**Spatial hierarchy:**

- Top: four philosophy chapters
- Left 34%: current identity and its actual effects
- Right 46%: candidate and actual effects
- Center seam: explicit changed consequences
- Lower-right: Apply and Cancel local action

**PC interaction:** Left/Right changes candidate; Enter previews only; explicit Apply commits; Escape discards preview. Keyboard focus never silently saves.

**Art:** Original chalk/baseball markings and restrained pennant texture; philosophy diagrams illustrate supported rules only.

**Remove:** Remove four expanded card grids, generic dropdown forms and unexplained fit percentages.

**Empty/error:** Unavailable choices state phase/permission reason; save failure keeps candidate preview and current truth distinct.

**Acceptance:** Switching chapter cannot save; current and candidate are visually labeled; all tradeoffs match server rules.

**References:** madden26-franchise-text.

### rivalries — Rivalry broadcast poster

Two oversized opposing monograms face across a central series score. A selected historical game becomes the central broadcast headline; the actual next meeting sits as a small contrasting upcoming strip.

**Decision:** Which meeting defines this rivalry?

**Spatial hierarchy:**

- Top: rival selector and series name
- Left/right: opposing original monograms
- Center: series record and selected game score
- Lower center: chronological game markers
- Upper-right: next scheduled meeting

**PC interaction:** Left/Right steps meetings; Home jumps oldest and End newest; Enter opens a supported box score; rival dropdown remains keyboard accessible.

**Art:** Forest and opponent accent split scene with neutral brass seam; no borrowed team identities.

**Remove:** Remove generic league stats, fake rivalry heat meter and repeated result cards.

**Empty/error:** No played meetings means Series awaits its first game; no next meeting is explicitly unscheduled.

**Acceptance:** Played scores and upcoming fixture are visually distinct; chronology matches stored season/date; long team names fit at 768p.

**References:** cfb26-hub-image, cfb26-dynasty-text.

### recruiting — Recruiting operations board

A fixed-height scouting-room board gives roughly two thirds to an aligned target table and one third to the selected prospect's actionable scouting surface. Resources and positional need sit in a single header; selecting a row changes the dossier without expanding the table.

**Decision:** Which recruit deserves my next scarce action?

**Spatial hierarchy:**

- Top: needs strip plus contact/scout/NIL balances
- Left 66%: selected-row target table
- Right 34% upper: prospect face, identity and disclosed ability
- Right lower: ONE current action group and exact costs
- Table header: target pool, search and filter trigger

**PC interaction:** Arrow navigation updates selection without spending; Enter opens action group; space toggles target only through explicit button focus; slash search; Escape backs out of action. No global single-key spending.

**Art:** Scouting-room wall texture recedes behind clean table. Cream selected row, brass actions, unknown ratings remain neutral.

**Remove:** Remove giant expanded row trays, resource cards, page-long command disclosures and a shared dashboard inspector used everywhere.

**Empty/error:** No targets offers Find prospects; exhausted resource leaves costs and reset rule readable; errors preserve selected recruit and draft notes.

**Acceptance:** Ten readable rows plus selected action at 1080p; all spend controls fit 768p; selecting/scouting refreshes same selected ID; no hidden-rating sorting leak.

**References:** cfb26-recruit-image, cfb26-dynasty-text.

### recruit-profile — Scout's projection room

Recruit identity is a media-day half-body against a scouting-room backdrop on the left; the right is a large evaluation sheet with visible known/unknown separation. Scouting, Motivation and Recruitment replace the sheet rather than append below it.

**Decision:** What evidence is missing before I pursue this athlete?

**Spatial hierarchy:**

- Left 35%: portrait, name, public identity
- Top-right: chapter selector and scouting coverage
- Right 65%: chapter-specific evidence sheet
- Lower-right: phase-correct next action
- Upper-left: return to exact board selection

**PC interaction:** Q/E chapters, Escape board return; Compare pins through labeled control; unknown metrics are not focusable fake values.

**Art:** Original cel portrait, paper-like cream evaluation inset, brass rule and forest surroundings.

**Remove:** Remove stacked bio cards, simultaneous full attribute sections and gem/bust visual spoilers.

**Empty/error:** Unscouted areas explicitly say Not yet scouted; failed refresh retains last-known label with action retry.

**Acceptance:** Knowledge boundary identical in list/profile/compare; public recruiting stars never styled as scouted OVR; board selection restored.

**References:** cfb26-recruit-image.

### portal — Transfer deadline room

A transfer candidate table spans the left half, a selected vacancy/current player occupies a small upper-right diamond segment, and the candidate's eligibility/known ability fills lower-right. This is a replacement decision, not a high-school relationship wall.

**Decision:** Does this transfer resolve an actual vacancy?

**Spatial hierarchy:**

- Top: actual portal phase and roster space
- Left 55%: candidate list by position and eligibility
- Right upper: selected role and current occupant
- Right lower: candidate comparison and legal offer
- Above table: role filter

**PC interaction:** Select vacancy then candidate; arrows stay within active pane; Tab cycles panes; explicit offer opens terms; Escape cancels without resetting candidate.

**Art:** Cooler clubhouse transfer desk, school colors on origin label, no fake deadline countdown.

**Remove:** Remove high-school stars as dominant metric, full recruiting histories and repeating resource widgets.

**Empty/error:** Closed portal explains phase; no eligible candidates keeps chosen role and clears only candidate.

**Acceptance:** Current versus candidate rows align; remaining eligibility visible without opening profile; no invented transfer guarantee.

**References:** cfb26-recruit-image, cfb26-dynasty-text.

### commits — Class photograph wall

A bounded class contact sheet resembles a team media-day wall: equal player portraits in position groups, with a single selected portrait enlarged center-right. Status is printed as verbal or signed; this is a recognition screen.

**Decision:** Who is confirmed to join, and what is still unresolved?

**Spatial hierarchy:**

- Top: class year/team and verified counts
- Left 70%: evenly spaced class portrait sheet
- Right 30%: selected athlete caption and actual status
- Above contact sheet: position grouping
- Lower-right: inspect or approved spotlight eligibility

**PC interaction:** Arrows move by contact-sheet coordinates; Enter profile; year/team changes retain explicit scope; no automatic celebration.

**Art:** Cel yearbook portraits, forest matting, brass signed stamp and neutral verbal label.

**Remove:** Remove spend controls, dense acquisition ledger and repeated large biographies.

**Empty/error:** Empty class uses an unfilled team-photo arrangement with recruiting link; missing art uses consistent silhouette.

**Acceptance:** Every card prints status; verbal athletes cannot launch confirmed-arrival ceremony; class rank uses actual data only.

**References:** retro-bowl-official, cfb26-dynasty-text.

### arrival — Home-diamond spotlight

A dedicated scene takeover clears management UI. The athlete enters a miniature home-diamond gate; a nameplate resolves beside the media-day figure, then the final arrival sports profile settles into a keepsake composition.

**Decision:** Whose confirmed arrival do I spotlight, and when do I continue?

**Spatial hierarchy:**

- Full canvas: miniature home diamond
- Center-right: selected athlete half-body
- Center-left: nameplate then final profile
- Top-right: Skip, Mute, reduced-motion state
- After reveal: class selection contact strip

**PC interaction:** Escape/Skip immediately resolves final profile; Enter continues after readable state; class selection is deliberate; no timed forced input.

**Art:** Proposed Clubhouse Arrival with approved C9 gateway; original art only. Reveal recipe remains unapproved and no new sound is assumed.

**Remove:** Remove dashboard behind ceremony, random-pack rarity language and unskippable chained reveals.

**Empty/error:** Missing asset resolves to legible signed profile; no confirmed arrival shows class view instead.

**Acceptance:** Proposal only until Frisk approves reveal. Reduced motion shows final readable frame; signing cannot be created by animation.

**References:** cfb26-hub-image.

### leaving — League turnover board

A full-screen league matrix treats teams as rows and graduation/draft/portal as columns. Selecting a count turns the right quarter into a concise name list; the table stays at the same row.

**Decision:** Which programs lose which players?

**Spatial hierarchy:**

- Top: season and departure source legend
- Left 75%: teams by departure-category matrix
- Right 25%: selected cell's named athletes
- Header: team/category filters
- Lower table edge: row position indicator

**PC interaction:** Arrow keys traverse cells; Enter opens athlete list; Escape returns to selected cell; sort compares actual totals.

**Art:** Conference-office board with subtle school monograms and strong aligned numerals.

**Remove:** Remove individual athlete cards across the whole page and speculative roster forecasts.

**Empty/error:** Zero is distinct from unavailable; failed category query does not produce zeros.

**Acceptance:** Displayed count equals named entries or explicitly states incomplete source; every departure carries reason and source status.

**References:** cfb26-recruit-image, cfb26-dynasty-text.

### departures — Retention interview

One athlete sits at the visual center of a clubhouse conversation scene. A compact pending-case rail at left drives the scene; two legally available outcomes and their factual costs flank the player.

**Decision:** Is this allowed retention choice worth its cost?

**Spatial hierarchy:**

- Left 20%: pending case queue
- Center 40%: athlete portrait and departure reason
- Right 40%: retain/depart consequence comparison
- Top: phase and actual available resources
- Near choices: local confirm control

**PC interaction:** Up/Down selects case; Tab moves legal options; selection previews only; Enter on explicit confirmation commits; pending request locks case changes.

**Art:** Respectful cel portrait, quiet clubhouse scene, no manipulative red alarm or triumphant departure art.

**Remove:** Remove tiny destructive row buttons, league-wide browsing and generic confirmation overlays.

**Empty/error:** Ineligible case states why no choice exists; stale-server rejection refreshes facts while preserving case.

**Acceptance:** Finalized cases cannot resubmit; before/after figures use verified rules; irreversible scope named with athlete.

**References:** madden26-coach-image.

### walkons — Walk-on tryout board

A tryout-field backdrop carries a candidate sheet on the left and one selected athlete's bid ticket on the right. Capacity and committed resources form a slim scoreboard at top.

**Decision:** Which permitted bid fills a roster gap?

**Spatial hierarchy:**

- Top: roster capacity and available obligations
- Left 65%: compact tryout list
- Right upper: selected athlete and known role traits
- Right lower: bid amount and review terms
- Above sheet: role filter

**PC interaction:** Mouse or arrows select; numeric bid entry supports typing; Enter reviews rather than blindly spends; cuts require a separate explicit destination.

**Art:** Original practice-field miniature; cream bid ticket with brass total, neutral status labels.

**Remove:** Remove marketplace product cards, predicted winning price, cuts beside bids and giant numeric steppers.

**Empty/error:** Auction closed states phase; no capacity explains required roster action; failed bid retains amount.

**Acceptance:** Actual budget and pending obligations remain visible during bid entry; no automatic bid escalation or concealed cut action.

**References:** cfb26-recruit-image, retro-bowl-official.

### roster-depth — Dugout lineup canvas

Three purposeful modes occupy the same viewport: Field is a large nine-position diamond, Order is a tall nine-slot lineup card beside a bench, and Pitching is a rotation lane plus bullpen. No single table pretends to be all three.

**Decision:** Who belongs in this exact assignment?

**Spatial hierarchy:**

- Top: Field/Order/Pitching and save state
- Center 62%: selected baseball-specific surface
- Right 28%: eligible substitutes for active slot
- Left 10%: compact slot/order index
- Lower-right: review and save changes

**PC interaction:** Click slot then athlete; arrows traverse slots; explicit swap menu duplicates drag operations; Ctrl+Z only local unsaved changes if implemented, never implied by label.

**Art:** Readable stadium/dugout tactical geometry, original player mini-portraits, cream nameplates.

**Remove:** Remove roster spreadsheet above lineup, drag-only chips and per-position boxed tables.

**Empty/error:** Vacancies stay selectable; ineligible replacements explain reason; save failure preserves draft.

**Acceptance:** Duplicate/illegal assignment warnings before save; all nine batting slots fit 768p; reported mode says game-tracking lineup and never implies console synchronization.

**References:** cfb26-hub-image, cfb26-recruit-image.

### roster-development — Offseason film review

A before/after athlete comparison fills the right half while a ranked actual-change list occupies the left. The selected player's two recorded states sit on one horizontal metric baseline; no decorative potential forecast.

**Decision:** What actually changed this offseason?

**Spatial hierarchy:**

- Top: exact season and evidence source
- Left 42%: players sorted by recorded delta
- Right 58%: aligned before/after metric rows
- Upper-right: Hitting/Pitching/Common metric lens
- Lower-right: source explanation

**PC interaction:** Arrows compare consecutive players rapidly; metric shortcuts change view only; Enter opens player history and Escape restores selection.

**Art:** Training-ground background muted; brass for selected metric, text plus signed delta for change.

**Remove:** Remove future-growth meters, stacked change cards and unlabeled radar polygons.

**Empty/error:** No prior record says No baseline; missing value is not zero; failed history leaves a retry state.

**Acceptance:** Before and after use same scale and date labels; negative and zero deltas remain legible; no prediction inferred from potential.

**References:** cfb26-dynasty-text, madden26-coach-image.

### player-profile — Player media-day stage

A half-body player at left sits outside the data frame, with oversized surname and number. The right two thirds is a single chapter: Attributes, Season, Career or Role. Actions appear in a small authorized action menu.

**Decision:** What can this athlete do, and what permitted decision follows?

**Spatial hierarchy:**

- Left 32%: large cel athlete and identity
- Top-right: profile chapters
- Right 68%: chapter-specific metrics or record
- Lower-left: actual team/role and status
- Upper-right corner: authorized actions

**PC interaction:** Q/E chapter changes; Left/Right next roster player preserves chapter; Escape restores invoking roster row; actions require deliberate menu selection.

**Art:** Sports-profile photography composition translated to cel art; Georgia italic name, forest vignette, cream stat rules.

**Remove:** Remove avatar-in-card, biography wall and commissioner edit forms from public profile.

**Empty/error:** Missing portrait uses branded silhouette; absent career history is labeled; restricted actions absent rather than fake enabled.

**Acceptance:** Known attributes and recorded performance are clearly separate; opponent/private fields respect response permissions; no unsourced achievement badges.

**References:** madden26-coach-image, cfb26-recruit-image.

### recruit-compare — Draft-room comparison wall

Two or three equal-width athlete columns share one metric baseline and a quiet scouting-room background. Portraits are shallow top identifiers; a single selected metric row crosses all columns with disclosed knowledge state.

**Decision:** Which candidate is the better use of my specific resource?

**Spatial hierarchy:**

- Top: candidate identities and remove/replace controls
- Center: aligned metric rows across all candidates
- Left gutter: metric labels and knowledge legend
- Bottom: exact action cost and eligibility per candidate
- Top-right: metric lens

**PC interaction:** Arrows move metric row; Tab changes candidate; Enter opens only that candidate's action review; column replacement never spends.

**Art:** Minimal scene texture; cream column headings, thin brass active row; no arbitrary winner crown.

**Remove:** Remove unequal card heights, separate scroll containers and fabricated weighted fit scores.

**Empty/error:** Unknowns occupy same cell geometry as known metrics; removed candidate leaves Replace slot.

**Acceptance:** At least three candidates and eight metric rows readable at1080p; all columns scroll in lockstep; unknown values cannot determine winner styling.

**References:** cfb26-recruit-image.

### recruit-filters — Scouting criteria overlay

A centered command overlay over a dimmed board shows criteria as labeled rows, with live matching count and active conditions on the right. Visits and History are separate full working surfaces, not sections inside this form.

**Decision:** Which precise criteria define this search?

**Spatial hierarchy:**

- Overlay top: criteria title and result count
- Left 65%: Position/State/Class/Knowledge/Status controls
- Right 35%: active conditions and saved presets
- Lower-right: Apply and Reset
- Behind overlay: dimmed selected board row retained

**PC interaction:** Tab traverses labeled criteria; Enter Apply from button only; Escape discards pending changes; search accepts typing without global shortcuts.

**Art:** A clean cream scouting sheet over the forest scene; zero ornamental cards.

**Remove:** Remove search drawer full of recaps, mobile filter sheets and save-on-close ambiguity.

**Empty/error:** Invalid preset explains and offers reset; zero matches displays count before Apply; failed count says unavailable.

**Acceptance:** Escape preserves applied state; Apply returns to board with visible criteria; unknown NIL cannot leak through affordability filters.

**References:** cfb26-recruit-image.

### walkon-results — Signing receipt board

A large outcome headline is followed by one orderly signed/outbid ledger, with a selected successful athlete's small portrait at the edge. The verified spending total is the visual anchor, not confetti.

**Decision:** What happened to each bid and my roster?

**Spatial hierarchy:**

- Top: auction/season and actual outcome total
- Center 75%: signed and outbid ledger
- Right 25%: selected confirmed athlete
- Lower center: verified cost/capacity effects
- Lower-right: Return to roster

**PC interaction:** Arrows move outcomes; Enter profile for confirmed signing; Escape returns to relevant phase; no Replay purchase action.

**Art:** Class of Nine brass receipt stamp and calm club-office background.

**Remove:** Remove carousel hiding failed bids, blanket victory banner and rival-price speculation.

**Empty/error:** No wins states no successful bids; missing cost is unavailable rather than zero; unresolved auction is Pending.

**Acceptance:** Every submitted bid has an outcome or pending label; result selection cannot replay mutation; actual cost reconciles.

**References:** retro-bowl-hub-image.

### departure-dialogs — Final decision slate

A centered wide consequence slate pauses the dimmed retention scene. Exact athlete identity sits left, verified consequence list center, and two distinct actions at right; it never becomes a second profile page.

**Decision:** Am I confirming this exact irreversible decision?

**Spatial hierarchy:**

- Left 25%: affected player names
- Center 50%: exact consequence and cost
- Right 25%: Cancel then explicit named Confirm
- Top: current phase and action verb

**PC interaction:** Initial focus Cancel; Escape cancels; Enter only activates focused control; pending state prevents duplicate submission and close.

**Art:** Cream slate with forest type and brass rule; destructive state conveyed by text, not red alone.

**Remove:** Remove generic Are you sure, default destructive focus and nested modal stacks.

**Empty/error:** Stale state rejection refreshes consequences; uncertain response shows checking status rather than retrying blindly.

**Acceptance:** Confirmation names all affected players; resource version checked server-side; failed request retains readable evidence.

**References:** madden26-franchise-text.

### league-prospects — National scouting index

A league discovery sheet fills most of the screen, with a narrow original map or origin panel tied to the selected prospect. The search/index vocabulary differs from the own-team spending board; no actions consume resources here.

**Decision:** Which prospect merits deeper investigation?

**Spatial hierarchy:**

- Top: class/year and combined/group selector
- Left 78%: wide authorized prospect index
- Right 22%: selected origin and identity
- Table header: search and explicit sort criteria
- Lower sheet edge: result range

**PC interaction:** Type to search through focused field; arrows move selection; Enter opens dossier; Escape returns with sort and scroll. Map markers are navigational only.

**Art:** National scouting-room wall and subdued original geographic treatment; forest table, cream selected row.

**Remove:** Remove own-team resource HUD, routine spend controls and full biography per row.

**Empty/error:** No matches keeps query; missing hometown omits marker; failure never produces empty confirmed pool.

**Acceptance:** Public knowledge permissions identical across combined/group views; hidden ratings cannot sort; at least12 rows at1080p.

**References:** cfb26-recruit-image.

## Evidence boundary

No referenced game was executed. Direct official images were inspected through browser rendering; official articles supply workflow intent. Suggested layouts, input mappings, density targets and baseball applications are our original design inferences. These references are not authorization to reuse their logos, athlete likenesses, art or mechanics. Retro Bowl's footer destinations are expressly rejected for this PC design. The arrival concept remains unapproved. Human enjoyment must be judged by Frisk on real screen prototypes, separately from source review and automated checks.
