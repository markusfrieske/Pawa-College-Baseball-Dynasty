# W12 batch 09 — Team diamond and personnel inspection

Manual continuation authorized by Frisk after approval of the complete player card. Scheduled development remains paused.

## Delivered

Team now opens on its roster scene: saved batting order at left, flat forest/brass diamond in the center, and paged Staff / Bench / All personnel at right. Every athlete entry shows stored overall and potential grade (unknown remains a dash) and opens the approved complete card with ratings, abilities, biography, career stats and segmented repertoire. Portrait identity and team-color treatment use the existing shared component.

Only hitters with saved batting slots 1–9 occupy the diamond; natural positions never invent starters. Vacancies, duplicate assignments and active batters lacking a field assignment remain explicit. All players, including other roles, remain reachable through All. Staff orders saved rotation roles before relief, then depth/name. Five entries per page keep personnel bounded. Team changes reset that page/group. Keyboard Enter opens cards and Escape returns to the original entry, including later pages.

A context-preserving link opens the existing lineup workspace for the viewed team. Roster now initializes and updates its viewed team from the teamId URL parameter. Assignment authority remains there; this scene performs no new roster mutations. Summary, Schedule, Coaches, School and History stay available. Failed Team loads distinguish failure from missing data and offer Retry team.

## Independent game-dev source audit

Reviewer: team_scene_review. No critical data-integrity blocker found. Source inspection confirmed consistency with existing DepthChartView assignment rules; this is distinct from runtime evidence and human enjoyment.

- **P2 TEAM-01 (fixed):** With default depthOrder zero, Friday starter and closer could sort by surname across pages. Staff now ranks explicit saved roles before depth/name. Acceptance: Friday/Saturday/Sunday/Midweek precede bullpen, unknown roles remain reachable. Implementation: [TeamDiamond](../../client/src/components/team-diamond.tsx).
- **P2 TEAM-02 (fixed):** Original footer required manual navigation to Roster → Lineup. Added a link carrying teamId/view/sub parameters and an own-team authority note. Acceptance: inspection retains team context without claiming opponent edit rights.
- **Readability follow-up:** Reviewer requested a populated diamond at 720p and 1080p. Inspected built UI screenshots and compressed the header/row line heights. No claim of an unfamiliar-coach usability study.

## Validation and limits

Production build and TypeScript pass. Expanded [runtime harness](../../scripts/verify-roster-context.ts) uses disposable PostgreSQL and real HTTP routes in both simulated and reported modes. It checks nine field slots, no inferred assignment, five PC widths (1280/1366/1920/2560/3440), populated layout height, saved lineup mutations reflected in Team, rotation order, all 13 fixture players across pages, full-card keyboard entry/focus return from field and later personnel pages, and the workspace URL. A final integration inspection caught that Roster originally ignored the teamId URL parameter. Fixed the destination state and added actual own-team/opponent link traversal with assertions on selected team and absent opponent edit controls. The page-reachability test initially included nested portrait test IDs; corrected the selector to player rows and reran successfully.

Visual review covers the actual retained synthetic team with cel portraits at 1280×720 and the populated harness screenshot at 1920×1080. No real saves were changed. Unknown potential remains visibly unknown. Longer conflict lists can expand vertically rather than silently hide players. Arbitrary names/zoom, controller input, a full miniature-stadium art treatment, other Team chapters, next-opponent integration and human enjoyment remain open. This is not a Steam/release gate. W12 / UX-06 remains implementing.

Prior runtime gate: **605 checks passed** in both modes, including a synthetic Team HTTP 503 followed by Retry team recovery. Build, TypeScript and whitespace checks pass.

Final runtime gate after destination integration: **615 checks passed** in simulated and reported modes. Own-team and opponent Team → Lineup links select the correct team, and opponent assignment controls remain absent. Final production build, TypeScript and whitespace checks pass.
