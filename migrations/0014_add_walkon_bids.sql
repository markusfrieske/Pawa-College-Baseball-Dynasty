ALTER TABLE walkon_pool
  ADD COLUMN IF NOT EXISTS awarded_team_id TEXT,
  ADD COLUMN IF NOT EXISTS awarded_team_name TEXT,
  ADD COLUMN IF NOT EXISTS awarded_price INTEGER;

CREATE TABLE IF NOT EXISTS walkon_bids (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  league_id TEXT NOT NULL,
  walkon_pool_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  bid_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT walkon_bids_unique UNIQUE (walkon_pool_id, team_id)
);

CREATE INDEX IF NOT EXISTS walkon_bids_league ON walkon_bids (league_id);
CREATE INDEX IF NOT EXISTS walkon_bids_team ON walkon_bids (league_id, team_id);
CREATE INDEX IF NOT EXISTS walkon_bids_walkon ON walkon_bids (walkon_pool_id);
