---
name: Full Season remediation plan status
description: Which phases of the 8-phase Full Season remediation are complete vs remaining, and the key decisions made.
---

## All phases complete

**Phase 1** — Startup migrations: removed destructive v1/v2/v3 DROP TABLE blocks; replaced with additive v4 that patches missing columns and makes tournament_id nullable. Fresh-install migration at `migrations/0028_full_season.sql`.

**Phase 2** — CPU coach retirement: `server/routes/invites.ts` now retires the CPU coach (team.coachId, no userId) by setting teamId=null before creating the human coach on invite accept.

**Phase 3** — Exhibition games: removed `generateExhibitionGames` from `server/services/fullSeasonBootstrap.ts`. All four schedule entry-points (routes.ts, league-mgmt.ts×2, simulation.ts) now gate exhibition creation on `dynastyPreset !== "full_season"`.

**Phase 4** — Exact scheduler every season: created `server/services/schedule/createScheduleForSeason.ts`. Full Season leagues always use `buildFullSeasonSchedule` (4,172 games, validated, transactional). Custom leagues use legacy `generateSchedule`. All four schedule call-sites replaced.

**Phase 5** — Postseason idempotency: CC uses `existingCCByConf` set (skips conferences already with a CC game); SR has per-series existence guards; CWS uses `upsertCWSBracketSeries` with ON CONFLICT path throughout.

**Phase 6** — Custom recruiting formula: `computeRecruitPoolSize` in `shared/catalog/index.ts` now returns `Math.min(numTeams * 5 + 10, 75)` for all non-FS leagues (was returning 80 flat). Validator test expectations updated.

**Phase 7/8** — Schedule fairness & correctness (task #1345):
- `fullSeasonScheduler.ts` fully rewritten: deterministic OOC matching (seeded shuffle + full-scan greedy + `repairOocOvermetPairs` post-fix + `repairHomeAwayBalance` swap pass). 1000-seed validator passes (26-30 home, diff ≤4, ≥8 unique OOC opps, pair ≤3 meetings).
- Human lineup preservation: `isCpu` guards added to `server/routes.ts:1374`, `server/services/fullSeasonBootstrap.ts:141` (simulation.ts:5399 was already guarded).
- Atomic publish: `createFullSeasonSchedule` wraps delete + chunked insert in `db.transaction()`.

## Key rules

- `createScheduleForSeason` is the authoritative schedule entry point — do not add direct calls to `generateSchedule` for any new code.
- Exhibition games must never run for `dynastyPreset === "full_season"`.
- `computeRecruitPoolSize` is for custom leagues only; `computeFullSeasonRecruitPoolSize` for FS.
- The v4 startup migration must never be re-run destructively; if schema changes are needed add a v5 additive block.
- `repairOocOvermetPairs` must be called BEFORE `repairHomeAwayBalance`, and homeCount/awayCount must be recomputed from allGames between the two repairs.
