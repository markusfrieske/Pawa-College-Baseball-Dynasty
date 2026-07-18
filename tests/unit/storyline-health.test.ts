/**
 * tests/unit/storyline-health.test.ts
 *
 * Unit tests for the Storyline Health system.
 *
 * These tests mock the storage layer so no real DB connection is required.
 * They verify that checkStorylineHealth correctly identifies each issue code.
 */

import { test, expect } from "@playwright/test";
import {
  checkStorylineHealth,
  type StorylineHealthReport,
  type StorylineHealthStorage,
} from "../../server/lib/storylineHealth";

// ── Storage mock ────────────────────────────────────────────────────────────
type AsyncMock<T> = (() => Promise<T>) & {
  mockResolvedValue(value: T): void;
  reset(): void;
};

function asyncMock<T>(initialValue: T): AsyncMock<T> {
  let value = initialValue;
  const fn = (async () => value) as AsyncMock<T>;
  fn.mockResolvedValue = (next: T) => { value = next; };
  fn.reset = () => { value = initialValue; };
  return fn;
}

// ── Typed mock helpers ────────────────────────────────────────────────────────
const mockStorage = {
  getRecruitsByLeague: asyncMock<any[]>([]),
  getStorylineRecruitsByLeague: asyncMock<any[]>([]),
  getUnresolvedStorylineEvents: asyncMock<any[]>([]),
  getStorylineEventsByRecruit: asyncMock<any[]>([]),
} as unknown as StorylineHealthStorage & Record<string, AsyncMock<any[]>>;

function resetMockStorage() {
  for (const fn of Object.values(mockStorage)) fn.reset();
}

function makeRecruit(id: string) {
  return { id, firstName: "Test", lastName: "Player", position: "1B" };
}

function makeStorylineRecruit(id: string, recruitId: string, arcStage = 1) {
  return { id, recruitId, currentArcStage: arcStage, hiddenVars: {}, archetype: "hometown_hero", isLegendary: false };
}

function makeEvent(id: string, slId: string, week = 1, resolvedChoice: string | null = null) {
  return { id, storylineRecruitId: slId, week, resolvedChoice };
}

const LEAGUE_ID = "test-league";
const SEASON = 1;
const CURRENT_WEEK = 4;

test.describe("checkStorylineHealth", () => {
  test.beforeEach(() => {
    resetMockStorage();
  });

  test("returns healthy=true with no issues when everything is normal", async () => {
    const recruit = makeRecruit("r1");
    const sl = makeStorylineRecruit("sl1", "r1");
    const event = makeEvent("e1", "sl1", 3, "A");

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([event]);

    const report: StorylineHealthReport = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    expect(report.healthy).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.summary.storylineCount).toBe(1);
    expect(report.summary.recruitCount).toBe(1);
    expect(report.summary.unresolvedEvents).toBe(0);
    expect(report.summary.staleEvents).toBe(0);
  });

  test("reports MISSING_STORYLINE_RECRUITS when recruits exist but storylines do not", async () => {
    mockStorage.getRecruitsByLeague.mockResolvedValue([makeRecruit("r1"), makeRecruit("r2")]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    expect(report.healthy).toBe(false);
    const issue = report.issues.find(i => i.code === "MISSING_STORYLINE_RECRUITS");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.repairAction).toBeTruthy();
  });

  test("reports STALE_UNRESOLVED_EVENTS when events are more than 2 weeks old", async () => {
    const recruit = makeRecruit("r1");
    const sl = makeStorylineRecruit("sl1", "r1");
    // Event from week 1, current week is 4 => 3 weeks stale (threshold is 2)
    const staleEvent = makeEvent("e1", "sl1", 1, null);

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([staleEvent]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([staleEvent]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    const issue = report.issues.find(i => i.code === "STALE_UNRESOLVED_EVENTS");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    expect(report.summary.staleEvents).toBe(1);
  });

  test("does NOT report stale events when event is within the 2-week threshold", async () => {
    const recruit = makeRecruit("r1");
    const sl = makeStorylineRecruit("sl1", "r1");
    // Event from week 3, current week is 4 => 1 week old (within threshold)
    const freshEvent = makeEvent("e1", "sl1", 3, null);

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([freshEvent]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([freshEvent]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    const issue = report.issues.find(i => i.code === "STALE_UNRESOLVED_EVENTS");
    expect(issue).toBeUndefined();
    expect(report.summary.staleEvents).toBe(0);
  });

  test("reports ZERO_EVENT_RECRUITS when a storyline recruit never had events generated", async () => {
    const recruit = makeRecruit("r1");
    const sl = makeStorylineRecruit("sl1", "r1");

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);
    // No events for this storyline recruit
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    const issue = report.issues.find(i => i.code === "ZERO_EVENT_RECRUITS");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    expect(report.summary.zeroEventRecruits).toBe(1);
  });

  test("reports STORYLINE_CLASS_MISMATCH when storyline references a recruit not in the current class", async () => {
    const recruit = makeRecruit("r1");
    // Storyline references "r2" which is not in the recruit pool
    const sl = makeStorylineRecruit("sl1", "r2");

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    expect(report.healthy).toBe(false);
    const issue = report.issues.find(i => i.code === "STORYLINE_CLASS_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(report.summary.mismatchedRecruits).toBe(1);
  });

  test("reports SKIPPED_ARC_STAGES when arcStage=0 but resolved events exist", async () => {
    const recruit = makeRecruit("r1");
    const sl = makeStorylineRecruit("sl1", "r1", 0);
    const resolvedEvent = makeEvent("e1", "sl1", 2, "B");

    mockStorage.getRecruitsByLeague.mockResolvedValue([recruit]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([resolvedEvent]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    const issue = report.issues.find(i => i.code === "SKIPPED_ARC_STAGES");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("info");
  });

  test("reports STORYLINE_COUNT_ANOMALY when too few storylines for the recruit pool", async () => {
    // 80 recruits, but only 1 storyline (expected min = 4 = max(3, floor(80*0.05)))
    const recruits = Array.from({ length: 80 }, (_, i) => makeRecruit(`r${i}`));
    const sl = makeStorylineRecruit("sl1", "r0");

    mockStorage.getRecruitsByLeague.mockResolvedValue(recruits);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([sl]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);
    mockStorage.getStorylineEventsByRecruit.mockResolvedValue([makeEvent("e1", "sl1", 2, "A")]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    const issue = report.issues.find(i => i.code === "STORYLINE_COUNT_ANOMALY");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });

  test("returns healthy=true with empty league (no recruits)", async () => {
    mockStorage.getRecruitsByLeague.mockResolvedValue([]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);

    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);

    expect(report.healthy).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  test("includes checkedAt timestamp and correct metadata in report", async () => {
    mockStorage.getRecruitsByLeague.mockResolvedValue([]);
    mockStorage.getStorylineRecruitsByLeague.mockResolvedValue([]);
    mockStorage.getUnresolvedStorylineEvents.mockResolvedValue([]);

    const before = Date.now();
    const report = await checkStorylineHealth(LEAGUE_ID, SEASON, CURRENT_WEEK, mockStorage);
    const after = Date.now();

    expect(report.leagueId).toBe(LEAGUE_ID);
    expect(report.season).toBe(SEASON);
    expect(report.currentWeek).toBe(CURRENT_WEEK);
    const ts = new Date(report.checkedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
