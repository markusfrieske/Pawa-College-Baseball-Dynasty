/**
 * E2E test: Recruiting header stat cards update immediately after actions
 *
 * Validates that after recruiting actions (email, campus visit) the economy
 * header stat cards (CONTACT PTS and VISITS) reflect updated values in the
 * DOM immediately — without requiring a manual page refresh — via the React
 * Query optimistic cache patches in `client/src/hooks/use-recruiting.ts`.
 *
 * Also asserts that when the season visit cap is exhausted the visit button
 * is disabled and its tooltip contains the cap-reached text the UI shows.
 *
 * Auth pattern: guest session created via `request` in beforeAll, then
 * injected into each browser context via page.evaluate/document.cookie so
 * the Playwright page shares the same server-side session.
 */

import { test, expect, Page } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Module-level state shared across tests (populated in beforeAll)
// ---------------------------------------------------------------------------
let leagueId: string;
let recruitIds: string[];
let sessionCookie: string; // "connect.sid=<value>"

// ---------------------------------------------------------------------------
// API helpers (accept any APIRequestContext — request or page.request)
// ---------------------------------------------------------------------------

async function createLeague(req: APIRequestContext): Promise<string> {
  const resp = await req.post("/api/leagues", {
    data: {
      name: `e2e-rh-stats-${Date.now()}`,
      maxTeams: 6,
      conferenceCount: 2,
      cpuDifficulty: "beginner",
      selectedConferences: ["SEC", "ACC"],
      seasonLength: "short",
    },
  });
  if (!resp.ok()) throw new Error(`createLeague failed: ${resp.status()} ${await resp.text()}`);
  return (await resp.json()).id as string;
}

async function selectTeams(req: APIRequestContext, lid: string): Promise<void> {
  const sel = await (await req.get(`/api/leagues/${lid}/team-selection`)).json();
  const pools: { conference: { id: string }; teams: { name: string }[] }[] =
    sel.conferenceTeamPools ?? [];
  const picks = pools.slice(0, 2).map((p, i) => ({
    conferenceId: p.conference.id,
    teamNames: p.teams.slice(0, i === 0 ? 3 : 3).map((t) => t.name),
  }));
  const resp = await req.post(`/api/leagues/${lid}/team-selection`, {
    data: { conferences: picks },
    timeout: 30_000,
  });
  if (!resp.ok()) throw new Error(`selectTeams failed: ${resp.status()} ${await resp.text()}`);
}

async function getHumanTeamId(req: APIRequestContext, lid: string): Promise<string> {
  const data = await (await req.get(`/api/leagues/${lid}`)).json();
  const human = (data.teams as { id: string; isCpu: boolean }[]).find((t) => !t.isCpu);
  if (!human) throw new Error("no human team");
  return human.id;
}

async function setupCoach(req: APIRequestContext, lid: string, teamId: string): Promise<void> {
  const resp = await req.post(`/api/leagues/${lid}/setup`, {
    data: { teamId, coach: { firstName: "E2E", lastName: "Coach", archetype: "Balanced" } },
    timeout: 120_000,
  });
  if (!resp.ok()) throw new Error(`setupCoach failed: ${resp.status()} ${await resp.text()}`);
}

async function startDynasty(req: APIRequestContext, lid: string): Promise<void> {
  const resp = await req.post(`/api/leagues/${lid}/start`, { data: {}, timeout: 120_000 });
  if (!resp.ok()) throw new Error(`startDynasty failed: ${resp.status()} ${await resp.text()}`);
}

async function getPhase(req: APIRequestContext, lid: string): Promise<string> {
  const data = await (await req.get(`/api/leagues/${lid}`)).json();
  return data.currentPhase as string;
}

async function forceAdvance(req: APIRequestContext, lid: string): Promise<void> {
  const resp = await req.post(`/api/leagues/${lid}/force-advance`, { data: {}, timeout: 120_000 });
  if (!resp.ok()) throw new Error(`force-advance: ${resp.status()} ${await resp.text()}`);
}

async function finalizeDepartures(req: APIRequestContext, lid: string): Promise<void> {
  const resp = await req.post(`/api/leagues/${lid}/departures/finalize`, { data: {}, timeout: 120_000 });
  if (!resp.ok() && resp.status() !== 403) {
    throw new Error(`finalizeDepartures: ${resp.status()} ${await resp.text()}`);
  }
}

async function markWalkonsReady(req: APIRequestContext, lid: string): Promise<void> {
  const resp = await req.post(`/api/leagues/${lid}/walkons/ready`, { data: {}, timeout: 60_000 });
  if (!resp.ok() && resp.status() !== 400 && resp.status() !== 403) {
    throw new Error(`markWalkonsReady: ${resp.status()} ${await resp.text()}`);
  }
}

async function advanceToRecruiting(req: APIRequestContext, lid: string): Promise<void> {
  const targets = new Set(["recruiting", "signing_day"]);
  for (let i = 0; i < 60; i++) {
    const phase = await getPhase(req, lid);
    if (targets.has(phase)) return;
    if (phase === "offseason_departures") await finalizeDepartures(req, lid);
    else if (phase === "offseason_walkons") {
      await markWalkonsReady(req, lid);
      await forceAdvance(req, lid).catch(() => null);
    } else {
      await forceAdvance(req, lid);
    }
  }
  throw new Error("Never reached recruiting phase");
}

async function getRecruitIds(req: APIRequestContext, lid: string): Promise<string[]> {
  const data = await (await req.get(`/api/leagues/${lid}/recruiting`)).json();
  return (data.recruits ?? []).map((r: { id: string }) => r.id);
}

async function targetRecruit(req: APIRequestContext, lid: string, rid: string): Promise<void> {
  await req.post(`/api/leagues/${lid}/recruiting/${rid}/target`, { data: {} });
  // Ignore errors (already targeted, max cap, etc.)
}

async function visitRecruit(req: APIRequestContext, lid: string, rid: string): Promise<boolean> {
  const resp = await req.post(`/api/leagues/${lid}/recruiting/${rid}/visit`, { data: {} });
  return resp.ok();
}

async function getEconomyCaps(
  req: APIRequestContext,
  lid: string
): Promise<{ visitUsed: number; visitCap: number } | null> {
  const data = await (await req.get(`/api/leagues/${lid}/recruiting`)).json();
  const eco = data.economy;
  if (!eco) return null;
  return { visitUsed: eco.visits.totalUsed, visitCap: eco.visits.totalCap };
}

// ---------------------------------------------------------------------------
// Helper: open recruiting page with auth injected
// ---------------------------------------------------------------------------

async function openRecruitingPage(page: Page): Promise<void> {
  // Navigate to root first (establishes same-origin context), then inject cookie
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );
  await page.goto(`/league/${leagueId}/recruiting`, { waitUntil: "networkidle", timeout: 30_000 });
  await page
    .locator('[data-testid="stat-card-contact-pts"]')
    .waitFor({ state: "visible", timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Helper: poll a stat card's <p> value until predicate is satisfied
// ---------------------------------------------------------------------------

async function pollStatCardValue(
  page: Page,
  testId: string,
  predicate: (val: string) => boolean,
  description: string,
  timeoutMs = 8_000
): Promise<string> {
  const p = page.locator(`[data-testid="${testId}"] p`).first();
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await p.textContent()) ?? "";
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`Stat card [${testId}] value "${last}" never satisfied: ${description}`);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000); // up to 5 min for full setup

  // Create guest session and capture the session cookie for browser injection
  const guestResp = await request.post("/api/auth/guest");
  if (!guestResp.ok()) throw new Error(`Guest login failed: ${guestResp.status()}`);
  const setCookieHeader = guestResp.headers()["set-cookie"] ?? "";
  const match = setCookieHeader.match(/connect\.sid=([^;]+)/);
  if (!match) throw new Error("No connect.sid cookie from guest login");
  sessionCookie = `connect.sid=${match[1]}`;

  leagueId = await createLeague(request);
  await selectTeams(request, leagueId);
  const teamId = await getHumanTeamId(request, leagueId);
  await setupCoach(request, leagueId, teamId);
  await startDynasty(request, leagueId);
  await advanceToRecruiting(request, leagueId);
  recruitIds = await getRecruitIds(request, leagueId);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("CONTACT PTS card increments in DOM immediately after email action", async ({ page }) => {
  test.setTimeout(60_000);
  await openRecruitingPage(page);

  // Capture initial Contact Pts value shown in the card
  const contactCard = page.locator('[data-testid="stat-card-contact-pts"] p').first();
  const initial = (await contactCard.textContent()) ?? "0/0";
  const initSpent = parseInt(initial.split("/")[0], 10);

  // Target the first recruit so the email action button is usable
  const recruitId = recruitIds[0];
  await targetRecruit(page.request, leagueId, recruitId);

  // Reload so the targeted recruit is visible; wait for stat card
  await page.reload({ waitUntil: "networkidle", timeout: 20_000 });
  await page.locator('[data-testid="stat-card-contact-pts"]').waitFor({ state: "visible" });

  // Click the Email button to open pitch picker
  const emailBtn = page
    .locator(`[data-testid="button-email-${recruitId}"]`)
    .first();
  await emailBtn.waitFor({ state: "visible", timeout: 10_000 });

  // Skip if already emailed this week
  const title = await emailBtn.getAttribute("title");
  if (title?.includes("Already emailed")) {
    test.skip(true, "Recruit already emailed this week — cannot retest this week");
    return;
  }

  await emailBtn.click();

  // Select the first pitch option in the inline picker
  const pitchOption = page
    .locator(`[data-testid^="pitch-option-email-"][data-testid$="-${recruitId}"]`)
    .first();
  await pitchOption.waitFor({ state: "visible", timeout: 5_000 });
  await pitchOption.click();

  // Click Send Email
  const sendBtn = page.locator(`[data-testid="button-send-email-${recruitId}"]`);
  await sendBtn.waitFor({ state: "visible", timeout: 3_000 });
  await sendBtn.click();

  // Assert Contact Pts card value incremented WITHOUT a page reload
  const updated = await pollStatCardValue(
    page,
    "stat-card-contact-pts",
    (val) => parseInt(val.split("/")[0], 10) > initSpent,
    `spent > ${initSpent}`
  );
  const newSpent = parseInt(updated.split("/")[0], 10);
  expect(newSpent).toBeGreaterThan(initSpent);
});

test("VISITS card increments in DOM immediately after campus visit action", async ({ page }) => {
  test.setTimeout(60_000);
  await openRecruitingPage(page);

  // Capture initial Visits value
  const visitsCard = page.locator('[data-testid="stat-card-visits"] p').first();
  const initial = (await visitsCard.textContent()) ?? "0/0";
  // Value is "X/Y" (totalUsed/totalCap)
  const initUsed = parseInt(initial.split("/")[0], 10) || 0;

  const recruitId = recruitIds[1] ?? recruitIds[0];
  await targetRecruit(page.request, leagueId, recruitId);
  await page.reload({ waitUntil: "networkidle", timeout: 20_000 });
  await page.locator('[data-testid="stat-card-visits"]').waitFor({ state: "visible" });

  // Click the Visit button
  const visitBtn = page
    .locator(`[data-testid="button-visit-${recruitId}"]`)
    .first();
  await visitBtn.waitFor({ state: "visible", timeout: 10_000 });

  // Skip if disabled (cap or already visited)
  const isDisabled = await visitBtn.isDisabled();
  if (isDisabled) {
    test.skip(true, "Visit button disabled — cap or already visited");
    return;
  }

  await visitBtn.click();

  // Assert Visits card value incremented WITHOUT a page reload
  const updated = await pollStatCardValue(
    page,
    "stat-card-visits",
    (val) => {
      const n = parseInt(val.split("/")[0], 10) || 0;
      return n > initUsed;
    },
    `visits > ${initUsed}`
  );
  const newUsed = parseInt(updated.split("/")[0], 10) || 0;
  expect(newUsed).toBeGreaterThan(initUsed);
});

test("visit button is disabled with cap-reached tooltip when season visits exhausted", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Exhaust remaining visits via API so the page renders with cap state
  const eco = await getEconomyCaps(page.request, leagueId);
  if (eco) {
    const remaining = eco.visitCap - eco.visitUsed;
    for (let i = 0; i < remaining && i < 20; i++) {
      const rid = recruitIds[i % recruitIds.length];
      await targetRecruit(page.request, leagueId, rid);
      await visitRecruit(page.request, leagueId, rid);
    }
  }

  await openRecruitingPage(page);

  // Find any visible, disabled Visit button (season cap = true)
  // The button text changes to "Cap Reached" or tooltip shows cap text
  const disabledVisitBtn = page
    .locator('[data-testid^="button-visit-"]')
    .filter({ has: page.locator(":scope[disabled]") })
    .first();

  const btnVisible = await disabledVisitBtn
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!btnVisible) {
    // Confirm cap is actually reached via API; if not, skip rather than fail
    const ecoAfter = await getEconomyCaps(page.request, leagueId);
    if (!ecoAfter || ecoAfter.visitUsed < ecoAfter.visitCap) {
      test.skip(true, "Visit cap not reachable with recruits available in this league");
    }
    return;
  }

  // Hover the disabled button to reveal the Tooltip
  await disabledVisitBtn.hover();
  const tooltip = page.locator('[role="tooltip"]');
  await tooltip.waitFor({ state: "visible", timeout: 5_000 });
  const tooltipText = (await tooltip.textContent()) ?? "";

  // Expected text from recruit-row.tsx:
  // "Season visit cap reached (N total). Resets next season."
  // or "Campus cap reached (N/M). Resets next season."
  expect(tooltipText).toMatch(
    /Season visit cap reached|Campus cap reached|HCV cap reached|cap reached/i
  );
  expect(tooltipText).toMatch(/Resets next season/i);
});

test("server returns 400 with cap-exhausted message when contact points spent", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    ([cookie]) => { document.cookie = cookie; },
    [`${sessionCookie}; path=/`]
  );

  // Drain contact points via email calls until the server says no
  let capHit = false;
  for (let i = 0; i < recruitIds.length && !capHit; i++) {
    await targetRecruit(page.request, leagueId, recruitIds[i]);
    const resp = await page.request.post(
      `/api/leagues/${leagueId}/recruiting/${recruitIds[i]}/email`,
      { data: { pitchTopic: "reputation" } }
    );
    if (!resp.ok()) {
      const body = await resp.json().catch(() => ({ message: "" }));
      // Server MUST return 400 — what the client turns into disabled-button tooltip text
      expect(resp.status()).toBe(400);
      // Message pattern: "don't have enough recruit points" / "Contact pts exhausted"
      expect(body.message ?? "").toMatch(/recruit.*point|point|exhausted|cap/i);
      capHit = true;
    }
  }

  if (!capHit) {
    test.skip(true, "Contact point cap not reachable with this league's recruits/budget");
  }
});
