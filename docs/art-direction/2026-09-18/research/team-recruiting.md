# Team and recruiting research: distinct working screens

Research date: 2026-09-18. Scope: 15 Team & league / Recruiting & offseason screens plus eight relevant overlays, including league-prospects and departure-dialogs. The [JSON recommendations](team-recruiting.json) contain all 23 IDs and their complete proposals. This is research and design work only; no gameplay, rule, permission, controller or Steam implementation is implied.

## Critique of the first proposal

The rejected playbook correctly standardized color and type but over-standardized composition. A large title, three summaries, table and right inspector appeared to solve every problem. That erases the distinction between arranging nine players, assessing an unknown recruit, celebrating a signed class and confirming a departure. Those activities demand different amounts of data, different pacing and different spatial relationships.

The correction is to share **controls and visual language**, not one screen skeleton. A persistent inspector is valuable only when the decision requires simultaneous comparison. On the default roster it steals width from comparing players; make the manifest wide and open profiles deliberately. On a lineup screen, the relationship between field positions matters more than another sortable table. On a commits screen, recognition and belonging justify a portrait gallery. On a departure screen, the consequence comparison deserves the canvas.

The useful default is one question, one dominant surface, one next action. Matchday asks what needs doing; recruiting asks where the next scarce action goes; a scouting dossier asks whether the coach knows enough; a transfer shortlist asks whether an immediate vacancy can be filled. Those differences should be apparent even in grayscale wireframes with the page titles removed.

## Official evidence and its limits

These are primary developer documents opened and read, not hands-on tests or community claims. Historical references are explicitly versioned. Website headers sometimes adopt the current product branding while the body remains a 2022 FM23 article. No copied art, screenshots, logos or game assets are proposed for shipping.

### Football Manager 2023 — Recruitment Revamp (30 September 2022)

[Official source](https://www.footballmanager.com/features/recruitment-revamp)

**Observed documentation:** The official article describes role-based squad planning, future-season options, recruitment criteria and explicit scouting-completion states. The site's current FM26 chrome does not change the article's FM23 subject.

**PAWA inference:** separate role assignment, candidate search and knowledge evaluation into different working views.

**Do not copy:** import soccer positions, staff automation or multi-year planning mechanics that PAWA has not implemented.

**Evidence:** Official developer feature article opened and read; documented workflow, not hands-on usability evidence.

### Out of the Park Baseball 19 — Lineups manual

[Official source](https://manuals.ootpdevelopments.com/index.php?man=ootp19&page=lineups)

**Observed documentation:** The manual separates the available-player list, batting order and positional depth chart. It documents distinct lineup scenarios and filtering/view controls.

**PAWA inference:** batting order and field assignments need different spatial treatments; browsing ratings need not always show the lineup.

**Do not copy:** Copying OOTP's many nested panes, professional roster assumptions or unsupported platoon/DH scenarios.

**Evidence:** Official versioned manual opened and read; historical workflow reference, not a claim about current OOTP.

### EA SPORTS College Football 25 — Dynasty Deep Dive

[Official source](https://www.ea.com/security/news/college-football-25-dynasty-deep-dive)

**Observed documentation:** The developer article documents a recruit board with actionable status, a separate position-needs view, progressive scouting disclosure, staged recruiting and a school-strengths view. It describes finite weekly recruiting resources and coach abilities with prerequisites.

**PAWA inference:** expose the specific scarce resource beside the next action and make uncertainty, need and phase visible without repeating every detail.

**Do not copy:** transplant football scholarship counts, stages, attribute ranges, recruiting hours, coach rules or transfer guarantees into PAWA.

**Evidence:** Official producer/game-designer deep dive opened and read; documented interface/workflow. No game execution or independent enjoyment test.

### Football Manager 2023 — Dynamic Manager Timeline (30 September 2022)

[Official source](https://www.footballmanager.com/features/dynamic-manager-timeline)

**Observed documentation:** The official article describes chronological career moments with extra emphasis on major achievements and includes setbacks rather than only trophies.

**PAWA inference:** program, coach and rivalry history should use factual chronology; a completed class can become a keepsake rather than another management dashboard.

**Do not copy:** invent event significance scores, unsupported sharing or historical events that PAWA never stored.

**Evidence:** Official developer feature article opened and read; narrative-structure reference, not proof of PAWA archive completeness.

## Composition assignments

All choices in the table and JSON are proposed PAWA adaptations. Reference IDs identify the workflow that informed the reasoning; they do not mean the source game contains the exact proposed PAWA screen. Features such as new forecasts, algorithms, sharing and automatic spending remain outside this proposal.

| Screen ID | Composition | Primary decision | Remove first |
|---|---|---|---|
| hub | morning-brief | What must I do before this week can progress? | Permanent standings/rankings/data-card wall |
| roster | roster-manifest | Who can fill the role I need? | One card/table per position |
| team | diamond-board | Where is this team strong or exposed? | Full program-history wall on current-team overview |
| program | legacy-timeline | What story has this program earned? | Live roster editing controls |
| coach | coach-passport | What defines this coach, and which eligible improvement matters next? | Every badge repeated as a separate large card |
| identity | identity-playbook | Which existing philosophy should this program adopt? | Four simultaneously expanded feature-card grids |
| rivalries | rivalry-matchup | Which contest gives this rivalry its meaning? | Generic league-stat tiles |
| recruiting | recruiting-ledger | Where should the next recruiting action go? | Six equal-size Command Center cards |
| recruit-profile | scouting-dossier | Do I know enough to pursue this athlete? | All attributes, biography and competition visible at once |
| portal | portal-shortlist | Does this transfer solve an immediate roster vacancy? | High-school star-rating emphasis as default |
| commits | class-gallery | Who is joining, and which needs remain? | Recruiting spend action trays |
| arrival | arrival-stage | Whose arrival should I spotlight, and when do I return to the class? | Permanent stat dashboard behind ceremony |
| leaving | departure-register | Which programs are losing which players? | One large player card per departure |
| departures | decision-comparison | Is this eligible retention choice worth its actual cost? | League-wide departure browser beside every decision |
| walkons | auction-board | Which legal bid best fills a real vacancy? | Full profile cards for every bidder |
| roster-depth | diamond-board | Who belongs in this exact field, batting or pitching slot? | Full roster spreadsheet always above field |
| roster-development | development-ledger | What changed, and which player needs attention? | Speculative future growth meters |
| player-profile | scouting-dossier | What can this rostered athlete do, and what am I allowed to change? | Every possible mutation as a large primary button |
| recruit-compare | comparison-matrix | Which candidate is the better use of this specific resource? | Decorative oversized portraits |
| recruit-filters | filter-console | Which targets match my criteria, or which actual visit slot can I use? | Generic recap tiles inside filter panel |
| walkon-results | results-receipt | What actually happened to my bids? | Automatic triumph language when no bid succeeded |
| departure-dialogs | decision-comparison | Am I confirming the exact departure or retention action I intend? | Generic 'Are you sure?' with no consequence |
| league-prospects | recruiting-ledger | Which prospect should I investigate next? | Own-team resource meter on a league discovery screen |

## Concrete differences the next visual review must prove

- **Roster versus depth chart:** the roster is one full-width manifest; the depth chart is field slots, batting order or named pitching roles. Do not show a field diagram merely as a decoration beside a roster table.
- **Recruiting versus recruit profile:** the board uses an expandable row action tray for routine resource decisions. The profile is a dedicated scouting sheet with a portrait and explicit knowledge boundary. Opening the profile should be a meaningful change of pace.
- **Portal versus high-school recruiting:** transfers foreground origin, remaining eligibility, known ability and immediate vacancy. They must not be the same prospect board with a new title.
- **Commits versus arrival:** a class is a static contact sheet useful at any time; arrival is an optional beginning-to-end ceremony for confirmed signings. Neither belongs inside permanent management chrome.
- **Departures versus league leaving:** an individual's retention decision gets a consequence comparison. The league overview gets a category-count register with expandable names. The overview cannot pretend to predict unrecorded futures.
- **Program, coach and rivalry:** program history is an institutional yearbook; coach progression is a person-centered credential with distinct skills/career chapters; rivalry is an opposing-monogram match history. Do not repeat the same season-stat tiles in all three.
- **Walk-on bids versus results:** bidding is a resource-constrained transaction board. Results are a compact receipt. A lost bid must remain visible and understandable without a celebratory overlay.

## Streamlining contract

Default views should carry only the fields needed for their primary decision. OVR and star rating are different labels; hometown is profile context rather than a mandatory roster column. Deep details are one deliberate action away. Filters and selected rows survive entering and leaving a profile.

No footer menus or visible native scrollbar rails are part of the proposed game presentation. Reflow, named metric presets, explicit page/column controls and preserved wheel/touch/keyboard reachability must replace accidental clipping. Narrow layouts change the working arrangement instead of scaling every desktop pane down.

All proposals preserve actual PAWA rules and APIs. Source games are examples of clear information organization, not permission to import football recruiting hours, roster limits, new scouting ranges, speculative projections or unsupported baseball lineup modes. Real role/state/mode validation remains necessary. The Power Pros companion must retain externally played and reported-result semantics; no local lineup edit claims external-game synchronization.

Frisk's arrival recipe remains unapproved. Media-day illustration, miniature diamond staging, clubhouse signature audio, scrapbook/share output and precise ceremony timing require their own approval and implementation. This research does not turn proposed controller behavior or a browser mockup into Steam-ready software.

## Review test

The next atlas should show the roster, field assignment, recruit ledger, scouting dossier, class gallery, departure choice and coach/program history at the same size. Remove their headings temporarily: their purpose should still be distinguishable by information hierarchy and interaction. If all become three generic cards beside an inspector, the redesign has failed again.

Manual review should then answer one task on each composition with populated, empty and unavailable data. Automated route coverage alone cannot establish that a screen is understandable or enjoyable. A final production change still needs authenticated synthetic permissions and mutation tests, keyboard/text-scaling/overflow inspection, and human baseball-management play sessions.
