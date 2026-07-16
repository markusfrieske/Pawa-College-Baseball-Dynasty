-- 0041_game_finalizations
-- Idempotency guard for game finalization.
-- A row is inserted here the moment finalizeGameAtomic() begins committing a game.
-- Any concurrent or retry call that finds an existing row for the same game_id
-- returns immediately without re-running side-effects (standings, stats, XP, etc.).
-- ON DELETE CASCADE keeps this table tidy when leagues / games are purged.

CREATE TABLE IF NOT EXISTS game_finalizations (
  game_id   VARCHAR PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  finalized_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizer     TEXT        NOT NULL DEFAULT 'unknown'
);
