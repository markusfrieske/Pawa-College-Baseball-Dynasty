-- Backfill trajectory for all existing non-pitcher players and recruits.
-- Mirrors the assignTrajectory(power, speed, hitForAvg) logic in shared/trajectory.ts:
--   4 (FB):  power >= 65 AND speed < 50
--   1 (GB):  speed >= 60 AND power < 45
--   3 (Gap): power >= 55 AND hit_for_avg >= 50
--   2 (LD):  everything else (already the column default)
-- All pitcher positions (P, SP, RP, CP) keep trajectory = 2 (neutral sentinel).

UPDATE players
SET trajectory =
  CASE
    WHEN power >= 65 AND speed < 50  THEN 4
    WHEN speed  >= 60 AND power < 45 THEN 1
    WHEN power  >= 55 AND hit_for_avg >= 50 THEN 3
    ELSE 2
  END
WHERE position NOT IN ('P', 'SP', 'RP', 'CP')
  AND power     IS NOT NULL
  AND speed     IS NOT NULL
  AND hit_for_avg IS NOT NULL;

-- Ensure all pitcher positions have sentinel value 2
UPDATE players SET trajectory = 2
WHERE position IN ('P', 'SP', 'RP', 'CP');

UPDATE recruits
SET trajectory =
  CASE
    WHEN power >= 65 AND speed < 50  THEN 4
    WHEN speed  >= 60 AND power < 45 THEN 1
    WHEN power  >= 55 AND hit_for_avg >= 50 THEN 3
    ELSE 2
  END
WHERE position NOT IN ('P', 'SP', 'RP', 'CP')
  AND power     IS NOT NULL
  AND speed     IS NOT NULL
  AND hit_for_avg IS NOT NULL;

-- Ensure all pitcher positions have sentinel value 2
UPDATE recruits SET trajectory = 2
WHERE position IN ('P', 'SP', 'RP', 'CP');
