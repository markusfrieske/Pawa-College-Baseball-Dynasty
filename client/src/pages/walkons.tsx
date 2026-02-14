import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionBadge } from "@/components/ui/position-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Users, UserPlus, Scissors, CheckCircle, Filter, Star, MapPin } from "lucide-react";
import { getPotentialGrade } from "@shared/potential";
import type { Player, Team, League } from "@shared/schema";

interface Walkon {
  id: string;
  leagueId: string;
  firstName: string;
  lastName: string;
  position: string;
  throwHand: string;
  batHand: string;
  homeState: string;
  hometown: string;
  eligibility: string;
  overall: number;
  starRating: number;
  potential: number | null;
  signedTeamId: string | null;
  signedTeamName: string | null;
  isGenerated: boolean;
}

interface RosterData {
  players: Player[];
  team: Team;
}

interface ReadinessEntry {
  teamId: string;
  teamName: string;
  isCpu: boolean;
  walkonReady: boolean;
  abbreviation: string;
}

const MAX_ROSTER = 25;

export default function WalkonsPage() {
  const { id } = useParams<{ id: string }>();
  const [posFilter, setPosFilter] = useState("all");
  const [showSigned, setShowSigned] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rosterData, isLoading: rosterLoading } = useQuery<RosterData>({
    queryKey: [`/api/leagues/${id}/roster`],
  });

  const { data: walkons, isLoading: walkonsLoading } = useQuery<Walkon[]>({
    queryKey: ["/api/leagues", id, "walkons"],
  });

  const { data: readiness } = useQuery<ReadinessEntry[]>({
    queryKey: ["/api/leagues", id, "walkons", "readiness"],
  });

  const { data: leagueData } = useQuery<{ league?: League }>({
    queryKey: ["/api/leagues", id],
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const coaches = leagueData?.league ? undefined : undefined;

  const myTeam = rosterData?.team;
  const myReadiness = readiness?.find(r => r.teamId === myTeam?.id);
  const isReady = myReadiness?.walkonReady || false;

  const signMutation = useMutation({
    mutationFn: async (walkonId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/${walkonId}/sign`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons"] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      toast({ title: "Walk-on signed", description: "Player added to your roster." });
    },
    onError: (err: any) => {
      toast({ title: "Cannot sign", description: err.message || "Failed to sign walk-on.", variant: "destructive" });
    },
  });

  const cutMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/cut/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons"] });
      toast({ title: "Player cut", description: "Player has been released to JUCO." });
    },
    onError: (err: any) => {
      toast({ title: "Cannot cut", description: err.message || "Failed to cut player.", variant: "destructive" });
    },
  });

  const readyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/ready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons", "readiness"] });
      toast({ title: isReady ? "Unready" : "Ready", description: isReady ? "You can continue making changes." : "You are ready to advance." });
    },
  });

  const roster = rosterData?.players || [];
  const rosterCount = roster.length;
  const sortedRoster = [...roster].sort((a, b) => (b.overall || 0) - (a.overall || 0));

  const positions = ["all", "P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];

  const filteredPool = (walkons || [])
    .filter(w => posFilter === "all" || w.position === posFilter)
    .filter(w => showSigned || !w.signedTeamId)
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));

  const starDisplay = (stars: number) => {
    return Array(stars).fill(null).map((_, i) => (
      <Star key={i} className="w-3 h-3 fill-gold text-gold inline-block" />
    ));
  };

  if (rosterLoading || walkonsLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-10 w-48 mb-4" />
        <div className="grid gap-4">
          {Array(5).fill(null).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href={`/league/${id}`}>
              <RetroButton variant="ghost" size="sm" data-testid="button-back-league">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </RetroButton>
            </Link>
            <h1 className="font-pixel text-gold text-sm">CUTS & WALK-ONS</h1>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              <Badge variant={rosterCount > MAX_ROSTER ? "destructive" : rosterCount === MAX_ROSTER ? "default" : "outline"} data-testid="badge-roster-count">
                <Users className="w-3 h-3 mr-1" />
                {rosterCount}/{MAX_ROSTER}
              </Badge>
              <RetroButton
                variant={isReady ? "primary" : "outline"}
                size="sm"
                onClick={() => readyMutation.mutate()}
                disabled={readyMutation.isPending}
                data-testid="button-toggle-ready"
              >
                <CheckCircle className={`w-4 h-4 mr-1 ${isReady ? "text-green-300" : ""}`} />
                {isReady ? "Ready" : "Mark Ready"}
              </RetroButton>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4">
        {readiness && (
          <div className="mb-4 flex flex-wrap gap-2" data-testid="team-readiness-bar">
            {readiness.map(r => (
              <Badge
                key={r.teamId}
                variant={r.walkonReady ? "default" : "outline"}
                className={`text-[9px] ${r.walkonReady ? "bg-green-900/40 border-green-700 text-green-300" : "opacity-50"}`}
                data-testid={`readiness-${r.abbreviation}`}
              >
                {r.walkonReady ? <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> : null}
                {r.abbreviation}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <RetroCard data-testid="current-roster-section">
              <RetroCardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Users className="w-4 h-4 text-gold" />
                  <span>Current Roster ({rosterCount})</span>
                  {rosterCount > MAX_ROSTER && (
                    <Badge variant="destructive" className="text-[9px]">
                      Must cut {rosterCount - MAX_ROSTER}
                    </Badge>
                  )}
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {sortedRoster.map(player => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 p-2 rounded bg-muted/20 hover-elevate"
                      data-testid={`roster-player-${player.id}`}
                    >
                      <PositionBadge position={player.position} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          <span>{player.eligibility}</span>
                          <span>{player.overall} OVR</span>
                          <span className="flex">{starDisplay(player.starRating || 1)}</span>
                        </div>
                      </div>
                      <RetroButton
                        variant="ghost"
                        size="sm"
                        onClick={() => cutMutation.mutate(player.id)}
                        disabled={cutMutation.isPending}
                        className="text-red-400 hover:text-red-300"
                        data-testid={`button-cut-${player.id}`}
                      >
                        <Scissors className="w-3 h-3 mr-1" />
                        Cut
                      </RetroButton>
                    </div>
                  ))}
                  {sortedRoster.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No players on roster</p>
                  )}
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>

          <div>
            <RetroCard data-testid="walkon-pool-section">
              <RetroCardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <UserPlus className="w-4 h-4 text-gold" />
                  <span>Walk-On Pool ({filteredPool.length})</span>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  {positions.map(pos => (
                    <RetroButton
                      key={pos}
                      variant={posFilter === pos ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setPosFilter(pos)}
                      className="text-[9px] px-2 py-1"
                      data-testid={`filter-pos-${pos}`}
                    >
                      {pos === "all" ? "All" : pos}
                    </RetroButton>
                  ))}
                  <RetroButton
                    variant={showSigned ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setShowSigned(!showSigned)}
                    className="text-[9px] ml-auto"
                    data-testid="button-toggle-show-signed"
                  >
                    {showSigned ? "Hide Signed" : "Show Signed"}
                  </RetroButton>
                </div>

                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filteredPool.map(walkon => {
                    const isSigned = !!walkon.signedTeamId;
                    const isSignedByMe = walkon.signedTeamId === myTeam?.id;
                    const canSign = !isSigned && rosterCount < MAX_ROSTER;

                    return (
                      <div
                        key={walkon.id}
                        className={`flex items-center gap-2 p-2 rounded ${isSigned ? "bg-muted/10 opacity-60" : "bg-muted/20"} hover-elevate`}
                        data-testid={`walkon-${walkon.id}`}
                      >
                        <PositionBadge position={walkon.position} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="text-xs font-medium truncate">
                              {walkon.firstName} {walkon.lastName}
                            </p>
                            {walkon.isGenerated && (
                              <Badge variant="outline" className="text-[7px] opacity-60">FILLER</Badge>
                            )}
                            {isSigned && (
                              <Badge variant="default" className="text-[7px] bg-blue-900/40 border-blue-700 text-blue-300">
                                {isSignedByMe ? "YOUR TEAM" : walkon.signedTeamName || "SIGNED"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap">
                            <span>{walkon.eligibility}</span>
                            <span>{walkon.overall} OVR</span>
                            <span className="flex">{starDisplay(walkon.starRating || 1)}</span>
                            {walkon.potential && (
                              <span>Pot: {getPotentialGrade(walkon.potential)}</span>
                            )}
                            <span className="flex items-center">
                              <MapPin className="w-2.5 h-2.5 mr-0.5" />
                              {walkon.homeState}
                            </span>
                          </div>
                        </div>
                        {!isSigned && (
                          <RetroButton
                            variant="primary"
                            size="sm"
                            onClick={() => signMutation.mutate(walkon.id)}
                            disabled={!canSign || signMutation.isPending}
                            data-testid={`button-sign-${walkon.id}`}
                          >
                            <UserPlus className="w-3 h-3 mr-1" />
                            Sign
                          </RetroButton>
                        )}
                      </div>
                    );
                  })}
                  {filteredPool.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {posFilter !== "all" ? `No walk-ons at ${posFilter}` : "No available walk-ons"}
                    </p>
                  )}
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>
        </div>
      </div>
    </div>
  );
}
