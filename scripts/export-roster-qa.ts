import * as XLSX from "xlsx";
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
    for (const abilityName of p.abilities) {
      const ability = getAbilityByName(abilityName);
      if (ability) {
        if (ability.tier === "gold") gold++;
        else if (ability.tier === "blue") blue++;
        else if (ability.tier === "red") red++;
      }
    }

    allRows.push({
      Rank: 0,
      Conference: conference,
      Team: teamName,
      Name: `${p.firstName} ${p.lastName}`,
      Pos: p.position,
      Eligibility: p.eligibility,
      OVR: ovr,
      Stars: stars,
      Potential: p.potential,
      HitAvg: p.hitForAvg,
      Power: p.power,
      Speed: p.speed,
      Arm: p.arm,
      Fielding: p.fielding,
      ErrRes: p.errorResistance,
      Velocity: p.velocity,
      Control: p.control,
      Stamina: p.stamina,
      Stuff: p.stuff,
      Abilities: p.abilities.join(", "),
      Gold: gold,
      Blue: blue,
      Red: red,
    });
  }
}

allRows.sort((a, b) => b.OVR - a.OVR);
allRows.forEach((r, i) => { r.Rank = i + 1; });

const PITCHER_POS = new Set(["P", "SP", "RP", "CP"]);
const INFIELD_POS = new Set(["1B", "2B", "3B", "SS"]);

const pitcherRows = allRows.filter(r => PITCHER_POS.has(r.Pos)).map((r, i) => ({ ...r, Rank: i + 1 }));
const catcherRows = allRows.filter(r => r.Pos === "C").map((r, i) => ({ ...r, Rank: i + 1 }));

const infieldRows = allRows
  .filter(r => INFIELD_POS.has(r.Pos))
  .sort((a, b) => {
    const posOrder: Record<string, number> = { "SS": 1, "2B": 2, "3B": 3, "1B": 4 };
    const pDiff = (posOrder[a.Pos] ?? 9) - (posOrder[b.Pos] ?? 9);
    return pDiff !== 0 ? pDiff : b.OVR - a.OVR;
  })
  .map((r, i) => ({ ...r, Rank: i + 1 }));

const ofRows = allRows.filter(r => r.Pos === "OF" || r.Pos === "LF" || r.Pos === "CF" || r.Pos === "RF")
  .map((r, i) => ({ ...r, Rank: i + 1 }));

interface SummaryRow {
  Conference: string;
  Teams: number;
  Players: number;
  "Avg OVR": number;
  "Median OVR": number;
  "5★": number;
  "4★": number;
  "3★": number;
  "2★": number;
  "1★": number;
}

const summaryRows: SummaryRow[] = [];
for (const conf of Object.keys(CONFERENCE_MAP)) {
  const rows = allRows.filter(r => r.Conference === conf);
  if (rows.length === 0) continue;

  const ovrs = rows.map(r => r.OVR).sort((a, b) => a - b);
  const median = ovrs.length % 2 === 0
    ? Math.round((ovrs[ovrs.length / 2 - 1] + ovrs[ovrs.length / 2]) / 2)
    : ovrs[Math.floor(ovrs.length / 2)];
  const avgOVR = Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length);

  const teamNames = new Set(rows.map(r => r.Team));

  summaryRows.push({
    Conference: conf,
    Teams: teamNames.size,
    Players: rows.length,
    "Avg OVR": avgOVR,
    "Median OVR": median,
    "5★": rows.filter(r => r.Stars === 5).length,
    "4★": rows.filter(r => r.Stars === 4).length,
    "3★": rows.filter(r => r.Stars === 3).length,
    "2★": rows.filter(r => r.Stars === 2).length,
    "1★": rows.filter(r => r.Stars === 1).length,
  });
}

summaryRows.sort((a, b) => b["Avg OVR"] - a["Avg OVR"]);

function makeSheet(rows: object[], freezeRows = 1) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!freeze"] = { xSplit: 0, ySplit: freezeRows };
  return ws;
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, makeSheet(allRows), "All Players");
XLSX.utils.book_append_sheet(wb, makeSheet(pitcherRows), "Pitchers");
XLSX.utils.book_append_sheet(wb, makeSheet(catcherRows), "Catchers");
XLSX.utils.book_append_sheet(wb, makeSheet(infieldRows), "Infielders");
XLSX.utils.book_append_sheet(wb, makeSheet(ofRows), "Outfielders");
XLSX.utils.book_append_sheet(wb, makeSheet(summaryRows), "Summary");

const outPath = "roster-qa.xlsx";
XLSX.writeFile(wb, outPath);
console.log(`\u2713 Wrote ${outPath} (${allRows.length} players across ${Object.keys(ALL_REAL_ROSTERS).length} teams)`);
console.log(`  Pitchers: ${pitcherRows.length} | Catchers: ${catcherRows.length} | Infielders: ${infieldRows.length} | Outfielders: ${ofRows.length}`);
