/**
 * E2E: Mobile recruiting board — position filter flows through all tabs
 *
 * Validates that:
 *  1. The filter sheet (mobile board) can be opened via "mobile-board-filter-btn"
 *  2. A position filter selection reduces the recruit count on the Board tab
 *  3. The same filteredRecruits prop is respected on Targets and Battles tabs
 *     (tab switches do not reset or ignore the active filter)
 *  4. Resetting filters restores the full unfiltered list
 *
 * Uses a pre-existing test league (RT2 Ready UX Test, 40 recruits: 29 P + 11 other).
 * Authenticates as a guest via browser-side fetch() so the session cookie is shared
 * with the browser context.
 */

import { test, expect, type Page } from "@playwright/test";

const LEAGUE_ID = "d4e7a9ae-dd49-4d2b-bf39-2487e34ce05a";
const RECRUITING_URL = `/league/${LEAGUE_ID}/recruiting`;

// Mobile viewport — must be <768px to trigger the mobile board path
test.use({ viewport: { width: 400, height: 720 } });

// ── helpers ──────────────────────────────────────────────────────────────────

async function waitForRecruitCards(page: Page): Promise<number> {
  await page.waitForSelector('[data-testid^="mobile-recruit-card-"]', {
    timeout: 60_000,
  });
  return page.locator('[data-testid^="mobile-recruit-card-"]').count();
}

/** Opens the filter sheet via the Board-tab filter button. */
async function openFilterSheet(page: Page): Promise<void> {
  // Make sure we're on the Board tab first (filter btn lives there)
  const boardTab = page.locator('[data-testid="mobile-tab-board"]');
  if (await boardTab.isVisible()) {
    await boardTab.click();
    await page.waitForTimeout(200);
  }
  await page.click('[data-testid="mobile-board-filter-btn"]');
  await page.waitForSelector('[data-testid="select-position-filter-sheet"]', {
    timeout: 10_000,
  });
}

async function applyPositionFilter(page: Page, position: string): Promise<void> {
  await page.selectOption('[data-testid="select-position-filter-sheet"]', position);
  await page.click('[data-testid="button-apply-filters"]');
  await page.waitForTimeout(400);
}

async function resetFilters(page: Page): Promise<void> {
  await openFilterSheet(page);
  await page.waitForSelector('[data-testid="button-clear-all-filters"]', { timeout: 10_000 });
  await page.click('[data-testid="button-clear-all-filters"]');
  // onReset calls setShowFilterSheet(false) — sheet closes automatically.
  // Just wait for the DOM to settle.
  await page.waitForTimeout(500);
}

// ── tests ────────────────────────────────────────────────────────────────────

test.describe("Mobile filter sheet updates all recruiting tabs", () => {
  test("position filter reduces Board count and persists across Targets and Battles tabs", async ({
    page,
  }) => {
    // Navigate first so the browser has a document origin, then auth from inside the browser
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Create guest session via fetch() running inside the browser — guarantees cookie sharing
    const authOk = await page.evaluate(async () => {
      const r = await fetch("/api/auth/guest", { method: "POST", credentials: "include" });
      return r.ok;
    });
    if (!authOk) throw new Error("Guest auth failed");

    // Navigate to the recruiting page
    await page.goto(RECRUITING_URL, { waitUntil: "domcontentloaded" });

    // ── 1. Verify initial state ──
    const initialCount = await waitForRecruitCards(page);
    expect(initialCount).toBeGreaterThan(0);

    // Board tab must be visible
    await expect(page.locator('[data-testid="mobile-tab-board"]')).toBeVisible();

    // Board-tab filter button must be visible
    const filterBtn = page.locator('[data-testid="mobile-board-filter-btn"]');
    await expect(filterBtn).toBeVisible();

    // ── 2. Apply position filter: P (Pitcher) — test league has 29 P + 11 other ──
    await openFilterSheet(page);
    await applyPositionFilter(page, "P");

    // Board tab should show fewer recruits (only Pitchers)
    const filteredCount = await waitForRecruitCards(page);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);

    // ── 3. Targets tab: filter flows through — no non-Pitcher cards visible ──
    await page.click('[data-testid="mobile-tab-targets"]');
    await page.waitForTimeout(400);

    const targetCards = page.locator('[data-testid^="mobile-recruit-card-"]');
    const targetCount = await targetCards.count();
    // Targets is a strict subset of filteredRecruits, so count ≤ filteredCount
    expect(targetCount).toBeLessThanOrEqual(filteredCount);
    // Every card visible on Targets must carry a Pitcher position badge (position "P")
    for (let i = 0; i < targetCount; i++) {
      await expect(
        targetCards.nth(i).locator('[data-testid="position-badge-p"]')
      ).toBeVisible();
    }

    // ── 4. Battles tab: filter flows through — no non-Pitcher cards visible ──
    await page.click('[data-testid="mobile-tab-battles"]');
    await page.waitForTimeout(400);

    const battleCards = page.locator('[data-testid^="mobile-recruit-card-"]');
    const battleCount = await battleCards.count();
    // Battles is a strict subset of filteredRecruits, so count ≤ filteredCount
    expect(battleCount).toBeLessThanOrEqual(filteredCount);
    // Every card visible on Battles must carry a Pitcher position badge
    for (let i = 0; i < battleCount; i++) {
      await expect(
        battleCards.nth(i).locator('[data-testid="position-badge-p"]')
      ).toBeVisible();
    }

    // ── 5. Back to Board: recruit count must still match the filtered count ──
    await page.click('[data-testid="mobile-tab-board"]');
    await page.waitForTimeout(400);

    const countAfterTabRound = await page
      .locator('[data-testid^="mobile-recruit-card-"]')
      .count();
    expect(countAfterTabRound).toBe(filteredCount);

    // ── 6. Reset filters: full list returns ──
    await resetFilters(page);

    const resetCount = await waitForRecruitCards(page);
    expect(resetCount).toBeGreaterThanOrEqual(initialCount);
  });
});
