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

test.describe("roster page refactor smoke test", () => {
  test("roster page loads in list, depth, and development views without crashing", async ({ page, request }) => {
    await createGuestSession(request);
    const league = await createLeague(request, {
      name: "Roster Refactor Smoke League",
      maxTeams: 8,
      selectedConferences: ["SEC"],
      seasonLength: "short",
    });
    const teams = await getTeamsForConferences(request, league.id, 8);
    await selectTeams(request, league.id, teams);
    await startDynasty(request, league.id);
    const leagueTeams = await getLeagueTeams(request, league.id);
    const myTeam = leagueTeams[0];
    await setupCoach(request, league.id, myTeam.id);

    await page.goto(`/league/${league.id}/roster`);
    await expect(page.locator("h1").filter({ hasText: /Roster/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="select-position-filter"]')).toBeVisible();

    await page.locator('[data-testid="button-depth-view"]').click();
    await expect(page.locator('[data-testid="depth-chart-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid^="depth-card-"]').first()).toBeVisible();

    await page.locator('[data-testid="tab-lineup"]').click();
    await expect(page.locator('[data-testid="batting-order-section"]')).toBeVisible();

    await page.locator('[data-testid="tab-pitching"]').click();
    await expect(page.locator('[data-testid="starting-rotation-section"]')).toBeVisible();

    await page.locator('[data-testid="button-list-view"]').click();
    await expect(page.locator('[data-testid="select-position-filter"]')).toBeVisible();

    const firstPlayerLink = page.locator('[data-testid^="link-player-"]').first();
    if (await firstPlayerLink.count() > 0) {
      await firstPlayerLink.click();
      await expect(page.locator('.font-pixel').first()).toBeVisible();
    }
  });
});
