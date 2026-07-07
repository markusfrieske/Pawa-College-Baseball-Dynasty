import type { League, AuditLog, LeagueInvite } from "@shared/schema";

export interface HumanCoach {
  coachId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  abbreviation: string | null;
  isAutoPilot: boolean;
  archetype?: string;
}

export interface CommissionerData {
  league: League;
  auditLogs: AuditLog[];
  readyCoaches: string[];
  totalCoaches: number;
  invites: LeagueInvite[];
  humanCoaches: HumanCoach[];
  oversizedTeams: string[];
}

export interface ReadyStatusData {
  readyStatus: Array<{
    teamId: string;
    teamName: string;
    abbreviation: string;
    isHumanControlled: boolean;
    userId: string | null;
    coachId: string | null;
    coachName: string;
    isReady: boolean;
    isAutoPilot: boolean;
    departuresFinalized: boolean;
    walkonReady: boolean;
    scoutActionsUsed: number;
    recruitActionsUsed: number;
    currentWeekActionCount: number;
    lastActivityAt: string | null;
    hasReportedScores: boolean;
  }>;
  allHumansReady: boolean;
  currentPhase: string;
  phaseDeadline: string | null;
  humanCount: number;
  readyCount: number;
}
