#!/usr/bin/env tsx
/**
 * Targeted cleanup: replace Intimidator on any pitcher whose CALIBRATED stamina >= 50.
 * This catches cases where calibration scale factors push raw stamina values over the
 * reliever boundary even though the raw value is below 50.
 *
 * Run: npx tsx scripts/fix-intimidator-calibrated.ts
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";
import * as fs from "fs";
import * as path from "path";

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

const STARTER_REPLACEMENTS = [
  "Sharpness", "Heavy Ball", "vs. Strong Batters", "Staredown",
  "Inside Pitch", "Low Ball", "Escape Pitch", "Constant Speed",
  "Decisive", "Strikeout", "Good Pickoff", "Strong Finisher",
  "Tunneling", "Guts", "Crossfire", "Strong Starter", "Winner's Luck",
  "Quick Hands", "Natural Shuuto", "True Slider", "Pace", "Release",
];

// Build set of pitchers needing Intimidator removed: "firstName|lastName"
// Uses ALL_REAL_ROSTERS (calibrated) — the same source the validator uses.
const toFix = new Set<string>();
for (const [, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players) {
    if (
      ["P", "SP", "RP", "CP"].includes(p.position) &&
      Array.isArray(p.abilities) &&
      p.abilities.includes("Intimidator") &&
      p.stamina >= 50
    ) {
      toFix.add(`${p.firstName}|${p.lastName}`);
    }
  }
}

console.log(`Found ${toFix.size} pitcher(s) needing Intimidator replacement.`);
if (toFix.size === 0) {
  console.log("✓ No violations — nothing to do.");
  process.exit(0);
}

let fixed = 0;

for (const relPath of ROSTER_FILES) {
  const fullPath = path.resolve(relPath);
  const original = fs.readFileSync(fullPath, "utf-8");
  const lines = original.split("\n");
  let changed = false;

  let lastPitcherLine = -1;
  let lastPitcherKey = "";

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Detect pitcher name line
    const nameMatch = line.match(/firstName:\s*"([^"]+)",\s*lastName:\s*"([^"]+)",\s*position:\s*"P"/);
    if (nameMatch) {
      const key = `${nameMatch[1]}|${nameMatch[2]}`;
      if (toFix.has(key)) {
        lastPitcherLine = idx;
        lastPitcherKey = key;
      } else {
        lastPitcherLine = -1;
        lastPitcherKey = "";
      }
      continue;
    }

    // Within 6 lines of the pitcher's name, look for the abilities line
    if (
      lastPitcherLine >= 0 &&
      idx > lastPitcherLine &&
      idx <= lastPitcherLine + 6 &&
      line.includes("abilities:") &&
      line.includes('"Intimidator"')
    ) {
      const abilityMatches = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const existing = abilityMatches.filter((a) => a !== "Intimidator");
      const replacement = STARTER_REPLACEMENTS.find((r) => !existing.includes(r)) ?? "Sharpness";

      lines[idx] = line.replace('"Intimidator"', `"${replacement}"`);
      console.log(`  Fixed [${lastPitcherKey.replace("|", " ")}]: Intimidator → ${replacement}`);
      fixed++;
      changed = true;
      lastPitcherLine = -1;
      lastPitcherKey = "";
    }

    // Reset if we've moved past the window
    if (lastPitcherLine >= 0 && idx > lastPitcherLine + 6) {
      lastPitcherLine = -1;
      lastPitcherKey = "";
    }
  }

  if (changed) {
    fs.writeFileSync(fullPath, lines.join("\n"), "utf-8");
    console.log(`  ✓ Updated ${relPath}`);
  }
}

console.log(`\nDone: ${fixed} Intimidator violation(s) fixed.`);
