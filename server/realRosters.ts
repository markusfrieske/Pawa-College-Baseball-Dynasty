import { ACC_BATCH1_ROSTERS } from "./accRostersBatch1";
import { ACC_BATCH2_ROSTERS } from "./accRostersBatch2";
import { ACC_BATCH3_ROSTERS } from "./accRostersBatch3";
import { SEC_BATCH1_ROSTERS } from "./secBatch1";
import { SEC_BATCH2_ROSTERS } from "./secBatch2";
import { SEC_BATCH3_ROSTERS } from "./secBatch3";
import { BIG_TEN_BATCH1_ROSTERS } from "./bigTenBatch1";
import { BIG_TEN_BATCH2_ROSTERS } from "./bigTenBatch2";
import { BIG_TEN_BATCH3_ROSTERS } from "./bigTenBatch3";
import { PAC12_ROSTERS } from "./pac12Rosters";
import { IVY_LEAGUE_ROSTERS } from "./ivyLeagueRosters";
import { SUN_BELT_ROSTERS } from "./sunBeltRosters";
import { BIG_WEST_ROSTERS } from "./bigWestRosters";
import { HBCU_ROSTERS } from "./hbcuRosters";
import { MO_VALLEY_ROSTERS } from "./moValleyRosters";
import { BIG_12_ROSTERS } from "./big12Rosters";
import { AAC_ROSTERS } from "./aacRosters";
import { WCC_ROSTERS } from "./wccRosters";
import { ROSTER_SCALE_FACTORS, PITCHER_SCALE_OVERRIDES, HITTER_SCALE_OVERRIDES } from "./rosterScaleFactors";

export interface RealPlayer {
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  homeState: string;
  hometown: string;
  jerseyNumber: number;
  hitForAvg: number;
  power: number;
  speed: number;
  arm: number;
  fielding: number;
  errorResistance: number;
  velocity: number;
  control: number;
  stamina: number;
  stuff: number;
  clutch: number;
  vsLHP: number;
  grit: number;
  stealing: number;
  running: number;
  throwing: number;
  recovery: number;
  wRISP: number;
  vsLefty: number;
  poise: number;
  heater: number;
  agile: number;
  abilities: string[];
  potential: string;
  catcherAbility: number | null;
  trajectory?: number;
  pitchFB: number;
  pitch2S: number;
  pitchSL: number;
  pitchCB: number;
  pitchCH: number;
  pitchCT: number;
  pitchSNK: number;
  pitchSPL: number;
  pitchFK?: number;
  pitchSFF?: number;
  pitchSHU?: number;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  throwHand?: string;
  batHand?: string;
  generational?: boolean;
}

const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

// Common attrs may go down to 10 (G-grade) — primary attrs stay floored at 20.
const COMMON_ATTRS_FOR_CLAMP = new Set([
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
]);

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

// Pitcher common attrs that receive the F/G-grade floor treatment.
// Stamina is intentionally excluded — depth pitchers legitimately vary in stamina.
const PITCHER_COMMON_FLOOR_ATTRS = new Set([
  "velocity", "control",
  "wRISP", "vsLefty", "poise", "heater", "agile", "recovery", "grit", "clutch",
]);

// Hitter-only scale attrs (not applied to pitchers during split-scale pass).
const HITTER_ATTRS = new Set([
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery",
]);
// Pitcher-only scale attrs (not applied to hitters during split-scale pass).
const PITCHER_ATTRS = new Set([
  "velocity", "control", "stuff",
  "wRISP", "vsLefty", "poise", "heater", "agile", "recovery", "grit", "clutch",
]);

function scalePlayer(player: RealPlayer, factor: number, pitcherMult = 1, hitterMult = 1): RealPlayer {
  if (factor === 1 && pitcherMult === 1 && hitterMult === 1) return player;
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  const result = { ...player };
  for (const attr of SCALE_ATTRS) {
    const val = result[attr];
    if (typeof val === "number") {
      const minV = COMMON_ATTRS_FOR_CLAMP.has(attr as string) ? 10 : 20;
      // Apply position-specific multiplier on top of base factor
      let effectiveFactor = factor;
      if (isPitcher && PITCHER_ATTRS.has(attr as string)) {
        effectiveFactor = factor * pitcherMult;
      } else if (!isPitcher && HITTER_ATTRS.has(attr as string)) {
        effectiveFactor = factor * hitterMult;
      }
      // Cap at 89 when:
      //   (a) raw val < 90 — scaling cannot create a new S-grade, OR
      //   (b) effectiveFactor < 1 — a reduction might drop OVR below 550 while
      //       leaving a raw S-grade attr exposed on a sub-threshold player.
      // Preserving raw S-grade attrs only when the player is being boosted (factor ≥ 1),
      // which keeps their OVR above 550.
      // Cap at 89 unless the raw value was explicitly above the S-grade boundary (91+).
      // This prevents the base scale factor from pushing a boundary attr (90) to 99,
      // and also prevents reductions from leaving an S-grade attr on a sub-550 player.
      const sGradeCap = (val <= 90 || effectiveFactor < 1) ? 89 : 99;
      let scaled = Math.round(Math.max(minV, Math.min(sGradeCap, val * effectiveFactor)));
      if (isPitcher && (attr === "hitForAvg" || attr === "power")) scaled = Math.min(scaled, 30);
      (result as Record<string, unknown>)[attr as string] = scaled;
    }
  }
  return result;
}

/**
 * Global post-scale adjustments applied to every player regardless of team scale factor.
 *
 * #3 — Pitcher non-stamina common attr floor:
 *   Values below 40 (F/G grade) on a pitcher's relevant common abilities are boosted:
 *   max(30, round(val × 1.20)). Break-even at ~33 — values 33+ reach E-grade (40+).
 *   Combined F+G drops from ~36 % to ~24 %. Stamina is excluded by design.
 *
 * #6 — Catcher priority attribute boost:
 *   fielding ×1.15, errorResistance ×1.15, arm ×1.10, catcherAbility ×1.20.
 *   Raises avg catcher OVR from ~272 → ~290, on par with other positions.
 */
function applyGlobalAdjustments(player: RealPlayer): RealPlayer {
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  const isCatcher = player.position === "C";

  if (!isPitcher && !isCatcher) return player;

  const result = { ...player };

  // #3 — Pitcher non-stamina common attr floor (stamina excluded)
  if (isPitcher) {
    for (const attr of PITCHER_COMMON_FLOOR_ATTRS) {
      const val = (result as Record<string, unknown>)[attr];
      if (typeof val === "number" && val < 40) {
        (result as Record<string, unknown>)[attr] = Math.max(30, Math.round(val * 1.20));
      }
    }
  }

  // #6 — Catcher priority attributes
  if (isCatcher) {
    if (typeof result.fielding === "number")
      result.fielding = Math.min(99, Math.round(result.fielding * 1.15));
    if (typeof result.errorResistance === "number")
      result.errorResistance = Math.min(99, Math.round(result.errorResistance * 1.15));
    if (typeof result.arm === "number")
      result.arm = Math.min(99, Math.round(result.arm * 1.10));
    if (typeof result.catcherAbility === "number")
      result.catcherAbility = Math.min(99, Math.round(result.catcherAbility * 1.20));
  }

  return result;
}

const RAW_REAL_ROSTERS: Record<string, RealPlayer[]> = {
  ...SEC_BATCH1_ROSTERS,
  ...SEC_BATCH2_ROSTERS,
  ...SEC_BATCH3_ROSTERS,
  ...ACC_BATCH1_ROSTERS,
  ...ACC_BATCH2_ROSTERS,
  ...ACC_BATCH3_ROSTERS,
  ...BIG_TEN_BATCH1_ROSTERS,
  ...BIG_TEN_BATCH2_ROSTERS,
  ...BIG_TEN_BATCH3_ROSTERS,
  ...PAC12_ROSTERS,
  ...IVY_LEAGUE_ROSTERS,
  ...SUN_BELT_ROSTERS,
  ...BIG_WEST_ROSTERS,
  ...HBCU_ROSTERS,
  ...MO_VALLEY_ROSTERS,
  ...BIG_12_ROSTERS,
  ...AAC_ROSTERS,
  ...WCC_ROSTERS,
};

// Teams in conferences that enforce a minimum stamina of 20 for pitchers.
const STAMINA_FLOOR_TEAMS: Set<string> = new Set([
  ...Object.keys(SEC_BATCH1_ROSTERS),
  ...Object.keys(SEC_BATCH2_ROSTERS),
  ...Object.keys(SEC_BATCH3_ROSTERS),
  ...Object.keys(ACC_BATCH1_ROSTERS),
  ...Object.keys(ACC_BATCH2_ROSTERS),
  ...Object.keys(ACC_BATCH3_ROSTERS),
  ...Object.keys(BIG_TEN_BATCH1_ROSTERS),
  ...Object.keys(BIG_TEN_BATCH2_ROSTERS),
  ...Object.keys(BIG_TEN_BATCH3_ROSTERS),
]);

function buildCalibratedRosters(): Record<string, RealPlayer[]> {
  const out: Record<string, RealPlayer[]> = {};
  for (const [teamName, players] of Object.entries(RAW_REAL_ROSTERS)) {
    const factor = ROSTER_SCALE_FACTORS[teamName] ?? 1;
    const pitcherMult = PITCHER_SCALE_OVERRIDES[teamName] ?? 1;
    const hitterMult  = HITTER_SCALE_OVERRIDES[teamName]  ?? 1;
    const applyStaminaFloor = STAMINA_FLOOR_TEAMS.has(teamName);
    out[teamName] = players.map(p => {
      const calibrated = applyGlobalAdjustments(scalePlayer(p, factor, pitcherMult, hitterMult));
      if (applyStaminaFloor && PITCHER_POSITIONS.has(calibrated.position) && typeof calibrated.stamina === "number") {
        return { ...calibrated, stamina: Math.max(20, calibrated.stamina) };
      }
      return calibrated;
    });
  }
  return out;
}

/** Raw rosters without any calibration — used by offline scripts (e.g. recalibrate-rosters.ts). */
export const RAW_UNCALIBRATED_ROSTERS: Record<string, RealPlayer[]> = RAW_REAL_ROSTERS;

/** All real rosters across every conference, with RPI-calibrated attribute scaling applied. */
const CALIBRATED_ROSTERS: Record<string, RealPlayer[]> = buildCalibratedRosters();

/** @deprecated Use ALL_REAL_ROSTERS for calibrated data. Kept for legacy callers. */
export const SEC_REAL_ROSTERS: Record<string, RealPlayer[]> = CALIBRATED_ROSTERS;

export const ALL_REAL_ROSTERS: Record<string, RealPlayer[]> = CALIBRATED_ROSTERS;
