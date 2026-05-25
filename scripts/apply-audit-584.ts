#!/usr/bin/env node
/**
 * Task #584 — Hitter ability & stat audit
 * Applies all 12 steps in one pass.
 */
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

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CL", "CP"]);

interface PlayerChange {
  firstName: string;
  lastName: string;
  file: string;
  setFields?: Record<string, number | string>;
  addAbilities?: string[];
}

const TARGETED: PlayerChange[] = [
  // Step 1: Fix Ace Reese firstName
  { firstName: "Star of Victory", lastName: "Reese", file: "server/secBatch2.ts", setFields: { firstName: "Ace" } },
  // Step 2: S stealing
  { firstName: "Justin", lastName: "Lebron", file: "server/secBatch2.ts", setFields: { stealing: 90 } },
  { firstName: "Lucas", lastName: "Moore", file: "server/accRostersBatch1.ts", setFields: { stealing: 90 } },
  // Step 3: S running
  { firstName: "Bristol", lastName: "Carter", file: "server/secBatch2.ts", setFields: { running: 90 } },
  { firstName: "RJ", lastName: "Hamilton", file: "server/accRostersBatch1.ts", setFields: { running: 90 } },
  { firstName: "Javar", lastName: "Williams", file: "server/accRostersBatch3.ts", setFields: { running: 90 } },
  { firstName: "Julio", lastName: "Solier", file: "server/accRostersBatch3.ts", setFields: { running: 90 } },
  // Step 5: Add Defensive Artisan
  { firstName: "Derek", lastName: "Curiel", file: "server/secBatch1.ts", addAbilities: ["Defensive Artisan"] },
  { firstName: "Roch", lastName: "Cholowsky", file: "server/bigTenBatch3.ts", addAbilities: ["Defensive Artisan"] },
  // Step 6: Add Contact Hitter
  { firstName: "Aiden", lastName: "Robbins", file: "server/secBatch3.ts", addAbilities: ["Contact Hitter"] },
  { firstName: "Vahn", lastName: "Lackey", file: "server/accRostersBatch1.ts", addAbilities: ["Contact Hitter"] },
  { firstName: "Daniel", lastName: "Cuvet", file: "server/accRostersBatch2.ts", addAbilities: ["Contact Hitter"] },
  { firstName: "Landon", lastName: "Hairston", file: "server/big12Rosters.ts", addAbilities: ["Contact Hitter"] },
  // Step 7: Add Power Hitter
  { firstName: "Daniel", lastName: "Jackson", file: "server/secBatch2.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Tague", lastName: "Davis", file: "server/accRostersBatch1.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Michael", lastName: "Anderson", file: "server/bigTenBatch2.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Jackson", lastName: "Hotchkiss", file: "server/bigTenBatch3.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Tyson", lastName: "LeBlanc", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Brady", lastName: "Ballinger", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Mason", lastName: "White", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Hunter", lastName: "Teplanszky", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Dee", lastName: "Kennedy", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Kollin", lastName: "Ritchie", file: "server/big12Rosters.ts", addAbilities: ["Power Hitter"] },
  { firstName: "Bryce", lastName: "Calloway", file: "server/aacRosters.ts", addAbilities: ["Power Hitter"] },
  // Step 8: Add Hit Machine
  { firstName: "Derek", lastName: "Curiel", file: "server/secBatch1.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Brady", lastName: "Neal", file: "server/secBatch2.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Daniel", lastName: "Jackson", file: "server/secBatch2.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Daniel", lastName: "Cuvet", file: "server/accRostersBatch2.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Eric", lastName: "Becker", file: "server/accRostersBatch3.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Roch", lastName: "Cholowsky", file: "server/bigTenBatch3.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Brady", lastName: "Ballinger", file: "server/big12Rosters.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Easton", lastName: "Erickson", file: "server/big12Rosters.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Carter", lastName: "Lovasz", file: "server/big12Rosters.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Drew", lastName: "Faurot", file: "server/big12Rosters.ts", addAbilities: ["Hit Machine"] },
  { firstName: "Core", lastName: "Jackson", file: "server/big12Rosters.ts", addAbilities: ["Hit Machine"] },
  // Step 9: Add Artist
  { firstName: "Tague", lastName: "Davis", file: "server/accRostersBatch1.ts", addAbilities: ["Artist"] },
  { firstName: "Aaron", lastName: "Munson", file: "server/big12Rosters.ts", addAbilities: ["Artist"] },
  // Step 10: Add Magician
  { firstName: "Tucker", lastName: "Stockman", file: "server/sunBeltRosters.ts", addAbilities: ["Magician"] },
  // Step 11: Add Consigliere
  { firstName: "Tristan", lastName: "Bissetta", file: "server/secBatch1.ts", addAbilities: ["Consigliere"] },
  { firstName: "Tague", lastName: "Davis", file: "server/accRostersBatch1.ts", addAbilities: ["Consigliere"] },
  { firstName: "Derek", lastName: "Williams", file: "server/accRostersBatch2.ts", addAbilities: ["Consigliere"] },
  { firstName: "Owen", lastName: "Hull", file: "server/accRostersBatch2.ts", addAbilities: ["Consigliere"] },
  { firstName: "Luke", lastName: "Costello", file: "server/accRostersBatch3.ts", addAbilities: ["Consigliere"] },
  { firstName: "Ryan", lastName: "Costello", file: "server/bigTenBatch1.ts", addAbilities: ["Consigliere"] },
  { firstName: "Dee", lastName: "Kennedy", file: "server/big12Rosters.ts", addAbilities: ["Consigliere"] },
  { firstName: "Aidan", lastName: "Meola", file: "server/big12Rosters.ts", addAbilities: ["Consigliere"] },
  { firstName: "Kollin", lastName: "Ritchie", file: "server/big12Rosters.ts", addAbilities: ["Consigliere"] },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the player {…} block by firstName+lastName.
 * Player objects always start with "{ firstName:" on a line.
 * Returns [start, end) indices of the block (end = index after closing }).
 */
function findPlayerBlock(content: string, firstName: string, lastName: string): [number, number] | null {
  // Match the firstName and lastName anywhere in the same player block
  // Player blocks start at "{ firstName:" patterns
  // We scan for firstName first, then walk back to find the opening brace of that block
  const fnPattern = new RegExp(`firstName:\\s*"${escapeRegex(firstName)}"`, "g");
  let fnMatch: RegExpExecArray | null;

  while ((fnMatch = fnPattern.exec(content)) !== null) {
    // Walk back to find start of this player block (the { preceding firstName on same/nearby line)
    let blockStart = -1;
    for (let i = fnMatch.index; i >= 0; i--) {
      if (content[i] === "{") { blockStart = i; break; }
      // Don't go back past a newline that doesn't have just whitespace between it and the match
      if (content[i] === "\n" && i < fnMatch.index - 5) break;
    }
    if (blockStart === -1) continue;

    // Find the matching closing brace
    let depth = 1;
    let j = blockStart + 1;
    while (j < content.length && depth > 0) {
      if (content[j] === "{") depth++;
      else if (content[j] === "}") depth--;
      j++;
    }
    if (depth !== 0) continue;

    const block = content.slice(blockStart, j);

    // Verify lastName is in this block
    if (block.includes(`"${lastName}"`)) {
      return [blockStart, j];
    }
  }
  return null;
}

function addAbilityToPlayer(
  content: string,
  firstName: string,
  lastName: string,
  ability: string
): { content: string; applied: boolean; reason: string } {
  const range = findPlayerBlock(content, firstName, lastName);
  if (!range) return { content, applied: false, reason: "player not found" };

  const [start, end] = range;
  const block = content.slice(start, end);

  if (block.includes(`"${ability}"`)) {
    return { content, applied: false, reason: "already present" };
  }

  const abilitiesMatch = /abilities:\s*\[([^\]]*)\]/.exec(block);
  if (!abilitiesMatch) return { content, applied: false, reason: "abilities array not found" };

  const existing = abilitiesMatch[1].trim();
  const newAbilities = existing === "" ? `"${ability}"` : `${existing}, "${ability}"`;
  const newBlock = block.replace(/abilities:\s*\[([^\]]*)\]/, `abilities: [${newAbilities}]`);

  return {
    content: content.slice(0, start) + newBlock + content.slice(end),
    applied: true,
    reason: "ok",
  };
}

function setFieldInPlayer(
  content: string,
  firstName: string,
  lastName: string,
  field: string,
  value: number | string
): { content: string; applied: boolean; reason: string } {
  const range = findPlayerBlock(content, firstName, lastName);
  if (!range) return { content, applied: false, reason: "player not found" };

  const [start, end] = range;
  const block = content.slice(start, end);

  let newBlock: string;
  if (field === "firstName") {
    newBlock = block.replace(/firstName:\s*"[^"]*"/, `firstName: "${value}"`);
  } else {
    const fieldPattern = new RegExp(`(\\b${field}:\\s*)\\d+`);
    if (!fieldPattern.test(block)) return { content, applied: false, reason: `field '${field}' not found` };
    newBlock = block.replace(fieldPattern, `$1${value}`);
  }

  return {
    content: content.slice(0, start) + newBlock + content.slice(end),
    applied: true,
    reason: "ok",
  };
}

// ─── THROWING +10 ─────────────────────────────────────────────────────────────

/**
 * Finds every player object (starts with "{ firstName:") and bumps throwing by 10
 * for non-pitcher positions. Uses brace-matching starting from "{ firstName:".
 */
function applyThrowingBump(source: string): { result: string; count: number } {
  // Find all player block starts: look for "{ firstName:" with optional leading whitespace
  // Strategy: scan for `firstName:` occurrences, walk back to find the `{`, extract the block
  let result = source;
  let count = 0;

  // Collect all player block start positions and their positions
  // We do multiple passes: one to find all blocks, one to replace (in reverse order to preserve indices)
  const replacements: Array<{ start: number; end: number; newText: string }> = [];

  const fnRegex = /\bfirstName:\s*"[^"]+"/g;
  let fnMatch: RegExpExecArray | null;

  while ((fnMatch = fnRegex.exec(source)) !== null) {
    const fnIdx = fnMatch.index;

    // Walk back to find `{` of this player block
    let blockStart = -1;
    for (let i = fnIdx - 1; i >= 0; i--) {
      const c = source[i];
      if (c === "{") { blockStart = i; break; }
      if (c === "\n") break; // Don't go past a newline
    }
    if (blockStart === -1) continue;

    // Find matching close brace
    let depth = 1;
    let j = blockStart + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth++;
      else if (source[j] === "}") depth--;
      j++;
    }
    if (depth !== 0) continue;

    const block = source.slice(blockStart, j);

    // Check position
    const posMatch = /\bposition:\s*"([^"]+)"/.exec(block);
    if (!posMatch || PITCHER_POSITIONS.has(posMatch[1])) continue;

    // Check throwing
    const throwMatch = /\bthrowing:\s*(\d+)/.exec(block);
    if (!throwMatch) continue;

    const cur = parseInt(throwMatch[1], 10);
    const next = Math.min(99, cur + 10);
    if (next === cur) continue;

    const newBlock = block.replace(/(\bthrowing:\s*)\d+/, `$1${next}`);
    replacements.push({ start: blockStart, end: j, newText: newBlock });
  }

  // Apply replacements in reverse order (largest index first) to preserve positions
  replacements.sort((a, b) => b.start - a.start);

  // Deduplicate: keep only first occurrence per start index (in case of overlaps)
  const seen = new Set<number>();
  const deduped = replacements.filter(r => {
    if (seen.has(r.start)) return false;
    seen.add(r.start);
    return true;
  });

  for (const { start, end, newText } of deduped) {
    result = result.slice(0, start) + newText + result.slice(end);
    count++;
  }

  return { result, count };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const byFile = new Map<string, PlayerChange[]>();
for (const change of TARGETED) {
  if (!byFile.has(change.file)) byFile.set(change.file, []);
  byFile.get(change.file)!.push(change);
}

let totalThrowingBumps = 0;
let totalTargeted = 0;

for (const relPath of ROSTER_FILES) {
  const absPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`WARN: File not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(absPath, "utf-8");
  const original = content;

  // Step 4: Apply throwing +10 to all position players
  const { result: bumped, count: throwCount } = applyThrowingBump(content);
  content = bumped;
  if (throwCount > 0) {
    console.log(`  throwing+10: ${throwCount} players in ${relPath}`);
    totalThrowingBumps += throwCount;
  }

  // Apply targeted changes for this file
  const changes = byFile.get(relPath) ?? [];
  for (const change of changes) {
    const fn = change.firstName;
    const ln = change.lastName;

    if (change.setFields) {
      for (const [field, value] of Object.entries(change.setFields)) {
        const { content: nc, applied, reason } = setFieldInPlayer(content, fn, ln, field, value);
        content = nc;
        if (applied) {
          console.log(`  SET ${field}=${value} → ${fn} ${ln} [${relPath}]`);
          totalTargeted++;
        } else {
          console.warn(`  WARN: SET ${field} FAILED for ${fn} ${ln} in ${relPath}: ${reason}`);
        }
      }
    }

    if (change.addAbilities) {
      // After a firstName rename the file already has new name; adjust lookup
      const lookupFn = (fn === "Star of Victory") ? "Ace" : fn;
      for (const ability of change.addAbilities) {
        const { content: nc, applied, reason } = addAbilityToPlayer(content, lookupFn, ln, ability);
        content = nc;
        if (applied) {
          console.log(`  ADD "${ability}" → ${lookupFn} ${ln} [${relPath}]`);
          totalTargeted++;
        } else {
          console.log(`  SKIP "${ability}" for ${lookupFn} ${ln}: ${reason} [${relPath}]`);
        }
      }
    }
  }

  if (content !== original) {
    fs.writeFileSync(absPath, content, "utf-8");
    console.log(`SAVED ${relPath}`);
  } else {
    console.log(`(no change) ${relPath}`);
  }
}

console.log(`\n=== Done ===`);
console.log(`  Throwing bumps: ${totalThrowingBumps}`);
console.log(`  Targeted changes: ${totalTargeted}`);
