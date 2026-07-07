import type { Player, Team, League } from "@shared/schema";

export interface RosterData {
  players: Player[];
  team: Team;
}

export interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  coach?: { firstName: string; lastName: string } | null;
}

export interface LeagueQueryData {
  teams: LeagueTeam[];
  league?: League;
  progressionEnabled?: boolean;
}

export interface PitcherSlot {
  available: boolean;
  limited: boolean;
  daysOfRest: number;
  suggestedMaxIP: number;
}

export interface PitcherAvailRow {
  playerId: string;
  slots: Record<string, PitcherSlot>;
  lastPitchedOuts: number;
  lastPitchedWeek: number | null;
  lastPitchedDay: string | null;
  stamina: number;
}
