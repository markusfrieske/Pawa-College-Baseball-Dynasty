import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { CoachAvatar } from "@/components/coach-avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Trophy, Award, Target, Users, Star, Zap, Shield, Swords,
  GraduationCap, Plus, Mail, TrendingUp, Calendar, Crown, Medal, Flame,
  BookOpen, ChevronRight, Info, ChevronDown, ChevronUp
} from "lucide-react";
import type { Coach, Team, CoachSeasonHistory } from "@shared/schema";
import {
  PERSONALITY_TYPES, TRAIT_BADGES, CAREER_MILESTONES, ARCHETYPE_METADATA,
  type TraitBadge, type CareerMilestone,
} from "@shared/coachTraits";

interface CoachData {
  coach: Coach;
  team: Team;
}

interface CoachDataById {
  coach: Coach;
  team?: Team;
  isOwnCoach: boolean;
}

const XP_PER_LEVEL = 1000;

function getXpForNextLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

function getXpProgress(xp: number, level: number): number {
  const xpForCurrentLevel = (level - 1) * XP_PER_LEVEL;
  const xpForNextLevel = level * XP_PER_LEVEL;
  const currentLevelXp = xp - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  return Math.min(100, (currentLevelXp / xpNeeded) * 100);
}

// ── Coaching competency grades derived from career stats ──────────────────────
function deriveCoachingGrades(coach: Coach): Record<string, string> {
  const scoreToGrade = (score: number): string => {
    if (score >= 95) return "S";
    if (score >= 87) return "A+";
    if (score >= 80) return "A";
    if (score >= 75) return "A-";
    if (score >= 70) return "B+";
    if (score >= 65) return "B";
    if (score >= 60) return "B-";
    if (score >= 55) return "C+";
    if (score >= 50) return "C";
    if (score >= 45) return "C-";
    if (score >= 40) return "D+";
    if (score >= 35) return "D";
    return "F";
  };

  const totalGames = coach.careerWins + coach.careerLosses;
  const winPct = totalGames > 0 ? coach.careerWins / totalGames : 0;
  const skillAvg = (coach.scoutingSkill + coach.evaluationSkill + coach.pitchingRecruitingSkill + coach.hittingRecruitingSkill) / 4;

  // Game Management: win% + CWS appearances + conf championships
  const gm = Math.min(100, winPct * 45 + coach.cwsAppearances * 5 + coach.confChampionships * 3 + 30);

  // Player Development: allAmericans + draftPicks + levels
  const pd = Math.min(100, coach.allAmericans * 3 + coach.draftPicks * 4 + coach.level * 2.5 + 30);

  // Program Building: legacy score component
  const pb = Math.min(100, winPct * 30 + coach.confChampionships * 5 + coach.nationalChampionships * 10 + 30);

  // Media Relations: archetype-based + career wins baseline
  const archBonuses: Record<string, number> = {
    "Dealmaker": 20, "Pure CEO": 15, "Player's Coach": 12, "Showman": 18,
    "Balanced": 8, "Old School": 5, "Tactician": 6, "Scout Master": 5, "Academic Dean": 10,
  };
  const mr = Math.min(100, (archBonuses[coach.archetype] ?? 8) + winPct * 25 + coach.level * 1.5 + 30);

  // Clutch Coaching: postseason performance
  const cc = Math.min(100, coach.nationalChampionships * 15 + coach.cwsAppearances * 7 + coach.confChampionships * 4 + winPct * 20 + 25);

  // Recruiting: skill tree levels
  const rc = Math.min(100, skillAvg * 5 + 35 + coach.draftPicks * 2);

  return {
    "Game Management": scoreToGrade(gm),
    "Player Development": scoreToGrade(pd),
    "Program Builder": scoreToGrade(pb),
    "Media Relations": scoreToGrade(mr),
    "Clutch Coaching": scoreToGrade(cc),
    "Recruiting": scoreToGrade(rc),
  };
}

// ── Grade color helper ────────────────────────────────────────────────────────
function gradeColor(grade: string): string {
  if (grade === "S" || grade === "A+") return "text-yellow-400 font-bold";
  if (grade.startsWith("A")) return "text-emerald-400";
  if (grade.startsWith("B")) return "text-blue-400";
  if (grade.startsWith("C")) return "text-orange-400";
  return "text-red-400";
}

// ── Personality display ───────────────────────────────────────────────────────
function PersonalityBadge({ personalityId }: { personalityId: string | null | undefined }) {
  const personality = PERSONALITY_TYPES.find(p => p.id === personalityId) ?? PERSONALITY_TYPES[0];
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-900/40 border border-amber-600/50">
      <Flame className="w-3 h-3 text-amber-400" />
      <span className="text-xs font-medium text-amber-300">{personality.name}</span>
    </div>
  );
}

// ── Trait badge display ───────────────────────────────────────────────────────
function TraitBadgeChip({ badge }: { badge: TraitBadge }) {
  const colors = {
    gold: "bg-yellow-900/40 border-yellow-600/60 text-yellow-300",
    silver: "bg-slate-700/40 border-slate-400/50 text-slate-200",
    bronze: "bg-orange-900/30 border-orange-700/50 text-orange-300",
  };
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${colors[badge.tier]}`}
      title={badge.description}
      data-testid={`trait-badge-${badge.id}`}
    >
      <Medal className="w-3 h-3" />
      {badge.name}
    </div>
  );
}

// ── Philosophy priorities ─────────────────────────────────────────────────────
function PhilosophyRow({ statement, importance }: { statement: string; importance: string }) {
  const colors: Record<string, string> = {
    extremely: "text-emerald-400 border-emerald-700/60 bg-emerald-900/20",
    very: "text-blue-300 border-blue-700/60 bg-blue-900/20",
    somewhat: "text-muted-foreground border-border/40 bg-muted/10",
  };
  const labels: Record<string, string> = {
    extremely: "Core",
    very: "Important",
    somewhat: "Secondary",
  };
  const cls = colors[importance] ?? colors.somewhat;
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded border ${cls}`}>
      <span className="text-sm">{statement}</span>
      <span className="text-xs font-medium ml-3 whitespace-nowrap">{labels[importance] ?? importance}</span>
    </div>
  );
}

// ── Season result badge ───────────────────────────────────────────────────────
function PhaseResultBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    national_champion: { label: "National Champion", cls: "bg-yellow-500 text-black" },
    cws: { label: "CWS", cls: "bg-blue-600 text-white" },
    super_regionals: { label: "Super Regionals", cls: "bg-purple-700 text-white" },
    conf_championship: { label: "Conf. Champs", cls: "bg-emerald-700 text-white" },
    regular_season: { label: "Regular Season", cls: "bg-muted text-muted-foreground" },
  };
  const { label, cls } = map[result] ?? map.regular_season;
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>;
}

// ── Milestone badge display ───────────────────────────────────────────────────
function MilestoneBadge({ milestone, earned }: { milestone: CareerMilestone; earned: boolean }) {
  const tierColors = {
    gold: earned ? "border-yellow-600 bg-yellow-900/30 text-yellow-300" : "border-border/30 bg-muted/10 text-muted-foreground/40",
    silver: earned ? "border-slate-400 bg-slate-700/30 text-slate-200" : "border-border/30 bg-muted/10 text-muted-foreground/40",
    bronze: earned ? "border-orange-700 bg-orange-900/20 text-orange-300" : "border-border/30 bg-muted/10 text-muted-foreground/40",
  };
  const tierIcon = {
    gold: <Crown className="w-3.5 h-3.5" />,
    silver: <Medal className="w-3.5 h-3.5" />,
    bronze: <Award className="w-3.5 h-3.5" />,
  };
  return (
    <div
      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${tierColors[milestone.tier]}`}
      title={milestone.description}
      data-testid={`milestone-${milestone.id}`}
    >
      <div className={earned ? "" : "opacity-30"}>{tierIcon[milestone.tier]}</div>
      <span className="text-xs font-medium leading-tight">{milestone.name}</span>
    </div>
  );
}

// ── Archetype breakdown card ──────────────────────────────────────────────────
function ArchetypeCard({ archetype }: { archetype: string }) {
  const meta = ARCHETYPE_METADATA[archetype];
  if (!meta) return null;
  return (
    <div className="bg-muted/20 rounded-lg border border-border/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-gold" />
        <span className="text-sm font-semibold text-gold">{meta.tagline}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{meta.description}</p>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-emerald-400 font-medium mb-1">Advantages</p>
          {meta.bonuses.map((b, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-emerald-500 mt-0.5">+</span>{b}
            </p>
          ))}
        </div>
        <div>
          <p className="text-xs text-red-400 font-medium mb-1">Trade-offs</p>
          {meta.penalties.map((p, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-red-500 mt-0.5">-</span>{p}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Coaching stat tile ────────────────────────────────────────────────────────
function StatCard({ label, value, subLabel }: { label: string; value: string; subLabel?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-gold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {subLabel && <p className="text-xs text-muted-foreground/70">{subLabel}</p>}
    </div>
  );
}

// ── Grade attribute grid ──────────────────────────────────────────────────────
function GradeGrid({ grades }: { grades: Record<string, string> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.entries(grades).map(([label, grade]) => (
        <div key={label} className="bg-muted/30 rounded-lg p-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={`text-xl font-bold font-pixel ${gradeColor(grade)}`}>{grade}</span>
        </div>
      ))}
    </div>
  );
}

// ── Season history row ────────────────────────────────────────────────────────
function SeasonRow({ entry }: { entry: CoachSeasonHistory }) {
  const winPct = entry.wins + entry.losses > 0
    ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1)
    : "0.0";
  return (
    <div className="grid grid-cols-[48px_1fr_auto] sm:grid-cols-[48px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/20 transition-colors border-b border-border/30 last:border-0">
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Yr</p>
        <p className="font-bold text-sm text-gold">{entry.season}</p>
      </div>
      <div>
        <p className="text-sm font-medium">{entry.teamName || entry.teamAbbr}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{entry.wins}-{entry.losses} ({winPct}%)</span>
          <PhaseResultBadge result={entry.phaseResult} />
        </div>
      </div>
      <div className="text-right hidden sm:block">
        {entry.totalSigned > 0 && (
          <p className="text-xs text-muted-foreground">
            Class #{entry.classRank ?? "—"} ({entry.totalSigned} signed)
          </p>
        )}
        {entry.topRecruitName && (
          <p className="text-xs text-gold">
            {Array.from({ length: entry.topRecruitStars ?? 3 }, () => "★").join("")} {entry.topRecruitName}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Skill tree branch ─────────────────────────────────────────────────────────
function SkillTreeBranch({
  name, skillKey, level, color, icon, effects, canUpgrade, onUpgrade
}: {
  name: string; skillKey: string; level: number; color: string;
  icon: React.ReactNode; effects: string[]; canUpgrade?: boolean; onUpgrade?: (skill: string) => void;
}) {
  const isMaxed = level >= 10;
  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white`}>
          {icon}
        </div>
        <div>
          <h4 className="font-medium">{name}</h4>
          <p className="text-sm text-muted-foreground">Level {level}/10</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-2xl font-bold ${level >= 5 ? "text-gold" : "text-foreground"}`}>{level}</span>
          {canUpgrade && !isMaxed && onUpgrade && (
            <RetroButton size="sm" variant="outline" onClick={() => onUpgrade(skillKey)} data-testid={`button-upgrade-${skillKey}`}>
              <Plus className="w-3 h-3" />
            </RetroButton>
          )}
        </div>
      </div>
      <Progress value={(level / 10) * 100} className="h-2 mb-3" />
      <ul className="space-y-1">
        {effects.map((effect, idx) => (
          <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
            <span className={idx < Math.ceil(level / 2.5) ? "text-gold" : ""}>•</span>
            <span className={idx < Math.ceil(level / 2.5) ? "text-foreground" : ""}>{effect}</span>
          </li>
        ))}
      </ul>
      {isMaxed && <p className="text-xs text-gold mt-2 text-center">MAX LEVEL</p>}
    </div>
  );
}

// ── Coach profile skeleton ────────────────────────────────────────────────────
function CoachProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="p-6 rounded-md border border-border/50 bg-card/30 mb-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-24 w-24 rounded" />
            <div className="flex-1">
              <Skeleton className="h-6 w-48 mb-2" />
              <div className="flex gap-2 mb-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {["career", "attributes", "skills"].map(t => <Skeleton key={t} className="h-9 w-24" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </main>
    </div>
  );
}

// ── Header card (shared between own/rival) ────────────────────────────────────
function CoachHeader({
  coach, team, isOwnCoach, leagueId
}: {
  coach: Coach; team?: Team; isOwnCoach: boolean; leagueId?: string;
}) {
  const [showArchetype, setShowArchetype] = useState(false);
  const personality = PERSONALITY_TYPES.find(p => p.id === (coach.personality ?? "")) ?? PERSONALITY_TYPES[0];
  const earnedTraitIds = new Set(Array.isArray(coach.traitBadges) ? coach.traitBadges as string[] : []);
  const earnedTraits = TRAIT_BADGES.filter(b => earnedTraitIds.has(b.id));
  const philosophy = Array.isArray(coach.coachingPhilosophy) ? coach.coachingPhilosophy as { statement: string; importance: string }[] : [];
  const xpProgress = getXpProgress(coach.xp, coach.level);
  const xpForNext = getXpForNextLevel(coach.level);

  return (
    <RetroCard variant="bordered" className="mb-6">
      <RetroCardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar + XP */}
          <div className="flex items-start gap-4">
            <div className="relative">
              <CoachAvatar
                skinTone={coach.skinTone}
                hairColor={coach.hairColor}
                hairStyle={coach.hairStyle}
                facialHair={coach.facialHair}
                className="w-24 h-24"
                teamPrimaryColor={team?.primaryColor}
              />
              <div className="absolute -bottom-1 -right-1 bg-gold text-black text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {coach.level}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                {team && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                  >
                    {team.abbreviation}
                  </div>
                )}
                <div>
                  <h1 className="font-pixel text-gold text-lg">HC {coach.firstName} {coach.lastName}</h1>
                  <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-0.5">
                    {/* Clickable archetype badge — expands breakdown panel */}
                    <button
                      onClick={() => setShowArchetype(v => !v)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border/60 text-xs text-muted-foreground hover:border-gold/60 hover:text-gold transition-colors"
                      data-testid="button-toggle-archetype"
                      title="Click to view archetype breakdown"
                    >
                      {coach.archetype}
                      {showArchetype ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {!isOwnCoach && <Badge variant="secondary" className="text-xs">Rival Coach</Badge>}
                  </div>
                </div>
              </div>
              {team && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Users className="w-3 h-3" />
                  <span>{team.name}</span>
                </div>
              )}
              {/* XP Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Level {coach.level} XP</span>
                  <span>{coach.xp % xpForNext}/{xpForNext}</span>
                </div>
                <Progress value={xpProgress} className="h-1.5" />
              </div>
              {/* Personality + traits */}
              <div className="flex flex-wrap gap-2 items-center">
                <PersonalityBadge personalityId={coach.personality} />
                {earnedTraits.slice(0, 3).map(t => <TraitBadgeChip key={t.id} badge={t} />)}
              </div>
            </div>
          </div>

          {/* Philosophy column */}
          {philosophy.length > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> Coaching Philosophy
              </p>
              <div className="space-y-1.5">
                {philosophy.map((p, i) => (
                  <PhilosophyRow key={i} statement={p.statement} importance={p.importance} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Expandable archetype breakdown */}
        {showArchetype && (
          <div className="mt-4 pt-4 border-t border-border/40" data-testid="archetype-breakdown-panel">
            <ArchetypeCard archetype={coach.archetype} />
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ── Recruiting record type from API ──────────────────────────────────────────
interface RecruitingRecord {
  totalSigned: number;
  fiveStars: number; fourStars: number; threeStars: number; twoStars: number; oneStars: number;
  avgClassRank: number | null;
  bestClassRank: number | null;
  topClassSeason: number | null;
  topRecruitName: string | null;
  topRecruitOvr: number | null;
  topRecruitStars: number | null;
  draftPicksDeveloped: number;
  allAmericansDeveloped: number;
  seasonsRecorded: number;
}

// ── Career tab ────────────────────────────────────────────────────────────────
function CareerTab({
  coach, leagueId, coachId, isOwnCoach
}: {
  coach: Coach; leagueId?: string; coachId?: string; isOwnCoach: boolean;
}) {
  const historyKey = leagueId
    ? ["/api/leagues", leagueId, "coach/season-history"]
    : ["/api/coaches", coachId ?? "", "season-history"];

  const recruitingRecordKey = leagueId
    ? ["/api/leagues", leagueId, "coach/recruiting-record"]
    : ["/api/coaches", coachId ?? "", "recruiting-record"];

  const { data: seasonHistory, isLoading: histLoading } = useQuery<CoachSeasonHistory[]>({
    queryKey: historyKey,
    enabled: !!(leagueId ?? coachId),
  });

  const { data: recruitingRecord, isLoading: recLoading } = useQuery<RecruitingRecord>({
    queryKey: recruitingRecordKey,
    enabled: !!(leagueId ?? coachId),
  });

  const totalGames = coach.careerWins + coach.careerLosses;
  const winPct = totalGames > 0 ? ((coach.careerWins / totalGames) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      {/* Career stat tiles */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Career Stats</h3>
          </div>
          <p className="text-xs text-muted-foreground">Career head coaching records and awards</p>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="W-L Record" value={`${coach.careerWins}-${coach.careerLosses}`} subLabel={`${winPct}%`} />
            <StatCard label="Conf. Titles" value={String(coach.confChampionships)} />
            <StatCard label="CWS" value={String(coach.cwsAppearances)} />
            <StatCard label="Championships" value={String(coach.nationalChampionships)} />
            <StatCard label="All-Americans" value={String(coach.allAmericans)} />
            <StatCard label="Draft Picks" value={String(coach.draftPicks)} />
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Legacy Score</span>
            <span className="text-gold font-bold text-lg">{coach.legacyScore}</span>
          </div>
        </RetroCardContent>
      </RetroCard>

      {/* Season history */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Season History</h3>
          </div>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          {histLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : !seasonHistory || seasonHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No completed seasons yet</p>
          ) : (
            <div>
              {seasonHistory.map(entry => <SeasonRow key={`${entry.season}-${entry.leagueId}`} entry={entry} />)}
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      {/* Recruiting track record — from dedicated API endpoint */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Recruiting Track Record</h3>
          </div>
          <p className="text-xs text-muted-foreground">Career class rankings, star breakdown, and draft development</p>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          {recLoading ? (
            <Skeleton className="h-32 rounded" />
          ) : !recruitingRecord || recruitingRecord.seasonsRecorded === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No recruiting history yet</p>
          ) : (
            <div className="space-y-4">
              {/* Top-level summary tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gold">{recruitingRecord.totalSigned}</p>
                  <p className="text-xs text-muted-foreground">Total Signed</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gold">
                    {recruitingRecord.bestClassRank != null ? `#${recruitingRecord.bestClassRank}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Best Class Rank</p>
                  {recruitingRecord.topClassSeason && (
                    <p className="text-xs text-muted-foreground/60">Yr {recruitingRecord.topClassSeason}</p>
                  )}
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gold">
                    {recruitingRecord.avgClassRank != null ? `#${recruitingRecord.avgClassRank}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg. Class Rank</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gold">{recruitingRecord.draftPicksDeveloped}</p>
                  <p className="text-xs text-muted-foreground">Draft Picks Dev.</p>
                </div>
              </div>

              {/* Star-tier breakdown */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Career Signed by Star Rating</p>
                <div className="grid grid-cols-5 gap-2">
                  {([5, 4, 3, 2, 1] as const).map(stars => {
                    const key = (["fiveStars", "fourStars", "threeStars", "twoStars", "oneStars"] as const)[5 - stars];
                    const count = recruitingRecord[key];
                    const starColors = ["text-yellow-400", "text-orange-400", "text-blue-400", "text-muted-foreground", "text-muted-foreground/60"];
                    return (
                      <div key={stars} className="bg-muted/20 rounded-lg p-2 text-center border border-border/30">
                        <p className={`text-lg font-bold ${starColors[5 - stars]}`}>{count}</p>
                        <p className="text-xs text-muted-foreground">{Array.from({ length: stars }, () => "★").join("")}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Best recruit */}
              {recruitingRecord.topRecruitName && (
                <div className="bg-muted/20 rounded-lg p-3 border border-border/40">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Best Signed Recruit (Career)</p>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-medium">
                      {Array.from({ length: recruitingRecord.topRecruitStars ?? 3 }, () => "★").join("")} {recruitingRecord.topRecruitName}
                    </p>
                    <p className="text-sm font-bold text-gold">{recruitingRecord.topRecruitOvr} OVR</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

// ── Attributes tab ────────────────────────────────────────────────────────────
function AttributesTab({ coach, isOwnCoach }: { coach: Coach; isOwnCoach: boolean }) {
  const grades = deriveCoachingGrades(coach);

  return (
    <div className="space-y-6">
      {/* Coaching competency grades */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Coaching Grades</h3>
          </div>
          <p className="text-xs text-muted-foreground">Derived from career performance and archetype</p>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          <GradeGrid grades={grades} />
        </RetroCardContent>
      </RetroCard>

      {/* Archetype breakdown */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Archetype: {coach.archetype}</h3>
          </div>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          <ArchetypeCard archetype={coach.archetype} />
        </RetroCardContent>
      </RetroCard>

      {/* Personality description */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Personality</h3>
          </div>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          {(() => {
            const p = PERSONALITY_TYPES.find(pt => pt.id === (coach.personality ?? "")) ?? PERSONALITY_TYPES[0];
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <PersonalityBadge personalityId={coach.personality} />
                </div>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </div>
            );
          })()}
        </RetroCardContent>
      </RetroCard>

      {/* Trait badges full list */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Medal className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Trait Badges</h3>
          </div>
          <p className="text-xs text-muted-foreground">Permanent coaching identity traits</p>
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          {(() => {
            const earnedIds = new Set(Array.isArray(coach.traitBadges) ? coach.traitBadges as string[] : []);
            const earned = TRAIT_BADGES.filter(b => earnedIds.has(b.id));
            if (earned.length === 0) {
              return <p className="text-muted-foreground text-sm text-center py-2">No trait badges yet</p>;
            }
            return (
              <div className="space-y-3">
                {(["gold", "silver", "bronze"] as const).map(tier => {
                  const tierBadges = earned.filter(b => b.tier === tier);
                  if (tierBadges.length === 0) return null;
                  const tierLabel = { gold: "Gold", silver: "Silver", bronze: "Bronze" }[tier];
                  return (
                    <div key={tier}>
                      <p className="text-xs font-medium text-muted-foreground mb-2">{tierLabel} Traits</p>
                      <div className="flex flex-wrap gap-2">
                        {tierBadges.map(b => <TraitBadgeChip key={b.id} badge={b} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

// ── Skills tab ────────────────────────────────────────────────────────────────
function SkillsTab({
  coach, isOwnCoach, onUpgrade
}: {
  coach: Coach; isOwnCoach: boolean; onUpgrade?: (skill: string) => void;
}) {
  const earnedMilestoneIds = new Set(Array.isArray(coach.careerMilestones) ? coach.careerMilestones as string[] : []);

  const milestonesByTier = {
    gold: CAREER_MILESTONES.filter(m => m.tier === "gold"),
    silver: CAREER_MILESTONES.filter(m => m.tier === "silver"),
    bronze: CAREER_MILESTONES.filter(m => m.tier === "bronze"),
  };

  const totalEarned = earnedMilestoneIds.size;
  const totalMilestones = CAREER_MILESTONES.length;

  return (
    <div className="space-y-6">
      {/* Milestone overview */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gold" />
              <h3 className="font-pixel text-sm">Career Milestones</h3>
            </div>
            <span className="text-xs text-muted-foreground">{totalEarned}/{totalMilestones} earned</span>
          </div>
          <Progress value={(totalEarned / totalMilestones) * 100} className="h-2 mt-2" />
        </RetroCardHeader>
        <RetroCardContent className="p-4 space-y-5">
          {(["gold", "silver", "bronze"] as const).map(tier => {
            const tierLabel = { gold: "Gold Milestones", silver: "Silver Milestones", bronze: "Bronze Milestones" }[tier];
            const tierColor = { gold: "text-yellow-400", silver: "text-slate-300", bronze: "text-orange-400" }[tier];
            return (
              <div key={tier}>
                <p className={`text-xs font-semibold mb-2 ${tierColor}`}>{tierLabel}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {milestonesByTier[tier].map(m => (
                    <MilestoneBadge key={m.id} milestone={m} earned={earnedMilestoneIds.has(m.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </RetroCardContent>
      </RetroCard>

      {/* Skill tree */}
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-sm">Recruiting Skill Trees</h3>
          </div>
          {isOwnCoach && (
            <Badge variant={coach.skillPoints > 0 ? "default" : "outline"} className="ml-4">
              {coach.skillPoints} Skill Points
            </Badge>
          )}
        </RetroCardHeader>
        <RetroCardContent className="p-4">
          <div className="grid md:grid-cols-2 gap-6">
            <SkillTreeBranch
              name="Scouting" skillKey="scouting" level={coach.scoutingSkill}
              color="bg-emerald-600" icon={<Target className="w-4 h-4" />}
              effects={[
                "Level 1-4: +3% scouting speed per level",
                "Level 5: Unlock 'Scout Master' badge",
                "Level 6-9: +5% scouting speed per level",
                "Level 10: Unlock 'Elite Scout' badge",
              ]}
              canUpgrade={isOwnCoach && coach.skillPoints > 0} onUpgrade={onUpgrade}
            />
            <SkillTreeBranch
              name="Evaluation" skillKey="evaluation" level={coach.evaluationSkill}
              color="bg-blue-500" icon={<Shield className="w-4 h-4" />}
              effects={[
                "Level 1-4: Earlier gem/bust reveal per level",
                "Level 5: Unlock 'Talent Evaluator' badge",
                "Level 6-9: Narrower rating ranges shown",
                "Level 10: Unlock 'Diamond Eye' badge",
              ]}
              canUpgrade={isOwnCoach && coach.skillPoints > 0} onUpgrade={onUpgrade}
            />
            <SkillTreeBranch
              name="Pitching" skillKey="pitching" level={coach.pitchingRecruitingSkill}
              color="bg-amber-500" icon={<Zap className="w-4 h-4" />}
              effects={[
                "Level 1-4: +2% pitcher interest per level",
                "Level 5: Unlock 'Arm Whisperer' badge",
                "Level 6-9: +3% pitcher signing bonus",
                "Level 10: Unlock 'Pitching Factory' badge",
              ]}
              canUpgrade={isOwnCoach && coach.skillPoints > 0} onUpgrade={onUpgrade}
            />
            <SkillTreeBranch
              name="Hitting" skillKey="hitting" level={coach.hittingRecruitingSkill}
              color="bg-red-500" icon={<Swords className="w-4 h-4" />}
              effects={[
                "Level 1-4: +2% hitter interest per level",
                "Level 5: Unlock 'Bat Magnet' badge",
                "Level 6-9: +3% hitter signing bonus",
                "Level 10: Unlock 'Hitting Factory' badge",
              ]}
              canUpgrade={isOwnCoach && coach.skillPoints > 0} onUpgrade={onUpgrade}
            />
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

// ── Tab nav ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: "career", label: "Career", icon: <Trophy className="w-4 h-4" /> },
  { id: "attributes", label: "Attributes", icon: <Target className="w-4 h-4" /> },
  { id: "skills", label: "Skills", icon: <GraduationCap className="w-4 h-4" /> },
] as const;

type TabId = typeof TABS[number]["id"];

// ─────────────────────────────────────────────────────────────────────────────
// OWN coach profile page  /league/:id/coach
// ─────────────────────────────────────────────────────────────────────────────
export default function CoachProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("career");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<CoachData>({
    queryKey: ["/api/leagues", id, "coach"],
  });

  const { data: currentUser } = useQuery<{ id: string; email: string; emailOptOut: boolean }>({
    queryKey: ["/api/auth/me"],
  });

  const emailPrefMutation = useMutation({
    mutationFn: async (emailOptOut: boolean) => {
      const res = await apiRequest("PATCH", "/api/users/email-preferences", { emailOptOut });
      return res.json();
    },
    onSuccess: (_data, emailOptOut) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: emailOptOut ? "Unsubscribed" : "Subscribed",
        description: emailOptOut ? "You'll no longer receive weekly digest emails." : "You'll receive weekly digest emails after each phase advance.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const upgradeSkillMutation = useMutation({
    mutationFn: async (skill: string) => apiRequest("POST", `/api/leagues/${id}/coach/upgrade-skill`, { skill }),
    onSuccess: () => {
      toast({ title: "Skill Upgraded", description: "Your coaching skill has been improved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "coach"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) return <CoachProfileSkeleton />;

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard className="text-center p-8">
          <p className="text-muted-foreground mb-4">Coach not found</p>
          <Link href="/dashboard"><RetroButton variant="outline">Back to Dashboard</RetroButton></Link>
        </RetroCard>
      </div>
    );
  }

  const { coach, team } = data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={`/league/${id}`}>
            <RetroButton variant="ghost" size="sm" data-testid="button-back-league">
              <ArrowLeft className="w-4 h-4 mr-2" />Back to League
            </RetroButton>
          </Link>
          {currentUser && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-3 h-3" />
              <span className="hidden sm:inline">Weekly Digest</span>
              <Switch
                checked={!currentUser.emailOptOut}
                onCheckedChange={(checked) => emailPrefMutation.mutate(!checked)}
                disabled={emailPrefMutation.isPending}
                data-testid="switch-email-digest"
              />
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <CoachHeader coach={coach} team={team} isOwnCoach leagueId={id} />

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(tab => (
            <RetroButton
              key={tab.id}
              variant={activeTab === tab.id ? "primary" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`button-tab-${tab.id}`}
            >
              {tab.icon}
              <span className="ml-2">{tab.label}</span>
            </RetroButton>
          ))}
        </div>

        {activeTab === "career" && (
          <CareerTab coach={coach} leagueId={id} isOwnCoach />
        )}
        {activeTab === "attributes" && (
          <AttributesTab coach={coach} isOwnCoach />
        )}
        {activeTab === "skills" && (
          <SkillsTab coach={coach} isOwnCoach onUpgrade={(skill) => upgradeSkillMutation.mutate(skill)} />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rival coach profile page  /league/:id/coach/:coachId  &  /coach/:coachId
// ─────────────────────────────────────────────────────────────────────────────
export function CoachProfileByIdPage() {
  const { coachId } = useParams<{ coachId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("career");

  const { data, isLoading } = useQuery<CoachDataById>({
    queryKey: ["/api/coaches", coachId],
  });

  if (isLoading) return <CoachProfileSkeleton />;

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard className="text-center p-8">
          <p className="text-muted-foreground mb-4">Coach not found</p>
          <Link href="/dashboard"><RetroButton variant="outline">Back to Dashboard</RetroButton></Link>
        </RetroCard>
      </div>
    );
  }

  const { coach, team, isOwnCoach } = data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <RetroButton variant="ghost" size="sm" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </RetroButton>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <CoachHeader coach={coach} team={team} isOwnCoach={isOwnCoach} />

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(tab => (
            <RetroButton
              key={tab.id}
              variant={activeTab === tab.id ? "primary" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`button-tab-${tab.id}`}
            >
              {tab.icon}
              <span className="ml-2">{tab.label}</span>
            </RetroButton>
          ))}
        </div>

        {activeTab === "career" && (
          <CareerTab coach={coach} coachId={coachId} isOwnCoach={isOwnCoach} />
        )}
        {activeTab === "attributes" && (
          <AttributesTab coach={coach} isOwnCoach={isOwnCoach} />
        )}
        {activeTab === "skills" && (
          <SkillsTab coach={coach} isOwnCoach={isOwnCoach} />
        )}
      </main>
    </div>
  );
}
