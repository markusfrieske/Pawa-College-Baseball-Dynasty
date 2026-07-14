import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Download, LogIn, CheckCircle2, BookOpen, Users } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ClassSummary {
  recruitCount: number;
  starDist: Record<number, number>;
  posDist: Record<string, number>;
  blueChips: number;
  gems: number;
  busts: number;
  genGems: number;
  genBusts: number;
  avgOvr: number;
  theme: string | null;
}

interface ClassPreview {
  shareId: string;
  token: string;
  label: string | null;
  importCount: number;
  createdAt: string | null;
  creatorDisplay: string | null;
  className: string;
  description: string | null;
  recruitCount: number;
  theme: string | null;
  summary?: ClassSummary;
  recruits: PreviewRecruit[];
}

interface PreviewRecruit {
  firstName?: string;
  lastName?: string;
  position: string;
  starRating: number;
  overall: number;
  isBlueChip?: boolean;
  isGenerationalGem?: boolean;
  isGenerationalBust?: boolean;
  isGem?: boolean;
  isBust?: boolean;
  recruitType?: string;
}

const THEME_LABELS: Record<string, string> = {
  balanced: "Balanced",
  high_velocity: "High Velocity",
  sluggers: "Sluggers",
  top_heavy: "Top Heavy",
  hidden_gems: "Hidden Gems",
  bust_heavy: "Bust Heavy",
  elite_pitching: "Elite Pitching",
  raw_talent: "Raw Talent",
  position_players: "Position Players",
  defense_first: "Defense First",
  power_class: "Power Class",
  speed_class: "Speed Class",
};

const STAR_COLORS: Record<number, string> = {
  5: "text-amber-400",
  4: "text-yellow-400",
  3: "text-blue-400",
  2: "text-gray-400",
  1: "text-zinc-500",
};

export default function ImportClassPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [imported, setImported] = useState(false);

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: preview, isLoading, error } = useQuery<ClassPreview>({
    queryKey: ["/api/import-class", token],
    queryFn: async () => {
      const res = await fetch(`/api/import-class/${token}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Not found");
      }
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/import-class/${token}`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      setImported(true);
      toast({ title: "Class Imported", description: `"${preview?.className}" has been added to your library.` });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <RetroCard className="w-full max-w-md text-center">
          <RetroCardContent className="py-8">
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="font-pixel text-gold text-lg mb-2">Link Unavailable</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-import-class-error">
              This share link is invalid, expired, or has been revoked by the owner.
            </p>
            <RetroButton onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </RetroButton>
          </RetroCardContent>
        </RetroCard>
      </div>
    );
  }

  const recruits = preview.recruits ?? [];
  const themeLabel = preview.theme ? (THEME_LABELS[preview.theme] ?? preview.theme) : null;

  // Use stored summary when available (versioned format), otherwise compute from preview recruits
  const storedSummary = preview.summary;

  const starDist = storedSummary
    ? [5, 4, 3, 2, 1]
        .filter(s => (storedSummary.starDist[s] ?? 0) > 0)
        .map(s => ({ star: s, count: storedSummary.starDist[s] }))
    : [5, 4, 3, 2, 1]
        .map(s => ({ star: s, count: recruits.filter(r => r.starRating === s).length }))
        .filter(x => x.count > 0);

  const blueChipCount = storedSummary ? storedSummary.blueChips : recruits.filter(r => r.isBlueChip).length;
  const genGemCount   = storedSummary ? storedSummary.genGems   : recruits.filter(r => r.isGenerationalGem).length;
  const genBustCount  = storedSummary ? storedSummary.genBusts  : recruits.filter(r => r.isGenerationalBust).length;
  const avgOvr = storedSummary
    ? storedSummary.avgOvr
    : recruits.length > 0
      ? Math.round(recruits.reduce((s, r) => s + (r.overall || 0), 0) / recruits.length)
      : 0;

  const sortedPos: [string, number][] = storedSummary
    ? Object.entries(storedSummary.posDist).sort((a, b) => b[1] - a[1])
    : (() => {
        const pd: Record<string, number> = {};
        recruits.forEach(r => { pd[r.position] = (pd[r.position] || 0) + 1; });
        return Object.entries(pd).sort((a, b) => b[1] - a[1]);
      })();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="link-home-logo">
            <div className="w-8 h-8 bg-gold rounded-full flex items-center justify-center shrink-0">
              <span className="text-forest-dark font-pixel text-xs">CBD</span>
            </div>
            <span className="font-pixel text-gold text-sm hidden sm:block">College Baseball Dynasty</span>
          </Link>
          {user ? (
            <Link href="/dashboard">
              <RetroButton variant="outline" size="sm" data-testid="button-dashboard">
                My Dashboard
              </RetroButton>
            </Link>
          ) : (
            <Link href="/login">
              <RetroButton size="sm" data-testid="button-login">
                <LogIn className="w-3 h-3 mr-2" />
                Sign In
              </RetroButton>
            </Link>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Class Header */}
        <RetroCard className="mb-6" data-testid="card-import-class-header">
          <RetroCardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h1 className="font-pixel text-gold text-lg mb-1" data-testid="text-import-class-name">{preview.className}</h1>
                {preview.description && (
                  <p className="text-muted-foreground text-sm mb-2" data-testid="text-import-class-desc">{preview.description}</p>
                )}
                {preview.creatorDisplay && (
                  <p className="text-xs text-muted-foreground/70 mb-2" data-testid="text-import-class-creator">
                    Shared by <span className="text-muted-foreground font-medium">{preview.creatorDisplay}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs" data-testid="badge-recruit-count">
                    {preview.recruitCount} Recruits
                  </Badge>
                  {themeLabel && (
                    <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40">
                      {themeLabel}
                    </Badge>
                  )}
                  {preview.importCount > 0 && (
                    <span className="text-xs text-muted-foreground/60">{preview.importCount} import{preview.importCount !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {imported ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm font-pixel" data-testid="text-imported-success">
                    <CheckCircle2 className="w-4 h-4" />
                    Saved!
                  </div>
                ) : user ? (
                  <RetroButton
                    size="sm"
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending}
                    data-testid="button-import-class"
                  >
                    {importMutation.isPending ? (
                      <div className="w-3 h-3 mr-2 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-3 h-3 mr-2" />
                    )}
                    Save to My Library
                  </RetroButton>
                ) : (
                  <Link href={`/login?redirect=/import-class/${token}`}>
                    <RetroButton size="sm" data-testid="button-login-to-import">
                      <LogIn className="w-3 h-3 mr-2" />
                      Sign In to Save
                    </RetroButton>
                  </Link>
                )}
              </div>
            </div>
          </RetroCardHeader>
        </RetroCard>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <RetroCard data-testid="stat-avg-ovr">
            <RetroCardContent className="py-3 text-center">
              <p className="font-pixel text-gold text-lg">{avgOvr || "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg OVR</p>
            </RetroCardContent>
          </RetroCard>
          <RetroCard data-testid="stat-blue-chips">
            <RetroCardContent className="py-3 text-center">
              <p className="font-pixel text-amber-400 text-lg">{blueChipCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Blue Chips</p>
            </RetroCardContent>
          </RetroCard>
          <RetroCard data-testid="stat-gen-gems">
            <RetroCardContent className="py-3 text-center">
              <p className="font-pixel text-purple-400 text-lg">{genGemCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Gen Gems</p>
            </RetroCardContent>
          </RetroCard>
          <RetroCard data-testid="stat-gen-busts">
            <RetroCardContent className="py-3 text-center">
              <p className="font-pixel text-red-400 text-lg">{genBustCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Gen Busts</p>
            </RetroCardContent>
          </RetroCard>
        </div>

        {/* Star Distribution + Position Mix */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <RetroCard data-testid="card-star-dist">
            <RetroCardHeader>
              <span className="font-pixel text-xs text-gold uppercase">Star Distribution</span>
            </RetroCardHeader>
            <RetroCardContent className="space-y-1.5">
              {starDist.length > 0 ? starDist.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2">
                  <span className={`text-xs w-16 shrink-0 ${STAR_COLORS[star] ?? "text-muted-foreground"}`}>
                    {"★".repeat(star)}
                  </span>
                  <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        star === 5 ? "bg-amber-400" :
                        star === 4 ? "bg-yellow-400" :
                        star === 3 ? "bg-blue-400" :
                        star === 2 ? "bg-gray-400" : "bg-zinc-600"
                      }`}
                      style={{ width: `${Math.round((count / recruits.length) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{count}</span>
                </div>
              )) : <p className="text-xs text-muted-foreground">No data</p>}
            </RetroCardContent>
          </RetroCard>

          <RetroCard data-testid="card-position-dist">
            <RetroCardHeader>
              <span className="font-pixel text-xs text-gold uppercase">Position Mix</span>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="grid grid-cols-3 gap-2">
                {sortedPos.map(([pos, count]) => (
                  <div key={pos} className="text-center">
                    <p className="font-pixel text-sm text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{pos}</p>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        </div>

        {/* Recruit List */}
        <RetroCard data-testid="card-recruit-list">
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <span className="font-pixel text-xs text-gold uppercase">Recruits ({recruits.length})</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-muted-foreground border-b border-border px-3 py-1.5 min-w-[360px]">
                <span className="col-span-2">Name</span>
                <span>Pos</span>
                <span>Stars</span>
                <span className="text-right">OVR</span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {recruits
                  .sort((a, b) => (b.starRating ?? 0) - (a.starRating ?? 0) || (b.overall ?? 0) - (a.overall ?? 0))
                  .map((r, i) => {
                    const name = r.firstName && r.lastName
                      ? `${r.firstName} ${r.lastName}`
                      : `Recruit ${i + 1}`;
                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-5 gap-2 text-xs px-3 py-1.5 border-b border-border/30 min-w-[360px] ${
                          r.isGenerationalGem ? "bg-purple-950/30" :
                          r.isGenerationalBust ? "bg-red-950/30" :
                          r.isBlueChip ? "bg-amber-950/20" : ""
                        }`}
                        data-testid={`recruit-row-${i}`}
                      >
                        <span className="col-span-2 truncate">
                          {name}
                          {r.isBlueChip && <span className="ml-1 text-xs text-amber-400">BC</span>}
                          {r.isGenerationalGem && <span className="ml-1 text-xs text-purple-400">GG</span>}
                          {r.isGenerationalBust && <span className="ml-1 text-xs text-red-400">GB</span>}
                        </span>
                        <span className="text-muted-foreground">{r.position}</span>
                        <span className={STAR_COLORS[r.starRating] ?? "text-muted-foreground"}>
                          {"★".repeat(Math.max(0, Math.min(5, r.starRating || 0)))}
                        </span>
                        <span className="text-right font-mono text-gold">{r.overall || "—"}</span>
                      </div>
                    );
                  })}
                {recruits.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No recruit data available.</p>
                )}
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        {/* Bottom CTA */}
        {!imported && recruits.length > 0 && (
          <div className="mt-6 text-center">
            {user ? (
              <RetroButton
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                data-testid="button-import-class-bottom"
              >
                {importMutation.isPending ? (
                  <div className="w-4 h-4 mr-2 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Save to My Library
              </RetroButton>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Sign in to save this class to your library and use it in your dynasty.</p>
                <Link href={`/login?redirect=/import-class/${token}`}>
                  <RetroButton data-testid="button-login-to-import-bottom">
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In to Save
                  </RetroButton>
                </Link>
              </div>
            )}
          </div>
        )}

        {imported && (
          <div className="mt-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-400 font-pixel text-sm" data-testid="text-imported-success-bottom">
              <CheckCircle2 className="w-5 h-5" />
              Class saved to your library!
            </div>
            <Link href="/manage-recruiting">
              <RetroButton variant="outline" data-testid="button-go-to-library">
                <BookOpen className="w-4 h-4 mr-2" />
                Open My Library
              </RetroButton>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
