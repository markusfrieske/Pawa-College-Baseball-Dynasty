-- Score-only reports must distinguish missing observations from recorded zero.
-- Preserve historical values/defaults; their original coverage cannot be inferred.
ALTER TABLE game_reports
  ALTER COLUMN home_hits DROP NOT NULL,
  ALTER COLUMN away_hits DROP NOT NULL,
  ALTER COLUMN home_errors DROP NOT NULL,
  ALTER COLUMN away_errors DROP NOT NULL;
