import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper: change one player's position in a file
function changePosition(
  filePath: string,
  firstName: string,
  lastName: string,
  oldPos: string,
  newPos: string
) {
  const content = fs.readFileSync(filePath, "utf-8");
  // Match pattern: firstName: "X", lastName: "Y", position: "OLD"
  const pattern = new RegExp(
    `(firstName: "${firstName}", lastName: "${lastName}", position: )"${oldPos}"`,
    "g"
  );
  const newContent = content.replace(pattern, `$1"${newPos}"`);
  if (newContent === content) {
    console.error(`  WARN: No change made for ${firstName} ${lastName} in ${path.basename(filePath)}`);
    return false;
  }
  fs.writeFileSync(filePath, newContent, "utf-8");
  console.log(`  Fixed: ${firstName} ${lastName} ${oldPos} → ${newPos} in ${path.basename(filePath)}`);
  return true;
}

const SERVER = path.resolve(__dirname, "../server");

// ─── AAC: 11 teams, each has 11P/7INF/5OF → change last pitcher to OF ─────────
console.log("\n=== AAC ===");
const aacFixes: [string, string][] = [
  ["Cooper", "Hernandez"],       // East Carolina
  ["Isaiah", "Gonzales"],        // Wichita State
  ["Trevor", "Hughes"],          // Tulane
  ["Dylan", "Bennett"],          // Memphis
  ["Eli", "Hernandez"],          // South Florida
  ["Cole", "Powell"],            // Charlotte
  ["Nolan", "Martin"],           // UAB
  ["Dylan", "Allen"],            // Rice
  ["Beau", "Robinson"],          // Florida Atlantic
  ["Tyler", "Brown"],            // North Texas
  ["Caden", "Rogers"],           // Dallas Baptist
];
for (const [fn, ln] of aacFixes) {
  changePosition(`${SERVER}/aacRosters.ts`, fn, ln, "P", "OF");
}

// ─── WCC: 8 teams, each has 11P/7INF/5OF → change last pitcher to OF ─────────
console.log("\n=== WCC ===");
const wccFixes: [string, string][] = [
  ["Carlos", "Thomas"],          // Pepperdine
  ["Tate", "Clark"],             // Loyola Marymount
  ["Isaiah", "Henderson"],       // San Diego
  ["Nolan", "Thomas"],           // Saint Mary's
  ["Damon", "Jenkins"],          // Gonzaga
  ["Owen", "Wilson"],            // Santa Clara
  ["Garrett", "Flores"],         // Portland
  ["Owen", "Jones"],             // San Francisco
];
for (const [fn, ln] of wccFixes) {
  changePosition(`${SERVER}/wccRosters.ts`, fn, ln, "P", "OF");
}

// ─── MWC: 6 teams, each has 11P/7INF/5OF → change last pitcher to OF ─────────
console.log("\n=== MWC ===");
const mwcFixes: [string, string][] = [
  ["Brody", "Ross"],             // Fresno State
  ["Connor", "Ross"],            // San Diego State
  ["Trent", "Turner"],           // UNLV
  ["Carter", "Smith"],           // Nevada
  ["Aiden", "Hughes"],           // New Mexico
  ["Brady", "Phillips"],         // Air Force
];
for (const [fn, ln] of mwcFixes) {
  changePosition(`${SERVER}/mwcRosters.ts`, fn, ln, "P", "OF");
}

// ─── SEC fixes ────────────────────────────────────────────────────────────────
console.log("\n=== SEC ===");
// LSU: 11P/6INF/6OF → change last pitcher (Zion Theophilus) to 2B
changePosition(`${SERVER}/secBatch1.ts`, "Zion", "Theophilus", "P", "2B");
// Florida: 10P/6INF/7OF → change last OF (Ty Evans) to 2B
changePosition(`${SERVER}/secBatch1.ts`, "Ty", "Evans", "OF", "2B");
// Texas A&M: 10P/8INF/5OF → change extra 2B (Ben Royo) to OF
changePosition(`${SERVER}/secBatch1.ts`, "Ben", "Royo", "2B", "OF");
// Georgia: 10P/8INF/5OF → change extra 2B (Rylan Lujo) to OF
changePosition(`${SERVER}/secBatch2.ts`, "Rylan", "Lujo", "2B", "OF");
// South Carolina: 10P/6INF/7OF → change last OF (Bryce Watkins) to 2B
changePosition(`${SERVER}/secBatch3.ts`, "Bryce", "Watkins", "OF", "2B");
// Texas: 10P/6INF/7OF → change last OF (Miles Bennett) to 2B
changePosition(`${SERVER}/secBatch3.ts`, "Miles", "Bennett", "OF", "2B");

// ─── ACC fixes ────────────────────────────────────────────────────────────────
console.log("\n=== ACC ===");
// Clemson: 10P/1C/7INF/7OF → change last OF (Hayden Foster) to C
changePosition(`${SERVER}/accRostersBatch1.ts`, "Hayden", "Foster", "OF", "C");
// Duke: 9P/7INF/7OF → change last OF (Ethan Brooks) to P
changePosition(`${SERVER}/accRostersBatch1.ts`, "Ethan", "Brooks", "OF", "P");
// Louisville: 9P/6INF/8OF → change Tyler Jennings to P, Derek Collins to 2B
changePosition(`${SERVER}/accRostersBatch1.ts`, "Tyler", "Jennings", "OF", "P");
changePosition(`${SERVER}/accRostersBatch1.ts`, "Derek", "Collins", "OF", "2B");
// Miami: 8P/6INF/9OF → change Tommy Santiago → P, Anthony Perez → P, Luis Medina → 2B
changePosition(`${SERVER}/accRostersBatch2.ts`, "Tommy", "Santiago", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Anthony", "Perez", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Luis", "Medina", "OF", "2B");
// NC State: 8P/7INF/8OF → change Tyler Barnes → P, Josh Hogue → P
changePosition(`${SERVER}/accRostersBatch2.ts`, "Tyler", "Barnes", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Josh", "Hogue", "OF", "P");
// North Carolina: 10P/6INF/7OF → change last OF (Rom Kellis V) to 2B
changePosition(`${SERVER}/accRostersBatch2.ts`, "Rom", "Kellis V", "OF", "2B");
// Notre Dame: 8P/7INF/8OF → change Brady Walsh → P, Kevin Burke → P
changePosition(`${SERVER}/accRostersBatch2.ts`, "Brady", "Walsh", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Kevin", "Burke", "OF", "P");
// Pittsburgh: 7P/7INF/9OF → change Anthony Ricci → P, Chris Varga → P, Mike Brennan → P
changePosition(`${SERVER}/accRostersBatch2.ts`, "Anthony", "Ricci", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Chris", "Varga", "OF", "P");
changePosition(`${SERVER}/accRostersBatch2.ts`, "Mike", "Brennan", "OF", "P");
// Stanford: 10P/8INF/5OF → change extra 3B (Teddy Tokheim) to OF
changePosition(`${SERVER}/accRostersBatch3.ts`, "Teddy", "Tokheim", "3B", "OF");

// ─── Big Ten fixes ────────────────────────────────────────────────────────────
console.log("\n=== Big Ten ===");
// Iowa: 10P/7INF/5OF/1DH → change DH (Sam Hart) to OF
changePosition(`${SERVER}/bigTenBatch1.ts`, "Sam", "Hart", "DH", "OF");
// Maryland: 10P/7INF/5OF/1DH → change DH (Tyler Hoffman) to OF
changePosition(`${SERVER}/bigTenBatch1.ts`, "Tyler", "Hoffman", "DH", "OF");
// Michigan State: 10P/6INF/5OF/2DH → change Mason Kraft DH→OF, Nolan Fischer DH→2B
changePosition(`${SERVER}/bigTenBatch1.ts`, "Mason", "Kraft", "DH", "OF");
changePosition(`${SERVER}/bigTenBatch1.ts`, "Nolan", "Fischer", "DH", "2B");
// Minnesota: 12P/5INF/6OF → change Zach Trettin P→2B, Tristan Moore P→3B
changePosition(`${SERVER}/bigTenBatch2.ts`, "Zach", "Trettin", "P", "2B");
changePosition(`${SERVER}/bigTenBatch2.ts`, "Tristan", "Moore", "P", "3B");
// Northwestern: 10P/6INF/7OF → change last OF (Ryan Cooper) to 2B
changePosition(`${SERVER}/bigTenBatch2.ts`, "Ryan", "Cooper", "OF", "2B");
// Penn State: 10P/6INF/7OF → change last OF (Tyler Bennett) to 2B
changePosition(`${SERVER}/bigTenBatch2.ts`, "Tyler", "Bennett", "OF", "2B");

// ─── Sun Belt fixes ───────────────────────────────────────────────────────────
console.log("\n=== Sun Belt ===");
// Coastal Carolina: 10P/6INF/7OF → change last OF (Ricky Vann) to 2B
changePosition(`${SERVER}/sunBeltRosters.ts`, "Ricky", "Vann", "OF", "2B");

console.log("\nDone!");
