# Coaching room and arrival — September 19, 2026

Frisk requested a more dynamic Roster, Team and Recruiting experience, plus a special, shareable arrival reveal. This follow-up supersedes the atlas's composition recommendations for these four studies only. **Proposed, not approved or integrated gameplay.** Scheduled development stays paused.

Review `../coaching-lab.html` using `node scripts/preview-player-library.mjs`, which serves the existing approved portrait runtime as well as the design documents. The sample club, athletes, class, values, budgets and decisions are fictional. Nothing calls a game API or persists a save. Reload resets the proposal state. Portrait IDs are explicit and team color is independent.

## Reference evidence and original adaptations

| Reference | What was observed | Adaptation / limits |
| --- | --- | --- |
| [NBA 2K26 MyNBA official roster screenshot](https://assets.2k.com/1a6ngf98576c/4F2pH6zs5Tb3EVKTNnZdid/8e9926deb4df061c58acfd65bce38577/N26-ALL-MYNBA_ERAS_ALT-NA-STATIC-ENUS-NO_RATING-AGN-1920X1080-FINAL.jpg) | Prior September 18 direct visual study: prominent selected identity, continuous aligned roster, metric families and strong row selection. See experience.json for original evidence. | Preserve a dense ledger; add a pinned comparison and media-day identity rather than a page of position boxes. No basketball ratings or game art copied. |
| MLB The Show 25 franchise study | Existing GAMEDEV_GUIDE.md records direct official video observation at 1:50 (free-agent ledger) and 2:02 (separate decision scene). | Keep browsing and the consequential decision visually connected but distinct. This turn reuses the documented study, not a new hands-on session. |
| [FC 26 Career deep dive](https://www.ea.com/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive) / [official squad image](https://drop-assets.ea.com/images/1cRta3JSNJrmp3dM9pbjmN/d0f50d21f185b9484ca4aefbdffd4d8e/vlc_lFOQTGqLck.png) | Direct image inspection this turn: tactical vision, team management and team sheets are separate choices; field diagram leads the team-management tile. Official text describes accessing full stats from scouting reports in simulated leagues. | Team becomes a spatial diamond plus order and substitution preview. Scouting keeps evidence beside evaluation. We do not claim the screenshot demonstrates the interior lineup editor or import football fitness/morale mechanics. |
| [College Football 26 prospect board](https://drop-assets.ea.com/images/6SFdNjQrT1bFHVUXZR6yM3/7d14b85340c8c3d8e61408a00b874db8/ASURecruiting5.png) / [official recruiting guide](https://www.ea.com/games/ea-sports-college-football/college-football-26/tips-and-tricks-hub/dynasty-mode-recruiting-tips) | Prior direct image inspection: needs and resource context remain above an aligned prospect board, with selected target identity on the right. Current official guide describes new-pitch indicators, favorites and advanced filters. | A needs rail, portrait shortlist and persistent scouting report. Show knowledge and available resources before action. Demo one-action cost is an interaction fixture, not an imported economy or production balance decision. |
| [Eikan Nine 2026 official mode page](https://www.konami.com/pawa/2026-2027/mode/eikan) / [official new-member screen](https://www.konami.com/pawa/2026-2027/s/images/ss/md_eikan_21.jpg) | Directly inspected this turn: two-column incoming-member list, position/name colors, personality labels, school exterior and character presence. Appearance/name controls and remaining redraw count are visible. | Class-level identity and a school setting make intake an occasion. C9 uses an original cel ensemble and coach-chosen spotlight. No redraw mechanic, character designs, colors or UI assets copied. This still establishes no animation duration. |
| [Hakkyu No Kiseki official page](https://www.konami.com/games/prospi/2024-2025/) / [entrance-ceremony screenshot](https://www.konami.com/games/prospi/2024-2025/s/images/ss/ss_kiseki_13_pop.webp) | Directly inspected this turn: April 8 entrance ceremony header, school baseball ground behind a large framed player image, nameplate and dialogue about the new member's admired professional player. | Give one incoming player a field-side introduction and authored identity line before the full class. C9 copy derives from disclosed player data; no pro resemblance claim or borrowed real player likeness. The still does not prove a camera move, sound cue or sequence timing. |

The prior broad atlas covers Madden, NHL and Retro Bowl as well. Their general navigation principles remain useful; they are not substitutes for the specific observations above. Reference images are linked, not redistributed as game assets. No claim of hands-on reference-game testing.

## Proposed workflows

### Roster — comparison desk

First decision: which player fits the role? One aligned list, selectable metric lens, selected cel identity and pinned comparison markers. The mock supports choosing and pinning actual sample players, with computed differences. Avoid giant position containers and repeated profile popups. In production, retain existing scales, metric provenance, unknown values, eligibility and player IDs; this proposal's 0–100 values are illustrative, not a replacement rating model. Pitcher-specific metrics must use their own chapter before integration.

### Team — the diamond

First decision: who plays where? Diamond and batting order select the same role. Choose an eligible bench alternative, inspect deltas, apply or cancel. Mock uses one exact-position alternative for SS, CF and C; unsupported positions explain the absence. No player can occupy two spots. Batting order is a fictional no-DH fixture, not a league rule. Production requires actual eligibility/DH/two-way rules, separate pitching assignments, server validation, unsaved-draft protection, and real order reordering. Companion mode must say planning sheet and never imply control over the external game.

### Recruiting — the scouting room

First decision: which uncertainty is worth spending an action on? Needs filter the board, selecting a target owns the report, a local scouting action narrows explicitly labeled ranges and debits one sample action exactly once. Watchlist changes stay visible. Potential remains unknown. Production must use disclosed server estimates, actual costs and current balances. Never derive hidden ratings for the reveal, compare view or exported card. Retain large-board filters/search/paging even though this five-target study prioritizes the composition.

### Arrival — a program ritual

Recommended treatment, preserving Frisk's earlier unapproved arrival preferences:

1. **Campus:** home diamond at golden hour, gateway mark, year and incoming count. Hold until coach starts.
2. **Anticipation:** coach-selected first spotlight and a short introduction. No fabricated rarity tier or rating-based suspense.
3. **Spotlight:** cel media-day portrait enters with a restrained horizontal transition, warm nameplate and disclosed identity. Hold to read. Player-card PNG available.
4. **Class:** complete ensemble, all names and positions, choose another spotlight or download the class keepsake. Every player gets equal permanent space.

The mock is a manual coach's cut with one 650ms slide, not finished animation/audio. Enter activates focused controls or advances the scene when the canvas has focus. Escape skips to the class. Reduced motion bypasses transitions; system preference is respected. Restart/replay has no gameplay consequence. A final production version should offer a timed 12–18-second director's cut and this manual mode, both skippable; the timing is an original recommendation.

Sharing works locally as a 1920×1080 class PNG or 1200×1500 player PNG with fictional/proposal marks and public identity only. No auto-posting, private scouting values or league identifiers. Video export, audio mix, live league privacy permissions, immutable season/portrait snapshots and a durable scrapbook are future work, not implemented claims. Suggested audio brief: campus ambience, a soft gate latch, cloth movement, a short original brass signature at name reveal; no audio from reference games.

## Production acceptance before integration

- Keep all primary controls visible at 1280×720, with bounded keyboard-scroll detail regions and no horizontal scrollbar; test 1366×768, 1920×1080 and large text separately.
- Empty/full/error/loading states, 30+ players, long names, pitchers/two-way players and unknown scouting values need representative production review beyond this focused sample.
- Preserve selection across filtering and failed writes. Announce costs, failures and draft changes. Restore keyboard focus after every state change.
- Exports require complete portraits, consistent colors and stable year/identity snapshot. Missing art blocks export with recovery, never a broken card.
- Independently audit integration with simulator and companion data contracts. Source review, runtime behavior and Frisk's enjoyment approval remain separate gates.

See COACHING_LAB_QA.md for this proposal's actual checks and remaining limits.
