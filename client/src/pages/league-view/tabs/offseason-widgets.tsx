import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Trophy, Zap, X, Target, UserMinus, UserPlus, Users, ScrollText, Award } from "lucide-react";
import type { LeagueDetails, TeamWithCoach, SigningDayData } from "../types";
import { getClassGrade, getGradeColor, getGradeBg } from "../helpers";

type ClassSnapshot = {
  teamId: string;
  classRank: number;
  classScore: number;
  totalCommits: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  avgOverall: number;
  avgStarRating: number;
  topRecruitName?: string | null;
  topRecruitOvr?: number | null;
  topRecruitStars?: number | null;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  isCpu: boolean;
};

export function SigningDaySummaryCard({ league, myTeam }: { league: LeagueDetails; myTeam: TeamWithCoach | undefined | null }) {
  const showPhases = ["offseason_walkons", "preseason"];
  const isVisible = showPhases.includes(league.currentPhase ?? "");

  const { data: rankingsData } = useQuery<{
    bySeason: Record<number, ClassSnapshot[]>;
    availableSeasons: number[];
  }>({
    queryKey: ["/api/leagues", league.id, "class-rankings"],
    enabled: isVisible && !!myTeam,
  });

  const latestSeason = rankingsData?.availableSeasons?.[0];

  const dismissKey = `signing-day-summary-dismissed-${league.id}-${latestSeason ?? "none"}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (latestSeason != null) {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    }
  }, [dismissKey, latestSeason]);

  const snaps: ClassSnapshot[] = latestSeason != null ? (rankingsData?.bySeason?.[latestSeason] ?? []) : [];
  const mySnap = myTeam ? snaps.find(s => s.teamId === myTeam.id) : null;

  if (!isVisible || !myTeam || latestSeason == null) return null;
  if (dismissed || snaps.length === 0 || !mySnap) return null;

  const total = league.teams?.length ?? snaps.length;
  const grade = getClassGrade(mySnap.classRank, total);
  const gradeColor = getGradeColor(grade);
  const gradeBg = getGradeBg(grade);

  const dismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  return (
    <RetroCard className="border-gold/40 mb-4 relative overflow-hidden" data-testid="signing-day-summary-card">
      <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent pointer-events-none" />
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors z-10"
        data-testid="button-dismiss-signing-day-summary"
        aria-label="Dismiss signing day summary"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <Trophy className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-gold text-[10px] mb-0.5">DECISION DAY</p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Season {latestSeason} Recruiting Class — {mySnap.totalCommits} commits signed
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className={`rounded border p-3 text-center ${gradeBg}`}>
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">CLASS GRADE</p>
              <p className={`font-pixel text-2xl font-bold ${gradeColor}`} data-testid="text-signing-day-grade">{grade}</p>
            </div>

            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">NATIONAL RANK</p>
              <p className="font-bold text-xl text-foreground" data-testid="text-signing-day-rank">
                #{mySnap.classRank}
              </p>
              <p className="text-[9px] text-muted-foreground">of {total} teams</p>
            </div>

            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">COMMITS</p>
              <p className="font-bold text-xl text-foreground" data-testid="text-signing-day-commits">
                {mySnap.totalCommits}
              </p>
              <div className="flex justify-center gap-1 mt-0.5 flex-wrap">
                {mySnap.fiveStars > 0 && <span className="text-[8px] text-yellow-400">{mySnap.fiveStars}x 5★</span>}
                {mySnap.fourStars > 0 && <span className="text-[8px] text-yellow-300">{mySnap.fourStars}x 4★</span>}
                {mySnap.threeStars > 0 && <span className="text-[8px] text-muted-foreground">{mySnap.threeStars}x 3★</span>}
              </div>
            </div>

            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">TOP RECRUIT</p>
              {mySnap.topRecruitName ? (
                <>
                  <p className="text-xs font-bold text-foreground leading-tight" data-testid="text-signing-day-top-recruit">
                    {mySnap.topRecruitName}
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    {mySnap.topRecruitStars != null && (
                      <span className="text-[9px] text-yellow-400">{"★".repeat(mySnap.topRecruitStars)}</span>
                    )}
                    {mySnap.topRecruitOvr != null && (
                      <span className="text-[9px] text-muted-foreground">{mySnap.topRecruitOvr} OVR</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link href={`/league/${league.id}/recruiting`}>
              <RetroButton variant="outline" size="sm" data-testid="button-signing-day-view-class">
                <Target className="w-3 h-3 mr-1" />
                View Full Rankings
              </RetroButton>
            </Link>
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

export function ProgramChangesCard({ league, myTeam }: { league: LeagueDetails; myTeam: TeamWithCoach | undefined | null }) {
  const isPreseason = league.currentPhase === "preseason";
  const completedSeason = league.currentSeason - 1;
  const dismissKey = `program-changes-dismissed-${league.id}-${completedSeason}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  const { data: eventsData } = useQuery<{ events?: Array<{ id: string; teamId: string | null; season: number; metadata: Record<string, unknown> | null }> } | Array<{ id: string; teamId: string | null; season: number; metadata: Record<string, unknown> | null }>>({
    queryKey: ["/api/leagues", league.id, "events", "PROGRAM_ATTR_CHANGE"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/events?type=PROGRAM_ATTR_CHANGE&limit=50`);
      return res.json();
    },
    enabled: isPreseason && !!myTeam && completedSeason >= 1,
  });

  if (!isPreseason || !myTeam || completedSeason < 1 || dismissed) return null;

  type AttrChange = { attr: string; label: string; prev: number; curr: number; delta: number; reason: string };
  const rawEvents = Array.isArray(eventsData) ? eventsData : (eventsData as any)?.events ?? [];
  const teamEvent = rawEvents.find(
    (e: any) => e.teamId === myTeam.id && e.season === completedSeason
  );
  const changeList: AttrChange[] = (teamEvent?.metadata as any)?.changes ?? [];

  if (changeList.length === 0) return null;

  return (
    <RetroCard className="border-gold/30 mb-4 relative overflow-hidden" data-testid="program-changes-card">
      <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent pointer-events-none" />
      <button
        onClick={() => { localStorage.setItem(dismissKey, "1"); setDismissed(true); }}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors z-10"
        data-testid="button-dismiss-program-changes"
        aria-label="Dismiss program changes"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <Zap className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-gold text-[10px] mb-0.5">PROGRAM CHANGES</p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Season {completedSeason} — Your program attributes evolved
          </p>
          <div className="space-y-1.5">
            {changeList.map((c) => (
              <div key={c.attr} className="flex items-center gap-2 text-xs" data-testid={`program-change-${c.attr}`}>
                <span
                  className={`inline-flex items-center gap-0.5 font-pixel text-[9px] px-1.5 py-0.5 rounded border ${
                    c.delta > 0
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {c.delta > 0 ? "▲" : "▼"}{Math.abs(c.delta)}
                </span>
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground truncate">{c.reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link href={`/league/${league.id}/program/${myTeam.id}`}>
              <RetroButton variant="outline" size="sm" data-testid="button-program-changes-view-profile">
                <Zap className="w-3 h-3 mr-1" />
                View Program Profile
              </RetroButton>
            </Link>
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

export function OffseasonSummary({ league, myTeam }: { league: LeagueDetails; myTeam: TeamWithCoach | undefined | null }) {
  const isOffseasonPhase = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"].includes(league.currentPhase);

  const { data: historyData } = useQuery<{
    history: { departureType: string; teamId: string; position: string; firstName: string; lastName: string; overall: number; departedSeason: number }[];
  }>({
    queryKey: ["/api/leagues", league.id, "player-history"],
    enabled: isOffseasonPhase && league.currentPhase !== "offseason_departures",
  });

  const { data: pendingData } = useQuery<{
    teams: Record<string, { graduates: any[]; draftDeclarations: any[]; transfers: any[]; totalLeaving: number }>;
  }>({
    queryKey: ["/api/leagues", league.id, "players-leaving"],
    enabled: isOffseasonPhase && league.currentPhase === "offseason_departures",
  });

  const { data: signingDayData } = useQuery<SigningDayData>({
    queryKey: ["/api/leagues", league.id, "signing-day"],
    enabled: isOffseasonPhase && league.currentPhase === "offseason_signing_day",
  });

  if (!isOffseasonPhase) return null;
  if (!myTeam) return null;

  let graduated: any[] = [];
  let drafted: any[] = [];
  let transferred: any[] = [];
  let currentSeasonDepartures: any[] = [];

  if (league.currentPhase === "offseason_departures" && pendingData?.teams) {
    const teamData = Object.values(pendingData.teams).find((t: any) => t.teamId === myTeam.id) as any;
    if (teamData) {
      graduated = (teamData.graduates || []).map((p: any) => ({ ...p, departureType: "graduated" }));
      drafted = (teamData.draftDeclarations || []).map((p: any) => ({ ...p, departureType: "draft" }));
      transferred = (teamData.transfers || []).map((p: any) => ({ ...p, departureType: "transfer_portal" }));
      currentSeasonDepartures = [...graduated, ...drafted, ...transferred];
    }
  } else {
    currentSeasonDepartures = historyData?.history?.filter(
      h => h.teamId === myTeam.id && h.departedSeason === league.currentSeason
    ) || [];
    graduated = currentSeasonDepartures.filter(h => h.departureType === "graduated");
    drafted = currentSeasonDepartures.filter(h => h.departureType === "draft");
    transferred = currentSeasonDepartures.filter(h => h.departureType === "transfer_portal");
  }

  const phaseTitle = league.currentPhase === "offseason_departures" ? "PLAYERS LEAVING" 
    : league.currentPhase === "offseason_signing_day" ? "DECISION DAY"
    : league.currentPhase === "offseason_walkons" ? "CUTS & WALK-ONS"
    : league.currentPhase?.startsWith("offseason_recruiting") ? "OFFSEASON RECRUITING"
    : "OFFSEASON";

  const phaseIcon = league.currentPhase === "offseason_departures" ? <UserMinus className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_signing_day" ? <Award className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_walkons" ? <UserPlus className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : <ScrollText className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />;
  
  return (
    <RetroCard className="border-gold/30 mb-4" data-testid="offseason-summary">
      <div className="flex items-start gap-3">
        {phaseIcon}
        <div className="flex-1">
          <p className="font-pixel text-gold text-[10px] mb-2">{phaseTitle}</p>
          
          {(league.currentPhase === "offseason_departures" || (currentSeasonDepartures.length > 0 && league.currentPhase !== "offseason_signing_day")) && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{graduated.length}</p>
                  <p className="text-[9px] text-muted-foreground">Graduated</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{drafted.length}</p>
                  <p className="text-[9px] text-muted-foreground">MLB Draft</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{transferred.length}</p>
                  <p className="text-[9px] text-muted-foreground">Transfer Portal</p>
                </div>
              </div>
              {currentSeasonDepartures.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">DEPARTING PLAYERS</p>
                  <div className="flex flex-wrap gap-1">
                    {currentSeasonDepartures.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[8px]">
                        {p.firstName[0]}. {p.lastName} ({p.position}, {p.overall} OVR) - {p.departureType === "graduated" ? "Grad" : p.departureType === "draft" ? "MLB" : "Portal"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {league.currentPhase === "offseason_departures" && (
                <div className="mt-3">
                  <Link href={`/league/${league.id}/departures`}>
                    <RetroButton
                      variant="primary"
                      size="sm"
                      data-testid="button-view-departures"
                    >
                      Review Departures
                    </RetroButton>
                  </Link>
                </div>
              )}
            </div>
          )}

          {league.currentPhase?.startsWith("offseason_recruiting") && currentSeasonDepartures.length === 0 && (
            <p className="text-sm text-muted-foreground">
              The offseason recruiting period is underway. Visit the Recruiting Board to recruit unsigned players and check the Transfer Portal for available transfers.
            </p>
          )}

          {league.currentPhase === "offseason_walkons" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Finalize your roster by cutting players and signing walk-ons. All teams must be ready before advancing to the new season.
              </p>
              <Link href={`/league/${league.id}/walkons`}>
                <RetroButton variant="primary" size="sm" data-testid="button-walkons-page">
                  <UserPlus className="w-3 h-3 mr-1" />
                  Manage Walk-Ons
                </RetroButton>
              </Link>
            </div>
          )}

          {league.currentPhase === "offseason_signing_day" && signingDayData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gold/10 rounded p-2 text-center">
                  <p className="font-bold text-lg text-gold">{signingDayData.totalSigned}</p>
                  <p className="text-[9px] text-muted-foreground">Recruits Signed</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalUnsigned}</p>
                  <p className="text-[9px] text-muted-foreground">Unsigned</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalRecruits}</p>
                  <p className="text-[9px] text-muted-foreground">Total Class</p>
                </div>
                {signingDayData.transferPortal && (
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <p className="font-bold text-lg text-blue-400">{signingDayData.transferPortal.departed}</p>
                    <p className="text-[9px] text-muted-foreground">Portal Transfers</p>
                  </div>
                )}
              </div>
              
              <p className="text-[9px] text-muted-foreground mb-1">RECRUITING CLASS RANKINGS</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {signingDayData.teamSignings.map((team, rank) => (
                  <div key={team.teamId} className="flex items-center gap-2 p-2 rounded bg-muted/20" data-testid={`signing-day-team-${team.abbreviation}`}>
                    <span className="font-pixel text-gold text-xs w-6 text-center">#{rank + 1}</span>
                    <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} name={team.teamName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{team.teamName}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {team.recruits.map(r => (
                          <Badge key={r.id} variant="outline" className="text-[8px]">
                            {r.firstName[0]}. {r.lastName} ({r.position}) {"*".repeat(r.starRating || 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold">{team.totalRecruits}</p>
                      <p className="text-[8px] text-muted-foreground">Avg {team.avgRating}*</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/league/${league.id}/roster`}>
              <RetroButton variant="outline" size="sm" data-testid="button-offseason-roster">
                <Users className="w-3 h-3 mr-1" />
                View Roster
              </RetroButton>
            </Link>
            {league.currentPhase !== "offseason_signing_day" && league.currentPhase !== "offseason_walkons" && (
              <Link href={`/league/${league.id}/recruiting`}>
                <RetroButton variant="outline" size="sm" data-testid="button-offseason-recruiting">
                  <Target className="w-3 h-3 mr-1" />
                  Recruiting Board
                </RetroButton>
              </Link>
            )}
          </div>
        </div>
      </div>
    </RetroCard>
  );
}
