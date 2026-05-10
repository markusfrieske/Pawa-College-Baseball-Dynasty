#!/usr/bin/env node
/**
 * Fixes overinflated conference rosters (AAC avg=433, WCC avg=426, MWC avg=426).
 * Uses "shrink-above-floor" to pull inflated stars down while preserving low-tier variance.
 *
 * Targets after transform:
 *   AAC  → avg 300-320  (Tier 2)
 *   WCC  → avg 260-280  (Tier 3)
 *   MWC  → avg 260-280  (Tier 3)
 */
const fs = require('fs');

// Full gold ability list from shared/abilities.ts
const GOLD_ABILITIES = new Set([
  // Pitcher gold
  'Explosive Fastball', 'Perfect Combustion', 'Big Boy Speed', 'Monster Stuff', 'Gas Tank',
  'Delayed Arm', 'Gear Change', 'Miracle Sharpness', 'Sangfroid', 'Wizard Mode',
  'Star of Victory', 'Showtime', 'Slugger Killer', 'Precision Instrument', 'Halting Quickness',
  'Iron Arm', 'Fighting Spirit', 'Top Gear', 'Grit', 'Doctor K', 'Painter',
  'High Spin Gyroball', 'Lefty Killer', 'Cross Cannon', 'Indomitable Soul', 'Phantasmagoric', 'Houdini',
  // Fielder gold
  'Artist', 'Hit Machine', 'First Pitch King', 'Ace Killer', 'Surprise!',
  'Emergency Strength', 'Outside Hitter', 'Counterattack', 'Spirit Head', 'Bases Loaded King',
  'Shock Commander', 'Heat Up', 'Slap Happy', 'Late Night Hero', 'High Ball Hitter',
  'Express Baserunning', 'High-Speed Laser', 'Wide Angle Cannon', 'Gambler', 'Strike Thrower',
  'Iron Man', 'Inside Hitter',
]);

/** Reduce values above floor toward it; leave values at/below floor unchanged. */
function shrink(val, floor, rate) {
  if (val <= floor) return val;
  return Math.round(val - (val - floor) * rate);
}

/**
 * Deduplicate and trim ability list:
 * - Removes duplicate names
 * - Keeps at most maxGold gold abilities (first ones in the array)
 * - Fills remaining slots up to maxTotal with blue abilities
 */
function trimAbilities(abilityStr, maxTotal, maxGold) {
  const names = [...abilityStr.matchAll(/"([^"]+)"/g)].map(m => m[1]);

  // Deduplicate preserving first occurrence
  const seen = new Set();
  const unique = names.filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });

  const golds = unique.filter(n => GOLD_ABILITIES.has(n));
  const blues  = unique.filter(n => !GOLD_ABILITIES.has(n));

  const keptGolds = golds.slice(0, maxGold);
  const keptBlues = blues.slice(0, Math.max(0, maxTotal - keptGolds.length));
  const kept = [...keptGolds, ...keptBlues];

  return `[${kept.map(n => `"${n}"`).join(', ')}]`;
}

/**
 * Transform a roster file in-place.
 *
 * pFloor/pRate  — floor+rate for PRIMARY attributes:
 *   Pitchers: velocity, control, stamina, stuff
 *   Hitters:  hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * cFloor/cRate  — floor+rate for COMMON/SUPPORT attributes:
 *   Pitchers: arm, fielding (support), + all Line-2 attrs
 *   Hitters:  all Line-2 attrs
 *
 * maxAbilities/maxGold — per-player caps after transform
 */
function transformFile(filePath, pFloor, pRate, cFloor, cRate, maxAbilities, maxGold) {
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content;

  // Pass 1: primary attribute line
  // hitForAvg: N, power: N, speed: N, arm: N, fielding: N, errorResistance: N, velocity: N, control: N, stamina: N, stuff: N,
  content = content.replace(
    /hitForAvg: (\d+), power: (\d+), speed: (\d+), arm: (\d+), fielding: (\d+), errorResistance: (\d+), velocity: (\d+), control: (\d+), stamina: (\d+), stuff: (\d+),/g,
    (_m, hfa, pw, sp, ar, fi, er, ve, co, st, su) => {
      const isPitcher = parseInt(ve) > 0;
      if (isPitcher) {
        // Scale pitcher primaries; arm/fielding use common floor (they're support attrs in OVR)
        return `hitForAvg: ${hfa}, power: ${pw}, speed: ${sp}, arm: ${shrink(+ar, cFloor, cRate)}, fielding: ${shrink(+fi, cFloor, cRate)}, errorResistance: ${er}, velocity: ${shrink(+ve, pFloor, pRate)}, control: ${shrink(+co, pFloor, pRate)}, stamina: ${shrink(+st, pFloor, pRate)}, stuff: ${shrink(+su, pFloor, pRate)},`;
      } else {
        // Scale all six hitter primary attrs
        return `hitForAvg: ${shrink(+hfa, pFloor, pRate)}, power: ${shrink(+pw, pFloor, pRate)}, speed: ${shrink(+sp, pFloor, pRate)}, arm: ${shrink(+ar, pFloor, pRate)}, fielding: ${shrink(+fi, pFloor, pRate)}, errorResistance: ${shrink(+er, pFloor, pRate)}, velocity: 0, control: 0, stamina: 0, stuff: 0,`;
      }
    }
  );

  // Pass 2: common attribute line
  // clutch: N, vsLHP: N, grit: N, stealing: N, running: N, throwing: N, recovery: N, wRISP: N, vsLefty: N, poise: N, heater: N, agile: N,
  content = content.replace(
    /clutch: (\d+), vsLHP: (\d+), grit: (\d+), stealing: (\d+), running: (\d+), throwing: (\d+), recovery: (\d+), wRISP: (\d+), vsLefty: (\d+), poise: (\d+), heater: (\d+), agile: (\d+),/g,
    (_m, cl, vl, gr, st, ru, th, re, wr, vle, po, he, ag) => {
      const s = v => shrink(+v, cFloor, cRate);
      return `clutch: ${s(cl)}, vsLHP: ${s(vl)}, grit: ${s(gr)}, stealing: ${s(st)}, running: ${s(ru)}, throwing: ${s(th)}, recovery: ${s(re)}, wRISP: ${s(wr)}, vsLefty: ${s(vle)}, poise: ${s(po)}, heater: ${s(he)}, agile: ${s(ag)},`;
    }
  );

  // Pass 3: trim abilities (also deduplicates)
  content = content.replace(
    /abilities: (\[[^\]]*\])/g,
    (_m, abList) => `abilities: ${trimAbilities(abList, maxAbilities, maxGold)}`
  );

  if (content === before) {
    console.warn(`  ⚠  No changes found in ${filePath}`);
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    const changes = (before.split('\n').filter((l, i) => l !== content.split('\n')[i])).length;
    console.log(`✓  Transformed ${filePath}  (${changes} lines changed)`);
  }
}

// ── AAC (Tier 2, target avg 300-320) ─────────────────────────────────────────
// shrink(90, 40, 0.25)=78  shrink(87, 40, 0.25)=75  shrink(80, 40, 0.25)=70
// shrink(70, 40, 0.25)=63  shrink(60, 40, 0.25)=55  shrink(40, 40, *)=40
transformFile(
  'server/aacRosters.ts',
  40, 0.25,   // primary floor/rate
  30, 0.25,   // common/support floor/rate
  3, 1        // max abilities, max gold
);

// ── WCC (Tier 3, target avg 260-280) ─────────────────────────────────────────
// shrink(86, 35, 0.30)=71  shrink(84, 35, 0.30)=70  shrink(80, 35, 0.30)=67
// shrink(70, 35, 0.30)=61  shrink(60, 35, 0.30)=54  shrink(35, 35, *)=35
transformFile(
  'server/wccRosters.ts',
  35, 0.30,
  25, 0.30,
  2, 1
);

// ── MWC (Tier 3, target avg 260-280) ─────────────────────────────────────────
transformFile(
  'server/mwcRosters.ts',
  35, 0.30,
  25, 0.30,
  2, 1
);

console.log('\nDone. Verify with: npx tsx scripts/analyze-conference-ovr.ts');
