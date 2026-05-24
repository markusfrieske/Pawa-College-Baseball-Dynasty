/**
 * shift-bench-ovr.cjs
 *
 * Narrow scope: only modifies players whose current OVR falls in [250, 299].
 * Those players are rescaled to land in [185, 245] (below-average band).
 * Any player at 300+ or below 250 is left COMPLETELY UNCHANGED.
 *
 * OVR formula (same as rerate-players.cjs):
 *   OVR = round(mainAttrSum * 0.6 + commonAttrSum * 0.25)
 */

const fs = require('fs');

const MAIN_ATTRS = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'velocity', 'control', 'stamina', 'stuff'];
const COMMON_ATTRS = ['clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'wRISP', 'vsLefty', 'poise', 'heater', 'agile'];
const ALL_ATTRS = [...MAIN_ATTRS, ...COMMON_ATTRS];

function calcOVR(attrs) {
  let attrSum = 0;
  for (const a of MAIN_ATTRS) attrSum += (attrs[a] || 0);
  let commonSum = 0;
  for (const a of COMMON_ATTRS) commonSum += (attrs[a] || 0);
  return Math.round(attrSum * 0.6 + commonSum * 0.25);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FILES = [
  'server/secBatch1.ts',
  'server/secBatch2.ts',
  'server/secBatch3.ts',
  'server/accRostersBatch1.ts',
  'server/accRostersBatch2.ts',
  'server/accRostersBatch3.ts',
  'server/bigTenBatch1.ts',
  'server/bigTenBatch2.ts',
  'server/bigTenBatch3.ts',
  'server/big12Rosters.ts',
  'server/pac12Rosters.ts',
  'server/mwcRosters.ts',
  'server/aacRosters.ts',
  'server/sunBeltRosters.ts',
  'server/wccRosters.ts',
  'server/bigWestRosters.ts',
  'server/moValleyRosters.ts',
  'server/ivyLeagueRosters.ts',
  'server/hbcuRosters.ts',
];

let globalStats = {
  total: 0, skippedAbove300: 0, skippedBelow250: 0, shifted: 0,
  shiftedBelow150: 0, elite: 0, aboveAvg: 0, avg: 0, belowAvg: 0,
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const players = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('hitForAvg:') && lines[i].includes('power:')) {
      const attrs = {};
      const blockStart = Math.max(0, i);
      const blockEnd = Math.min(lines.length - 1, i + 2);

      for (let j = blockStart; j <= blockEnd; j++) {
        for (const attr of ALL_ATTRS) {
          const regex = new RegExp(attr + ':\\s*(\\d+)');
          const m = lines[j].match(regex);
          if (m) attrs[attr] = parseInt(m[1]);
        }
      }

      players.push({ attrLine: i, blockStart, blockEnd, attrs });
    }
  }

  let fileStats = { total: 0, skippedAbove300: 0, skippedBelow250: 0, shifted: 0 };

  for (const p of players) {
    const currentOVR = calcOVR(p.attrs);
    fileStats.total++;
    globalStats.total++;

    if (currentOVR <= 0) continue;

    if (currentOVR >= 300) {
      // Out of scope — leave unchanged
      fileStats.skippedAbove300++;
      globalStats.skippedAbove300++;
      continue;
    }

    if (currentOVR < 250) {
      // Already below-average — leave unchanged
      fileStats.skippedBelow250++;
      globalStats.skippedBelow250++;
      continue;
    }

    // OVR is 250-299: shift down to below-average band (185-245)
    const targetOVR = randInt(185, 245);
    const scale = targetOVR / currentOVR;

    for (let j = p.blockStart; j <= p.blockEnd; j++) {
      for (const attr of ALL_ATTRS) {
        const regex = new RegExp(`(${attr}:\\s*)(\\d+)`);
        const match = lines[j].match(regex);
        if (match) {
          const oldVal = parseInt(match[2]);
          if (oldVal === 0) continue;
          let newVal = Math.round(oldVal * scale);
          newVal = Math.max(1, Math.min(99, newVal));
          lines[j] = lines[j].replace(regex, `$1${newVal}`);
        }
      }
      // Scale catcherAbility if present
      const catcherRegex = /(catcherAbility:\s*)(\d+)/;
      const catcherMatch = lines[j].match(catcherRegex);
      if (catcherMatch) {
        const oldVal = parseInt(catcherMatch[2]);
        if (oldVal > 0) {
          let newVal = Math.round(oldVal * scale);
          newVal = Math.max(1, Math.min(99, newVal));
          lines[j] = lines[j].replace(catcherRegex, `$1${newVal}`);
        }
      }
    }

    fileStats.shifted++;
    globalStats.shifted++;

    // Verify floor after shift
    const newAttrs = {};
    for (let j = p.blockStart; j <= p.blockEnd; j++) {
      for (const attr of ALL_ATTRS) {
        const regex = new RegExp(attr + ':\\s*(\\d+)');
        const m = lines[j].match(regex);
        if (m) newAttrs[attr] = parseInt(m[1]);
      }
    }
    const newOVR = calcOVR(newAttrs);
    if (newOVR < 150) globalStats.shiftedBelow150++;
  }

  fs.writeFileSync(filePath, lines.join('\n'));

  // Recount final distribution for this file
  const freshContent = fs.readFileSync(filePath, 'utf8');
  const freshLines = freshContent.split('\n');
  let fElite = 0, fAbove = 0, fAvg = 0, fBelow = 0;
  for (let i = 0; i < freshLines.length; i++) {
    if (!freshLines[i].includes('hitForAvg:') || !freshLines[i].includes('power:')) continue;
    const attrs = {};
    for (let j = Math.max(0, i); j <= Math.min(freshLines.length - 1, i + 2); j++) {
      for (const attr of ALL_ATTRS) {
        const regex = new RegExp(attr + ':\\s*(\\d+)');
        const m = freshLines[j].match(regex);
        if (m) attrs[attr] = parseInt(m[1]);
      }
    }
    const ovr = calcOVR(attrs);
    if (ovr >= 500) { fElite++; globalStats.elite++; }
    else if (ovr >= 350) { fAbove++; globalStats.aboveAvg++; }
    else if (ovr >= 250) { fAvg++; globalStats.avg++; }
    else { fBelow++; globalStats.belowAvg++; }
  }

  console.log(`${filePath}: ${fileStats.total} players | skipped≥300: ${fileStats.skippedAbove300} | shifted(250-299→below): ${fileStats.shifted} | skipped<250: ${fileStats.skippedBelow250}`);
}

console.log('=== SHIFTING 250-299 OVR PLAYERS INTO BELOW-AVERAGE BAND ===\n');
console.log('Rule: players with OVR in [250,299] → rescaled to [185,245]');
console.log('      players with OVR >= 300 or < 250 → UNCHANGED\n');

for (const file of FILES) {
  try {
    processFile(file);
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total players scanned: ${globalStats.total}`);
console.log(`Shifted (250-299 → below-avg): ${globalStats.shifted}`);
console.log(`Skipped (OVR >= 300, unchanged): ${globalStats.skippedAbove300}`);
console.log(`Skipped (OVR < 250, unchanged): ${globalStats.skippedBelow250}`);
if (globalStats.shiftedBelow150 > 0) {
  console.log(`WARNING: ${globalStats.shiftedBelow150} players shifted below 150!`);
}

console.log('\n=== FINAL GLOBAL DISTRIBUTION ===');
const total = globalStats.elite + globalStats.aboveAvg + globalStats.avg + globalStats.belowAvg;
console.log(`Total: ${total}`);
console.log(`Elite (500-650):     ${globalStats.elite} (${(globalStats.elite/total*100).toFixed(1)}%)`);
console.log(`Above Avg (350-499): ${globalStats.aboveAvg} (${(globalStats.aboveAvg/total*100).toFixed(1)}%)`);
console.log(`Average (250-349):   ${globalStats.avg} (${(globalStats.avg/total*100).toFixed(1)}%)`);
console.log(`Below Avg (<250):    ${globalStats.belowAvg} (${(globalStats.belowAvg/total*100).toFixed(1)}%)`);
