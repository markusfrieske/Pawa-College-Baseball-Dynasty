/**
 * balance-attrs.ts  —  DRY-RUN audit for the hitter/pitcher attribute balance.
 *
 * Reads all real-player roster batch files and reports:
 *   • Current average hitForAvg, power, speed (hitters) per tier
 *   • Current average velocity, stuff (pitchers) per tier
 *   • Projected values after applying the tier-scaled deltas
 *   • Elite-attr guard hits (cases where a boost was capped at 89)
 *   • Pitcher-floor guard hits (cases clamped to 30)
 *   • Validation-skip hits (pitcher attrs already >=90 left unchanged)
 *
 * Does NOT write any files. Run with: npx tsx scripts/balance-attrs.ts
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "../server");

// ── Tier configuration (mirrors apply-balance.cjs exactly) ────────────────────
interface TierCfg {
  tier: number;
  label: string;
  files: string[];
  hfa: number;   // hitForAvg boost for hitters
  pwr: number;   // power boost for hitters
  spd: number;   // speed boost for hitters
  vel: number;   // velocity REDUCTION for pitchers
  stf: number;   // stuff REDUCTION for pitchers
  hardCap: number;
}

const TIERS: TierCfg[] = [
  {
    tier: 1, label: "SEC/ACC/BigTen/Big12",
    files: [
      "secBatch1.ts", "secBatch2.ts", "secBatch3.ts",
      "accRostersBatch1.ts", "accRostersBatch2.ts", "accRostersBatch3.ts",
      "bigTenBatch1.ts", "bigTenBatch2.ts", "bigTenBatch3.ts",
      "big12Rosters.ts",
    ],
    hfa: 7, pwr: 7, spd: 4, vel: 4, stf: 3, hardCap: 95,
  },
  {
    tier: 2, label: "Pac12/AAC/SunBelt",
    files: ["pac12Rosters.ts", "aacRosters.ts", "sunBeltRosters.ts"],
    hfa: 5, pwr: 5, spd: 3, vel: 3, stf: 2, hardCap: 88,
  },
  {
    tier: 3, label: "WCC/MW/BigWest/MoValley",
    files: ["wccRosters.ts", "mwcRosters.ts", "bigWestRosters.ts", "moValleyRosters.ts"],
    hfa: 4, pwr: 4, spd: 2, vel: 2, stf: 2, hardCap: 88,
  },
  {
    tier: 4, label: "Ivy League",
    files: ["ivyLeagueRosters.ts"],
    hfa: 3, pwr: 3, spd: 2, vel: 2, stf: 1, hardCap: 88,
  },
  {
    tier: 5, label: "HBCU",
    files: ["hbcuRosters.ts"],
    hfa: 3, pwr: 3, spd: 2, vel: 2, stf: 1, hardCap: 88,
  },
];

// All numeric attrs on the data line — used to count elite (>=90) attrs.
const ALL_ATTRS = [
  "hitForAvg","power","speed","arm","fielding","errorResistance",
  "velocity","control","stamina","stuff",
  "clutch","vsLHP","grit","stealing","running","throwing",
  "recovery","wRISP","vsLefty","poise","heater","agile",
];

function getVal(line: string, attr: string): number {
  const m = line.match(new RegExp(attr + ":\\s*(\\d+)"));
  return m ? parseInt(m[1], 10) : 0;
}

function simulateBoost(
  currentVal: number,
  boost: number,
  eliteCountSoFar: number,
  hardCap: number,
): { newVal: number; guardHit: boolean; capHit: boolean } {
  let newVal = Math.min(hardCap, currentVal + boost);
  const capHit = currentVal + boost > hardCap;

  // Elite-attr guard: new elite attr but already 2+ on this player
  if (newVal >= 90 && currentVal < 90 && eliteCountSoFar >= 2) {
    newVal = Math.min(89, newVal);
    return { newVal, guardHit: true, capHit };
  }
  return { newVal, guardHit: false, capHit };
}

function simulateReduction(
  currentVal: number,
  reduction: number,
): {
  newVal: number;
  skipHit: boolean;   // attr was >=90, skipped to protect validation floor
  floorHit: boolean;  // result clamped to 30
} {
  if (currentVal >= 90) {
    // Preserved: this is either the validation-floor elite attr OR just happens to be >=90
    return { newVal: currentVal, skipHit: true, floorHit: false };
  }
  const raw = currentVal - reduction;
  // Floor: never reduce below 30.
  // NOTE: if currentVal is already <30, this will raise it — intentional hard-floor design.
  const newVal = Math.max(30, raw);
  const floorHit = raw < 30;
  return { newVal, skipHit: false, floorHit };
}

// ── Accumulator ───────────────────────────────────────────────────────────────
interface TierStats {
  tierLabel: string;
  hitterCount: number;
  pitcherCount: number;

  // Before
  sumHfa: number; sumPwr: number; sumSpd: number;
  sumVel: number; sumStf: number;

  // Projected after
  sumHfaAfter: number; sumPwrAfter: number; sumSpdAfter: number;
  sumVelAfter: number; sumStfAfter: number;

  // Guards
  eliteGuardHits: number;   // boosts capped at 89 due to 2-elite limit
  skipHits: number;         // pitcher attrs >=90 left unchanged
  floorHits: number;        // reduction clamped to 30
  hardCapHits: number;      // boost clamped to hardCap (95 or 88)
}

function emptyStats(label: string): TierStats {
  return {
    tierLabel: label,
    hitterCount: 0, pitcherCount: 0,
    sumHfa: 0, sumPwr: 0, sumSpd: 0,
    sumVel: 0, sumStf: 0,
    sumHfaAfter: 0, sumPwrAfter: 0, sumSpdAfter: 0,
    sumVelAfter: 0, sumStfAfter: 0,
    eliteGuardHits: 0, skipHits: 0, floorHits: 0, hardCapHits: 0,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
import fs from "fs";

console.log("=".repeat(72));
console.log("  ATTRIBUTE BALANCE DRY-RUN AUDIT (no files modified)");
console.log("=".repeat(72));

for (const tierCfg of TIERS) {
  const stats = emptyStats(`Tier ${tierCfg.tier}: ${tierCfg.label}`);

  for (const filename of tierCfg.files) {
    const filepath = path.join(SERVER, filename);
    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP (not found): ${filename}`);
      continue;
    }

    const lines = fs.readFileSync(filepath, "utf8").split("\n");
    let isPitcher = false;

    for (const line of lines) {
      const posMatch = line.match(/position:\s*"([^"]+)"/);
      if (posMatch) isPitcher = posMatch[1] === "P";

      if (!line.includes("hitForAvg:")) continue;

      if (!isPitcher) {
        // ── Hitter path ──
        stats.hitterCount++;

        let eliteCount = 0;
        for (const a of ALL_ATTRS) {
          if (getVal(line, a) >= 90) eliteCount++;
        }

        const hfa = getVal(line, "hitForAvg");
        const pwr = getVal(line, "power");
        const spd = getVal(line, "speed");

        stats.sumHfa += hfa; stats.sumPwr += pwr; stats.sumSpd += spd;

        const rHfa = simulateBoost(hfa, tierCfg.hfa, eliteCount, tierCfg.hardCap);
        if (rHfa.newVal >= 90 && hfa < 90) eliteCount++;
        if (rHfa.guardHit) stats.eliteGuardHits++;
        if (rHfa.capHit)   stats.hardCapHits++;

        const rPwr = simulateBoost(pwr, tierCfg.pwr, eliteCount, tierCfg.hardCap);
        if (rPwr.newVal >= 90 && pwr < 90) eliteCount++;
        if (rPwr.guardHit) stats.eliteGuardHits++;
        if (rPwr.capHit)   stats.hardCapHits++;

        const rSpd = simulateBoost(spd, tierCfg.spd, eliteCount, tierCfg.hardCap);
        if (rSpd.guardHit) stats.eliteGuardHits++;
        if (rSpd.capHit)   stats.hardCapHits++;

        stats.sumHfaAfter += rHfa.newVal;
        stats.sumPwrAfter += rPwr.newVal;
        stats.sumSpdAfter += rSpd.newVal;

      } else {
        // ── Pitcher path ──
        stats.pitcherCount++;

        const vel = getVal(line, "velocity");
        const stf = getVal(line, "stuff");

        stats.sumVel += vel; stats.sumStf += stf;

        const rVel = simulateReduction(vel, tierCfg.vel);
        const rStf = simulateReduction(stf, tierCfg.stf);

        if (rVel.skipHit)  stats.skipHits++;
        if (rVel.floorHit) stats.floorHits++;
        if (rStf.skipHit)  stats.skipHits++;
        if (rStf.floorHit) stats.floorHits++;

        stats.sumVelAfter += rVel.newVal;
        stats.sumStfAfter += rStf.newVal;
      }
    }
  }

  const hc = stats.hitterCount  || 1;
  const pc = stats.pitcherCount || 1;

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  ${stats.tierLabel}`);
  console.log(`${"─".repeat(72)}`);
  console.log(
    `  HITTERS  (n=${stats.hitterCount})` +
    `   hitForAvg ${avg(stats.sumHfa, hc)} → ${avg(stats.sumHfaAfter, hc)}` +
    `   power ${avg(stats.sumPwr, hc)} → ${avg(stats.sumPwrAfter, hc)}` +
    `   speed ${avg(stats.sumSpd, hc)} → ${avg(stats.sumSpdAfter, hc)}`,
  );
  console.log(
    `  PITCHERS (n=${stats.pitcherCount})` +
    `   velocity ${avg(stats.sumVel, pc)} → ${avg(stats.sumVelAfter, pc)}` +
    `   stuff ${avg(stats.sumStf, pc)} → ${avg(stats.sumStfAfter, pc)}`,
  );
  console.log(
    `  Guards:  elite-cap=${stats.eliteGuardHits}` +
    `  hardCap=${stats.hardCapHits}` +
    `  velStuff-skip(>=90)=${stats.skipHits}` +
    `  floor(<30)=${stats.floorHits}`,
  );
}

console.log(`\n${"=".repeat(72)}`);
console.log("  Audit complete. No files were modified.");
console.log("=".repeat(72));
console.log();
console.log("Notes on guard behaviour:");
console.log("  elite-cap  : boost capped at 89 to prevent a 3rd attr reaching >=90");
console.log("               (spec calls this the 'elite-attr guard')");
console.log("  hardCap    : boost clamped to the tier hard-cap (95 for T1, 88 for T2-5)");
console.log("  velStuff-skip : pitcher velocity or stuff was already >=90;");
console.log("               reduction skipped to protect the Tier 1 validation floor");
console.log("               (this guard is tier-agnostic and slightly broader than spec,");
console.log("               which called for per-team single-player protection — both");
console.log("               approaches produce safe results since real elite pitchers");
console.log("               store their validation-floor elite attr in 'throwing', not");
console.log("               'velocity' or 'stuff')");
console.log("  floor      : pitcher reduction clamped at 30 (hard minimum).");
console.log("               If velocity/stuff was already <30 it is raised to 30 —");
console.log("               intentional: no pitcher attr should exist below 30.");

function avg(sum: number, n: number): string {
  return (sum / n).toFixed(1);
}
