-- 0029_recruiting_balance_v2.sql
-- Phase A: Recruiting Balance V2 foundation.
-- Additive-only, idempotent. No DROP operations.

-- ── leagues: balance version ──────────────────────────────────────────────────
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS recruiting_balance_version integer DEFAULT 2;

-- ── team_recruiting_ledgers ───────────────────────────────────────────────────
-- Tracks per-turn budget caps and spending for V2 recruiting economy.
-- Unique key: one row per (league, team, season, turn).
CREATE TABLE IF NOT EXISTS team_recruiting_ledgers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id),
  team_id varchar NOT NULL REFERENCES teams(id),
  season integer NOT NULL,
  recruiting_turn_index integer NOT NULL,
  contact_cap integer NOT NULL DEFAULT 0,
  contact_spent integer NOT NULL DEFAULT 0,
  scout_cap integer NOT NULL DEFAULT 0,
  scout_spent integer NOT NULL DEFAULT 0,
  targets_cap integer NOT NULL DEFAULT 0,
  visits_combined_cap integer NOT NULL DEFAULT 0,
  campus_visit_cap integer NOT NULL DEFAULT 0,
  head_coach_visit_cap integer NOT NULL DEFAULT 0,
  rules_version integer NOT NULL DEFAULT 2,
  created_at timestamp DEFAULT now(),
  UNIQUE (league_id, team_id, season, recruiting_turn_index)
);

CREATE INDEX IF NOT EXISTS idx_team_recruiting_ledgers_league_team
  ON team_recruiting_ledgers (league_id, team_id, season);
