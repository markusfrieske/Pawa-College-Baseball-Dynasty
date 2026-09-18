-- Existing finalized games have unknown historical coach contributions: do not backfill.
CREATE TABLE IF NOT EXISTS game_coach_effects (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id varchar NOT NULL REFERENCES game_finalizations(game_id) ON DELETE CASCADE,
  coach_id varchar NOT NULL,
  league_id varchar NOT NULL,
  xp_delta integer NOT NULL,
  wins_delta integer NOT NULL,
  losses_delta integer NOT NULL,
  conf_wins_delta integer NOT NULL,
  conf_losses_delta integer NOT NULL,
  skill_points_delta integer NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_coach_effects_game_coach_idx ON game_coach_effects(game_id, coach_id);
