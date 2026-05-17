ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_auto_pilot boolean NOT NULL DEFAULT false;
