#!/usr/bin/env node
/**
 * assign-missing-abilities.cjs
 *
 * Assigns one contextually appropriate blue ability to exactly 150 three-star
 * (OVR 300-399) players that currently have an empty abilities array.
 *
 * Usage:
 *   node scripts/assign-missing-abilities.cjs           # live run
 *   node scripts/assign-missing-abilities.cjs --dry-run # preview only
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET  = 150;

// ---------------------------------------------------------------------------
// File → conference mapping (files included in ALL_REAL_ROSTERS)
// ---------------------------------------------------------------------------
const FILE_CONFERENCE = {
  'secBatch1.ts':        'SEC',
  'secBatch2.ts':        'SEC',
  'secBatch3.ts':        'SEC',
  'accRostersBatch1.ts': 'ACC',
  'accRostersBatch2.ts': 'ACC',
  'accRostersBatch3.ts': 'ACC',
  'bigTenBatch1.ts':     'Big Ten',
  'bigTenBatch2.ts':     'Big Ten',
  'bigTenBatch3.ts':     'Big Ten',
  'big12Rosters.ts':     'Big 12',
  'pac12Rosters.ts':     'Pac-12',
  'mwcRosters.ts':       'Pac-12',
  'aacRosters.ts':       'AAC',
  'sunBeltRosters.ts':   'Sun Belt',
  'wccRosters.ts':       'WCC',
  'bigWestRosters.ts':   'Big West',
  'moValleyRosters.ts':  'Missouri Valley',
  'ivyLeagueRosters.ts': 'Ivy League',
  'hbcuRosters.ts':      'HBCU',
};

const SERVER_DIR = path.join(__dirname, '..', 'server');

// ---------------------------------------------------------------------------
// OVR calculation (matches shared/abilities.ts calculateOVR, no ability bonus)
// ---------------------------------------------------------------------------
function computeOVR(p) {
  const isPitcher = p.position === 'P';
  if (isPitcher) {
    const pitchCore   = (p.velocity||0) + (p.control||0) + (p.stamina||0) + (p.stuff||0);
    const pitchField  = (p.arm||0)      + (p.fielding||0);
    const pitchCommon = (p.heater||0)   + (p.poise||0)   + (p.recovery||0) +
                        (p.wRISP||0)    + (p.vsLefty||0);
    return Math.max(150, Math.min(650,
      Math.round(pitchCore * 0.85 + pitchField * 0.20 + pitchCommon * 0.25)
    ));
  }
  // fielder / catcher / DH
  const hitCore   = (p.hitForAvg||0)    + (p.power||0)   + (p.speed||0)  +
                    (p.arm||0)          + (p.fielding||0) + (p.errorResistance||0);
  const hitCommon = (p.clutch||0)       + (p.vsLHP||0)   + (p.grit||0)   +
                    (p.stealing||0)     + (p.running||0)  + (p.throwing||0) +
                    (p.agile||0)        + (p.wRISP||0)    + (p.vsLefty||0);
  return Math.max(150, Math.min(650,
    Math.round(hitCore * 0.75 + hitCommon * 0.22)
  ));
}

// ---------------------------------------------------------------------------
// Attribute → contextual blue ability mapping
// ---------------------------------------------------------------------------
function pickAbility(p) {
  if (p.position === 'P') {
    const v = p.velocity || 0;
    const c = p.control  || 0;
    const s = p.stuff    || 0;
    if (v >= c && v >= s) return 'Heavy Ball';
    if (c >= s)           return 'Sharpness';
    return 'Tunneling';
  }
  // fielder / catcher / DH — pick highest primary offensive/defensive attribute
  const candidates = [
    { val: p.hitForAvg || 0, ability: 'Contact Hitter'    },
    { val: p.power     || 0, ability: 'Power Hitter'       },
    { val: p.fielding  || 0, ability: 'Defensive Artisan'  },
    { val: p.speed     || 0, ability: 'Spray Hitter'       },
    { val: p.arm       || 0, ability: 'Laser Beam'         },
  ];
  candidates.sort((a, b) => b.val - a.val);
  return candidates[0].ability;
}

// ---------------------------------------------------------------------------
// Parse: find all players with abilities: [] and extract their attributes.
// We scan for each `abilities: []` occurrence, then look backward to recover
// the most recent firstName/lastName/position/numeric attrs for that player.
// ---------------------------------------------------------------------------
function parsePlayers(content, fileName, conference) {
  const players = [];
  const abRe = /abilities:\s*\[\]/g;
  let m;

  while ((m = abRe.exec(content)) !== null) {
    const abPos   = m.index;
    // Look back up to 3 000 chars (longest realistic player object)
    const lookback = content.slice(Math.max(0, abPos - 3000), abPos);

    // Helper: find the LAST match of a regex in the lookback string
    function lastMatch(re) {
      let cur, result = null;
      const g = new RegExp(re.source, 'g');
      while ((cur = g.exec(lookback)) !== null) result = cur;
      return result;
    }

    const fn  = lastMatch(/firstName:\s*"([^"]+)"/);
    const ln  = lastMatch(/lastName:\s*"([^"]+)"/);
    const pos = lastMatch(/position:\s*"([^"]+)"/);
    if (!fn || !ln || !pos) continue;

    const firstName = fn[1];
    const lastName  = ln[1];
    const position  = pos[1];

    // Extract numeric attributes (last occurrence = current player)
    function numAttr(name) {
      const r = lastMatch(new RegExp(`\\b${name}:\\s*(\\d+)`));
      return r ? parseInt(r[1], 10) : 0;
    }

    const player = {
      firstName, lastName, position, conference,
      fileName,
      abilitiesPos: abPos,           // char offset in file for replacement
      abilitiesLen: m[0].length,     // length of matched text
      hitForAvg:     numAttr('hitForAvg'),
      power:         numAttr('power'),
      speed:         numAttr('speed'),
      arm:           numAttr('arm'),
      fielding:      numAttr('fielding'),
      errorResistance: numAttr('errorResistance'),
      velocity:      numAttr('velocity'),
      control:       numAttr('control'),
      stamina:       numAttr('stamina'),
      stuff:         numAttr('stuff'),
      clutch:        numAttr('clutch'),
      vsLHP:         numAttr('vsLHP'),
      grit:          numAttr('grit'),
      stealing:      numAttr('stealing'),
      running:       numAttr('running'),
      throwing:      numAttr('throwing'),
      recovery:      numAttr('recovery'),
      wRISP:         numAttr('wRISP'),
      vsLefty:       numAttr('vsLefty'),
      poise:         numAttr('poise'),
      heater:        numAttr('heater'),
      agile:         numAttr('agile'),
    };

    player.ovr = computeOVR(player);
    players.push(player);
  }

  return players;
}

// ---------------------------------------------------------------------------
// Proportional conference selection
// ---------------------------------------------------------------------------
function selectProportional(byConference, target) {
  // Count pool per conference
  const confs   = Object.keys(byConference);
  const total   = confs.reduce((s, c) => s + byConference[c].length, 0);

  if (total === 0) return [];

  // Floor allocations
  const allocs   = {};
  const fracs    = {};
  let   allocated = 0;

  for (const c of confs) {
    const exact = target * byConference[c].length / total;
    allocs[c]   = Math.floor(exact);
    fracs[c]    = exact - allocs[c];
    allocated  += allocs[c];
  }

  // Distribute remainder to highest fractional parts
  const remainder = target - allocated;
  const sorted    = [...confs].sort((a, b) => fracs[b] - fracs[a]);
  for (let i = 0; i < remainder; i++) {
    allocs[sorted[i]]++;
  }

  // For each conference pick the highest-OVR players up to the allocation
  const selected = [];
  for (const c of confs) {
    const pool = [...byConference[c]].sort((a, b) => b.ovr - a.ovr);
    const pick = Math.min(allocs[c], pool.length);
    selected.push(...pool.slice(0, pick));
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(`\n=== assign-missing-abilities${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Collect all zero-ability 3-star players
  const allPlayers = [];

  for (const [fileName, conference] of Object.entries(FILE_CONFERENCE)) {
    const filePath = path.join(SERVER_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`  SKIP (not found): ${fileName}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const players = parsePlayers(content, fileName, conference);

    // Filter to 3-star (OVR 300-399) — note: abilities: [] means no bonus yet
    const threeStar = players.filter(p => p.ovr >= 300 && p.ovr <= 399);
    allPlayers.push(...threeStar);
  }

  console.log(`Found ${allPlayers.length} zero-ability 3-star players across all files.\n`);

  // Group by conference
  const byConference = {};
  for (const p of allPlayers) {
    if (!byConference[p.conference]) byConference[p.conference] = [];
    byConference[p.conference].push(p);
  }

  // Print pool breakdown
  console.log('Pool breakdown by conference:');
  for (const [c, arr] of Object.entries(byConference)) {
    console.log(`  ${c.padEnd(18)} ${arr.length}`);
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${allPlayers.length}\n`);

  // Select 150 proportionally
  const effective = Math.min(TARGET, allPlayers.length);
  const selected  = selectProportional(byConference, effective);

  console.log(`Selected ${selected.length} players (target: ${effective}).\n`);

  // Print selection breakdown
  const selByConf = {};
  for (const p of selected) {
    selByConf[p.conference] = (selByConf[p.conference] || 0) + 1;
  }
  console.log('Selection breakdown by conference:');
  for (const [c, n] of Object.entries(selByConf)) {
    console.log(`  ${c.padEnd(18)} ${n}`);
  }
  console.log();

  // Group selected by file
  const byFile = {};
  for (const p of selected) {
    if (!byFile[p.fileName]) byFile[p.fileName] = [];
    byFile[p.fileName].push(p);
  }

  // Print per-player assignment
  console.log('Player assignments:');
  for (const p of selected.sort((a, b) => a.fileName.localeCompare(b.fileName) || b.ovr - a.ovr)) {
    const ability = pickAbility(p);
    console.log(`  [${p.fileName.padEnd(22)}] ${(p.firstName + ' ' + p.lastName).padEnd(24)} (${p.position}) OVR ${p.ovr} → "${ability}"`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('[DRY RUN] No files written. Re-run without --dry-run to apply.\n');
    return;
  }

  // Apply changes — process each file once, doing all replacements in reverse
  // order of position to preserve character offsets.
  let totalWritten = 0;

  for (const [fileName, players] of Object.entries(byFile)) {
    const filePath = path.join(SERVER_DIR, fileName);
    let content    = fs.readFileSync(filePath, 'utf8');

    // Sort descending by position so replacements don't shift earlier offsets
    const sorted = [...players].sort((a, b) => b.abilitiesPos - a.abilitiesPos);

    for (const p of sorted) {
      const ability = pickAbility(p);
      const before  = content.slice(0, p.abilitiesPos);
      const after   = content.slice(p.abilitiesPos + p.abilitiesLen);
      content       = before + `abilities: ["${ability}"]` + after;
      totalWritten++;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  Wrote ${players.length} update(s) → ${fileName}`);
  }

  console.log(`\n✓ Done. ${totalWritten} abilities assigned across ${Object.keys(byFile).length} file(s).\n`);
}

main();
