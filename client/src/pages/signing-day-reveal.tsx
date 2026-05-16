import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useSearch } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { RecruitCard } from "@/components/recruit-card";
import { ArrowLeft, Download, Trophy } from "lucide-react";

interface RevealRecruit {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  throwHand: string;
  batHand: string;
  homeState: string;
  hometown: string;
  starRating: number;
  overall: number;
  classRank: number;
  positionRank: number;
  recruitType: string;
  recruitYear: string;
  isBlueChip?: boolean;
  isGem?: boolean;
  isBust?: boolean;
  isGenerationalGem?: boolean;
  isGenerationalBust?: boolean;
  gemBustRevealed?: boolean;
  potential?: number | null;
  abilities?: string[];
  hitForAvg?: number | null;
  power?: number | null;
  speed?: number | null;
  arm?: number | null;
  fielding?: number | null;
  errorResistance?: number | null;
  clutch?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  recovery?: number | null;
  catcherAbility?: number | null;
  vsLHP?: number | null;
  grit?: number | null;
  velocity?: number | null;
  control?: number | null;
  stamina?: number | null;
  stuff?: number | null;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  heater?: number | null;
  agile?: number | null;
  skinTone?: string;
}

interface TeamEntry {
  team: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    conference?: string;
    prestige: number;
    isCpu: boolean;
  };
  recruits: RevealRecruit[];
}

interface RevealData {
  league: { id: string; name: string; currentSeason: number };
  teamData: TeamEntry[];
  allTeams: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    isCpu: boolean;
  }[];
}

function getClassScore(recruits: RevealRecruit[]): number {
  if (!recruits.length) return 0;
  const avg = recruits.reduce((s, r) => s + r.overall, 0) / recruits.length;
  const avgStars = recruits.reduce((s, r) => s + r.starRating, 0) / recruits.length;
  const fiveStars = recruits.filter(r => r.starRating === 5).length;
  const fourStars = recruits.filter(r => r.starRating >= 4).length;
  return (avgStars * 20) + (avg / 50) + (fiveStars * 15) + (fourStars * 5) + (recruits.length * 3);
}

export default function SigningDayRevealPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialTeamId = params.get("teamId") ?? undefined;
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(initialTeamId);
  const [isDownloading, setIsDownloading] = useState(false);
  const cardGridRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<RevealData>({
    queryKey: ["/api/leagues", leagueId, "signing-day-reveal", selectedTeamId],
    queryFn: async () => {
      const url = selectedTeamId
        ? `/api/leagues/${leagueId}/signing-day-reveal?teamId=${selectedTeamId}`
        : `/api/leagues/${leagueId}/signing-day-reveal`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch reveal data");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const handleDownload = async () => {
    if (!cardGridRef.current || !currentEntry) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardGridRef.current, {
        backgroundColor: "#0a1a0a",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `${currentEntry.team.abbreviation}-class-${data?.league.currentSeason ?? "season"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const currentEntry = data?.teamData?.[0] ?? null;
  const activeTeamId = selectedTeamId ?? currentEntry?.team.id;

  if (isLoading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-40 h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link href={`/league/${leagueId}/commits`}>
          <RetroButton variant="outline" size="sm" data-testid="button-back-to-commits">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Commits
          </RetroButton>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-pixel text-lg text-[#C4A35A] leading-tight">SIGNING DAY REVEAL</h1>
          <p className="text-xs text-gray-400">
            Season {data?.league.currentSeason} · Click any card to flip it
          </p>
        </div>
        {currentEntry && (
          <RetroButton
            variant="primary"
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading}
            data-testid="button-download-class-photo"
          >
            <Download className="w-4 h-4 mr-1" />
            {isDownloading ? "Saving..." : "Download Class Photo"}
          </RetroButton>
        )}
      </div>

      {/* Team selector */}
      {data && data.allTeams.length > 1 && (
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-2 font-pixel">SELECT TEAM</p>
          <div className="flex flex-wrap gap-2">
            {data.allTeams.map(team => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                data-testid={`team-selector-${team.abbreviation}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all text-xs"
                style={{
                  borderColor: activeTeamId === team.id ? team.primaryColor : "#2d3d2d",
                  background: activeTeamId === team.id ? `${team.primaryColor}22` : "transparent",
                  color: activeTeamId === team.id ? "#ffffff" : "#9ca3af",
                }}
              >
                <TeamBadge
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  size="sm"
                />
                <span className="hidden sm:inline">{team.name}</span>
                <span className="sm:hidden">{team.abbreviation}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active team class display */}
      {currentEntry ? (
        <div>
          {/* Team header */}
          <div
            ref={cardGridRef}
            className="rounded-lg p-4"
            style={{ background: "#0d1f0d" }}
          >
            {/* Watermark header (included in download) */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#2d3d2d]">
              <TeamBadge
                abbreviation={currentEntry.team.abbreviation}
                primaryColor={currentEntry.team.primaryColor}
                secondaryColor={currentEntry.team.secondaryColor}
                name={currentEntry.team.name}
                size="lg"
              />
              <div>
                <div className="font-pixel text-sm text-[#C4A35A]">{currentEntry.team.name}</div>
                {currentEntry.team.conference && (
                  <div className="text-xs text-gray-400">{currentEntry.team.conference}</div>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-[#C4A35A]" />
                    Season {data.league.currentSeason} Signing Class
                  </span>
                  <span>{currentEntry.recruits.length} commits</span>
                  {currentEntry.recruits.length > 0 && (
                    <span className="text-[#C4A35A]">
                      Score: {getClassScore(currentEntry.recruits).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card grid */}
            {currentEntry.recruits.length === 0 ? (
              <div className="text-center text-gray-500 py-16">
                <p className="font-pixel text-sm">No commits yet</p>
                <p className="text-xs mt-2">Recruits will appear here once they sign</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 justify-start">
                {currentEntry.recruits
                  .sort((a, b) => b.overall - a.overall)
                  .map((recruit, idx) => (
                    <RecruitCard
                      key={recruit.id}
                      recruit={recruit}
                      primaryColor={currentEntry.team.primaryColor}
                      secondaryColor={currentEntry.team.secondaryColor}
                      animationDelay={idx * 0.06}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Class summary stats below cards (not in download) */}
          {currentEntry.recruits.length > 0 && (
            <RetroCard className="mt-4">
              <RetroCardContent className="py-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  {[
                    { label: "Total", value: currentEntry.recruits.length },
                    { label: "5-Star", value: currentEntry.recruits.filter(r => r.starRating === 5).length },
                    { label: "4-Star", value: currentEntry.recruits.filter(r => r.starRating === 4).length },
                    { label: "3-Star", value: currentEntry.recruits.filter(r => r.starRating === 3).length },
                    { label: "Avg OVR", value: Math.round(currentEntry.recruits.reduce((s, r) => s + r.overall, 0) / currentEntry.recruits.length) },
                    { label: "Blue Chips", value: currentEntry.recruits.filter(r => r.isBlueChip).length },
                    { label: "Transfers", value: currentEntry.recruits.filter(r => r.recruitType === "TRANSFER").length },
                    { label: "JUCO", value: currentEntry.recruits.filter(r => r.recruitType === "JUCO").length },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center min-w-[48px]">
                      <span className="font-pixel text-lg text-white">{value}</span>
                      <span className="text-[10px] text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </RetroCardContent>
            </RetroCard>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-16">
          <p className="font-pixel text-sm">No team data available</p>
          <p className="text-xs mt-2">Select a team above to view their signing class</p>
        </div>
      )}
    </div>
  );
}
