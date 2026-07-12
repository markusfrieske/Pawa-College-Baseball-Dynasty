import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { parseErrorMessage } from "@/lib/errorUtils";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Plus, Trophy, Users, Calendar, LogOut, Trash2, UserCheck, BookOpen, FolderOpen, GraduationCap, Eye, Crown, RotateCcw, Bot, Share2, Gem, TrendingUp, TrendingDown, Scale, Wind, ShieldCheck, Zap, Gauge, Shuffle, AlertOctagon, Sprout, ChevronRight, Swords, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { League, Team, Coach } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShareClassDialog } from "@/components/share-class-dialog";

interface LeagueWithDetails extends League {
  teams?: Team[];
  userCoach?: Coach;
  userTeam?: Team;
  commissionerTeamAbbr?: string | null;
  coCommTeamAbbrs?: string[];
}

interface SavedRoster {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  basedOn: string;
  rosterData: any[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface SavedRecruitingClass {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  recruitCount: number;
  classData: any[];
  createdAt: string | null;
  updatedAt: string | null;
}

export default function DashboardPage() {
  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: leagues, isLoading } = useQuery<LeagueWithDetails[]>({
    queryKey: ["/api/leagues"],
  });

  const { data: savedRosters = [], isLoading: rostersLoading } = useQuery<SavedRoster[]>({
    queryKey: ["/api/saved-rosters"],
  });

  const { data: savedRecruitingClasses = [], isLoading: classesLoading } = useQuery<SavedRecruitingClass[]>({
    queryKey: ["/api/saved-recruiting-classes"],
  });

  const activeLeagues = leagues?.filter(l => l.currentPhase !== "dynasty_setup") ?? [];
  const setupLeagues = leagues?.filter(l => l.currentPhase === "dynasty_setup") ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-background/95">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="link-home-logo">
            <div className="w-9 h-9 bg-gold rounded flex items-center justify-center shrink-0">
              <span className="text-forest-dark font-pixel text-[9px]">CBD</span>
            </div>
            <span className="font-pixel text-gold text-[11px] hidden sm:block leading-tight">
              College Baseball Dynasty
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-muted-foreground text-xs hidden sm:block truncate max-w-[180px]">
                {user.email}
              </span>
            )}
            <Link href="/">
              <RetroButton variant="outline" size="sm" data-testid="button-logout">
                <LogOut className="w-3.5 h-3.5" />
              </RetroButton>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero bar ────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-gold/5">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-pixel text-gold text-lg sm:text-xl mb-1">SELECT DYNASTY</h1>
              <p className="text-muted-foreground text-xs">
                {leagues && leagues.length > 0
                  ? `${leagues.length} dynasty${leagues.length !== 1 ? " files" : " file"} — choose one to continue`
                  : "No dynasty files found — create your first"}
              </p>
            </div>
            <Link href="/league/create">
              <RetroButton data-testid="button-create-dynasty" className="gap-2">
                <Plus className="w-4 h-4" />
                New Dynasty
              </RetroButton>
            </Link>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6 space-y-10 pb-16">

        {/* ── Dynasty Files (Active) ────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <RetroCard key={i} className="animate-pulse">
                <Skeleton className="h-5 w-40 mb-3" />
                <Skeleton className="h-24 w-full" />
              </RetroCard>
            ))}
          </div>
        ) : activeLeagues.length > 0 ? (
          <div>
            <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-widest mb-3">Active Dynasties</p>
            <div className="grid md:grid-cols-2 gap-4">
              {activeLeagues.map((league) => (
                <LeagueCard key={league.id} league={league} userId={user?.id} />
              ))}
            </div>
          </div>
        ) : !isLoading && setupLeagues.length === 0 ? (
          <EmptyState />
        ) : null}

        {/* ── Setup Files ──────────────────────────────────────────────────── */}
        {setupLeagues.length > 0 && (
          <div>
            <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-widest mb-3">Pending Setup</p>
            <div className="grid md:grid-cols-2 gap-4">
              {setupLeagues.map((league) => (
                <LeagueCard key={league.id} league={league} userId={user?.id} />
              ))}
            </div>
          </div>
        )}

        {/* ── Saved Rosters ────────────────────────────────────────────────── */}
        {(savedRosters.length > 0 || rostersLoading) && (
          <div>
            <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-widest mb-3" data-testid="section-rosters">Roster Files</p>
            {rostersLoading ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <RetroCard key={i}><Skeleton className="h-16 w-full" /></RetroCard>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {savedRosters.map((roster) => (
                  <SavedRosterCard key={roster.id} roster={roster} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Saved Recruiting Classes ─────────────────────────────────────── */}
        {(savedRecruitingClasses.length > 0 || classesLoading) && (
          <div>
            <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-widest mb-3" data-testid="section-recruiting">Recruiting Class Files</p>
            {classesLoading ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <RetroCard key={i}><Skeleton className="h-16 w-full" /></RetroCard>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {savedRecruitingClasses.map((rc) => (
                  <SavedRecruitingClassCard key={rc.id} rc={rc} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SavedRosterCard({ roster }: { roster: SavedRoster }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDetail, setShowDetail] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/saved-rosters/${roster.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-rosters"] });
      toast({ title: "Roster Deleted", description: `"${roster.name}" has been deleted.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete roster.", variant: "destructive" });
    },
  });

  const players: any[] = Array.isArray(roster.rosterData) ? roster.rosterData : [];
  const playerCount = players.length;
  const avgOvr = playerCount > 0
    ? Math.round(players.reduce((s: number, p: any) => s + (p.overall || 0), 0) / playerCount)
    : 0;
  const savedDate = roster.createdAt ? new Date(roster.createdAt).toLocaleDateString() : "";
  const byYear: Record<string, any[]> = {};
  for (const p of players) {
    const yr = p.year || p.eligibility || "—";
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(p);
  }

  return (
    <>
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer" data-testid={`card-saved-roster-${roster.id}`} onClick={() => setShowDetail(true)}>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-gold shrink-0" />
            <span className="font-pixel text-sm text-gold truncate">{roster.name}</span>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <RetroButton variant="ghost" size="sm" onClick={() => setShowDetail(true)} data-testid={`button-view-roster-${roster.id}`}>
              <Eye className="w-3 h-3 text-muted-foreground" />
            </RetroButton>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <RetroButton variant="ghost" size="sm" data-testid={`button-delete-roster-${roster.id}`}>
                  <Trash2 className="w-3 h-3 text-red-400" />
                </RetroButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Roster File</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{roster.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid={`button-confirm-delete-roster-${roster.id}`}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            {roster.basedOn && <span className="font-medium text-foreground/70">{roster.basedOn}</span>}
            {savedDate && <><span>·</span><span>{savedDate}</span></>}
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{playerCount} Players</p>
            </div>
            <div>
              <Trophy className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{avgOvr > 0 ? `${avgOvr} Avg OVR` : "—"}</p>
            </div>
          </div>
          {roster.description && (
            <p className="text-xs text-muted-foreground mt-3 italic">{roster.description}</p>
          )}
          <p className="text-xs text-gold/60 mt-3 text-right">Click to view roster →</p>
        </RetroCardContent>
      </RetroCard>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">{roster.name}</DialogTitle>
            {roster.basedOn && <p className="text-xs text-muted-foreground">{roster.basedOn}</p>}
          </DialogHeader>
          <div className="space-y-1 text-sm overflow-x-auto">
            <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground border-b border-border pb-1 mb-2 min-w-[280px]">
              <span>Name</span><span>Pos</span><span>Year</span><span className="text-right">OVR</span>
            </div>
            {players.sort((a, b) => (b.overall || 0) - (a.overall || 0)).map((p: any, i: number) => (
              <div key={i} className="grid grid-cols-4 gap-2 text-xs py-0.5 border-b border-border/30 min-w-[280px]">
                <span className="truncate">{p.name || `Player ${i + 1}`}</span>
                <span className="text-muted-foreground">{p.position || "—"}</span>
                <span className="text-muted-foreground">{p.year || p.eligibility || "—"}</span>
                <span className="text-right font-mono text-gold">{p.overall || "—"}</span>
              </div>
            ))}
            {players.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No player data in snapshot.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SavedRecruitingClassCard({ rc }: { rc: SavedRecruitingClass }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDetail, setShowDetail] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/saved-recruiting-classes/${rc.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      toast({ title: "Recruiting Class Deleted", description: `"${rc.name}" has been deleted.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete recruiting class.", variant: "destructive" });
    },
  });

  const recruits: any[] = Array.isArray(rc.classData) ? rc.classData : [];
  const classSize = recruits.length || rc.recruitCount;
  const committed = recruits.filter((r: any) => r.signedTeamId || r.stage === "signed").length;
  const savedDate = rc.createdAt ? new Date(rc.createdAt).toLocaleDateString() : "";

  return (
    <>
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer" data-testid={`card-saved-class-${rc.id}`} onClick={() => setShowDetail(true)}>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="w-4 h-4 text-gold shrink-0" />
            <span className="font-pixel text-sm text-gold truncate">{rc.name}</span>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <RetroButton variant="ghost" size="sm" onClick={() => setShowDetail(true)} data-testid={`button-view-class-${rc.id}`}>
              <Eye className="w-3 h-3 text-muted-foreground" />
            </RetroButton>
            <RetroButton
              variant="ghost"
              size="sm"
              onClick={() => setShareDialogOpen(true)}
              data-testid={`button-share-class-${rc.id}`}
            >
              <Share2 className="w-3 h-3 text-muted-foreground" />
            </RetroButton>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <RetroButton variant="ghost" size="sm" data-testid={`button-delete-class-${rc.id}`}>
                  <Trash2 className="w-3 h-3 text-red-400" />
                </RetroButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Recruiting Class</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{rc.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid={`button-confirm-delete-class-${rc.id}`}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            {rc.description && <span className="font-medium text-foreground/70">{rc.description}</span>}
            {savedDate && <><span>·</span><span>{savedDate}</span></>}
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <BookOpen className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{classSize} Recruits</p>
            </div>
            <div>
              <UserCheck className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{committed} Signed</p>
            </div>
          </div>
          <p className="text-xs text-gold/60 mt-3 text-right">Click to view class →</p>
        </RetroCardContent>
      </RetroCard>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">{rc.name}</DialogTitle>
            {rc.description && <p className="text-xs text-muted-foreground">Team: {rc.description}</p>}
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground border-b border-border pb-1 mb-2">
              <span>Name</span><span>Pos</span><span>Stars</span><span className="text-right">OVR</span>
            </div>
            {recruits.sort((a, b) => (b.stars || 0) - (a.stars || 0)).map((r: any, i: number) => (
              <div key={i} className="grid grid-cols-4 gap-2 text-xs py-0.5 border-b border-border/30">
                <span className="truncate">{r.name || `Recruit ${i + 1}`}</span>
                <span className="text-muted-foreground">{r.position || "—"}</span>
                <span className="text-yellow-400">{"★".repeat(r.stars || 0)}</span>
                <span className="text-right font-mono text-gold">{r.overallMin && r.overallMax ? `${r.overallMin}–${r.overallMax}` : (r.overall || "—")}</span>
              </div>
            ))}
            {recruits.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No recruit data in snapshot.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <ShareClassDialog
        classId={String(rc.id)}
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />
    </>
  );
}

function LeagueCard({ league, userId }: { league: LeagueWithDetails; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/leagues/${league.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({ title: "League Deleted", description: `"${league.name}" has been deleted.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Spring Training",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    players_leaving: "Players Leaving",
    offseason_recruiting_1: "Early Recruiting",
    offseason_recruiting_2: "Mid Recruiting",
    offseason_recruiting_3: "Late Recruiting",
    offseason_recruiting_4: "Final Recruiting",
    signing_day: "Decision Day",
  };

  const isPrimaryCommissioner = !!userId && userId === league.commissionerId;
  const coCommIds: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
  const isDelegate = !isPrimaryCommissioner && !!userId && coCommIds.includes(userId);
  const commLabel = league.commissionerTeamAbbr ?? "COMM";
  const coCommAbbrs: string[] = league.coCommTeamAbbrs ?? [];

  return (
    <RetroCard className="hover:border-gold/50 transition-colors" data-testid={`card-league-${league.id}`}>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <Link href={league.currentPhase === "dynasty_setup" ? `/league/${league.id}/dynasty-setup` : `/league/${league.id}`} className="truncate cursor-pointer hover:text-gold transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="truncate">{league.name}</span>
            {isPrimaryCommissioner ? (
              <div className="flex items-center gap-1 shrink-0" data-testid={`badge-commissioner-${league.id}`}>
                <Crown className="w-3 h-3 text-gold" />
                <Badge variant="outline" className="font-pixel text-[7px] text-gold border-gold/40 bg-gold/10">COMMISSIONER</Badge>
              </div>
            ) : (
              <div className="flex items-center gap-1 shrink-0" data-testid={`badge-commissioner-identity-${league.id}`}>
                <Crown className="w-3 h-3 text-gold" />
                <Badge variant="outline" className="font-pixel text-[7px] text-gold border-gold/40 bg-gold/10">COMM: {commLabel}</Badge>
              </div>
            )}
            {isDelegate && (
              <div className="flex items-center gap-1 shrink-0" data-testid={`badge-delegate-${league.id}`}>
                <Crown className="w-3 h-3 text-blue-400" />
                <Badge variant="outline" className="font-pixel text-[7px] text-blue-400 border-blue-400/40 bg-blue-400/10">DELEGATE</Badge>
              </div>
            )}
            {coCommAbbrs.filter(a => a !== league.userTeam?.abbreviation).map(abbr => (
              <div key={abbr} className="flex items-center gap-1 shrink-0" data-testid={`badge-delegate-identity-${abbr}-${league.id}`}>
                <Crown className="w-3 h-3 text-blue-400" />
                <Badge variant="outline" className="font-pixel text-[7px] text-blue-400 border-blue-400/40 bg-blue-400/10">DEL: {abbr}</Badge>
              </div>
            ))}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-muted-foreground whitespace-nowrap">
            Season {league.currentSeason}
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <RetroButton
                variant="ghost"
                size="sm"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                data-testid={`button-delete-league-${league.id}`}
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </RetroButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Dynasty</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{league.name}"? This will permanently remove all teams, players, games, and other data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid={`button-confirm-delete-league-${league.id}`}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Dynasty"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </RetroCardHeader>
      {league.userTeam?.isAutoPilot && (
        <div className="px-4 pb-2 pt-1">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded border border-blue-400/40 bg-blue-950/30 text-blue-300 text-xs"
            data-testid={`banner-autopilot-${league.id}`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0 text-blue-400" />
            <span>Your team is on <span className="font-pixel text-[9px] text-blue-400">AUTO-PILOT</span> — the CPU is managing your actions. Contact your commissioner to regain control.</span>
          </div>
        </div>
      )}
      {(league.currentPhase === "offseason_signing_day" || league.currentPhase === "offseason_walkons") && (
        <div className="px-4 pb-2 pt-1">
          <Link href={`/league/${league.id}/signing-day-reveal`}>
            <RetroButton
              variant="outline"
              size="sm"
              className="w-full text-gold border-gold/40 hover:border-gold"
              data-testid={`button-replay-signing-day-${league.id}`}
            >
              <RotateCcw className="w-3 h-3 mr-1.5" />
              Replay Signing Day →
            </RetroButton>
          </Link>
        </div>
      )}
      {["preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws"].includes(league.currentPhase) && league.currentClassVintage && (() => {
        const vintageConfig: Record<string, { label: string; colors: string; Icon: React.ElementType }> = {
          elite:            { label: "ELITE CLASS",           colors: "border-amber-500/30 text-amber-400",     Icon: Trophy        },
          gem_heavy:        { label: "GEM-HEAVY CLASS",       colors: "border-emerald-500/30 text-emerald-400", Icon: Gem           },
          strong:           { label: "STRONG CLASS",          colors: "border-green-500/30 text-green-400",     Icon: TrendingUp    },
          balanced:         { label: "BALANCED CLASS",        colors: "border-blue-500/30 text-blue-400",       Icon: Scale         },
          pitching_rich:    { label: "PITCHING-RICH CLASS",   colors: "border-sky-500/30 text-sky-400",         Icon: Wind          },
          position_players: { label: "POSITION PLAYER CLASS", colors: "border-cyan-500/30 text-cyan-400",       Icon: Users         },
          defense_first:    { label: "DEFENSE-FIRST CLASS",   colors: "border-teal-500/30 text-teal-400",       Icon: ShieldCheck   },
          power_class:      { label: "POWER CLASS",           colors: "border-rose-500/30 text-rose-400",       Icon: Zap           },
          speed_class:      { label: "SPEED CLASS",           colors: "border-violet-500/30 text-violet-400",   Icon: Gauge         },
          raw_talent:       { label: "RAW TALENT CLASS",      colors: "border-orange-500/30 text-orange-400",   Icon: Eye           },
          volatile:         { label: "VOLATILE CLASS",        colors: "border-yellow-500/30 text-yellow-400",   Icon: Shuffle       },
          bust_year:        { label: "BUST-HEAVY CLASS",      colors: "border-red-500/30 text-red-400",         Icon: AlertOctagon  },
          weak:             { label: "DOWN YEAR",             colors: "border-border/40 text-muted-foreground", Icon: TrendingDown  },
          late_bloomer:     { label: "LATE-BLOOMER CLASS",    colors: "border-lime-500/30 text-lime-400",       Icon: Sprout        },
          legacy:           { label: "LEGACY CLASS",          colors: "border-amber-600/30 text-amber-300",     Icon: Crown         },
        };
        const cfg = vintageConfig[league.currentClassVintage];
        if (!cfg) return null;
        const { Icon } = cfg;
        return (
          <div className="px-4 pb-2 pt-1">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${cfg.colors}`}
              data-testid={`banner-class-vintage-${league.id}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="font-pixel text-[8px] uppercase tracking-wider">{cfg.label}</span>
              <span className="text-[10px] opacity-60 ml-1">· Season {league.currentSeason}</span>
            </div>
          </div>
        );
      })()}

      <Link href={league.currentPhase === "dynasty_setup" ? `/league/${league.id}/dynasty-setup` : `/league/${league.id}`} className="cursor-pointer block">
        <RetroCardContent>
          {/* Team info row */}
          <div className="flex items-center gap-3 mb-4">
            {league.userTeam ? (
              <>
                <TeamBadge
                  abbreviation={league.userTeam.abbreviation}
                  primaryColor={league.userTeam.primaryColor}
                  secondaryColor={league.userTeam.secondaryColor}
                  name={league.userTeam.name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-foreground text-[10px] sm:text-xs truncate leading-tight">
                    {league.userTeam.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {league.userTeam.city}, {league.userTeam.state}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="w-4 h-4" />
                <span>No team selected yet</span>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-muted/30 rounded p-2 text-center border border-border/50">
              <p className="font-pixel text-gold text-[10px] leading-none mb-1">
                {league.currentSeason > 0 ? `S${league.currentSeason}` : "PRE"}
              </p>
              <p className="text-[9px] text-muted-foreground">Season</p>
            </div>
            <div className="bg-muted/30 rounded p-2 text-center border border-border/50">
              <p className="font-pixel text-foreground text-[10px] leading-none mb-1">
                {`W${league.currentWeek}`}
              </p>
              <p className="text-[9px] text-muted-foreground">Week</p>
            </div>
            <div className="bg-muted/30 rounded p-2 text-center border border-border/50">
              <p className="font-pixel text-foreground text-[10px] leading-none mb-1">
                {league.teams?.length || 0}/{league.maxTeams}
              </p>
              <p className="text-[9px] text-muted-foreground">Teams</p>
            </div>
          </div>

          {/* Phase + CTA row */}
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 font-pixel text-[8px] px-2 py-1 rounded border ${
              league.currentPhase === "dynasty_setup"
                ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"
                : ["regular_season", "conference_championship", "super_regionals", "cws"].includes(league.currentPhase)
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : "border-gold/40 text-gold bg-gold/10"
            }`}>
              {league.currentPhase === "dynasty_setup" ? (
                <><Star className="w-2.5 h-2.5" />SETUP</>
              ) : (
                <><Swords className="w-2.5 h-2.5" />{(phaseLabels[league.currentPhase] || league.currentPhase).toUpperCase()}</>
              )}
            </span>
            <span className="flex items-center gap-1 text-xs text-gold font-pixel text-[9px] group-hover:gap-2 transition-all">
              {league.currentPhase === "dynasty_setup" ? "RESUME SETUP" : "CONTINUE"}
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </RetroCardContent>
      </Link>
    </RetroCard>
  );
}

function EmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-12">
      <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
      <h2 className="font-pixel text-gold text-sm mb-2">No Dynasties Yet</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Create your first dynasty to start building your college baseball program.
        Compete against other coaches or CPU opponents.
      </p>
      <Link href="/league/create">
        <RetroButton data-testid="button-create-first-dynasty">
          <Plus className="w-4 h-4 mr-2" />
          Create Your First Dynasty
        </RetroButton>
      </Link>
    </RetroCard>
  );
}

function RosterEmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-8">
      <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-pixel text-muted-foreground text-xs mb-2">No Saved Rosters</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        Open your dynasty's roster page and use "Save Roster File" to create a snapshot here.
      </p>
    </RetroCard>
  );
}

function RecruitingEmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-8">
      <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-pixel text-muted-foreground text-xs mb-2">No Saved Recruiting Classes</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        Open your dynasty's recruiting page and use "Save Class File" to create a snapshot here.
      </p>
    </RetroCard>
  );
}
