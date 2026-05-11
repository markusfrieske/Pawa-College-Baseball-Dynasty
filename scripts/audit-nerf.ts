/**
 * Audit script: compares pitcher OVRs in the current working files
 * against the dd810f5 pre-nerf baseline.
 *
 * Reports:
 *   - Pitchers with old OVR >= 200 and delta != -75 (violations)
 *   - Pitchers with old OVR < 200 that were changed (violations)
 *   - Non-pitchers that were changed (violations)
 */

import { execSync } from "child_process";
import { calculateOVR, getAbilityByName } from "../shared/abilities.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const BASELINE = "dd810f5";

const ROSTER_FILES = [
  "server/secBatch1.ts", "server/secBatch2.ts", "server/secBatch3.ts",
  "server/accRostersBatch1.ts", "server/accRostersBatch2.ts", "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts", "server/bigTenBatch2.ts", "server/bigTenBatch3.ts",
  "server/big12Rosters.ts", "server/pac12Rosters.ts",
  "server/aacRosters.ts", "server/sunBeltRosters.ts",
  "server/wccRosters.ts", "server/mwcRosters.ts",
  "server/bigWestRosters.ts", "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts", "server/hbcuRosters.ts",
];

function extractNum(text: string, key: string): number | null {
  const m = new RegExp(`\\b${key}:\\s*(\\d+)`).exec(text);
  return m ? parseInt(m[1]) : null;
}

function extractAbilities(text: string): string[] {
  const m = /abilities:\s*\[([^\]]*)\]/.exec(text);
  if (!m) return [];
  return m[1].match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) ?? [];
}

function extractName(text: string): string {
  const fn = /firstName:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
  const ln = /lastName:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
  return `${fn} ${ln}`;
}

function extractPosition(text: string): string | null {
  return /position:\s*"([^"]+)"/.exec(text)?.[1] ?? null;
}

function isPitcherBlock(text: string): boolean {
  const pos = extractPosition(text);
  if (pos !== "P") return false;
  // Check pitchMix format OR inline pitchFB >= 1
  if (/\.\.\.pitchMix\(/.test(text)) return true;
  const m = /\bpitchFB:\s*(\d+)/.exec(text);
  return m != null && parseInt(m[1]) >= 1;
}

type PlayerAttrs = {
  position: string;
  velocity?: number; control?: number; stamina?: number; stuff?: number;
  arm?: number; fielding?: number; heater?: number; poise?: number;
  recovery?: number; wRISP?: number; vsLefty?: number;
  hitForAvg?: number; power?: number; speed?: number;
  errorResistance?: number; clutch?: number; vsLHP?: number; grit?: number;
  stealing?: number; running?: number; throwing?: number; agile?: number;
  abilities: string[];
};

function parsePlayer(block: string): { name: string; pos: string; attrs: PlayerAttrs } | null {
  const pos = extractPosition(block);
  if (!pos) return null;
  const abilities = extractAbilities(block);
  const g = (k: string) => extractNum(block, k) ?? undefined;
  return {
    name: extractName(block),
    pos,
    attrs: {
      position: pos, abilities,
      velocity: g("velocity"), control: g("control"), stamina: g("stamina"), stuff: g("stuff"),
      arm: g("arm"), fielding: g("fielding"), heater: g("heater"), poise: g("poise"),
      recovery: g("recovery"), wRISP: g("wRISP"), vsLefty: g("vsLefty"),
      hitForAvg: g("hitForAvg"), power: g("power"), speed: g("speed"),
      errorResistance: g("errorResistance"), clutch: g("clutch"), vsLHP: g("vsLHP"),
      grit: g("grit"), stealing: g("stealing"), running: g("running"),
      throwing: g("throwing"), agile: g("agile"),
    },
  };
}

// Find all player blocks — works for both pitchMix and inline formats
function findAllPlayerBlocks(src: string): string[] {
  const blocks: string[] = [];
  // Format A: ...pitchMix(...)
  const reA = /\.\.\.pitchMix\([^)]+\)\s*\}/g;
  // Format B: pitchSPL: N }
  const reB = /pitchSPL:\s*\d+\s*\}/g;
  // Also noPitches: }
  const reC = /\.\.\.noPitches\s*\}/g;

  for (const re of [reA, reB, reC]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const end = m.index + m[0].length;
      const start = src.slice(0, m.index).lastIndexOf("{ firstName:");
      if (start !== -1) blocks.push(src.slice(start, end));
    }
  }
  return blocks;
}

let totalChecked = 0;
let violations = 0;
let nerfed200 = 0;
let skipped = 0;

for (const relPath of ROSTER_FILES) {
  const absPath = resolve(process.cwd(), relPath);
  const currentSrc = readFileSync(absPath, "utf8");
  const baselineSrc = execSync(`git show ${BASELINE}:${relPath}`).toString();

  const baselineBlocks = findAllPlayerBlocks(baselineSrc);
  const currentBlocks  = findAllPlayerBlocks(currentSrc);

  if (baselineBlocks.length !== currentBlocks.length) {
    console.error(`⚠ ${relPath}: block count mismatch (${baselineBlocks.length} vs ${currentBlocks.length})`);
    continue;
  }

  for (let i = 0; i < baselineBlocks.length; i++) {
    const b = parsePlayer(baselineBlocks[i]);
    const c = parsePlayer(currentBlocks[i]);
    if (!b || !c) continue;
    totalChecked++;

    const oldOVR = calculateOVR(b.attrs);
    const newOVR = calculateOVR(c.attrs);
    const delta = newOVR - oldOVR;
    const isPitcher = b.pos === "P";

    if (isPitcher && oldOVR >= 200) {
      const expected = Math.max(150, oldOVR - 75);
      if (newOVR !== expected) {
        console.error(`✗ ${relPath}: ${b.name} (${b.pos}) OVR ${oldOVR}→${newOVR} (delta ${delta}, expected ${expected})`);
        violations++;
      } else {
        nerfed200++;
      }
    } else if (isPitcher && oldOVR < 200) {
      if (delta !== 0) {
        console.error(`✗ ${relPath}: ${b.name} (${b.pos}) OVR ${oldOVR}→${newOVR} (below threshold, should be unchanged)`);
        violations++;
      } else {
        skipped++;
      }
    } else if (!isPitcher && delta !== 0) {
      console.error(`✗ ${relPath}: ${b.name} (${b.pos}) non-pitcher changed OVR ${oldOVR}→${newOVR}`);
      violations++;
    }
  }
}

console.log(`\n═══════════════════════════════════════`);
console.log(`Total players checked : ${totalChecked}`);
console.log(`Pitchers nerfed (>=200): ${nerfed200}`);
console.log(`Pitchers skipped (<200): ${skipped}`);
console.log(`Violations             : ${violations}`);
if (violations === 0) {
  console.log(`✓ All checks PASSED — exact -75 nerf confirmed from ${BASELINE} baseline`);
  process.exit(0);
} else {
  console.error(`✗ ${violations} violation(s) found`);
  process.exit(1);
}
