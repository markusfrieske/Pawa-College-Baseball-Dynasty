import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { PositionBadge } from "@/components/ui/position-badge";
import { StarRating } from "@/components/ui/star-rating";
import { 
  ArrowLeft, 
  Users,
  Trophy,
  TrendingUp,
  MapPin
} from "lucide-react";

interface CommitInfo {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  starRating: number;
  overall: number;
  classRank: number;
  positionRank: number;
  homeState: string;
  hometown: string;
  recruitType: string;
}

interface TeamCommits {
  team: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    prestige: number;
    isCpu: boolean;
  };
  commits: CommitInfo[];
  commitCount: number;
  avgStarRating: number;
}

interface CommitsData {
  league: { id: string; name: string; currentSeason: number };
  commitsByTeam: TeamCommits[];
  totalCommits: number;
  totalRecruits: number;
}

function CommitMiniCard({ commit }: { commit: CommitInfo }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-[#1a2b1a] rounded border border-[#2d3d2d]">
      <PositionBadge position={commit.position} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-white truncate">
            {commit.firstName} {commit.lastName}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {commit.recruitType}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{commit.overall} OVR</span>
          <StarRating rating={commit.starRating} size="sm" />
        </div>
      </div>
      <div className="text-right text-[10px] text-gray-400">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {commit.homeState}
        </div>
        <div className="text-[#C4A35A]">#{commit.classRank}</div>
      </div>
    </div>
  );
}

function TeamCommitCard({ teamData }: { teamData: TeamCommits }) {
  const { team, commits, avgStarRating } = teamData;

  return (
    <RetroCard className="h-fit">
      <RetroCardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TeamBadge
            abbreviation={team.abbreviation}
            primaryColor={team.primaryColor}
            secondaryColor={team.secondaryColor}
            size="sm"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-sm text-[#C4A35A]">{team.name}</span>
              {team.isCpu && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">CPU</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {commits.length} commit{commits.length !== 1 ? "s" : ""}
              </span>
              {commits.length > 0 && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {avgStarRating.toFixed(1)} avg
                </span>
              )}
            </div>
          </div>
        </div>
      </RetroCardHeader>
      <RetroCardContent className="pt-0">
        {commits.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-4">
            No commits yet
          </div>
        ) : (
          <div className="space-y-2">
            {commits.map((commit) => (
              <CommitMiniCard key={commit.id} commit={commit} />
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

export default function CommitsPage() {
  const { id: leagueId } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery<CommitsData>({
    queryKey: ["/api/leagues", leagueId, "commits"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/commits`);
      if (!res.ok) throw new Error("Failed to fetch commits");
      return res.json();
    },
    enabled: !!leagueId,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-center text-red-400">
        Failed to load commits data
      </div>
    );
  }

  const teamsWithCommits = data.commitsByTeam.filter(t => t.commitCount > 0);
  const teamsWithoutCommits = data.commitsByTeam.filter(t => t.commitCount === 0);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/league/${leagueId}`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to League
            </RetroButton>
          </Link>
          <div>
            <h1 className="font-pixel text-xl text-[#C4A35A]">RECRUITING COMMITS</h1>
            <p className="text-sm text-gray-400">
              Season {data.league.currentSeason} • {data.totalCommits} / {data.totalRecruits} signed
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <RetroCard className="bg-gradient-to-br from-[#1a2b1a] to-[#243524]">
          <RetroCardContent className="py-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-[#C4A35A]" />
              <div>
                <div className="text-2xl font-pixel text-white">{data.totalCommits}</div>
                <div className="text-xs text-gray-400">Total Commits</div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
        <RetroCard className="bg-gradient-to-br from-[#1a2b1a] to-[#243524]">
          <RetroCardContent className="py-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-400" />
              <div>
                <div className="text-2xl font-pixel text-white">{teamsWithCommits.length}</div>
                <div className="text-xs text-gray-400">Teams with Commits</div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
        <RetroCard className="bg-gradient-to-br from-[#1a2b1a] to-[#243524]">
          <RetroCardContent className="py-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <div>
                <div className="text-2xl font-pixel text-white">
                  {data.totalRecruits - data.totalCommits}
                </div>
                <div className="text-xs text-gray-400">Unsigned Recruits</div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>

      <div className="mb-4">
        <h2 className="font-pixel text-sm text-[#C4A35A] mb-2">RECRUITING LEADERBOARD</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamsWithCommits.map((teamData) => (
          <TeamCommitCard key={teamData.team.id} teamData={teamData} />
        ))}
      </div>

      {teamsWithoutCommits.length > 0 && (
        <>
          <div className="mt-8 mb-4">
            <h2 className="font-pixel text-sm text-gray-500 mb-2">TEAMS WITHOUT COMMITS</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {teamsWithoutCommits.map((teamData) => (
              <div 
                key={teamData.team.id}
                className="flex items-center gap-2 p-2 bg-[#1a2b1a] rounded border border-[#2d3d2d] opacity-60"
              >
                <TeamBadge
                  abbreviation={teamData.team.abbreviation}
                  primaryColor={teamData.team.primaryColor}
                  secondaryColor={teamData.team.secondaryColor}
                  size="sm"
                />
                <span className="text-xs text-gray-400 truncate">{teamData.team.abbreviation}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
