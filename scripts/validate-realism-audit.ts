/**
 * validate-realism-audit — detects statistical artifacts and realism issues
 * in the real-player roster data that other validators miss.
 *
 * Checks (warnings unless noted):
 *   1. Pitcher attribute uniformity  — vel === ctrl === stuff (copy-paste artifact)
 *   2. Freshman pitcher over-rating  — FR pitchers with vel/ctrl/stuff ≥ 90
 *   3. Hitter hit=pow exact equality — hitForAvg === power on too many hitters
 *   4. Attribute value clustering    — any single value on > 8% of relevant players (HARD FAIL)
 *   5. Ability overuse              — any ability on > 15% of all players (HARD FAIL)
 *   6. Ability underuse             — abilities in the catalogue never appearing on any roster
 *
 * Hard failures exit 1.  Warnings print but exit 0.
 */

import { ALL_REAL_ROSTERS, RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import { ALL_ABILITIES } from "../shared/abilities";

// ─── Constants ────────────────────────────────────────────────────────────────

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

/** Fraction of pitchers allowed to share the same vel=ctrl=stuff value. */
const PITCHER_UNIFORM_WARN_PCT = 5;
const PITCHER_UNIFORM_FAIL_PCT = 10;

/** Fraction of hitters allowed to share exact hit=pow equality. */
const HIT_POW_WARN_PCT = 15;
const HIT_POW_FAIL_PCT = 25;

/** Single attribute value that covers more than this % of players → hard fail. */
const ATTR_CLUSTER_WARN_PCT = 5;
const ATTR_CLUSTER_FAIL_PCT = 8;

/** Ability that appears on more than this % of ALL players → hard fail. */
const ABILITY_OVERUSE_WARN_PCT = 10;
const ABILITY_OVERUSE_FAIL_PCT = 15;

/** FR pitchers with any key pitching attr at/above this are flagged. */
const FR_PITCHER_ATTR_MAX = 90;

// ─── Collect players ──────────────────────────────────────────────────────────

// We audit the RAW (pre-scale) rosters so calibration artifacts don't hide
// underlying data problems, and the CALIBRATED rosters for OVR-level checks.
const rawPlayers = Object.entries(RAW_UNCALIBRATED_ROSTERS).flatMap(([team, ps]) =>
  ps.map(p => ({ ...p, _team: team }))
);
const calPlayers = Object.entries(ALL_REAL_ROSTERS).flatMap(([team, ps]) =>
  ps.map(p => ({ ...p, _team: team }))
);

const totalPlayers = rawPlayers.length;
const pitchers     = rawPlayers.filter(p => PITCHER_POSITIONS.has(p.position));
const hitters      = rawPlayers.filter(p => !PITCHER_POSITIONS.has(p.position));

console.log(`\n=== ROSTER REALISM AUDIT ===`);
console.log(`Raw roster: ${totalPlayers} players (${pitchers.length} pitchers, ${hitters.length} hitters)`);
console.log(`Calibrated roster: ${calPlayers.length} players\n`);

let hardFailures = 0;
const warnings: string[] = [];

// ─── Check 1: Pitcher attribute uniformity (vel = ctrl = stuff) ───────────────

console.log("─── Check 1: Pitcher vel=ctrl=stuff uniformity ───────────────────────────");

const uniformPitchers = pitchers.filter(p =>
  p.velocity > 0 && p.velocity === p.control && p.velocity === p.stuff
);
const uniformPct = (uniformPitchers.length / pitchers.length) * 100;

if (uniformPct >= PITCHER_UNIFORM_FAIL_PCT) {
  console.error(`❌ FAIL: ${uniformPitchers.length}/${pitchers.length} pitchers (${uniformPct.toFixed(1)}%) have vel=ctrl=stuff — exceeds ${PITCHER_UNIFORM_FAIL_PCT}% threshold`);
  hardFailures++;
} else if (uniformPct >= PITCHER_UNIFORM_WARN_PCT) {
  warnings.push(`⚠ ${uniformPitchers.length}/${pitchers.length} pitchers (${uniformPct.toFixed(1)}%) have vel=ctrl=stuff identical — possible copy-paste (threshold ${PITCHER_UNIFORM_WARN_PCT}%)`);
  console.warn(`⚠  ${uniformPitchers.length}/${pitchers.length} pitchers (${uniformPct.toFixed(1)}%) have vel=ctrl=stuff uniform`);
} else {
  console.log(`✅ Pitcher vel=ctrl=stuff uniformity: ${uniformPitchers.length}/${pitchers.length} (${uniformPct.toFixed(1)}%) — OK`);
}

if (uniformPitchers.length > 0) {
  const sample = uniformPitchers.slice(0, 10);
  console.log(`   Sample uniform pitchers:`);
  for (const p of sample) {
    console.log(`     [${(p as any)._team}] ${p.firstName} ${p.lastName} (${p.eligibility}) vel=ctrl=stuff=${p.velocity}`);
  }
  if (uniformPitchers.length > 10) {
    console.log(`     ... and ${uniformPitchers.length - 10} more`);
  }
}

// ─── Check 2: Freshman pitcher over-rating ────────────────────────────────────

console.log("\n─── Check 2: Freshman pitcher over-rating (vel/ctrl/stuff ≥ 90) ─────────");

const frPitchers = pitchers.filter(p => p.eligibility === "FR");
// Generational players represent once-in-a-generation phenoms — exempt from the FR cap.
const frOverRated = frPitchers.filter(p =>
  !(p as any).generational &&
  (p.velocity >= FR_PITCHER_ATTR_MAX ||
   p.control  >= FR_PITCHER_ATTR_MAX ||
   p.stuff    >= FR_PITCHER_ATTR_MAX)
);

const frGenerationalExempt = frPitchers.filter(p => (p as any).generational);
if (frGenerationalExempt.length > 0) {
  console.log(`   (${frGenerationalExempt.length} generational FR pitcher(s) exempt from cap: ${frGenerationalExempt.map(p => `${p.firstName} ${p.lastName}`).join(", ")})`);
}

if (frOverRated.length > 0) {
  console.warn(`⚠  ${frOverRated.length}/${frPitchers.length} FR pitchers have vel/ctrl/stuff ≥ ${FR_PITCHER_ATTR_MAX} (non-generational):`);
  for (const p of frOverRated) {
    console.warn(`     [${(p as any)._team}] ${p.firstName} ${p.lastName} vel=${p.velocity} ctrl=${p.control} stuff=${p.stuff}`);
  }
  warnings.push(`⚠ ${frOverRated.length} non-generational FR pitcher(s) have vel/ctrl/stuff ≥ ${FR_PITCHER_ATTR_MAX}`);
} else {
  console.log(`✅ No non-generational FR pitchers with vel/ctrl/stuff ≥ ${FR_PITCHER_ATTR_MAX}`);
}

// Check specifically for non-generational FR pitchers with all three at 99 (completely unrealistic)
const frAllMaxed = frPitchers.filter(p => !(p as any).generational && p.velocity === 99 && p.control === 99 && p.stuff === 99);
if (frAllMaxed.length > 0) {
  console.error(`❌ FAIL: ${frAllMaxed.length} non-generational FR pitcher(s) have vel=ctrl=stuff=99:`);
  for (const p of frAllMaxed) {
    console.error(`     [${(p as any)._team}] ${p.firstName} ${p.lastName}`);
  }
  hardFailures++;
}

// ─── Check 3: Hitter hit=pow exact equality ───────────────────────────────────

console.log("\n─── Check 3: Hitter hitForAvg=power exact equality ───────────────────────");

const hitPowEqual = hitters.filter(p => p.hitForAvg === p.power && p.hitForAvg > 0);
const hitPowPct   = (hitPowEqual.length / hitters.length) * 100;

if (hitPowPct >= HIT_POW_FAIL_PCT) {
  console.error(`❌ FAIL: ${hitPowEqual.length}/${hitters.length} hitters (${hitPowPct.toFixed(1)}%) have hitForAvg===power — exceeds ${HIT_POW_FAIL_PCT}% threshold (scale artifact)`);
  hardFailures++;
} else if (hitPowPct >= HIT_POW_WARN_PCT) {
  console.warn(`⚠  ${hitPowEqual.length}/${hitters.length} hitters (${hitPowPct.toFixed(1)}%) have hitForAvg===power (threshold ${HIT_POW_WARN_PCT}%)`);
  warnings.push(`⚠ ${hitPowEqual.length}/${hitters.length} hitters (${hitPowPct.toFixed(1)}%) have identical hitForAvg=power`);
} else {
  console.log(`✅ Hit=pow equality: ${hitPowEqual.length}/${hitters.length} (${hitPowPct.toFixed(1)}%) — OK`);
}

// Show common hit=pow values
const hitPowValueCounts: Record<number, number> = {};
for (const p of hitPowEqual) {
  hitPowValueCounts[p.hitForAvg] = (hitPowValueCounts[p.hitForAvg] ?? 0) + 1;
}
const topHitPow = Object.entries(hitPowValueCounts)
  .map(([v, c]) => ({ val: Number(v), count: c }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);
if (topHitPow.length > 0) {
  console.log(`   Top hit=pow shared values: ${topHitPow.map(x => `val=${x.val}(×${x.count})`).join(", ")}`);
}

// ─── Check 4: Attribute value clustering ─────────────────────────────────────

console.log("\n─── Check 4: Attribute value clustering ──────────────────────────────────");

const HITTER_CHECK_ATTRS = ["hitForAvg", "power", "speed"] as const;
const PITCHER_CHECK_ATTRS = ["velocity", "control", "stuff"] as const;

let clusterFails = 0;
let clusterWarns = 0;

function checkClustering(
  players: typeof hitters,
  attrs: readonly string[],
  label: string
) {
  for (const attr of attrs) {
    const valueCounts: Record<number, number> = {};
    let validCount = 0;
    for (const p of players) {
      const val = (p as any)[attr] as number;
      if (typeof val === "number" && val > 0) {
        valueCounts[val] = (valueCounts[val] ?? 0) + 1;
        validCount++;
      }
    }
    if (validCount === 0) continue;

    const topValues = Object.entries(valueCounts)
      .map(([v, c]) => ({ val: Number(v), count: c, pct: (c / validCount) * 100 }))
      .sort((a, b) => b.count - a.count);

    const worst = topValues[0];
    if (!worst) continue;

    if (worst.pct >= ATTR_CLUSTER_FAIL_PCT) {
      console.error(`❌ FAIL: ${label} attr "${attr}" — value ${worst.val} appears on ${worst.count}/${validCount} players (${worst.pct.toFixed(1)}%) — exceeds ${ATTR_CLUSTER_FAIL_PCT}% cluster threshold`);
      clusterFails++;
    } else if (worst.pct >= ATTR_CLUSTER_WARN_PCT) {
      console.warn(`⚠  ${label} attr "${attr}" — value ${worst.val} on ${worst.count}/${validCount} players (${worst.pct.toFixed(1)}%)`);
      clusterWarns++;
    } else {
      console.log(`✅ ${label} "${attr}" — top cluster: val=${worst.val} on ${worst.count}/${validCount} (${worst.pct.toFixed(1)}%) — OK`);
    }
  }
}

checkClustering(hitters, HITTER_CHECK_ATTRS, "Hitters");
checkClustering(pitchers, PITCHER_CHECK_ATTRS, "Pitchers");

if (clusterFails > 0) hardFailures += clusterFails;
if (clusterWarns > 0) warnings.push(`⚠ ${clusterWarns} attribute cluster(s) near the ${ATTR_CLUSTER_WARN_PCT}% threshold`);

// ─── Check 5: Ability overuse ─────────────────────────────────────────────────

console.log("\n─── Check 5: Ability usage distribution ──────────────────────────────────");

const abilityCounts: Record<string, number> = {};
const totalAbilitySlots = rawPlayers.reduce((sum, p) => sum + p.abilities.length, 0);

for (const p of rawPlayers) {
  for (const ab of p.abilities) {
    abilityCounts[ab] = (abilityCounts[ab] ?? 0) + 1;
  }
}

const sortedAbilities = Object.entries(abilityCounts)
  .map(([name, count]) => ({ name, count, pct: (count / totalPlayers) * 100 }))
  .sort((a, b) => b.count - a.count);

console.log(`   Total ability slots: ${totalAbilitySlots} across ${totalPlayers} players`);
console.log(`   Top 15 abilities by usage:`);
for (const ab of sortedAbilities.slice(0, 15)) {
  const marker = ab.pct >= ABILITY_OVERUSE_FAIL_PCT ? "❌" : ab.pct >= ABILITY_OVERUSE_WARN_PCT ? "⚠ " : "  ";
  console.log(`   ${marker} ${ab.name.padEnd(30)} ${ab.count.toString().padStart(4)} players (${ab.pct.toFixed(1)}%)`);
}

const overusedAbilities = sortedAbilities.filter(ab => ab.pct >= ABILITY_OVERUSE_FAIL_PCT);
if (overusedAbilities.length > 0) {
  console.error(`\n❌ FAIL: ${overusedAbilities.length} ability/abilities exceed ${ABILITY_OVERUSE_FAIL_PCT}% of all players:`);
  for (const ab of overusedAbilities) {
    console.error(`   "${ab.name}" — ${ab.count} players (${ab.pct.toFixed(1)}%)`);
  }
  hardFailures += overusedAbilities.length;
}

const warnAbilities = sortedAbilities.filter(ab => ab.pct >= ABILITY_OVERUSE_WARN_PCT && ab.pct < ABILITY_OVERUSE_FAIL_PCT);
if (warnAbilities.length > 0) {
  console.warn(`\n⚠  ${warnAbilities.length} ability/abilities approach overuse threshold (${ABILITY_OVERUSE_WARN_PCT}–${ABILITY_OVERUSE_FAIL_PCT}%):`);
  for (const ab of warnAbilities) {
    console.warn(`   "${ab.name}" — ${ab.count} players (${ab.pct.toFixed(1)}%)`);
  }
  warnings.push(`⚠ ${warnAbilities.length} near-overuse abilities (${ABILITY_OVERUSE_WARN_PCT}%+ threshold)`);
}

// ─── Check 6: Ability underuse (never assigned) ───────────────────────────────

console.log("\n─── Check 6: Abilities never appearing on any roster ─────────────────────");

const catalogueNames = new Set(ALL_ABILITIES.map(a => a.name));
const usedNames = new Set(Object.keys(abilityCounts));
const neverUsed = [...catalogueNames].filter(name => !usedNames.has(name));

if (neverUsed.length > 0) {
  console.log(`⚠  ${neverUsed.length} abilities exist in the catalogue but appear on 0 rosters:`);
  for (const name of neverUsed.sort()) {
    console.log(`   • ${name}`);
  }
  warnings.push(`⚠ ${neverUsed.length} abilities never appear on any roster`);
} else {
  console.log(`✅ Every catalogue ability appears on at least one roster`);
}

// Abilities that appear only once
const singletonAbilities = sortedAbilities.filter(ab => ab.count === 1);
if (singletonAbilities.length > 0) {
  console.log(`\n   ${singletonAbilities.length} abilities appear on exactly 1 player (near-absent):`);
  for (const ab of singletonAbilities) {
    console.log(`   • ${ab.name} (${ab.count})`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("REALISM AUDIT SUMMARY");
console.log("═══════════════════════════════════════════════════════════════════════════");
console.log(`Players scanned:  ${totalPlayers} (raw) / ${calPlayers.length} (calibrated)`);
console.log(`Hard failures:    ${hardFailures}`);
console.log(`Warnings:         ${warnings.length}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`  ${w}`);
}

if (hardFailures > 0) {
  console.error(`\n❌ Realism audit FAILED with ${hardFailures} hard error(s). Fix the issues above.`);
  process.exit(1);
} else {
  console.log(`\n✅ Realism audit passed${warnings.length > 0 ? ` (${warnings.length} warning(s) — see above)` : "."}`);
  process.exit(0);
}
