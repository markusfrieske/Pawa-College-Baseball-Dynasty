-- Add personality & philosophy columns to coaches
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS personality text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS coaching_philosophy json DEFAULT '[]'::json;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS trait_badges json DEFAULT '[]'::json;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS career_milestones json DEFAULT '[]'::json;

-- Create coach_season_history table (one row per coach per completed season)
CREATE TABLE IF NOT EXISTS coach_season_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id varchar NOT NULL REFERENCES coaches(id),
  league_id varchar NOT NULL REFERENCES leagues(id),
  season integer NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  conf_wins integer NOT NULL DEFAULT 0,
  conf_losses integer NOT NULL DEFAULT 0,
  phase_result text NOT NULL DEFAULT 'regular_season',
  class_rank integer,
  class_score real,
  class_star_avg real,
  total_signed integer NOT NULL DEFAULT 0,
  top_recruit_name text,
  top_recruit_ovr integer,
  top_recruit_stars integer,
  team_name text NOT NULL DEFAULT '',
  team_abbr text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_coach_season_history_coach_id ON coach_season_history(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_season_history_league_id ON coach_season_history(league_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_season_history_unique ON coach_season_history(coach_id, league_id, season);

-- Add class_star_avg to existing coach_season_history rows that may exist (idempotent)
ALTER TABLE coach_season_history ADD COLUMN IF NOT EXISTS class_star_avg real;
-- Add team_id for per-season team attribution (coaches may change teams across dynasties)
ALTER TABLE coach_season_history ADD COLUMN IF NOT EXISTS team_id varchar;
