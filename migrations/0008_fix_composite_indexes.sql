-- Replace single-column recruit_id indexes with composite (recruit_id, team_id) indexes
-- on the two most-queried recruiting tables
DROP INDEX IF EXISTS idx_recruiting_interests_recruit_id;
DROP INDEX IF EXISTS idx_recruit_top_schools_recruit_id;

CREATE INDEX IF NOT EXISTS idx_recruiting_interests_recruit_team ON recruiting_interests(recruit_id, team_id);
CREATE INDEX IF NOT EXISTS idx_recruit_top_schools_recruit_team ON recruit_top_schools(recruit_id, team_id);
