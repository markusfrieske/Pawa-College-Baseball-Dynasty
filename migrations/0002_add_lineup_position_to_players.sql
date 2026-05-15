-- Add lineup_position column to players table.
-- Stores the defensive position a batter is assigned to play in the lineup
-- (e.g. LF, CF, RF, DH), which may differ from their natural roster position.
-- Null means use the player's natural position as the fallback.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS lineup_position text;
