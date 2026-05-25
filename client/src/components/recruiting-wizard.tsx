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
  Loader2, CheckCircle2, Wand2, Save, AlertCircle,
} from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { PlayerProfileCard } from "@/components/player-profile-card";
import type { Player } from "@/components/player-profile-card";
import type { WizardConfig } from "@shared/schema";
import { getPotentialGrade } from "@shared/potential";

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
  specialCounts: { gems: 0, busts: 0, genGems: 1, genBusts: 1, blueChips: 2, jucos: 5, rawPlayers: 5 },
  positionDistribution: { SP: 20, RP: 12, CP: 8, C: 8, "1B": 7, "2B": 7, "3B": 7, SS: 7, LF: 8, CF: 8, RF: 8 },
  regionSkew: "none",
  fogDensity: 100,
};

const TOTAL_STEPS = 7;

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
  const labels = ["Settings", "Stars", "Specials", "Advanced", "Generate", "Review", "Save"];
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
      <p className="text-xs text-muted-foreground">Set the percentage of recruits in each star tier. Total must equal 100%.</p>

      {/* Visual bar */}
      <div className="h-6 rounded overflow-hidden flex gap-px">
        {bars.map(b => (
          <div key={b.key} className={`${b.color} transition-all`} style={{ width: `${dist[b.key]}%`, minWidth: dist[b.key] > 0 ? 2 : 0 }} />
        ))}
      </div>

      <div className={`text-center font-pixel text-[9px] ${valid ? "text-green-400" : "text-red-400"}`}>
        Total: {total}% {!valid && `(must equal exactly 100%)`}
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
            <span className="text-xs w-8 text-right tabular-nums">{dist[b.key]}%</span>
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

  const rows = [
    { key: "blueChips"  as const, label: "Blue Chip Recruits",     desc: "Guaranteed 500+ OVR, always 5★",         max: 6  },
    { key: "genGems"    as const, label: "Generational Gems",       desc: "651+ OVR, hidden in 1-3★ range",         max: 3  },
    { key: "genBusts"   as const, label: "Generational Busts",      desc: "Below-150 OVR, hidden in 3-5★",          max: 3  },
    { key: "gems"       as const, label: "Regular Gems",            desc: "Above-band OVR for their star rating",    max: 10 },
    { key: "busts"      as const, label: "Regular Busts",           desc: "Below-band OVR for their star rating",    max: 10 },
    { key: "jucos"      as const, label: "JUCO Transfers",          desc: "Junior college transfer recruits",        max: 20 },
    { key: "rawPlayers" as const, label: "Raw Archetypes",          desc: "Unpolished prospects with high variance", max: 15 },
  ];

  const specialSlots = sc.blueChips + sc.genGems + sc.genBusts + sc.jucos + sc.rawPlayers;
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
              <div className="font-pixel text-[8px] text-gold">{r.label}</div>
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
        {sc.blueChips} blue chips + {sc.genGems} gen gems + {sc.genBusts} gen busts + {sc.jucos} JUCOs + {sc.rawPlayers} raw → {remaining} standard slots
      </div>
    </div>
  );
}

// ─── Step 4: Advanced Options ────────────────────────────────────────────────

const PITCHER_POSITIONS: { key: keyof WizardConfig["positionDistribution"]; label: string; desc: string }[] = [
  { key: "SP", label: "SP", desc: "Starting Pitcher" },
  { key: "RP", label: "RP", desc: "Relief Pitcher" },
  { key: "CP", label: "CP", desc: "Closing Pitcher" },
];

const FIELD_POSITIONS: { key: keyof WizardConfig["positionDistribution"]; label: string; desc: string }[] = [
  { key: "C",   label: "C",  desc: "Catcher" },
  { key: "1B",  label: "1B", desc: "First Base" },
  { key: "2B",  label: "2B", desc: "Second Base" },
  { key: "3B",  label: "3B", desc: "Third Base" },
  { key: "SS",  label: "SS", desc: "Shortstop" },
  { key: "LF",  label: "LF", desc: "Left Field" },
  { key: "CF",  label: "CF", desc: "Center Field" },
  { key: "RF",  label: "RF", desc: "Right Field" },
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
  const pitcherTotal = (pd.SP ?? 0) + (pd.RP ?? 0) + (pd.CP ?? 0);
  const fieldTotal   = (pd.C ?? 0) + (pd["1B"] ?? 0) + (pd["2B"] ?? 0) + (pd["3B"] ?? 0)
                     + (pd.SS ?? 0) + (pd.LF ?? 0) + (pd.CF ?? 0) + (pd.RF ?? 0);
  const grandTotal   = pitcherTotal + fieldTotal;
  const pctPitchers  = grandTotal > 0 ? Math.round((pitcherTotal / grandTotal) * 100) : 0;
  const pctField     = grandTotal > 0 ? 100 - pctPitchers : 0;

  const setPD = (key: string, val: number) => {
    setConfig({ ...config, positionDistribution: { ...pd, [key]: Math.max(0, val) } });
  };

  const resetPD = () => {
    setConfig({ ...config, positionDistribution: { SP: 20, RP: 12, CP: 8, C: 8, "1B": 7, "2B": 7, "3B": 7, SS: 7, LF: 8, CF: 8, RF: 8 } });
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

// ─── Step 5: Generate ────────────────────────────────────────────────────────

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
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Abilities</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Type</th>
              <th className="px-2 py-1.5 text-left text-[7px] font-pixel text-muted-foreground whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const isRerollingThis = isRerolling && rerollingId === r._tempId;
              const isPitcher = r.position === "P" || ["SP","RP","CP"].includes(r.position);
              const potGrade = r.potential != null ? getPotentialGrade(r.potential) : "—";
              return (
                <tr key={r._tempId} className={`border-b border-border/40 hover:bg-white/5 transition-colors ${rowBg(r)}`}>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <button
                      className="font-medium hover:text-gold underline-offset-2 hover:underline text-left transition-colors"
                      onClick={() => setDetailRecruit(r)}
                      data-testid={`wizard-name-${r._tempId}`}
                      title="View recruit details"
                    >
                      {r.firstName} {r.lastName}
                    </button>
                  </td>
                  <td className="px-2 py-1 font-pixel text-[8px]">{r.position}</td>
                  <td className="px-2 py-1 text-muted-foreground">{r.recruitYear}</td>
                  <td className="px-2 py-1 text-muted-foreground">{r.homeState}</td>
                  <td className="px-2 py-1">
                    <span className={r.isBlueChip || r.starRating >= 5 ? "text-amber-400" : r.starRating >= 4 ? "text-yellow-400" : "text-muted-foreground"}>
                      {starLabel(r.starRating)}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={r.overall} field="overall" recruitId={r._tempId} onCommit={commitEdit} />
                  </td>
                  <td className="px-2 py-1 font-pixel text-[8px]">{potGrade}</td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <EditCell value={r.hitForAvg} field="hitForAvg" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <EditCell value={r.power} field="power" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <EditCell value={r.speed} field="speed" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={r.arm} field="arm" recruitId={r._tempId} onCommit={commitEdit} />
                  </td>
                  <td className="px-2 py-1">
                    {!isPitcher ? <EditCell value={r.fielding} field="fielding" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <EditCell value={r.velocity} field="velocity" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <EditCell value={r.control} field="control" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <EditCell value={r.stamina} field="stamina" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isPitcher ? <EditCell value={r.stuff} field="stuff" recruitId={r._tempId} onCommit={commitEdit} /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-2 py-1 max-w-[140px]">
                    {r.abilities && (r.abilities as string[]).length > 0 ? (
                      <div className="flex flex-wrap gap-0.5">
                        {(r.abilities as string[]).slice(0, 3).map((ab: string) => (
                          <span key={ab} className="bg-blue-900/40 border border-blue-700/40 text-blue-200 rounded px-1 py-0 text-[8px] whitespace-nowrap">{ab}</span>
                        ))}
                        {(r.abilities as string[]).length > 3 && (
                          <span className="text-muted-foreground text-[8px]">+{(r.abilities as string[]).length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
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
      setStep(6);
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
      setStep(8);
    },
  });

  // Save to personal library (authenticated) or localStorage (guest)
  const saveToLibraryMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const classData = recruits.map(({ _tempId, ...rest }) => rest);
      if (user) {
        const res = await apiRequest("POST", "/api/saved-recruiting-classes", {
          name,
          description,
          recruitCount: classData.length,
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
          recruitCount: classData.length,
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
      setStep(8);
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
      const specialSlots = sc.blueChips + sc.genGems + sc.genBusts + sc.jucos + sc.rawPlayers;
      return specialSlots <= config.count;
    }
    return true;
  };

  const goNext = () => {
    if (step === 5) { handleGenerate(); return; }
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const goPrev = () => {
    if (step === 6) { setStep(5); return; }
    if (step === 7) { setStep(6); return; }
    if (step > 1) setStep(s => s - 1);
  };

  // Keyboard navigation: Enter advances, Escape prompts confirmation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const isReviewStep = step === 6;
      const isSaveStep   = step === 7;
      const isSavedStep  = step === 8;
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

  const isLastConfigStep = step === 5;
  const isReviewStep = step === 6;
  const isSaveStep   = step === 7;
  const isSavedStep  = step === 8;
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
        if (step > 1 && step < 8) { setShowCancelConfirm(true); }
        else { onClose(); }
      }
    }}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] bg-card border-border flex flex-col p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={e => {
          if (step > 1 && step < 8) {
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
              onNext={() => setStep(7)}
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
