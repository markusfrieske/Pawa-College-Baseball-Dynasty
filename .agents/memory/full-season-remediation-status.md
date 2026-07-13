---
name: Full Season remediation plan status
description: Which phases of the 8-phase Full Season remediation are complete vs remaining, and the key decisions made.
---

## Completed phases

**Phase 1** — Startup migrations: removed destructive v1/v2/v3 DROP TABLE blocks; replaced with additive v4 that patches missing columns and makes tournament_id nullable. Fresh-install migration at `migrations/0028_full_season.sql`.

**Phase 2** — CPU coach retirement: `server/routes/invites.ts` now retires the CPU coach (team.coachId, no userId) by setting teamId=null before creating the human coach on invite accept.

**Phase 3** — Exhibition games: removed `generateExhibitionGames` from `server/services/fullSeasonBootstrap.ts`. All four schedule entry-points (routes.ts, league-mgmt.ts×2, simulation.ts) now gate exhibition creation on `dynastyPreset !== "full_season"`.

**Phase 4** — Exact scheduler every season: created `server/services/schedule/createScheduleForSeason.ts`. Full Season leagues always use `buildFullSeasonSchedule` (4,172 games, validated, transactional). Custom leagues use legacy `generateSchedule`. All four schedule call-sites replaced.

**Phase 6** — Custom recruiting formula: `computeRecruitPoolSize` in `shared/catalog/index.ts` now returns `Math.min(numTeams * 5 + 10, 75)` for all non-FS leagues (was returning 80 flat). Validator test expectations updated.

## Remaining phases

**Phase 5** — Postseason persistence/retry safety: unique keys prevent duplicates, idempotent advance, transactional bracket creation, conference championships producing exactly 12 champions, 12 auto + 4 at-large national field.

**Phase 7** — 14-user multiplayer certification: run existing 14-user scenario against updated code; ensure resolveUserTeam pattern is used everywhere; server-side rejection of reporting/OCR endpoints for full_season leagues.

**Phase 8** — TypeScript errors: set explicit ES2022 target, fix FS scheduler iteration errors, startup migration callback typing, season-transition errors.

## Key rules

- `createScheduleForSeason` is now the authoritative schedule entry point — do not add direct calls to `generateSchedule` for any new code.
- Exhibition games must never run for `dynastyPreset === "full_season"`.
- `computeRecruitPoolSize` is for custom leagues only; `computeFullSeasonRecruitPoolSize` for FS.
- The v4 startup migration must never be re-run destructively; if schema changes are needed add a v5 additive block.
