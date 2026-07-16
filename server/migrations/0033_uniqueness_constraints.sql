-- 0033: Uniqueness constraints required for multiplayer launch safety

-- (project_id, version_number) uniqueness on recruiting_class_versions
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_versions_project_version
  ON recruiting_class_versions (project_id, version_number);

-- Active-coach uniqueness: one coach entry per (league, user) and per (league, team)
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaches_league_user
  ON coaches (league_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coaches_league_team
  ON coaches (league_id, team_id);

-- Standings: one row per (league_id, team_id, season)
CREATE UNIQUE INDEX IF NOT EXISTS uq_standings_league_team_season
  ON standings (league_id, team_id, season);

-- Recruiting interests: one row per (recruit, team) pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruiting_interests_recruit_team
  ON recruiting_interests (recruit_id, team_id);

-- Action log: one email/phone per (recruit, team, season, week)
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_weekly
  ON recruiting_actions_log (recruit_id, team_id, season, week, action_type)
  WHERE action_type IN ('email', 'phone');

-- Action log: one campus visit / HCV / offer per (recruit, team, season)
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_seasonal
  ON recruiting_actions_log (recruit_id, team_id, season, action_type)
  WHERE action_type IN ('visit', 'head_coach_visit', 'offer');

-- Recruit top schools: one row per (recruit, team) pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruit_top_schools_recruit_team
  ON recruit_top_schools (recruit_id, team_id);
