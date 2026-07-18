-- 0049: launch-integrity constraints and durable leases.
-- This is the only production schema path for these changes. Do not mirror it
-- with drizzle-kit push or fire-and-forget startup DDL.

ALTER TABLE league_advance_locks
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

UPDATE league_advance_locks
   SET lease_expires_at = COALESCE(lease_expires_at, locked_at + interval '15 minutes')
 WHERE lease_expires_at IS NULL;

ALTER TABLE league_advance_locks
  ALTER COLUMN lease_expires_at SET DEFAULT (now() + interval '15 minutes');

ALTER TABLE league_advance_locks
  ALTER COLUMN lease_expires_at SET NOT NULL;

-- One team identity per league. School display names remain editable; the
-- application serializes editor changes and this constraint prevents duplicate
-- names from corrupting schedules and roster imports.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_teams_league_name
  ON teams (league_id, lower(name));

-- Existing partial indexes cover human coaches. These stricter indexes also
-- prevent duplicate CPU coach rows and make team claims race-safe.
-- Retire duplicate userless placeholders first while always preferring a human
-- coach when one exists for the same team.
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, team_id
           ORDER BY (user_id IS NOT NULL) DESC, id
         ) AS rn
    FROM coaches
   WHERE team_id IS NOT NULL
)
UPDATE coaches
   SET team_id = NULL
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1 AND user_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_coaches_league_team_all
  ON coaches (league_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_coaches_league_user_human
  ON coaches (league_id, user_id)
  WHERE user_id IS NOT NULL;

-- Only one active dynasty-start operation may exist for a league. Failed jobs
-- remain as durable diagnostics and may be reclaimed by the start route.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_league_jobs_active_dynasty_start
  ON league_jobs (league_id)
  WHERE job_type = 'dynasty_start' AND status IN ('pending', 'running');
