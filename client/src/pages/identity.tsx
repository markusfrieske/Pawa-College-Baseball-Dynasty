/**
 * Team Identity Builder
 *
 * Coaches define their program style across 4 pillars:
 *   1. Offensive Identity — how the offense operates
 *   2. Pitching Identity  — how the staff is built/used
 *   3. Recruiting Pitch   — primary selling point to recruits
 *   4. Program Culture    — internal team environment
 *
 * Locked during active competition (regular season, postseason).
 * Mobile-first card layout with 44px+ touch targets.
 */
import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Lock, CheckCircle2, Zap, ShieldCheck, Users, BarChart3,
} from "lucide-react";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  OFFENSIVE_IDENTITIES,
  PITCHING_IDENTITIES,
  RECRUITING_PITCHES,
  PROGRAM_CULTURES,
  getOffensiveIdentity,
  getPitchingIdentity,
  getRecruitingPitch,
  getProgramCulture,
} from "@shared/programIdentity";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdentityData {
  offensiveIdentity: string;
  pitchingIdentity: string;
  recruitingPitch: string;
  programCulture: string;
  canEdit: boolean;
  currentPhase: string;
}

// ─── Option Card ──────────────────────────────────────────────────────────────

function OptionCard({
  id,
  icon,
  label,
  tagline,
  description,
  effect,
  selected,
  locked,
  onSelect,
  testId,
}: {
  id: string;
  icon: string;
  label: string;
  tagline: string;
  description: string;
  effect: string;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onSelect}
      disabled={locked}
      data-testid={testId}
      className={[
        "w-full text-left p-4 rounded-lg border-2 transition-all min-h-[80px]",
        "flex items-start gap-3",
        selected
          ? "border-gold bg-gold/10"
          : "border-border bg-card/50 hover:border-gold/50 hover:bg-card",
        locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm text-foreground">{label}</span>
          {selected && <CheckCircle2 className="w-3.5 h-3.5 text-gold flex-shrink-0" />}
        </div>
        <p className="text-xs text-gold/80 font-medium mb-1 italic">{tagline}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        <p className="text-xs text-blue-400/80 mt-1.5">{effect}</p>
      </div>
    </button>
  );
}

// ─── Pillar Section ───────────────────────────────────────────────────────────

function PillarSection({
  title,
  subtitle,
  icon: Icon,
  options,
  selected,
  locked,
  onSelect,
  testPrefix,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  options: ReadonlyArray<{
    id: string;
    icon: string;
    label: string;
    tagline: string;
    description: string;
    effect: string;
  }>;
  selected: string;
  locked: boolean;
  onSelect: (id: string) => void;
  testPrefix: string;
}) {
  return (
    <RetroCard className="mb-4">
      <RetroCardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gold" />
          <div>
            <h3 className="text-sm text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
      </RetroCardHeader>
      <RetroCardContent className="space-y-2">
        {options.map(opt => (
          <OptionCard
            key={opt.id}
            {...opt}
            selected={selected === opt.id}
            locked={locked}
            onSelect={() => onSelect(opt.id)}
            testId={`${testPrefix}-option-${opt.id}`}
          />
        ))}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function IdentitySummary({ identity }: { identity: IdentityData }) {
  const off  = getOffensiveIdentity(identity.offensiveIdentity);
  const pit  = getPitchingIdentity(identity.pitchingIdentity);
  const pitch = getRecruitingPitch(identity.recruitingPitch);
  const cult  = getProgramCulture(identity.programCulture);

  return (
    <RetroCard className="mb-4">
      <RetroCardContent className="py-3">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">
          Current Identity
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs gap-1 border-gold/40">
            <span>{off.icon}</span> {off.label} Offense
          </Badge>
          <Badge variant="outline" className="text-xs gap-1 border-gold/40">
            <span>{pit.icon}</span> {pit.label} Pitching
          </Badge>
          <Badge variant="outline" className="text-xs gap-1 border-gold/40">
            <span>{pitch.icon}</span> {pitch.label} Pitch
          </Badge>
          <Badge variant="outline" className="text-xs gap-1 border-gold/40">
            <span>{cult.icon}</span> {cult.label} Culture
          </Badge>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Phase-locked Banner ──────────────────────────────────────────────────────

function LockedBanner({ phase }: { phase: string }) {
  const phaseLabel = phase
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  return (
    <div className="flex items-center gap-2 p-3 mb-4 bg-amber-950/40 border border-amber-700/50 rounded-lg text-sm text-amber-400">
      <Lock className="w-4 h-4 flex-shrink-0" />
      <span className="text-xs">
        Identity is locked during <strong>{phaseLabel}</strong>. Changes can be made
        during the offseason or preseason.
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IdentityPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<IdentityData>({
    queryKey: ["/api/leagues", id, "identity"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/identity`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load identity");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<{
    offensiveIdentity: string;
    pitchingIdentity: string;
    recruitingPitch: string;
    programCulture: string;
  } | null>(null);

  useEffect(() => {
    if (data && !draft) {
      setDraft({
        offensiveIdentity: data.offensiveIdentity,
        pitchingIdentity:  data.pitchingIdentity,
        recruitingPitch:   data.recruitingPitch,
        programCulture:    data.programCulture,
      });
    }
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: async (updates: typeof draft) => {
      const res = await apiRequest("PATCH", `/api/leagues/${id}/identity`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "identity"] });
      toast({ title: "Identity Saved", description: "Your program identity has been updated." });
    },
    onError: (err: any) => {
      toast({
        title: "Save Failed",
        description: err?.message ?? "Could not save identity.",
        variant: "destructive",
      });
    },
  });

  const isDirty = data && draft && (
    draft.offensiveIdentity !== data.offensiveIdentity ||
    draft.pitchingIdentity  !== data.pitchingIdentity  ||
    draft.recruitingPitch   !== data.recruitingPitch   ||
    draft.programCulture    !== data.programCulture
  );

  if (isLoading || !data || !draft) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const locked = !data.canEdit;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href={`/league/${id}`}>
            <button
              type="button"
              className="p-2 rounded-lg border border-border hover:border-gold/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              data-testid="button-identity-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="font-display text-sm font-bold text-gold">Team Identity</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define your program's style across 4 pillars
            </p>
          </div>
          {locked && <Lock className="w-4 h-4 text-amber-400 ml-auto" />}
        </div>

        {locked && <LockedBanner phase={data.currentPhase} />}

        <IdentitySummary identity={{ ...data, ...draft }} />

        {/* Save bar (sticky at top when dirty) */}
        {isDirty && !locked && (
          <div className="sticky top-2 z-10 mb-4">
            <div className="flex items-center justify-between gap-3 p-3 bg-card border border-gold/40 rounded-lg shadow-lg">
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
              <div className="flex gap-2">
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({
                    offensiveIdentity: data.offensiveIdentity,
                    pitchingIdentity:  data.pitchingIdentity,
                    recruitingPitch:   data.recruitingPitch,
                    programCulture:    data.programCulture,
                  })}
                  data-testid="button-identity-discard"
                >
                  Discard
                </RetroButton>
                <RetroButton
                  size="sm"
                  onClick={() => saveMutation.mutate(draft)}
                  disabled={saveMutation.isPending}
                  data-testid="button-identity-save"
                >
                  {saveMutation.isPending ? "Saving…" : "Save Identity"}
                </RetroButton>
              </div>
            </div>
          </div>
        )}

        {/* Pillar 1: Offensive Identity */}
        <PillarSection
          title="Offensive Identity"
          subtitle="How your lineup operates at the plate"
          icon={Zap}
          options={OFFENSIVE_IDENTITIES}
          selected={draft.offensiveIdentity}
          locked={locked}
          onSelect={v => setDraft(d => d ? { ...d, offensiveIdentity: v } : d)}
          testPrefix="offensive"
        />

        {/* Pillar 2: Pitching Identity */}
        <PillarSection
          title="Pitching Identity"
          subtitle="How your staff is built and deployed"
          icon={ShieldCheck}
          options={PITCHING_IDENTITIES}
          selected={draft.pitchingIdentity}
          locked={locked}
          onSelect={v => setDraft(d => d ? { ...d, pitchingIdentity: v } : d)}
          testPrefix="pitching"
        />

        {/* Pillar 3: Recruiting Pitch */}
        <PillarSection
          title="Recruiting Pitch"
          subtitle="Your primary sell to prospective players"
          icon={Users}
          options={RECRUITING_PITCHES}
          selected={draft.recruitingPitch}
          locked={locked}
          onSelect={v => setDraft(d => d ? { ...d, recruitingPitch: v } : d)}
          testPrefix="recruiting-pitch"
        />

        {/* Pillar 4: Program Culture */}
        <PillarSection
          title="Program Culture"
          subtitle="The internal environment you build"
          icon={BarChart3}
          options={PROGRAM_CULTURES}
          selected={draft.programCulture}
          locked={locked}
          onSelect={v => setDraft(d => d ? { ...d, programCulture: v } : d)}
          testPrefix="culture"
        />

        {/* Bottom save button */}
        {!locked && (
          <div className="pb-8 pt-2">
            <RetroButton
              className="w-full"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending || !isDirty}
              data-testid="button-identity-save-bottom"
            >
              {saveMutation.isPending ? "Saving…" : isDirty ? "Save Identity" : "No Changes"}
            </RetroButton>
          </div>
        )}
      </div>
    </div>
  );
}
