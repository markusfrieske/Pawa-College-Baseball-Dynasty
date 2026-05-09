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
}

export const SEC_REAL_ROSTERS: Record<string, RealPlayer[]> = {
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
};
