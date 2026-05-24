import { ALL_REAL_ROSTERS } from "../server/realRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR, getStarRatingFromOVR } from "../shared/abilities";

type Roster = Record<string, RealPlayer[]>;

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

// ── Target bands from spec ─────────────────────────────────────────────────
// 5★ (≥500): <3%   4★ (400-499): <17%   3★ (300-399): ~60%
// 2★ (200-299): ~20%   1★ (<200): remainder
type TargetEntry =
  | { label: string; max: number }
  | { label: string; lo: number; hi: number }
  | { label: string; note: string };

const TARGETS: Record<number, TargetEntry> = {
  5: { label: "5★ (≥500)", max: 3 },
  4: { label: "4★ (400-499)", max: 17 },
  3: { label: "3★ (300-399)", lo: 50, hi: 70 },
  2: { label: "2★ (200-299)", lo: 10, hi: 30 },
  1: { label: "1★ (<200)", note: "remainder" },
};

interface ConfResult {
  name: string;
  tier: number;
  allOVRs: number[];
  hitterOVRs: number[];
  pitcherOVRs: number[];
}

function analyzeConf(name: string, tier: number, rosters: Roster[]): ConfResult {
  const allOVRs: number[] = [];
  const hitterOVRs: number[] = [];
  const pitcherOVRs: number[] = [];
  const teamAvgs: {team: string; avg: number; hAvg: number; pAvg: number; n: number}[] = [];

  for (const roster of rosters) {
    for (const [team, players] of Object.entries(roster)) {
      const teamOVRs: number[] = [];
      const tH: number[] = [];
      const tP: number[] = [];
      for (const p of players as RealPlayer[]) {
        const ovr = calculateOVR(p);
        teamOVRs.push(ovr);
        if (PITCHER_POSITIONS.has(p.position)) {
          pitcherOVRs.push(ovr);
          tP.push(ovr);
        } else {
          hitterOVRs.push(ovr);
          tH.push(ovr);
        }
      }
      const avg = Math.round(teamOVRs.reduce((a, b) => a + b, 0) / teamOVRs.length);
      const hAvg = tH.length ? Math.round(tH.reduce((a, b) => a + b, 0) / tH.length) : 0;
      const pAvg = tP.length ? Math.round(tP.reduce((a, b) => a + b, 0) / tP.length) : 0;
      teamAvgs.push({ team, avg, hAvg, pAvg, n: teamOVRs.length });
      allOVRs.push(...teamOVRs);
    }
  }

  allOVRs.sort((a, b) => b - a);
  const avg = Math.round(allOVRs.reduce((a, b) => a + b, 0) / allOVRs.length);
  const hAvg = hitterOVRs.length ? Math.round(hitterOVRs.reduce((a, b) => a + b, 0) / hitterOVRs.length) : 0;
  const pAvg = pitcherOVRs.length ? Math.round(pitcherOVRs.reduce((a, b) => a + b, 0) / pitcherOVRs.length) : 0;
  const p80 = allOVRs[Math.floor(allOVRs.length * 0.2)];
  const top5 = allOVRs.slice(0, 5).join("/");

  // Star distribution
  const stars: Record<number, number> = {5:0, 4:0, 3:0, 2:0, 1:0};
  for (const ovr of allOVRs) stars[getStarRatingFromOVR(ovr)]++;
  const n = allOVRs.length;
  const starPct = (s: number) => ((stars[s] / n) * 100).toFixed(1);

  console.log(`\n=== ${name} (n=${n}) ===`);
  console.log(`  avg=${avg}  hitters=${hAvg}(n=${hitterOVRs.length})  pitchers=${pAvg}(n=${pitcherOVRs.length})  p80=${p80}  top5=${top5}`);
  console.log(`  Stars: 5★=${starPct(5)}%  4★=${starPct(4)}%  3★=${starPct(3)}%  2★=${starPct(2)}%  1★=${starPct(1)}%`);
  for (const t of teamAvgs.sort((a, b) => b.avg - a.avg)) {
    console.log(`    ${t.team.padEnd(32)} avg=${t.avg}  H=${t.hAvg}  P=${t.pAvg}  n=${t.n}`);
  }

  return { name, tier, allOVRs, hitterOVRs, pitcherOVRs };
}

// ── Group ALL_REAL_ROSTERS by conference using team names ──────────────────
const SEC_TEAMS = new Set([
  "Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU","Mississippi State",
  "Missouri","Ole Miss","South Carolina","Tennessee","Texas","Texas A&M","Vanderbilt","Oklahoma"
]);
const ACC_TEAMS = new Set([
  "Boston College","Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami",
  "NC State","Notre Dame","Pittsburgh","Syracuse","Virginia","Virginia Tech","Wake Forest",
  "North Carolina","Georgia Tech"
]);
const BIG_TEN_TEAMS = new Set([
  "Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska",
  "Northwestern","Ohio State","Penn State","Purdue","Rutgers","Wisconsin","Oregon","UCLA","Washington"
]);
const BIG_12_TEAMS = new Set([
  "Arizona","Arizona State","BYU","Baylor","Cincinnati","Houston","Iowa State","Kansas",
  "Kansas State","Oklahoma State","TCU","Texas Tech","UCF","West Virginia"
]);
const PAC12_TEAMS = new Set([
  "Cal","Oregon State","Stanford","Utah","Washington State","Air Force","Fresno State",
  "Nevada","New Mexico","San Diego State","UNLV","Southern California"
]);
const AAC_TEAMS = new Set([
  "Charlotte","East Carolina","Florida Atlantic","Memphis","Rice","South Florida","Temple",
  "Tulane","Tulsa","UAB","Wichita State"
]);
const SUN_BELT_TEAMS = new Set([
  "Appalachian State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State",
  "James Madison","Louisiana","Louisiana Monroe","Marshall","Old Dominion","Southern Miss",
  "Texas State","Troy"
]);
const WCC_TEAMS = new Set([
  "Grand Canyon","Loyola Marymount","Pacific","Pepperdine","Portland","San Diego","Santa Clara","St. Mary's"
]);
const BIG_WEST_TEAMS = new Set([
  "Cal Poly","Cal State Bakersfield","Cal State Fullerton","Cal State Northridge","Hawaii",
  "Long Beach State","UC Davis","UC Irvine","UC Riverside","UC Santa Barbara"
]);
const MO_VALLEY_TEAMS = new Set([
  "Bradley","Dallas Baptist","Evansville","Illinois State","Indiana State","Missouri State",
  "Murray State","Northern Iowa","Oklahoma State","Oral Roberts","South Dakota State","Southern Illinois","Valparaiso"
]);
const IVY_TEAMS = new Set([
  "Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale","Brown"
]);

function rostersByTeamSet(teamSet: Set<string>): Roster {
  const result: Roster = {};
  for (const [name, players] of Object.entries(ALL_REAL_ROSTERS)) {
    if (teamSet.has(name)) result[name] = players;
  }
  return result;
}

function rostersByExclusion(excludeSets: Set<string>[]): Roster {
  const excluded = new Set<string>();
  for (const s of excludeSets) for (const t of s) excluded.add(t);
  const result: Roster = {};
  for (const [name, players] of Object.entries(ALL_REAL_ROSTERS)) {
    if (!excluded.has(name)) result[name] = players;
  }
  return result;
}

const results: ConfResult[] = [];
results.push(analyzeConf("SEC (Tier 1)", 1, [rostersByTeamSet(SEC_TEAMS)]));
results.push(analyzeConf("ACC (Tier 1)", 1, [rostersByTeamSet(ACC_TEAMS)]));
results.push(analyzeConf("Big Ten (Tier 1)", 1, [rostersByTeamSet(BIG_TEN_TEAMS)]));
results.push(analyzeConf("Big 12 (Tier 1)", 1, [rostersByTeamSet(BIG_12_TEAMS)]));
results.push(analyzeConf("Pac-12 (Tier 2)", 2, [rostersByTeamSet(PAC12_TEAMS)]));
results.push(analyzeConf("AAC (Tier 2)", 2, [rostersByTeamSet(AAC_TEAMS)]));
results.push(analyzeConf("Sun Belt (Tier 2)", 2, [rostersByTeamSet(SUN_BELT_TEAMS)]));
results.push(analyzeConf("WCC (Tier 3)", 3, [rostersByTeamSet(WCC_TEAMS)]));
results.push(analyzeConf("Big West (Tier 3)", 3, [rostersByTeamSet(BIG_WEST_TEAMS)]));
results.push(analyzeConf("Missouri Valley (Tier 4)", 4, [rostersByTeamSet(MO_VALLEY_TEAMS)]));
results.push(analyzeConf("Ivy League (Tier 4)", 4, [rostersByTeamSet(IVY_TEAMS)]));
results.push(analyzeConf("HBCU (Tier 5)", 5, [rostersByExclusion([
  SEC_TEAMS, ACC_TEAMS, BIG_TEN_TEAMS, BIG_12_TEAMS, PAC12_TEAMS,
  AAC_TEAMS, SUN_BELT_TEAMS, WCC_TEAMS, BIG_WEST_TEAMS, MO_VALLEY_TEAMS, IVY_TEAMS
])]));

// ── Global summary ─────────────────────────────────────────────────────────
const globalOVRs: number[] = results.flatMap(r => r.allOVRs);
const globalH: number[] = results.flatMap(r => r.hitterOVRs);
const globalP: number[] = results.flatMap(r => r.pitcherOVRs);
const gStars: Record<number, number> = {5:0, 4:0, 3:0, 2:0, 1:0};
for (const ovr of globalOVRs) gStars[getStarRatingFromOVR(ovr)]++;
const gn = globalOVRs.length;
const gAvg = Math.round(globalOVRs.reduce((a,b) => a+b, 0) / gn);
const ghAvg = Math.round(globalH.reduce((a,b) => a+b, 0) / globalH.length);
const gpAvg = Math.round(globalP.reduce((a,b) => a+b, 0) / globalP.length);

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║                 GLOBAL DISTRIBUTION AUDIT                   ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`Total players: ${gn}   Global avg OVR: ${gAvg}`);
console.log(`  Hitters: avg=${ghAvg} (n=${globalH.length})   Pitchers: avg=${gpAvg} (n=${globalP.length})`);
console.log("\nStar-rating distribution vs. targets:");

const flags: string[] = [];
for (const [sStr, info] of Object.entries(TARGETS)) {
  const s = parseInt(sStr);
  const count = gStars[s];
  const pct = (count / gn) * 100;
  const pctStr = pct.toFixed(2) + "%";
  let flag = "  OK ";

  if ("max" in info) {
    if (pct > info.max) { flag = " OVER"; flags.push(`${s}★ is ${pctStr} > ${info.max}% cap`); }
  } else if ("lo" in info) {
    if (pct < info.lo) { flag = "  LOW"; flags.push(`${s}★ is ${pctStr} (below ${info.lo}% floor)`); }
    else if (pct > info.hi) { flag = " HIGH"; flags.push(`${s}★ is ${pctStr} (above ${info.hi}% ceiling)`); }
  }

  console.log(`  ${info.label.padEnd(18)}  ${String(count).padStart(5)} players  ${pctStr.padStart(6)}   [${flag.trim()}]`);
}

// OVR band breakdown
console.log("\nOVR band breakdown:");
const bands = [
  { label: "Elite    (500-650)", lo: 500, hi: 650 },
  { label: "Above Avg(350-499)", lo: 350, hi: 499 },
  { label: "Average  (250-349)", lo: 250, hi: 349 },
  { label: "Below Avg(150-249)", lo: 150, hi: 249 },
];
for (const b of bands) {
  const cnt = globalOVRs.filter(o => o >= b.lo && o <= b.hi).length;
  console.log(`  ${b.label}  ${String(cnt).padStart(5)} (${((cnt/gn)*100).toFixed(1)}%)`);
}

// OVR histogram (buckets of 50)
console.log("\nOVR histogram (buckets of 50):");
for (let lo = 150; lo < 700; lo += 50) {
  const hi = lo + 49;
  const cnt = globalOVRs.filter(o => o >= lo && o <= hi).length;
  const bar = "█".repeat(Math.round((cnt/gn)*200));
  console.log(`  ${lo}-${hi}: ${String(cnt).padStart(5)} (${((cnt/gn)*100).toFixed(1)}%)  ${bar}`);
}

// Per-tier summary
console.log("\nPer-tier averages:");
for (let t = 1; t <= 5; t++) {
  const tier = results.filter(r => r.tier === t);
  if (!tier.length) continue;
  const tOVRs = tier.flatMap(r => r.allOVRs);
  const tH = tier.flatMap(r => r.hitterOVRs);
  const tP = tier.flatMap(r => r.pitcherOVRs);
  const tAvg = Math.round(tOVRs.reduce((a,b) => a+b,0) / tOVRs.length);
  const thAvg = tH.length ? Math.round(tH.reduce((a,b) => a+b,0) / tH.length) : 0;
  const tpAvg = tP.length ? Math.round(tP.reduce((a,b) => a+b,0) / tP.length) : 0;
  console.log(`  Tier ${t}: avg=${tAvg}  hitters=${thAvg}  pitchers=${tpAvg}  n=${tOVRs.length}`);
}

if (flags.length === 0) {
  console.log("\n✔ All star-rating bands are within spec. No adjustments needed.");
} else {
  console.log("\n⚠ Issues found:");
  for (const f of flags) console.log("  - " + f);
}
