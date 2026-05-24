/**
 * Assigns a hitter's trajectory type (1–4) based on their core attributes.
 *
 * 1 = Groundball (GB): speedy, slap hitters — low HR, fewer strikeouts
 * 2 = Line Drive (LD): balanced default
 * 3 = Gap (Gap): gap power with contact — extra bases, fewer HRs
 * 4 = Flyball (FB): big power, lift — lots of HRs and Ks
 *
 * Pure pitchers should pass their (typically low) hitting attrs and will
 * almost always land on 2 (neutral), which is fine as a sentinel.
 */
export function assignTrajectory(
  power: number,
  speed: number,
  hitForAvg: number,
): 1 | 2 | 3 | 4 {
  if (power >= 65 && speed < 50) return 4;       // FB: big power, not a runner
  if (speed >= 60 && power < 45) return 1;        // GB: speedy slapper
  if (power >= 55 && hitForAvg >= 50) return 3;   // Gap: contact + power combo
  return 2;                                        // LD: default
}

export const TRAJECTORY_LABELS: Record<number, string> = {
  1: "GB",
  2: "LD",
  3: "Gap",
  4: "FB",
};

export const TRAJECTORY_FULL_LABELS: Record<number, string> = {
  1: "Groundball",
  2: "Line Drive",
  3: "Gap",
  4: "Flyball",
};
