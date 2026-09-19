# W12 batch 04 — Approved cel portrait integration

Frisk approved the 30-face library and requested implementation. This batch adds explicit portrait assignment to existing game surfaces; it does not complete the separate PC screen redesign or arrival cinematic.

## Changes

- Migration 0055 adds validated nullable `portrait_id` columns to players, recruits and walk-ons. No automatic backfill, random reassignment, team-derived identity or alteration of legacy appearance fields.
- Shared player avatar/profile components use the approved library when an explicit ID is supplied, and retain legacy drawing for null. Roster, development, field, profile, recruiting, comparisons, signing, transfers, stories and play-by-play consumers pass the ID. Recruits use neutral uniform color; assigned players use the existing team color input.
- Commissioner roster editing includes a live portrait selector and a Legacy option. Saves retain ID independently of team color. Invalid IDs reject; existing commissioner permissions remain. Cosmetic-only saves and audited reversals preserve overall/star ratings instead of recalculating competitive state.
- Recruit/player/walk-on conversion paths carry the identity. Saved-class validation rejects malformed IDs. Saved-roster loading validates all requested portrait IDs before roster mutation, reuses the validated snapshots, rejects conflicting nested/top-level IDs and preserves omitted per-team identity.
- The renderer/component remains shared with the art library; no new face is generated on navigation. The approval and implementation boundary are recorded in the art guide.

## Audit

Independent read-only game-dev reviews identified missing portrait props in editor previews, current-batter cards and recruiting template thumbnails; these are fixed. It identified lifecycle copy/projection requirements and saved-template validation, then caught unconditional rating recalculation in the audited reversal path. Parent runtime tests independently caught the same class of rating side effect in ordinary batch assignment; portrait-only edits/reversals now preserve ratings.

An early source finding cited commented historical dynasty-start code; the reviewer corrected it to executable `dynastyStartService.ts`. Evidence refers to the executable path. A test initially selected the hidden compact roster rather than the visible desktop portrait; the locator now targets the visible instance. One review run overlapped a build's replacement of `dist`, causing a missing-index error; the final gate runs after the build completes.

## Verification and limits

The expanded `scripts/verify-roster-context.ts` gate covers real built UI, registered HTTP routes and a fresh numbered-migration PostgreSQL database in both simulated and reported modes. Added cases exercise commissioner selector preview/save/reload, null restoration, rejected IDs, denied ordinary-owner edits, displayed roster/profile identity, DB-backed team-color changes, unchanged ratings and audited reversal. Existing roster authority, rest, errors/retry and field checks remain.

`scripts/verify-portrait-identity.ts` passes ID/null/omitted/conflict validation, central signing/walk-on conversion across two teams and saved-class normalization. TypeScript and production build pass. The preceding library gate verified 30 assets and 90 recolor invariance cases.

Saved-template/start behavior and the other lifecycle copy branches were source-reviewed; complete end-to-end dynasty start, transfer, JUCO and archive journeys are not claimed. Historical player records have no portrait snapshot yet. Automatic assignment for generated classes and saved-roster management authoring remain future work. The new art is not yet assigned to every existing league player. Native Steam/controller support and human enjoyment are separate gates.

The retained local review fixture assigns portraits only to synthetic test players after passing the main gate and verifies the visible roster. No production data, deploy, main merge or automation restart.

Final gate result: **277 checks passed**, plus a retained-review check that the synthetic roster displays the assigned portraits. Final TypeScript, production build and identity-helper gates pass. Audited portrait-only reversal was also exercised through the actual editor HTTP endpoint and verified to restore null identity without changing overall/star ratings.
