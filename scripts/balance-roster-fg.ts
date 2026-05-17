#!/usr/bin/env tsx
/**
 * Balance F/G grade distribution across HBCU, Big Ten, ACC, Sun Belt, and Big 12 rosters.
 *
 * F grade = attr 30-39, G grade = attr < 30. Both are "below E-grade" (< 40).
 * Position-relevant attrs:
 *   Pitchers: velocity, control, stamina, stuff
 *   Batters:  hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * Strategy: raise 4+ F/G players to ≤ 3 F/G by bumping the least-weak F/G attrs
 * to 40. CRITICAL constraint: skip any raise that would change the player's star
 * tier (200/300/400/500 thresholds). Big 12 also fills the 0% gap at 2 F/G
 * (idempotent — checks current count first).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "server");
const SHARED = path.resolve(__dirname, "..", "shared");
const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) console.log("DRY RUN — no files will be modified\n");

// ── Import OVR/star helpers from shared (same formula the game uses) ──────────
const { calculateOVR, getStarRatingFromOVR } = await import(
  path.join(SHARED, "abilities.ts")
);

function playerOVR(player: Record<string, unknown>): number {
  return calculateOVR(player as Parameters<typeof calculateOVR>[0]);
}

function playerStar(player: Record<string, unknown>): number {
  return getStarRatingFromOVR(playerOVR(player));
}

// ── Attribute helpers ──────────────────────────────────────────────────────────
const PITCHER_ATTRS = ["velocity", "control", "stamina", "stuff"] as const;
const BATTER_ATTRS = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance"] as const;
type RelAttr = typeof PITCHER_ATTRS[number] | typeof BATTER_ATTRS[number];

function getRelevantAttrs(position: string): readonly RelAttr[] {
  return position === "P"
    ? PITCHER_ATTRS
    : (BATTER_ATTRS as unknown as RelAttr[]);
}

function countFG(player: Record<string, unknown>): number {
  return getRelevantAttrs(player.position as string)
    .filter(a => (player[a] as number) < 40).length;
}

function getFGAttrs(player: Record<string, unknown>): RelAttr[] {
  return getRelevantAttrs(player.position as string)
    .filter(a => (player[a] as number) < 40) as RelAttr[];
}

// ── Distribution reporter ──────────────────────────────────────────────────────
function printDist(label: string, players: Record<string, unknown>[]) {
  const dist: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5+": 0 };
  for (const p of players) {
    const fg = countFG(p);
    const key = fg >= 5 ? "5+" : String(fg);
    dist[key]++;
  }
  const total = players.length;
  const fourPlus = ((dist["4"] + dist["5+"]) / total * 100).toFixed(1);
  console.log(`\n${label} (${total} players):`);
  for (const k of ["0", "1", "2", "3", "4", "5+"]) {
    const n = dist[k];
    console.log(`  ${k} F/G: ${n} (${(n / total * 100).toFixed(1)}%)`);
  }
  console.log(`  4+ combined: ${fourPlus}%`);
}

// ── Block-boundary finder ─────────────────────────────────────────────────────
function findPlayerBlock(
  text: string,
  firstName: string,
  lastName: string,
  fromPos = 0
): [number, number] | null {
  const ef = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const el = lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const nameRe = new RegExp(
    `firstName:\\s*"${ef}"[\\s\\S]{0,80}?lastName:\\s*"${el}"`,
    "g"
  );
  nameRe.lastIndex = fromPos;
  const m = nameRe.exec(text);
  if (!m) return null;

  let open = m.index;
  while (open > 0 && text[open] !== "{") open--;
  if (text[open] !== "{") return null;

  let depth = 0;
  let pos = open;
  while (pos < text.length) {
    if (text[pos] === "{") depth++;
    else if (text[pos] === "}") {
      depth--;
      if (depth === 0) break;
    }
    pos++;
  }
  if (depth !== 0) return null;

  return [open, pos + 1];
}

// ── Attribute replacement within a player block ───────────────────────────────
function replaceAttrInBlock(block: string, attr: string, from: number, to: number): string {
  const re = new RegExp(`(\\b${attr}:\\s*)${from}(?=[,\\s}])`, "g");
  const next = block.replace(re, `$1${to}`);
  if (next === block) {
    console.warn(`    ⚠ ${attr}: ${from} not replaced in block`);
  }
  return next;
}

// ── Core data types ───────────────────────────────────────────────────────────
type Player = Record<string, unknown>;
interface Fix { attr: RelAttr; from: number; to: number }

interface FileResult {
  file: string;
  players: Player[];
  fixesMap: Map<Player, Fix[]>;
}

// ── Load a roster file via dynamic import ────────────────────────────────────
async function analyzeFiles(files: string[]): Promise<FileResult[]> {
  const results: FileResult[] = [];
  for (const file of files) {
    const fullPath = path.join(SERVER, file);
    const mod = await import(fullPath);
    const rosterKey = Object.keys(mod).find(
      k => typeof mod[k] === "object" && !Array.isArray(mod[k])
    );
    if (!rosterKey) continue;
    const roster = mod[rosterKey] as Record<string, Player[]>;
    const players = Object.values(roster).flat();
    results.push({ file, players, fixesMap: new Map() });
  }
  return results;
}

// ── Apply fixes to each file ──────────────────────────────────────────────────
function applyFiles(results: FileResult[]): number {
  let totalChanges = 0;

  for (const { file, players, fixesMap } of results) {
    if (fixesMap.size === 0) continue;
    const fullPath = path.join(SERVER, file);
    const originalText = fs.readFileSync(fullPath, "utf-8");

    // Pre-compute block positions for ALL players in file order (ensures
    // correct occurrence matching for duplicate names)
    type Positioned = { player: Player; start: number; end: number };
    const positioned: Positioned[] = [];
    const nextSearch: Record<string, number> = {};

    for (const player of players) {
      const nameKey = `${player.firstName as string}|${player.lastName as string}`;
      const fromPos = nextSearch[nameKey] ?? 0;
      const bounds = findPlayerBlock(
        originalText,
        player.firstName as string,
        player.lastName as string,
        fromPos
      );
      if (bounds) {
        positioned.push({ player, start: bounds[0], end: bounds[1] });
        nextSearch[nameKey] = bounds[1];
      } else {
        console.warn(`  ⚠ Block not found: ${player.firstName} ${player.lastName}`);
      }
    }

    // Filter to players with fixes, sort by position descending (end-of-file first)
    const toFix = positioned
      .filter(p => fixesMap.has(p.player))
      .sort((a, b) => b.start - a.start);

    let text = originalText;
    for (const { player, start, end } of toFix) {
      const fixes = fixesMap.get(player)!;
      let block = text.slice(start, end);
      for (const { attr, from, to } of fixes) {
        block = replaceAttrInBlock(block, attr, from, to);
      }
      text = text.slice(0, start) + block + text.slice(end);
    }

    if (!DRY_RUN) {
      fs.writeFileSync(fullPath, text, "utf-8");
    }

    const attrCount = [...fixesMap.values()].reduce((s, fx) => s + fx.length, 0);
    console.log(
      `  ${DRY_RUN ? "[dry] " : ""}${file}: ${fixesMap.size} players fixed (${attrCount} attr changes)`
    );
    totalChanges += attrCount;
  }

  return totalChanges;
}

// ── Build fixes with OVR/star invariance ─────────────────────────────────────
// For a player with fg F/G grades, try to raise enough attrs to reach targetFG,
// skipping any raise that would change the player's star tier.
// Returns the safe list of fixes (may be fewer than needed if constrained by tier).
function buildSafeFixes(player: Player, targetFG: number): Fix[] {
  const currentFG = countFG(player);
  if (currentFG <= targetFG) return [];

  const originalStar = playerStar(player);
  const fgAttrs = getFGAttrs(player);

  // Sort descending: raise the least-weak (highest value, closest to 40) first.
  const sorted = [...fgAttrs].sort(
    (a, b) => (player[b] as number) - (player[a] as number)
  );

  const fixes: Fix[] = [];
  let currentFGCount = currentFG;

  for (const attr of sorted) {
    if (currentFGCount <= targetFG) break;

    const fromVal = player[attr] as number;
    // Tentatively raise this attr
    const testPlayer = { ...player, [attr]: 40 };
    const newStar = getStarRatingFromOVR(playerOVR(testPlayer));

    if (newStar !== originalStar) {
      // This raise would change the star tier — skip it
      continue;
    }

    // Safe to raise
    fixes.push({ attr, from: fromVal, to: 40 });
    // Update our working copy so subsequent checks use the new value
    (player[attr] as unknown) = 40;
    currentFGCount--;
  }

  return fixes;
}

// ── Standard balancing: raise all 4+ F/G players toward ≤ 3 F/G ─────────────
async function balanceConference(label: string, files: string[]) {
  console.log(`\n====== ${label} ======`);
  const results = await analyzeFiles(files);
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  let starGuardCount = 0;

  for (const result of results) {
    for (const player of result.players) {
      const fg = countFG(player);
      if (fg <= 3) continue;

      const fgBefore = fg;
      const fixes = buildSafeFixes(player, 3);

      if (fixes.length < fgBefore - 3) {
        // Some raises were blocked by star-tier constraint
        starGuardCount += (fgBefore - 3) - fixes.length;
      }

      if (fixes.length > 0) {
        result.fixesMap.set(player, fixes);
        // player attrs already updated in buildSafeFixes
      }
    }
  }

  if (starGuardCount > 0) {
    console.log(`  (${starGuardCount} raise(s) skipped to preserve star tier)`);
  }

  const totalChanges = applyFiles(results);
  const afterPlayers = results.flatMap(r => r.players);

  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", afterPlayers);
  console.log(`Total attribute changes: ${totalChanges}`);
}

// ── Big 12: raise 4+ to ≤ 3 AND fill missing 2-F/G bucket (idempotent) ───────
async function balanceBig12(files: string[], targetTwoFGCount = 10) {
  console.log(`\n====== Big 12 ======`);
  const results = await analyzeFiles(files);
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  let starGuardCount = 0;

  // Step 1: Raise all 4+ F/G players to ≤ 3 F/G (with star-tier guard)
  for (const result of results) {
    for (const player of result.players) {
      const fg = countFG(player);
      if (fg <= 3) continue;

      const fgBefore = fg;
      const fixes = buildSafeFixes(player, 3);

      if (fixes.length < fgBefore - 3) {
        starGuardCount += (fgBefore - 3) - fixes.length;
      }

      if (fixes.length > 0) {
        result.fixesMap.set(player, fixes);
      }
    }
  }

  // Step 2: Fill the 2-F/G gap — IDEMPOTENT.
  // Count current 2 F/G players and only raise up to the target.
  const allPlayers = results.flatMap(r => r.players);
  const current2FG = allPlayers.filter(p => countFG(p) === 2).length;
  const needed = Math.max(0, targetTwoFGCount - current2FG);

  if (needed === 0) {
    console.log(`  2 F/G bucket already at ${current2FG} players (≥ ${targetTwoFGCount}), skipping gap fix`);
  } else {
    const allEntries = results.flatMap(r => r.players.map(p => ({ player: p, result: r })));

    const threeFGCandidates = allEntries
      .filter(({ player }) => countFG(player) === 3)
      .map(({ player, result: r }) => {
        const fgAttrs = getFGAttrs(player);
        const sorted = [...fgAttrs].sort(
          (a, b) => (player[b] as number) - (player[a] as number)
        );
        const bestAttr = sorted[0];
        return { player, result: r, bestAttr, bestVal: player[bestAttr] as number };
      })
      .sort((a, b) => b.bestVal - a.bestVal); // prefer those closest to 40

    let filled = 0;
    for (const { player, result: r, bestAttr, bestVal } of threeFGCandidates) {
      if (filled >= needed) break;

      // Check star-tier safety
      const origStar = playerStar(player);
      const testPlayer = { ...player, [bestAttr]: 40 };
      const newStar = getStarRatingFromOVR(playerOVR(testPlayer));
      if (newStar !== origStar) {
        starGuardCount++;
        continue;
      }

      const fix: Fix = { attr: bestAttr, from: bestVal, to: 40 };
      const existing = r.fixesMap.get(player);
      if (existing) {
        existing.push(fix);
      } else {
        r.fixesMap.set(player, [fix]);
      }
      (player[bestAttr] as unknown) = 40;
      filled++;
    }

    console.log(`  2 F/G gap fix: raised ${filled} players from 3→2 F/G (needed ${needed})`);
  }

  if (starGuardCount > 0) {
    console.log(`  (${starGuardCount} raise(s) skipped to preserve star tier)`);
  }

  const totalChanges = applyFiles(results);
  const afterPlayers = results.flatMap(r => r.players);

  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", afterPlayers);
  console.log(`Total attribute changes: ${totalChanges}`);
}

// ── OVR/star delta report — confirm zero tier changes ────────────────────────
async function reportOVRDelta(
  label: string,
  files: string[],
  beforeSnaps: Map<string, Record<string, unknown>[]>
) {
  let changed = 0;
  let tierChanged = 0;
  for (const file of files) {
    const fullPath = path.join(SERVER, file);
    const mod = await import(fullPath);
    const rosterKey = Object.keys(mod).find(
      k => typeof mod[k] === "object" && !Array.isArray(mod[k])
    );
    if (!rosterKey) continue;
    const roster = mod[rosterKey] as Record<string, Record<string, unknown>[]>;
    const after = Object.values(roster).flat();
    const before = beforeSnaps.get(file) ?? [];
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      const ovrBefore = playerOVR(before[i]);
      const ovrAfter = playerOVR(after[i]);
      const starBefore = getStarRatingFromOVR(ovrBefore);
      const starAfter = getStarRatingFromOVR(ovrAfter);
      if (ovrBefore !== ovrAfter) changed++;
      if (starBefore !== starAfter) {
        tierChanged++;
        console.warn(
          `  ★ TIER CHANGE: ${after[i].firstName} ${after[i].lastName} ` +
          `${ovrBefore}→${ovrAfter} (${starBefore}★→${starAfter}★)`
        );
      }
    }
  }
  console.log(`  ${label}: ${changed} OVR changes, ${tierChanged} star-tier changes`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
const CONFERENCE_FILES: [string, string[]][] = [
  ["HBCU",    ["hbcuRosters.ts"]],
  ["Big Ten", ["bigTenBatch1.ts", "bigTenBatch2.ts", "bigTenBatch3.ts"]],
  ["ACC",     ["accRostersBatch1.ts", "accRostersBatch2.ts", "accRostersBatch3.ts"]],
  ["Sun Belt",["sunBeltRosters.ts"]],
];

await balanceConference("HBCU",    ["hbcuRosters.ts"]);
await balanceConference("Big Ten", ["bigTenBatch1.ts", "bigTenBatch2.ts", "bigTenBatch3.ts"]);
await balanceConference("ACC",     ["accRostersBatch1.ts", "accRostersBatch2.ts", "accRostersBatch3.ts"]);
await balanceConference("Sun Belt",["sunBeltRosters.ts"]);
await balanceBig12(["big12Rosters.ts"], 10);

console.log("\n✓ Done. Run validators to confirm no regressions.\n");
