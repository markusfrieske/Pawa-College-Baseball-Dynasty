#!/usr/bin/env node
/**
 * apply-balance.js
 * Boosts hitter (hitForAvg, power, speed) and reduces pitcher (velocity, stuff)
 * attributes across all real-player roster batch files by tier.
 *
 * Tier deltas:
 *   Tier 1 (SEC/ACC/BigTen/Big12): hitter +7/+7/+4, pitcher vel-4 stuff-3, cap 95
 *   Tier 2 (Pac12/AAC/SunBelt):    hitter +5/+5/+3, pitcher vel-3 stuff-2, cap 88
 *   Tier 3 (WCC/MW/BigWest/MoV):   hitter +4/+4/+2, pitcher vel-2 stuff-2, cap 88
 *   Tier 4 (Ivy):                   hitter +3/+3/+2, pitcher vel-2 stuff-1, cap 88
 *   Tier 5 (HBCU):                  hitter +3/+3/+2, pitcher vel-2 stuff-1, cap 88
 *
 * Elite-attr guard (hitters):
 *   If boosting an attr to >=90 would create a 3rd elite attr on that player, cap at 89.
 * Pitcher floor: never below 30.
 * Pitcher skip: attrs already >=90 are not reduced (protects validation floor).
 */

const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '../server');

const TIERS = [
  {
    tier: 1,
    files: [
      'secBatch1.ts', 'secBatch2.ts', 'secBatch3.ts',
      'accRostersBatch1.ts', 'accRostersBatch2.ts', 'accRostersBatch3.ts',
      'bigTenBatch1.ts', 'bigTenBatch2.ts', 'bigTenBatch3.ts',
      'big12Rosters.ts',
    ],
    hfa: 7, pwr: 7, spd: 4, vel: 4, stf: 3, hardCap: 95,
  },
  {
    tier: 2,
    files: ['pac12Rosters.ts', 'aacRosters.ts', 'sunBeltRosters.ts'],
    hfa: 5, pwr: 5, spd: 3, vel: 3, stf: 2, hardCap: 88,
  },
  {
    tier: 3,
    files: ['wccRosters.ts', 'mwcRosters.ts', 'bigWestRosters.ts', 'moValleyRosters.ts'],
    hfa: 4, pwr: 4, spd: 2, vel: 2, stf: 2, hardCap: 88,
  },
  {
    tier: 4,
    files: ['ivyLeagueRosters.ts'],
    hfa: 3, pwr: 3, spd: 2, vel: 2, stf: 1, hardCap: 88,
  },
  {
    tier: 5,
    files: ['hbcuRosters.ts'],
    hfa: 3, pwr: 3, spd: 2, vel: 2, stf: 1, hardCap: 88,
  },
];

// All numeric attrs that can appear on the attr-data line.
// Used to count how many are already elite (>=90).
const ALL_ATTRS = [
  'hitForAvg','power','speed','arm','fielding','errorResistance',
  'velocity','control','stamina','stuff',
  'clutch','vsLHP','grit','stealing','running','throwing',
  'recovery','wRISP','vsLefty','poise','heater','agile',
];

function getVal(line, attr) {
  const m = line.match(new RegExp(attr + ':\\s*(\\d+)'));
  return m ? parseInt(m[1], 10) : 0;
}

function replaceVal(line, attr, newVal) {
  return line.replace(new RegExp(attr + ':\\s*\\d+'), attr + ': ' + newVal);
}

function applyBoost(currentVal, boost, eliteCountSoFar, hardCap) {
  let newVal = Math.min(hardCap, currentVal + boost);
  // Elite-attr guard: if this would create a NEW elite attr AND we already have 2+, cap at 89
  if (newVal >= 90 && currentVal < 90 && eliteCountSoFar >= 2) {
    newVal = Math.min(89, newVal);
  }
  return newVal;
}

let grandHitterMods = 0;
let grandPitcherMods = 0;

for (const tierCfg of TIERS) {
  for (const filename of tierCfg.files) {
    const filepath = path.join(SERVER, filename);
    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP (not found): ${filename}`);
      continue;
    }

    const lines = fs.readFileSync(filepath, 'utf8').split('\n');
    let isPitcher = false;
    let hitterMods = 0;
    let pitcherMods = 0;

    const newLines = lines.map((line) => {
      // Detect position from record-header lines (first line of each player object)
      const posMatch = line.match(/position:\s*"([^"]+)"/);
      if (posMatch) {
        isPitcher = posMatch[1] === 'P';
      }

      // Only touch lines that have the attr data (always contain hitForAvg:)
      if (!line.includes('hitForAvg:')) return line;

      if (!isPitcher) {
        // ── Hitter boost ──────────────────────────────────────────────────────
        // Count current elite attrs (>=90) across the whole line
        let eliteCount = 0;
        for (const a of ALL_ATTRS) {
          if (getVal(line, a) >= 90) eliteCount++;
        }

        const hfa = getVal(line, 'hitForAvg');
        const pwr = getVal(line, 'power');
        const spd = getVal(line, 'speed');

        const newHfa = applyBoost(hfa, tierCfg.hfa, eliteCount, tierCfg.hardCap);
        // Recount after hitForAvg may have become elite
        if (newHfa >= 90 && hfa < 90) eliteCount++;

        const newPwr = applyBoost(pwr, tierCfg.pwr, eliteCount, tierCfg.hardCap);
        if (newPwr >= 90 && pwr < 90) eliteCount++;

        const newSpd = applyBoost(spd, tierCfg.spd, eliteCount, tierCfg.hardCap);

        if (newHfa !== hfa || newPwr !== pwr || newSpd !== spd) {
          hitterMods++;
          grandHitterMods++;
          line = replaceVal(line, 'hitForAvg', newHfa);
          line = replaceVal(line, 'power',     newPwr);
          line = replaceVal(line, 'speed',     newSpd);
        }
      } else {
        // ── Pitcher reduction ─────────────────────────────────────────────────
        const vel = getVal(line, 'velocity');
        const stf = getVal(line, 'stuff');

        // Skip if attr is already >=90 (protects validation floor elite attrs)
        const newVel = vel >= 90 ? vel : Math.max(30, vel - tierCfg.vel);
        const newStf = stf >= 90 ? stf : Math.max(30, stf - tierCfg.stf);

        if (newVel !== vel || newStf !== stf) {
          pitcherMods++;
          grandPitcherMods++;
          line = replaceVal(line, 'velocity', newVel);
          line = replaceVal(line, 'stuff',    newStf);
        }
      }

      return line;
    });

    fs.writeFileSync(filepath, newLines.join('\n'), 'utf8');
    console.log(`  [Tier ${tierCfg.tier}] ${filename}: hitter=${hitterMods} pitcher=${pitcherMods}`);
  }
}

console.log(`\nDone. Total hitter mods: ${grandHitterMods}, pitcher mods: ${grandPitcherMods}`);
