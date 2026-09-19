# W12 batch 10 — Recruiting evaluation sheet

Manual continuation authorized by Frisk. Scheduling remains paused. This delivers the dossier presentation slice, not a complete recruiting-integrity milestone.

## Implemented

The persistent prospect dossier now has Recruitment and Evaluation chapters. Evaluation uses a flat cream sheet with full core/common labels, shared PAWA grade palettes, actual known values, unknown placeholders and explicit arrival locks. Overall uses the supplied scouting range; missing bounds stay Unknown. It includes catcherAbility for catchers. Identified pitches use the approved segments (binary FB/2S one red notch; break strength remains unknown below50%). Canonical pitch inventory includes HSL/CCH, plus legacy SPL only under the existing full-reveal compatibility gate. Special abilities use disclosed counts and native keyboard-operable descriptions. No unseen total ability count is printed.

Recruitment preserves existing target, scout, call, email, visit, offer, notes and comparison behavior. Transfer stats/trajectory and existing prospect biography stay on that chapter. Evaluation carries the prospect name/location for context. Signing-locked fields are rejected both by caller and sheet. No derived rating range or invented biography was added. The legacy blue-chip/full-reveal exception remains unchanged; arrival-first disclosure is not universally implemented yet.

## Independent source audit

team_scene_review reviewed existing disclosure contracts and the new component. P2 missing catcher row fixed; component-level signing-lock defense added. No new display leak identified at current caller. Existing pitch inventory omission fixed in the new evaluation. Source review is not runtime/security proof.

**TI-15 · P1 · OPEN RELEASE BLOCKER:** The pre-existing recruiting list DTO spreads raw recruit data and nulls only signing holdbacks. It also returns actual potential. Therefore unknown UI values remain discoverable from the response. Reproduction: authenticate as a member coach with0% scouting, GET the league recruiting endpoint and inspect exact unscouted attributes/overall/potential/abilities versus the UI. Source: [recruiting route](../../server/routes/recruiting.ts), maskedRecruit construction and potential: actualPotential return. The separate recruit-detail endpoint in league-mgmt.ts and action responses also require the same audit. This patch adds UI containment only and does not resolve the transport leak.

Acceptance for TI-15: one authoritative disclosure projection for ordinary coach list/detail/action responses; absent hidden exact values at0/25/49/50/99/100%; signing locks, arrival, special-ability counts, all pitch aliases, elite exceptions and commissioner access explicitly tested through real HTTP; known consumers continue functioning. Review raw-value filtering/sorting/derived hints as inference channels. Do not silently change blue-chip/gem policy to simplify the fix. This is the next production priority before further Arrival work. Broader alias/holdback-key inconsistencies discovered in source remain part of that audit.

## Runtime and visual evidence

Production build and TypeScript pass. Expanded verify-management-workspaces.ts: **209 checks passed** with disposable migrated PostgreSQL and registered HTTP routes in both game modes. Existing real scouting/debit/failure/selection/notes/compare/report checks remain. Additional presentation-only adversarial DTO fixtures deliberately retain hidden sentinel values at0/25/49/50/99/100% and verify the sheet does not render them. Tests cover arrival-locked control, unknown stamina, earned velocity, overall ranges, pitch absence/type-only/seven-step states, HSL/CCH, catcher known/locked, and keyboard special-ability description. These fixtures do not establish server secrecy.

An initial chapter build failed the spend-control visibility gate because an old first-of-type selector selected the new tabs. Replaced positional selector with explicit c9-prospect-main class; rebuilt and reran all checks successfully. Visual review inspected the built board and scrolled evaluation in the retained synthetic preview. Five PC size gates remain in the harness. At short heights the evaluation pane scrolls by wheel or keyboard; it is not claimed to fit all ratings simultaneously. No production saves touched; no controller/zoom/human-enjoyment/Steam release claim. W12/UX-06 remains implementing.
