import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, RefreshCw, Trash2,
  Loader2, CheckCircle2, Wand2, Save, AlertCircle, Pencil,
} from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { PlayerProfileCard } from "@/components/player-profile-card";
import type { Player } from "@/components/player-profile-card";
import { PlayerAvatar } from "@/components/player-avatar";
import type { WizardConfig, WizardCastMember, WizardStoryPlan } from "@shared/schema";
import { getPotentialGrade, POTENTIAL_GRADES } from "@shared/potential";
import { getAbilitiesForPosition, MAX_SPECIAL_ABILITIES } from "@shared/abilities";
import { PITCH_DEFS } from "@shared/pitchDefs";

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardRecruit = {
  _tempId: string;
  /** Stable UUID baked in at generation time; survives save/load cycles. Used by Story Cast. */
  templateRecruitId: string;
  firstName: string;
  lastName: string;
  position: string;
  recruitYear: string;
  homeState: string;
  hometown: string;
  starRating: number;
  starRank: number;
  overall: number;
  hitForAvg: number;
  power: number;
  speed: number;
  arm: number;
  fielding: number;
  velocity: number;
  control: number;
  stamina: number;
  stuff: number;
  potential: number | null;
  isBlueChip: boolean;
  isGem: boolean;
  isBust: boolean;
  isGenerationalGem: boolean;
  isGenerationalBust: boolean;
  recruitType: string;
  abilities: string[];
  [key: string]: any;
};

interface Props {
  open: boolean;
  onClose: () => void;
  leagueId?: string;
  projectId?: string;
  onSaved?: () => void;
  onSavedToLibrary?: () => void;
  user?: { id: string; email: string } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const THEMES = [
  { id: "balanced",        label: "Balanced",        desc: "Standard mix of all archetypes" },
  { id: "high_velocity",   label: "High Velocity",   desc: "Velocity-heavy pitching class" },
  { id: "sluggers",        label: "Sluggers",         desc: "Power-heavy hitting class" },
  { id: "top_heavy",       label: "Top Heavy",        desc: "Concentrated elite talent" },
  { id: "hidden_gems",     label: "Hidden Gems",      desc: "Underrated talent scattered throughout" },
  { id: "bust_heavy",      label: "Bust Heavy",       desc: "Volatile class with high busts" },
  { id: "elite_pitching",  label: "Elite Pitching",   desc: "Top-tier pitching staff depth" },
  { id: "raw_talent",      label: "Raw Talent",       desc: "Unpolished prospects with upside" },
  { id: "position_players",label: "Position Players", desc: "Strong hitter-heavy class" },
  { id: "defense_first",   label: "Defense First",    desc: "Glove-first fielding specialists" },
  { id: "power_class",     label: "Power Class",      desc: "Corner bats and power hitters" },
  { id: "speed_class",     label: "Speed Class",      desc: "Athletic and speedy outfielders" },
];

const REGION_SKEWS = [
  { id: "none",       label: "No Skew",           desc: "National distribution (default)" },
  { id: "southeast",  label: "Southeast",         desc: "Boost GA, FL, NC, SC, AL, TN, VA, MS, LA, AR" },
  { id: "sunbelt",    label: "Sun Belt",           desc: "Boost FL, TX, GA, AL, AZ, CA, NM" },
  { id: "texas",      label: "Texas",              desc: "Heavy TX concentration" },
  { id: "california", label: "California",         desc: "Heavy CA concentration" },
  { id: "northeast",  label: "Northeast",          desc: "Boost NY, PA, NJ, MA, CT, MD, RI" },
  { id: "midwest",    label: "Midwest",            desc: "Boost OH, IL, IN, MI, MO, MN, IA, KS" },
];

const DEFAULT_CONFIG: WizardConfig = {
  count: 80,
  theme: "balanced",
  label: "",
  starDistribution: { blueChip: 3, five: 5, four: 12, three: 60, two: 15, one: 5 },
  specialCounts: { gems: 0, busts: 0, genGems: 1, genBusts: 1, blueChips: 2, jucos: 5, rawPlayers: 5, lateBloomers: 0, overdrafts: 0 },
  positionDistribution: { P: 40, C: 8, "1B": 7, "2B": 7, "3B": 7, SS: 7, OF: 24 },
  regionSkew: "none",
  fogDensity: 100,
  ovrMin: 150,
  ovrMax: 650,
  ovrAverage: 300,
  ovrDistribution: "bell",
};

const TOTAL_STEPS = 11;

// ─── Helpers ────────────────────────────────────────────────────────────────

function tempId() {
  return Math.random().toString(36).slice(2, 10);
}

function starLabel(n: number) {
  return "★".repeat(Math.max(0, Math.min(5, n)));
}

function rowBg(r: WizardRecruit) {
  if (r.isGenerationalGem)  return "bg-purple-950/40 border-l-2 border-purple-400";
  if (r.isGenerationalBust) return "bg-red-950/40 border-l-2 border-red-400";
  if (r.isBlueChip)         return "bg-amber-950/30 border-l-2 border-amber-400";
  if (r.isGem)              return "bg-green-950/20";
  if (r.isBust)             return "bg-orange-950/20";
  return "";
}

function typeBadges(r: WizardRecruit) {
  const badges: { label: string; cls: string }[] = [];
  if (r.isGenerationalGem)  badges.push({ label: "GEN GEM", cls: "bg-purple-600 text-white" });
  if (r.isGenerationalBust) badges.push({ label: "GEN BUST", cls: "bg-red-700 text-white" });
  if (r.isBlueChip)         badges.push({ label: "BLUE CHIP", cls: "bg-amber-500 text-black" });
  if (!r.isBlueChip && r.isGem)  badges.push({ label: "GEM",  cls: "bg-green-600 text-white" });
  if (!r.isBlueChip && r.isBust) badges.push({ label: "BUST", cls: "bg-orange-600 text-white" });
  if (r.recruitType === "JUCO")  badges.push({ label: "JUCO", cls: "bg-cyan-700 text-white" });
  return badges;
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

// Story archetype metadata (mirrors ARCHETYPES in storylineEngine.ts — client-side copy)
const STORY_ARCHETYPES: {
  id: string;
  name: string;
  desc: string;
  polarity: "positive" | "volatile" | "negative";
  pitcherOnly?: boolean;
  hitterOnly?: boolean;
}[] = [
  { id: "late_bloomer",          name: "Late Bloomer",          desc: "Starts slow, peaks late. Likely positive long-term arc.",    polarity: "positive" },
  { id: "velocity_freak",        name: "Velocity Freak",        desc: "Arm talent with control volatility. High variance.",          polarity: "volatile",  pitcherOnly: true },
  { id: "swing_rebuild",         name: "Swing Rebuild",         desc: "Mechanics overhaul underway. Uncertain near-term.",           polarity: "volatile",  hitterOnly: true },
  { id: "position_change",       name: "Position Change",       desc: "Adapting to a new role. High upside, real risk.",             polarity: "volatile" },
  { id: "summer_breakout",       name: "Summer Breakout",       desc: "Showcase heroics boost profile. Mostly positive.",            polarity: "positive" },
  { id: "social_media_star",     name: "Social Media Star",     desc: "Viral attention drives competing offers.",                    polarity: "volatile" },
  { id: "confidence_crisis",     name: "Confidence Crisis",     desc: "Self-doubt mid-process. Likely negative arc.",               polarity: "negative" },
  { id: "burnout_candidate",     name: "Burnout Risk",          desc: "Overuse looms. Physical conditioning concern.",              polarity: "negative" },
  { id: "injury_risk",           name: "Medical Watch",         desc: "Arm health under scrutiny. High downside risk.",             polarity: "negative",  pitcherOnly: true },
  { id: "academic_concern",      name: "Academic Concern",      desc: "Eligibility status uncertain. Negative pressure.",           polarity: "negative" },
  { id: "transfer_rumors",       name: "Transfer Rumors",       desc: "Program loyalty in question. Volatile arc.",                 polarity: "volatile" },
  { id: "two_sport_athlete",     name: "Two-Sport Decision",    desc: "Football or baseball? Decision pending.",                    polarity: "volatile" },
  { id: "knuckleball_specialist",name: "Knuckleball Spec.",     desc: "Unconventional arm — hard to evaluate.",                    polarity: "volatile",  pitcherOnly: true },
  { id: "rivalry_recruit",       name: "Rivalry Recruit",       desc: "Programs in a bidding war. Drama ensues.",                  polarity: "volatile" },
  { id: "generational_prodigy",  name: "Generational Prodigy",  desc: "Legendary upside. Elite potential ceiling.",                 polarity: "positive" },
  { id: "financial_pressure",    name: "Financial Pressure",    desc: "NIL concerns create decision complexity.",                   polarity: "negative" },
  { id: "coaching_change",       name: "Coaching Change",       desc: "Staff uncertainty clouds commitment.",                       polarity: "volatile" },
  { id: "first_gen_student",     name: "First-Gen Student",     desc: "Family sacrifice drives elite work ethic.",                 polarity: "positive" },
  { id: "draft_agent_pressure",  name: "Draft Agent Pressure",  desc: "Pro day looms. Every showcase week matters.",               polarity: "volatile" },
  { id: "small_town_hero",       name: "Small Town Hero",       desc: "Raw tools, unpolished. High ceiling upside.",               polarity: "positive" },
];

/** OVR delta ranges by polarity for Playtest simulation. */
const POLARITY_RANGES = {
  positive: { min: +8,  max: +40, median: +20 },
  volatile: { min: -20, max: +30, median:  +5 },
  negative: { min: -30, max:  +5, median: -15 },
};

function StepIndicator({ step }: { step: number }) {
  const labels = ["Settings", "Stars", "Specials", "Advanced", "OVR", "Generate", "Cast", "Arcs", "Playtest", "Review", "Save"];
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide pb-1">
      {labels.map((lbl, idx) => {
        const s = idx + 1;
        const active = s === step;
        const done   = s < step;
        return (
          <div key={s} className="flex items-center">
            <div className={`flex flex-col items-center min-w-[52px] ${active ? "opacity-100" : done ? "opacity-60" : "opacity-30"}`}>
              <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                active ? "bg-gold text-forest-dark" : done ? "bg-gold/40 text-gold" : "bg-border text-muted-foreground"}`}>
                {s}
              </div>
              <span className="text-xs font-semibold mt-0.5 text-center leading-tight">{lbl}</span>
            </div>
            {idx < labels.length - 1 && (
              <div className={`h-0.5 w-4 mx-0.5 mt-[-8px] ${done ? "bg-gold/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Assist Panel ─────────────────────────────────────────────────────────

type AiJobType = "theme_draft" | "cast_proposal" | "arc_draft" | "text_rewrite";

interface AiAssistPanelProps {
  projectId?: string;
  jobType: AiJobType;
  metadata?: Record<string, unknown>;
  placeholder?: string;
  onAccept: (data: Record<string, unknown>) => void;
  buttonLabel?: string;
}

function AiAssistPanel({
  projectId,
  jobType,
  metadata,
  placeholder = "Describe what you want…",
  onAccept,
  buttonLabel = "AI Assist",
}: AiAssistPanelProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);

  const submit = async () => {
    if (!projectId || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentJobId(null);
    try {
      const res = await apiRequest("POST", `/api/class-projects/${projectId}/ai-jobs`, {
        jobType,
        prompt: prompt.trim(),
        metadata: metadata ?? {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setError(`Rate limit: ${err.error ?? "Too many AI jobs. Try again later."}`);
        } else {
          setError(err.error ?? "Request failed.");
        }
        return;
      }
      const data = await res.json();
      const job = data.job;
      setCurrentJobId(job?.id ?? null);
      // Show AI result if available, otherwise fall back to procedural suggestion
      setResult(job?.responseJson ?? job?.fallbackJson ?? null);
      if (data.quotaLimit != null) {
        setQuota({ used: data.quotaUsed ?? 0, limit: data.quotaLimit });
      }
    } catch {
      setError("Could not reach the AI service. A procedural suggestion may be available.");
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!result) return;
    // Persist accept outcome server-side for audit trail
    if (projectId && currentJobId) {
      try {
        await apiRequest("POST", `/api/class-projects/${projectId}/ai-jobs/${currentJobId}/accept`, {});
      } catch {
        // Non-blocking — local state still applied
      }
    }
    onAccept(result);
    setOpen(false);
    setPrompt("");
    setResult(null);
    setCurrentJobId(null);
    setError(null);
  };

  const discard = async () => {
    // Persist reject outcome server-side for audit trail
    if (projectId && currentJobId) {
      try {
        await apiRequest("DELETE", `/api/class-projects/${projectId}/ai-jobs/${currentJobId}`, undefined);
      } catch {
        // Non-blocking
      }
    }
    setResult(null);
    setCurrentJobId(null);
    setError(null);
  };

  const disabled = !projectId;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        disabled={disabled}
        title={disabled ? "Save class to Library first to enable AI Assist" : undefined}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-all ${
          disabled
            ? "border-border text-muted-foreground/40 cursor-not-allowed"
            : open
              ? "border-gold bg-gold/10 text-gold"
              : "border-border text-muted-foreground hover:border-gold/50 hover:text-gold"
        }`}
        data-testid="ai-assist-toggle"
      >
        <Wand2 className="w-3 h-3" />
        {buttonLabel}
        {!disabled && quota && (
          <span className="text-muted-foreground/60 ml-1">({quota.limit - quota.used} left)</span>
        )}
      </button>

      {open && !disabled && (
        <div className="mt-2 rounded border border-gold/30 bg-card p-3 space-y-2.5">
          <p className="text-xs text-muted-foreground">
            Describe what you want — the AI will draft a suggestion. You must accept it to apply.
          </p>
          <textarea
            className="w-full bg-background border border-border rounded text-xs p-2 resize-none h-16 focus:outline-none focus:border-gold/50"
            placeholder={placeholder}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            maxLength={1000}
            data-testid="ai-assist-prompt"
          />
          <div className="flex items-center gap-2">
            <RetroButton
              variant="outline"
              className="text-xs py-1 px-2.5 h-auto"
              onClick={submit}
              disabled={loading || !prompt.trim()}
              data-testid="ai-assist-submit"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
            </RetroButton>
            <button type="button" className="text-xs text-muted-foreground hover:text-white" onClick={() => setOpen(false)}>
              Close
            </button>
            {quota && (
              <span className="ml-auto text-xs text-muted-foreground/50">{quota.limit - quota.used}/{quota.limit} remaining</span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2 rounded border border-red-500/30 bg-red-900/10 text-red-300 text-xs">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="rounded border border-green-500/30 bg-green-900/10 p-2.5 space-y-2">
              <div className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                {(result as any).aiAssisted === false ? "Procedural Suggestion" : "AI Suggestion"}
              </div>

              {/* ── arc_draft: show chapters with clickable choices ── */}
              {jobType === "arc_draft" && Array.isArray((result as any).chapters) ? (
                <div className="space-y-2">
                  {((result as any).chapters as Array<{ title: string; eventText: string; choices: Array<{ label: string; outcomeText: string; effectPreset: string }> }>).map((ch, ci) => (
                    <div key={ci} className="rounded border border-border/50 bg-background/60 p-2">
                      <div className="text-xs font-semibold text-gold mb-0.5">Ch {ci + 1}: {ch.title}</div>
                      <div className="text-xs text-muted-foreground mb-1.5 leading-relaxed">{ch.eventText}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ch.choices.map((choice, ki) => (
                          <div key={ki} className="rounded border border-gold/20 bg-gold/5 p-1.5">
                            <div className="text-xs font-medium text-gold/90 mb-0.5">{choice.label}</div>
                            <div className="text-xs text-muted-foreground leading-tight">{choice.outcomeText}</div>
                            {choice.effectPreset && choice.effectPreset !== "none" && (
                              <div className="text-xs text-muted-foreground/50 mt-0.5 italic">{choice.effectPreset.replace(/_/g, " ")}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : jobType === "text_rewrite" && (result as any).rewrittenText ? (
                /* ── text_rewrite: before/after diff view ── */
                <div className="space-y-1.5">
                  {(metadata as any)?.originalText && (
                    <div className="rounded border border-red-500/20 bg-red-900/10 p-2">
                      <div className="text-xs font-semibold text-red-400 mb-1">Before</div>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{(metadata as any).originalText}</p>
                    </div>
                  )}
                  <div className="rounded border border-green-500/20 bg-green-900/10 p-2">
                    <div className="text-xs font-semibold text-green-400 mb-1">After</div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{(result as any).rewrittenText}</p>
                  </div>
                </div>
              ) : (
                /* ── fallback: compact key/value display for theme_draft / cast_proposal ── */
                <div className="space-y-1">
                  {Object.entries(result)
                    .filter(([k]) => k !== "aiAssisted")
                    .map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <span className="text-muted-foreground/70 mr-1">{k}:</span>
                        <span className="text-muted-foreground">
                          {Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))
                  }
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <RetroButton
                  variant="default"
                  className="text-xs py-1 px-2.5 h-auto"
                  onClick={accept}
                  data-testid="ai-assist-accept"
                >
                  Accept
                </RetroButton>
                <RetroButton
                  variant="outline"
                  className="text-xs py-1 px-2.5 h-auto"
                  onClick={discard}
                  data-testid="ai-assist-discard"
                >
                  Discard
                </RetroButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Class Settings ──────────────────────────────────────────────────

function Step1({ config, setConfig, targetSize, projectId, onAiAccepted }: { config: WizardConfig; setConfig: (c: WizardConfig) => void; targetSize?: number; projectId?: string; onAiAccepted?: () => void }) {
  const sliderMin = targetSize ?? 20;
  const sliderMax = Math.max(targetSize ?? 80, 80);
  const isAtTarget = targetSize != null && config.count === targetSize;
  const isOverTarget = targetSize != null && config.count > targetSize;
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">Class Size: {config.count}</Label>
        <input
          type="range" min={sliderMin} max={sliderMax} step={1}
          value={config.count}
          onChange={e => setConfig({ ...config, count: Number(e.target.value) })}
          className="w-full accent-yellow-400"
          data-testid="wizard-count-slider"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{sliderMin}</span><span>{sliderMax}</span>
        </div>
        {targetSize != null && (
          <div className={`text-xs mt-1.5 ${isAtTarget ? "text-green-400" : isOverTarget ? "text-yellow-400" : "text-muted-foreground"}`}>
            {isAtTarget
              ? `League target met (${targetSize})`
              : isOverTarget
                ? `Above league target of ${targetSize} — commissioner override`
                : `League target: ${targetSize} recruits (minimum)`}
            {!isAtTarget && (
              <button
                className="ml-2 underline text-gold hover:text-gold/80"
                onClick={() => setConfig({ ...config, count: targetSize })}
              >
                Set to {targetSize}
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">Theme</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setConfig({ ...config, theme: t.id })}
              className={`text-left p-2 rounded border text-xs transition-all ${
                config.theme === t.id
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card hover:border-gold/50 text-muted-foreground"
              }`}
              data-testid={`wizard-theme-${t.id}`}
            >
              <div className="text-xs font-semibold mb-0.5">{t.label}</div>
              <div className="text-xs leading-tight">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <AiAssistPanel
        projectId={projectId}
        jobType="theme_draft"
        placeholder="e.g. A gritty, pitching-heavy class from the Southeast with high upside…"
        buttonLabel="AI Assist — Theme Draft"
        onAccept={(data) => {
          const d = data as any;
          if (d.themeName) setConfig({ ...config, label: d.themeName });
          onAiAccepted?.();
        }}
      />

      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">Class Label (Optional)</Label>
        <Input
          value={config.label}
          onChange={e => setConfig({ ...config, label: e.target.value })}
          placeholder="e.g. Power-Heavy 2027 Class"
          className="bg-background border-border text-sm"
          maxLength={60}
          data-testid="wizard-label-input"
        />
      </div>
    </div>
  );
}

// ─── Step 2: Star Distribution ───────────────────────────────────────────────

function Step2({ config, setConfig }: { config: WizardConfig; setConfig: (c: WizardConfig) => void }) {
  const dist = config.starDistribution;
  const total = dist.blueChip + dist.five + dist.four + dist.three + dist.two + dist.one;
  const valid = total === 100;

  const setTier = (key: keyof typeof dist, val: number) => {
    setConfig({ ...config, starDistribution: { ...dist, [key]: val } });
  };

  const bars = [
    { key: "blueChip" as const, label: "Blue Chip ★★★★★", color: "bg-amber-400" },
    { key: "five"     as const, label: "5★ (Non-BC)",      color: "bg-yellow-400" },
    { key: "four"     as const, label: "4★",               color: "bg-green-400" },
    { key: "three"    as const, label: "3★",               color: "bg-blue-400" },
    { key: "two"      as const, label: "2★",               color: "bg-gray-400" },
    { key: "one"      as const, label: "1★",               color: "bg-zinc-500" },
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">Set the number of recruits in each star tier. Sliders control percentages; counts update live based on your class size. Total must equal 100%.</p>

      {/* Visual bar */}
      <div className="h-6 rounded overflow-hidden flex gap-px">
        {bars.map(b => (
          <div key={b.key} className={`${b.color} transition-all`} style={{ width: `${dist[b.key]}%`, minWidth: dist[b.key] > 0 ? 2 : 0 }} />
        ))}
      </div>

      <div className={`text-center text-xs font-semibold ${valid ? "text-green-400" : "text-red-400"}`}>
        Total: {total}% · {Math.round(total / 100 * config.count)} recruits {!valid && `(must equal exactly 100%)`}
      </div>

      <div className="space-y-3">
        {bars.map(b => (
          <div key={b.key} className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-sm ${b.color} shrink-0`} />
            <span className="text-xs w-32 shrink-0">{b.label}</span>
            <input
              type="range" min={0} max={60} step={1}
              value={dist[b.key]}
              onChange={e => setTier(b.key, Number(e.target.value))}
              className="flex-1 accent-yellow-400"
              data-testid={`wizard-dist-${b.key}`}
            />
            <span className="text-xs w-10 text-right tabular-nums">{Math.round(dist[b.key] / 100 * config.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3: Special Counts ──────────────────────────────────────────────────

function Step3({ config, setConfig }: { config: WizardConfig; setConfig: (c: WizardConfig) => void }) {
  const sc = config.specialCounts;
  const setSC = (key: keyof typeof sc, val: number) => {
    setConfig({ ...config, specialCounts: { ...sc, [key]: Math.max(0, val) } });
  };

  const rows: { key: keyof typeof sc; label: string; desc: string; max: number; note?: string }[] = [
    { key: "blueChips",   label: "Blue Chip Recruits",  desc: "540–599 OVR, always 5★; guaranteed elite talent with no fog of war",       max: 6  },
    { key: "genGems",     label: "Generational Gems",   desc: "Hidden in 1–3★ range; 1★→400–499, 2★→500–539, 3★→540–599 OVR; all S-grade attrs", max: 3  },
    { key: "genBusts",    label: "Generational Busts",  desc: "Hidden in 3–5★ range; 3★/4★→150–199, 5★→200–299 OVR; near-floor attributes", max: 3  },
    { key: "gems",        label: "Regular Gems",        desc: "OVR ~2 tiers above displayed stars; high potential, harder to scout",         max: 10 },
    { key: "busts",       label: "Regular Busts",       desc: "OVR ~2 tiers below displayed stars; low potential, looks better than they are", max: 10 },
    { key: "lateBloomers",label: "Late Bloomers",       desc: "High potential, OVR below star band; 2–4★ only — worth the wait",            max: 15, note: "2–4★ only" },
    { key: "overdrafts",  label: "Overdrafts",          desc: "OVR above star band, low potential; 3–5★ only — stats peak early then decline", max: 15, note: "3–5★ only" },
    { key: "jucos",       label: "JUCO Transfers",      desc: "Junior college transfer recruits; come in as SO/JR with one fewer year",      max: 20 },
    { key: "rawPlayers",  label: "Raw Archetypes",      desc: "Unpolished prospects with high variance; randomly better or worse than expected", max: 15 },
  ];

  const specialSlots = sc.blueChips + sc.genGems + sc.genBusts + sc.jucos + sc.rawPlayers + sc.lateBloomers + sc.overdrafts;
  const remaining = Math.max(0, config.count - specialSlots);
  const overflow = specialSlots > config.count;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Control exact counts of special player types in this class.</p>
      {overflow && (
        <div className="flex items-center gap-2 p-2 rounded border border-red-500/40 bg-red-900/20 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Special counts exceed class size ({specialSlots} &gt; {config.count}). Reduce counts or increase class size on Step 1.
        </div>
      )}

      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-3 p-2 rounded border border-border bg-card">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-gold">{r.label}</div>
                {r.note && <span className="text-xs text-muted-foreground/60 border border-border rounded px-1 py-0">{r.note}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setSC(r.key, sc[r.key] - 1)} className="w-6 h-6 rounded bg-border hover:bg-border/80 text-sm font-bold">-</button>
              <span className="w-6 text-center tabular-nums text-sm" data-testid={`wizard-sc-${r.key}`}>{sc[r.key]}</span>
              <button onClick={() => setSC(r.key, sc[r.key] + 1)} disabled={sc[r.key] >= r.max} className="w-6 h-6 rounded bg-border hover:bg-border/80 text-sm font-bold disabled:opacity-40">+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 rounded bg-muted/20 border border-border text-xs text-muted-foreground">
        <span className="text-xs font-semibold text-gold">Class breakdown: </span>
        {sc.blueChips} blue chips + {sc.genGems} gen gems + {sc.genBusts} gen busts + {sc.jucos} JUCOs + {sc.rawPlayers} raw + {sc.lateBloomers} late bloomers + {sc.overdrafts} overdrafts → {remaining} standard slots
      </div>
    </div>
  );
}

// ─── Step 4: Advanced Options ────────────────────────────────────────────────

const PITCHER_POSITIONS: { key: keyof WizardConfig["positionDistribution"]; label: string; desc: string }[] = [
  { key: "P", label: "P", desc: "Pitcher" },
];

const FIELD_POSITIONS: { key: keyof WizardConfig["positionDistribution"]; label: string; desc: string }[] = [
  { key: "C",   label: "C",  desc: "Catcher" },
  { key: "1B",  label: "1B", desc: "First Base" },
  { key: "2B",  label: "2B", desc: "Second Base" },
  { key: "3B",  label: "3B", desc: "Third Base" },
  { key: "SS",  label: "SS", desc: "Shortstop" },
  { key: "OF",  label: "OF", desc: "Outfielder" },
];

function PosInput({
  posKey, value, onChange,
}: { posKey: string; value: number; onChange: (key: string, v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(posKey, Math.max(0, value - 1))}
        className="w-5 h-5 rounded bg-border hover:bg-border/80 text-xs font-bold leading-none"
        data-testid={`wizard-pos-dec-${posKey}`}
      >−</button>
      <input
        type="number"
        min={0}
        max={80}
        value={value}
        onChange={e => onChange(posKey, Math.max(0, Math.min(80, Number(e.target.value) || 0)))}
        className="w-10 h-5 bg-background border border-border rounded text-xs text-center tabular-nums focus:border-gold focus:outline-none"
        data-testid={`wizard-pos-${posKey}`}
      />
      <button
        onClick={() => onChange(posKey, Math.min(80, value + 1))}
        className="w-5 h-5 rounded bg-border hover:bg-border/80 text-xs font-bold leading-none"
        data-testid={`wizard-pos-inc-${posKey}`}
      >+</button>
    </div>
  );
}

function Step4({ config, setConfig }: { config: WizardConfig; setConfig: (c: WizardConfig) => void }) {
  const pd = config.positionDistribution;
  const pitcherTotal = pd.P ?? 0;
  const fieldTotal   = (pd.C ?? 0) + (pd["1B"] ?? 0) + (pd["2B"] ?? 0) + (pd["3B"] ?? 0)
                     + (pd.SS ?? 0) + (pd.OF ?? 0);
  const grandTotal   = pitcherTotal + fieldTotal;
  const pctPitchers  = grandTotal > 0 ? Math.round((pitcherTotal / grandTotal) * 100) : 0;
  const pctField     = grandTotal > 0 ? 100 - pctPitchers : 0;

  const setPD = (key: string, val: number) => {
    setConfig({ ...config, positionDistribution: { ...pd, [key]: Math.max(0, val) } });
  };

  const resetPD = () => {
    setConfig({ ...config, positionDistribution: { P: 40, C: 8, "1B": 7, "2B": 7, "3B": 7, SS: 7, OF: 24 } });
  };

  return (
    <div className="space-y-6">
      {/* Position Distribution Table */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs font-semibold text-gold uppercase">Position Mix</Label>
          <button
            onClick={resetPD}
            className="text-xs text-muted-foreground hover:text-gold transition-colors underline underline-offset-2"
            data-testid="wizard-pos-reset"
          >
            Reset to defaults
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Set how many recruits to generate per position. Values are proportional weights — the generator scales to match your class size.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pitchers */}
          <div className="rounded border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gold uppercase">Pitchers</span>
              <span className="text-xs text-muted-foreground tabular-nums">{pitcherTotal} ({pctPitchers}%)</span>
            </div>
            <div className="space-y-2">
              {PITCHER_POSITIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-foreground">{p.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.desc}</span>
                  </div>
                  <PosInput posKey={p.key} value={(pd as any)[p.key] ?? 0} onChange={setPD} />
                </div>
              ))}
            </div>
          </div>

          {/* Position Players */}
          <div className="rounded border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gold uppercase">Position Players</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fieldTotal} ({pctField}%)</span>
            </div>
            <div className="space-y-2">
              {FIELD_POSITIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-foreground">{p.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.desc}</span>
                  </div>
                  <PosInput posKey={p.key} value={(pd as any)[p.key] ?? 0} onChange={setPD} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary bar */}
        {grandTotal > 0 && (
          <div className="mt-2 h-2 rounded overflow-hidden flex">
            <div className="bg-amber-500/70 transition-all" style={{ width: `${pctPitchers}%` }} title={`Pitchers ${pctPitchers}%`} />
            <div className="bg-blue-500/70 transition-all" style={{ width: `${pctField}%` }} title={`Position players ${pctField}%`} />
          </div>
        )}
        <div className="flex gap-4 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/70" /> Pitchers {pctPitchers}%
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500/70" /> Position Players {pctField}%
          </span>
          <span className="text-xs text-muted-foreground ml-auto">Total weight: {grandTotal}</span>
        </div>
      </div>

      {/* Region Skew */}
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">
          Region Skew
        </Label>
        <p className="text-xs text-muted-foreground mb-3">Bias recruit home states toward a geographic region.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REGION_SKEWS.map(r => (
            <button
              key={r.id}
              onClick={() => setConfig({ ...config, regionSkew: r.id as any })}
              className={`text-left p-2 rounded border text-xs transition-all ${
                config.regionSkew === r.id
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card hover:border-gold/50 text-muted-foreground"
              }`}
              data-testid={`wizard-region-${r.id}`}
            >
              <div className="text-xs font-semibold mb-0.5">{r.label}</div>
              <div className="text-xs leading-tight">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fog of War */}
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">
          Fog of War Density: {config.fogDensity}%
        </Label>
        <p className="text-xs text-muted-foreground mb-2">100% = fully hidden (default). 0% = all attributes revealed at generation.</p>
        <input
          type="range" min={0} max={100} step={5}
          value={config.fogDensity}
          onChange={e => setConfig({ ...config, fogDensity: Number(e.target.value) })}
          className="w-full accent-yellow-400"
          data-testid="wizard-fog-slider"
        />
      </div>
    </div>
  );
}

// ─── Step 5: OVR Controls ────────────────────────────────────────────────────

const OVR_DIST_OPTIONS: { id: WizardConfig["ovrDistribution"]; label: string; desc: string }[] = [
  { id: "bell",         label: "Bell Curve",    desc: "Most recruits cluster around the desired average (natural distribution)" },
  { id: "top_heavy",   label: "Top Heavy",     desc: "More recruits skewed toward the maximum OVR" },
  { id: "bottom_heavy", label: "Bottom Heavy",  desc: "More recruits skewed toward the minimum OVR" },
  { id: "flat",         label: "Flat / Uniform", desc: "Recruits spread evenly across the OVR range" },
];

function StepOVR({ config, setConfig }: { config: WizardConfig; setConfig: (c: WizardConfig) => void }) {
  const ovrMin     = config.ovrMin     ?? 150;
  const ovrMax     = config.ovrMax     ?? 650;
  const ovrAverage = config.ovrAverage ?? 300;
  const ovrDist    = config.ovrDistribution ?? "bell";

  const setOvr = (key: keyof WizardConfig, val: number | string) => {
    setConfig({ ...config, [key]: val });
  };

  const rangeValid = ovrMin <= ovrMax;
  const avgValid   = ovrAverage >= ovrMin && ovrAverage <= ovrMax;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Control the overall quality range and shape of this recruiting class. These settings guide how recruits' attributes are generated. Blue Chips, Generational Gems, and Generational Busts are exempt from these controls.
      </p>

      {/* OVR Range */}
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">OVR Range</Label>
        <p className="text-xs text-muted-foreground mb-3">Set the minimum and maximum overall rating for recruits in this class (150–650).</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Min OVR</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={150} max={640} step={5}
                value={ovrMin}
                onChange={e => {
                  const v = Number(e.target.value);
                  setConfig({ ...config, ovrMin: v, ovrMax: Math.max(v, ovrMax), ovrAverage: Math.max(v, Math.min(ovrAverage, Math.max(v, ovrMax))) });
                }}
                className="flex-1 accent-yellow-400"
                data-testid="wizard-ovr-min-slider"
              />
              <input
                type="number" min={150} max={650} step={1}
                value={ovrMin}
                onChange={e => {
                  const v = Math.max(150, Math.min(650, Number(e.target.value) || 150));
                  setConfig({ ...config, ovrMin: v, ovrMax: Math.max(v, ovrMax), ovrAverage: Math.max(v, Math.min(ovrAverage, Math.max(v, ovrMax))) });
                }}
                className="w-14 bg-background border border-border rounded text-xs text-center px-1 py-1 focus:border-gold focus:outline-none tabular-nums"
                data-testid="wizard-ovr-min-input"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Max OVR</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={160} max={650} step={5}
                value={ovrMax}
                onChange={e => {
                  const v = Number(e.target.value);
                  setConfig({ ...config, ovrMax: v, ovrMin: Math.min(v, ovrMin), ovrAverage: Math.min(v, Math.max(ovrAverage, Math.min(v, ovrMin))) });
                }}
                className="flex-1 accent-yellow-400"
                data-testid="wizard-ovr-max-slider"
              />
              <input
                type="number" min={150} max={650} step={1}
                value={ovrMax}
                onChange={e => {
                  const v = Math.max(150, Math.min(650, Number(e.target.value) || 650));
                  setConfig({ ...config, ovrMax: v, ovrMin: Math.min(v, ovrMin), ovrAverage: Math.min(v, Math.max(ovrAverage, Math.min(v, ovrMin))) });
                }}
                className="w-14 bg-background border border-border rounded text-xs text-center px-1 py-1 focus:border-gold focus:outline-none tabular-nums"
                data-testid="wizard-ovr-max-input"
              />
            </div>
          </div>
        </div>
        {!rangeValid && (
          <p className="text-red-400 text-xs mt-1">Min OVR must be ≤ Max OVR.</p>
        )}
        {/* Visual range bar */}
        <div className="mt-2 h-2 bg-muted rounded overflow-hidden relative">
          <div
            className="absolute h-full bg-gold/40 rounded"
            style={{ left: `${((ovrMin - 150) / 500) * 100}%`, width: `${((ovrMax - ovrMin) / 500) * 100}%` }}
          />
          {avgValid && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gold"
              style={{ left: `${((ovrAverage - 150) / 500) * 100}%` }}
              title={`Avg: ${ovrAverage}`}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
          <span>150</span><span>400</span><span>650</span>
        </div>
      </div>

      {/* Desired Average OVR */}
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">
          Desired Average OVR: {ovrAverage}
        </Label>
        <p className="text-xs text-muted-foreground mb-2">Target class mean OVR. Bell Curve centers here; other distributions shift the class mean toward this value.</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={ovrMin}
            max={ovrMax}
            step={5}
            value={Math.max(ovrMin, Math.min(ovrMax, ovrAverage))}
            onChange={e => setOvr("ovrAverage", Number(e.target.value))}
            className="flex-1 accent-yellow-400"
            data-testid="wizard-ovr-avg-slider"
          />
          <input
            type="number"
            min={ovrMin}
            max={ovrMax}
            step={1}
            value={ovrAverage}
            onChange={e => {
              const v = Math.max(ovrMin, Math.min(ovrMax, Number(e.target.value) || ovrMin));
              setOvr("ovrAverage", v);
            }}
            className="w-14 bg-background border border-border rounded text-xs text-center px-1 py-1 focus:border-gold focus:outline-none tabular-nums"
            data-testid="wizard-ovr-avg-input"
          />
        </div>
        {!avgValid && rangeValid && (
          <p className="text-amber-400 text-xs mt-1">Average will be clamped to [{ovrMin}, {ovrMax}] at generation time.</p>
        )}
      </div>

      {/* Distribution Shape */}
      <div>
        <Label className="text-xs font-semibold text-gold uppercase mb-2 block">Distribution Shape</Label>
        <p className="text-xs text-muted-foreground mb-3">Controls how OVR values are spread across the class.</p>
        <div className="grid grid-cols-2 gap-2">
          {OVR_DIST_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setConfig({ ...config, ovrDistribution: opt.id })}
              className={`text-left p-2 rounded border text-xs transition-all ${
                ovrDist === opt.id
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card hover:border-gold/50 text-muted-foreground"
              }`}
              data-testid={`wizard-ovr-dist-${opt.id}`}
            >
              <div className="text-xs font-semibold mb-0.5">{opt.label}</div>
              <div className="text-xs leading-tight">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Reset to defaults */}
      <button
        onClick={() => setConfig({ ...config, ovrMin: 150, ovrMax: 650, ovrAverage: 300, ovrDistribution: "bell" })}
        className="text-xs text-muted-foreground hover:text-gold transition-colors underline underline-offset-2"
        data-testid="wizard-ovr-reset"
      >
        Reset OVR controls to defaults
      </button>
    </div>
  );
}

// ─── Step 6: Generate ────────────────────────────────────────────────────────

function Step5({ onGenerate, isGenerating, config }: {
  onGenerate: () => void;
  isGenerating: boolean;
  config: WizardConfig;
}) {
  const dist = config.starDistribution;
  const total = dist.blueChip + dist.five + dist.four + dist.three + dist.two + dist.one;
  const distValid = total === 100;

  return (
    <div className="flex flex-col items-center py-8 gap-6">
      <div className="w-16 h-16 bg-gold/20 rounded-full flex items-center justify-center">
        <Wand2 className="w-8 h-8 text-gold" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-gold text-sm">Ready to Generate</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {config.count} recruits · {config.theme} theme
          {config.regionSkew !== "none" ? ` · ${config.regionSkew} skew` : ""}
          {config.label ? ` · "${config.label}"` : ""}
        </p>
        {!distValid && (
          <div className="flex items-center gap-1 text-red-400 text-xs justify-center mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Star distribution total is {total}% — go back to Step 2 and adjust to exactly 100%.
          </div>
        )}
      </div>
      <RetroButton
        variant="shimmer"
        className="px-8"
        onClick={onGenerate}
        disabled={isGenerating}
        data-testid="wizard-generate-btn"
      >
        {isGenerating ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
        ) : (
          <><Wand2 className="w-4 h-4 mr-2" /> Generate Class</>
        )}
      </RetroButton>
      {isGenerating && (
        <div className="text-xs text-muted-foreground text-center animate-pulse text-xs font-semibold">
          ROLLING RECRUITS...
        </div>
      )}
    </div>
  );
}

// ─── Inline-editable cell ────────────────────────────────────────────────────

function EditCell({
  value, field, recruitId, onCommit,
}: { value: number; field: string; recruitId: string; onCommit: (id: string, field: string, v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = parseInt(localVal);
    if (!isNaN(n) && n !== value) onCommit(recruitId, field, Math.max(1, Math.min(999, n)));
    setEditing(false);
  };

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-10 bg-background border border-gold text-xs text-center rounded px-0.5 py-0"
        data-testid={`cell-${field}-${recruitId}`}
      />
    );
  }
  return (
    <span
      className="cursor-pointer hover:text-gold tabular-nums px-1 rounded hover:bg-gold/10 transition-colors"
      onClick={() => { setLocalVal(String(value)); setEditing(true); }}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

// ─── Text inline-edit cell ───────────────────────────────────────────────────

function TextEditCell({
  value, field, recruitId, onCommit, maxLength = 20, width = "w-12",
}: { value: string; field: string; recruitId: string; onCommit: (id: string, field: string, v: string) => void; maxLength?: number; width?: string }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  const commit = () => {
    const v = local.trim();
    if (v && v !== value) onCommit(recruitId, field, v);
    setEditing(false);
  };

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        maxLength={maxLength}
        className={`${width} bg-background border border-gold text-xs text-center rounded px-0.5 py-0`}
        data-testid={`cell-${field}-${recruitId}`}
      />
    );
  }
  return (
    <span
      className="cursor-pointer hover:text-gold tabular-nums px-1 rounded hover:bg-gold/10 transition-colors"
      onClick={() => { setLocal(value); setEditing(true); }}
      title="Click to edit"
    >
      {value || "—"}
    </span>
  );
}

// ─── Select inline-edit cell ─────────────────────────────────────────────────

function SelectEditCell({
  value, field, recruitId, options, onCommit, className: cls = "text-xs font-semibold",
}: { value: string; field: string; recruitId: string; options: { label: string; value: string }[]; onCommit: (id: string, field: string, v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref}
        value={value}
        onChange={e => { onCommit(recruitId, field, e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="bg-background border border-gold text-xs rounded px-0.5 py-0 text-foreground"
        data-testid={`cell-${field}-${recruitId}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <span
      className={`cursor-pointer hover:text-gold px-1 rounded hover:bg-gold/10 transition-colors ${cls}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

// ─── Name inline-edit cell ───────────────────────────────────────────────────

function NameEditCell({
  firstName, lastName, recruitId, onOpen, onCommit,
}: { firstName: string; lastName: string; recruitId: string; onOpen: () => void; onCommit: (id: string, fn: string, ln: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [fn, setFn] = useState(firstName);
  const [ln, setLn] = useState(lastName);
  const firstRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    onCommit(recruitId, fn.trim() || firstName, ln.trim() || lastName);
    setEditing(false);
  };

  const handleWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
      commit();
    }
  };

  useEffect(() => { if (editing) firstRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <div ref={wrapperRef} className="flex gap-1" onBlur={handleWrapperBlur}>
        <input
          ref={firstRef}
          value={fn}
          onChange={e => setFn(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder="First"
          className="w-14 bg-background border border-gold text-xs rounded px-0.5 py-0 text-center"
          data-testid={`cell-firstName-${recruitId}`}
        />
        <input
          value={ln}
          onChange={e => setLn(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder="Last"
          className="w-14 bg-background border border-gold text-xs rounded px-0.5 py-0 text-center"
          data-testid={`cell-lastName-${recruitId}`}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <button
        className="font-medium hover:text-gold underline-offset-2 hover:underline text-left transition-colors"
        onClick={onOpen}
        title="View recruit details"
      >
        {firstName} {lastName}
      </button>
      <button
        onClick={() => { setFn(firstName); setLn(lastName); setEditing(true); }}
        className="p-0.5 text-muted-foreground/40 hover:text-gold transition-colors flex-shrink-0"
        title="Edit name"
        data-testid={`wizard-edit-name-${recruitId}`}
      >
        <Pencil className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── Attribute grade helpers ─────────────────────────────────────────────────

const ATTR_GRADES = ["G", "F", "D", "C", "B", "A", "S"] as const;
type AttrGrade = typeof ATTR_GRADES[number];
const ATTR_GRADE_VALUES: Record<AttrGrade, number> = { G: 20, F: 40, D: 55, C: 65, B: 75, A: 85, S: 95 };
const ATTR_GRADE_OPTIONS = ATTR_GRADES.map(g => ({ value: g, label: g }));

function numericToAttrGrade(n: number): AttrGrade {
  if (n <= 30) return "G";
  if (n <= 47) return "F";
  if (n <= 60) return "D";
  if (n <= 70) return "C";
  if (n <= 80) return "B";
  if (n <= 90) return "A";
  return "S";
}

const POTENTIAL_GRADE_OPTIONS = POTENTIAL_GRADES.map(g => ({ value: g.grade, label: g.grade }));

function potentialGradeToValue(grade: string): number {
  const entry = POTENTIAL_GRADES.find(g => g.grade === grade);
  return entry ? Math.round((entry.min + entry.max) / 2) : 70;
}

// ─── Attribute grade cell ─────────────────────────────────────────────────────

function AttrGradeCell({
  value, field, recruitId, onCommit,
}: { value: number; field: string; recruitId: string; onCommit: (id: string, field: string, v: number) => void }) {
  const grade = numericToAttrGrade(value);
  return (
    <div className="flex flex-col items-start leading-none gap-0.5">
      <SelectEditCell
        value={grade}
        field={field}
        recruitId={recruitId}
        options={ATTR_GRADE_OPTIONS}
        onCommit={(id, f, v) => onCommit(id, f, ATTR_GRADE_VALUES[v as AttrGrade])}
        className="font-bold text-xs leading-none"
      />
      <span className="text-xs text-muted-foreground/50 leading-none">{value}</span>
    </div>
  );
}

// ─── Special abilities edit cell ──────────────────────────────────────────────

function AbilitiesEditCell({
  abilities, recruitId, position, onCommit,
}: { abilities: string[]; recruitId: string; position: string; onCommit: (id: string, newAbilities: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const swapRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (adding) selectRef.current?.focus(); }, [adding]);
  useEffect(() => { if (swapping) swapRef.current?.focus(); }, [swapping]);

  const allForPos = getAbilitiesForPosition(position);
  const available = allForPos.filter(a => !abilities.includes(a.name));

  const removeAbility = (name: string) => {
    onCommit(recruitId, abilities.filter(a => a !== name));
  };

  const addAbility = (name: string) => {
    if (!name || abilities.length >= MAX_SPECIAL_ABILITIES) return;
    onCommit(recruitId, [...abilities, name]);
    setAdding(false);
  };

  const swapAbility = (oldName: string, newName: string) => {
    setSwapping(null);
    if (newName === oldName) return;
    if (!newName) {
      onCommit(recruitId, abilities.filter(a => a !== oldName));
      return;
    }
    onCommit(recruitId, abilities.map(a => a === oldName ? newName : a));
  };

  const tierColor = (name: string) => {
    const ab = allForPos.find(a => a.name === name);
    if (!ab) return "bg-blue-900/40 border-blue-700/40 text-blue-200";
    if (ab.tier === "gold") return "bg-amber-900/50 border-amber-600/60 text-amber-200";
    if (ab.tier === "red")  return "bg-red-900/40 border-red-700/40 text-red-200";
    return "bg-blue-900/40 border-blue-700/40 text-blue-200";
  };

  return (
    <div className="flex flex-wrap gap-0.5 items-center max-w-[220px]">
      {abilities.map(ab => (
        swapping === ab ? (
          <select
            key={ab}
            ref={swapRef}
            defaultValue={ab}
            onChange={e => swapAbility(ab, e.target.value)}
            onBlur={() => setSwapping(null)}
            className="bg-background border border-gold text-xs rounded px-0.5 py-0 text-foreground max-w-[140px]"
            data-testid={`wizard-swap-ability-select-${recruitId}-${ab}`}
          >
            <option value={ab}>{ab} (keep)</option>
            <option value="">— remove —</option>
            {available.map(a => (
              <option key={a.name} value={a.name}>{a.tier === "gold" ? "★ " : a.tier === "red" ? "✕ " : "• "}{a.name}</option>
            ))}
          </select>
        ) : (
          <span
            key={ab}
            className={`inline-flex items-center gap-0.5 border rounded px-1 py-0 text-xs whitespace-nowrap cursor-pointer hover:ring-1 hover:ring-gold/50 transition-all ${tierColor(ab)}`}
            title="Click to swap or remove"
            onClick={() => { setAdding(false); setSwapping(ab); }}
            data-testid={`wizard-ability-badge-${recruitId}-${ab}`}
          >
            {ab}
            <button
              onClick={e => { e.stopPropagation(); removeAbility(ab); }}
              className="text-current opacity-50 hover:opacity-100 hover:text-red-400 transition-colors ml-0.5 leading-none"
              title="Remove"
              data-testid={`wizard-remove-ability-${recruitId}-${ab}`}
            >×</button>
          </span>
        )
      ))}
      {abilities.length < MAX_SPECIAL_ABILITIES && !swapping && (
        adding ? (
          <select
            ref={selectRef}
            defaultValue=""
            onChange={e => addAbility(e.target.value)}
            onBlur={() => setAdding(false)}
            className="bg-background border border-gold text-xs rounded px-0.5 py-0 text-foreground max-w-[130px]"
            data-testid={`wizard-add-ability-select-${recruitId}`}
          >
            <option value="">+ pick ability</option>
            {available.map(a => (
              <option key={a.name} value={a.name}>{a.tier === "gold" ? "★ " : a.tier === "red" ? "✕ " : "• "}{a.name}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-muted-foreground/40 hover:text-gold text-xs font-bold transition-colors leading-none"
            title="Add ability"
            data-testid={`wizard-add-ability-btn-${recruitId}`}
          >+</button>
        )
      )}
      {abilities.length === 0 && !adding && !swapping && (
        <span className="text-muted-foreground/30 text-xs">—</span>
      )}
    </div>
  );
}

// ─── Pitch mix edit cell ──────────────────────────────────────────────────────

function PitchMixEditCell({
  recruit, recruitId, onCommit,
}: { recruit: WizardRecruit; recruitId: string; onCommit: (id: string, field: string, val: number) => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const addRef = useRef<HTMLSelectElement>(null);
  const editRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (adding) addRef.current?.focus(); }, [adding]);
  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  const activePitches = PITCH_DEFS.filter(p =>
    p.alwaysOn || (recruit[p.key] ?? 0) > 0
  );
  const availableToAdd = PITCH_DEFS.filter(p =>
    !p.alwaysOn && (recruit[p.key] ?? 0) === 0
  );

  return (
    <div className="flex flex-wrap gap-0.5 items-center min-w-[110px] max-w-[220px]">
      {activePitches.map(def => {
        const val = recruit[def.key] ?? 0;

        if (def.alwaysOn) {
          return (
            <span key={def.key} className="bg-orange-900/40 border border-orange-600/40 text-orange-200 rounded px-1 py-0 text-xs whitespace-nowrap">
              FB
            </span>
          );
        }

        if (def.binary) {
          return (
            <button
              key={def.key}
              onClick={() => onCommit(recruitId, def.key, val > 0 ? 0 : 1)}
              className="bg-sky-900/40 border border-sky-600/40 text-sky-200 hover:border-sky-400 rounded px-1 py-0 text-xs whitespace-nowrap transition-colors"
              title={`Toggle ${def.label} on/off`}
              data-testid={`wizard-pitch-toggle-${recruitId}-${def.key}`}
            >
              {def.label}
            </button>
          );
        }

        if (editing === def.key) {
          return (
            <select
              key={def.key}
              ref={editRef}
              defaultValue={String(val)}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                onCommit(recruitId, def.key, isNaN(n) ? 0 : n);
                setEditing(null);
              }}
              onBlur={() => setEditing(null)}
              className="bg-background border border-gold text-xs rounded px-0.5 py-0 text-foreground w-[68px]"
              data-testid={`wizard-pitch-level-${recruitId}-${def.key}`}
            >
              <option value="0">× remove</option>
              {[1,2,3,4,5,6,7].map(n => (
                <option key={n} value={n}>{def.label}: {n}</option>
              ))}
            </select>
          );
        }

        return (
          <button
            key={def.key}
            onClick={() => setEditing(def.key)}
            className="bg-violet-900/40 border border-violet-600/40 text-violet-200 hover:border-violet-400 rounded px-1 py-0 text-xs whitespace-nowrap transition-colors"
            title={`Edit ${def.label} level`}
            data-testid={`wizard-pitch-badge-${recruitId}-${def.key}`}
          >
            {def.label}:{val}
          </button>
        );
      })}

      {availableToAdd.length > 0 && !editing && (
        adding ? (
          <select
            ref={addRef}
            defaultValue=""
            onChange={e => {
              const key = e.target.value;
              if (!key) return;
              const def = PITCH_DEFS.find(p => p.key === key);
              if (!def) return;
              onCommit(recruitId, key, def.binary ? 1 : 4);
              setAdding(false);
            }}
            onBlur={() => setAdding(false)}
            className="bg-background border border-gold text-xs rounded px-0.5 py-0 text-foreground max-w-[90px]"
            data-testid={`wizard-pitch-add-${recruitId}`}
          >
            <option value="">+ add</option>
            {availableToAdd.map(p => (
              <option key={p.key} value={p.key}>{p.label}{p.binary ? " ●" : ""}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-muted-foreground/40 hover:text-gold text-xs font-bold transition-colors leading-none"
            title="Add pitch"
            data-testid={`wizard-pitch-add-btn-${recruitId}`}
          >+</button>
        )
      )}
    </div>
  );
}

// ─── Map WizardRecruit → Player (for PlayerProfileCard read-only view) ────────

function wizardRecruitToPlayer(r: WizardRecruit): Player {
  return {
    id: r._tempId,
    firstName: r.firstName,
    lastName: r.lastName,
    position: r.position,
    jerseyNumber: 0,
    eligibility: r.recruitYear ?? "FR",
    hometown: r.hometown ?? "",
    homeState: r.homeState ?? "",
    overall: r.overall,
    starRating: r.starRating,
    potential: r.potential ?? null,
    hitForAvg: r.hitForAvg ?? null,
    power: r.power ?? null,
    speed: r.speed ?? null,
    arm: r.arm ?? null,
    fielding: r.fielding ?? null,
    velocity: r.velocity ?? null,
    control: r.control ?? null,
    stamina: r.stamina ?? null,
    stuff: r.stuff ?? null,
    abilities: r.abilities ?? [],
    bats: "R",
    throws: "R",
  } as Player;
}

// ─── Step 6/7: Review & Edit ─────────────────────────────────────────────────

type SortKey = "name" | "pos" | "stars" | "overall" | "hitForAvg" | "power" | "speed" | "arm" | "fielding" | "velocity" | "control" | "stamina" | "stuff" | "potential";

function Step6({ recruits, setRecruits, onNext, onReroll, isRerolling, rerollingId, config }: {
  recruits: WizardRecruit[];
  setRecruits: (r: WizardRecruit[]) => void;
  onNext: () => void;
  onReroll: (r: WizardRecruit) => void;
  isRerolling: boolean;
  rerollingId: string | null;
  config: WizardConfig;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailRecruit, setDetailRecruit] = useState<WizardRecruit | null>(null);

  const sorted = [...recruits].sort((a, b) => {
    let aVal: any, bVal: any;
    if (sortKey === "name")    { aVal = a.lastName; bVal = b.lastName; }
    else if (sortKey === "pos") { aVal = a.position; bVal = b.position; }
    else if (sortKey === "stars") { aVal = a.starRating; bVal = b.starRating; }
    else { aVal = (a as any)[sortKey] ?? 0; bVal = (b as any)[sortKey] ?? 0; }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const commitEdit = useCallback((id: string, field: string, val: number) => {
    setRecruits(recruits.map(r => r._tempId === id ? { ...r, [field]: val } : r));
  }, [recruits, setRecruits]);

  const rerollVisuals = useCallback((id: string) => {
    const SKIN_TONES   = ["light","light","medium","medium","tan","olive","dark","deep"];
    const HAIR_COLORS  = ["black","brown","blonde","red","gray"];
    const HAIR_STYLES  = ["short","buzz","medium","fade","curly","mullet","long","bald"];
    const HEADWEARS    = ["cap","cap","cap","helmet","batting_helmet","none"];
    const FACIAL_HAIRS = ["none","none","none","none","none","stubble","stubble","goatee","mustache"];
    const EYE_STYLES   = ["standard","standard","narrow","wide","heavy"];
    const EYEBROW_STYLES = ["flat","flat","arched","thick","furrowed"];
    const MOUTH_STYLES = ["neutral","neutral","smile","smirk"];
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    setRecruits(recruits.map(r => r._tempId !== id ? r : {
      ...r,
      skinTone:     pick(SKIN_TONES),
      hairColor:    pick(HAIR_COLORS),
      hairStyle:    pick(HAIR_STYLES),
      headwear:     pick(HEADWEARS),
      facialHair:   pick(FACIAL_HAIRS),
      eyeStyle:     pick(EYE_STYLES),
      eyebrowStyle: pick(EYEBROW_STYLES),
      mouthStyle:   pick(MOUTH_STYLES),
      eyeBlack:     Math.random() < 0.15,
    }));
  }, [recruits, setRecruits]);

  const commitTextEdit = useCallback((id: string, field: string, val: string) => {
    setRecruits(recruits.map(r => r._tempId === id ? { ...r, [field]: val } : r));
  }, [recruits, setRecruits]);

  const commitNameEdit = useCallback((id: string, fn: string, ln: string) => {
    setRecruits(recruits.map(r => r._tempId === id ? { ...r, firstName: fn, lastName: ln } : r));
  }, [recruits, setRecruits]);

  const commitAbilitiesEdit = useCallback((id: string, newAbilities: string[]) => {
    setRecruits(recruits.map(r => r._tempId === id ? { ...r, abilities: newAbilities } : r));
  }, [recruits, setRecruits]);

  const POSITION_OPTIONS = [
    { value: "P",  label: "P"  },
    { value: "C",  label: "C"  },
    { value: "1B", label: "1B" },
    { value: "2B", label: "2B" },
    { value: "3B", label: "3B" },
    { value: "SS", label: "SS" },
    { value: "OF", label: "OF" },
  ];

  const YEAR_OPTIONS = [
    { value: "FR", label: "FR" },
    { value: "SO", label: "SO" },
    { value: "JR", label: "JR" },
  ];

  const STAR_OPTIONS = [
    { value: "1", label: "1★" },
    { value: "2", label: "2★" },
    { value: "3", label: "3★" },
    { value: "4", label: "4★" },
    { value: "5", label: "5★" },
  ];

  const deleteRecruit = (id: string) => {
    setRecruits(recruits.filter(r => r._tempId !== id));
  };

  const SortTh = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-2 py-1.5 text-left text-xs text-muted-foreground cursor-pointer hover:text-gold whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      {label}{sortKey === field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  // Stat summary
  const bcCount  = recruits.filter(r => r.isBlueChip).length;
  const gemCount = recruits.filter(r => r.isGenerationalGem).length;
  const bustCount = recruits.filter(r => r.isGenerationalBust).length;
  const avgOvr = recruits.length ? Math.round(recruits.reduce((s, r) => s + (r.overall ?? 0), 0) / recruits.length) : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-card border border-border rounded px-2 py-0.5">{recruits.length} recruits</span>
        <span className="bg-amber-950/40 border border-amber-700 rounded px-2 py-0.5 text-amber-300">{bcCount} Blue Chips</span>
        <span className="bg-purple-950/40 border border-purple-700 rounded px-2 py-0.5 text-purple-300">{gemCount} Gen Gems</span>
        <span className="bg-red-950/40 border border-red-700 rounded px-2 py-0.5 text-red-300">{bustCount} Gen Busts</span>
        <span className="bg-card border border-border rounded px-2 py-0.5 text-muted-foreground">Avg OVR: {avgOvr}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border border-border rounded max-h-[calc(100vh-400px)]">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 bg-card z-10 border-b border-border">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap w-10">Img</th>
              <SortTh label="Name"  field="name" />
              <SortTh label="Pos"   field="pos" />
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">Yr</th>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">State</th>
              <SortTh label="Stars"  field="stars" />
              <SortTh label="OVR"    field="overall" />
              <SortTh label="Pot"    field="potential" />
              <SortTh label="Hit"    field="hitForAvg" />
              <SortTh label="Pwr"    field="power" />
              <SortTh label="Spd"    field="speed" />
              <SortTh label="Arm"    field="arm" />
              <SortTh label="Fld"    field="fielding" />
              <SortTh label="Velo"   field="velocity" />
              <SortTh label="Ctrl"   field="control" />
              <SortTh label="Stam"   field="stamina" />
              <SortTh label="Stf"    field="stuff" />
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">Pitches</th>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">Abilities</th>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">NIL</th>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">Type</th>
              <th className="px-2 py-1.5 text-left text-xs text-muted-foreground whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const isRerollingThis = isRerolling && rerollingId === r._tempId;
              const isPitcher = r.position === "P";
              const potGrade = r.potential != null ? getPotentialGrade(r.potential) : "—";
              return (
                <tr key={r._tempId} className={`border-b border-border/40 hover:bg-white/5 transition-colors ${rowBg(r)}`}>
                  <td className="px-2 py-1 w-10">
                    <button
                      onClick={() => rerollVisuals(r._tempId)}
                      title="Click to randomize appearance"
                      className="rounded overflow-hidden ring-1 ring-transparent hover:ring-gold transition-all cursor-pointer"
                      data-testid={`wizard-avatar-${r._tempId}`}
                    >
                      <PlayerAvatar
                        size="sm"
                        isRecruit
                        skinTone={r.skinTone}
                        hairColor={r.hairColor}
                        hairStyle={r.hairStyle}
                        facialHair={r.facialHair}
                        eyeStyle={r.eyeStyle}
                        eyebrowStyle={r.eyebrowStyle}
                        mouthStyle={r.mouthStyle}
                        eyeBlack={r.eyeBlack}
                        headwear={r.headwear}
                        playerId={r._tempId}
                      />
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <NameEditCell
                      firstName={r.firstName}
                      lastName={r.lastName}
                      recruitId={r._tempId}
                      onOpen={() => setDetailRecruit(r)}
                      onCommit={commitNameEdit}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <SelectEditCell
                      value={r.position}
                      field="position"
                      recruitId={r._tempId}
                      options={POSITION_OPTIONS}
                      onCommit={commitTextEdit}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <SelectEditCell
                      value={r.recruitYear}
                      field="recruitYear"
                      recruitId={r._tempId}
                      options={YEAR_OPTIONS}
                      onCommit={commitTextEdit}
                      className="text-muted-foreground"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <TextEditCell
                      value={r.homeState}
                      field="homeState"
                      recruitId={r._tempId}
                      onCommit={commitTextEdit}
                      maxLength={2}
                      width="w-8"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <SelectEditCell
                      value={String(r.starRating)}
                      field="starRating"
                      recruitId={r._tempId}
                      options={STAR_OPTIONS}
                      onCommit={(id, field, val) => commitEdit(id, field, Number(val))}
                      className={r.isBlueChip || r.starRating >= 5 ? "text-amber-400" : r.starRating >= 4 ? "text-yellow-400" : "text-muted-foreground"}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className={`inline-flex items-center px-1 rounded text-xs font-bold ${
                      r.isGenerationalGem ? "bg-purple-900/60 text-purple-300 border border-purple-500/40" :
                      r.isGenerationalBust ? "bg-red-900/60 text-red-300 border border-red-500/40" :
                      r.isBlueChip || r.starRating >= 5 ? "bg-amber-900/40 text-amber-300 border border-amber-500/30" :
                      r.starRating >= 4 ? "bg-green-900/40 text-green-300 border border-green-500/30" :
                      r.starRating >= 3 ? "bg-blue-900/40 text-blue-300 border border-blue-500/30" :
                      r.starRating >= 2 ? "bg-gray-800/60 text-gray-300 border border-gray-500/30" :
                      "bg-zinc-900/60 text-zinc-400 border border-zinc-600/30"
                    }`}>
                      <EditCell value={r.overall} field="overall" recruitId={r._tempId} onCommit={commitEdit} />
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <SelectEditCell
                      value={potGrade !== "—" ? potGrade : (POTENTIAL_GRADE_OPTIONS[Math.floor(POTENTIAL_GRADE_OPTIONS.length / 2)]?.value ?? "C")}
                      field="potential"
                      recruitId={r._tempId}
                      options={POTENTIAL_GRADE_OPTIONS}
                      onCommit={(id, field, val) => commitEdit(id, field, potentialGradeToValue(val))}
                      className="text-xs font-semibold"
                    />
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <AttrGradeCell value={r.hitForAvg} field="hitForAvg" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <AttrGradeCell value={r.power} field="power" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <AttrGradeCell value={r.speed} field="speed" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    <AttrGradeCell value={r.arm} field="arm" recruitId={r._tempId} onCommit={commitEdit} />
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <AttrGradeCell value={r.fielding} field="fielding" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <AttrGradeCell value={r.velocity} field="velocity" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <AttrGradeCell value={r.control} field="control" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <AttrGradeCell value={r.stamina} field="stamina" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <AttrGradeCell value={r.stuff} field="stuff" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? (
                      <PitchMixEditCell recruit={r} recruitId={r._tempId} onCommit={commitEdit} />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <AbilitiesEditCell
                      abilities={(r.abilities as string[]) ?? []}
                      recruitId={r._tempId}
                      position={r.position}
                      onCommit={commitAbilitiesEdit}
                    />
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap tabular-nums text-xs text-muted-foreground" data-testid={`wizard-nil-${r._tempId}`}>
                    {r.nilCost != null && r.nilCost > 0
                      ? r.nilCost >= 1_000_000
                        ? `$${(r.nilCost / 1_000_000).toFixed(1)}M`
                        : `$${Math.round(r.nilCost / 1_000)}K`
                      : "—"}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5 flex-wrap">
                      {typeBadges(r).map(b => (
                        <span key={b.label} className={`${b.cls} rounded px-1 py-0 text-xs font-semibold`}>{b.label}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onReroll(r)}
                        disabled={isRerollingThis}
                        title="Reroll this recruit"
                        className="p-1 rounded hover:bg-gold/10 text-muted-foreground hover:text-gold disabled:opacity-40 transition-colors"
                        data-testid={`wizard-reroll-${r._tempId}`}
                      >
                        {isRerollingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => deleteRecruit(r._tempId)}
                        title="Remove this recruit"
                        className="p-1 rounded hover:bg-red-900/30 text-muted-foreground hover:text-red-400 transition-colors"
                        data-testid={`wizard-delete-${r._tempId}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Review and edit above, then proceed to save options.
          <span className="ml-2 text-muted-foreground/60">NIL costs are based on displayed star rating — hidden gems show lower costs consistent with their stars.</span>
        </p>
        <RetroButton
          variant="shimmer"
          onClick={onNext}
          disabled={recruits.length === 0}
          data-testid="wizard-next-save-btn"
        >
          <Save className="w-4 h-4 mr-2" /> Save Options ({recruits.length})
        </RetroButton>
      </div>

      {/* Recruit detail — uses existing PlayerProfileCard in read-only mode */}
      {detailRecruit && (
        <PlayerProfileCard
          player={wizardRecruitToPlayer(detailRecruit)}
          open={!!detailRecruit}
          onClose={() => setDetailRecruit(null)}
          isCommissioner={false}
        />
      )}
    </div>
  );
}

// ─── Step 7: Save Options ─────────────────────────────────────────────────────

function Step7Save({
  recruits,
  config,
  user,
  leagueId,
  onSaveToLeague,
  isSavingLeague,
  onSaveToLibrary,
  isSavingLibrary,
  masterSeed,
  generatorVersion,
  aiAssisted,
}: {
  recruits: WizardRecruit[];
  config: WizardConfig;
  user?: { id: string; email: string } | null;
  leagueId?: string;
  onSaveToLeague: () => void;
  isSavingLeague: boolean;
  onSaveToLibrary: (name: string, desc: string) => void;
  isSavingLibrary: boolean;
  masterSeed?: string;
  generatorVersion?: number;
  aiAssisted?: boolean;
}) {
  const [className, setClassName] = useState(config.label || "");
  const [classDesc, setClassDesc] = useState("");

  const isBusy = isSavingLeague || isSavingLibrary;

  return (
    <div className="flex flex-col gap-6 py-4 max-w-md mx-auto">
      <div className="text-center space-y-1">
        <h3 className="text-gold text-sm">Save Your Class</h3>
        <p className="text-xs text-muted-foreground">{recruits.length} recruits ready · choose how to save</p>
        {aiAssisted && (
          <span className="inline-flex items-center gap-1 text-xs text-purple-400 border border-purple-400/40 rounded px-2 py-0.5">
            AI-Assisted Class
          </span>
        )}
      </div>

      {masterSeed && (
        <div className="flex items-center gap-2 p-2 border border-border rounded bg-muted/10">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Generation Seed</div>
            <div className="text-xs font-mono text-foreground truncate" data-testid="wizard-seed-display">{masterSeed}{generatorVersion != null ? ` · v${generatorVersion}` : ""}</div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(masterSeed)}
            className="shrink-0 text-muted-foreground hover:text-gold transition-colors"
            title="Copy seed"
            data-testid="wizard-seed-copy"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gold uppercase mb-1.5 block">Class Name</label>
          <input
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:border-gold focus:outline-none"
            placeholder="e.g. Power-Heavy 2027 Class"
            value={className}
            onChange={e => setClassName(e.target.value)}
            maxLength={60}
            data-testid="wizard-class-name-input"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gold uppercase mb-1.5 block">Description (optional)</label>
          <input
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:border-gold focus:outline-none"
            placeholder="Notes about this class..."
            value={classDesc}
            onChange={e => setClassDesc(e.target.value)}
            maxLength={200}
            data-testid="wizard-class-desc-input"
          />
        </div>
      </div>

      <div className="space-y-3">
        <RetroButton
          variant="shimmer"
          className="w-full"
          onClick={() => onSaveToLibrary(className.trim() || "Unnamed Class", classDesc.trim())}
          disabled={isBusy}
          data-testid="wizard-save-library-btn"
        >
          {isSavingLibrary ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
          ) : user ? (
            <><Save className="w-4 h-4 mr-2" /> Save to My Library</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Locally (Guest)</>
          )}
        </RetroButton>

        {leagueId && (
          <RetroButton
            variant="outline"
            className="w-full"
            onClick={onSaveToLeague}
            disabled={isBusy}
            data-testid="wizard-save-league-btn"
          >
            {isSavingLeague ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving to League...</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" /> Save to League's Recruiting Class</>
            )}
          </RetroButton>
        )}

        {!user && (
          <p className="text-xs text-muted-foreground text-center">
            Guest saves are stored in your browser. Sign in to save permanently.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Success screen ──────────────────────────────────────────────────────────

function SavedScreen({ count, savedToLeague, onClose }: { count: number; savedToLeague: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-12 gap-6">
      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-gold text-sm">Class Saved!</h3>
        <p className="text-sm text-muted-foreground">{count} recruits saved successfully.</p>
        {savedToLeague ? (
          <p className="text-xs text-muted-foreground">Coaches can now view and recruit from the new class.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Your class is saved to your library and ready to use.</p>
        )}
      </div>
      <RetroButton variant="shimmer" onClick={onClose} data-testid="wizard-done-btn">
        Done
      </RetroButton>
    </div>
  );
}

// ─── Step 7: Story Cast ───────────────────────────────────────────────────────

const MAX_CAST = 10;
const PITCHER_POS_SET = new Set(["P"]);

function isPitcherR(position: string) { return PITCHER_POS_SET.has(position); }

function StepStoryCast({
  recruits,
  cast,
  setCast,
  projectId,
  onAiAccepted,
}: {
  recruits: WizardRecruit[];
  cast: string[];
  setCast: (c: string[]) => void;
  projectId?: string;
  onAiAccepted?: () => void;
}) {
  const inCast = new Set(cast);

  const toggleCast = (r: WizardRecruit) => {
    if (inCast.has(r.templateRecruitId)) {
      setCast(cast.filter(id => id !== r.templateRecruitId));
    } else {
      if (cast.length >= MAX_CAST) return;
      setCast([...cast, r.templateRecruitId]);
    }
  };

  const autoPick = () => {
    const sorted = [...recruits].sort((a, b) => b.overall - a.overall);
    const picked: string[] = [];
    const addIf = (cond: (r: WizardRecruit) => boolean, max: number) => {
      for (const r of sorted) {
        if (picked.length >= MAX_CAST) break;
        if (cond(r) && !picked.includes(r.templateRecruitId)) picked.push(r.templateRecruitId);
        if (picked.filter(id => recruits.find(r2 => r2.templateRecruitId === id && cond(r2))).length >= max) break;
      }
    };
    // ≥2 pitchers, ≥2 hitters, ≥1 elite (OVR ≥ 450), then fill by OVR
    addIf(r => isPitcherR(r.position), 2);
    addIf(r => !isPitcherR(r.position), 2);
    addIf(r => r.overall >= 450, 1);
    for (const r of sorted) {
      if (picked.length >= MAX_CAST) break;
      if (!picked.includes(r.templateRecruitId)) picked.push(r.templateRecruitId);
    }
    setCast(picked.slice(0, MAX_CAST));
  };

  const castRecruits = cast.map(id => recruits.find(r => r.templateRecruitId === id)).filter(Boolean) as WizardRecruit[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-gold text-sm font-semibold">Story Cast</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select up to 10 recruits to feature in authored storyline arcs. All others follow the standard random-archetype system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RetroButton variant="outline" size="sm" onClick={autoPick} data-testid="story-cast-autopick">
            Auto-Pick
          </RetroButton>
        </div>
      </div>
      <AiAssistPanel
        projectId={projectId}
        jobType="cast_proposal"
        metadata={{
          cast,
          candidates: recruits.slice(0, 20).map(r => ({
            templateRecruitId: r.templateRecruitId,
            name: `${r.firstName} ${r.lastName}`,
            position: r.position,
            starRating: r.starRating,
            overall: r.overall,
          })),
        }}
        placeholder="e.g. I want a redemption arc for my top pitcher and a breakout story for a hidden gem…"
        buttonLabel="AI Assist — Cast Roles"
        onAccept={(data) => {
          const d = data as any;
          if (Array.isArray(d.roles)) {
            const ids = d.roles.map((r: any) => r.templateRecruitId).filter(Boolean);
            setCast(ids.slice(0, MAX_CAST));
          }
          onAiAccepted?.();
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: recruit list */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Recruit Pool ({recruits.length})</div>
          {recruits.map(r => {
            const isIn = inCast.has(r.templateRecruitId);
            const isFull = !isIn && cast.length >= MAX_CAST;
            return (
              <div key={r.templateRecruitId} className={`flex items-center gap-2 p-2 rounded border text-xs transition-all ${
                isIn ? "border-gold bg-gold/10" : "border-border bg-card"
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.firstName} {r.lastName}</div>
                  <div className="text-muted-foreground">{r.position} · {"★".repeat(r.starRating)} · OVR {r.overall}</div>
                </div>
                <div className="flex gap-1 items-center shrink-0">
                  {r.isGenerationalGem && <span className="bg-purple-600 text-white text-xs rounded px-1">GEM</span>}
                  {r.isBlueChip && <span className="bg-amber-500 text-black text-xs rounded px-1">BC</span>}
                  <button
                    onClick={() => toggleCast(r)}
                    disabled={isFull}
                    className={`text-xs rounded px-2 py-0.5 transition-colors ${
                      isIn
                        ? "bg-gold/20 text-gold border border-gold/50 hover:bg-red-900/30 hover:text-red-400 hover:border-red-400/50"
                        : isFull
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-card border border-border text-muted-foreground hover:border-gold/50 hover:text-gold"
                    }`}
                    data-testid={`cast-toggle-${r.templateRecruitId}`}
                  >
                    {isIn ? "Remove" : "Add"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: cast board */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Cast Board ({cast.length} / {MAX_CAST})</div>
          <div className="space-y-1">
            {Array.from({ length: MAX_CAST }, (_, i) => {
              const member = castRecruits[i];
              return (
                <div key={i} className={`flex items-center gap-2 p-2 rounded border text-xs ${
                  member ? "border-gold/40 bg-gold/5" : "border-border/40 bg-card/50 border-dashed"
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    member ? "bg-gold text-forest-dark" : "bg-border text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  {member ? (
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">{member.firstName} {member.lastName}</span>
                      <span className="text-muted-foreground ml-1">{member.position} · OVR {member.overall}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 italic">Empty slot</span>
                  )}
                  {member && (
                    <button
                      onClick={() => toggleCast(member)}
                      className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                      data-testid={`cast-remove-slot-${i}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {cast.length === 0 && (
            <p className="text-xs text-muted-foreground/60 mt-2 italic">
              Story Cast is optional — proceed with 0 to use the standard random-archetype system for all recruits.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 8: Arc Studio ───────────────────────────────────────────────────────

function StepArcStudio({
  recruits,
  cast,
  storyPlan,
  setStoryPlan,
  projectId,
  onAiAccepted,
}: {
  recruits: WizardRecruit[];
  cast: string[];
  storyPlan: WizardStoryPlan;
  setStoryPlan: (sp: WizardStoryPlan) => void;
  projectId?: string;
  onAiAccepted?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(cast[0] ?? null);

  const castRecruits = cast.map(id => recruits.find(r => r.templateRecruitId === id)).filter(Boolean) as WizardRecruit[];

  const getMember = (id: string): WizardCastMember =>
    storyPlan.cast.find(m => m.templateRecruitId === id) ?? { templateRecruitId: id, arcMode: "off" };

  const updateMember = (updated: WizardCastMember) => {
    const rest = storyPlan.cast.filter(m => m.templateRecruitId !== updated.templateRecruitId);
    setStoryPlan({ ...storyPlan, cast: [...rest, updated] });
  };

  const selectedRecruit = castRecruits.find(r => r.templateRecruitId === selectedId);
  const selectedMember = selectedId ? getMember(selectedId) : null;

  if (cast.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-border flex items-center justify-center">
          <Wand2 className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">No Cast Members</h3>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
            You did not add any recruits to the Story Cast. All recruits will receive randomly-assigned story archetypes at season start.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/50">Go back to add cast members, or proceed to Playtest.</p>
      </div>
    );
  }

  const polarityColor = (p: string) =>
    p === "positive" ? "text-green-400" : p === "negative" ? "text-red-400" : "text-amber-400";

  const polarityLabel = (p: string) =>
    p === "positive" ? "Upside" : p === "negative" ? "Downside" : "Volatile";

  return (
    <div className="flex gap-4 h-[440px]">
      {/* Left: cast list */}
      <div className="w-48 shrink-0 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Cast ({castRecruits.length})</div>
        {castRecruits.map(r => {
          const member = getMember(r.templateRecruitId);
          const hasArc = member.arcMode === "template" && member.arcTemplateKey;
          const arch = hasArc ? STORY_ARCHETYPES.find(a => a.id === member.arcTemplateKey) : null;
          return (
            <button
              key={r.templateRecruitId}
              onClick={() => setSelectedId(r.templateRecruitId)}
              className={`w-full text-left p-2 rounded border text-xs transition-all ${
                selectedId === r.templateRecruitId
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card hover:border-gold/40"
              }`}
              data-testid={`arc-member-${r.templateRecruitId}`}
            >
              <div className="font-semibold truncate">{r.firstName} {r.lastName}</div>
              <div className="text-muted-foreground truncate">{r.position} · OVR {r.overall}</div>
              {arch ? (
                <div className={`text-xs mt-0.5 truncate ${polarityColor(arch.polarity)}`}>{arch.name}</div>
              ) : (
                <div className="text-muted-foreground/50 text-xs mt-0.5 italic">No arc</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Right: arc assignment panel */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {selectedRecruit && selectedMember ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-gold">{selectedRecruit.firstName} {selectedRecruit.lastName}</div>
              <div className="text-xs text-muted-foreground">{selectedRecruit.position} · OVR {selectedRecruit.overall} · {"★".repeat(selectedRecruit.starRating)}</div>
              <AiAssistPanel
                projectId={projectId}
                jobType="arc_draft"
                metadata={{ recruitName: `${selectedRecruit.firstName} ${selectedRecruit.lastName}` }}
                placeholder="e.g. A redemption arc — he was overlooked, then found his rhythm under pressure…"
                buttonLabel="AI Draft Arc"
                onAccept={(data) => {
                  const d = data as any;
                  if (selectedId) {
                    updateMember({
                      ...getMember(selectedId),
                      arcMode: "template",
                      arcDraftJson: d.chapters ? d : undefined,
                    });
                  }
                  onAiAccepted?.();
                }}
              />
            </div>

            {/* Arc mode selector */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Arc Assignment</div>
              <div className="flex gap-2 mb-3">
                {(["off", "template"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => updateMember({ ...selectedMember, arcMode: mode, arcTemplateKey: mode === "off" ? undefined : selectedMember.arcTemplateKey })}
                    className={`px-3 py-1.5 rounded border text-xs font-semibold transition-all ${
                      selectedMember.arcMode === mode
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-border text-muted-foreground hover:border-gold/40"
                    }`}
                    data-testid={`arc-mode-${mode}`}
                  >
                    {mode === "off" ? "No Arc" : "Template Arc"}
                  </button>
                ))}
              </div>
            </div>

            {/* Template picker */}
            {selectedMember.arcMode === "template" && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Choose Archetype</div>
                <div className="grid grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                  {STORY_ARCHETYPES.filter(a => {
                    const isPitcher = isPitcherR(selectedRecruit.position);
                    if (a.pitcherOnly && !isPitcher) return false;
                    if (a.hitterOnly && isPitcher) return false;
                    return true;
                  }).map(arch => {
                    const isSelected = selectedMember.arcTemplateKey === arch.id;
                    return (
                      <button
                        key={arch.id}
                        onClick={() => updateMember({ ...selectedMember, arcMode: "template", arcTemplateKey: arch.id })}
                        className={`text-left p-2 rounded border text-xs transition-all ${
                          isSelected
                            ? "border-gold bg-gold/10"
                            : "border-border bg-card hover:border-gold/30"
                        }`}
                        data-testid={`arc-template-${arch.id}`}
                      >
                        <div className="font-semibold">{arch.name}</div>
                        <div className={`text-xs mt-0.5 ${polarityColor(arch.polarity)}`}>{polarityLabel(arch.polarity)}</div>
                        <div className="text-muted-foreground/70 text-xs mt-0.5 leading-tight">{arch.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {selectedMember.arcTemplateKey && (() => {
                  const arch = STORY_ARCHETYPES.find(a => a.id === selectedMember.arcTemplateKey);
                  if (!arch) return null;
                  const range = POLARITY_RANGES[arch.polarity];
                  return (
                    <div className="mt-2 p-2 rounded border border-border bg-muted/20 text-xs">
                      <span className="text-muted-foreground">Expected OVR delta: </span>
                      <span className={polarityColor(arch.polarity)}>
                        {range.min > 0 ? "+" : ""}{range.min} to +{range.max} (median {range.median > 0 ? "+" : ""}{range.median})
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Chapter Text Editor (shown when arc_draft was accepted) ── */}
            {selectedMember.arcDraftJson?.chapters && selectedMember.arcDraftJson.chapters.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Chapter Text Editor</div>
                {selectedMember.arcDraftJson.chapters.map((ch, ci) => (
                  <div key={ci} className="mb-3 p-2 border border-border rounded bg-muted/10">
                    <div className="text-xs font-semibold text-gold mb-1.5">{ch.title ?? `Chapter ${ci + 1}`}</div>
                    <div className="text-xs text-muted-foreground mb-1">Event Text</div>
                    <textarea
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs resize-none focus:border-gold focus:outline-none mb-1.5"
                      rows={3}
                      value={ch.eventText ?? ""}
                      onChange={(e) => {
                        if (!selectedMember.arcDraftJson) return;
                        const newChapters = [...selectedMember.arcDraftJson.chapters];
                        newChapters[ci] = { ...ch, eventText: e.target.value };
                        updateMember({ ...selectedMember, arcDraftJson: { ...selectedMember.arcDraftJson, chapters: newChapters } });
                      }}
                      data-testid={`chapter-eventtext-${ci}`}
                    />
                    <AiAssistPanel
                      projectId={projectId}
                      jobType="text_rewrite"
                      metadata={{ originalText: ch.eventText, fieldLabel: `Chapter ${ci + 1} event` }}
                      placeholder="Describe the tone or style you want…"
                      buttonLabel="Rewrite Tone"
                      onAccept={(data) => {
                        const d = data as any;
                        if (d.rewrittenText && selectedMember.arcDraftJson) {
                          const newChapters = [...selectedMember.arcDraftJson.chapters];
                          newChapters[ci] = { ...ch, eventText: d.rewrittenText };
                          updateMember({ ...selectedMember, arcDraftJson: { ...selectedMember.arcDraftJson, chapters: newChapters } });
                        }
                        onAiAccepted?.();
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
            Select a cast member to assign an arc
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 9: Playtest ─────────────────────────────────────────────────────────

function StepPlaytest({
  recruits,
  cast,
  storyPlan,
}: {
  recruits: WizardRecruit[];
  cast: string[];
  storyPlan: WizardStoryPlan;
}) {
  if (cast.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-border flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">No Cast — Standard Mode</h3>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
            No story cast selected. The storyline engine will randomly assign archetypes to ~10 recruits when the season begins.
          </p>
        </div>
      </div>
    );
  }

  const castRecruits = cast.map(id => recruits.find(r => r.templateRecruitId === id)).filter(Boolean) as WizardRecruit[];

  const polarityColor = (p: string) =>
    p === "positive" ? "text-green-400" : p === "negative" ? "text-red-400" : "text-amber-400";

  let totalBest = 0, totalWorst = 0, totalMedian = 0;
  const rows = castRecruits.map((r, i) => {
    const member = storyPlan.cast.find(m => m.templateRecruitId === r.templateRecruitId);
    const arch = member?.arcMode === "template" && member.arcTemplateKey
      ? STORY_ARCHETYPES.find(a => a.id === member.arcTemplateKey)
      : null;
    const range = arch ? POLARITY_RANGES[arch.polarity] : null;
    if (range) {
      totalBest += range.max;
      totalWorst += range.min;
      totalMedian += range.median;
    }
    return { r, arch, range, slot: i + 1 };
  });

  const assignedCount = rows.filter(row => row.arch).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-gold text-sm font-semibold">Playtest Summary</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Simulated OVR outcome ranges for each cast member based on their assigned arc.
          Actual outcomes depend on weekly vote results and volatility during play.
        </p>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Best Case", value: totalBest, cls: "text-green-400" },
          { label: "Median",    value: totalMedian, cls: "text-gold" },
          { label: "Worst Case",value: totalWorst,  cls: "text-red-400" },
        ].map(col => (
          <div key={col.label} className="p-2 rounded border border-border bg-card text-center">
            <div className="text-xs text-muted-foreground">{col.label}</div>
            <div className={`text-sm font-bold ${col.cls}`}>
              {col.value >= 0 ? "+" : ""}{col.value} OVR
            </div>
            <div className="text-xs text-muted-foreground/60">across all cast</div>
          </div>
        ))}
      </div>

      {/* Per-recruit table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-1.5 text-muted-foreground font-semibold">Slot</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-semibold">Recruit</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-semibold">Arc</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-semibold">Best</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-semibold">Median</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-semibold">Worst</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, arch, range, slot }) => (
              <tr key={r.templateRecruitId} className="border-b border-border/50 hover:bg-muted/10">
                <td className="px-3 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-gold/20 text-gold flex items-center justify-center font-bold">{slot}</div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="font-semibold">{r.firstName} {r.lastName}</div>
                  <div className="text-muted-foreground">{r.position} · OVR {r.overall}</div>
                </td>
                <td className="px-3 py-1.5">
                  {arch ? (
                    <span className={polarityColor(arch.polarity)}>{arch.name}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">Random</span>
                  )}
                </td>
                {range ? (
                  <>
                    <td className="px-3 py-1.5 text-right text-green-400">+{range.max}</td>
                    <td className="px-3 py-1.5 text-right text-gold">{range.median >= 0 ? "+" : ""}{range.median}</td>
                    <td className="px-3 py-1.5 text-right text-red-400">{range.min >= 0 ? "+" : ""}{range.min}</td>
                  </>
                ) : (
                  <td className="px-3 py-1.5 text-right text-muted-foreground/50" colSpan={3}>—</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignedCount < cast.length && (
        <p className="text-xs text-amber-400">
          {cast.length - assignedCount} cast member(s) have no arc assigned — they will receive a random archetype at season start.
        </p>
      )}
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

function makeEmptyStoryPlan(): WizardStoryPlan {
  return { mode: "authored", cast: [], createdAt: new Date().toISOString() };
}

export function RecruitingWizard({ open, onClose, leagueId, projectId, onSaved, onSavedToLibrary, user }: Props) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<WizardConfig>(DEFAULT_CONFIG);
  const [recruits, setRecruits] = useState<WizardRecruit[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [rerollingId, setRerollingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [savedToLeague, setSavedToLeague] = useState(false);
  /** Seed returned by the last successful generate call — passed to rerolls for sub-seeding */
  const [masterSeed, setMasterSeed] = useState<string | undefined>(undefined);
  const [generatorVersion, setGeneratorVersion] = useState<number | undefined>(undefined);
  /** Per-recruit reroll nonce — incremented on each reroll so repeated rerolls yield different outputs */
  const [rerollNonces, setRerollNonces] = useState<Record<string, number>>({});
  /** True once any AI job is accepted — propagated into saved classData for badge rendering */
  const [aiAssisted, setAiAssisted] = useState(false);
  // Story Cast & Arc Studio state
  const [cast, setCast] = useState<string[]>([]);
  const [storyPlan, setStoryPlan] = useState<WizardStoryPlan>(makeEmptyStoryPlan());

  // Fetch the league-specific recommended class size (so the slider max + hint stay correct)
  const { data: classTargetData } = useQuery<{ targetSize: number }>({
    queryKey: ["/api/recruit-class-target", leagueId],
    queryFn: async () => {
      const url = leagueId
        ? `/api/recruit-class-target?leagueId=${leagueId}`
        : `/api/recruit-class-target`;
      const res = await fetch(url);
      if (!res.ok) return { targetSize: 80 };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const targetSize = classTargetData?.targetSize;

  // Reset state when wizard opens
  useEffect(() => {
    if (open) {
      setStep(1);
      // Initialize count to DEFAULT_CONFIG; targetSize sync below will update it
      // once the server response arrives (or immediately if already cached).
      setConfig(DEFAULT_CONFIG);
      setRecruits([]);
      setSavedCount(0);
      setRerollingId(null);
      setShowCancelConfirm(false);
      setSavedToLeague(false);
      setCast([]);
      setStoryPlan(makeEmptyStoryPlan());
    }
  }, [open]);

  // Sync count to the league target when it arrives.
  // Only run when the wizard is open and the user hasn't manually changed count
  // away from the default (80), so we don't clobber deliberate commissioner choices.
  useEffect(() => {
    if (open && targetSize != null && targetSize !== 80) {
      setConfig(prev => {
        if (prev.count === DEFAULT_CONFIG.count) {
          return { ...prev, count: targetSize };
        }
        return prev;
      });
    }
  }, [open, targetSize]);

  const generateMutation = useMutation({
    mutationFn: async (cfg: WizardConfig) => {
      const url = leagueId
        ? `/api/leagues/${leagueId}/recruiting/generate-wizard`
        : "/api/recruiting/generate-preview";
      const res = await apiRequest("POST", url, { config: cfg });
      return res.json() as Promise<{ recruits: any[]; masterSeed?: string; generatorVersion?: number }>;
    },
    onSuccess: (data) => {
      // Store seed for deterministic per-recruit reroll sub-seeding
      setMasterSeed(data.masterSeed);
      setGeneratorVersion(data.generatorVersion);
      const withIds: WizardRecruit[] = data.recruits.map((r: any) => ({
        ...r,
        _tempId: tempId(),
        templateRecruitId: r.templateRecruitId ?? ("tpl_" + tempId()),
      }));
      setRecruits(withIds);
      setCast([]);
      setStoryPlan(makeEmptyStoryPlan());
      setStep(7); // → Step 7: Review (unchanged)
    },
  });

  const rerollMutation = useMutation({
    mutationFn: async ({ r, cfg, nonce }: { r: WizardRecruit; cfg: WizardConfig; nonce: number }) => {
      const forcedType: Record<string, any> = {};
      if (r.isGenerationalGem)  forcedType.isGenGem  = true;
      if (r.isGenerationalBust) forcedType.isGenBust = true;
      if (r.isBlueChip)         forcedType.isBlueChip = true;
      if (r.isGem)              forcedType.isGem  = true;
      if (r.isBust)             forcedType.isBust = true;
      forcedType.starRank = r.starRank;
      const url = leagueId
        ? `/api/leagues/${leagueId}/recruiting/reroll-recruit`
        : "/api/recruiting/reroll-single";
      const res = await apiRequest("POST", url, {
        theme: cfg.theme,
        forcedType,
        // Pass seed + recruit identity + nonce so each reroll attempt yields a different result
        masterSeed,
        templateRecruitId: r.templateRecruitId,
        rerollNonce: nonce,
      });
      return (res.json() as Promise<{ recruit: any }>).then(d => ({ newRecruit: d.recruit, oldId: r._tempId, templateId: r.templateRecruitId }));
    },
    onSuccess: ({ newRecruit, oldId }) => {
      setRecruits(prev => prev.map(r => {
        if (r._tempId !== oldId) return r;
        // Preserve templateRecruitId so cast membership survives a reroll.
        // The server generates a fresh recruit object without a templateRecruitId;
        // we carry the old one forward so the cast/arc system still recognises it.
        return { ...newRecruit, _tempId: oldId, templateRecruitId: r.templateRecruitId };
      }));
      setRerollingId(null);
    },
    onError: () => setRerollingId(null),
  });

  // Save to active league's recruiting class (commissioner only)
  const saveToLeagueMutation = useMutation({
    mutationFn: async (toSave: WizardRecruit[]) => {
      if (!leagueId) throw new Error("No league selected");
      const payload = toSave.map(({ _tempId, ...rest }) => rest);
      const finalStoryPlan: WizardStoryPlan = { ...storyPlan, cast: storyPlan.cast.filter(m => cast.includes(m.templateRecruitId)) };
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/save-wizard-class`, {
        recruits: payload,
        storyPlan: finalStoryPlan,
        // Pass generation metadata for seed persistence in the class envelope
        generation: masterSeed ? { seed: masterSeed, version: generatorVersion ?? 1 } : undefined,
        ...(aiAssisted && { ai_assisted: true }),
      });
      return res.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      setSavedCount(data.count);
      setSavedToLeague(true);
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/recruits`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/commissioner`] });
      onSaved?.();
      setStep(12); // → SavedScreen
    },
  });

  // Save to personal library (authenticated) or localStorage (guest)
  const saveToLibraryMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const recruitRows = recruits.map(({ _tempId, ...rest }) => rest);
      const finalStoryPlan: WizardStoryPlan = { ...storyPlan, cast: storyPlan.cast.filter(m => cast.includes(m.templateRecruitId)) };
      const classData = { theme: config.theme, recruits: recruitRows, storyPlan: finalStoryPlan, generation: masterSeed ? { seed: masterSeed, version: generatorVersion ?? 1 } : undefined, ...(aiAssisted && { ai_assisted: true }) };
      if (user) {
        const res = await apiRequest("POST", "/api/saved-recruiting-classes", {
          name,
          description,
          recruitCount: recruitRows.length,
          classData,
        });
        return res.json();
      } else {
        const key = "local-saved-classes";
        const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");
        const newEntry = {
          id: `local-${Date.now()}`,
          name,
          description,
          recruitCount: recruitRows.length,
          classData,
          createdAt: new Date().toISOString(),
          isLocal: true,
        };
        existing.unshift(newEntry);
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 10)));
        return newEntry;
      }
    },
    onSuccess: () => {
      setSavedCount(recruits.length);
      setSavedToLeague(false);
      if (user) {
        queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      }
      onSavedToLibrary?.();
      setStep(12); // → SavedScreen
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate(config);
  };

  const handleReroll = (r: WizardRecruit) => {
    setRerollingId(r._tempId);
    // Increment nonce for this recruit so repeated rerolls produce different results
    const key = r.templateRecruitId ?? r._tempId;
    const nonce = (rerollNonces[key] ?? 0) + 1;
    setRerollNonces(prev => ({ ...prev, [key]: nonce }));
    rerollMutation.mutate({ r, cfg: config, nonce });
  };

  const handleSaveToLeague = () => {
    saveToLeagueMutation.mutate(recruits);
  };

  const handleSaveToLibrary = (name: string, description: string) => {
    saveToLibraryMutation.mutate({ name, description });
  };

  const canNext = () => {
    if (step === 2) {
      const d = config.starDistribution;
      const total = d.blueChip + d.five + d.four + d.three + d.two + d.one;
      return total === 100;
    }
    if (step === 3) {
      const sc = config.specialCounts;
      const specialSlots = sc.blueChips + sc.genGems + sc.genBusts + sc.jucos + sc.rawPlayers + sc.lateBloomers + sc.overdrafts;
      return specialSlots <= config.count;
    }
    if (step === 5) {
      const ovrMin = config.ovrMin ?? 150;
      const ovrMax = config.ovrMax ?? 650;
      return ovrMin <= ovrMax;
    }
    return true;
  };

  const goNext = () => {
    if (step === 6) { handleGenerate(); return; }
    // Steps 7-9 (Cast / ArcStudio / Playtest) advance normally; step 9 → step 10 (Review)
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const goPrev = () => {
    if (step > 1) setStep(s => s - 1);
  };

  // Keyboard navigation: Enter advances, Escape prompts confirmation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const isReviewStep = step === 10;
      const isSaveStep   = step === 11;
      const isSavedStep  = step === 12;
      if (e.key === "Enter" && !isReviewStep && !isSaveStep && !isSavedStep && !generateMutation.isPending) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (canNext()) goNext();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, config, generateMutation.isPending]);

  const isLastConfigStep = step === 6;
  // Steps 10=Review, 11=Save, 12=Saved hide the standard footer nav (they have their own controls)
  const isReviewStep = step === 10;
  const isSaveStep   = step === 11;
  const isSavedStep  = step === 12;
  const showNav      = !isSavedStep && !isReviewStep && !isSaveStep;

  const error = generateMutation.error?.message || saveToLeagueMutation.error?.message || saveToLibraryMutation.error?.message;

  return (
    <>
    <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-gold text-sm">Close wizard?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-xs">
            Any unsaved recruits will be lost. Are you sure you want to close?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowCancelConfirm(false)}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setShowCancelConfirm(false); onClose(); }}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={open} onOpenChange={v => {
      if (!v) {
        if (step > 1 && step < 12) { setShowCancelConfirm(true); }
        else { onClose(); }
      }
    }}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] bg-card border-border flex flex-col p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={e => {
          if (step > 1 && step < 12) {
            e.preventDefault();
            setShowCancelConfirm(true);
          }
        }}
      >
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-gold text-sm">
            Create Recruiting Class
          </DialogTitle>
          <div className="mt-3">
            <StepIndicator step={step} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {isSavedStep ? (
            <SavedScreen count={savedCount} savedToLeague={savedToLeague} onClose={onClose} />
          ) : isSaveStep ? (
            <Step7Save
              recruits={recruits}
              config={config}
              user={user}
              leagueId={leagueId}
              onSaveToLeague={handleSaveToLeague}
              isSavingLeague={saveToLeagueMutation.isPending}
              onSaveToLibrary={handleSaveToLibrary}
              isSavingLibrary={saveToLibraryMutation.isPending}
              masterSeed={masterSeed}
              generatorVersion={generatorVersion}
              aiAssisted={aiAssisted}
            />
          ) : isReviewStep ? (
            <Step6
              recruits={recruits}
              setRecruits={setRecruits}
              onNext={() => setStep(11)}
              onReroll={handleReroll}
              isRerolling={rerollMutation.isPending}
              rerollingId={rerollingId}
              config={config}
            />
          ) : step === 7 ? (
            <StepStoryCast
              recruits={recruits}
              cast={cast}
              setCast={setCast}
              projectId={projectId}
              onAiAccepted={() => setAiAssisted(true)}
            />
          ) : step === 8 ? (
            <StepArcStudio
              recruits={recruits}
              cast={cast}
              storyPlan={storyPlan}
              setStoryPlan={(sp) => {
                setStoryPlan({ ...sp, cast: sp.cast });
              }}
              projectId={projectId}
              onAiAccepted={() => setAiAssisted(true)}
            />
          ) : step === 9 ? (
            <StepPlaytest
              recruits={recruits}
              cast={cast}
              storyPlan={storyPlan}
            />
          ) : step === 1 ? (
            <Step1 config={config} setConfig={setConfig} targetSize={targetSize} projectId={projectId} onAiAccepted={() => setAiAssisted(true)} />
          ) : step === 2 ? (
            <Step2 config={config} setConfig={setConfig} />
          ) : step === 3 ? (
            <Step3 config={config} setConfig={setConfig} />
          ) : step === 4 ? (
            <Step4 config={config} setConfig={setConfig} />
          ) : step === 5 ? (
            <StepOVR config={config} setConfig={setConfig} />
          ) : (
            <Step5 config={config} onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded border border-red-500/40 bg-red-900/20 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {showNav && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
            <RetroButton
              variant="outline"
              onClick={goPrev}
              disabled={step === 1 || generateMutation.isPending}
              data-testid="wizard-prev-btn"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </RetroButton>

            <span className="text-xs font-semibold text-muted-foreground">
              {step} / {TOTAL_STEPS}
            </span>

            <RetroButton
              variant={isLastConfigStep ? "shimmer" : undefined}
              onClick={goNext}
              disabled={!canNext() || generateMutation.isPending}
              data-testid="wizard-next-btn"
            >
              {isLastConfigStep ? (
                generateMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating...</>
                  : <><Wand2 className="w-4 h-4 mr-1" /> Generate</>
              ) : (
                <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </RetroButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
