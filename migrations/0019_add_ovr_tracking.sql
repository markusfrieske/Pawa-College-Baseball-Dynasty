-- Add ovrDelta to player_history to persist OVR change in final season
ALTER TABLE player_history ADD COLUMN IF NOT EXISTS ovr_delta integer;

-- Add endSeasonOvr to player_season_stats to track OVR snapshot per season
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS end_season_ovr integer;
