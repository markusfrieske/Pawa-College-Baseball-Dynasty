'use strict';
// ⚠ ONE-TIME MIGRATION SCRIPT — DO NOT RUN AGAIN
// Applied once as part of Task #182 (fix lower-conference pitcher OVR).
// Tier 3-5 pitcher attributes have already been bumped. Re-running will
// double-boost those attrs and break the calibration.
const fs = require('fs');
const path = require('path');

// Bump a single named attribute on a line, capping at maxVal
function bumpAttr(line, attrName, delta, maxVal) {
  const re = new RegExp(`\\b(${attrName}:\\s*)(\\d+)\\b`);
  return line.replace(re, (_match, prefix, valStr) => {
    const bumped = Math.min(parseInt(valStr, 10) + delta, maxVal);
    return `${prefix}${bumped}`;
  });
}

// Process one batch file, applying boosts to pitcher attributes only
function processFile(filepath, coreBoost, commonBoost, coreCap, commonCap) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const result = [];
  let currentPosition = null;
  let pitcherLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Track which position the current player block is for
    const posMatch = line.match(/position:\s*"([^"]+)"/);
    if (posMatch) {
      currentPosition = posMatch[1];
    }

    if (currentPosition === 'P') {
      const before = line;
      // Primary pitching attributes (pitchCore in OVR formula)
      line = bumpAttr(line, 'velocity',  coreBoost, coreCap);
      line = bumpAttr(line, 'control',   coreBoost, coreCap);
      line = bumpAttr(line, 'stamina',   coreBoost, coreCap);
      line = bumpAttr(line, 'stuff',     coreBoost, coreCap);
      // Pitcher common attributes (pitchCommon in OVR formula)
      line = bumpAttr(line, 'heater',    commonBoost, commonCap);
      line = bumpAttr(line, 'poise',     commonBoost, commonCap);
      line = bumpAttr(line, 'recovery',  commonBoost, commonCap);
      line = bumpAttr(line, 'wRISP',     commonBoost, commonCap);
      line = bumpAttr(line, 'vsLefty',   commonBoost, commonCap);
      if (line !== before) pitcherLineCount++;
    }

    result.push(line);
  }

  fs.writeFileSync(filepath, result.join('\n'), 'utf8');
  console.log(`  ${path.basename(filepath)}: modified ${pitcherLineCount} pitcher attribute lines`);
  return pitcherLineCount;
}

const root = path.join(__dirname, '..');

// Tier 3 — WCC, Mountain West, Big West
// Target: pitcher avg OVR 270+  (currently ~228)
// +10 core  → +34 OVR;  +10 common → +12.5 OVR  ≈ +46.5 per pitcher
const tier3Files = [
  'server/wccRosters.ts',
  'server/mwcRosters.ts',
  'server/bigWestRosters.ts',
];

// Tier 4 — Missouri Valley, Ivy League
// Target: pitcher avg OVR 230+  (currently ~197)
// +12 core  → +40.8 OVR;  +8 common → +10 OVR  ≈ +50.8 per pitcher
const tier4Files = [
  'server/moValleyRosters.ts',
  'server/ivyLeagueRosters.ts',
];

// Tier 5 — HBCU
// Target: pitcher avg OVR 200+  (currently ~178)
// +8 core  → +27.2 OVR;  +5 common → +6.25 OVR  ≈ +33.5 per pitcher
const tier5Files = [
  'server/hbcuRosters.ts',
];

let total = 0;
console.log('=== Tier 3 bumps: core+10 (cap 82), common+10 (cap 80) ===');
for (const rel of tier3Files) {
  total += processFile(path.join(root, rel), 10, 10, 82, 80);
}

console.log('\n=== Tier 4 bumps: core+12 (cap 78), common+8 (cap 74) ===');
for (const rel of tier4Files) {
  total += processFile(path.join(root, rel), 12, 8, 78, 74);
}

console.log('\n=== Tier 5 bumps: core+8 (cap 68), common+5 (cap 64) ===');
for (const rel of tier5Files) {
  total += processFile(path.join(root, rel), 8, 5, 68, 64);
}

console.log(`\nTotal lines modified: ${total}`);
