/**
 * sim-5year-test.ts
 *
 * Validates recruit generation distribution targets by simulating 5 years
 * of recruit classes (5 × 80 recruits) and printing aggregate stats.
 *
 * Run: npx tsx scripts/sim-5year-test.ts
 *
 * Targets:
 *   - Average pitcher OVR across all classes < 350
 *   - Average all-position OVR < 400
 *   - Recruits 500+ OVR: < 4 per class on average (blue chips only)
 *   - Recruits 600+ OVR: 0 among regular/blue-chip recruits (generational gems only)
 *   - LF+CF+RF combined > 20% of all recruits per class
 */

import { generateRecruitClass } from "../server/recruit-generator";

const NUM_SEASONS = 5;
const CLASS_SIZE = 80;

interface ClassStats {
  season: number;
  total: number;
  pitchers: number;
  totalOvr: number;
  pitcherOvr: number;
  hitterOvr: number;
  band300_399: number;
  band400_499: number;
  band500_599: number;
  band600plus: number;
  byPos: Record<string, number>;
  blueChips: number;
  gems: number;
  busts: number;
  genGems: number;
  genBusts: number;
}

const allStats: ClassStats[] = [];

for (let s = 1; s <= NUM_SEASONS; s++) {
  const recruits = generateRecruitClass(CLASS_SIZE);

  let pitcherCount = 0;
  let pitcherOvrSum = 0;
  let hitterOvrSum = 0;
  let hitterCount = 0;
  let band300 = 0, band400 = 0, band500 = 0, band600 = 0;
  const byPos: Record<string, number> = {};
  let blueChips = 0, gems = 0, busts = 0, genGems = 0, genBusts = 0;

  for (const r of recruits) {
    byPos[r.position] = (byPos[r.position] || 0) + 1;

    if (r.position === "P") {
      pitcherCount++;
      pitcherOvrSum += r.overall;
    } else {
      hitterCount++;
      hitterOvrSum += r.overall;
    }

    if (r.overall >= 300 && r.overall < 400) band300++;
    else if (r.overall >= 400 && r.overall < 500) band400++;
    else if (r.overall >= 500 && r.overall < 600) band500++;
    // 600+ should only be blue chips (up to 650) or generational gems (651+)
    else if (r.overall >= 600 && !r.isBlueChip && !r.isGenerationalGem) band600++;

    if (r.isBlueChip) blueChips++;
    if (r.isGem) gems++;
    if (r.isBust) busts++;
    if (r.isGenerationalGem) genGems++;
    if (r.isGenerationalBust) genBusts++;
  }

  allStats.push({
    season: s,
    total: recruits.length,
    pitchers: pitcherCount,
    totalOvr: Math.round((pitcherOvrSum + hitterOvrSum) / recruits.length),
    pitcherOvr: pitcherCount > 0 ? Math.round(pitcherOvrSum / pitcherCount) : 0,
    hitterOvr: hitterCount > 0 ? Math.round(hitterOvrSum / hitterCount) : 0,
    band300_399: band300,
    band400_499: band400,
    band500_599: band500,
    band600plus: band600,
    byPos,
    blueChips, gems, busts, genGems, genBusts,
  });
}

// ── Print results ─────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════");
console.log("  RECRUIT CLASS DISTRIBUTION — 5-YEAR SIMULATION");
console.log("═══════════════════════════════════════════════════\n");

for (const s of allStats) {
  const ofCount = (s.byPos["LF"] || 0) + (s.byPos["CF"] || 0) + (s.byPos["RF"] || 0);
  const ofPct = ((ofCount / s.total) * 100).toFixed(1);
  const pitcherPct = ((s.pitchers / s.total) * 100).toFixed(1);

  console.log(`── Season ${s.season} ──────────────────────────────────`);
  console.log(`  Total recruits : ${s.total}  |  Pitchers: ${s.pitchers} (${pitcherPct}%)`);
  console.log(`  Avg OVR (all)  : ${s.totalOvr}  |  Pitchers: ${s.pitcherOvr}  |  Hitters: ${s.hitterOvr}`);
  console.log(`  OVR bands      : 300-399=${s.band300_399}  400-499=${s.band400_499}  500-599=${s.band500_599}  600+=${s.band600plus}`);
  console.log(`  Special        : BlueChips=${s.blueChips}  Gems=${s.gems}  Busts=${s.busts}  GenGem=${s.genGems}  GenBust=${s.genBusts}`);
  console.log(`  Outfielders    : LF=${s.byPos["LF"] || 0}  CF=${s.byPos["CF"] || 0}  RF=${s.byPos["RF"] || 0}  (${ofPct}% of class)`);

  const posOrder = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const posSummary = posOrder.map(p => `${p}:${s.byPos[p] || 0}`).join("  ");
  console.log(`  Positions      : ${posSummary}`);
  console.log();
}

// ── Aggregate validation ──────────────────────────────────────────────────────
const avgPitcherOvr = Math.round(allStats.reduce((a, s) => a + s.pitcherOvr, 0) / allStats.length);
const avgTotalOvr   = Math.round(allStats.reduce((a, s) => a + s.totalOvr,   0) / allStats.length);
const avgHitterOvr  = Math.round(allStats.reduce((a, s) => a + s.hitterOvr,  0) / allStats.length);
const avg500plus    = allStats.reduce((a, s) => a + s.band500_599, 0) / allStats.length;
const avg600plus    = allStats.reduce((a, s) => a + s.band600plus, 0) / allStats.length;
const avgOFpct      = allStats.reduce((a, s) => {
  const of = (s.byPos["LF"] || 0) + (s.byPos["CF"] || 0) + (s.byPos["RF"] || 0);
  return a + (of / s.total) * 100;
}, 0) / allStats.length;

console.log("═══════════════════════════════════════════════════");
console.log("  5-YEAR AGGREGATES");
console.log("═══════════════════════════════════════════════════");
console.log(`  Avg pitcher OVR  : ${avgPitcherOvr}  (target < 350)`);
console.log(`  Avg all-pos OVR  : ${avgTotalOvr}  (target < 400)`);
console.log(`  Avg hitter OVR   : ${avgHitterOvr}`);
console.log(`  Avg 500-599/class: ${avg500plus.toFixed(1)}  (target < 4)`);
console.log(`  Avg 600+/class   : ${avg600plus.toFixed(1)}  (target: 0 non-gem)`);
console.log(`  Avg OF% per class: ${avgOFpct.toFixed(1)}%  (target > 20%)`);

const checks = [
  { label: "Pitcher avg OVR < 350",     pass: avgPitcherOvr < 350 },
  { label: "All-pos avg OVR < 400",     pass: avgTotalOvr   < 400 },
  { label: "500+ avg < 4 per class",    pass: avg500plus    < 4   },
  { label: "600+ avg = 0 non-gem",      pass: avg600plus    === 0 },
  { label: "OF% avg > 20%",            pass: avgOFpct      > 20  },
];

console.log("\n  PASS / FAIL:");
let allPassed = true;
for (const c of checks) {
  const icon = c.pass ? "✓" : "✗";
  console.log(`  ${icon} ${c.label}`);
  if (!c.pass) allPassed = false;
}
console.log();
if (allPassed) {
  console.log("  All targets met!\n");
} else {
  console.log("  Some targets missed — review band calibration.\n");
  process.exit(1);
}
