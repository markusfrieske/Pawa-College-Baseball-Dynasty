/**
 * fix-power-ratings.ts
 * Applies 2026 NCAA HR leaderboard-based power overrides to real roster files.
 * Only modifies `power` field. All other attributes are untouched.
 * Searches ALL roster files for each player — no hard-coded file assumption.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Override {
  firstName: string;
  lastName: string;
  power: number;
}

const ROOT = path.resolve(__dirname, "..");

// All roster files to search
const ROSTER_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/big12Rosters.ts",
  "server/pac12Rosters.ts",
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/moValleyRosters.ts",
  "server/bigWestRosters.ts",
  "server/wccRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

const overrides: Override[] = [
  // ── SEC ──────────────────────────────────────────────────────────────────
  { firstName: "Daniel",    lastName: "Jackson",         power: 92 },
  { firstName: "Tre",       lastName: "Phelps",          power: 88 },
  { firstName: "Kolby",     lastName: "Branch",          power: 87 },
  { firstName: "Brennan",   lastName: "Hudson",          power: 87 },
  { firstName: "Michael",   lastName: "O'Shaughnessy",   power: 87 },
  { firstName: "Henry",     lastName: "Ford",            power: 88 },
  { firstName: "Caden",     lastName: "Sorrell",         power: 91 },
  { firstName: "Gavin",     lastName: "Grahovac",        power: 88 },
  { firstName: "Tristan",   lastName: "Bissetta",        power: 90 },
  { firstName: "Judd",      lastName: "Utermark",        power: 90 },
  { firstName: "Ace",       lastName: "Reese",           power: 90 },
  { firstName: "Cade",      lastName: "Arrambide",       power: 88 },
  { firstName: "Jake",      lastName: "Brown",           power: 87 },
  { firstName: "Camden",    lastName: "Kozeal",          power: 88 },
  { firstName: "Ryder",     lastName: "Helfrick",        power: 86 },
  { firstName: "TJ",        lastName: "Pompey",          power: 86 },
  { firstName: "Bub",       lastName: "Terrell",         power: 86 },
  { firstName: "Chase",     lastName: "Fralick",         power: 85 },
  { firstName: "Brodie",    lastName: "Johnston",        power: 86 },
  { firstName: "Mike",      lastName: "Mancini",         power: 86 },
  { firstName: "Braden",    lastName: "Holcomb",         power: 85 },
  { firstName: "Justin",    lastName: "Lebron",          power: 85 },
  { firstName: "Brendan",   lastName: "Lawson",          power: 87 },

  // ── ACC ──────────────────────────────────────────────────────────────────
  { firstName: "Tague",     lastName: "Davis",           power: 95 },
  { firstName: "Jacob",     lastName: "Jarrell",         power: 88 },
  { firstName: "Nate",      lastName: "Savoie",          power: 87 },
  { firstName: "Ryan",      lastName: "Zuckerman",       power: 90 },
  { firstName: "Vahn",      lastName: "Lackey",          power: 87 },
  { firstName: "Luke",      lastName: "Costello",        power: 87 },
  { firstName: "Dalton",    lastName: "Wentz",           power: 87 },
  { firstName: "Alex",      lastName: "Sosa",            power: 87 },
  { firstName: "Derek",     lastName: "Williams",        power: 86 },
  { firstName: "Lorenzo",   lastName: "Carrier",         power: 90 },
  { firstName: "Sebastian", lastName: "Pisacreta",       power: 85 },
  { firstName: "Drew",      lastName: "Berkland",        power: 87 },
  { firstName: "Mark",      lastName: "Quatrani",        power: 86 },
  { firstName: "Ethan",     lastName: "Ball",            power: 86 },
  { firstName: "Cooper",    lastName: "Nicholson",       power: 85 },
  { firstName: "Ty",        lastName: "Head",            power: 85 },
  { firstName: "AJ",        lastName: "Gracia",          power: 85 },
  { firstName: "Sam",       lastName: "Harris",          power: 85 },
  { firstName: "Joe",       lastName: "Tiroly",          power: 85 },
  { firstName: "Matthew",   lastName: "Strand",          power: 85 },
  { firstName: "Nick",      lastName: "Wang",            power: 87 },

  // ── Big Ten ───────────────────────────────────────────────────────────────
  { firstName: "Michael",   lastName: "Anderson",        power: 90 },
  { firstName: "Bryce",     lastName: "Molinaro",        power: 86 },
  { firstName: "Dane",      lastName: "Harvey",          power: 88 },
  { firstName: "Collin",    lastName: "Jennings",        power: 87 },
  { firstName: "Jack",      lastName: "Lausch",          power: 87 },
  { firstName: "Randy",     lastName: "Seymour",         power: 87 },
  { firstName: "Parker",    lastName: "Picot",           power: 85 },
  { firstName: "Easton",    lastName: "Richter",         power: 86 },
  { firstName: "Hogan",     lastName: "Denny",           power: 85 },
  { firstName: "Jake",      lastName: "Hanley",          power: 85 },
  { firstName: "Colby",     lastName: "Turner",          power: 85 },
  { firstName: "Dylan",     lastName: "Carey",           power: 85 },
  { firstName: "Ryan",      lastName: "Costello",        power: 86 },
  { firstName: "Jackson",   lastName: "Hotchkiss",       power: 90 },

  // ── Big 12 ────────────────────────────────────────────────────────────────
  { firstName: "Kollin",    lastName: "Ritchie",         power: 93 },
  { firstName: "Aidan",     lastName: "Meola",           power: 87 },
  { firstName: "Colin",     lastName: "Brueggemann",     power: 87 },
  { firstName: "Alex",      lastName: "Conover",         power: 85 },
  { firstName: "Garrett",   lastName: "Shull",           power: 85 },
  { firstName: "Tyce",      lastName: "Armstrong",       power: 91 },
  { firstName: "Brady",     lastName: "Janusek",         power: 85 },
  { firstName: "Carson",    lastName: "Tinney",          power: 90 },
  { firstName: "Aiden",     lastName: "Robbins",         power: 88 },
  { firstName: "Casey",     lastName: "Borba",           power: 87 },
  { firstName: "Dee",       lastName: "Kennedy",         power: 90 },
  { firstName: "Tyson",     lastName: "LeBlanc",         power: 90 },
  { firstName: "Josh",      lastName: "Dykhoff",         power: 85 },
  { firstName: "Augusto",   lastName: "Mungarrieta",     power: 85 },
  { firstName: "Logan",     lastName: "Hughes",          power: 88 },
  { firstName: "Quinton",   lastName: "Coats",           power: 93 },
  { firstName: "Jack",      lastName: "Natili",          power: 87 },
  { firstName: "Ezra",      lastName: "McNaughton",      power: 87 },
  { firstName: "Easton",    lastName: "Jones",           power: 85 },

  // ── Pac-12 ────────────────────────────────────────────────────────────────
  { firstName: "Landon",    lastName: "Hairston",        power: 93 },
  { firstName: "Nuu",       lastName: "Contrades",       power: 87 },
  { firstName: "Dominic",   lastName: "Smaldino",        power: 87 },
  { firstName: "Dean",      lastName: "Toigo",           power: 87 },
  { firstName: "Roch",      lastName: "Cholowsky",       power: 90 },
  { firstName: "Will",      lastName: "Gasparino",       power: 88 },
  { firstName: "Mulivai",   lastName: "Levu",            power: 87 },
  { firstName: "Augie",     lastName: "Lopez",           power: 87 },
  { firstName: "Teddy",     lastName: "Tokheim",         power: 87 },
  { firstName: "Rintaro",   lastName: "Sasaki",          power: 87 },
  { firstName: "Jacob",     lastName: "Doyle",           power: 86 },
  { firstName: "Sean",      lastName: "Yamaguchi",       power: 85 },
  { firstName: "Jake",      lastName: "Jackson",         power: 85 },
  { firstName: "Hideki",    lastName: "Prather",         power: 85 },
  { firstName: "Drew",      lastName: "Smith",           power: 85 },

  // ── AAC ───────────────────────────────────────────────────────────────────
  { firstName: "John Paul", lastName: "Head",            power: 90 },
  { firstName: "Michael",   lastName: "Gupton",          power: 86 },
  { firstName: "Jayson",    lastName: "Jones",           power: 85 },

  // ── Sun Belt ──────────────────────────────────────────────────────────────
  { firstName: "Jimmy",     lastName: "Janicki",         power: 87 },
  { firstName: "Blake",     lastName: "Guerin",          power: 87 },
  { firstName: "Jaquae",    lastName: "Stewart",         power: 87 },
  { firstName: "Trey",      lastName: "Hawsey",          power: 86 },
  { firstName: "Manny",     lastName: "Salas",           power: 85 },
  { firstName: "Derek",     lastName: "Martinez",        power: 85 },

  // ── Missouri Valley ───────────────────────────────────────────────────────
  { firstName: "Carter",    lastName: "Bergman",         power: 87 },
  { firstName: "Curry",     lastName: "Sutherland",      power: 87 },
  { firstName: "Taeg",      lastName: "Gollert",         power: 86 },
  { firstName: "Brayden",   lastName: "Bakes",           power: 87 },
  { firstName: "Graham",    lastName: "Mastros",         power: 85 },
  { firstName: "Carter",    lastName: "Beck",            power: 85 },

  // ── Big West ──────────────────────────────────────────────────────────────
  { firstName: "Gabe",      lastName: "Camacho",         power: 87 },
  { firstName: "Ryan",      lastName: "Tayman",          power: 87 },
  { firstName: "Matthew",   lastName: "Pena",            power: 86 },
  { firstName: "Matthew",   lastName: "Thomas",          power: 85 },
  { firstName: "Paul",      lastName: "Contreras",       power: 85 },
];

// Load all roster files into memory
const fileContents = new Map<string, string>();
for (const relPath of ROSTER_FILES) {
  const full = path.join(ROOT, relPath);
  if (fs.existsSync(full)) {
    fileContents.set(relPath, fs.readFileSync(full, "utf-8"));
  }
}

let totalApplied = 0;
const notFound: string[] = [];
const alreadyCorrect: string[] = [];

for (const o of overrides) {
  const firstEscaped = o.firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lastEscaped  = o.lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['\u2019']");

  let found = false;

  for (const [relPath, origSrc] of fileContents) {
    let src = origSrc;
    const firstNamePattern = new RegExp(`firstName:\\s*["']${firstEscaped}["']`, "g");
    let match: RegExpExecArray | null;

    while ((match = firstNamePattern.exec(src)) !== null) {
      const startIdx = match.index;

      // Confirm lastName within 300 chars
      const slice300 = src.slice(startIdx, startIdx + 300);
      const lastNameRx = new RegExp(`lastName:\\s*["']${lastEscaped}["']`);
      if (!lastNameRx.test(slice300)) continue;

      // Find power within 1500 chars
      const objSlice = src.slice(startIdx, startIdx + 1500);
      const powerRx = /power:\s*(\d+)/;
      const powerMatch = powerRx.exec(objSlice);
      if (!powerMatch) continue;

      const powerStart = startIdx + powerMatch.index!;
      const oldPowerStr = powerMatch[0];
      const newPowerStr = `power: ${o.power}`;

      if (oldPowerStr === newPowerStr) {
        alreadyCorrect.push(`${o.firstName} ${o.lastName} (${relPath}) already ${o.power}`);
        found = true;
        break;
      }

      src = src.slice(0, powerStart) + newPowerStr + src.slice(powerStart + oldPowerStr.length);
      fileContents.set(relPath, src);
      found = true;
      totalApplied++;
      console.log(`  ✓ ${o.firstName} ${o.lastName}: ${oldPowerStr} → ${newPowerStr} [${relPath}]`);
      break;
    }

    if (found) break;
  }

  if (!found) {
    notFound.push(`${o.firstName} ${o.lastName}`);
  }
}

// Write changed files
for (const [relPath, origSrc] of ROSTER_FILES.map(p => [p, fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), "utf-8") : null] as [string, string|null])) {
  if (!origSrc) continue;
  const newSrc = fileContents.get(relPath);
  if (newSrc && newSrc !== origSrc) {
    fs.writeFileSync(path.join(ROOT, relPath), newSrc, "utf-8");
    console.log(`Saved ${relPath}`);
  }
}

console.log(`\n=== DONE ===`);
console.log(`Applied: ${totalApplied} power overrides`);
if (alreadyCorrect.length > 0) {
  console.log(`\nAlready correct (${alreadyCorrect.length}): ${alreadyCorrect.join(", ")}`);
}
if (notFound.length > 0) {
  console.log(`\nNOT FOUND in any roster file (${notFound.length}):`);
  notFound.forEach(n => console.log(`  - ${n}`));
} else {
  console.log(`All players found and updated.`);
}
