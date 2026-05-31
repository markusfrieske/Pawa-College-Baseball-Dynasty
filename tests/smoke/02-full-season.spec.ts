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
  advanceFullSeason,
} from "../helpers/api";

const SEASONS_TO_RUN = 5;

test.describe("Multi-Season Advance Smoke Test", () => {
  test(
    `advances through ${SEASONS_TO_RUN} full seasons without crashes`,
    async ({ page, request }) => {
      await createGuestSession(request);

      const league = await createLeague(request, {
        name: `Season Loop Test ${Date.now()}`,
        maxTeams: 13,
        cpuDifficulty: "beginner",
        selectedConferences: ["SEC", "ACC", "Big 12"],
        seasonLength: "short",
      });

      const selectedTeams = await getTeamsForConferences(request, league.id, 13);
      await selectTeams(request, league.id, selectedTeams);
      await startDynasty(request, league.id);

      const teams = await getLeagueTeams(request, league.id);
      const humanTeam = teams[0];
      if (!humanTeam) throw new Error("No teams in league after start");
      await setupCoach(request, league.id, humanTeam.id);

      let currentSeason = 1;

      for (let i = 0; i < SEASONS_TO_RUN; i++) {
        const seasonBefore = currentSeason;

        currentSeason = await advanceFullSeason(request, league.id);

        const leagueState = await getLeague(request, league.id);

        expect(leagueState.currentSeason).toBeGreaterThanOrEqual(seasonBefore);
        expect(["preseason", "spring_training", "regular_season", "offseason_walkons"]).toContain(
          leagueState.currentPhase
        );

        const standingsResp = await request.get(`/api/leagues/${league.id}`);
        expect(standingsResp.ok()).toBe(true);
        const standingsLeague = await standingsResp.json();
        expect(standingsLeague.currentSeason).toBeGreaterThanOrEqual(seasonBefore);
        currentSeason = standingsLeague.currentSeason;

        const rosterResp = await request.get(`/api/leagues/${league.id}/roster`);
        expect(rosterResp.ok(), `Season ${currentSeason} roster endpoint failed`).toBe(true);
        const rosterData = await rosterResp.json();
        const players: unknown[] = rosterData.players ?? (Array.isArray(rosterData) ? rosterData : []);
        expect(
          players.length,
          `Season ${currentSeason} roster should be non-empty after signing day + walkons`
        ).toBeGreaterThan(0);

        await page.goto(`/league/${league.id}/commissioner`);
        await expect(page.locator("h1, [class*='font-pixel']").first()).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          page.getByText(/something went wrong|application error|unhandled exception/i, {
            exact: false,
          })
        ).not.toBeVisible();
      }

      const finalLeague = await getLeague(request, league.id);
      expect(finalLeague.currentSeason).toBeGreaterThanOrEqual(SEASONS_TO_RUN);
    }
  );

  test("phase labels are non-empty on commissioner page after 1 season", async ({ page }) => {
    const req = page.request;

    await createGuestSession(req);

    const league = await createLeague(req, {
      name: `Phase Labels Test ${Date.now()}`,
      maxTeams: 6,
      cpuDifficulty: "beginner",
      selectedConferences: ["WCC"],
      seasonLength: "short",
    });

    const selectedTeams = await getTeamsForConferences(req, league.id, 6);
    await selectTeams(req, league.id, selectedTeams);
    await startDynasty(req, league.id);

    await advanceFullSeason(req, league.id);

    await page.goto(`/league/${league.id}/commissioner`);
    await expect(page.locator('[data-testid="button-advance-week"]')).toBeVisible({
      timeout: 20_000,
    });

    const phaseCard = page.locator("[class*='text-lg']").first();
    await expect(phaseCard).not.toBeEmpty();
  });
});
