import { X, MapPin, DollarSign, Trophy, TrendingUp } from "lucide-react";

export interface TeamScoutingInfo {
  talentRank: number;
  totalTeams: number;
  pitchingGrade: { letter: string; score: number };
  hittingGrade: { letter: string; score: number };
  fieldingGrade: { letter: string; score: number };
  speedGrade: { letter: string; score: number };
  topFielder: { name: string; position: string; eligibility: string; overall: number; starRating: number } | null;
  topPitcher: { name: string; position: string; eligibility: string; overall: number; starRating: number } | null;
  topUnderclassman: { name: string; position: string; eligibility: string; overall: number; starRating: number } | null;
  recruitingAdvantage: { grade: string; label: string; score: number };
  projectedConferenceFinish: { rank: number; total: number };
  nilBudget: number;
  city: string;
  state: string;
  conference: string;
}

function gradeColor(letter: string) {
  if (letter === "A+" || letter === "A") return "text-gold";
  if (letter === "B+" || letter === "B") return "text-white";
  if (letter === "C+" || letter === "C") return "text-muted-foreground";
  return "text-red-400";
}

function StarDots({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= count ? "bg-gold" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function GradeBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <div
          key={i}
          className={`flex-1 h-1 rounded-sm ${
            i <= score
              ? score >= 8 ? "bg-gold" : score >= 5 ? "bg-white/60" : "bg-red-400/60"
              : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function UnitGradeCell({ label, grade }: { label: string; grade: { letter: string; score: number } }) {
  return (
    <div className="p-2.5 bg-background/60 rounded border border-border/50">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] font-pixel text-muted-foreground uppercase">{label}</span>
        <span className={`text-base font-bold font-pixel ${gradeColor(grade.letter)}`}>{grade.letter}</span>
      </div>
      <GradeBar score={grade.score} />
    </div>
  );
}

function PlayerChip({ label, player }: { label: string; player: TeamScoutingInfo["topFielder"] }) {
  if (!player) return (
    <div className="flex-1 p-2.5 bg-background/60 rounded border border-border/50 opacity-40">
      <p className="text-[9px] font-pixel text-muted-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">—</p>
    </div>
  );
  return (
    <div className="flex-1 p-2.5 bg-background/60 rounded border border-border/50" data-testid={`scouting-player-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-[9px] font-pixel text-muted-foreground mb-1">{label}</p>
      <p className="text-xs font-medium truncate leading-tight">{player.name}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9px] text-muted-foreground">{player.position} · {player.eligibility}</span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <StarDots count={player.starRating} />
        <span className="text-[10px] text-muted-foreground font-mono">{player.overall}</span>
      </div>
    </div>
  );
}

interface TeamScoutingPanelProps {
  teamName: string;
  info: TeamScoutingInfo;
  onClose?: () => void;
  variant?: "fixed" | "inline";
}

export function TeamScoutingPanel({ teamName, info, onClose, variant = "fixed" }: TeamScoutingPanelProps) {
  const rankOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const nilFormatted = info.nilBudget >= 1_000_000
    ? `$${(info.nilBudget / 1_000_000).toFixed(1)}M`
    : `$${(info.nilBudget / 1_000).toFixed(0)}K`;

  return (
    <div
      className={`bg-card border-t-2 border-gold/60 ${variant === "fixed" ? "shadow-2xl" : "rounded-b border border-t-0 border-border/60"}`}
      data-testid={`scouting-panel-${teamName.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="font-pixel text-gold text-[11px]">{teamName}</span>
          <span className="text-[10px] text-muted-foreground font-pixel">— Team Scouting</span>
          <div className="flex items-center gap-1 ml-2">
            <Trophy className="w-3 h-3 text-gold" />
            <span className="font-pixel text-[10px] text-gold">
              #{info.talentRank} <span className="text-muted-foreground">/ {info.totalTeams}</span>
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-white transition-colors p-1"
            data-testid="button-close-scouting-panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Unit Grades */}
        <div className="grid grid-cols-4 gap-2">
          <UnitGradeCell label="Pitching" grade={info.pitchingGrade} />
          <UnitGradeCell label="Hitting" grade={info.hittingGrade} />
          <UnitGradeCell label="Fielding" grade={info.fieldingGrade} />
          <UnitGradeCell label="Speed" grade={info.speedGrade} />
        </div>

        {/* Top Players */}
        <div className="flex gap-2">
          <PlayerChip label="Top Fielder" player={info.topFielder} />
          <PlayerChip label="Top Pitcher" player={info.topPitcher} />
          <PlayerChip label="Top Underclassman" player={info.topUnderclassman} />
        </div>

        {/* Metadata Row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 bg-background/60 rounded border border-border/50">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-2.5 h-2.5 text-gold" />
              <span className="text-[9px] font-pixel text-muted-foreground">NIL Budget</span>
            </div>
            <p className="text-sm font-bold text-gold">{nilFormatted}</p>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50">
            <div className="flex items-center gap-1 mb-1">
              <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[9px] font-pixel text-muted-foreground">Location</span>
            </div>
            <p className="text-xs font-medium truncate">{info.city}, {info.state}</p>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[9px] font-pixel text-muted-foreground">Recruiting Area</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold font-pixel ${gradeColor(info.recruitingAdvantage.grade)}`}>
                {info.recruitingAdvantage.grade}
              </span>
              <span className="text-[10px] text-muted-foreground">{info.recruitingAdvantage.label}</span>
            </div>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50">
            <div className="flex items-center gap-1 mb-1">
              <Trophy className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[9px] font-pixel text-muted-foreground">Conf Projection</span>
            </div>
            <p className="text-xs font-medium">
              <span className="text-gold font-bold">{rankOrdinal(info.projectedConferenceFinish.rank)}</span>
              <span className="text-muted-foreground"> / {info.projectedConferenceFinish.total}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
