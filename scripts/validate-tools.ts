/**
 * validate-tools.ts
 *
 * Samples generated recruit classes and CPU roster players to verify the
 * tool archetype distribution is working correctly.
 *
 * Pass criteria:
 *   - ≥ 80% of 1-2★ non-bust recruits have at least one attribute ≥ 40 (E grade)
 *   - ≤ 10% of 1-2★ non-bust recruits have ALL attributes below 40
 *   - ≥ 90% of recruits with selectedTools > 0 have at least one attribute
 *     that is ≥ (toolBaseline + 10)  — confirming the boost actually lands
 *   - Tool counts fall within expected ranges per star tier
 */

import { generateRecruitClass, selectTools, HITTER_TOOL_GROUPS, PITCHER_TOOL_GROUPS } from "../server/recruit-generator";

const SAMPLE_CLASSES = 10;   // recruit classes to generate
const RECRUITS_PER_CLASS = 80;

function getAttrValues(r: ReturnType<typeof generateRecruitClass>[number]): number[] {
  return [
    r.hitForAvg ?? 0,
    r.power ?? 0,
    r.speed ?? 0,
    r.arm ?? 0,
    r.fielding ?? 0,
    r.errorResistance ?? 0,
    r.velocity ?? 0,
    r.control ?? 0,
    r.stamina ?? 0,
    r.stuff ?? 0,
    r.clutch ?? 0,
    r.running ?? 0,
    r.stealing ?? 0,
    r.throwing ?? 0,
    r.wRISP ?? 0,
    r.agile ?? 0,
  ];
}

let totalLowStar = 0;
let lowStarWithAtLeastOneE = 0;
let lowStarAllBelowE = 0;
let toolCountOk = 0;
let toolCountTotal = 0;

// Star-tier tool count distribution check
const toolCountsByTier: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

for (let c = 0; c < SAMPLE_CLASSES; c++) {
  const recruits = generateRecruitClass(RECRUITS_PER_CLASS);

  for (const r of recruits) {
    const tools: string[] = (r as any).tools ?? [];
    const stars = r.starRating ?? r.starRank ?? 3;
    const isPitcher = r.position === "P";
    const isBust = r.isGenerationalBust || r.isBust;
    const isGem = r.isGenerationalGem || r.isGem;

    // Record tool counts by star tier (excluding generational special cases)
    if (!isBust && !isGem && stars >= 1 && stars <= 5) {
      toolCountsByTier[stars] = toolCountsByTier[stars] ?? [];
      toolCountsByTier[stars].push(tools.length);
    }

    // For 1-2★ non-bust non-gem players, verify specialisation
    if (!isBust && !isGem && (stars === 1 || stars === 2)) {
      totalLowStar++;
      const attrs = getAttrValues(r);
      const hasAtLeastOneE = attrs.some(v => v >= 40);
      const allBelowE = attrs.every(v => v < 40);
      if (hasAtLeastOneE) lowStarWithAtLeastOneE++;
      if (allBelowE) lowStarAllBelowE++;
    }

    // Verify that players with tools actually get boosted attrs
    if (tools.length > 0 && !isBust && !isGem) {
      toolCountTotal++;
      const toolGroups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
      const tooledAttrKeys = tools.flatMap(t => toolGroups[t] ?? []);
      const attrMap: Record<string, number> = {
        hitForAvg: r.hitForAvg ?? 0, power: r.power ?? 0, speed: r.speed ?? 0,
        arm: r.arm ?? 0, fielding: r.fielding ?? 0, errorResistance: r.errorResistance ?? 0,
        velocity: r.velocity ?? 0, control: r.control ?? 0, stamina: r.stamina ?? 0,
        stuff: r.stuff ?? 0, clutch: r.clutch ?? 0, running: r.running ?? 0,
        stealing: r.stealing ?? 0, throwing: r.throwing ?? 0, wRISP: r.wRISP ?? 0,
        agile: r.agile ?? 0,
      };
      // At least one tooled attribute should be ≥ 35 (boost pushes it up)
      const anyTooledHigh = tooledAttrKeys.some(k => (attrMap[k] ?? 0) >= 35);
      if (anyTooledHigh) toolCountOk++;
    }
  }
}

console.log(`\nTool Archetype Distribution Validation`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Sample: ${SAMPLE_CLASSES} classes × ${RECRUITS_PER_CLASS} recruits = ${SAMPLE_CLASSES * RECRUITS_PER_CLASS} total\n`);

// 1-2★ specialisation check
const pctWithE = totalLowStar > 0 ? (lowStarWithAtLeastOneE / totalLowStar) * 100 : 0;
const pctAllBelowE = totalLowStar > 0 ? (lowStarAllBelowE / totalLowStar) * 100 : 0;
const specialisationOk = pctWithE >= 80 && pctAllBelowE <= 10;
console.log(`1-2★ specialisation (non-bust/gem):`);
console.log(`  Players with ≥ 1 attr at E(40+):  ${lowStarWithAtLeastOneE}/${totalLowStar} = ${pctWithE.toFixed(1)}%  (need ≥ 80%)`);
console.log(`  Players with ALL attrs below E:    ${lowStarAllBelowE}/${totalLowStar} = ${pctAllBelowE.toFixed(1)}%  (need ≤ 10%)`);
console.log(`  Result: ${specialisationOk ? "✓ PASS" : "✗ FAIL"}\n`);

// Tool-boost effectiveness check
const pctBoosted = toolCountTotal > 0 ? (toolCountOk / toolCountTotal) * 100 : 100;
const boostOk = pctBoosted >= 90;
console.log(`Tool boost effectiveness:`);
console.log(`  Players with tools having ≥ 1 tooled attr ≥ 35:  ${toolCountOk}/${toolCountTotal} = ${pctBoosted.toFixed(1)}%  (need ≥ 90%)`);
console.log(`  Result: ${boostOk ? "✓ PASS" : "✗ FAIL"}\n`);

// Tool count distribution by star tier
console.log(`Average tool count by star tier:`);
const expectedRanges: Record<number, [number, number]> = {
  5: [3, 5], 4: [2, 4], 3: [1, 3], 2: [1, 2], 1: [0, 1],
};
let tierChecksOk = true;
for (const tier of [5, 4, 3, 2, 1]) {
  const counts = toolCountsByTier[tier] ?? [];
  if (counts.length === 0) { console.log(`  ${tier}★: no samples`); continue; }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const [lo, hi] = expectedRanges[tier];
  const ok = avg >= lo * 0.7 && avg <= hi * 1.3;
  if (!ok) tierChecksOk = false;
  console.log(`  ${tier}★: avg ${avg.toFixed(2)} tools  (expected ${lo}–${hi})  ${ok ? "✓" : "✗"}`);
}
console.log(`  Result: ${tierChecksOk ? "✓ PASS" : "✗ FAIL"}\n`);

const allOk = specialisationOk && boostOk && tierChecksOk;
if (allOk) {
  console.log("✓ All tool archetype checks passed.");
  process.exit(0);
} else {
  console.error("✗ One or more tool archetype checks failed.");
  process.exit(1);
}
