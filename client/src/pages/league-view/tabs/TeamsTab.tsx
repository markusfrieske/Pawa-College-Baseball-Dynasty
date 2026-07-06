import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Cpu } from "lucide-react";
import type { LeagueDetails, PowerRankingEntry } from "../types";

interface CompareTeamData {
  id: string; name: string; mascot: string; abbreviation: string; primaryColor: string; secondaryColor: string;
  prestige: number; facilities: number;
  wins: number; losses: number; confWins: number; confLosses: number;
  runsScored: number; runsAllowed: number;
  rosterSize: number; avgOverall: number; avgPitcher: number; avgHitter: number;
  positionCounts: Record<string, number>;
  topPlayers: { name: string; position: string; overall: number; year: number }[];
  freshmen: number; sophomores: number; juniors: number; seniors: number;
}

function CompareStatRow({ label, valueA, valueB, highlight }: { label: string; valueA: string | number; valueB: string | number; highlight?: boolean }) {
  const numA = typeof valueA === "number" ? valueA : parseFloat(valueA);
  const numB = typeof valueB === "number" ? valueB : parseFloat(valueB);
  const aWins = !isNaN(numA) && !isNaN(numB) && numA > numB;
  const bWins = !isNaN(numA) && !isNaN(numB) && numB > numA;

  return (
    <div className={`grid grid-cols-3 gap-2 py-1.5 text-sm ${highlight ? "bg-gold/5" : ""}`}>
      <span className={`text-right font-mono ${aWins ? "text-green-400 font-semibold" : ""}`}>{valueA}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono ${bWins ? "text-green-400 font-semibold" : ""}`}>{valueB}</span>
    </div>
  );
}

function TeamCompareDialog({ leagueId, teamAId, teamBId, open, onClose }: { leagueId: string; teamAId: string; teamBId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ teamA: CompareTeamData; teamB: CompareTeamData }>({
    queryKey: [`/api/leagues/${leagueId}/team-compare?teamA=${teamAId}&teamB=${teamBId}`],
    enabled: open && !!teamAId && !!teamBId,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">Team Comparison</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center justify-end gap-2">
                <span className="font-pixel text-xs text-right">{data.teamA.name}</span>
                <TeamBadge abbreviation={data.teamA.abbreviation} primaryColor={data.teamA.primaryColor} name={data.teamA.name} size="md" />
              </div>
              <div className="text-center text-muted-foreground text-xs pt-2">VS</div>
              <div className="flex items-center gap-2">
                <TeamBadge abbreviation={data.teamB.abbreviation} primaryColor={data.teamB.primaryColor} name={data.teamB.name} size="md" />
                <span className="font-pixel text-xs">{data.teamB.name}</span>
              </div>
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">RECORD</p>
              <CompareStatRow label="W-L" valueA={`${data.teamA.wins}-${data.teamA.losses}`} valueB={`${data.teamB.wins}-${data.teamB.losses}`} highlight />
              <CompareStatRow label="Conf W-L" valueA={`${data.teamA.confWins}-${data.teamA.confLosses}`} valueB={`${data.teamB.confWins}-${data.teamB.confLosses}`} />
              <CompareStatRow label="Runs Scored" valueA={data.teamA.runsScored} valueB={data.teamB.runsScored} />
              <CompareStatRow label="Runs Allowed" valueA={data.teamA.runsAllowed} valueB={data.teamB.runsAllowed} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">ROSTER</p>
              <CompareStatRow label="Roster Size" valueA={data.teamA.rosterSize} valueB={data.teamB.rosterSize} />
              <CompareStatRow label="Avg Overall" valueA={data.teamA.avgOverall} valueB={data.teamB.avgOverall} highlight />
              <CompareStatRow label="Avg Pitcher" valueA={data.teamA.avgPitcher} valueB={data.teamB.avgPitcher} />
              <CompareStatRow label="Avg Hitter" valueA={data.teamA.avgHitter} valueB={data.teamB.avgHitter} />
              <CompareStatRow label="Freshmen" valueA={data.teamA.freshmen} valueB={data.teamB.freshmen} />
              <CompareStatRow label="Sophomores" valueA={data.teamA.sophomores} valueB={data.teamB.sophomores} />
              <CompareStatRow label="Juniors" valueA={data.teamA.juniors} valueB={data.teamB.juniors} />
              <CompareStatRow label="Seniors" valueA={data.teamA.seniors} valueB={data.teamB.seniors} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">PROGRAM</p>
              <CompareStatRow label="Prestige" valueA={data.teamA.prestige} valueB={data.teamB.prestige} highlight />
              <CompareStatRow label="Facilities" valueA={data.teamA.facilities} valueB={data.teamB.facilities} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[data.teamA, data.teamB].map((team, idx) => (
                <div key={idx} className="border border-border/50 rounded-md p-3">
                  <p className="font-pixel text-[10px] text-gold mb-2">TOP 5 PLAYERS - {team.abbreviation}</p>
                  {team.topPlayers.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate">{p.name} <span className="text-muted-foreground">({p.position}, Yr {p.year})</span></span>
                      <span className="font-mono">{p.overall}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function TeamsTab({ league }: { league: LeagueDetails }) {
  const [compareTeamA, setCompareTeamA] = useState("");
  const [compareTeamB, setCompareTeamB] = useState("");
  const [showCompare, setShowCompare] = useState(false);

  const { data: rankData } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const leagueRankMap = new Map((rankData?.rankings ?? []).map(r => [r.teamId, r.rank]));

  const teamsByConference = league.conferences?.map(conf => ({
    ...conf,
    teams: league.teams?.filter(t => t.conferenceId === conf.id) || [],
  })) || [];

  const allTeams = league.teams || [];

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <span>Compare Teams</span>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div className="flex-1 sm:flex-none">
              <label className="text-xs text-muted-foreground block mb-1">Team A</label>
              <select
                value={compareTeamA}
                onChange={(e) => setCompareTeamA(e.target.value)}
                className="w-full sm:w-auto bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-a"
              >
                <option value="">Select team...</option>
                {allTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <span className="text-muted-foreground text-sm hidden sm:block pb-2">vs</span>
            <div className="flex-1 sm:flex-none">
              <label className="text-xs text-muted-foreground block mb-1">Team B</label>
              <select
                value={compareTeamB}
                onChange={(e) => setCompareTeamB(e.target.value)}
                className="w-full sm:w-auto bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-b"
              >
                <option value="">Select team...</option>
                {allTeams.filter(t => t.id !== compareTeamA).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <RetroButton
              size="sm"
              disabled={!compareTeamA || !compareTeamB}
              onClick={() => setShowCompare(true)}
              className="w-full sm:w-auto"
              data-testid="button-compare-teams"
            >
              Compare
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      <TeamCompareDialog
        leagueId={league.id}
        teamAId={compareTeamA}
        teamBId={compareTeamB}
        open={showCompare}
        onClose={() => setShowCompare(false)}
      />

      {teamsByConference.map((conf) => (
        <RetroCard key={conf.id}>
          <RetroCardHeader>{conf.name}</RetroCardHeader>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {conf.teams.map((team) => (
              <Link key={team.id} href={`/league/${league.id}/team/${team.id}`}>
                <div className="bg-muted/30 p-4 rounded hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`card-team-${team.id}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      name={team.name}
                     
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground">{team.name}</p>
                        {leagueRankMap.has(team.id) && (
                          <span className="font-pixel text-[8px] text-gold/70" data-testid={`badge-league-rank-card-${team.id}`}>
                            #{leagueRankMap.get(team.id)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{team.mascot}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs mb-2">
                    {team.coach ? (
                      <>
                        <User className="w-3 h-3 text-gold" />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-foreground">{team.coach.firstName} {team.coach.lastName}</span>
                            {team.user && (
                              <span className="text-muted-foreground">({team.user.email.split("@")[0]})</span>
                            )}
                          </div>
                          {(team.coach as any).archetype && (
                            <div className="text-[10px] text-muted-foreground/60">{(team.coach as any).archetype}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">CPU Controlled</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Prestige</span>
                    <StarRating rating={Math.ceil(team.prestige / 2)} size="sm" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </RetroCard>
      ))}
    </div>
  );
}
