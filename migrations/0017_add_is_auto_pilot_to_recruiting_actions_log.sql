ALTER TABLE recruiting_actions_log ADD COLUMN IF NOT EXISTS is_auto_pilot boolean NOT NULL DEFAULT false;
