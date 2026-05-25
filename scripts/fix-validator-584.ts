#!/usr/bin/env node
/**
 * Fix validator failures from task #584.
 * 1. Remove invalid abilities from pitchers
 * 2. Resolve multiple-gold conflicts (each player max 1 gold ability)
 */
import * as fs from "fs";
import * as path from "path";

interface AbilityRemoval {
  firstName: string;
  lastName: string;
  file: string;
  removeAbility: string;
  reason: string;
}

const REMOVALS: AbilityRemoval[] = [
  // ── Pitchers with non-pitcher abilities ─────────────────────────────────
  { firstName: "Ryan",   lastName: "Johnson",  file: "server/bigTenBatch1.ts",  removeAbility: "Consigliere", reason: "pitcher cannot have fielder ability" },
  { firstName: "Mason",  lastName: "Cook",     file: "server/big12Rosters.ts",  removeAbility: "Power Hitter", reason: "pitcher cannot have fielder ability" },
  { firstName: "Carter", lastName: "Fink",     file: "server/big12Rosters.ts",  removeAbility: "Hit Machine",  reason: "pitcher cannot have fielder ability" },
  { firstName: "Aaron",  lastName: "Regalado", file: "server/big12Rosters.ts",  removeAbility: "Artist",       reason: "pitcher cannot have fielder ability" },
  { firstName: "Drew",   lastName: "Stahl",    file: "server/big12Rosters.ts",  removeAbility: "Hit Machine",  reason: "pitcher cannot have fielder ability" },

  // ── Multiple gold conflicts: remove the extra gold, keep task-intended one ──
  { firstName: "Derek",  lastName: "Curiel",     file: "server/secBatch1.ts",         removeAbility: "Express Baserunning", reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Brady",  lastName: "Neal",       file: "server/secBatch2.ts",         removeAbility: "Iron Man",            reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Daniel", lastName: "Jackson",    file: "server/secBatch2.ts",         removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Daniel", lastName: "Cuvet",      file: "server/accRostersBatch2.ts",  removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Eric",   lastName: "Becker",     file: "server/accRostersBatch3.ts",  removeAbility: "Magician",            reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Roch",   lastName: "Cholowsky",  file: "server/bigTenBatch3.ts",      removeAbility: "Iron Man",            reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Tucker", lastName: "Stockman",   file: "server/sunBeltRosters.ts",    removeAbility: "High-Speed Laser",    reason: "extra gold; Magician takes priority" },
  { firstName: "Brady",  lastName: "Ballinger",  file: "server/big12Rosters.ts",      removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Easton", lastName: "Erickson",   file: "server/big12Rosters.ts",      removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Aaron",  lastName: "Munson",     file: "server/big12Rosters.ts",      removeAbility: "Iron Wall",           reason: "extra gold; Artist takes priority" },
  { firstName: "Carter", lastName: "Lovasz",     file: "server/big12Rosters.ts",      removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Drew",   lastName: "Faurot",     file: "server/big12Rosters.ts",      removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
  { firstName: "Core",   lastName: "Jackson",    file: "server/big12Rosters.ts",      removeAbility: "Artist",              reason: "extra gold; Hit Machine takes priority" },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPlayerBlock(content: string, firstName: string, lastName: string): [number, number] | null {
  const fnRegex = new RegExp(`\\bfirstName:\\s*"${escapeRegex(firstName)}"`, "g");
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(content)) !== null) {
    let blockStart = -1;
    for (let i = m.index - 1; i >= 0; i--) {
      if (content[i] === "{") { blockStart = i; break; }
      if (content[i] === "\n") break;
    }
    if (blockStart === -1) continue;

    let depth = 1, j = blockStart + 1;
    while (j < content.length && depth > 0) {
      if (content[j] === "{") depth++;
      else if (content[j] === "}") depth--;
      j++;
    }
    if (depth !== 0) continue;

    const block = content.slice(blockStart, j);
    if (block.includes(`"${lastName}"`)) return [blockStart, j];
  }
  return null;
}

function removeAbilityFromPlayer(
  content: string,
  firstName: string,
  lastName: string,
  ability: string
): { content: string; applied: boolean; reason: string } {
  const range = findPlayerBlock(content, firstName, lastName);
  if (!range) return { content, applied: false, reason: "player not found" };

  const [start, end] = range;
  const block = content.slice(start, end);

  if (!block.includes(`"${ability}"`)) {
    return { content, applied: false, reason: "ability not present" };
  }

  // Remove the ability from the abilities array
  // Handle: `"Ability", ` or `, "Ability"` or just `"Ability"`
  let newBlock = block;

  // Try removing with trailing comma+space first: `"Ability", `
  if (newBlock.includes(`"${ability}", `)) {
    newBlock = newBlock.replace(`"${ability}", `, "");
  }
  // Try removing with leading comma+space: `, "Ability"`
  else if (newBlock.includes(`, "${ability}"`)) {
    newBlock = newBlock.replace(`, "${ability}"`, "");
  }
  // Try standalone (only item)
  else {
    newBlock = newBlock.replace(`"${ability}"`, "");
  }

  return {
    content: content.slice(0, start) + newBlock + content.slice(end),
    applied: true,
    reason: "ok",
  };
}

// Group by file
const byFile = new Map<string, AbilityRemoval[]>();
for (const r of REMOVALS) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file)!.push(r);
}

let total = 0;
for (const [relPath, removals] of byFile) {
  const absPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`WARN: ${relPath} not found`);
    continue;
  }

  let content = fs.readFileSync(absPath, "utf-8");
  const original = content;

  for (const { firstName, lastName, removeAbility, reason } of removals) {
    const { content: nc, applied, reason: r } = removeAbilityFromPlayer(content, firstName, lastName, removeAbility);
    content = nc;
    if (applied) {
      console.log(`  REMOVE "${removeAbility}" from ${firstName} ${lastName} — ${reason}`);
      total++;
    } else {
      console.log(`  SKIP "${removeAbility}" from ${firstName} ${lastName}: ${r}`);
    }
  }

  if (content !== original) {
    fs.writeFileSync(absPath, content, "utf-8");
    console.log(`SAVED ${relPath}`);
  }
}

console.log(`\nDone. ${total} abilities removed.`);
