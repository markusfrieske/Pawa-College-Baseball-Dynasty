/**
 * Programmatic fixer for pitch OVR-cap violations.
 *
 * Handles TWO source formats:
 *   1. pitchMix(primary, [2S, SL, CB, CH, CT, SNK, SPL])  — most files
 *   2. pitchFB: 1, pitch2S: 0, pitchSL: 5, ...             — mwcRosters, wccRosters
 *
 * Caps applied:
 *   OVR ≤ 400 → leveled pitch fields (SL/CB/CT/SNK/SPL) must be ≤ 4
 *   OVR ≤ 500 → leveled pitch fields (SL/CB/CT/SNK/SPL) must be ≤ 5
 *
 * pitchMix array positions: [2S(0), SL(1), CB(2), CH(3), CT(4), SNK(5), SPL(6)]
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { SEC_BATCH1_ROSTERS } from "../server/secBatch1";
import { SEC_BATCH2_ROSTERS } from "../server/secBatch2";
import { SEC_BATCH3_ROSTERS } from "../server/secBatch3";
import { ACC_BATCH1_ROSTERS } from "../server/accRostersBatch1";
import { ACC_BATCH2_ROSTERS } from "../server/accRostersBatch2";
import { ACC_BATCH3_ROSTERS } from "../server/accRostersBatch3";
import { BIG_TEN_BATCH1_ROSTERS } from "../server/bigTenBatch1";
import { BIG_TEN_BATCH2_ROSTERS } from "../server/bigTenBatch2";
import { BIG_TEN_BATCH3_ROSTERS } from "../server/bigTenBatch3";
import { PAC12_ROSTERS } from "../server/pac12Rosters";
import { MWC_ROSTERS } from "../server/mwcRosters";
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { BIG_12_ROSTERS } from "../server/big12Rosters";
import { AAC_ROSTERS } from "../server/aacRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import type { RealPlayer } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

// Map roster-key → source file path (relative to project root)
// "Pac-12" only handles players authored in pac12Rosters.ts; MWC players are
// handled by "Mountain West" → mwcRosters.ts separately.
const ROSTER_FILE_MAP: Record<string, { rosters: Record<string, RealPlayer[]>; path: string; inline: boolean }> = {
  "SEC Batch 1":     { rosters: SEC_BATCH1_ROSTERS,     path: "server/secBatch1.ts",        inline: false },
  "SEC Batch 2":     { rosters: SEC_BATCH2_ROSTERS,     path: "server/secBatch2.ts",        inline: false },
  "SEC Batch 3":     { rosters: SEC_BATCH3_ROSTERS,     path: "server/secBatch3.ts",        inline: false },
  "ACC Batch 1":     { rosters: ACC_BATCH1_ROSTERS,     path: "server/accRostersBatch1.ts", inline: false },
  "ACC Batch 2":     { rosters: ACC_BATCH2_ROSTERS,     path: "server/accRostersBatch2.ts", inline: false },
  "ACC Batch 3":     { rosters: ACC_BATCH3_ROSTERS,     path: "server/accRostersBatch3.ts", inline: false },
  "Big Ten Batch 1": { rosters: BIG_TEN_BATCH1_ROSTERS, path: "server/bigTenBatch1.ts",     inline: false },
  "Big Ten Batch 2": { rosters: BIG_TEN_BATCH2_ROSTERS, path: "server/bigTenBatch2.ts",     inline: false },
  "Big Ten Batch 3": { rosters: BIG_TEN_BATCH3_ROSTERS, path: "server/bigTenBatch3.ts",     inline: false },
  // pac12Rosters spreads MWC_ROSTERS — only handle Pac-12-native players here
  "Pac-12":          { rosters: PAC12_ROSTERS,          path: "server/pac12Rosters.ts",     inline: false },
  // MWC players live in mwcRosters.ts (inline format)
  "Mountain West":   { rosters: MWC_ROSTERS,            path: "server/mwcRosters.ts",       inline: true  },
  "Ivy League":      { rosters: IVY_LEAGUE_ROSTERS,     path: "server/ivyLeagueRosters.ts", inline: false },
  "Sun Belt":        { rosters: SUN_BELT_ROSTERS,       path: "server/sunBeltRosters.ts",   inline: false },
  "Big West":        { rosters: BIG_WEST_ROSTERS,       path: "server/bigWestRosters.ts",   inline: false },
  "HBCU":            { rosters: HBCU_ROSTERS,           path: "server/hbcuRosters.ts",      inline: false },
  "Missouri Valley": { rosters: MO_VALLEY_ROSTERS,      path: "server/moValleyRosters.ts",  inline: false },
  "Big 12":          { rosters: BIG_12_ROSTERS,         path: "server/big12Rosters.ts",     inline: false },
  "AAC":             { rosters: AAC_ROSTERS,            path: "server/aacRosters.ts",       inline: true  },
  "WCC":             { rosters: WCC_ROSTERS,            path: "server/wccRosters.ts",       inline: true  },
};

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);
const LEVELED_PITCH_FIELDS = ["pitchSL", "pitchCB", "pitchCT", "pitchSNK", "pitchSPL"] as const;

// pitchMix array indices: [2S(0), SL(1), CB(2), CH(3), CT(4), SNK(5), SPL(6)]
const FIELD_TO_IDX: Record<string, number> = {
  pitchSL:  1,
  pitchCB:  2,
  pitchCT:  4,
  pitchSNK: 5,
  pitchSPL: 6,
};

interface Fix {
  firstName: string;
  lastName: string;
  ovr: number;
  caps: Record<string, number>; // field → new cap value
}

interface FileFixes {
  path: string;
  inline: boolean;
  fixes: Fix[];
}

// Collect all fixes needed, grouped by file
const fileFixMap = new Map<string, FileFixes>();

for (const [rosterKey, { rosters, path, inline }] of Object.entries(ROSTER_FILE_MAP)) {
  for (const [, players] of Object.entries(rosters)) {
    for (const player of players) {
      if (!PITCHER_POSITIONS.has(player.position)) continue;

      const ovr = calculateOVR(player as Parameters<typeof calculateOVR>[0]);
      const raw = player as unknown as Record<string, number>;
      const caps: Record<string, number> = {};

      for (const field of LEVELED_PITCH_FIELDS) {
        const value = typeof raw[field] === "number" ? raw[field] : 0;
        if (value === 0) continue;

        if (ovr <= 400 && value >= 5) {
          caps[field] = 4;
        } else if (ovr <= 500 && value >= 6) {
          caps[field] = 5;
        }
      }

      if (Object.keys(caps).length === 0) continue;

      if (!fileFixMap.has(rosterKey)) {
        fileFixMap.set(rosterKey, { path, inline, fixes: [] });
      }
      fileFixMap.get(rosterKey)!.fixes.push({
        firstName: player.firstName,
        lastName: player.lastName,
        ovr,
        caps,
      });
    }
  }
}

let totalFixed = 0;
let totalSkipped = 0;

for (const [rosterKey, { path: relPath, inline, fixes }] of fileFixMap) {
  const absPath = resolve(process.cwd(), relPath);
  let source = readFileSync(absPath, "utf8");
  const lines = source.split("\n");

  for (const fix of fixes) {
    const { firstName, lastName, caps } = fix;

    // Find the line index containing firstName + lastName
    let playerLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`firstName: "${firstName}"`) && lines[i].includes(`lastName: "${lastName}"`)) {
        playerLineIdx = i;
        break;
      }
      if (lines[i].includes(`firstName: "${firstName}"`)) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].includes(`lastName: "${lastName}"`)) {
            playerLineIdx = i;
            break;
          }
        }
        if (playerLineIdx >= 0) break;
      }
    }

    if (playerLineIdx < 0) {
      // For Pac-12 this is expected for MWC players — they live in mwcRosters.ts
      if (rosterKey !== "Pac-12") {
        console.warn(`  [SKIP] ${rosterKey}: could not find ${firstName} ${lastName} in ${relPath}`);
        totalSkipped++;
      }
      continue;
    }

    if (inline) {
      // ── Inline format ────────────────────────────────────────────────────────
      // Find a line within 30 lines that has "pitchFB:" and pitch field values
      let pitchLineIdx = -1;
      for (let i = playerLineIdx; i < Math.min(playerLineIdx + 30, lines.length); i++) {
        if (lines[i].includes("pitchFB:") && lines[i].includes("pitchSL:")) {
          pitchLineIdx = i;
          break;
        }
      }

      if (pitchLineIdx < 0) {
        console.warn(`  [SKIP] ${rosterKey}: no inline pitch line found near ${firstName} ${lastName}`);
        totalSkipped++;
        continue;
      }

      let line = lines[pitchLineIdx];
      let changed = false;

      for (const [field, capValue] of Object.entries(caps)) {
        // Match "pitchSL: 6" or "pitchCB: 7" etc and cap it
        const regex = new RegExp(`(${field}:\\s*)(\\d+)`);
        line = line.replace(regex, (_match, prefix, valStr) => {
          const val = parseInt(valStr, 10);
          if (val > capValue) {
            changed = true;
            return `${prefix}${capValue}`;
          }
          return _match;
        });
      }

      if (changed) {
        lines[pitchLineIdx] = line;
        totalFixed++;
      }
    } else {
      // ── pitchMix() format ────────────────────────────────────────────────────
      let pitchMixLineIdx = -1;
      for (let i = playerLineIdx; i < Math.min(playerLineIdx + 30, lines.length); i++) {
        if (lines[i].includes("pitchMix(")) {
          pitchMixLineIdx = i;
          break;
        }
      }

      if (pitchMixLineIdx < 0) {
        console.warn(`  [SKIP] ${rosterKey}: no pitchMix call found near ${firstName} ${lastName}`);
        totalSkipped++;
        continue;
      }

      const originalLine = lines[pitchMixLineIdx];
      const arrayMatch = originalLine.match(/pitchMix\((\d+),\s*\[([^\]]+)\]\)/);
      if (!arrayMatch) {
        console.warn(`  [SKIP] ${rosterKey}: could not parse pitchMix for ${firstName} ${lastName}`);
        totalSkipped++;
        continue;
      }

      const primary = arrayMatch[1];
      const arrValues = arrayMatch[2].split(",").map(s => parseInt(s.trim(), 10));

      let changed = false;
      for (const [field, capValue] of Object.entries(caps)) {
        const idx = FIELD_TO_IDX[field];
        if (idx !== undefined && arrValues[idx] !== undefined && arrValues[idx] > capValue) {
          arrValues[idx] = capValue;
          changed = true;
        }
      }

      if (changed) {
        const newArrayStr = arrValues.join(", ");
        lines[pitchMixLineIdx] = originalLine.replace(
          /pitchMix\(\d+,\s*\[[^\]]+\]\)/,
          `pitchMix(${primary}, [${newArrayStr}])`
        );
        totalFixed++;
      }
    }
  }

  const newSource = lines.join("\n");
  writeFileSync(absPath, newSource, "utf8");
  console.log(`  ✓ Patched ${relPath} (${fixes.length} player(s) targeted)`);
}

console.log(`\nDone. Fixed: ${totalFixed} pitch calls. Skipped: ${totalSkipped}.`);
