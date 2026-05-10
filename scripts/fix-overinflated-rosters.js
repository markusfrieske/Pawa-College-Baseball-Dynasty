#!/usr/bin/env node
/**
 * Fixes overinflated conference rosters (AAC avg=433, WCC avg=426, MWC avg=426).
 * 
 * Strategy: "shrink-above-floor" — only values above a conference-tier floor are
 * reduced. This preserves variance among already-correct lower-tier players while
 * pulling inflated stars down to appropriate levels.
 *
 * Targets after transform:
 *   AAC  → avg 300-320  (Tier 2 conference)
 *   WCC  → avg 260-280  (Tier 3 conference)
 *   MWC  → avg 260-280  (Tier 3 conference)
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

/** Shrink values above floor toward it; leave values at or below floor unchanged. */
function shrink(val, floor, rate) {
  if (val <= floor) return val;
  return Math.round(val - (val - floor) * rate);
}

/**
 * Deduplicate and trim ability list to at most maxTotal abilities with at most maxGold gold ones.
 * Keeps the first occurrence of gold abilities (up to maxGold), then fills remaining slots with blues.
 */
function trimAbilities(abilityStr, maxTotal, maxGold) {
  const names = [...abilityStr.matchAll(/"([^"]+)"/g)].map(m => m[1]);

  // Deduplicate while preserving order (fixes Flukey-style bugs too)
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
 * Transform one roster file in-place.
 *
 * pFloor / pRate : floor + shrink rate applied to "primary" attributes
 *   - Pitchers  → velocity, control, stamina, stuff
 *   - Hitters   → hitForAvg, power, speed, arm, fielding, errorResistance
 *
 * cFloor / cRate : floor + shrink rate applied to "common/support" attributes
 *   - Pitchers  → arm, fielding (support), then all of Line 2
 *   - Hitters   → all of Line 2
 *
 * maxAbilities / maxGold : per-player ability caps
 */
function transformFile(filePath, pFloor, pRate, cFloor, cRate, maxAbilities, maxGold) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // --- Pass 1: primary attribute line ---
  // Format (always one line): hitForAvg: N, power: N, speed: N, arm: N, fielding: N, errorResistance: N, velocity: N, control: N, stamina: N, stuff: N,
  content = content.replace(
    /hitForAvg: (\d+), power: (\d+), speed: (\d+), arm: (\d+), fielding: (\d+), errorResistance: (\d+), velocity: (\d+), control: (\d+), stamina: (\d+), stuff: (\d+),/g,
    (_m, hfa, pw, sp, ar, fi, er, ve, co, st, su) => {
      const isPitcher = parseInt(ve) > 0;
      if (isPitcher) {
        return [
          `hitForAvg: ${hfa}`,
          `power: ${pw}`,
          `speed: ${sp}`,
          `arm: ${shrink(+ar, cFloor, cRate)}`,
          `fielding: ${shrink(+fi, cFloor, cRate)}`,
          `errorResistance: ${er}`,
          `velocity: ${shrink(+ve, pFloor, pRate)}`,
          `control: ${shrink(+co, pFloor, pRate)}`,
          `stamina: ${shrink(+st, pFloor, pRate)}`,
          `stuff: ${shrink(+su, pFloor, pRate)},`,
        ].join(', ');
      } else {
        return [
          `hitForAvg: ${shrink(+hfa, pFloor, pRate)}`,
          `power: ${shrink(+pw, pFloor, pRate)}`,
          `speed: ${shrink(+sp, pFloor, pRate)}`,
          `arm: ${shrink(+ar, pFloor, pRate)}`,
          `fielding: ${shrink(+fi, pFloor, pRate)}`,
          `errorResistance: ${shrink(+er, pFloor, pRate)}`,
          `velocity: 0`,
          `control: 0`,
          `stamina: 0`,
          `stuff: 0,`,
        ].join(', ');
      }
    }
  );

  // --- Pass 2: common attribute line ---
  // Format: clutch: N, vsLHP: N, grit: N, stealing: N, running: N, throwing: N, recovery: N, wRISP: N, vsLefty: N, poise: N, heater: N, agile: N,
  content = content.replace(
    /clutch: (\d+), vsLHP: (\d+), grit: (\d+), stealing: (\d+), running: (\d+), throwing: (\d+), recovery: (\d+), wRISP: (\d+), vsLefty: (\d+), poise: (\d+), heater: (\d+), agile: (\d+),/g,
    (_m, cl, vl, gr, st, ru, th, re, wr, vle, po, he, ag) => {
      const s = (v) => shrink(+v, cFloor, cRate);
      return `clutch: ${s(cl)}, vsLHP: ${s(vl)}, grit: ${s(gr)}, stealing: ${s(st)}, running: ${s(ru)}, throwing: ${s(th)}, recovery: ${s(re)}, wRISP: ${s(wr)}, vsLefty: ${s(vle)}, poise: ${s(po)}, heater: ${s(he)}, agile: ${s(ag)},`;
    }
  );

  // --- Pass 3: ability trimming (also deduplicates) ---
  content = content.replace(
    /abilities: (\[[^\]]*\])/g,
    (_m, abList) => `abilities: ${trimAbilities(abList, maxAbilities, maxGold)}`
  );

  if (content === original) {
    console.warn(`  ⚠  No changes made to ${filePath} — check regex patterns`);
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓  Transformed ${filePath}`);
  }
}

// ── AAC  (Tier 2, target avg 300-320) ───────────────────────────────────────
// shrink examples with floor=40, rate=0.25:
//   90→78  87→75  84→73  80→70  74→66  70→63  60→55  50→48  40→40(floor)
// common with floor=30, rate=0.25:
//   84→72  74→66  60→53  50→45  38→38  30→30(floor)
transformFile(
  'server/aacRosters.ts',
  40, 0.25,   // primary
  30, 0.25,   // common/support
  3, 1        // max abilities, max gold
);

// ── WCC  (Tier 3, target avg 260-280) ───────────────────────────────────────
// shrink examples with floor=35, rate=0.30:
//   86→71  84→70  80→67  75→63  70→61  60→54  50→47  35→35(floor)
// common with floor=25, rate=0.30:
//   83→67  74→62  60→53  50→47  38→34  25→25(floor)
transformFile(
  'server/wccRosters.ts',
  35, 0.30,
  25, 0.30,
  2, 1
);

// ── MWC  (Tier 3, target avg 260-280) ───────────────────────────────────────
transformFile(
  'server/mwcRosters.ts',
  35, 0.30,
  25, 0.30,
  2, 1
);

console.log('\nAll three conference files transformed.');
console.log('Verify with: npx tsx scripts/analyze-conference-ovr.ts');
