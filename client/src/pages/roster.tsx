import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroSelect } from "@/components/ui/retro-select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { 
  ArrowLeft, 
  Users, 
  Filter,
  Eye,
  GraduationCap,
  MapPin,
  Star
} from "lucide-react";
import type { Player, Team } from "@shared/schema";
import { isPitcher, isCatcher, isInfielder, isOutfielder } from "@shared/positions";

interface RosterData {
  players: Player[];
  team: Team;
}

const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitchers" },
  { value: "C", label: "Catchers" },
  { value: "IF", label: "Infielders" },
  { value: "OF", label: "Outfielders" },
];

const eligibilityOptions = [
  { value: "all", label: "All Years" },
  { value: "FR", label: "Freshman" },
  { value: "SO", label: "Sophomore" },
  { value: "JR", label: "Junior" },
  { value: "SR", label: "Senior" },
];

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");

  const { data, isLoading } = useQuery<RosterData>({
    queryKey: ["/api/leagues", id, "roster"],
  });

  const filteredPlayers = data?.players.filter(p => {
    if (positionFilter !== "all") {
      if (positionFilter === "IF" && !isInfielder(p.position)) return false;
      if (positionFilter === "OF" && !isOutfielder(p.position)) return false;
      if (positionFilter !== "IF" && positionFilter !== "OF" && p.position !== positionFilter) return false;
    }
    if (eligibilityFilter !== "all" && p.eligibility !== eligibilityFilter) return false;
    return true;
  }) || [];

  const groupPlayersByCategory = (players: Player[]) => {
    const pitchers = players.filter(p => isPitcher(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const catchers = players.filter(p => isCatcher(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const infielders = players.filter(p => isInfielder(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const outfielders = players.filter(p => isOutfielder(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    return { pitchers, catchers, infielders, outfielders };
  };

  const grouped = groupPlayersByCategory(filteredPlayers);
  const allSorted = [...filteredPlayers].sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);

  if (isLoading) {
    return <RosterSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">Roster</h1>
            <div className="ml-auto text-sm text-muted-foreground">
              {data?.players.length || 0} Players
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-40"
              data-testid="select-position-filter"
            />
            <RetroSelect
              options={eligibilityOptions}
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
              className="w-40"
              data-testid="select-eligibility-filter"
            />
            <span className="text-sm text-muted-foreground ml-auto">
              {filteredPlayers.length} players shown
            </span>
          </div>
        </RetroCard>

        {positionFilter === "all" ? (
          <>
            <PositionSection 
              title="Pitchers" 
              players={grouped.pitchers} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Catchers" 
              players={grouped.catchers} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Infielders" 
              players={grouped.infielders} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Outfielders" 
              players={grouped.outfielders} 
              onSelectPlayer={setSelectedPlayer}
            />
          </>
        ) : (
          <PositionSection 
            title={positionOptions.find(o => o.value === positionFilter)?.label || "Players"} 
            players={allSorted} 
            onSelectPlayer={setSelectedPlayer}
          />
        )}

        {filteredPlayers.length === 0 && (
          <RetroCard>
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No players match your filters</p>
            </div>
          </RetroCard>
        )}
      </main>

      {selectedPlayer && (
        <PlayerProfileCard
          player={{
            ...selectedPlayer,
            bats: selectedPlayer.batHand,
            throws: selectedPlayer.throwHand,
          }}
          open={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}


interface PositionSectionProps {
  title: string;
  players: Player[];
  onSelectPlayer: (player: Player) => void;
}

function PositionSection({ title, players, onSelectPlayer }: PositionSectionProps) {
  if (players.length === 0) return null;

  return (
    <RetroCard className="mb-4">
      <div className="px-4 py-2 bg-card/80 border-b border-border">
        <h3 className="font-pixel text-gold text-xs uppercase tracking-wider">
          {title} ({players.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-3 px-2">#</th>
              <th className="text-left py-3 px-2">Name</th>
              <th className="text-center py-3 px-2">Pos</th>
              <th className="text-center py-3 px-2">Year</th>
              <th className="text-center py-3 px-2">B/T</th>
              <th className="text-center py-3 px-2">
                <Star className="w-3 h-3 inline text-gold" />
              </th>
              <th className="text-left py-3 px-2 hidden lg:table-cell">Hometown</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr 
                key={player.id} 
                className="border-b border-border/50 hover:bg-card/50"
                data-testid={`row-player-${player.id}`}
              >
                <td className="py-3 px-2 text-muted-foreground font-mono">
                  {player.jerseyNumber}
                </td>
                <td className="py-3 px-2">
                  <button
                    onClick={() => onSelectPlayer(player)}
                    className="font-medium text-left hover:text-gold transition-colors cursor-pointer flex items-center gap-2"
                    data-testid={`link-player-${player.id}`}
                  >
                    <PlayerPortrait
                      skinTone={player.skinTone || "light"}
                      hairColor={player.hairColor || "brown"}
                      hairStyle={player.hairStyle || "short"}
                      className="w-8 h-8 flex-shrink-0"
                    />
                    {player.firstName} {player.lastName}
                  </button>
                </td>
                <td className="text-center py-3 px-2">
                  <PositionBadge position={player.position} size="sm" />
                </td>
                <td className="text-center py-3 px-2">
                  <Badge 
                    className={`text-[10px] ${
                      player.eligibility === "SR" ? "bg-red-500" :
                      player.eligibility === "JR" ? "bg-yellow-500" :
                      player.eligibility === "SO" ? "bg-green-500" :
                      "bg-blue-500"
                    } text-white`}
                  >
                    {player.eligibility}
                  </Badge>
                </td>
                <td className="text-center py-3 px-2 text-muted-foreground">
                  {player.batHand}/{player.throwHand}
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-bold text-gold">{player.overall}</span>
                </td>
                <td className="py-3 px-2 text-muted-foreground hidden lg:table-cell">
                  {player.hometown}, {player.homeState}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RetroCard>
  );
}

function RosterSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Skeleton className="h-16 mb-6" />
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
