/**
 * Smoke test: Ticker banner populates after a single week advance
 *
 * Verifies that the League Hub ticker (data-testid="league-ticker-banner")
 * renders at least one event after the first phase advance — confirming that
 * PHASE_CHANGE (and any other) events are written to league_events and served
 * by GET /api/leagues/:id/ticker in time for the hub page to render them.
 *
 * If this test fails on an empty ticker it likely means either:
 *   a) The phase-advance handler stopped writing to league_events, or
 *   b) The ticker API is filtering out PHASE_CHANGE events.
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
  forceAdvanceWeek,
} from "../helpers/api";

test.describe("Ticker Banner Smoke Test", () => {
  test(
    "ticker banner appears on the hub after the first week advance",
    async ({ page }) => {
      const req = page.request;

      await createGuestSession(req);

      const league = await createLeague(req, {
        name: `Ticker Smoke ${Date.now()}`,
        maxTeams: 13,
        cpuDifficulty: "beginner",
        selectedConferences: ["SEC", "ACC", "Big 12"],
        seasonLength: "short",
      });

      const selectedTeams = await getTeamsForConferences(req, league.id, 13);
      await selectTeams(req, league.id, selectedTeams);
      await startDynasty(req, league.id);

      const teams = await getLeagueTeams(req, league.id);
      const humanTeam = teams[0];
      if (!humanTeam) throw new Error("No teams found after dynasty start");
      await setupCoach(req, league.id, humanTeam.id);

      // Verify we're starting from preseason
      const preState = await getLeague(req, league.id);
      expect(["preseason", "spring_training"], `Unexpected starting phase: ${preState.currentPhase}`)
        .toContain(preState.currentPhase);

      // Force-advance one week — this writes a PHASE_CHANGE event to league_events
      await forceAdvanceWeek(req, league.id);

      const postState = await getLeague(req, league.id);
      expect(postState.currentPhase, "Phase should have advanced").not.toBe(preState.currentPhase);

      // ── API layer check ────────────────────────────────────────────────────
      // Confirm the ticker API returns at least one event before touching the UI
      const tickerResp = await req.get(`/api/leagues/${league.id}/ticker`);
      expect(tickerResp.ok(), `Ticker API failed: ${await tickerResp.text()}`).toBe(true);

      const tickerData = await tickerResp.json();
      const events: Array<{ eventType: string; description: string }> = tickerData.events ?? [];

      expect(
        events.length,
        "Ticker API should return at least 1 event after advancing a week"
      ).toBeGreaterThan(0);

      const eventTypes = events.map((e) => e.eventType);
      expect(
        eventTypes,
        "Expected at least one PHASE_CHANGE event in the ticker after advancing"
      ).toContain("PHASE_CHANGE");

      // ── UI layer check ─────────────────────────────────────────────────────
      // Navigate to the hub page and verify the banner renders
      await page.goto(`/league/${league.id}`);
      await page.waitForLoadState("networkidle");

      const tickerBanner = page.getByTestId("league-ticker-banner");
      await expect(
        tickerBanner,
        "league-ticker-banner should be visible on the hub after a phase advance"
      ).toBeVisible({ timeout: 20_000 });

      // Sanity: at least one ticker tag text must be present in the banner
      const bannerText = await tickerBanner.textContent();
      const knownTags = ["ADVANCE", "FINAL", "COMMITMENT", "SIGNING", "TRANSFER",
                         "AWARD", "CUT", "WALK-ON", "STORYLINE", "DRAFT", "NEWS"];
      const hasTag = knownTags.some((tag) => bannerText?.includes(tag));
      expect(hasTag, `Ticker banner text "${bannerText}" should contain a known event tag`).toBe(true);
    }
  );
});
