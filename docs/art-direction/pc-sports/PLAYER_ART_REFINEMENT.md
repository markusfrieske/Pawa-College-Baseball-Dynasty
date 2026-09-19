# Player art and sports-profile refinement

Frisk requested a return to the original player-card and face direction after reviewing the PC atlas. This is a new review study, not a replacement for saved appearances or the production character generator. Open `players.html` in the existing PC atlas server.

## Direction

The approved 02B cel reference uses adult proportions, expressive asymmetric features, controlled contours and clear two-tone shadow planes. The initial procedural kit simplified this to repeated frontal silhouettes and small facial features. Preserve its stable identity behavior while raising the drawing quality toward the original reference.

The revised sports profile places the athlete beside a strong name, position, class and uniform number. Recorded performance and evaluation occupy separately labeled sections. A roster row reuses the same face with a tighter crop. Forest and cream belong to the program; brass marks hierarchy. Neither illustration style nor a card border implies player rarity, scouting certainty or signing status.

Four fictional roster identities are illustrated: Eli Price, Andre Walker, Kenji Sato and Jalen Brooks. These are new proposed appearances, not a silent migration of existing saved identities. The sheet was produced using the built-in image-generation tool with the original B/Cel study as a visual reference. It is stored as `assets/cel-roster-v2.png`; CSS crops the unmodified sheet. No production component or player record changed.

## Art review and remaining limits

- Stronger correspondence to the original reference: adult anatomy, cel shading, visible hair, three-quarter faces and expressive eyes.
- All four still share a similar pose and cap silhouette. A complete cast needs broader jaw, nose, ear, brow, body and expression variation, with no identity trait tied to ability or position.
- The sheet has baked uniform colors and backgrounds. It does not prove runtime uniform recoloring, transfer continuity, transparent cutouts or modular feature assembly.
- Before production, approve a 24-person character sheet at 40, 80 and 200 pixels, then build/version the reusable kit. Store appearance independently from team, role, ratings and status. Reuse it across recruit, roster, archive and reveal; never regenerate a face on navigation.
- Portrait art does not approve the separate arrival cinematic proposal. Automated layout checks are not human enjoyment or full accessibility evidence.

## Generation prompt

Create a polished ORIGINAL character art sheet for Class of Nine, a collegiate baseball management PC game. Reference image is STYLE REFERENCE ONLY: use exclusively the TOP RIGHT B / CEL portrait's sophisticated hand-drawn cel illustration, adult anatomy, confident expression, dimensional angular two-tone shadows, clean dark contour and warm cream forest/brass palette. Do not use the other styles. Deliver one landscape image divided into FOUR EXACTLY EQUAL WIDTH vertical panels with no gutters, no labels, no text, no typography, no logos, no panel borders. Each panel has flat identical light warm cream background. Each contains one DISTINCT fictional ADULT male college baseball player age 20-23 shown from cap top to mid-torso. All four heads entirely within their own panel with generous headroom, shoulders within panels, identical relative scale. Uniforms cream baseball jerseys with forest green piping and forest undershirts, forest caps WITHOUT logos. Media day three-quarter busts, shoulders at a slight angle, eyes toward camera; handsome expressive believable humans, NOT chibi, not dolls, not geometric avatar icons, not photoreal, no gradients/airbrush. Left to right: (1) warm tan skin, curly dark brown hair visible around cap, freckles, strong cheekbones, relaxed asymmetric closed-mouth smile; (2) deep brown skin, broad square jaw, short tightly coiled hair, slightly broader nose, proud calm expression, athletic wider shoulders; (3) light warm skin, straight black hair peeking below cap, narrower angular face, distinct narrower eyelids, reserved friendly expression; (4) medium brown skin, longer wavy dark hair below cap, long face and defined chin, lively warm grin. Same drawing hand and light from upper left across all portraits, subtle variety in posture, eyes and brows. Editorial-quality sports character illustration. No bats, balls, hands, props, UI, numbers or writing. Important: each of 4 equal-width panels is independently crop-ready for a vertical player portrait; do not overlap panels. These are four art-directed identity examples, not procedurally generated avatars.

## Verification

`node scripts/verify-player-art.mjs` passed 28 artifact checks: all four identity selections at five PC sizes, matching full/compact names, horizontal bounds, art asset availability, keyboard activation and no runtime errors. Parent visually inspected Eli and Kenji. The sheet is an art proposal; these checks do not validate a production generator, save migration or full text scaling.
