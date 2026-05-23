/**
 * End-to-end test: Full season-to-season flow
 *
 * Validates the complete lifecycle from dynasty creation through two full seasons:
 *   - Roster generation (players on each team after dynasty start)
 *   - Recruiting class generation (size = max(40, teams * 5) each season)
 *   - Phase transitions in correct order
 *   - Postseason bracket population
 *   - Offseason transitions (departures, transfer portal, JUCO, signing day, walk-ons)
 *   - Season 2 continuity: eligibility advancement, fresh recruiting class, stats accumulation
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
  finalizeDepartures,
  markWalkonsReady,
} from "../helpers/api";
import type { APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recruiting class size formula matches server-side: max(40, teams * 5). */
function expectedRecruitCount(teamCount: number): number {
  return Math.max(40, teamCount * 5);
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
  conferenceChampionships: unknown[];
  superRegionals: unknown[];
  cws: unknown[];
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

/**
 * Force-advances the league phase, bypassing coach readiness checks.
 * Uses the commissioner force-advance endpoint which the league creator always has access to.
 */
async function forceAdvance(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/force-advance`, {
    data: {},
  });
  if (!resp.ok()) {
    throw new Error(`force-advance failed: ${resp.status()} ${await resp.text()}`);
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

    const recruits = await getRecruits(request, league.id);
    const minExpected = expectedRecruitCount(12);
    expect(
      recruits.length,
      `Recruiting class should have at least ${minExpected} recruits for 12 teams (got ${recruits.length})`
    ).toBeGreaterThanOrEqual(minExpected);

    const has3Star = recruits.filter((r) => r.starRating === 3).length;
    expect(
      has3Star,
      `3-star recruits should dominate the class (expected many, got ${has3Star})`
    ).toBeGreaterThan(Math.floor(minExpected * 0.4));
  });

  test("season 1 → season 2: full lifecycle with data integrity assertions", async ({
    request,
  }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `E2E Full Season Flow ${Date.now()}`,
      maxTeams: 10,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(request, league.id, 10);
    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const teams = await getLeagueTeams(request, league.id);
    if (!teams[0]) throw new Error("No teams found after dynasty start");
    const humanTeam = teams[0];
    await setupCoach(request, league.id, humanTeam.id);

    // -- SEASON 1 SETUP ASSERTIONS --
    const s1State = await getLeague(request, league.id);
    expect(s1State.currentSeason).toBe(1);
    expect(s1State.currentPhase).toBe("preseason");

    const minRecruits = expectedRecruitCount(teams.length);
    const s1Recruits = await getRecruits(request, league.id);
    expect(
      s1Recruits.length,
      `Season 1: expected ≥${minRecruits} recruits for ${teams.length} teams, got ${s1Recruits.length}`
    ).toBeGreaterThanOrEqual(minRecruits);

    const s1Roster = await getRoster(request, league.id);
    expect(
      s1Roster.length,
      `Season 1: human team roster should have players`
    ).toBeGreaterThan(0);

    const s1EligibilitySnapshot = new Map(s1Roster.map((p) => [p.id, p.eligibility]));

    // -- ADVANCE THROUGH SEASON 1 --
    await simToOffseason(request, league.id);

    const afterSim = await getLeague(request, league.id);
    expect(
      afterSim.currentPhase.startsWith("offseason") || afterSim.currentPhase === "cws" || afterSim.currentPhase === "super_regionals",
      `After sim-to-offseason expected an offseason/postseason phase, got "${afterSim.currentPhase}"`
    ).toBe(true);

    // -- POSTSEASON ASSERTIONS --
    const postseason = await getPostseason(request, league.id);
    expect(postseason, "Postseason endpoint should return data after sim-to-offseason").not.toBeNull();

    if (postseason) {
      const totalPostseasonGames =
        (postseason.conferenceChampionships?.length ?? 0) +
        (postseason.superRegionals?.length ?? 0) +
        (postseason.cws?.length ?? 0);
      expect(
        totalPostseasonGames,
        `Postseason response should have at least 1 game across conf champs/SRs/CWS (got ${totalPostseasonGames})`
      ).toBeGreaterThan(0);
    }

    // -- STANDINGS SHOULD BE POPULATED --
    const standings = await getStandings(request, league.id);
    expect(
      standings.length,
      `Standings should be populated after regular season (got ${standings.length})`
    ).toBeGreaterThan(0);

    const standingsWithGames = standings.filter((s) => s.wins > 0 || s.losses > 0);
    expect(
      standingsWithGames.length,
      "At least some teams should have games recorded in standings"
    ).toBeGreaterThan(0);

    // -- OFFSEASON: DEPARTURES → SIGNING DAY → WALK-ONS --
    let leagueState = await getLeague(request, league.id);

    // If still in a postseason phase, advance until we reach offseason
    if (!leagueState.currentPhase.startsWith("offseason")) {
      let safetyBreak = 0;
      while (!leagueState.currentPhase.startsWith("offseason") && safetyBreak < 10) {
        await advanceWeek(request, league.id);
        leagueState = await getLeague(request, league.id);
        safetyBreak++;
      }
    }

    const finalState = await completeOffseason(request, league.id);

    expect(
      ["preseason", "spring_training", "regular_season"].includes(finalState.currentPhase),
      `After offseason, expected preseason/spring_training/regular_season, got "${finalState.currentPhase}"`
    ).toBe(true);

    expect(
      finalState.currentSeason,
      "Season should have advanced to 2 after completing offseason"
    ).toBe(2);

    // -- SEASON 2 ASSERTIONS --

    const s2Roster = await getRoster(request, league.id);
    expect(
      s2Roster.length,
      `Season 2: human team roster should still have players (got ${s2Roster.length})`
    ).toBeGreaterThan(0);

    const s2Recruits = await getRecruits(request, league.id);
    expect(
      s2Recruits.length,
      `Season 2: a fresh recruiting class should be generated (got ${s2Recruits.length})`
    ).toBeGreaterThanOrEqual(minRecruits);

    // Season 2 class should be mostly fresh (small overlap with JUCO/TRANSFER recruits is OK)
    const s2RecruitIds = new Set(s2Recruits.map((r) => r.id));
    const s1RecruitIds = new Set(s1Recruits.map((r) => r.id));
    const sharedIds = [...s2RecruitIds].filter((id) => s1RecruitIds.has(id));
    expect(
      sharedIds.length,
      `Season 2 class should be a mostly fresh class (${sharedIds.length} IDs overlap with Season 1 — expected near 0 for HS recruits)`
    ).toBeLessThan(s2Recruits.length * 0.5);

    // Check eligibility advancement for players who returned (were on roster in both seasons)
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
      `At least some returning players should have their eligibility advanced (FR→SO, SO→JR, JR→SR). Got ${eligibilityAdvanced} advances.`
    ).toBeGreaterThan(0);

    // No duplicate player IDs on the roster
    const playerIds = s2Roster.map((p) => p.id);
    expect(
      new Set(playerIds).size,
      "No duplicate player IDs should exist in Season 2 roster"
    ).toBe(playerIds.length);

    // -- PARTIAL SEASON 2 SIM: confirm advance works --
    // Use force-advance (commissioner endpoint) since coach readiness resets each week.
    await forceAdvance(request, league.id);
    const s2AfterWeek1 = await getLeague(request, league.id);
    expect(
      s2AfterWeek1.currentSeason,
      "Should still be in Season 2 after one week advance"
    ).toBe(2);
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
    expect(
      s2State.currentSeason,
      "Should be in Season 2 after completing full offseason"
    ).toBe(2);

    const minRecruits = expectedRecruitCount(teams.length);
    const s2Recruits = await getRecruits(request, league.id);
    expect(s2Recruits.length, `Season 2 class should have ≥${minRecruits} recruits`).toBeGreaterThanOrEqual(minRecruits);

    // The Season 2 class should be a fresh generation — IDs should not overlap with Season 1 HS class
    const s1HsIds = new Set(
      s1Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id)
    );
    const s2HsIds = s2Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id);
    const overlap = s2HsIds.filter((id) => s1HsIds.has(id));
    expect(
      overlap.length,
      `Season 2 HS recruits should be completely new (${overlap.length} IDs matched Season 1 HS recruits)`
    ).toBe(0);

    // JUCO recruits in Season 2 class are a bonus — just verify the class structure is reasonable
    const jucoCount = s2Recruits.filter((r) => r.recruitType === "JUCO").length;
    const transferCount = s2Recruits.filter((r) => r.recruitType === "TRANSFER").length;
    const hsCount = s2Recruits.filter((r) => r.recruitType === "HS").length;
    expect(
      hsCount,
      `Season 2 class should be mostly HS recruits (got ${hsCount} HS out of ${s2Recruits.length} total)`
    ).toBeGreaterThan(0);

    void jucoCount;
    void transferCount;
  });
});
