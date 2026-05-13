-- Custom SQL migration file, put your code below! --
-- Add used_template_ids column to storyline_recruits.
-- This column tracks which story event templates have already been shown to a
-- recruit so that the weekly generator can avoid repeating the same event.
ALTER TABLE storyline_recruits
  ADD COLUMN IF NOT EXISTS used_template_ids jsonb DEFAULT '[]'::jsonb;
