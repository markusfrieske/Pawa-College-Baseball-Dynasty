/**
 * Game Prep Card — scouting packet for an upcoming matchup.
 * Designed to be read on a phone right before launching Power Pros.
 * Mobile-first, compact cards, 44px minimum touch targets.
 */
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Shield, AlertTriangle, TrendingUp, TrendingDown,
  Zap, Eye, Target, Wind, ChevronRight, Star, Flame,
} from "lucide-react";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrepPitcher {
  id: string;
  name: string;
  position: string;
  overall: number;
  velocity: number;
  control: number;
  stuff: number;
  stamina: number;
  available: boolean;
  limited: boolean;
  suggestedMaxIP: number;
  era: string | null;
  record: string | null;
}

interface PrepProbableStarter extends PrepPitcher {
  pitchingSuggestedMaxIP: number;
}

interface PrepBatter {
  id: string;
  name: string;
  position: string;
  overall: number;
  hitForAvg: number;
  power: number;
  speed: number;
  starRating: number;
  ba: string | null;
  hr: number | null;
}

interface PrepWeakSpot {
  position: string;
  name: string;
  fielding: number;
  errorResistance: number;
}

interface PrepMeter {
  batting: number;
  power: number;
  speed: number;
  defense: number;
  startingPitching: number;
  bullpen: number;
}

interface PrepTeamAnalysis {
  meter: PrepMeter;
  probableStarter: PrepProbableStarter | null;
  bullpen: PrepPitcher[];
  top3Bats: PrepBatter[];
  weakDefense: PrepWeakSpot[];
  catcher: { arm: number } | null;
  style: string | null;
  philosophy: string[];
  teamBA: string | null;
  teamHR: number | null;
  record: { wins: number; losses: number };
  recentForm: Array<"W" | "L">;
}

interface PrepTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  prestige: number;
  mascot: string;
  coachName: string;
  coachArchetype: string | null;
}

interface PrepH2H {
  homeWins: number;
  awayWins: number;
  totalGames: number;
  recentGames: Array<{
    id: string;
    week: number;
    homeScore: number | null;
    awayScore: number | null;
    homeTeamId: string;
    awayTeamId: string;
  }>;
}

interface GamePrepData {
  game: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    isConference: boolean;
    gameType: string | null;
    week: number;
    season: number;
    phase: string | null;
    isComplete: boolean;
  };
  homeTeam: PrepTeam;
  awayTeam: PrepTeam;
  home: PrepTeamAnalysis;
  away: PrepTeamAnalysis;
  userSide: "home" | "away" | null;
  keysToWin: string[];
  h2h: PrepH2H;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GAME_TYPE_LABELS: Record<string, string> = {
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
  midweek: "Tuesday",
};

const METER_LABELS: Array<{ key: keyof PrepMeter; label: string }> = [
  { key: "batting", label: "Batting" },
  { key: "power", label: "Power" },
  { key: "speed", label: "Speed" },
  { key: "defense", label: "Defense" },
  { key: "startingPitching", label: "Starting P" },
  { key: "bullpen", label: "Bullpen" },
];

function ratingColor(val: number): string {
  if (val >= 70) return "text-emerald-400";
  if (val >= 55) return "text-gold";
  if (val >= 40) return "text-foreground";
  return "text-red-400";
}

function MeterBar({
  myVal,
  oppVal,
  myColor,
  label,
}: {
  myVal: number;
  oppVal: number;
  myColor: string;
  label: string;
}) {
  const myWidth = Math.round((myVal / 100) * 100);
  const oppWidth = Math.round((oppVal / 100) * 100);
  const myAdv = myVal > oppVal + 5;
  const oppAdv = oppVal > myVal + 5;

  return (
    <div className="grid grid-cols-[1fr_60px_1fr] items-center gap-2" data-testid={`meter-row-${label.toLowerCase().replace(" ", "-")}`}>
      {/* My bar (right-aligned) */}
      <div className="flex items-center justify-end gap-1.5">
        <span className={`font-pixel text-[8px] tabular-nums ${myAdv ? "text-emerald-400" : "text-muted-foreground"}`}>
          {myVal}
        </span>
        <div className="w-16 h-2 bg-border/40 rounded-full overflow-hidden flex justify-end">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${myWidth}%`,
              backgroundColor: myColor || "#c0a040",
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span className="font-pixel text-[7px] text-muted-foreground text-center whitespace-nowrap">
        {label.toUpperCase()}
      </span>

      {/* Opp bar (left-aligned) */}
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-2 bg-border/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-muted-foreground/50 rounded-full transition-all"
            style={{ width: `${oppWidth}%` }}
          />
        </div>
        <span className={`font-pixel text-[8px] tabular-nums ${oppAdv ? "text-red-400" : "text-muted-foreground"}`}>
          {oppVal}
        </span>
      </div>
    </div>
  );
}

function RecentFormDots({ form }: { form: Array<"W" | "L"> }) {
  return (
    <div className="flex items-center gap-0.5">
      {form.map((r, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-full flex items-center justify-center font-bold text-[7px] ${
            r === "W" ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400"
          }`}
          data-testid={`form-dot-${i}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function StarDots({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-2.5 h-2.5 ${i < count ? "fill-gold text-gold" : "fill-border/50 text-border/50"}`}
        />
      ))}
    </span>
  );
}

function AvailBadge({ available, limited }: { available: boolean; limited: boolean }) {
  if (!available) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-pixel text-[7px] bg-red-500/15 border border-red-500/30 text-red-400">
        UNAVAIL
      </span>
    );
  }
  if (limited) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-pixel text-[7px] bg-yellow-500/15 border border-yellow-500/30 text-yellow-400">
        LIMITED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-pixel text-[7px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
      RESTED
    </span>
  );
}

function PrepSkeleton() {
  return (
    <div className="container mx-auto px-4 pt-4 pb-24 max-w-2xl space-y-4">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}

// ─── Section: Header ──────────────────────────────────────────────────────────

function HeaderSection({
  data,
  leagueId,
  myTeam,
  oppTeam,
  myAnalysis,
  oppAnalysis,
  isHome,
}: {
  data: GamePrepData;
  leagueId: string;
  myTeam: PrepTeam;
  oppTeam: PrepTeam;
  myAnalysis: PrepTeamAnalysis;
  oppAnalysis: PrepTeamAnalysis;
  isHome: boolean;
}) {
  const { game } = data;
  const dayLabel = game.gameType ? GAME_TYPE_LABELS[game.gameType] ?? game.gameType : "Game";

  return (
    <RetroCard className="mb-4 overflow-hidden" data-testid="card-prep-header">
      <div className="bg-gold/10 px-3 py-1.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-gold" />
          <span className="font-pixel text-gold text-[9px]">GAME PREP</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="font-pixel text-[7px] text-muted-foreground border-border">
            S{game.season} W{game.week}
          </Badge>
          <Badge
            variant="outline"
            className={`font-pixel text-[7px] ${game.isConference ? "border-blue-600/50 text-blue-400" : "border-border text-muted-foreground"}`}
          >
            {game.isConference ? "CONF" : "OOC"}
          </Badge>
          <Badge variant="outline" className="font-pixel text-[7px] text-muted-foreground border-border">
            {dayLabel.toUpperCase()}
          </Badge>
        </div>
      </div>

      <RetroCardContent>
        {/* Matchup row */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <TeamBadge
                abbreviation={myTeam.abbreviation}
                primaryColor={myTeam.primaryColor}
                secondaryColor={myTeam.secondaryColor}
                name={myTeam.name}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{myTeam.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {myAnalysis.record.wins}–{myAnalysis.record.losses}
                  </span>
                  <RecentFormDots form={myAnalysis.recentForm} />
                  {isHome && (
                    <span className="font-pixel text-[7px] text-gold px-1 rounded bg-gold/10 border border-gold/30">HOME</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="font-pixel text-muted-foreground text-[10px] flex-shrink-0">VS</div>

          <div className="flex-1 min-w-0 flex flex-col items-end">
            <div className="flex items-center gap-2">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium truncate">{oppTeam.name}</p>
                <div className="flex items-center justify-end gap-2 mt-0.5">
                  {!isHome && (
                    <span className="font-pixel text-[7px] text-gold px-1 rounded bg-gold/10 border border-gold/30">HOME</span>
                  )}
                  <RecentFormDots form={[...oppAnalysis.recentForm].reverse()} />
                  <span className="text-xs text-muted-foreground">
                    {oppAnalysis.record.wins}–{oppAnalysis.record.losses}
                  </span>
                </div>
              </div>
              <TeamBadge
                abbreviation={oppTeam.abbreviation}
                primaryColor={oppTeam.primaryColor}
                secondaryColor={oppTeam.secondaryColor}
                name={oppTeam.name}
                size="md"
              />
            </div>
          </div>
        </div>

        {/* Coach line */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{myTeam.coachName}{myTeam.coachArchetype ? ` · ${myTeam.coachArchetype}` : ""}</span>
          <span className="text-right">{oppTeam.coachName}{oppTeam.coachArchetype ? ` · ${oppTeam.coachArchetype}` : ""}</span>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Section: Matchup Meter ───────────────────────────────────────────────────

function MatchupMeterSection({
  myAnalysis,
  oppAnalysis,
  myColor,
}: {
  myAnalysis: PrepTeamAnalysis;
  oppAnalysis: PrepTeamAnalysis;
  myColor: string;
}) {
  return (
    <RetroCard className="mb-4" data-testid="card-matchup-meter">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">MATCHUP METER</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-2">
          {METER_LABELS.map(({ key, label }) => (
            <MeterBar
              key={key}
              myVal={myAnalysis.meter[key]}
              oppVal={oppAnalysis.meter[key]}
              myColor={myColor}
              label={label}
            />
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground mt-3 text-center">
          You (left) vs. Opponent (right) — higher is better
        </p>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Section: Pitching Matchup ────────────────────────────────────────────────

function PitcherCard({
  pitcher,
  label,
}: {
  pitcher: PrepProbableStarter | null;
  label: string;
}) {
  if (!pitcher) {
    return (
      <div className="p-3 rounded-lg border border-border/50 bg-background/30">
        <p className="font-pixel text-[8px] text-muted-foreground mb-1">{label}</p>
        <p className="text-sm text-muted-foreground">No starter data</p>
      </div>
    );
  }

  const maxIPLabel = pitcher.pitchingSuggestedMaxIP > 0
    ? `~${pitcher.pitchingSuggestedMaxIP} IP`
    : pitcher.available
      ? `~${pitcher.suggestedMaxIP} IP`
      : "0 IP";

  return (
    <div className="p-3 rounded-lg border border-border/50 bg-background/30" data-testid="card-probable-starter">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-pixel text-[8px] text-muted-foreground mb-0.5">{label}</p>
          <p className="font-medium text-sm leading-tight">{pitcher.name}</p>
          {pitcher.record && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {pitcher.record}{pitcher.era ? ` · ${pitcher.era} ERA` : ""}
            </p>
          )}
        </div>
        <AvailBadge available={pitcher.available} limited={pitcher.limited} />
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: "VEL", val: pitcher.velocity },
          { label: "CTRL", val: pitcher.control },
          { label: "STF", val: pitcher.stuff },
          { label: "STM", val: pitcher.stamina },
        ].map(({ label: lbl, val }) => (
          <div key={lbl} className="bg-background/50 rounded py-1">
            <div className={`text-xs font-bold ${ratingColor(val)}`}>{val}</div>
            <div className="font-pixel text-[6px] text-muted-foreground">{lbl}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Wind className="w-3 h-3 flex-shrink-0" />
        <span>Max this game: <span className="text-foreground font-medium">{maxIPLabel}</span></span>
      </div>
    </div>
  );
}

function PitchingSection({
  myAnalysis,
  oppAnalysis,
  oppTeam,
}: {
  myAnalysis: PrepTeamAnalysis;
  oppAnalysis: PrepTeamAnalysis;
  oppTeam: PrepTeam;
}) {
  return (
    <RetroCard className="mb-4" data-testid="card-pitching">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">PITCHING MATCHUP</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PitcherCard pitcher={myAnalysis.probableStarter} label="YOUR STARTER" />
          <PitcherCard pitcher={oppAnalysis.probableStarter} label={`${oppTeam.abbreviation} STARTER`} />
        </div>

        {/* Opponent bullpen */}
        {oppAnalysis.bullpen.length > 0 && (
          <div className="mt-3">
            <p className="font-pixel text-[8px] text-muted-foreground mb-1.5">
              {oppTeam.abbreviation} BULLPEN
            </p>
            <div className="flex flex-wrap gap-2">
              {oppAnalysis.bullpen.map(rp => (
                <div
                  key={rp.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-background/30 border border-border/40 text-xs"
                  data-testid={`chip-opp-rp-${rp.id}`}
                >
                  <span className="font-medium truncate max-w-[90px]">{rp.name.split(" ")[1] ?? rp.name}</span>
                  <span className={`font-pixel text-[7px] ${ratingColor(rp.velocity)}`}>{rp.velocity}v</span>
                  {!rp.available && (
                    <span className="font-pixel text-[7px] text-red-400 border border-red-500/30 rounded px-0.5">OUT</span>
                  )}
                  {rp.era && (
                    <span className="font-pixel text-[7px] text-muted-foreground">{rp.era}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Section: Lineup Threats ──────────────────────────────────────────────────

function LineupSection({
  oppAnalysis,
  oppTeam,
}: {
  oppAnalysis: PrepTeamAnalysis;
  oppTeam: PrepTeam;
}) {
  return (
    <RetroCard className="mb-4" data-testid="card-lineup-threats">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">
            {oppTeam.abbreviation} — LINEUP THREATS
          </h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {/* Top bats */}
        <div className="space-y-2 mb-3">
          {oppAnalysis.top3Bats.map((batter, idx) => (
            <div
              key={batter.id}
              className="flex items-center gap-3 p-2 rounded bg-background/30 border border-border/40"
              data-testid={`row-opp-batter-${batter.id}`}
            >
              <span className="font-pixel text-[9px] text-muted-foreground w-4 text-center">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">{batter.name}</span>
                  <span className="font-pixel text-[8px] text-muted-foreground">{batter.position}</span>
                  <StarDots count={batter.starRating} />
                </div>
                {batter.ba && (
                  <span className="text-[10px] text-muted-foreground">
                    {batter.ba} AVG{batter.hr != null ? ` · ${batter.hr} HR` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-center">
                  <div className={`text-xs font-bold ${ratingColor(batter.hitForAvg)}`}>{batter.hitForAvg}</div>
                  <div className="font-pixel text-[6px] text-muted-foreground">HIT</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs font-bold ${ratingColor(batter.power)}`}>{batter.power}</div>
                  <div className="font-pixel text-[6px] text-muted-foreground">PWR</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs font-bold ${ratingColor(batter.speed)}`}>{batter.speed}</div>
                  <div className="font-pixel text-[6px] text-muted-foreground">SPD</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Team batting line */}
        {(oppAnalysis.teamBA || oppAnalysis.teamHR != null) && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3 px-1">
            {oppAnalysis.teamBA && <span>Team AVG: <span className="text-foreground font-medium">{oppAnalysis.teamBA}</span></span>}
            {oppAnalysis.teamHR != null && <span>Team HR: <span className="text-foreground font-medium">{oppAnalysis.teamHR}</span></span>}
          </div>
        )}

        {/* Weak defensive spots */}
        {oppAnalysis.weakDefense.length > 0 && (
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground mb-1.5">EXPLOITABLE GLOVES</p>
            <div className="flex flex-wrap gap-2">
              {oppAnalysis.weakDefense.map(spot => (
                <div
                  key={spot.position}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-red-500/5 border border-red-500/20 text-xs"
                  data-testid={`chip-weak-def-${spot.position}`}
                >
                  <span className="font-pixel text-[8px] text-red-400">{spot.position}</span>
                  <span className="text-muted-foreground">{spot.name.split(" ")[1] ?? spot.name}</span>
                  <span className={`font-pixel text-[7px] ${ratingColor(spot.fielding)}`}>{spot.fielding} FLD</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Section: Keys to Win ─────────────────────────────────────────────────────

function KeysToWinSection({ keys }: { keys: string[] }) {
  if (keys.length === 0) return null;

  const icons = [Flame, TrendingUp, Shield, Zap, Star];

  return (
    <RetroCard className="mb-4 border-gold/30" data-testid="card-keys-to-win">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">KEYS TO WIN</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-2">
          {keys.map((key, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-gold/5 border border-gold/20 min-h-[44px]"
                data-testid={`row-key-${i}`}
              >
                <Icon className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                <p className="text-sm leading-snug text-foreground/90">{key}</p>
              </div>
            );
          })}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Section: Head to Head ────────────────────────────────────────────────────

function H2HSection({
  h2h,
  homeTeam,
  awayTeam,
  myTeamId,
}: {
  h2h: PrepH2H;
  homeTeam: PrepTeam;
  awayTeam: PrepTeam;
  myTeamId: string | null;
}) {
  if (h2h.totalGames === 0) {
    return (
      <RetroCard className="mb-4" data-testid="card-h2h-none">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">HEAD TO HEAD</h3>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground">No prior meetings this season.</p>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const homeWins = h2h.homeWins;
  const awayWins = h2h.awayWins;

  return (
    <RetroCard className="mb-4" data-testid="card-h2h">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">HEAD TO HEAD THIS SEASON</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center justify-center gap-6 mb-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-gold">{awayWins}</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[80px]">{awayTeam.abbreviation}</p>
          </div>
          <div className="font-pixel text-muted-foreground text-[10px]">–</div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gold">{homeWins}</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[80px]">{homeTeam.abbreviation}</p>
          </div>
        </div>

        <div className="space-y-1.5" data-testid="list-h2h-games">
          {h2h.recentGames.map(g => {
            const isHomeFromPerspective = g.homeTeamId === homeTeam.id;
            const homeAbbr = isHomeFromPerspective ? homeTeam.abbreviation : awayTeam.abbreviation;
            const awayAbbr = isHomeFromPerspective ? awayTeam.abbreviation : homeTeam.abbreviation;
            const myTeamIsHome = myTeamId === g.homeTeamId;
            const myTeamIsAway = myTeamId === g.awayTeamId;
            const iWon = (myTeamIsHome && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
              (myTeamIsAway && (g.awayScore ?? 0) > (g.homeScore ?? 0));
            const iPlayed = myTeamIsHome || myTeamIsAway;

            return (
              <div
                key={g.id}
                className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${
                  iPlayed
                    ? iWon ? "bg-emerald-500/10" : "bg-red-500/10"
                    : "bg-background/30"
                }`}
                data-testid={`row-h2h-${g.id}`}
              >
                <span className="text-muted-foreground text-xs">Wk {g.week}</span>
                <span>
                  <span className="text-muted-foreground">{awayAbbr}</span>
                  <span className="mx-1.5 font-bold">
                    {g.awayScore ?? "?"} – {g.homeScore ?? "?"}
                  </span>
                  <span className="text-muted-foreground">{homeAbbr}</span>
                </span>
                {iPlayed && (
                  <Badge
                    variant="outline"
                    className={`text-[8px] font-pixel ${iWon ? "border-emerald-600 text-emerald-400" : "border-red-600 text-red-400"}`}
                  >
                    {iWon ? "W" : "L"}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GamePrepPage() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<GamePrepData>({
    queryKey: ["/api/leagues", id, "games", gameId, "prep"],
    staleTime: 60_000,
  });

  if (isLoading) return <PrepSkeleton />;

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <RetroCard variant="bordered" className="text-center p-8 max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-pixel text-gold text-xs mb-2">Prep Card Unavailable</h2>
          <p className="text-sm text-muted-foreground mb-4">Could not load game prep data.</p>
          <RetroButton onClick={() => navigate(`/league/${id}/schedule`)} data-testid="button-prep-back">
            Back to Schedule
          </RetroButton>
        </RetroCard>
      </div>
    );
  }

  const { game, homeTeam, awayTeam, home, away, userSide, keysToWin, h2h } = data;

  // Determine which side is "mine" for display purposes
  // If user isn't in the game, default to away's perspective (challenger)
  const isMyHome = userSide === "home";
  const myTeam = isMyHome ? homeTeam : awayTeam;
  const oppTeam = isMyHome ? awayTeam : homeTeam;
  const myAnalysis = isMyHome ? home : away;
  const oppAnalysis = isMyHome ? away : home;
  const myTeamId = userSide ? (isMyHome ? homeTeam.id : awayTeam.id) : null;

  return (
    <div className="min-h-screen bg-background" data-testid="page-game-prep">
      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 max-w-2xl flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/league/${id}/schedule`)}
            className="text-muted-foreground hover:text-gold transition-colors flex-shrink-0 min-h-[44px] flex items-center"
            aria-label="Back to schedule"
            data-testid="button-prep-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-pixel text-gold text-[10px]">GAME PREP</span>
              {game.isComplete && (
                <Badge variant="outline" className="font-pixel text-[7px] text-muted-foreground border-border">
                  COMPLETED
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {awayTeam.abbreviation} @ {homeTeam.abbreviation}
            </p>
          </div>
          <Link href={`/league/${id}/schedule`}>
            <RetroButton variant="outline" size="sm" className="min-h-[44px] flex-shrink-0" data-testid="button-prep-schedule">
              Schedule
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </RetroButton>
          </Link>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 pt-4 pb-24 max-w-2xl">
        <HeaderSection
          data={data}
          leagueId={id}
          myTeam={myTeam}
          oppTeam={oppTeam}
          myAnalysis={myAnalysis}
          oppAnalysis={oppAnalysis}
          isHome={isMyHome}
        />

        <MatchupMeterSection
          myAnalysis={myAnalysis}
          oppAnalysis={oppAnalysis}
          myColor={myTeam.primaryColor || "#c0a040"}
        />

        <PitchingSection
          myAnalysis={myAnalysis}
          oppAnalysis={oppAnalysis}
          oppTeam={oppTeam}
        />

        <LineupSection
          oppAnalysis={oppAnalysis}
          oppTeam={oppTeam}
        />

        <KeysToWinSection keys={keysToWin} />

        <H2HSection
          h2h={h2h}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          myTeamId={myTeamId}
        />

        {/* Also show my lineup if not user game */}
        {!userSide && (
          <RetroCard className="mb-4" data-testid="card-home-lineup-neutral">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gold" />
                <h3 className="font-pixel text-gold text-[9px]">{homeTeam.abbreviation} — LINEUP</h3>
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="space-y-1.5">
                {home.top3Bats.map((batter, idx) => (
                  <div key={batter.id} className="flex items-center gap-2 py-1" data-testid={`row-home-batter-${batter.id}`}>
                    <span className="font-pixel text-[8px] text-muted-foreground w-4">{idx + 1}</span>
                    <span className="font-medium text-sm flex-1 truncate">{batter.name}</span>
                    <span className="font-pixel text-[8px] text-muted-foreground">{batter.position}</span>
                    <span className={`text-xs font-bold ${ratingColor(batter.overall)}`}>{batter.overall}</span>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        )}
      </div>
    </div>
  );
}
