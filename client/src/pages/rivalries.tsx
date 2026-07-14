/**
 * Coaching Rivalries Page
 * Mobile-first. Shows head-to-head records between human coaches in the league.
 * Route: /league/:id/rivalries
 */
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Swords, Flame, TrendingUp, TrendingDown, ArrowLeft,
  Trophy, Users, Calendar, Star, BarChart2, Target,
} from "lucide-react";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RivalCoach {
  id: string;
  firstName: string;
  lastName: string;
  level: number;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  teamPrimaryColor: string | null;
  teamSecondaryColor: string | null;
}

interface RivalryRecord {
  gamesPlayed: number;
  coachAWins: number;
  coachBWins: number;
  coachARunsScored: number;
  coachBRunsScored: number;
  avgRunDiff: number;
  postseasonGames: number;
  coachAPostseasonWins: number;
  coachBPostseasonWins: number;
  currentStreakWinnerId: string | null;
  currentStreakLength: number;
  lastMeetingSeason: number | null;
  lastMeetingWeek: number | null;
  lastMeetingCoachAScore: number | null;
  lastMeetingCoachBScore: number | null;
  lastMeetingWinnerId: string | null;
  biggestWinMargin: number;
  biggestWinCoachId: string | null;
}

interface RecruitingConflicts {
  conflicts: number;
  coachASignings: number;
  coachBSignings: number;
}

interface Rivalry {
  id: string;
  coachA: RivalCoach | null;
  coachB: RivalCoach | null;
  record: RivalryRecord;
  recruiting: RecruitingConflicts;
  heatScore: number;
  heatLabel: string;
  heatColor: string;
  isMyRivalry: boolean;
  myWins: number;
  theirWins: number;
  myRuns: number;
  theirRuns: number;
  myPostseasonWins: number;
  myRecruitSignings: number;
  theirRecruitSignings: number;
  streakIsMe: boolean;
  streakIsThem: boolean;
  streakLength: number;
  updatedAt: string;
}

interface RivalriesResponse {
  rivalries: Rivalry[];
  myRivalries: Rivalry[];
  userCoachId: string | null;
}

// ─── Components ──────────────────────────────────────────────────────────────

function HeatMeter({ score, label, colorClass }: { score: number; label: string; colorClass: string }) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor =
    score >= 75 ? "bg-red-500" :
    score >= 50 ? "bg-orange-500" :
    score >= 25 ? "bg-yellow-500" : "bg-muted-foreground/40";

  return (
    <div className="flex items-center gap-2" data-testid="heat-meter">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium shrink-0 ${colorClass}`}>{label}</span>
    </div>
  );
}

function CoachChip({ coach }: { coach: RivalCoach }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {coach.teamPrimaryColor && (
        <div
          className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: coach.teamPrimaryColor }}
        >
          {coach.teamAbbreviation?.slice(0, 2) ?? "?"}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">
          {coach.firstName} {coach.lastName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {coach.teamName ?? "No Team"}
        </div>
      </div>
    </div>
  );
}

function RecordBadge({ wins, losses, className = "" }: { wins: number; losses: number; className?: string }) {
  const isLeading = wins > losses;
  const isTied = wins === losses;
  return (
    <span className={`font-bold text-sm tabular-nums ${isLeading ? "text-emerald-400" : isTied ? "text-gold" : "text-red-400"} ${className}`}>
      {wins}–{losses}
    </span>
  );
}

function StreakBadge({ streak, isMe }: { streak: number; isMe: boolean }) {
  if (streak < 2) return null;
  return (
    <Badge
      className={`text-xs ${isMe ? "bg-emerald-900/60 text-emerald-300 border-emerald-600/40" : "bg-red-900/60 text-red-300 border-red-600/40"}`}
      data-testid="streak-badge"
    >
      {isMe ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
      W{streak} Streak
    </Badge>
  );
}

function RivalryCard({
  rivalry,
  expanded,
  onToggle,
  isMyView,
}: {
  rivalry: Rivalry;
  expanded: boolean;
  onToggle: () => void;
  isMyView: boolean;
}) {
  const { record, recruiting, coachA, coachB } = rivalry;

  const myCoach    = isMyView && rivalry.isMyRivalry ? (rivalry.myWins === (coachA?.id ? record.coachAWins : record.coachBWins) ? coachA : coachB) : null;
  const theirCoach = isMyView && rivalry.isMyRivalry ? (myCoach?.id === coachA?.id ? coachB : coachA) : null;

  const displayCoachA = isMyView ? myCoach ?? coachA : coachA;
  const displayCoachB = isMyView ? theirCoach ?? coachB : coachB;
  const displayWinsA  = isMyView && rivalry.isMyRivalry ? rivalry.myWins : record.coachAWins;
  const displayWinsB  = isMyView && rivalry.isMyRivalry ? rivalry.theirWins : record.coachBWins;

  const lastMeetingScore = record.lastMeetingSeason
    ? `S${record.lastMeetingSeason} W${record.lastMeetingWeek}: ${record.lastMeetingCoachAScore ?? "?"}–${record.lastMeetingCoachBScore ?? "?"}`
    : null;

  return (
    <div
      className={`border rounded-lg overflow-hidden ${rivalry.heatScore >= 50 ? "border-orange-600/30" : "border-border"}`}
      data-testid={`rivalry-card-${rivalry.id}`}
    >
      {/* Main row — always visible, tap to expand */}
      <button
        className="w-full text-left p-3 bg-card hover:bg-muted/10 active:bg-muted/20 transition-colors"
        onClick={onToggle}
        data-testid={`btn-toggle-rivalry-${rivalry.id}`}
        style={{ minHeight: 44 }}
      >
        {/* Heat meter */}
        <HeatMeter score={rivalry.heatScore} label={rivalry.heatLabel} colorClass={rivalry.heatColor} />

        {/* Coaches + record */}
        <div className="flex items-center gap-2 mt-2">
          {/* Coach A */}
          <div className="flex-1 min-w-0">
            {displayCoachA ? <CoachChip coach={displayCoachA} /> : <span className="text-xs text-muted-foreground">Unknown</span>}
          </div>

          {/* Record in middle */}
          <div className="flex flex-col items-center shrink-0 px-2">
            <div className="flex items-center gap-1.5">
              <RecordBadge wins={displayWinsA} losses={displayWinsB} />
              <span className="text-xs text-muted-foreground">vs</span>
              <RecordBadge wins={displayWinsB} losses={displayWinsA} />
            </div>
            <span className="text-xs text-muted-foreground mt-0.5">{record.gamesPlayed} game{record.gamesPlayed !== 1 ? "s" : ""}</span>
          </div>

          {/* Coach B */}
          <div className="flex-1 min-w-0 flex justify-end">
            {displayCoachB ? <CoachChip coach={displayCoachB} /> : <span className="text-xs text-muted-foreground">Unknown</span>}
          </div>
        </div>

        {/* Streak + last meeting */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {rivalry.streakIsMe && <StreakBadge streak={rivalry.streakLength} isMe={true} />}
          {rivalry.streakIsThem && <StreakBadge streak={rivalry.streakLength} isMe={false} />}
          {lastMeetingScore && (
            <span className="text-xs text-muted-foreground">Last: {lastMeetingScore}</span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/5 p-3 space-y-3">
          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatCell label="Avg Run Diff" value={`${record.avgRunDiff}`} />
            <StatCell label="Postseason" value={`${record.postseasonGames}G`} />
            <StatCell
              label="Biggest W"
              value={record.biggestWinMargin > 0 ? `+${record.biggestWinMargin}` : "—"}
            />
          </div>

          {/* Runs scored */}
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center bg-muted/20 rounded p-2">
              <div className="text-xs text-muted-foreground">Runs Scored</div>
              <div className="font-bold text-sm">
                {isMyView && rivalry.isMyRivalry ? rivalry.myRuns : record.coachARunsScored}
                <span className="text-muted-foreground text-xs"> vs </span>
                {isMyView && rivalry.isMyRivalry ? rivalry.theirRuns : record.coachBRunsScored}
              </div>
            </div>
            <div className="text-center bg-muted/20 rounded p-2">
              <div className="text-xs text-muted-foreground">Postseason W</div>
              <div className="font-bold text-sm">
                {isMyView && rivalry.isMyRivalry ? rivalry.myPostseasonWins : record.coachAPostseasonWins}
                <span className="text-muted-foreground text-xs"> vs </span>
                {isMyView && rivalry.isMyRivalry ? (record.postseasonGames - rivalry.myPostseasonWins) : record.coachBPostseasonWins}
              </div>
            </div>
          </div>

          {/* Recruiting conflicts */}
          {recruiting.conflicts > 0 && (
            <div className="bg-violet-950/30 border border-violet-600/20 rounded p-2">
              <div className="flex items-center gap-1 text-xs text-violet-400 font-medium mb-1">
                <Target className="w-3 h-3" />
                Recruiting Battles
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="font-bold text-sm text-emerald-400">
                    {isMyView && rivalry.isMyRivalry ? rivalry.myRecruitSignings : recruiting.coachASignings}
                  </div>
                  <div className="text-xs text-muted-foreground">Your Wins</div>
                </div>
                <div>
                  <div className="font-bold text-sm">{recruiting.conflicts}</div>
                  <div className="text-xs text-muted-foreground">Conflicts</div>
                </div>
                <div>
                  <div className="font-bold text-sm text-red-400">
                    {isMyView && rivalry.isMyRivalry ? rivalry.theirRecruitSignings : recruiting.coachBSignings}
                  </div>
                  <div className="text-xs text-muted-foreground">Their Wins</div>
                </div>
              </div>
            </div>
          )}

          {/* War Room note */}
          {rivalry.isMyRivalry && record.gamesPlayed > 0 && (
            <div className="bg-gold/5 border border-gold/20 rounded p-2 text-xs text-gold/80 flex items-start gap-1.5">
              <Swords className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                You are{" "}
                <strong className="text-gold">
                  {rivalry.myWins}–{rivalry.theirWins}
                </strong>{" "}
                all-time vs this coach
                {rivalry.streakIsMe && ` · Won ${rivalry.streakLength} in a row`}
                {rivalry.streakIsThem && ` · Lost ${rivalry.streakLength} in a row`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/20 rounded p-2">
      <div className="font-bold text-sm">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RivalriesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"mine" | "all">("mine");

  const { data, isLoading, error } = useQuery<RivalriesResponse>({
    queryKey: [`/api/leagues/${leagueId}/rivalries`],
  });

  const toggleExpanded = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const displayRivalries = activeTab === "mine" ? (data?.myRivalries ?? []) : (data?.rivalries ?? []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/league/${leagueId}`}>
            <button className="p-2 -ml-1 rounded hover:bg-muted/20 transition-colors" style={{ minWidth: 44, minHeight: 44 }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Swords className="w-4 h-4 text-gold" />
            <h1 className="font-pixel text-xs text-gold">Coaching Rivalries</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-0">
          <div className="flex border-b border-border">
            {(["mine", "all"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-pixel transition-colors ${
                  activeTab === tab
                    ? "text-gold border-b-2 border-gold -mb-px"
                    : "text-muted-foreground"
                }`}
                data-testid={`tab-${tab}`}
                style={{ minHeight: 44 }}
              >
                {tab === "mine" ? "My Rivalries" : "All Rivalries"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Loading */}
        {isLoading && (
          <>
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Failed to load rivalries.
          </div>
        )}

        {/* Empty — mine */}
        {!isLoading && !error && activeTab === "mine" && displayRivalries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center">
              <Swords className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-medium text-sm">No rivalries yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Play games against other human coaches to build your rivalry history.
              </p>
            </div>
          </div>
        )}

        {/* Empty — all */}
        {!isLoading && !error && activeTab === "all" && displayRivalries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No human-vs-human matchups recorded yet this dynasty.
            </p>
          </div>
        )}

        {/* Rivalry cards */}
        {!isLoading && displayRivalries.map(rivalry => (
          <RivalryCard
            key={rivalry.id}
            rivalry={rivalry}
            expanded={expandedId === rivalry.id}
            onToggle={() => toggleExpanded(rivalry.id)}
            isMyView={activeTab === "mine"}
          />
        ))}

        {/* Legend */}
        {!isLoading && displayRivalries.length > 0 && (
          <div className="flex items-center gap-4 py-2 text-xs text-muted-foreground justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Scorching (75+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Heated (50+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Warming (25+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" />Developing</span>
          </div>
        )}
      </div>
    </div>
  );
}
