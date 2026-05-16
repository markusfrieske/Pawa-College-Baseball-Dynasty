'use strict';
const fs = require('fs');
const path = require('path');

// ============================================================
// WARNING: DO NOT RE-RUN THIS SCRIPT ON REAL ROSTER FILES.
//
// The 19 canonical roster files listed in PROTECTED_ROSTER_FILES
// below have had their handedness data partially audited and
// corrected:
//   - 77 pitcher LHP/RHP mismatches corrected from inline comments
//   - 13+ position-player fixes via Baseball Reference / team pages
//   - Remaining players retain probabilistic assignments pending
//     further individual verification (see handedness_coverage.csv)
//
// Re-running this script would OVERWRITE all corrections with
// fresh probabilistic assignments, erasing all research-backed
// accuracy work to date.
//
// This script is preserved for reference only.  Apply it ONLY
// to brand-new generated roster files, then manually verify.
// ============================================================


// ============================================================
// HARD-FAIL GUARD: Protected canonical roster files.
// This script will EXIT WITH CODE 1 if pointed at any of the
// 19 real roster files that have been individually audited.
// ============================================================
const PROTECTED_ROSTER_FILES = new Set([
  'secBatch1.ts', 'secBatch2.ts', 'secBatch3.ts',
  'accRostersBatch1.ts', 'accRostersBatch2.ts', 'accRostersBatch3.ts',
  'bigTenBatch1.ts', 'bigTenBatch2.ts', 'bigTenBatch3.ts',
  'big12Rosters.ts', 'pac12Rosters.ts', 'aacRosters.ts',
  'sunBeltRosters.ts', 'wccRosters.ts', 'mwcRosters.ts',
  'bigWestRosters.ts', 'moValleyRosters.ts', 'ivyLeagueRosters.ts',
  'hbcuRosters.ts',
]);

// Also block if target is listed in batchFiles array below
function checkProtected(filepath) {
  const basename = path.basename(filepath);
  if (PROTECTED_ROSTER_FILES.has(basename)) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ABORTED: Protected roster file detected.                    ║');
    console.error(`║  File: ${basename.padEnd(54)}║`);
    console.error('║  This file has been individually audited for handedness.     ║');
    console.error('║  Re-running would overwrite research-backed corrections.     ║');
    console.error('║  See scripts/apply-handedness.cjs header for details.       ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
}

// Deterministic hash so the same player always gets the same handedness
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

// Position-based realistic MLB/college distributions
// Pitcher throw:  ~70% R / 30% L
// Pitcher bat:    ~95% same as throw, ~4% opposite, ~1% switch (some pitchers cross-bat)
// Catcher throw:  ~99% R / 1% L
// Catcher bat:    ~80% R / 12% L / 8% S
// 1B throw:       ~95% R / 5% L (natural lefties gravitate to 1B)
// 1B bat:         ~45% L / 44% R / 11% S
// 2B throw:       100% R
// 2B bat:         ~65% R / 22% L / 13% S
// SS throw:       100% R
// SS bat:         ~62% R / 25% L / 13% S
// 3B throw:       100% R
// 3B bat:         ~67% R / 22% L / 11% S
// OF throw:       ~90% R / 10% L
// OF bat:         ~60% R / 28% L / 12% S
// DH throw:       ~80% R / 20% L
// DH bat:         ~60% R / 28% L / 12% S
function getHandedness(firstName, lastName, position) {
  const s1 = hash(firstName + '|' + lastName);
  const s2 = hash(lastName + '|' + firstName + '|bat');
  const s3 = hash(firstName + '|' + lastName + '|bat2');
  let throwHand, batHand;

  if (position === 'P') {
    throwHand = (s1 % 10) < 3 ? 'L' : 'R';
    // ~95% bat same side they throw, ~4% cross-bat, ~1% switch
    const b = s3 % 100;
    if (b < 95) {
      batHand = throwHand;
    } else if (b < 99) {
      batHand = throwHand === 'L' ? 'R' : 'L';
    } else {
      batHand = 'S';
    }
  } else if (position === 'C') {
    throwHand = (s1 % 100) < 99 ? 'R' : 'L';
    const b = s2 % 100;
    batHand = b < 80 ? 'R' : b < 92 ? 'L' : 'S';
  } else if (position === '1B') {
    throwHand = (s1 % 20) === 0 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 45 ? 'L' : b < 89 ? 'R' : 'S';
  } else if (position === '2B') {
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
    throwHand = (s1 % 10) === 0 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 60 ? 'R' : b < 88 ? 'L' : 'S';
  } else if (position === 'DH') {
    throwHand = (s1 % 5) === 0 ? 'L' : 'R';
    const b = s2 % 100;
    batHand = b < 60 ? 'R' : b < 88 ? 'L' : 'S';
  } else {
    throwHand = 'R';
    batHand = 'R';
  }

  return { throwHand, batHand };
}

function processFile(filepath) {
  checkProtected(filepath);
  const raw = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split('\n');
  const result = [];
  let changed = 0;

  let firstName = '';
  let lastName = '';
  let position = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip any existing throwHand/batHand lines (force-update mode)
    if (/^\s*throwHand:\s*"[LRS]",\s*batHand:\s*"[LRS]",\s*$/.test(line)) {
      changed++; // will be re-added after catcherAbility
      continue;
    }

    // Extract player info (firstName, lastName, position all on first line of each block)
    const fn = line.match(/firstName:\s*"([^"]+)"/);
    if (fn) firstName = fn[1];

    const ln = line.match(/lastName:\s*"([^"]+)"/);
    if (ln) lastName = ln[1];

    const pos = line.match(/position:\s*"([^"]+)"/);
    if (pos) position = pos[1];

    result.push(line);

    // After catcherAbility line, inject throwHand/batHand
    if (/catcherAbility:/.test(line)) {
      const indent = (line.match(/^(\s*)/) || ['', ''])[1];
      const { throwHand, batHand } = getHandedness(firstName, lastName, position);
      result.push(`${indent}throwHand: "${throwHand}", batHand: "${batHand}",`);
      // Don't count as changed if we just stripped and re-added same value;
      // changed was already incremented above if we stripped a line, otherwise increment now
      const nextLine = lines[i + 1] || '';
      if (!/throwHand:/.test(nextLine)) changed++; // fresh insertion
    }
  }

  fs.writeFileSync(filepath, result.join('\n'), 'utf8');
  console.log(`  ${path.basename(filepath)}: processed ${changed} players`);
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
console.log('Applying handedness to all roster batch files (force-update)...');
for (const rel of batchFiles) {
  const fp = path.join(root, rel);
  total += processFile(fp);
}
console.log(`\nDone. ${total} players processed.`);
