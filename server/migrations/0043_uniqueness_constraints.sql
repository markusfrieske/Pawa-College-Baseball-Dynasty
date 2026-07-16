-- Migration: Add DB-level uniqueness guarantees for league-scoped entities.
--
-- 1. coaches: one coach record per (user, league) pair.
--    Prevents a user from being associated with multiple teams in the same league
--    via race conditions or duplicate inserts.
--
-- 2. standings: one standings row per (league, team) pair.
--    Prevents double-counting in rankings caused by duplicate rows.
--
-- 3. league_advances (partial unique index): at most one 'running' advance
--    operation per league at any time.  Combined with the in-process advance lock
--    this gives a two-layer exclusivity guarantee.
--
-- All use IF NOT EXISTS / CREATE UNIQUE INDEX ... IF NOT EXISTS so re-applying
-- the migration is safe.

-- coaches uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uidx_coaches_user_league
  ON coaches (user_id, league_id)
  WHERE user_id IS NOT NULL;

-- standings uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uidx_standings_league_team
  ON standings (league_id, team_id);

-- league_advances: only one running advance per league at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_league_advances_running
  ON league_advances (league_id)
  WHERE status = 'running';
