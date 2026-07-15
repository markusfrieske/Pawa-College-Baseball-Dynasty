import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Download, LogIn, CheckCircle2, BookOpen, Users, Lock,
} from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ClassSummary {
  recruitCount: number;
  starDist: Record<number, number>;
  posDist: Record<string, number>;
  regionDist: Record<string, number>;
  theme: string | null;
}

interface PreviewRecruit {
  firstName?: string;
  lastName?: string;
  position: string;
  homeState?: string | null;
  starRating: number;
  recruitType?: string;
}

interface ClassSharePreview {
  shareId: string;
  versionNumber: number | null;
  sourceType: string | null;
  isSealed: boolean;
  contentHash: string | null;
  schemaVersion: number;
  label: string | null;
  importCount: number;
  maxImports: number | null;
  expiresAt: string | null;
  createdAt: string | null;
  creatorDisplay: string | null;
  className: string | null;
  description: string | null;
  recruitCount: number;
  theme: string | null;
  summary?: ClassSummary;
  recruits: PreviewRecruit[];
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

const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  procedural: "Wizard-generated",
  legacy: "Classic",
};

export default function ClassSharePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [imported, setImported] = useState(false);

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: preview, isLoading, error } = useQuery<ClassSharePreview>({
    queryKey: ["/api/class-share", token, "preview"],
    queryFn: async () => {
      const res = await fetch(`/api/class-share/${token}/preview`, { credentials: "include" });
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
      const res = await apiRequest("POST", `/api/class-share/${token}/import`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      setImported(true);
      toast({
        title: "Class Imported",
        description: `"${preview?.className}" has been added to your library.`,
      });
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
            <h2 className="text-gold text-lg mb-2">Link Unavailable</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-class-share-error">
              This share link is invalid, expired, has been revoked, or has reached its import limit.
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
  const storedSummary = preview.summary;

  const starDist = storedSummary
    ? [5, 4, 3, 2, 1]
        .filter(s => (storedSummary.starDist[s] ?? 0) > 0)
        .map(s => ({ star: s, count: storedSummary.starDist[s] }))
    : [5, 4, 3, 2, 1]
        .map(s => ({ star: s, count: recruits.filter(r => r.starRating === s).length }))
        .filter(x => x.count > 0);

  const sortedPos: [string, number][] = storedSummary
    ? Object.entries(storedSummary.posDist).sort((a, b) => b[1] - a[1])
    : (() => {
        const pd: Record<string, number> = {};
        recruits.forEach(r => { pd[r.position] = (pd[r.position] || 0) + 1; });
        return Object.entries(pd).sort((a, b) => b[1] - a[1]);
      })();

  const sortedRegions: [string, number][] = storedSummary?.regionDist
    ? Object.entries(storedSummary.regionDist).sort((a, b) => b[1] - a[1])
    : [];

  const totalCount = storedSummary?.recruitCount ?? recruits.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="link-home-logo">
            <div className="w-8 h-8 bg-gold rounded-full flex items-center justify-center shrink-0">
              <span className="text-forest-dark text-xs font-semibold">CBD</span>
            </div>
            <span className="text-gold text-sm hidden sm:block">College Baseball Dynasty</span>
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
        <RetroCard className="mb-6" data-testid="card-class-share-header">
          <RetroCardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-gold text-lg mb-1" data-testid="text-class-share-name">
                  {preview.className ?? "Recruiting Class"}
                </h1>
                {preview.description && (
                  <p className="text-muted-foreground text-sm mb-2" data-testid="text-class-share-desc">
                    {preview.description}
                  </p>
                )}
                {preview.creatorDisplay && (
                  <p className="text-xs text-muted-foreground/70 mb-2" data-testid="text-class-share-creator">
                    Shared by{" "}
                    <span className="text-muted-foreground font-medium">{preview.creatorDisplay}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs" data-testid="badge-recruit-count">
                    {preview.recruitCount} Recruits
                  </Badge>
                  {preview.versionNumber != null && (
                    <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40">
                      v{preview.versionNumber}
                    </Badge>
                  )}
                  {preview.isSealed && (
                    <Badge variant="secondary" className="text-xs text-amber-400 border-amber-400/30">
                      <Lock className="w-2.5 h-2.5 mr-1" />
                      Sealed Pack
                    </Badge>
                  )}
                  {preview.sourceType && (
                    <span className="text-xs text-muted-foreground/60">
                      {SOURCE_TYPE_LABELS[preview.sourceType] ?? preview.sourceType}
                    </span>
                  )}
                  {themeLabel && (
                    <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40">
                      {themeLabel}
                    </Badge>
                  )}
                  {preview.importCount > 0 && (
                    <span className="text-xs text-muted-foreground/60">
                      {preview.importCount} import{preview.importCount !== 1 ? "s" : ""}
                      {preview.maxImports != null ? ` / ${preview.maxImports} max` : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {imported ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm" data-testid="text-imported-success">
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
                  <Link href={`/login?redirect=/class-share/${token}`}>
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

        {preview.isSealed && (
          <div className="mb-4 p-3 rounded border border-amber-400/20 bg-amber-400/5 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/80">
              This is a Sealed Pack — ratings, abilities, and hidden attributes are kept secret until you recruit each player in-game.
            </p>
          </div>
        )}

        {/* Star + Position distribution */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <RetroCard data-testid="card-star-dist">
            <RetroCardHeader>
              <span className="text-xs font-semibold text-gold uppercase">Star Distribution</span>
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
                      style={{ width: `${Math.round((count / totalCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{count}</span>
                </div>
              )) : <p className="text-xs text-muted-foreground">No data</p>}
            </RetroCardContent>
          </RetroCard>

          <RetroCard data-testid="card-position-dist">
            <RetroCardHeader>
              <span className="text-xs font-semibold text-gold uppercase">Position Mix</span>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="grid grid-cols-3 gap-2">
                {sortedPos.map(([pos, count]) => (
                  <div key={pos} className="text-center">
                    <p className="font-display text-sm font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{pos}</p>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        </div>

        {sortedRegions.length > 0 && (
          <RetroCard className="mb-6" data-testid="card-region-dist">
            <RetroCardHeader>
              <span className="text-xs font-semibold text-gold uppercase">Region Mix</span>
            </RetroCardHeader>
            <RetroCardContent className="space-y-1.5">
              {sortedRegions.map(([region, count]) => (
                <div key={region} className="flex items-center gap-2">
                  <span className="text-xs w-24 shrink-0 text-muted-foreground">{region}</span>
                  <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gold/60"
                      style={{ width: `${Math.round((count / totalCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{count}</span>
                </div>
              ))}
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Recruit list — spoiler-safe */}
        <RetroCard data-testid="card-recruit-list">
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <span className="text-xs font-semibold text-gold uppercase">
                Recruits ({recruits.length})
              </span>
              {preview.isSealed && (
                <span className="text-xs text-amber-400/70">(sealed)</span>
              )}
            </div>
          </RetroCardHeader>
          <RetroCardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground border-b border-border px-3 py-1.5 min-w-[300px]">
                <span className="col-span-2">Name</span>
                <span>Pos</span>
                <span>Stars</span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {recruits
                  .sort((a, b) => (b.starRating ?? 0) - (a.starRating ?? 0))
                  .map((r, i) => {
                    const name = r.firstName && r.lastName
                      ? `${r.firstName} ${r.lastName}`
                      : `Recruit ${i + 1}`;
                    const isTransfer = r.recruitType === "TRANSFER";
                    const isJuco = r.recruitType === "JUCO";
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-4 gap-2 text-xs px-3 py-1.5 border-b border-border/30 min-w-[300px]"
                        data-testid={`recruit-row-${i}`}
                      >
                        <span className="col-span-2 truncate">
                          {name}
                          {isTransfer && <span className="ml-1 text-xs text-purple-400">TR</span>}
                          {isJuco && <span className="ml-1 text-xs text-cyan-400">JC</span>}
                        </span>
                        <span className="text-muted-foreground">{r.position}</span>
                        <span className={STAR_COLORS[r.starRating] ?? "text-muted-foreground"}>
                          {"★".repeat(Math.max(0, Math.min(5, r.starRating || 0)))}
                        </span>
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
                <p className="text-sm text-muted-foreground">
                  Sign in to save this class to your library and use it in your dynasty.
                </p>
                <Link href={`/login?redirect=/class-share/${token}`}>
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
            <div
              className="flex items-center justify-center gap-2 text-green-400 font-display text-sm font-bold"
              data-testid="text-imported-success-bottom"
            >
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
