#!/usr/bin/env node
/**
 * PASS 3 — WCC and MWC only.
 *
 * After pass 2: WCC=320, MWC=321 (target ≤295, ideally 270-285).
 * Light final shrink to land cleanly in the Tier 3 band.
 * Abilities unchanged (2 max, 1 gold max already set in pass 2).
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
  return `[${[...keptGolds, ...keptBlues].map(n => `"${n}"`).join(', ')}]`;
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
    console.log(`✓  Pass-3 transformed ${filePath}`);
  }
}

// WCC: 320→~280 (light reduction, abilities unchanged)
// shrink(62,35,0.20)=57  shrink(55,35,0.20)=51  shrink(50,35,0.20)=47
// shrink(45,35,0.20)=43  shrink(35,35,*)=35
transformFile('server/wccRosters.ts', 35, 0.20, 30, 0.20, 2, 1);

// MWC: 321→~281 (same params)
transformFile('server/mwcRosters.ts', 35, 0.20, 30, 0.20, 2, 1);

console.log('\nPass 3 complete. Verify: npx tsx scripts/analyze-conference-ovr.ts');
