-- Storyline Attribute & Ability-First Overhaul
-- Adds storySlot (0-9) to storyline_recruits for fixed-advance scheduling.
-- Adds story_outcomes JSONB to storyline_events to store per-choice StoryOutcome.
-- Adds resolved_ability_gain / _remove / _tier for UI display after resolution.

ALTER TABLE "storyline_recruits"
  ADD COLUMN IF NOT EXISTS "story_slot" integer;

ALTER TABLE "storyline_events"
  ADD COLUMN IF NOT EXISTS "story_outcomes" jsonb,
  ADD COLUMN IF NOT EXISTS "resolved_ability_gain" text,
  ADD COLUMN IF NOT EXISTS "resolved_ability_remove" text,
  ADD COLUMN IF NOT EXISTS "resolved_ability_tier" text;
