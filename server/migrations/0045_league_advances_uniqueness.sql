-- 0045: Add partial uniqueness constraint to league_advances
--
-- Prevents duplicate in-flight or completed advances for the same league state.
-- The constraint applies only to rows with status 'running' or 'complete'; failed
-- rows are excluded so crash-recovery retries can insert freely.
--
-- The WHERE clause intentionally excludes 'failed' to allow the stale-op recovery
-- path in advanceLeagueStep to mark a row 'failed' and immediately insert a new
-- 'running' row for the same (league_id, from_phase, from_week, from_season).

CREATE UNIQUE INDEX IF NOT EXISTS uidx_league_advances_active
  ON league_advances (league_id, from_phase, from_week, from_season)
  WHERE status IN ('running', 'complete');
