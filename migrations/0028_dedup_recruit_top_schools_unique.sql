-- Deduplicate recruit_top_schools before enforcing the unique constraint.
-- Production may have duplicate (recruit_id, team_id) rows from earlier
-- code paths that didn't guard against concurrent inserts.
-- Keep the row with the highest interest_level; break ties by id (stable).

DELETE FROM recruit_top_schools
WHERE id NOT IN (
  SELECT DISTINCT ON (recruit_id, team_id) id
  FROM recruit_top_schools
  ORDER BY recruit_id, team_id, interest_level DESC, id
);

-- Drop the old non-unique composite index added in 0008 (will be superseded).
DROP INDEX IF EXISTS idx_recruit_top_schools_recruit_team;

-- Create the unique index. IF NOT EXISTS is safe in case the startup migration
-- already ran it on this environment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruit_top_schools_recruit_team
  ON recruit_top_schools (recruit_id, team_id);
