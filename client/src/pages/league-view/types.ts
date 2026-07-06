import type { League, Team, Conference, Standings } from "@shared/schema";

export interface TeamWithCoach extends Team {
  standings?: Standings;
  coach?: {
    id: string;
    firstName: string;
    lastName: string;
    userId: string;
  } | null;
  user?: {
    email: string;
    username?: string | null;
  } | null;
}

export interface LeagueDetails extends League {
  teams: TeamWithCoach[];
  conferences: Conference[];
}

export interface DashboardOverview {
  rosterSize: number;
  eligibility: Record<string, number>;
  positionCounts: Record<string, number>;
  positionsAtRisk: string[];
  nilBudget: number;
  nilSpent: number;
  prestige: number;
  recruitingSigned: number;
  recruitingInterested: number;
  averageOverall: number;
  hitterAvg: number;
  pitcherAvg: number;
  starDist: Record<string, number>;
  top5Players: { name: string; position: string; overall: number; starRating: number }[];
  topPlayer: { name: string; position: string; overall: number } | null;
  hittingScore?: number;
  fieldingScore?: number;
  speedScore?: number;
  pitchingScore?: number;
  hitGrade?: string;
  fieldGrade?: string;
  speedGrade?: string;
  pitchGrade?: string;
}

export interface AuctionOutcome {
  walkonId: string;
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  won: boolean;
  pricePaid: number;
  winnerTeamName: string | null;
  yourBid: number;
}

export interface GameForWidget {
  id: string;
  week: number;
  phase: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  isConference: boolean;
  gameType: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

export interface ScheduleForWidget {
  games: GameForWidget[];
  currentWeek: number;
  humanTeamIds: string[];
}

export interface PowerRankingEntry {
  rank: number;
  rankDelta: number | null;
  teamId: string;
  teamName: string;
  mascot: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  isCpu: boolean;
  avgOvr: number;
  hitterAvgOvr: number;
  pitcherAvgOvr: number;
  recruitingScore: number;
  hasSignedRecruits: boolean;
  ovrPercentile: number;
  hitterPercentile: number;
  pitcherPercentile: number;
  recruitingPercentile: number;
}

export interface StorylineWidgetItem {
  id: string;
  isLegendary: boolean;
  archetypeName: string;
  overlappingRecruitName?: string | null;
  currentArcStage?: number;
  resolvedOvrDelta?: number;
  totalEvents?: number;
  recruit?: {
    firstName: string;
    lastName: string;
    position?: string;
    starRank?: number;
  } | null;
  activeEvent?: {
    id: string;
    eventText: string;
    resolvedChoice?: string | null;
    ovrDelta?: number | null;
  } | null;
  voteCounts?: Record<string, number>;
  myVote?: string | null;
}

export interface ReadyStatusData {
  readyStatus: Array<{
    teamId: string;
    teamName: string;
    abbreviation: string;
    isHumanControlled: boolean;
    userId: string | null;
    coachName?: string;
    isReady: boolean;
    isAutoPilot?: boolean;
    departuresFinalized?: boolean;
    walkonReady?: boolean;
    scoutActionsUsed?: number;
    recruitActionsUsed?: number;
    hasReportedScores?: boolean;
  }>;
  notReadyTeams?: Array<{ teamId: string; teamName: string; abbreviation: string }>;
  allHumansReady: boolean;
  humanCount: number;
  readyCount: number;
  currentPhase: string;
  showReadyNamesToAll?: boolean;
  currentUserId?: string;
}

export interface ProspectEntry {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  overall: number;
  starRating: number;
  batHand: string;
  throwHand: string;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  teamPrimaryColor: string;
  teamSecondaryColor: string;
  category: "hitter" | "pitcher";
}

export type ProspectsView = "combined" | "hitters" | "pitchers";

export interface SigningDayData {
  teamSignings: {
    teamId: string;
    teamName: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    mascot: string;
    recruits: { id: string; firstName: string; lastName: string; position: string; starRating: number; overall: number; homeState: string; isBlueChip: boolean }[];
    totalRecruits: number;
    avgRating: number;
    totalStars: number;
  }[];
  totalSigned: number;
  totalUnsigned: number;
  totalRecruits: number;
  transferPortal?: {
    departed: number;
    stillAvailable: number;
  };
}

export const HOME_TAB_VALUES = new Set(["prospects", "standings", "teams", "rankings", "news", "awards", "history"]);

export const NEXT_GAME_PHASES = new Set(["regular_season", "conference_championship", "super_regionals", "cws"]);

export const STORYLINE_VOTE_CALLOUT_PHASES = new Set([
  "recruiting", "preseason", "spring_training", "regular_season",
]);
