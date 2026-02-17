import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pause, Play, FastForward } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SpeedMode = "pause" | "slow" | "fast";

interface LineupPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  order: number;
  contact: number;
  power: number;
  speed: number;
  fielding: number;
}

interface PitcherInfo {
  playerId: string;
  firstName: string;
  lastName: string;
  stuff: number;
  control: number;
  velocity: number;
}

interface AtBat {
  batterIndex: number;
  batterName: string;
  pitchSequence: string[];
  result: string;
  description: string;
  runnersAfter: boolean[];
  runsScored: number;
  outs: number;
}

interface HalfInning {
  atBats: AtBat[];
  runs: number;
  hits: number;
  errors: number;
}

interface Inning {
  inning: number;
  topHalf: HalfInning;
  bottomHalf: HalfInning;
}

interface BattingStat {
  playerId: string;
  name: string;
  position: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  avg: string;
}

interface PitchingStat {
  playerId: string;
  name: string;
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  era: string;
}

interface TeamInfo {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
}

interface PlayByPlayData {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
  homePitcher: PitcherInfo;
  awayPitcher: PitcherInfo;
  innings: Inning[];
  finalScore: { home: number; away: number };
  homeBatting: BattingStat[];
  awayBatting: BattingStat[];
  homePitching: PitchingStat[];
  awayPitching: PitchingStat[];
}

export default function PlayByPlayPage() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [speed, setSpeed] = useState<SpeedMode>("pause");
  const [currentInning, setCurrentInning] = useState(0);
  const [currentHalf, setCurrentHalf] = useState<"top" | "bottom">("top");
  const [currentAtBatIndex, setCurrentAtBatIndex] = useState(0);
  const [currentPitchIndex, setCurrentPitchIndex] = useState(-1);
  const [gameOver, setGameOver] = useState(false);
  const [showBoxScore, setShowBoxScore] = useState(false);
  const [runningHomeScore, setRunningHomeScore] = useState(0);
  const [runningAwayScore, setRunningAwayScore] = useState(0);
  const [currentBases, setCurrentBases] = useState<boolean[]>([false, false, false]);
  const [currentOuts, setCurrentOuts] = useState(0);
  const [displayedDescription, setDisplayedDescription] = useState("");
  const [inningScores, setInningScores] = useState<{ away: number[]; home: number[] }>({ away: [], home: [] });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef<SpeedMode>(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const { data: pbpData, isLoading, error } = useQuery<PlayByPlayData>({
    queryKey: ["/api/leagues", id, "games", gameId, "play-by-play"],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/games/${gameId}/play-by-play`);
      return res.json();
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!pbpData) throw new Error("No play-by-play data");
      const res = await apiRequest("POST", `/api/leagues/${id}/games/${gameId}/finalize-play-by-play`, {
        homeScore: pbpData.finalScore.home,
        awayScore: pbpData.finalScore.away,
        homeBatting: pbpData.homeBatting,
        awayBatting: pbpData.awayBatting,
        homePitching: pbpData.homePitching,
        awayPitching: pbpData.awayPitching,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({ title: "Game saved!" });
      setLocation(`/league/${id}/schedule`);
    },
    onError: (err: Error) => {
      toast({ title: "Error saving game", description: err.message, variant: "destructive" });
    },
  });

  const getCurrentAtBat = useCallback((): AtBat | null => {
    if (!pbpData) return null;
    const inning = pbpData.innings[currentInning];
    if (!inning) return null;
    const half = currentHalf === "top" ? inning.topHalf : inning.bottomHalf;
    return half.atBats[currentAtBatIndex] || null;
  }, [pbpData, currentInning, currentHalf, currentAtBatIndex]);

  const advanceToNextAtBat = useCallback(() => {
    if (!pbpData) return;
    const inning = pbpData.innings[currentInning];
    if (!inning) return;
    const half = currentHalf === "top" ? inning.topHalf : inning.bottomHalf;
    const atBat = half.atBats[currentAtBatIndex];

    if (atBat) {
      setCurrentBases(atBat.runnersAfter);
      setCurrentOuts(atBat.outs);
      if (currentHalf === "top") {
        setRunningAwayScore(prev => prev + atBat.runsScored);
      } else {
        setRunningHomeScore(prev => prev + atBat.runsScored);
      }
      setDisplayedDescription(atBat.description);
    }

    const nextAtBatIndex = currentAtBatIndex + 1;
    if (nextAtBatIndex < half.atBats.length) {
      setCurrentAtBatIndex(nextAtBatIndex);
      setCurrentPitchIndex(-1);
    } else {
      if (currentHalf === "top") {
        setInningScores(prev => ({
          ...prev,
          away: [...prev.away.slice(0, currentInning), inning.topHalf.runs],
        }));
      } else {
        setInningScores(prev => ({
          ...prev,
          home: [...prev.home.slice(0, currentInning), inning.bottomHalf.runs],
        }));
      }

      if (currentHalf === "top") {
        setCurrentHalf("bottom");
        setCurrentAtBatIndex(0);
        setCurrentPitchIndex(-1);
        setCurrentOuts(0);
        setCurrentBases([false, false, false]);
        setDisplayedDescription("");
      } else {
        const nextInning = currentInning + 1;
        if (nextInning < pbpData.innings.length) {
          setCurrentInning(nextInning);
          setCurrentHalf("top");
          setCurrentAtBatIndex(0);
          setCurrentPitchIndex(-1);
          setCurrentOuts(0);
          setCurrentBases([false, false, false]);
          setDisplayedDescription("");
        } else {
          setGameOver(true);
          setRunningHomeScore(pbpData.finalScore.home);
          setRunningAwayScore(pbpData.finalScore.away);
          setSpeed("pause");
        }
      }
    }
  }, [pbpData, currentInning, currentHalf, currentAtBatIndex]);

  const advancePitch = useCallback(() => {
    const atBat = getCurrentAtBat();
    if (!atBat) return;

    const nextPitch = currentPitchIndex + 1;
    if (nextPitch < atBat.pitchSequence.length) {
      setCurrentPitchIndex(nextPitch);
      if (nextPitch === atBat.pitchSequence.length - 1) {
        setTimeout(() => advanceToNextAtBat(), 800);
      }
    } else {
      advanceToNextAtBat();
    }
  }, [getCurrentAtBat, currentPitchIndex, advanceToNextAtBat]);

  const advanceHalfInning = useCallback(() => {
    if (!pbpData) return;
    const inning = pbpData.innings[currentInning];
    if (!inning) return;
    const half = currentHalf === "top" ? inning.topHalf : inning.bottomHalf;

    for (const atBat of half.atBats) {
      if (currentHalf === "top") {
        setRunningAwayScore(prev => prev + atBat.runsScored);
      } else {
        setRunningHomeScore(prev => prev + atBat.runsScored);
      }
    }

    const lastAtBat = half.atBats[half.atBats.length - 1];
    if (lastAtBat) {
      setDisplayedDescription(lastAtBat.description);
      setCurrentBases(lastAtBat.runnersAfter);
      setCurrentOuts(lastAtBat.outs);
    }

    if (currentHalf === "top") {
      setInningScores(prev => ({
        ...prev,
        away: [...prev.away.slice(0, currentInning), inning.topHalf.runs],
      }));
      setCurrentHalf("bottom");
      setCurrentAtBatIndex(0);
      setCurrentPitchIndex(-1);
      setCurrentOuts(0);
      setCurrentBases([false, false, false]);
    } else {
      setInningScores(prev => ({
        ...prev,
        home: [...prev.home.slice(0, currentInning), inning.bottomHalf.runs],
      }));
      const nextInning = currentInning + 1;
      if (nextInning < pbpData.innings.length) {
        setCurrentInning(nextInning);
        setCurrentHalf("top");
        setCurrentAtBatIndex(0);
        setCurrentPitchIndex(-1);
        setCurrentOuts(0);
        setCurrentBases([false, false, false]);
        setDisplayedDescription("");
      } else {
        setGameOver(true);
        setRunningHomeScore(pbpData.finalScore.home);
        setRunningAwayScore(pbpData.finalScore.away);
        setSpeed("pause");
      }
    }
  }, [pbpData, currentInning, currentHalf]);

  useEffect(() => {
    if (!pbpData || gameOver) return;
    if (speed === "pause") {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const tick = () => {
      if (speedRef.current === "pause") return;
      if (speedRef.current === "slow") {
        advancePitch();
        timerRef.current = setTimeout(tick, 1500 + Math.random() * 1000);
      } else if (speedRef.current === "fast") {
        advanceHalfInning();
        timerRef.current = setTimeout(tick, 600);
      }
    };

    timerRef.current = setTimeout(tick, speed === "slow" ? 1500 : 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [speed, pbpData, gameOver, advancePitch, advanceHalfInning]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full mx-auto mb-4" />
          <p className="font-pixel text-gold text-xs">Generating play-by-play...</p>
        </div>
      </div>
    );
  }

  if (error || !pbpData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="font-pixel text-red-400 text-xs mb-4">Failed to generate play-by-play</p>
          <p className="text-muted-foreground text-sm mb-4">{(error as Error)?.message || "Unknown error"}</p>
          <RetroButton variant="outline" onClick={() => setLocation(`/league/${id}/schedule`)} data-testid="button-back-schedule">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Schedule
          </RetroButton>
        </div>
      </div>
    );
  }

  const currentAtBat = getCurrentAtBat();
  const battingTeam = currentHalf === "top" ? pbpData.awayTeam : pbpData.homeTeam;
  const pitchingTeam = currentHalf === "top" ? pbpData.homeTeam : pbpData.awayTeam;
  const currentLineup = currentHalf === "top" ? pbpData.awayLineup : pbpData.homeLineup;
  const currentPitcher = currentHalf === "top" ? pbpData.homePitcher : pbpData.awayPitcher;

  const pitchBalls = currentAtBat ? currentAtBat.pitchSequence.slice(0, currentPitchIndex + 1).filter(p => p === "ball").length : 0;
  let pitchStrikes = 0;
  if (currentAtBat) {
    let s = 0;
    for (let i = 0; i <= currentPitchIndex && i < currentAtBat.pitchSequence.length; i++) {
      const p = currentAtBat.pitchSequence[i];
      if (p === "strike") { s++; }
      else if (p === "foul" && s < 2) { s++; }
    }
    pitchStrikes = s;
  }

  if (showBoxScore) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-pixel text-gold text-sm">Final Box Score</h1>
            <RetroButton variant="outline" size="sm" onClick={() => setShowBoxScore(false)} data-testid="button-back-to-game">
              Back to Game
            </RetroButton>
          </div>
          <BoxScoreView data={pbpData} inningScores={inningScores} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="play-by-play-page">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <RetroButton variant="ghost" size="sm" onClick={() => setLocation(`/league/${id}/schedule`)} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </RetroButton>
        <h1 className="font-pixel text-gold text-[10px] sm:text-xs">Play by Play</h1>
        <div className="flex gap-1 mr-14">
          <RetroButton
            variant={speed === "pause" ? "primary" : "outline"}
            size="sm"
            onClick={() => setSpeed("pause")}
            data-testid="button-speed-pause"
            title="Pause"
          >
            <Pause className="w-3 h-3" />
          </RetroButton>
          <RetroButton
            variant={speed === "slow" ? "primary" : "outline"}
            size="sm"
            onClick={() => setSpeed("slow")}
            data-testid="button-speed-slow"
            title="Slow (at-bat by at-bat)"
          >
            <Play className="w-3 h-3" />
          </RetroButton>
          <RetroButton
            variant={speed === "fast" ? "primary" : "outline"}
            size="sm"
            onClick={() => setSpeed("fast")}
            data-testid="button-speed-fast"
            title="Fast (half-inning by half-inning)"
          >
            <FastForward className="w-3 h-3" />
          </RetroButton>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0">
          <div className="hidden lg:flex flex-col w-56 border-r border-border p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} size="sm" />
              <span className="font-pixel text-[9px] text-foreground truncate">{pbpData.awayTeam.name}</span>
            </div>
            <div className="space-y-0.5">
              {pbpData.awayLineup.map((p, i) => (
                <div
                  key={p.playerId}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                    currentHalf === "top" && currentAtBat?.batterIndex === i
                      ? "bg-gold/20 text-gold border border-gold/40"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`away-lineup-${i}`}
                >
                  <span className="w-3 text-center font-pixel text-[8px]">{i + 1}</span>
                  <span className="w-6 text-[8px] font-pixel text-gold/70">{p.position}</span>
                  <span className="truncate">{p.lastName}</span>
                </div>
              ))}
              <div className="border-t border-border/50 mt-2 pt-2 px-2">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-3 text-center font-pixel text-[8px]">P</span>
                  <span className="w-6 text-[8px] font-pixel text-gold/70">P</span>
                  <span className="truncate">{pbpData.awayPitcher.lastName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
            <div className="flex items-center gap-6 sm:gap-10">
              <div className="flex flex-col items-center gap-1">
                <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} size="md" />
                <span className="font-pixel text-[8px] text-muted-foreground">{pbpData.awayTeam.abbreviation}</span>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-4">
                  <span className="font-pixel text-3xl sm:text-5xl text-foreground" data-testid="score-away">{runningAwayScore}</span>
                  <span className="font-pixel text-xl text-muted-foreground">-</span>
                  <span className="font-pixel text-3xl sm:text-5xl text-foreground" data-testid="score-home">{runningHomeScore}</span>
                </div>
                <div className="mt-2">
                  {gameOver ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-pixel text-[9px]">FINAL</Badge>
                  ) : (
                    <span className="font-pixel text-[10px] text-gold" data-testid="inning-display">
                      {currentHalf === "top" ? "\u25B2" : "\u25BC"} {currentInning + 1}{getOrdinal(currentInning + 1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} size="md" />
                <span className="font-pixel text-[8px] text-muted-foreground">{pbpData.homeTeam.abbreviation}</span>
              </div>
            </div>

            <DiamondView bases={currentBases} />

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <span className="font-pixel text-[8px] text-muted-foreground">B-S-O</span>
                <div className="flex gap-2">
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3].map(i => (
                      <div key={`b${i}`} className={`w-2.5 h-2.5 rounded-full border ${i < pitchBalls ? "bg-green-400 border-green-500" : "border-border bg-muted/30"}`} />
                    ))}
                  </div>
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <div key={`s${i}`} className={`w-2.5 h-2.5 rounded-full border ${i < pitchStrikes ? "bg-yellow-400 border-yellow-500" : "border-border bg-muted/30"}`} />
                    ))}
                  </div>
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <div key={`o${i}`} className={`w-2.5 h-2.5 rounded-full border ${i < currentOuts ? "bg-red-400 border-red-500" : "border-border bg-muted/30"}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {!gameOver && currentAtBat && (
              <div className="text-center mt-2">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[8px] font-pixel">{currentLineup[currentAtBat.batterIndex]?.position}</Badge>
                  <span className="font-pixel text-[10px] text-gold">{currentAtBat.batterName}</span>
                </div>
                <span className="text-[9px] text-muted-foreground">vs {currentPitcher.firstName[0]}. {currentPitcher.lastName}</span>
              </div>
            )}

            {displayedDescription && (
              <div className="bg-card/80 border border-border rounded px-4 py-2 max-w-sm text-center" data-testid="play-description">
                <p className="text-sm text-foreground">{displayedDescription}</p>
              </div>
            )}

            {gameOver && (
              <div className="flex flex-col items-center gap-3 mt-4">
                <RetroButton onClick={() => setShowBoxScore(true)} variant="outline" data-testid="button-view-box-score">
                  View Box Score
                </RetroButton>
                <RetroButton
                  onClick={() => finalizeMutation.mutate()}
                  disabled={finalizeMutation.isPending}
                  data-testid="button-end-game"
                >
                  {finalizeMutation.isPending ? "Saving..." : "End Game"}
                </RetroButton>
              </div>
            )}
          </div>

          <div className="hidden lg:flex flex-col w-56 border-l border-border p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} size="sm" />
              <span className="font-pixel text-[9px] text-foreground truncate">{pbpData.homeTeam.name}</span>
            </div>
            <div className="space-y-0.5">
              {pbpData.homeLineup.map((p, i) => (
                <div
                  key={p.playerId}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                    currentHalf === "bottom" && currentAtBat?.batterIndex === i
                      ? "bg-gold/20 text-gold border border-gold/40"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`home-lineup-${i}`}
                >
                  <span className="w-3 text-center font-pixel text-[8px]">{i + 1}</span>
                  <span className="w-6 text-[8px] font-pixel text-gold/70">{p.position}</span>
                  <span className="truncate">{p.lastName}</span>
                </div>
              ))}
              <div className="border-t border-border/50 mt-2 pt-2 px-2">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-3 text-center font-pixel text-[8px]">P</span>
                  <span className="w-6 text-[8px] font-pixel text-gold/70">P</span>
                  <span className="truncate">{pbpData.homePitcher.lastName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:hidden border-t border-border px-4 py-2">
          <div className="flex gap-4 overflow-x-auto">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} size="sm" />
                <span className="font-pixel text-[7px] truncate">{pbpData.awayTeam.abbreviation}</span>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {pbpData.awayLineup.slice(0, 9).map((p, i) => (
                  <span key={p.playerId} className={`text-[8px] ${
                    currentHalf === "top" && currentAtBat?.batterIndex === i ? "text-gold font-bold" : "text-muted-foreground"
                  }`}>
                    {i + 1}.{p.lastName}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} size="sm" />
                <span className="font-pixel text-[7px] truncate">{pbpData.homeTeam.abbreviation}</span>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {pbpData.homeLineup.slice(0, 9).map((p, i) => (
                  <span key={p.playerId} className={`text-[8px] ${
                    currentHalf === "bottom" && currentAtBat?.batterIndex === i ? "text-gold font-bold" : "text-muted-foreground"
                  }`}>
                    {i + 1}.{p.lastName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] font-pixel" data-testid="linescore-table">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-1.5 text-muted-foreground w-24">TEAM</th>
                  {pbpData.innings.map((_, i) => (
                    <th key={i} className={`text-center px-1.5 py-1.5 w-6 ${i === currentInning && !gameOver ? "text-gold" : "text-muted-foreground"}`}>{i + 1}</th>
                  ))}
                  <th className="text-center px-2 py-1.5 text-gold border-l border-border">R</th>
                  <th className="text-center px-2 py-1.5 text-muted-foreground">H</th>
                  <th className="text-center px-2 py-1.5 text-muted-foreground">E</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-1.5 text-foreground">{pbpData.awayTeam.abbreviation}</td>
                  {pbpData.innings.map((inn, i) => (
                    <td key={i} className={`text-center px-1.5 py-1.5 ${i < inningScores.away.length ? "text-foreground" : "text-muted-foreground/30"}`}>
                      {i < inningScores.away.length ? inningScores.away[i] : "-"}
                    </td>
                  ))}
                  <td className="text-center px-2 py-1.5 text-gold font-bold border-l border-border">{runningAwayScore}</td>
                  <td className="text-center px-2 py-1.5">{pbpData.innings.slice(0, inningScores.away.length).reduce((s, inn) => s + inn.topHalf.hits, 0)}</td>
                  <td className="text-center px-2 py-1.5">{pbpData.innings.slice(0, inningScores.away.length).reduce((s, inn) => s + inn.topHalf.errors, 0)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-foreground">{pbpData.homeTeam.abbreviation}</td>
                  {pbpData.innings.map((inn, i) => (
                    <td key={i} className={`text-center px-1.5 py-1.5 ${i < inningScores.home.length ? "text-foreground" : "text-muted-foreground/30"}`}>
                      {i < inningScores.home.length ? inningScores.home[i] : "-"}
                    </td>
                  ))}
                  <td className="text-center px-2 py-1.5 text-gold font-bold border-l border-border">{runningHomeScore}</td>
                  <td className="text-center px-2 py-1.5">{pbpData.innings.slice(0, inningScores.home.length).reduce((s, inn) => s + inn.bottomHalf.hits, 0)}</td>
                  <td className="text-center px-2 py-1.5">{pbpData.innings.slice(0, inningScores.home.length).reduce((s, inn) => s + inn.bottomHalf.errors, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiamondView({ bases }: { bases: boolean[] }) {
  return (
    <div className="relative w-32 h-32 sm:w-40 sm:h-40" data-testid="diamond-view">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <polygon points="50,15 85,50 50,85 15,50" fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" />
        <line x1="50" y1="85" x2="50" y2="95" stroke="hsl(var(--border))" strokeWidth="1.5" />

        <polygon points="50,15 85,50 50,50" fill="hsl(var(--muted) / 0.3)" stroke="none" />
        <polygon points="50,15 15,50 50,50" fill="hsl(var(--muted) / 0.3)" stroke="none" />
        <polygon points="15,50 50,85 50,50" fill="hsl(var(--muted) / 0.15)" stroke="none" />
        <polygon points="85,50 50,85 50,50" fill="hsl(var(--muted) / 0.15)" stroke="none" />

        <rect x="46" y="81" width="8" height="8" fill="hsl(var(--foreground))" transform="rotate(45,50,85)" />

        <rect x="81" y="46" width="8" height="8"
          fill={bases[0] ? "hsl(43, 74%, 49%)" : "hsl(var(--muted) / 0.5)"}
          stroke={bases[0] ? "hsl(43, 74%, 60%)" : "hsl(var(--border))"}
          strokeWidth="1"
          transform="rotate(45,85,50)"
        />
        <rect x="46" y="11" width="8" height="8"
          fill={bases[1] ? "hsl(43, 74%, 49%)" : "hsl(var(--muted) / 0.5)"}
          stroke={bases[1] ? "hsl(43, 74%, 60%)" : "hsl(var(--border))"}
          strokeWidth="1"
          transform="rotate(45,50,15)"
        />
        <rect x="11" y="46" width="8" height="8"
          fill={bases[2] ? "hsl(43, 74%, 49%)" : "hsl(var(--muted) / 0.5)"}
          stroke={bases[2] ? "hsl(43, 74%, 60%)" : "hsl(var(--border))"}
          strokeWidth="1"
          transform="rotate(45,15,50)"
        />
      </svg>
    </div>
  );
}

function BoxScoreView({ data, inningScores }: { data: PlayByPlayData; inningScores: { away: number[]; home: number[] } }) {
  return (
    <div className="space-y-6" data-testid="box-score-view">
      <div className="overflow-x-auto">
        <table className="w-full text-[9px] font-pixel border border-border">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="text-left px-3 py-2 text-muted-foreground">TEAM</th>
              {data.innings.map((_, i) => (
                <th key={i} className="text-center px-1.5 py-2 text-muted-foreground">{i + 1}</th>
              ))}
              <th className="text-center px-2 py-2 text-gold border-l border-border">R</th>
              <th className="text-center px-2 py-2 text-muted-foreground">H</th>
              <th className="text-center px-2 py-2 text-muted-foreground">E</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="px-3 py-2 text-foreground">{data.awayTeam.abbreviation}</td>
              {inningScores.away.map((s, i) => (
                <td key={i} className="text-center px-1.5 py-2">{s}</td>
              ))}
              <td className="text-center px-2 py-2 text-gold font-bold border-l border-border">{data.finalScore.away}</td>
              <td className="text-center px-2 py-2">{data.innings.reduce((s, inn) => s + inn.topHalf.hits, 0)}</td>
              <td className="text-center px-2 py-2">{data.innings.reduce((s, inn) => s + inn.topHalf.errors, 0)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-foreground">{data.homeTeam.abbreviation}</td>
              {inningScores.home.map((s, i) => (
                <td key={i} className="text-center px-1.5 py-2">{s}</td>
              ))}
              <td className="text-center px-2 py-2 text-gold font-bold border-l border-border">{data.finalScore.home}</td>
              <td className="text-center px-2 py-2">{data.innings.reduce((s, inn) => s + inn.bottomHalf.hits, 0)}</td>
              <td className="text-center px-2 py-2">{data.innings.reduce((s, inn) => s + inn.bottomHalf.errors, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-pixel text-[10px] text-gold mb-2 flex items-center gap-2">
            <TeamBadge abbreviation={data.awayTeam.abbreviation} primaryColor={data.awayTeam.primaryColor} secondaryColor={data.awayTeam.secondaryColor} size="sm" />
            {data.awayTeam.name} Batting
          </h3>
          <BattingTable stats={data.awayBatting} />
          <h3 className="font-pixel text-[10px] text-gold mt-4 mb-2">{data.awayTeam.name} Pitching</h3>
          <PitchingTable stats={data.awayPitching} />
        </div>
        <div>
          <h3 className="font-pixel text-[10px] text-gold mb-2 flex items-center gap-2">
            <TeamBadge abbreviation={data.homeTeam.abbreviation} primaryColor={data.homeTeam.primaryColor} secondaryColor={data.homeTeam.secondaryColor} size="sm" />
            {data.homeTeam.name} Batting
          </h3>
          <BattingTable stats={data.homeBatting} />
          <h3 className="font-pixel text-[10px] text-gold mt-4 mb-2">{data.homeTeam.name} Pitching</h3>
          <PitchingTable stats={data.homePitching} />
        </div>
      </div>
    </div>
  );
}

function BattingTable({ stats }: { stats: BattingStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[9px] border border-border">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="text-left px-2 py-1 text-muted-foreground">Player</th>
            <th className="text-left px-1 py-1 text-muted-foreground">Pos</th>
            <th className="text-center px-1 py-1 text-muted-foreground">AB</th>
            <th className="text-center px-1 py-1 text-muted-foreground">R</th>
            <th className="text-center px-1 py-1 text-muted-foreground">H</th>
            <th className="text-center px-1 py-1 text-muted-foreground">HR</th>
            <th className="text-center px-1 py-1 text-muted-foreground">RBI</th>
            <th className="text-center px-1 py-1 text-muted-foreground">BB</th>
            <th className="text-center px-1 py-1 text-muted-foreground">SO</th>
            <th className="text-center px-1 py-1 text-muted-foreground">AVG</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="px-2 py-1 text-foreground truncate max-w-[100px]">{s.name}</td>
              <td className="px-1 py-1 text-gold/70 font-pixel">{s.position}</td>
              <td className="text-center px-1 py-1">{s.ab}</td>
              <td className="text-center px-1 py-1">{s.r}</td>
              <td className="text-center px-1 py-1">{s.h}</td>
              <td className="text-center px-1 py-1">{s.hr}</td>
              <td className="text-center px-1 py-1">{s.rbi}</td>
              <td className="text-center px-1 py-1">{s.bb}</td>
              <td className="text-center px-1 py-1">{s.so}</td>
              <td className="text-center px-1 py-1 text-gold">{s.avg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({ stats }: { stats: PitchingStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[9px] border border-border">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="text-left px-2 py-1 text-muted-foreground">Pitcher</th>
            <th className="text-center px-1 py-1 text-muted-foreground">IP</th>
            <th className="text-center px-1 py-1 text-muted-foreground">H</th>
            <th className="text-center px-1 py-1 text-muted-foreground">R</th>
            <th className="text-center px-1 py-1 text-muted-foreground">ER</th>
            <th className="text-center px-1 py-1 text-muted-foreground">BB</th>
            <th className="text-center px-1 py-1 text-muted-foreground">SO</th>
            <th className="text-center px-1 py-1 text-muted-foreground">ERA</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="px-2 py-1 text-foreground truncate max-w-[100px]">{s.name}</td>
              <td className="text-center px-1 py-1">{s.ip}</td>
              <td className="text-center px-1 py-1">{s.h}</td>
              <td className="text-center px-1 py-1">{s.r}</td>
              <td className="text-center px-1 py-1">{s.er}</td>
              <td className="text-center px-1 py-1">{s.bb}</td>
              <td className="text-center px-1 py-1">{s.so}</td>
              <td className="text-center px-1 py-1 text-gold">{s.era}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getOrdinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}
