#!/usr/bin/env tsx
/**
 * Balance F/G grade distribution across HBCU, Big Ten, ACC, Sun Belt, and Big 12.
 *
 * F/G = position-relevant attr < 40.  E-grade floor = 40.
 * Position-relevant attrs tracked for F/G:
 *   Pitchers: velocity, control, stamina, stuff
 *   Batters:  hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * Strategy: for each player with 4+ F/G, raise the least-weak attrs to 40
 * one at a time until the player reaches ≤ 3 F/G.  Skip any single raise
 * that would move the player across a star-tier boundary (200/300/400/500),
 * because crossing a tier meaningfully changes player identity.  Small OVR
 * changes within a tier are expected and acceptable.
 *
 * Big 12 also fills the missing 2-F/G bucket (idempotent — checks current
 * count before acting, no-ops when already at target).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER   = path.resolve(__dirname, "..", "server");
const SHARED   = path.resolve(__dirname, "..", "shared");
const DRY_RUN  = process.argv.includes("--dry-run");

if (DRY_RUN) console.log("DRY RUN — no files will be modified\n");

// ── Import the exact OVR & star helpers used by the game ─────────────────────
const { calculateOVR, getStarRatingFromOVR } = await import(
  path.join(SHARED, "abilities.ts")
);
type CalcInput = Parameters<typeof calculateOVR>[0];
const playerOVR  = (p: Record<string, unknown>) => calculateOVR(p as CalcInput);
const playerStar = (p: Record<string, unknown>) => getStarRatingFromOVR(playerOVR(p));

// ── Attribute groups ──────────────────────────────────────────────────────────
const FG_PITCHER = ["velocity", "control", "stamina", "stuff"] as const;
const FG_BATTER  = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance"] as const;
type FGAttr = typeof FG_PITCHER[number] | typeof FG_BATTER[number];

function relevantAttrs(pos: string): readonly FGAttr[] {
  return pos === "P" ? FG_PITCHER : (FG_BATTER as unknown as FGAttr[]);
}
function countFG(p: Record<string, unknown>): number {
  return relevantAttrs(p.position as string).filter(a => (p[a] as number) < 40).length;
}
function getFG(p: Record<string, unknown>): FGAttr[] {
  return relevantAttrs(p.position as string).filter(a => (p[a] as number) < 40) as FGAttr[];
}

// ── Star-tier-safe raise ──────────────────────────────────────────────────────
// Try to lower a player's F/G count from current to targetFG by raising
// F/G attrs to 40.  Each raise is tested: if it would cross a star-tier
// boundary, skip that attr and try the next.  Player record is mutated
// in-place so sequential raises build on each other.
interface Fix { attr: FGAttr; from: number; to: number }

function buildFixes(player: Record<string, unknown>, targetFG: number): Fix[] {
  const fixes: Fix[] = [];
  const baseStar = playerStar(player);

  // Sort: try closest-to-40 (least-weak) first — smallest OVR impact
  const sorted = [...getFG(player)].sort(
    (a, b) => (player[b] as number) - (player[a] as number)
  );

  for (const attr of sorted) {
    if (countFG(player) <= targetFG) break;

    const from = player[attr] as number;
    const afterRaise = { ...player, [attr]: 40 };

    if (playerStar(afterRaise) !== baseStar) continue; // would cross tier — skip

    fixes.push({ attr, from, to: 40 });
    player[attr] = 40; // apply in-place so next iteration sees updated attrs
  }

  return fixes;
}

// ── Distribution reporter ─────────────────────────────────────────────────────
function printDist(label: string, players: Record<string, unknown>[]) {
  const dist: Record<string, number> = { "0":0,"1":0,"2":0,"3":0,"4":0,"5+":0 };
  for (const p of players) {
    const fg = countFG(p);
    dist[fg >= 5 ? "5+" : String(fg)]++;
  }
  const total = players.length;
  const fourPlus = ((dist["4"] + dist["5+"]) / total * 100).toFixed(1);
  console.log(`\n${label} (${total} players):`);
  for (const k of ["0","1","2","3","4","5+"]) {
    const n = dist[k];
    console.log(`  ${k} F/G: ${n} (${(n/total*100).toFixed(1)}%)`);
  }
  console.log(`  4+ combined: ${fourPlus}%`);
}

// ── Block finder (brace-counting, handles duplicate names) ───────────────────
function findPlayerBlock(
  text: string, firstName: string, lastName: string, fromPos = 0
): [number, number] | null {
  const ef = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const el = lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `firstName:\\s*"${ef}"[\\s\\S]{0,80}?lastName:\\s*"${el}"`, "g"
  );
  re.lastIndex = fromPos;
  const m = re.exec(text);
  if (!m) return null;

  let open = m.index;
  while (open > 0 && text[open] !== "{") open--;
  if (text[open] !== "{") return null;

  let depth = 0, pos = open;
  while (pos < text.length) {
    if (text[pos] === "{") depth++;
    else if (text[pos] === "}") { depth--; if (depth === 0) break; }
    pos++;
  }
  return depth === 0 ? [open, pos + 1] : null;
}

function replaceAttrInBlock(block: string, attr: string, from: number, to: number): string {
  const re = new RegExp(`(\\b${attr}:\\s*)${from}(?=[,\\s}])`, "g");
  const next = block.replace(re, `$1${to}`);
  if (next === block) console.warn(`    ⚠ ${attr}: ${from} not replaced`);
  return next;
}

// ── Types & file loader ───────────────────────────────────────────────────────
type Player = Record<string, unknown>;
interface FileResult { file: string; players: Player[]; fixesMap: Map<Player, Fix[]> }

async function loadFiles(files: string[]): Promise<FileResult[]> {
  const results: FileResult[] = [];
  for (const file of files) {
    const mod = await import(path.join(SERVER, file));
    const rk  = Object.keys(mod).find(k => typeof mod[k] === "object" && !Array.isArray(mod[k]));
    if (!rk) continue;
    const players = Object.values(mod[rk] as Record<string, Player[]>).flat();
    results.push({ file, players, fixesMap: new Map() });
  }
  return results;
}

// ── Write fixes to disk ───────────────────────────────────────────────────────
function applyFixes(results: FileResult[]): number {
  let total = 0;
  for (const { file, players, fixesMap } of results) {
    if (fixesMap.size === 0) continue;
    const fullPath = path.join(SERVER, file);
    let text = fs.readFileSync(fullPath, "utf-8");

    // Map each player to its block bounds (file order → correct occurrence)
    type Pos = { player: Player; start: number; end: number };
    const positioned: Pos[] = [];
    const nextSearch: Record<string, number> = {};

    for (const player of players) {
      const key = `${player.firstName as string}|${player.lastName as string}`;
      const bounds = findPlayerBlock(
        text, player.firstName as string, player.lastName as string,
        nextSearch[key] ?? 0
      );
      if (bounds) {
        positioned.push({ player, start: bounds[0], end: bounds[1] });
        nextSearch[key] = bounds[1];
      } else {
        console.warn(`  ⚠ Block not found: ${player.firstName} ${player.lastName}`);
      }
    }

    // Apply from end-of-file to start to preserve offsets
    const toFix = positioned
      .filter(p => fixesMap.has(p.player))
      .sort((a, b) => b.start - a.start);

    for (const { player, start, end } of toFix) {
      let block = text.slice(start, end);
      for (const { attr, from, to } of fixesMap.get(player)!) {
        block = replaceAttrInBlock(block, attr, from, to);
      }
      text = text.slice(0, start) + block + text.slice(end);
    }

    if (!DRY_RUN) fs.writeFileSync(fullPath, text, "utf-8");

    const attrCount = [...fixesMap.values()].reduce((s, f) => s + f.length, 0);
    const skipped   = [...fixesMap.values()].filter(f => f.length === 0).length;
    console.log(
      `  ${DRY_RUN ? "[dry] " : ""}${file}: ` +
      `${fixesMap.size} players fixed (${attrCount} attr changes${skipped ? `, ${skipped} fully skipped by star guard` : ""})`
    );
    total += attrCount;
  }
  return total;
}

// ── Standard conference balancing ─────────────────────────────────────────────
async function balanceConference(label: string, files: string[]) {
  console.log(`\n====== ${label} ======`);
  const results = await loadFiles(files);
  const snap    = results.flatMap(r => r.players).map(p => ({ ...p }));

  let starGuarded = 0;
  for (const { players, fixesMap } of results) {
    for (const player of players) {
      const fgBefore = countFG(player);
      if (fgBefore <= 3) continue;
      const fixes = buildFixes(player, 3);
      starGuarded += Math.max(0, (fgBefore - 3) - fixes.length);
      if (fixes.length > 0) fixesMap.set(player, fixes);
    }
  }

  if (starGuarded > 0) {
    console.log(`  (${starGuarded} raises skipped to preserve star tier)`);
  }

  const total = applyFixes(results);
  printDist("BEFORE", snap);
  printDist("AFTER ", results.flatMap(r => r.players));
  console.log(`Total attr changes: ${total}`);
}

// ── Big 12: balance + idempotent 2-F/G gap fill ──────────────────────────────
async function balanceBig12(files: string[], target2FG = 10) {
  console.log(`\n====== Big 12 ======`);
  const results = await loadFiles(files);
  const snap    = results.flatMap(r => r.players).map(p => ({ ...p }));

  let starGuarded = 0;
  for (const { players, fixesMap } of results) {
    for (const player of players) {
      const fgBefore = countFG(player);
      if (fgBefore <= 3) continue;
      const fixes = buildFixes(player, 3);
      starGuarded += Math.max(0, (fgBefore - 3) - fixes.length);
      if (fixes.length > 0) fixesMap.set(player, fixes);
    }
  }

  // Idempotent gap fill: count current 2-F/G players, fill only to target
  const allPlayers  = results.flatMap(r => r.players);
  const current2FG  = allPlayers.filter(p => countFG(p) === 2).length;
  const needed      = Math.max(0, target2FG - current2FG);

  if (needed === 0) {
    console.log(`  Gap fix: 2-F/G bucket at ${current2FG} (≥${target2FG}), skipping`);
  } else {
    // Candidates: players currently at exactly 3 F/G, prefer those with highest F/G attr
    const entries = results.flatMap(r => r.players.map(p => ({ player: p, result: r })));
    const cands   = entries
      .filter(({ player }) => countFG(player) === 3)
      .map(({ player, result }) => {
        const sorted = [...getFG(player)].sort(
          (a, b) => (player[b] as number) - (player[a] as number)
        );
        return { player, result, bestAttr: sorted[0], bestVal: player[sorted[0]] as number };
      })
      .sort((a, b) => b.bestVal - a.bestVal); // closest to 40 first

    let filled = 0;
    for (const { player, result, bestAttr, bestVal } of cands) {
      if (filled >= needed) break;

      // Star-tier guard
      const origStar = playerStar(player);
      if (getStarRatingFromOVR(calculateOVR({ ...player, [bestAttr]: 40 } as CalcInput)) !== origStar) {
        starGuarded++;
        continue;
      }

      const fix: Fix = { attr: bestAttr, from: bestVal, to: 40 };
      const existing = result.fixesMap.get(player);
      if (existing) existing.push(fix);
      else result.fixesMap.set(player, [fix]);
      player[bestAttr] = 40;
      filled++;
    }

    console.log(`  Gap fix: raised ${filled} players to 2 F/G (needed ${needed})`);
  }

  if (starGuarded > 0) console.log(`  (${starGuarded} raises skipped by star guard)`);

  const total = applyFixes(results);
  printDist("BEFORE", snap);
  printDist("AFTER ", results.flatMap(r => r.players));
  console.log(`Total attr changes: ${total}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
await balanceConference("HBCU",     ["hbcuRosters.ts"]);
await balanceConference("Big Ten",  ["bigTenBatch1.ts", "bigTenBatch2.ts", "bigTenBatch3.ts"]);
await balanceConference("ACC",      ["accRostersBatch1.ts", "accRostersBatch2.ts", "accRostersBatch3.ts"]);
await balanceConference("Sun Belt", ["sunBeltRosters.ts"]);
await balanceBig12(["big12Rosters.ts"], 10);

console.log("\n✓ Done. Run validators to confirm no regressions.\n");
