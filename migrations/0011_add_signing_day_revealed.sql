-- Add signing_day_revealed flag to recruits table
-- When true, all recruit attributes/abilities/potential become visible (used by signing day reveal screen)
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS signing_day_revealed boolean NOT NULL DEFAULT false;
