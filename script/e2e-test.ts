/**
 * End-to-end test that drives a 10-team, 5-season dynasty against
 * the running dev server (http://localhost:5000).
 *
 * Run with: `npx tsx script/e2e-test.ts`
 */

import { appendFileSync, writeFileSync } from "fs";
import { Pool } from "pg";

const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";
const SEASONS_TO_RUN = parseInt(process.env.E2E_SEASONS || "5", 10);

let cookie = "";

type AnyJson = any;

async function apiOnce(method: string, path: string, body: AnyJson | undefined, timeoutMs: number): Promise<AnyJson> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Connection": "close",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  } as any);
  const setCookie = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  if (setCookie && setCookie.length) {
    const parts = setCookie.map((c: string) => c.split(";")[0].trim());
    cookie = parts.join("; ");
  }
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return data;
}

async function api(method: string, path: string, body?: AnyJson, timeoutMs = 60000): Promise<AnyJson> {
  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await apiOnce(method, path, body, timeoutMs);
    } catch (err: any) {
      lastErr = err;
      log(`  ! ${method} ${path} attempt ${attempt} failed: ${err?.message || err}`);
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

const TEAM_SELECTION = [
  { conferenceName: "AAC", teamNames: ["East Carolina", "Wichita State", "Dallas Baptist", "Tulane"] },
  { conferenceName: "WCC", teamNames: ["Gonzaga", "Pepperdine", "Saint Mary's"] },
  { conferenceName: "Mountain West", teamNames: ["Fresno State", "San Diego State", "UNLV"] },
];

const TOTAL_TEAMS = TEAM_SELECTION.reduce((s, c) => s + c.teamNames.length, 0);

const LOG_PATH = process.env.E2E_LOG || "/tmp/e2e.log";
writeFileSync(LOG_PATH, "");
function log(msg: string) {
  const t = new Date().toISOString().substring(11, 19);
  const line = `[${t}] ${msg}\n`;
  try { appendFileSync(LOG_PATH, line); } catch {}
  try { process.stdout.write(line); } catch {}
}
process.on("unhandledRejection", (r: any) => { log(`UNHANDLED REJECTION: ${r?.stack || r?.message || String(r)}`); });
process.on("uncaughtException", (r: any) => { log(`UNCAUGHT EXCEPTION: ${r?.stack || r?.message || String(r)}`); });

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function flipTeamToCpu(teamId: string) {
  if (!pgPool) throw new Error("DATABASE_URL not set; cannot flip human team to CPU");
  await pgPool.query(`UPDATE teams SET is_cpu = true, coach_id = NULL WHERE id = $1`, [teamId]);
}

async function getLeague(leagueId: string): Promise<AnyJson> {
  return api("GET", `/api/leagues/${leagueId}`);
}

async function runSeason(leagueId: string, seasonNum: number): Promise<{
  champion: string;
  postseasonGames: number;
}> {
  log(`=== Season ${seasonNum}: starting (sim-to-offseason) ===`);

  const sim = await api("POST", `/api/leagues/${leagueId}/sim-to-offseason`);
  log(`  → reached phase=${sim.currentPhase}, season=${sim.currentSeason}`);
  assert(sim.currentPhase === "offseason_departures", `Expected offseason_departures, got ${sim.currentPhase}`);

  // Postseason data
  const post = await api("GET", `/api/leagues/${leagueId}/postseason?season=${seasonNum}`);
  const cws: any[] = post?.cws || [];
  const sr: any[] = post?.superRegionals || [];
  const conf: any[] = post?.conferenceChampionships || [];
  assert(cws.length > 0, `Season ${seasonNum}: no CWS games`);
  assert(sr.length > 0, `Season ${seasonNum}: no super-regional games`);
  assert(conf.length > 0, `Season ${seasonNum}: no conference-championship games`);

  // Determine CWS champion (best-of-3)
  const wins: Record<string, number> = {};
  for (const g of cws) {
    if (g.isComplete && g.homeScore != null && g.awayScore != null) {
      const winner = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
      wins[winner] = (wins[winner] || 0) + 1;
    }
  }
  const champEntry = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  assert(champEntry, `Season ${seasonNum}: no CWS winner`);
  const lg = await getLeague(leagueId);
  const champTeam = lg.teams.find((t: any) => t.id === champEntry[0]);
  const champion = champTeam?.name || champEntry[0];
  log(`  → champion: ${champion} (${champEntry[1]} wins)`);

  // Standings populated for all 10 teams
  const standingsCount = lg.teams.filter((t: any) => t.standings).length;
  assert(standingsCount === TOTAL_TEAMS, `Season ${seasonNum}: standings populated for ${standingsCount}/${TOTAL_TEAMS} teams`);

  // Awards endpoint
  const awards = await api("GET", `/api/leagues/${leagueId}/season-awards`);
  assert(awards?.awardsAvailable === true, `Season ${seasonNum}: awards not available (phase=${awards?.currentPhase})`);

  // Dynasty history
  const history = await api("GET", `/api/leagues/${leagueId}/dynasty-history`);
  assert(Array.isArray(history?.seasons), `Season ${seasonNum}: dynasty-history missing seasons array`);
  const completedSeasons = history.seasons.filter((s: any) => s.cwsChampion).length;
  assert(completedSeasons >= seasonNum, `Season ${seasonNum}: dynasty-history shows ${completedSeasons} completed seasons`);

  // Finalize departures (human-team endpoint; team is CPU but commissioner has authority)
  log(`  → finalizing departures`);
  await api("POST", `/api/leagues/${leagueId}/departures/finalize`);

  // Walk through recruiting → signing → walkons → next preseason
  let cur: AnyJson = await api("POST", `/api/leagues/${leagueId}/advance`);
  log(`     phase=${cur.currentPhase}`);
  for (let i = 0; i < 10 && cur.currentPhase !== "offseason_signing_day" && cur.currentPhase !== "offseason_walkons" && cur.currentPhase !== "preseason"; i++) {
    cur = await api("POST", `/api/leagues/${leagueId}/advance`);
    log(`     phase=${cur.currentPhase}`);
  }
  if (cur.currentPhase === "offseason_signing_day") {
    cur = await api("POST", `/api/leagues/${leagueId}/advance`);
    log(`     phase=${cur.currentPhase}`);
  }
  if (cur.currentPhase === "offseason_walkons") {
    cur = await api("POST", `/api/leagues/${leagueId}/advance`);
    log(`     phase=${cur.currentPhase}, season=${cur.currentSeason}`);
  }
  assert(cur.currentPhase === "preseason", `Did not reach preseason after offseason; got ${cur.currentPhase}`);
  assert(cur.currentSeason === seasonNum + 1, `Expected season ${seasonNum + 1}, got ${cur.currentSeason}`);

  return { champion, postseasonGames: cws.length + sr.length + conf.length };
}

async function main() {
  log(`E2E test starting against ${BASE}`);
  log(`Target: ${TOTAL_TEAMS} teams (CPU-only), ${SEASONS_TO_RUN} seasons`);

  // 1. Auth
  log("Authenticating as guest");
  await api("POST", "/api/auth/guest");

  // 2. Create league
  const leagueName = `E2E-${Date.now()}`;
  log(`Creating league "${leagueName}"`);
  const league = await api("POST", "/api/leagues", {
    name: leagueName,
    maxTeams: TOTAL_TEAMS,
    cpuDifficulty: "high_school",
    selectedConferences: TEAM_SELECTION.map(c => c.conferenceName),
    seasonLength: "short",
    progressionEnabled: false,
  });
  log(`  → league id ${league.id}`);

  // 3. Conferences
  const setupData = await api("GET", `/api/leagues/${league.id}/team-selection`);
  const confIdByName = new Map<string, string>();
  for (const c of setupData.conferences) confIdByName.set(c.name, c.id);

  // 4. Select teams
  log("Selecting teams");
  const selectedTeams = TEAM_SELECTION.map(c => ({
    conferenceId: confIdByName.get(c.conferenceName)!,
    teamNames: c.teamNames,
  }));
  const sel = await api("POST", `/api/leagues/${league.id}/team-selection`, { selectedTeams });
  assert(sel.teamsCreated === TOTAL_TEAMS, `Expected ${TOTAL_TEAMS} teams created, got ${sel.teamsCreated}`);
  log(`  → ${sel.teamsCreated} teams created`);

  // 5. Setup with placeholder coach (required to generate rosters/schedule)
  const setup2 = await api("GET", `/api/leagues/${league.id}/setup`);
  const seedTeam = setup2.teams[0];
  log(`Picking ${seedTeam.name} for setup (rosters + schedule generation)`);
  await api("POST", `/api/leagues/${league.id}/setup`, {
    teamId: seedTeam.id,
    coach: { firstName: "Test", lastName: "Coach", archetype: "Balanced" },
  });

  // CPU-only: flip the seed team back to CPU so signing-day/walkons CPU logic manages it
  log(`  → flipping ${seedTeam.name} to CPU (CPU-only run)`);
  await flipTeamToCpu(seedTeam.id);

  // Start dynasty
  log("Starting dynasty (dynasty_setup → preseason)");
  await api("POST", `/api/leagues/${league.id}/start`, {});

  // Initial roster check (strict)
  const lg0 = await getLeague(league.id);
  for (const t of lg0.teams) {
    const td = await api("GET", `/api/leagues/${league.id}/teams/${t.id}`);
    assert(td?.players?.length === 25, `Initial roster: ${t.name} has ${td?.players?.length} players (expected 25)`);
  }
  log(`Initial rosters OK: all ${lg0.teams.length} teams at 25 players`);

  // 6. Run seasons
  const seasonReports: { season: number; champion: string; postseasonGames: number }[] = [];
  for (let s = 1; s <= SEASONS_TO_RUN; s++) {
    const r = await runSeason(league.id, s);
    seasonReports.push({ season: s, ...r });
  }

  // 7. Final aggregate report
  log("");
  log("============= FINAL REPORT =============");
  const finalLeague = await getLeague(league.id);
  log(`League phase: ${finalLeague.currentPhase}, season: ${finalLeague.currentSeason}`);
  log(`Teams in league: ${finalLeague.teams.length}`);

  for (const r of seasonReports) {
    log(`Season ${r.season}: champion=${r.champion}, postseasonGames=${r.postseasonGames}`);
  }

  // Roster integrity (strict)
  log("");
  log("Final roster sizes:");
  let bad = 0;
  for (const t of finalLeague.teams) {
    const td = await api("GET", `/api/leagues/${finalLeague.id}/teams/${t.id}`);
    const count = td?.players?.length ?? 0;
    log(`  ${t.name}: ${count} players`);
    if (count !== 25) bad++;
  }
  assert(bad === 0, `${bad} teams not at 25 players`);

  // Aggregate counts: recruits, transfers, JUCO, draft
  if (pgPool) {
    const draftRes = await pgPool.query(
      `SELECT COUNT(*)::int AS n FROM player_history WHERE league_id = $1 AND draft_round IS NOT NULL`,
      [finalLeague.id]
    );
    const transferRes = await pgPool.query(
      `SELECT COUNT(*)::int AS n FROM player_history WHERE league_id = $1 AND departure_type = 'transfer'`,
      [finalLeague.id]
    );
    const jucoRes = await pgPool.query(
      `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1 AND recruit_type = 'juco'`,
      [finalLeague.id]
    );
    const transferRecruitRes = await pgPool.query(
      `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1 AND recruit_type = 'transfer'`,
      [finalLeague.id]
    );
    const recruitRes = await pgPool.query(
      `SELECT COUNT(*)::int AS n FROM recruits WHERE league_id = $1`,
      [finalLeague.id]
    );
    log("");
    log("Aggregate data over 5 seasons:");
    log(`  MLB draftees: ${draftRes.rows[0].n}`);
    log(`  Transfers (departures): ${transferRes.rows[0].n}`);
    log(`  Transfer-portal recruits: ${transferRecruitRes.rows[0].n}`);
    log(`  JUCO recruits: ${jucoRes.rows[0].n}`);
    log(`  Total recruits in pool: ${recruitRes.rows[0].n}`);
    assert(draftRes.rows[0].n > 0, "No MLB draftees recorded");
  }

  // Final dynasty history sanity
  const history = await api("GET", `/api/leagues/${finalLeague.id}/dynasty-history`);
  const completed = history.seasons.filter((s: any) => s.cwsChampion).length;
  log(`Dynasty history: ${completed} seasons with CWS champions`);
  assert(completed >= SEASONS_TO_RUN, `Dynasty history has ${completed} completed seasons; expected ≥ ${SEASONS_TO_RUN}`);

  log("");
  log("E2E test PASSED ✔");

  if (pgPool) await pgPool.end();
}

main().catch(async err => {
  log(`!!! E2E test FAILED: ${err?.stack || err?.message || String(err)}`);
  if (pgPool) await pgPool.end().catch(() => {});
  process.exit(1);
});
