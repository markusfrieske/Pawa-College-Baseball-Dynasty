import * as XLSX from "xlsx";
import JSZip from "jszip";
import { writeFileSync } from "fs";
import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { calculateOVR, getStarRatingFromOVR, getAbilityByName } from "../shared/abilities";

const CONFERENCE_MAP: Record<string, string[]> = {
  "SEC": [
    "Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU",
    "Mississippi State","Missouri","Oklahoma","Ole Miss","South Carolina",
    "Tennessee","Texas","Texas A&M","Vanderbilt",
  ],
  "ACC": [
    "Boston College","California","Clemson","Duke","Florida State",
    "Georgia Tech","Louisville","Miami","NC State","North Carolina",
    "Notre Dame","Pittsburgh","SMU","Stanford","Virginia","Virginia Tech","Wake Forest",
  ],
  "Big 12": [
    "Arizona","Arizona State","Baylor","BYU","Cincinnati","Houston",
    "Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF",
    "Utah","West Virginia",
  ],
  "Big Ten": [
    "Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State",
    "Minnesota","Nebraska","Northwestern","Ohio State","Oregon","Penn State",
    "Purdue","Rutgers","USC","UCLA","Washington","Wisconsin",
  ],
  "Pac-12": ["Oregon State","Washington State"],
  "AAC": [
    "East Carolina","Wichita State","Tulane","Memphis","South Florida",
    "Charlotte","UAB","Rice","Florida Atlantic","North Texas","Dallas Baptist",
  ],
  "WCC": [
    "Pepperdine","Loyola Marymount","San Diego","Saint Mary's",
    "Gonzaga","Santa Clara","Portland","San Francisco",
  ],
  "Mountain West": [
    "Fresno State","San Diego State","UNLV","Nevada","New Mexico","Air Force",
  ],
  "Ivy League": [
    "Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale","Brown",
  ],
  "Sun Belt": [
    "Coastal Carolina","Southern Miss","Troy","Marshall","Louisiana",
    "Old Dominion","Arkansas State","Georgia Southern","App State",
    "Georgia State","South Alabama","James Madison","Texas State",
  ],
  "Big West": [
    "Cal State Fullerton","UC Irvine","UC Santa Barbara","Long Beach State",
    "UC San Diego","Hawaii","Cal Poly","UC Davis","Cal State Northridge",
    "Cal State Bakersfield",
  ],
  "HBCU": [
    "Grambling State","Southern University","Florida A&M","Bethune-Cookman",
    "Jackson State","North Carolina A&T","Alabama State","Norfolk State",
    "Alcorn State","Prairie View A&M","Texas Southern","Howard",
    "Delaware State","Coppin State","North Carolina Central","Maryland Eastern Shore",
  ],
  "Missouri Valley": [
    "Missouri State","Indiana State","Illinois State","Southern Illinois",
    "Bradley","Evansville","Valparaiso","UIC","Belmont","Murray State",
    "Western Illinois","Northern Iowa","Creighton",
  ],
};

function getConference(teamName: string): string {
  for (const [conf, teams] of Object.entries(CONFERENCE_MAP)) {
    if (teams.includes(teamName)) return conf;
  }
  return "Unknown";
}

const HEADERS = [
  "Rank","Conference","Team","Name","Pos","Eligibility",
  "OVR","Stars","Potential",
  "HitAvg","Power","Speed","Arm","Fielding","ErrRes",
  "Velocity","Control","Stamina","Stuff",
  "Abilities","Gold","Blue","Red",
] as const;

type Header = typeof HEADERS[number];
type PlayerRow = Record<Header, string | number>;

const OVR_COL_IDX = HEADERS.indexOf("OVR");

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
    const row: PlayerRow = {
      Rank: 0, Conference: conference, Team: teamName,
      Name: `${p.firstName} ${p.lastName}`,
      Pos: p.position, Eligibility: p.eligibility,
      OVR: ovr, Stars: stars, Potential: p.potential,
      HitAvg: p.hitForAvg, Power: p.power, Speed: p.speed,
      Arm: p.arm, Fielding: p.fielding, ErrRes: p.errorResistance,
      Velocity: p.velocity, Control: p.control, Stamina: p.stamina, Stuff: p.stuff,
      Abilities: p.abilities.join(", "), Gold: gold, Blue: blue, Red: red,
    };
    allRows.push(row);
  }
}

allRows.sort((a, b) => (b.OVR as number) - (a.OVR as number));
allRows.forEach((r, i) => { r.Rank = i + 1; });

const pitcherRows = allRows
  .filter(r => r.Pos === "P")
  .map((r, i) => ({ ...r, Rank: i + 1 }));

const catcherRows = allRows
  .filter(r => r.Pos === "C")
  .map((r, i) => ({ ...r, Rank: i + 1 }));

const infieldRows = allRows
  .filter(r => ["1B","2B","3B","SS"].includes(r.Pos as string))
  .sort((a, b) => {
    const ord: Record<string, number> = { SS: 1, "2B": 2, "3B": 3, "1B": 4 };
    const pd = (ord[a.Pos as string] ?? 9) - (ord[b.Pos as string] ?? 9);
    return pd !== 0 ? pd : (b.OVR as number) - (a.OVR as number);
  })
  .map((r, i) => ({ ...r, Rank: i + 1 }));

const ofRows = allRows
  .filter(r => r.Pos === "OF")
  .map((r, i) => ({ ...r, Rank: i + 1 }));

function buildSheet(rows: PlayerRow[]): XLSX.WorkSheet {
  const data = rows.map(r => HEADERS.map(h => r[h]));
  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...data]);
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let rowIdx = 1; rowIdx <= range.e.r; rowIdx++) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: OVR_COL_IDX });
    if (ws[cellRef] && ws[cellRef].t === "n") {
      ws[cellRef].z = "0";
    }
  }
  return ws;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return 0;
  return n % 2 === 0
    ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : sorted[Math.floor(n / 2)];
}

const SUMMARY_HEADERS = [
  "Conference","Teams","Players","Avg OVR","Median OVR",
  "5 Star","4 Star","3 Star","2 Star","1 Star",
] as const;

const summaryData = Object.keys(CONFERENCE_MAP).map(conf => {
  const rows = allRows.filter(r => r.Conference === conf);
  const ovrs = rows.map(r => r.OVR as number).sort((a, b) => a - b);
  const avgOVR = ovrs.length ? Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length) : 0;
  return [
    conf,
    new Set(rows.map(r => r.Team)).size,
    rows.length,
    avgOVR,
    median(ovrs),
    rows.filter(r => r.Stars === 5).length,
    rows.filter(r => r.Stars === 4).length,
    rows.filter(r => r.Stars === 3).length,
    rows.filter(r => r.Stars === 2).length,
    rows.filter(r => r.Stars === 1).length,
  ];
}).sort((a, b) => (b[3] as number) - (a[3] as number));

function buildSummarySheet(): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([
    SUMMARY_HEADERS as unknown as string[],
    ...summaryData,
  ]);
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let rowIdx = 1; rowIdx <= range.e.r; rowIdx++) {
    for (const colIdx of [3, 4]) {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
      if (ws[ref] && ws[ref].t === "n") ws[ref].z = "0";
    }
  }
  return ws;
}

async function injectFreezePanes(buf: Buffer, sheetCount: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const FREEZE_XML =
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft"/>`;
  for (let i = 1; i <= sheetCount; i++) {
    const path = `xl/worksheets/sheet${i}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async("string");
    xml = xml.replace(
      /<sheetView([^>]*)\/>/g,
      `<sheetView$1>${FREEZE_XML}</sheetView>`,
    );
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function main() {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSheet(allRows), "All Players");
  XLSX.utils.book_append_sheet(wb, buildSheet(pitcherRows), "Pitchers");
  XLSX.utils.book_append_sheet(wb, buildSheet(catcherRows), "Catchers");
  XLSX.utils.book_append_sheet(wb, buildSheet(infieldRows), "Infielders");
  XLSX.utils.book_append_sheet(wb, buildSheet(ofRows), "Outfielders");
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(), "Summary");

  const sheetCount = wb.SheetNames.length;
  const rawBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
  const finalBuf = await injectFreezePanes(rawBuf, sheetCount);

  const outPath = "roster-qa.xlsx";
  writeFileSync(outPath, finalBuf);
  console.log(`\u2713 Wrote ${outPath} (${allRows.length} players)`);
}

main().catch(err => { console.error(err); process.exit(1); });
