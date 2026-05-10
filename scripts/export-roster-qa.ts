import ExcelJS from "exceljs";
import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { calculateOVR, getStarRatingFromOVR, getAbilityByName } from "../shared/abilities";

const CONFERENCE_MAP: Record<string, string[]> = {
  "SEC": [
    "Alabama", "Arkansas", "Auburn", "Florida", "Georgia", "Kentucky", "LSU",
    "Mississippi State", "Missouri", "Oklahoma", "Ole Miss", "South Carolina",
    "Tennessee", "Texas", "Texas A&M", "Vanderbilt",
  ],
  "ACC": [
    "Boston College", "California", "Clemson", "Duke", "Florida State",
    "Georgia Tech", "Louisville", "Miami", "NC State", "North Carolina",
    "Notre Dame", "Pittsburgh", "SMU", "Stanford", "Virginia", "Virginia Tech", "Wake Forest",
  ],
  "Big 12": [
    "Arizona", "Arizona State", "Baylor", "BYU", "Cincinnati", "Houston",
    "Kansas", "Kansas State", "Oklahoma State", "TCU", "Texas Tech", "UCF",
    "Utah", "West Virginia",
  ],
  "Big Ten": [
    "Illinois", "Indiana", "Iowa", "Maryland", "Michigan", "Michigan State",
    "Minnesota", "Nebraska", "Northwestern", "Ohio State", "Oregon", "Penn State",
    "Purdue", "Rutgers", "USC", "UCLA", "Washington", "Wisconsin",
  ],
  "Pac-12": ["Oregon State", "Washington State"],
  "AAC": [
    "East Carolina", "Wichita State", "Tulane", "Memphis", "South Florida",
    "Charlotte", "UAB", "Rice", "Florida Atlantic", "North Texas", "Dallas Baptist",
  ],
  "WCC": [
    "Pepperdine", "Loyola Marymount", "San Diego", "Saint Mary's",
    "Gonzaga", "Santa Clara", "Portland", "San Francisco",
  ],
  "Mountain West": [
    "Fresno State", "San Diego State", "UNLV", "Nevada", "New Mexico", "Air Force",
  ],
  "Ivy League": [
    "Columbia", "Cornell", "Dartmouth", "Harvard", "Penn", "Princeton", "Yale", "Brown",
  ],
  "Sun Belt": [
    "Coastal Carolina", "Southern Miss", "Troy", "Marshall", "Louisiana",
    "Old Dominion", "Arkansas State", "Georgia Southern", "App State",
    "Georgia State", "South Alabama", "James Madison", "Texas State",
  ],
  "Big West": [
    "Cal State Fullerton", "UC Irvine", "UC Santa Barbara", "Long Beach State",
    "UC San Diego", "Hawaii", "Cal Poly", "UC Davis", "Cal State Northridge",
    "Cal State Bakersfield",
  ],
  "HBCU": [
    "Grambling State", "Southern University", "Florida A&M", "Bethune-Cookman",
    "Jackson State", "North Carolina A&T", "Alabama State", "Norfolk State",
    "Alcorn State", "Prairie View A&M", "Texas Southern", "Howard",
    "Delaware State", "Coppin State", "North Carolina Central", "Maryland Eastern Shore",
  ],
  "Missouri Valley": [
    "Missouri State", "Indiana State", "Illinois State", "Southern Illinois",
    "Bradley", "Evansville", "Valparaiso", "UIC", "Belmont", "Murray State",
    "Western Illinois", "Northern Iowa", "Creighton",
  ],
};

function getConference(teamName: string): string {
  for (const [conf, teams] of Object.entries(CONFERENCE_MAP)) {
    if (teams.includes(teamName)) return conf;
  }
  return "Unknown";
}

interface PlayerRow {
  Rank: number;
  Conference: string;
  Team: string;
  Name: string;
  Pos: string;
  Eligibility: string;
  OVR: number;
  Stars: number;
  Potential: string;
  HitAvg: number;
  Power: number;
  Speed: number;
  Arm: number;
  Fielding: number;
  ErrRes: number;
  Velocity: number;
  Control: number;
  Stamina: number;
  Stuff: number;
  Abilities: string;
  Gold: number;
  Blue: number;
  Red: number;
}

const allRows: PlayerRow[] = [];

for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
  const conference = getConference(teamName);
  for (const p of players) {
    const ovr = calculateOVR({ ...p, position: p.position });
    const stars = getStarRatingFromOVR(ovr);
    let gold = 0, blue = 0, red = 0;
    for (const name of p.abilities) {
      const ability = getAbilityByName(name);
      if (ability) {
        if (ability.tier === "gold") gold++;
        else if (ability.tier === "blue") blue++;
        else if (ability.tier === "red") red++;
      }
    }
    allRows.push({
      Rank: 0, Conference: conference, Team: teamName,
      Name: `${p.firstName} ${p.lastName}`,
      Pos: p.position, Eligibility: p.eligibility,
      OVR: ovr, Stars: stars, Potential: p.potential,
      HitAvg: p.hitForAvg, Power: p.power, Speed: p.speed,
      Arm: p.arm, Fielding: p.fielding, ErrRes: p.errorResistance,
      Velocity: p.velocity, Control: p.control, Stamina: p.stamina, Stuff: p.stuff,
      Abilities: p.abilities.join(", "), Gold: gold, Blue: blue, Red: red,
    });
  }
}

allRows.sort((a, b) => b.OVR - a.OVR);
allRows.forEach((r, i) => { r.Rank = i + 1; });

const PITCHER_POS = new Set(["P", "SP", "RP", "CP"]);
const INFIELD_POS = new Set(["1B", "2B", "3B", "SS"]);
const OF_POS = new Set(["OF", "LF", "CF", "RF"]);

const pitcherRows = allRows.filter(r => PITCHER_POS.has(r.Pos)).map((r, i) => ({ ...r, Rank: i + 1 }));
const catcherRows = allRows.filter(r => r.Pos === "C").map((r, i) => ({ ...r, Rank: i + 1 }));
const infieldRows = allRows
  .filter(r => INFIELD_POS.has(r.Pos))
  .sort((a, b) => {
    const posOrder: Record<string, number> = { SS: 1, "2B": 2, "3B": 3, "1B": 4 };
    const pd = (posOrder[a.Pos] ?? 9) - (posOrder[b.Pos] ?? 9);
    return pd !== 0 ? pd : b.OVR - a.OVR;
  })
  .map((r, i) => ({ ...r, Rank: i + 1 }));
const ofRows = allRows.filter(r => OF_POS.has(r.Pos)).map((r, i) => ({ ...r, Rank: i + 1 }));

const HEADERS = [
  "Rank","Conference","Team","Name","Pos","Eligibility",
  "OVR","Stars","Potential",
  "HitAvg","Power","Speed","Arm","Fielding","ErrRes",
  "Velocity","Control","Stamina","Stuff",
  "Abilities","Gold","Blue","Red",
] as const;

const OVR_COL = HEADERS.indexOf("OVR") + 1;

const SUMMARY_HEADERS = [
  "Conference","Teams","Players","Avg OVR","Median OVR",
  "5★","4★","3★","2★","1★",
] as const;

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 === 0
    ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : sorted[Math.floor(n / 2)];
}

const summaryData = Object.keys(CONFERENCE_MAP).map(conf => {
  const rows = allRows.filter(r => r.Conference === conf);
  const ovrs = rows.map(r => r.OVR).sort((a, b) => a - b);
  const avgOVR = ovrs.length ? Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length) : 0;
  const med = ovrs.length ? median(ovrs) : 0;
  return {
    "Conference": conf,
    "Teams": new Set(rows.map(r => r.Team)).size,
    "Players": rows.length,
    "Avg OVR": avgOVR,
    "Median OVR": med,
    "5★": rows.filter(r => r.Stars === 5).length,
    "4★": rows.filter(r => r.Stars === 4).length,
    "3★": rows.filter(r => r.Stars === 3).length,
    "2★": rows.filter(r => r.Stars === 2).length,
    "1★": rows.filter(r => r.Stars === 1).length,
  };
}).sort((a, b) => b["Avg OVR"] - a["Avg OVR"]);

function addPlayerSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  rows: PlayerRow[],
) {
  const ws = wb.addWorksheet(sheetName);

  ws.columns = HEADERS.map(h => ({
    header: h,
    key: h,
    width: h === "Name" ? 24 : h === "Team" || h === "Conference" ? 20 : h === "Abilities" ? 50 : h === "Potential" ? 10 : 8,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A1F" } };
  headerRow.alignment = { horizontal: "center" };
  headerRow.getCell(OVR_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A4A1F" } };
  headerRow.commit();

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2", activeCell: "A2" }];

  for (const row of rows) {
    const exRow = ws.addRow(HEADERS.map(h => row[h as keyof PlayerRow]));
    const ovrCell = exRow.getCell(OVR_COL);
    ovrCell.numFmt = "0";
    ovrCell.font = { bold: true };
    exRow.commit();
  }

  ws.getColumn(OVR_COL).numFmt = "0";
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "College Baseball Dynasty";

  addPlayerSheet(wb, "All Players", allRows);
  addPlayerSheet(wb, "Pitchers", pitcherRows);
  addPlayerSheet(wb, "Catchers", catcherRows);
  addPlayerSheet(wb, "Infielders", infieldRows);
  addPlayerSheet(wb, "Outfielders", ofRows);

  const sumWs = wb.addWorksheet("Summary");
  sumWs.columns = SUMMARY_HEADERS.map(h => ({
    header: h,
    key: h,
    width: h === "Conference" ? 20 : 12,
  }));
  const sumHeader = sumWs.getRow(1);
  sumHeader.font = { bold: true };
  sumHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A1F" } };
  sumHeader.commit();
  sumWs.views = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2", activeCell: "A2" }];
  for (const row of summaryData) {
    const r = sumWs.addRow(SUMMARY_HEADERS.map(h => row[h as keyof typeof row]));
    r.getCell(4).numFmt = "0";
    r.getCell(5).numFmt = "0";
    r.commit();
  }

  const outPath = "roster-qa.xlsx";
  await wb.xlsx.writeFile(outPath);
  console.log(`\u2713 Wrote ${outPath} (${allRows.length} players across ${Object.keys(ALL_REAL_ROSTERS).length} teams)`);
  console.log(`  Pitchers: ${pitcherRows.length} | Catchers: ${catcherRows.length} | Infielders: ${infieldRows.length} | Outfielders: ${ofRows.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
