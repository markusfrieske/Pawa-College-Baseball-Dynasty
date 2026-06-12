import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import type { WizardConfig } from "@shared/schema";
import { getPotentialGrade, POTENTIAL_GRADES } from "@shared/potential";
import { getAbilitiesForPosition, MAX_SPECIAL_ABILITIES } from "@shared/abilities";
import { PITCH_DEFS } from "@shared/pitchDefs";

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardRecruit = {
  _tempId: string;
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

const TOTAL_STEPS = 8;

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

function StepIndicator({ step }: { step: number }) {
  const labels = ["Settings", "Stars", "Specials", "Advanced", "OVR", "Generate", "Review", "Save"];
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide pb-1">
      {labels.map((lbl, idx) => {
        const s = idx + 1;
        const active = s === step;
        const done   = s < step;
        return (
          <div key={s} className="flex items-center">
            <div className={`flex flex-col items-center min-w-[52px] ${active ? "opacity-100" : done ? "opacity-60" : "opacity-30"}`}>
              <div className={`w-6 h-6 rounded-full text-[9px] font-pixel flex items-center justify-center ${
                active ? "bg-gold text-forest-dark" : done ? "bg-gold/40 text-gold" : "bg-border text-muted-foreground"}`}>
                {s}
              </div>
              <span className="font-pixel text-[6px] mt-0.5 text-center leading-tight">{lbl}</span>
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

// ─── Step 1: Class Settings ──────────────────────────────────────────────────

function Step1({ config, setConfig }: { config: WizardConfig; setConfig: (c: WizardConfig) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">Class Size: {config.count}</Label>
        <input
          type="range" min={20} max={80} step={1}
          value={config.count}
          onChange={e => setConfig({ ...config, count: Number(e.target.value) })}
          className="w-full accent-yellow-400"
          data-testid="wizard-count-slider"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>20</span><span>80</span>
        </div>
      </div>

      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">Theme</Label>
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
              <div className="font-pixel text-[7px] mb-0.5">{t.label}</div>
              <div className="text-[9px] leading-tight">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">Class Label (Optional)</Label>
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

      <div className={`text-center font-pixel text-[9px] ${valid ? "text-green-400" : "text-red-400"}`}>
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
                <div className="font-pixel text-[8px] text-gold">{r.label}</div>
                {r.note && <span className="text-[7px] text-muted-foreground/60 border border-border rounded px-1 py-0">{r.note}</span>}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{r.desc}</div>
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
        <span className="font-pixel text-[8px] text-gold">Class breakdown: </span>
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
          <Label className="font-pixel text-[8px] text-gold uppercase">Position Mix</Label>
          <button
            onClick={resetPD}
            className="text-[9px] text-muted-foreground hover:text-gold transition-colors underline underline-offset-2"
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
              <span className="font-pixel text-[8px] text-gold uppercase">Pitchers</span>
              <span className="text-[9px] text-muted-foreground tabular-nums">{pitcherTotal} ({pctPitchers}%)</span>
            </div>
            <div className="space-y-2">
              {PITCHER_POSITIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-pixel text-[8px] text-foreground">{p.label}</span>
                    <span className="text-[9px] text-muted-foreground ml-2">{p.desc}</span>
                  </div>
                  <PosInput posKey={p.key} value={(pd as any)[p.key] ?? 0} onChange={setPD} />
                </div>
              ))}
            </div>
          </div>

          {/* Position Players */}
          <div className="rounded border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-pixel text-[8px] text-gold uppercase">Position Players</span>
              <span className="text-[9px] text-muted-foreground tabular-nums">{fieldTotal} ({pctField}%)</span>
            </div>
            <div className="space-y-2">
              {FIELD_POSITIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-pixel text-[8px] text-foreground">{p.label}</span>
                    <span className="text-[9px] text-muted-foreground ml-2">{p.desc}</span>
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
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/70" /> Pitchers {pctPitchers}%
          </span>
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500/70" /> Position Players {pctField}%
          </span>
          <span className="text-[9px] text-muted-foreground ml-auto">Total weight: {grandTotal}</span>
        </div>
      </div>

      {/* Region Skew */}
      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">
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
              <div className="font-pixel text-[7px] mb-0.5">{r.label}</div>
              <div className="text-[9px] leading-tight">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fog of War */}
      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">
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
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">OVR Range</Label>
        <p className="text-xs text-muted-foreground mb-3">Set the minimum and maximum overall rating for recruits in this class (150–650).</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-pixel text-[7px] text-muted-foreground mb-1 block">Min OVR</label>
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
            <label className="font-pixel text-[7px] text-muted-foreground mb-1 block">Max OVR</label>
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
          <p className="text-red-400 text-[9px] mt-1">Min OVR must be ≤ Max OVR.</p>
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
        <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
          <span>150</span><span>400</span><span>650</span>
        </div>
      </div>

      {/* Desired Average OVR */}
      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">
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
          <p className="text-amber-400 text-[9px] mt-1">Average will be clamped to [{ovrMin}, {ovrMax}] at generation time.</p>
        )}
      </div>

      {/* Distribution Shape */}
      <div>
        <Label className="font-pixel text-[8px] text-gold uppercase mb-2 block">Distribution Shape</Label>
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
              <div className="font-pixel text-[7px] mb-0.5">{opt.label}</div>
              <div className="text-[9px] leading-tight">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Reset to defaults */}
      <button
        onClick={() => setConfig({ ...config, ovrMin: 150, ovrMax: 650, ovrAverage: 300, ovrDistribution: "bell" })}
        className="text-[9px] text-muted-foreground hover:text-gold transition-colors underline underline-offset-2"
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
        <h3 className="font-pixel text-gold text-sm">Ready to Generate</h3>
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
        <div className="text-xs text-muted-foreground text-center animate-pulse font-pixel text-[8px]">
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
  value, field, recruitId, options, onCommit, className: cls = "font-pixel text-[8px]",
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
        className="font-bold text-[10px] leading-none"
      />
      <span className="text-[8px] text-muted-foreground/50 leading-none">{value}</span>
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
            className="bg-background border border-gold text-[8px] rounded px-0.5 py-0 text-foreground max-w-[140px]"
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
            className={`inline-flex items-center gap-0.5 border rounded px-1 py-0 text-[8px] whitespace-nowrap cursor-pointer hover:ring-1 hover:ring-gold/50 transition-all ${tierColor(ab)}`}
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
            className="bg-background border border-gold text-[8px] rounded px-0.5 py-0 text-foreground max-w-[130px]"
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
            className="text-muted-foreground/40 hover:text-gold text-[10px] font-bold transition-colors leading-none"
            title="Add ability"
            data-testid={`wizard-add-ability-btn-${recruitId}`}
          >+</button>
        )
      )}
      {abilities.length === 0 && !adding && !swapping && (
        <span className="text-muted-foreground/30 text-[8px]">—</span>
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
            <span key={def.key} className="bg-orange-900/40 border border-orange-600/40 text-orange-200 rounded px-1 py-0 text-[8px] whitespace-nowrap">
              FB
            </span>
          );
        }

        if (def.binary) {
          return (
            <button
              key={def.key}
              onClick={() => onCommit(recruitId, def.key, val > 0 ? 0 : 1)}
              className="bg-sky-900/40 border border-sky-600/40 text-sky-200 hover:border-sky-400 rounded px-1 py-0 text-[8px] whitespace-nowrap transition-colors"
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
              className="bg-background border border-gold text-[8px] rounded px-0.5 py-0 text-foreground w-[68px]"
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
            className="bg-violet-900/40 border border-violet-600/40 text-violet-200 hover:border-violet-400 rounded px-1 py-0 text-[8px] whitespace-nowrap transition-colors"
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
            className="bg-background border border-gold text-[8px] rounded px-0.5 py-0 text-foreground max-w-[90px]"
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
            className="text-muted-foreground/40 hover:text-gold text-[10px] font-bold transition-colors leading-none"
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
      className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground cursor-pointer hover:text-gold whitespace-nowrap"
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
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap w-10">Img</th>
              <SortTh label="Name"  field="name" />
              <SortTh label="Pos"   field="pos" />
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Yr</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">State</th>
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
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Pitches</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Abilities</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">NIL</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Type</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Actions</th>
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
                    <div className={`inline-flex items-center px-1 rounded text-[10px] font-bold ${
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
                      className="font-pixel text-[8px]"
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
                  <td className="px-2 py-1 whitespace-nowrap tabular-nums text-[9px] text-muted-foreground" data-testid={`wizard-nil-${r._tempId}`}>
                    {r.nilCost != null && r.nilCost > 0
                      ? r.nilCost >= 1_000_000
                        ? `$${(r.nilCost / 1_000_000).toFixed(1)}M`
                        : `$${Math.round(r.nilCost / 1_000)}K`
                      : "—"}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5 flex-wrap">
                      {typeBadges(r).map(b => (
                        <span key={b.label} className={`${b.cls} rounded px-1 py-0 font-pixel text-[6px]`}>{b.label}</span>
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
}: {
  recruits: WizardRecruit[];
  config: WizardConfig;
  user?: { id: string; email: string } | null;
  leagueId?: string;
  onSaveToLeague: () => void;
  isSavingLeague: boolean;
  onSaveToLibrary: (name: string, desc: string) => void;
  isSavingLibrary: boolean;
}) {
  const [className, setClassName] = useState(config.label || "");
  const [classDesc, setClassDesc] = useState("");

  const isBusy = isSavingLeague || isSavingLibrary;

  return (
    <div className="flex flex-col gap-6 py-4 max-w-md mx-auto">
      <div className="text-center space-y-1">
        <h3 className="font-pixel text-gold text-sm">Save Your Class</h3>
        <p className="text-xs text-muted-foreground">{recruits.length} recruits ready · choose how to save</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="font-pixel text-[8px] text-gold uppercase mb-1.5 block">Class Name</label>
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
          <label className="font-pixel text-[8px] text-gold uppercase mb-1.5 block">Description (optional)</label>
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
          <p className="text-[10px] text-muted-foreground text-center">
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
        <h3 className="font-pixel text-gold text-sm">Class Saved!</h3>
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

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export function RecruitingWizard({ open, onClose, leagueId, onSaved, onSavedToLibrary, user }: Props) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<WizardConfig>(DEFAULT_CONFIG);
  const [recruits, setRecruits] = useState<WizardRecruit[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [rerollingId, setRerollingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [savedToLeague, setSavedToLeague] = useState(false);

  // Reset state when wizard opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setConfig(DEFAULT_CONFIG);
      setRecruits([]);
      setSavedCount(0);
      setRerollingId(null);
      setShowCancelConfirm(false);
      setSavedToLeague(false);
    }
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async (cfg: WizardConfig) => {
      const url = leagueId
        ? `/api/leagues/${leagueId}/recruiting/generate-wizard`
        : "/api/recruiting/generate-preview";
      const res = await apiRequest("POST", url, { config: cfg });
      return res.json() as Promise<{ recruits: any[] }>;
    },
    onSuccess: (data) => {
      const withIds: WizardRecruit[] = data.recruits.map((r: any) => ({
        ...r,
        _tempId: tempId(),
      }));
      setRecruits(withIds);
      setStep(7);
    },
  });

  const rerollMutation = useMutation({
    mutationFn: async ({ r, cfg }: { r: WizardRecruit; cfg: WizardConfig }) => {
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
      });
      return (res.json() as Promise<{ recruit: any }>).then(d => ({ newRecruit: d.recruit, oldId: r._tempId }));
    },
    onSuccess: ({ newRecruit, oldId }) => {
      setRecruits(prev => prev.map(r =>
        r._tempId === oldId ? { ...newRecruit, _tempId: oldId } : r
      ));
      setRerollingId(null);
    },
    onError: () => setRerollingId(null),
  });

  // Save to active league's recruiting class (commissioner only)
  const saveToLeagueMutation = useMutation({
    mutationFn: async (toSave: WizardRecruit[]) => {
      if (!leagueId) throw new Error("No league selected");
      const payload = toSave.map(({ _tempId, ...rest }) => rest);
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/save-wizard-class`, { recruits: payload });
      return res.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      setSavedCount(data.count);
      setSavedToLeague(true);
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/recruits`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/commissioner`] });
      onSaved?.();
      setStep(9);
    },
  });

  // Save to personal library (authenticated) or localStorage (guest)
  const saveToLibraryMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const recruitRows = recruits.map(({ _tempId, ...rest }) => rest);
      const classData = { theme: config.theme, recruits: recruitRows };
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
      setStep(9);
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate(config);
  };

  const handleReroll = (r: WizardRecruit) => {
    setRerollingId(r._tempId);
    rerollMutation.mutate({ r, cfg: config });
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
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const goPrev = () => {
    if (step === 7) { setStep(6); return; }
    if (step === 8) { setStep(7); return; }
    if (step > 1) setStep(s => s - 1);
  };

  // Keyboard navigation: Enter advances, Escape prompts confirmation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const isReviewStep = step === 7;
      const isSaveStep   = step === 8;
      const isSavedStep  = step === 9;
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
  const isReviewStep = step === 7;
  const isSaveStep   = step === 8;
  const isSavedStep  = step === 9;
  const showNav      = !isSavedStep && !isReviewStep && !isSaveStep;

  const error = generateMutation.error?.message || saveToLeagueMutation.error?.message || saveToLibraryMutation.error?.message;

  return (
    <>
    <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-pixel text-gold text-sm">Close wizard?</AlertDialogTitle>
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
        if (step > 1 && step < 9) { setShowCancelConfirm(true); }
        else { onClose(); }
      }
    }}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] bg-card border-border flex flex-col p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={e => {
          if (step > 1 && step < 9) {
            e.preventDefault();
            setShowCancelConfirm(true);
          }
        }}
      >
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-pixel text-gold text-sm">
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
            />
          ) : isReviewStep ? (
            <Step6
              recruits={recruits}
              setRecruits={setRecruits}
              onNext={() => setStep(8)}
              onReroll={handleReroll}
              isRerolling={rerollMutation.isPending}
              rerollingId={rerollingId}
              config={config}
            />
          ) : step === 1 ? (
            <Step1 config={config} setConfig={setConfig} />
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

            <span className="font-pixel text-[8px] text-muted-foreground">
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
