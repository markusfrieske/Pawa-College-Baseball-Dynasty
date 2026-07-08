/**
 * Smoke tests for extracted route modules.
 *
 * These tests verify that the HTTP flows for game reporting, invite links,
 * saved rosters, and recruiting class sharing all work correctly after the
 * routes were extracted from the monolithic routes.ts into:
 *   - server/routes/games.ts   (game schedule + game-report routes)
 *   - server/routes/invites.ts (invite-link routes)
 *   - server/routes/saved.ts   (saved rosters + recruiting class shares)
 *
 * All tests use Playwright's API request fixtures — no browser UI needed.
 * Two separate browser contexts (ctx1 / ctx2) give two independent sessions
 * for flows that require two distinct authenticated users.
 */

import { test, expect } from "@playwright/test";
import {
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeagueTeams,
  setupCoach,
} from "../helpers/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Register a new user and return their userId (session cookie is set). */
async function registerUser(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const resp = await request.post("/api/auth/register", {
    data: { email, password },
  });
  // If already registered (re-run), fall back to login.
  if (resp.status() === 400) {
    const login = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(login.ok()).toBeTruthy();
    const d = await login.json();
    return d.id as string;
  }
  expect(resp.ok()).toBeTruthy();
  const d = await resp.json();
  return d.id as string;
}

/** Unique suffix so parallel runs don't collide on email. */
function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------------------
// Suite 1 — server/routes/saved.ts
// ---------------------------------------------------------------------------

test.describe("saved.ts — saved rosters and recruiting class shares", () => {
  test("create, list, and fetch a saved roster", async ({ browser }) => {
    const ctx = await browser.newContext();
    const req = ctx.request;
    const suffix = uid();
    await registerUser(req, `saved_${suffix}@test.invalid`, "pass1234");

    // Create
    const create = await req.post("/api/saved-rosters", {
      data: {
        name: `Roster_${suffix}`,
        rosterData: [{ playerId: "p1", position: "SP" }],
      },
    });
    expect(create.status()).toBe(200);
    const roster = await create.json();
    expect(roster.name).toBe(`Roster_${suffix}`);
    expect(roster.id).toBeTruthy();

    // List
    const list = await req.get("/api/saved-rosters");
    expect(list.status()).toBe(200);
    const rosters = await list.json();
    expect(Array.isArray(rosters)).toBe(true);
    expect(rosters.some((r: { id: string }) => r.id === roster.id)).toBe(true);

    // Fetch by id
    const fetch = await req.get(`/api/saved-rosters/${roster.id}`);
    expect(fetch.status()).toBe(200);
    const fetched = await fetch.json();
    expect(fetched.id).toBe(roster.id);
    expect(fetched.name).toBe(`Roster_${suffix}`);

    await ctx.close();
  });

  test("create a recruiting class, share it, and import it as a second user", async ({
    browser,
  }) => {
    const suffix = uid();
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const req1 = ctx1.request;
    const req2 = ctx2.request;

    await registerUser(req1, `classowner_${suffix}@test.invalid`, "pass1234");
    await registerUser(req2, `classimport_${suffix}@test.invalid`, "pass1234");

    // Owner creates a recruiting class
    const create = await req1.post("/api/saved-recruiting-classes", {
      data: {
        name: `Class_${suffix}`,
        classData: [
          { firstName: "John", lastName: "Doe", position: "SP", starRating: 3 },
        ],
      },
    });
    expect(create.status()).toBe(200);
    const rc = await create.json();
    expect(rc.name).toBe(`Class_${suffix}`);

    // Owner creates share link
    const share = await req1.post(
      `/api/saved-recruiting-classes/${rc.id}/shares`,
      { data: { label: "smoke share" } }
    );
    expect(share.status()).toBe(200);
    const shareData = await share.json();
    expect(shareData.token).toBeTruthy();
    const token: string = shareData.token;

    // Public preview (no auth required)
    const preview = await req2.get(`/api/import-class/${token}`);
    expect(preview.status()).toBe(200);
    const previewData = await preview.json();
    expect(previewData.className).toBe(`Class_${suffix}`);
    expect(previewData.token).toBe(token);

    // Import as second user
    const imported = await req2.post(`/api/import-class/${token}`);
    expect(imported.status()).toBe(200);
    const importedData = await imported.json();
    expect(importedData.success).toBe(true);
    expect(importedData.class.name).toBe(`Class_${suffix}`);

    // Owner cannot import their own class
    const selfImport = await req1.post(`/api/import-class/${token}`);
    expect(selfImport.status()).toBe(400);

    await ctx1.close();
    await ctx2.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — server/routes/invites.ts
// ---------------------------------------------------------------------------

test.describe("invites.ts — invite link generation, preview, accept, and revoke", () => {
  test("commissioner creates an invite, previews it publicly, and revokes it", async ({
    browser,
  }) => {
    const suffix = uid();
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const req1 = ctx1.request;
    const req2 = ctx2.request;

    await registerUser(req1, `commish_inv_${suffix}@test.invalid`, "pass1234");
    await registerUser(req2, `member_inv_${suffix}@test.invalid`, "pass1234");

    // Create a small league (dynasty_setup is enough for invite tests)
    const league = await createLeague(req1, {
      name: `InviteLeague_${suffix}`,
      maxTeams: 6,
      selectedConferences: ["SEC"],
      seasonLength: "short",
    });

    // Non-commissioner cannot create an invite
    const noAuth = await req2.post(`/api/leagues/${league.id}/invites`, {
      data: { label: "unauthorized" },
    });
    expect(noAuth.status()).toBe(403);

    // Commissioner creates an invite
    const invite = await req1.post(`/api/leagues/${league.id}/invites`, {
      data: { label: `smoke_${suffix}` },
    });
    expect(invite.status()).toBe(200);
    const inviteData = await invite.json();
    expect(inviteData.inviteCode).toBeTruthy();
    const code: string = inviteData.inviteCode;

    // Public preview (no auth required)
    const preview = await req2.get(`/api/invites/${code}`);
    expect(preview.status()).toBe(200);
    const previewData = await preview.json();
    expect(previewData.invite.inviteCode).toBe(code);
    expect(previewData.league.id).toBe(league.id);

    // Revoke the invite (commissioner)
    const revoke = await req1.post(`/api/invites/${code}/revoke`);
    expect(revoke.status()).toBe(200);
    const revokeData = await revoke.json();
    expect(revokeData.success).toBe(true);

    // Preview of revoked invite returns 400
    const revokedPreview = await req2.get(`/api/invites/${code}`);
    expect(revokedPreview.status()).toBe(400);

    await ctx1.close();
    await ctx2.close();
  });

  test("second user accepts an invite to join a dynasty-setup league", async ({
    browser,
  }) => {
    const suffix = uid();
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const req1 = ctx1.request;
    const req2 = ctx2.request;

    await registerUser(req1, `commish_acc_${suffix}@test.invalid`, "pass1234");
    await registerUser(req2, `joiner_acc_${suffix}@test.invalid`, "pass1234");

    const league = await createLeague(req1, {
      name: `AcceptLeague_${suffix}`,
      maxTeams: 6,
      selectedConferences: ["SEC"],
      seasonLength: "short",
    });

    // Select teams and start dynasty so there are actual team rows in the DB
    const teamsToSelect = await getTeamsForConferences(req1, league.id, 6);
    await selectTeams(req1, league.id, teamsToSelect);
    await startDynasty(req1, league.id);

    // Commissioner sets up as coach on first team
    const leagueTeams = await getLeagueTeams(req1, league.id);
    const cpuTeams = leagueTeams.filter((t) => t.isCpu);
    expect(cpuTeams.length).toBeGreaterThan(1);
    await setupCoach(req1, league.id, cpuTeams[0].id);

    // Commissioner creates invite
    const invite = await req1.post(`/api/leagues/${league.id}/invites`, {
      data: { label: `accept_${suffix}` },
    });
    expect(invite.status()).toBe(200);
    const { inviteCode } = await invite.json();

    // Preview and pick an available team
    const preview = await req2.get(`/api/invites/${inviteCode}`);
    expect(preview.status()).toBe(200);
    const { availableTeams } = await preview.json();
    expect(availableTeams.length).toBeGreaterThan(0);
    const teamId: string = availableTeams[0].id;

    // Second user accepts the invite
    const accept = await req2.post(`/api/invites/${inviteCode}/accept`, {
      data: {
        teamId,
        coachData: { firstName: "Joiner", lastName: "Coach" },
      },
    });
    expect(accept.status()).toBe(200);
    const acceptData = await accept.json();
    expect(acceptData.success).toBe(true);
    expect(acceptData.leagueId).toBe(league.id);

    // Invite is now "accepted" — cannot be accepted again
    const doubleAccept = await req2.post(`/api/invites/${inviteCode}/accept`, {
      data: { teamId: availableTeams[0]?.id ?? teamId },
    });
    expect(doubleAccept.status()).toBe(400);

    await ctx1.close();
    await ctx2.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — server/routes/games.ts
// ---------------------------------------------------------------------------

test.describe("games.ts — game report submit, confirm, dispute, and force-finalize", () => {
  /**
   * Bootstraps a started league with two human coaches placed on the two sides
   * of a guaranteed regular-season matchup.
   *
   * Strategy:
   *  1. Create/start a 6-team SEC short-season dynasty.
   *  2. Query the generated schedule and pick the first regular-phase game.
   *  3. User A becomes coach of the home team; user B accepts an invite and
   *     takes the away team.
   *
   * Because both teams are chosen from an existing game, the guaranteedGameId
   * is always present in the schedule and no test.skip() is needed.
   */
  async function bootstrapLeagueWithTwoCoaches(
    browser: import("@playwright/test").Browser,
    suffix: string
  ) {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const req1 = ctx1.request;
    const req2 = ctx2.request;

    await registerUser(req1, `gameA_${suffix}@test.invalid`, "pass1234");
    await registerUser(req2, `gameB_${suffix}@test.invalid`, "pass1234");

    const league = await createLeague(req1, {
      name: `GameLeague_${suffix}`,
      maxTeams: 6,
      selectedConferences: ["SEC"],
      seasonLength: "short",
    });

    const teamsToSelect = await getTeamsForConferences(req1, league.id, 6);
    await selectTeams(req1, league.id, teamsToSelect);
    await startDynasty(req1, league.id);

    // Find a regular-phase game that hasn't been played yet — both sides are
    // still CPU at this point, so we can freely assign coaches to them.
    const schedResp = await req1.get(`/api/leagues/${league.id}/schedule`);
    expect(schedResp.ok()).toBeTruthy();
    const games: Array<{
      id: string;
      phase: string;
      isComplete: boolean;
      homeTeamId: string;
      awayTeamId: string;
    }> = (await schedResp.json()).games ?? [];

    const targetGame = games.find(
      (g) => g.phase === "regular" && !g.isComplete
    );
    if (!targetGame) {
      throw new Error(
        "bootstrapLeagueWithTwoCoaches: no regular-phase game found in schedule"
      );
    }

    const teamA = targetGame.homeTeamId;
    const teamB = targetGame.awayTeamId;

    // User A takes the home team
    await setupCoach(req1, league.id, teamA);

    // User A generates invite; user B accepts and takes the away team
    const inviteResp = await req1.post(`/api/leagues/${league.id}/invites`, {
      data: { label: `game_${suffix}` },
    });
    expect(inviteResp.ok()).toBeTruthy();
    const { inviteCode } = await inviteResp.json();

    const accept = await req2.post(`/api/invites/${inviteCode}/accept`, {
      data: {
        teamId: teamB,
        coachData: { firstName: "Away", lastName: "Coach" },
      },
    });
    expect(accept.ok()).toBeTruthy();

    return {
      league,
      req1,
      req2,
      ctx1,
      ctx2,
      teamA,
      teamB,
      guaranteedGameId: targetGame.id,
    };
  }

  test("submit a game report vs a CPU team — auto-confirmed", async ({
    browser,
  }) => {
    const suffix = uid();
    const ctx1 = await browser.newContext();
    const req1 = ctx1.request;

    await registerUser(req1, `cpugame_${suffix}@test.invalid`, "pass1234");

    const league = await createLeague(req1, {
      name: `CpuGameLeague_${suffix}`,
      maxTeams: 6,
      selectedConferences: ["SEC"],
      seasonLength: "short",
    });
    const teamsToSelect = await getTeamsForConferences(req1, league.id, 6);
    await selectTeams(req1, league.id, teamsToSelect);
    await startDynasty(req1, league.id);

    const leagueTeams = await getLeagueTeams(req1, league.id);
    const cpuTeams = leagueTeams.filter((t) => t.isCpu);
    await setupCoach(req1, league.id, cpuTeams[0].id);

    // Find a regular-phase game that user A's team is in
    const schedResp = await req1.get(`/api/leagues/${league.id}/schedule`);
    expect(schedResp.ok()).toBeTruthy();
    const schedData = await schedResp.json();
    const games: Array<{
      id: string;
      phase: string;
      isComplete: boolean;
      homeTeamId: string;
      awayTeamId: string;
    }> = schedData.games ?? [];

    const regularGame = games.find(
      (g) =>
        g.phase === "regular" &&
        !g.isComplete &&
        (g.homeTeamId === cpuTeams[0].id || g.awayTeamId === cpuTeams[0].id)
    );
    // It's fine if the schedule has no such game (short season, early phase).
    // Fall back to any regular incomplete game (commissioner can report any).
    const targetGame =
      regularGame ??
      games.find((g) => g.phase === "regular" && !g.isComplete);

    if (!targetGame) {
      // Short season may not have generated regular games yet; skip gracefully.
      test.skip();
      await ctx1.close();
      return;
    }

    const report = await req1.post(
      `/api/leagues/${league.id}/games/${targetGame.id}/report`,
      { data: { homeScore: 5, awayScore: 3 } }
    );
    expect(report.status()).toBe(200);
    const reportData = await report.json();
    // CPU opponent → auto-confirmed
    expect(reportData.status).toBe("confirmed");
    expect(reportData.homeScore).toBe(5);
    expect(reportData.awayScore).toBe(3);
    expect(reportData.autoConfirmed).toBe(true);

    // GET single report
    const get = await req1.get(
      `/api/leagues/${league.id}/games/${targetGame.id}/report`
    );
    expect(get.status()).toBe(200);
    const fetched = await get.json();
    expect(fetched.id).toBe(reportData.id);

    // GET all reports (commissioner view)
    const allReports = await req1.get(
      `/api/leagues/${league.id}/game-reports`
    );
    expect(allReports.status()).toBe(200);
    const all = await allReports.json();
    expect(all.some((r: { id: string }) => r.id === reportData.id)).toBe(true);

    // GET pending (auto-confirmed game should NOT appear in pending list)
    const pending = await req1.get(
      `/api/leagues/${league.id}/game-reports/pending`
    );
    expect(pending.status()).toBe(200);
    const pendingData = await pending.json();
    expect(pendingData.some((r: { id: string }) => r.id === reportData.id)).toBe(
      false
    );

    await ctx1.close();
  });

  test("submit a report vs human team, opposing coach confirms it", async ({
    browser,
  }) => {
    const suffix = uid();
    const { league, req1, req2, ctx1, ctx2, guaranteedGameId } =
      await bootstrapLeagueWithTwoCoaches(browser, suffix);

    // Commissioner (user A) submits the report for the guaranteed matchup
    const report = await req1.post(
      `/api/leagues/${league.id}/games/${guaranteedGameId}/report`,
      { data: { homeScore: 4, awayScore: 2 } }
    );
    expect(report.status()).toBe(200);
    const reportData = await report.json();
    // Both sides are now human coaches → report stays pending until confirmed
    expect(reportData.status).toBe("pending");

    // Verify it appears in the pending list
    const pending = await req1.get(
      `/api/leagues/${league.id}/game-reports/pending`
    );
    expect(pending.status()).toBe(200);
    const pendingList = await pending.json();
    expect(
      pendingList.some((r: { id: string }) => r.id === reportData.id)
    ).toBe(true);

    // User B (opposing coach) confirms
    const confirm = await req2.post(
      `/api/leagues/${league.id}/games/${guaranteedGameId}/report/confirm`
    );
    expect(confirm.status()).toBe(200);
    const confirmData = await confirm.json();
    expect(confirmData.message).toMatch(/confirmed/i);

    await ctx1.close();
    await ctx2.close();
  });

  test("submit a report, opposing coach disputes it, commissioner force-finalizes", async ({
    browser,
  }) => {
    const suffix = uid();
    const { league, req1, req2, ctx1, ctx2, guaranteedGameId } =
      await bootstrapLeagueWithTwoCoaches(browser, suffix);

    // Commissioner submits report for the guaranteed human-vs-human game
    const report = await req1.post(
      `/api/leagues/${league.id}/games/${guaranteedGameId}/report`,
      { data: { homeScore: 6, awayScore: 1 } }
    );
    expect(report.status()).toBe(200);
    const reportData = await report.json();
    expect(reportData.status).toBe("pending");

    // User B (away coach) disputes the reported score
    const dispute = await req2.post(
      `/api/leagues/${league.id}/games/${guaranteedGameId}/report/dispute`,
      { data: { reason: "Score was wrong in our records" } }
    );
    expect(dispute.status()).toBe(200);
    const disputeData = await dispute.json();
    expect(disputeData.message).toMatch(/disputed/i);

    // Appears in the pending list with "disputed" status
    const pending = await req1.get(
      `/api/leagues/${league.id}/game-reports/pending`
    );
    const pendingList = await pending.json();
    const disputedEntry = pendingList.find(
      (r: { id: string; status: string }) => r.id === reportData.id
    );
    expect(disputedEntry).toBeTruthy();
    expect(disputedEntry.status).toBe("disputed");

    // Commissioner force-finalizes the disputed game
    const finalize = await req1.post(
      `/api/leagues/${league.id}/games/${guaranteedGameId}/report/finalize`
    );
    expect(finalize.status()).toBe(200);
    const finalizeData = await finalize.json();
    expect(finalizeData.message).toMatch(/finalized/i);

    await ctx1.close();
    await ctx2.close();
  });
});
