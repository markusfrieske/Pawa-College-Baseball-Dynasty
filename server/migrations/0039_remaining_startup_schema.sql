-- 0039: All remaining startup-runner DDL
-- Extracted from the sequential startup runner so schema DDL lives only in
-- numbered migration files and is never executed inline during server startup.

-- ── _startup_migrations tracking table ───────────────────────────────────────
-- Required by the legacy sequential runner for one-shot data migrations.
CREATE TABLE IF NOT EXISTS _startup_migrations (
  key     text PRIMARY KEY,
  ran_at  timestamp DEFAULT now()
);

-- ── drop-pitch-ch-binary ─────────────────────────────────────────────────────
-- Already in 0037; repeated here with IF EXISTS so it is safe on fresh DBs.
ALTER TABLE players  DROP CONSTRAINT IF EXISTS players_pitch_ch_binary;
ALTER TABLE recruits DROP CONSTRAINT IF EXISTS recruits_pitch_ch_binary;

-- ── recruiting_interests unique index ────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruiting_interests_recruit_team
  ON recruiting_interests (recruit_id, team_id);

-- ── recruiting_actions_log weekly/seasonal unique indexes ────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_weekly
  ON recruiting_actions_log (recruit_id, team_id, season, week, action_type)
  WHERE action_type IN ('email', 'phone');

CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_seasonal
  ON recruiting_actions_log (recruit_id, team_id, season, action_type)
  WHERE action_type IN ('visit', 'head_coach_visit', 'offer');

-- ── v3 archetype-aware development columns on players ────────────────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS play_archetype_id          text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_caps           jsonb        NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_seed           text         NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_model_version  integer      NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_development_season    integer;

-- ── recruit_top_schools unique index ─────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruit_top_schools_recruit_team
  ON recruit_top_schools (recruit_id, team_id);

-- ── league editor: editor_version cols + audit tables ───────────────────────
ALTER TABLE teams   ADD COLUMN IF NOT EXISTS editor_version                          integer NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS editor_version                          integer NOT NULL DEFAULT 1;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS commissioner_competitive_edits_enabled  boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS league_edit_batches (
  id                  varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           varchar   NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  actor_id            varchar   NOT NULL,
  entity_type         text      NOT NULL,
  entity_id           varchar   NOT NULL,
  reason              text      NOT NULL,
  effective_season    integer,
  idempotency_key     text      NOT NULL,
  is_reversed         boolean   NOT NULL DEFAULT false,
  reversed_by_batch_id varchar,
  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_edit_changes (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    varchar NOT NULL REFERENCES league_edit_batches(id) ON DELETE CASCADE,
  field_name  text    NOT NULL,
  before_json jsonb,
  after_json  jsonb
);

CREATE INDEX IF NOT EXISTS idx_edit_batches_league_id ON league_edit_batches (league_id);
CREATE INDEX IF NOT EXISTS idx_edit_batches_idem      ON league_edit_batches (league_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_edit_changes_batch_id  ON league_edit_changes  (batch_id);

-- ── league editor v1b: stadium_name identity field ───────────────────────────
ALTER TABLE teams ADD COLUMN IF NOT EXISTS stadium_name text;
