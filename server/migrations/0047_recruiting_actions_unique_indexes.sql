-- Ensure duplicate-action idempotency constraints exist on recruiting_actions_log.
-- The executeRecruitingAction service uses INSERT ... ON CONFLICT DO NOTHING to gate
-- duplicate actions; these indexes make those conflicts deterministic under concurrency.
--
-- phone/email: 1 per (recruit, team, week, season)
-- visit/head_coach_visit/offer: 1 per (recruit, team, season) — lifetime per season

CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_weekly
  ON recruiting_actions_log (recruit_id, team_id, season, week, action_type)
  WHERE action_type IN ('email', 'phone');

CREATE UNIQUE INDEX IF NOT EXISTS uq_action_log_seasonal
  ON recruiting_actions_log (recruit_id, team_id, season, action_type)
  WHERE action_type IN ('visit', 'head_coach_visit', 'offer');
