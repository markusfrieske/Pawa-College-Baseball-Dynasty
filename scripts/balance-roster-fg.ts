#!/usr/bin/env tsx
/**
 * Balance F/G grade distribution across HBCU, Big Ten, ACC, Sun Belt, and Big 12 rosters.
 *
 * F grade = attr 30-39, G grade = attr < 30. Both are "below E-grade" (< 40).
 * Position-relevant attrs:
 *   Pitchers: velocity, control, stamina, stuff
 *   Batters:  hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * Strategy: raise all 4+ F/G players to ≤ 3 F/G by bumping the least-weak
 * F/G attrs up to 40 (E-grade floor). Big 12 additionally converts ~10 players
 * from 3 F/G → 2 F/G to fill the unnatural gap at exactly 2 F/G.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "server");
const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) console.log("DRY RUN — no files will be modified\n");

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
// Find the { ... } player block containing firstName/lastName, starting search
// from `fromPos`. Returns [blockOpen, blockClose+1] (exclusive end).
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

  // Walk backward to find the opening {
  let open = m.index;
  while (open > 0 && text[open] !== "{") open--;
  if (text[open] !== "{") return null;

  // Brace-count forward to find the matching } (player blocks have no nested {})
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
  fixesMap: Map<Player, Fix[]>; // player object → list of attr fixes
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
// Pre-computes block positions for ALL players (in file order) so that duplicate
// names are handled correctly — even when only some occurrences have fixes.
function applyFiles(results: FileResult[]): number {
  let totalChanges = 0;

  for (const { file, players, fixesMap } of results) {
    if (fixesMap.size === 0) continue;
    const fullPath = path.join(SERVER, file);
    const originalText = fs.readFileSync(fullPath, "utf-8");

    // Step 1: Walk ALL players in file order and record each block position.
    // Using sequential search positions ensures correct occurrence matching
    // even when some same-named players don't have fixes.
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

    // Step 2: Filter to players that actually have fixes, sort by position descending
    // so end-of-file replacements don't shift earlier positions.
    const toFix = positioned
      .filter(p => fixesMap.has(p.player))
      .sort((a, b) => b.start - a.start);

    // Step 3: Apply all fixes in reverse-file-order on a single text copy
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

// ── Standard balancing: raise all 4+ F/G players to ≤ 3 F/G ─────────────────
async function balanceConference(label: string, files: string[]) {
  console.log(`\n====== ${label} ======`);
  const results = await analyzeFiles(files);

  // Snapshot before (shallow-clone each player so BEFORE values are preserved)
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  for (const result of results) {
    for (const player of result.players) {
      const fg = countFG(player);
      if (fg <= 3) continue;

      const fgAttrs = getFGAttrs(player);
      // Sort descending by value: raise the least-weak (highest-value) F/G attrs first
      const sorted = [...fgAttrs].sort((a, b) => (player[b] as number) - (player[a] as number));
      const toRaise = sorted.slice(0, fg - 3);

      const fixes: Fix[] = toRaise.map(attr => ({
        attr,
        from: player[attr] as number,
        to: 40,
      }));

      result.fixesMap.set(player, fixes);

      // Update in-memory for the AFTER distribution
      for (const { attr } of fixes) (player[attr] as unknown) = 40;
    }
  }

  const totalChanges = applyFiles(results);
  const afterPlayers = results.flatMap(r => r.players);

  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", afterPlayers);
  console.log(`Total attribute changes: ${totalChanges}`);
}

// ── Big 12: raise 4+ to ≤ 3 AND fill the missing 2-F/G bucket ───────────────
async function balanceBig12(files: string[], targetTwoFGCount = 10) {
  console.log(`\n====== Big 12 ======`);
  const results = await analyzeFiles(files);
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  // Step 1: Raise all 4+ F/G players to exactly 3 F/G
  for (const result of results) {
    for (const player of result.players) {
      const fg = countFG(player);
      if (fg <= 3) continue;

      const fgAttrs = getFGAttrs(player);
      const sorted = [...fgAttrs].sort((a, b) => (player[b] as number) - (player[a] as number));
      const toRaise = sorted.slice(0, fg - 3);

      const fixes: Fix[] = toRaise.map(attr => ({
        attr,
        from: player[attr] as number,
        to: 40,
      }));

      result.fixesMap.set(player, fixes);
      for (const { attr } of fixes) (player[attr] as unknown) = 40;
    }
  }

  // Step 2: Fill the missing 2-F/G bucket.
  // Pick players at exactly 3 F/G whose best (least-weak) F/G attr is closest to 40.
  const allEntries = results.flatMap(r =>
    r.players.map(p => ({ player: p, result: r }))
  );

  const threeFGCandidates = allEntries
    .filter(({ player }) => countFG(player) === 3)
    .map(({ player, result: r }) => {
      const fgAttrs = getFGAttrs(player);
      const sorted = [...fgAttrs].sort((a, b) => (player[b] as number) - (player[a] as number));
      const bestAttr = sorted[0];
      return { player, result: r, bestAttr, bestVal: player[bestAttr] as number };
    })
    .sort((a, b) => b.bestVal - a.bestVal); // prefer those closest to 40

  const chosen = threeFGCandidates.slice(0, targetTwoFGCount);
  for (const { player, result: r, bestAttr, bestVal } of chosen) {
    const fix: Fix = { attr: bestAttr, from: bestVal, to: 40 };
    const existing = r.fixesMap.get(player);
    if (existing) {
      existing.push(fix);
    } else {
      r.fixesMap.set(player, [fix]);
    }
    (player[bestAttr] as unknown) = 40;
  }

  const totalChanges = applyFiles(results);
  const afterPlayers = results.flatMap(r => r.players);

  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", afterPlayers);
  console.log(`Total attribute changes: ${totalChanges}`);
  console.log(`  (of which ${chosen.length} players raised 3→2 F/G for the gap fix)`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
await balanceConference("HBCU",    ["hbcuRosters.ts"]);
await balanceConference("Big Ten", ["bigTenBatch1.ts", "bigTenBatch2.ts", "bigTenBatch3.ts"]);
await balanceConference("ACC",     ["accRostersBatch1.ts", "accRostersBatch2.ts", "accRostersBatch3.ts"]);
await balanceConference("Sun Belt",["sunBeltRosters.ts"]);
await balanceBig12(["big12Rosters.ts"], 10);

console.log("\n✓ Done. Run validators to confirm no regressions.\n");
