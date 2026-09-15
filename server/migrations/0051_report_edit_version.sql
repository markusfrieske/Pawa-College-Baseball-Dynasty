-- Existing report bodies begin at edit version 1; this is not an accepted-revision ledger.
ALTER TABLE game_reports ADD COLUMN IF NOT EXISTS edit_version integer NOT NULL DEFAULT 1;
