# Varsity Club production rollout — September 18, 2026

Frisk authorized implementing the approved visual direction across the game after reviewing the Today / Player / Report slice. The selected recipe is **01A / 02B / 03D / 04B / 05A / 06A / 07A / 08A / 09B / 10C / 11A / 12B**. Earlier concept-only holds are superseded for this visual migration. The newly requested joining ceremony is a separate proposal, not selected yet.

## Delivered in the game

- Shared forest/brass surfaces, locally bundled Sora/Inter, tabular statistics, rounded cards, compact tables, buttons, fields and active tabs. Core shared touch targets are 44px with visible keyboard focus. Legacy display-family names resolve to the bundled fonts instead of requesting missing public files.
- Persistent desktop clubhouse sidebar on league routes, using actual league/team identity and existing destinations; commissioner visibility follows existing role checks. Existing bottom navigation covers phones and tablets. Setup and non-league routes retain their own flows.
- Solid primary navigation symbols and athletic team lettermarks, retaining team names and colors.
- Deterministic cel portrait kit across player thumbnails, player profiles and coach avatars. Existing stored traits and the exact legacy ID-derived eye/brow/mouth/eye-black defaults remain intact. Eight hair silhouettes, facial hair, caps/helmets and gray recruit kits are supported. Transferring a player changes clothing rather than the face.
- One bundled miniature-campus environment establishes place throughout the main workflows. Native editorial story emblems replace legacy scene imports; these signal categories, not invented scenes or achievements. A PAWA crest replaces the pixel speech bubble.
- League hub: smaller context header, prominent phase-aware coaching brief and next game, collapsible destination grid and secondary editorial content. Operational readiness, reporting, roster and advance controls remain available. No-team commissioners receive an operations destination; phases without a primary task offer the roster.
- Recruiting, schedule, reporting, stats, commissioner and postseason headers now use the shared campus and contextual instructions. Reporting copy respects edit/submitted states. Existing roster and player screens inherit the shared shell, identity and component design.
- Shared overlays respect reduced motion. New users start muted; a saved explicit sound preference remains respected. The UI click is a softer triangle tone. The final Clubhouse soundtrack and bespoke reveal audio are **not** delivered in this milestone.

This is a shared production visual migration with targeted composition changes, not a claim that every phase-specific screen has received a bespoke rewrite. No joining-event persistence, results, scouting disclosure, advancement or economy logic was changed.

## Arrival Cinema Lab

Open [reveal.html](../2026-09-17/reveal.html) through the art preview. The [creative brief](REVEAL_DIRECTIONS.md) contains four coherent directions and four options across ten facets (40 choices):

| Direction | Core emotional beat |
| --- | --- |
| A — Clubhouse Arrival (recommended) | Campus → locker nameplate → recognizable athlete → profile |
| B — Signing Night Live | Broadcast announcement and clean on-air reveal |
| C — The Next Chapter | Program scrapbook and a permanent place in its history |
| D — First Step on the Diamond | Miniature ballpark entrance and home-field reveal |

Facets cover story, stage, motion, card, player portrayal, writing, sound, sharing, whole-class presentation and pacing. Four playable four-second CSS scenes demonstrate the overall directions. Mixed facets are recorded as a proposal; the preview does not synthesize every possible combination. Sound and media exports are described choices, not working exports. Direction comparisons preserve the mixed recipe. Applying a full recipe is explicit and reversible with Undo. Local persistence, copy/manual-copy, Skip, Replay, Escape and reduced motion are supported. All athlete/event examples are labeled fictional; the board makes no game API calls.

## Independent review and repairs

The shared UI implementer, creative director and separate screen reviewer worked on disjoint files. The reviewer identified: empty commissioner/offseason brief, navigation burying mobile blockers, misaligned artwork content, stale reporting instructions after submission, misleading disclosure text, remaining pixel-font overrides, unsafe default-audible behavior and silent reset of mixed cinematic choices. These were repaired. Browser inspection additionally found cramped matchup names and an animated mobile profile under reduced motion; both were corrected before final verification. The browser check also caught Tailwind overriding the first reduced-motion rule; a scoped specificity fix was verified against computed styles and the fully visible profile. The mobile navigation was also moved below modal layers, with a hit-test confirming it cannot obscure the profile.

The creative source audit also found existing joining-flow concerns: animation callbacks coupled to completion POSTs, retry/local-suppression behavior, possible concealed-rating signals through tier/sort cues, and inactive card accessibility. These are documented with source references in the creative brief. They remain prerequisites for the selected reveal implementation, not silently resolved by reskinning it.

## Verification

- Full TypeScript check passes.
- Full production client/server build passes, including roster and recruiting validation. Existing Browserslist age and PostCSS `from` warnings remain; no missing legacy font or compile-time art imports remain.
- `node scripts/verify-varsity-ui.mjs`: **105 checks passed** against production builds served through an isolated read-only fictional fixture, seven pages at desktop/phone sizes, player-profile opening, report-detail interaction, font/image loading, horizontal overflow, keyboard disclosure, opt-in audio, tablet navigation, commissioner fallback and deterministic portrait checks. See checked-in screenshots below. The Windows sandbox may require running the script outside restricted directory traversal for esbuild.
- Creative agent verified 20 direction/viewport combinations (1440, 1024, 768, 390, 320), all 40 choices, local persistence, clipboard/manual fallback, denied-storage behavior, four completed timelines, Skip/Escape, reduced-motion changes and mixed-recipe apply/Undo/reload.
- JavaScript syntax and Git whitespace checks pass.

Screenshots: [hub desktop](screens/hub-1440.png), [hub phone](screens/hub-390.png), [roster](screens/roster-1440.png), [profile](screens/profile-390.png), [report](screens/report-390.png), [recruiting](screens/recruiting-1440.png), [24-player identity sheet](screens/cel-contact-sheet.png), [reveal lab](screens/reveal-desktop.png).

The fixture uses the actual built React pages with synthetic GET responses; it refuses writes. Optional data panels outside its fixture may be unavailable. These checks do not certify authenticated server workflows, every screen/state, official Power Pros rules, the full release gate or runtime legacy music/service-worker/favicon completeness. No deployment, merge or production-data changes were performed.

## Preview and next milestone

After building, `node scripts/preview-varsity.mjs` serves the fictional game at `http://127.0.0.1:49745/league/varsity-demo` (override with `PAWA_PREVIEW_PORT`). The existing art preview serves `http://127.0.0.1:49744/reveal.html`. These are local review servers, not deployed services.

Next: Frisk selects a reveal recipe; implement that ceremony against persisted joining facts with replay/completion separated and disclosure enforced. Then run an authenticated multi-role/phase visual pass on the existing release test environment, refine unique environment/portrait art and finish Clubhouse audio. Continue the existing integrity schedule independently; do not introduce a competing backend backlog.

## Asset provenance

New raster: [varsity-campus.png](../../../client/src/assets/art/varsity-campus.png), generated with the built-in image generation tool. The original generated output was copied into the repository; no bulk legacy-asset download was performed. Native cel portraits, story emblems, crest and navigation icons are code assets. Fonts and OFL licenses are in `client/src/assets/fonts`.

Final generation prompt:

> Use case: stylized-concept. Create a single production environment backdrop for PAWA college baseball management game in the approved Varsity Club direction. A beautifully crafted miniature college campus and baseball diamond at golden hour, isometric three-quarter aerial view, coherent small-scale architectural model, warm brick clubhouse, deep forest green roofs and cypress trees, ivory paths, brass sunlight, calm distant sky. Modern premium video-game art with soft cel-shaded forms, restrained tactile materials, charming readable silhouettes and excellent composition. Wide landscape 1536x1024. Baseball field occupies right half with anatomically correct baseball diamond, grandstand, lights; small campus courtyard in left middle, airy calm left top to support overlay title. No UI, no text, no letters, no logos, no border, no split panels, no collage. Entire image a single continuous scene. Detailed but visually quiet; sophisticated not photorealistic, not pixel art. Asset intended for responsive scene header, must remain legible behind a dark gradient.
