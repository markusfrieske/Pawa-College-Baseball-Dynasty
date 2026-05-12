-- Custom SQL migration file, put your code below! --
-- Clear stale AI portrait data from storyline_recruits.
-- The per-recruit AI portrait feature (image_url / image_prompt) was removed in Task #227.
-- These columns are no longer read by the frontend; null them out so no stale base64 data lingers.
UPDATE storyline_recruits
  SET image_url = NULL, image_prompt = NULL
  WHERE image_url IS NOT NULL OR image_prompt IS NOT NULL;
