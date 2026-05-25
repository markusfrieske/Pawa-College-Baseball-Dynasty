import { SEC_BATCH1_ROSTERS } from "../server/secBatch1";
import { SEC_BATCH2_ROSTERS } from "../server/secBatch2";
import { SEC_BATCH3_ROSTERS } from "../server/secBatch3";
import { ACC_BATCH1_ROSTERS } from "../server/accRostersBatch1";
import { ACC_BATCH2_ROSTERS } from "../server/accRostersBatch2";
import { ACC_BATCH3_ROSTERS } from "../server/accRostersBatch3";
import { BIG_TEN_BATCH1_ROSTERS } from "../server/bigTenBatch1";
import { BIG_TEN_BATCH2_ROSTERS } from "../server/bigTenBatch2";
import { BIG_TEN_BATCH3_ROSTERS } from "../server/bigTenBatch3";
import { BIG_12_ROSTERS } from "../server/big12Rosters";
import { PAC12_ROSTERS } from "../server/pac12Rosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import { AAC_ROSTERS } from "../server/aacRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import type { RealPlayer } from "../server/realRosters";

type RosterMap = Record<string, RealPlayer[]>;

interface ConferenceConfig {
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rosters: RosterMap[];
}

const CONFERENCES: ConferenceConfig[] = [
  { name: "SEC", tier: 1, rosters: [SEC_BATCH1_ROSTERS, SEC_BATCH2_ROSTERS, SEC_BATCH3_ROSTERS] },
  { name: "ACC", tier: 1, rosters: [ACC_BATCH1_ROSTERS, ACC_BATCH2_ROSTERS, ACC_BATCH3_ROSTERS] },
  { name: "Big Ten", tier: 1, rosters: [BIG_TEN_BATCH1_ROSTERS, BIG_TEN_BATCH2_ROSTERS, BIG_TEN_BATCH3_ROSTERS] },
  { name: "Big 12", tier: 1, rosters: [BIG_12_ROSTERS] },
  { name: "Pac-12", tier: 2, rosters: [PAC12_ROSTERS] },
  { name: "AAC", tier: 2, rosters: [AAC_ROSTERS] },
  { name: "Sun Belt", tier: 2, rosters: [SUN_BELT_ROSTERS] },
  { name: "WCC", tier: 3, rosters: [WCC_ROSTERS] },
  { name: "Big West", tier: 3, rosters: [BIG_WEST_ROSTERS] },
  { name: "Missouri Valley", tier: 3, rosters: [MO_VALLEY_ROSTERS] },
  { name: "Ivy League", tier: 4, rosters: [IVY_LEAGUE_ROSTERS] },
  { name: "HBCU", tier: 5, rosters: [HBCU_ROSTERS] },
];

const ATTRIBUTE_FIELDS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
];

const ROSTER_SIZE = 25;

interface ValidationIssue {
  conference: string;
  team: string;
  severity: "error" | "warning";
  message: string;
}

function validate(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const conf of CONFERENCES) {
    const merged: RosterMap = {};
    for (const r of conf.rosters) {
      for (const [team, players] of Object.entries(r)) {
        if (merged[team]) {
          issues.push({ conference: conf.name, team, severity: "error", message: `Duplicate team key across batch files` });
        }
        merged[team] = players;
      }
    }

    for (const [team, players] of Object.entries(merged)) {
      // 1. Roster size
      if (players.length !== ROSTER_SIZE) {
        issues.push({
          conference: conf.name,
          team,
          severity: "error",
          message: `Roster has ${players.length} players, expected ${ROSTER_SIZE}`,
        });
      }

      for (const p of players) {
        for (const f of ATTRIBUTE_FIELDS) {
          const v = p[f] as number;
          if (typeof v !== "number" || Number.isNaN(v)) {
            issues.push({
              conference: conf.name,
              team,
              severity: "error",
              message: `${p.firstName} ${p.lastName}: missing/invalid attribute "${String(f)}"`,
            });
            continue;
          }
          if (v < 0 || v > 99) {
            issues.push({
              conference: conf.name,
              team,
              severity: "error",
              message: `${p.firstName} ${p.lastName}: attribute "${String(f)}"=${v} out of range 0-99`,
            });
          }
        }
      }
    }
  }

  return issues;
}

function main() {
  // Validation fails the build/check by default. For emergency local
  // overrides, set SKIP_ROSTER_VALIDATION=1 to log issues without exiting.
  const skip = process.env.SKIP_ROSTER_VALIDATION === "1";

  const issues = validate();

  for (const i of issues) {
    const tag = skip ? "WARN" : "ERROR";
    console.log(`[${tag}] ${i.conference} / ${i.team}: ${i.message}`);
  }

  console.log("");
  if (skip) {
    console.log(`Roster validation: ${issues.length} issue(s) found (skip mode — not failing build)`);
    return;
  }
  console.log(`Roster validation: ${issues.length} error(s)`);
  if (issues.length > 0) {
    console.error("\nRoster validation failed. Fix the errors above, or set SKIP_ROSTER_VALIDATION=1 to bypass for emergency builds.");
    process.exit(1);
  }
}

main();
