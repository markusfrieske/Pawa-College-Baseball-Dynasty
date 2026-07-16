-- 0035: Schedule version counter + conference-championship duplicate prevention
-- Extracted from full-season-schema-v5 startup migration (idempotent DDL).

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS schedule_version integer NOT NULL DEFAULT 0;

-- Prevent concurrent CC-game creation from producing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_cc_league_season_home
  ON games (league_id, season, home_team_id)
  WHERE phase = 'conference_championship';

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_cc_league_season_away
  ON games (league_id, season, away_team_id)
  WHERE phase = 'conference_championship';
