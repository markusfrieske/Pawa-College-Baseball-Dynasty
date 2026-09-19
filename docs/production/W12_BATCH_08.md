# W12 batch 08 — Approved flat player card in Roster and Team

Manual continuation authorized by Frisk after approval of the flat-color card. Automation remains paused.

## Delivered

One reusable `PlayerCardFront` now renders in Roster (including lineup inspection) and Team player inspection. It uses persisted identity/appearance, team uniform color, eligibility, hometown, handedness, overall/potential, role-specific core and common ratings, 18 pitch slots and all 43 front-facing stat slots. Flat surfaces, PAWA grade/ability palettes and labeled solid icons replace the prototype's former ornamental treatment. Existing commissioner edit and draft actions remain outside the replaced presentation. Recruiting and other callers retain their previous view until disclosure-aware integration.

Stats use the existing authenticated career endpoint, with selectable recorded seasons/records, loading, error, retry and empty states. A 30-second stale time avoids indefinitely cached records. Zero remains zero; missing rating/data remains a dash. Gold effects are labeled separately from stored common ratings. Ability descriptions can be opened with keyboard activation. Team now lists pitcher aliases and generic OF/otherwise unclassified roles, exposes potential, and restores keyboard focus after inspection.

## Data limits

This is a front-end integration, not a new statistics authority. Fielding and advanced fields omitted by the existing feed remain unavailable. PA/SF are not stored. HBP/CS lack reliable historical reporting provenance and remain unavailable here. Existing OBP/OPS omit sacrifice flies and are explicitly marked with that caveat. Recorded totals need not cover every scheduled game. No sample stats, biography, new identity assignments, or inferred hidden ratings entered production data. PNG export and arrival scrapbook are not integrated in this batch. The wider Team scene still needs the approved diamond composition; this batch integrates its player inspection.

## Independent audits

Technical/baseball source review found optional reported zeros, absent PA/SF/fielding fields, nonstandard advanced calculations, zero-denominator rates and overwritten gold ratings. New view conservatively suppresses unsupported fields, keeps actual values, labels rate limitations, and separates error/empty states. No backend mechanics changed.

UX/source review found P1 gold-effect ambiguity and P2 missing Team opt-in/color, inherited gradient overlay and mouse-only ability explanations. Fixed all four. Final reviewer found no remaining milestone blocker in source. Rare missing stored common values remain dashes while their gold ability remains separately inspectable. Source review does not establish runtime behavior or enjoyment.

Regression exposed nested draft cancellation failing after the expanded interactions. Made the draft confirmation state explicit and handled Escape on its focused content as well as the dismiss layer, closing that confirmation while preserving the profile. The subsequent gate passes this interaction. Manual Team inspection exposed omitted pitcher aliases/OF; corrected group coverage and added named keyboard controls.

## Validation

TypeScript and production build pass. Expanded `scripts/verify-roster-context.ts` uses fresh disposable migrated PostgreSQL, registered HTTP routes and the built UI in simulated/reported modes. It checks unknown ratings, 43 stat slots, 18 pitch slots, actual biography, genuine .000 batting average, suppressed optional HBP, zero-innings ERA, stats failure/retry, stored50/gold-S distinction, keyboard ability notes, all five PC viewport sizes, preserved editing/draft authority and Team keyboard opening/focus return. Final gate: **439 checks passed**. Typecheck, production build and whitespace checks also pass.

Visual inspection of real built Roster pitcher and Team catcher cards completed in the existing synthetic review league. No real saves touched. No Steam/controller, arbitrary zoom/long-name, complete Team-scene migration, human enjoyment, or production release claim.

## Equipped repertoire follow-up — September 19

Frisk requested the attached reference's segmented break bars and only pitches the player has. The shared complete front now filters to finite positive stored pitch values, labels full pitch names, and renders seven flat segments for breaking/offspeed pitches. Filled segments progress blue/yellow/orange without gradients or outlines. FB/2S remain binary Equipped labels; no invented break level. Missing or zero pitches have no tile. An empty list says no equipped pitches recorded. Screen-reader text identifies the exact break level without a visible 1–7 numeric rating. This supersedes the prior all-18-slots presentation; no pitch data is changed.

Expanded regression uses a synthetic equipped fastball, level4 slider and level7 changeup. It checks seven total/four and seven filled segments, accessible labels, binary fastball and absent2S/curveball omission alongside existing card/role/focus/viewport cases. Typecheck and production build pass. Runtime gate: **453 checks passed** in simulated/reported modes. The test-only review banner initially added document height; changed it to a non-interactive fixed label and reran the gate successfully. Visual review also found the previous generic icon SVG selector shrinking legacy portraits; scoped it to explicit card icons, then rebuilt/typechecked and visually verified the final card and bars in the retained synthetic review.
