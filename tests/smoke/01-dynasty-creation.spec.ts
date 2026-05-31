import { test, expect } from "@playwright/test";
import {
  createGuestSession,
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeague,
} from "../helpers/api";

test.describe("Dynasty Creation Smoke Test", () => {
  test("creates a 13-team 3-conference league and verifies commissioner page loads", async ({
    page,
  }) => {
    const req = page.request;

    await createGuestSession(req);

    const league = await createLeague(req, {
      name: "Smoke Test Dynasty",
      maxTeams: 13,
      cpuDifficulty: "beginner",
      selectedConferences: ["SEC", "ACC", "Big 12"],
      seasonLength: "medium",
    });

    expect(league.id).toBeTruthy();
    expect(league.currentPhase).toBe("dynasty_setup");

    const selectedTeams = await getTeamsForConferences(req, league.id, 13);
    expect(selectedTeams.length).toBeGreaterThan(0);
    const totalTeams = selectedTeams.reduce((n, c) => n + c.teamNames.length, 0);
    expect(totalTeams, "Should have exactly 13 teams selected for a 13-team league").toBe(13);

    await selectTeams(req, league.id, selectedTeams);
    await startDynasty(req, league.id);

    const started = await getLeague(req, league.id);
    expect(started.currentPhase).toBe("preseason");

    await page.goto(`/league/${league.id}/commissioner`);

    await expect(page.getByText("Commissioner")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/preseason|spring training/i)).toBeVisible({
      timeout: 15_000,
    });

    const errorTexts = ["Something went wrong", "Error", "404", "crash"];
    for (const txt of errorTexts) {
      await expect(page.getByText(txt, { exact: false })).not.toBeVisible();
    }
  });

  test("dashboard loads for an authenticated guest with existing leagues", async ({
    page,
    request,
  }) => {
    await createGuestSession(request);

    await createLeague(request, {
      name: "Dashboard Visibility Test",
      maxTeams: 13,
      selectedConferences: ["SEC", "ACC", "Big 12"],
      seasonLength: "medium",
    });

    await page.goto("/dashboard");

    await expect(page.getByText(/dynasty|league/i, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
