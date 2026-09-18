# Game screen redesign review — September 18, 2026

Frisk rejected the visible scrollbar rails, bottom website-style navigation, and repeated position tables. The approved Varsity Club art recipe remains in force. This pass delivers immediate presentation repairs and a proposal for every routed screen; it does not claim every proposed layout is implemented.

## Review artifacts

- [Interactive screen playbook](../2026-09-17/screen-book.html): searchable screen index, wide/compact studies, interactive roster selection and compact player inspector.
- [Canonical screen design plan](SCREEN_DESIGN_PLAN.md) and [structured specifications](screen-designs.json): 50 screen designs cover all 51 explicit App routes and the catch-all; 30 further specifications cover tabs and overlays. Each includes purpose, composition, primary action, data hierarchy, art, compact layout, input, states, acceptance criteria and priority.
- [Wide roster study](screens/screen-book-1440.png), [compact study](screens/screen-book-390.png), [implemented roster](screens/roster-1440.png), [implemented recruiting](screens/recruiting-1440.png).

The playbook uses reusable composition studies plus screen-specific specifications. Its illustrative buttons are not connected game features. Existing cel portraits are rendered from the native portrait component; existing campus art and licensed local fonts are reused. No new raster asset production is claimed.

## Implemented now

- Removed the bottom navigation from the game shell at all widths. A top Game menu preserves the previous destinations, unread inbox count and commissioner/co-commissioner visibility. Wide layouts retain the clubhouse sidebar. Audio controls move into the top shell.
- Hidden native and Radix scrollbar rails without disabling wheel, touch or keyboard scrolling. Shared overflowing tables expose Previous/Next column buttons and a focusable region. Radix scroll areas are keyboard reachable.
- Recruiting command summaries reflow into a grid rather than a clipped horizontal strip.
- The roster list uses one comparison table and one header, compact rows, wrapped player names, an explicit OVR label and visible 44px captain controls. Existing filtering, profile opening, depth/development and mutation callbacks remain in place.
- Shared sheet close controls have a 44px target. Coach profile and Settings have distinct current-location states.

The proposed persistent roster inspector, full screen-specific compositions, controller input, Steam packaging, and new arrival ceremony are not implemented by these repairs. The arrival recipe remains selected but unapproved.

## Independent audit and resolutions

The read-only game-shell UX reviewer inspected the existing game and proposed changes independently of implementation. The inventory agent separately mapped the routed and nested experiences.

| Finding | Severity / reproduction | Acceptance and disposition |
| --- | --- | --- |
| Hidden table rails could strand roster columns | P1: roster used a raw table outside the improved shared wrapper; narrow widths or long names could overflow | Roster now uses the shared Table; names wrap. Browser checks cover 640/768/900px long-name cases plus real shared-table buttons and native keyboard movement. Resolved for this surface. |
| Two current navigation entries | P2: open `/league/:id/coach?tab=settings`; both Coach profile and Settings were current | Exactly Settings is current. Browser assertion passes. Resolved. |
| Small sheet close target | P2: shared sheet close icon had no touch-sized box | Shared close target is 44×44px. Final independent source review confirms fix. |
| Roster authority response shape needs broader verification | Follow-up: roster hook and shell use different league response assumptions | No permission logic changed. Authenticated coach/opponent/commissioner response and mutation matrix remains a first-loop implementation gate; the read-only fixture is insufficient evidence. |

Final independent source review found no remaining blockers in the immediate repairs. It did not certify every proposed screen or human enjoyment.

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — pass.
- Full production client/server build: `node node_modules/tsx/dist/cli.mjs script/build.ts` — pass.
- `node scripts/verify-varsity-ui.mjs` — **169 checks passed**: 14 production page/viewport combinations, additional tablet widths, long names, absent footer, hidden rails, preserved destinations, ordinary/co-commissioner menu visibility, settings selection, Escape focus restoration, profile/reduced-motion behavior, portraits and read-only fixture protection.
- `node scripts/verify-game-presentation.mjs` — **183 assertions passed**: exact route coverage, all 80 proposal records, responsive book, player selection and compact inspector focus, real shared Table column buttons/native ArrowRight, and real ScrollArea PageDown access.
- Visual inspection: refreshed the user's built roster tab and opened the playbook in the in-app browser. Screenshots retained above. Git whitespace check passes.

The first shell test attempt asserted focus before the sheet's exit animation completed. The check now polls for returned focus and passes; no arbitrary delay or product workaround was added. An earlier recruiting assertion was corrected to target the desktop command grid only where that component actually renders.

These are local synthetic visual/component checks, not full authenticated gameplay, touch-device enjoyment research, Steam certification or all 80 production-state walkthroughs. Remaining W12 usability and release gates stay open.

## Local preview and next implementation

From the repository, run `node scripts/preview-art.mjs` for `http://127.0.0.1:49744/screen-book.html#roster`. After a production build, `node scripts/preview-varsity.mjs` serves the read-only game at `http://127.0.0.1:49745/league/varsity-demo/roster`. Both bind to loopback; they must be running for local links to work. No machine paths are stored in committed configuration.

Recommended first design implementation pass: persistent roster inspector and depth/lineup workspace, then recruiting desk and the prepare/report/review game loop. Verify real roles, mode distinctions, missing-data states and interrupted work before extending the pattern. Follow the priorities and acceptance criteria in the canonical plan. Existing backend integrity work continues on its recorded dependency path.
