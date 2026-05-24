/**
 * shift-bench-ovr.cjs  (rank-aware, deterministic, idempotent)
 *
 * Within each team, players are ranked by OVR descending (rank 0 = best).
 * ONLY players at RANKS 10–24 (bench/depth) whose OVR is in [250, 299]
 * are rescaled. Target is DETERMINISTIC: 249 − (ovr − 250), mapping
 *   250 → 249,  275 → 224,  299 → 200
 * All shifted players land in [200, 249] — the below-average band.
 *
 * Explicit eligibility guards (all must pass before any player is touched):
 *   rank >= 10  (not a top-lineup starter)
 *   rank <= 24  (valid roster depth slot; rosters are always 25 players)
 *   OVR >= 250  (in the target 250-299 band)
 *   OVR <  300  (300+ are always out of scope)
 *
 * Invariants reported at end:
 *   • changed players with pre-OVR <  250: must be 0
 *   • changed players with pre-OVR >= 300: must be 0
 *   • changed players at ranks 0-9:        must be 0
 *   • shifted players with post-OVR outside [200,249]: must be 0
 *
 * OVR formula: round(mainAttrSum × 0.6 + commonAttrSum × 0.25)
 */

'use strict';
const fs = require('fs');

const MAIN_ATTRS   = ['hitForAvg','power','speed','arm','fielding','errorResistance','velocity','control','stamina','stuff'];
const COMMON_ATTRS = ['clutch','vsLHP','grit','stealing','running','throwing','recovery','wRISP','vsLefty','poise','heater','agile'];
const ALL_ATTRS    = [...MAIN_ATTRS, ...COMMON_ATTRS];

function calcOVR(attrs) {
  let main = 0, common = 0;
  for (const a of MAIN_ATTRS)   main   += (attrs[a] || 0);
  for (const a of COMMON_ATTRS) common += (attrs[a] || 0);
  return Math.round(main * 0.6 + common * 0.25);
}

/** Deterministic target: linear mapping 250→249, 299→200 */
function targetOVR(ovr) {
  return Math.max(200, Math.min(249, 249 - (ovr - 250)));
}

const FILES = [
  'server/secBatch1.ts',   'server/secBatch2.ts',   'server/secBatch3.ts',
  'server/accRostersBatch1.ts','server/accRostersBatch2.ts','server/accRostersBatch3.ts',
  'server/bigTenBatch1.ts','server/bigTenBatch2.ts','server/bigTenBatch3.ts',
  'server/big12Rosters.ts','server/pac12Rosters.ts','server/mwcRosters.ts',
  'server/aacRosters.ts',  'server/sunBeltRosters.ts','server/wccRosters.ts',
  'server/bigWestRosters.ts','server/moValleyRosters.ts','server/ivyLeagueRosters.ts',
  'server/hbcuRosters.ts',
];

const G = { total: 0, shifted: 0, skip300: 0, skipTop9: 0, skipBelow: 0, skipRank25: 0,
            violations: 0, changedLt250: 0, changed300plus: 0, changedTop9: 0,
            elite: 0, aboveAvg: 0, avg: 0, belowAvg: 0 };

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const players = [];
  let currentTeam = null;

  for (let i = 0; i < lines.length; i++) {
    const tm = lines[i].match(/"([^"]+)":\s*\[/);
    if (tm) currentTeam = tm[1];
    if (lines[i].includes('hitForAvg:') && lines[i].includes('power:')) {
      const attrs = {};
      const bS = Math.max(0, i), bE = Math.min(lines.length - 1, i + 2);
      for (let j = bS; j <= bE; j++) {
        for (const a of ALL_ATTRS) {
          const m = lines[j].match(new RegExp(a + ':\\s*(\\d+)'));
          if (m) attrs[a] = parseInt(m[1]);
        }
      }
      players.push({ team: currentTeam, attrLine: i, bS, bE, attrs });
    }
  }

  // Rank within each team by OVR desc (rank 0 = best)
  const byTeam = {};
  for (const p of players) {
    if (!byTeam[p.team]) byTeam[p.team] = [];
    byTeam[p.team].push(p);
  }
  for (const tp of Object.values(byTeam)) {
    tp.sort((a, b) => calcOVR(b.attrs) - calcOVR(a.attrs));
    tp.forEach((p, r) => { p.rank = r; });
  }

  let fileShifted = 0;

  for (const p of players) {
    const preOVR = calcOVR(p.attrs);
    G.total++;

    // --- Eligibility guards (all must pass) ---
    if (preOVR >= 300)  { G.skip300++;   continue; }
    if (p.rank < 10)    { G.skipTop9++;  continue; }
    if (p.rank > 24)    { G.skipRank25++; continue; }  // explicit upper bound
    if (preOVR < 250)   { G.skipBelow++; continue; }

    // --- Apply deterministic scale ---
    const tgt   = targetOVR(preOVR);
    const scale = tgt / preOVR;

    for (let j = p.bS; j <= p.bE; j++) {
      for (const a of ALL_ATTRS) {
        const rx = new RegExp(`(${a}:\\s*)(\\d+)`);
        const m  = lines[j].match(rx);
        if (m) {
          const v = parseInt(m[2]);
          if (v === 0) continue;
          lines[j] = lines[j].replace(rx, `$1${Math.max(1, Math.min(99, Math.round(v * scale)))}`);
        }
      }
      const crx = /(catcherAbility:\s*)(\d+)/;
      const cm  = lines[j].match(crx);
      if (cm && parseInt(cm[2]) > 0) {
        lines[j] = lines[j].replace(crx, `$1${Math.max(1, Math.min(99, Math.round(parseInt(cm[2]) * scale)))}`);
      }
    }

    // Post-scale clamp: nudge down if rounding pushed OVR back to 250+
    for (let attempt = 0; attempt < 5; attempt++) {
      const ca = {};
      for (let j = p.bS; j <= p.bE; j++) {
        for (const a of ALL_ATTRS) {
          const m = lines[j].match(new RegExp(a + ':\\s*(\\d+)'));
          if (m) ca[a] = parseInt(m[1]);
        }
      }
      if (calcOVR(ca) < 250) break;
      let nudged = false;
      for (const a of MAIN_ATTRS) {
        if ((ca[a] || 0) > 1) {
          for (let j = p.bS; j <= p.bE; j++) {
            const rx = new RegExp(`(${a}:\\s*)(\\d+)`);
            const m  = lines[j].match(rx);
            if (m && parseInt(m[2]) > 1) {
              lines[j] = lines[j].replace(rx, `$1${parseInt(m[2]) - 1}`);
              nudged = true; break;
            }
          }
          if (nudged) break;
        }
      }
      if (!nudged) break;
    }

    G.shifted++;
    fileShifted++;

    // --- Post-write invariant check ---
    const na = {};
    for (let j = p.bS; j <= p.bE; j++) {
      for (const a of ALL_ATTRS) {
        const m = lines[j].match(new RegExp(a + ':\\s*(\\d+)'));
        if (m) na[a] = parseInt(m[1]);
      }
    }
    const postOVR = calcOVR(na);
    if (postOVR < 200 || postOVR >= 250) G.violations++;

    // Invariant counters (must stay 0)
    if (preOVR < 250)   G.changedLt250++;
    if (preOVR >= 300)  G.changed300plus++;
    if (p.rank < 10)    G.changedTop9++;
  }

  fs.writeFileSync(filePath, lines.join('\n'));

  // Per-file distribution
  const fc = fs.readFileSync(filePath, 'utf8').split('\n');
  let fE = 0, fA = 0, fAv = 0, fB = 0;
  for (let i = 0; i < fc.length; i++) {
    if (!fc[i].includes('hitForAvg:') || !fc[i].includes('power:')) continue;
    const a = {};
    for (let j = Math.max(0, i); j <= Math.min(fc.length - 1, i + 2); j++) {
      for (const attr of ALL_ATTRS) {
        const m = fc[j].match(new RegExp(attr + ':\\s*(\\d+)'));
        if (m) a[attr] = parseInt(m[1]);
      }
    }
    const o = calcOVR(a);
    if (o >= 500) { fE++; G.elite++; }
    else if (o >= 350) { fA++; G.aboveAvg++; }
    else if (o >= 250) { fAv++; G.avg++; }
    else { fB++; G.belowAvg++; }
  }
  console.log(`${filePath}: ${fE+fA+fAv+fB}p | shifted: ${fileShifted} | elite: ${fE} | above: ${fA} | avg: ${fAv} | below: ${fB}`);
}

console.log('=== RANK-AWARE BENCH OVR SHIFT (deterministic) ===\n');
console.log('Rule: ranks 10-24 (explicit: rank>=10 && rank<=24) with OVR [250,299]');
console.log('      Target: 249-(ovr-250)  →  250→249, 275→224, 299→200');
console.log('      ranks 0-9    → UNCHANGED  |  OVR>=300 → UNCHANGED  |  OVR<250 → UNCHANGED\n');

for (const file of FILES) {
  try { processFile(file); }
  catch (e) { console.error(`Error processing ${file}: ${e.message}`); }
}

const tot = G.elite + G.aboveAvg + G.avg + G.belowAvg;
console.log('\n=== SUMMARY ===');
console.log(`Total players scanned:           ${G.total}`);
console.log(`Shifted (bench 250-299 → 200-249): ${G.shifted}`);
console.log(`Skipped OVR>=300:                ${G.skip300}`);
console.log(`Skipped rank 0-9 (top lineup):   ${G.skipTop9}`);
console.log(`Skipped rank >24 (out of bounds): ${G.skipRank25}`);
console.log(`Skipped OVR<250 (already below):  ${G.skipBelow}`);

console.log('\n=== PRE/POST INVARIANTS (all must be 0) ===');
console.log(`Changed players pre-OVR <250:    ${G.changedLt250}  ${G.changedLt250   === 0 ? '✅' : '❌'}`);
console.log(`Changed players pre-OVR >=300:   ${G.changed300plus} ${G.changed300plus === 0 ? '✅' : '❌'}`);
console.log(`Changed players at ranks 0-9:    ${G.changedTop9}  ${G.changedTop9    === 0 ? '✅' : '❌'}`);
console.log(`Post-shift OVR outside [200,249]: ${G.violations}  ${G.violations     === 0 ? '✅' : '❌'}`);

console.log('\n=== FINAL GLOBAL DISTRIBUTION ===');
console.log(`Total: ${tot}`);
console.log(`Elite (500+):        ${G.elite}   (${(G.elite/tot*100).toFixed(1)}%) [target <3%]`);
console.log(`Above Avg (350-499): ${G.aboveAvg} (${(G.aboveAvg/tot*100).toFixed(1)}%) [target <17%]`);
console.log(`Average (250-349):   ${G.avg} (${(G.avg/tot*100).toFixed(1)}%)`);
console.log(`Below Avg (<250):    ${G.belowAvg} (${(G.belowAvg/tot*100).toFixed(1)}%)`);
