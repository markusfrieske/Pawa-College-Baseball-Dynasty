import { test, expect } from "@playwright/test";
import {
  formatNil,
  getDisplayName,
  fmtKLeague,
  STAR_COLORS,
  STAR_TEXT_COLORS,
  percentileToGrade,
  attrToGrade,
  starToGrade,
  gradeColor,
  percentileLabel,
  gradeColorLV,
  getClassGrade,
  getGradeColor,
  getGradeBg,
  formatRelativeTime,
  getEffectiveReady,
  getRecentForm,
} from "../../client/src/pages/league-view/helpers";

test.describe("league-view helpers", () => {
  test("formatNil formats NIL budget values correctly", () => {
    expect(formatNil(1_000_000)).toBe("$1.0M");
    expect(formatNil(2_500_000)).toBe("$2.5M");
    expect(formatNil(500_000)).toBe("$500K");
    expect(formatNil(999)).toBe("$1K");
  });

  test("fmtKLeague formats league budget values correctly", () => {
    expect(fmtKLeague(1_000_000)).toBe("$1.0M");
    expect(fmtKLeague(2_500_000)).toBe("$2.5M");
    expect(fmtKLeague(50_000)).toBe("$50K");
    expect(fmtKLeague(500)).toBe("$500");
  });

  test("getDisplayName returns correct name for various user shapes", () => {
    expect(getDisplayName(undefined)).toBe("");
    expect(getDisplayName(null)).toBe("");
    expect(getDisplayName({ email: "coach@example.com", username: "CoachBob" })).toBe("CoachBob");
    expect(getDisplayName({ email: "coach@example.com" })).toBe("coach");
    expect(getDisplayName({ email: "guest-abc123@example.com" })).toBe("Guest");
  });

  test("percentileToGrade buckets correctly", () => {
    expect(percentileToGrade(95)).toBe("A+");
    expect(percentileToGrade(85)).toBe("A");
    expect(percentileToGrade(75)).toBe("B+");
    expect(percentileToGrade(65)).toBe("B");
    expect(percentileToGrade(55)).toBe("C+");
    expect(percentileToGrade(45)).toBe("C");
    expect(percentileToGrade(35)).toBe("D+");
    expect(percentileToGrade(25)).toBe("D");
    expect(percentileToGrade(5)).toBe("F");
  });

  test("attrToGrade buckets correctly", () => {
    expect(attrToGrade(85)).toBe("A+");
    expect(attrToGrade(75)).toBe("A");
    expect(attrToGrade(66)).toBe("B+");
    expect(attrToGrade(59)).toBe("B");
    expect(attrToGrade(51)).toBe("C+");
    expect(attrToGrade(43)).toBe("C");
    expect(attrToGrade(36)).toBe("D+");
    expect(attrToGrade(29)).toBe("D");
    expect(attrToGrade(10)).toBe("F");
  });

  test("starToGrade buckets correctly", () => {
    expect(starToGrade(5)).toBe("A+");
    expect(starToGrade(4)).toBe("A");
    expect(starToGrade(3.5)).toBe("B+");
    expect(starToGrade(3)).toBe("B");
    expect(starToGrade(2.5)).toBe("C+");
    expect(starToGrade(2)).toBe("C");
    expect(starToGrade(1.5)).toBe("D+");
    expect(starToGrade(1)).toBe("F");
  });

  test("gradeColor maps letter grades to expected colors", () => {
    expect(gradeColor("A+")).toBe("text-green-400");
    expect(gradeColor("B")).toBe("text-blue-400");
    expect(gradeColor("C+")).toBe("text-yellow-400");
    expect(gradeColor("D")).toBe("text-orange-400");
    expect(gradeColor("F")).toBe("text-red-400");
  });

  test("gradeColorLV maps letter grades to league-view-specific colors", () => {
    expect(gradeColorLV("A")).toBe("text-gold");
    expect(gradeColorLV("B+")).toBe("text-green-400");
    expect(gradeColorLV("C")).toBe("text-yellow-400");
    expect(gradeColorLV("D")).toBe("text-orange-400");
    expect(gradeColorLV("F")).toBe("text-red-400");
  });

  test("percentileLabel formats top/bottom percentile labels", () => {
    expect(percentileLabel(90)).toBe("Top 10%");
    expect(percentileLabel(50)).toBe("Top 50%");
    expect(percentileLabel(10)).toBe("Bottom 10%");
    expect(percentileLabel(1)).toBe("Bottom 1%");
    expect(percentileLabel(100)).toBe("Top 1%");
  });

  test("getClassGrade buckets recruiting class rank into letter grades", () => {
    expect(getClassGrade(1, 100)).toBe("A+");
    expect(getClassGrade(15, 100)).toBe("A");
    expect(getClassGrade(25, 100)).toBe("A-");
    expect(getClassGrade(35, 100)).toBe("B+");
    expect(getClassGrade(50, 100)).toBe("B");
    expect(getClassGrade(65, 100)).toBe("B-");
    expect(getClassGrade(75, 100)).toBe("C+");
    expect(getClassGrade(85, 100)).toBe("C");
    expect(getClassGrade(95, 100)).toBe("D");
  });

  test("getGradeColor maps recruiting-class grades to colors", () => {
    expect(getGradeColor("A+")).toBe("text-green-400");
    expect(getGradeColor("A")).toBe("text-green-400");
    expect(getGradeColor("A-")).toBe("text-lime-400");
    expect(getGradeColor("B+")).toBe("text-lime-400");
    expect(getGradeColor("B")).toBe("text-yellow-400");
    expect(getGradeColor("B-")).toBe("text-orange-400");
    expect(getGradeColor("C+")).toBe("text-orange-400");
    expect(getGradeColor("C")).toBe("text-red-400");
    expect(getGradeColor("D")).toBe("text-red-400");
  });

  test("getGradeBg maps recruiting-class grades to background/border classes", () => {
    expect(getGradeBg("A+")).toBe("bg-green-400/10 border-green-400/30");
    expect(getGradeBg("B+")).toBe("bg-lime-400/10 border-lime-400/30");
    expect(getGradeBg("B")).toBe("bg-yellow-400/10 border-yellow-400/30");
    expect(getGradeBg("C+")).toBe("bg-orange-400/10 border-orange-400/30");
    expect(getGradeBg("D")).toBe("bg-red-400/10 border-red-400/30");
  });

  test("STAR_COLORS and STAR_TEXT_COLORS have entries for all 5 star levels", () => {
    for (let i = 1; i <= 5; i++) {
      expect(STAR_COLORS[i]).toBeTruthy();
      expect(STAR_TEXT_COLORS[i]).toBeTruthy();
    }
  });

  test("formatRelativeTime formats recent timestamps correctly", () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("just now");

    const fiveMinAgo = new Date(now.getTime() - 5 * 60000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");

    const threeHoursAgo = new Date(now.getTime() - 3 * 3600000);
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");

    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });

  test("getEffectiveReady checks the correct flag based on phase", () => {
    const entryAllTrue = { teamId: "t1", isReady: true, departuresFinalized: true, walkonReady: true } as any;
    const entryAllFalse = { teamId: "t1", isReady: false, departuresFinalized: false, walkonReady: false } as any;

    expect(getEffectiveReady(entryAllTrue, "offseason_departures")).toBe(true);
    expect(getEffectiveReady(entryAllFalse, "offseason_departures")).toBe(false);

    expect(getEffectiveReady(entryAllTrue, "offseason_walkons")).toBe(true);
    expect(getEffectiveReady(entryAllFalse, "offseason_walkons")).toBe(false);

    expect(getEffectiveReady(entryAllTrue, "preseason")).toBe(true);
    expect(getEffectiveReady(entryAllFalse, "preseason")).toBe(false);
  });

  test("getRecentForm derives W/L history for a team from completed games", () => {
    type Game = {
      id: string;
      week: number;
      isComplete: boolean;
      homeScore: number | null;
      awayScore: number | null;
      homeTeamId: string;
      awayTeamId: string;
    };

    const teamId = "team-a";
    const games: Game[] = [
      { id: "g1", week: 1, isComplete: true, homeScore: 5, awayScore: 2, homeTeamId: teamId, awayTeamId: "team-b" }, // W (home, 5-2)
      { id: "g2", week: 2, isComplete: true, homeScore: 1, awayScore: 3, homeTeamId: "team-b", awayTeamId: teamId }, // W (away, team-a scores 3 vs 1)
      { id: "g3", week: 3, isComplete: true, homeScore: 4, awayScore: 4, homeTeamId: teamId, awayTeamId: "team-b" }, // L (home, tied score is not a win)
      { id: "g4", week: 4, isComplete: false, homeScore: null, awayScore: null, homeTeamId: teamId, awayTeamId: "team-b" }, // incomplete, excluded
      { id: "g5", week: 5, isComplete: true, homeScore: 7, awayScore: 1, homeTeamId: teamId, awayTeamId: "team-b" }, // this is "beforeGame" so excluded
    ];

    const beforeGame = games[4];
    const form = getRecentForm(teamId, games, beforeGame, 5);

    expect(form).toEqual(["W", "W", "L"]);
  });

  test("getRecentForm respects the limit parameter", () => {
    type Game = {
      id: string;
      week: number;
      isComplete: boolean;
      homeScore: number | null;
      awayScore: number | null;
      homeTeamId: string;
      awayTeamId: string;
    };

    const teamId = "team-a";
    const games: Game[] = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i}`,
      week: i + 1,
      isComplete: true,
      homeScore: 5,
      awayScore: 2,
      homeTeamId: teamId,
      awayTeamId: "team-b",
    }));
    const beforeGame: Game = { id: "future", week: 11, isComplete: false, homeScore: null, awayScore: null, homeTeamId: teamId, awayTeamId: "team-b" };

    const form = getRecentForm(teamId, games, beforeGame, 3);
    expect(form).toEqual(["W", "W", "W"]);
    expect(form.length).toBe(3);
  });
});
