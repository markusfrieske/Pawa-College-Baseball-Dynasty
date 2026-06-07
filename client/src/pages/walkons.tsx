import { useState, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionBadge } from "@/components/ui/position-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Users, Scissors, CheckCircle, Filter, Star, MapPin, FastForward, DollarSign, Gavel, Trophy, X, TrendingUp, AlertTriangle } from "lucide-react";
import { getPotentialGrade } from "@shared/potential";
import { TRAJECTORY_LABELS } from "@shared/trajectory";
import { PlayerProfileCard } from "@/components/player-profile-card";
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
  awardedTeamId: string | null;
  awardedTeamName: string | null;
  awardedPrice: number | null;
  isGenerated: boolean;
  trajectory?: number | null;
}

interface BidData {
  bids: Record<string, number>;
  nilBudget: number;
  nilSpent: number;
  committedBids: number;
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

interface AuctionOutcome {
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

interface AdvanceResponse {
  seasonTransition?: {
    auctionResultsByTeam?: Record<string, AuctionOutcome[]>;
  };
}

const MAX_ROSTER = 25;

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export default function WalkonsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [posFilter, setPosFilter] = useState("all");
  const [rosterPosFilter, setRosterPosFilter] = useState("all");
  const [showSigned, setShowSigned] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [confirmCut, setConfirmCut] = useState<Player | null>(null);
  const [bidInputs, setBidInputs] = useState<Record<string, string>>({});
  const [auctionResults, setAuctionResults] = useState<AuctionOutcome[] | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rosterData, isLoading: rosterLoading } = useQuery<RosterData>({
    queryKey: [`/api/leagues/${id}/roster`],
  });

  const { data: walkons, isLoading: walkonsLoading } = useQuery<Walkon[]>({
    queryKey: ["/api/leagues", id, "walkons"],
  });

  const { data: bidData, isLoading: bidsLoading } = useQuery<BidData>({
    queryKey: ["/api/leagues", id, "walkons", "bids"],
  });

  const { data: readiness } = useQuery<ReadinessEntry[]>({
    queryKey: ["/api/leagues", id, "walkons", "readiness"],
  });

  const { data: leagueData } = useQuery<{ league?: League }>({
    queryKey: ["/api/leagues", id],
    // Poll every 10 s during the walk-on phase so non-commissioner coaches
    // automatically detect when the commissioner resolves the auction and
    // advances to Spring Training — triggering the result modal without a
    // manual page refresh.
    refetchInterval: (query) => {
      const phase = (query.state.data as { league?: { currentPhase?: string } } | undefined)?.league?.currentPhase;
      return phase === "offseason_walkons" ? 10_000 : false;
    },
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  // Declare myTeam early so it can be used in query enabled guards below
  const myTeam = rosterData?.team;

  // Persistent results for non-commissioner coaches — reads from league.lastWalkonAuction
  // via GET /walkons/auction-results after the commissioner has resolved the auction.
  const league = leagueData?.league;
  const isWalkonsPhase = league?.currentPhase === "offseason_walkons";
  const { data: persistedResults } = useQuery<{ results: AuctionOutcome[] }>({
    queryKey: ["/api/leagues", id, "walkons", "auction-results"],
    enabled: !isWalkonsPhase && !!myTeam,
    refetchOnMount: true,
  });

  // Auto-show results modal for non-commissioner coaches who didn't trigger the advance
  const persistedOutcomes = persistedResults?.results;
  useEffect(() => {
    if (persistedOutcomes && persistedOutcomes.length > 0 && !auctionResults) {
      setAuctionResults(persistedOutcomes);
    }
    // Only run when persisted outcomes first arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedOutcomes]);

  // Once auction results are available, auto-show all walk-on cards (including awarded ones)
  // so coaches can see which players were won by other teams
  useEffect(() => {
    if (auctionResults && auctionResults.length > 0) {
      setShowSigned(true);
    }
  }, [auctionResults]);

  const advanceMutation = useMutation<AdvanceResponse, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/advance`);
      return res.json() as Promise<AdvanceResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons", "auction-results"] });
      const myTeamId = myTeam?.id;
      const teamResults = myTeamId ? data?.seasonTransition?.auctionResultsByTeam?.[myTeamId] : undefined;
      if (teamResults && teamResults.length > 0) {
        setAuctionResults(teamResults);
      } else {
        // Commissioner may not have bids — show persisted results after invalidation
        toast({ title: "Auction Resolved", description: "Advancing to Spring Training…" });
        setLocation(`/league/${id}`);
      }
    },
    onError: (err) => {
      toast({ title: "Cannot advance", description: parseErrorMessage(err), variant: "destructive" });
    },
  });
  const myReadiness = readiness?.find(r => r.teamId === myTeam?.id);
  const isReady = myReadiness?.walkonReady || false;
  const allReady = readiness ? readiness.every(r => r.walkonReady) : false;
  const isCommissioner = !!(leagueData?.league?.commissionerId && authData?.id && leagueData.league.commissionerId === authData.id);

  const bids = bidData?.bids || {};
  const nilBudget = bidData?.nilBudget || 0;
  const nilSpent = bidData?.nilSpent || 0;
  const availableNil = nilBudget - nilSpent;
  const committedBids = bidData?.committedBids || 0;
  const remainingNil = availableNil - committedBids;

  const bidMutation = useMutation({
    mutationFn: async ({ walkonId, bidAmount }: { walkonId: string; bidAmount: number }) => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/${walkonId}/bid`, { bidAmount });
    },
    onSuccess: (_data: unknown, { walkonId }: { walkonId: string; bidAmount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons", "bids"] });
      setBidInputs(prev => ({ ...prev, [walkonId]: "" }));
      toast({ title: "Bid placed", description: "Your sealed bid has been submitted." });
    },
    onError: (err: Error) => {
      toast({ title: "Cannot place bid", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const removeBidMutation = useMutation<unknown, Error, string>({
    mutationFn: async (walkonId: string) => {
      return apiRequest("DELETE", `/api/leagues/${id}/walkons/${walkonId}/bid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons", "bids"] });
      toast({ title: "Bid withdrawn" });
    },
    onError: (err) => {
      toast({ title: "Cannot withdraw bid", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const cutMutation = useMutation<unknown, Error, string>({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/cut/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "roster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ title: "Player cut", description: "Player has been released to JUCO." });
    },
    onError: (err) => {
      toast({ title: "Cannot cut", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const readyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/walkons/ready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons", "readiness"] });
      toast({
        title: isReady ? "Bids Unlocked" : "Bids Locked In",
        description: isReady ? "You can continue making changes." : "Your bids are locked. Waiting for all teams.",
      });
    },
  });

  const roster = rosterData?.players || [];
  // Active roster mirrors server logic: exclude players already marked as departing
  // (draft-declared, transfers, etc.) so their vacating slots count as open.
  const activeRoster = roster.filter((p: { departureType?: string | null }) => !p.departureType);
  const rosterCount = activeRoster.length;
  const sortedRoster = [...roster].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  const filteredRoster = rosterPosFilter === "all"
    ? sortedRoster
    : sortedRoster.filter(p => p.position === rosterPosFilter);
  // Open roster slots = how many more walk-ons you can win (and bid on)
  const openSlots = Math.max(0, MAX_ROSTER - rosterCount);
  const activeBidCount = Object.keys(bids).length;

  const positions = ["all", "P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];

  const filteredPool = (walkons || [])
    .filter(w => posFilter === "all" || w.position === posFilter)
    .filter(w => showSigned || !w.signedTeamId)
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));

  const starDisplay = (stars: number) =>
    Array(stars).fill(null).map((_, i) => (
      <Star key={i} className="w-3 h-3 fill-gold text-gold inline-block" />
    ));

  function handlePlaceBid(walkonId: string) {
    const raw = bidInputs[walkonId] || "";
    const amount = Math.round(parseFloat(raw.replace(/[^0-9.]/g, "")) * 1000);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid bid", description: "Enter a positive amount (e.g. 150 for $150K)", variant: "destructive" });
      return;
    }
    const maxForThis = remainingNil + (bids[walkonId] || 0);
    if (amount > maxForThis) {
      toast({ title: "Exceeds budget", description: `Max you can bid: ${fmtK(maxForThis)}`, variant: "destructive" });
      return;
    }
    bidMutation.mutate({ walkonId, bidAmount: amount });
  }

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
            <h1 className="font-pixel text-gold text-sm">CUTS & WALK-ON BIDS</h1>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              <Badge
                variant={rosterCount > MAX_ROSTER ? "destructive" : rosterCount === MAX_ROSTER ? "default" : "outline"}
                data-testid="badge-roster-count"
              >
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
                {isReady ? "Locked In" : "Lock In Bids"}
              </RetroButton>
              {isCommissioner && allReady && (
                <RetroButton
                  variant="primary"
                  size="sm"
                  onClick={() => advanceMutation.mutate()}
                  disabled={advanceMutation.isPending}
                  data-testid="button-advance-season"
                >
                  <FastForward className="w-4 h-4 mr-1" />
                  {advanceMutation.isPending ? "Resolving..." : "Resolve Auction"}
                </RetroButton>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4">
        {/* NIL Budget Tracker */}
        {!bidsLoading && nilBudget > 0 && (
          <div className="mb-4 p-3 rounded border border-gold/30 bg-gold/5" data-testid="nil-budget-tracker">
            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gold" />
                <span className="font-pixel text-[9px] text-muted-foreground">AVAILABLE NIL</span>
                <span className="font-medium text-sm text-foreground" data-testid="nil-available">{fmtK(availableNil)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gavel className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-pixel text-[9px] text-muted-foreground">COMMITTED</span>
                <span className="font-medium text-sm text-amber-400" data-testid="committed-bids">
                  {fmtK(committedBids)}
                </span>
                {Object.keys(bids).length > 0 && (
                  <span className="text-[9px] text-muted-foreground">
                    ({Object.keys(bids).length} bid{Object.keys(bids).length !== 1 ? "s" : ""})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="font-pixel text-[9px] text-muted-foreground">REMAINING</span>
                <span
                  className={`font-medium text-sm ${remainingNil < 0 ? "text-red-400" : "text-green-400"}`}
                  data-testid="nil-remaining"
                >
                  {fmtK(Math.max(0, remainingNil))}
                </span>
              </div>
            </div>
            {isReady && (
              <p className="text-[9px] text-gold/70 mt-2">
                Bids locked. Click "Locked In" to make changes.
              </p>
            )}
          </div>
        )}

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

        {allReady && !isCommissioner && (
          <div className="mb-4 p-3 rounded border border-gold/40 bg-gold/5 flex items-center gap-2" data-testid="banner-waiting-commissioner">
            <CheckCircle className="w-4 h-4 text-gold flex-shrink-0" />
            <p className="text-xs text-gold">All teams locked in — waiting for the commissioner to resolve the auction.</p>
          </div>
        )}

        {/* Post-resolution results panel — rendered from persisted lastWalkonAuction,
            durable even after walk-on pool rows are deleted during phase finalization */}
        {!isWalkonsPhase && persistedOutcomes && persistedOutcomes.length > 0 && (
          <div className="mb-6" data-testid="post-auction-results-panel">
            <RetroCard>
              <RetroCardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-gold" />
                  <span>Auction Results</span>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                {persistedOutcomes.filter(r => r.won).length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-pixel text-[9px] text-green-400 mb-2">SIGNED</h3>
                    <div className="space-y-1.5">
                      {persistedOutcomes.filter(r => r.won).map(r => (
                        <div
                          key={r.walkonId}
                          className="flex items-center justify-between p-2 rounded bg-green-900/10 border border-green-700/30"
                          data-testid={`panel-won-${r.walkonId}`}
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                              <p className="text-[9px] text-muted-foreground">{r.position} • {r.overall} OVR</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-green-400">{fmtK(r.pricePaid)}</p>
                            <p className="text-[8px] text-muted-foreground">your bid: {fmtK(r.yourBid)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {persistedOutcomes.filter(r => !r.won).length > 0 && (
                  <div>
                    <h3 className="font-pixel text-[9px] text-red-400 mb-2">OUTBID ON</h3>
                    <div className="space-y-1.5">
                      {persistedOutcomes.filter(r => !r.won).map(r => (
                        <div
                          key={r.walkonId}
                          className="flex items-center justify-between p-2 rounded bg-red-900/10 border border-red-700/30"
                          data-testid={`panel-lost-${r.walkonId}`}
                        >
                          <div className="flex items-center gap-2">
                            <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                              <p className="text-[9px] text-muted-foreground">{r.position} • {r.overall} OVR</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-muted-foreground">won by {r.winnerTeamName}</p>
                            <p className="text-sm font-medium text-red-400">{fmtK(r.pricePaid)}</p>
                            <p className="text-[8px] text-muted-foreground">your bid: {fmtK(r.yourBid)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Current Roster */}
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
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  {positions.map(pos => (
                    <RetroButton
                      key={pos}
                      variant={rosterPosFilter === pos ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setRosterPosFilter(pos)}
                      className="text-[9px] px-2 py-1"
                      data-testid={`filter-roster-pos-${pos}`}
                    >
                      {pos === "all" ? "All" : pos}
                    </RetroButton>
                  ))}
                </div>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filteredRoster.map(player => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 p-2 rounded bg-muted/20 hover-elevate cursor-pointer"
                      data-testid={`roster-player-${player.id}`}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <PositionBadge position={player.position} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap">
                          <span>{player.eligibility}</span>
                          <span>{player.overall} OVR</span>
                          <span className="flex">{starDisplay(player.starRating || 1)}</span>
                          {player.potential != null && (
                            <span>Pot: {getPotentialGrade(player.potential)}</span>
                          )}
                          <span
                            className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${
                              player.batHand === "L"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                : player.batHand === "S"
                                ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }`}
                            data-testid={`badge-hand-roster-${player.id}`}
                          >
                            B:{player.batHand || "R"} T:{player.throwHand || "R"}
                          </span>
                          {!["P", "SP", "RP", "CP"].includes(player.position) && (player as any).trajectory != null && (
                            <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-roster-${player.id}`}>
                              {TRAJECTORY_LABELS[(player as any).trajectory] ?? "LD"}
                            </span>
                          )}
                        </div>
                      </div>
                      <RetroButton
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setConfirmCut(player); }}
                        disabled={cutMutation.isPending}
                        className="text-red-400 hover:text-red-300"
                        data-testid={`button-cut-${player.id}`}
                      >
                        <Scissors className="w-3 h-3 mr-1" />
                        Cut
                      </RetroButton>
                    </div>
                  ))}
                  {filteredRoster.length === 0 && sortedRoster.length > 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No players at {rosterPosFilter}</p>
                  )}
                  {sortedRoster.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No players on roster</p>
                  )}
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>

          {/* Walk-On Blind Bid Pool */}
          <div>
            <RetroCard data-testid="walkon-pool-section">
              <RetroCardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Gavel className="w-4 h-4 text-gold" />
                  <span>Blind Bid Pool ({filteredPool.length})</span>
                  <Badge variant="outline" className="text-[8px] border-gold/40 text-gold/70 ml-auto">SEALED BIDS</Badge>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="mb-3 p-2 rounded bg-muted/10 border border-border/40 text-[9px] text-muted-foreground leading-relaxed">
                  Submit your max bid (in thousands) for any walk-on. Bids are blind — no team sees another's bid until the commissioner resolves the auction. Winner pays the second-highest bid + $1 (Vickrey pricing). Enter "150" to bid $150,000. Tied bids are broken by submission time — first to submit wins.
                </div>

                {openSlots === 0 && (
                  <div className="mb-3 p-2 rounded bg-red-900/20 border border-red-600/50 flex items-center gap-2" data-testid="banner-roster-full">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <p className="text-[9px] text-red-300">
                      Roster is full ({roster.length}/25). Cut a player first — new bids are blocked until you have open slots.
                    </p>
                  </div>
                )}
                {openSlots > 0 && activeBidCount >= openSlots && (
                  <div className="mb-3 p-2 rounded bg-amber-900/20 border border-amber-600/50 flex items-center gap-2" data-testid="banner-bids-at-limit">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <p className="text-[9px] text-amber-300">
                      Bid slots full ({activeBidCount}/{openSlots}). Remove a bid or cut a player to bid on more walk-ons.
                    </p>
                  </div>
                )}

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
                    {showSigned ? "Hide Claimed" : "Show All"}
                  </RetroButton>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredPool.map(walkon => {
                    const myBid = bids[walkon.id];
                    const hasBid = myBid !== undefined;
                    const isWon = walkon.awardedTeamId === myTeam?.id;
                    const isLost = !!walkon.awardedTeamId && walkon.awardedTeamId !== myTeam?.id && hasBid;
                    const isResolved = !!walkon.awardedTeamId;
                    const isClaimedByOther = !isResolved && !!walkon.signedTeamId && walkon.signedTeamId !== myTeam?.id;
                    const inputVal = bidInputs[walkon.id] ?? "";
                    const maxForThis = remainingNil + (myBid || 0);

                    return (
                      <div
                        key={walkon.id}
                        className={`p-2.5 rounded border ${
                          isWon
                            ? "border-green-600/60 bg-green-900/20"
                            : isLost
                            ? "border-red-600/40 bg-red-900/10"
                            : hasBid
                            ? "border-gold/40 bg-gold/5"
                            : isClaimedByOther
                            ? "border-border/30 bg-muted/10 opacity-50"
                            : "border-border/40 bg-muted/20"
                        }`}
                        data-testid={`walkon-${walkon.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <PositionBadge position={walkon.position} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="text-xs font-medium truncate">
                                {walkon.firstName} {walkon.lastName}
                              </p>
                              {walkon.isGenerated && (
                                <Badge variant="outline" className="text-[7px] opacity-60">FILLER</Badge>
                              )}
                              {isWon && (
                                <Badge className="text-[7px] bg-green-900/50 border-green-600 text-green-300">
                                  <Trophy className="w-2.5 h-2.5 mr-0.5" />
                                  WON — {fmtK(walkon.awardedPrice!)}
                                </Badge>
                              )}
                              {isLost && (
                                <Badge className="text-[7px] bg-red-900/30 border-red-700/60 text-red-400">
                                  <X className="w-2.5 h-2.5 mr-0.5" />
                                  LOST to {walkon.awardedTeamName}
                                </Badge>
                              )}
                              {!isResolved && hasBid && (
                                <Badge className="text-[7px] bg-gold/10 border-gold/50 text-gold">
                                  <Gavel className="w-2.5 h-2.5 mr-0.5" />
                                  BID: {fmtK(myBid)}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap mt-0.5">
                              <span>{walkon.eligibility}</span>
                              <span>{walkon.overall} OVR</span>
                              <span className="flex">{starDisplay(walkon.starRating || 1)}</span>
                              {walkon.potential != null && (
                                <span>Pot: {walkon.signedTeamId ? getPotentialGrade(walkon.potential) : "???"}</span>
                              )}
                              <span
                                className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${
                                  walkon.batHand === "L"
                                    ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                    : walkon.batHand === "S"
                                    ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
                                    : "bg-muted/40 text-muted-foreground border-border/60"
                                }`}
                                data-testid={`badge-hand-walkon-${walkon.id}`}
                              >
                                B:{walkon.batHand || "R"} T:{walkon.throwHand || "R"}
                              </span>
                              {!["P", "SP", "RP", "CP"].includes(walkon.position) && walkon.trajectory != null && (
                                <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-walkon-${walkon.id}`}>
                                  {TRAJECTORY_LABELS[walkon.trajectory] ?? "LD"}
                                </span>
                              )}
                              <span className="flex items-center">
                                <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                {walkon.homeState}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Bid input — only shown when auction not yet resolved */}
                        {!isResolved && !isReady && (
                          <div className="mt-2 flex items-center gap-2" data-testid={`bid-row-${walkon.id}`}>
                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">$</span>
                              <input
                                type="number"
                                placeholder={hasBid ? `${(myBid / 1000).toFixed(0)}K (current)` : "e.g. 150 = $150K"}
                                value={inputVal}
                                onChange={e => setBidInputs(prev => ({ ...prev, [walkon.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") handlePlaceBid(walkon.id); }}
                                className="w-full pl-5 pr-2 py-1 text-xs bg-background border border-border/60 rounded focus:outline-none focus:border-gold/60 text-foreground"
                                min={1}
                                data-testid={`input-bid-${walkon.id}`}
                              />
                            </div>
                            <span className="text-[8px] text-muted-foreground whitespace-nowrap shrink-0">K = thousands</span>
                            {hasBid ? (
                              <div className="flex gap-1 shrink-0">
                                <RetroButton
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handlePlaceBid(walkon.id)}
                                  disabled={bidMutation.isPending || !inputVal}
                                  className="text-[9px] px-2"
                                  data-testid={`button-update-bid-${walkon.id}`}
                                >
                                  Update
                                </RetroButton>
                                <RetroButton
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeBidMutation.mutate(walkon.id)}
                                  disabled={removeBidMutation.isPending}
                                  className="text-[9px] px-2 text-red-400 hover:text-red-300"
                                  data-testid={`button-remove-bid-${walkon.id}`}
                                >
                                  Remove
                                </RetroButton>
                              </div>
                            ) : (
                              <RetroButton
                                variant="primary"
                                size="sm"
                                onClick={() => handlePlaceBid(walkon.id)}
                                disabled={bidMutation.isPending || !inputVal || maxForThis <= 0}
                                className="shrink-0"
                                data-testid={`button-place-bid-${walkon.id}`}
                              >
                                <Gavel className="w-3 h-3 mr-1" />
                                Bid
                              </RetroButton>
                            )}
                          </div>
                        )}

                        {/* Locked state */}
                        {!isResolved && isReady && hasBid && (
                          <p className="mt-1.5 text-[9px] text-muted-foreground">
                            Bid locked at <span className="text-gold">{fmtK(myBid)}</span>. Click "Locked In" to change.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {filteredPool.length === 0 && !persistedOutcomes && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {posFilter !== "all" ? `No walk-ons at ${posFilter}` : "No available walk-ons"}
                    </p>
                  )}
                  {/* Per-player card-level outcome display from persisted auction data.
                      Walk-on pool rows are deleted at phase advance; this renders from
                      the durable lastWalkonAuction snapshot so Won/Lost status remains
                      visible on individual player cards after resolution. */}
                  {filteredPool.length === 0 && persistedOutcomes && persistedOutcomes.length > 0 && (
                    <div className="space-y-2">
                      {persistedOutcomes.map(r => (
                        <div
                          key={r.walkonId}
                          className={`flex items-center justify-between p-2.5 rounded border ${
                            r.won
                              ? "bg-green-900/10 border-green-700/30"
                              : "bg-red-900/10 border-red-700/20"
                          }`}
                          data-testid={`pool-result-card-${r.walkonId}`}
                        >
                          <div className="flex items-center gap-2">
                            {r.won
                              ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              : <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                            <div>
                              <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                              <p className="text-[9px] text-muted-foreground">{r.position} • {r.overall} OVR</p>
                              {!r.won && r.winnerTeamName && (
                                <p className="text-[9px] text-muted-foreground">won by {r.winnerTeamName}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${r.won ? "text-green-400" : "text-red-400"}`}>
                              {fmtK(r.pricePaid)}
                            </p>
                            <p className="text-[8px] text-muted-foreground">
                              {r.won ? "paid" : "winner paid"} • your bid: {fmtK(r.yourBid)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>
        </div>
      </div>

      {/* Cut Confirmation */}
      <AlertDialog open={!!confirmCut} onOpenChange={(open) => { if (!open) setConfirmCut(null); }}>
        <AlertDialogContent className="bg-[#1a2e1a] border-[#3a5a3a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">Confirm Cut</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to cut{" "}
              <span className="text-foreground font-medium">
                {confirmCut?.firstName} {confirmCut?.lastName}
              </span>{" "}
              ({confirmCut?.position}, {confirmCut?.overall} OVR)? This player will be sent to JUCO.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cut">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-cut"
              onClick={() => {
                if (confirmCut) {
                  cutMutation.mutate(confirmCut.id);
                  setConfirmCut(null);
                }
              }}
            >
              <Scissors className="w-3 h-3 mr-1" />
              Cut Player
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auction Results Modal */}
      <Dialog
        open={!!auctionResults}
        onOpenChange={(open) => {
          if (!open) {
            setAuctionResults(null);
            setLocation(`/league/${id}`);
          }
        }}
      >
        <DialogContent className="bg-[#1a2e1a] border-[#3a5a3a] max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
              <Gavel className="w-4 h-4" />
              AUCTION RESULTS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" data-testid="auction-results-modal">
            {auctionResults && (
              <>
                {auctionResults.filter(r => r.won).length > 0 && (
                  <div>
                    <h3 className="font-pixel text-[9px] text-green-400 mb-2">PLAYERS WON</h3>
                    <div className="space-y-1.5">
                      {auctionResults.filter(r => r.won).map(r => (
                        <div
                          key={r.walkonId}
                          className="flex items-center justify-between p-2 rounded bg-green-900/20 border border-green-700/40"
                          data-testid={`result-won-${r.walkonId}`}
                        >
                          <div className="flex items-center gap-2">
                            <Trophy className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                              <p className="text-[9px] text-muted-foreground">{r.position} • {r.overall} OVR</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-green-400">{fmtK(r.pricePaid!)}</p>
                            <p className="text-[8px] text-muted-foreground">your bid: {fmtK(r.yourBid)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {auctionResults.filter(r => !r.won).length > 0 && (
                  <div>
                    <h3 className="font-pixel text-[9px] text-red-400 mb-2">OUTBID ON</h3>
                    <div className="space-y-1.5">
                      {auctionResults.filter(r => !r.won).map(r => (
                        <div
                          key={r.walkonId}
                          className="flex items-center justify-between p-2 rounded bg-red-900/10 border border-red-700/30"
                          data-testid={`result-lost-${r.walkonId}`}
                        >
                          <div className="flex items-center gap-2">
                            <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                              <p className="text-[9px] text-muted-foreground">{r.position} • {r.overall} OVR</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-muted-foreground">won by {r.winnerTeamName}</p>
                            <p className="text-sm font-medium text-red-400">{fmtK(r.pricePaid)}</p>
                            <p className="text-[8px] text-muted-foreground">your bid: {fmtK(r.yourBid)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {auctionResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No bids were placed this cycle.</p>
                )}

                <RetroButton
                  variant="primary"
                  className="w-full mt-2"
                  onClick={() => {
                    setAuctionResults(null);
                    setLocation(`/league/${id}`);
                  }}
                  data-testid="button-close-results"
                >
                  Continue to Spring Training
                </RetroButton>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedPlayer && (
        <PlayerProfileCard
          player={{
            ...selectedPlayer,
            bats: selectedPlayer.batHand,
            throws: selectedPlayer.throwHand,
          }}
          open={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          leagueId={id}
        />
      )}
    </div>
  );
}
