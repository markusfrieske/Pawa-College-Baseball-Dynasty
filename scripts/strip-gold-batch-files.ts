/**
 * strip-gold-batch-files.ts
 *
 * Strips gold special abilities from players in roster batch files whose
 * calibrated OVR (from ALL_REAL_ROSTERS) is below 450. Replaces each removed
 * gold ability with a deterministic, position-appropriate blue ability not
 * already present. Also deduplicates ability lists as a safety pass.
 *
 * Uses ALL_REAL_ROSTERS (calibrated data) — not raw batch file attributes —
 * to compute OVR accurately for all conference tiers. This is important because
 * batch files store raw attributes; the calibration multiplier lowers them at
 * load time, so computing OVR from raw values over-estimates OVR for lower-tier
 * conferences.
 *
 * Safe to run multiple times (idempotent once the file is clean).
 *
 * Run with:  npx tsx scripts/strip-gold-batch-files.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { ALL_ABILITIES, getAbilitiesForPosition, calculateOVR } from "../shared/abilities";
import { ALL_REAL_ROSTERS } from "../server/realRosters";

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

function formatAbilities(names: string[]): string {
  if (names.length === 0) return "[]";
  return "[" + names.map(n => `"${n}"`).join(", ") + "]";
}

function parseAbilitiesLiteral(raw: string): string[] {
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
}

function extractString(text: string, attrName: string): string {
  const re = new RegExp(`\\b${attrName}:\\s*"([^"]+)"`);
  const m = text.match(re);
  return m ? m[1] : "";
}

/**
 * Build a lookup map from the calibrated ALL_REAL_ROSTERS data.
 * Key: "FirstName LastName" -> { ovr (calibrated, no ability bonus), position }
 * When the same name appears on multiple teams, all entries are stored in an array.
 */
function buildCalibratedOvrMap(): Map<string, Array<{ team: string; ovr: number; position: string }>> {
  const map = new Map<string, Array<{ team: string; ovr: number; position: string }>>();
  for (const [team, roster] of Object.entries(ALL_REAL_ROSTERS)) {
    for (const p of roster as Array<{ firstName: string; lastName: string; position: string; abilities?: string[]; [key: string]: unknown }>) {
      const name = `${p.firstName} ${p.lastName}`;
      const ovr = calculateOVR({ ...p, abilities: [] });
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push({ team, ovr, position: p.position });
    }
  }
  return map;
}

/**
 * Fix an ability list: deduplicate, then replace any gold ability (when OVR < 500)
 * with a blue ability not already in the list. Uses a seeded PRNG for determinism.
 */
function fixAbilities(
  abilities: string[],
  position: string,
  ovr: number,
  seed: string
): { fixed: string[]; changed: boolean } {
  const rng = makePRNG(seed);

  // 1. Deduplicate first
  const seen = new Set<string>();
  const deduped = abilities.filter(n => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  // 2. If OVR >= 500, gold is allowed — only return deduped
  if (ovr >= 500) {
    const changed = deduped.length !== abilities.length ||
      deduped.some((n, i) => n !== abilities[i]);
    return { fixed: deduped, changed };
  }

  // 3. OVR < 500: replace each gold ability with a position-appropriate blue
  const availableAbilities = getAbilitiesForPosition(position);
  const bluePool = availableAbilities.filter(a => a.tier === "blue").map(a => a.name);

  // Non-gold abilities that will remain in the final list (used to avoid duplicate picks)
  const nonGoldSet = new Set(deduped.filter(n => !GOLD_NAMES.has(n)));
  const chosenReplacements: string[] = [];

  const result: string[] = [];
  for (const name of deduped) {
    if (!GOLD_NAMES.has(name)) {
      result.push(name);
      continue;
    }

    const inUse = new Set([...nonGoldSet, ...chosenReplacements]);
    const available = bluePool.filter(n => !inUse.has(n));

    if (available.length > 0) {
      const shuffled = [...available];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
      }
      result.push(shuffled[0]);
      chosenReplacements.push(shuffled[0]);
    }
    // else: drop the ability (extremely rare)
  }

  const changed = result.length !== abilities.length ||
    result.some((n, i) => n !== abilities[i]);
  return { fixed: result, changed };
}

console.log("Building calibrated OVR map from ALL_REAL_ROSTERS...");
const calibratedMap = buildCalibratedOvrMap();
console.log(`Loaded ${calibratedMap.size} unique player names.\n`);

let totalFilesChanged = 0;
let totalPlayersFixed = 0;

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
    const hasGold = abilities.some(n => GOLD_NAMES.has(n));
    const hasDup = abilities.length !== new Set(abilities).size;

    if (!hasGold && !hasDup) {
      prevAbilitiesEnd = matchEnd;
      continue;
    }

    // Extract context to get player name and position
    const context = content.slice(prevAbilitiesEnd, matchStart);
    const firstName = extractString(context, "firstName");
    const lastName = extractString(context, "lastName");
    const position = extractString(context, "position");

    if (!firstName || !lastName || !position) {
      prevAbilitiesEnd = matchEnd;
      continue;
    }

    // Look up calibrated OVR
    const playerName = `${firstName} ${lastName}`;
    const entries = calibratedMap.get(playerName);
    let ovr = 999; // default: assume high OVR (don't strip if we can't look up)

    if (entries && entries.length > 0) {
      // Prefer exact position match; fallback to first entry
      const posMatch = entries.find(e => e.position === position);
      ovr = posMatch ? posMatch.ovr : entries[0].ovr;
    } else if (hasGold) {
      console.warn(`  WARNING: could not find calibrated OVR for ${playerName} (${position}) — skipping`);
      prevAbilitiesEnd = matchEnd;
      continue;
    }

    const seed = `${firstName} ${lastName} ${position}`;
    const { fixed, changed } = fixAbilities(abilities, position, ovr, seed);

    if (changed) {
      result += content.slice(cursor, matchStart) + "abilities: " + formatAbilities(fixed);
      cursor = matchEnd;
      fileChanged++;
      totalPlayersFixed++;
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

console.log(`\nDone. ${totalPlayersFixed} players fixed across ${totalFilesChanged} file(s).`);

// Final verification
console.log("\nVerifying zero violations remain...");
let violationCount = 0;
for (const [team, roster] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of roster as Array<{ firstName: string; lastName: string; position: string; abilities?: string[]; [key: string]: unknown }>) {
    const ovr = calculateOVR({ ...p, abilities: [] });
    const gold = (p.abilities || []).filter(n => GOLD_NAMES.has(n));
    if (ovr < 500 && gold.length > 0) {
      console.log(`  VIOLATION: ${team} ${p.firstName} ${p.lastName} ovr=${ovr} gold=${gold.join(",")}`);
      violationCount++;
    }
  }
}
if (violationCount === 0) {
  console.log("✓ Zero violations — all batch files are clean.");
} else {
  console.log(`✗ ${violationCount} violation(s) remain!`);
  process.exit(1);
}
