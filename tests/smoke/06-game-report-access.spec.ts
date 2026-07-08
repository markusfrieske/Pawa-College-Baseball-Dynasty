/**
 * HTTP-level smoke tests for the game-report route (server/routes/games.ts).
 *
 * Access-control rules:
 *   - Unauthenticated               → 401
 *   - Authenticated non-member      → 403
 *   - Commissioner                  → 200 (null before any submission)
 *   - Involved non-commissioner     → 200 (member who joins via invite)
 *   - Quick-score PATCH bad payload → 400
 *
 * Also covers extracted-module registration smoke so we catch any
 * route-registration regressions introduced by the refactor.
 */
import { test, expect } from "@playwright/test";
import {
  createGuestSession,
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
} from "../helpers/api";

// ---------------------------------------------------------------------------
// Helper: commissioner creates a minimal league; returns { leagueId, gameId }
// ---------------------------------------------------------------------------
async function setupLeague(request: any): Promise<{ leagueId: string; gameId: string }> {
  await createGuestSession(request);
  const league = await createLeague(request, {
    name: `Report Test ${Date.now()}`,
    maxTeams: 13,
    cpuDifficulty: "beginner",
    selectedConferences: ["SEC", "ACC", "Big 12"],
    seasonLength: "standard",
    progressionEnabled: false,
  });
  const sel = await getTeamsForConferences(request, league.id, 13);
  await selectTeams(request, league.id, sel);
  await startDynasty(request, league.id);

  const schedResp = await request.get(`/api/leagues/${league.id}/schedule`);
  expect(schedResp.status()).toBe(200);
  const { games } = await schedResp.json();   // endpoint returns { games: [...], … }
  expect(Array.isArray(games) && games.length > 0).toBe(true);

  return { leagueId: league.id, gameId: (games as Array<{ id: string }>)[0].id };
}

// ---------------------------------------------------------------------------
// Access-control tests
// ---------------------------------------------------------------------------
test.describe("Game-report access control (HTTP)", () => {
  test("unauthenticated → 401", async ({ request }) => {
    const resp = await request.get(
      "/api/leagues/fake-id/games/fake-game/report",
      { headers: { cookie: "" } },
    );
    expect(resp.status()).toBe(401);
  });

  test("commissioner → 200 (null before first submission)", async ({ request }) => {
    const { leagueId, gameId } = await setupLeague(request);
    const resp = await request.get(`/api/leagues/${leagueId}/games/${gameId}/report`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // Null is expected before any coach submits a report
    expect(body === null || typeof body === "object").toBe(true);
  });

  test("authenticated non-member → 403", async ({ playwright }) => {
    // Two isolated API contexts — no browser binary needed
    const reqA = await playwright.request.newContext({ baseURL: "http://localhost:5000" });
    const { leagueId, gameId } = await setupLeague(reqA);

    const reqB = await playwright.request.newContext({ baseURL: "http://localhost:5000" });
    await createGuestSession(reqB);

    const resp = await reqB.get(
      `/api/leagues/${leagueId}/games/${gameId}/report`,
    );
    expect(resp.status()).toBe(403);

    await reqA.dispose();
    await reqB.dispose();
  });

  test("involved non-commissioner coach → 200", async ({ playwright }) => {
    // ── Commissioner creates the league ──────────────────────────────────────
    const reqA = await playwright.request.newContext({ baseURL: "http://localhost:5000" });
    await createGuestSession(reqA);
    const league = await createLeague(reqA, {
      name: `Involved ${Date.now()}`,
      maxTeams: 13,
      cpuDifficulty: "beginner",
      selectedConferences: ["SEC", "ACC", "Big 12"],
      seasonLength: "standard",
      progressionEnabled: false,
    });
    const sel = await getTeamsForConferences(reqA, league.id, 13);
    await selectTeams(reqA, league.id, sel);
    await startDynasty(reqA, league.id);

    // Commissioner generates an invite link
    const inviteCreate = await reqA.post(`/api/leagues/${league.id}/invites`, {
      data: { label: "test-invite" },
    });
    expect(inviteCreate.status()).toBe(200);
    const { inviteCode: code } = await inviteCreate.json();
    expect(typeof code).toBe("string");

    // Find an available (CPU-controlled) team for the second user to claim
    // Use GET /api/leagues/:id which returns { teams: [...] } with isCpu flag
    const lgResp = await reqA.get(`/api/leagues/${league.id}`);
    expect(lgResp.status()).toBe(200);
    const lgData = await lgResp.json();
    const teams: Array<{ id: string; name: string; isCpu: boolean }> = lgData.teams ?? [];
    const cpuTeam = teams.find(t => t.isCpu);
    expect(cpuTeam).toBeTruthy();
    const teamId = cpuTeam!.id;

    // ── Second user joins via the invite link ─────────────────────────────────
    const reqB = await playwright.request.newContext({ baseURL: "http://localhost:5000" });
    await createGuestSession(reqB);

    const joinResp = await reqB.post(`/api/invites/${code}/accept`, {
      data: { teamId, coachData: { firstName: "Test", lastName: "Coach", archetype: "Balanced" } },
    });
    expect(joinResp.status()).toBe(200);   // must succeed — team was free

    // ── Involved coach accesses the game-report endpoint ──────────────────────
    const schedResp = await reqB.get(`/api/leagues/${league.id}/schedule`);
    expect(schedResp.status()).toBe(200);
    const { games } = await schedResp.json();
    expect(Array.isArray(games) && games.length > 0).toBe(true);
    const gameId = (games as Array<{ id: string }>)[0].id;

    const rptResp = await reqB.get(
      `/api/leagues/${league.id}/games/${gameId}/report`,
    );
    // Involved coach (member of the league) must receive 200
    expect(rptResp.status()).toBe(200);

    await reqA.dispose();
    await reqB.dispose();
  });

  test("quick-score PATCH with negative score → 400", async ({ request }) => {
    const { leagueId, gameId } = await setupLeague(request);
    const resp = await request.patch(`/api/leagues/${leagueId}/games/${gameId}`, {
      data: { homeScore: -1, awayScore: 3 },
    });
    expect(resp.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Extracted-module registration smoke
// ---------------------------------------------------------------------------
test.describe("Extracted module endpoint registration smoke", () => {
  test("GET /api/auth/me → 200 or 401 (not 404/500)", async ({ request }) => {
    const resp = await request.get("/api/auth/me");
    expect([200, 401]).toContain(resp.status());
  });

  test("GET /api/presence/online-count → 200 with { online: number }", async ({ request }) => {
    const resp = await request.get("/api/presence/online-count");
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body.online).toBe("number");
  });

  test("GET /api/invites/:code with bad code → 404 (not 500)", async ({ request }) => {
    // GET /api/invites/:code is the real route (returns invite preview)
    const resp = await request.get("/api/invites/BADINVITE000BAD");
    expect(resp.status()).toBe(404);
  });

  test("GET /api/saved-rosters (no auth) → 401", async ({ request }) => {
    const resp = await request.get("/api/saved-rosters", {
      headers: { cookie: "" },
    });
    expect(resp.status()).toBe(401);
  });

  test("GET /api/conference-teams → 200 with non-empty array", async ({ request }) => {
    const resp = await request.get("/api/conference-teams");
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body) && body.length > 0).toBe(true);
  });
});
