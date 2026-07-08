import { test, expect } from "@playwright/test";
import {
  createGuestSession,
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeagueTeams,
  setupCoach,
} from "../helpers/api";
import { calculateSignInterestThreshold, SIGNABLE_STAGES } from "../../server/route-helpers";
import { updateRecruitStages } from "../../server/routes/league-mgmt";
import { storage } from "../../server/storage";
import type { InsertPlayer } from "../../shared/schema";

async function setupLeagueWithRecruit(request: import("@playwright/test").APIRequestContext) {
  await createGuestSession(request);

  const league = await createLeague(request, {
    name: `Signing Integrity Test ${Date.now()}-${Math.random()}`,
    maxTeams: 13,
    cpuDifficulty: "beginner",
    selectedConferences: ["SEC", "ACC", "Big 12"],
    seasonLength: "standard",
  });

  const selectedTeams = await getTeamsForConferences(request, league.id, 13);
  await selectTeams(request, league.id, selectedTeams);
  await startDynasty(request, league.id);

  const teams = await getLeagueTeams(request, league.id);
  const humanTeam = teams[0];
  const rivalTeam = teams[1];
  await setupCoach(request, league.id, humanTeam.id);

  const recruitingResp = await request.get(`/api/leagues/${league.id}/recruiting`);
  const recruitingData = await recruitingResp.json();
  const recruits: Array<{ id: string; starRating: number; nilCost: number }> = recruitingData.recruits ?? [];
  // Pick a mid-tier (3-star) recruit for predictable thresholds.
  const recruit =
    recruits.find((r) => r.starRating === 3) ?? recruits[0];

  return { league, humanTeam, rivalTeam, recruit };
}

async function setInterest(
  recruitId: string,
  teamId: string,
  data: { hasOffer: boolean; interestLevel: number }
) {
  const existing = await storage.getRecruitingInterest(recruitId, teamId);
  if (existing) {
    await storage.updateRecruitingInterest(existing.id, data);
  } else {
    await storage.createRecruitingInterest({
      recruitId,
      teamId,
      interestLevel: data.interestLevel,
      hasOffer: data.hasOffer,
    });
  }
}

test.describe("Recruit signing integrity — pure helpers", () => {
  test("SIGNABLE_STAGES only allows top3 and verbal", () => {
    expect(SIGNABLE_STAGES.has("top3")).toBe(true);
    expect(SIGNABLE_STAGES.has("verbal")).toBe(true);
    expect(SIGNABLE_STAGES.has("open")).toBe(false);
    expect(SIGNABLE_STAGES.has("top8")).toBe(false);
    expect(SIGNABLE_STAGES.has("top5")).toBe(false);
    expect(SIGNABLE_STAGES.has("signed")).toBe(false);
  });

  test("calculateSignInterestThreshold scales with star rating, blue chip, storyline, and prestige", () => {
    expect(calculateSignInterestThreshold(3, false, false, 5)).toBe(65);
    expect(calculateSignInterestThreshold(4, false, false, 5)).toBe(75);
    expect(calculateSignInterestThreshold(5, false, false, 5)).toBe(85);
    expect(calculateSignInterestThreshold(5, true, false, 5)).toBe(90);
    // Storyline bonus adds 10.
    expect(calculateSignInterestThreshold(3, false, true, 5)).toBe(75);
    // High prestige (9+) reduces threshold by 5, but never below the 55 floor.
    expect(calculateSignInterestThreshold(3, false, false, 9)).toBe(60);
    expect(calculateSignInterestThreshold(3, false, false, 8)).toBe(62);
    // Floor of 55 always holds.
    expect(calculateSignInterestThreshold(1, false, false, 10)).toBeGreaterThanOrEqual(55);
  });
});

test.describe("Recruit signing integrity — manual /sign endpoint", () => {
  test("succeeds when offer + sufficient interest + signable stage are all met", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: threshold + 5 });
    await storage.updateRecruit(recruit.id, { stage: "top3" });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.ok(), `Expected sign to succeed: ${await resp.text()}`).toBe(true);
    const body = await resp.json();
    expect(body.signedTeamId).toBe(humanTeam.id);
    expect(body.stage).toBe("signed");
  });

  test("rejects signing when the team never extended an offer", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: false, interestLevel: threshold + 20 });
    await storage.updateRecruit(recruit.id, { stage: "verbal" });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/extend a scholarship offer/i);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("rejects signing when interest hasn't reached the required threshold", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: Math.max(0, threshold - 15) });
    await storage.updateRecruit(recruit.id, { stage: "top3" });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/hasn't reached the level needed to sign/i);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("rejects signing when the recruit's stage hasn't progressed far enough (top8)", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: threshold + 20 });
    await storage.updateRecruit(recruit.id, { stage: "top8" });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/hasn't progressed far enough/i);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("rejects signing when the team can't afford the recruit's NIL cost", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: threshold + 20 });
    await storage.updateRecruit(recruit.id, { stage: "top3" });
    // Force NIL budget to zero remaining so any positive NIL cost fails.
    await storage.updateTeam(humanTeam.id, { nilBudget: 0, nilSpent: 0 });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/Insufficient NIL budget/i);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("rejects signing when it would push the roster past the 30-player cap", async ({ request }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: threshold + 20 });
    await storage.updateRecruit(recruit.id, { stage: "top3" });

    // Roster starts at 25; add 6 filler players to push a hypothetical sign over the 30 cap.
    const fillerPlayers: InsertPlayer[] = Array.from({ length: 6 }).map((_, i) => ({
      teamId: humanTeam.id,
      firstName: "Filler",
      lastName: `Player${i}`,
      position: "OF",
      eligibility: "FR",
      throwHand: "R",
      batHand: "R",
      homeState: "CA",
      hometown: "Test City",
      jerseyNumber: 90 + i,
    }));
    for (const p of fillerPlayers) {
      await storage.createPlayer(p);
    }

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/Roster would exceed 30-player limit/i);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("ignores any team id supplied in the request body — always signs to the caller's own team", async ({
    request,
  }) => {
    const { league, humanTeam, rivalTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, humanTeam.prestige ?? 5);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: true, interestLevel: threshold + 20 });
    await storage.updateRecruit(recruit.id, { stage: "verbal" });

    const resp = await request.post(`/api/leagues/${league.id}/recruiting/${recruit.id}/sign`, {
      data: { teamId: rivalTeam.id, signedTeamId: rivalTeam.id },
    });
    expect(resp.ok(), `Expected sign to succeed: ${await resp.text()}`).toBe(true);
    const body = await resp.json();
    expect(body.signedTeamId).toBe(humanTeam.id);
    expect(body.signedTeamId).not.toBe(rivalTeam.id);
  });
});

test.describe("Recruit signing integrity — signing-day auto-commit", () => {
  test("never auto-signs a recruit to a team that has no offer, even with the highest interest", async ({
    request,
  }) => {
    const { league, humanTeam, recruit } = await setupLeagueWithRecruit(request);

    await setInterest(recruit.id, humanTeam.id, { hasOffer: false, interestLevel: 99 });
    await storage.updateRecruit(recruit.id, { stage: "verbal" });

    await updateRecruitStages(league.id, 20);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBeFalsy();
  });

  test("auto-commits a verbal recruit to the offering team over a higher-interest rival with no offer", async ({
    request,
  }) => {
    const { league, humanTeam, rivalTeam, recruit } = await setupLeagueWithRecruit(request);
    const threshold = calculateSignInterestThreshold(recruit.starRating, false, false, rivalTeam.prestige ?? 5);

    // Rival has higher interest but never offered — must not win the recruit.
    await setInterest(recruit.id, humanTeam.id, { hasOffer: false, interestLevel: 99 });
    // Offering team has lower (but sufficient) interest — should win the recruit.
    await setInterest(recruit.id, rivalTeam.id, { hasOffer: true, interestLevel: threshold + 5 });
    await storage.updateRecruit(recruit.id, { stage: "verbal" });

    await updateRecruitStages(league.id, 20);

    const persisted = await storage.getRecruit(recruit.id);
    expect(persisted?.signedTeamId).toBe(rivalTeam.id);
    expect(persisted?.signedTeamId).not.toBe(humanTeam.id);
  });
});
