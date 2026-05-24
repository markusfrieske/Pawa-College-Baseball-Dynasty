import { X, MapPin, DollarSign, Trophy, TrendingUp, MousePointerClick } from "lucide-react";

export interface TeamScoutingInfo {
  talentRank: number;
  totalTeams: number;
  nationalRank: number;
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

function BaseballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 2.8 C6.2 4.8 6.2 11.2 5.5 13.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M10.5 2.8 C9.8 4.8 9.8 11.2 10.5 13.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function GloveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.5 13 L4 13 C3 13 2.5 12 2.5 11 L2.5 9.5 C2.5 8.5 3 8 4 7.5 C4 6.5 4.5 5 5.5 4.5 L8.5 4.5 C10 4.5 11.5 5.5 12.5 7 L13.5 9 C14 10.5 13 12.5 11.5 13 Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      <path
        d="M2.5 10 C2 9.5 1.5 8.5 2 7.5 C2.5 6.5 3.5 6.5 4 7.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
      <path
        d="M3.5 8.5 C5 7.5 7 7.5 8.5 8"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round"
      />
      <line x1="7.5" y1="4.5" x2="7.5" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="9.5" y1="4.5" x2="9.5" y2="6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function BatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="2.5" y1="13.5" x2="8" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="8" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CleatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.5 11.5 C2.5 9.5 5 8.5 7 8.5 L10.5 8.5 C11.5 8.5 12.5 9.5 12.5 10.5 L12.5 12 L1.5 12 Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      <path
        d="M10.5 8.5 C10.5 7 11 5.5 12 5.5 C13 5.5 13.5 7 12.5 8.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
      <line x1="3.5" y1="12" x2="3.5" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6.5" y1="12" x2="6.5" y2="14.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="9.5" y1="12" x2="9.5" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
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

function GradeCell({
  icon: Icon,
  iconColor,
  grade,
  label,
}: {
  icon: React.ElementType;
  iconColor: string;
  grade: { letter: string; score: number };
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 bg-background/60 rounded border border-border/50 min-w-[52px]">
      <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      <span className={`text-base font-bold font-pixel leading-none ${gradeColor(grade.letter)}`}>
        {grade.letter}
      </span>
      <p className="text-[8px] text-muted-foreground font-pixel">{label}</p>
      <GradeBar score={grade.score} />
    </div>
  );
}

function PlayerChip({ label, icon: Icon, player }: { label: string; icon: React.ElementType; player: TeamScoutingInfo["topFielder"] }) {
  if (!player) return (
    <div className="flex-1 p-2 bg-background/60 rounded border border-border/50 opacity-40 min-w-0">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <p className="text-[9px] font-pixel text-muted-foreground">{label}</p>
      </div>
      <p className="text-xs text-muted-foreground">—</p>
    </div>
  );
  return (
    <div className="flex-1 p-2 bg-background/60 rounded border border-border/50 min-w-0" data-testid={`scouting-player-${label.toLowerCase().replace(/\s+/g, "-")}`}>
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
  teamName?: string | null;
  info?: TeamScoutingInfo | null;
  onClose?: () => void;
}

export function TeamScoutingPanel({ teamName, info, onClose }: TeamScoutingPanelProps) {
  const rankOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  if (!teamName || !info) {
    return (
      <div className="bg-card border border-border/60 rounded-lg flex items-center justify-center py-5 gap-3 text-muted-foreground/50">
        <MousePointerClick className="w-4 h-4" />
        <span className="font-pixel text-[10px]">Click any team to scout it</span>
      </div>
    );
  }

  const nilFormatted = info.nilBudget >= 1_000_000
    ? `$${(info.nilBudget / 1_000_000).toFixed(1)}M`
    : `$${(info.nilBudget / 1_000).toFixed(0)}K`;

  return (
    <div
      className="bg-card border border-gold/40 rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
      data-testid={`scouting-panel-${teamName.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 gap-2">
        <span className="font-pixel text-gold text-[11px] truncate flex-1 min-w-0">{teamName}</span>
        <div className="shrink-0 flex items-center gap-1.5">
          <div className="flex items-center gap-1 border border-gold/40 rounded px-1.5 py-0.5 bg-gold/10">
            <Trophy className="w-2.5 h-2.5 text-gold" />
            <span className="font-pixel text-[9px] text-gold">#{info.nationalRank}</span>
          </div>
          <span className="text-[9px] text-muted-foreground font-pixel">{info.conference}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-white transition-colors p-1 ml-1"
              data-testid="button-close-scouting-panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content: two rows on mobile, single horizontal row on md+ */}
      <div className="px-3 py-2 flex flex-col md:flex-row gap-2">
        {/* Grades */}
        <div className="flex gap-1.5 shrink-0">
          <GradeCell icon={BaseballIcon} iconColor="text-orange-400" grade={info.pitchingGrade} label="PITCH" />
          <GradeCell icon={BatIcon}      iconColor="text-blue-400"   grade={info.hittingGrade}  label="HIT" />
          <GradeCell icon={GloveIcon}    iconColor="text-green-400"  grade={info.fieldingGrade} label="FIELD" />
          <GradeCell icon={CleatIcon}    iconColor="text-yellow-400" grade={info.speedGrade}     label="SPEED" />
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px bg-border/40 self-stretch" />

        {/* Top players */}
        <div className="flex gap-1.5 flex-1 min-w-0">
          <PlayerChip label="Fielder"    icon={GloveIcon}    player={info.topFielder} />
          <PlayerChip label="Pitcher"    icon={BaseballIcon} player={info.topPitcher} />
          <PlayerChip label="Underclass" icon={CleatIcon}    player={info.topUnderclassman} />
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px bg-border/40 self-stretch" />

        {/* Metadata */}
        <div className="flex gap-1.5 shrink-0">
          <div className="flex flex-col items-center gap-0.5 p-2 bg-background/60 rounded border border-border/50 min-w-[52px]">
            <DollarSign className="w-3.5 h-3.5 text-gold" />
            <p className="text-sm font-bold text-gold leading-none">{nilFormatted}</p>
            <p className="text-[8px] text-muted-foreground font-pixel">NIL</p>
          </div>
          <div className="flex flex-col items-center gap-0.5 p-2 bg-background/60 rounded border border-border/50 min-w-[52px]">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[10px] font-medium leading-tight truncate w-full text-center">{info.city}</p>
            <p className="text-[8px] text-muted-foreground">{info.state}</p>
          </div>
          <div className="flex flex-col items-center gap-0.5 p-2 bg-background/60 rounded border border-border/50 min-w-[52px]">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={`text-sm font-bold font-pixel leading-none ${gradeColor(info.recruitingAdvantage.grade)}`}>
              {info.recruitingAdvantage.grade}
            </span>
            <p className="text-[8px] text-muted-foreground font-pixel">Recruit</p>
          </div>
          <div className="flex flex-col items-center gap-0.5 p-2 bg-background/60 rounded border border-border/50 min-w-[52px]">
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
