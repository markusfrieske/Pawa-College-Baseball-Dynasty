import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PlayerProfileCard, Player } from "@/components/player-profile-card";
import {
  ArrowLeft,
  GraduationCap,
  Trophy,
  ArrowRightLeft,
  DollarSign,
  Handshake,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Target,
  TrendingUp,
  Users,
  ArrowUp,
  ArrowDown,
  PartyPopper,
} from "lucide-react";

interface DeparturePlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  overall: number;
  starRating: number;
  departureType: string;
  retentionStatus: string | null;
  draftAskMin: number | null;
  draftAskMax: number | null;
  nilOffered: number | null;
  transferReason: string | null;
  abilities: string[];
  teamId: string;
  draftRound: number | null;
  progressionDeltas?: Record<string, number> | null;
}

interface TeamDepartures {
  teamId: string;
  teamName: string;
  mascot?: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  isCpu: boolean;
  departuresFinalized: boolean;
  nilBudget: number;
  nilSpent: number;
  nilRemaining: number;
  rosterSize: number;
  graduates: DeparturePlayer[];
  draftDeclarations: DeparturePlayer[];
  transfers: DeparturePlayer[];
  promises: any[];
}

interface DeparturesData {
  league: { id: string; name: string; currentSeason: number; currentPhase: string };
  userTeamId: string | null;
  userTeam: TeamDepartures | null;
  allTeams: TeamDepartures[];
}

const PLAYER_PROMISE_OPTIONS = [
  { value: "startingRole", label: "Starting Role", description: "Promise them a starting position" },
  { value: "improvedStats", label: "Stat Improvement", description: "Promise they'll improve their stats" },
  { value: "leadershipRole", label: "Leadership Role", description: "Promise a team captain role" },
];

const TEAM_PROMISE_OPTIONS = [
  { value: "winPercentage", label: "Winning Record", description: "Promise a winning season" },
  { value: "conferenceChampionship", label: "Conference Title", description: "Promise a conference championship" },
  { value: "cwsChampionship", label: "CWS Championship", description: "Promise a CWS championship" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Modest", color: "text-green-400" },
  { value: "medium", label: "Ambitious", color: "text-yellow-400" },
  { value: "hard", label: "Bold", color: "text-red-400" },
];

export default function DeparturesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"myTeam" | "leagueWide" | "rosterPreview">("myTeam");
  const [draftRetainPlayer, setDraftRetainPlayer] = useState<DeparturePlayer | null>(null);
  const [transferRetainPlayer, setTransferRetainPlayer] = useState<DeparturePlayer | null>(null);
  const [nilOfferAmount, setNilOfferAmount] = useState<number>(0);
  const [selectedPlayerPromise, setSelectedPlayerPromise] = useState<string>("");
  const [playerPromiseDifficulty, setPlayerPromiseDifficulty] = useState<string>("easy");
  const [selectedTeamPromise, setSelectedTeamPromise] = useState<string>("");
  const [teamPromiseDifficulty, setTeamPromiseDifficulty] = useState<string>("easy");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [retentionResult, setRetentionResult] = useState<{ success: boolean; playerName: string; chance: number } | null>(null);
  const [viewPlayer, setViewPlayer] = useState<{ id: string; teamId: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: viewPlayerData } = useQuery<Player>({
    queryKey: ["/api/leagues", leagueId, "players", viewPlayer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/players/${viewPlayer!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!viewPlayer,
  });

  const { data: rosterData } = useQuery<{ players: Player[]; team: any }>({
    queryKey: ["/api/leagues", leagueId, "roster"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/roster`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load roster");
      return res.json();
    },
    enabled: !!leagueId && activeTab === "rosterPreview",
  });

  const { data, isLoading } = useQuery<DeparturesData>({
    queryKey: ["/api/leagues", leagueId, "departures"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/departures`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load departures");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const retainDraftMutation = useMutation({
    mutationFn: async ({ playerId, nilOffer }: { playerId: string; nilOffer: number }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/departures/retain-draft`, { playerId, nilOffer });
      return res.json();
    },
    onSuccess: (result) => {
      setRetentionResult({ success: result.success, playerName: result.playerName, chance: result.stayChance });
      setDraftRetainPlayer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "departures"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const retainTransferMutation = useMutation({
    mutationFn: async ({ playerId, nilOffer, playerPromise, teamPromise }: any) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/departures/retain-transfer`, {
        playerId,
        nilOffer,
        playerPromise: playerPromise || undefined,
        teamPromise: teamPromise || undefined,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setRetentionResult({ success: result.success, playerName: result.playerName, chance: result.retentionChance });
      setTransferRetainPlayer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "departures"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/departures/finalize`, {});
      return res.json();
    },
    onSuccess: (result) => {
      toast({ 
        title: "Departures Marked Ready", 
        description: result.allTeamsReady 
          ? "All coaches are ready! The commissioner can now advance to recruiting." 
          : `You're ready! Waiting for ${result.totalHumanTeams - result.readyCount} more coach(es).`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const openDraftRetain = (player: DeparturePlayer) => {
    setNilOfferAmount(player.draftAskMin || 50000);
    setDraftRetainPlayer(player);
  };

  const openTransferRetain = (player: DeparturePlayer) => {
    setNilOfferAmount(0);
    setSelectedPlayerPromise("");
    setPlayerPromiseDifficulty("easy");
    setSelectedTeamPromise("");
    setTeamPromiseDifficulty("easy");
    setTransferRetainPlayer(player);
  };

  const calculateRetentionChance = () => {
    let chance = 30;
    if (nilOfferAmount > 0) chance += Math.min(25, Math.floor((nilOfferAmount / 200000) * 25));
    if (selectedPlayerPromise) {
      const diffMap: Record<string, number> = { easy: 10, medium: 18, hard: 25 };
      chance += diffMap[playerPromiseDifficulty] || 10;
    }
    if (selectedTeamPromise) {
      const diffMap: Record<string, number> = { easy: 8, medium: 14, hard: 20 };
      chance += diffMap[teamPromiseDifficulty] || 8;
    }
    return Math.min(98, chance);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="p-4 rounded-md border border-border/50 bg-card/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="text-center">
                  <Skeleton className="h-3 w-12 mb-1" />
                  <Skeleton className="h-4 w-8" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-md border border-border/50 bg-card/30">
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-36" />
                </div>
              </div>
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
                    <Skeleton className="h-5 w-8" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-8 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <RetroCard>
          <RetroCardContent>
            <p className="text-muted-foreground font-pixel text-xs">No departure data available</p>
          </RetroCardContent>
        </RetroCard>
      </div>
    );
  }

  const userTeam = data.userTeam;
  const totalDepartures = userTeam
    ? userTeam.graduates.length + userTeam.draftDeclarations.length + userTeam.transfers.length
    : 0;
  const pendingActions = userTeam
    ? userTeam.draftDeclarations.filter(p => p.retentionStatus === "pending").length +
      userTeam.transfers.filter(p => p.retentionStatus === "pending").length
    : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-testid="departures-page">
      {/* Header */}
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <RetroButton variant="ghost" size="sm" onClick={() => setLocation(`/league/${leagueId}`)} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </RetroButton>
          <h1 className="font-pixel text-gold text-lg uppercase tracking-wider" data-testid="text-page-title">
            Offseason Departures
          </h1>
          <Badge className="bg-amber-600/30 text-amber-400 border-amber-600/50 no-default-hover-elevate no-default-active-elevate" data-testid="badge-season">
            Season {data.league.currentSeason}
          </Badge>
        </div>

        {/* Summary Banner */}
        {userTeam && (
          <RetroCard variant="highlighted" className="mb-4">
            <RetroCardContent>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <TeamBadge
                    abbreviation={userTeam.abbreviation}
                    primaryColor={userTeam.primaryColor}
                    secondaryColor={userTeam.secondaryColor}
                    name={userTeam.teamName}
                   
                    size="md"
                  />
                  <div>
                    <p className="font-pixel text-xs text-gold uppercase" data-testid="text-team-name">{userTeam.teamName}</p>
                    <p className="text-sm text-muted-foreground">
                      {totalDepartures} player{totalDepartures !== 1 ? "s" : ""} departing
                      {pendingActions > 0 && (
                        <span className="text-amber-400 ml-2">
                          ({pendingActions} action{pendingActions !== 1 ? "s" : ""} available)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <p className="font-pixel text-[10px] text-muted-foreground uppercase">NIL Budget</p>
                    <p className="text-sm text-gold font-bold" data-testid="text-nil-budget">${userTeam.nilRemaining.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-pixel text-[10px] text-muted-foreground uppercase">Roster</p>
                    <p className="text-sm text-foreground font-bold" data-testid="text-roster-size">{userTeam.rosterSize}</p>
                  </div>
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-4">
          <RetroButton
            variant={activeTab === "myTeam" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("myTeam")}
            data-testid="button-tab-myteam"
          >
            My Team
          </RetroButton>
          {userTeam && (
            <RetroButton
              variant={activeTab === "rosterPreview" ? "primary" : "outline"}
              size="sm"
              onClick={() => setActiveTab("rosterPreview")}
              data-testid="button-tab-roster-preview"
            >
              Roster Preview
            </RetroButton>
          )}
          <RetroButton
            variant={activeTab === "leagueWide" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("leagueWide")}
            data-testid="button-tab-leaguewide"
          >
            League-Wide
          </RetroButton>
        </div>

        {/* My Team Tab */}
        {activeTab === "myTeam" && userTeam && (
          <div className="space-y-4" data-testid="section-myteam">
            {/* All-clear callout when nothing is departing */}
            {totalDepartures === 0 && (
              <RetroCard variant="bordered" data-testid="callout-no-departures">
                <RetroCardContent>
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center">
                      <PartyPopper className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <p className="font-pixel text-xs text-green-400 uppercase mb-1">No Departures This Season</p>
                      <p className="text-sm text-muted-foreground">
                        Every player on your roster is returning next season. No seniors graduated, no draft declarations, and no transfer requests.
                      </p>
                    </div>
                  </div>
                </RetroCardContent>
              </RetroCard>
            )}

            {/* Graduates */}
            <RetroCard>
              <RetroCardHeader className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-blue-400" />
                <span>Graduates ({userTeam.graduates.length})</span>
              </RetroCardHeader>
              <RetroCardContent>
                {userTeam.graduates.length === 0 ? (
                  <div className="flex items-center gap-3 py-3 px-1" data-testid="empty-graduates">
                    <GraduationCap className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                    <p className="text-sm text-muted-foreground">No seniors graduating this season — your upperclassmen are all returning.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userTeam.graduates.map(player => (
                      <PlayerDepartureRow key={player.id} player={player} type="graduated" onView={() => setViewPlayer({ id: player.id, teamId: player.teamId })} />
                    ))}
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Draft Declarations */}
            <RetroCard>
              <RetroCardHeader className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Draft Declarations ({userTeam.draftDeclarations.length})</span>
              </RetroCardHeader>
              <RetroCardContent>
                {userTeam.draftDeclarations.length === 0 ? (
                  <div className="flex items-center gap-3 py-3 px-1" data-testid="empty-draft">
                    <Trophy className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                    <p className="text-sm text-muted-foreground">No players are declaring for the MLB Draft this offseason.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">
                      These players are considering entering the MLB Draft. You can make a NIL offer to convince them to stay.
                    </p>
                    {userTeam.draftDeclarations.map(player => (
                      <PlayerDepartureRow
                        key={player.id}
                        player={player}
                        type="draft"
                        onRetain={() => openDraftRetain(player)}
                        onView={() => setViewPlayer({ id: player.id, teamId: player.teamId })}
                        nilRemaining={userTeam.nilRemaining}
                      />
                    ))}
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Transfer Portal */}
            <RetroCard>
              <RetroCardHeader className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                <span>Transfer Portal ({userTeam.transfers.length})</span>
              </RetroCardHeader>
              <RetroCardContent>
                {userTeam.transfers.length === 0 ? (
                  <div className="flex items-center gap-3 py-3 px-1" data-testid="empty-transfers">
                    <ArrowRightLeft className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                    <p className="text-sm text-muted-foreground">No players are entering the transfer portal — your locker room is happy.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">
                      These players are unhappy and considering a transfer. Combine NIL money and promises to convince them to stay.
                    </p>
                    {userTeam.transfers.map(player => (
                      <PlayerDepartureRow
                        key={player.id}
                        player={player}
                        type="transfer"
                        onRetain={() => openTransferRetain(player)}
                        onView={() => setViewPlayer({ id: player.id, teamId: player.teamId })}
                        nilRemaining={userTeam.nilRemaining}
                      />
                    ))}
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Finalize Button */}
            <RetroCard variant="bordered">
              <RetroCardContent>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    {userTeam.departuresFinalized ? (
                      <>
                        <p className="font-pixel text-xs text-green-400 uppercase mb-1 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Departures Submitted
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your departures are finalized. The commissioner can now advance to the recruiting phase.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <RetroButton
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/league/${leagueId}`)}
                            data-testid="button-back-to-league"
                          >
                            Back to League
                          </RetroButton>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-pixel text-xs text-gold uppercase mb-1">Ready to Submit?</p>
                        <p className="text-sm text-muted-foreground">
                          {pendingActions > 0
                            ? `You have ${pendingActions} retention action${pendingActions !== 1 ? "s" : ""} remaining. Make your offers before submitting.`
                            : "All retention decisions have been made. Submit to mark your departures as ready."}
                        </p>
                      </>
                    )}
                  </div>
                  {!userTeam.departuresFinalized && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <RetroButton
                          variant="primary"
                          loading={finalizeMutation.isPending}
                          data-testid="button-finalize-departures"
                        >
                          Submit Departures
                        </RetroButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-pixel text-gold text-sm">Finalize Departures?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Once finalized, all departure decisions are locked. Graduated seniors will leave, draft declarations will be processed, and transfer portal entries will be confirmed. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => finalizeMutation.mutate()} className="bg-gold text-forest-dark" data-testid="button-confirm-finalize-departures">
                            Finalize
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>
        )}

        {/* Roster Preview Tab */}
        {activeTab === "rosterPreview" && userTeam && (
          <div className="space-y-4" data-testid="section-roster-preview">
            <RetroCard>
              <RetroCardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gold" />
                  <span>Roster After Departures</span>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                {(() => {
                  const departingIds = new Set([
                    ...userTeam.graduates.map(p => p.id),
                    ...userTeam.draftDeclarations.map(p => p.id),
                    ...userTeam.transfers.map(p => p.id),
                  ]);
                  const departureMap = new Map<string, { type: string; label: string }>();
                  userTeam.graduates.forEach(p => departureMap.set(p.id, { type: "graduated", label: "Graduated" }));
                  userTeam.draftDeclarations.forEach(p => departureMap.set(p.id, { type: "draft", label: p.draftRound ? `Rd ${p.draftRound} Pick` : "Draft" }));
                  userTeam.transfers.forEach(p => departureMap.set(p.id, { type: "transfer", label: "Transfer" }));

                  const allPlayers = [
                    ...(rosterData?.players ?? []),
                    ...userTeam.graduates,
                    ...userTeam.draftDeclarations,
                    ...userTeam.transfers,
                  ];
                  const seen = new Set<string>();
                  const deduped = allPlayers.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
                  const sorted = [...deduped].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
                  const staying = sorted.filter(p => !departingIds.has(p.id));
                  const departing = sorted.filter(p => departingIds.has(p.id));

                  const typeColor: Record<string, string> = {
                    graduated: "bg-blue-900/40 border-blue-700 text-blue-300",
                    draft: "bg-amber-900/40 border-amber-700 text-amber-300",
                    transfer: "bg-purple-900/40 border-purple-700 text-purple-300",
                  };

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pb-2 border-b border-border/50">
                        <span><span className="text-foreground font-medium">{staying.length}</span> staying</span>
                        <span><span className="text-red-400 font-medium">{departing.length}</span> departing</span>
                        <span><span className="text-foreground font-medium">{25 - staying.length}</span> roster spots open</span>
                      </div>
                      {departing.length > 0 && (
                        <div>
                          <p className="text-[10px] font-pixel text-muted-foreground mb-2 uppercase">Departing</p>
                          <div className="space-y-1">
                            {departing.map(p => {
                              const dep = departureMap.get(p.id);
                              return (
                                <div key={p.id} className="flex items-center gap-2 p-2 rounded bg-red-950/20 border border-red-900/30 cursor-pointer hover:bg-red-950/30" onClick={() => setViewPlayer({ id: p.id, teamId: userTeam.teamId })} data-testid={`roster-departing-${p.id}`}>
                                  <Badge variant="outline" className="text-[7px] font-mono shrink-0 w-8 text-center">{p.position}</Badge>
                                  <span className="text-xs flex-1">{p.firstName} {p.lastName}</span>
                                  <span className="text-xs text-muted-foreground">{p.overall} OVR</span>
                                  {dep && <Badge className={`text-[7px] ${typeColor[dep.type]} no-default-hover-elevate no-default-active-elevate`}>{dep.label}</Badge>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {staying.length > 0 && (
                        <div>
                          <p className="text-[10px] font-pixel text-muted-foreground mb-2 uppercase">Returning</p>
                          <div className="space-y-1">
                            {staying.map(p => (
                              <div key={p.id} className="flex items-center gap-2 p-2 rounded bg-muted/20 cursor-pointer hover:bg-muted/30" onClick={() => setViewPlayer({ id: p.id, teamId: userTeam.teamId })} data-testid={`roster-staying-${p.id}`}>
                                <Badge variant="outline" className="text-[7px] font-mono shrink-0 w-8 text-center">{p.position}</Badge>
                                <span className="text-xs flex-1">{p.firstName} {p.lastName}</span>
                                <span className="text-xs text-muted-foreground">{p.overall} OVR</span>
                                <Badge className="text-[7px] bg-green-900/30 border-green-800 text-green-400 no-default-hover-elevate no-default-active-elevate">Returning</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!rosterData && staying.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Loading roster...</p>
                      )}
                    </div>
                  );
                })()}
              </RetroCardContent>
            </RetroCard>
          </div>
        )}

        {activeTab === "myTeam" && !userTeam && (
          <RetroCard>
            <RetroCardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                You don't have a team in this league. Switch to League-Wide view to see all departures.
              </p>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* League-Wide Tab */}
        {activeTab === "leagueWide" && (
          <div className="space-y-3" data-testid="section-leaguewide">
            {data.allTeams.map(team => {
              const teamTotal = team.graduates.length + team.draftDeclarations.length + team.transfers.length;
              const isExpanded = expandedTeams.has(team.teamId);
              const isUserTeam = team.teamId === data.userTeamId;

              return (
                <RetroCard
                  key={team.teamId}
                  variant={isUserTeam ? "highlighted" : "default"}
                  className="overflow-visible"
                >
                  <div
                    className="flex items-center justify-between gap-3 cursor-pointer p-1"
                    onClick={() => toggleTeamExpand(team.teamId)}
                    data-testid={`button-expand-team-${team.abbreviation}`}
                  >
                    <div className="flex items-center gap-3">
                      <TeamBadge
                        abbreviation={team.abbreviation}
                        primaryColor={team.primaryColor}
                        secondaryColor={team.secondaryColor}
                        name={team.teamName}
                       
                        size="sm"
                      />
                      <div>
                        <p className="font-pixel text-xs text-foreground uppercase">
                          {team.teamName}
                          {isUserTeam && <span className="text-gold ml-2">(You)</span>}
                          {team.isCpu && <span className="text-muted-foreground ml-2">(CPU)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {teamTotal} departure{teamTotal !== 1 ? "s" : ""} --
                          {team.graduates.length > 0 && ` ${team.graduates.length} grad`}
                          {team.draftDeclarations.length > 0 && ` ${team.draftDeclarations.length} draft`}
                          {team.transfers.length > 0 && ` ${team.transfers.length} transfer`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-muted text-muted-foreground no-default-hover-elevate no-default-active-elevate">
                        {teamTotal}
                      </Badge>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      {team.graduates.length > 0 && (
                        <div>
                          <p className="font-pixel text-[10px] text-blue-400 uppercase mb-2 flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" /> Graduates
                          </p>
                          {team.graduates.map(p => (
                            <PlayerDepartureRow key={p.id} player={p} type="graduated" compact onView={() => setViewPlayer({ id: p.id, teamId: p.teamId })} />
                          ))}
                        </div>
                      )}
                      {team.draftDeclarations.length > 0 && (
                        <div>
                          <p className="font-pixel text-[10px] text-amber-400 uppercase mb-2 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> Draft Declarations
                          </p>
                          {team.draftDeclarations.map(p => (
                            <PlayerDepartureRow key={p.id} player={p} type="draft" compact onView={() => setViewPlayer({ id: p.id, teamId: p.teamId })} />
                          ))}
                        </div>
                      )}
                      {team.transfers.length > 0 && (
                        <div>
                          <p className="font-pixel text-[10px] text-purple-400 uppercase mb-2 flex items-center gap-1">
                            <ArrowRightLeft className="w-3 h-3" /> Transfer Portal
                          </p>
                          {team.transfers.map(p => (
                            <PlayerDepartureRow key={p.id} player={p} type="transfer" compact onView={() => setViewPlayer({ id: p.id, teamId: p.teamId })} />
                          ))}
                        </div>
                      )}
                      {teamTotal === 0 && (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground" data-testid={`empty-team-${team.abbreviation}`}>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500/60 shrink-0" />
                          <span>No departures — full roster returning next season</span>
                        </div>
                      )}
                    </div>
                  )}
                </RetroCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Draft Retention Dialog */}
      <Dialog open={!!draftRetainPlayer} onOpenChange={(open) => !open && setDraftRetainPlayer(null)}>
        <DialogContent className="bg-card border-2 border-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm uppercase">
              Make NIL Offer
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Convince {draftRetainPlayer?.firstName} {draftRetainPlayer?.lastName} to stay instead of entering the MLB Draft.
            </DialogDescription>
          </DialogHeader>

          {draftRetainPlayer && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-background/50 p-3 border border-border">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {draftRetainPlayer.firstName} {draftRetainPlayer.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draftRetainPlayer.position} -- {draftRetainPlayer.eligibility} -- OVR {draftRetainPlayer.overall}
                  </p>
                </div>
                <StarRating rating={draftRetainPlayer.starRating} size="sm" />
              </div>

              <div className="bg-background/30 p-3 border border-border space-y-2">
                <p className="font-pixel text-[10px] text-muted-foreground uppercase">Draft Interest Range</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">${(draftRetainPlayer.draftAskMin || 50000).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">to</span>
                  <span className="text-sm text-gold font-bold">${(draftRetainPlayer.draftAskMax || 100000).toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Offer at least the minimum for a reasonable chance. Matching or exceeding the max gives the best odds.
                </p>
              </div>

              <div>
                <label className="font-pixel text-[10px] text-muted-foreground uppercase block mb-2">
                  Your NIL Offer
                </label>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gold" />
                  <input
                    type="number"
                    value={nilOfferAmount}
                    onChange={(e) => setNilOfferAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-input border-2 border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-gold"
                    min={0}
                    step={5000}
                    data-testid="input-nil-offer-draft"
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    Budget remaining: ${(data?.userTeam?.nilRemaining || 0).toLocaleString()}
                  </span>
                  {nilOfferAmount > (data?.userTeam?.nilRemaining || 0) && (
                    <span className="text-[10px] text-red-400">Over budget!</span>
                  )}
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[draftRetainPlayer.draftAskMin || 50000, Math.floor(((draftRetainPlayer.draftAskMin || 50000) + (draftRetainPlayer.draftAskMax || 100000)) / 2), draftRetainPlayer.draftAskMax || 100000].map(amt => (
                    <RetroButton
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setNilOfferAmount(amt)}
                      data-testid={`button-preset-${amt}`}
                    >
                      ${amt.toLocaleString()}
                    </RetroButton>
                  ))}
                </div>
              </div>

              {/* Estimated Chance */}
              <div className="bg-background/30 p-3 border border-border">
                <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Estimated Retention Chance</p>
                <div className="flex items-center gap-3">
                  <Progress
                    value={nilOfferAmount >= (draftRetainPlayer.draftAskMax || 100000) ? 95 :
                      nilOfferAmount >= (draftRetainPlayer.draftAskMin || 50000) ? 50 + 40 * ((nilOfferAmount - (draftRetainPlayer.draftAskMin || 50000)) / ((draftRetainPlayer.draftAskMax || 100000) - (draftRetainPlayer.draftAskMin || 50000))) :
                      10 + 40 * (nilOfferAmount / (draftRetainPlayer.draftAskMin || 50000))}
                    className="flex-1 h-3"
                  />
                  <span className="text-sm font-bold text-gold min-w-[40px] text-right">
                    {Math.round(nilOfferAmount >= (draftRetainPlayer.draftAskMax || 100000) ? 95 :
                      nilOfferAmount >= (draftRetainPlayer.draftAskMin || 50000) ? 50 + 40 * ((nilOfferAmount - (draftRetainPlayer.draftAskMin || 50000)) / ((draftRetainPlayer.draftAskMax || 100000) - (draftRetainPlayer.draftAskMin || 50000))) :
                      10 + 40 * (nilOfferAmount / (draftRetainPlayer.draftAskMin || 50000)))}%
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <RetroButton variant="outline" size="sm" onClick={() => setDraftRetainPlayer(null)}>
              Cancel
            </RetroButton>
            <RetroButton
              variant="primary"
              size="sm"
              onClick={() => draftRetainPlayer && retainDraftMutation.mutate({ playerId: draftRetainPlayer.id, nilOffer: nilOfferAmount })}
              loading={retainDraftMutation.isPending}
              disabled={nilOfferAmount > (data?.userTeam?.nilRemaining || 0)}
              data-testid="button-submit-draft-offer"
            >
              <DollarSign className="w-3 h-3" /> Make Offer
            </RetroButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Retention Dialog */}
      <Dialog open={!!transferRetainPlayer} onOpenChange={(open) => !open && setTransferRetainPlayer(null)}>
        <DialogContent className="bg-card border-2 border-gold max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm uppercase">
              Convince to Stay
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Use NIL money and promises to convince {transferRetainPlayer?.firstName} {transferRetainPlayer?.lastName} to remain on the roster.
            </DialogDescription>
          </DialogHeader>

          {transferRetainPlayer && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-3 bg-background/50 p-3 border border-border">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {transferRetainPlayer.firstName} {transferRetainPlayer.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transferRetainPlayer.position} -- {transferRetainPlayer.eligibility} -- OVR {transferRetainPlayer.overall}
                  </p>
                  {transferRetainPlayer.transferReason && (
                    <p className="text-xs text-amber-400 mt-1">Reason: {transferRetainPlayer.transferReason}</p>
                  )}
                </div>
                <StarRating rating={transferRetainPlayer.starRating} size="sm" />
              </div>

              {/* NIL Offer Section */}
              <div className="bg-background/30 p-3 border border-border space-y-2">
                <p className="font-pixel text-[10px] text-gold uppercase flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> NIL Sweetener (Optional)
                </p>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gold" />
                  <input
                    type="number"
                    value={nilOfferAmount}
                    onChange={(e) => setNilOfferAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-input border-2 border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-gold"
                    min={0}
                    step={5000}
                    data-testid="input-nil-offer-transfer"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Budget: ${(data?.userTeam?.nilRemaining || 0).toLocaleString()} remaining
                </p>
              </div>

              {/* Player Promise Section */}
              <div className="bg-background/30 p-3 border border-border space-y-2">
                <p className="font-pixel text-[10px] text-gold uppercase flex items-center gap-1">
                  <Target className="w-3 h-3" /> Player Promise (Optional)
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Make a promise about the player's future. Bolder promises are more convincing, but harder to keep.
                </p>
                <div className="space-y-2">
                  {PLAYER_PROMISE_OPTIONS.map(opt => (
                    <div
                      key={opt.value}
                      className={`p-2 border cursor-pointer transition-colors ${
                        selectedPlayerPromise === opt.value
                          ? "border-gold bg-gold/10"
                          : "border-border hover:border-border/80"
                      }`}
                      onClick={() => setSelectedPlayerPromise(selectedPlayerPromise === opt.value ? "" : opt.value)}
                      data-testid={`option-player-promise-${opt.value}`}
                    >
                      <p className="text-sm text-foreground">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                    </div>
                  ))}
                </div>
                {selectedPlayerPromise && (
                  <div className="mt-2">
                    <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-1">Ambition Level</p>
                    <div className="flex gap-2">
                      {DIFFICULTY_OPTIONS.map(d => (
                        <RetroButton
                          key={d.value}
                          variant={playerPromiseDifficulty === d.value ? "primary" : "outline"}
                          size="sm"
                          onClick={() => setPlayerPromiseDifficulty(d.value)}
                          data-testid={`button-player-difficulty-${d.value}`}
                        >
                          <span className={d.color}>{d.label}</span>
                        </RetroButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Team Promise Section */}
              <div className="bg-background/30 p-3 border border-border space-y-2">
                <p className="font-pixel text-[10px] text-gold uppercase flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Team Promise (Optional)
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Promise the team will achieve something. Bigger goals are more convincing but much harder to achieve.
                </p>
                <div className="space-y-2">
                  {TEAM_PROMISE_OPTIONS.map(opt => (
                    <div
                      key={opt.value}
                      className={`p-2 border cursor-pointer transition-colors ${
                        selectedTeamPromise === opt.value
                          ? "border-gold bg-gold/10"
                          : "border-border hover:border-border/80"
                      }`}
                      onClick={() => setSelectedTeamPromise(selectedTeamPromise === opt.value ? "" : opt.value)}
                      data-testid={`option-team-promise-${opt.value}`}
                    >
                      <p className="text-sm text-foreground">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                    </div>
                  ))}
                </div>
                {selectedTeamPromise && (
                  <div className="mt-2">
                    <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-1">Ambition Level</p>
                    <div className="flex gap-2">
                      {DIFFICULTY_OPTIONS.map(d => (
                        <RetroButton
                          key={d.value}
                          variant={teamPromiseDifficulty === d.value ? "primary" : "outline"}
                          size="sm"
                          onClick={() => setTeamPromiseDifficulty(d.value)}
                          data-testid={`button-team-difficulty-${d.value}`}
                        >
                          <span className={d.color}>{d.label}</span>
                        </RetroButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Retention Chance Preview */}
              <div className="bg-background/30 p-3 border border-border">
                <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Estimated Retention Chance</p>
                <div className="flex items-center gap-3">
                  <Progress value={calculateRetentionChance()} className="flex-1 h-3" />
                  <span className="text-sm font-bold text-gold min-w-[40px] text-right">
                    {calculateRetentionChance()}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
                  <span>Base: 30%</span>
                  {nilOfferAmount > 0 && <span className="text-green-400">+NIL</span>}
                  {selectedPlayerPromise && <span className="text-blue-400">+Player Promise</span>}
                  {selectedTeamPromise && <span className="text-purple-400">+Team Promise</span>}
                </div>
              </div>

              {/* Warning about promises */}
              {(selectedPlayerPromise || selectedTeamPromise) && (
                <div className="flex items-start gap-2 p-2 bg-amber-900/20 border border-amber-600/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-400">
                    Broken promises will cause the player to enter the transfer portal next offseason. Make sure you can deliver.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <RetroButton variant="outline" size="sm" onClick={() => setTransferRetainPlayer(null)}>
              Cancel
            </RetroButton>
            <RetroButton
              variant="primary"
              size="sm"
              onClick={() => {
                if (!transferRetainPlayer) return;
                retainTransferMutation.mutate({
                  playerId: transferRetainPlayer.id,
                  nilOffer: nilOfferAmount,
                  playerPromise: selectedPlayerPromise ? { type: selectedPlayerPromise, difficulty: playerPromiseDifficulty } : undefined,
                  teamPromise: selectedTeamPromise ? { type: selectedTeamPromise, difficulty: teamPromiseDifficulty } : undefined,
                });
              }}
              loading={retainTransferMutation.isPending}
              disabled={nilOfferAmount > (data?.userTeam?.nilRemaining || 0)}
              data-testid="button-submit-transfer-offer"
            >
              <Handshake className="w-3 h-3" /> Make Pitch
            </RetroButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Player Profile Card */}
      {viewPlayerData && (
        <PlayerProfileCard
          player={viewPlayerData}
          open={!!viewPlayer}
          onClose={() => setViewPlayer(null)}
          leagueId={leagueId}
        />
      )}

      {/* Retention Result Dialog */}
      <Dialog open={!!retentionResult} onOpenChange={(open) => !open && setRetentionResult(null)}>
        <DialogContent className="bg-card border-2 border-gold max-w-sm text-center">
          {retentionResult && (
            <div className="py-4 space-y-4">
              {retentionResult.success ? (
                <>
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                  <p className="font-pixel text-green-400 text-sm uppercase">Player Retained!</p>
                  <p className="text-sm text-foreground">
                    {retentionResult.playerName} has decided to stay on the team!
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-red-400 mx-auto" />
                  <p className="font-pixel text-red-400 text-sm uppercase">Offer Rejected</p>
                  <p className="text-sm text-foreground">
                    {retentionResult.playerName} has decided to move on despite your offer.
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Retention chance was {retentionResult.chance}%
              </p>
              <RetroButton variant="primary" size="sm" onClick={() => setRetentionResult(null)} data-testid="button-dismiss-result">
                Continue
              </RetroButton>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerDepartureRow({
  player,
  type,
  onRetain,
  onView,
  nilRemaining,
  compact = false,
}: {
  player: DeparturePlayer;
  type: "graduated" | "draft" | "transfer";
  onRetain?: () => void;
  onView?: () => void;
  nilRemaining?: number;
  compact?: boolean;
}) {
  const statusIcon = player.retentionStatus === "retained" ? (
    <CheckCircle className="w-4 h-4 text-green-400" />
  ) : player.retentionStatus === "rejected" ? (
    <XCircle className="w-4 h-4 text-red-400" />
  ) : null;

  const statusBadge = player.retentionStatus === "retained" ? (
    <Badge className="bg-green-600/30 text-green-400 border-green-600/50 text-[10px] no-default-hover-elevate no-default-active-elevate">Staying</Badge>
  ) : player.retentionStatus === "rejected" ? (
    <Badge className="bg-red-600/30 text-red-400 border-red-600/50 text-[10px] no-default-hover-elevate no-default-active-elevate">Leaving</Badge>
  ) : null;

  return (
    <div
      className={`flex items-center justify-between gap-3 p-2 border border-border hover-elevate cursor-pointer ${compact ? "py-1" : ""}`}
      data-testid={`row-departure-${player.id}`}
      onClick={onView}
    >
      <div className="flex items-center gap-3 min-w-0">
        {statusIcon}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold text-foreground ${compact ? "text-xs" : "text-sm"}`}>
              {player.firstName} {player.lastName}
            </p>
            <span className="text-xs text-muted-foreground">
              {player.position}
            </span>
            <span className="text-xs text-muted-foreground">
              {player.eligibility}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">OVR {player.overall}</span>
            {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
              <span className={`inline-flex items-center text-[10px] font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-departure-ovr-delta-${player.id}`}>
                {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                {Math.abs(player.progressionDeltas.overall)}
              </span>
            )}
            <StarRating rating={player.starRating} size="sm" />
            {type === "draft" && player.draftRound && (
              <Badge className="bg-amber-600/30 text-amber-400 border-amber-600/50 text-[10px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-draft-round-${player.id}`}>
                Rd {player.draftRound}
              </Badge>
            )}
            {type === "draft" && player.draftAskMin && !compact && (
              <span className="text-[10px] text-amber-400">
                Asking ${player.draftAskMin.toLocaleString()} - ${(player.draftAskMax || 0).toLocaleString()}
              </span>
            )}
            {type === "transfer" && player.transferReason && !compact && (
              <span className="text-[10px] text-purple-400">{player.transferReason}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge}
        {player.nilOffered != null && player.nilOffered > 0 && (
          <span className="text-[10px] text-gold">${player.nilOffered.toLocaleString()}</span>
        )}
        {onRetain && player.retentionStatus === "pending" && (
          <RetroButton
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRetain();
            }}
            data-testid={`button-retain-${player.id}`}
          >
            {type === "draft" ? (
              <><DollarSign className="w-3 h-3" /> Offer</>
            ) : (
              <><Handshake className="w-3 h-3" /> Retain</>
            )}
          </RetroButton>
        )}
      </div>
    </div>
  );
}