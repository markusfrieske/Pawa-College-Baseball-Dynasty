-- Durable history deliberately has no FK to replaceable recruits, teams or players.
CREATE TABLE IF NOT EXISTS arrival_records (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
 league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
 source_recruit_id varchar NOT NULL,
 team_id varchar NOT NULL,
 season integer NOT NULL CHECK (season > 0),
 schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
 player_snapshot jsonb NOT NULL,
 team_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(league_id,source_recruit_id)
);
CREATE INDEX IF NOT EXISTS arrival_records_league_season_idx ON arrival_records(league_id,season);
ALTER TABLE players ADD COLUMN IF NOT EXISTS arrival_source_recruit_id varchar;
CREATE UNIQUE INDEX IF NOT EXISTS players_arrival_source_unique ON players(arrival_source_recruit_id);
