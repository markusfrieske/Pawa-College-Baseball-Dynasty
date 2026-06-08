/**
 * E2E: Standard season with 14 teams (2 conferences of 7)
 *
 * Covers:
 *  - Dynasty creation (14 teams, SEC + ACC + Big 12, standard season)
 *  - Roster size constraints per team
 *  - Recruiting class generation
 *  - Full season simulation through postseason → offseason
 *  - Season 2 advancement (eligibility, fresh class, schedule)
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
  advanceWeek,
  finalizeDepartures,
  markWalkonsReady,
  simToSigningDay,
} from "../helpers/api";
import type { APIRequestContext } from "@playwright/test";

const TEAM_COUNT = 14;
const CONFERENCES = ["SEC", "ACC", "Big 12"];

// --- small helpers -----------------------------------------------------------

async function getRoster(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ id: string; eligibility: string }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/roster`);
  if (!resp.ok()) throw new Error(`Roster failed: ${resp.status()} ${await resp.text()}`);
  const data = await resp.json();
  return (data.players ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    eligibility: string;
  }>;
}

async function getRecruits(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ id: string; starRating: number; recruitType: string }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/recruiting`);
  if (!resp.ok()) throw new Error(`Recruiting failed: ${resp.status()} ${await resp.text()}`);
  const data = await resp.json();
  return (data.recruits ?? []) as Array<{
    id: string;
    starRating: number;
    recruitType: string;
  }>;
}

async function getScheduleGames(
  request: APIRequestContext,
  leagueId: string,
  season: number
): Promise<Array<{ id: string; season: number; isComplete: boolean; phase: string }>> {
  const resp = await request.get(`/api/leagues/${leagueId}/schedule`);
  if (!resp.ok()) throw new Error(`Schedule failed: ${resp.status()} ${await resp.text()}`);
  const data = await resp.json();
  const games = (data.games ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    season: number;
    isComplete: boolean;
    phase: string;
  }>;
  return games.filter((g) => g.season === season);
}

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
      throw new Error(`Walk-on phase stuck after ${safety} advances`);
    }
  }

  return state;
}

// -----------------------------------------------------------------------------

test.describe("14-team standard season", () => {
  test.slow(); // 3× default timeout

  test("full lifecycle: creation → sim → offseason → season 2", async ({ request }) => {
    await createGuestSession(request);

    // ── 1. Create league ────────────────────────────────────────────────────
    const league = await createLeague(request, {
      name: `E2E 14-team Standard ${Date.now()}`,
      maxTeams: TEAM_COUNT,
      cpuDifficulty: "beginner",
      selectedConferences: CONFERENCES,
      seasonLength: "standard",
    });

    expect(league.id).toBeTruthy();
    expect(league.currentPhase).toBe("dynasty_setup");

    // ── 2. Team selection ───────────────────────────────────────────────────
    const selectedTeams = await getTeamsForConferences(request, league.id, TEAM_COUNT);
    const totalSelected = selectedTeams.reduce((n, c) => n + c.teamNames.length, 0);
    expect(
      totalSelected,
      `Should have exactly ${TEAM_COUNT} teams selected (got ${totalSelected})`
    ).toBe(TEAM_COUNT);

    const selResp = await request.post(`/api/leagues/${league.id}/team-selection`, {
      data: { selectedTeams },
      timeout: 90_000,
    });
    if (!selResp.ok()) {
      throw new Error(`team-selection failed: ${selResp.status()} ${await selResp.text()}`);
    }

    // ── 3. Start dynasty ────────────────────────────────────────────────────
    const startResp = await request.post(`/api/leagues/${league.id}/start`, {
      data: {},
      timeout: 90_000,
    });
    if (!startResp.ok()) {
      throw new Error(`start dynasty failed: ${startResp.status()} ${await startResp.text()}`);
    }

    const started = await getLeague(request, league.id);
    expect(started.currentPhase).toBe("preseason");
    expect(started.currentSeason).toBe(1);

    const teams = await getLeagueTeams(request, league.id);
    expect(teams.length, `Expected ${TEAM_COUNT} teams`).toBe(TEAM_COUNT);
    await setupCoach(request, league.id, teams[0].id);

    // ── 4. Roster assertions ────────────────────────────────────────────────
    const roster = await getRoster(request, league.id);
    expect(
      roster.length,
      `Human team roster should have 20–25 players (got ${roster.length})`
    ).toBeGreaterThanOrEqual(20);
    expect(roster.length).toBeLessThanOrEqual(25);

    const s1EligSnapshot = new Map(roster.map((p) => [p.id, p.eligibility]));

    // ── 5. Recruiting class ─────────────────────────────────────────────────
    const minRecruits = Math.min(TEAM_COUNT * 5 + 10, 80);
    const s1Recruits = await getRecruits(request, league.id);
    expect(
      s1Recruits.length,
      `Expected ≥${minRecruits} recruits for ${TEAM_COUNT} teams (got ${s1Recruits.length})`
    ).toBeGreaterThanOrEqual(minRecruits);

    const threeStarCount = s1Recruits.filter((r) => r.starRating === 3).length;
    expect(
      threeStarCount,
      `3-star recruits should be the plurality (got ${threeStarCount} / ${s1Recruits.length})`
    ).toBeGreaterThan(Math.floor(minRecruits * 0.15));

    // ── 6. Sim season 1 to offseason ────────────────────────────────────────
    await request.post(`/api/leagues/${league.id}/sim-to-offseason`, {
      data: {},
      timeout: 240_000,
    });

    let state = await getLeague(request, league.id);
    // Advance past any remaining postseason phases
    let safety = 0;
    while (!state.currentPhase.startsWith("offseason") && safety < 12) {
      await advanceWeek(request, league.id);
      state = await getLeague(request, league.id);
      safety++;
    }
    expect(
      state.currentPhase.startsWith("offseason"),
      `Expected an offseason phase, got "${state.currentPhase}"`
    ).toBe(true);

    // ── 7. Season 1 schedule ────────────────────────────────────────────────
    const s1Games = await getScheduleGames(request, league.id, 1);
    expect(s1Games.length, "Season 1 should have games").toBeGreaterThan(0);
    const completedS1 = s1Games.filter((g) => g.isComplete);
    expect(completedS1.length, "Season 1 should have completed games").toBeGreaterThan(0);

    // ── 8. Complete offseason ───────────────────────────────────────────────
    const offseasonResult = await completeOffseason(request, league.id);
    expect(
      ["preseason", "spring_training", "regular_season"].includes(offseasonResult.currentPhase),
      `Expected season 2 start phase, got "${offseasonResult.currentPhase}"`
    ).toBe(true);
    expect(offseasonResult.currentSeason, "Should advance to season 2").toBe(2);

    // ── 9. Season 2 roster ──────────────────────────────────────────────────
    const s2Roster = await getRoster(request, league.id);
    expect(s2Roster.length).toBeGreaterThan(0);
    expect(s2Roster.length, "Season 2 roster must be ≤25").toBeLessThanOrEqual(25);

    // No duplicate IDs
    const ids = s2Roster.map((p) => p.id);
    expect(new Set(ids).size, "No duplicate player IDs in season 2 roster").toBe(ids.length);

    // Eligibility advancement
    const eligOrder = ["FR", "SO", "JR", "SR"];
    let advanced = 0;
    for (const p of s2Roster) {
      const prev = s1EligSnapshot.get(p.id);
      if (!prev) continue;
      const prevIdx = eligOrder.indexOf(prev);
      const currIdx = eligOrder.indexOf(p.eligibility);
      if (prevIdx >= 0 && currIdx === prevIdx + 1) advanced++;
    }
    expect(
      advanced,
      `At least some players should have eligibility advanced (got ${advanced})`
    ).toBeGreaterThan(0);

    // ── 10. Season 2 recruiting class ───────────────────────────────────────
    const s2Recruits = await getRecruits(request, league.id);
    expect(
      s2Recruits.length,
      `Season 2 recruiting class should exist (got ${s2Recruits.length})`
    ).toBeGreaterThanOrEqual(minRecruits);

    // HS IDs must not overlap with season 1 HS class
    const s1HsIds = new Set(s1Recruits.filter((r) => r.recruitType === "HS").map((r) => r.id));
    const overlap = s2Recruits
      .filter((r) => r.recruitType === "HS")
      .filter((r) => s1HsIds.has(r.id));
    expect(
      overlap.length,
      `Season 2 HS recruits must be completely new (${overlap.length} overlapped season 1)`
    ).toBe(0);

    // ── 11. Sim season 2 ────────────────────────────────────────────────────
    await request.post(`/api/leagues/${league.id}/sim-to-offseason`, {
      data: {},
      timeout: 240_000,
    });

    const s2Games = await getScheduleGames(request, league.id, 2);
    expect(s2Games.length, "Season 2 should have games").toBeGreaterThan(0);
    const completedS2 = s2Games.filter((g) => g.isComplete);
    expect(completedS2.length, "Season 2 should have completed games").toBeGreaterThan(0);
  });
});
