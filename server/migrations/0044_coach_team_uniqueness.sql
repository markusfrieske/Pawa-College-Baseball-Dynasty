-- Migration: Add DB-level coach-team exclusivity within a league.
--
-- Requirement: at most one active coach per (league_id, team_id) pair.
-- Prevents race-condition double-claim where two users simultaneously join the
-- same team slot and both see success before the conflict is detected.
--
-- Step 1: Remove duplicate (league_id, team_id) rows, keeping the lexicographically
-- greatest id (arbitrary but deterministic). Duplicates arise from dev/test data or
-- historic race conditions; one authoritative record per team slot is kept.
--
-- Step 2: Create the unique partial index on non-null team_id values.

DELETE FROM coaches
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY league_id, team_id
             ORDER BY id DESC
           ) AS rn
    FROM coaches
    WHERE team_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_coaches_league_team
  ON coaches (league_id, team_id)
  WHERE team_id IS NOT NULL;
