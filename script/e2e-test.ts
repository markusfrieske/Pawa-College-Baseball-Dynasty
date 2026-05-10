/**
 * End-to-end test that drives a 10-team, CPU-only, 5-season dynasty
 * against the running dev server (http://localhost:5000).
 *
 * Conference mix is intentional: the new tier-2/3/5 conferences
 * (AAC / WCC / Mountain West) plus established SEC teams, to exercise
 * both the recently-added roster files and the existing ones in the
 * same loop.
 *
 * Run with: `npx tsx script/e2e-test.ts`
 *   E2E_BASE_URL  override server URL (default http://localhost:5000)
 *   E2E_SEASONS   override season count (default 5)
 *   E2E_LOG       override log file path (default /tmp/e2e.log)
 *
 * Environment assumptions:
 *   - DATABASE_URL must be set. The script connects directly to flip
 *     the seed team back to is_cpu=true (so the run is genuinely
 *     CPU-only) and to count drafted players, recruit-pool size,
 *     transfer-portal recruits, JUCO recruits, recruits-signed, and
 *     total games simmed. Without it those metrics report 0 and the
 *     CPU-only flip will throw.
 *   - The Replit "Start application" workflow writes its console
 *     output to /tmp/logs/Start_application_*.log, which is the only
 *     place server-side `[recruiting-sanity]` warnings are visible.
 *     If that directory is missing or empty the script logs a loud
 *     WARNING line and the "0 warnings" count below it should not be
 *     trusted.
 */

import { appendFileSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

const BASE: string = process.env.E2E_BASE_URL || "http://localhost:5000";
const SEASONS_TO_RUN: number = parseInt(process.env.E2E_SEASONS || "5", 10);
const LOG_PATH: string = process.env.E2E_LOG || "/tmp/e2e.log";
const SERVER_LOG_DIR: string = "/tmp/logs";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject { [k: string]: JsonValue | undefined }

interface Conference { id: string; leagueId: string; name: string }
interface Coach { id: string; firstName: string; lastName: string; userId?: string | null }
interface Standings { teamId: string; wins: number; losses: number }
interface Team {
  id: string;
  leagueId: string;
  name: string;
  abbreviation: string;
  isCpu: boolean;
  conferenceId: string;
  walkonReady?: boolean;
  departuresFinalized?: boolean;
  standings?: Standings;
  coach?: Coach | null;
}
interface League {
  id: string;
  name: string;
  currentSeason: number;
  currentPhase: string;
  currentWeek: number;
  teams: Team[];
  conferences: Conference[];
}
interface PostseasonGame {
  id: string;
  phase: string;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
}
interface PostseasonResponse {
  phase: string;
  season: number;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
}
interface AwardsResponse { awardsAvailable: boolean; currentPhase?: string; season?: number }
interface DynastyHistorySeason { season: number; cwsChampion: { name: string } | null }
interface DynastyHistoryResponse { seasons: DynastyHistorySeason[] }
interface PlayersResponse { players: { id: string }[] }
interface AdvanceResponse { currentPhase: string; currentSeason: number }
interface SetupResponse { teams: Team[]; conferences: Conference[]; league: League }
interface TeamSelectionResponse { conferences: Conference[] }
interface CreateLeagueResponse { id: string }
interface SelectTeamsResponse { teamsCreated: number }

let cookie = "";

async function apiOnce<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Connection": "close",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  };
  const res = await fetch(`${BASE}${path}`, init);
  const headersAny = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookie: string[] = typeof headersAny.getSetCookie === "function"
    ? headersAny.getSetCookie()
    : [res.headers.get("set-cookie")].filter((v): v is string => Boolean(v));
  if (setCookie.length) {
    cookie = setCookie.map(c => c.split(";")[0].trim()).join("; ");
  }
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === "object" ? JSON.stringify(data) : String(data)}`);
  }
  return data as T;
}

async function api<T>(method: string, path: string, body?: unknown, timeoutMs = 60000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await apiOnce<T>(method, path, body, timeoutMs);
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ! ${method} ${path} attempt ${attempt} failed: ${msg}`);
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

interface ConfTeams { conferenceName: string; teamNames: string[] }

// New + old conference mix:
//   SEC       — established (tier 1, existing rosters)
//   AAC       — newly added (tier 2)
//   WCC       — newly added (tier 3)
//   Mountain West — newly added (tier 3)
const TEAM_SELECTION: ConfTeams[] = [
  { conferenceName: "SEC",           teamNames: ["LSU", "Tennessee", "Vanderbilt"] },
  { conferenceName: "AAC",           teamNames: ["East Carolina", "Wichita State", "Dallas Baptist"] },
  { conferenceName: "WCC",           teamNames: ["Gonzaga", "Pepperdine"] },
  { conferenceName: "Mountain West", teamNames: ["Fresno State", "San Diego State"] },
];

const TOTAL_TEAMS: number = TEAM_SELECTION.reduce((s, c) => s + c.teamNames.length, 0);

writeFileSync(LOG_PATH, "");
function log(msg: string): void {
  const t = new Date().toISOString().substring(11, 19);
  const line = `[${t}] ${msg}\n`;
  try { appendFileSync(LOG_PATH, line); } catch { /* best effort */ }
  try { process.stdout.write(line); } catch { /* best effort */ }
}
process.on("unhandledRejection", (r: unknown) => {
  const msg = r instanceof Error ? (r.stack || r.message) : String(r);
  log(`UNHANDLED REJECTION: ${msg}`);
});
process.on("uncaughtException", (r: unknown) => {
  const msg = r instanceof Error ? (r.stack || r.message) : String(r);
  log(`UNCAUGHT EXCEPTION: ${msg}`);
});

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const pgPool: Pool | null = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function flipTeamToCpu(teamId: string): Promise<void> {
  if (!pgPool) throw new Error("DATABASE_URL not set; cannot flip seed team to CPU");
  await pgPool.query(`UPDATE teams SET is_cpu = true, coach_id = NULL WHERE id = $1`, [teamId]);
}

async function getLeague(leagueId: string): Promise<League> {
  return api<League>("GET", `/api/leagues/${leagueId}`);
}

async function assertAllRostersAt25(leagueId: string, label: string): Promise<void> {
  const lg = await getLeague(leagueId);
  for (const t of lg.teams) {
    const td = await api<PlayersResponse>("GET", `/api/leagues/${leagueId}/teams/${t.id}`);
    assert(td.players.length === 25, `${label}: ${t.name} has ${td.players.length} players (expected 25)`);
  }
  log(`  ✓ ${label}: all ${lg.teams.length} rosters at 25`);
}

interface SeasonReport {
  season: number;
  champion: string;
  postseasonGames: number;
  regularSeasonGames: number;
  totalGamesThisSeason: number;
  recruitsSignedThisSeason: number;
  draftedThisSeason: number;
  recruitsInPool: number;
  transferRecruits: number;
  jucoRecruits: number;
}

async function countDraftedFor(leagueId: string, season: number): Promise<number> {
  if (!pgPool) return 0;
  const r = await pgPool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM player_history
     WHERE league_id = $1 AND departed_season = $2 AND draft_round IS NOT NULL`,
    [leagueId, season],
  );
  return r.rows[0]?.n ?? 0;
}
async function countRegularSeasonGames(leagueId: string, season: number): Promise<number> {
  if (!pgPool) return 0;
  const r = await pgPool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM games
     WHERE league_id = $1 AND season = $2 AND is_complete = true AND phase = 'regular'`,
    [leagueId, season],
  );
  return r.rows[0]?.n ?? 0;
}
async function countAllCompletedGames(leagueId: string): Promise<number> {
  if (!pgPool) return 0;
  const r = await pgPool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM games WHERE league_id = $1 AND is_complete = true`,
    [leagueId],
  );
  return r.rows[0]?.n ?? 0;
}
async function countRecruitsSigned(leagueId: string): Promise<number> {
  if (!pgPool) return 0;
  const r = await pgPool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1 AND signed_team_id IS NOT NULL`,
    [leagueId],
  );
  return r.rows[0]?.n ?? 0;
}
async function countRecruits(leagueId: string, recruitType?: string): Promise<number> {
  if (!pgPool) return 0;
  if (recruitType) {
    const r = await pgPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1 AND recruit_type = $2`,
      [leagueId, recruitType],
    );
    return r.rows[0]?.n ?? 0;
  }
  const r = await pgPool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1`,
    [leagueId],
  );
  return r.rows[0]?.n ?? 0;
}

async function runSeason(leagueId: string, seasonNum: number): Promise<SeasonReport> {
  log(`=== Season ${seasonNum}: starting (sim-to-offseason) ===`);

  const sim = await api<AdvanceResponse>("POST", `/api/leagues/${leagueId}/sim-to-offseason`);
  log(`  → reached phase=${sim.currentPhase}, season=${sim.currentSeason}`);
  assert(sim.currentPhase === "offseason_departures", `Expected offseason_departures, got ${sim.currentPhase}`);
  assert(sim.currentSeason === seasonNum, `Expected season ${seasonNum}, got ${sim.currentSeason}`);

  const post = await api<PostseasonResponse>("GET", `/api/leagues/${leagueId}/postseason?season=${seasonNum}`);
  assert(post.cws.length > 0, `Season ${seasonNum}: no CWS games`);
  assert(post.superRegionals.length > 0, `Season ${seasonNum}: no super-regional games`);
  assert(post.conferenceChampionships.length > 0, `Season ${seasonNum}: no conference-championship games`);

  const wins: Record<string, number> = {};
  for (const g of post.cws) {
    if (g.isComplete && g.homeScore !== null && g.awayScore !== null) {
      const winner = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
      wins[winner] = (wins[winner] || 0) + 1;
    }
  }
  const champEntry = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  assert(champEntry !== undefined, `Season ${seasonNum}: no CWS winner`);
  const lg = await getLeague(leagueId);
  const champTeam = lg.teams.find(t => t.id === champEntry[0]);
  const champion: string = champTeam ? champTeam.name : champEntry[0];
  log(`  → champion: ${champion} (${champEntry[1]} CWS wins)`);

  const standingsCount = lg.teams.filter(t => t.standings !== undefined).length;
  assert(standingsCount === TOTAL_TEAMS, `Season ${seasonNum}: standings populated for ${standingsCount}/${TOTAL_TEAMS} teams`);

  const awards = await api<AwardsResponse>("GET", `/api/leagues/${leagueId}/season-awards`);
  assert(awards.awardsAvailable === true, `Season ${seasonNum}: awards not available (phase=${awards.currentPhase})`);

  const history = await api<DynastyHistoryResponse>("GET", `/api/leagues/${leagueId}/dynasty-history`);
  assert(Array.isArray(history.seasons), `Season ${seasonNum}: dynasty-history missing seasons array`);
  const completed = history.seasons.filter(s => s.cwsChampion).length;
  assert(completed >= seasonNum, `Season ${seasonNum}: dynasty-history shows only ${completed} completed seasons`);

  log(`  → finalizing departures`);
  await api("POST", `/api/leagues/${leagueId}/departures/finalize`);

  // Walk every offseason phase; record which sub-phases we observed so we can
  // strictly assert that signing day and walk-ons both happened this season.
  // Snapshot the recruits-signed count while we're still in signing_day, since
  // the recruits table is wiped before the next preseason.
  const phasesSeen = new Set<string>();
  let signedThisSeason = 0;
  let cur = await api<AdvanceResponse>("POST", `/api/leagues/${leagueId}/advance`);
  phasesSeen.add(cur.currentPhase);
  log(`     phase=${cur.currentPhase}`);
  if (cur.currentPhase === "offseason_signing_day") signedThisSeason = await countRecruitsSigned(leagueId);
  for (let i = 0; i < 20 && cur.currentPhase !== "preseason"; i++) {
    cur = await api<AdvanceResponse>("POST", `/api/leagues/${leagueId}/advance`);
    phasesSeen.add(cur.currentPhase);
    log(`     phase=${cur.currentPhase}${cur.currentPhase === "preseason" ? `, season=${cur.currentSeason}` : ""}`);
    if (cur.currentPhase === "offseason_signing_day") signedThisSeason = await countRecruitsSigned(leagueId);
  }
  assert(phasesSeen.has("offseason_signing_day"), `Season ${seasonNum}: offseason_signing_day phase was skipped`);
  assert(phasesSeen.has("offseason_walkons"), `Season ${seasonNum}: offseason_walkons phase was skipped`);
  assert(cur.currentPhase === "preseason", `Did not reach preseason after offseason; got ${cur.currentPhase}`);
  assert(cur.currentSeason === seasonNum + 1, `Expected season ${seasonNum + 1}, got ${cur.currentSeason}`);

  // Per-season roster integrity (after walkons returned everyone to 25)
  await assertAllRostersAt25(leagueId, `Season ${seasonNum} end`);

  const postseasonGames = post.cws.length + post.superRegionals.length + post.conferenceChampionships.length;
  const regularSeasonGames = await countRegularSeasonGames(leagueId, seasonNum);
  return {
    season: seasonNum,
    champion,
    postseasonGames,
    regularSeasonGames,
    totalGamesThisSeason: regularSeasonGames + postseasonGames,
    recruitsSignedThisSeason: signedThisSeason,
    draftedThisSeason: await countDraftedFor(leagueId, seasonNum),
    recruitsInPool: await countRecruits(leagueId),
    transferRecruits: await countRecruits(leagueId, "transfer"),
    jucoRecruits: await countRecruits(leagueId, "juco"),
  };
}

interface SanityScan { totalWarnings: number; firstFew: string[]; filesScanned: number; scanError?: string }

function scanRecruitingSanityWarnings(): SanityScan {
  const warnings: string[] = [];
  let filesScanned = 0;
  try {
    const files = readdirSync(SERVER_LOG_DIR)
      .filter(f => f.startsWith("Start_application_") && f.endsWith(".log"))
      .map(f => ({ f, mtime: statSync(join(SERVER_LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3);
    for (const { f } of files) {
      const text = readFileSync(join(SERVER_LOG_DIR, f), "utf8");
      filesScanned++;
      for (const line of text.split("\n")) {
        if (line.includes("[recruiting-sanity]")) warnings.push(line.trim());
      }
    }
    return { totalWarnings: warnings.length, firstFew: warnings.slice(0, 5), filesScanned };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { totalWarnings: 0, firstFew: [], filesScanned: 0, scanError: msg };
  }
}

async function main(): Promise<void> {
  log(`E2E test starting against ${BASE}`);
  log(`Target: ${TOTAL_TEAMS} teams (CPU-only), ${SEASONS_TO_RUN} seasons, standard length, default difficulty`);
  log(`Conferences: ${TEAM_SELECTION.map(c => `${c.conferenceName}(${c.teamNames.length})`).join(", ")}`);

  log("Authenticating as guest");
  await api("POST", "/api/auth/guest");

  const leagueName = `E2E-${Date.now()}`;
  log(`Creating league "${leagueName}" (seasonLength=medium, default difficulty)`);
  const created = await api<CreateLeagueResponse>("POST", "/api/leagues", {
    name: leagueName,
    maxTeams: TOTAL_TEAMS,
    selectedConferences: TEAM_SELECTION.map(c => c.conferenceName),
    seasonLength: "medium",
    progressionEnabled: false,
  });
  log(`  → league id ${created.id}`);

  const setupData = await api<TeamSelectionResponse>("GET", `/api/leagues/${created.id}/team-selection`);
  const confIdByName = new Map<string, string>();
  for (const c of setupData.conferences) confIdByName.set(c.name, c.id);

  log("Selecting teams");
  const selectedTeams = TEAM_SELECTION.map(c => {
    const confId = confIdByName.get(c.conferenceName);
    if (!confId) throw new Error(`Conference not found in league: ${c.conferenceName}`);
    return { conferenceId: confId, teamNames: c.teamNames };
  });
  const sel = await api<SelectTeamsResponse>("POST", `/api/leagues/${created.id}/team-selection`, { selectedTeams });
  assert(sel.teamsCreated === TOTAL_TEAMS, `Expected ${TOTAL_TEAMS} teams created, got ${sel.teamsCreated}`);
  log(`  → ${sel.teamsCreated} teams created`);

  const setup2 = await api<SetupResponse>("GET", `/api/leagues/${created.id}/setup`);
  const seedTeam = setup2.teams[0];
  log(`Picking ${seedTeam.name} for setup (rosters + schedule generation)`);
  await api("POST", `/api/leagues/${created.id}/setup`, {
    teamId: seedTeam.id,
    coach: { firstName: "Test", lastName: "Coach", archetype: "Balanced" },
  });

  log(`  → flipping ${seedTeam.name} back to CPU (this is a CPU-only run)`);
  await flipTeamToCpu(seedTeam.id);

  log("Starting dynasty (dynasty_setup → preseason)");
  await api("POST", `/api/leagues/${created.id}/start`, {});

  // Hard CPU-only assertion after the seed-team flip + dynasty start.
  const cpuCheck = await getLeague(created.id);
  const humanTeams = cpuCheck.teams.filter(t => !t.isCpu);
  assert(humanTeams.length === 0, `CPU-only run violated: ${humanTeams.map(t => t.name).join(", ")} still human-controlled`);
  log(`  ✓ CPU-only verified: all ${cpuCheck.teams.length} teams have isCpu=true`);

  await assertAllRostersAt25(created.id, "Initial");

  const seasonReports: SeasonReport[] = [];
  for (let s = 1; s <= SEASONS_TO_RUN; s++) {
    seasonReports.push(await runSeason(created.id, s));
  }

  log("");
  log("============= FINAL REPORT =============");
  const finalLeague = await getLeague(created.id);
  log(`League phase: ${finalLeague.currentPhase}, season: ${finalLeague.currentSeason}`);
  log(`Teams in league: ${finalLeague.teams.length}`);
  log("");
  log("Per-season summary:");
  for (const r of seasonReports) {
    log(`  Season ${r.season}: champion=${r.champion}, games=${r.totalGamesThisSeason} (reg=${r.regularSeasonGames}, post=${r.postseasonGames}), signed=${r.recruitsSignedThisSeason}, drafted=${r.draftedThisSeason}, recruitsPool=${r.recruitsInPool}, transfers=${r.transferRecruits}, juco=${r.jucoRecruits}`);
  }

  log("");
  log("Final roster sizes:");
  let bad = 0;
  for (const t of finalLeague.teams) {
    const td = await api<PlayersResponse>("GET", `/api/leagues/${finalLeague.id}/teams/${t.id}`);
    log(`  ${t.name}: ${td.players.length} players`);
    if (td.players.length !== 25) bad++;
  }
  assert(bad === 0, `${bad} teams not at 25 players`);

  if (pgPool) {
    const totalDrafted = await pgPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM player_history WHERE league_id = $1 AND draft_round IS NOT NULL`,
      [finalLeague.id],
    );
    const totalTransfers = await pgPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM player_history WHERE league_id = $1 AND departure_type = 'transfer'`,
      [finalLeague.id],
    );
    const totalGames = await countAllCompletedGames(finalLeague.id);
    const totalSigned = seasonReports.reduce((s, r) => s + r.recruitsSignedThisSeason, 0);
    log("");
    log("Aggregate over run:");
    log(`  Total games simmed (all phases): ${totalGames}`);
    log(`  Total recruits signed (all seasons): ${totalSigned}`);
    log(`  Total MLB draftees: ${totalDrafted.rows[0].n}`);
    log(`  Total transfers (departures): ${totalTransfers.rows[0].n}`);
    log(`  Current recruits in pool: ${await countRecruits(finalLeague.id)}`);
    log(`  Transfer-portal recruits: ${await countRecruits(finalLeague.id, "transfer")}`);
    log(`  JUCO recruits: ${await countRecruits(finalLeague.id, "juco")}`);
    assert(totalDrafted.rows[0].n > 0, "No MLB draftees recorded across run");
    assert(totalGames > 0, "No completed games recorded across run");
  }

  const history = await api<DynastyHistoryResponse>("GET", `/api/leagues/${finalLeague.id}/dynasty-history`);
  const completed = history.seasons.filter(s => s.cwsChampion).length;
  log(`Dynasty history: ${completed} seasons with CWS champions`);
  assert(completed >= SEASONS_TO_RUN, `Dynasty history has ${completed} completed seasons; expected ≥ ${SEASONS_TO_RUN}`);

  log("");
  const sanity = scanRecruitingSanityWarnings();
  if (sanity.scanError || sanity.filesScanned === 0) {
    log(`!!! WARNING: could not scan ${SERVER_LOG_DIR} for [recruiting-sanity] lines: ${sanity.scanError || "no Start_application_*.log files found"}`);
    log(`           sanity-warning count of 0 below should NOT be trusted for this run.`);
  }
  log(`[recruiting-sanity] warnings detected in server logs (${sanity.filesScanned} file(s) scanned): ${sanity.totalWarnings}`);
  for (const w of sanity.firstFew) log(`  ${w}`);

  log("");
  log("E2E test PASSED ✔");

  if (pgPool) await pgPool.end();
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  log(`!!! E2E test FAILED: ${msg}`);
  if (pgPool) await pgPool.end().catch(() => { /* ignore */ });
  process.exit(1);
});
