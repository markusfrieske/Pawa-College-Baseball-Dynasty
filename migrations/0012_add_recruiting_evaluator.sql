ALTER TABLE coach_season_history ADD COLUMN IF NOT EXISTS recruiting_score real;
ALTER TABLE coach_season_history ADD COLUMN IF NOT EXISTS recruiting_grade text;
ALTER TABLE coach_season_history ADD COLUMN IF NOT EXISTS recruiting_breakdown json;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS career_recruiting_score real;
