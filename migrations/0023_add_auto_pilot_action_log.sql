ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "auto_pilot_action_log" jsonb NOT NULL DEFAULT '[]'::jsonb;
