---
name: Full Season remediation plan status
description: Which phases of the 8-phase Full Season remediation are complete vs remaining, and the key decisions made.
---

## All phases complete (task #1345 fully resolved)

**Phase 1** — Startup migrations: removed destructive v1/v2/v3 DROP TABLE blocks; replaced with additive v4 that patches missing columns and makes tournament_id nullable. Fresh-install migration at `migrations/0028_full_season.sql`.

**Phase 2** — CPU coach retirement: `server/routes/invites.ts` now retires the CPU coach (team.coachId, no userId) by setting teamId=null before creating the human coach on invite accept.

**Phase 3** — Exhibition games: removed `generateExhibitionGames` from `server/services/fullSeasonBootstrap.ts`. All four schedule entry-points (routes.ts, league-mgmt.ts×2, simulation.ts) now gate exhibition creation on `dynastyPreset !== "full_season"`.

**Phase 4** — Exact scheduler every season: created `server/services/schedule/createScheduleForSeason.ts`. Full Season leagues always use `buildFullSeasonSchedule` (4,172 games, validated, transactional). Custom leagues use legacy `generateSchedule`. All four schedule call-sites replaced.

**Phase 5** — Postseason idempotency (all three tiers):
- CC: partial unique index `idx_games_cc_league_season_home` on `games(league_id, season, home_team_id) WHERE phase='conference_championship'` via startup migration v5. CC insertion uses `pool.query INSERT ... ON CONFLICT DO NOTHING`.
- SR/CWS: `createPostseasonSeries` already uses `.onConflictDoNothing()` with fallback read in storage.ts.

**Phase 6** — Custom recruiting formula: `computeRecruitPoolSize` in `shared/catalog/index.ts` now returns `Math.min(numTeams * 5 + 10, 75)` for all non-FS leagues.

**Phase 7/8** — Schedule fairness & atomic publish:
- `fullSeasonScheduler.ts` fully rewritten: 1000-seed validator passes (26-30 home, diff ≤4, ≥8 unique OOC opps, pair ≤3 meetings).
- Human lineup preservation: `isCpu` guards added to routes.ts and fullSeasonBootstrap.ts.
- Atomic publish: single `db.transaction()` that: (a) deletes only unlocked games, (b) inserts schedule chunks, (c) bumps `scheduleVersion` via COALESCE SQL, (d) writes audit_log row.
- `scheduleVersion` integer column added to leagues table (schema.ts + startup migration v5).
- `GET /api/leagues/:id/schedule/preview` endpoint: pure function, no DB writes, commissioner-only.

## Key rules

- `createScheduleForSeason` is the authoritative schedule entry point — do not add direct calls to `generateSchedule` for any new code.
- Exhibition games must never run for `dynastyPreset === "full_season"`.
- `computeRecruitPoolSize` is for custom leagues only; `computeFullSeasonRecruitPoolSize` for FS.
- Startup migrations v4 and v5 are additive-only; for any future schema change add a v6+ block.
- `repairOocOvermetPairs` must be called BEFORE `repairHomeAwayBalance`, and homeCount/awayCount must be recomputed from allGames between the two repairs.
- CC unique constraint is a partial index (WHERE phase='conference_championship'), not a table-level constraint, so the `ON CONFLICT DO NOTHING` must be raw SQL (not Drizzle `.onConflictDoUpdate`).
