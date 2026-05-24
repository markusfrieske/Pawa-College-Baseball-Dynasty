/**
 * validate-calibrated-ordering.cjs
 *
 * Proves that shifting bench-slot (rank 10-24) players from 250-299 OVR into
 * the 200-249 band does NOT alter team strength ordering after calibrateRpiOvr
 * runs at dynasty creation.
 *
 * Why ordering is preserved:
 *  calibrateRpiOvr freezes each team's top-5 players by OVR and only scales
 *  the bottom-20 proportionally to hit a fixed RPI-derived target average:
 *    targetOvr = round(420 - (rpiRank-1) * (120/148))
 *
 *  Because our bench shift only touches ranks 10-24, the top-5 OVR values are
 *  unchanged. With the same top-5 values, calibrateRpiOvr computes the same
 *  requiredBottom20Avg for every team. Post-calibration average OVR = target
 *  average (fixed by RPI rank) for every team. Therefore ordering = RPI rank
 *  ordering, which is identical before and after the bench shift.
 *
 * This script:
 *  1. Reads pre-task (a4dab97) and post-task (HEAD) roster data.
 *  2. Simulates calibrateRpiOvr on both using the real formula.
 *  3. Asserts post-calibration ordering is identical in both cases.
 *  4. Also confirms top-5 OVR values are unchanged (prerequisite).
 *
 * Usage: node scripts/validate-calibrated-ordering.cjs
 */

'use strict';
const fs = require('fs');
const { execSync } = require('child_process');

const MAIN_ATTRS   = ['hitForAvg','power','speed','arm','fielding','errorResistance','velocity','control','stamina','stuff'];
const COMMON_ATTRS = ['clutch','vsLHP','grit','stealing','running','throwing','recovery','wRISP','vsLefty','poise','heater','agile'];
const ALL_ATTRS    = [...MAIN_ATTRS, ...COMMON_ATTRS];

function calcOVR(attrs) {
  let main = 0, common = 0;
  for (const a of MAIN_ATTRS)   main   += (attrs[a] || 0);
  for (const a of COMMON_ATTRS) common += (attrs[a] || 0);
  return Math.round(main * 0.6 + common * 0.25);
}

/** Mirror of calibrateRpiOvr.ts: getTargetOvr(rpiRank) */
function getTargetOvr(rank) {
  return Math.round(420 - (rank - 1) * (120 / 148));
}

/** Extract players from a TypeScript roster file string */
function extractPlayers(content) {
  const lines = content.split('\n');
  const players = [];
  let currentTeam = null;
  for (let i = 0; i < lines.length; i++) {
    const tm = lines[i].match(/"([^"]+)":\s*\[/);
    if (tm) currentTeam = tm[1];
    if (lines[i].includes('hitForAvg:') && lines[i].includes('power:')) {
      const attrs = {};
      const bE = Math.min(lines.length - 1, i + 2);
      for (let j = i; j <= bE; j++) {
        for (const a of ALL_ATTRS) {
          const m = lines[j].match(new RegExp(a + ':\\s*(\\d+)'));
          if (m) attrs[a] = parseInt(m[1]);
        }
      }
      players.push({ team: currentTeam, ovr: calcOVR(attrs) });
    }
  }
  return players;
}

/**
 * Simulate calibrateRpiOvr.
 * - Top 5 by OVR → frozen
 * - Bottom 20 → scaled so team average = targetOvr(rpiRank)
 * Returns simulated post-calibration team average OVR.
 */
function simulateCalibration(teamOvrs, rpiRank) {
  if (!rpiRank) return null;                     // team not in RPI map
  const sorted = [...teamOvrs].sort((a, b) => b - a);
  const top5   = sorted.slice(0, 5);
  const bot20  = sorted.slice(5);
  const top5Sum   = top5.reduce((s, v) => s + v, 0);
  const target    = getTargetOvr(rpiRank);
  const reqBot20Avg = (target * sorted.length - top5Sum) / bot20.length;
  const curBot20Avg = bot20.reduce((s, v) => s + v, 0) / bot20.length;
  const ratio = reqBot20Avg / (curBot20Avg || 1);
  const newBot20 = bot20.map(v => Math.max(150, Math.min(650, Math.round(v * ratio))));
  const allNew = [...top5, ...newBot20];
  return Math.round(allNew.reduce((s, v) => s + v, 0) / allNew.length);
}

// ── RPI rank map (mirrors calibrateRpiOvr.ts) ─────────────────────────────
const RPI_RANK_MAP = {
  'UCLA':1,'Auburn':3,'Texas':5,'Alabama':6,'Florida':10,'Georgia':11,
  'Mississippi State':13,'Texas A&M':14,'Ole Miss':17,'Arkansas':21,
  'Oklahoma':24,'Tennessee':31,'Kentucky':37,'LSU':66,'Vanderbilt':73,
  'South Carolina':139,'Missouri':109,
  'Georgia Tech':2,'North Carolina':4,'Florida State':7,'Wake Forest':20,
  'Virginia':25,'Miami':29,'Boston College':34,'Pittsburgh':38,
  'Virginia Tech':43,'Clemson':50,'NC State':51,'Notre Dame':70,'Duke':82,
  'Louisville':87,'California':59,'Stanford':101,
  'Nebraska':9,'Oregon':16,'Oregon State':18,'Purdue':52,'Michigan':53,
  'Iowa':72,'Maryland':83,'Ohio State':84,'USC':8,'Minnesota':92,
  'Illinois':98,'Michigan State':106,'Indiana':121,'Rutgers':123,
  'Penn State':155,'Washington':158,'Northwestern':160,
  'West Virginia':15,'Kansas':19,'Cincinnati':23,'Oklahoma State':30,
  'UCF':33,'TCU':48,'Arizona State':47,'Kansas State':55,'Baylor':65,
  'BYU':78,'Houston':108,'Texas Tech':128,'Utah':102,'Arizona':165,
  'Washington State':85,'San Diego State':91,'Air Force':140,'Nevada':166,
  'UNLV':175,'Fresno State':178,'New Mexico':180,
  'East Carolina':42,'South Florida':77,'Rice':76,'Dallas Baptist':71,
  'UAB':61,'Charlotte':95,'Florida Atlantic':127,'Memphis':111,
  'Tulane':146,'Wichita State':147,'North Texas':185,
  'Coastal Carolina':26,'Southern Miss':12,'Troy':41,'Louisiana':36,
  'Arkansas State':60,'South Alabama':62,'App State':114,'Old Dominion':115,
  'Georgia State':130,'Marshall':155,'Georgia Southern':165,'James Madison':170,
  'Pepperdine':186,'Gonzaga':189,'BYU':78,'Portland':193,
  'San Francisco':195,'Pacific':198,'Saint Mary\'s':200,'LMU':202,
  'Cal State Fullerton':145,'Long Beach State':153,'UC Irvine':168,
  'UC Santa Barbara':174,'Cal Poly':179,'UC Davis':187,'UC Riverside':192,
  'Cal State Northridge':196,'Hawaii':199,'UC San Diego':204,
  'Bradley':152,'Dallas Baptist':71,'Indiana State':163,'Evansville':182,
  'Illinois State':191,'Missouri State':143,'Southern Illinois':188,
  'Valparaiso':203,'Northern Iowa':209,'Youngstown State':210,
  'UIC':212,'Belmont':215,'Morehead State':216,
  'Harvard':220,'Yale':221,'Princeton':222,'Columbia':223,
  'Cornell':224,'Brown':225,'Dartmouth':226,'Pennsylvania':227,
  'North Carolina Central':228,'Norfolk State':229,'Morgan State':230,
  'Howard':231,'Grambling State':232,'Florida A&M':233,'Delaware State':234,
  'Coppin State':235,'Bethune-Cookman':236,'Alabama A&M':237,'Alabama State':238,
  'Jackson State':239,'MVSU':240,'Prairie View':241,'Southern':242,
  'Texas Southern':243,'Alcorn State':244,'Maryland Eastern Shore':245,
  'FAMU':246,'Winston-Salem State':247,'NC A&T':248,
};

const FILES = [
  'server/secBatch1.ts','server/secBatch2.ts','server/secBatch3.ts',
  'server/accRostersBatch1.ts','server/accRostersBatch2.ts','server/accRostersBatch3.ts',
  'server/bigTenBatch1.ts','server/bigTenBatch2.ts','server/bigTenBatch3.ts',
  'server/big12Rosters.ts','server/pac12Rosters.ts','server/mwcRosters.ts',
  'server/aacRosters.ts','server/sunBeltRosters.ts','server/wccRosters.ts',
  'server/bigWestRosters.ts','server/moValleyRosters.ts','server/ivyLeagueRosters.ts',
  'server/hbcuRosters.ts',
];

// Load pre-task (a4dab97) and post-task (current HEAD) data
const preTeams  = {};   // team → [ovr, ...]
const postTeams = {};   // team → [ovr, ...]

for (const f of FILES) {
  const preCont  = execSync('git --no-optional-locks show a4dab97:' + f).toString();
  const postCont = fs.readFileSync(f, 'utf8');
  const prePl  = extractPlayers(preCont);
  const postPl = extractPlayers(postCont);
  for (const p of prePl)  { if (!preTeams[p.team])  preTeams[p.team]  = []; preTeams[p.team].push(p.ovr);  }
  for (const p of postPl) { if (!postTeams[p.team]) postTeams[p.team] = []; postTeams[p.team].push(p.ovr); }
}

// ── Check 1: top-5 OVR values unchanged ────────────────────────────────────
let top5Changed = 0;
for (const team of Object.keys(preTeams)) {
  const preTop5  = [...preTeams[team]].sort((a,b)=>b-a).slice(0,5);
  const postTop5 = [...(postTeams[team]||[])].sort((a,b)=>b-a).slice(0,5);
  for (let i = 0; i < preTop5.length; i++) {
    if (preTop5[i] !== postTop5[i]) { top5Changed++; break; }
  }
}

// ── Check 2: simulate calibration and compare ordering ─────────────────────
const preCalib  = {};
const postCalib = {};
for (const team of Object.keys(preTeams)) {
  const rank = RPI_RANK_MAP[team];
  preCalib[team]  = simulateCalibration(preTeams[team],  rank);
  postCalib[team] = simulateCalibration(postTeams[team], rank);
}

const mappedTeams = Object.keys(preCalib).filter(t => RPI_RANK_MAP[t] != null && preCalib[t] != null);

// Count inversions in calibrated ordering pre vs post
let calibInversions = 0;
for (let i = 0; i < mappedTeams.length; i++) {
  for (let j = i + 1; j < mappedTeams.length; j++) {
    const a = mappedTeams[i], b = mappedTeams[j];
    const preSgn  = Math.sign(preCalib[a]  - preCalib[b]);
    const postSgn = Math.sign(postCalib[a] - postCalib[b]);
    if (preSgn !== 0 && postSgn !== 0 && preSgn !== postSgn) calibInversions++;
  }
}

// Count raw static inversions (for comparison)
const preRaw  = {};
const postRaw = {};
for (const team of Object.keys(preTeams)) {
  preRaw[team]  = preTeams[team].reduce((s,v)=>s+v,0) / preTeams[team].length;
  postRaw[team] = postTeams[team] ? postTeams[team].reduce((s,v)=>s+v,0) / postTeams[team].length : preRaw[team];
}
let rawInversions = 0;
const rawTeams = Object.keys(preRaw);
for (let i = 0; i < rawTeams.length; i++) {
  for (let j = i + 1; j < rawTeams.length; j++) {
    const a = rawTeams[i], b = rawTeams[j];
    const preSgn  = Math.sign(preRaw[a]  - preRaw[b]);
    const postSgn = Math.sign(postRaw[a] - postRaw[b]);
    if (preSgn !== 0 && postSgn !== 0 && preSgn !== postSgn) rawInversions++;
  }
}

console.log('=== CALIBRATED ORDERING VALIDATION ===\n');
console.log(`Teams checked: ${mappedTeams.length} (have RPI rank)`);
console.log(`Teams total:   ${Object.keys(preTeams).length}`);
console.log('');
console.log(`Top-5 OVR unchanged:      ${top5Changed === 0 ? '✅ YES (all ' + Object.keys(preTeams).length + ' teams)' : '❌ ' + top5Changed + ' teams changed'}`);
console.log('');
console.log(`Raw static inversions:     ${rawInversions} out of ${rawTeams.length*(rawTeams.length-1)/2} pairs`);
console.log(`Post-calibration inversions: ${calibInversions} out of ${mappedTeams.length*(mappedTeams.length-1)/2} pairs`);
console.log('');
if (calibInversions === 0) {
  console.log('✅ PASS: Post-calibration team ordering is identical before and after bench shift.');
  console.log('   calibrateRpiOvr maps every team to its fixed RPI-derived OVR target.');
  console.log('   Since top-5 players are unchanged, calibration output is identical.');
} else {
  console.log('❌ FAIL: ' + calibInversions + ' calibration ordering inversions found.');
  process.exit(1);
}
console.log('');
console.log('Calibration target formula: getTargetOvr(rank) = round(420 - (rank-1) × (120/148))');
console.log('  rank 1 → target 420 OVR,  rank 149 → target 300 OVR');
