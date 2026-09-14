/* Run from repository root: node docs/audits/2026-09-14/evidence/systems-baseball-probes.cjs
 * No npm dependencies, application imports, storage, network, or database access.
 * Requires Node >= 24 (node:module.stripTypeScriptTypes).
 * Extraction changes: erase TypeScript types and export keywords; remove only the
 * scheduler's type-only import. Execute actual pure function bodies unchanged.
 * Math.random in engine sandbox is deliberately replaced by the documented LCG.
 * All player IDs/attributes are synthetic. Catalog names/counts are actual source.
 * Output is written beside this script; no application files are modified.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { stripTypeScriptTypes } = require('node:module');
const repo = path.resolve(__dirname, '../../../..');
const hashes = {};
function read(file) {
  const content = fs.readFileSync(path.join(repo, file), 'utf8');
  hashes[file] = crypto.createHash('sha256').update(content).digest('hex');
  return content;
}
function extract(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Source extraction boundary missing: ' + start);
  return text.slice(a, b);
}
const src = read('server/routes/simulation.ts');
const sim = extract(src, 'function simulateGameWithRosters(', '// Build a philosophy string');
const box = extract(src, 'function generateBoxScore(', '// accumulatePlayerStats and computeLegacyScore');
const rest = read('shared/pitcherRest.ts').replace(/export /g, '');
let seed = 1;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const ctx = { Math: Object.create(Math) };
ctx.Math.random = random;
vm.createContext(ctx);
vm.runInContext(stripTypeScriptTypes(rest + '\n' + sim + '\n' + box), ctx);
const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const roster = prefix => [
  ...positions.map((position, i) => ({
    id: prefix + i, firstName: 'Test', lastName: 'B' + i, position,
    battingOrder: i + 1, overall: 300, hitForAvg: 60, power: 60, speed: 60, fielding: 60,
  })),
  ...['FRI', 'SAT', 'SUN', 'MID', 'MR1', 'MR2', 'CP'].map((pitchingRole, i) => ({
    id: prefix + 'p' + i, firstName: 'Test', lastName: 'P' + i, position: 'P',
    pitchingRole, overall: 300, velocity: 60, control: 60, stuff: 60, stamina: 60,
  })),
];
const home = roster('h'), away = roster('a');
const sum = (arr, key) => arr.reduce((s, p) => s + p[key], 0);
const outs = arr => arr.reduce((s, p) => s + Number(p.ip.split('.')[0]) * 3 + Number(p.ip.split('.')[1]), 0);
const mismatches = { pitchingOuts: 0, hits: 0, walks: 0, strikeouts: 0, hr: 0, playerRuns: 0 };
let firstSample;
for (let i = 0; i < 1000; i++) {
  const r = ctx.simulateGameWithRosters(home, away, 'friday', 5, 5, undefined, undefined, undefined, 1);
  const b = JSON.parse(r.boxScore);
  if (outs(b.home.pitching) !== 27 || outs(b.away.pitching) !== 27) mismatches.pitchingOuts++;
  if (sum(b.home.pitching, 'h') !== b.away.totals.h || sum(b.away.pitching, 'h') !== b.home.totals.h) mismatches.hits++;
  if (sum(b.home.pitching, 'bb') !== b.away.totals.bb || sum(b.away.pitching, 'bb') !== b.home.totals.bb) mismatches.walks++;
  if (sum(b.home.pitching, 'so') !== b.away.totals.so || sum(b.away.pitching, 'so') !== b.home.totals.so) mismatches.strikeouts++;
  if (sum(b.home.pitching, 'hr') !== b.away.totals.hr || sum(b.away.pitching, 'hr') !== b.home.totals.hr) mismatches.hr++;
  if (sum(b.home.batting, 'r') !== r.homeScore || sum(b.away.batting, 'r') !== r.awayScore) mismatches.playerRuns++;
  if (i === 0) firstSample = {
    scoreAwayHome: [r.awayScore, r.homeScore],
    homePitchingOuts: outs(b.home.pitching), awayPitchingOuts: outs(b.away.pitching),
    awayBattingHits: b.away.totals.h, homePitchingHits: sum(b.home.pitching, 'h'),
  };
}
seed = 42;
const original = ctx.simulateGameWithRosters(home, away, 'friday', 5, 5, undefined, 'balanced', 'balanced', 1);
seed = 42;
const reversed = ctx.simulateGameWithRosters(home.map(p => ({
  ...p, battingOrder: p.position === 'P' ? undefined : 10 - p.battingOrder,
})), away, 'friday', 5, 5, undefined, 'balanced', 'balanced', 1);
const tired = home.map(p => p.id === 'hp0' ? ({
  ...p, lastPitchedOuts: 27, lastPitchedWeek: 1, lastPitchedDay: 'WED', velocity: 99, control: 99, stuff: 99,
}) : p);
seed = 12;
const tiredResult = ctx.simulateGameWithRosters(tired, away, 'friday', 5, 5, undefined, undefined, undefined, 1);
const tiredBox = JSON.parse(tiredResult.boxScore);
const scheduleCtx = {};
vm.createContext(scheduleCtx);
for (const file of ['shared/catalog/conferences.ts', 'shared/catalog/teams.ts', 'server/services/schedule/fullSeasonScheduler.ts']) {
  const code = read(file).replace(/^import type .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(stripTypeScriptTypes(code), scheduleCtx);
}
const schedule = vm.runInContext(`(() => {
  const teams = CATALOG_TEAMS.map((t, i) => ({ id: 't' + i, name: t.name, conferenceId: t.conference }));
  const conferences = CONFERENCE_CATALOG.map(c => ({ id: c.name, name: c.name }));
  const games = buildFullSeasonSchedule({ leagueId: 'audit', season: 1, teams, conferences, seed: 0 });
  const buckets = new Map(), typeCounts = {};
  for (const g of games) {
    typeCounts[g.gameType] = (typeCounts[g.gameType] || 0) + 1;
    for (const id of [g.homeTeamId, g.awayTeamId]) {
      const key = id + '|' + g.week + '|' + g.gameType;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  const collisions = [...buckets].filter(([key, count]) => count > 1);
  return { teams: teams.length, games: games.length, typeCounts,
    validatorErrors: validateFullSeasonSchedule(games, teams),
    duplicateTeamWeekDaySlots: collisions.length,
    maxGamesInTeamWeekDay: Math.max(...buckets.values()),
    examples: collisions.slice(0, 5),
    midweekCollisions: collisions.filter(([key]) => key.endsWith('|midweek')).slice(0, 5),
  };
})()`, scheduleCtx);
const result = {
  sourceCommit: '8a1e113070c1e809da83cc66fc7eb84ffb9bec21', runtime: process.version,
  method: 'Actual extracted pure source, TypeScript stripping, synthetic fixtures, deterministic LCG, no app imports/DB',
  caveat: '27-out check uses current fixed-nine-full-innings generator; not a full baseball legality check. Starter expected hp1 is derived from inspected selection branch, not an instrumented returned field.',
  hashes, games: 1000, mismatches, firstSample,
  lineupReversalSameSeed: { originalHomeAway: [original.homeScore, original.awayScore], reversedHomeAway: [reversed.homeScore, reversed.awayScore] },
  restStarterMismatch: { scoringStarterExpectedFromSource: 'hp1 (rested SAT)', boxStarter: tiredBox.home.pitching[0].playerId },
  schedule,
};
fs.writeFileSync(path.join(__dirname, 'systems-baseball-probes.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
