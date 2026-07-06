import { test, expect } from "@playwright/test";
import { 
  formatNilRange, 
  getInterestLabel, 
  getInterestBarColor, 
  quantizeInterestWidth, 
  qualifyTrend, 
  getInterestChangeLabel,
  recruitSGoldBadge,
  recruitSGoldDisplayValue,
  recruitPitcherSGoldBadge,
  recruitPitcherSGoldDisplayValue
} from "../../client/src/lib/recruitingUtils";

test.describe("recruitingUtils", () => {
  test("formatNilRange formats NIL cost correctly", () => {
    expect(formatNilRange(1000)).toBe("$750–$1K");
    expect(formatNilRange(1000000)).toBe("$750K–$1.3M");
    expect(formatNilRange(100)).toBe("$75–$125");
  });

  test("getInterestLabel returns correct labels and colors", () => {
    expect(getInterestLabel(95)).toEqual({ label: "On Fire", color: "text-red-400" });
    expect(getInterestLabel(75)).toEqual({ label: "Very Hot", color: "text-orange-400" });
    expect(getInterestLabel(55)).toEqual({ label: "Hot", color: "text-yellow-400" });
    expect(getInterestLabel(35)).toEqual({ label: "Warm", color: "text-green-400" });
    expect(getInterestLabel(20)).toEqual({ label: "Cool", color: "text-blue-400" });
    expect(getInterestLabel(5)).toEqual({ label: "Cold", color: "text-blue-300" });
  });

  test("getInterestBarColor returns correct colors", () => {
    expect(getInterestBarColor(95)).toBe("bg-red-400");
    expect(getInterestBarColor(75)).toBe("bg-orange-400");
    expect(getInterestBarColor(55)).toBe("bg-yellow-400");
    expect(getInterestBarColor(35)).toBe("bg-green-400");
    expect(getInterestBarColor(20)).toBe("bg-blue-400");
    expect(getInterestBarColor(5)).toBe("bg-blue-300");
  });

  test("quantizeInterestWidth quantizes correctly", () => {
    expect(quantizeInterestWidth(95)).toBe(100);
    expect(quantizeInterestWidth(85)).toBe(80);
    expect(quantizeInterestWidth(50)).toBe(60); // Math.round(50/20)*20 = Math.round(2.5)*20 = 3*20 = 60
    expect(quantizeInterestWidth(10)).toBe(20); // Math.round(10/20)*20 = Math.round(0.5)*20 = 1*20 = 20
  });

  test("qualifyTrend returns correct trend description", () => {
    expect(qualifyTrend(20)).toBe("rising sharply");
    expect(qualifyTrend(10)).toBe("rising");
    expect(qualifyTrend(5)).toBe("rising slightly");
    expect(qualifyTrend(-20)).toBe("falling sharply");
    expect(qualifyTrend(-10)).toBe("falling");
    expect(qualifyTrend(-2)).toBe("falling slightly");
  });

  test("getInterestChangeLabel returns correct change labels", () => {
    expect(getInterestChangeLabel(20)).toEqual({ label: "Big Boost", color: "text-green-400" });
    expect(getInterestChangeLabel(10)).toEqual({ label: "Good Progress", color: "text-green-400" });
    expect(getInterestChangeLabel(5)).toEqual({ label: "Some Interest", color: "text-yellow-400" });
    expect(getInterestChangeLabel(1)).toEqual({ label: "Slight Interest", color: "text-blue-400" });
  });

  test("recruitSGoldBadge returns badge when criteria met", () => {
    // S_GOLD_COMMON_KEY: "Gambler" is linked to the "clutch" common attribute
    expect(recruitSGoldBadge(90, "clutch", ["Gambler"])).toBe("Gambler");
    expect(recruitSGoldBadge(89, "clutch", ["Gambler"])).toBe("Gambler"); // abilities take precedence
    expect(recruitSGoldBadge(95, "clutch", [])).toBe("Gambler"); // 90+ threshold fallback
    expect(recruitSGoldBadge(85, "clutch", [])).toBeUndefined();
  });

  test("recruitSGoldDisplayValue returns 90 when gold badge present", () => {
    expect(recruitSGoldDisplayValue(85, "clutch", ["Gambler"])).toBe(90);
    expect(recruitSGoldDisplayValue(85, "clutch", [])).toBe(85);
  });

  test("recruitPitcherSGoldBadge returns badge for pitchers", () => {
    // S_GOLD_PITCHER_KEY: "Big Boy Speed" is linked to the "heater" pitcher attribute
    expect(recruitPitcherSGoldBadge("heater", 90, ["Big Boy Speed"])).toBe("Big Boy Speed");
    expect(recruitPitcherSGoldBadge("heater", 95, [])).toBe("Big Boy Speed");
    expect(recruitPitcherSGoldBadge("heater", 85, [])).toBeUndefined();
  });

  test("recruitPitcherSGoldDisplayValue returns 90 when gold badge present for pitchers", () => {
    expect(recruitPitcherSGoldDisplayValue(85, "heater", ["Big Boy Speed"])).toBe(90);
    expect(recruitPitcherSGoldDisplayValue(85, "heater", [])).toBe(85);
  });
});
