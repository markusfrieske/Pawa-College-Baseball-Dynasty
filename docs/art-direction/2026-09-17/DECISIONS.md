# Pawa art direction: decision board

**September 18 production update: Frisk explicitly authorized “implement the design across the game.” The selected Varsity Club recipe is now approved for implementation. See [production rollout and evidence](../2026-09-18/ROLLOUT.md). The new [arrival cinema choices](reveal.html) are a separate proposal awaiting selection.**

Prepared for Frisk, September 17, 2026. This document accompanies the interactive concept board. It proposes a visual identity for a text baseball sim and Power Pros league companion; it does not change production screens or select a final direction on Frisk's behalf.

## Frisk's proposed selection — approval pending

Update: Frisk subsequently authorized moving forward with the polished concept pass. The [three-screen slice](slice.html) and [review record](SLICE_REVIEW.md) apply this exact recipe. Production visual migration is not yet approved by that concept-development instruction.

Received September 17, 2026. These are Frisk's exact proposed choices, explicitly **not yet approved**. They are the concept board's initial recipe; the original studio presets remain available for comparison.

| Code | Decision | Proposed choice |
| --- | --- | --- |
| 01A | Direction | Varsity Club |
| 02B | Characters | Cel illustration |
| 03D | World art | Miniature campus |
| 04B | Typography | Friendly console |
| 05A | Color + surfaces | Forest & brass |
| 06A | Screen composition | Matchday brief |
| 07A | Player presentation | Sports profile |
| 08A | Team identity | Athletic monograms |
| 09B | Functional icons | Solid silhouette |
| 10C | Information density | Expert |
| 11A | Motion | Broadcast |
| 12B | Sound | Clubhouse |

Creative interpretation: a warm collegiate clubhouse with expressive cel players and a miniature campus world. Use Sora headings, Inter interface text and tabular Inter statistics. Keep the matchday brief's next action prominent while giving comparison screens expert density. Preserve readable type, keyboard focus and phone touch targets; compact spacing must not hide reporting status or missing statistics.

The next visual review should check shared palette and lighting across cel players and miniature environments, solid icons at small sizes, and dense Team/Report screens on desktop and phone. Broadcast motion must support reduced motion; Clubhouse sound should be opt-in with persistent mute. Motion and sound are still descriptions, not implemented assets.

The original proposal and concept-approval history below is retained for context; the September 18 implementation authorization above supersedes the earlier production hold.

## Original studio recommendation (comparison only)

Start with **Varsity Club**, expressive **cel portraits**, painted baseball places, and a readable athletic interface. Give characters personality and give league data clear hierarchy. Use one expressive image per screen, with solid surfaces behind decisions and tables.

Recommended selection: **01A · 02B · 03A · 04A · 05A · 06A · 07A · 08A · 09A · 10D · 11A · 12A**.

Each decision has four options. The overall directions are coherent starting points; portrait style, typography, and composition remain independently selectable. Select direction and portraits first, then refine the remaining choices using the same content and characters across comparisons.

## What the current source tells us

The existing app has a forest/gold theme, self-hosted Inter, Barlow Semi Condensed and IBM Plex Mono, pixel portraits, circular abbreviation badges, and artwork/atmosphere layers. These parts do not yet express one consistent visual system. This diagnosis comes from source inspection, not a claim that every production screen was visually tested.

- [Theme and fonts](../../../client/src/index.css) already contain useful typography foundations. Modernization should improve hierarchy and composition rather than add more fonts and glow.
- [PlayerAvatar](../../../client/src/components/player-avatar.tsx), [PlayerPortrait](../../../client/src/components/ui/player-portrait.tsx), and [CoachAvatar](../../../client/src/components/coach-avatar.tsx) implement separate portrait treatments. A shared identity system should replace their visual divergence.
- [TeamBadge](../../../client/src/components/ui/team-badge.tsx) supplies dependable abbreviation fallbacks, but circular letters alone provide little program personality.
- [ArtworkBackground](../../../client/src/components/artwork-background.tsx) supports responsive art and overlays. Keep that capability while making art placement deliberate and preserving solid data surfaces.
- [Dashboard](../../../client/src/pages/dashboard.tsx) provides the necessary league-selection content, but an equal-weight collection of cards does not establish a strong game-menu hierarchy.

## 01 — Overall direction

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **01A** | **Varsity Club:** emerald and brass, athletic headlines, illustrated stadium light, disciplined broadcast panels. | College identity with credible league data; strongest continuity. | Green/gold needs restraint or it becomes heavy and ornamental. |
| **01B** | **Night Broadcast:** ink and ice, score ribbons, technical charts, crisp rectangular surfaces. | Excellent for standings, comparison and commissioner workflows. | Needs expressive characters to avoid looking like analytics software. |
| **01C** | **Campus Chronicle:** cream and oxblood, editorial headlines, painted campus scenes, season storytelling. | Strong program history and readable long-form stories. | Can feel like a publication rather than an interactive game. |
| **01D** | **Rally Arcade:** navy, coral and aqua, bold shapes, playful miniature environments. | Immediate energy and accessible character-driven identity. | Excitement must be restrained on dense forms and disputed results. |

## 02 — Character portraits

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **02A** | **Sculpted 3D:** original stylized adult athlete, rounded volumes, consistent studio light. | Strong game-character presence and clear silhouette. | Highest reusable modeling and rendering cost. |
| **02B** | **Cel:** expressive illustrated bust, clean contour, two-tone shading, modular features. | Readable small, memorable large, practical to vary. | Requires a strict drawing kit to prevent inconsistent faces. |
| **02C** | **Graphic cut-paper:** flat layered shapes, limited shading, strong profile geometry. | Distinctive, scalable, easy to theme. | Subtle personality and resemblance are harder to preserve. |
| **02D** | **Painted semi-real:** natural proportions, illustrated skin and hair planes, controlled texture. | Strong emotional player cards and feature stories. | Most vulnerable to inconsistent lighting and near-duplicate faces. |

The portrait study depicts the same fictional adult player across styles. Sculpted 3D means a stylized adult, not a childlike or franchise-copied character.

## 03 — Environment art

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **03A** | **Painted places:** dugout, bullpen, scouting room and ballpark with composed empty space. | Builds a believable baseball world without a playable 3D scene. | Needs a consistent painterly hand and responsive crops. |
| **03B** | **Cinematic stills:** dramatic tunnel, floodlights, mound and championship stage. | Fast premium sports atmosphere. | Similar stadiums can make programs feel interchangeable. |
| **03C** | **Athletic posters:** geometric fields, team-color blocks, silhouettes and bold framing. | Efficient, highly coherent and easy to personalize. | Less sense of physically inhabiting a program. |
| **03D** | **Miniature campus:** isometric ballpark and campus vignettes with readable landmarks. | Strong sense of place and long-term progression. | Art can imply building mechanics the game does not have. |

The environment board explores overall moods, not four finished production assets or a one-to-one illustration of these methods. The painted-place example is closer to realistic rendering than the intended final painterly treatment. Approve composition and atmosphere separately from finish.

## 04 — Typography

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **04A** | **Barlow Semi Condensed / Inter / Plex numerals:** athletic headlines, neutral body, aligned data. | Best continuity and strong sports hierarchy; already declared in the app. | Condensed headings lose impact if applied to every label. |
| **04B** | **Sora / Inter:** geometric display headings with quiet body text. | Clear, contemporary, friendly game menus. | Less inherently collegiate or baseball-specific. |
| **04C** | **Bitter / Inter:** slab-serif story and season headings with neutral controls. | Strong campus editorial voice and archive identity. | Large slabs need more space on compact screens. |
| **04D** | **Space Grotesk / Inter:** distinctive technical headings with familiar body text. | Fits scouting and a modern tactical interface. | Can shift the tone toward technology rather than sport. |

Official font sources: [Barlow Semi Condensed](https://github.com/google/fonts/tree/main/ofl/barlowsemicondensed), [Sora](https://github.com/google/fonts/tree/main/ofl/sora), [Bitter](https://github.com/google/fonts/tree/main/ofl/bitter), [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk). Inter and IBM Plex Mono are already declared in the repo. Any additional production font must retain its license and be self-hosted. Use tabular numerals for aligned statistics; do not make all body text monospaced.

## 05 — Palette and materials

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **05A** | **Forest brass:** deep emerald canvas, pale text, restrained warm metallic accents. | Strong program tradition and current-brand continuity. | Gold borders and glow everywhere would flatten hierarchy. |
| **05B** | **Ink ice:** near-black navy, cool pale panels and cyan action accents. | Strong scoreboard clarity and technical atmosphere. | Can feel cold without human portraits and warm scene art. |
| **05C** | **Cream oxblood:** warm light canvas, dark ink, deep red accents. | Excellent reading and editorial contrast. | Needs a deliberate evening variant for long dark-room sessions. |
| **05D** | **Navy coral aqua:** dark blue base with bounded warm and cool accent blocks. | Lively and recognizable at small sizes. | Too many competing accents can overwhelm team identity. |

Concept colors are not contrast-certified production tokens. Team colors belong in marks, uniforms and selected bands; they must not redefine warnings, body text or every action. Validate red, blue, green and yellow teams, not just one attractive sample.

## 06 — Screen shell and navigation

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **06A** | **Matchday brief:** one priority action, next opponent, short task queue and supporting panels. | Answers what matters and what to do next immediately. | Requires useful prioritization instead of displaying everything equally. |
| **06B** | **Coach desk:** inbox, schedule and player concerns arranged as a working desk. | Strong role-playing context and everyday rhythm. | Decorative desk objects must not become navigation obstacles. |
| **06C** | **Broadcast frontpage:** lead story, score strip, standings and news modules. | Makes a league feel active and worth following. | Stories can bury required coaching or reporting actions. |
| **06D** | **Franchise workbench:** persistent compact navigation, split panels and quick filters. | Fast for experienced managers and commissioners. | Requires personality elsewhere to avoid a generic admin layout. |

## 07 — Player profile

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **07A** | **Sports profile:** portrait and identity header above ratings, season stats and relevant actions. | Clear across recruits, roster members and archives. | Less theatrical than a character-first presentation. |
| **07B** | **Collectible card:** large portrait, team frame and compact key attributes. | Memorable, shareable and strong for signing reveals. | A card cannot carry every scouting detail without becoming cluttered. |
| **07C** | **Scouting dossier:** report summary, evidence, uncertainties and side-by-side comparisons. | Strongest for careful recruiting decisions. | Less emotional attachment unless portrait and voice remain prominent. |
| **07D** | **Character select:** large figure, role archetype and ability panels. | Makes each athlete feel like a game character. | Expensive poses and wasted space in routine roster management. |

## 08 — Team marks

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **08A** | **Athletic monogram:** simple two/three-letter mark with consistent proportions. | Scales across many programs and dense tables. | Shared initials require careful differentiation. |
| **08B** | **School crest:** shield, initial and one simple school symbol. | Strong campus tradition and award presentation. | Needs a simplified variant at small sizes. |
| **08C** | **Mascot emblem:** original two-color animal or object silhouette. | Most memorable and characterful identity. | Highest illustration cost across the league. |
| **08D** | **Cap letter:** baseball lettering shared by cap, uniform, scoreboard and profile. | Highly coherent baseball identity. | Less room for distinctive shapes than full emblems. |

## 09 — Functional icons

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **09A** | **Clean outline:** consistent stroke weight and simple 24 px geometry. | Quiet, clear and compatible with expressive art. | Tiny or low-contrast strokes need adjustment. |
| **09B** | **Solid:** filled silhouettes with minimal interior detail. | Strong small-size recognition and active states. | Can feel visually heavy in dense navigation. |
| **09C** | **Duotone:** neutral main shape with one accent plane. | Adds game personality without elaborate illustration. | Color must not become the only indicator of meaning. |
| **09D** | **Pixel:** deliberate grid-based symbols with consistent scale. | Distinctive indie character. | Conflicts with a fully modern painterly direction unless tightly limited. |

Team marks and functional icons have separate jobs. Save, compare, report and advance must keep stable meanings and visible labels where ambiguity matters.

## 10 — Information density

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **10A** | **Cinematic:** generous spacing, large art and a small number of visible decisions. | Strong onboarding and milestone impact. | Slows frequent stat comparison and reporting. |
| **10B** | **Balanced:** moderate rows, readable summaries and optional detail panels. | Predictable default for most screens. | Neither deeply immersive nor maximally efficient. |
| **10C** | **Expert:** compact tables, persistent filters and many visible comparisons. | Fast for veteran managers and league operators. | Greater learning burden and weaker mobile fit. |
| **10D** | **Adaptive:** expressive hub and reveals, compact roster/report views, user-controlled detail. | Supports both game feel and companion utility. | Requires explicit screen rules; layout must not shift unpredictably. |

## 11 — Motion

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **11A** | **Broadcast:** brief score transitions, focus changes and restrained panel entrances. | Adds energy while keeping routine actions fast. | Becomes repetitive if every panel animates on every visit. |
| **11B** | **Cinematic:** slow scene transitions and staged milestone reveals. | Strong championships and season ceremonies. | Must be skippable; unsuitable for ordinary form work. |
| **11C** | **Tactile:** short presses, card movement and clear drag feedback. | Makes interactions feel responsive and understandable. | Requires reliable touch, pointer and keyboard equivalents. |
| **11D** | **Arcade:** elastic reactions, punchy badges and celebratory bursts. | Playful rewards and strong signing moments. | Too much motion diminishes serious league administration. |

Respect reduced motion. Never delay saving, hide result status during animation or imply completion before the server confirms it.

## 12 — Audio

| Code | Option and tangible treatment | Strength | Cost or compromise |
|---|---|---|---|
| **12A** | **Stadium light:** restrained crowd bed, subtle bat/ball accents and milestone stings. | Baseball atmosphere with little interference. | Repetitive crowd loops need careful mixing and an off switch. |
| **12B** | **Clubhouse:** quiet room ambience and restrained warm instrumental themes. | Comfortable long-session mood and place. | Music can compete with streamed games or voice chat. |
| **12C** | **Minimal:** optional action confirmations and important alerts only. | Best companion use and lowest distraction. | Less immersive emotional identity. |
| **12D** | **Arcade:** short energetic melodies and playful interaction sounds. | Strong character and reward feedback. | Most fatiguing during repeated roster and data entry work. |

These are sound-direction descriptions, not auditioned audio samples. Audio stays opt-in with independent music/effects controls; required information must also be visible.

## Six-screen design brief

1. **Dynasty hub:** show program identity, season/week, next opponent and one primary action. An illustrated place sets the mood; a short task queue explains what needs attention. League mode and simulation mode remain explicit.
2. **Recruiting board:** preserve scanning, filters, needs and comparison. Use small stable portraits, clear interest/commitment states and honest scouting uncertainty. Save large art for a selected recruit or signing reveal.
3. **Player profile:** make name, role, team and eligibility obvious, then separate ratings from actual season performance. Use the same identity across recruitment, transfer, roster and archive. Put relevant actions near the evidence supporting them.
4. **Lineup and game preparation:** emphasize batting order, field positions, pitching availability and opponent context. Decorative field art must not reduce drag targets or replace a keyboard-accessible ordered list.
5. **Power Pros result report:** establish game identity, score, participants, evidence and review state. Keep entry surfaces solid and readable. Reported, disputed, accepted and simulated must remain visibly distinct; animation never certifies an unverified result.
6. **League and commissioner overview:** prioritize standings, schedule, unresolved reports and required decisions. Role-specific controls stay identifiable. Approval history and result provenance must remain accessible in the new shell.

## Reusable character identity contract

- Use one shared portrait system for players and coaches. Maintain stable stored appearance attributes and versioned seeds; do not regenerate identity on refresh, sort, transfer or season rollover.
- A transfer changes the uniform, not the face. Preserve a player's recognizable silhouette, skin tone, face shape and hair across all screens.
- Build a modular kit of heads, features, hair, accessories and uniforms. Do not generate a fresh unrelated image for every player on every visit.
- Test at least 24 diverse characters at 40, 80 and 200 px. Distinguish people with shape and features, not only skin or jersey color.
- Keep identity separate from fatigue, potential, eligibility and report-status badges. Art must not suggest certainty or rarity unsupported by the simulation.
- Review a small set of expressions and poses before expanding. Use scene illustrations for major stories, not routine table rows.

## Concept scope and next gate

The generated [portrait studies](assets/portrait-studies.png) and [environment studies](assets/environment-studies.png) are visual exploration, not production-ready assets. They do not demonstrate a complete modular character kit, all responsive crops, tested accessibility or a working game screen. No production UI is replaced by this package.

After Frisk selects or combines options, apply the chosen system to the six screens above using actual information hierarchy and representative data. Validate desktop and narrow mobile layouts, keyboard access, contrast, empty/loading/error states, a 24-character sheet and multiple team colors before migrating shared components. Keep the chosen decisions and subsequent revisions in this directory so implementation follows one durable art brief.
