# Class of Nine cel player library — v1

30 additional original fictional adult baseball portraits, commissioned by Frisk on September 18, 2026, using built-in image generation. These supplement the four original art-study faces. Original source PNGs are preserved; uniforms deliberately contain magenta fabric keys. Do not show a source PNG directly in a player-facing screen.

## Use

Use `IllustratedPlayerPortrait` from `client/src/components/ui/illustrated-player-portrait.tsx` with an explicit `portraitId`, `teamColor`, meaningful `alt` and sized className. Example: portraitId `c9-face-01`, teamColor `#183358`, className `w-48`. Or call `renderPortrait(canvas, {id, teamColor, size})` from `runtime.mjs`. Default asset URLs are `/art/players/v1/`.

Store the selected ID with the player's appearance. Team color is a separate input and can change without reassigning the face. Do not derive portrait identity from team, current roster order, ratings or refresh-time randomness. Existing player records and legacy face components have not been migrated or silently remapped. This is an opt-in reusable asset/rendering library, not a completed save-schema migration.

`manifest.json` lists stable IDs and requested art traits. Each portrait is one fixed illustration; hair, skin and eyes vary across the library, not through runtime trait sliders. Those descriptions are art specifications, not a promise of exact colorimetric values. Faces share a consistent media-day pose; this is not an unlimited modular generator. Thirty unique source-file hashes are verified.

## Team colors

The renderer identifies authored magenta/purple fabric chroma and replaces it with the selected color while retaining highlights and shadows. Natural skin, hair, eyes, cream jersey and background are untouched by this operation. It does not use a whole-image hue filter. A rendered PNG may be downloaded from the review gallery. Gray/black/white colors are supported. Only primary fabric color is authored; secondary colors, team marks, alternate uniform cuts, helmets and transparent background exports require additional assets.

The original four-player comparison sheet remains historical art reference with baked green uniforms; this new 30-face library is the team-color-ready set. Do not infer that old image has been made recolorable.

## Evidence

`node scripts/verify-player-library.mjs`: 30 distinct assets, 90 actual-image recolor cases (30 faces × red/blue/gold), exact unchanged non-key pixels and alpha, fabric-key presence, preset switching, portrait modal, PNG export availability, Escape, three PC widths and zero runtime errors. Color comparison uses the same canvas decode/resampling context on both sides to avoid GPU/CPU interpolation differences being mistaken for recolor changes. TypeScript passes. Parent visually reviewed gallery rows and recolored fabric. These are asset/component checks, not production save or full game integration tests.

The canonical generation prompt and all 30 individual specifications are in `docs/art-direction/pc-sports/face-generation.json`. Method: one built-in image-generation call per asset, using the approved four-player sheet as style reference. No reference-game art was used.

Preview: run `node scripts/preview-player-library.mjs`; open the loopback URL it prints. The server is read-only and uses no game database. Scheduled development remains paused.

Integration update: Frisk approved this library. Shared game avatars now accept persisted optional IDs, and the commissioner roster editor can assign or clear them. See `docs/production/W12_BATCH_04.md` for migration 0055, runtime evidence and remaining lifecycle limits. Legacy null identities still use the prior appearance renderer; no automatic remap occurred.
