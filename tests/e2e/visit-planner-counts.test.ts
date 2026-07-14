/**
 * E2E test: Visit Planner card in the Command Center stays accurate
 *
 * Validates:
 *  1. The skeleton state ([data-testid="visit-planner-skeleton"]) is absent
 *     once the economy data has loaded (i.e., the real counts are visible).
 *  2. The visit-planner-count, visit-planner-campus-count, and
 *     visit-planner-hc-count elements show real numbers after load.
 *  3. After a campus visit action the campus count and total count both
 *     increment in the Visit Planner card WITHOUT requiring a page reload
 *     (optimistic cache patch in use-recruiting.ts).
 *  4. After an HC visit action the HC count and total count both increment.
 *
 * Auth pattern: guest session created via `request` in beforeAll, then
 * injected into each browser context via page.evaluate/document.cookie so
 * the Playwright page shares the same server-side session.
 */

import { test, expect, Page } from "@playwright/test";
import {
  createLeague,
  getTeamsForConferences,
  selectTeams,
  startDynasty,
  getLeague,
  getLeagueTeams,
  setupCoach,
  simToOffseason,
  forceAdvanceWeek,
  markWalkonsReady,
  advanceWeek,
} from "../helpers/api";

// ---------------------------------------------------------------------------
// Module-level state (populated in beforeAll)
// ---------------------------------------------------------------------------
let leagueId: string;
let recruitIds: string[];
let sessionCookie: string;

// Recruiting phases (the actual server-side phase names)
const RECRUITING_PHASES = new Set([
  "offseason_recruiting_1",
  "offseason_recruiting_2",
  "offseason_recruiting_3",
  "offseason_recruiting_4",
  "offseason_signing_day",
]);

// ---------------------------------------------------------------------------
// Additional API helpers not in the shared module
// ---------------------------------------------------------------------------

async function getRecruitIds(page: Page, lid: string): Promise<string[]> {
  const resp = await page.request.get(`/api/leagues/${lid}/recruiting`);
  const data = await resp.json();
  return (data.recruits ?? []).map((r: { id: string }) => r.id);
}

async function targetRecruit(page: Page, lid: string, rid: string): Promise<void> {
  await page.request.post(`/api/leagues/${lid}/recruiting/${rid}/target`, { data: {} });
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

async function openRecruitingPage(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );
  await page.goto(`/league/${leagueId}/recruiting`, { waitUntil: "load", timeout: 30_000 });
  // Wait for the economy stat cards to appear (signals economy data has loaded)
  await page
    .locator('[data-testid="stat-card-visits"]')
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function ensureCommandCenterExpanded(page: Page): Promise<void> {
  const cc = page.locator('[data-testid="recruiting-command-center"]');
  await cc.waitFor({ state: "visible", timeout: 10_000 });
  // If Visit Planner content is not visible, click toggle to expand the command center
  const vpContent = page.locator(
    '[data-testid="visit-planner-skeleton"], [data-testid="visit-planner-count"]'
  );
  const visible = await vpContent
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) {
    await page.locator('[data-testid="button-toggle-command-center"]').click();
    await vpContent.first().waitFor({ state: "visible", timeout: 5_000 });
  }
}

/**
 * Poll a locator's text content until predicate passes or timeout is reached.
 */
async function pollText(
  page: Page,
  selector: string,
  predicate: (text: string) => boolean,
  description: string,
  timeoutMs = 8_000
): Promise<string> {
  const locator = page.locator(selector);
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await locator.textContent().catch(() => "")) ?? "";
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`Selector "${selector}" value "${last}" never satisfied: ${description}`);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000);

  // Create a guest session and capture the session cookie for browser injection
  const guestResp = await request.post("/api/auth/guest");
  if (!guestResp.ok()) throw new Error(`Guest login failed: ${guestResp.status()}`);
  const setCookieHeader = guestResp.headers()["set-cookie"] ?? "";
  const match = setCookieHeader.match(/connect\.sid=([^;]+)/);
  if (!match) throw new Error("No connect.sid cookie from guest login");
  sessionCookie = `connect.sid=${match[1]}`;

  // Create a 9-team league (3+3+3 across 3 conferences) — small enough to be fast,
  // large enough to avoid the 0-games SR loop that blocks simToOffseason.
  const league = await createLeague(request, {
    name: `e2e-vp-counts-${Date.now()}`,
    maxTeams: 9,
    cpuDifficulty: "beginner",
    selectedConferences: ["SEC", "ACC", "Big 12"],
    seasonLength: "short",
    progressionEnabled: false,
  });
  leagueId = league.id;

  // Select teams using the canonical helper (handles per-conference distribution)
  const teamSelections = await getTeamsForConferences(request, leagueId, 9);
  await selectTeams(request, leagueId, teamSelections);

  // Pick the first team and set it as human via setupCoach
  // (all teams are CPU at this point; setup makes the selected team human)
  const allTeams = await getLeagueTeams(request, leagueId);
  const firstTeam = allTeams[0];
  if (!firstTeam) throw new Error("No teams found after selection");
  await setupCoach(request, leagueId, firstTeam.id);

  // Start the dynasty
  await startDynasty(request, leagueId);

  // Fast-forward through the season to offseason_departures.
  // simToOffseason stops at offseason_departures (before departure processing).
  await simToOffseason(request, leagueId);

  let state = await getLeague(request, leagueId);

  // Advance through offseason_departures using force-advance (which auto-marks
  // coaches ready).  Two force-advance calls are needed:
  //   Call 1: processes departures (creates pending records), stays at offseason_departures
  //   Call 2: finds pending records ready, finalizes them, advances to offseason_recruiting_1
  if (state.currentPhase === "offseason_departures") {
    let depSafety = 0;
    while (state.currentPhase === "offseason_departures" && depSafety < 5) {
      await forceAdvanceWeek(request, leagueId);
      state = await getLeague(request, leagueId);
      depSafety++;
    }
    if (state.currentPhase === "offseason_departures") {
      throw new Error("Stuck in offseason_departures after 5 force-advance attempts");
    }
  }

  // Handle offseason_walkons if we landed there (shouldn't happen from departures
  // but guard it just in case)
  if (state.currentPhase === "offseason_walkons") {
    await markWalkonsReady(request, leagueId);
    let safety = 0;
    while (state.currentPhase === "offseason_walkons" && safety < 15) {
      await advanceWeek(request, leagueId);
      state = await getLeague(request, leagueId);
      safety++;
    }
    if (state.currentPhase === "offseason_walkons") {
      throw new Error(`Walk-on phase stuck after ${safety} advance attempts`);
    }
  }

  const finalPhase = state.currentPhase;
  if (!RECRUITING_PHASES.has(finalPhase)) {
    throw new Error(
      `Failed to reach recruiting phase (stuck at: ${finalPhase}). ` +
      `Expected one of: ${[...RECRUITING_PHASES].join(", ")}`
    );
  }

  // Grab recruit IDs for use in tests
  const recruitingResp = await request.get(`/api/leagues/${leagueId}/recruiting`);
  const recruitingData = await recruitingResp.json();
  recruitIds = (recruitingData.recruits ?? []).map((r: { id: string }) => r.id);
  if (recruitIds.length === 0) throw new Error("No recruits found in recruiting phase");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("Visit Planner skeleton shows while economy loads then is replaced by real counts", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // --- Phase 1: navigate to the recruiting page WITHOUT waiting for economy ---
  // We inject the session cookie first via the root page (which loads instantly),
  // then navigate to recruiting and immediately check the loading skeleton.
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );
  // Navigate to recruiting but do NOT wait for economy (use domcontentloaded only)
  await page.goto(`/league/${leagueId}/recruiting`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Ensure the command center container is visible (may need expand toggle)
  const cc = page.locator('[data-testid="recruiting-command-center"]');
  await cc.waitFor({ state: "visible", timeout: 10_000 });

  // If the Visit Planner area is not yet visible, expand the command center
  const vpArea = page.locator(
    '[data-testid="visit-planner-skeleton"], [data-testid="visit-planner-count"]'
  );
  const vpVisible = await vpArea.first().waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true).catch(() => false);
  if (!vpVisible) {
    await page.locator('[data-testid="button-toggle-command-center"]').click();
    await vpArea.first().waitFor({ state: "visible", timeout: 5_000 });
  }

  // --- Phase 2: assert the skeleton is visible BEFORE economy resolves ---
  // At this point (domcontentloaded, economy query still in-flight), the skeleton
  // should be rendered in place of the real visit counts.
  const skeleton = page.locator('[data-testid="visit-planner-skeleton"]');
  await skeleton.waitFor({ state: "visible", timeout: 8_000 });
  expect(
    await skeleton.isVisible(),
    "Visit Planner skeleton should appear while economy data is loading"
  ).toBe(true);

  // --- Phase 3: wait for economy to finish loading ---
  await page.locator('[data-testid="stat-card-visits"]').waitFor({ state: "visible", timeout: 20_000 });

  // --- Phase 4: skeleton must be gone, real counts must appear ---
  await skeleton.waitFor({ state: "hidden", timeout: 10_000 });
  expect(
    await skeleton.isVisible().catch(() => false),
    "Visit Planner skeleton should be gone after economy loads"
  ).toBe(false);

  // Real total-count element must be visible and show N/M pattern
  const countEl = page.locator('[data-testid="visit-planner-count"]');
  await countEl.waitFor({ state: "visible", timeout: 5_000 });
  const countText = (await countEl.textContent()) ?? "";
  expect(countText).toMatch(/^\d+\/\d+$/);

  // Campus sub-count must also be visible
  const campusEl = page.locator('[data-testid="visit-planner-campus-count"]');
  await campusEl.waitFor({ state: "visible", timeout: 5_000 });
  const campusText = (await campusEl.textContent()) ?? "";
  expect(campusText).toMatch(/^\d+ campus$/);

  // HC sub-count must also be visible
  const hcEl = page.locator('[data-testid="visit-planner-hc-count"]');
  await hcEl.waitFor({ state: "visible", timeout: 5_000 });
  const hcText = (await hcEl.textContent()) ?? "";
  expect(hcText).toMatch(/^\d+ HC$/);
});

test("Campus visit increments campus count and total count in Visit Planner card", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Target the first recruit so the visit button is enabled
  const recruitId = recruitIds[0];
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );
  await targetRecruit(page, leagueId, recruitId);

  await openRecruitingPage(page);
  await ensureCommandCenterExpanded(page);

  // Read initial counts
  const countEl = page.locator('[data-testid="visit-planner-count"]');
  const campusEl = page.locator('[data-testid="visit-planner-campus-count"]');
  const hcEl = page.locator('[data-testid="visit-planner-hc-count"]');

  const initCountText = (await countEl.textContent()) ?? "0/0";
  const initCampusText = (await campusEl.textContent()) ?? "0 campus";
  const initHcText = (await hcEl.textContent()) ?? "0 HC";
  const initTotal = parseInt(initCountText.split("/")[0], 10) || 0;
  const initCampus = parseInt(initCampusText, 10) || 0;
  const initHc = parseInt(initHcText, 10) || 0;

  // Find an available (non-disabled) campus visit button
  let usedRecruitId = recruitId;
  let visitBtn = page.locator(`[data-testid="button-visit-${recruitId}"]`).first();
  await visitBtn.waitFor({ state: "visible", timeout: 10_000 });

  if (await visitBtn.isDisabled()) {
    let found = false;
    for (let i = 1; i < Math.min(recruitIds.length, 15); i++) {
      await targetRecruit(page, leagueId, recruitIds[i]);
      const btn = page.locator(`[data-testid="button-visit-${recruitIds[i]}"]`).first();
      const vis = await btn.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
      if (vis && !(await btn.isDisabled())) {
        usedRecruitId = recruitIds[i];
        visitBtn = btn;
        found = true;
        break;
      }
    }
    if (!found) {
      test.skip(true, "All campus visit buttons disabled — cap reached or visits used");
      return;
    }
  }

  await visitBtn.click();

  // Total count must increment without page reload
  const updatedCountText = await pollText(
    page,
    '[data-testid="visit-planner-count"]',
    (t) => (parseInt(t.split("/")[0], 10) || 0) > initTotal,
    `total visits > ${initTotal}`
  );
  const newTotal = parseInt(updatedCountText.split("/")[0], 10) || 0;
  expect(newTotal).toBeGreaterThan(initTotal);

  // Campus count must also increment
  const updatedCampusText = await pollText(
    page,
    '[data-testid="visit-planner-campus-count"]',
    (t) => (parseInt(t, 10) || 0) > initCampus,
    `campus visits > ${initCampus}`
  );
  const newCampus = parseInt(updatedCampusText, 10) || 0;
  expect(newCampus).toBeGreaterThan(initCampus);

  // HC count must NOT have changed (this was a campus visit)
  const currentHcText = (await hcEl.textContent()) ?? "0 HC";
  const currentHc = parseInt(currentHcText, 10) || 0;
  expect(currentHc).toBe(initHc);

  // Consistency: total = campus + HC
  expect(newTotal).toBe(newCampus + currentHc);
});

test("HC visit increments HC count and total count in Visit Planner card", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Use a different recruit than the campus visit test to avoid conflicts
  const recruitId = recruitIds[Math.min(4, recruitIds.length - 1)];
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );
  await targetRecruit(page, leagueId, recruitId);

  await openRecruitingPage(page);
  await ensureCommandCenterExpanded(page);

  const countEl = page.locator('[data-testid="visit-planner-count"]');
  const campusEl = page.locator('[data-testid="visit-planner-campus-count"]');
  const hcEl = page.locator('[data-testid="visit-planner-hc-count"]');

  const initCountText = (await countEl.textContent()) ?? "0/0";
  const initCampusText = (await campusEl.textContent()) ?? "0 campus";
  const initHcText = (await hcEl.textContent()) ?? "0 HC";
  const initTotal = parseInt(initCountText.split("/")[0], 10) || 0;
  const initCampus = parseInt(initCampusText, 10) || 0;
  const initHc = parseInt(initHcText, 10) || 0;

  // Find an available HC visit button
  let usedRecruitId = recruitId;
  let hcBtn = page.locator(`[data-testid="button-head-coach-visit-${recruitId}"]`).first();
  await hcBtn.waitFor({ state: "visible", timeout: 10_000 });

  if (await hcBtn.isDisabled()) {
    let found = false;
    for (let i = 0; i < Math.min(recruitIds.length, 20); i++) {
      if (recruitIds[i] === recruitId) continue;
      await targetRecruit(page, leagueId, recruitIds[i]);
      const btn = page.locator(`[data-testid="button-head-coach-visit-${recruitIds[i]}"]`).first();
      const vis = await btn.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
      if (vis && !(await btn.isDisabled())) {
        usedRecruitId = recruitIds[i];
        hcBtn = btn;
        found = true;
        break;
      }
    }
    if (!found) {
      test.skip(true, "All HC visit buttons disabled — cap reached or already used");
      return;
    }
  }

  await hcBtn.click();

  // Total count must increment without page reload
  const updatedCountText = await pollText(
    page,
    '[data-testid="visit-planner-count"]',
    (t) => (parseInt(t.split("/")[0], 10) || 0) > initTotal,
    `total visits > ${initTotal}`
  );
  const newTotal = parseInt(updatedCountText.split("/")[0], 10) || 0;
  expect(newTotal).toBeGreaterThan(initTotal);

  // HC count must also increment
  const updatedHcText = await pollText(
    page,
    '[data-testid="visit-planner-hc-count"]',
    (t) => (parseInt(t, 10) || 0) > initHc,
    `HC visits > ${initHc}`
  );
  const newHc = parseInt(updatedHcText, 10) || 0;
  expect(newHc).toBeGreaterThan(initHc);

  // Campus count must NOT have changed (this was an HC visit)
  const currentCampusText = (await campusEl.textContent()) ?? "0 campus";
  const currentCampus = parseInt(currentCampusText, 10) || 0;
  expect(currentCampus).toBe(initCampus);

  // Consistency: total = campus + HC
  expect(newTotal).toBe(currentCampus + newHc);
});
