# PAWA art direction lab

Prepared for Frisk. Status: **proposal awaiting creative selection**, not an approved production design.

Open [the interactive design board](index.html) in a browser, then choose among four overall directions and 48 options across 12 decisions. [DECISIONS.md](DECISIONS.md) contains the complete rationale, tradeoffs, six-screen brief and recommended recipe.

## What is included

- Four visual starting points: Varsity Club, Night Broadcast, Campus Chronicle and Rally Arcade.
- Six fictional-data screen concepts in every direction: Today, Team, Player, Recruiting, Game Center and Report Review.
- Four options each for direction, character portraits, environment art, typography, palette/surfaces, composition, player presentation, team identity, functional icons, density, motion and sound.
- Generated portrait, environment and team-mark comparison sheets; native HTML/CSS icon-treatment swatches.
- A copyable choice recipe. Changes affect this local proposal only. They are not approval or writes to the game.

The screen selector is a design-review tool, not the proposed production navigation. Player alternatives demonstrate composition and framing, not complete card/dossier/character-select interactions. Motion and sound are described choices; no audio or animation assets have been produced.

Captured concepts: [Varsity Club](screens/varsity-club.png), [Night Broadcast](screens/night-broadcast.png), [Campus Chronicle](screens/campus-chronicle.png), [Rally Arcade](screens/rally-arcade.png), and [phone report review](screens/report-mobile.png).

## Art and creative review

Clarke reviewed identity, character production and world art. CeeDee reviewed screen hierarchy and game feel. JD/Gibs independently reviewed the assembled proposal. Their common finding: competing next-action panels weaken the current game more than a lack of backgrounds does.

Recommended starting mix: **Varsity Club + cel portraits + painted baseball places + Barlow Semi Condensed/Inter + forest/brass + matchday brief + sports profiles + athletic monograms + clean outline icons + adaptive density + brief broadcast motion + opt-in stadium-light sound**.

The same fictional program and data appear in all directions. Existing player identity must survive any future art migration. Unreported statistics stay unknown, and pending reports never look official.

Independent review corrected the score-only sample to commissioner submission, restored focus after option changes, clarified the concept navigation and companion-only report, and added actual mark/icon comparisons. Artwork A still needs a painterly refinement pass if selected. Team marks need vector refinement and small-size optical review before production.

## Validation and limitations

The standalone board passed 72 direction/screen/width combinations (four directions, six screens, 1440/390/320px), 48 option-selection checks, both mode-label transitions and a no-write confirmation preview. No page JavaScript errors were observed; all five display/UI font families decoded in the inspected browser. The board was also visually inspected on desktop and phone. This is concept QA, not production-app verification, comprehensive contrast certification, player usability research or game-controller support.

The current source-only checkout still has the [full-media build prerequisite](../../production/BUILD_PREREQUISITES.md). No production client component, database schema or gameplay behavior changes in this proposal.

Final focused verification confirmed keyboard focus stays on the changed category/choice, actual font selection updates the preview, and the finished team-mark sheet decodes. The companion inline typography study was checked at 1024/390/320px without page overflow.

## Assets and next step

Art was generated with the built-in image tool. [PROMPTS.md](PROMPTS.md) preserves the prompts and refinement notes. Font specimen/source links are in [DECISIONS.md](DECISIONS.md); prototype fonts load from Google Fonts, and production fonts should be self-hosted with their licenses.

Frisk can choose one overall direction or mix the numbered options. After selection, build a polished Today/Player/Report vertical slice, a reusable 24-character sheet at roster/profile sizes, and desktop/phone/focus/contrast checks. Review that slice before replacing the remaining screens. Keep unfinished decisions explicit; backend integrity work can continue independently.
