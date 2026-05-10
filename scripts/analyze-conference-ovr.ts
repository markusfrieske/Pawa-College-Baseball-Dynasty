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
import { AAC_ROSTERS } from "../server/aacRosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import { MWC_ROSTERS } from "../server/mwcRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

type Roster = Record<string, RealPlayer[]>;

function analyzeConf(name: string, rosters: Roster[]) {
  const allOVRs: number[] = [];
  const teamAvgs: {team: string; avg: number; n: number}[] = [];

  for (const roster of rosters) {
    for (const [team, players] of Object.entries(roster)) {
      const teamOVRs = players.map((p: RealPlayer) => calculateOVR(p));
      const avg = Math.round(teamOVRs.reduce((a, b) => a + b, 0) / teamOVRs.length);
      teamAvgs.push({ team, avg, n: players.length });
      allOVRs.push(...teamOVRs);
    }
  }

  allOVRs.sort((a, b) => b - a);
  const avg = Math.round(allOVRs.reduce((a, b) => a + b, 0) / allOVRs.length);
  const p80 = allOVRs[Math.floor(allOVRs.length * 0.2)];
  const top5 = allOVRs.slice(0, 5).join("/");

  console.log(`\n=== ${name} (n=${allOVRs.length}) ===`);
  console.log(`  Conf avg=${avg}  p80=${p80}  top5=${top5}`);
  for (const t of teamAvgs.sort((a, b) => b.avg - a.avg)) {
    console.log(`    ${t.team.padEnd(30)} avg=${t.avg}  n=${t.n}`);
  }
}

analyzeConf("SEC (Tier 1)", [SEC_BATCH1_ROSTERS, SEC_BATCH2_ROSTERS, SEC_BATCH3_ROSTERS]);
analyzeConf("ACC (Tier 1)", [ACC_BATCH1_ROSTERS, ACC_BATCH2_ROSTERS, ACC_BATCH3_ROSTERS]);
analyzeConf("Big Ten (Tier 1)", [BIG_TEN_BATCH1_ROSTERS, BIG_TEN_BATCH2_ROSTERS, BIG_TEN_BATCH3_ROSTERS]);
analyzeConf("Big 12 (Tier 1)", [BIG_12_ROSTERS]);
analyzeConf("Pac-12 (Tier 2)", [PAC12_ROSTERS]);
analyzeConf("AAC (Tier 2)", [AAC_ROSTERS]);
analyzeConf("Sun Belt (Tier 2)", [SUN_BELT_ROSTERS]);
analyzeConf("WCC (Tier 3)", [WCC_ROSTERS]);
analyzeConf("MWC (Tier 3)", [MWC_ROSTERS]);
analyzeConf("Big West (Tier 3)", [BIG_WEST_ROSTERS]);
analyzeConf("Missouri Valley (Tier 4)", [MO_VALLEY_ROSTERS]);
analyzeConf("Ivy League (Tier 4)", [IVY_LEAGUE_ROSTERS]);
analyzeConf("HBCU (Tier 5)", [HBCU_ROSTERS]);
