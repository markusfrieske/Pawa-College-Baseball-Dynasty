ALTER TABLE players ADD COLUMN IF NOT EXISTS work_ethic_score integer NOT NULL DEFAULT 70;
ALTER TABLE players ADD COLUMN IF NOT EXISTS coachability integer NOT NULL DEFAULT 70;
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS player_archetype text NOT NULL DEFAULT 'normal';
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS work_ethic_score integer NOT NULL DEFAULT 70;
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS coachability integer NOT NULL DEFAULT 70;
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS class_vintage text;
