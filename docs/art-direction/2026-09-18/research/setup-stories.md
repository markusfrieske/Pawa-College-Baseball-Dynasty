# PAWA setup, history and stories: distinct screen research

**Status: proposed research, September 18, 2026.** This is an input to Frisk's manual development process, not approval to change production. It covers 29 existing screen IDs. The complete per-screen contract is [setup-stories.json](setup-stories.json). No existing playbook or game code was changed.

## The blunt diagnosis

The old plan describes 80 destinations but too often falls back to the same underlying arrangement: a list, selected item, right inspector and decorative header. Different nouns are not different screens. A season archive, login form, league news issue and awards ceremony cannot earn their identity by changing the title of that arrangement.

The repeated inspector also imposes a tax: information becomes too narrow, the user must select something before seeing its purpose, and phone users inherit a pile of detached sections. Expert density means useful comparisons and fewer unnecessary decisions. It does not mean placing three unrelated information zones on every page.

There is another avoidable problem: history, records, archive, news, ticker, inbox and storylines can all become competing portals to the same events. Their job boundaries must be explicit:

| Destination | Exclusive job | Dominant composition |
| --- | --- | --- |
| History | Find a completed year | Season index |
| Archive | Inspect a year and its retained evidence | Season almanac |
| Records | Look up an achievement and its holder | Record almanac |
| Statistics | Compare measured performance | Leaderboard |
| Digest | Read the week's edited account | Weekly frontpage |
| Ticker | Scan factual activity in order | Activity wire |
| Inbox | Read personal correspondence and act | Queue plus reading sheet |
| Storylines | Make a supported narrative choice | Focused story scene |
| Awards | Celebrate named, confirmed recipients | Honors cabinet |
| Season recap | Experience the completed season as a whole | Season annual |

These are original PAWA proposals. They are not claims that the referenced games implement these exact layouts.

## Primary research and boundaries

Five primary sources were searched and opened. Evidence is the official text and accompanying image descriptions. No commercial game was launched, and no playthrough or usability test is claimed. Older named editions are intentional design references, not claims about the latest release.

### setup-ootp-creation

[OOTP official wiki — Creating Games](https://wiki.ootpdevelopments.com/index.php?title=OOTP_Baseball:Creating_Games)

**Observed/documented:** The official manual separates standard, custom, historical, advanced and quick-start creation paths. It describes a wizard for custom setup and identifies advanced mode as a separate route.

**PAWA inference:** make the mode decision explicit, then expose only the settings relevant to that mode; end on a review sheet.

**Do not borrow:** Do not import OOTP's MLB modes, historical database or automatic management systems into PAWA.

Evidence: Official manual text opened 2026-09-18; documented workflow, not a hands-on test.

### setup-fm26-ui

[Football Manager 26 — Reimagined User Interface](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface)

**Observed/documented:** FM describes a Portal combining home and inbox, task/unread filters, an action panel, grouped top navigation, and bookmarks. Tiles open more detailed cards. The article says readability and platform-specific screens shaped the redesign.

**PAWA inference:** separate actionable messages from unread messages; reveal secondary detail on demand; give the game menu named destination groups.

**Do not borrow:** Do not copy the universal tile system. PAWA needs distinct page composition rather than the same cards everywhere.

Evidence: Official developer feature text opened 2026-09-18; claims describe design intent, not proof of usability.

### setup-ootp-history

[OOTP official wiki — History Index](https://wiki.ootpdevelopments.com/index.php?title=OOTP_Baseball:Screens_and_Menus/Game_Menu/History_Index)

**Observed/documented:** The history index begins with seasons and finalists, emphasizes the champion, and links years to team history. Separate destinations cover players, teams, managers, leaderboards, awards and accomplishments.

**PAWA inference:** use stable year/category coordinates and evidence links so archive exploration cannot be confused with the live league.

**Do not borrow:** Do not copy the full nested link hierarchy or assume historical information exists when PAWA snapshots lack it.

Evidence: Official manual text opened 2026-09-18; information architecture evidence, not a current in-game screenshot audit.

### setup-2k25-mynba

[NBA 2K25 — MyNBA and MyGM Courtside Report](https://nba.2k.com/2k25/courtside-report/mynba/)

**Observed/documented:** 2K describes fewer, more consequential MyGM conversations; historical news presentation changes from newspaper to web formats and social feeds. The report also describes simplifying staff management.

**PAWA inference:** make weekly news an editorial issue, live activity a compact stream, and narrative decisions a focused scene. Different content deserves different reading rhythm.

**Do not borrow:** Do not add walkable offices, invented NPC conversations, era simulation or unsupported role-playing effects.

Evidence: Official developer report opened 2026-09-18; documented content and presentation patterns, not hands-on validation.

### setup-ea-cfb26

[EA College Football 26 — Dynasty and Team Builder Deep Dive](https://www.ea.com/games/ea-sports-college-football/college-football-26/news/cfb26-campus-huddle-dynasty-deep-dive)

**Observed/documented:** EA describes choosing an existing coach or creating one. Its Trophy Room records achievements with season, team, score or individual recipient context; selecting a trophy exposes more information.

**PAWA inference:** coach setup should foreground identity and supported tradeoffs; awards should present recipients with the actual season and achievement evidence.

**Do not borrow:** Do not borrow licensed marks, imply PAWA has EA's coach progression, or turn every statistical record into a trophy.

Evidence: Official developer article and accompanying image descriptions opened 2026-09-18; no game session or video playthrough.

An older OOTP sample leaderboard page failed text decoding; it was excluded from the evidence set. The official history manual above supplies the verified history structure instead.

## Streamlining decisions

1. **Entry should end quickly.** Title is an atmospheric door. Login is one form. Guest entry is a short consequence choice. Keep league navigation and performance statistics out of all three.
2. **Setup should narrow.** Mode comes first, then relevant competition/source configuration, then a named review. Coach creation deserves a media-day identity moment; competition selection deserves a ballot. Those are different decisions and should look different.
3. **Save selection is a library.** Stop giving a selected save a permanent inspector. A world should identify itself and expose Continue directly in its own entry.
4. **Readiness is a rollcall.** Lobby seats, missing sources and start blockers are operational facts. A large gathering illustration must not displace them.
5. **Progress is evidence.** Creation shows actual stages. A timed bar, fabricated ETA or metaphorical construction animation cannot certify that a league exists.
6. **Let data use the width.** Statistics, standings and published rankings get ledgers. Their columns differ because their questions differ. Opening detail is deliberate; an always-open portrait pane is not a requirement.
7. **Distinguish reference from reading.** Archive is a searchable year container; recap is a chaptered reading experience. Both use the same recorded facts, but they have different navigation rhythms.
8. **Do not promote every fact into a card.** News needs editorial hierarchy. Activity needs compact order. Inbox needs the selected message. Story choices need context before action.
9. **The menu is not the page.** A modest league/status band and top command menu can establish continuity while the content adopts its own layout. Keep the selected forest/brass palette, Sora/Inter and solid icons; stop mistaking a shared shell for shared composition.
10. **Retired routes do not need art direction.** War Room redirects. A missing route gets a short recovery decision. Designing elaborate alternatives would reintroduce navigation debt.

## Screen-by-screen production intent

### title — season-door

One campus vista fills the frame; a narrow vertical play menu sits in intentional empty sky/dugout space. Last accessible dynasty is a single subtitle under Continue.

Primary decision: Resume a specific dynasty or begin another journey.

Keep: Actual last accessible save; Mode and season under Continue; Visible New and Join alternatives.

Remove: Statistics dashboard; Equal-weight promotional tiles.

Interaction: Arrow keys and pointer choose menu items; Continue names its target before navigation.

Compact: Keep the vertical menu over a quiet solid-backed crop; account control stays at top.

What makes it distinct: An atmospheric entry with four destinations, not a working league dashboard.

Dependencies: Final campus key art; no animated environment or controller support implied.

### login — entry-form

A single compact credential sheet floats over a muted entrance crop. Show the intended league destination above the form.

Primary decision: Sign in and return to the intended destination.

Keep: Required labeled fields; Inline error and pending state; Preserved safe return destination.

Remove: League navigation; Account marketing and duplicate sign-in controls.

Interaction: Submit once; retain non-secret identity input on failure; route only after confirmed success.

Compact: Full-width form, visible Back, keyboard-safe spacing; no side panels.

What makes it distinct: A short authentication task rather than a game menu.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### register — identity-form

One linear registration sheet uses three visual bands: account identity, credentials, and creation consequence. Invite context remains a small header.

Primary decision: Create the account required to own the requested session.

Keep: Actual required fields; Password requirements near password; Invite destination context.

Remove: Coach appearance editor; Unimplemented provider sign-in promises.

Interaction: Validate beside fields; preserve valid entries after rejection; creation is a single named action.

Compact: One column with text labels; errors precede the submit action.

What makes it distinct: Account creation stays distinct from coach customization.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### guest — entry-consequence

A short guest pass contains the real persistence limitation followed by two stacked choices. Avoid a second onboarding funnel.

Primary decision: Enter as a guest with known limits or create an account.

Keep: Actual session limitations; Account alternative; Safe destination.

Remove: Legal-looking wall of copy; False permanent-save reassurance.

Interaction: The guest action begins one session request; warning remains visible while pending.

Compact: Two full-width labeled buttons below the consequence sentence.

What makes it distinct: A deliberate temporary-access fork; not another form.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### dashboard — save-library

One full-width list of dynasty spines: name, team mark, mode, current phase and last activity. The last played entry is taller; each entry owns its Continue action. Tools live behind a labeled library command.

Primary decision: Choose which world to resume.

Keep: Membership and accessibility; Phase/week and mode; Named Continue target.

Remove: Permanent right inspector; KPI cards copied from the active league.

Interaction: Choose a save directly; a contextual menu handles details/deletion separately from Continue.

Compact: Vertical save spines retain name, phase and primary action; no carousel.

What makes it distinct: A library of worlds with no need to open a generic inspector first.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### create — setup-wizard

A full-width step sequence shows Mode, Competition, Sources and Review. One task owns the center at a time; completed decisions become a collapsible summary ribbon.

Primary decision: Create the exact reviewed simulation or companion world.

Keep: Explicit simulated versus reported mode; Existing configurable rules and sources; Final configuration review.

Remove: Always-visible settings wall; Permanent summary side panel.

Interaction: Back preserves selections; choosing a mode reveals relevant supported fields; Create occurs only on the review step.

Compact: Single step with top Back/step label and readable next action, never four squeezed columns.

What makes it distinct: A narrowing decision sequence rather than a configurable dashboard.

Dependencies: Step draft persistence across reload requires implementation; do not promise it.

### team-selection — competition-board

Conference headings divide a full-width school ballot. Each row shows monogram, name, selected state and relevant eligibility. A top count explains required versus chosen teams.

Primary decision: Confirm a valid competition field.

Keep: Selection total and constraints; Conference membership; Explicit selected state.

Remove: Unbounded logo carousel; Selected-school biography inspector.

Interaction: Toggle eligible schools; constraint feedback names the blocking rule; confirmation reviews totals.

Compact: Conference selector plus checked rows; selected count remains above the list.

What makes it distinct: A multi-select competition ballot, not scouting or team comparison.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### coach-setup — media-day-creation

A large cel coach and selected school mark form a media-day backdrop; one focused foreground form progresses from school to identity to existing skill allocation.

Primary decision: Commit to the coach and school combination.

Keep: Claimed-school availability; Existing identity and skill budget; Final named coach-school pairing.

Remove: League statistics unrelated to selection; Cosmetic controls that imply unsupported bonuses.

Interaction: Preview permitted identity changes; claim/save only after confirming current availability and valid allocation.

Compact: Portrait becomes a compact header; each form stage uses full width.

What makes it distinct: Identity gets a character-creation moment rather than an admin record editor.

Dependencies: Production cel customization kit; no new archetypes, perks or appearance mechanics.

### dynasty-lobby — clubhouse-rollcall

A prominent league masthead leads into school/coach seat rows. A separate readiness strip summarizes class, schedule and assignments. The commissioner Start action follows its exact blockers.

Primary decision: Claim an available school or resolve the blocker preventing league start.

Keep: Human versus CPU labels; Current seat assignments; Server-backed readiness blockers.

Remove: Decorative scene above all useful content; Online presence treated as readiness.

Interaction: Selecting an open seat opens only its claim flow; start is role-aware and rechecks prerequisites.

Compact: Rollcall becomes stacked seat rows; readiness appears before the final start control.

What makes it distinct: A social readiness room with named occupants, not a general operations console.

Dependencies: Any presence display needs actual freshness data; no chat or synchronized avatar lobby.

### creation-progress — operation-receipt

A slim vertical stage timeline sits beside the reviewed creation name. Completed/current/failed stages have explicit text; the final successful state replaces progress with Enter dynasty.

Primary decision: Wait, enter the confirmed world, or follow the supported recovery path.

Keep: Actual stage and status; Reviewed configuration identity; Failure explanation.

Remove: Invented percentage or ETA; Campus construction implying real facility progression.

Interaction: Revisit the same operation identity after navigation; show retry only when supported.

Compact: One stage stack and one status action; details expand downward.

What makes it distinct: A receipt for one operation, not a loading dashboard.

Dependencies: Resumption/retry only if creation API supports it; no new recovery guarantee.

### invite — club-invitation

A single invitation letter names the league, intended role if known, and current account. Acceptance and account switching are distinct actions below the identity check.

Primary decision: Join this league as the displayed account.

Keep: League identity; Actual validity and membership state; Role/seat only when supplied.

Remove: Public roster browsing before access; Raw token displayed as decorative code.

Interaction: Accept once; preserve invitation context across sign-in; an existing member gets Open league.

Compact: One readable letter with actions below; no league navigation until authorized.

What makes it distinct: A membership decision, not a miniature league home.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### stats — leaderboard

A full-width statistical ledger gets a two-line control header: season/scope, then batting/pitching and metric preset. The leading row has restrained emphasis; player details open only on demand.

Primary decision: Which performance ranks highest under this scope and qualification?

Keep: Season and source coverage; Sortable supported metrics; Qualification sample and unknown values.

Remove: Always-open portrait inspector; Decorative KPI totals repeating table columns.

Interaction: Sorting changes the named order; choose a row for a full profile and return to the same sort/position.

Compact: Keep rank, athlete, selected metric and sample in view; switch metric groups instead of shrinking every column.

What makes it distinct: A comparison instrument that devotes nearly all width to aligned evidence.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### records — record-almanac

A category index opens a typeset record page: value and holder first, then tied holders, team/year and source link. Single-season and career scope sit above the record list.

Primary decision: Which achievement and holder should I inspect?

Keep: Record scope and category; Ties and qualification; Source season and holder.

Remove: Trophy cards for every number; Selected-player workspace framing.

Interaction: Open a record category, select the record, follow its archived evidence; Back retains category.

Compact: Category selector opens one record page with tied holders stacked.

What makes it distinct: An achievement reference book, distinct from sorting current-season statistics.

Dependencies: Do not infer all-time records from incomplete archives.

### archive — season-almanac

A visible year index leads to a season contents page. The selected year is stamped across the masthead; chapters open full-width historical tables or spreads.

Primary decision: Which completed season and chapter do I want to revisit?

Keep: Immutable season label; Snapshot completeness; Links to archived teams and fixtures.

Remove: Live action buttons; All chapters simultaneously in dashboard cards.

Interaction: Year first, chapter second; preserve both in navigation and clearly mark any link back to live data.

Compact: Year chooser and chapter list replace a permanent rail; one chapter owns the screen.

What makes it distinct: A historical container organized by year, not the live league page tinted sepia.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### archive-team — team-yearbook

A single team-season masthead leads into a historical roster register with chapter switches for recorded results and honors. The year remains beside the team name everywhere.

Primary decision: Inspect this team as it existed in that year.

Keep: Snapshot roster; Recorded results and honors; Explicit missing historical fields.

Remove: Current roster silently filling snapshot gaps; Editable player controls.

Interaction: Historical players open a read-only snapshot view; Live team is a separately labeled exit.

Compact: One register section at a time; each detail keeps team and year at top.

What makes it distinct: A frozen team volume rather than a live profile with an archive badge.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### digests — weekly-frontpage

One issue uses an editorial lead headline, compact result rail and two supporting columns of factual briefs. Required decisions appear in a clearly labeled box, not inside celebratory copy. Issue navigation is a top date chooser.

Primary decision: What materially changed this week, and what needs my attention?

Keep: Issue week and completeness; Links to recorded source events; Action-required distinction.

Remove: Permanent issue-list sidebar; Equal cards for every headline.

Interaction: Read the issue in priority order; open a source or task without marking it resolved merely by reading.

Compact: One-column newspaper order: lead, decisions, results, supporting briefs.

What makes it distinct: A curated weekly edition, unlike the raw ticker or personal inbox.

Dependencies: Editorial prioritization must use available events; no fabricated quotes or generated facts.

### ticker — activity-wire

A stationary chronological wire groups compact events by date/week. Category chips sit above the stream; new events collect behind a count button rather than moving existing rows.

Primary decision: Which recent event deserves inspection?

Keep: Timestamp or week; Event category and provenance; Stale/disconnected status.

Remove: Auto-scrolling marquee; Expanded permanent right inspector.

Interaction: Open event inline or follow its linked record; manually reveal newer items and retain reading position.

Compact: Single event column with filters in a named sheet; no sideways ticker.

What makes it distinct: A low-friction activity log rather than another editorial homepage.

Dependencies: New-event count requires supported polling/event updates; do not imply live sockets.

### inbox — decision-inbox

A narrow message queue shares the page with one full reading sheet. Two top filters independently distinguish unread from unresolved; any valid action lives at the end of the actual message.

Primary decision: Read or act on the selected coach message.

Keep: Sender/context and time; Separate read and resolved meaning; Actual archive/action capability.

Remove: Third category sidebar; Urgency badges without deadlines.

Interaction: Select message, read context, then follow its action. Archive remains a separate command and never resolves the underlying task.

Compact: Queue and reader become two screens; Back restores selection and filters.

What makes it distinct: A personal correspondence workflow; the only deliberate list-reader split in this group.

Dependencies: Unresolved filter requires reliable task-state linkage; otherwise keep supported categories.

### storylines — story-scene

One active arc opens as a story spread with a scene headline, factual context, participants and a small consequence timeline. Eligible choices/votes sit beneath the context. Intel and commissioner tools are separate chapters.

Primary decision: Choose a supported story action or vote with its known consequences.

Keep: Actual deadline and vote state; Unlocked information only; Recorded consequence history.

Remove: Simultaneous Vote/Intel/Command dashboard; Invented dialogue or implied hidden rewards.

Interaction: Read context before selecting a choice; confirmation names the option; expired/completed decisions become read-only history.

Compact: Context then choices then history; no side panel holding required information.

What makes it distinct: A focused narrative decision, not a news list with a vote widget.

Dependencies: New dialogue, branching outcomes or artwork require separate design approval; use existing story content.

### war-room — route-redirect

There is no new designed destination. Replace the retired route with its accessible league hub; only a brief fallback names the current destination.

Primary decision: Continue to the current Matchday brief.

Keep: Valid league context; Normal access checks; Safe fallback link.

Remove: Revived duplicate hub; Loading scene or new War Room branding.

Interaction: Replace navigation history so Back does not loop; failed access uses the normal recovery state.

Compact: Same redirect; no separate phone design.

What makes it distinct: A compatibility route deliberately receives no new screen.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### not-found — recovery

One calm recovery page names the problem in plain language, offers an accessible hub when known, and always offers Dynasty selection. A small neutral diamond illustration is optional.

Primary decision: Choose a safe known destination.

Keep: Accessible return destination; Distinct missing versus unavailable wording; Account context when relevant.

Remove: Raw route tokens or stack traces; Fake retry for permanently missing content.

Interaction: Use one destination action; retry appears only for recoverable loading/network errors, not arbitrary 404s.

Compact: Short text and two full-width actions; no decorative scrolling page.

What makes it distinct: Recovery is a plain decision surface, not a disabled version of the normal dashboard.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### league-standings — pennant-table

Conference groups form one aligned standings ledger. The user team has a subtle row marker; any supported qualification boundary is labeled in the table itself.

Primary decision: Where does the program stand in the official race?

Keep: Official record and games back where supported; Conference context; Known tiebreak explanation.

Remove: Permanent team summary sidebar; Invented playoff probability cards.

Interaction: Choose conference, inspect a team, return to the same standings position.

Compact: Team, W-L and supported rank/GB remain primary; additional columns use metric presets.

What makes it distinct: A race table aligned by teams, unlike individual stat leaders or ranking opinions.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### league-teams — program-atlas

A conference-organized directory of compact school nameplates fills the page. Selecting Compare opens a new two-program sheet with equal columns and matched metric periods.

Primary decision: Find a program or compare two named programs.

Keep: Conference and school identity; Existing comparable metrics; Clear two-team selection.

Remove: Always-visible single-team inspector; Composite power score invented for visual impact.

Interaction: Choose first and second program explicitly; compare is a separate route/state, with Swap and Clear.

Compact: Directory stays a list; comparison shows labeled A/B values per metric group.

What makes it distinct: A navigable program directory that changes composition only when comparison is requested.

Dependencies: Comparison state and return behavior need implementation; no new composite metric.

### league-rankings — poll-release

A dated ranking release leads with week and source, followed by current rank, prior rank and movement in one full-width ordered list. New entrants use text, not a false delta.

Primary decision: How did this published ranking change?

Keep: Published week/snapshot; Actual previous rank; New/unranked distinction.

Remove: Standings record presented as ranking authority; Unexplained decorative trend graphs.

Interaction: Switch published week only where snapshots exist; open the ranked program for context.

Compact: Rank, team and movement form one readable line with a secondary record line.

What makes it distinct: A published ordered snapshot rather than the competition standings table.

Dependencies: Historical ranking selection requires retained snapshots; absent methodology stays unexplained, not invented.

### league-awards — honors-cabinet

Award categories form restrained cabinet headings. One selected honor gets recipient portrait, award name and season; other recipients remain a compact roll of honor below.

Primary decision: Inspect the actual recipient and achievement.

Keep: Award category and season; Confirmed recipient; Pending and unavailable outcomes.

Remove: Empty winner silhouettes suggesting certainty; Trophies with no factual context.

Interaction: Select category or recipient; open the actual player/season evidence. Do not trigger celebration for unawarded honors.

Compact: Award selector plus one featured recipient and roll of honor.

What makes it distinct: An achievement ceremony surface distinct from record lookup or raw leaders.

Dependencies: Original award silhouette/portrait assets; avoid EA trophies and licensed designs.

### league-history — season-index

A chronological season ledger shows year, champion and the few retained major outcomes. The main interaction is selecting a year; rich reading happens in Archive.

Primary decision: Which season should I open?

Keep: Completed season identity; Recorded champion/outcome; Archive completeness indicator.

Remove: Second full archive implementation; Mini charts without consistent historical data.

Interaction: Select a year to open its archive, not a separate competing history dashboard.

Compact: Stacked season rows with champion and Open year.

What makes it distinct: A concise index into Archive; it is not an additional archival content system.

Dependencies: No new gameplay feature proposed; implementation still requires normal review and verification.

### league-edits — change-journal

Date groups contain factual edit entries with actor, affected record and correction summary. Opening an entry reveals authorized before/after values directly below it.

Primary decision: What changed, and which record is affected?

Keep: Actor/time when retained; Affected entity; Authorized provenance.

Remove: Generic league KPI header; Audit data exposed as social news.

Interaction: Expand one event inline or open its record; unavailable/restricted detail is labeled.

Compact: One event column; before and after stack with explicit labels.

What makes it distinct: A correction journal with precise provenance, separate from the public activity wire.

Dependencies: Do not reconstruct missing before/after values or expose private scouting through logs.

### season-recap — season-annual

A season cover names the final record and completed year. A deliberate reading sequence follows: results, actual honors, departing players and arrivals. Each chapter ends with its archive evidence link.

Primary decision: Review what the completed season meant and continue when ready.

Keep: Confirmed season/year; Actual achievements and roster events; Archive source links.

Remove: Permanent navigation inspector; Mandatory unskippable reveal sequence.

Interaction: Next/previous chapter and contents list remain available; Exit returns without advancing league state.

Compact: One chapter per view with a persistent year label and clear contents control.

What makes it distinct: An end-of-season reading experience, while Archive remains the searchable reference.

Dependencies: Scrapbook export, new generated narration and share layouts remain unapproved dependencies.

### system-shell — command-menu

The shell supplies a small league/season/status band, then yields most space to each page's own composition. A top Menu opens grouped text destinations over the paused interface; preferences are a separate sheet.

Primary decision: Navigate to a named area or resume the current task.

Keep: Current league/season/location; Visible keyboard focus and return; Supported network/save/preferences status.

Remove: Global workspace plus mandatory sidebar on every screen; Bottom tab bar or unexplained icon-only destinations.

Interaction: Open menu, choose group/destination, or Escape back to the exact invoking control; never discard dirty input silently.

Compact: A top Menu opens a full-screen named destination list; no bottom navigation.

What makes it distinct: The shell is a navigation layer, not the composition template for every screen.

Dependencies: Controller mapping, bookmarks, audio assets and persistent preference behavior require their own implementation/approval.

## Review gates before implementing this group

- Compare grayscale wireframes first. Title, setup, news, archive and awards must remain identifiable with their art and headings hidden.
- Present a task-driven prototype for one setup path and one historical lookup. Count decisions, unnecessary context switches and return-path failures.
- Use a fixed historical year and deliberately incomplete companion data. Missing lines remain unknown; pending reports cannot become records or awards.
- Show mobile compositions independently. A narrow desktop screen is not the acceptance target; labels, context and the next action must fit deliberately.
- Verify keyboard focus and return position. Controller behavior, audio and persistence are separate implementation commitments.
- Keep authentication, invitation validity, coach claims and progression truth in their existing authoritative flows. A new visual surface cannot bypass them.
- Use original PAWA assets. Reference game brands, trophy designs, licensed faces and exact interface artwork are not production assets.

The first manual build should pair structurally different screens: a setup wizard, weekly frontpage and record almanac. If those still look like the same workspace, stop and fix composition before producing the remaining screens.
