-- Add cpu_recruiting_aggression column to leagues table.
-- Controls how early CPU teams extend offers within the 4-week recruiting window.
-- Scale: 1=Conservative (+10 to thresholds), 3=Standard (no change), 5=Ultra (-10).
-- Default 3 preserves existing behavior for all current leagues.
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS cpu_recruiting_aggression INTEGER NOT NULL DEFAULT 3;
