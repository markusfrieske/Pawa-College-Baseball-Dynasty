/**
 * Growth budget calculator — V3.
 *
 * Computes the number of development points available to a player for the
 * upcoming offseason. Points are spent on attribute upgrades via the cost table
 * in allocateGrowth.ts.
 *
 * Formulas from plan §4.4:
 *
 *   Annual base points by potential grade:
 *     A+: 24  A: 21  A-: 18  B+: 15  B: 12  B-: 10
 *     C+: 8   C:  6  C-:  5  D+:  4  D:  3  D-:  2  F: 1
 *
 *   Final points = basePoints
 *     × devTraitMultiplier(profile, eligibility)   // timing/raw/late-bloomer
 *     × facilitiesBonus                            // 1.00–1.15
 *     × workEthicBonus                             // 1.00–1.10
 *     × coachabilityBonus                          // 1.00–1.08
 *
 *   Regression points (always non-zero for C and below, 0 for B+ and above):
 *     Follows the same grade lookup but with a separate regression table so that
 *     high-potential players do not regress, while declining players lose small
 *     amounts on their archetype weaknesses.
 */

import { getPotentialGrade } from "@shared/potential";
import { developmentTraitMultiplier, type DevelopmentProfile } from "@shared/playerArchetypes";

const BASE_POINTS: Record<string, number> = {
  "A+": 24, "A": 21, "A-": 18,
  "B+": 15, "B": 12, "B-": 10,
  "C+":  8, "C":  6, "C-":  5,
  "D+":  4, "D":  3, "D-":  2,
  "F":   1,
};

const REGRESSION_POINTS: Record<string, number> = {
  "A+": 0, "A": 0, "A-": 0,
  "B+": 0, "B": 0, "B-": 1,
  "C+": 2, "C": 3, "C-": 4,
  "D+": 5, "D": 6, "D-": 7,
  "F":  8,
};

export interface GrowthBudget {
  totalPoints: number;
  regressionPoints: number;
  pitchMixPoints: number;      // extra budget for pitch development (pitchers only)
  potentialGrade: string;
  basePoints: number;
  multiplier: number;
}

export function computeGrowthBudget(opts: {
  potential: number;
  eligibility: string;
  developmentProfile: DevelopmentProfile;
  facilities: number;          // team facilities 1–10
  workEthicScore: number;      // player intangible 0–100
  coachability: number;        // player intangible 0–100
  isPitcher: boolean;
}): GrowthBudget {
  const { potential, eligibility, developmentProfile, facilities, workEthicScore, coachability, isPitcher } = opts;

  const potentialGrade = getPotentialGrade(potential);
  const base = BASE_POINTS[potentialGrade] ?? 3;

  const traitMult = developmentTraitMultiplier(developmentProfile, eligibility);

  // Facilities bonus: 0% to +15% for elite facilities
  const facBonus = facilities >= 9 ? 1.15
    : facilities >= 8 ? 1.10
    : facilities >= 7 ? 1.05
    : 1.0;

  // Work ethic bonus: 0% to +10% (workEthicScore 0–100 → 1.00–1.10)
  const weBonus = 1.0 + Math.max(0, Math.min(100, workEthicScore)) / 1000;

  // Coachability bonus: 0% to +8% (0–100 → 1.00–1.08)
  const coachBonus = 1.0 + Math.max(0, Math.min(100, coachability)) / 1250;

  const multiplier = traitMult * facBonus * weBonus * coachBonus;
  const totalPoints = Math.max(0, Math.round(base * multiplier));

  const regBase = REGRESSION_POINTS[potentialGrade] ?? 0;
  const regressionPoints = Math.round(regBase * traitMult);

  const pitchMixPoints = isPitcher ? Math.max(0, Math.round(totalPoints * 0.25)) : 0;

  return {
    totalPoints,
    regressionPoints,
    pitchMixPoints,
    potentialGrade,
    basePoints: base,
    multiplier,
  };
}
