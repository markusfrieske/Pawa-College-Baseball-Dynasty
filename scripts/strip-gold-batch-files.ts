/**
 * strip-gold-batch-files.ts
 *
 * Strips gold special abilities from players in roster batch files whose
 * computed OVR is below 450. Replaces each removed gold ability with a
 * deterministic, position-appropriate blue ability not already present.
 * Also deduplicates ability lists as a safety pass.
 *
 * Safe to run multiple times (idempotent once the file is clean).
 *
 * Run with:  npx tsx scripts/strip-gold-batch-files.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { ALL_ABILITIES, getAbilitiesForPosition, calculateOVR } from "../shared/abilities";

const GOLD_NAMES = new Set(
  ALL_ABILITIES.filter(a => a.tier === "gold").map(a => a.name)
);

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

// Seeded PRNG for deterministic replacements
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

function extractNumber(text: string, attrName: string): number {
  const re = new RegExp(`\\b${attrName}:\\s*(\\d+)`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

function extractString(text: string, attrName: string): string {
  const re = new RegExp(`\\b${attrName}:\\s*"([^"]+)"`);
  const m = text.match(re);
  return m ? m[1] : "";
}

function formatAbilities(names: string[]): string {
  if (names.length === 0) return "[]";
  return "[" + names.map(n => `"${n}"`).join(", ") + "]";
}

function parseAbilitiesLiteral(raw: string): string[] {
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
}

/**
 * Fix an ability list: deduplicate, then replace any gold ability (when OVR < 450)
 * with a blue ability not already in the list. Uses a seeded PRNG so repeated
 * runs of this script produce the same result for the same player.
 */
function fixAbilities(
  abilities: string[],
  position: string,
  ovr: number,
  seed: string
): { fixed: string[]; changed: boolean } {
  const rng = makePRNG(seed);

  // 1. Deduplicate first, preserving order
  const seen = new Set<string>();
  const deduped = abilities.filter(n => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  // 2. If OVR >= 450, gold is allowed — only return deduped
  if (ovr >= 450) {
    const changed = deduped.length !== abilities.length ||
      deduped.some((n, i) => n !== abilities[i]);
    return { fixed: deduped, changed };
  }

  // 3. OVR < 450: replace each gold ability with a blue ability not already present
  const availableAbilities = getAbilitiesForPosition(position);
  const bluePool = availableAbilities.filter(a => a.tier === "blue").map(a => a.name);

  // Collect the set of ALL non-gold abilities that will remain (to avoid picking duplicates)
  const nonGoldSet = new Set(deduped.filter(n => !GOLD_NAMES.has(n)));
  const chosenReplacements: string[] = [];

  const result: string[] = [];
  for (const name of deduped) {
    if (!GOLD_NAMES.has(name)) {
      result.push(name);
      continue;
    }

    // Build the full "already in use" set: non-gold originals + replacements chosen so far
    const inUse = new Set([...nonGoldSet, ...chosenReplacements]);
    const available = bluePool.filter(n => !inUse.has(n));

    if (available.length > 0) {
      // Deterministic shuffle
      const shuffled = [...available];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
      }
      result.push(shuffled[0]);
      chosenReplacements.push(shuffled[0]);
    }
    // else: drop the ability (extremely rare — no blue abilities left)
  }

  const changed = result.length !== abilities.length ||
    result.some((n, i) => n !== abilities[i]);
  return { fixed: result, changed };
}

let totalFilesChanged = 0;
let totalAbilitiesChanged = 0;

for (const filePath of ROSTER_FILES) {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    console.warn(`  Skipping ${filePath} (not found)`);
    continue;
  }

  const ABILITIES_RE = /abilities:\s*(\[[^\]]*\])/g;

  let fileChanged = 0;
  let result = "";
  let cursor = 0;
  let prevAbilitiesEnd = 0;

  let match: RegExpExecArray | null;
  while ((match = ABILITIES_RE.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const rawAbilities = match[1];

    const abilities = parseAbilitiesLiteral(rawAbilities);

    // Extract the context between the previous abilities array end and this match
    const context = content.slice(prevAbilitiesEnd, matchStart);

    const position = extractString(context, "position");
    const firstName = extractString(context, "firstName");
    const lastName = extractString(context, "lastName");

    if (!position) {
      prevAbilitiesEnd = matchEnd;
      continue;
    }

    // Compute OVR from raw attributes (no ability bonus — prevent circular dependency)
    const attrs = {
      position,
      hitForAvg: extractNumber(context, "hitForAvg"),
      power: extractNumber(context, "power"),
      speed: extractNumber(context, "speed"),
      arm: extractNumber(context, "arm"),
      fielding: extractNumber(context, "fielding"),
      errorResistance: extractNumber(context, "errorResistance"),
      velocity: extractNumber(context, "velocity"),
      control: extractNumber(context, "control"),
      stamina: extractNumber(context, "stamina"),
      stuff: extractNumber(context, "stuff"),
      clutch: extractNumber(context, "clutch"),
      vsLHP: extractNumber(context, "vsLHP"),
      grit: extractNumber(context, "grit"),
      stealing: extractNumber(context, "stealing"),
      running: extractNumber(context, "running"),
      throwing: extractNumber(context, "throwing"),
      recovery: extractNumber(context, "recovery"),
      wRISP: extractNumber(context, "wRISP"),
      vsLefty: extractNumber(context, "vsLefty"),
      poise: extractNumber(context, "poise"),
      heater: extractNumber(context, "heater"),
      agile: extractNumber(context, "agile"),
      abilities: [] as string[],
    };

    const ovr = calculateOVR(attrs);
    const seed = `${firstName} ${lastName} ${position}`;

    const hasGold = abilities.some(n => GOLD_NAMES.has(n));
    const hasDup = abilities.length !== new Set(abilities).size;

    // Only process players that need fixing
    if (!hasGold && !hasDup) {
      prevAbilitiesEnd = matchEnd;
      continue;
    }

    const { fixed, changed } = fixAbilities(abilities, position, ovr, seed);

    if (changed) {
      result += content.slice(cursor, matchStart) + "abilities: " + formatAbilities(fixed);
      cursor = matchEnd;
      fileChanged++;
      totalAbilitiesChanged++;
    }

    prevAbilitiesEnd = matchEnd;
  }

  if (fileChanged === 0) {
    continue;
  }

  result += content.slice(cursor);
  writeFileSync(filePath, result, "utf8");
  totalFilesChanged++;
  console.log(`  ${filePath}: fixed ${fileChanged} players`);
}

console.log(`\nDone. ${totalAbilitiesChanged} player ability lists fixed across ${totalFilesChanged} file(s).`);
