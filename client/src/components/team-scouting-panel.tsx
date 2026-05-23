import { X, MapPin, DollarSign, Trophy, Flame, Target, Shield, Zap, TrendingUp } from "lucide-react";

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

function UnitGradeCell({
  icon: Icon,
  iconColor,
  grade,
}: {
  icon: React.ElementType;
  iconColor: string;
  grade: { letter: string; score: number };
}) {
  return (
    <div className="p-2 bg-background/60 rounded border border-border/50 flex flex-col items-center gap-0.5">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className={`text-lg font-bold font-pixel leading-none ${gradeColor(grade.letter)}`}>
        {grade.letter}
      </span>
      <GradeBar score={grade.score} />
    </div>
  );
}

function PlayerChip({ label, icon: Icon, player }: { label: string; icon: React.ElementType; player: TeamScoutingInfo["topFielder"] }) {
  if (!player) return (
    <div className="flex-1 p-2 bg-background/60 rounded border border-border/50 opacity-40">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <p className="text-[9px] font-pixel text-muted-foreground">{label}</p>
      </div>
      <p className="text-xs text-muted-foreground">—</p>
    </div>
  );
  return (
    <div className="flex-1 p-2 bg-background/60 rounded border border-border/50" data-testid={`scouting-player-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <p className="text-[9px] font-pixel text-muted-foreground">{label}</p>
      </div>
      <p className="text-xs font-medium truncate leading-tight">{player.name}</p>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[9px] text-muted-foreground">{player.position} · {player.eligibility}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-pixel text-gold text-[11px] truncate">{teamName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Trophy className="w-3 h-3 text-gold" />
            <span className="font-pixel text-[10px] text-gold">
              #{info.talentRank}<span className="text-muted-foreground">/{info.totalTeams}</span>
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-white transition-colors p-1 ml-2 shrink-0"
            data-testid="button-close-scouting-panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Unit Grades — icon + letter grade, no text labels */}
        <div className="grid grid-cols-4 gap-1.5">
          <UnitGradeCell icon={Flame}  iconColor="text-orange-400" grade={info.pitchingGrade} />
          <UnitGradeCell icon={Target} iconColor="text-blue-400"   grade={info.hittingGrade} />
          <UnitGradeCell icon={Shield} iconColor="text-green-400"  grade={info.fieldingGrade} />
          <UnitGradeCell icon={Zap}    iconColor="text-yellow-400" grade={info.speedGrade} />
        </div>

        {/* Top Players */}
        <div className="flex gap-1.5">
          <PlayerChip label="Fielder"      icon={Shield} player={info.topFielder} />
          <PlayerChip label="Pitcher"      icon={Flame}  player={info.topPitcher} />
          <PlayerChip label="Underclass"   icon={Zap}    player={info.topUnderclassman} />
        </div>

        {/* Metadata Row — icon-forward, minimal text */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="p-2 bg-background/60 rounded border border-border/50 flex flex-col items-center gap-0.5">
            <DollarSign className="w-3.5 h-3.5 text-gold" />
            <p className="text-sm font-bold text-gold leading-none">{nilFormatted}</p>
            <p className="text-[8px] text-muted-foreground font-pixel">NIL</p>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50 flex flex-col items-center gap-0.5">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[10px] font-medium text-center leading-tight truncate w-full text-center">{info.city}</p>
            <p className="text-[8px] text-muted-foreground">{info.state}</p>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50 flex flex-col items-center gap-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={`text-sm font-bold font-pixel leading-none ${gradeColor(info.recruitingAdvantage.grade)}`}>
              {info.recruitingAdvantage.grade}
            </span>
            <p className="text-[8px] text-muted-foreground font-pixel">Recruit</p>
          </div>
          <div className="p-2 bg-background/60 rounded border border-border/50 flex flex-col items-center gap-0.5">
            <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-sm font-bold text-gold leading-none">
              {rankOrdinal(info.projectedConferenceFinish.rank)}
            </p>
            <p className="text-[8px] text-muted-foreground">/{info.projectedConferenceFinish.total}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
