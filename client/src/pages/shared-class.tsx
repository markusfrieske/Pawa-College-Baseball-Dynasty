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

interface SharedClass {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  recruitCount: number;
  classData: any;
  createdAt: string | null;
}

interface Recruit {
  firstName?: string;
  lastName?: string;
  name?: string;
  position: string;
  starRating: number;
  overall: number;
  homeState?: string;
  potential?: string;
  isBlueChip?: boolean;
  isGenerationalGem?: boolean;
  isGenerationalBust?: boolean;
  isGem?: boolean;
  isBust?: boolean;
}

function getRecruits(classData: any): Recruit[] {
  if (Array.isArray(classData)) return classData;
  if (classData && Array.isArray(classData.recruits)) return classData.recruits;
  return [];
}

function getTheme(classData: any): string | null {
  if (!classData || Array.isArray(classData)) return null;
  return classData.theme ?? null;
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

export default function SharedClassPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [imported, setImported] = useState(false);

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: rc, isLoading, error } = useQuery<SharedClass>({
    queryKey: ["/api/shared-class", code],
    queryFn: async () => {
      const res = await fetch(`/api/shared-class/${code}`, { credentials: "include" });
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
      const res = await apiRequest("POST", `/api/shared-class/${code}/import`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      setImported(true);
      toast({ title: "Class Imported", description: `"${rc?.name}" has been added to your library.` });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const isOwner = !!user && !!rc && user.id === rc.userId;

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

  if (error || !rc) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <RetroCard className="w-full max-w-md text-center">
          <RetroCardContent className="py-8">
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="font-pixel text-gold text-lg mb-2">Class Not Found</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-shared-class-error">
              This recruiting class link is invalid or no longer available.
            </p>
            <RetroButton onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </RetroButton>
          </RetroCardContent>
        </RetroCard>
      </div>
    );
  }

  const recruits = getRecruits(rc.classData);
  const theme = getTheme(rc.classData);
  const themeLabel = theme ? (THEME_LABELS[theme] ?? theme) : null;
  const savedDate = rc.createdAt ? new Date(rc.createdAt).toLocaleDateString() : null;

  const starDist = [5, 4, 3, 2, 1].map(s => ({
    star: s,
    count: recruits.filter(r => r.starRating === s || (r.isBlueChip && s === 5)).length,
  })).filter(x => x.count > 0);

  const blueChipCount = recruits.filter(r => r.isBlueChip).length;
  const genGemCount = recruits.filter(r => r.isGenerationalGem).length;
  const genBustCount = recruits.filter(r => r.isGenerationalBust).length;
  const avgOvr = recruits.length > 0
    ? Math.round(recruits.reduce((s, r) => s + (r.overall || 0), 0) / recruits.length)
    : 0;

  const posDist: Record<string, number> = {};
  recruits.forEach(r => { posDist[r.position] = (posDist[r.position] || 0) + 1; });
  const sortedPos = Object.entries(posDist).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="link-home-logo">
            <div className="w-8 h-8 bg-gold rounded-full flex items-center justify-center shrink-0">
              <span className="text-forest-dark font-pixel text-[8px]">CBD</span>
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
        <RetroCard className="mb-6" data-testid="card-shared-class-header">
          <RetroCardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h1 className="font-pixel text-gold text-lg mb-1" data-testid="text-shared-class-name">{rc.name}</h1>
                {rc.description && (
                  <p className="text-muted-foreground text-sm mb-2" data-testid="text-shared-class-desc">{rc.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]" data-testid="badge-recruit-count">
                    {rc.recruitCount} Recruits
                  </Badge>
                  {themeLabel && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/40">
                      {themeLabel}
                    </Badge>
                  )}
                  {savedDate && (
                    <span className="text-[10px] text-muted-foreground/60">Created {savedDate}</span>
                  )}
                </div>
              </div>

              {/* Import CTA */}
              <div className="shrink-0">
                {isOwner ? (
                  <Link href="/manage-recruiting">
                    <RetroButton variant="outline" size="sm" data-testid="button-go-to-library">
                      <BookOpen className="w-3 h-3 mr-2" />
                      My Library
                    </RetroButton>
                  </Link>
                ) : imported ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm font-pixel" data-testid="text-imported-success">
                    <CheckCircle2 className="w-4 h-4" />
                    Imported!
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
                    Import to My Library
                  </RetroButton>
                ) : (
                  <Link href={`/login?redirect=/shared-class/${code}`}>
                    <RetroButton size="sm" data-testid="button-login-to-import">
                      <LogIn className="w-3 h-3 mr-2" />
                      Sign In to Import
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
              <span className="font-pixel text-[10px] text-gold uppercase">Star Distribution</span>
            </RetroCardHeader>
            <RetroCardContent className="space-y-1.5">
              {starDist.length > 0 ? starDist.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2">
                  <span className={`text-xs w-16 shrink-0 ${STAR_COLORS[star] ?? "text-muted-foreground"}`}>
                    {"★".repeat(star)}
                  </span>
                  <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
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
              )) : (
                <p className="text-xs text-muted-foreground">No star data</p>
              )}
            </RetroCardContent>
          </RetroCard>

          <RetroCard data-testid="card-position-dist">
            <RetroCardHeader>
              <span className="font-pixel text-[10px] text-gold uppercase">Position Mix</span>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="grid grid-cols-3 gap-2">
                {sortedPos.map(([pos, count]) => (
                  <div key={pos} className="text-center">
                    <p className="font-pixel text-sm text-foreground">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{pos}</p>
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
              <span className="font-pixel text-[10px] text-gold uppercase">Recruits ({recruits.length})</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-5 gap-2 text-[10px] font-semibold text-muted-foreground border-b border-border px-3 py-1.5 min-w-[360px]">
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
                      : (r.name ?? `Recruit ${i + 1}`);
                    const isBC = r.isBlueChip;
                    const isGenGem = r.isGenerationalGem;
                    const isGenBust = r.isGenerationalBust;
                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-5 gap-2 text-xs px-3 py-1.5 border-b border-border/30 min-w-[360px] ${
                          isGenGem ? "bg-purple-950/30" :
                          isGenBust ? "bg-red-950/30" :
                          isBC ? "bg-amber-950/20" : ""
                        }`}
                        data-testid={`recruit-row-${i}`}
                      >
                        <span className="col-span-2 truncate">
                          {name}
                          {isBC && <span className="ml-1 text-[8px] text-amber-400">BC</span>}
                          {isGenGem && <span className="ml-1 text-[8px] text-purple-400">GG</span>}
                          {isGenBust && <span className="ml-1 text-[8px] text-red-400">GB</span>}
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

        {/* Bottom import CTA for non-owners */}
        {!isOwner && !imported && recruits.length > 0 && (
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
                Import to My Library
              </RetroButton>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Sign in to import this class into your library and use it in your dynasty.</p>
                <Link href={`/login?redirect=/shared-class/${code}`}>
                  <RetroButton data-testid="button-login-to-import-bottom">
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In to Import
                  </RetroButton>
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
