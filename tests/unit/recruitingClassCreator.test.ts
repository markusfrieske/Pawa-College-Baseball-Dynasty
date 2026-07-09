/**
 * Backend tests for the recruiting class creator system.
 *
 * Covers:
 *   - validateWizardConfig: valid/invalid configs, all validation rules
 *   - validateAndNormalizeRecruitingClass: legacy array, legacy object,
 *     versioned envelope, malformed data, row normalization, recruitCount integrity
 *   - buildClassEnvelope / detectSource / extractRecruits / extractSummary /
 *     extractTheme: envelope format helpers and backward-compat extraction
 *   - POST /api/saved-recruiting-classes: creation with all three input formats,
 *     versioned envelope stored, malformed rejection
 *   - Share links (GET /POST /api/import-class/:token): preview summary,
 *     import creates new class with source="import"
 *   - POST /api/leagues/:id/recruiting/load-saved-class: recruits land in league,
 *     recruitCount matches DB row count
 *   - replaceLeagueRecruitingClass: delete+insert, correct count, vintage update,
 *     storyline init flag, audit log
 */

import { test, expect } from "@playwright/test";
import { validateWizardConfig } from "../../server/lib/validateWizardConfig";
import {
  validateAndNormalizeRecruitingClass,
  ClassValidationError,
} from "../../server/lib/validateRecruitingClass";
import {
  buildClassEnvelope,
  computeSummary,
  detectSource,
  extractRecruits,
  extractSummary,
  extractTheme,
} from "../../server/lib/buildClassEnvelope";
import {
  createGuestSession,
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeagueTeams,
  setupCoach,
} from "../helpers/api";
import { storage } from "../../server/storage";
import { replaceLeagueRecruitingClass } from "../../server/lib/replaceLeagueRecruitingClass";
import type { InsertRecruit } from "../../shared/schema";

// ── Shared fixtures ────────────────────────────────────────────────────────────

/**
 * Minimal valid recruit row accepted by validateAndNormalizeRecruitingClass.
 * VALID_POSITIONS = P | C | 1B | 2B | SS | 3B | LF | CF | RF  — "OF" is NOT valid.
 */
function makeRecruit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: "Test",
    lastName: "Player",
    position: "CF",
    homeState: "TX",
    hometown: "Austin",
    overall: 350,
    starRating: 3,
    abilities: [],
    ...overrides,
  };
}

/** Small valid recruit array with realistic variety (positions that pass validation). */
function makeRecruitArray(n = 5): Record<string, unknown>[] {
  const positions = ["CF", "P", "SS", "1B", "C", "LF", "RF", "3B", "2B"];
  return Array.from({ length: n }, (_, i) => makeRecruit({
    firstName: `First${i}`,
    lastName: `Last${i}`,
    position: positions[i % positions.length],
    starRating: Math.min(5, (i % 5) + 1),
    overall: 150 + i * 30,
    isBlueChip: i === 0,
    isGenerationalGem: i === 1,
    isGenerationalBust: i === 2,
    isGem: i === 3,
    isBust: i === 4,
  }));
}

/**
 * Run an array of raw recruits through the normalizer so they become valid
 * InsertRecruit shapes (with all required fields, correct defaults, resets applied).
 * Pass leagueId to stamp them for DB insertion.
 */
function makeValidInsertRecruits(leagueId: string, n: number): InsertRecruit[] {
  const { recruits } = validateAndNormalizeRecruitingClass(makeRecruitArray(n), {
    recalculateOvr: false,
  });
  return recruits.map(r => ({ ...r, leagueId })) as InsertRecruit[];
}

// ── validateWizardConfig ── pure unit tests (no DB / network) ─────────────────

test.describe("validateWizardConfig", () => {
  const validStarDist = {
    blueChip: 3, five: 5, four: 12, three: 60, two: 15, one: 5,
  };

  test("returns null for a fully valid config", () => {
    expect(validateWizardConfig({
      count: 75,
      theme: "balanced",
      starDistribution: validStarDist,
      specialCounts: { gems: 5, busts: 5, genGems: 1, genBusts: 1, blueChips: 3 },
      positionDistribution: { P: 30, CF: 30, SS: 10, "1B": 10, C: 10, "2B": 5, "3B": 5 },
      ovrMin: 150,
      ovrMax: 600,
      ovrAverage: 300,
      ovrDistribution: "bell",
      regionSkew: "none",
    })).toBeNull();
  });

  test("returns null when all optional fields are omitted", () => {
    expect(validateWizardConfig({})).toBeNull();
  });

  test("rejects non-object input: null, string, array", () => {
    expect(validateWizardConfig(null)?.errors.length).toBeGreaterThan(0);
    expect(validateWizardConfig("balanced")?.errors.length).toBeGreaterThan(0);
    expect(validateWizardConfig([1, 2, 3])?.errors.length).toBeGreaterThan(0);
  });

  test("rejects count below 20", () => {
    expect(validateWizardConfig({ count: 10 })?.errors.some(e => e.includes("count"))).toBe(true);
  });

  test("rejects count above 80", () => {
    expect(validateWizardConfig({ count: 81 })?.errors.some(e => e.includes("count"))).toBe(true);
  });

  test("rejects non-integer count", () => {
    expect(validateWizardConfig({ count: 50.5 })?.errors.some(e => e.includes("count"))).toBe(true);
  });

  test("accepts boundary counts 20 and 80", () => {
    expect(validateWizardConfig({ count: 20 })).toBeNull();
    expect(validateWizardConfig({ count: 80 })).toBeNull();
  });

  test("rejects an unknown theme", () => {
    expect(validateWizardConfig({ theme: "money_ball" })?.errors.some(e => e.includes("theme"))).toBe(true);
  });

  test("accepts all 12 valid themes", () => {
    const themes = [
      "high_velocity", "sluggers", "balanced", "top_heavy", "hidden_gems",
      "bust_heavy", "elite_pitching", "raw_talent", "position_players",
      "defense_first", "power_class", "speed_class",
    ];
    for (const theme of themes) {
      expect(validateWizardConfig({ theme }), `theme "${theme}" should be valid`).toBeNull();
    }
  });

  test("rejects starDistribution that doesn't sum to 100", () => {
    const res = validateWizardConfig({
      starDistribution: { blueChip: 5, five: 5, four: 10, three: 50, two: 10, one: 5 },
    });
    expect(res?.errors.some(e => e.includes("sum"))).toBe(true);
  });

  test("rejects starDistribution with a missing key", () => {
    // Omit 'one'
    const res = validateWizardConfig({
      starDistribution: { blueChip: 3, five: 5, four: 12, three: 60, two: 20 },
    });
    expect(res?.errors.some(e => e.includes("one") && e.includes("required"))).toBe(true);
  });

  test("rejects negative starDistribution value", () => {
    const res = validateWizardConfig({
      starDistribution: { blueChip: -1, five: 6, four: 12, three: 60, two: 18, one: 5 },
    });
    expect(res?.errors.some(e => e.includes("blueChip") && e.includes("non-negative"))).toBe(true);
  });

  test("rejects specialCounts exceeding class size", () => {
    const res = validateWizardConfig({ count: 20, specialCounts: { gems: 25 } });
    expect(res?.errors.some(e => e.includes("gems") && e.includes("cannot exceed"))).toBe(true);
  });

  test("rejects non-integer specialCounts", () => {
    const res = validateWizardConfig({ specialCounts: { gems: 2.5 } });
    expect(res?.errors.some(e => e.includes("gems") && e.includes("non-negative integer"))).toBe(true);
  });

  test("rejects ovrMin below 150", () => {
    expect(validateWizardConfig({ ovrMin: 100 })?.errors.some(e => e.includes("ovrMin"))).toBe(true);
  });

  test("rejects ovrMax above 650", () => {
    expect(validateWizardConfig({ ovrMax: 700 })?.errors.some(e => e.includes("ovrMax"))).toBe(true);
  });

  test("rejects ovrMin > ovrMax", () => {
    const res = validateWizardConfig({ ovrMin: 500, ovrMax: 300 });
    expect(res?.errors.some(e => e.includes("ovrMin") && e.includes("ovrMax"))).toBe(true);
  });

  test("rejects ovrAverage outside ovrMin–ovrMax band", () => {
    expect(validateWizardConfig({ ovrMin: 200, ovrMax: 400, ovrAverage: 450 })?.errors.some(e => e.includes("ovrAverage"))).toBe(true);
  });

  test("accepts valid ovrAverage at exact boundaries", () => {
    expect(validateWizardConfig({ ovrMin: 200, ovrMax: 400, ovrAverage: 200 })).toBeNull();
    expect(validateWizardConfig({ ovrMin: 200, ovrMax: 400, ovrAverage: 400 })).toBeNull();
  });

  test("rejects unknown ovrDistribution", () => {
    expect(validateWizardConfig({ ovrDistribution: "pyramid" })?.errors.some(e => e.includes("ovrDistribution"))).toBe(true);
  });

  test("accepts all four valid ovrDistribution values", () => {
    for (const d of ["bell", "top_heavy", "bottom_heavy", "flat"]) {
      expect(validateWizardConfig({ ovrDistribution: d }), `"${d}" should be valid`).toBeNull();
    }
  });

  test("rejects unknown regionSkew", () => {
    expect(validateWizardConfig({ regionSkew: "moon" })?.errors.some(e => e.includes("regionSkew"))).toBe(true);
  });

  test("accepts all seven valid regionSkew values", () => {
    for (const r of ["none", "southeast", "sunbelt", "texas", "california", "northeast", "midwest"]) {
      expect(validateWizardConfig({ regionSkew: r }), `"${r}" should be valid`).toBeNull();
    }
  });

  test("accumulates multiple independent errors in one pass", () => {
    const res = validateWizardConfig({ count: 5, theme: "nope", regionSkew: "planet" });
    expect(res?.errors.length).toBeGreaterThanOrEqual(3);
  });

  test("rejects positionDistribution with all-zero weights", () => {
    const res = validateWizardConfig({ positionDistribution: { P: 0, CF: 0 } });
    expect(res?.errors.some(e => e.includes("positionDistribution"))).toBe(true);
  });

  test("allows individual specialCount keys to be omitted (optional)", () => {
    // Only 'gems' provided — all other keys are optional and should not error
    expect(validateWizardConfig({ specialCounts: { gems: 5 } })).toBeNull();
  });
});

// ── validateAndNormalizeRecruitingClass ── pure unit tests ────────────────────

test.describe("validateAndNormalizeRecruitingClass", () => {
  test("accepts legacy raw array format", () => {
    const result = validateAndNormalizeRecruitingClass([makeRecruit()]);
    expect(result.recruits).toHaveLength(1);
    expect(result.recruitCount).toBe(1);
    // OVR-recalculation may emit a warning when no attrs are provided — that's fine;
    // the test is about accepting the format, not suppressing all warnings.
    expect(result.recruits[0].position).toBe("CF");
  });

  test("accepts legacy { theme, recruits } object format", () => {
    const result = validateAndNormalizeRecruitingClass({
      theme: "balanced",
      recruits: [makeRecruit(), makeRecruit({ firstName: "B" })],
    });
    expect(result.recruitCount).toBe(2);
    expect(result.recruits).toHaveLength(2);
  });

  test("accepts new versioned { version:1, source, summary, recruits } format", () => {
    const result = validateAndNormalizeRecruitingClass({
      version: 1,
      source: "wizard",
      summary: {
        recruitCount: 1, starDist: {}, posDist: {}, blueChips: 0,
        gems: 0, busts: 0, genGems: 0, genBusts: 0, avgOvr: 350, theme: "balanced",
      },
      recruits: [makeRecruit()],
    });
    expect(result.recruitCount).toBe(1);
    expect(result.recruits[0].position).toBe("CF");
  });

  test("throws ClassValidationError for null input", () => {
    expect(() => validateAndNormalizeRecruitingClass(null)).toThrow(ClassValidationError);
  });

  test("throws ClassValidationError for primitive input (number, string)", () => {
    expect(() => validateAndNormalizeRecruitingClass(42)).toThrow(ClassValidationError);
    expect(() => validateAndNormalizeRecruitingClass("csv,data")).toThrow(ClassValidationError);
  });

  test("throws ClassValidationError for empty array", () => {
    expect(() => validateAndNormalizeRecruitingClass([])).toThrow(ClassValidationError);
  });

  test("throws ClassValidationError when all rows fail validation", () => {
    // Missing firstName, missing lastName, invalid position — all three rejected
    expect(() => validateAndNormalizeRecruitingClass([
      { firstName: "", lastName: "X", position: "CF" },
      { firstName: "Y", lastName: "", position: "CF" },
      { firstName: "Z", lastName: "W", position: "DH" },
    ])).toThrow(ClassValidationError);
  });

  test("emits warnings for skipped rows but returns the valid ones", () => {
    const result = validateAndNormalizeRecruitingClass([
      makeRecruit({ firstName: "Good" }),
      { firstName: "", lastName: "Bad", position: "CF" }, // missing firstName
    ]);
    expect(result.recruits).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("normalizes position to uppercase (lf → LF)", () => {
    const result = validateAndNormalizeRecruitingClass([makeRecruit({ position: "lf" })]);
    expect(result.recruits[0].position).toBe("LF");
  });

  test("defaults homeState to TX when missing or empty", () => {
    const result = validateAndNormalizeRecruitingClass([makeRecruit({ homeState: "" })]);
    expect(result.recruits[0].homeState).toBe("TX");
  });

  test("defaults hometown to Unknown when missing or empty", () => {
    const result = validateAndNormalizeRecruitingClass([makeRecruit({ hometown: undefined })]);
    expect(result.recruits[0].hometown).toBe("Unknown");
  });

  test("RESET_ON_LOAD: always sets stage=open, gemBustRevealed=false, signingDayRevealed=false", () => {
    const result = validateAndNormalizeRecruitingClass([
      makeRecruit({ stage: "verbal", gemBustRevealed: true, signingDayRevealed: true }),
    ]);
    expect(result.recruits[0].stage).toBe("open");
    expect(result.recruits[0].gemBustRevealed).toBe(false);
    expect(result.recruits[0].signingDayRevealed).toBe(false);
  });

  test("strips id, leagueId, and signedTeamId from every row", () => {
    const result = validateAndNormalizeRecruitingClass([
      makeRecruit({ id: "existing-uuid", leagueId: "lg1", signedTeamId: "team1" }),
    ]);
    const r = result.recruits[0];
    expect(r.id).toBeUndefined();
    expect(r.leagueId).toBeUndefined();
    expect(r.signedTeamId).toBeUndefined();
  });

  test("coerces boolean fields from 0/1/string values", () => {
    const result = validateAndNormalizeRecruitingClass([
      makeRecruit({ isBlueChip: 1, isGem: "true", isBust: 0, isGenerationalGem: "false" }),
    ]);
    const r = result.recruits[0];
    expect(r.isBlueChip).toBe(true);
    expect(r.isGem).toBe(true);
    expect(r.isBust).toBe(false);
    expect(r.isGenerationalGem).toBe(false);
  });

  test("rejects rows with an invalid position and emits a warning naming the position", () => {
    const result = validateAndNormalizeRecruitingClass([
      makeRecruit({ position: "DH" }),        // DH not in VALID_POSITIONS → skipped
      makeRecruit({ firstName: "V", position: "P" }), // valid
    ]);
    expect(result.recruits).toHaveLength(1);
    expect(result.recruits[0].position).toBe("P");
    expect(result.warnings.some(w => w.includes("DH"))).toBe(true);
  });

  test("recruitCount always equals the length of the returned recruits array", () => {
    const result = validateAndNormalizeRecruitingClass(makeRecruitArray(8));
    expect(result.recruitCount).toBe(result.recruits.length);
  });

  test("requireCount option emits a mismatch warning when count differs", () => {
    const result = validateAndNormalizeRecruitingClass(makeRecruitArray(5), { requireCount: 10 });
    expect(result.warnings.some(w => w.includes("mismatch"))).toBe(true);
  });

  test("recalculateOvr=false keeps stored overall value unchanged", () => {
    const result = validateAndNormalizeRecruitingClass(
      [makeRecruit({ overall: 620 })],
      { recalculateOvr: false }
    );
    expect(result.recruits[0].overall).toBe(620);
  });

  test("handles a large class (80 recruits) without errors", () => {
    const result = validateAndNormalizeRecruitingClass(makeRecruitArray(80));
    expect(result.recruitCount).toBe(80);
    expect(result.recruits).toHaveLength(80);
  });
});

// ── buildClassEnvelope and envelope helpers ── pure unit tests ────────────────

test.describe("buildClassEnvelope and envelope helpers", () => {
  const sampleRecruits = makeRecruitArray(5) as Record<string, unknown>[];

  // ── detectSource ───────────────────────────────────────────────────────────

  test("detectSource: raw array → source=manual, theme=null", () => {
    const { source, theme } = detectSource([]);
    expect(source).toBe("manual");
    expect(theme).toBeNull();
  });

  test("detectSource: { theme, recruits } → source=wizard, theme extracted", () => {
    const { source, theme } = detectSource({ theme: "sluggers", recruits: [] });
    expect(source).toBe("wizard");
    expect(theme).toBe("sluggers");
  });

  test("detectSource: { recruits } without theme → source=manual, theme=null", () => {
    const { source, theme } = detectSource({ recruits: [] });
    expect(source).toBe("manual");
    expect(theme).toBeNull();
  });

  test("detectSource: versioned envelope preserves source and reads theme from summary", () => {
    const { source, theme } = detectSource({
      version: 1,
      source: "import",
      summary: { theme: "sluggers", recruitCount: 0, starDist: {}, posDist: {}, blueChips: 0, gems: 0, busts: 0, genGems: 0, genBusts: 0, avgOvr: 0 },
      recruits: [],
    });
    expect(source).toBe("import");
    expect(theme).toBe("sluggers");
  });

  test("detectSource: versioned envelope with config returns config", () => {
    const { config } = detectSource({
      version: 1,
      source: "wizard",
      config: { count: 75, regionSkew: "texas" },
      summary: { theme: "balanced", recruitCount: 0, starDist: {}, posDist: {}, blueChips: 0, gems: 0, busts: 0, genGems: 0, genBusts: 0, avgOvr: 0 },
      recruits: [],
    });
    expect(config).toEqual({ count: 75, regionSkew: "texas" });
  });

  // ── extractRecruits ────────────────────────────────────────────────────────

  test("extractRecruits: from raw array returns the array itself", () => {
    const arr = [{ firstName: "A" }];
    expect(extractRecruits(arr)).toEqual(arr);
  });

  test("extractRecruits: from legacy { theme, recruits } returns the recruits sub-array", () => {
    const obj = { theme: "balanced", recruits: [{ firstName: "A" }] };
    expect(extractRecruits(obj)).toEqual(obj.recruits);
  });

  test("extractRecruits: from versioned envelope returns recruits sub-array", () => {
    expect(extractRecruits({ version: 1, source: "wizard", summary: {}, recruits: [{ firstName: "A" }] }))
      .toEqual([{ firstName: "A" }]);
  });

  test("extractRecruits: returns [] for null, primitives, and empty objects", () => {
    expect(extractRecruits(null)).toEqual([]);
    expect(extractRecruits("garbage")).toEqual([]);
    expect(extractRecruits(42)).toEqual([]);
    expect(extractRecruits({})).toEqual([]);
  });

  // ── extractSummary ─────────────────────────────────────────────────────────

  test("extractSummary: returns null for raw array", () => {
    expect(extractSummary([])).toBeNull();
  });

  test("extractSummary: returns null for legacy { theme, recruits } (no version key)", () => {
    expect(extractSummary({ theme: "balanced", recruits: [] })).toBeNull();
  });

  test("extractSummary: returns summary for versioned envelope", () => {
    const summary = {
      recruitCount: 5, starDist: { 3: 5 }, posDist: { CF: 5 },
      blueChips: 1, gems: 1, busts: 1, genGems: 1, genBusts: 1, avgOvr: 350, theme: "balanced",
    };
    expect(extractSummary({ version: 1, source: "wizard", summary, recruits: [] })).toEqual(summary);
  });

  // ── extractTheme ───────────────────────────────────────────────────────────

  test("extractTheme: returns null for raw array", () => {
    expect(extractTheme([])).toBeNull();
  });

  test("extractTheme: returns theme from legacy { theme, recruits } object", () => {
    expect(extractTheme({ theme: "sluggers", recruits: [] })).toBe("sluggers");
  });

  test("extractTheme: returns theme from versioned envelope summary", () => {
    expect(extractTheme({
      version: 1, source: "wizard",
      summary: { theme: "balanced", recruitCount: 0, starDist: {}, posDist: {}, blueChips: 0, gems: 0, busts: 0, genGems: 0, genBusts: 0, avgOvr: 0 },
      recruits: [],
    })).toBe("balanced");
  });

  // ── buildClassEnvelope ─────────────────────────────────────────────────────

  test("buildClassEnvelope returns version=1 with correct source", () => {
    const env = buildClassEnvelope(sampleRecruits, "wizard");
    expect(env.version).toBe(1);
    expect(env.source).toBe("wizard");
  });

  test("buildClassEnvelope includes recruits array by reference", () => {
    const env = buildClassEnvelope(sampleRecruits, "manual");
    expect(env.recruits).toBe(sampleRecruits);
  });

  test("buildClassEnvelope stores theme in summary.theme when provided", () => {
    const env = buildClassEnvelope(sampleRecruits, "wizard", { theme: "sluggers" });
    expect(env.summary.theme).toBe("sluggers");
  });

  test("buildClassEnvelope summary.theme is null when no theme provided", () => {
    const env = buildClassEnvelope(sampleRecruits, "manual");
    expect(env.summary.theme).toBeNull();
  });

  test("buildClassEnvelope includes config when provided", () => {
    const cfg = { count: 75, regionSkew: "texas" };
    const env = buildClassEnvelope(sampleRecruits, "wizard", { config: cfg });
    expect(env.config).toEqual(cfg);
  });

  test("buildClassEnvelope omits config key entirely when not provided", () => {
    const env = buildClassEnvelope(sampleRecruits, "manual");
    expect(env.config).toBeUndefined();
  });

  test("computeSummary: recruitCount equals the number of recruits passed", () => {
    const env = buildClassEnvelope(sampleRecruits, "wizard");
    expect(env.summary.recruitCount).toBe(sampleRecruits.length);
  });

  test("computeSummary: starDist counts stars correctly", () => {
    const r: Record<string, unknown>[] = [
      { starRating: 1, position: "P", overall: 180 },
      { starRating: 1, position: "CF", overall: 190 },
      { starRating: 3, position: "SS", overall: 350 },
    ];
    const env = buildClassEnvelope(r, "manual");
    expect(env.summary.starDist[1]).toBe(2);
    expect(env.summary.starDist[3]).toBe(1);
    expect(env.summary.starDist[5]).toBeUndefined();
  });

  test("computeSummary: blueChips/genGems/genBusts/gems/busts counted correctly", () => {
    const r: Record<string, unknown>[] = [
      { starRating: 5, position: "P", overall: 550, isBlueChip: true },
      { starRating: 5, position: "CF", overall: 620, isGenerationalGem: true },
      { starRating: 1, position: "SS", overall: 160, isGenerationalBust: true },
      { starRating: 4, position: "1B", overall: 430, isGem: true },
      { starRating: 3, position: "C", overall: 250, isBust: true },
    ];
    const env = buildClassEnvelope(r, "wizard");
    expect(env.summary.blueChips).toBe(1);
    expect(env.summary.genGems).toBe(1);
    expect(env.summary.genBusts).toBe(1);
    expect(env.summary.gems).toBe(1);
    expect(env.summary.busts).toBe(1);
  });

  test("computeSummary: avgOvr is the rounded mean", () => {
    const r: Record<string, unknown>[] = [
      { starRating: 3, position: "P", overall: 300 },
      { starRating: 3, position: "CF", overall: 400 },
    ];
    const env = buildClassEnvelope(r, "manual");
    expect(env.summary.avgOvr).toBe(350);
  });

  test("computeSummary: posDist tallied by position", () => {
    const r: Record<string, unknown>[] = [
      { starRating: 3, position: "CF", overall: 300 },
      { starRating: 3, position: "CF", overall: 310 },
      { starRating: 3, position: "P", overall: 350 },
    ];
    const env = buildClassEnvelope(r, "manual");
    expect(env.summary.posDist["CF"]).toBe(2);
    expect(env.summary.posDist["P"]).toBe(1);
  });

  test("computeSummary: empty recruits → avgOvr=0 and all counts=0", () => {
    const s = computeSummary([]);
    expect(s.avgOvr).toBe(0);
    expect(s.blueChips).toBe(0);
    expect(s.genGems).toBe(0);
    expect(s.recruitCount).toBe(0);
  });
});

// ── Saved class API ── integration tests (require running server + DB) ─────────

test.describe("Saved recruiting class API", () => {
  test("POST: creates from legacy raw array, stores versioned envelope, recruitCount matches", async ({ request }) => {
    await createGuestSession(request);

    const resp = await request.post("/api/saved-recruiting-classes", {
      data: { name: `Test Class ${Date.now()}`, classData: makeRecruitArray(6) },
    });
    expect(resp.ok(), `create failed: ${await resp.text()}`).toBe(true);

    const body = await resp.json();
    expect(body.recruitCount).toBe(6);
    expect(body.id).toBeTruthy();

    const getResp = await request.get(`/api/saved-recruiting-classes/${body.id}`);
    const stored = await getResp.json();
    expect(stored.classData.version).toBe(1);
    expect(stored.classData.source).toBe("manual");
    expect(stored.classData.recruits).toHaveLength(6);
    expect(stored.classData.summary.recruitCount).toBe(6);
  });

  test("POST: creates from wizard { theme, recruits }, theme stored in summary", async ({ request }) => {
    await createGuestSession(request);

    const resp = await request.post("/api/saved-recruiting-classes", {
      data: {
        name: `Wizard Class ${Date.now()}`,
        classData: { theme: "sluggers", recruits: makeRecruitArray(4) },
      },
    });
    expect(resp.ok(), `${resp.status()}: ${await resp.text()}`).toBe(true);

    const { id } = await resp.json();
    const stored = (await (await request.get(`/api/saved-recruiting-classes/${id}`)).json());
    expect(stored.classData.version).toBe(1);
    expect(stored.classData.source).toBe("wizard");
    expect(stored.classData.summary.theme).toBe("sluggers");
  });

  test("POST: creates from versioned envelope, source preserved as-is", async ({ request }) => {
    await createGuestSession(request);

    const envelope = buildClassEnvelope(
      makeRecruitArray(3) as Record<string, unknown>[],
      "import",
      { theme: "balanced" }
    );
    const resp = await request.post("/api/saved-recruiting-classes", {
      data: { name: `Versioned Class ${Date.now()}`, classData: envelope },
    });
    expect(resp.ok(), `${resp.status()}: ${await resp.text()}`).toBe(true);

    const { id } = await resp.json();
    const stored = (await (await request.get(`/api/saved-recruiting-classes/${id}`)).json());
    expect(stored.classData.version).toBe(1);
    expect(stored.classData.source).toBe("import");
    expect(stored.classData.summary.theme).toBe("balanced");
  });

  test("POST: recruitCount field on the DB row always matches actual recruits array length", async ({ request }) => {
    await createGuestSession(request);

    const resp = await request.post("/api/saved-recruiting-classes", {
      data: { name: `Count Check ${Date.now()}`, classData: makeRecruitArray(10) },
    });
    expect(resp.ok()).toBe(true);

    const body = await resp.json();
    expect(body.recruitCount).toBe(10);

    const stored = (await (await request.get(`/api/saved-recruiting-classes/${body.id}`)).json());
    expect(stored.classData.recruits).toHaveLength(10);
    expect(stored.classData.summary.recruitCount).toBe(10);
    expect(stored.recruitCount).toBe(10);
  });

  test("POST: rejects empty recruits array with 400", async ({ request }) => {
    await createGuestSession(request);
    const resp = await request.post("/api/saved-recruiting-classes", {
      data: { name: "Empty", classData: [] },
    });
    expect(resp.status()).toBe(400);
  });

  test("POST: rejects missing classData with 400", async ({ request }) => {
    await createGuestSession(request);
    const resp = await request.post("/api/saved-recruiting-classes", {
      data: { name: "No Data" },
    });
    expect(resp.status()).toBe(400);
  });

  test("POST: rejects classData where every row has an invalid position (all skipped)", async ({ request }) => {
    await createGuestSession(request);
    // DH and OF are not in VALID_POSITIONS — all rows get skipped → ClassValidationError
    const resp = await request.post("/api/saved-recruiting-classes", {
      data: {
        name: "Bad positions",
        classData: [
          { firstName: "A", lastName: "B", position: "DH" },
          { firstName: "C", lastName: "D", position: "OF" },
        ],
      },
    });
    expect(resp.status()).toBe(400);
  });

  test("PATCH: re-wraps updated classData in a new versioned envelope", async ({ request }) => {
    await createGuestSession(request);

    const { id } = await (await request.post("/api/saved-recruiting-classes", {
      data: { name: `Patch Test ${Date.now()}`, classData: makeRecruitArray(3) },
    })).json();

    const patchResp = await request.patch(`/api/saved-recruiting-classes/${id}`, {
      data: {
        name: "Updated name",
        classData: { theme: "power_class", recruits: makeRecruitArray(5) },
      },
    });
    expect(patchResp.ok(), `${patchResp.status()}: ${await patchResp.text()}`).toBe(true);

    const stored = (await (await request.get(`/api/saved-recruiting-classes/${id}`)).json());
    expect(stored.name).toBe("Updated name");
    expect(stored.classData.version).toBe(1);
    expect(stored.classData.summary.theme).toBe("power_class");
    expect(stored.classData.recruits).toHaveLength(5);
    expect(stored.recruitCount).toBe(5);
  });

  test("GET list: returns all classes belonging to the authenticated user", async ({ request }) => {
    await createGuestSession(request);
    const tag = Date.now();

    await request.post("/api/saved-recruiting-classes", {
      data: { name: `List Test A ${tag}`, classData: makeRecruitArray(2) },
    });
    await request.post("/api/saved-recruiting-classes", {
      data: { name: `List Test B ${tag}`, classData: makeRecruitArray(2) },
    });

    const classes = await (await request.get("/api/saved-recruiting-classes")).json();
    expect(Array.isArray(classes)).toBe(true);
    const names = classes.map((c: { name: string }) => c.name);
    expect(names.some((n: string) => n === `List Test A ${tag}`)).toBe(true);
    expect(names.some((n: string) => n === `List Test B ${tag}`)).toBe(true);
  });
});

// ── Share link + import ── integration tests ──────────────────────────────────

test.describe("Share link and class import", () => {
  /** Create a class + share link as a freshly minted guest user. Returns the token. */
  async function createAndShare(
    request: import("@playwright/test").APIRequestContext,
    recruits: Record<string, unknown>[],
    theme = "balanced"
  ) {
    await createGuestSession(request); // new guest A

    const classResp = await request.post("/api/saved-recruiting-classes", {
      data: { name: `Share Class ${Date.now()}`, classData: { theme, recruits } },
    });
    expect(classResp.ok(), `create failed: ${await classResp.text()}`).toBe(true);
    const { id } = await classResp.json();

    const shareResp = await request.post(`/api/saved-recruiting-classes/${id}/shares`, {
      data: { label: "unit-test share" },
    });
    expect(shareResp.ok(), `share failed: ${await shareResp.text()}`).toBe(true);
    const share = await shareResp.json();
    return { token: share.token as string, classId: id as string };
  }

  test("GET /api/import-class/:token: returns summary with correct stats", async ({ request }) => {
    const recruits = [
      { ...makeRecruit(), starRating: 5, overall: 520, isBlueChip: true, isGenerationalGem: true },
      { ...makeRecruit(), starRating: 3, overall: 350, isGem: true },
      { ...makeRecruit(), starRating: 1, overall: 180, isGenerationalBust: true },
    ];
    const { token } = await createAndShare(request, recruits);

    const preview = await (await request.get(`/api/import-class/${token}`)).json();
    expect(preview.recruits).toHaveLength(3);
    expect(preview.theme).toBe("balanced");
    expect(preview.summary).toBeTruthy();
    expect(preview.summary.recruitCount).toBe(3);
    expect(preview.summary.blueChips).toBeGreaterThanOrEqual(1);
    expect(preview.summary.genGems).toBeGreaterThanOrEqual(1);
    expect(preview.summary.genBusts).toBeGreaterThanOrEqual(1);
    expect(preview.summary.avgOvr).toBeGreaterThan(0);
    expect(preview.summary.theme).toBe("balanced");
  });

  test("GET /api/import-class/:token: returns 404 for an unknown token", async ({ request }) => {
    const resp = await request.get("/api/import-class/NOTAREALTOKEN");
    expect(resp.status()).toBe(404);
  });

  test("POST /api/import-class/:token: imports class as new record with source='import'", async ({ request }) => {
    const { token } = await createAndShare(request, makeRecruitArray(4));

    // Switch to a different guest user — the same user cannot import their own class
    await request.post("/api/auth/guest");

    const importResp = await request.post(`/api/import-class/${token}`, { data: {} });
    expect(importResp.ok(), `import failed: ${await importResp.text()}`).toBe(true);

    const { class: imported } = await importResp.json();
    expect(imported.recruitCount).toBe(4);

    // Verify the stored class has versioned envelope with source="import"
    const stored = (await (await request.get(`/api/saved-recruiting-classes/${imported.id}`)).json());
    expect(stored.classData.version).toBe(1);
    expect(stored.classData.source).toBe("import");
    expect(stored.classData.summary.theme).toBe("balanced");
  });

  test("POST /api/import-class/:token: increments importCount after a successful import", async ({ request }) => {
    const { token } = await createAndShare(request, makeRecruitArray(3));

    const before = (await (await request.get(`/api/import-class/${token}`)).json()).importCount ?? 0;

    // Switch to a different guest
    await request.post("/api/auth/guest");
    await request.post(`/api/import-class/${token}`, { data: {} });

    const after = (await (await request.get(`/api/import-class/${token}`)).json()).importCount ?? 0;
    expect(after).toBe(before + 1);
  });

  test("POST /api/import-class/:token: class owner cannot import their own class (400)", async ({ request }) => {
    const { token } = await createAndShare(request, makeRecruitArray(3));
    // Still the same session (class owner)
    const resp = await request.post(`/api/import-class/${token}`, { data: {} });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toMatch(/already in your library/i);
  });
});

// ── Load saved class into a league ── integration tests ───────────────────────

test.describe("Load saved class into league", () => {
  async function setupLeague(request: import("@playwright/test").APIRequestContext) {
    await createGuestSession(request);
    const league = await createLeague(request, {
      name: `RC Load Test ${Date.now()}-${Math.random()}`,
      maxTeams: 13,
      selectedConferences: ["SEC", "ACC", "Big 12"],
    });
    const teams = await getTeamsForConferences(request, league.id, 13);
    await selectTeams(request, league.id, teams);
    await startDynasty(request, league.id);
    const leagueTeams = await getLeagueTeams(request, league.id);
    await setupCoach(request, league.id, leagueTeams[0].id);
    return { league, teams: leagueTeams };
  }

  test("POST load-saved-class: recruits appear in league after load", async ({ request }) => {
    const { league } = await setupLeague(request);

    const { id: savedClassId } = await (await request.post("/api/saved-recruiting-classes", {
      data: { name: `League Load ${Date.now()}`, classData: makeRecruitArray(20) },
    })).json();

    const loadResp = await request.post(
      `/api/leagues/${league.id}/recruiting/load-saved-class`,
      { data: { savedClassId }, timeout: 60_000 }
    );
    expect(loadResp.ok(), `load failed ${loadResp.status()}: ${await loadResp.text()}`).toBe(true);
    expect((await loadResp.json()).count).toBe(20);

    const { recruits } = await (await request.get(`/api/leagues/${league.id}/recruiting`)).json();
    expect(recruits.length).toBe(20);
  });

  test("POST load-saved-class: response count matches actual DB recruit rows", async ({ request }) => {
    const { league } = await setupLeague(request);

    const n = 15;
    const { id: savedClassId } = await (await request.post("/api/saved-recruiting-classes", {
      data: { name: `Count Match ${Date.now()}`, classData: makeRecruitArray(n) },
    })).json();

    const { count } = await (await request.post(
      `/api/leagues/${league.id}/recruiting/load-saved-class`,
      { data: { savedClassId }, timeout: 60_000 }
    )).json();
    expect(count).toBe(n);

    const dbRecruits = await storage.getRecruitsByLeague(league.id);
    expect(dbRecruits.length).toBe(n);
  });

  test("POST load-saved-class: replaces any existing recruits (old class is gone)", async ({ request }) => {
    const { league } = await setupLeague(request);

    // Load first class
    const { id: firstId } = await (await request.post("/api/saved-recruiting-classes", {
      data: { name: `First ${Date.now()}`, classData: makeRecruitArray(10) },
    })).json();
    await request.post(
      `/api/leagues/${league.id}/recruiting/load-saved-class`,
      { data: { savedClassId: firstId }, timeout: 60_000 }
    );

    // Load second class — should replace
    const { id: secondId } = await (await request.post("/api/saved-recruiting-classes", {
      data: { name: `Second ${Date.now()}`, classData: makeRecruitArray(7) },
    })).json();
    const resp2 = await request.post(
      `/api/leagues/${league.id}/recruiting/load-saved-class`,
      { data: { savedClassId: secondId }, timeout: 60_000 }
    );
    expect(resp2.ok()).toBe(true);

    const dbRecruits = await storage.getRecruitsByLeague(league.id);
    expect(dbRecruits.length).toBe(7);
  });
});

// ── replaceLeagueRecruitingClass ── integration tests ─────────────────────────

test.describe("replaceLeagueRecruitingClass helper", () => {
  async function setupLeagueForReplace(request: import("@playwright/test").APIRequestContext) {
    await createGuestSession(request);
    const league = await createLeague(request, {
      name: `Replace Test ${Date.now()}-${Math.random()}`,
      maxTeams: 13,
      selectedConferences: ["SEC", "ACC", "Big 12"],
    });
    const teams = await getTeamsForConferences(request, league.id, 13);
    await selectTeams(request, league.id, teams);
    await startDynasty(request, league.id);
    const leagueTeams = await getLeagueTeams(request, league.id);
    await setupCoach(request, league.id, leagueTeams[0].id);
    return { leagueId: league.id };
  }

  test("deletes all existing recruits and inserts the new class", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    const before = await storage.getRecruitsByLeague(leagueId);
    expect(before.length).toBeGreaterThan(0); // dynasty created a class

    const result = await replaceLeagueRecruitingClass({
      leagueId,
      season: 1,
      recruits: makeValidInsertRecruits(leagueId, 12),
    });

    expect(result.count).toBe(12);
    expect((await storage.getRecruitsByLeague(leagueId)).length).toBe(12);
  });

  test("returned count matches the length of the recruits array passed in", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    const n = 18;
    const result = await replaceLeagueRecruitingClass({
      leagueId,
      season: 1,
      recruits: makeValidInsertRecruits(leagueId, n),
    });
    expect(result.count).toBe(n);
  });

  test("updates currentClassVintage on the league when vintage is provided", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    await replaceLeagueRecruitingClass({
      leagueId,
      season: 1,
      recruits: makeValidInsertRecruits(leagueId, 5),
      vintage: "2027",
    });

    expect((await storage.getLeague(leagueId))?.currentClassVintage).toBe("2027");
  });

  test("does not touch currentClassVintage when vintage param is omitted", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    await storage.updateLeague(leagueId, { currentClassVintage: "ORIGINAL" });

    await replaceLeagueRecruitingClass({
      leagueId,
      season: 1,
      recruits: makeValidInsertRecruits(leagueId, 5),
      // vintage intentionally omitted
    });

    expect((await storage.getLeague(leagueId))?.currentClassVintage).toBe("ORIGINAL");
  });

  test("second call in succession replaces the first — only the latest recruits remain", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    await replaceLeagueRecruitingClass({
      leagueId, season: 1, recruits: makeValidInsertRecruits(leagueId, 10),
    });
    const second = await replaceLeagueRecruitingClass({
      leagueId, season: 1, recruits: makeValidInsertRecruits(leagueId, 7),
    });

    expect(second.count).toBe(7);
    expect((await storage.getRecruitsByLeague(leagueId)).length).toBe(7);
  });

  test("initStorylines=false (default) does not crash and recruits land correctly", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    await expect(
      replaceLeagueRecruitingClass({
        leagueId, season: 1,
        recruits: makeValidInsertRecruits(leagueId, 5),
        initStorylines: false,
      })
    ).resolves.toMatchObject({ count: 5 });
  });

  test("initStorylines=true (sync) completes without error and recruits remain in DB", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    await expect(
      replaceLeagueRecruitingClass({
        leagueId, season: 1,
        recruits: makeValidInsertRecruits(leagueId, 5),
        initStorylines: true,
        asyncStorylines: false,
      })
    ).resolves.toMatchObject({ count: 5 });

    expect((await storage.getRecruitsByLeague(leagueId)).length).toBe(5);
  });

  test("audit option writes without throwing; league recruit count still correct", async ({ request }) => {
    const { leagueId } = await setupLeagueForReplace(request);

    const league = await storage.getLeague(leagueId);
    const userId = league?.commissionerId ?? "test-user";

    await expect(
      replaceLeagueRecruitingClass({
        leagueId, season: 1,
        recruits: makeValidInsertRecruits(leagueId, 8),
        audit: { userId, action: "test_replace", details: "unit test" },
      })
    ).resolves.toMatchObject({ count: 8 });

    expect((await storage.getRecruitsByLeague(leagueId)).length).toBe(8);
  });
});
