/** Local, read-only visual fixture for the built game. No database or real accounts. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'dist/public');
const coach = { id: 'coach-demo', userId: 'demo', firstName: 'Alex', lastName: 'Morgan', level: 4, scouting: 65, evaluation: 62, pitching: 58, hitting: 66 };
const team = { id: 'home', leagueId: 'varsity-demo', name: 'Cedar Valley', city: 'Cedar Falls', state: 'IA', mascot: 'Stags', abbreviation: 'CV', primaryColor: '#244e40', secondaryColor: '#c5ab71', conferenceId: 'conf', prestige: 3, nilBudget: 150000, nilSpent: 35000, isCpu: false, coach, standings: { wins: 8, losses: 3, conferenceWins: 3, conferenceLosses: 1 } };
const opponent = { ...team, id: 'away', name: 'Bay State', abbreviation: 'BS', mascot: 'Herons', primaryColor: '#314964', secondaryColor: '#dae6ee', coach: { ...coach, id: 'other', userId: 'other', firstName: 'Jamie', lastName: 'Rivera' } };
const positions = ['SS', 'CF', 'C', '1B', '2B', '3B', 'LF', 'RF', 'DH', 'SP', 'SP', 'SP', 'RP', 'CP'];
const players = positions.map((position, i) => ({ id: `p${i}`, teamId: 'home', firstName: ['Jalen', 'Mateo', 'Noah', 'Eli', 'Andre', 'Kenji', 'Owen'][i % 7], lastName: ['Brooks', 'Rivera', 'Chen', 'Price', 'Walker', 'Sato', 'Lewis'][i % 7], position, jerseyNumber: i + 1, hometown: 'Cedar Falls', homeState: 'IA', batHand: 'R', throwHand: 'R', eligibility: ['FR', 'SO', 'JR', 'SR'][i % 4], overall: 380 + i * 7, starRating: 3, contact: 55, power: 62, speed: 69, armStrength: 58, fielding: 70, trajectory: 2, control: 57, stamina: 62, topSpeed: 89, velocity: 89, battingOrder: i < 9 ? i + 1 : null, pitchingRole: i >= 9 ? ['SP1', 'SP2', 'SP3', 'RP', 'CP'][i - 9] : null, bats: 'R', throws: 'R', skinTone: ['light', 'medium', 'tan', 'olive', 'dark', 'deep'][i % 6], hairColor: ['black', 'brown', 'red'][i % 3], hairStyle: ['short', 'curly', 'fade', 'mullet', 'buzz', 'long', 'bald'][i % 7], facialHair: 'none', abilities: [], breakingBalls: [], isCaptain: i === 0 }));
const game = { id: 'game-demo', week: 4, season: 2, phase: 'regular_season', homeTeamId: 'home', awayTeamId: 'away', homeTeam: team, awayTeam: opponent, homeScore: null, awayScore: null, isComplete: false, isConference: true, gameType: 'friday' };
const league = { id: 'varsity-demo', name: 'Varsity Club — visual fixture', commissionerId: 'demo', currentWeek: 4, currentSeason: 2, currentPhase: 'regular_season', dynastyPreset: 'full_season', gameMode: 'human_reported', simulationMode: 'human_reported', teams: [team, opponent], conferences: [{ id: 'conf', name: 'Coastal Conference', abbreviation: 'CC' }] };
const schedule = { games: [game], currentWeek: 4, currentSeason: 2, currentPhase: 'regular_season', userTeamId: 'home', humanTeamIds: ['home', 'away'], humanCoachNames: { home: 'Alex Morgan', away: 'Jamie Rivera' }, reportsByGameId: {}, isCommissioner: true };
const ready = { readyStatus: [team, opponent].map(t => ({ teamId: t.id, teamName: t.name, abbreviation: t.abbreviation, isHumanControlled: true, userId: t.coach.userId, isReady: false, hasReportedScores: false })), allHumansReady: false, humanCount: 2, readyCount: 0, currentPhase: 'regular_season', currentUserId: 'demo' };
const endpoints = {
  '/api/auth/me': { id: 'demo', email: 'fixture@example.invalid', firstName: 'Alex', lastName: 'Morgan' },
  '/api/leagues': [league], '/api/presence/online-count': { online: 2 },
  '/api/leagues/varsity-demo': league,
  '/api/leagues/varsity-demo/nil-earnings': { earnings: [], totalEarned: 0 },
  '/api/leagues/varsity-demo/recruiting': { recruits: players.slice(0, 5).map((p, i) => ({ ...p, id: 'r'+i, teamId: null, starRank: 3, classRank: i+1, hometown: 'Cedar Falls', homeState: 'IA', recruitType: 'high_school', stage: 'Open', topSchools: [], dramaTags: [], interest: { interestLevel: 35, scoutPercentage: 0, hasOffer: false, isTargeted: false } })), team, remainingPoints: 10, maxPoints: 10, pointsUsed: 0, remainingScoutPoints: 5, maxScoutPoints: 5, scoutPointsUsed: 0, recruitPointCosts: {}, targetedCount: 0, commitsCount: 0, maxCommits: 6, rosterDepth: {}, rosterSize: 14, nextYearDepth: {}, nextYearRosterSize: 11, seniorsGraduating: 3, premiumActionsUsed: {}, weeklyActionsUsed: {}, weeklyActionsWeek: 4, weeklyActionsSeason: 2, seasonVisitCount: { total: 0, campusVisits: 0, hcVisits: 0 }, autoPilotPendingAlert: [] },
  '/api/leagues/varsity-demo/schedule': schedule,
  '/api/leagues/varsity-demo/ready-status': ready,
  '/api/leagues/varsity-demo/roster': { players, team },
  '/api/leagues/varsity-demo/teams/home': { ...team, players, games: [game], record: team.standings },
  '/api/leagues/varsity-demo/games/game-demo': { game, homeTeam: team, awayTeam: opponent, reporting: { canReport: true, canSubmit: true, isCommissioner: true, canUseScoreOnly: true, source: 'human_reported' } },
  '/api/leagues/varsity-demo/games/game-demo/report': null,
  '/api/leagues/varsity-demo/dashboard-overview': { rosterSize: 14, eligibility: { FR: 4, SO: 4, JR: 3, SR: 3 }, positionCounts: { SP: 3, RP: 1, CP: 1, C: 1, SS: 1, CF: 1 }, positionsAtRisk: [], nilBudget: 150000, nilSpent: 35000, prestige: 3, recruitingSigned: 0, recruitingInterested: 4, averageOverall: 428, hitterAvg: 408, pitcherAvg: 457, starDist: { '3': 14 }, top5Players: [], topPlayer: null },
  '/api/leagues/varsity-demo/storylines': { storylines: [] },
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') { res.writeHead(405); res.end(JSON.stringify({ message: 'Read-only visual fixture. Changes are disabled.' })); return; }
    if (url.pathname.endsWith('/roster') && url.searchParams.has('teamId')) { res.end(JSON.stringify({ players, team: url.searchParams.get('teamId') === 'home' ? team : opponent })); return; }
    if (Object.hasOwn(endpoints, url.pathname)) { res.end(JSON.stringify(endpoints[url.pathname])); return; }
    res.writeHead(404); res.end(JSON.stringify({ message: 'This optional endpoint is outside the visual fixture.' })); return;
  }
  let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  if (!path.extname(file)) file = path.join(root, 'index.html');
  try {
    let content = fs.readFileSync(file);
    if (file.endsWith('index.html')) content = content.toString().replace('<body>', '<body><div style="position:relative;z-index:100;background:#c5ab71;color:#102c25;text-align:center;padding:6px;font:12px system-ui">VISUAL FIXTURE · Fictional league · Read-only · Optional panels may be unavailable</div>');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PAWA_PREVIEW_PORT || 49745), '127.0.0.1', () => console.log(`VARSITY_PREVIEW http://127.0.0.1:${server.address().port}/league/varsity-demo`));

export { server };
