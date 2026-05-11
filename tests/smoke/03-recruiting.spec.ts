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

test.describe("Recruiting Flow Smoke Test", () => {
  test("scout a recruit, make actions, advance to signing day, confirm player joins roster", async ({
    page,
  }) => {
    const req = page.request;

    await createGuestSession(req);

    const league = await createLeague(req, {
      name: `Recruiting Test ${Date.now()}`,
      maxTeams: 8,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC", "Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(req, league.id, 8);
    await selectTeams(req, league.id, selectedTeams);
    await startDynasty(req, league.id);

    const teams = await getLeagueTeams(req, league.id);
    const humanTeam = teams[0];
    if (!humanTeam) throw new Error("No teams found in league");
    await setupCoach(req, league.id, humanTeam.id);

    const recruitingResp = await req.get(`/api/leagues/${league.id}/recruiting`);
    expect(recruitingResp.ok(), `Recruiting endpoint failed: ${await recruitingResp.text()}`).toBe(true);
    const recruitingData = await recruitingResp.json();
    const allRecruits: Array<{
      id: string;
      starRating: number;
      firstName: string;
      lastName: string;
    }> = recruitingData.recruits ?? [];
    expect(allRecruits.length, "Expected recruits to be generated for the league").toBeGreaterThan(0);

    const sorted = [...allRecruits].sort((a, b) => a.starRating - b.starRating);
    const recruit = sorted[0];

    const scoutResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/scout`
    );
    expect(scoutResp.ok(), `Scout failed: ${await scoutResp.text()}`).toBe(true);

    const phoneResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/phone`,
      { data: { pitchTopic: "reputation" } }
    );
    expect(phoneResp.ok(), `Phone call failed: ${await phoneResp.text()}`).toBe(true);
    const phoneData = await phoneResp.json();
    expect(typeof phoneData.interestGain === "number" || phoneData.success !== false).toBe(true);

    const emailResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/email`,
      { data: { pitchTopic: "facilities" } }
    );
    expect(emailResp.ok(), `Email failed: ${await emailResp.text()}`).toBe(true);

    const visitResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/visit`,
      { data: {} }
    );
    expect(visitResp.ok(), `Campus visit failed: ${await visitResp.text()}`).toBe(true);

    const hcvResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/head-coach-visit`,
      { data: {} }
    );
    expect(hcvResp.ok(), `Head coach visit failed: ${await hcvResp.text()}`).toBe(true);

    const offerResp = await req.post(
      `/api/leagues/${league.id}/recruiting/${recruit.id}/offer`,
      { data: {} }
    );
    expect(offerResp.ok(), `Offer failed: ${await offerResp.text()}`).toBe(true);

    const afterActionsResp = await req.get(`/api/leagues/${league.id}/recruiting`);
    expect(afterActionsResp.ok()).toBe(true);
    const afterData = await afterActionsResp.json();
    const updatedRecruit = (afterData.recruits as Array<typeof recruit & { interest?: { interestLevel?: number; hasOffer?: boolean } }>).find(
      (r) => r.id === recruit.id
    );
    expect(updatedRecruit, "Recruit should still be visible after actions").toBeDefined();

    const interestLevelAfter = updatedRecruit?.interest?.interestLevel ?? 0;
    expect(
      interestLevelAfter,
      `Recruit interest level should have increased above 0 after scout/phone/email/visit/HCV/offer actions (got ${interestLevelAfter})`
    ).toBeGreaterThan(0);

    await page.goto(`/league/${league.id}/recruiting`);
    await expect(page.getByText(/recruiting/i, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    await expect(
      page.getByText(/something went wrong|application error/i, { exact: false })
    ).not.toBeVisible();

    await expect(
      page.getByText("Offered").first(),
      `"Offered" badge should appear on the recruiting page after a scholarship offer was made`
    ).toBeVisible({ timeout: 10_000 });

    // Interest label (Cool/Warm/Hot/Very Hot/On Fire) must appear — confirms UI reflects
    // the positive interest delta from phone/email/visit/head-coach-visit/offer actions.
    await expect(
      page.getByText(/\b(Cool|Warm|Hot|Very Hot|On Fire)\b/).first(),
      `A positive interest label should be visible on the recruiting page (interest level: ${interestLevelAfter}%)`
    ).toBeVisible({ timeout: 10_000 });

    const initialRosterResp = await req.get(`/api/leagues/${league.id}/roster`);
    const initialPlayers: Array<{ id: string; firstName: string; lastName: string }> =
      initialRosterResp.ok() ? (await initialRosterResp.json()).players ?? [] : [];
    const initialPlayerIds = new Set(initialPlayers.map((p) => p.id));
    const initialNames = new Set(initialPlayers.map((p) => `${p.firstName} ${p.lastName}`));

    await simToOffseason(req, league.id);
    let leagueState = await getLeague(req, league.id);

    if (leagueState.currentPhase === "offseason_departures") {
      await finalizeDepartures(req, league.id);
      await simToSigningDay(req, league.id);
      leagueState = await getLeague(req, league.id);
    }

    if (leagueState.currentPhase === "offseason_walkons") {
      await markWalkonsReady(req, league.id);
      let safety = 0;
      while (leagueState.currentPhase === "offseason_walkons" && safety < 10) {
        await advanceWeek(req, league.id);
        leagueState = await getLeague(req, league.id);
        safety++;
      }
      if (leagueState.currentPhase === "offseason_walkons") {
        throw new Error("Walkon phase did not complete after 10 advance attempts");
      }
    }

    expect(
      ["preseason", "spring_training", "regular_season"],
      `Expected preseason after signing day, got ${leagueState.currentPhase}`
    ).toContain(leagueState.currentPhase);

    const finalRosterResp = await req.get(`/api/leagues/${league.id}/roster`);
    expect(finalRosterResp.ok(), `Roster fetch failed: ${await finalRosterResp.text()}`).toBe(true);
    const finalPlayers: Array<{ id: string; firstName: string; lastName: string }> =
      (await finalRosterResp.json()).players ?? [];
    expect(finalPlayers.length, "Roster should have players after signing day").toBeGreaterThan(0);

    const recruitFullName = `${recruit.firstName} ${recruit.lastName}`;
    const signedWithUs = finalPlayers.find(
      (p) => `${p.firstName} ${p.lastName}` === recruitFullName
    );

    expect(
      signedWithUs,
      `Targeted recruit ${recruitFullName} should be on the roster after signing day. ` +
        `All actions were taken (scout, phone, email, campus visit, HC visit, offer) ` +
        `at beginner difficulty for a ${recruit.starRating}-star recruit.`
    ).toBeDefined();

    expect(
      initialPlayerIds.has(signedWithUs!.id),
      `${recruitFullName} should be a NEW player added from signing day, not a pre-existing roster member`
    ).toBe(false);
  });

  test("recruiting page renders with recruit cards visible", async ({ page, request }) => {
    await createGuestSession(request);

    const league = await createLeague(request, {
      name: `Recruit UI Test ${Date.now()}`,
      maxTeams: 6,
      cpuDifficulty: "beginner",
      selectedConferences: ["Ivy League"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(request, league.id, 6);
    await selectTeams(request, league.id, selectedTeams);
    await startDynasty(request, league.id);

    const teams = await getLeagueTeams(request, league.id);
    if (teams[0]) {
      await setupCoach(request, league.id, teams[0].id);
    }

    await page.goto(`/league/${league.id}/recruiting`);

    await expect(page.getByText(/recruiting/i, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.waitForTimeout(3000);

    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(100);

    await expect(
      page.getByText(/something went wrong|application error|unhandled/i, { exact: false })
    ).not.toBeVisible();
  });
});
