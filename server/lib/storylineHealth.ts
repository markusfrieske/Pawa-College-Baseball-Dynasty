/**
 * Storyline Health System
 *
 * Provides structured detection of storyline data integrity issues for a league
 * and season. The health report is consumed by:
 *   - GET  /api/leagues/:id/storylines/health  (commissioner + co-commissioners)
 *   - POST /api/leagues/:id/storylines/health/repair  (commissioner + co-commissioners)
 *   - scripts/verify-storyline-health.ts  (offline batch audit)
 *
 * Issue codes and what they mean:
 *   MISSING_STORYLINE_RECRUITS   — recruits exist but no storyline_recruits rows for season
 *   STORYLINE_COUNT_ANOMALY      — storyline count is outside the expected 5–15% of recruit pool
 *   STALE_UNRESOLVED_EVENTS      — events unresolved for > STALE_WEEK_THRESHOLD weeks
 *   ZERO_EVENT_RECRUITS          — storyline recruits that never had an event generated
 *   STORYLINE_CLASS_MISMATCH     — storyline recruit references a recruit not in current class
 *   SKIPPED_ARC_STAGES           — recruit arc stage is 0 but events exist (stage counter drift)
 */

/** Read-only persistence surface used by the health checker. */
export interface StorylineHealthStorage {
  getRecruitsByLeague(leagueId: string): Promise<Array<{ id: string }>>;
  getStorylineRecruitsByLeague(leagueId: string, season: number): Promise<Array<{
    id: string;
    recruitId: string;
    currentArcStage: number;
  }>>;
  getUnresolvedStorylineEvents(leagueId: string, season: number): Promise<Array<{
    week: number;
  }>>;
  getStorylineEventsByRecruit(storylineRecruitId: string): Promise<Array<{
    resolvedChoice: string | null;
  }>>;
}

export interface StorylineHealthIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  detail?: string;
  repairAction?: string;
}

export interface StorylineHealthSummary {
  storylineCount: number;
  recruitCount: number;
  unresolvedEvents: number;
  staleEvents: number;
  totalEventsGenerated: number;
  zeroEventRecruits: number;
  mismatchedRecruits: number;
}

export interface StorylineHealthReport {
  leagueId: string;
  season: number;
  currentWeek: number;
  healthy: boolean;
  issues: StorylineHealthIssue[];
  summary: StorylineHealthSummary;
  checkedAt: string;
}

/** Events older than this many weeks (behind currentWeek) are considered stale. */
const STALE_WEEK_THRESHOLD = 2;

/**
 * Run all health checks for a league/season and return a structured report.
 * Lightweight — only runs storage queries, no mutations.
 */
export async function checkStorylineHealth(
  leagueId: string,
  season: number,
  currentWeek: number,
  injectedStorage?: StorylineHealthStorage,
): Promise<StorylineHealthReport> {
  // Load the real database-backed store only in production calls. Unit tests
  // inject the four readers above and therefore need neither a DB nor env vars.
  const healthStorage = injectedStorage
    ?? (await import("../storage")).storage as StorylineHealthStorage;
  const issues: StorylineHealthIssue[] = [];

  // ── Fetch base data ────────────────────────────────────────────────────────
  const [recruits, storylines, unresolvedEvents] = await Promise.all([
    healthStorage.getRecruitsByLeague(leagueId),
    healthStorage.getStorylineRecruitsByLeague(leagueId, season),
    healthStorage.getUnresolvedStorylineEvents(leagueId, season),
  ]);

  // ── Check 1: Missing storyline recruits ───────────────────────────────────
  if (recruits.length > 0 && storylines.length === 0) {
    issues.push({
      severity: "error",
      code: "MISSING_STORYLINE_RECRUITS",
      message: "No storyline recruits initialized for this season",
      detail: `${recruits.length} recruit(s) exist but no storyline arcs were created for season ${season}`,
      repairAction: "POST /storylines/health/repair — runs initializeStorylineRecruits with force=true",
    });
  }

  // ── Check 2: Storyline count anomaly ──────────────────────────────────────
  if (recruits.length > 0 && storylines.length > 0) {
    // Tiny test/custom classes cannot contain more storyline recruits than
    // recruits. Cap the absolute floor accordingly.
    const expectedMin = Math.min(recruits.length, Math.max(3, Math.floor(recruits.length * 0.05)));
    const expectedMax = Math.ceil(recruits.length * 0.20);
    if (storylines.length < expectedMin) {
      issues.push({
        severity: "warning",
        code: "STORYLINE_COUNT_ANOMALY",
        message: `Too few storyline recruits (${storylines.length}); expected at least ${expectedMin}`,
        detail: `Recruit pool has ${recruits.length} player(s); expected 5–20% to have arcs`,
        repairAction: "POST /storylines/health/repair — re-initializes storylines for the current class",
      });
    } else if (storylines.length > expectedMax) {
      issues.push({
        severity: "info",
        code: "STORYLINE_COUNT_ANOMALY",
        message: `Unusually high storyline count (${storylines.length}); expected at most ${expectedMax}`,
        detail: `Recruit pool has ${recruits.length} player(s); expected 5–20% to have arcs`,
      });
    }
  }

  // ── Check 3: Stale unresolved events ──────────────────────────────────────
  const staleEvents = unresolvedEvents.filter(
    e => (currentWeek - e.week) > STALE_WEEK_THRESHOLD,
  );
  if (staleEvents.length > 0) {
    const minWeek = Math.min(...staleEvents.map(e => e.week));
    const maxWeek = Math.max(...staleEvents.map(e => e.week));
    issues.push({
      severity: "warning",
      code: "STALE_UNRESOLVED_EVENTS",
      message: `${staleEvents.length} unresolved event(s) are more than ${STALE_WEEK_THRESHOLD} week(s) old`,
      detail: `Event weeks ${minWeek}–${maxWeek} (current week: ${currentWeek}). Coaches may not have voted.`,
      repairAction: "POST /storylines/health/repair — resolves all overdue events with personality-driven fallback",
    });
  }

  // ── Check 4 + 5: Per-recruit event and mismatch checks ───────────────────
  const recruitIds = new Set(recruits.map(r => r.id));
  let zeroEventRecruits = 0;
  let mismatchedRecruits = 0;
  let skippedArcStages = 0;

  const perRecruitEvents = await Promise.all(
    storylines.map(sl => healthStorage.getStorylineEventsByRecruit(sl.id)),
  );

  for (let i = 0; i < storylines.length; i++) {
    const sl = storylines[i];
    const events = perRecruitEvents[i];

    // Check: storyline recruit references a recruit not in the current class
    if (!recruitIds.has(sl.recruitId)) {
      mismatchedRecruits++;
    }

    // Check: storyline recruit that never had an event generated
    if (events.length === 0) {
      zeroEventRecruits++;
    }

    // Check: arc stage counter is 0 but resolved events exist (drift)
    const resolvedCount = events.filter(e => e.resolvedChoice).length;
    if (sl.currentArcStage === 0 && resolvedCount > 0) {
      skippedArcStages++;
    }
  }

  if (zeroEventRecruits > 0) {
    issues.push({
      severity: "warning",
      code: "ZERO_EVENT_RECRUITS",
      message: `${zeroEventRecruits} storyline recruit(s) never had an event generated`,
      detail: "These recruits were assigned arcs but no events fired — likely a generation gap mid-season",
      repairAction: "POST /storylines/health/repair — runs catchUpAndResolveStorylineArcs to fill gaps",
    });
  }

  if (mismatchedRecruits > 0) {
    issues.push({
      severity: "error",
      code: "STORYLINE_CLASS_MISMATCH",
      message: `${mismatchedRecruits} storyline recruit(s) reference recruits not in the current class`,
      detail: "The recruiting class was replaced after storylines were initialized — arc data is orphaned",
      repairAction: "POST /storylines/health/repair — wipes orphaned arcs and re-initializes for the current class",
    });
  }

  if (skippedArcStages > 0) {
    issues.push({
      severity: "info",
      code: "SKIPPED_ARC_STAGES",
      message: `${skippedArcStages} storyline recruit(s) have an arc-stage counter that may be out of sync`,
      detail: "currentArcStage=0 but resolved events exist — possible from manual repairs or DB patches",
    });
  }

  const totalEventsGenerated = perRecruitEvents.reduce((s, evts) => s + evts.length, 0);
  const hasErrors = issues.some(i => i.severity === "error");

  return {
    leagueId,
    season,
    currentWeek,
    healthy: !hasErrors,
    issues,
    summary: {
      storylineCount: storylines.length,
      recruitCount: recruits.length,
      unresolvedEvents: unresolvedEvents.length,
      staleEvents: staleEvents.length,
      totalEventsGenerated,
      zeroEventRecruits,
      mismatchedRecruits,
    },
    checkedAt: new Date().toISOString(),
  };
}
