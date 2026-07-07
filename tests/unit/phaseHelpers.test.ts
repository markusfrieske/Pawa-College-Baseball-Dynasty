import { test, expect } from "@playwright/test";
import {
  phaseLabels,
  RECRUITING_PHASES,
  difficultyOptions,
  aggressionOptions,
  EXPIRY_OPTIONS,
  formatLastActivity,
} from "../../client/src/pages/commissioner/helpers/phaseHelpers";

test.describe("commissioner phaseHelpers", () => {
  test("phaseLabels covers all known phase keys with non-empty strings", () => {
    const expectedPhases = [
      "dynasty_setup",
      "preseason",
      "spring_training",
      "regular_season",
      "conference_championship",
      "super_regionals",
      "cws",
      "offseason",
      "offseason_departures",
      "offseason_recruiting_1",
      "offseason_recruiting_2",
      "offseason_recruiting_3",
      "offseason_recruiting_4",
      "offseason_signing_day",
      "offseason_walkons",
    ];
    for (const phase of expectedPhases) {
      expect(phaseLabels[phase], `phaseLabels should cover "${phase}"`).toBeTruthy();
      expect(typeof phaseLabels[phase]).toBe("string");
    }
  });

  test("phaseLabels returns descriptive strings (not raw keys)", () => {
    expect(phaseLabels["regular_season"]).toBe("Regular Season");
    expect(phaseLabels["offseason_signing_day"]).toBe("Decision Day");
    expect(phaseLabels["cws"]).toBe("College World Series");
    expect(phaseLabels["offseason_walkons"]).toBe("Walk-Ons");
  });

  test("RECRUITING_PHASES contains exactly the 4 offseason recruiting weeks", () => {
    expect(RECRUITING_PHASES).toHaveLength(4);
    expect(RECRUITING_PHASES).toContain("offseason_recruiting_1");
    expect(RECRUITING_PHASES).toContain("offseason_recruiting_2");
    expect(RECRUITING_PHASES).toContain("offseason_recruiting_3");
    expect(RECRUITING_PHASES).toContain("offseason_recruiting_4");
  });

  test("difficultyOptions has 4 entries with value/label/description", () => {
    expect(difficultyOptions).toHaveLength(4);
    const values = difficultyOptions.map((o) => o.value);
    expect(values).toContain("beginner");
    expect(values).toContain("high_school");
    expect(values).toContain("all_american");
    expect(values).toContain("elite");
    for (const opt of difficultyOptions) {
      expect(opt.label).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });

  test("aggressionOptions has 5 levels 1–5 with value/label/description", () => {
    expect(aggressionOptions).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(aggressionOptions[i].value).toBe(i + 1);
      expect(aggressionOptions[i].label).toBeTruthy();
      expect(aggressionOptions[i].description).toBeTruthy();
    }
  });

  test("EXPIRY_OPTIONS includes no-expiry and several duration options", () => {
    expect(EXPIRY_OPTIONS.length).toBeGreaterThanOrEqual(3);
    const noExpiry = EXPIRY_OPTIONS.find((o) => o.value === "");
    expect(noExpiry, "should have a 'no expiry' option with empty string value").toBeTruthy();
    const durations = EXPIRY_OPTIONS.filter((o) => o.value !== "");
    expect(durations.length).toBeGreaterThanOrEqual(2);
    for (const opt of durations) {
      expect(opt.label).toBeTruthy();
    }
  });

  test("formatLastActivity returns 'No activity' for null/undefined", () => {
    expect(formatLastActivity(null)).toBe("No activity");
  });

  test("formatLastActivity formats 'Just now' for very recent timestamps", () => {
    const justNow = new Date().toISOString();
    expect(formatLastActivity(justNow)).toBe("Just now");
  });

  test("formatLastActivity formats minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastActivity(fiveMinAgo)).toBe("5m ago");
  });

  test("formatLastActivity formats hours ago", () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatLastActivity(threeHrsAgo)).toBe("3h ago");
  });

  test("formatLastActivity formats days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(formatLastActivity(twoDaysAgo)).toBe("2d ago");
  });
});
