// Shared "what's missing" derivation for the multiplayer ready-up UX.
// Used by both League Home's WaitingOnWidget and the Commissioner page's
// ReadyStatusSection so the two views never drift out of sync.
//
// Reuses fields already returned by GET /api/leagues/:id/ready-status —
// no new signals are invented here.

export interface ReadyStatusEntryLike {
  isAutoPilot?: boolean;
  isReady?: boolean;
  departuresFinalized?: boolean;
  walkonReady?: boolean;
  hasReportedScores?: boolean;
  scoutActionsUsed?: number;
  recruitActionsUsed?: number;
  currentWeekActionCount?: number;
}

export const RECRUITING_PHASES = [
  "offseason_recruiting_1",
  "offseason_recruiting_2",
  "offseason_recruiting_3",
  "offseason_recruiting_4",
] as const;

export function isRecruitingPhase(phase: string): boolean {
  return (RECRUITING_PHASES as readonly string[]).includes(phase);
}

/**
 * Whether this coach/team counts as "ready" for the current phase, taking
 * phase-specific readiness signals (departures/walk-ons) and auto-pilot into
 * account rather than the raw isReady flag alone.
 */
export function getEffectiveReady(entry: ReadyStatusEntryLike, phase: string): boolean {
  if (entry.isAutoPilot) return true;
  if (phase === "offseason_departures") return !!entry.departuresFinalized;
  if (phase === "offseason_walkons") return !!entry.walkonReady;
  return !!entry.isReady;
}

/**
 * Short, plain-language reason a coach is not yet ready for the current
 * phase. Returns null when the coach is already effectively ready, or when
 * no more specific reason can be derived than "hasn't marked ready".
 */
export function getReadyReason(entry: ReadyStatusEntryLike, phase: string): string | null {
  if (getEffectiveReady(entry, phase)) return null;
  if (entry.isAutoPilot) return "CPU is managing this team";

  if (phase === "offseason_departures") return "Departures not finalized";
  if (phase === "offseason_walkons") return "Walk-ons not locked in";

  if (entry.hasReportedScores === false) return "Hasn't reported scores";

  if (isRecruitingPhase(phase)) {
    const actions = entry.currentWeekActionCount ?? ((entry.scoutActionsUsed ?? 0) + (entry.recruitActionsUsed ?? 0));
    if (!actions) return "No recruiting actions this week";
    return "Hasn't marked ready yet";
  }

  return "Not marked ready yet";
}
