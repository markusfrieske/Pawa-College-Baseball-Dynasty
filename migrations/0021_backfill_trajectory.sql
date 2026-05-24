-- Backfill trajectory for all existing non-pitcher players and recruits.
-- Mirrors the assignTrajectory(power, speed, hitForAvg) logic in shared/trajectory.ts:
--   4 (FB):  power >= 65 AND speed < 50
--   1 (GB):  speed >= 60 AND power < 45
--   3 (Gap): power >= 55 AND hit_for_avg >= 50
--   2 (LD):  everything else (already the column default)
-- Pitchers keep trajectory = 2 (neutral sentinel) and are left untouched.

UPDATE players
SET trajectory =
  CASE
    WHEN power >= 65 AND speed < 50  THEN 4
    WHEN speed  >= 60 AND power < 45 THEN 1
    WHEN power  >= 55 AND hit_for_avg >= 50 THEN 3
    ELSE 2
  END
WHERE position != 'P'
  AND power     IS NOT NULL
  AND speed     IS NOT NULL
  AND hit_for_avg IS NOT NULL;

UPDATE recruits
SET trajectory =
  CASE
    WHEN power >= 65 AND speed < 50  THEN 4
    WHEN speed  >= 60 AND power < 45 THEN 1
    WHEN power  >= 55 AND hit_for_avg >= 50 THEN 3
    ELSE 2
  END
WHERE position != 'P'
  AND power     IS NOT NULL
  AND speed     IS NOT NULL
  AND hit_for_avg IS NOT NULL;
