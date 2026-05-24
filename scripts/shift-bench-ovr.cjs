/**
 * shift-bench-ovr.cjs  (rank-aware, idempotent-friendly)
 *
 * Within each team, players are ranked by OVR descending (rank 0 = best).
 * Only players at RANKS 10-24 (bench/depth) whose OVR is in [250, 299]
 * are rescaled. Target: randInt(210, 249) — strictly within the below-average
 * band (150-249) and never below 200.
 *
 * Players at ranks 0-9 (top lineup) → UNCHANGED even if OVR is 250-299.
 * Players with OVR >= 300 → UNCHANGED always.
 * Players with OVR < 250 → UNCHANGED (already below-average).
 *
 * This preserves each team's relative strength ordering by construction:
 * top-9 slots are frozen, and bench slots only move down within 200-249.
 *
 * OVR formula: round(mainAttrSum × 0.6 + commonAttrSum × 0.25)
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
  total: 0,
  unchanged300plus: 0,
  unchangedTop9: 0,
  unchangedAlreadyBelow: 0,
  shifted: 0,
  violations: 0,
  elite: 0, aboveAvg: 0, avg: 0, belowAvg: 0,
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const players = [];
  let currentTeam = null;

  for (let i = 0; i < lines.length; i++) {
    const teamMatch = lines[i].match(/"([^"]+)":\s*\[/);
    if (teamMatch) {
      currentTeam = teamMatch[1];
    }

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

      players.push({ team: currentTeam, attrLine: i, blockStart, blockEnd, attrs });
    }
  }

  // Group by team, sort by OVR desc, assign ranks
  const teams = {};
  for (const p of players) {
    if (!teams[p.team]) teams[p.team] = [];
    teams[p.team].push(p);
  }

  for (const teamPlayers of Object.values(teams)) {
    teamPlayers.sort((a, b) => calcOVR(b.attrs) - calcOVR(a.attrs));
    teamPlayers.forEach((p, rank) => { p.rank = rank; });
  }

  let fileShifted = 0;

  for (const p of players) {
    const currentOVR = calcOVR(p.attrs);
    globalStats.total++;

    if (currentOVR <= 0) continue;

    // Skip 300+ always (out of scope)
    if (currentOVR >= 300) {
      globalStats.unchanged300plus++;
      continue;
    }

    // Skip top-9 slots (ranks 0-9) — preserve top-of-lineup ordering
    if (p.rank <= 9) {
      globalStats.unchangedTop9++;
      continue;
    }

    // Skip already-below-average players
    if (currentOVR < 250) {
      globalStats.unchangedAlreadyBelow++;
      continue;
    }

    // Only shift bench/depth players (ranks 10-24) with OVR in [250, 299]
    // Target: [210, 249] — strictly within below-average band, never below 200
    const targetOVR = randInt(210, 249);
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

    globalStats.shifted++;
    fileShifted++;

    // Post-scale clamp: if OVR rounded up to 250+, nudge first non-zero main attr down
    // until OVR is in [200, 249]. Safety limit: 5 nudges max.
    for (let attempt = 0; attempt < 5; attempt++) {
      const checkAttrs = {};
      for (let j = p.blockStart; j <= p.blockEnd; j++) {
        for (const attr of ALL_ATTRS) {
          const regex = new RegExp(attr + ':\\s*(\\d+)');
          const m = lines[j].match(regex);
          if (m) checkAttrs[attr] = parseInt(m[1]);
        }
      }
      const checkOVR = calcOVR(checkAttrs);
      if (checkOVR < 250) break; // already in band

      // Reduce first non-zero main attr by 1
      let nudged = false;
      for (const attr of MAIN_ATTRS) {
        if ((checkAttrs[attr] || 0) > 1) {
          for (let j = p.blockStart; j <= p.blockEnd; j++) {
            const regex = new RegExp(`(${attr}:\\s*)(\\d+)`);
            const match = lines[j].match(regex);
            if (match && parseInt(match[2]) > 1) {
              lines[j] = lines[j].replace(regex, `$1${parseInt(match[2]) - 1}`);
              nudged = true;
              break;
            }
          }
          if (nudged) break;
        }
      }
      if (!nudged) break;
    }

    // Final check
    const newAttrs = {};
    for (let j = p.blockStart; j <= p.blockEnd; j++) {
      for (const attr of ALL_ATTRS) {
        const regex = new RegExp(attr + ':\\s*(\\d+)');
        const m = lines[j].match(regex);
        if (m) newAttrs[attr] = parseInt(m[1]);
      }
    }
    const newOVR = calcOVR(newAttrs);
    if (newOVR < 200 || newOVR >= 250) {
      globalStats.violations++;
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'));

  // Final distribution count for this file
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

  const total = fElite + fAbove + fAvg + fBelow;
  console.log(`${filePath}: ${total}p | shifted: ${fileShifted} | elite: ${fElite} | above: ${fAbove} | avg: ${fAvg} | below: ${fBelow}`);
}

console.log('=== RANK-AWARE BENCH OVR SHIFT ===\n');
console.log('Rule: ranks 10-24 with OVR [250,299] → target [210,249]');
console.log('      ranks 0-9 (top lineup) → UNCHANGED');
console.log('      OVR >= 300 → UNCHANGED');
console.log('      OVR < 250 → UNCHANGED\n');

for (const file of FILES) {
  try {
    processFile(file);
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
    console.error(e.stack);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total players scanned: ${globalStats.total}`);
console.log(`Shifted (bench 250-299 → 210-249): ${globalStats.shifted}`);
console.log(`Unchanged (OVR >= 300):             ${globalStats.unchanged300plus}`);
console.log(`Unchanged (top-9 rank slot):        ${globalStats.unchangedTop9}`);
console.log(`Unchanged (already < 250):          ${globalStats.unchangedAlreadyBelow}`);
if (globalStats.violations > 0) {
  console.log(`⚠ VIOLATIONS (landed outside 200-249): ${globalStats.violations}`);
} else {
  console.log(`✅ All shifted players landed in [200,249]`);
}

console.log('\n=== FINAL GLOBAL DISTRIBUTION ===');
const total = globalStats.elite + globalStats.aboveAvg + globalStats.avg + globalStats.belowAvg;
console.log(`Total: ${total}`);
console.log(`Elite (500+):        ${globalStats.elite} (${(globalStats.elite/total*100).toFixed(1)}%) [target <3%]`);
console.log(`Above Avg (350-499): ${globalStats.aboveAvg} (${(globalStats.aboveAvg/total*100).toFixed(1)}%) [target <17%]`);
console.log(`Average (250-349):   ${globalStats.avg} (${(globalStats.avg/total*100).toFixed(1)}%)`);
console.log(`Below Avg (<250):    ${globalStats.belowAvg} (${(globalStats.belowAvg/total*100).toFixed(1)}%)`);
