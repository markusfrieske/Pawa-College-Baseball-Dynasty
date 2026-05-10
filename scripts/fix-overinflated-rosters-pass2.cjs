#!/usr/bin/env node
/**
 * SECOND PASS of roster fix — applied to already-reduced files.
 *
 * After pass 1:
 *   AAC avg=373 (target ≤335, ideally 300-320)
 *   WCC avg=347 (target ≤295, ideally 260-280)
 *   MWC avg=348 (target ≤295, ideally 260-280)
 *
 * Key issue: WCC/MWC still outrank ACC (342) and Big Ten (337) despite being Tier 3.
 *            AAC still outranks SEC (366) despite being Tier 2.
 *
 * Strategy: shrink-above-floor again with tighter floors; also reduce
 *   AAC ability cap from 3→2 (removes one blue ability bonus per player ~−20 avg).
 */
const fs = require('fs');

const GOLD_ABILITIES = new Set([
  'Explosive Fastball', 'Perfect Combustion', 'Big Boy Speed', 'Monster Stuff', 'Gas Tank',
  'Delayed Arm', 'Gear Change', 'Miracle Sharpness', 'Sangfroid', 'Wizard Mode',
  'Star of Victory', 'Showtime', 'Slugger Killer', 'Precision Instrument', 'Halting Quickness',
  'Iron Arm', 'Fighting Spirit', 'Top Gear', 'Grit', 'Doctor K', 'Painter',
  'High Spin Gyroball', 'Lefty Killer', 'Cross Cannon', 'Indomitable Soul', 'Phantasmagoric', 'Houdini',
  'Artist', 'Hit Machine', 'First Pitch King', 'Ace Killer', 'Surprise!',
  'Emergency Strength', 'Outside Hitter', 'Counterattack', 'Spirit Head', 'Bases Loaded King',
  'Shock Commander', 'Heat Up', 'Slap Happy', 'Late Night Hero', 'High Ball Hitter',
  'Express Baserunning', 'High-Speed Laser', 'Wide Angle Cannon', 'Gambler', 'Strike Thrower',
  'Iron Man', 'Inside Hitter',
]);

function shrink(val, floor, rate) {
  if (val <= floor) return val;
  return Math.round(val - (val - floor) * rate);
}

function trimAbilities(abilityStr, maxTotal, maxGold) {
  const names = [...abilityStr.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  const unique = names.filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  const golds = unique.filter(n => GOLD_ABILITIES.has(n));
  const blues  = unique.filter(n => !GOLD_ABILITIES.has(n));
  const keptGolds = golds.slice(0, maxGold);
  const keptBlues = blues.slice(0, Math.max(0, maxTotal - keptGolds.length));
  const kept = [...keptGolds, ...keptBlues];
  return `[${kept.map(n => `"${n}"`).join(', ')}]`;
}

function transformFile(filePath, pFloor, pRate, cFloor, cRate, maxAbilities, maxGold) {
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content;

  content = content.replace(
    /hitForAvg: (\d+), power: (\d+), speed: (\d+), arm: (\d+), fielding: (\d+), errorResistance: (\d+), velocity: (\d+), control: (\d+), stamina: (\d+), stuff: (\d+),/g,
    (_m, hfa, pw, sp, ar, fi, er, ve, co, st, su) => {
      const isPitcher = parseInt(ve) > 0;
      if (isPitcher) {
        return `hitForAvg: ${hfa}, power: ${pw}, speed: ${sp}, arm: ${shrink(+ar, cFloor, cRate)}, fielding: ${shrink(+fi, cFloor, cRate)}, errorResistance: ${er}, velocity: ${shrink(+ve, pFloor, pRate)}, control: ${shrink(+co, pFloor, pRate)}, stamina: ${shrink(+st, pFloor, pRate)}, stuff: ${shrink(+su, pFloor, pRate)},`;
      } else {
        return `hitForAvg: ${shrink(+hfa, pFloor, pRate)}, power: ${shrink(+pw, pFloor, pRate)}, speed: ${shrink(+sp, pFloor, pRate)}, arm: ${shrink(+ar, pFloor, pRate)}, fielding: ${shrink(+fi, pFloor, pRate)}, errorResistance: ${shrink(+er, pFloor, pRate)}, velocity: 0, control: 0, stamina: 0, stuff: 0,`;
      }
    }
  );

  content = content.replace(
    /clutch: (\d+), vsLHP: (\d+), grit: (\d+), stealing: (\d+), running: (\d+), throwing: (\d+), recovery: (\d+), wRISP: (\d+), vsLefty: (\d+), poise: (\d+), heater: (\d+), agile: (\d+),/g,
    (_m, cl, vl, gr, st, ru, th, re, wr, vle, po, he, ag) => {
      const s = v => shrink(+v, cFloor, cRate);
      return `clutch: ${s(cl)}, vsLHP: ${s(vl)}, grit: ${s(gr)}, stealing: ${s(st)}, running: ${s(ru)}, throwing: ${s(th)}, recovery: ${s(re)}, wRISP: ${s(wr)}, vsLefty: ${s(vle)}, poise: ${s(po)}, heater: ${s(he)}, agile: ${s(ag)},`;
    }
  );

  content = content.replace(
    /abilities: (\[[^\]]*\])/g,
    (_m, abList) => `abilities: ${trimAbilities(abList, maxAbilities, maxGold)}`
  );

  if (content === before) {
    console.warn(`  ⚠  No changes in ${filePath}`);
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓  Pass-2 transformed ${filePath}`);
  }
}

// ── AAC  (Tier 2, target avg 300-320) ─────────────────────────────────────
// Pass-1 result: avg=373. Need to drop ~60 more.
// Tighter floor + reduce max abilities 3→2 (saves ~20 OVR per player).
//   shrink(75,35,0.25)=66  shrink(70,35,0.25)=61  shrink(60,35,0.25)=54
//   shrink(50,35,0.25)=46  shrink(35,35,*)=35
transformFile(
  'server/aacRosters.ts',
  35, 0.25,   // primary
  28, 0.25,   // common/support
  2, 1        // max abilities (3→2), max gold unchanged at 1
);

// ── WCC  (Tier 3, target avg 260-280) ─────────────────────────────────────
// Pass-1 result: avg=347. Need to drop ~80 more.
//   shrink(71,35,0.25)=62  shrink(67,35,0.25)=59  shrink(61,35,0.25)=55
//   shrink(54,35,0.25)=49  shrink(35,35,*)=35
transformFile(
  'server/wccRosters.ts',
  35, 0.25,
  30, 0.25,
  2, 1
);

// ── MWC  (Tier 3, target avg 260-280) ─────────────────────────────────────
transformFile(
  'server/mwcRosters.ts',
  35, 0.25,
  30, 0.25,
  2, 1
);

console.log('\nPass 2 complete. Verify: npx tsx scripts/analyze-conference-ovr.ts');
