-- 0030: Column additions to existing tables
-- All statements use IF NOT EXISTS / idempotent DDL.

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS phase_deadline TIMESTAMP;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS show_ready_names_to_all boolean NOT NULL DEFAULT false;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS last_digest_at TIMESTAMP;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS commissioner_competitive_edits_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE league_events ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_name text;
ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_ovr integer;
ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_stars integer;

ALTER TABLE players ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS editor_version integer NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS play_archetype_id text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_caps jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_seed text NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN IF NOT EXISTS development_model_version integer NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_development_season integer;

ALTER TABLE recruits ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb;
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS nil_cost integer NOT NULL DEFAULT 0;

ALTER TABLE player_history ADD COLUMN IF NOT EXISTS source_player_id varchar;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS national_rank integer NOT NULL DEFAULT 149;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_national_rank integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS recruiting_rank_boost real NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_prestige integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_facilities integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_academics integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_stadium integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_college_life integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS prestige_baseline integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS facilities_baseline integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS academics_baseline integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS stadium_baseline integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS college_life_baseline integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS editor_version integer NOT NULL DEFAULT 1;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS stadium_name text;

ALTER TABLE saved_recruiting_classes ADD COLUMN IF NOT EXISTS is_sealed boolean NOT NULL DEFAULT false;
ALTER TABLE saved_recruiting_classes ADD COLUMN IF NOT EXISTS source_version_id varchar;
ALTER TABLE saved_recruiting_classes ADD COLUMN IF NOT EXISTS source_content_hash text;

ALTER TABLE recruiting_class_shares ALTER COLUMN class_id DROP NOT NULL;
ALTER TABLE recruiting_class_shares ALTER COLUMN token DROP NOT NULL;
ALTER TABLE recruiting_class_shares ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE recruiting_class_shares ADD COLUMN IF NOT EXISTS version_id varchar;
ALTER TABLE recruiting_class_shares ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE recruiting_class_shares ADD COLUMN IF NOT EXISTS max_imports integer;
