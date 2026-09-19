# Coaching information pass — September 19, 2026

## Frisk's decision

The four compositions are accepted as the direction. Frisk explicitly approved the cinematic arrival composition and established **arrival as the first complete ratings-and-abilities reveal**. Recruiting may expose selected verified information and estimates; it must not expose the entire underlying player beforehand. This supersedes earlier notes calling the arrival composition unapproved. Production integration, audio, timed cinematics and durable scrapbook storage are still separate work.

This pass expands the fictional review at coaching-lab.html. It does not change production rules, saves or disclosure APIs. Current roster and incoming prospects now have distinct identities so the same incoming player cannot be inspected through the roster before arrival. Recruiting remains explicitly labeled a pre-arrival snapshot even after reviewing the cinematic in another tab.

## Information inventory

Grounding: client/src/components/player-profile-card.tsx, shared/schema.ts, shared/abilities.ts, shared/potential.ts, client/src/components/ui/letter-grade.tsx, and existing recruiting phone topics/cost labels in recruit-row.tsx. Static fixtures are authored only for review, not generated game records or a replacement overall formula.

| Surface | Information now available |
| --- | --- |
| Roster | Identity, overall, potential grade/value, season summary, complete core ratings, common attributes, trajectory, special abilities with tier/descriptions, batting/pitching/fielding statistics, tracked-data availability, pitcher repertoire and pinned comparison. Ratings/Stats/Abilities/Pitches chapters keep the selected player visible. |
| Team | Overall and potential on every field marker; selected player gets the same rating/ability/stat/repertoire chapters and a persistent season-stat summary above them. Substitution draft remains separate. |
| Recruiting | Scouting/Contact/Abilities/Pitches chapters. Every relevant core/common rating has a named slot showing KNOWN, RANGE or UNKNOWN. Overall, potential and trajectory remain estimates or unknown. Individual abilities can become known; the remaining ability profile has no leaked count. Pitching absence is not inferred from missing scouting. |
| Arrival front | Portrait, identity, overall, exact potential, role-specific core ratings and all ability names. |
| Arrival back | All common attributes, trajectory for fielders, ability tiers/descriptions, complete pitch repertoire for pitchers. New entrants correctly have no college statistics yet. Both sides produce reviewable 1600×2000 PNGs. |

Fielders: Contact, Power, Speed, Arm, Fielding, Error resistance; Clutch, vs LHP, Grit, Stealing, Running, Throwing, Recovery; Catcher for catchers. Pitchers: Velocity, Control, Stamina, Stuff; W/RISP, vs Lefty, Poise, Grit, Heater, Agile, Recovery. All 18 schema pitch keys have explicit slots. Letter thresholds match the existing S–G display; potential uses its separate B+/A− scale. Fixtures do not exercise every gold-linked common-ability override; production must preserve those existing rules.

Season stats include batting counts/rates, pitching counts/ERA/WHIP, fielding counts/percentage and explicitly unrecorded advanced tracking. Values are synthetic. No unavailable stat is silently changed into zero. Fielders' unavailable pitching stats show dashes. Further production integration must reuse server-derived metrics and their exact denominators rather than these display fixtures.

## College Football 27 reference

[Official Dynasty deep dive](https://www.ea.com/games/ea-sports-college-football/news/college-football-27-dynasty) and [official recruiting screenshot](https://drop-assets.ea.com/images/3GMBC151r6tb60NzozVk75/0c9f37334e0de5c70dcd4b127825b69e/Dynasty_Image_14_WM.png), directly inspected September 19.

Observed: persistent selected prospect, Overview/Recruiting/Scouting chapters, resource counters, school-interest comparison, action summary and dealbreaker context. The developer describes scouting before offers and a distinction between verbal and hard commitments. These support separating knowledge, contact effort and recruitment status.

The inspected image shows DM/social-media/offer actions; it does **not** establish a specific phone-call cost or call-dialogue system. C9's phone implementation here adapts the action-summary pattern using its existing seven pitch topics and displayed two-contact-point cost. No EA recruiting-hour values, NIL economy or commitment rules are imported.

Mock contact behavior: up to three selected pitch topics, one call per prospect per demo week, explicit cost, remaining points, receipt, newly learned motivation and pending interest response. Mock scouting: up to three paid evaluation steps, with a verified subset and narrowing ranges; the complete ability profile stays withheld. Completion of scouting is not completion of the arrival reveal. All contact is simulated UI state; no actual messages or phone calls occur.

## Verification and remaining gates

- Syntax checks pass for both JavaScript modules.
- Browser exercised a call: six contact points became four; selected Playing Time appeared in the receipt; repeat call disabled; newly learned motivation did not reveal additional ratings.
- Browser exercised all three scouting steps: five scout points became two; repeat scouting disabled, ranges remained at 3/3 and remaining abilities stayed unknown. Known ability section disclosed only the verified fixture ability.
- Selected pitcher on Team: role-specific ratings, ERA/WHIP summary and all 18 repertoire slots available. Roster Stats chapter checked for batting, pitching, fielding and unrecorded advanced data.
- Visually inspected expanded roster, recruiting, pitcher arrival front and reverse at 1366×768. Tightened reverse layout to fit complete pitcher details and removed native scrollbar chrome while retaining scrolling. Reverse PNG DOM verified 1600×2000 and PNG URL. OS download completion remains unverified, as in the first pass.
- New mock state is local/in-memory. No production database gate, save migration, large-roster usability, controller, audio or video-export gate is claimed. Runtime disclosure is only a mock presentation rule: production must withhold secrets server-side until arrival and authorize league sharing separately.

Next: Frisk reviews the information density and front/back distribution before production integration. Scheduled work remains paused.

Final revised-frame check: all four views at 1280×720, 1366×768 and 1920×1080 reported no document overflow (12 combinations); browser error log returned no entries. Temporary viewport overrides were reset after review.

## Complete-front revision — September 19

Frisk requested all ratings and stats on the front. The full card now uses a landscape composition: portrait and identity; core ratings; common attributes; trajectory or all 18 pitch slots; ability names; all 43 batting/pitching/fielding/advanced stat fields. Arrival values remain unrecorded dashes, explicitly explained. Roster's new “Open complete card front” button demonstrates populated season data using the same layout. The reverse is optional ability-description reading; no rating or stat requires flipping. The front PNG now exports at 2400×1800 and includes the same inventory.

Verification: JavaScript syntax check passed. At 1280×720, directly inspected pitcher front contained 11 core/common ratings, 18 pitch fields and 43 stat fields; dialog contentHeight equaled clientHeight (666px), with all content visible without scrolling. Populated fielder front also showed 43 stats and no dialog overflow. Export preview visually inspected and DOM verified as a 2400×1800 PNG. These are local mock checks; no production implementation or OS download completion claimed.

## Sports-card art revision — September 19, 2026

Frisk requested more color, shading and icons while preserving all ratings and statistics on the front. Implemented in the coaching-lab prototype, not the production game.

Reference review:
- EA SPORTS FC 26 Glory Hunters: https://www.ea.com/games/ea-sports-fc/fc-26/news/fc-26-glory-hunters — official promotional image visually inspected. Faceted frames, directional shading and luminous edges create depth around a quiet information area. Adaptation: restrained brass seams, dark identity gradient and a portrait mount; no copied artwork or rarity economy.
- MLB The Show 25 official manual: https://mlb25.manual.theshow.com/en/diamond-dynasty-2.html — source describes unique border art for Supercharged state. Adaptation: decoration communicates team identity and profile context; no invented gameplay boosts.

Changes: darkened team-color identity band; separate overall/potential badges; arched portrait with position label; letter-and-number grade chips; labeled section icons; four category color bands; shaded ability badges; matching export category colors, icons and grade palette. PNG retains a rectangular portrait frame and a spacious print layout. Unknown/unrecorded values remain explicit. No ratings or disclosure rules changed.

Independent read-only reviews:
- Art reviewer: flat hierarchy improved; flagged bright team-color contrast. Fixed with 70% dark-forest mix/overlay. No data loss found.
- Creative QA: approved direction in source; flagged export icon-key mismatch and lower-grade palette mismatch. Both fixed. An initial regex concern was retracted by reviewer and was not a defect.

Verification: JS syntax and git diff checks pass. Browser visual check of populated fielder and pitcher fronts. At 1280x720 pitcher dialog client/scroll height both 668px, with 43 stat fields and 18 repertoire slots. Mouse access to complete card fixed after finding compact roster header overlap. White team-color visual check prompted stronger darkening; forest final visually checked. Export is a valid 2400x1800 PNG data URL with category icons, grade/ability colors and complete records; final export visually inspected. OS download completion not asserted. Viewport override reset and updated card left open. These are prototype/source/runtime checks, not human-enjoyment or production-integration approval.
