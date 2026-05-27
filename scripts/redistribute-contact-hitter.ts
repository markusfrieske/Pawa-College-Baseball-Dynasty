/**
 * redistribute-contact-hitter.ts
 *
 * Removes "Contact Hitter" from 200 hitters and redistributes:
 *   - 100 players get "Spray Hitter" instead
 *   - 100 players get "Defensive Artisan" instead
 *
 * Selection is deterministic (name-hash based) and skips players who
 * already have the target ability to avoid duplicates.
 */

import * as fs from "fs";
import * as path from "path";
import { ALL_REAL_ROSTERS } from "../server/realRosters";

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
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

const PITCHER_POSITIONS = new Set(["SP", "RP", "CL", "P", "CP"]);

function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface Candidate {
  key: string;
  firstName: string;
  lastName: string;
  hasSpray: boolean;
  hasArtisan: boolean;
  hash: number;
}

// Step 1: Collect all Contact Hitter hitters
const candidates: Candidate[] = [];

for (const [, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players as Record<string, unknown>[]) {
    if (PITCHER_POSITIONS.has(p.position as string)) continue;
    const abs = (p.abilities as string[]) || [];
    if (!abs.includes("Contact Hitter")) continue;
    const key = `${p.firstName}|${p.lastName}`;
    candidates.push({
      key,
      firstName: p.firstName as string,
      lastName: p.lastName as string,
      hasSpray: abs.includes("Spray Hitter"),
      hasArtisan: abs.includes("Defensive Artisan"),
      hash: nameHash(key),
    });
  }
}

// Sort deterministically
candidates.sort((a, b) => a.hash - b.hash);

// Step 2: Select 200 targets (100 Spray, 100 Artisan)
const sprayTargets = new Set<string>();
const artisanTargets = new Set<string>();
let sprayCount = 0;
let artisanCount = 0;

for (const c of candidates) {
  if (sprayCount >= 100 && artisanCount >= 100) break;
  if (sprayCount < 100 && !c.hasSpray && !artisanTargets.has(c.key)) {
    sprayTargets.add(c.key);
    sprayCount++;
  } else if (artisanCount < 100 && !c.hasArtisan && !sprayTargets.has(c.key)) {
    artisanTargets.add(c.key);
    artisanCount++;
  }
}

console.log(`Targets selected — Spray: ${sprayCount}, Artisan: ${artisanCount}`);

// Step 3: Apply changes to roster files
let totalChanges = 0;
const changed = new Set<string>();

for (const file of ROSTER_FILES) {
  const fullPath = path.resolve(file);
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");
  let modified = false;
  let currentPlayer: { firstName: string; lastName: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fnMatch = line.match(/firstName:\s*"([^"]+)"/);
    const lnMatch = line.match(/lastName:\s*"([^"]+)"/);
    if (fnMatch && lnMatch) {
      currentPlayer = { firstName: fnMatch[1], lastName: lnMatch[1] };
    }

    if (
      currentPlayer &&
      line.includes("abilities:") &&
      line.includes("[") &&
      line.includes('"Contact Hitter"')
    ) {
      const key = `${currentPlayer.firstName}|${currentPlayer.lastName}`;

      if (!changed.has(key)) {
        if (sprayTargets.has(key)) {
          lines[i] = line.replace('"Contact Hitter"', '"Spray Hitter"');
          changed.add(key);
          modified = true;
          totalChanges++;
        } else if (artisanTargets.has(key)) {
          lines[i] = line.replace('"Contact Hitter"', '"Defensive Artisan"');
          changed.add(key);
          modified = true;
          totalChanges++;
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, lines.join("\n"));
    console.log(`  Modified: ${file}`);
  }
}

console.log(`\nTotal changes applied: ${totalChanges}`);
console.log("Expected final counts (after file reload):");
console.log("  Contact Hitter: ~412 (was 612, -200)");
console.log("  Spray Hitter:   ~225 (was 125, +100)");
console.log("  Defensive Artisan: ~325 (was 225, +100)");
