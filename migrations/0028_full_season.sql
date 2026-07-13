-- 0028_full_season.sql
-- Full Season feature: additive schema migration.
-- Safe for both fresh installs (creates tables) and upgraded installs (patches
-- existing tables that were created by the old startup migration blocks).
-- No DROP TABLE operations.

-- ── leagues table ────────────────────────────────────────────────────────────
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS rules_version integer,
  ADD COLUMN IF NOT EXISTS current_phase_step text,
  ADD COLUMN IF NOT EXISTS dynasty_preset text DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS rules_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS catalog_version text,
  ADD COLUMN IF NOT EXISTS schedule_seed text;

UPDATE leagues
  SET dynasty_preset = 'custom'
  WHERE dynasty_preset IS NULL OR dynasty_preset = '';

-- ── postseason_tournaments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postseason_tournaments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id),
  season integer NOT NULL,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  winner_id varchar,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_ps_tournaments_league_season
  ON postseason_tournaments (league_id, season);
CREATE INDEX IF NOT EXISTS idx_ps_tournaments_league_stage
  ON postseason_tournaments (league_id, season, stage);

-- ── postseason_entries ────────────────────────────────────────────────────────
-- tournament_id is nullable: FS entries reference league_id/season instead.
CREATE TABLE IF NOT EXISTS postseason_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id varchar REFERENCES postseason_tournaments(id),
  team_id varchar NOT NULL,
  seed integer,
  bracket text,
  status text NOT NULL DEFAULT 'active',
  league_id varchar,
  season integer,
  qualification_type text,
  national_seed integer,
  selection_score real,
  selection_reason text,
  bracket_lane text
);
-- Patch: old startup-migration block created tournament_id NOT NULL — drop that.
ALTER TABLE postseason_entries ALTER COLUMN tournament_id DROP NOT NULL;
-- Add FS-specific columns for any pre-existing table.
ALTER TABLE postseason_entries
  ADD COLUMN IF NOT EXISTS league_id varchar,
  ADD COLUMN IF NOT EXISTS season integer,
  ADD COLUMN IF NOT EXISTS qualification_type text,
  ADD COLUMN IF NOT EXISTS national_seed integer,
  ADD COLUMN IF NOT EXISTS selection_score real,
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS bracket_lane text;
CREATE INDEX IF NOT EXISTS idx_ps_entries_tournament
  ON postseason_entries (tournament_id);
CREATE INDEX IF NOT EXISTS idx_ps_entries_team
  ON postseason_entries (team_id);
CREATE INDEX IF NOT EXISTS idx_ps_entries_league_season
  ON postseason_entries (league_id, season);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_entries_league_season_team
  ON postseason_entries (league_id, season, team_id);

-- ── postseason_series ─────────────────────────────────────────────────────────
-- tournament_id is nullable: FS series reference league_id/season/stage instead.
CREATE TABLE IF NOT EXISTS postseason_series (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id varchar REFERENCES postseason_tournaments(id),
  home_team_id varchar,
  away_team_id varchar,
  round integer NOT NULL DEFAULT 1,
  bracket_slot text,
  home_score integer,
  away_score integer,
  winner_id varchar,
  is_complete boolean NOT NULL DEFAULT false,
  game_number integer NOT NULL DEFAULT 1,
  played_at timestamp,
  league_id varchar,
  season integer,
  stage text,
  best_of integer DEFAULT 3,
  home_wins integer NOT NULL DEFAULT 0,
  away_wins integer NOT NULL DEFAULT 0,
  series_status text NOT NULL DEFAULT 'pending'
);
-- Patch: old startup-migration block created tournament_id NOT NULL — drop that.
ALTER TABLE postseason_series ALTER COLUMN tournament_id DROP NOT NULL;
-- Add FS-specific columns for any pre-existing table.
ALTER TABLE postseason_series
  ADD COLUMN IF NOT EXISTS league_id varchar,
  ADD COLUMN IF NOT EXISTS season integer,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS best_of integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS home_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS series_status text NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_ps_series_tournament
  ON postseason_series (tournament_id);
CREATE INDEX IF NOT EXISTS idx_ps_series_bracket_slot
  ON postseason_series (tournament_id, bracket_slot);
CREATE INDEX IF NOT EXISTS idx_ps_series_league_season
  ON postseason_series (league_id, season);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_series_league_season_slot
  ON postseason_series (league_id, season, stage, bracket_slot);

-- ── league_jobs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_jobs_league_status
  ON league_jobs (league_id, status);
CREATE INDEX IF NOT EXISTS idx_league_jobs_created
  ON league_jobs (created_at);
