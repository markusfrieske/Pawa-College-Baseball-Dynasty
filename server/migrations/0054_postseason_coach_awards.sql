CREATE TABLE IF NOT EXISTS postseason_coach_awards (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season integer NOT NULL,
  team_id varchar NOT NULL,
  milestone text NOT NULL,
  source_key text NOT NULL,
  coach_id varchar,
  disposition text NOT NULL,
  milestone_delta integer NOT NULL,
  xp_delta integer NOT NULL,
  skill_points_delta integer NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS postseason_coach_awards_identity_idx
  ON postseason_coach_awards(league_id, season, team_id, milestone);

CREATE TABLE IF NOT EXISTS postseason_award_legacy_seasons (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season integer NOT NULL,
  reason text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS postseason_award_legacy_seasons_identity_idx
  ON postseason_award_legacy_seasons(league_id, season);

-- Preserve uncertainty, never invent award receipts or replay an unknown partial
-- increment. Fence existing postseason evidence even if a legacy restore changed
-- the live phase. An explicit audited reconciliation is needed for these seasons.
INSERT INTO postseason_award_legacy_seasons (league_id, season, reason)
SELECT league_id, season, 'Legacy postseason award coverage is unknown; reconcile coach counters and XP before awarding.'
FROM (
  SELECT id AS league_id, current_season AS season FROM leagues
  WHERE current_phase IN ('conference_championship', 'super_regionals', 'cws')
     OR current_phase LIKE 'offseason%'
  UNION
  SELECT league_id, season FROM games
  WHERE phase IN ('conference_championship', 'super_regionals', 'cws')
) observed
ON CONFLICT (league_id, season) DO NOTHING;
