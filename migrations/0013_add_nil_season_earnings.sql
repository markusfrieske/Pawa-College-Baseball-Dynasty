CREATE TABLE IF NOT EXISTS nil_season_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT nil_season_earnings_unique UNIQUE (league_id, team_id, season, category)
);

CREATE INDEX IF NOT EXISTS nil_earnings_league_season ON nil_season_earnings (league_id, season);
CREATE INDEX IF NOT EXISTS nil_earnings_team ON nil_season_earnings (league_id, team_id);
