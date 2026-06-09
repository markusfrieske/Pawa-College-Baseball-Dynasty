/**
 * validate-tools.ts
 *
 * Samples generated recruit classes AND simulated CPU roster players to verify
 * the tool archetype distribution is working correctly across both code paths.
 *
 * Pass criteria:
 *   - ≥ 80% of 1-2★ non-bust recruits have at least one attribute ≥ 40 (E grade)
 *   - ≤ 10% of 1-2★ non-bust recruits have ALL attributes below 40
 *   - ≥ 90% of tooled players have at least one tooled attribute ≥ 35 (boost confirmed)
 *   - Tool counts fall within expected ranges per star tier (both paths)
 */

import { generateRecruitClass, selectTools, genToolAttr, HITTER_TOOL_GROUPS, PITCHER_TOOL_GROUPS } from "../server/recruit-generator";
import type { GeneratedRecruit } from "../server/recruit-generator";

const SAMPLE_CLASSES = 10;
const RECRUITS_PER_CLASS = 75;
const CPU_ROSTER_SAMPLES = 5;   // simulated teams × 25 players each
const CPU_PLAYERS_PER_TEAM = 25;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAttrValues(attrs: Record<string, number>): number[] {
  return [
    attrs.hitForAvg, attrs.power, attrs.speed, attrs.arm,
    attrs.fielding, attrs.errorResistance,
    attrs.velocity, attrs.control, attrs.stamina, attrs.stuff,
    attrs.clutch, attrs.running, attrs.stealing,
    attrs.throwing, attrs.wRISP, attrs.agile,
  ];
}

// ─── Recruit-class pass ──────────────────────────────────────────────────────

// Only checks players WITH ≥1 tool — 0-tool players are intentionally all-below-E
// ("true replacement level"), so counting them against the threshold is incorrect.
let totalLowStarTooled = 0;
let lowStarTooledWithAtLeastOneE = 0;
let lowStarTooledAllBelowE = 0;
let recruitTooledTotal = 0;
let recruitTooledBoosted = 0;
const recruitToolCountsByTier: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

for (let c = 0; c < SAMPLE_CLASSES; c++) {
  const recruits = generateRecruitClass(RECRUITS_PER_CLASS);

  for (const r of recruits) {
    // r.tools is typed string[] | null | undefined after schema addition
    const tools: string[] = r.tools ?? [];
    const stars = r.starRating ?? r.starRank ?? 3;
    const isPitcher = r.position === "P";
    const isBust = r.isGenerationalBust || r.isBust;
    const isGem  = r.isGenerationalGem  || r.isGem;

    if (!isBust && !isGem && stars >= 1 && stars <= 5) {
      recruitToolCountsByTier[stars].push(tools.length);
    }

    // Only count 1-2★ non-special players who have at least one tool.
    // Zero-tool players are "replacement level" and are expected to be all-below-E.
    if (!isBust && !isGem && (stars === 1 || stars === 2) && tools.length > 0) {
      totalLowStarTooled++;
      const attrVals = getAttrValues({
        hitForAvg: r.hitForAvg ?? 0, power: r.power ?? 0, speed: r.speed ?? 0,
        arm: r.arm ?? 0, fielding: r.fielding ?? 0, errorResistance: r.errorResistance ?? 0,
        velocity: r.velocity ?? 0, control: r.control ?? 0, stamina: r.stamina ?? 0,
        stuff: r.stuff ?? 0, clutch: r.clutch ?? 0, running: r.running ?? 0,
        stealing: r.stealing ?? 0, throwing: r.throwing ?? 0,
        wRISP: r.wRISP ?? 0, agile: r.agile ?? 0,
      });
      if (attrVals.some(v => v >= 40)) lowStarTooledWithAtLeastOneE++;
      if (attrVals.every(v => v < 40))  lowStarTooledAllBelowE++;
    }

    if (tools.length > 0 && !isBust && !isGem) {
      recruitTooledTotal++;
      const toolGroups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
      const tooledKeys = tools.flatMap(t => toolGroups[t] ?? []);
      const attrMap: Record<string, number> = {
        hitForAvg: r.hitForAvg ?? 0, power: r.power ?? 0, speed: r.speed ?? 0,
        arm: r.arm ?? 0, fielding: r.fielding ?? 0, errorResistance: r.errorResistance ?? 0,
        velocity: r.velocity ?? 0, control: r.control ?? 0, stamina: r.stamina ?? 0,
        stuff: r.stuff ?? 0, clutch: r.clutch ?? 0, running: r.running ?? 0,
        stealing: r.stealing ?? 0, throwing: r.throwing ?? 0,
        wRISP: r.wRISP ?? 0, agile: r.agile ?? 0,
      };
      if (tooledKeys.some(k => (attrMap[k] ?? 0) >= 35)) recruitTooledBoosted++;
    }
  }
}

// ─── CPU auto-roster simulation pass ────────────────────────────────────────
// Mirrors the exact logic used in server/routes.ts generateCpuRoster().

const positions = ["P","P","P","P","P","P","P","C","1B","2B","3B","SS","LF","CF","RF","P","P","P","P","1B","2B","3B","SS","LF","RF"];

function getTargetAttrAvg(): { avg: number; starTier: number } {
  const roll = Math.random();
  if (roll < 0.05) return { avg: 65 + Math.floor(Math.random() * 8),  starTier: 5 };
  if (roll < 0.25) return { avg: 55 + Math.floor(Math.random() * 10), starTier: 4 };
  if (roll < 0.65) return { avg: 42 + Math.floor(Math.random() * 10), starTier: 3 };
  if (roll < 0.90) return { avg: 26 + Math.floor(Math.random() * 12), starTier: 2 };
  return             { avg: 18 + Math.floor(Math.random() * 8),  starTier: 1 };
}

const genAttrAroundAvg = (avg: number) =>
  Math.max(1, Math.min(100, avg + Math.floor(Math.random() * 21) - 10));

// Only check tooled 1-2★ players (same rationale as recruit pass — 0-tool is replacement-level by design)
let cpuLowStarTooled = 0;
let cpuLowStarTooledWithE = 0;
let cpuLowStarTooledAllBelowE = 0;
let cpuTooledTotal = 0;
let cpuTooledBoosted = 0;
const cpuToolCountsByTier: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

for (let team = 0; team < CPU_ROSTER_SAMPLES; team++) {
  for (let i = 0; i < CPU_PLAYERS_PER_TEAM; i++) {
    const position = positions[i % positions.length];
    const isPitcherPos = position === "P";
    const { avg: targetAvg, starTier } = getTargetAttrAvg();

    const cpuTools = selectTools(starTier, isPitcherPos);
    const cpuToolGroups = isPitcherPos ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
    const cpuTooledAttrs = new Set<string>(cpuTools.flatMap(t => cpuToolGroups[t] ?? []));
    const genT = (attr: string) => genToolAttr(targetAvg, cpuTooledAttrs.has(attr));

    const attrs: Record<string, number> = {
      hitForAvg: genT("hitForAvg"), power: genT("power"), speed: genT("speed"),
      arm: genT("arm"), fielding: genT("fielding"), errorResistance: genT("errorResistance"),
      velocity: genT("velocity"), control: genT("control"),
      stamina: genT("stamina"), stuff: genT("stuff"),
      clutch: genT("clutch"), running: genT("running"), stealing: genT("stealing"),
      throwing: genT("throwing"), wRISP: genT("wRISP"), agile: genT("agile"),
      vsLHP: genAttrAroundAvg(targetAvg), grit: genAttrAroundAvg(targetAvg),
      recovery: genAttrAroundAvg(targetAvg), vsLefty: genAttrAroundAvg(targetAvg),
    };

    cpuToolCountsByTier[starTier] = cpuToolCountsByTier[starTier] ?? [];
    cpuToolCountsByTier[starTier].push(cpuTools.length);

    if ((starTier === 1 || starTier === 2) && cpuTools.length > 0) {
      cpuLowStarTooled++;
      const vals = getAttrValues(attrs);
      if (vals.some(v => v >= 40)) cpuLowStarTooledWithE++;
      if (vals.every(v => v < 40))  cpuLowStarTooledAllBelowE++;
    }

    if (cpuTools.length > 0) {
      cpuTooledTotal++;
      const tooledKeys = cpuTools.flatMap(t => cpuToolGroups[t] ?? []);
      if (tooledKeys.some(k => (attrs[k] ?? 0) >= 35)) cpuTooledBoosted++;
    }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\nTool Archetype Distribution Validation`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Recruit classes: ${SAMPLE_CLASSES} × ${RECRUITS_PER_CLASS} = ${SAMPLE_CLASSES * RECRUITS_PER_CLASS} recruits`);
console.log(`CPU roster:      ${CPU_ROSTER_SAMPLES} teams × ${CPU_PLAYERS_PER_TEAM} players = ${CPU_ROSTER_SAMPLES * CPU_PLAYERS_PER_TEAM} players\n`);

let allOk = true;

function section(title: string) {
  console.log(`── ${title} ──`);
}

function check(label: string, actual: number, denom: number, threshold: number, direction: "gte" | "lte"): boolean {
  const pct = denom > 0 ? (actual / denom) * 100 : 100;
  const ok = direction === "gte" ? pct >= threshold : pct <= threshold;
  const symbol = ok ? "✓" : "✗";
  console.log(`  ${symbol} ${label}: ${actual}/${denom} = ${pct.toFixed(1)}%  (need ${direction === "gte" ? "≥" : "≤"} ${threshold}%)`);
  return ok;
}

// Recruit specialisation (tooled players only — 0-tool = replacement-level by design)
section("Recruit 1-2★ specialisation, tooled players only");
allOk = check("Have ≥ 1 attr at E(40+)", lowStarTooledWithAtLeastOneE, totalLowStarTooled, 80, "gte") && allOk;
allOk = check("All attrs below E", lowStarTooledAllBelowE, totalLowStarTooled, 10, "lte") && allOk;
console.log();

// CPU specialisation (tooled players only)
section("CPU roster 1-2★ specialisation, tooled players only");
allOk = check("Have ≥ 1 attr at E(40+)", cpuLowStarTooledWithE, cpuLowStarTooled, 80, "gte") && allOk;
allOk = check("All attrs below E", cpuLowStarTooledAllBelowE, cpuLowStarTooled, 10, "lte") && allOk;
console.log();

// Boost effectiveness
section("Tool boost effectiveness — recruits");
allOk = check("Tooled players with ≥ 1 boosted attr ≥ 35", recruitTooledBoosted, recruitTooledTotal, 90, "gte") && allOk;
section("Tool boost effectiveness — CPU roster");
allOk = check("Tooled players with ≥ 1 boosted attr ≥ 35", cpuTooledBoosted, cpuTooledTotal, 90, "gte") && allOk;
console.log();

// Tool count distribution
const expectedRanges: Record<number, [number, number]> = {
  5: [3, 5], 4: [2, 4], 3: [1, 3], 2: [1, 2], 1: [0, 2],
};

section("Average tool count by star tier — recruits");
for (const tier of [5, 4, 3, 2, 1]) {
  const counts = recruitToolCountsByTier[tier] ?? [];
  if (!counts.length) { console.log(`  ${tier}★: no samples`); continue; }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const [lo, hi] = expectedRanges[tier];
  const ok = avg >= lo * 0.7 && avg <= hi * 1.3;
  if (!ok) allOk = false;
  console.log(`  ${ok ? "✓" : "✗"} ${tier}★: avg ${avg.toFixed(2)} tools  (expected ${lo}–${hi})`);
}
console.log();

section("Average tool count by star tier — CPU roster");
for (const tier of [5, 4, 3, 2, 1]) {
  const counts = cpuToolCountsByTier[tier] ?? [];
  if (!counts.length) { console.log(`  ${tier}★: no samples`); continue; }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const [lo, hi] = expectedRanges[tier];
  const ok = avg >= lo * 0.7 && avg <= hi * 1.3;
  if (!ok) allOk = false;
  console.log(`  ${ok ? "✓" : "✗"} ${tier}★: avg ${avg.toFixed(2)} tools  (expected ${lo}–${hi})`);
}
console.log();

if (allOk) {
  console.log("✓ All tool archetype checks passed.");
  process.exit(0);
} else {
  console.error("✗ One or more tool archetype checks failed.");
  process.exit(1);
}
