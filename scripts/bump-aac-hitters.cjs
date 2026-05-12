'use strict';
// ⚠ ONE-TIME MIGRATION SCRIPT — DO NOT RUN AGAIN
// Applied once as part of Task #184 (tune AAC hitter OVR ratings).
// AAC hitter avg was 403 OVR — inflated ~30-40 pts above Tier 2 peers
// (Pac-12: 335, Sun Belt: 326). This script reduces AAC hitter core
// attributes by 8 pts each (floor-capped) to land in the 360-380 target.
//
// Math: 6 hitCore attrs × -8 × 0.75 weight ≈ -36 OVR per hitter.
// Expected result: 403 - 36 ≈ 367 hitter avg (well within 360-380 target).
// Re-running this script will double-reduce attrs and break calibration.

const fs = require('fs');
const path = require('path');

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP', 'CL', 'LHP', 'RHP']);

// Reduce a single named attribute on a line, flooring at minVal
function reduceAttr(line, attrName, delta, minVal) {
  const re = new RegExp(`\\b(${attrName}:\\s*)(\\d+)\\b`);
  return line.replace(re, (_match, prefix, valStr) => {
    const reduced = Math.max(parseInt(valStr, 10) - delta, minVal);
    return `${prefix}${reduced}`;
  });
}

const filepath = path.join(__dirname, '..', 'server', 'aacRosters.ts');
const lines = fs.readFileSync(filepath, 'utf8').split('\n');
const result = [];

let currentPosition = null;
let hitterLinesModified = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Track which position the current player block is for
  const posMatch = line.match(/position:\s*"([^"]+)"/);
  if (posMatch) {
    currentPosition = posMatch[1];
  }

  if (currentPosition && !PITCHER_POSITIONS.has(currentPosition)) {
    const before = line;
    // Primary hitter core attributes (hitCore in OVR formula, weight 0.75)
    // Reduce by 8 each; floors ensure no attr goes unrealistically low.
    line = reduceAttr(line, 'hitForAvg',      8, 15);
    line = reduceAttr(line, 'power',           8, 10);
    line = reduceAttr(line, 'speed',           8, 15);
    line = reduceAttr(line, 'arm',             8, 15);
    line = reduceAttr(line, 'fielding',        8, 20);
    line = reduceAttr(line, 'errorResistance', 8, 20);
    if (line !== before) hitterLinesModified++;
  }

  result.push(line);
}

fs.writeFileSync(filepath, result.join('\n'), 'utf8');
console.log(`aacRosters.ts: modified ${hitterLinesModified} hitter attribute lines`);
console.log('Done. Run: npx tsx scripts/analyze-conference-ovr.ts to verify.');
