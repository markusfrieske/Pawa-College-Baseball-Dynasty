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
import { ROSTER_SCALE_FACTORS } from "./rosterScaleFactors";

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
  pitchFB: number;
  pitch2S: number;
  pitchSL: number;
  pitchCB: number;
  pitchCH: number;
  pitchCT: number;
  pitchSNK: number;
  pitchSPL: number;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  throwHand?: string;
  batHand?: string;
  generational?: boolean;
}

const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

function clamp(v: number): number {
  return Math.round(Math.max(20, Math.min(99, v)));
}

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

function scalePlayer(player: RealPlayer, factor: number): RealPlayer {
  if (factor === 1) return player;
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  const result = { ...player };
  for (const attr of SCALE_ATTRS) {
    const val = result[attr];
    if (typeof val === "number") {
      let scaled = clamp(val * factor);
      if (isPitcher && attr === "hitForAvg") scaled = Math.min(scaled, 30);
      (result as Record<string, unknown>)[attr as string] = scaled;
    }
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

function buildCalibratedRosters(): Record<string, RealPlayer[]> {
  const out: Record<string, RealPlayer[]> = {};
  for (const [teamName, players] of Object.entries(RAW_REAL_ROSTERS)) {
    const factor = ROSTER_SCALE_FACTORS[teamName] ?? 1;
    out[teamName] = factor === 1 ? players : players.map(p => scalePlayer(p, factor));
  }
  return out;
}

export const SEC_REAL_ROSTERS: Record<string, RealPlayer[]> = RAW_REAL_ROSTERS;

/** All real rosters across every conference, with RPI-calibrated attribute scaling applied. */
export const ALL_REAL_ROSTERS: Record<string, RealPlayer[]> = buildCalibratedRosters();
