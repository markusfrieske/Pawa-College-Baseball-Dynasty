# Class of Nine PC design atlas

Frisk requested reference-based, screen-specific design inspired by Madden, MLB The Show, NHL, FIFA/EA SPORTS FC, NBA 2K, College Football and Retro Bowl. The target is now **PC-only**. The existing approved Class of Nine gateway/wordmark and Varsity Club palette remain. Scheduled development stays paused.

## Delivered

- **80 individual screen and overlay briefs**, preserving the complete prior inventory, each with a decision, composition, authored spatial map, PC interaction, art, website patterns to remove, error/empty state, acceptance criteria and linked reference evidence.
- **23 visual composition studies** for clubhouse, roster, recruiting, dossier, field/lineup, schedule, prep, entry, pending review, accepted box score, postseason, stories, committed class, program legacy, inbox, player, coach, stats, commissioner, title, dynasty selection, news and archive.
- **57 individually directed schematics** for the remaining screens. Their proportions/content regions are authored per screen, not assigned by zone count. They are not pixel-final. Some wireframe areas represent separate future chapters rather than simultaneous production panels; the written brief governs.
- **15 source records** across all seven requested franchises. Researchers directly inspected official screenshots or named video frames and separated observed visuals, developer text and our inference. No reference-game hands-on tests were performed.
- A durable [game-dev guide](GAMEDEV_GUIDE.md), repository AGENTS.md entry and [implementation map](IMPLEMENTATION_MAP.md) make the PC direction part of future agent work.

## Use the atlas

Start the read-only loopback server with node scripts/preview-pc-studies.mjs, then open /pc-sports/index.html on the printed address. F2 opens the searchable screen index; F1 shows that screen’s rationale and references. Mouse selection works in roster/recruiting/stat tables; focused player rows support Up/Down. Page Up/Down browse studies except within a bounded content pane. Escape closes review overlays. Buttons with unimplemented actions explicitly say they are composition previews. Nothing reads or writes game state.

The input strip contains review controls, not mobile navigation. The artifact has no website sidebar. Native scrollbar chrome is hidden in focused content panes while wheel/keyboard scrolling remains; production needs explicit page/count/overflow affordances with real datasets.

The 23 studies use fictional sports data and original C9 art assets. External game screenshots are linked as references, not copied into the product. Actual production screens are unchanged by this design-only batch. Arrival direction remains unapproved; Steam packaging, gamepad behavior, durable drafts and full PC text-scale accessibility are not established by this artifact.

## Evidence

Assembler validates all 80 IDs, source references, spatial counts, bounds and non-overlap. The local artifact gate passes **755 checks** covering every brief and reference list, all 23 compositions at 1280×720,1366×768,1920×1080,2560×1440 and 3440×1440, image loading, outer page bounds, selected-player behavior, index/search/keyboard controls and zero runtime errors. These are artifact tests, not production game tests or enjoyment certification. See [audit](AUDIT.md).

Parent visually inspected the hub, recruiting and schedule during refinement. Broken standalone SVG portraits were fixed by exporting their namespace. The roster-like stats/box-score layouts and wrong-matchup calendar routing found by independent agents were corrected. Body label sizes were increased;125/150% UI-scale and controller tests remain production gates.

## Next production slice

Implement the PC frame plus stable selected-target recruiting, then roster and field as distinct canvases. Run real saved-data/auth/error/retry checks before replacing more screens. Continue schedule/prep/entry/accepted-result as a complete companion journey, including W12-SCHEDULE-01 and durable drafts. Retain source, runtime and enjoyment evidence as separate acceptance types. This supersedes the prior recommendation to move directly to schedule while keeping the website frame.

## Player art follow-up

Frisk requested stronger adherence to the original cel faces and sports-profile cards. [Player art refinement](players.html) presents four new illustrated identity examples, full sports profiles and matching compact rows. See the [brief and generation prompt](PLAYER_ART_REFINEMENT.md). This study supplements the atlas; it does not migrate production appearances.

## Thirty-face production asset library

Frisk approved the refined cel direction and requested 30 additional faces with team-dependent colors. [The new gallery](faces.html) uses the canonical `client/public/art/players/v1/` asset library and shared renderer. Run `node scripts/preview-player-library.mjs` to serve this gallery and its game assets. The [generation specifications](face-generation.json) retain the built-in tool prompt and all 30 individual briefs. Team fabric recolors independently of fixed facial identity; the existing four-player comparison sheet remains unchanged. The reusable React component is opt-in; existing saves have not been remapped.
