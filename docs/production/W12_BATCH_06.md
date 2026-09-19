# W12 batch 06 — Roster rating comparisons and player context

Manual continuation authorized by Frisk. No scheduled automation resumed.

## Delivered

- Overview, Batting ratings, Pitching ratings and Fielding ratings switch the same comparison ledger in place. Four relevant metric columns per view, explicitly labeled 0–100 ratings, with full-name header tooltips and ascending/descending header sort. Velocity is a rating, never MPH. Nonpitcher pitching fields show N/A; null stays em dash and genuine zero remains zero. This batch does not add season-performance statistics.
- Filters/search preserve the chosen comparison view. Metric sorting, view changes and the existing Order by dropdown retain the selected athlete and find their new page. Team changes create a fresh scene and preserve permission boundaries.
- Selected athlete shows actual field/batting/pitching assignment, recorded pitching workload when present, recorded overall progression when enabled, and existing lineup/availability/development actions. No inferred readiness, projected injury state or invented development outcome. Development action uses the existing own-team/context gate; opponent lineup remains read-only.
- Slash focuses roster search outside editable fields and dialogs. Typing slash inside search remains normal input. Existing Arrow/Page/Enter/Escape behavior retained.

## Independent game-dev audit

Read-only source audit found P2 selection resets when filtering remounted the scene, header sorting cleared selected ID, lens changes lost an implicit selection, and base-order dropdown sent selection back to page one. Each was fixed and corresponding runtime regressions added. No new unknown/zero, nonpitcher applicability or mutation-permission bypass found. This is source evidence, not enjoyment evidence.

## Verification

TypeScript and production build pass. Expanded scripts/verify-roster-context.ts exercises built UI + registered HTTP + fresh migrated synthetic PostgreSQL in simulated and reported modes. **345 checks passed** on the final run. New coverage checks zero, null and N/A; filter/view persistence; selected player through metric/base sorting and lens changes; slash input; all four visible metric columns; desktop viewport fit. Prior permissions, mutation rollback, portrait identity, profile focus, lineup and failure/retry coverage remains.

Runtime viewport checks:1280x720,1366x768,1920x1080,2560x1440,3440x1440, both Overview and Fielding ratings. Batting comparison screenshot visually inspected at1366x768. At short PC heights the athlete panel uses compact art/context to retain access to actions. No arbitrary zoom/long-name/enjoyment/Steam-readiness claim.

## Remaining

Recruiting still needs its distinct selected-prospect scene; clubhouse and other routes remain individual implementation milestones. Full roster/long-name stress,125/150% native text scaling, meaningful season-performance comparison, controller/Steam validation and unfamiliar-player enjoyment are open. Pitcher readiness continues to use the existing lineup view, not a newly invented summary. W12/UX-06 remains implementing. No saves migrated and no production data touched.

