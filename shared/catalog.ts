export const CONFERENCE_CATALOG = [
  { name: "SEC",              size: 16 },
  { name: "ACC",              size: 16 },
  { name: "Big 12",           size: 14 },
  { name: "Big Ten",          size: 17 },
  { name: "Pac-12",           size:  8 },
  { name: "AAC",              size: 11 },
  { name: "WCC",              size:  8 },
  { name: "Ivy League",       size:  8 },
  { name: "Sun Belt",         size: 12 },
  { name: "Big West",         size: 10 },
  { name: "HBCU",             size: 16 },
  { name: "Missouri Valley",  size: 13 },
] as const;

export type ConferenceName = typeof CONFERENCE_CATALOG[number]["name"];

export const FULL_SEASON_TOTAL: number = CONFERENCE_CATALOG.reduce((s, c) => s + c.size, 0);

export const FULL_SEASON_CONF_NAMES: string[] = CONFERENCE_CATALOG.map(c => c.name);

export const CONF_SIZE_MAP: ReadonlyMap<string, number> = new Map(
  CONFERENCE_CATALOG.map(c => [c.name, c.size]),
);

export const FULL_SEASON_RULES = {
  maxTeams:           FULL_SEASON_TOTAL,
  conferenceCount:    CONFERENCE_CATALOG.length,
  seasonLength:       "full_season" as const,
  progressionEnabled: true,
  gameMode:           "simulated" as const,
  catalogVersion:     "v1.0",
} as const;
