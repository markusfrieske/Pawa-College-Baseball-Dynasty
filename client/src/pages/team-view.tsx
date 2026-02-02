import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { AttributeSlider } from "@/components/ui/attribute-slider";
import { StarRating } from "@/components/ui/star-rating";
import { CoachAvatar } from "@/components/coach-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  MapPin, 
  Trophy,
  Users,
  Star,
  DollarSign,
  GraduationCap,
  Building2
} from "lucide-react";
import type { Team, Coach, Player } from "@shared/schema";

interface TeamDetails extends Team {
  coach?: Coach;
  players?: Player[];
}

export default function TeamViewPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();

  const { data: team, isLoading } = useQuery<TeamDetails>({
    queryKey: ["/api/leagues", id, "teams", teamId],
  });

  if (isLoading) {
    return <TeamViewSkeleton />;
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8">
          <h2 className="font-pixel text-gold text-sm mb-4">Team Not Found</h2>
          <Link href={`/league/${id}`}>
            <RetroButton>Back to League</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <TeamBadge
              abbreviation={team.abbreviation}
              primaryColor={team.primaryColor}
              secondaryColor={team.secondaryColor}
              size="lg"
            />
            <div>
              <h1 className="font-pixel text-gold text-xl mb-1">
                {team.name} {team.mascot}
              </h1>
              <p className="text-muted-foreground flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {team.city}, {team.state}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-navy-dark">
              Overview
            </TabsTrigger>
            <TabsTrigger value="roster" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-navy-dark">
              Roster
            </TabsTrigger>
            <TabsTrigger value="facilities" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-navy-dark">
              Facilities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab team={team} />
          </TabsContent>

          <TabsContent value="roster">
            <RosterTab team={team} />
          </TabsContent>

          <TabsContent value="facilities">
            <FacilitiesTab team={team} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OverviewTab({ team }: { team: TeamDetails }) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <RetroCard>
          <RetroCardHeader>School Information</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <InfoRow icon={<Trophy className="w-4 h-4" />} label="Prestige" value={`${team.prestige}/10`} />
                <InfoRow icon={<Users className="w-4 h-4" />} label="Enrollment" value={team.enrollment.toLocaleString()} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={`${team.city}, ${team.state}`} />
              </div>
              <div className="space-y-4">
                <InfoRow icon={<Star className="w-4 h-4" />} label="Fanbase Passion" value={team.fanbasePassion} />
                <InfoRow icon={<DollarSign className="w-4 h-4" />} label="NIL Budget" value={`$${(team.nilBudget / 1000000).toFixed(1)}M`} />
                <InfoRow icon={<Building2 className="w-4 h-4" />} label="Fanbase Type" value={team.fanbaseType} />
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>School Attributes</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              <AttributeSlider label="Stadium" value={team.stadium} max={10} disabled />
              <AttributeSlider label="Facilities" value={team.facilities} max={10} disabled />
              <AttributeSlider label="College Life" value={team.collegeLife} max={10} disabled />
              <AttributeSlider label="Marketing" value={team.marketing} max={10} disabled />
              <AttributeSlider label="Academics" value={team.academics} max={10} disabled />
              <AttributeSlider label="Prestige" value={team.prestige} max={10} disabled />
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>

      <div className="space-y-6">
        {team.coach && (
          <RetroCard>
            <RetroCardHeader>Head Coach</RetroCardHeader>
            <RetroCardContent className="text-center">
              <CoachAvatar
                skinTone={team.coach.skinTone}
                hairColor={team.coach.hairColor}
                hairStyle={team.coach.hairStyle}
                size="lg"
                className="mx-auto mb-4"
              />
              <h3 className="font-medium text-foreground mb-1">
                {team.coach.firstName} {team.coach.lastName}
              </h3>
              <Badge variant="outline" className="mb-3">
                {team.coach.archetype}
              </Badge>
              <p className="text-sm text-muted-foreground mb-4">
                Level {team.coach.level}
              </p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-blue-500/20 rounded">
                  <p className="font-bold text-blue-400">{team.coach.offenseSkill}</p>
                  <p className="text-xs text-muted-foreground">Offense</p>
                </div>
                <div className="p-2 bg-green-500/20 rounded">
                  <p className="font-bold text-green-400">{team.coach.defenseSkill}</p>
                  <p className="text-xs text-muted-foreground">Defense</p>
                </div>
                <div className="p-2 bg-yellow-500/20 rounded">
                  <p className="font-bold text-yellow-400">{team.coach.trainingSkill}</p>
                  <p className="text-xs text-muted-foreground">Training</p>
                </div>
                <div className="p-2 bg-purple-500/20 rounded">
                  <p className="font-bold text-purple-400">{team.coach.recruitingSkill}</p>
                  <p className="text-xs text-muted-foreground">Recruiting</p>
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        <RetroCard>
          <RetroCardHeader>Quick Stats</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Roster Size</span>
                <span className="font-medium">{team.players?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Overall</span>
                <span className="font-medium">
                  {team.players && team.players.length > 0
                    ? Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length)
                    : "-"}
                </span>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-gold">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function RosterTab({ team }: { team: TeamDetails }) {
  const players = team.players || [];
  const positions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];

  const sortedPlayers = [...players].sort((a, b) => {
    const posA = positions.indexOf(a.position);
    const posB = positions.indexOf(b.position);
    if (posA !== posB) return posA - posB;
    return b.overall - a.overall;
  });

  return (
    <RetroCard>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <span>Roster</span>
        <span className="text-muted-foreground text-[8px]">{players.length} Players</span>
      </RetroCardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-3 px-2">#</th>
              <th className="text-left py-3 px-2">Name</th>
              <th className="text-center py-3 px-2">Pos</th>
              <th className="text-center py-3 px-2">Year</th>
              <th className="text-center py-3 px-2">OVR</th>
              <th className="text-center py-3 px-2">POT</th>
              <th className="text-left py-3 px-2 hidden sm:table-cell">Hometown</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => (
              <tr key={player.id} className="border-b border-border/50 hover:bg-card/50">
                <td className="py-3 px-2 text-muted-foreground">{player.jerseyNumber}</td>
                <td className="py-3 px-2 font-medium">
                  {player.firstName} {player.lastName}
                </td>
                <td className="text-center py-3 px-2">
                  <Badge variant="outline" className="text-[10px]">
                    {player.position}
                  </Badge>
                </td>
                <td className="text-center py-3 px-2 text-muted-foreground">
                  {player.eligibility}
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-bold text-gold">{player.overall}</span>
                </td>
                <td className="text-center py-3 px-2">
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      player.potential === "A+" || player.potential === "A"
                        ? "text-green-400 border-green-400"
                        : player.potential === "B+" || player.potential === "B"
                        ? "text-blue-400 border-blue-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {player.potential}
                  </Badge>
                </td>
                <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">
                  {player.hometown}, {player.homeState}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No players on roster yet</p>
        </div>
      )}
    </RetroCard>
  );
}

function FacilitiesTab({ team }: { team: TeamDetails }) {
  const facilities = [
    { name: "Stadium", level: team.stadium, description: "Home field advantage and atmosphere" },
    { name: "Training Facilities", level: team.facilities, description: "Player development bonus" },
    { name: "College Life", level: team.collegeLife, description: "Recruiting visits and camp invites" },
    { name: "Marketing", level: team.marketing, description: "NIL deal efficiency and poll bonuses" },
    { name: "Academics", level: team.academics, description: "Academic recruiting bonus" },
  ];

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {facilities.map((facility) => (
        <RetroCard key={facility.name}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-pixel text-[10px] text-gold">{facility.name}</h3>
            <span className="text-2xl font-bold">{facility.level}</span>
          </div>
          <AttributeSlider
            label=""
            value={facility.level}
            max={10}
            disabled
            showValue={false}
          />
          <p className="text-sm text-muted-foreground mt-3">{facility.description}</p>
        </RetroCard>
      ))}
    </div>
  );
}

function TeamViewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="flex items-center gap-6">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
