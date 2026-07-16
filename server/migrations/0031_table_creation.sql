-- 0031: Create missing tables and basic indexes

CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

CREATE TABLE IF NOT EXISTS advance_digests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id),
  season integer NOT NULL,
  week integer NOT NULL,
  phase text NOT NULL,
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  categories json NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advance_digests_league_id ON advance_digests (league_id);

CREATE TABLE IF NOT EXISTS league_save_states (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id),
  season integer NOT NULL,
  week integer NOT NULL,
  phase text NOT NULL,
  label text NOT NULL,
  trigger text NOT NULL,
  created_by_user_id varchar,
  snapshot_data jsonb NOT NULL,
  restored_at timestamp,
  restored_by_user_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_save_states_league_id ON league_save_states (league_id);

CREATE TABLE IF NOT EXISTS league_edit_batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  actor_id varchar NOT NULL,
  entity_type text NOT NULL,
  entity_id varchar NOT NULL,
  reason text NOT NULL,
  effective_season integer,
  idempotency_key text NOT NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_by_batch_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_edit_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id varchar NOT NULL REFERENCES league_edit_batches(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  before_json jsonb,
  after_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_edit_batches_league_id ON league_edit_batches(league_id);
CREATE INDEX IF NOT EXISTS idx_edit_batches_idem ON league_edit_batches(league_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_edit_changes_batch_id ON league_edit_changes(batch_id);
