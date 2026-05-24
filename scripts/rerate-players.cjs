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

function getTargetOVR(tier, rank) {
  if (tier === 1) {
    if (rank === 0) return randInt(540, 630);
    if (rank <= 4) return randInt(385, 485);
    if (rank <= 19) return randInt(268, 348);
    return randInt(185, 248);
  }
  if (tier === 2) {
    if (rank === 0) return randInt(475, 545);
    if (rank <= 4) return randInt(360, 445);
    if (rank <= 19) return randInt(260, 338);
    return randInt(175, 245);
  }
  if (tier === 3) {
    if (rank === 0) return randInt(420, 495);
    if (rank <= 4) return randInt(330, 400);
    if (rank <= 19) return randInt(255, 328);
    return randInt(168, 242);
  }
  if (tier === 4) {
    if (rank === 0) return randInt(385, 445);
    if (rank <= 4) return randInt(300, 370);
    if (rank <= 19) return randInt(250, 310);
    return randInt(165, 238);
  }
  if (tier === 5) {
    if (rank === 0) return randInt(340, 395);
    if (rank <= 4) return randInt(280, 340);
    if (rank <= 19) return randInt(240, 295);
    return randInt(155, 228);
  }
  return 250;
}

const FILES = [
  { file: 'server/secBatch1.ts', tier: 1 },
  { file: 'server/secBatch2.ts', tier: 1 },
  { file: 'server/secBatch3.ts', tier: 1 },
  { file: 'server/accRostersBatch1.ts', tier: 1 },
  { file: 'server/accRostersBatch2.ts', tier: 1 },
  { file: 'server/accRostersBatch3.ts', tier: 1 },
  { file: 'server/bigTenBatch1.ts', tier: 1 },
  { file: 'server/bigTenBatch2.ts', tier: 1 },
  { file: 'server/bigTenBatch3.ts', tier: 1 },
  { file: 'server/pac12Rosters.ts', tier: 2 },
  { file: 'server/sunBeltRosters.ts', tier: 2 },
  { file: 'server/bigWestRosters.ts', tier: 3 },
  { file: 'server/moValleyRosters.ts', tier: 3 },
  { file: 'server/ivyLeagueRosters.ts', tier: 4 },
  { file: 'server/hbcuRosters.ts', tier: 5 },
];

let globalStats = { total: 0, elite: 0, aboveAvg: 0, avg: 0, belowAvg: 0 };
let globalOVRs = [];

function processFile(filePath, tier) {
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
          if (m) {
            attrs[attr] = parseInt(m[1]);
          }
        }
      }

      players.push({
        team: currentTeam,
        attrLine: i,
        blockStart,
        blockEnd,
        attrs,
      });
    }
  }

  const teams = {};
  for (const p of players) {
    if (!teams[p.team]) teams[p.team] = [];
    teams[p.team].push(p);
  }

  for (const [teamName, teamPlayers] of Object.entries(teams)) {
    teamPlayers.sort((a, b) => calcOVR(b.attrs) - calcOVR(a.attrs));
    teamPlayers.forEach((p, rank) => {
      p.targetOVR = getTargetOVR(tier, Math.min(rank, 24));
    });
  }

  for (const p of players) {
    const currentOVR = calcOVR(p.attrs);
    if (currentOVR <= 0) continue;

    const scale = p.targetOVR / currentOVR;

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
      const catcherRegex = /(catcherAbility:\s*)(\d+)/;
      const catcherMatch = lines[j].match(catcherRegex);
      if (catcherMatch) {
        const oldVal = parseInt(catcherMatch[2]);
        if (oldVal > 0) {
          const currentOVR2 = calcOVR(p.attrs);
          if (currentOVR2 > 0) {
            const scale2 = p.targetOVR / currentOVR2;
            let newVal = Math.round(oldVal * scale2);
            newVal = Math.max(1, Math.min(99, newVal));
            lines[j] = lines[j].replace(catcherRegex, `$1${newVal}`);
          }
        }
      }
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'));

  let fileStats = { total: 0, elite: 0, aboveAvg: 0, avg: 0, belowAvg: 0 };
  for (const p of players) {
    const newAttrs = {};
    for (let j = p.blockStart; j <= p.blockEnd; j++) {
      for (const attr of ALL_ATTRS) {
        const regex = new RegExp(attr + ':\\s*(\\d+)');
        const m = lines[j].match(regex);
        if (m) newAttrs[attr] = parseInt(m[1]);
      }
    }
    const newOVR = calcOVR(newAttrs);
    globalOVRs.push(newOVR);
    fileStats.total++;
    if (newOVR >= 500) fileStats.elite++;
    else if (newOVR >= 350) fileStats.aboveAvg++;
    else if (newOVR >= 250) fileStats.avg++;
    else fileStats.belowAvg++;
  }

  globalStats.total += fileStats.total;
  globalStats.elite += fileStats.elite;
  globalStats.aboveAvg += fileStats.aboveAvg;
  globalStats.avg += fileStats.avg;
  globalStats.belowAvg += fileStats.belowAvg;

  console.log(`${filePath}: ${fileStats.total} players | Elite(500+): ${fileStats.elite} | AboveAvg(350-499): ${fileStats.aboveAvg} | Avg(250-349): ${fileStats.avg} | BelowAvg(<250): ${fileStats.belowAvg}`);
}

console.log('=== RE-RATING ALL PLAYERS ===\n');

for (const { file, tier } of FILES) {
  try {
    processFile(file, tier);
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
    console.error(e.stack);
  }
}

console.log('\n=== GLOBAL DISTRIBUTION ===');
console.log(`Total: ${globalStats.total}`);
console.log(`Elite (500-650): ${globalStats.elite} (${(globalStats.elite/globalStats.total*100).toFixed(1)}%) - Target: <3%`);
console.log(`Above Avg (350-499): ${globalStats.aboveAvg} (${(globalStats.aboveAvg/globalStats.total*100).toFixed(1)}%) - Target: <17%`);
console.log(`Average (250-349): ${globalStats.avg} (${(globalStats.avg/globalStats.total*100).toFixed(1)}%) - Target: 60%`);
console.log(`Below Avg (150-249): ${globalStats.belowAvg} (${(globalStats.belowAvg/globalStats.total*100).toFixed(1)}%) - Target: 20%`);

globalOVRs.sort((a, b) => a - b);
console.log(`\nMin OVR: ${globalOVRs[0]}`);
console.log(`Max OVR: ${globalOVRs[globalOVRs.length - 1]}`);
console.log(`Median OVR: ${globalOVRs[Math.floor(globalOVRs.length / 2)]}`);

const over650 = globalOVRs.filter(v => v > 650).length;
const under150 = globalOVRs.filter(v => v < 150).length;
if (over650 > 0) console.log(`WARNING: ${over650} players above 650!`);
if (under150 > 0) console.log(`WARNING: ${under150} players below 150!`);
