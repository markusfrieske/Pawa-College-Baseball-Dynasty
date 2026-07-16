-- 0037: Remaining DDL from sequential startup runner
-- Covers drop-pitch-ch-binary-v1 constraint drops.
-- Other items (action log indexes, development columns, editor tables) were
-- already covered by migrations 0030-0033.

-- Drop binary CHECK constraints on pitch_ch so it can hold values 1-7.
ALTER TABLE players  DROP CONSTRAINT IF EXISTS players_pitch_ch_binary;
ALTER TABLE recruits DROP CONSTRAINT IF EXISTS recruits_pitch_ch_binary;
