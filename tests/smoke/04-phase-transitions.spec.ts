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
  advanceWeek,
  finalizeDepartures,
  markWalkonsReady,
} from "../helpers/api";

const REQUIRED_PHASES_IN_ORDER = [
  "preseason",
  "regular_season",
  "conference_championship",
  "super_regionals",
  "cws",
  "offseason_departures",
  "offseason_recruiting_1",
  "offseason_signing_day",
  "offseason_walkons",
];

test.describe("Phase Transition Smoke Test", () => {
  test(
    "advances through all required phases in order using step-by-step /advance",
    async ({ request }) => {
      test.slow();
      await createGuestSession(request);

      const league = await createLeague(request, {
        name: `Phase Transition Test ${Date.now()}`,
        maxTeams: 13,
        cpuDifficulty: "beginner",
        selectedConferences: ["SEC", "ACC", "Big 12"],
        seasonLength: "short",
      });

      const selectedTeams = await getTeamsForConferences(request, league.id, 13);
      await selectTeams(request, league.id, selectedTeams);
      await startDynasty(request, league.id);

      const teams = await getLeagueTeams(request, league.id);
      if (!teams[0]) throw new Error("No teams found after dynasty start");
      await setupCoach(request, league.id, teams[0].id);

      const phasesVisited: string[] = [];
      let state = await getLeague(request, league.id);
      phasesVisited.push(state.currentPhase);

      const MAX_STEPS = 50;
      let steps = 0;

      while (state.currentSeason < 2 && steps < MAX_STEPS) {
        if (state.currentPhase === "offseason_departures") {
          await finalizeDepartures(request, league.id);
          await advanceWeek(request, league.id);
        } else if (state.currentPhase === "offseason_walkons") {
          await markWalkonsReady(request, league.id);
          await advanceWeek(request, league.id);
        } else {
          await advanceWeek(request, league.id);
        }

        state = await getLeague(request, league.id);
        phasesVisited.push(state.currentPhase);
        steps++;
      }

      expect(
        steps,
        `Season should complete within ${MAX_STEPS} steps; got stuck at phase "${state.currentPhase}"`
      ).toBeLessThan(MAX_STEPS);

      expect(state.currentSeason, "Should have advanced to season 2").toBe(2);

      for (const requiredPhase of REQUIRED_PHASES_IN_ORDER) {
        expect(
          phasesVisited,
          `Required phase "${requiredPhase}" was never visited. Phases seen: ${[...new Set(phasesVisited)].join(" → ")}`
        ).toContain(requiredPhase);
      }

      const firstIndexOf = (phase: string) => phasesVisited.indexOf(phase);

      const preseasonIdx = firstIndexOf("preseason");
      const regularIdx = firstIndexOf("regular_season");
      const confIdx = firstIndexOf("conference_championship");
      const superRegIdx = firstIndexOf("super_regionals");
      const cwsIdx = firstIndexOf("cws");
      const offseasonIdx = firstIndexOf("offseason_departures");
      const recruiting1Idx = firstIndexOf("offseason_recruiting_1");
      const signingIdx = firstIndexOf("offseason_signing_day");
      const walkonsIdx = firstIndexOf("offseason_walkons");

      expect(preseasonIdx, "preseason must precede regular_season").toBeLessThan(regularIdx);
      expect(regularIdx, "regular_season must precede conference_championship").toBeLessThan(confIdx);
      expect(confIdx, "conference_championship must precede super_regionals").toBeLessThan(superRegIdx);
      expect(superRegIdx, "super_regionals must precede cws").toBeLessThan(cwsIdx);
      expect(cwsIdx, "cws must precede offseason_departures").toBeLessThan(offseasonIdx);

      // spring_training is only emitted by non-advance-route paths (legacy/multiplayer ready flow)
      // and is not part of the short-season step-by-step advance sequence.
      // Assert ordering if visited; skip if absent (season-config dependent).
      const springTrainingIdx = firstIndexOf("spring_training");
      if (springTrainingIdx !== -1) {
        expect(preseasonIdx, "preseason must precede spring_training").toBeLessThan(springTrainingIdx);
        expect(springTrainingIdx, "spring_training must precede regular_season").toBeLessThan(regularIdx);
      }
      expect(offseasonIdx, "offseason_departures must precede offseason_recruiting_1").toBeLessThan(recruiting1Idx);
      expect(recruiting1Idx, "offseason_recruiting_1 must precede offseason_signing_day").toBeLessThan(signingIdx);
      expect(signingIdx, "offseason_signing_day must precede offseason_walkons").toBeLessThan(walkonsIdx);
    }
  );
});
