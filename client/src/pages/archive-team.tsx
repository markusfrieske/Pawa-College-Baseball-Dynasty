import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronDown, ChevronUp, Trophy, Crown,
  Star, GraduationCap, Users, ArrowRight, BookOpen,
} from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DraftPick {
  name: string; position: string; round: number | null; overall: number;
}

interface DepartedPlayer {
  name: string; position: string; overall: number;
  starRating: number; departureType: string; draftRound: number | null;
}

interface SeasonEntry {
  season: number;
  wins: number; losses: number;
  confWins: number; confLosses: number;
  postseasonResult: string | null;
  classRank: number | null;
  classScore: number | null;
  grade: string | null;
  topRecruitName: string | null;
  topRecruitOvr: number | null;
  topRecruitStars: number | null;
  totalCommits: number;
  coachName: string | null;
  departedCount: number;
  draftedCount: number;
  topDraftPick: DraftPick | null;
  departed: DepartedPlayer[];
}

interface TeamArchiveData {
  team: { id: string; name: string; abbr: string; color: string; mascot: string | null };
  teamHistory: SeasonEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function gradeColor(g: string | null) {
  if (!g) return "text-muted-foreground";
  if (g.startsWith("A")) return "text-emerald-400";
  if (g.startsWith("B")) return "text-sky-400";
  return "text-amber-400";
}

function PostseasonBadge({ result }: { result: string | null }) {
  if (!result) return null;
  const cfg: Record<string, string> = {
    "CWS Champion": "text-gold border-gold/40 bg-gold/10",
    "CWS Appearance": "text-orange-400 border-orange-500/40 bg-orange-500/10",
    "Super Regionals Win": "text-sky-400 border-sky-500/40 bg-sky-500/10",
    "Super Regionals": "text-sky-400 border-sky-500/30",
    "Conf Champion": "text-purple-400 border-purple-500/40 bg-purple-500/10",
    "Conf Championship": "text-purple-400 border-purple-500/30",
  };
  const cls = cfg[result] ?? "text-muted-foreground border-border/40";
  return <Badge variant="outline" className={`text-xs whitespace-nowrap ${cls}`}>{result}</Badge>;
}

function DepartureLabel({ type, round }: { type: string; round: number | null }) {
  if (type === "drafted" || type === "declared") {
    return (
      <Badge className="text-xs bg-yellow-500/20 border-yellow-500/40 text-yellow-400">
        {round ? `Rd ${round}` : "Draft"}
      </Badge>
    );
  }
  if (type === "transfer_portal") return <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/40">XFER</Badge>;
  if (type === "graduated") return <Badge variant="outline" className="text-xs text-sky-400 border-sky-500/30">Grad</Badge>;
  return <Badge variant="outline" className="text-xs">{type.slice(0, 4)}</Badge>;
}

function StarRow({ stars }: { stars: number | null }) {
  if (!stars) return null;
  const colors: Record<number, string> = { 5: "text-orange-400", 4: "text-yellow-400", 3: "text-green-400", 2: "text-blue-400", 1: "text-gray-400" };
  return <span className={`text-xs font-semibold ${colors[stars] ?? "text-muted-foreground"}`}>{"★".repeat(stars)}</span>;
}

// ── Season Card ────────────────────────────────────────────────────────────────

function SeasonCard({ entry, leagueId, teamId }: { entry: SeasonEntry; leagueId: string; teamId: string }) {
  const [expanded, setExpanded] = useState(false);

  const winPct = (entry.wins + entry.losses) > 0
    ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(0)
    : "0";

  return (
    <RetroCard data-testid={`card-season-${entry.season}`}>
      <button
        className="w-full text-left min-h-[60px]"
        onClick={() => setExpanded(e => !e)}
        data-testid={`btn-expand-season-${entry.season}`}
        aria-expanded={expanded}
      >
        <RetroCardContent className="py-3">
          <div className="flex items-center gap-3">
            {/* Season label */}
            <div className="flex-shrink-0 text-center w-10">
              <p className="text-gold text-xs">S{entry.season}</p>
              <p className="font-mono text-xs text-muted-foreground">{winPct}%</p>
            </div>

            {/* Record */}
            <div className="flex-shrink-0 text-center w-14">
              <p className="font-mono font-bold text-sm">{entry.wins}–{entry.losses}</p>
              <p className="text-xs text-muted-foreground">{entry.confWins}–{entry.confLosses} conf</p>
            </div>

            {/* Postseason + class rank */}
            <div className="flex-1 min-w-0 space-y-1">
              {entry.postseasonResult && <PostseasonBadge result={entry.postseasonResult} />}
              {entry.classRank && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-gold" />
                  <span className="text-xs">#{entry.classRank} class</span>
                  {entry.grade && (
                    <span className={`text-xs font-semibold font-bold ${gradeColor(entry.grade)}`}>
                      {entry.grade}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Draft picks quick */}
            {entry.draftedCount > 0 && (
              <div className="flex-shrink-0 text-center">
                <p className="text-xs text-yellow-400 font-medium">{entry.draftedCount}</p>
                <p className="text-xs text-muted-foreground">draft</p>
              </div>
            )}

            {expanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          </div>
        </RetroCardContent>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-3">
          {/* Top draft pick */}
          {entry.topDraftPick && (
            <div className="flex items-center gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
              <Trophy className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-yellow-400">TOP DRAFT PICK</p>
                <p className="text-sm font-medium truncate">{entry.topDraftPick.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.topDraftPick.position} · {entry.topDraftPick.overall} OVR
                  {entry.topDraftPick.round && ` · Round ${entry.topDraftPick.round}`}
                </p>
              </div>
            </div>
          )}

          {/* Top recruit */}
          {entry.topRecruitName && (
            <div className="flex items-center gap-2 p-2 rounded bg-background/40 border border-border/40">
              <Star className="w-3.5 h-3.5 text-gold flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gold">TOP RECRUIT</p>
                <p className="text-sm font-medium truncate">{entry.topRecruitName}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {entry.topRecruitOvr && <span>{entry.topRecruitOvr} OVR</span>}
                  {entry.topRecruitStars && <StarRow stars={entry.topRecruitStars} />}
                  {entry.totalCommits > 0 && <span>· {entry.totalCommits} commits</span>}
                </div>
              </div>
            </div>
          )}

          {/* Departed players */}
          {entry.departed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                DEPARTURES ({entry.departedCount} total)
              </p>
              <div className="space-y-1">
                {entry.departed.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-sm font-medium flex-1 truncate">{d.name}</span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{d.position}</Badge>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{d.overall}</span>
                    <DepartureLabel type={d.departureType} round={d.draftRound} />
                  </div>
                ))}
                {entry.departedCount > entry.departed.length && (
                  <p className="text-xs text-muted-foreground">
                    …and {entry.departedCount - entry.departed.length} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Archive link for this season */}
          <Link href={`/league/${leagueId}/archive?season=${entry.season}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-gold transition-colors cursor-pointer pt-1" data-testid={`link-season-archive-${entry.season}`}>
              <BookOpen className="w-3 h-3" />
              <span>View full Season {entry.season} archive</span>
              <ArrowRight className="w-3 h-3 ml-auto" />
            </div>
          </Link>
        </div>
      )}
    </RetroCard>
  );
}

// ── Main Team History Page ────────────────────────────────────────────────────

export default function ArchiveTeamPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();

  const { data, isLoading } = useQuery<TeamArchiveData>({
    queryKey: ["/api/leagues", id, "archive", "team", teamId],
    queryFn: () =>
      fetch(`/api/leagues/${id}/archive/team/${teamId}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const { data: leagueData } = useQuery<{ league: { name: string } }>({
    queryKey: ["/api/leagues", id],
  });

  const team = data?.team;
  const history = data?.teamHistory ?? [];

  const totalWins = history.reduce((s, e) => s + e.wins, 0);
  const totalLosses = history.reduce((s, e) => s + e.losses, 0);
  const championships = history.filter(e => e.postseasonResult === "CWS Champion").length;
  const confTitles = history.filter(e => e.postseasonResult === "Conf Champion" || e.postseasonResult === "CWS Champion").length;
  const totalDrafted = history.reduce((s, e) => s + e.draftedCount, 0);

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 border-b border-border/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/league/${id}/archive`}>
              <button
                className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="btn-back-team-archive"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </Link>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {team && (
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: team.color }} />
              )}
              <div className="min-w-0">
                <p className="text-gold text-xs">{leagueData?.league?.name?.toUpperCase() ?? "LEAGUE"}</p>
                <h1 className="text-xs font-semibold text-foreground truncate">
                  {isLoading ? "Loading…" : (team?.name ?? "Team History")}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {!isLoading && team && (
          <>
            {/* Team summary stats */}
            <RetroCard data-testid="card-team-summary">
              <RetroCardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: team.color }} />
                  <span>{team.name}</span>
                  <Badge variant="outline" className="text-xs ml-auto">{history.length} season{history.length !== 1 ? "s" : ""}</Badge>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded bg-background/40 border border-border/40">
                    <p className="font-mono font-bold text-base">{totalWins}–{totalLosses}</p>
                    <p className="text-xs text-muted-foreground">All-time</p>
                  </div>
                  <div className="text-center p-2 rounded bg-background/40 border border-border/40">
                    <p className="font-bold text-base text-gold">{championships}</p>
                    <p className="text-xs text-muted-foreground">CWS Titles</p>
                  </div>
                  <div className="text-center p-2 rounded bg-background/40 border border-border/40">
                    <p className="font-bold text-base">{confTitles}</p>
                    <p className="text-xs text-muted-foreground">Conf Titles</p>
                  </div>
                  <div className="text-center p-2 rounded bg-background/40 border border-border/40">
                    <p className="font-bold text-base text-yellow-400">{totalDrafted}</p>
                    <p className="text-xs text-muted-foreground">Draft Picks</p>
                  </div>
                </div>
              </RetroCardContent>
            </RetroCard>

            {/* Year-by-year */}
            {history.length === 0 ? (
              <RetroCard>
                <RetroCardContent>
                  <p className="text-center text-sm text-muted-foreground py-8">No season history yet.</p>
                </RetroCardContent>
              </RetroCard>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1">Tap a season to expand details</p>
                {history.map(entry => (
                  <SeasonCard key={entry.season} entry={entry} leagueId={id} teamId={teamId} />
                ))}
              </div>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link href={`/league/${id}/archive`}>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-gold/40 transition-colors cursor-pointer min-h-[52px]" data-testid="link-all-seasons">
                  <BookOpen className="w-4 h-4 text-gold flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">All Seasons</p>
                    <p className="text-xs text-muted-foreground">League archive</p>
                  </div>
                </div>
              </Link>
              <Link href={`/league/${id}/team/${teamId}`}>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-gold/40 transition-colors cursor-pointer min-h-[52px]" data-testid="link-team-view">
                  <Users className="w-4 h-4 text-gold flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Current Roster</p>
                    <p className="text-xs text-muted-foreground">Team view</p>
                  </div>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
