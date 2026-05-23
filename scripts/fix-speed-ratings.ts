import * as fs from "fs";
import * as path from "path";

// SB leader overrides: "First Last" -> exact speed target
const SB_OVERRIDES: Record<string, number> = {
  "Justin Lebron": 92,
  "Ryan Taylor": 91,
  "Lucas Moore": 91,
  "Javar Williams": 88,
  "Jevin Relaford": 88,
  "Armani Guzman": 87,
  "Bristol Carter": 86,
  "RJ Hamilton": 86,
  "Jayce Tharnish": 86,
  "Kaiden Dossa": 85,
  "Julio Solier": 85,
  "Ty Head": 80,
  "Camden Johnson": 80,
  "Kyeler Thompson": 80,
  "Daniel Jackson": 79,
  "Tre Broussard": 79,
  "Easton Talt": 79,
  "Tripp Garrish": 76,
  "Ben Niednagel": 76,
  "Tyler Albright": 75,
  "Jake Lambdin": 75,
  "Colin Larson": 75,
  "Brayden Martin": 75,
  "Paul Schoenfeld": 75,
  "Jackson Smith": 75,
  "James Secretarski": 75,
  "Tryston McCladdie": 75,
  "Anthony Pack Jr.": 75,
  "Mike Mancini": 75,
  "Ryan Pruitt": 75,
  "Travis Sanders": 78,
  "Jake Schaffner": 78,
  "Zion Rose": 78,
};

// Position-aware target ranges [min, max]
function getPositionRange(pos: string): [number, number] {
  switch (pos) {
    case "CF":
      return [65, 82];
    case "SS":
    case "2B":
      return [60, 78];
    case "LF":
    case "RF":
    case "OF":
      return [52, 72];
    case "3B":
    case "IF":
      return [44, 64];
    case "1B":
    case "DH":
    case "UTIL":
      return [38, 58];
    case "C":
      return [32, 52];
    case "P":
    case "SP":
    case "RP":
    case "CP":
      return [28, 45];
    default:
      return [40, 65];
  }
}

// Linear rescale from source range [15, 95] to target range
function rescale(value: number, tgtMin: number, tgtMax: number): number {
  const srcMin = 15;
  const srcMax = 95;
  const clamped = Math.max(srcMin, Math.min(srcMax, value));
  const ratio = (clamped - srcMin) / (srcMax - srcMin);
  return Math.round(tgtMin + ratio * (tgtMax - tgtMin));
}

const rosterFiles = [
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
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

let totalSBOverrides = 0;
let totalRescaled = 0;
let totalUnchanged = 0;

const sbApplied: string[] = [];
const sbMissed = new Set(Object.keys(SB_OVERRIDES));

for (const relPath of rosterFiles) {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");
  const newLines: string[] = [];

  // State tracking across lines
  let curFirst = "";
  let curLast = "";
  let curPos = "";

  for (const line of lines) {
    let newLine = line;

    // Extract firstName (usually on same line as lastName/position)
    const fnMatch = line.match(/firstName:\s*"([^"]+)"/);
    if (fnMatch) {
      curFirst = fnMatch[1];
    }
    const lnMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (lnMatch) {
      curLast = lnMatch[1];
    }
    const posMatch = line.match(/position:\s*"([^"]+)"/);
    if (posMatch) {
      curPos = posMatch[1];
    }

    // Update speed if this line has it
    const speedMatch = line.match(/\bspeed:\s*(\d+)/);
    if (speedMatch && curFirst && curPos) {
      const oldSpeed = parseInt(speedMatch[1], 10);
      const fullName = `${curFirst} ${curLast}`;
      let newSpeed: number;

      if (SB_OVERRIDES[fullName] !== undefined) {
        newSpeed = SB_OVERRIDES[fullName];
        sbApplied.push(`  ${fullName} (${curPos}) ${relPath}: ${oldSpeed} -> ${newSpeed}`);
        sbMissed.delete(fullName);
        totalSBOverrides++;
      } else {
        const [tgtMin, tgtMax] = getPositionRange(curPos);
        newSpeed = rescale(oldSpeed, tgtMin, tgtMax);
        newSpeed = Math.max(tgtMin, Math.min(tgtMax, newSpeed));
        if (newSpeed !== oldSpeed) {
          totalRescaled++;
        } else {
          totalUnchanged++;
        }
      }

      // Clamp to [15, 95]
      newSpeed = Math.max(15, Math.min(95, newSpeed));

      if (newSpeed !== oldSpeed) {
        newLine = line.replace(/(\bspeed:\s*)\d+/, `$1${newSpeed}`);
      }
    }

    // Detect player block end (reset context so next player starts fresh)
    if (line.includes("...noPitches") || line.includes("...pitchMix(")) {
      curFirst = "";
      curLast = "";
      curPos = "";
    }

    newLines.push(newLine);
  }

  const newContent = newLines.join("\n");
  if (newContent !== content) {
    fs.writeFileSync(fullPath, newContent, "utf-8");
    console.log(`Updated: ${relPath}`);
  } else {
    console.log(`No change: ${relPath}`);
  }
}

console.log("\n=== SUMMARY ===");
console.log(`SB overrides applied: ${totalSBOverrides}`);
console.log(`Players rescaled: ${totalRescaled}`);
console.log(`Players already in range (no change): ${totalUnchanged}`);

if (sbApplied.length > 0) {
  console.log("\nSB leader overrides:");
  for (const s of sbApplied) console.log(s);
}

if (sbMissed.size > 0) {
  console.log("\n⚠ SB leaders NOT found in any roster file:");
  for (const name of sbMissed) console.log(`  - ${name}`);
}
