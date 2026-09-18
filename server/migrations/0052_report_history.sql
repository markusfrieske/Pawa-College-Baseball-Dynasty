-- Historical content before this observation cannot be reconstructed.
CREATE TABLE IF NOT EXISTS game_report_revisions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id varchar NOT NULL REFERENCES game_reports(id) ON DELETE CASCADE,
  game_id varchar NOT NULL,
  league_id varchar NOT NULL,
  edit_version integer NOT NULL CHECK (edit_version > 0),
  actor_user_id varchar,
  event text NOT NULL,
  snapshot jsonb NOT NULL,
  corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_report_revisions_report_version_idx ON game_report_revisions(report_id, edit_version);

-- Existing corrections cannot be attributed to a historical version reliably.
-- Keep them in their original table, and record an explicitly unknown baseline.
INSERT INTO game_report_revisions(report_id, game_id, league_id, edit_version, actor_user_id, event, snapshot, corrections)
SELECT r.id, r.game_id, r.league_id, r.edit_version, NULL, 'legacy-observed',
  jsonb_build_object(
    'id', r.id, 'gameId', r.game_id, 'leagueId', r.league_id, 'editVersion', r.edit_version,
    'reporterUserId', r.reporter_user_id, 'reporterTeamId', r.reporter_team_id,
    'homeScore', r.home_score, 'awayScore', r.away_score, 'homeHits', r.home_hits, 'awayHits', r.away_hits,
    'homeErrors', r.home_errors, 'awayErrors', r.away_errors,
    'inningScores', r.inning_scores, 'homeBoxData', r.home_box_data, 'awayBoxData', r.away_box_data,
    'status', r.status, 'confirmedByUserId', r.confirmed_by_user_id, 'disputedByUserId', r.disputed_by_user_id,
    'disputeReason', r.dispute_reason, 'disputeCorrectedHomeScore', r.dispute_corrected_home_score,
    'disputeCorrectedAwayScore', r.dispute_corrected_away_score,
    'createdAt', to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
    'updatedAt', to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
    'legacyTimestampTimezone', 'unspecified'
  ), '[]'::jsonb
FROM game_reports r
ON CONFLICT (report_id, edit_version) DO NOTHING;

CREATE OR REPLACE FUNCTION reject_game_report_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM game_reports WHERE id = OLD.report_id) THEN
    RETURN OLD; -- Explicit parent report/league cleanup is permitted.
  END IF;
  RAISE EXCEPTION 'Report revision snapshots are immutable';
END;
$$;
DROP TRIGGER IF EXISTS game_report_revisions_no_update ON game_report_revisions;
CREATE TRIGGER game_report_revisions_no_update BEFORE UPDATE OR DELETE ON game_report_revisions
FOR EACH ROW EXECUTE FUNCTION reject_game_report_revision_update();

-- Legacy receipts stay NULL: no invented approving actor or accepted revision.
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS report_revision_id varchar REFERENCES game_report_revisions(id) ON DELETE CASCADE;
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS report_id varchar;
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS requested_edit_version integer;
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS accepted_by_user_id varchar;
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS report_action text;
ALTER TABLE game_finalizations ADD COLUMN IF NOT EXISTS report_resolution text;
