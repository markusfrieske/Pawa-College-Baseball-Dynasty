#!/usr/bin/env tsx
/**
 * Balance F/G grade distribution across HBCU, Big Ten, ACC, Sun Belt, and Big 12.
 *
 * F/G = position-relevant attr < 40. E-grade floor = 40.
 * Position-relevant attrs (tracked for F/G grade counting):
 *   Pitchers: velocity, control, stamina, stuff
 *   Batters:  hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * OVR-NEUTRAL strategy:
 *   For each F/G attr we want to raise to 40, compute the OVR delta and
 *   compensate by distributing reductions across common attrs (NOT in the
 *   F/G tracking list) until the net OVR is exactly restored. Verified with
 *   calculateOVR after every adjustment.
 *
 *   Common attrs used for compensation (COMP_FLOOR = 15):
 *     Pitchers: heater, poise, recovery, wRISP, vsLefty  (weight 0.25)
 *     Batters:  clutch, vsLHP, grit, stealing, running, throwing, agile,
 *               wRISP, vsLefty                           (weight 0.22)
 *
 *   If compensation is impossible (common attrs already at floor), the
 *   raise is skipped rather than left partially compensated.
 *
 * Big 12 gap fix (idempotent): fills the 2 F/G bucket to ~3%.
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
const ovr  = (p: Record<string, unknown>) => calculateOVR(p as CalcInput);
const star = (p: Record<string, unknown>) => getStarRatingFromOVR(ovr(p));

// ── Attribute groups ──────────────────────────────────────────────────────────
const FG_PITCHER  = ["velocity", "control", "stamina", "stuff"] as const;
const FG_BATTER   = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
] as const;
const COMP_PITCHER = ["heater", "poise", "recovery", "wRISP", "vsLefty"] as const;
const COMP_BATTER  = [
  "clutch", "vsLHP", "grit", "stealing", "running",
  "throwing", "agile", "wRISP", "vsLefty",
] as const;

type FGAttr   = typeof FG_PITCHER[number]  | typeof FG_BATTER[number];
type CompAttr = typeof COMP_PITCHER[number] | typeof COMP_BATTER[number];

// Compensation attrs must stay at or above this floor after reduction.
// Set at 15 to ensure enough headroom for Tier 5 (HBCU) players whose
// common attrs are already in the 20–35 range.
const COMP_FLOOR = 15;

function fgList(pos: string): readonly FGAttr[] {
  return pos === "P" ? FG_PITCHER : FG_BATTER;
}
function compList(pos: string): readonly CompAttr[] {
  return pos === "P" ? COMP_PITCHER : COMP_BATTER;
}

function countFG(p: Record<string, unknown>): number {
  return fgList(p.position as string).filter(a => (p[a] as number) < 40).length;
}
function getFG(p: Record<string, unknown>): FGAttr[] {
  return fgList(p.position as string).filter(a => (p[a] as number) < 40) as FGAttr[];
}

// ── OVR-neutral multi-attr compensation ──────────────────────────────────────
// Raises `fgAttr` from its current value to 40.
// Compensates for the OVR increase by greedily reducing common attrs
// (from highest to lowest) until the computed OVR is exactly restored.
// Returns the full list of attr changes, or null if compensation fails.
interface AttrChange { attr: string; from: number; to: number }
interface NeutralRaise { changes: AttrChange[] }

function findNeutralRaise(
  player: Record<string, unknown>,
  fgAttr: FGAttr
): NeutralRaise | null {
  const fgFrom  = player[fgAttr] as number;
  if (fgFrom >= 40) return null;

  const baseOVR  = ovr(player);
  const baseStar = star(player);

  // Working copy after raising the F/G attr
  const working: Record<string, unknown> = { ...player, [fgAttr]: 40 };

  if (ovr(working) === baseOVR && star(working) === baseStar) {
    // Lucky zero-delta raise — no compensation needed
    return { changes: [{ attr: fgAttr, from: fgFrom, to: 40 }] };
  }
  if (ovr(working) < baseOVR) return null; // safety

  // Sort compensation candidates: highest current value first (most headroom)
  const candidates = [...compList(player.position as string)].sort(
    (a, b) => (player[b] as number) - (player[a] as number)
  );

  // Greedily reduce comp attrs one unit at a time until OVR matches baseOVR
  for (const compAttr of candidates) {
    while (ovr(working) > baseOVR) {
      const cur = working[compAttr] as number;
      if (cur <= COMP_FLOOR) break; // exhausted this attr
      working[compAttr] = cur - 1;
    }
    if (ovr(working) === baseOVR) break;
  }

  // Verify exact OVR and star restoration
  const finalOVR  = ovr(working);
  const finalStar = star(working);
  if (finalOVR !== baseOVR || finalStar !== baseStar) return null;

  // Build change list (fgAttr + any comp attr that changed)
  const changes: AttrChange[] = [{ attr: fgAttr, from: fgFrom, to: 40 }];
  for (const compAttr of candidates) {
    const newVal = working[compAttr] as number;
    const oldVal = player[compAttr] as number;
    if (newVal !== oldVal) {
      changes.push({ attr: compAttr, from: oldVal, to: newVal });
    }
  }
  return { changes };
}

// ── Build fixes for a player (mutates player in place for sequential checks) ─
function buildFixes(player: Record<string, unknown>, targetFG: number): AttrChange[] {
  const allChanges: AttrChange[] = [];
  const sorted = [...getFG(player)].sort(
    (a, b) => (player[b] as number) - (player[a] as number)
  );
  for (const fgAttr of sorted) {
    if (countFG(player) <= targetFG) break;
    const result = findNeutralRaise(player, fgAttr);
    if (!result) continue;
    for (const ch of result.changes) {
      player[ch.attr] = ch.to;
      allChanges.push(ch);
    }
  }
  return allChanges;
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

// ── Block finder ──────────────────────────────────────────────────────────────
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
  if (next === block) console.warn(`    ⚠ ${attr}: ${from} not replaced in block`);
  return next;
}

// ── Data types & file loading ─────────────────────────────────────────────────
type Player = Record<string, unknown>;
interface FileResult { file: string; players: Player[]; fixesMap: Map<Player, AttrChange[]> }

async function analyzeFiles(files: string[]): Promise<FileResult[]> {
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

function applyFiles(results: FileResult[]): number {
  let total = 0;
  for (const { file, players, fixesMap } of results) {
    if (fixesMap.size === 0) continue;
    const fullPath = path.join(SERVER, file);
    let text = fs.readFileSync(fullPath, "utf-8");

    type Pos = { player: Player; start: number; end: number };
    const positioned: Pos[] = [];
    const nextSearch: Record<string, number> = {};

    for (const player of players) {
      const key = `${player.firstName as string}|${player.lastName as string}`;
      const bounds = findPlayerBlock(
        text, player.firstName as string, player.lastName as string,
        nextSearch[key] ?? 0
      );
      if (bounds) { positioned.push({ player, start: bounds[0], end: bounds[1] }); nextSearch[key] = bounds[1]; }
      else console.warn(`  ⚠ Block not found: ${player.firstName} ${player.lastName}`);
    }

    const toFix = positioned.filter(p => fixesMap.has(p.player)).sort((a,b) => b.start - a.start);
    for (const { player, start, end } of toFix) {
      let block = text.slice(start, end);
      for (const { attr, from, to } of fixesMap.get(player)!) {
        block = replaceAttrInBlock(block, attr, from, to);
      }
      text = text.slice(0, start) + block + text.slice(end);
    }

    if (!DRY_RUN) fs.writeFileSync(fullPath, text, "utf-8");
    const attrCount = [...fixesMap.values()].reduce((s, fx) => s + fx.length, 0);
    console.log(`  ${DRY_RUN?"[dry] ":""}${file}: ${fixesMap.size} players (${attrCount} attr changes)`);
    total += attrCount;
  }
  return total;
}

// ── Conference balancing ─────────────────────────────────────────────────────
async function balanceConference(label: string, files: string[]) {
  console.log(`\n====== ${label} ======`);
  const results = await analyzeFiles(files);
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  for (const result of results) {
    for (const player of result.players) {
      if (countFG(player) <= 3) continue;
      const changes = buildFixes(player, 3);
      if (changes.length > 0) result.fixesMap.set(player, changes);
    }
  }

  const totalChanges = applyFiles(results);
  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", results.flatMap(r => r.players));
  console.log(`Total attr changes: ${totalChanges}`);
}

// ── Big 12: balance + idempotent 2-F/G gap fix ───────────────────────────────
async function balanceBig12(files: string[], targetTwoFG = 10) {
  console.log(`\n====== Big 12 ======`);
  const results = await analyzeFiles(files);
  const beforeSnap = results.flatMap(r => r.players).map(p => ({ ...p }));

  for (const result of results) {
    for (const player of result.players) {
      if (countFG(player) <= 3) continue;
      const changes = buildFixes(player, 3);
      if (changes.length > 0) result.fixesMap.set(player, changes);
    }
  }

  const allPlayers = results.flatMap(r => r.players);
  const current2FG = allPlayers.filter(p => countFG(p) === 2).length;
  const needed = Math.max(0, targetTwoFG - current2FG);

  if (needed === 0) {
    console.log(`  Gap fix: 2-F/G bucket at ${current2FG} (≥${targetTwoFG}), skipping`);
  } else {
    const entries = results.flatMap(r => r.players.map(p => ({ player: p, result: r })));
    const cands = entries
      .filter(({ player }) => countFG(player) === 3)
      .map(({ player, result: r }) => {
        const fgSorted = [...getFG(player)].sort((a,b) => (player[b] as number)-(player[a] as number));
        return { player, result: r, bestAttr: fgSorted[0], bestVal: player[fgSorted[0]] as number };
      })
      .sort((a,b) => b.bestVal - a.bestVal);

    let filled = 0;
    for (const { player, result: r, bestAttr } of cands) {
      if (filled >= needed) break;
      const raise = findNeutralRaise(player, bestAttr);
      if (!raise) continue;
      for (const ch of raise.changes) { player[ch.attr] = ch.to; }
      const existing = r.fixesMap.get(player);
      if (existing) existing.push(...raise.changes);
      else r.fixesMap.set(player, [...raise.changes]);
      filled++;
    }
    console.log(`  Gap fix: raised ${filled} players to 2 F/G (needed ${needed})`);
  }

  const totalChanges = applyFiles(results);
  printDist("BEFORE", beforeSnap);
  printDist("AFTER ", results.flatMap(r => r.players));
  console.log(`Total attr changes: ${totalChanges}`);
}

// ── OVR delta report (post-apply verification) ───────────────────────────────
async function verifyOVR(label: string, files: string[], origFiles: Map<string, string>) {
  let ovrΔ = 0, starΔ = 0;
  const ATTRS = [
    "velocity","control","stamina","stuff",
    "hitForAvg","power","speed","arm","fielding","errorResistance",
    "clutch","vsLHP","grit","stealing","running","throwing","agile",
    "heater","poise","recovery","wRISP","vsLefty","position","abilities",
  ];
  function parse(content: string): Record<string, unknown>[] {
    const players: Record<string, unknown>[] = [];
    const re2 = new RegExp(
      ATTRS.map(a => `(${a}:\\s*(?:\\d+|"[^"]*"|\\[[^\\]]*\\]))`).join("|"), "g"
    );
    let depth = 0, cur: Record<string, unknown> | null = null;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "{") {
        depth++;
        if (depth === 3) cur = {};
      } else if (content[i] === "}") {
        if (depth === 3 && cur?.position) players.push({ ...cur });
        depth--;
      }
    }
    // simpler: use the regex directly on full file
    players.length = 0;
    const blkRe = /\{[^{}]*firstName:[^{}]*\}/gs;
    for (const blk of content.matchAll(blkRe)) {
      const obj: Record<string, unknown> = {};
      for (const a of ATTRS) {
        const m2 = blk[0].match(new RegExp(`\\b${a}:\\s*(\\d+)`));
        if (m2) obj[a] = parseInt(m2[1]);
      }
      if (obj.position === undefined) {
        const mp = blk[0].match(/position:\s*"([^"]+)"/);
        if (mp) obj.position = mp[1];
      }
      if (obj.position && typeof obj.position === "string") players.push(obj);
    }
    return players;
  }
  for (const file of files) {
    const before = parse(origFiles.get(file)!);
    const after  = parse(fs.readFileSync(path.join(SERVER, file), "utf-8"));
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      const oB = ovr(before[i]), oA = ovr(after[i]);
      const sB = star(before[i]), sA = star(after[i]);
      if (oB !== oA) ovrΔ++;
      if (sB !== sA) { starΔ++; console.warn(`  ★ STAR CHANGE: ${file}[${i}] ${oB}→${oA}`); }
    }
  }
  console.log(`  ${label}: OVR Δ=${ovrΔ}, star-tier Δ=${starΔ}`);
  return { ovrΔ, starΔ };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const ALL_FILES = [
  "hbcuRosters.ts",
  "bigTenBatch1.ts","bigTenBatch2.ts","bigTenBatch3.ts",
  "accRostersBatch1.ts","accRostersBatch2.ts","accRostersBatch3.ts",
  "sunBeltRosters.ts","big12Rosters.ts",
];

// Snapshot originals before any writes (for post-apply OVR verification)
const origContents = new Map<string, string>();
for (const f of ALL_FILES) {
  origContents.set(f, fs.readFileSync(path.join(SERVER, f), "utf-8"));
}

await balanceConference("HBCU",     ["hbcuRosters.ts"]);
await balanceConference("Big Ten",  ["bigTenBatch1.ts","bigTenBatch2.ts","bigTenBatch3.ts"]);
await balanceConference("ACC",      ["accRostersBatch1.ts","accRostersBatch2.ts","accRostersBatch3.ts"]);
await balanceConference("Sun Belt", ["sunBeltRosters.ts"]);
await balanceBig12(["big12Rosters.ts"], 10);

if (!DRY_RUN) {
  console.log("\n── OVR delta verification ──────────────────────────────────────");
  await verifyOVR("HBCU",     ["hbcuRosters.ts"],                                              origContents);
  await verifyOVR("Big Ten",  ["bigTenBatch1.ts","bigTenBatch2.ts","bigTenBatch3.ts"],          origContents);
  await verifyOVR("ACC",      ["accRostersBatch1.ts","accRostersBatch2.ts","accRostersBatch3.ts"],origContents);
  await verifyOVR("Sun Belt", ["sunBeltRosters.ts"],                                            origContents);
  await verifyOVR("Big 12",   ["big12Rosters.ts"],                                              origContents);
}

console.log("\n✓ Script complete.\n");
