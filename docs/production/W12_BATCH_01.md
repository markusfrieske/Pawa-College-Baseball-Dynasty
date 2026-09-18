# W12 batch 01 — roster context and edit contract

September 18, 2026. Implementation: `7a25cee`. Early dependency repair on `codex/pawa-quality-overhaul`; W12 is not complete.

The [screen review](../art-direction/2026-09-18/GAME_SCREEN_REVIEW.md) left real roster API/role integration as a prerequisite for the proposed inspector. Source review confirmed that the roster expected a nested league object although the API returns league fields at the root. Commissioner edits were hidden, development phases were missed, and depth-chart week/export season silently fell back to one. Revealing the editor exposed a second defect: its full-form payload contained forbidden fields and defaulted valid zero ratings to 50.

## Delivered

- The roster's typed league DTO matches the existing endpoint. Current phase, week and season reach development, pitcher availability, export name and export provenance.
- Commissioner and co-commissioner visibility matches the server's existing policy. Own-team controls match the authenticated coach to the returned team, including an explicitly selected own team. Opponent draft controls require commissioner authority. Server permissions are unchanged.
- The editor sends only changed supported fields, with player ID solely in the URL. Appearance/handedness and derived overall/stars are read-only here. Unchanged legacy RS eligibility and SP position are preserved. Untouched nulls and zero ratings remain unchanged; changed numbers validate against server limits.
- Failed saves keep the editing draft and show the server error. No new gameplay rules, role permissions or broader screen proposal were introduced.

## Evidence

`node scripts/verify-roster-context.ts` passes **170 checks** against the built React pages, actual registered HTTP routes and an isolated numbered-migration PostgreSQL database. Both simulated and reported mode settings cover commissioner, co-commissioner, member, opponent and outsider access. It verifies real edit success, forbidden-field/cross-league refusal, database preservation of zero/null/RS/SP, current season export provenance, current week pitcher availability, own-team selection and opponent-control gating.

The additional 390px reported-mode co-commissioner case verifies invalid numeric rejection, retained draft after one injected HTTP 503 and successful real API retry, including a zero rating edit. This is response-failure recovery, not a database crash or transactional recovery test. Auth is injected into test-only sessions; login is not retested. Captain/draft control visibility is checked, but their mutation workflows are not executed.

Full TypeScript and production client/server build pass. The [independent audit](audits/W12_BATCH_01_AUDIT.md) found the editor payload issue before verification and source-reviewed the repaired implementation and test coverage. Parent ran the database/browser gate; the reviewer inspected its coverage and final log rather than independently rerunning it. No human-enjoyment, controller, role-revocation or Steam claim follows from this evidence.

The test initially failed because Express ignored the exact built HTML file under the dot-prefixed managed checkout. Serving that explicitly named file with the appropriate option corrected the harness. A second fixture failure exposed the existing server's OVR recalculation after identity edits; each independent mode rehearsal now resets its own synthetic eligibility inputs. No production rating policy changed.

Cleanup: all random test databases removed; only the retained synthetic baseline remained. Owned PostgreSQL stopped. Existing art/game preview processes were preserved. No production data, merge or deployment.

## Next

W12-ROSTER-01 is verified within the bounded acceptance below. Original UX-06 remains planned: full keyboard/touch lineup manipulation, zoom and unfamiliar-player research are still required. The proposed persistent inspector remains awaiting design review. Continue existing CPU/storyline/portal ownership work under W03 and the approved shared art direction independently; do not treat the screen proposal or arrival recipe as approved.
