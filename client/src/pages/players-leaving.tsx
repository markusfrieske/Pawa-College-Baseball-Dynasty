import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { 
  ArrowLeft, 
  GraduationCap, 
  Trophy,
  ArrowRightLeft,
  Users,
  TrendingDown
} from "lucide-react";
import type { Player } from "@shared/schema";

interface TeamPlayersLeaving {
  teamId: string;
  teamName: string;
  mascot?: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  graduates: Player[];
  draftDeclarations: Player[];
  transfers: Player[];
  totalLeaving: number;
}

interface PlayersLeavingData {
  league: { id: string; name: string; currentSeason: number };
  teams: TeamPlayersLeaving[];
  totals: {
    graduates: number;
    draftDeclarations: number;
    transfers: number;
    total: number;
  };
}

function PlayerMiniCard({ player, reason }: { player: Player; reason: "graduate" | "draft" | "transfer" }) {
  const reasonIcon = {
    graduate: <GraduationCap className="w-3 h-3" />,
    draft: <Trophy className="w-3 h-3" />,
    transfer: <ArrowRightLeft className="w-3 h-3" />,
  };
  
  const reasonLabel = {
    graduate: "Graduating",
    draft: "Draft",
    transfer: "Portal",
  };

  const reasonColor = {
    graduate: "bg-blue-900/50 text-blue-300",
    draft: "bg-yellow-900/50 text-yellow-300",
    transfer: "bg-purple-900/50 text-purple-300",
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-[#1a2b1a] rounded border border-[#2d3d2d]">
      <PlayerPortrait
        skinTone={player.skinTone}
        hairColor={player.hairColor}
        hairStyle={player.hairStyle}
        facialHair={player.facialHair || "none"}
        eyeStyle={player.eyeStyle || undefined}
        eyebrowStyle={player.eyebrowStyle || undefined}
        mouthStyle={player.mouthStyle || undefined}
        eyeBlack={player.eyeBlack ?? undefined}
        playerId={player.id}
        className="w-8 h-8"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <PositionBadge position={player.position} size="sm" />
          <span className="text-xs text-white truncate">
            {player.firstName} {player.lastName}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>{player.overall} OVR</span>
          <span className="text-[#C4A35A]">{"★".repeat(player.starRating)}</span>
        </div>
      </div>
      <Badge className={`text-[10px] ${reasonColor[reason]} border-0`}>
        <span className="flex items-center gap-1">
          {reasonIcon[reason]}
          {reasonLabel[reason]}
        </span>
      </Badge>
    </div>
  );
}

function TeamLeavingCard({ teamData }: { teamData: TeamPlayersLeaving }) {
  if (teamData.totalLeaving === 0) {
    return null;
  }

  return (
    <RetroCard className="h-fit">
      <RetroCardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TeamBadge
            abbreviation={teamData.abbreviation}
            primaryColor={teamData.primaryColor}
            secondaryColor={teamData.secondaryColor}
            name={teamData.teamName}
           
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-['Press_Start_2P'] text-xs text-[#C4A35A] truncate">
              {teamData.teamName}
            </h3>
            <p className="text-xs text-gray-400">
              {teamData.totalLeaving} player{teamData.totalLeaving !== 1 ? 's' : ''} leaving
            </p>
          </div>
        </div>
      </RetroCardHeader>
      <RetroCardContent className="space-y-2">
        {teamData.graduates.map(player => (
          <PlayerMiniCard key={player.id} player={player} reason="graduate" />
        ))}
        {teamData.draftDeclarations.map(player => (
          <PlayerMiniCard key={player.id} player={player} reason="draft" />
        ))}
        {teamData.transfers.map(player => (
          <PlayerMiniCard key={player.id} player={player} reason="transfer" />
        ))}
      </RetroCardContent>
    </RetroCard>
  );
}

export default function PlayersLeavingPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<PlayersLeavingData>({
    queryKey: [`/api/leagues/${id}/players-leaving`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a2b1a] p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-[#243524]" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-48 bg-[#243524]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#1a2b1a] flex items-center justify-center">
        <p className="text-gray-400">Failed to load data</p>
      </div>
    );
  }

  const teamsWithLeavingPlayers = data.teams.filter(t => t.totalLeaving > 0);

  return (
    <div className="min-h-screen bg-[#1a2b1a] p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href={`/league/${id}`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to League
            </RetroButton>
          </Link>
          <div className="flex-1">
            <h1 className="font-['Press_Start_2P'] text-lg sm:text-xl text-[#C4A35A]">
              Players Leaving
            </h1>
            <p className="text-sm text-gray-400">
              Season {data.league.currentSeason} - {data.league.name}
            </p>
          </div>
          <Link href={`/league/${id}/transfer-portal`}>
            <RetroButton variant="primary" size="sm" data-testid="link-transfer-portal">
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer Portal
            </RetroButton>
          </Link>
        </div>

        <RetroCard>
          <RetroCardContent className="py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-blue-400">
                  <GraduationCap className="w-5 h-5" />
                  <span className="font-['Press_Start_2P'] text-lg">{data.totals.graduates}</span>
                </div>
                <p className="text-xs text-gray-400">Graduating</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-yellow-400">
                  <Trophy className="w-5 h-5" />
                  <span className="font-['Press_Start_2P'] text-lg">{data.totals.draftDeclarations}</span>
                </div>
                <p className="text-xs text-gray-400">Draft Declarations</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-purple-400">
                  <ArrowRightLeft className="w-5 h-5" />
                  <span className="font-['Press_Start_2P'] text-lg">{data.totals.transfers}</span>
                </div>
                <p className="text-xs text-gray-400">Transfer Portal</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-red-400">
                  <TrendingDown className="w-5 h-5" />
                  <span className="font-['Press_Start_2P'] text-lg">{data.totals.total}</span>
                </div>
                <p className="text-xs text-gray-400">Total Leaving</p>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        {teamsWithLeavingPlayers.length === 0 ? (
          <RetroCard>
            <RetroCardContent className="py-12 text-center">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No players leaving at this time</p>
            </RetroCardContent>
          </RetroCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamsWithLeavingPlayers.map(teamData => (
              <TeamLeavingCard key={teamData.teamId} teamData={teamData} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
