'use strict';
const fs = require('fs');
const path = require('path');

// Deterministic hash so the same player always gets the same handedness
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

// Position-based realistic MLB/college distributions
function getHandedness(firstName, lastName, position) {
  const s1 = hash(firstName + '|' + lastName);
  const s2 = hash(lastName + '|' + firstName + '|bat');
  let throwHand, batHand;

  if (position === 'P') {
    // ~30% LHP in college baseball
    throwHand = (s1 % 10) < 3 ? 'L' : 'R';
    batHand = throwHand; // pitchers bat same side they throw
  } else if (position === 'C') {
    // Catchers almost always throw right
    throwHand = 'R';
    const b = s2 % 100;
    batHand = b < 80 ? 'R' : b < 92 ? 'L' : 'S';
  } else if (position === '1B') {
    // ~5% LH-throwing 1B (natural lefties); ~45% bat left
    throwHand = (s1 % 20) === 0 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 45 ? 'L' : b < 89 ? 'R' : 'S';
  } else if (position === '2B') {
    // No left-handed throwing 2B
    throwHand = 'R';
    const b = s2 % 100;
    batHand = b < 65 ? 'R' : b < 87 ? 'L' : 'S';
  } else if (position === 'SS') {
    throwHand = 'R';
    const b = s2 % 100;
    batHand = b < 62 ? 'R' : b < 87 ? 'L' : 'S';
  } else if (position === '3B') {
    throwHand = 'R';
    const b = s2 % 100;
    batHand = b < 67 ? 'R' : b < 89 ? 'L' : 'S';
  } else if (position === 'OF') {
    // ~10% LH-throwing OF
    throwHand = (s1 % 10) === 0 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 60 ? 'R' : b < 88 ? 'L' : 'S';
  } else if (position === 'DH') {
    throwHand = (s1 % 10) < 2 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 60 ? 'R' : b < 88 ? 'L' : 'S';
  } else {
    throwHand = 'R';
    batHand = 'R';
  }

  return { throwHand, batHand };
}

function processFile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split('\n');
  const result = [];
  let changed = 0;

  let firstName = '';
  let lastName = '';
  let position = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract player info on the same line (all on first line of each player block)
    const fn = line.match(/firstName:\s*"([^"]+)"/);
    if (fn) firstName = fn[1];

    const ln = line.match(/lastName:\s*"([^"]+)"/);
    if (ln) lastName = ln[1];

    const pos = line.match(/position:\s*"([^"]+)"/);
    if (pos) position = pos[1];

    result.push(line);

    // After the catcherAbility line, inject throwHand/batHand if not already present
    if (/catcherAbility:/.test(line)) {
      const nextLine = lines[i + 1] || '';
      const alreadyHas = /throwHand:/.test(nextLine) || /batHand:/.test(nextLine);
      if (!alreadyHas) {
        const indent = (line.match(/^(\s*)/) || ['', ''])[1];
        const { throwHand, batHand } = getHandedness(firstName, lastName, position);
        result.push(`${indent}throwHand: "${throwHand}", batHand: "${batHand}",`);
        changed++;
      }
    }
  }

  if (changed > 0) {
    fs.writeFileSync(filepath, result.join('\n'), 'utf8');
    console.log(`  ${path.basename(filepath)}: added handedness to ${changed} players`);
  } else {
    console.log(`  ${path.basename(filepath)}: already up to date (0 changes)`);
  }
  return changed;
}

const batchFiles = [
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
  'server/aacRosters.ts',
  'server/sunBeltRosters.ts',
  'server/wccRosters.ts',
  'server/mwcRosters.ts',
  'server/bigWestRosters.ts',
  'server/moValleyRosters.ts',
  'server/ivyLeagueRosters.ts',
  'server/hbcuRosters.ts',
];

const root = path.join(__dirname, '..');
let total = 0;
console.log('Applying handedness to all roster batch files...');
for (const rel of batchFiles) {
  const fp = path.join(root, rel);
  total += processFile(fp);
}
console.log(`\nDone. ${total} players updated.`);
