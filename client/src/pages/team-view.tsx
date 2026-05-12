import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { AttributeSlider } from "@/components/ui/attribute-slider";
import { StarRating } from "@/components/ui/star-rating";
import { CoachAvatar } from "@/components/coach-avatar";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  MapPin, 
  Trophy,
  Users,
  Star,
  DollarSign,
  GraduationCap,
  Building2,
  Calendar,
  History,
  TrendingUp,
  Award,
  ChevronDown,
  Eye,
  Edit
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetroInput } from "@/components/ui/retro-input";
import type { Team, Coach, Player, Game } from "@shared/schema";
import { isPitcher, isHitter, isCatcher, isInfielder, isOutfielder } from "@shared/positions";

interface GameWithTeams extends Game {
  homeTeam?: { name: string; abbreviation: string };
  awayTeam?: { name: string; abbreviation: string };
}

interface TeamDetails extends Team {
  coach?: Coach;
  players?: Player[];
  games?: GameWithTeams[];
  record?: { wins: number; losses: number; conferenceWins: number; conferenceLosses: number };
}

interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  coach?: { firstName: string; lastName: string } | null;
}

interface League {
  id: string;
  commissionerId: string;
}

export default function TeamViewPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const [, setLocation] = useLocation();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: team, isLoading } = useQuery<TeamDetails>({
    queryKey: ["/api/leagues", id, "teams", teamId],
  });
  
  const { data: leagueData } = useQuery<{ teams: LeagueTeam[]; commissionerId?: string }>({
    queryKey: ["/api/leagues", id],
  });
  
  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });
  
  const isCommissioner = authData?.id && leagueData?.commissionerId === authData.id;
  
  const updatePlayerMutation = useMutation({
    mutationFn: async (updates: Partial<Player> & { id: string }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/players/${updates.id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Player updated", description: "Player data has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "teams", teamId] });
      setEditingPlayer(null);
      setSelectedPlayer(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update player", variant: "destructive" });
    },
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
            <RetroButton>Back to Dynasty</RetroButton>
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

          <div className="flex items-center justify-between">
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
            
            {leagueData?.teams && leagueData.teams.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">View Team:</span>
                <select
                  value={teamId}
                  onChange={(e) => setLocation(`/league/${id}/team/${e.target.value}`)}
                  className="bg-background border border-gold/50 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold max-w-[280px]"
                  data-testid="select-view-team"
                >
                  {leagueData.teams
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(t => (
                    <option key={t.id} value={t.id} className="bg-background text-foreground py-1">
                      {t.name} ({t.abbreviation})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="bg-card border border-border flex-wrap gap-1">
            <TabsTrigger value="summary" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Summary
            </TabsTrigger>
            <TabsTrigger value="schedule" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Schedule
            </TabsTrigger>
            <TabsTrigger value="roster" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Roster
            </TabsTrigger>
            <TabsTrigger value="coaches" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Coaches
            </TabsTrigger>
            <TabsTrigger value="school" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              School
            </TabsTrigger>
            <TabsTrigger value="history" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryTab team={team} leagueId={id!} />
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleTab team={team} leagueId={id!} />
          </TabsContent>

          <TabsContent value="roster">
            <RosterTab team={team} onSelectPlayer={setSelectedPlayer} />
          </TabsContent>

          <TabsContent value="coaches">
            <CoachesTab team={team} />
          </TabsContent>

          <TabsContent value="school">
            <SchoolTab team={team} />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab team={team} />
          </TabsContent>
        </Tabs>
      </main>

      {selectedPlayer && (
        <PlayerProfileCard
          player={{
            ...selectedPlayer,
            bats: (selectedPlayer as Player & { batHand?: string }).batHand,
            throws: (selectedPlayer as Player & { throwHand?: string }).throwHand,
          }}
          open={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          isCommissioner={!!isCommissioner}
          onEdit={() => {
            setEditingPlayer(selectedPlayer);
            setSelectedPlayer(null);
          }}
          leagueId={id}
        />
      )}
      
      {editingPlayer && (
        <PlayerEditModal
          player={editingPlayer}
          open={!!editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSave={(updates) => updatePlayerMutation.mutate({ ...updates, id: editingPlayer.id })}
          isSaving={updatePlayerMutation.isPending}
        />
      )}
    </div>
  );
}

function SummaryTab({ team, leagueId }: { team: TeamDetails; leagueId: string }) {
  const players = team.players || [];
  const impactPlayers = [...players]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 5);
  
  const pitchers = players.filter(p => isPitcher(p.position));
  const hitters = players.filter(p => isHitter(p.position));
  
  const avgPitching = pitchers.length > 0 
    ? Math.round(pitchers.reduce((sum, p) => sum + p.overall, 0) / pitchers.length) 
    : 0;
  const avgHitting = hitters.length > 0 
    ? Math.round(hitters.reduce((sum, p) => sum + p.overall, 0) / hitters.length) 
    : 0;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <RetroCard>
          <RetroCardHeader>Team Statistics</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatBox label="Record" value={`${team.record?.wins || 0}-${team.record?.losses || 0}`} color="gold" />
              <StatBox label="Conf Record" value={`${team.record?.conferenceWins || 0}-${team.record?.conferenceLosses || 0}`} color="blue" />
              <StatBox label="Roster Size" value={players.length.toString()} color="green" />
              <StatBox label="Prestige" value={`${team.prestige}/10`} color="purple" />
            </div>
            
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Offensive Talent</h4>
                <AttributeSlider label="" value={avgHitting} max={999} disabled showValue={false} />
                <p className="text-xl font-bold text-gold mt-1">{avgHitting}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Pitching Talent</h4>
                <AttributeSlider label="" value={avgPitching} max={999} disabled showValue={false} />
                <p className="text-xl font-bold text-gold mt-1">{avgPitching}</p>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>Impact Players</span>
            <Link href={`/league/${leagueId}/roster`}>
              <span className="text-gold text-[8px] hover:underline cursor-pointer">View Full Roster</span>
            </Link>
          </RetroCardHeader>
          <RetroCardContent>
            {impactPlayers.length > 0 ? (
              <div className="space-y-3">
                {impactPlayers.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-3 p-2 bg-background/50 rounded">
                    <span className="text-gold font-bold w-6 text-center">#{idx + 1}</span>
                    <PlayerAvatar 
                      skinTone={player.skinTone || "medium"}
                      hairColor={player.hairColor || "brown"}
                      hairStyle={player.hairStyle || "short"}
                      facialHair={player.facialHair || "none"}
                      eyeStyle={player.eyeStyle || undefined}
                      eyebrowStyle={player.eyebrowStyle || undefined}
                      mouthStyle={player.mouthStyle || undefined}
                      eyeBlack={player.eyeBlack ?? undefined}
                      playerId={player.id}
                      headwear="none"
                      size="sm"
                      jerseyColor={team.primaryColor}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{player.firstName} {player.lastName}</p>
                      <p className="text-xs text-muted-foreground">{player.position} - {player.eligibility}</p>
                    </div>
                    <div className="text-right">
                      <StarRating rating={getStarRating(player.overall)} size="sm" />
                      <p className="text-xs text-muted-foreground">{player.overall} OVR</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No players on roster yet</p>
            )}
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
                teamPrimaryColor={team.primaryColor}
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
                <div className="p-2 bg-emerald-500/20 rounded">
                  <p className="font-bold text-emerald-400">{team.coach.scoutingSkill}</p>
                  <p className="text-xs text-muted-foreground">Scouting</p>
                </div>
                <div className="p-2 bg-blue-500/20 rounded">
                  <p className="font-bold text-blue-400">{team.coach.evaluationSkill}</p>
                  <p className="text-xs text-muted-foreground">Evaluation</p>
                </div>
                <div className="p-2 bg-amber-500/20 rounded">
                  <p className="font-bold text-amber-400">{team.coach.pitchingRecruitingSkill}</p>
                  <p className="text-xs text-muted-foreground">Pitching</p>
                </div>
                <div className="p-2 bg-red-500/20 rounded">
                  <p className="font-bold text-red-400">{team.coach.hittingRecruitingSkill}</p>
                  <p className="text-xs text-muted-foreground">Hitting</p>
                </div>
              </div>
              <Link href={`/coach/${team.coach.id}`} className="mt-3 block">
                <RetroButton variant="outline" size="sm" className="w-full" data-testid="button-view-coach">
                  View Full Profile
                </RetroButton>
              </Link>
            </RetroCardContent>
          </RetroCard>
        )}

        <RetroCard>
          <RetroCardHeader>Roster Breakdown</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-3">
              <RosterBreakdownRow label="Pitchers" count={pitchers.length} total={players.length} />
              <RosterBreakdownRow label="Catchers" count={players.filter(p => isCatcher(p.position)).length} total={players.length} />
              <RosterBreakdownRow label="Infielders" count={players.filter(p => isInfielder(p.position)).length} total={players.length} />
              <RosterBreakdownRow label="Outfielders" count={players.filter(p => isOutfielder(p.position)).length} total={players.length} />
            </div>
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>Quick Links</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-2">
              <Link href={`/league/${leagueId}/roster`}>
                <RetroButton variant="outline" size="sm" className="w-full justify-start" data-testid="link-roster">
                  <Users className="w-4 h-4 mr-2" /> View Full Roster
                </RetroButton>
              </Link>
              <Link href={`/league/${leagueId}/recruiting`}>
                <RetroButton variant="outline" size="sm" className="w-full justify-start" data-testid="link-recruiting">
                  <TrendingUp className="w-4 h-4 mr-2" /> Recruiting Board
                </RetroButton>
              </Link>
              <Link href={`/league/${leagueId}/schedule`}>
                <RetroButton variant="outline" size="sm" className="w-full justify-start" data-testid="link-schedule">
                  <Calendar className="w-4 h-4 mr-2" /> View Schedule
                </RetroButton>
              </Link>
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    gold: "bg-gold/20 text-gold",
    blue: "bg-blue-500/20 text-blue-400",
    green: "bg-green-500/20 text-green-400",
    purple: "bg-purple-500/20 text-purple-400",
  };
  
  return (
    <div className={`p-3 rounded ${colorClasses[color] || colorClasses.gold}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function RosterBreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span>{count}</span>
      </div>
      <div className="h-2 bg-background rounded overflow-hidden">
        <div 
          className="h-full bg-gold rounded transition-all duration-300" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function getStarRating(overall: number): number {
  if (overall >= 500) return 5;
  if (overall >= 400) return 4;
  if (overall >= 300) return 3;
  if (overall >= 200) return 2;
  return 1;
}

function ScheduleTab({ team, leagueId }: { team: TeamDetails; leagueId: string }) {
  const games = team.games || [];
  
  const getOpponentInfo = (game: GameWithTeams) => {
    const isHome = game.homeTeamId === team.id;
    const opponentTeam = isHome ? game.awayTeam : game.homeTeam;
    const prefix = isHome ? "vs" : "@";
    const opponentName = opponentTeam?.name || opponentTeam?.abbreviation || "TBD";
    return { prefix, opponentName };
  };

  const getGameResult = (game: GameWithTeams) => {
    if (game.homeScore === null || game.awayScore === null) return null;
    const isHome = game.homeTeamId === team.id;
    const ourScore = isHome ? game.homeScore : game.awayScore;
    const theirScore = isHome ? game.awayScore : game.homeScore;
    const won = ourScore > theirScore;
    return { ourScore, theirScore, won };
  };
  
  return (
    <RetroCard>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <span>Season Schedule</span>
        <Link href={`/league/${leagueId}/schedule`}>
          <span className="text-gold text-[8px] hover:underline cursor-pointer">Full Schedule</span>
        </Link>
      </RetroCardHeader>
      <RetroCardContent>
        {games.length > 0 ? (
          <div className="space-y-2">
            {games.map((game) => {
              const { prefix, opponentName } = getOpponentInfo(game);
              const result = getGameResult(game);
              
              return (
                <div key={game.id} className="flex items-center gap-3 p-3 bg-background/50 rounded">
                  <div className="flex-1">
                    <p className="font-medium">Week {game.week}</p>
                    <p className="text-xs text-muted-foreground">
                      {prefix} {opponentName}
                    </p>
                  </div>
                  <div className="text-right">
                    {result ? (
                      <div>
                        <Badge 
                          variant="outline" 
                          className={result.won ? "text-green-400 border-green-400" : "text-red-400 border-red-400"}
                        >
                          {result.won ? "W" : "L"}
                        </Badge>
                        <p className="text-sm font-medium mt-1">{result.ourScore} - {result.theirScore}</p>
                      </div>
                    ) : (
                      <Badge variant="outline">Upcoming</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No games scheduled yet</p>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function CoachesTab({ team }: { team: TeamDetails }) {
  const isCpuCoach = team.coach && !team.coach.userId;
  
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {team.coach ? (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              Head Coach
              {isCpuCoach && <Badge variant="outline" className="text-[8px]">CPU</Badge>}
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="flex items-start gap-4">
              <CoachAvatar
                skinTone={team.coach.skinTone}
                hairColor={team.coach.hairColor}
                hairStyle={team.coach.hairStyle}
                size="lg"
                teamPrimaryColor={team.primaryColor}
              />
              <div className="flex-1">
                <h3 className="font-medium text-lg mb-1">
                  {team.coach.firstName} {team.coach.lastName}
                </h3>
                <Badge variant="outline" className="mb-3">
                  {team.coach.archetype}
                </Badge>
                <p className="text-sm text-muted-foreground mb-4">
                  Level {team.coach.level} - {team.coach.xp.toLocaleString()} XP
                </p>
                
                <div className="space-y-2">
                  <AttributeSlider label="Scouting" value={team.coach.scoutingSkill} max={4} disabled />
                  <AttributeSlider label="Evaluation" value={team.coach.evaluationSkill} max={4} disabled />
                  <AttributeSlider label="Pitching" value={team.coach.pitchingRecruitingSkill} max={4} disabled />
                  <AttributeSlider label="Hitting" value={team.coach.hittingRecruitingSkill} max={4} disabled />
                </div>
                <Link href={`/coach/${team.coach.id}`} className="mt-3 block">
                  <RetroButton variant="outline" size="sm" className="w-full" data-testid="button-view-coach-full">
                    View Full Profile
                  </RetroButton>
                </Link>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      ) : (
        <RetroCard>
          <RetroCardContent className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No coach assigned</p>
          </RetroCardContent>
        </RetroCard>
      )}
      
      {team.coach ? (
        <RetroCard>
          <RetroCardHeader>Career Stats</RetroCardHeader>
          <RetroCardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">Career Record</p>
                <p className="font-bold text-lg">{team.coach.careerWins}-{team.coach.careerLosses}</p>
              </div>
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">Conf Record</p>
                <p className="font-bold text-lg">{team.coach.confWins}-{team.coach.confLosses}</p>
              </div>
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">Conf Titles</p>
                <p className="font-bold text-lg text-gold">{team.coach.confChampionships}</p>
              </div>
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">CWS Apps</p>
                <p className="font-bold text-lg text-gold">{team.coach.cwsAppearances}</p>
              </div>
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">Nat'l Titles</p>
                <p className="font-bold text-lg text-gold">{team.coach.nationalChampionships}</p>
              </div>
              <div className="p-2 bg-background/50 rounded text-center">
                <p className="text-xs text-muted-foreground">Draft Picks</p>
                <p className="font-bold text-lg">{team.coach.draftPicks}</p>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      ) : (
        <RetroCard>
          <RetroCardHeader>Career Stats</RetroCardHeader>
          <RetroCardContent className="text-center py-12">
            <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No coach assigned</p>
          </RetroCardContent>
        </RetroCard>
      )}

      {/* Scout Director Section */}
      <RetroCard className="md:col-span-2">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            Scout Director
            <Badge variant="outline" className="text-[8px] bg-gold/10 text-gold border-gold">Coming Soon</Badge>
          </div>
        </RetroCardHeader>
        <RetroCardContent className="text-center py-12">
          <Eye className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-2">Scout Director system coming soon</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Hire and manage scouts with unique perks and skills to help you evaluate recruits faster and more accurately.
          </p>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function SchoolTab({ team }: { team: TeamDetails }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <RetroCard>
        <RetroCardHeader>School Information</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-4">
            <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={`${team.city}, ${team.state}`} />
            <InfoRow icon={<Users className="w-4 h-4" />} label="Enrollment" value={team.enrollment.toLocaleString()} />
            <InfoRow icon={<Trophy className="w-4 h-4" />} label="Prestige" value={`${team.prestige}/10`} />
            <InfoRow icon={<Star className="w-4 h-4" />} label="Fanbase Passion" value={team.fanbasePassion} />
            <InfoRow icon={<DollarSign className="w-4 h-4" />} label="NIL Budget" value={`$${(team.nilBudget / 1000000).toFixed(1)}M`} />
            <InfoRow icon={<Building2 className="w-4 h-4" />} label="Fanbase Type" value={team.fanbaseType} />
          </div>
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader>Facilities</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-4">
            <AttributeSlider label="Stadium" value={team.stadium} max={10} disabled />
            <AttributeSlider label="Training Facilities" value={team.facilities} max={10} disabled />
            <AttributeSlider label="College Life" value={team.collegeLife} max={10} disabled />
            <AttributeSlider label="Marketing" value={team.marketing} max={10} disabled />
            <AttributeSlider label="Academics" value={team.academics} max={10} disabled />
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function HistoryTab({ team }: { team: TeamDetails }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <RetroCard>
        <RetroCardHeader>Season History</RetroCardHeader>
        <RetroCardContent className="text-center py-12">
          <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Season history will appear here after completing seasons</p>
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader>Program Achievements</RetroCardHeader>
        <RetroCardContent className="text-center py-12">
          <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Championships and awards will be tracked here</p>
        </RetroCardContent>
      </RetroCard>
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

function RosterTab({ team, onSelectPlayer }: { team: TeamDetails; onSelectPlayer: (player: Player) => void }) {
  const players = team.players || [];

  const pitchers = players.filter(p => p.position === "P").sort((a, b) => b.overall - a.overall);
  const catchers = players.filter(p => p.position === "C").sort((a, b) => b.overall - a.overall);
  const infielders = players.filter(p => ["1B", "2B", "SS", "3B"].includes(p.position)).sort((a, b) => b.overall - a.overall);
  const outfielders = players.filter(p => ["LF", "CF", "RF"].includes(p.position)).sort((a, b) => b.overall - a.overall);

  const positionGroups = [
    { label: "Pitchers", players: pitchers },
    { label: "Catchers", players: catchers },
    { label: "Infielders", players: infielders },
    { label: "Outfielders", players: outfielders },
  ];

  return (
    <div className="space-y-4">
      {positionGroups.map(group => (
        <RetroCard key={group.label}>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>{group.label}</span>
            <span className="text-muted-foreground text-[8px]">{group.players.length} Players</span>
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
                  <th className="text-center py-3 px-2">Rank</th>
                  <th className="text-center py-3 px-2">B/T</th>
                  <th className="text-left py-3 px-2 hidden sm:table-cell">Hometown</th>
                </tr>
              </thead>
              <tbody>
                {group.players.map((player) => (
                  <tr 
                    key={player.id} 
                    className="border-b border-border/50 hover:bg-card/50 cursor-pointer transition-colors"
                    onClick={() => onSelectPlayer(player)}
                    data-testid={`row-player-${player.id}`}
                  >
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
                      <span className={`font-pixel text-[10px] ${
                        player.starRating >= 4
                          ? "text-gold"
                          : player.starRating >= 3
                          ? "text-blue-400"
                          : "text-muted-foreground"
                      }`}>
                        {"★".repeat(player.starRating || 1)}
                      </span>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-${player.id}`}>
                        B:{player.batHand || "R"} T:{player.throwHand || "R"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">
                      {player.hometown}, {player.homeState}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCard>
      ))}

      {players.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No players on roster yet</p>
        </div>
      )}
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

interface PlayerEditModalProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Player>) => void;
  isSaving: boolean;
}

function PlayerEditModal({ player, open, onClose, onSave, isSaving }: PlayerEditModalProps) {
  const [formData, setFormData] = useState({
    overall: player.overall,
    starRating: player.starRating,
    hitForAvg: player.hitForAvg || 50,
    power: player.power || 50,
    speed: player.speed || 50,
    arm: player.arm || 50,
    fielding: player.fielding || 50,
    errorResistance: player.errorResistance || 50,
    velocity: player.velocity || 50,
    control: player.control || 50,
    stamina: player.stamina || 50,
  });

  const isPlayerPitcher = isPitcher(player.position);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit Player: {player.firstName} {player.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Overall (1-999)</label>
              <RetroInput
                type="number"
                min={1}
                max={999}
                value={formData.overall}
                onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 1 })}
                data-testid="input-overall"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Star Rating (1-5)</label>
              <RetroInput
                type="number"
                min={1}
                max={5}
                value={formData.starRating}
                onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) || 1 })}
                data-testid="input-star-rating"
              />
            </div>
          </div>

          {isPlayerPitcher ? (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Velocity</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.velocity}
                    onChange={(e) => setFormData({ ...formData, velocity: parseInt(e.target.value) || 50 })}
                    data-testid="input-velocity"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Control</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.control}
                    onChange={(e) => setFormData({ ...formData, control: parseInt(e.target.value) || 50 })}
                    data-testid="input-control"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Stamina</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.stamina}
                    onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) || 50 })}
                    data-testid="input-stamina"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Contact</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.hitForAvg}
                    onChange={(e) => setFormData({ ...formData, hitForAvg: parseInt(e.target.value) || 50 })}
                    data-testid="input-contact"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Power</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.power}
                    onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 50 })}
                    data-testid="input-power"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Speed</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.speed}
                    onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 50 })}
                    data-testid="input-speed"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Arm</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.arm}
                    onChange={(e) => setFormData({ ...formData, arm: parseInt(e.target.value) || 50 })}
                    data-testid="input-arm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fielding</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.fielding}
                    onChange={(e) => setFormData({ ...formData, fielding: parseInt(e.target.value) || 50 })}
                    data-testid="input-fielding"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Error Resist</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.errorResistance}
                    onChange={(e) => setFormData({ ...formData, errorResistance: parseInt(e.target.value) || 50 })}
                    data-testid="input-error-resist"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <RetroButton variant="outline" onClick={onClose} data-testid="button-cancel-edit">
              Cancel
            </RetroButton>
            <RetroButton onClick={handleSubmit} disabled={isSaving} data-testid="button-save-player">
              {isSaving ? "Saving..." : "Save Changes"}
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
