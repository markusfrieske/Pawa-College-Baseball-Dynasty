---
name: Full Season remediation plan status
description: Which phases of the 8-phase Full Season remediation are complete vs remaining, and the key decisions made.
---

## All phases complete

**Phase 1** — Startup migrations: removed destructive DROP TABLE blocks; replaced with additive
migrations. Fresh-install migration at `migrations/0028_full_season.sql`.

**Phase 2** — CPU coach retirement: `server/routes/invites.ts` retires CPU coach (no userId)
before creating the human coach on invite accept.

**Phase 3** — Exhibition games: removed `generateExhibitionGames` from fullSeasonBootstrap.
All four schedule entry-points gate exhibition creation on `dynastyPreset !== "full_season"`.

**Phase 4** — Exact scheduler every season: `createScheduleForSeason.ts` is the authoritative
entry point. Full Season leagues always use `buildFullSeasonSchedule` (4,172 games, validated,
transactional). Custom leagues use legacy `generateSchedule`.

**Phase 5** — Postseason idempotency (all three tiers):
- CC: TWO partial unique indexes on games (home_team_id AND away_team_id WHERE
  phase='conference_championship'). Together they prevent any team appearing in more than one
  CC game per league/season. CC insert uses raw SQL ON CONFLICT DO NOTHING. Standings sort
  uses team.id.localeCompare() as stable final tiebreaker.
- SR/CWS: `createPostseasonSeries` uses .onConflictDoNothing() with fallback read in storage.ts.

**Phase 6** — Custom recruiting formula: `computeRecruitPoolSize` returns
`Math.min(numTeams * 5 + 10, 75)` for non-FS leagues.

**Phase 7/8** — Schedule fairness, publish correctness, and advance guard:
- Scheduler: 1000-seed validator passes (26-30 home, diff ≤4, ≥8 unique OOC opps, pair ≤3).
- Human lineup preservation: isCpu guards in routes.ts and fullSeasonBootstrap.ts.
- Publish: _buildAndPublish does week-level locking (lockedWeeks = weeks with ≥1 completed
  game). Deletes and inserts only affect unlocked weeks. No duplicates on republish.
- Two public functions: createScheduleForSeason (idempotent initial) vs publishFullSeasonSchedule
  (commissioner explicit republish, never short-circuits).
- scheduleVersion: integer column on leagues, bumped atomically in every publish tx.
- API: GET /api/leagues/:id/schedule/preview (pure), POST /api/leagues/:id/schedule/publish.
- Phase advance blocked: simulation.ts pre-checks all CC games complete before seeding.
  selection.ts throws (not warns) when CC winner missing for any conference.
- Determinism: ORDER BY id on getTeamsByLeague and getConferencesByLeague in storage.ts.

## Key rules

- `createScheduleForSeason` = initial creation only (early-returns if already complete).
  `publishFullSeasonSchedule` = commissioner republish (never short-circuits).
- Exhibition games must never run for `dynastyPreset === "full_season"`.
- CC unique constraint requires BOTH home and away indexes — one alone is insufficient because
  concurrent requests with unstable tie ordering can produce different home/away assignments.
- `_buildAndPublish` must query lockedWeeks BEFORE opening the transaction (storage queries
  don't work inside a drizzle transaction that uses the same pool connection).
- Startup migrations v4 and v5 are additive-only; for any future schema change add a v6+ block.
