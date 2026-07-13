/**
 * Canonical phase definitions for College Baseball Dynasty.
 *
 * All server and client code should reference these constants instead of
 * raw string literals so that typos are caught at compile time and renaming
 * a phase only requires a single change here.
 */

export const Phase = {
  Preseason: "preseason",
  SpringTraining: "spring_training",
  RegularSeason: "regular_season",
  ConferenceChampionship: "conference_championship",
  SuperRegionals: "super_regionals",
  CWS: "cws",
  OffseasonDepartures: "offseason_departures",
  OffseasonRecruiting1: "offseason_recruiting_1",
  OffseasonRecruiting2: "offseason_recruiting_2",
  OffseasonRecruiting3: "offseason_recruiting_3",
  OffseasonRecruiting4: "offseason_recruiting_4",
  OffseasonSigningDay: "offseason_signing_day",
  OffseasonWalkons: "offseason_walkons",
} as const;

export type PhaseName = (typeof Phase)[keyof typeof Phase];

export const ALL_PHASES: readonly PhaseName[] = [
  Phase.Preseason,
  Phase.SpringTraining,
  Phase.RegularSeason,
  Phase.ConferenceChampionship,
  Phase.SuperRegionals,
  Phase.CWS,
  Phase.OffseasonDepartures,
  Phase.OffseasonRecruiting1,
  Phase.OffseasonRecruiting2,
  Phase.OffseasonRecruiting3,
  Phase.OffseasonRecruiting4,
  Phase.OffseasonSigningDay,
  Phase.OffseasonWalkons,
] as const;

export const GAME_PHASES: readonly PhaseName[] = [
  Phase.Preseason,
  Phase.SpringTraining,
  Phase.RegularSeason,
  Phase.ConferenceChampionship,
  Phase.SuperRegionals,
  Phase.CWS,
] as const;

export const OFFSEASON_PHASES: readonly PhaseName[] = [
  Phase.OffseasonDepartures,
  Phase.OffseasonRecruiting1,
  Phase.OffseasonRecruiting2,
  Phase.OffseasonRecruiting3,
  Phase.OffseasonRecruiting4,
  Phase.OffseasonSigningDay,
  Phase.OffseasonWalkons,
] as const;

export const OFFSEASON_RECRUITING_PHASES: readonly PhaseName[] = [
  Phase.OffseasonRecruiting1,
  Phase.OffseasonRecruiting2,
  Phase.OffseasonRecruiting3,
  Phase.OffseasonRecruiting4,
] as const;

export const RECRUITING_ACTIVE_PHASES: readonly PhaseName[] = [
  Phase.Preseason,
  Phase.SpringTraining,
  Phase.RegularSeason,
] as const;

export const STORYLINE_ACTIVE_PHASES: readonly PhaseName[] = [
  Phase.Preseason,
  Phase.SpringTraining,
  Phase.RegularSeason,
  Phase.ConferenceChampionship,
  Phase.SuperRegionals,
  Phase.CWS,
] as const;

/** Maximum regular-season weeks by season-length setting. */
export const SEASON_MAX_WEEKS: Record<string, number> = {
  short: 5,
  standard: 5,
  medium: 10,
  long: 15,
  full_season: 14,
};

/** Returns the maximum number of regular-season weeks for the given season-length string. */
export function getSeasonMaxWeeks(seasonLength: string | null | undefined): number {
  return SEASON_MAX_WEEKS[seasonLength ?? "standard"] ?? 5;
}

/**
 * Legal transitions from each phase.
 * SuperRegionals can go to either CWS (normal) or OffseasonDepartures (bracket skipped).
 */
export const PHASE_TRANSITIONS: Partial<Record<PhaseName, readonly PhaseName[]>> = {
  [Phase.Preseason]: [Phase.RegularSeason],
  [Phase.SpringTraining]: [Phase.RegularSeason],
  [Phase.RegularSeason]: [Phase.ConferenceChampionship],
  [Phase.ConferenceChampionship]: [Phase.SuperRegionals],
  [Phase.SuperRegionals]: [Phase.CWS, Phase.OffseasonDepartures],
  [Phase.CWS]: [Phase.OffseasonDepartures],
  [Phase.OffseasonDepartures]: [Phase.OffseasonRecruiting1],
  [Phase.OffseasonRecruiting1]: [Phase.OffseasonRecruiting2],
  [Phase.OffseasonRecruiting2]: [Phase.OffseasonRecruiting3],
  [Phase.OffseasonRecruiting3]: [Phase.OffseasonRecruiting4],
  [Phase.OffseasonRecruiting4]: [Phase.OffseasonSigningDay],
  [Phase.OffseasonSigningDay]: [Phase.OffseasonWalkons],
  [Phase.OffseasonWalkons]: [Phase.Preseason],
};

/** Returns true if `next` is a legal successor of `current`. */
export function isLegalTransition(current: string, next: string): boolean {
  const allowed = PHASE_TRANSITIONS[current as PhaseName];
  return allowed ? (allowed as readonly string[]).includes(next) : false;
}
