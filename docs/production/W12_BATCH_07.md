# W12 batch 07 — Recruiting board and persistent dossier

Frisk authorized manual continuation into the recruiting screen. Scheduled development remains paused.

## Implemented

Compact aligned prospect rows select one persistent dossier instead of expanding the board. The selected row uses cream; keyboard focus and Up/Down selection agree. A portal preserves each keyed RecruitRow's existing action closures, local picker/note state and disclosure code while moving its detail into the right pane. Comparison, notes, board rank, targeting and recruiting actions remain available. Resource balances and actual position needs stay above the board; detailed filters and intelligence remain deliberate disclosures.

The board and dossier have bounded, independently scrollable panes without visible browser scrollbar chrome; both panes accept keyboard focus. Board pagination remains24 per page, with native wheel/focused-pane scrolling and focused-row arrows for within-page navigation. Costs reuse the existing1-scout/2-phone/1-email rules and per-recruit visit costs. No new mechanics or inferred private ratings are introduced.

At short PC heights the spend group precedes secondary identity/detail content. This is a functional scene integration; the reused dossier content still needs richer portrait/editorial composition and a more focused action-group design before full art-brief closure.

## Audit and fixes

Independent read-only game-dev source audit identified P2 receipt-return focus/dossier mismatch, P2 arrow navigation starting from stale selection after Tab, and P2 mutation-driven sorting moving the selected recruit off-page. Fixed return selection, summary focus synchronization and data-refresh page alignment. Regression tests cover focus/arrow navigation, no spending on selection, same selected recruit after scouting and failed scouting, and note retry. Cross-page mutation reorder/receipt-return alignment received source review; it is not claimed as a dedicated runtime test.

Runtime exposed a RetroCard that does not forward arbitrary data attributes; selected styling/assertion now uses an explicit class and semantic aria-pressed on selection buttons. Grid intrinsic sizing and the old full-page minimum height caused overflow; corrected bounded grid rows and shell-relative sizing, then verified real rendered geometry.

## Evidence

Typecheck and production build pass. scripts/verify-management-workspaces.ts runs real registered HTTP routes and a fresh migrated disposable PostgreSQL database with30 synthetic prospects in simulated and reported modes. **117 checks passed** on the final gate. Coverage includes successful scouting and exact scout debit, failed scouting with unchanged budget/selection, target persistence, live comparison knowledge, notes failure/draft/retry, and existing game-report checks.

New scene gates:1280x720,1366x768,1920x1080,2560x1440,3440x1440 normal board has no document or horizontal overflow. All six spend-entry controls are in view at1366x768; independent local check also confirmed1280x768. Visually inspected1366x768 screenshot of the populated built game. Full internal detail remains accessible by scrolling; expanded filters/alerts/intelligence can grow the document. No claim of native zoom, every long-name scenario, Steam/controller readiness or enjoyment testing.

## Remaining

Dossier portrait hierarchy and single focused action-group refinement; explicit internal scroll-position/range cues; full long-name/text-scaling/accessibility campaign; regression for cross-page mutation reorder; human task/enjoyment study. Clubhouse and other screens still need their individual migrations. Recruiting disclosure/business rules were reused, not comprehensively re-audited here. W12/UX-06 remains implementing. No real saves or production data changed.

