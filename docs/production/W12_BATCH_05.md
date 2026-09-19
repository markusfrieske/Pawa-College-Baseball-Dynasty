# W12 batch 05 — PC frame and roster scene

Frisk manually authorized the PC frame and roster implementation. Scheduled development remains paused.

## Delivered scope

- Shared compact Class of Nine masthead and primary chapter navigation replace the permanent website sidebar. Existing secondary destinations remain in Game menu, including permission-gated commissioner access. Real team, season, week, phase and mode context; no simulated controller prompts.
- Roster comparison ledger sits beside a persistent media-day athlete panel. Stored portrait identity and team color are preserved. Selected ratings retain zero and display unknown as an em dash.
- Eight rows at720p/768p and twelve at1080p and taller, with explicit range/Previous/Next. Focused player arrows select; Enter opens existing profile; Page Up/Down changes pages and restores focus. Existing profile/captain/save/edit permissions and APIs retained.
- Existing search/position/year/sort controls reset paging; player profile close preserves list position. Hometown moves from repeated comparison column into selected detail.

## Independent source audit

Game-dev source audit against the PC guide and roster brief found: P1 paging focus lost after unmount; P2 fixed eight-row density at1080p; misleading visible-only header count; P2 boundary paging could disagree with focused identity. All corrected, with actual paging/boundary regression coverage. Portrait/unknown-value and mutation permission source review found no new bypass.

## Runtime evidence

TypeScript and production build pass. Expanded scripts/verify-roster-context.ts runs built UI, registered HTTP and fresh migrated synthetic PostgreSQL in simulated and reported modes. Final result: **303 checks passed**. The boundary assertion initially mixed innerText with textContent; corrected to compare rendered text consistently, then reran successfully. Existing role isolation, portrait persistence, editor reversal, saved lineup and failure/retry checks remain included.

Measured normal roster viewport fit at1280x720,1366x768,1920x1080,2560x1440,3440x1440; no horizontal/document overflow in these synthetic fixtures. Visual screenshot inspected at1366x768. These are browser runtime measurements, not Steam or human enjoyment evidence.

## Remaining scope

W12/UX-06 remains implementing. Ratings/Batting/Pitching comparison lenses, richer metric comparison, header sort/slash shortcut, native zoom/accessibility campaign, long-name/full-data stress coverage, controller/Steam integration and unfamiliar-coach enjoyment sessions remain. Other pages inherit the top navigation, not a completed individual screen redesign. Expanded captain controls and high text scaling may require vertical scrolling; content is not clipped to fake viewport fit. No saves migrated or production data used.

