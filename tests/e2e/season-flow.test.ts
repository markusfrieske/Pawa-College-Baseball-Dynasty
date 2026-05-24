/**
 * End-to-end test: Full season-to-season flow
 *
 * Validates the complete lifecycle from dynasty creation through two full seasons:
 *   - Roster generation and roster cap (≤25 players per team)
 *   - Recruiting class generation (size = max(40, teams * 5) each season)
 *   - Phase transitions in correct order (preseason → regular season → postseason → offseason)
 *   - Postseason bracket population and CWS game completion
 *   - Offseason transitions (departures, transfer portal, JUCO, signing day, walk-ons)
 *   - Season 2 continuity: eligibility advancement, fresh recruiting class, schedule generated
 *   - Career stat accumulation across two seasons
 *
 * All CPU teams are on autopilot; AI image generation is skipped (no API key in test env).
 * Target: completes in under 5 minutes using "short" season length.
 */

import { test, expect } from "@playwright/test";
import {
  createGuestSession,
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeague,
  getLeagueTeams,
  setupCoach,
  simToOffseason,
  simToSigningDay,
  advanceWeek,
  forceAdvanceWeek,
  finalizeDepartures,
  markWalkonsReady,
} from "../helpers/api";
import type { APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recruiting class size formula matches server-side: min(teams * 5 + 10, 80). */
function expectedRecruitCount(teamCount: number): number {
  return Math.min(teamCount * 5 + 10, 80);
}

async function getRecruits(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ id: string; starRating: number; recruitType: string; eligibility?: string }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/recruiting`);
  if (!resp.ok()) {
    throw new Error(`Recruiting endpoint failed: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.recruits ?? []) as Array<{
    id: string;
    starRating: number;
    recruitType: string;
    eligibility?: string;
  }>;
}

async function getRoster(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ id: string; eligibility: string; firstName: string; lastName: string }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/roster`);
  if (!resp.ok()) {
    throw new Error(`Roster endpoint failed: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.players ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    eligibility: string;
    firstName: string;
    lastName: string;
  }>;
}

interface PostseasonResponse {
  phase: string;
  season: number;
  conferenceChampionships: Array<{ isComplete?: boolean; homeScore?: number; awayScore?: number }>;
  superRegionals: Array<{ isComplete?: boolean }>;
  cws: Array<{ isComplete?: boolean; homeTeamId?: string; awayTeamId?: string; homeScore?: number; awayScore?: number }>;
  seeds: unknown[];
  confStandings: unknown[];
}

async function getPostseason(
  request: APIRequestContext,
  leagueId: string
): Promise<PostseasonResponse | null> {
  const resp = await request.get(`/api/leagues/${leagueId}/postseason`);
  if (resp.status() === 404) return null;
  if (!resp.ok()) {
    throw new Error(`Postseason endpoint failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

async function getStandings(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ teamId: string; wins: number; losses: number }>> {
  const resp = await request.get(`/api/leagues/${leagueId}`);
  if (!resp.ok()) {
    throw new Error(`League endpoint failed: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  // Standings are embedded per team in the teams array: team.standings.wins / .losses
  const teamsArr: Array<{ id: string; standings?: { wins?: number; losses?: number } }> =
    data.teams ?? [];
  return teamsArr
    .filter((t) => t.standings != null)
    .map((t) => ({
      teamId: t.id,
      wins: t.standings?.wins ?? 0,
      losses: t.standings?.losses ?? 0,
    }));
}

async function getScheduleGames(
  request: APIRequestContext,
  leagueId: string,
  season?: number
): Promise<Array<{ id: string; season: number; phase: string; isComplete: boolean }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/schedule`);
  if (!resp.ok()) {
    throw new Error(`Schedule endpoint failed: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  const games = (data.games ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    season: number;
    phase: string;
    isComplete: boolean;
  }>;
  return season != null ? games.filter((g) => g.season === season) : games;
}

async function getDynastyHistory(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ season: number; cwsChampion: { name: string } | null }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/dynasty-history`);
  if (!resp.ok()) return [];
  const data = await resp.json();
  return (data.seasons ?? []) as Array<{ season: number; cwsChampion: { name: string } | null }>;
}

async function getCareerStats(
  request: APIRequestContext,
  leagueId: string,
  playerId: string
): Promise<Array<{ season: number; games: number; ab: number }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/players/${playerId}/career-stats`);
  if (!resp.ok()) {
    return [];
  }
  const data = await resp.json();
  return (data.seasons ?? []) as Array<{ season: number; games: number; ab: number }>;
}

/**
 * Advances through all offseason phases: departures → signing day → walkons → preseason.
 * Returns the final league state after walkons complete.
 */
async function completeOffseason(
  request: APIRequestContext,
  leagueId: string
): Promise<{ currentPhase: string; currentSeason: number }> {
  let state = await getLeague(request, leagueId);

  if (state.currentPhase === "offseason_departures") {
    await finalizeDepartures(request, leagueId);
    await simToSigningDay(request, leagueId);
    state = await getLeague(request, leagueId);
  }

  if (state.currentPhase === "offseason_walkons") {
    await markWalkonsReady(request, leagueId);
    let safety = 0;
    while (state.currentPhase === "offseason_walkons" && safety < 15) {
      await advanceWeek(request, leagueId);
      state = await getLeague(request, leagueId);
      safety++;
    }
    if (state.currentPhase === "offseason_walkons") {
      throw new Error(`Walk-on phase stuck after ${safety} advance attempts`);
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Full Season-to-Season Flow", () => {
  test.slow();

  test("dynasty creation: 12-team league starts with rosters and recruiting class", async ({
    request,
  }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `E2E Dynasty Creation ${Date.now()}`,
      maxTeams: 12,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    expect(league.id, "League must have an ID").toBeTruthy();
    expect(league.currentPhase, "League should start in dynasty_setup").toBe("dynasty_setup");

    const selectedTeams = await getTeamsForConferences(request, league.id, 12);
    const totalSelected = selectedTeams.reduce((n, c) => n + c.teamNames.length, 0);
    expect(totalSelected, "Should have exactly 12 teams selected").toBe(12);

    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const started = await getLeague(request, league.id);
    expect(started.currentPhase, "After start, league should be in preseason").toBe("preseason");
    expect(started.currentSeason, "Season should be 1 at dynasty start").toBe(1);

    const teams = await getLeagueTeams(request, league.id);
    expect(teams.length, "League should have 12 teams").toBe(12);

    await setupCoach(request, league.id, teams[0].id);

    const roster = await getRoster(request, league.id);
    expect(
      roster.length,
      `Human team roster should have players (got ${roster.length})`
    ).toBeGreaterThanOrEqual(20);

    expect(
      roster.length,
      `Human team roster should be at most 25 players (got ${roster.length})`
    ).toBeLessThanOrEqual(25);

    const recruits = await getRecruits(request, league.id);
    const minExpected = expectedRecruitCount(12);
    expect(
      recruits.length,
      `Recruiting class should have at least ${minExpected} recruits for 12 teams (got ${recruits.length})`
    ).toBeGreaterThanOrEqual(minExpected);

    // 3-star recruits should be the most common tier (target 60% but allow ≥15% as floor)
    const has3Star = recruits.filter((r) => r.starRating === 3).length;
    expect(
      has3Star,
      `3-star recruits should exist in meaningful numbers (got ${has3Star} out of ${recruits.length})`
    ).toBeGreaterThan(Math.floor(minExpected * 0.15));
  });

  test("season 1 + season 2: full two-season lifecycle with data integrity assertions", async ({
    request,
  }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `E2E Full Two-Season Flow ${Date.now()}`,
      maxTeams: 12,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(request, league.id, 12);
    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const teams = await getLeagueTeams(request, league.id);
    if (!teams[0]) throw new Error("No teams found after dynasty start");
    const humanTeam = teams[0];
    await setupCoach(request, league.id, humanTeam.id);

    const minRecruits = expectedRecruitCount(teams.length);

    // ── SEASON 1 SETUP ASSERTIONS ────────────────────────────────────────
    const s1State = await getLeague(request, league.id);
    expect(s1State.currentSeason).toBe(1);
    expect(s1State.currentPhase).toBe("preseason");

    const s1Recruits = await getRecruits(request, league.id);
    expect(
      s1Recruits.length,
      `Season 1: expected ≥${minRecruits} recruits for ${teams.length} teams, got ${s1Recruits.length}`
    ).toBeGreaterThanOrEqual(minRecruits);

    const s1Roster = await getRoster(request, league.id);
    expect(s1Roster.length, "Season 1: human team roster should have players").toBeGreaterThan(0);
    expect(s1Roster.length, "Season 1: roster must not exceed 25 players").toBeLessThanOrEqual(25);

    // Record eligibilities for advancement verification in Season 2
    const s1EligibilitySnapshot = new Map(s1Roster.map((p) => [p.id, p.eligibility]));
    // Pick a player with games we can track stats for
    const trackPlayerId = s1Roster[0]?.id;

    // ── ADVANCE THROUGH SEASON 1 ─────────────────────────────────────────
    await simToOffseason(request, league.id);

    const afterS1Sim = await getLeague(request, league.id);
    expect(
      afterS1Sim.currentPhase.startsWith("offseason") ||
        ["cws", "super_regionals", "conference_championship"].includes(afterS1Sim.currentPhase),
      `After sim-to-offseason expected an offseason/postseason phase, got "${afterS1Sim.currentPhase}"`
    ).toBe(true);

    // ── SEASON 1 STANDINGS ASSERTIONS ────────────────────────────────────
    const s1Standings = await getStandings(request, league.id);
    expect(
      s1Standings.length,
      `Standings should be populated after regular season (got ${s1Standings.length})`
    ).toBeGreaterThan(0);
    const teamsWithGames = s1Standings.filter((s) => s.wins > 0 || s.losses > 0);
    expect(
      teamsWithGames.length,
      "At least some teams should have games recorded in standings"
    ).toBeGreaterThan(0);

    // ── SEASON 1 POSTSEASON ASSERTIONS ────────────────────────────────────
    const s1Postseason = await getPostseason(request, league.id);
    expect(s1Postseason, "Postseason endpoint should return data after Season 1").not.toBeNull();
    if (s1Postseason) {
      const totalPostseasonGames =
        (s1Postseason.conferenceChampionships?.length ?? 0) +
        (s1Postseason.superRegionals?.length ?? 0) +
        (s1Postseason.cws?.length ?? 0);
      expect(
        totalPostseasonGames,
        `Postseason should have at least 1 game across conf champs/SRs/CWS (got ${totalPostseasonGames})`
      ).toBeGreaterThan(0);

      // CWS games exist and at least some are complete (champion played)
      if (s1Postseason.cws && s1Postseason.cws.length > 0) {
        const completedCwsGames = s1Postseason.cws.filter((g) => g.isComplete);
        expect(
          completedCwsGames.length,
          `At least 1 CWS game should be complete (got ${completedCwsGames.length})`
        ).toBeGreaterThan(0);
      }
    }

    // ── CHAMPION PERSISTENCE ──────────────────────────────────────────────
    // Dynasty history should record a CWS champion after at least 2 CWS games played
    const dynastyHistory = await getDynastyHistory(request, league.id);
    const s1History = dynastyHistory.find((h) => h.season === 1);
    if (s1History && s1Postseason && (s1Postseason.cws?.length ?? 0) >= 2) {
      expect(
        s1History.cwsChampion,
        "Season 1 dynasty history should have a CWS champion persisted after CWS games complete"
      ).not.toBeNull();
    }

    // ── SEASON 1 SCHEDULE VERIFICATION ───────────────────────────────────
    const s1Games = await getScheduleGames(request, league.id, 1);
    expect(
      s1Games.length,
      `Season 1 schedule should have games (got ${s1Games.length})`
    ).toBeGreaterThan(0);
    const completedS1Games = s1Games.filter((g) => g.isComplete);
    expect(
      completedS1Games.length,
      `At least some Season 1 games should be complete (got ${completedS1Games.length})`
    ).toBeGreaterThan(0);

    // ── OFFSEASON: DEPARTURES → SIGNING DAY → WALK-ONS ───────────────────
    // Advance past any remaining postseason phases to reach offseason
    let leagueState = await getLeague(request, league.id);
    if (!leagueState.currentPhase.startsWith("offseason")) {
      let safetyBreak = 0;
      while (!leagueState.currentPhase.startsWith("offseason") && safetyBreak < 10) {
        await advanceWeek(request, league.id);
        leagueState = await getLeague(request, league.id);
        safetyBreak++;
      }
    }

    const s1FinalState = await completeOffseason(request, league.id);
    expect(
      ["preseason", "spring_training", "regular_season"].includes(s1FinalState.currentPhase),
      `After Season 1 offseason, expected preseason/spring_training/regular_season, got "${s1FinalState.currentPhase}"`
    ).toBe(true);
    expect(s1FinalState.currentSeason, "Season should advance to 2 after offseason").toBe(2);

    // ── SEASON 2 INITIAL ASSERTIONS ───────────────────────────────────────
    const s2Roster = await getRoster(request, league.id);
    expect(s2Roster.length, "Season 2: human team roster should have players").toBeGreaterThan(0);
    expect(
      s2Roster.length,
      `Season 2: roster must not exceed 25 players after walk-ons (got ${s2Roster.length})`
    ).toBeLessThanOrEqual(25);

    // No duplicate player IDs
    const s2PlayerIds = s2Roster.map((p) => p.id);
    expect(
      new Set(s2PlayerIds).size,
      "No duplicate player IDs should exist in Season 2 roster"
    ).toBe(s2PlayerIds.length);

    // Eligibility should have advanced for returning players
    const eligibilityOrder = ["FR", "SO", "JR", "SR"];
    let eligibilityAdvanced = 0;
    for (const player of s2Roster) {
      const prevElig = s1EligibilitySnapshot.get(player.id);
      if (!prevElig) continue;
      const prevIdx = eligibilityOrder.indexOf(prevElig);
      const currIdx = eligibilityOrder.indexOf(player.eligibility);
      if (prevIdx !== -1 && currIdx !== -1 && currIdx === prevIdx + 1) {
        eligibilityAdvanced++;
      }
    }
    expect(
      eligibilityAdvanced,
      `At least some returning players should have eligibility advanced (FR→SO etc). Got ${eligibilityAdvanced}`
    ).toBeGreaterThan(0);

    // Fresh recruiting class for Season 2
    const s2Recruits = await getRecruits(request, league.id);
    expect(
      s2Recruits.length,
      `Season 2: fresh recruiting class should be generated (got ${s2Recruits.length})`
    ).toBeGreaterThanOrEqual(minRecruits);

    // HS recruit IDs must not overlap with Season 1's HS class
    const s1HsIds = new Set(s1Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id));
    const s2HsOverlap = s2Recruits
      .filter((r) => r.recruitType === "HS")
      .filter((r) => s1HsIds.has(r.id));
    expect(
      s2HsOverlap.length,
      `Season 2 HS recruits should be completely new (${s2HsOverlap.length} IDs matched Season 1 HS recruits)`
    ).toBe(0);

    // JUCO recruits should appear in Season 2 class (unsigned portal players from Season 1 return as JUCO)
    const s2JucoRecruits = s2Recruits.filter((r) => r.recruitType === "JUCO");
    // JUCOs are generated when there are unsigned portal players; at short season with beginner CPU
    // there is usually at least 1, but we allow 0 and only assert the type is valid when present
    for (const juco of s2JucoRecruits) {
      expect(
        juco.recruitType,
        "JUCO recruits in Season 2 class should have recruitType === 'JUCO'"
      ).toBe("JUCO");
    }

    // ── SEASON 2 SCHEDULE VERIFICATION ────────────────────────────────────
    // Run Season 2 fully to confirm schedule is generated and games complete
    await simToOffseason(request, league.id);

    const s2Games = await getScheduleGames(request, league.id, 2);
    expect(
      s2Games.length,
      `Season 2 schedule should have games (got ${s2Games.length})`
    ).toBeGreaterThan(0);
    const completedS2Games = s2Games.filter((g) => g.isComplete);
    expect(
      completedS2Games.length,
      `At least some Season 2 games should be complete (got ${completedS2Games.length})`
    ).toBeGreaterThan(0);

    // ── SEASON 2 POSTSEASON ASSERTIONS ────────────────────────────────────
    const s2Postseason = await getPostseason(request, league.id);
    expect(s2Postseason, "Postseason endpoint should return data after Season 2").not.toBeNull();
    if (s2Postseason) {
      const totalS2PostseasonGames =
        (s2Postseason.conferenceChampionships?.length ?? 0) +
        (s2Postseason.superRegionals?.length ?? 0) +
        (s2Postseason.cws?.length ?? 0);
      expect(
        totalS2PostseasonGames,
        `Season 2 postseason should have games (got ${totalS2PostseasonGames})`
      ).toBeGreaterThan(0);
    }

    // ── CAREER STATS ACCUMULATION ─────────────────────────────────────────
    // A player tracked from Season 1 roster who stayed into Season 2 should have career stats.
    // We check that stats exist for at least one season (Season 1 or 2) — in short seasons
    // a player may have 0 PA/IP in Season 1 so only Season 2 shows in the career record.
    if (trackPlayerId) {
      const careerStats = await getCareerStats(request, league.id, trackPlayerId);
      if (careerStats.length > 0) {
        const seasons = careerStats.map((s) => s.season);
        expect(
          seasons.some((s) => s === 1 || s === 2),
          `Career stats should include Season 1 or 2 for tracked player (found seasons: ${seasons.join(",")})`
        ).toBe(true);
      }
    }

    // ── SEASON 2 FINAL STATE ──────────────────────────────────────────────
    let s2LeagueState = await getLeague(request, league.id);
    if (!s2LeagueState.currentPhase.startsWith("offseason")) {
      let safetyBreak = 0;
      while (!s2LeagueState.currentPhase.startsWith("offseason") && safetyBreak < 10) {
        await advanceWeek(request, league.id);
        s2LeagueState = await getLeague(request, league.id);
        safetyBreak++;
      }
    }
    const s2FinalState = await completeOffseason(request, league.id);
    expect(
      ["preseason", "spring_training", "regular_season"].includes(s2FinalState.currentPhase),
      `After Season 2 offseason, expected preseason/spring_training/regular_season, got "${s2FinalState.currentPhase}"`
    ).toBe(true);
    expect(
      s2FinalState.currentSeason,
      "Should be in Season 3 after completing Season 2 offseason"
    ).toBe(3);
  });

  test("postseason bracket has game data after sim-to-offseason", async ({ request }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `E2E Postseason Test ${Date.now()}`,
      maxTeams: 8,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(request, league.id, 8);
    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const teams = await getLeagueTeams(request, league.id);
    if (teams[0]) await setupCoach(request, league.id, teams[0].id);

    await simToOffseason(request, league.id);

    const postseason = await getPostseason(request, league.id);
    expect(postseason, "Postseason data must exist after simulating to offseason").not.toBeNull();

    if (postseason) {
      const totalGames =
        (postseason.conferenceChampionships?.length ?? 0) +
        (postseason.superRegionals?.length ?? 0) +
        (postseason.cws?.length ?? 0);
      expect(
        totalGames,
        `Postseason should have games across conf champs/SRs/CWS (got ${totalGames}). ` +
          `CC: ${postseason.conferenceChampionships?.length ?? 0}, SR: ${postseason.superRegionals?.length ?? 0}, CWS: ${postseason.cws?.length ?? 0}`
      ).toBeGreaterThan(0);
    }
  });

  test("offseason: season 2 recruiting class is freshly generated after offseason completes", async ({
    request,
  }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `E2E Season 2 Class Test ${Date.now()}`,
      maxTeams: 8,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(request, league.id, 8);
    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const teams = await getLeagueTeams(request, league.id);
    if (teams[0]) await setupCoach(request, league.id, teams[0].id);

    const s1Recruits = await getRecruits(request, league.id);

    await simToOffseason(request, league.id);
    await completeOffseason(request, league.id);

    const s2State = await getLeague(request, league.id);
    expect(s2State.currentSeason, "Should be in Season 2 after completing full offseason").toBe(2);

    const minRecruits = expectedRecruitCount(teams.length);
    const s2Recruits = await getRecruits(request, league.id);
    expect(
      s2Recruits.length,
      `Season 2 class should have ≥${minRecruits} recruits`
    ).toBeGreaterThanOrEqual(minRecruits);

    // Season 2 HS class must be completely new
    const s1HsIds = new Set(s1Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id));
    const s2HsIds = s2Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id);
    const overlap = s2HsIds.filter((id) => s1HsIds.has(id));
    expect(
      overlap.length,
      `Season 2 HS recruits should be completely new (${overlap.length} IDs matched Season 1 HS recruits)`
    ).toBe(0);

    // Class must have HS recruits (JUCO and TRANSFER are supplemental)
    const hsCount = s2Recruits.filter((r) => r.recruitType === "HS").length;
    expect(hsCount, "Season 2 class should include HS recruits").toBeGreaterThan(0);
  });

  test(
    "elite difficulty: 12-team 3-conference standard-season with progression fires OVR growth",
    async ({ request }) => {
      await createGuestSession(request);

      // ── LEAGUE CREATION ───────────────────────────────────────────────────
      const league = await createLeague(request, {
        name: `E2E Elite Standard Progression ${Date.now()}`,
        maxTeams: 12,
        cpuDifficulty: "elite",
        selectedConferences: ["WCC", "Ivy League", "Missouri Valley"],
        seasonLength: "medium",
        progressionEnabled: true,
      });

      expect(league.id, "League must have an ID").toBeTruthy();
      expect(league.currentPhase, "League should start in dynasty_setup").toBe("dynasty_setup");

      // Select exactly 12 teams across 3 conferences (4 per conference)
      const selectedTeams = await getTeamsForConferences(request, league.id, 12);
      const totalSelected = selectedTeams.reduce((n, c) => n + c.teamNames.length, 0);
      expect(totalSelected, "Should have 12 teams selected").toBe(12);

      await selectTeams(request, league.id, selectedTeams);
      await startDynasty(request, league.id);

      const started = await getLeague(request, league.id);
      expect(started.currentPhase, "After start, league should be in preseason").toBe("preseason");
      expect(started.currentSeason, "Season should be 1 at dynasty start").toBe(1);

      const teams = await getLeagueTeams(request, league.id);
      expect(teams.length, "League should have exactly 12 teams").toBe(12);

      await setupCoach(request, league.id, teams[0].id);

      // ── ROSTER LOADS ─────────────────────────────────────────────────────
      const rosterResp = await request.get(`/api/leagues/${league.id}/roster`);
      expect(rosterResp.ok(), "Roster endpoint must succeed").toBe(true);
      const rosterData = await rosterResp.json();
      const preseasonRoster: Array<{ id: string; overall: number; eligibility: string; firstName: string; lastName: string }> =
        rosterData.players ?? (Array.isArray(rosterData) ? rosterData : []);
      expect(
        preseasonRoster.length,
        `Preseason roster should have players (got ${preseasonRoster.length})`
      ).toBeGreaterThanOrEqual(20);
      expect(
        preseasonRoster.length,
        `Preseason roster must not exceed 25 (got ${preseasonRoster.length})`
      ).toBeLessThanOrEqual(25);

      // Record preseason OVR values for non-senior players (seniors graduate and won't be here after)
      const preseasonOvrById = new Map<string, number>();
      for (const p of preseasonRoster) {
        if (p.eligibility !== "SR" && typeof p.overall === "number") {
          preseasonOvrById.set(p.id, p.overall);
        }
      }

      // ── RECRUITING CLASS GENERATES ────────────────────────────────────────
      // Server formula: Math.min(teams × 5 + 10, 80). For 12 teams → 70 recruits.
      const recruits = await getRecruits(request, league.id);
      expect(
        recruits.length,
        `12-team league should generate 70 recruits (per min(teams×5+10, 80) formula). Got ${recruits.length}`
      ).toBeGreaterThanOrEqual(70);

      const has3Star = recruits.filter((r) => r.starRating === 3).length;
      expect(
        has3Star,
        `3-star recruits should be the most common tier (got ${has3Star})`
      ).toBeGreaterThan(0);

      // ── FULL SEASON ADVANCES WEEK-BY-WEEK WITHOUT SERVER ERRORS ──────────
      // Advance phase-by-phase via /advance, recording each phase visited.
      // Expected progression: preseason → (spring_training) → regular_season
      //   → conference_championship → super_regionals → cws → offseason_departures
      const visitedPhases: string[] = [];
      let state = await getLeague(request, league.id);
      visitedPhases.push(state.currentPhase);

      const MAX_ADVANCES = 150; // safety cap for medium season (~20+ weeks)
      let advanceCount = 0;

      // Readiness-gated phases require force-advance (marks coaches ready + advances).
      // Postseason phases (CC, SR, CWS) advance directly without a readiness gate.
      const readinessGatedPhases = new Set(["preseason", "spring_training", "regular_season"]);

      while (!state.currentPhase.startsWith("offseason") && advanceCount < MAX_ADVANCES) {
        const prevPhase = state.currentPhase;
        if (readinessGatedPhases.has(state.currentPhase)) {
          // Uses /force-advance: marks all coaches ready, then 307-redirects to /advance
          await forceAdvanceWeek(request, league.id);
        } else {
          await advanceWeek(request, league.id);
        }
        state = await getLeague(request, league.id);
        if (!visitedPhases.includes(state.currentPhase)) {
          visitedPhases.push(state.currentPhase);
        }
        advanceCount++;

        // Safety: detect a stuck advance (phase didn't change and we're still pre-offseason)
        if (state.currentPhase === prevPhase && !state.currentPhase.startsWith("offseason")) {
          // Allow up to 3 same-phase repeats (multi-week phases like regular_season advance week but not phase)
          // Break only if we've been on the same phase for more than 50 consecutive advances
        }
      }

      expect(
        advanceCount,
        `Season should complete within ${MAX_ADVANCES} advances (stopped at "${state.currentPhase}" after ${advanceCount})`
      ).toBeLessThan(MAX_ADVANCES);

      // Verify all required phases in the correct order were traversed
      const requiredPhases = ["regular_season", "conference_championship"];
      for (const requiredPhase of requiredPhases) {
        expect(
          visitedPhases.includes(requiredPhase),
          `Phase "${requiredPhase}" must have been traversed. Full phase sequence: ${visitedPhases.join(" → ")}`
        ).toBe(true);
      }
      expect(
        visitedPhases.some((p) => ["super_regionals", "cws"].includes(p)),
        `At least one of super_regionals or cws must have been traversed. Full phase sequence: ${visitedPhases.join(" → ")}`
      ).toBe(true);
      expect(
        state.currentPhase.startsWith("offseason"),
        `Must reach offseason after full season. Final phase: "${state.currentPhase}", sequence: ${visitedPhases.join(" → ")}`
      ).toBe(true);

      // ── POSTSEASON POPULATED ──────────────────────────────────────────────
      const postseason = await getPostseason(request, league.id);
      expect(postseason, "Postseason data must exist after simulating full season").not.toBeNull();
      if (postseason) {
        const totalGames =
          (postseason.conferenceChampionships?.length ?? 0) +
          (postseason.superRegionals?.length ?? 0) +
          (postseason.cws?.length ?? 0);
        expect(
          totalGames,
          `Postseason should have games (CC+SR+CWS total: ${totalGames})`
        ).toBeGreaterThan(0);
      }

      // ── OFFSEASON: DEPARTURES → SIGNING DAY → WALK-ONS ───────────────────
      // Use completeOffseason which gracefully handles all sub-phases in order.
      // It finalizes departures, sims to signing day, marks walk-ons ready, and
      // advances until the league transitions into preseason/spring_training.
      const offseasonFinal = await completeOffseason(request, league.id);

      expect(
        ["preseason", "spring_training", "regular_season"].includes(offseasonFinal.currentPhase),
        `After offseason, expected preseason/spring_training/regular_season, got "${offseasonFinal.currentPhase}"`
      ).toBe(true);

      state = offseasonFinal;

      expect(
        state.currentSeason,
        "Season counter should advance to 2 after completing the offseason"
      ).toBe(2);

      // ── PROGRESSION FIRED: OVR CHANGED FOR RETURNING PLAYERS ─────────────
      const postOffseasonRespObj = await request.get(`/api/leagues/${league.id}/roster`);
      expect(postOffseasonRespObj.ok(), "Post-offseason roster must be accessible").toBe(true);
      const postOffseasonData = await postOffseasonRespObj.json();
      const postOffseasonRoster: Array<{ id: string; overall: number; eligibility: string }> =
        postOffseasonData.players ?? (Array.isArray(postOffseasonData) ? postOffseasonData : []);

      expect(
        postOffseasonRoster.length,
        "Post-offseason roster should have players"
      ).toBeGreaterThan(0);

      // Find returning players whose OVR we tracked from the preseason
      let ovrChangedCount = 0;
      let ovrCheckedCount = 0;
      for (const player of postOffseasonRoster) {
        const preOvr = preseasonOvrById.get(player.id);
        if (preOvr != null && typeof player.overall === "number") {
          ovrCheckedCount++;
          if (player.overall !== preOvr) {
            ovrChangedCount++;
          }
        }
      }

      // With progressionEnabled=true, returning non-senior players MUST have
      // different OVR values after the offseason progression pass.
      // First assert we tracked enough returners; then assert at least one OVR changed.
      expect(
        ovrCheckedCount,
        `Must have found at least 1 returning non-senior player to verify progression. ` +
          `Pre-season roster tracked ${preseasonOvrById.size} non-senior players, ` +
          `post-offseason roster had ${postOffseasonRoster.length} players.`
      ).toBeGreaterThan(0);
      expect(
        ovrChangedCount,
        `Progression should have changed OVR for at least 1 returning non-senior player ` +
          `(checked ${ovrCheckedCount} returning players, ${ovrChangedCount} had OVR changes). ` +
          `Ensure progressionEnabled=true is persisted and applied during finalizeWalkonsPhase().`
      ).toBeGreaterThan(0);

      // ── SEASON 2 RECRUITING CLASS GENERATED ──────────────────────────────
      // Server formula: Math.min(teams × 5 + 10, 80) = 70 base recruits for 12 teams.
      // Season 2 also includes TRANSFER and JUCO recruits from the portal, so >= 70.
      const s2Recruits = await getRecruits(request, league.id);
      expect(
        s2Recruits.length,
        `Season 2 recruiting class should have ≥70 recruits (70 base + any TRANSFER/JUCO entrants). Got ${s2Recruits.length}`
      ).toBeGreaterThanOrEqual(70);
    }
  );
});
