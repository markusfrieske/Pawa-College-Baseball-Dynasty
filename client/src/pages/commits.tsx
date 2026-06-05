import { useState } from "react";
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
  MapPin,
  History,
  Sparkles,
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
  avgOverall: number;
  fiveStars: number;
  fourStars: number;
  classScore: number;
  classRank: number;
}

interface CommitsData {
  league: { id: string; name: string; currentSeason: number; currentPhase?: string };
  commitsByTeam: TeamCommits[];
  totalCommits: number;
  totalRecruits: number;
}

interface SnapshotEntry {
  id: string;
  leagueId: string;
  season: number;
  teamId: string;
  classRank: number;
  classScore: number;
  totalCommits: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStars: number;
  avgOverall: number;
  avgStarRating: number;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  teamSecondaryColor: string;
  isCpu: boolean;
}

interface ClassRankingsData {
  bySeason: Record<number, SnapshotEntry[]>;
  availableSeasons: number[];
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
          <Badge variant="outline" className="text-xs px-1 py-0 h-4">
            {commit.recruitType}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{commit.overall} OVR</span>
          <StarRating rating={commit.starRating} size="sm" />
        </div>
      </div>
      <div className="text-right text-xs text-gray-400">
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
  const { team, commits, avgStarRating, avgOverall, fiveStars, fourStars, classRank } = teamData;

  return (
    <RetroCard className="h-fit">
      <RetroCardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {classRank > 0 && (
            <div className={`flex items-center justify-center w-8 h-8 rounded font-pixel text-sm ${classRank <= 3 ? "bg-gold/20 text-gold" : "bg-[#2d3d2d] text-gray-400"}`}>
              #{classRank}
            </div>
          )}
          <TeamBadge
            abbreviation={team.abbreviation}
            primaryColor={team.primaryColor}
            secondaryColor={team.secondaryColor}
            name={team.name}
            size="sm"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-sm text-[#C4A35A]">{team.name}</span>
              {team.isCpu && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">CPU</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {commits.length} commit{commits.length !== 1 ? "s" : ""}
              </span>
              {commits.length > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <StarRating rating={Math.round(avgStarRating)} size="sm" />
                    {avgStarRating.toFixed(1)} avg
                  </span>
                  <span>{Math.round(avgOverall)} avg OVR</span>
                  {fiveStars > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-gold/50 text-gold">{fiveStars}x 5-Star</Badge>}
                  {fourStars > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-blue-400/50 text-blue-400">{fourStars}x 4+Star</Badge>}
                </>
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

function PastClassesSection({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<ClassRankingsData>({
    queryKey: ["/api/leagues", leagueId, "class-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/class-rankings`);
      if (!res.ok) throw new Error("Failed to fetch class rankings");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-48" />;
  if (!data || data.availableSeasons.length === 0) return null;

  const activeSeason = selectedSeason ?? data.availableSeasons[0];
  const snapshots = data.bySeason[activeSeason] ?? [];

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-[#C4A35A]" />
          <h2 className="font-pixel text-sm text-[#C4A35A]">PAST CLASS RANKINGS</h2>
        </div>
        {data.availableSeasons.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {data.availableSeasons.map(s => (
              <RetroButton
                key={s}
                variant={activeSeason === s ? "primary" : "outline"}
                size="sm"
                onClick={() => setSelectedSeason(s)}
                data-testid={`past-class-season-${s}`}
              >
                S{s}
              </RetroButton>
            ))}
          </div>
        )}
      </div>

      {snapshots.length === 0 ? (
        <p className="text-xs text-gray-500">No class data for season {activeSeason}.</p>
      ) : (
        <RetroCard>
          <RetroCardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-past-classes">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">#</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-gold">Team</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">Commits</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">5★</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">4★+</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">3★</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">Avg OVR</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">Avg Stars</th>
                    <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap, idx) => (
                    <tr
                      key={snap.teamId}
                      className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                      data-testid={`row-past-class-${snap.teamAbbr}`}
                    >
                      <td className="py-2 px-2 text-center">
                        <span className={`font-pixel text-[9px] ${snap.classRank === 1 ? "text-gold" : snap.classRank <= 3 ? "text-yellow-400" : "text-muted-foreground"}`}>
                          #{snap.classRank}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: snap.teamColor }} />
                          <span className="font-pixel text-[8px]">{snap.teamAbbr}</span>
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{snap.teamName}</span>
                          {!snap.isCpu && <Badge variant="outline" className="text-[7px] px-1 py-0 h-3">You</Badge>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center text-xs font-medium">{snap.totalCommits}</td>
                      <td className="py-2 px-2 text-center text-xs text-gold">{snap.fiveStars || 0}</td>
                      <td className="py-2 px-2 text-center text-xs">{snap.fourStars || 0}</td>
                      <td className="py-2 px-2 text-center text-xs">{snap.threeStars || 0}</td>
                      <td className="py-2 px-2 text-center text-xs">{Math.round(snap.avgOverall)}</td>
                      <td className="py-2 px-2 text-center text-xs">{snap.avgStarRating.toFixed(1)}</td>
                      <td className="py-2 px-2 text-center text-xs font-medium text-gold">{snap.classScore.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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
        {data.totalCommits > 0 && data.league.currentPhase === "offseason_signing_day" && (
          <Link href={`/league/${leagueId}/signing-day-reveal`}>
            <RetroButton variant="primary" size="sm" data-testid="button-view-class-reveal">
              <Sparkles className="w-4 h-4 mr-2" />
              View Class Reveal
            </RetroButton>
          </Link>
        )}
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
        <h2 className="font-pixel text-sm text-[#C4A35A] mb-2">CLASS RANKINGS</h2>
        <p className="text-xs text-gray-400">Teams ranked by recruiting class quality (star ratings, overall, and depth)</p>
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
                  name={teamData.team.name}
                  size="sm"
                />
                <span className="text-xs text-gray-400 truncate">{teamData.team.abbreviation}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <PastClassesSection leagueId={leagueId!} />
    </div>
  );
}
