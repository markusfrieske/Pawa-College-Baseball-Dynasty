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
} from "../helpers/api";

test.describe("Commissioner UI Smoke Test", () => {
  test(
    "advance-week button on commissioner page increments week via UI click",
    async ({ page }) => {
      const req = page.request;

      await createGuestSession(req);

      const league = await createLeague(req, {
        name: `Commissioner UI ${Date.now()}`,
        maxTeams: 13,
        cpuDifficulty: "beginner",
        selectedConferences: ["SEC", "ACC", "Big 12"],
        seasonLength: "medium",
      });

      const selectedTeams = await getTeamsForConferences(req, league.id, 13);
      await selectTeams(req, league.id, selectedTeams);
      await startDynasty(req, league.id);

      const teams = await getLeagueTeams(req, league.id);
      if (!teams[0]) throw new Error("No teams found after dynasty start");
      await setupCoach(req, league.id, teams[0].id);

      await page.goto(`/league/${league.id}/commissioner`);
      await page.waitForLoadState("networkidle");

      const advanceBtn = page.locator('[data-testid="button-advance-week"]');
      await expect(advanceBtn, "Advance button should be visible on commissioner page").toBeVisible({
        timeout: 20_000,
      });
      await expect(advanceBtn, "Advance button should be enabled before clicking").toBeEnabled();

      const weekBefore = (await getLeague(req, league.id)).currentWeek;

      const [advanceResp] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/leagues/${league.id}/advance`) &&
            resp.request().method() === "POST",
          { timeout: 20_000 }
        ),
        advanceBtn.click(),
      ]);

      expect(
        advanceResp.ok(),
        `Advance API call should succeed (status: ${advanceResp.status()})`
      ).toBe(true);

      const weekAfter = (await getLeague(req, league.id)).currentWeek;
      expect(
        weekAfter,
        `Week should have incremented: was ${weekBefore}, now ${weekAfter}`
      ).toBeGreaterThan(weekBefore);

      await expect(
        page.getByText(/something went wrong|application error/i, { exact: false })
      ).not.toBeVisible();
    }
  );
});
