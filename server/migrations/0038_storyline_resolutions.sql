-- 0038: Storyline resolutions idempotency ledger
-- Extracted from storyline-resolutions-v1 startup migration (idempotent DDL).

CREATE TABLE IF NOT EXISTS storyline_resolutions (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      varchar NOT NULL UNIQUE REFERENCES storyline_events(id),
  winning_choice text NOT NULL,
  vote_snapshot_hash text,
  effect_snapshot    jsonb,
  before_ratings     jsonb,
  after_ratings      jsonb,
  resolved_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storyline_resolutions_event_id ON storyline_resolutions(event_id);
