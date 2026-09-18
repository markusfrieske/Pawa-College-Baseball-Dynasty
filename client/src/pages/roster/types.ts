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
  coach?: { firstName: string; lastName: string; userId: string | null } | null;
}

export interface LeagueQueryData extends Pick<League, "commissionerId" | "coCommissionerIds" | "currentPhase" | "currentWeek" | "currentSeason" | "progressionEnabled"> {
  teams: LeagueTeam[];
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
