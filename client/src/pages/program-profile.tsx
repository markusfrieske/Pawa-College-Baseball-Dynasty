import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Trophy,
  Star,
  TrendingUp,
  Crown,
  Award,
  Calendar,
  User,
  Cpu,
  Medal,
} from "lucide-react";

interface SeasonHistoryRow {
  season: number;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  confFinish: number | null;
  postseasonResult: string;
}

interface HoFPlayer {
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  starRating: number;
  status: string;
  draftRound: number | null;
  season: number | null;
  abilities: string[];
}

interface DraftedPlayer {
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  starRating: number;
  draftRound: number | null;
  departedSeason: number;
}

interface ProgramProfileData {
  team: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    mascot: string;
    prestige: number;
    isCpu: boolean;
    conferenceName: string | null;
  };
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    archetype: string | null;
    level: number;
    xp: number;
    userId: string | null;
  } | null;
  isCommissioner: boolean;
  commissionerSeasons: number;
  currentSeason: number;
  allTimeWins: number;
  allTimeLosses: number;
  confChampAppearances: number;
  confChampionships: number;
  superRegionalsAppearances: number;
  cwsAppearances: number;
  cwsTitles: number;
  seasonHistory: SeasonHistoryRow[];
  recruitingHoF: HoFPlayer[];
  topDraftedPlayers: DraftedPlayer[];
}

const ARCHETYPE_LABELS: Record<string, string> = {
  recruiter: "Recruiter",
  developer: "Developer",
  tactician: "Tactician",
  motivator: "Motivator",
  scout: "Scout",
};

function starColor(stars: number) {
  if (stars >= 5) return "text-amber-400";
  if (stars >= 4) return "text-blue-400";
  if (stars >= 3) return "text-green-400";
  return "text-muted-foreground";
}

function ovRColor(overall: number) {
  if (overall >= 500) return "text-amber-400";
  if (overall >= 400) return "text-blue-400";
  if (overall >= 300) return "text-green-400";
  return "text-muted-foreground";
}

function postseasonBadge(result: string) {
  if (result === "CWS Champion") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (result === "CWS") return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  if (result === "Super Regionals") return "bg-purple-500/20 text-purple-300 border-purple-500/40";
  if (result === "Conf. Champ.") return "bg-green-500/20 text-green-300 border-green-500/40";
  return "bg-muted/30 text-muted-foreground border-border";
}

function draftRoundLabel(round: number | null) {
  if (!round) return null;
  if (round === 1) return { label: "Rd 1", cls: "bg-amber-500/20 text-amber-300 border-amber-500/50" };
  if (round === 2) return { label: "Rd 2", cls: "bg-blue-500/20 text-blue-300 border-blue-500/50" };
  return { label: "Rd 3", cls: "bg-muted/30 text-muted-foreground border-border" };
}

function ordinal(n: number | null) {
  if (!n) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ProgramProfilePage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();

  const { data, isLoading } = useQuery<ProgramProfileData>({
    queryKey: ["/api/leagues", id, "teams", teamId, "program-profile"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/teams/${teamId}/program-profile`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  if (isLoading) {
    return <ProgramProfileSkeleton />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Program not found</p>
      </div>
    );
  }

  const { team, coach, isCommissioner, commissionerSeasons, allTimeWins, allTimeLosses, confChampAppearances, confChampionships, superRegionalsAppearances, cwsAppearances, cwsTitles, seasonHistory, recruitingHoF, topDraftedPlayers } = data;
  const totalGames = allTimeWins + allTimeLosses;
  const winPct = totalGames > 0 ? ((allTimeWins / totalGames) * 100).toFixed(1) : "0.0";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-pixel text-gold text-lg">Program Profile</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 pb-20 md:pb-8 max-w-4xl">
        {/* Hero */}
        <RetroCard>
          <RetroCardContent className="pt-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <TeamBadge
                abbreviation={team.abbreviation}
                primaryColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                name={team.name}
                mascot={team.mascot}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-pixel text-xl text-foreground">{team.name}</h2>
                  {cwsTitles > 0 && (
                    <span title={`${cwsTitles}x CWS Champion`} className="text-amber-400">
                      <Crown className="w-4 h-4 inline" />
                    </span>
                  )}
                  {isCommissioner && (
                    <Badge variant="outline" className="text-[9px] border-gold text-gold font-pixel" data-testid="badge-commissioner-team">
                      COMMISSIONER · {commissionerSeasons}S
                    </Badge>
                  )}
                  {team.isCpu && (
                    <Badge variant="outline" className="text-[9px] border-orange-400/60 text-orange-400 font-pixel">
                      CPU
                    </Badge>
                  )}
                </div>
                {team.conferenceName && (
                  <p className="text-sm text-muted-foreground mt-0.5">{team.conferenceName}</p>
                )}
                {coach && (
                  <div className="flex items-center gap-2 mt-2">
                    {coach.userId ? (
                      <User className="w-3.5 h-3.5 text-gold" />
                    ) : (
                      <Cpu className="w-3.5 h-3.5 text-orange-400" />
                    )}
                    <Link href={`/league/${id}/coach/${coach.id}`}>
                      <span className="text-sm hover:text-gold cursor-pointer transition-colors">
                        Coach {coach.firstName} {coach.lastName}
                      </span>
                    </Link>
                    {coach.archetype && (
                      <Badge variant="outline" className="text-[9px] border-gold/40 text-gold/70">
                        {ARCHETYPE_LABELS[coach.archetype] ?? coach.archetype}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground font-pixel">Lv.{coach.level}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-foreground">{team.prestige}</div>
                <div className="text-[9px] text-muted-foreground font-pixel">PRESTIGE</div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        {/* All-time stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile icon={<TrendingUp className="w-4 h-4" />} label="All-Time Record" value={`${allTimeWins}-${allTimeLosses}`} sub={`${winPct}%`} />
          <StatTile icon={<Trophy className="w-4 h-4" />} label="CWS Titles" value={String(cwsTitles)} gold={cwsTitles > 0} />
          <StatTile icon={<Crown className="w-4 h-4" />} label="Conf. Titles" value={String(confChampionships)} gold={confChampionships > 0} />
        </div>
        {/* Postseason appearances */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<Award className="w-4 h-4" />} label="Conf. Champ." value={String(confChampAppearances)} sub="appearances" />
          <StatTile icon={<Star className="w-4 h-4" />} label="Super Regionals" value={String(superRegionalsAppearances)} sub="appearances" />
          <StatTile icon={<Medal className="w-4 h-4" />} label="CWS" value={String(cwsAppearances)} sub="appearances" />
        </div>

        {/* Season-by-Season History */}
        {seasonHistory.length > 0 && (
          <RetroCard data-testid="section-season-history">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gold" />
                Season-by-Season History
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[380px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-pixel text-[8px]">
                      <th className="text-left py-2 px-2">Season</th>
                      <th className="text-center py-2 px-2">W</th>
                      <th className="text-center py-2 px-2">L</th>
                      <th className="text-center py-2 px-2 hidden sm:table-cell">Conf</th>
                      <th className="text-center py-2 px-2 hidden sm:table-cell">Finish</th>
                      <th className="text-center py-2 px-2">Postseason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonHistory.map((row) => (
                      <tr key={row.season} className="border-b border-border/50 hover:bg-card/50" data-testid={`row-season-${row.season}`}>
                        <td className="py-2 px-2 font-pixel text-[9px] text-gold">S{row.season}</td>
                        <td className="py-2 px-2 text-center font-bold text-green-500">{row.wins}</td>
                        <td className="py-2 px-2 text-center font-bold text-red-500">{row.losses}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground hidden sm:table-cell">
                          {row.confWins}-{row.confLosses}
                        </td>
                        <td className="py-2 px-2 text-center text-muted-foreground hidden sm:table-cell">
                          {ordinal(row.confFinish)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-pixel ${postseasonBadge(row.postseasonResult)}`}>
                            {row.postseasonResult}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Recruiting Hall of Fame */}
        {recruitingHoF.length > 0 && (
          <RetroCard data-testid="section-recruiting-hof">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Medal className="w-4 h-4 text-gold" />
                Recruiting Hall of Fame
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <p className="text-[10px] text-muted-foreground mb-3">Top 5 highest-rated players to ever wear this uniform.</p>
              <div className="space-y-2">
                {recruitingHoF.map((player, i) => {
                  const draftBadge = draftRoundLabel(player.draftRound);
                  const statusConfig: Record<string, { label: string; cls: string }> = {
                    active: { label: "Active", cls: "border-green-500/60 text-green-400" },
                    graduated: { label: "Graduated", cls: "border-muted-foreground/40 text-muted-foreground" },
                    drafted: { label: "MLB Draft", cls: "border-amber-500/50 text-amber-400" },
                    transferred: { label: "Transferred", cls: "border-purple-500/50 text-purple-400" },
                  };
                  const statusStyle = statusConfig[player.status] ?? { label: player.status, cls: "border-border text-muted-foreground" };
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/20 hover:bg-muted/30 transition-colors" data-testid={`row-hof-${i}`}>
                      <span className="font-pixel text-[10px] text-muted-foreground w-4 text-right flex-shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {player.firstName} {player.lastName}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{player.position}</span>
                          <Badge variant="outline" className={`text-[8px] ${statusStyle.cls}`}>
                            {statusStyle.label}
                          </Badge>
                          {draftBadge && player.status !== "drafted" && (
                            <Badge variant="outline" className={`text-[8px] ${draftBadge.cls}`}>
                              {draftBadge.label}
                            </Badge>
                          )}
                        </div>
                        {player.season && (
                          <div className="text-[9px] text-muted-foreground mt-0.5">Season {player.season}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StarsDisplay stars={player.starRating} />
                        <span className={`font-bold text-sm ${ovRColor(player.overall)}`}>{player.overall}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Top Drafted Players */}
        {topDraftedPlayers.length > 0 && (
          <RetroCard data-testid="section-draft-history">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                Draft History
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <p className="text-[10px] text-muted-foreground mb-3">Players drafted to professional baseball from this program.</p>
              <div className="space-y-2">
                {topDraftedPlayers.map((player, i) => {
                  const draftBadge = draftRoundLabel(player.draftRound);
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/20 hover:bg-muted/30 transition-colors" data-testid={`row-draft-${i}`}>
                      {draftBadge && (
                        <Badge variant="outline" className={`text-[8px] font-pixel flex-shrink-0 ${draftBadge.cls}`}>
                          {draftBadge.label}
                        </Badge>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{player.firstName} {player.lastName}</span>
                          <span className="text-[10px] text-muted-foreground">{player.position}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground">Season {player.departedSeason}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StarsDisplay stars={player.starRating} />
                        <span className={`font-bold text-sm ${ovRColor(player.overall)}`}>{player.overall}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {seasonHistory.length === 0 && recruitingHoF.length === 0 && topDraftedPlayers.length === 0 && (
          <RetroCard>
            <RetroCardContent className="py-12 text-center">
              <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No program history yet. Check back after the first season concludes.</p>
            </RetroCardContent>
          </RetroCard>
        )}
      </main>
    </div>
  );
}

function StatTile({ icon, label, value, sub, gold }: { icon: React.ReactNode; label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <RetroCard>
      <RetroCardContent className="py-4 px-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="font-pixel text-[7px]">{label.toUpperCase()}</span>
        </div>
        <div className={`text-2xl font-bold ${gold ? "text-amber-400" : "text-foreground"}`}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub} win %</div>}
      </RetroCardContent>
    </RetroCard>
  );
}

function StarsDisplay({ stars }: { stars: number }) {
  return (
    <span className={`font-pixel text-[9px] ${starColor(stars)}`}>
      {"★".repeat(Math.max(0, stars))}
    </span>
  );
}

function ProgramProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-40 h-5 rounded" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        <Skeleton className="h-32 w-full rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded" />)}
        </div>
        <Skeleton className="h-64 w-full rounded" />
        <Skeleton className="h-48 w-full rounded" />
      </main>
    </div>
  );
}
