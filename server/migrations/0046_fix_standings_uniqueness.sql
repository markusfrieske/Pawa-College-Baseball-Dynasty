-- Migration: Fix standings unique index to include season column.
--
-- Migration 0043 incorrectly created uidx_standings_league_team on only
-- (league_id, team_id), which prevents inserting season-2 standings rows
-- for any team already present in season 1.
--
-- This migration:
--   1. Drops the incorrect two-column index.
--   2. Creates the correct three-column unique index.
--
-- Safety: The CREATE UNIQUE INDEX will fail (and roll back the migration) if
-- any duplicate (league_id, team_id, season) triples exist in the data, since
-- isIdempotentError no longer swallows "duplicate key" errors.  That failure
-- signals data that requires manual reconciliation before re-applying.

DROP INDEX IF EXISTS uidx_standings_league_team;

CREATE UNIQUE INDEX IF NOT EXISTS uq_standings_league_team_season
  ON standings (league_id, team_id, season);
