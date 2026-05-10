import { readFileSync, writeFileSync } from "fs";
import { getAbilitiesForPosition } from "../shared/abilities";

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
  "server/mwcRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

// Simple seeded PRNG (LCG) — deterministic per-player
function makePRNG(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 7;
    h ^= h << 17;
    h >>>= 0;
    return h / 0xffffffff;
  };
}

function pickAbilities(position: string, rng: () => number): string[] {
  const pool = getAbilitiesForPosition(position);
  const blueGold = pool.filter((a) => a.tier !== "red");
  const reds = pool.filter((a) => a.tier === "red");

  // How many abilities to assign: weighted toward 1-2 for average players
  // Roll: 40% → 1, 40% → 2, 20% → 3
  const r = rng();
  const count = r < 0.4 ? 1 : r < 0.8 ? 2 : 3;

  // Shuffle a copy of blueGold pool
  const shuffled = [...blueGold].sort(() => rng() - 0.5);
  const selected: string[] = [];
  for (const a of shuffled) {
    if (selected.length >= count) break;
    if (!selected.includes(a.name)) selected.push(a.name);
  }

  // 15% chance to swap the last slot for a red ability
  if (reds.length > 0 && rng() < 0.15 && selected.length > 0) {
    const redChoice = reds[Math.floor(rng() * reds.length)];
    if (!selected.includes(redChoice.name)) {
      selected[selected.length - 1] = redChoice.name;
    }
  }

  return selected;
}

// Format an abilities array as inline TypeScript source:  ["A", "B"]
function formatAbilities(names: string[]): string {
  if (names.length === 0) return "[]";
  return "[" + names.map((n) => `"${n}"`).join(", ") + "]";
}

let totalReplaced = 0;

for (const filePath of ROSTER_FILES) {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    console.warn(`  Skipping ${filePath} (not found)`);
    continue;
  }

  // We need to find each `abilities: []` and replace it.
  // To pick the right position pool we scan backwards from each match
  // for the nearest `position: "X"` declaration (always in the same player block).

  let replaced = 0;
  // We'll rebuild the content piece by piece to avoid index-drift.
  let result = "";
  let cursor = 0;

  const TARGET = "abilities: []";
  const POSITION_RE = /position:\s*"([^"]+)"/g;

  while (true) {
    const idx = content.indexOf(TARGET, cursor);
    if (idx === -1) break;

    // Scan the text before idx for the *last* occurrence of `position: "X"`
    const preceding = content.slice(0, idx);
    let lastPos: string | null = null;
    let lastPlayerNameSeed = "";

    // Also grab firstName + lastName for seeding the PRNG (nearest match to idx)
    const firstNameRe = /firstName:\s*"([^"]+)"/g;
    const lastNameRe = /lastName:\s*"([^"]+)"/g;
    let fnMatch: RegExpExecArray | null;
    let lnMatch: RegExpExecArray | null;
    let lastName = "";
    let firstName = "";
    firstNameRe.lastIndex = 0;
    lastNameRe.lastIndex = 0;
    while ((fnMatch = firstNameRe.exec(preceding)) !== null) firstName = fnMatch[1];
    while ((lnMatch = lastNameRe.exec(preceding)) !== null) lastName = lnMatch[1];
    lastPlayerNameSeed = `${firstName} ${lastName}`;

    POSITION_RE.lastIndex = 0;
    let posMatch: RegExpExecArray | null;
    while ((posMatch = POSITION_RE.exec(preceding)) !== null) lastPos = posMatch[1];

    const position = lastPos ?? "1B"; // fallback if somehow not found
    const rng = makePRNG(lastPlayerNameSeed + position);
    const abilities = pickAbilities(position, rng);

    result += content.slice(cursor, idx) + "abilities: " + formatAbilities(abilities);
    cursor = idx + TARGET.length;
    replaced++;
  }

  if (replaced === 0) {
    continue;
  }

  result += content.slice(cursor);
  writeFileSync(filePath, result, "utf8");
  totalReplaced += replaced;
  console.log(`  ${filePath}: replaced ${replaced} empty abilities array(s)`);
}

console.log(`\nDone. Replaced ${totalReplaced} empty abilities arrays across all roster files.`);
