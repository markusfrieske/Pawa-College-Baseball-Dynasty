-- Add signing_day_revealed flag to recruits table
-- When true, all recruit attributes/abilities/potential become visible (used by signing day reveal screen)
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS signing_day_revealed boolean NOT NULL DEFAULT false;

-- Backfill: any recruit already signed before this migration should be considered revealed
-- This protects existing dynasties from unexpected lockout of attributes they've already scouted
UPDATE recruits SET signing_day_revealed = true WHERE signed_team_id IS NOT NULL;
