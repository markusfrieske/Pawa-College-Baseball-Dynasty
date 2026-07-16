-- Migration: Durable advance-operation tracking table
-- Each row represents one in-flight or completed weekly advance, enabling
-- crash recovery (commissioner can see stuck operations and clear them)
-- and strict "exactly-one advance per week" semantics alongside the
-- existing league_advance_locks table.

CREATE TABLE IF NOT EXISTS league_advances (
  id          varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   varchar   NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  -- running | complete | failed
  status      text      NOT NULL DEFAULT 'running',
  from_phase  text      NOT NULL,
  from_week   integer   NOT NULL,
  from_season integer   NOT NULL,
  -- JSON map of completed substep names → timestamps (for idempotent re-run)
  checkpoints jsonb     NOT NULL DEFAULT '{}',
  -- UUID of the server instance that claimed this operation (same as advance lock token)
  locked_by   text      NOT NULL,
  -- After this timestamp a different process may declare the operation abandoned
  lease_expires_at timestamp NOT NULL,
  error_message text,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_advances_league_status
  ON league_advances (league_id, status);
