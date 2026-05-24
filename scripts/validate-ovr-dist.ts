/**
 * Validates OVR distribution across all real rosters.
 * Checks global elite (<3%) and above-average (<17%) thresholds,
 * plus per-conference and per-team guardrails.
 *
 * Wired into: validate-rosters workflow and validate-all suite.
 * Exits non-zero on any failure so CI catches regressions.
 */
import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

const ELITE_THRESHOLD = 500;
const ABOVE_AVG_THRESHOLD = 350;

const GLOBAL_ELITE_MAX_PCT = 3;
const GLOBAL_ABOVE_AVG_MAX_PCT = 17;
const CONF_ELITE_MAX_PCT = 8;
const CONF_ABOVE_AVG_MAX_PCT = 40;
const TEAM_ELITE_MAX = 6;

const CONFERENCES: Record<string, string[]> = {
  SEC: ["Alabama","Auburn","Florida","Georgia","Kentucky","LSU","Mississippi State","Missouri","Ole Miss","South Carolina","Tennessee","Texas A&M","Vanderbilt","Arkansas"],
  ACC: ["Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami","NC State","North Carolina","Notre Dame","Pittsburgh","Virginia","Virginia Tech","Wake Forest","Boston College","California","Stanford"],
  "Big 12": ["Arizona","Arizona State","Baylor","BYU","Cincinnati","Houston","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","West Virginia"],
  "Big Ten": ["Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska","Northwestern","Ohio State","Penn State","Purdue","Rutgers","Washington"],
  "Pac-12": ["Oregon","Oregon State","USC","UCLA","Washington State","Fresno State","San Diego State","UNLV","Nevada","New Mexico","Air Force"],
  AAC: ["Charlotte","East Carolina","Memphis","North Texas","Rice","South Florida","Tulane","UAB"],
  "Sun Belt": ["App State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Louisiana","Marshall","Old Dominion","South Alabama","Southern Miss","Troy"],
  WCC: ["Gonzaga","Loyola Marymount","Pepperdine","Portland","Saint Mary's","San Diego","San Francisco","Santa Clara"],
  "Big West": ["Cal Poly","Cal State Bakersfield","Cal State Fullerton","Cal State Northridge","Hawaii","Long Beach State","UC Davis","UC Irvine","UC San Diego","UC Santa Barbara"],
  "Missouri Valley": ["Belmont","Bradley","Dallas Baptist","Evansville","Illinois State","Indiana State","Missouri State","Murray State","Northern Iowa","Southern Illinois","Valparaiso","Western Illinois"],
  "Ivy League": ["Brown","Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale"],
  HBCU: ["Alabama State","Alcorn State","Bethune-Cookman","Coppin State","Delaware State","Florida A&M","Grambling State","Howard","Jackson State","Maryland Eastern Shore","Norfolk State","North Carolina A&T","North Carolina Central","Prairie View A&M","Southern University","Texas Southern"],
};

let globalElite = 0, globalAboveElite = 0, globalAvg = 0, globalBelow = 0, globalTotal = 0;
const teamAvgs: {name: string; avg: number; count: number; elite: number; above: number}[] = [];
const confStats: Record<string, {elite: number; above: number; total: number}> = {};

for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const ovrs = players.map((p: any) => calculateOVR(p));
  const avg = ovrs.reduce((a: number, b: number) => a + b, 0) / ovrs.length;
  const elite = ovrs.filter((o: number) => o >= ELITE_THRESHOLD).length;
  const above = ovrs.filter((o: number) => o >= ABOVE_AVG_THRESHOLD && o < ELITE_THRESHOLD).length;
  const avg250 = ovrs.filter((o: number) => o >= 250 && o < ABOVE_AVG_THRESHOLD).length;
  const below = ovrs.filter((o: number) => o < 250).length;
  teamAvgs.push({ name: teamName, avg, count: players.length, elite, above });

  globalElite += elite;
  globalAboveElite += above;
  globalAvg += avg250;
  globalBelow += below;
  globalTotal += players.length;

  for (const [confName, teams] of Object.entries(CONFERENCES)) {
    if (teams.includes(teamName)) {
      if (!confStats[confName]) confStats[confName] = { elite: 0, above: 0, total: 0 };
      confStats[confName].elite += elite;
      confStats[confName].above += above;
      confStats[confName].total += players.length;
    }
  }
}

const elitePct = (globalElite / globalTotal) * 100;
const abovePct = ((globalElite + globalAboveElite) / globalTotal) * 100;

console.log("\n=== GLOBAL OVR DISTRIBUTION ===");
console.log(`Total players: ${globalTotal}`);
console.log(`Elite (${ELITE_THRESHOLD}+):         ${globalElite} = ${elitePct.toFixed(1)}%  [target <${GLOBAL_ELITE_MAX_PCT}%]`);
console.log(`Above Avg (${ABOVE_AVG_THRESHOLD}-499):  ${globalElite + globalAboveElite} = ${abovePct.toFixed(1)}%  [target <${GLOBAL_ABOVE_AVG_MAX_PCT}%]`);
console.log(`Average (250-349):   ${globalAvg} = ${(globalAvg/globalTotal*100).toFixed(1)}%`);
console.log(`Below Avg (<250):    ${globalBelow} = ${(globalBelow/globalTotal*100).toFixed(1)}%`);

let failures = 0;

if (elitePct >= GLOBAL_ELITE_MAX_PCT) {
  console.error(`\n❌ FAIL: Elite (${ELITE_THRESHOLD}+) = ${elitePct.toFixed(1)}% — exceeds ${GLOBAL_ELITE_MAX_PCT}% global cap`);
  failures++;
} else {
  console.log(`\n✅ Elite <${GLOBAL_ELITE_MAX_PCT}%: PASS (${elitePct.toFixed(1)}%)`);
}

if (abovePct >= GLOBAL_ABOVE_AVG_MAX_PCT) {
  console.error(`❌ FAIL: Above Avg = ${abovePct.toFixed(1)}% — exceeds ${GLOBAL_ABOVE_AVG_MAX_PCT}% global cap`);
  failures++;
} else {
  console.log(`✅ Above Avg <${GLOBAL_ABOVE_AVG_MAX_PCT}%: PASS (${abovePct.toFixed(1)}%)`);
}

console.log("\n=== PER-CONFERENCE GUARDRAILS ===");
for (const [confName, stats] of Object.entries(confStats).sort((a,b) => (b[1].elite/b[1].total) - (a[1].elite/a[1].total))) {
  if (stats.total === 0) continue;
  const cElitePct = (stats.elite / stats.total) * 100;
  const cAbovePct = ((stats.elite + stats.above) / stats.total) * 100;
  const eliteOk = cElitePct < CONF_ELITE_MAX_PCT;
  const aboveOk = cAbovePct < CONF_ABOVE_AVG_MAX_PCT;
  console.log(
    `  ${confName.padEnd(14)} elite=${cElitePct.toFixed(1)}% ${eliteOk ? "✅" : "❌"}  above_avg=${cAbovePct.toFixed(1)}% ${aboveOk ? "✅" : "❌"}  (${stats.total} players)`
  );
  if (!eliteOk) {
    console.error(`    ❌ ${confName}: elite ${cElitePct.toFixed(1)}% exceeds ${CONF_ELITE_MAX_PCT}% conference cap`);
    failures++;
  }
  if (!aboveOk) {
    console.error(`    ❌ ${confName}: above-avg ${cAbovePct.toFixed(1)}% exceeds ${CONF_ABOVE_AVG_MAX_PCT}% conference cap`);
    failures++;
  }
}

console.log("\n=== PER-TEAM ELITE CAP ===");
const overTeams = teamAvgs.filter(t => t.elite > TEAM_ELITE_MAX);
if (overTeams.length > 0) {
  for (const t of overTeams) {
    console.error(`❌ ${t.name}: ${t.elite} elite players — exceeds per-team cap of ${TEAM_ELITE_MAX}`);
    failures++;
  }
} else {
  console.log(`✅ No team exceeds ${TEAM_ELITE_MAX} elite players`);
}

teamAvgs.sort((a, b) => b.avg - a.avg);
console.log("\n=== TOP 20 TEAMS BY AVG OVR ===");
for (const t of teamAvgs.slice(0, 20)) {
  console.log(`  ${t.name.padEnd(25)} avg=${Math.round(t.avg)}  elite=${t.elite}/${t.count}`);
}

const eliteTeams = teamAvgs.filter(t => t.elite > 0).sort((a,b) => b.elite - a.elite);
console.log(`\nTeams with 5-star (${ELITE_THRESHOLD}+) players: ${eliteTeams.length}`);
for (const t of eliteTeams) {
  console.log(`  ${t.name.padEnd(25)} ${t.elite} elite player${t.elite > 1 ? "s" : ""}`);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} OVR distribution check(s) failed. Re-run scripts/recalibrate-rosters.ts after adjusting bonus values or calibration formula.`);
  process.exit(1);
}
console.log(`\n✅ All OVR distribution checks passed.`);
