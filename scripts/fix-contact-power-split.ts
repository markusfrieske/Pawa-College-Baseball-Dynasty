/**
 * fix-contact-power-split.ts
 *
 * Fixes the hitter-contact-power-split validator check:
 * Position players where hitForAvg = power AND both > 65 (scaled) lack an archetype.
 *
 * For each violating player, adjusts raw hitForAvg / power by ±5 based on position:
 *   Power positions (C, 1B, 3B):  power += 5, hitForAvg -= 5
 *   Contact positions (2B, SS, OF): hitForAvg += 5, power -= 5
 *
 * Writes fixes to the raw roster source files.
 * Usage: npx tsx scripts/fix-contact-power-split.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");
const DELTA = 5;

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
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);
const POWER_POSITIONS   = new Set(["C", "1B", "3B"]);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface PatchEntry {
  team: string;
  firstName: string;
  lastName: string;
  oldHit: number;
  oldPow: number;
  newHit: number;
  newPow: number;
}

const patches: PatchEntry[] = [];

for (const [teamName, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  for (const player of players) {
    if (PITCHER_POSITIONS.has(player.position)) continue;
    const hit = player.hitForAvg as number | undefined;
    const pow = player.power as number | undefined;
    if (hit === undefined || pow === undefined) continue;
    if (hit !== pow) continue;

    // Validator checks raw values (RAW_UNCALIBRATED_ROSTERS), not scaled
    if (hit <= 65) continue;

    const favorPower = POWER_POSITIONS.has(player.position);
    let newHit: number;
    let newPow: number;

    if (favorPower) {
      newPow = clamp(pow + DELTA, 20, 90);
      newHit = clamp(hit - DELTA, 20, 90);
    } else {
      newHit = clamp(hit + DELTA, 20, 90);
      newPow = clamp(pow - DELTA, 20, 90);
    }

    patches.push({
      team: teamName,
      firstName: player.firstName,
      lastName: player.lastName,
      oldHit: hit,
      oldPow: pow,
      newHit,
      newPow,
    });
  }
}

console.log(`Found ${patches.length} contact-power split violations to fix.\n`);

if (DRY_RUN) {
  patches.forEach((p) =>
    console.log(`  [${p.team}] ${p.firstName} ${p.lastName}: hit ${p.oldHit}→${p.newHit}, pow ${p.oldPow}→${p.newPow}`)
  );
  process.exit(0);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTeamSection(content: string, team: string): { start: number; end: number } | null {
  const teamRe = new RegExp(`"${escapeRe(team)}"\\s*:\\s*\\[`);
  const m = teamRe.exec(content);
  if (!m) return null;
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < content.length; i++) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") {
      depth--;
      if (depth === 0) return { start: m.index, end: i + 1 };
    }
  }
  return null;
}

function patchPlayerSection(section: string, patch: PatchEntry): string | null {
  const fnEsc = escapeRe(patch.firstName);
  const lnEsc = escapeRe(patch.lastName);
  const blockRe = new RegExp(`\\{\\s*firstName:\\s*"${fnEsc}"\\s*,\\s*lastName:\\s*"${lnEsc}"`);
  const blockMatch = blockRe.exec(section);
  if (!blockMatch) return null;

  let depth = 0;
  let blockEnd = blockMatch.index;
  for (let i = blockMatch.index; i < section.length; i++) {
    if (section[i] === "{") depth++;
    else if (section[i] === "}") {
      depth--;
      if (depth === 0) { blockEnd = i + 1; break; }
    }
  }

  const before = section.slice(0, blockMatch.index);
  const block  = section.slice(blockMatch.index, blockEnd);
  const after  = section.slice(blockEnd);

  const attrRe = new RegExp(
    `(hitForAvg:\\s*)${patch.oldHit}` +
    `(,\\s*power:\\s*)${patch.oldPow}`
  );
  const attrMatch = attrRe.exec(block);
  if (!attrMatch) return null;

  const replacement = attrMatch[1] + patch.newHit + attrMatch[2] + patch.newPow;
  const newBlock = block.slice(0, attrMatch.index) + replacement + block.slice(attrMatch.index + attrMatch[0].length);
  return before + newBlock + after;
}

let totalFilesChanged = 0;
let totalFixed = 0;
let totalNotFound = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, "utf8");
  let fileChanged = false;

  for (const patch of patches) {
    const teamRange = findTeamSection(content, patch.team);
    if (!teamRange) continue;

    const section = content.slice(teamRange.start, teamRange.end);
    const newSection = patchPlayerSection(section, patch);

    if (newSection === null) {
      totalNotFound++;
      console.warn(`  ⚠ Not matched: ${patch.firstName} ${patch.lastName} (${patch.team}) in ${relPath}`);
      continue;
    }
    if (newSection !== section) {
      content = content.slice(0, teamRange.start) + newSection + content.slice(teamRange.end);
      fileChanged = true;
      totalFixed++;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  ✅ ${relPath}`);
    totalFilesChanged++;
  }
}

console.log(`\nDone. ${totalFixed} players fixed across ${totalFilesChanged} file(s). Not-found: ${totalNotFound}`);
