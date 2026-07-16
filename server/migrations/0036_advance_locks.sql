-- 0036: League advance locks, coach uniqueness partial indexes, job lease columns
-- Extracted from security-hardening-v1 startup migration (idempotent DDL).

CREATE TABLE IF NOT EXISTS league_advance_locks (
  league_id varchar PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE league_advance_locks ADD COLUMN IF NOT EXISTS locked_by text;

-- Partial index: one human coach per (league, user) — cpu coaches have null user_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_league_user
  ON coaches (league_id, user_id)
  WHERE user_id IS NOT NULL;

-- Partial index: one human coach per (league, team).
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_league_team
  ON coaches (league_id, team_id)
  WHERE user_id IS NOT NULL AND team_id IS NOT NULL;

-- Job lease columns for expiry-based reclaim.
ALTER TABLE league_jobs ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE league_jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE league_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
