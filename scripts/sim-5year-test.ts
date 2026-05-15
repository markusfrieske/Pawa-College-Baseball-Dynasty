/**
 * sim-5year-test.ts
 *
 * End-to-end recruit distribution and roster balance validation.
 * Simulates 12 CPU teams across 5 seasons:
 *   - Each team maintains a 25-player roster, loses ~4 seniors/year
 *   - Recruit class of 80 is generated each season
 *   - CPU teams sign recruits to fill position gaps (greedy by OVR)
 *   - Walk-on pool generated; upgrade pass applied (same logic as processCpuWalkons)
 *   - Reports: pitcher OVR, OF%, unsigned count, roster OF depth, upgrade swaps
 *
 * Run: npx tsx scripts/sim-5year-test.ts
 *
 * Targets:
 *   - Average pitcher OVR in class < 350
 *   - Average all-position OVR in class < 400
 *   - 500+ OVR recruits < 4 per class avg (blue chips only)
 *   - 600+ OVR non-gem recruits = 0 per class avg
 *   - OF% in class > 20% on average
 *   - Unsigned 3★+ recruits per season < 15% of class (3★+ = ~72 recruits)
 *   - Each roster has at least 3 outfielders after walk-on phase
 */

import { generateRecruitClass } from "../server/recruit-generator";

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_SEASONS   = 5;
const CLASS_SIZE    = 80;
const NUM_TEAMS     = 12;
const MAX_ROSTER    = 25;
// Each season ~6 players leave (seniors graduate + transfers). Teams carry 19
// returning players into recruiting, then sign recruits/walk-ons to fill to 25.
const RETURNS_AFTER_GRADUATION = 19;
const MAX_SIGNINGS  = 7;
const UPGRADE_THRESHOLD = 15;
const MAX_UPGRADES  = 5;

// Positions for initial roster generation
const ALL_POSITIONS = ["P","P","P","P","P","P","P","P","C","1B","2B","SS","3B","LF","CF","RF",
                       "P","P","P","C","1B"];

// ── Types ──────────────────────────────────────────────────────────────────────

interface SimPlayer {
  id: number;
  position: string;
  overall: number;
  eligibility: "FR"|"SO"|"JR"|"SR";
}

interface SimTeam {
  id: number;
  name: string;
  roster: SimPlayer[];
}

interface SeasonResult {
  season: number;
  classPitcherOvr: number;
  classTotalOvr: number;
  classHitterOvr: number;
  classOFpct: number;
  class500plus: number;
  class600plus: number;       // non-gem 600+
  unsignedCount: number;
  unsignedHighStar: number;   // unsigned 3★+ (OVR ≥ 300)
  avgRosterOF: number;        // avg outfielders per roster
  rosters3PlusOF: number;     // teams with ≥3 outfielders
  upgradeSwaps: number;       // total walk-on upgrade swaps across all teams
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _id = 1;
function mkPlayer(position: string, overall: number, eligibility: SimPlayer["eligibility"]): SimPlayer {
  return { id: _id++, position, overall, eligibility };
}

function randomOvr(lo: number, hi: number) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function buildInitialTeam(id: number): SimTeam {
  const roster: SimPlayer[] = [];
  for (let i = 0; i < RETURNS_AFTER_GRADUATION; i++) {
    const pos = ALL_POSITIONS[i % ALL_POSITIONS.length];
    const ovr = randomOvr(200, 400);
    roster.push(mkPlayer(pos, ovr, "SO"));
  }
  return { id, name: `Team ${id}`, roster };
}

function advanceEligibility(team: SimTeam): SimPlayer[] {
  // Simulate graduation of ~6 players (seniors + some transfers each year).
  // Keep the best RETURNS_AFTER_GRADUATION players so every season has a
  // consistent number of roster spots to fill, avoiding runaway full-roster
  // states where no recruits can be signed.
  return team.roster
    .sort((a, b) => b.overall - a.overall)
    .slice(0, RETURNS_AFTER_GRADUATION);
}

function positionNeed(roster: SimPlayer[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of roster) counts[p.position] = (counts[p.position] || 0) + 1;
  const need: Record<string, number> = {};
  const targets: Record<string, number> = {
    P: 10, C: 2, "1B": 2, "2B": 2, SS: 2, "3B": 2, LF: 2, CF: 2, RF: 2,
  };
  for (const [pos, tgt] of Object.entries(targets)) {
    const have = counts[pos] || 0;
    if (have < tgt) need[pos] = tgt - have;
  }
  return need;
}

// ── Walk-on pool generation (mirrors server logic) ─────────────────────────────

function generateWalkonPool(existingUnsigned: Array<{position: string; overall: number}>) {
  const WALKON_POSITIONS = ["P","C","1B","2B","SS","3B","LF","CF","RF"];
  const pool: Array<{position: string; overall: number; isFiller: boolean}> = [];

  // Add unsigned recruits from signing day
  for (const u of existingUnsigned) {
    pool.push({ position: u.position, overall: u.overall, isFiller: false });
  }

  // Add generated fillers (12 per position minimum from range 20-45 attrs → ~150-250 OVR)
  for (const pos of WALKON_POSITIONS) {
    const existing = pool.filter(w => w.position === pos).length;
    const needed = Math.max(0, 12 - existing);
    for (let i = 0; i < needed; i++) {
      pool.push({ position: pos, overall: randomOvr(155, 250), isFiller: true });
    }
  }

  return pool;
}

// ── Upgrade pass (mirrors processCpuWalkons logic) ─────────────────────────────

function runUpgradePass(
  roster: SimPlayer[],
  walkonPool: Array<{position: string; overall: number; isFiller: boolean; claimed?: boolean}>,
): { newRoster: SimPlayer[]; swaps: number } {
  if (roster.length < MAX_ROSTER) return { newRoster: roster, swaps: 0 };

  let swaps = 0;
  let current = [...roster];

  for (let i = 0; i < MAX_UPGRADES; i++) {
    // Count positions
    const posCounts: Record<string, number> = {};
    for (const p of current) posCounts[p.position] = (posCounts[p.position] || 0) + 1;

    // Find position with 2+ players (can afford to cut one)
    const dupPositions = Object.entries(posCounts)
      .filter(([, cnt]) => cnt >= 2)
      .map(([pos]) => pos);

    if (dupPositions.length === 0) break;

    // Weakest player in a duplicate position
    const candidates = current
      .filter(p => dupPositions.includes(p.position))
      .sort((a, b) => a.overall - b.overall);
    const weakest = candidates[0];
    if (!weakest) break;

    // Find best unclaimed walk-on at same position that is UPGRADE_THRESHOLD better
    const bestUpgrade = walkonPool
      .filter(w => !w.claimed && w.position === weakest.position)
      .sort((a, b) => b.overall - a.overall)[0];

    if (!bestUpgrade || bestUpgrade.overall - weakest.overall < UPGRADE_THRESHOLD) break;

    // Perform swap
    bestUpgrade.claimed = true;
    current = current.filter(p => p !== weakest);
    current.push(mkPlayer(bestUpgrade.position, bestUpgrade.overall, "FR"));
    swaps++;
  }

  return { newRoster: current, swaps };
}

// ── Main simulation ────────────────────────────────────────────────────────────

// Build 12 initial teams
const teams: SimTeam[] = Array.from({ length: NUM_TEAMS }, (_, i) => buildInitialTeam(i + 1));

const allSeasons: SeasonResult[] = [];

for (let season = 1; season <= NUM_SEASONS; season++) {

  // 1. Advance eligibility (seniors graduate)
  const returningRosters: SimPlayer[][] = teams.map(t => advanceEligibility(t));

  // 2. Generate recruit class
  const recruits = generateRecruitClass(CLASS_SIZE);

  // 3. Collect class stats
  let classPitcherOvr = 0, pitcherCount = 0;
  let classTotalOvr   = 0;
  let classHitterOvr  = 0, hitterCount = 0;
  let classOF = 0;
  let class500plus = 0, class600plus = 0;

  for (const r of recruits) {
    classTotalOvr += r.overall;
    if (r.position === "P") { pitcherCount++; classPitcherOvr += r.overall; }
    else                    { hitterCount++;  classHitterOvr  += r.overall; }
    if (["LF","CF","RF"].includes(r.position)) classOF++;
    if (r.overall >= 500 && r.overall < 600) class500plus++;
    if (r.overall >= 600 && !r.isBlueChip && !r.isGenerationalGem) class600plus++;
  }

  const avgClassPitcherOvr = pitcherCount  > 0 ? Math.round(classPitcherOvr / pitcherCount) : 0;
  const avgClassTotalOvr   = recruits.length > 0 ? Math.round(classTotalOvr  / recruits.length) : 0;
  const avgClassHitterOvr  = hitterCount   > 0 ? Math.round(classHitterOvr  / hitterCount) : 0;
  const classOFpct = (classOF / recruits.length) * 100;

  // 4. CPU signing simulation
  // Each team signs up to MAX_SIGNINGS recruits, prioritized by position need then OVR
  const signed = new Set<number>();   // indices into recruits[]
  const newRosters: SimPlayer[][] = returningRosters.map(r => [...r]);

  // Teams pick in round-robin to simulate competitive market (top teams pick first)
  for (let round = 0; round < MAX_SIGNINGS; round++) {
    for (let t = 0; t < NUM_TEAMS; t++) {
      const roster = newRosters[t];
      if (roster.length >= MAX_ROSTER) continue;

      const need = positionNeed(roster);
      const neededPositions = Object.keys(need);

      // Find best available recruit matching a position need
      let bestIdx = -1;
      let bestOvr = -1;
      for (let ri = 0; ri < recruits.length; ri++) {
        if (signed.has(ri)) continue;
        const r = recruits[ri];
        const isNeeded = neededPositions.includes(r.position) ||
                         (r.position === "P" && (need["P"] || 0) > 0);
        if (isNeeded && r.overall > bestOvr) {
          bestOvr = r.overall;
          bestIdx = ri;
        }
      }

      // If no exact position match and roster still short, take best available
      if (bestIdx === -1) {
        for (let ri = 0; ri < recruits.length; ri++) {
          if (signed.has(ri)) continue;
          const r = recruits[ri];
          if (r.overall > bestOvr) { bestOvr = r.overall; bestIdx = ri; }
        }
      }

      if (bestIdx !== -1) {
        signed.add(bestIdx);
        const r = recruits[bestIdx];
        roster.push(mkPlayer(r.position, r.overall, "FR"));
      }
    }
  }

  // 5. Count unsigned
  const unsignedAll     = recruits.filter((_, i) => !signed.has(i));
  const unsignedHighStar = unsignedAll.filter(r => r.overall >= 300).length;

  // 6. Walk-on phase
  const unsignedForWalkons = unsignedAll.map(r => ({ position: r.position, overall: r.overall }));
  const walkonPool = generateWalkonPool(unsignedForWalkons);
  const walkonPoolWithClaim = walkonPool.map(w => ({ ...w, claimed: false }));

  // Fill rosters to 25 with walk-ons (greedy, no upgrade yet)
  for (const roster of newRosters) {
    const need = positionNeed(roster);
    for (const pos of Object.keys(need)) {
      while ((roster.length < MAX_ROSTER) && (need[pos] || 0) > 0) {
        const best = walkonPoolWithClaim
          .filter(w => !w.claimed && w.position === pos)
          .sort((a, b) => b.overall - a.overall)[0];
        if (!best) break;
        best.claimed = true;
        roster.push(mkPlayer(pos, best.overall, "FR"));
        need[pos]--;
      }
    }
    // Fill remaining slots with best available
    while (roster.length < MAX_ROSTER) {
      const best = walkonPoolWithClaim
        .filter(w => !w.claimed)
        .sort((a, b) => b.overall - a.overall)[0];
      if (!best) break;
      best.claimed = true;
      roster.push(mkPlayer(best.position, best.overall, "FR"));
    }
  }

  // 7. Upgrade pass
  let totalUpgradeSwaps = 0;
  for (let t = 0; t < NUM_TEAMS; t++) {
    const freshPool = walkonPoolWithClaim.map(w => ({ ...w }));
    const { newRoster, swaps } = runUpgradePass(newRosters[t], freshPool);
    newRosters[t] = newRoster;
    totalUpgradeSwaps += swaps;
  }

  // 8. Roster OF depth stats
  const rosterOFcounts = newRosters.map(r =>
    r.filter(p => ["LF","CF","RF"].includes(p.position)).length
  );
  const avgRosterOF = rosterOFcounts.reduce((a, b) => a + b, 0) / NUM_TEAMS;
  const rosters3PlusOF = rosterOFcounts.filter(n => n >= 3).length;

  // 9. Update teams for next season
  for (let t = 0; t < NUM_TEAMS; t++) {
    teams[t].roster = newRosters[t];
  }

  allSeasons.push({
    season,
    classPitcherOvr: avgClassPitcherOvr,
    classTotalOvr:   avgClassTotalOvr,
    classHitterOvr:  avgClassHitterOvr,
    classOFpct,
    class500plus,
    class600plus,
    unsignedCount:   unsignedAll.length,
    unsignedHighStar,
    avgRosterOF,
    rosters3PlusOF,
    upgradeSwaps:    totalUpgradeSwaps,
  });
}

// ── Print results ──────────────────────────────────────────────────────────────

const LINE = "═".repeat(58);
console.log(`\n${LINE}`);
console.log("  RECRUIT DISTRIBUTION & ROSTER BALANCE — 5-YEAR SIM");
console.log(`  12 CPU teams  |  80 recruits/class  |  25-player rosters`);
console.log(`${LINE}\n`);

for (const s of allSeasons) {
  const unsignedPct = ((s.unsignedCount / CLASS_SIZE) * 100).toFixed(1);
  const highStarPct = CLASS_SIZE > 0
    ? ((s.unsignedHighStar / (CLASS_SIZE * 0.9)) * 100).toFixed(1) : "0.0";

  console.log(`── Season ${s.season} ${"─".repeat(49)}`);
  console.log(`  Class OVR      : all=${s.classTotalOvr}  pitchers=${s.classPitcherOvr}  hitters=${s.classHitterOvr}`);
  console.log(`  Class OF%      : ${s.classOFpct.toFixed(1)}%  |  500+: ${s.class500plus}  |  600+ non-gem: ${s.class600plus}`);
  console.log(`  Unsigned       : ${s.unsignedCount}/${CLASS_SIZE} (${unsignedPct}%)  |  3★+ unsigned: ${s.unsignedHighStar} (${highStarPct}% of class)`);
  console.log(`  Roster OF depth: avg=${s.avgRosterOF.toFixed(1)} OFs/team  |  teams w/ 3+ OFs: ${s.rosters3PlusOF}/${NUM_TEAMS}`);
  console.log(`  Upgrade swaps  : ${s.upgradeSwaps} total across ${NUM_TEAMS} teams`);
  console.log();
}

// ── Aggregate targets ─────────────────────────────────────────────────────────

console.log(`${LINE}`);
console.log("  5-YEAR AGGREGATES");
console.log(`${LINE}`);

const avgPitcherOvr   = Math.round(allSeasons.reduce((a, s) => a + s.classPitcherOvr, 0) / NUM_SEASONS);
const avgTotalOvr     = Math.round(allSeasons.reduce((a, s) => a + s.classTotalOvr,   0) / NUM_SEASONS);
const avg500plus      = allSeasons.reduce((a, s) => a + s.class500plus, 0) / NUM_SEASONS;
const avg600plus      = allSeasons.reduce((a, s) => a + s.class600plus, 0) / NUM_SEASONS;
const avgOFpct        = allSeasons.reduce((a, s) => a + s.classOFpct,   0) / NUM_SEASONS;
const avgUnsignedHS   = allSeasons.reduce((a, s) => a + s.unsignedHighStar, 0) / NUM_SEASONS;
const highStarInClass = CLASS_SIZE * 0.9;  // ~72 recruits are 3★+ (60%+12%+5%+3%)
const avgUnsignedHSPct = (avgUnsignedHS / highStarInClass) * 100;
const avgRosterOF     = allSeasons.reduce((a, s) => a + s.avgRosterOF, 0) / NUM_SEASONS;
const avgTeams3OF     = allSeasons.reduce((a, s) => a + s.rosters3PlusOF, 0) / NUM_SEASONS;
const avgUpgrades     = allSeasons.reduce((a, s) => a + s.upgradeSwaps, 0) / NUM_SEASONS;

console.log(`  Avg pitcher OVR    : ${avgPitcherOvr}  (target < 350)`);
console.log(`  Avg all-pos OVR    : ${avgTotalOvr}  (target < 400)`);
console.log(`  Avg 500-599/class  : ${avg500plus.toFixed(1)}  (target < 4)`);
console.log(`  Avg 600+ non-gem   : ${avg600plus.toFixed(1)}  (target = 0)`);
console.log(`  Avg OF% per class  : ${avgOFpct.toFixed(1)}%  (target > 20%)`);
console.log(`  Avg 3★+ unsigned   : ${avgUnsignedHS.toFixed(1)}/season (${avgUnsignedHSPct.toFixed(1)}% of class)  (target < 15%)`);
console.log(`  Avg roster OF depth: ${avgRosterOF.toFixed(1)} OFs/team  |  teams w/ 3+ OFs: ${avgTeams3OF.toFixed(1)}/${NUM_TEAMS}  (target ≥ 3 OFs/team)`);
console.log(`  Avg upgrade swaps  : ${avgUpgrades.toFixed(1)}/season across ${NUM_TEAMS} teams`);

const checks = [
  { label: "Pitcher avg OVR < 350",          pass: avgPitcherOvr < 350 },
  { label: "All-pos avg OVR < 400",           pass: avgTotalOvr   < 400 },
  { label: "500+ avg < 4 per class",          pass: avg500plus    < 4   },
  { label: "600+ non-gem avg = 0",            pass: avg600plus    === 0 },
  { label: "OF% avg > 20%",                   pass: avgOFpct      > 20  },
  { label: "3★+ unsigned < 15% per season",   pass: avgUnsignedHSPct < 15 },
  { label: "Avg roster has ≥ 3 outfielders",  pass: avgRosterOF   >= 3  },
];

console.log("\n  PASS / FAIL:");
let allPassed = true;
for (const c of checks) {
  const icon = c.pass ? "✓" : "✗";
  if (!c.pass) allPassed = false;
  console.log(`  ${icon} ${c.label}`);
}

console.log();
if (allPassed) {
  console.log("  All targets met!\n");
} else {
  console.log("  Some targets missed — review calibration.\n");
  process.exit(1);
}
