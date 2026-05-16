-- Add signing_day_revealed flag to recruits table
-- When true, all recruit attributes/abilities/potential become visible (used by signing day reveal screen)
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS signing_day_revealed boolean NOT NULL DEFAULT false;

-- Backfill ALL existing recruits to true so pre-existing active classes are not retroactively locked.
-- Only recruits generated AFTER this migration (new season classes going forward) will start as false
-- and receive the holdback treatment during the recruiting phase.
UPDATE recruits SET signing_day_revealed = true;
