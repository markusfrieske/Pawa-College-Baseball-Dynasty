import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pause, Play, FastForward, MapPin, Star, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/player-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SpeedMode = "pause" | "slow" | "fast";

interface LineupPlayer {
  playerId: string;
  id?: string;
  firstName: string;
  lastName: string;
  position: string;
  order: number;
  contact: number;
  power: number;
  speed: number;
  fielding: number;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  headwear?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
  eyeBlack?: boolean;
  overall?: number;
  abilities?: string[];
}

interface PitcherInfo {
  playerId: string;
  id?: string;
  firstName: string;
  lastName: string;
  stuff: number;
  control: number;
  velocity: number;
  stamina: number;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  headwear?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
  eyeBlack?: boolean;
  overall?: number;
  abilities?: string[];
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
  mascot?: string;
}

interface GameInfo {
  week: number;
  season: number;
  gameType: string | null;
  gameTypeLabel: string;
  isConference: boolean;
  phase: string;
  venue: string;
}

interface TeamRecord {
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
}

interface ConfStanding {
  teamId: string;
  abbreviation: string;
  name: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
}

interface SeasonStatLine {
  games: number;
  ab: number; h: number; hr: number; rbi: number; bb: number; so: number; r: number;
  avg: string;
  pitchingGames: number;
  wins: number; losses: number;
  ipOuts: number; pHits: number; pEr: number; pBb: number; pSo: number;
  era: string;
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
  gameInfo?: GameInfo;
  teamRecords?: { home: TeamRecord; away: TeamRecord };
  conferenceInfo?: { homeName: string; awayName: string };
  conferenceStandings?: ConfStanding[];
  playerSeasonStats?: Record<string, SeasonStatLine>;
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
  const [runningHomeScore, setRunningHomeScore] = useState(0);
  const [runningAwayScore, setRunningAwayScore] = useState(0);
  const [runningAwayHits, setRunningAwayHits] = useState(0);
  const [runningHomeHits, setRunningHomeHits] = useState(0);
  const [runningAwayErrors, setRunningAwayErrors] = useState(0);
  const [runningHomeErrors, setRunningHomeErrors] = useState(0);
  const [currentBases, setCurrentBases] = useState<boolean[]>([false, false, false]);
  const [currentOuts, setCurrentOuts] = useState(0);
  const [displayedDescription, setDisplayedDescription] = useState("");
  const [inningScores, setInningScores] = useState<{ away: number[]; home: number[] }>({ away: [], home: [] });
  const [resultFlash, setResultFlash] = useState<{ text: string; type: "hit" | "out" | "walk" | "hr" | "error" } | null>(null);
  const [inningTransition, setInningTransition] = useState<string | null>(null);
  const [scorePulse, setScorePulse] = useState<"home" | "away" | null>(null);
  const [statsModalPlayer, setStatsModalPlayer] = useState<{
    name: string;
    position: string;
    type: "batter" | "pitcher";
    seasonStats?: SeasonStatLine;
    gameStats?: Record<string, number | string>;
    appearance?: { skinTone?: string; hairColor?: string; hairStyle?: string; headwear?: string; facialHair?: string; eyeStyle?: string; eyebrowStyle?: string; mouthStyle?: string; eyeBlack?: boolean };
    overall?: number;
    id?: string;
    team: TeamInfo;
  } | null>(null);
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
      toast({ title: "Error saving game", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const runningGameStats = useMemo(() => {
    if (!pbpData) return { batting: {} as Record<string, { ab: number; r: number; h: number; hr: number; rbi: number; bb: number; so: number }>, pitching: {} as Record<string, { outs: number; h: number; r: number; er: number; bb: number; so: number }> };
    const batting: Record<string, { ab: number; r: number; h: number; hr: number; rbi: number; bb: number; so: number }> = {};
    const pitching: Record<string, { outs: number; h: number; r: number; er: number; bb: number; so: number }> = {};

    const hitResults = ["single", "double", "triple", "homerun"];
    const outResults = ["strikeout", "groundout", "flyout", "lineout", "popout", "double_play", "fielders_choice", "sacrifice_fly"];

    for (let inn = 0; inn < pbpData.innings.length; inn++) {
      const inning = pbpData.innings[inn];
      for (const halfKey of ["topHalf", "bottomHalf"] as const) {
        const half = inning[halfKey];
        const isTop = halfKey === "topHalf";
        const lineup = isTop ? pbpData.awayLineup : pbpData.homeLineup;
        const pitcherLineup = isTop ? pbpData.homeLineup : pbpData.awayLineup;
        const currentPitcherId = isTop ? pbpData.homePitcher.playerId : pbpData.awayPitcher.playerId;

        for (let abIdx = 0; abIdx < half.atBats.length; abIdx++) {
          const isPastCurrentPosition = inn > currentInning ||
            (inn === currentInning && halfKey === "bottomHalf" && currentHalf === "top") ||
            (inn === currentInning && halfKey === (currentHalf === "top" ? "topHalf" : "bottomHalf") && abIdx >= currentAtBatIndex);
          if (isPastCurrentPosition) break;

          const ab = half.atBats[abIdx];
          const batter = lineup[ab.batterIndex];
          if (!batter) continue;
          const bId = batter.playerId;

          if (!batting[bId]) batting[bId] = { ab: 0, r: 0, h: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
          if (!pitching[currentPitcherId]) pitching[currentPitcherId] = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };

          const result = ab.result;
          // Non-batter events: skip all stat tracking
          const nonBatterEvents = ["pitching_change", "runner_placed", "stolen_base", "caught_stealing", "wild_pitch", "passed_ball"];
          if (nonBatterEvents.includes(result)) continue;

          const isHit = hitResults.includes(result);
          const isOut = outResults.includes(result);
          const noAb = result === "walk" || result === "hbp" || result === "sacrifice_fly" ||
            result === "intentional_walk" || result === "sacrifice_bunt";

          if (!noAb) batting[bId].ab++;
          if (isHit) {
            batting[bId].h++;
            pitching[currentPitcherId].h++;
          }
          if (result === "homerun") batting[bId].hr++;
          if (result === "walk" || result === "hbp" || result === "intentional_walk") {
            batting[bId].bb++;
            pitching[currentPitcherId].bb++;
          }
          if (result === "strikeout") {
            batting[bId].so++;
            pitching[currentPitcherId].so++;
          }
          batting[bId].rbi += ab.runsScored;
          pitching[currentPitcherId].r += ab.runsScored;
          pitching[currentPitcherId].er += ab.runsScored;

          if (isOut || result === "sacrifice_bunt") {
            const outsFromPlay = result === "double_play" ? 2 : 1;
            pitching[currentPitcherId].outs += outsFromPlay;
          }
        }
      }
    }
    return { batting, pitching };
  }, [pbpData, currentInning, currentHalf, currentAtBatIndex]);

  const getRunningBatterStats = useCallback((playerId: string) => {
    const s = runningGameStats.batting[playerId];
    if (!s) return undefined;
    if (s.ab === 0 && s.bb === 0) return undefined;
    return s;
  }, [runningGameStats]);

  const getRunningPitcherStats = useCallback((playerId: string) => {
    const s = runningGameStats.pitching[playerId];
    if (!s) return undefined;
    const outsToIP = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
    return { ...s, ip: outsToIP(s.outs) };
  }, [runningGameStats]);

  const getCurrentAtBat = useCallback((): AtBat | null => {
    if (!pbpData) return null;
    const inning = pbpData.innings[currentInning];
    if (!inning) return null;
    const half = currentHalf === "top" ? inning.topHalf : inning.bottomHalf;
    return half.atBats[currentAtBatIndex] || null;
  }, [pbpData, currentInning, currentHalf, currentAtBatIndex]);

  const showResultFlash = useCallback((result: string) => {
    const noFlash = ["pitching_change", "runner_placed", "wild_pitch", "passed_ball"];
    if (noFlash.includes(result)) return;
    const hitResults = ["single", "double", "triple"];
    const walkResults = ["walk", "hbp", "intentional_walk"];
    const labels: Record<string, string> = {
      single: "SINGLE", double: "DOUBLE", triple: "TRIPLE", homerun: "HOME RUN",
      strikeout: "K", groundout: "GROUND OUT", flyout: "FLY OUT", lineout: "LINE OUT",
      popout: "POP OUT", double_play: "DOUBLE PLAY", walk: "BB", hbp: "HBP",
      error: "ERROR", sacrifice_fly: "SAC FLY", fielders_choice: "FC",
      stolen_base: "SB", caught_stealing: "CS",
      intentional_walk: "IBB", sacrifice_bunt: "BUNT",
    };
    const type = result === "homerun" ? "hr" : hitResults.includes(result) ? "hit" :
      walkResults.includes(result) ? "walk" : result === "error" ? "error" :
      result === "stolen_base" ? "hit" :
      result === "sacrifice_bunt" ? "out" : "out";
    setResultFlash({ text: labels[result] || result.toUpperCase(), type });
    setTimeout(() => setResultFlash(null), 1200);
  }, []);

  const showInningTransition = useCallback((label: string) => {
    setInningTransition(label);
    setTimeout(() => setInningTransition(null), 1200);
  }, []);

  const triggerScorePulse = useCallback((side: "home" | "away") => {
    setScorePulse(side);
    setTimeout(() => setScorePulse(null), 800);
  }, []);

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
        if (atBat.runsScored > 0) triggerScorePulse("away");
      } else {
        setRunningHomeScore(prev => prev + atBat.runsScored);
        if (atBat.runsScored > 0) triggerScorePulse("home");
      }
      setDisplayedDescription(atBat.description);
      showResultFlash(atBat.result);

      const isHit = ["single", "double", "triple", "homerun"].includes(atBat.result);
      const isError = atBat.result === "error";
      if (isHit) {
        if (currentHalf === "top") setRunningAwayHits(prev => prev + 1);
        else setRunningHomeHits(prev => prev + 1);
      }
      if (isError) {
        if (currentHalf === "top") setRunningHomeErrors(prev => prev + 1);
        else setRunningAwayErrors(prev => prev + 1);
      }
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
        showInningTransition(`MID ${currentInning + 1}${getOrdinal(currentInning + 1)}`);
        setCurrentHalf("bottom");
        setCurrentAtBatIndex(0);
        setCurrentPitchIndex(-1);
        setCurrentOuts(0);
        setCurrentBases([false, false, false]);
        setDisplayedDescription("");
      } else {
        const nextInning = currentInning + 1;
        if (nextInning < pbpData.innings.length) {
          showInningTransition(`END ${currentInning + 1}${getOrdinal(currentInning + 1)}`);
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
          const totalAwayH = pbpData.innings.reduce((s, inn) => s + inn.topHalf.hits, 0);
          const totalHomeH = pbpData.innings.reduce((s, inn) => s + inn.bottomHalf.hits, 0);
          const totalAwayE = pbpData.innings.reduce((s, inn) => s + inn.topHalf.errors, 0);
          const totalHomeE = pbpData.innings.reduce((s, inn) => s + inn.bottomHalf.errors, 0);
          setRunningAwayHits(totalAwayH);
          setRunningHomeHits(totalHomeH);
          setRunningAwayErrors(totalAwayE);
          setRunningHomeErrors(totalHomeE);
          setSpeed("pause");
        }
      }
    }
  }, [pbpData, currentInning, currentHalf, currentAtBatIndex, showResultFlash, showInningTransition, triggerScorePulse]);

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
      const isHit = ["single", "double", "triple", "homerun"].includes(atBat.result);
      const isError = atBat.result === "error";
      if (isHit) {
        if (currentHalf === "top") setRunningAwayHits(prev => prev + 1);
        else setRunningHomeHits(prev => prev + 1);
      }
      if (isError) {
        if (currentHalf === "top") setRunningHomeErrors(prev => prev + 1);
        else setRunningAwayErrors(prev => prev + 1);
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
        const totalAwayH = pbpData.innings.reduce((s, inn) => s + inn.topHalf.hits, 0);
        const totalHomeH = pbpData.innings.reduce((s, inn) => s + inn.bottomHalf.hits, 0);
        const totalAwayE = pbpData.innings.reduce((s, inn) => s + inn.topHalf.errors, 0);
        const totalHomeE = pbpData.innings.reduce((s, inn) => s + inn.bottomHalf.errors, 0);
        setRunningAwayHits(totalAwayH);
        setRunningHomeHits(totalHomeH);
        setRunningAwayErrors(totalAwayE);
        setRunningHomeErrors(totalHomeE);
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
          <p className="text-gold text-sm">Generating play-by-play...</p>
        </div>
      </div>
    );
  }

  if (error || !pbpData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">Failed to generate play-by-play</p>
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

  const positionColor = (pos: string) => {
    if (pos === "P") return "bg-red-500";
    if (pos === "C") return "bg-blue-500";
    if (["1B", "2B", "3B", "SS"].includes(pos)) return "bg-yellow-500";
    if (pos === "DH") return "bg-gray-500";
    return "bg-green-500";
  };

  const getStarRating = (ovr: number) => {
    if (ovr >= 500) return 5;
    if (ovr >= 400) return 4;
    if (ovr >= 300) return 3;
    if (ovr >= 200) return 2;
    return 1;
  };

  const starColor = (stars: number) => {
    if (stars >= 5) return "text-yellow-300";
    if (stars >= 4) return "text-yellow-400";
    if (stars >= 3) return "text-yellow-500/70";
    return "text-muted-foreground";
  };

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

  const homeRecord = pbpData.teamRecords?.home;
  const awayRecord = pbpData.teamRecords?.away;

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="play-by-play-page">
      <header className="border-b border-border px-4 py-2 flex items-center justify-between gap-2">
        <RetroButton variant="ghost" size="sm" onClick={() => setLocation(`/league/${id}/schedule`)} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </RetroButton>
        <div className="flex items-center gap-2">
          {pbpData.gameInfo && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="text-xs" data-testid="text-venue">{pbpData.gameInfo.venue}</span>
              <span className="text-xs text-gold">|</span>
              <span className="text-xs" data-testid="text-week">Wk {pbpData.gameInfo.week}</span>
              <span className="text-xs text-gold">|</span>
              <span className="text-xs" data-testid="text-game-type">{pbpData.gameInfo.gameTypeLabel}</span>
            </div>
          )}
        </div>
        <div className="w-8" />
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0">
          <div className="hidden lg:flex flex-col w-56 xl:w-64 border-r border-border p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 px-1">
              <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} name={pbpData.awayTeam.name} size="sm" />
              <div className="min-w-0 flex-1">
                <span className="text-xs text-foreground truncate block">{pbpData.awayTeam.name}</span>
                {awayRecord && (
                  <span className="text-xs text-muted-foreground">({awayRecord.wins}-{awayRecord.losses})</span>
                )}
              </div>
            </div>
            <div className="space-y-0.5">
              {pbpData.awayLineup.map((p, i) => {
                const isActive = currentHalf === "top" && currentAtBat?.batterIndex === i;
                const stars = getStarRating(p.overall || 300);
                return (
                  <div
                    key={p.playerId}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                      isActive
                        ? "bg-gold/30 border border-gold/60 shadow-[0_0_6px_rgba(202,166,57,0.3)]"
                        : ""
                    }`}
                    data-testid={`away-lineup-${i}`}
                  >
                    <span className={`w-4 text-center text-xs ${isActive ? "text-gold" : "text-muted-foreground"}`}>{i + 1}</span>
                    <PlayerAvatar skinTone={p.skinTone} hairColor={p.hairColor} hairStyle={p.hairStyle} facialHair={p.facialHair || "none"} eyeStyle={p.eyeStyle || undefined} eyebrowStyle={p.eyebrowStyle || undefined} mouthStyle={p.mouthStyle || undefined} eyeBlack={p.eyeBlack ?? undefined} playerId={p.id} headwear={p.headwear} size="sm" jerseyColor={pbpData.awayTeam.primaryColor} className="w-6 h-6 shrink-0" />
                    <span className={`${positionColor(p.position)} text-white text-xs px-1 py-0.5 rounded leading-none min-w-[24px] text-center`}>{p.position}</span>
                    <span className={`text-xs truncate flex-1 ${isActive ? "text-gold font-bold" : "text-foreground"}`}>{p.lastName}</span>
                    <div className="flex items-center gap-0.5 shrink-0" title={`OVR: ${p.overall || 300}`}>
                      <Star className={`w-2.5 h-2.5 fill-current ${starColor(stars)}`} />
                      <span className="text-xs text-muted-foreground">{p.overall || 300}</span>
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-border/50 mt-1 pt-1 px-1.5">
                <div className="flex items-center gap-1">
                  <span className="w-4 text-center text-xs text-muted-foreground">P</span>
                  <PlayerAvatar skinTone={pbpData.awayPitcher.skinTone} hairColor={pbpData.awayPitcher.hairColor} hairStyle={pbpData.awayPitcher.hairStyle} facialHair={pbpData.awayPitcher.facialHair || "none"} eyeStyle={pbpData.awayPitcher.eyeStyle || undefined} eyebrowStyle={pbpData.awayPitcher.eyebrowStyle || undefined} mouthStyle={pbpData.awayPitcher.mouthStyle || undefined} eyeBlack={pbpData.awayPitcher.eyeBlack ?? undefined} playerId={pbpData.awayPitcher.id} headwear={pbpData.awayPitcher.headwear} size="sm" jerseyColor={pbpData.awayTeam.primaryColor} className="w-6 h-6 shrink-0" />
                  <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded leading-none min-w-[24px] text-center">P</span>
                  <span className="text-xs text-muted-foreground truncate">{pbpData.awayPitcher.lastName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`flex-1 flex flex-col items-center p-4 lg:p-5 gap-3 relative ${gameOver ? "overflow-y-auto" : ""}`}>
            <div className="flex items-center gap-6 sm:gap-10 lg:gap-14">
              <div className="flex items-center gap-3 lg:gap-5">
                <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} name={pbpData.awayTeam.name} size="lg" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase">{pbpData.awayTeam.abbreviation}</span>
                  {awayRecord && <span className="text-xs text-muted-foreground mb-1">({awayRecord.wins}-{awayRecord.losses})</span>}
                  <span className={`text-5xl sm:text-6xl lg:text-7xl text-foreground transition-transform duration-300 ${scorePulse === "away" ? "scale-110 text-gold" : ""}`} data-testid="score-away">{runningAwayScore}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                {gameOver ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">FINAL</Badge>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-xl text-gold" data-testid="inning-display">
                      {currentHalf === "top" ? "\u25B2" : "\u25BC"} {currentInning + 1}{getOrdinal(currentInning + 1)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 lg:gap-5">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase">{pbpData.homeTeam.abbreviation}</span>
                  {homeRecord && <span className="text-xs text-muted-foreground mb-1">({homeRecord.wins}-{homeRecord.losses})</span>}
                  <span className={`text-5xl sm:text-6xl lg:text-7xl text-foreground transition-transform duration-300 ${scorePulse === "home" ? "scale-110 text-gold" : ""}`} data-testid="score-home">{runningHomeScore}</span>
                </div>
                <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} name={pbpData.homeTeam.name} size="lg" />
              </div>
            </div>

            {!gameOver && (
              <div className="w-full flex flex-col items-center gap-3 mt-1">
                <div className="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 lg:gap-6 xl:gap-8">
                  <div className="hidden lg:block w-64 xl:w-72 shrink-0">
                    <PlayerCard
                      type="batter"
                      name={currentAtBat ? currentAtBat.batterName : ""}
                      position={currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.position ?? "") : ""}
                      stats={{
                        contact: currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.contact ?? 0) : 0,
                        power: currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.power ?? 0) : 0,
                        speed: currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.speed ?? 0) : 0,
                        fielding: currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.fielding ?? 0) : 0,
                      }}
                      gameStats={(() => {
                        if (!currentAtBat) return undefined;
                        const batter = currentLineup[currentAtBat.batterIndex];
                        if (!batter) return undefined;
                        return getRunningBatterStats(batter.playerId);
                      })()}
                      seasonStats={(() => {
                        if (!currentAtBat || !pbpData.playerSeasonStats) return undefined;
                        const batter = currentLineup[currentAtBat.batterIndex];
                        if (!batter) return undefined;
                        return pbpData.playerSeasonStats[batter.playerId];
                      })()}
                      team={battingTeam}
                      appearance={currentAtBat ? {
                        skinTone: currentLineup[currentAtBat.batterIndex]?.skinTone,
                        hairColor: currentLineup[currentAtBat.batterIndex]?.hairColor,
                        hairStyle: currentLineup[currentAtBat.batterIndex]?.hairStyle,
                        headwear: currentLineup[currentAtBat.batterIndex]?.headwear,
                      } : undefined}
                      overall={currentAtBat ? (currentLineup[currentAtBat.batterIndex]?.overall) : undefined}
                      onClickStats={() => {
                        if (!currentAtBat) return;
                        const batter = currentLineup[currentAtBat.batterIndex];
                        if (!batter) return;
                        const rStats = getRunningBatterStats(batter.playerId);
                        setStatsModalPlayer({
                          name: currentAtBat.batterName,
                          position: batter.position,
                          type: "batter",
                          seasonStats: pbpData.playerSeasonStats?.[batter.playerId],
                          gameStats: rStats ? { ...rStats, r: rStats.r } : undefined,
                          appearance: { skinTone: batter.skinTone, hairColor: batter.hairColor, hairStyle: batter.hairStyle, headwear: batter.headwear },
                          overall: batter.overall,
                          team: battingTeam,
                        });
                      }}
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="flex items-center gap-4 lg:gap-5">
                      <DiamondView bases={currentBases} />

                      <div className="border border-border rounded bg-card/80 px-3 py-2.5 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-400 w-3">B</span>
                          <div className="flex gap-1.5">
                            {[0, 1, 2, 3].map(i => (
                              <div key={`b${i}`} className={`w-4 h-4 rounded-full border ${i < pitchBalls ? "bg-green-400 border-green-500" : "border-border bg-muted/30"}`} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-yellow-400 w-3">S</span>
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map(i => (
                              <div key={`s${i}`} className={`w-4 h-4 rounded-full border ${i < pitchStrikes ? "bg-yellow-400 border-yellow-500" : "border-border bg-muted/30"}`} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400 w-3">O</span>
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map(i => (
                              <div key={`o${i}`} className={`w-4 h-4 rounded-full border ${i < currentOuts ? "bg-red-400 border-red-500" : "border-border bg-muted/30"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {currentAtBat && (
                      <div className="text-center bg-card/60 border border-border rounded px-5 py-2">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <PlayerAvatar
                            skinTone={currentLineup[currentAtBat.batterIndex]?.skinTone}
                            hairColor={currentLineup[currentAtBat.batterIndex]?.hairColor}
                            hairStyle={currentLineup[currentAtBat.batterIndex]?.hairStyle}
                            facialHair={currentLineup[currentAtBat.batterIndex]?.facialHair || "none"}
                            eyeStyle={currentLineup[currentAtBat.batterIndex]?.eyeStyle || undefined}
                            eyebrowStyle={currentLineup[currentAtBat.batterIndex]?.eyebrowStyle || undefined}
                            mouthStyle={currentLineup[currentAtBat.batterIndex]?.mouthStyle || undefined}
                            eyeBlack={currentLineup[currentAtBat.batterIndex]?.eyeBlack ?? undefined}
                            playerId={currentLineup[currentAtBat.batterIndex]?.id}
                            headwear={currentLineup[currentAtBat.batterIndex]?.headwear}
                            size="sm"
                            jerseyColor={battingTeam.primaryColor}
                            className="w-7 h-7 shrink-0"
                          />
                          <span className={`${positionColor(currentLineup[currentAtBat.batterIndex]?.position ?? "")} text-white text-xs px-1.5 py-0.5 rounded leading-none`}>{currentLineup[currentAtBat.batterIndex]?.position}</span>
                          <span className="text-sm text-gold truncate max-w-[180px]">{currentAtBat.batterName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">vs {currentPitcher.firstName[0]}. {currentPitcher.lastName}</span>
                      </div>
                    )}

                    {displayedDescription && (
                      <div className="bg-card/80 border border-border rounded px-4 py-2 max-w-sm text-center" data-testid="play-description">
                        <p className="text-xs text-foreground">{displayedDescription}</p>
                      </div>
                    )}

                    <div className="overflow-x-auto max-w-sm w-full mt-1">
                      <table className="w-full text-xs" data-testid="linescore-table">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-2 py-1 text-muted-foreground w-14">TEAM</th>
                            {pbpData.innings.map((_, i) => (
                              <th key={i} className={`text-center px-1 py-1 w-5 ${i === currentInning && !gameOver ? "text-gold" : "text-muted-foreground"}`}>{i + 1}</th>
                            ))}
                            <th className="text-center px-1.5 py-1 text-gold border-l border-border w-6">R</th>
                            <th className="text-center px-1.5 py-1 text-muted-foreground w-6">H</th>
                            <th className="text-center px-1.5 py-1 text-muted-foreground w-6">E</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/50">
                            <td className="px-2 py-1 text-foreground">{pbpData.awayTeam.abbreviation}</td>
                            {pbpData.innings.map((_, i) => (
                              <td key={i} className={`text-center px-1 py-1 ${i < inningScores.away.length ? "text-foreground" : "text-muted-foreground/30"}`}>
                                {i < inningScores.away.length ? inningScores.away[i] : "-"}
                              </td>
                            ))}
                            <td className="text-center px-1.5 py-1 text-gold font-bold border-l border-border">{runningAwayScore}</td>
                            <td className="text-center px-1.5 py-1">{runningAwayHits}</td>
                            <td className="text-center px-1.5 py-1">{runningAwayErrors}</td>
                          </tr>
                          <tr>
                            <td className="px-2 py-1 text-foreground">{pbpData.homeTeam.abbreviation}</td>
                            {pbpData.innings.map((_, i) => (
                              <td key={i} className={`text-center px-1 py-1 ${i < inningScores.home.length ? "text-foreground" : "text-muted-foreground/30"}`}>
                                {i < inningScores.home.length ? inningScores.home[i] : "-"}
                              </td>
                            ))}
                            <td className="text-center px-1.5 py-1 text-gold font-bold border-l border-border">{runningHomeScore}</td>
                            <td className="text-center px-1.5 py-1">{runningHomeHits}</td>
                            <td className="text-center px-1.5 py-1">{runningHomeErrors}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {resultFlash && (
                      <div className="animate-in fade-in zoom-in-95 duration-200" data-testid="result-flash">
                        <span className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${
                          resultFlash.type === "hr" ? "text-yellow-300" :
                          resultFlash.type === "hit" ? "text-green-400" :
                          resultFlash.type === "walk" ? "text-blue-400" :
                          resultFlash.type === "error" ? "text-orange-400" :
                          "text-red-400"
                        }`}>
                          {resultFlash.text}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      <RetroButton
                        variant={speed === "pause" ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setSpeed("pause")}
                        data-testid="button-speed-pause"
                        title="Pause"
                      >
                        <Pause className="w-4 h-4" />
                      </RetroButton>
                      <RetroButton
                        variant={speed === "slow" ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setSpeed("slow")}
                        data-testid="button-speed-slow"
                        title="Slow (at-bat by at-bat)"
                      >
                        <Play className="w-4 h-4" />
                      </RetroButton>
                      <RetroButton
                        variant={speed === "fast" ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setSpeed("fast")}
                        data-testid="button-speed-fast"
                        title="Fast (half-inning by half-inning)"
                      >
                        <FastForward className="w-4 h-4" />
                      </RetroButton>
                    </div>
                  </div>

                  <div className="hidden lg:block w-64 xl:w-72 shrink-0">
                    <PlayerCard
                      type="pitcher"
                      name={`${currentPitcher.firstName[0]}. ${currentPitcher.lastName}`}
                      position="P"
                      stats={{
                        velocity: currentPitcher.velocity,
                        stuff: currentPitcher.stuff,
                        control: currentPitcher.control,
                      }}
                      gameStats={(() => {
                        const rStats = getRunningPitcherStats(currentPitcher.playerId);
                        if (!rStats) return undefined;
                        return { ip: rStats.ip, h: rStats.h, er: rStats.er, bb: rStats.bb, so: rStats.so };
                      })()}
                      seasonStats={pbpData.playerSeasonStats?.[currentPitcher.playerId]}
                      team={pitchingTeam}
                      appearance={{
                        skinTone: currentPitcher.skinTone,
                        hairColor: currentPitcher.hairColor,
                        hairStyle: currentPitcher.hairStyle,
                        headwear: currentPitcher.headwear,
                      }}
                      overall={currentPitcher.overall}
                      onClickStats={() => {
                        const rStats = getRunningPitcherStats(currentPitcher.playerId);
                        setStatsModalPlayer({
                          name: `${currentPitcher.firstName[0]}. ${currentPitcher.lastName}`,
                          position: "P",
                          type: "pitcher",
                          seasonStats: pbpData.playerSeasonStats?.[currentPitcher.playerId],
                          gameStats: rStats ? { ip: rStats.ip, h: rStats.h, er: rStats.er, bb: rStats.bb, so: rStats.so, r: rStats.r } : undefined,
                          appearance: { skinTone: currentPitcher.skinTone, hairColor: currentPitcher.hairColor, hairStyle: currentPitcher.hairStyle, headwear: currentPitcher.headwear },
                          overall: currentPitcher.overall,
                          team: pitchingTeam,
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {inningTransition && (
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="bg-background/90 border border-gold/40 rounded px-12 py-6 animate-in fade-in zoom-in-90 duration-300">
                  <span className="text-gold text-2xl sm:text-3xl">{inningTransition}</span>
                </div>
              </div>
            )}

            {gameOver && (
              <div className="w-full max-w-4xl mt-4 px-2">
                <BoxScoreView data={pbpData} inningScores={inningScores} />
                <div className="flex justify-center mt-6 mb-4">
                  <RetroButton
                    onClick={() => finalizeMutation.mutate()}
                    disabled={finalizeMutation.isPending}
                    data-testid="button-end-game"
                  >
                    {finalizeMutation.isPending ? "Saving..." : "End Game"}
                  </RetroButton>
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex flex-col w-56 xl:w-64 border-l border-border p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 px-1">
              <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} name={pbpData.homeTeam.name} size="sm" />
              <div className="min-w-0 flex-1">
                <span className="text-xs text-foreground truncate block">{pbpData.homeTeam.name}</span>
                {homeRecord && (
                  <span className="text-xs text-muted-foreground">({homeRecord.wins}-{homeRecord.losses})</span>
                )}
              </div>
            </div>
            <div className="space-y-0.5">
              {pbpData.homeLineup.map((p, i) => {
                const isActive = currentHalf === "bottom" && currentAtBat?.batterIndex === i;
                const stars = getStarRating(p.overall || 300);
                return (
                  <div
                    key={p.playerId}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                      isActive
                        ? "bg-gold/30 border border-gold/60 shadow-[0_0_6px_rgba(202,166,57,0.3)]"
                        : ""
                    }`}
                    data-testid={`home-lineup-${i}`}
                  >
                    <span className={`w-4 text-center text-xs ${isActive ? "text-gold" : "text-muted-foreground"}`}>{i + 1}</span>
                    <PlayerAvatar skinTone={p.skinTone} hairColor={p.hairColor} hairStyle={p.hairStyle} facialHair={p.facialHair || "none"} eyeStyle={p.eyeStyle || undefined} eyebrowStyle={p.eyebrowStyle || undefined} mouthStyle={p.mouthStyle || undefined} eyeBlack={p.eyeBlack ?? undefined} playerId={p.id} headwear={p.headwear} size="sm" jerseyColor={pbpData.homeTeam.primaryColor} className="w-6 h-6 shrink-0" />
                    <span className={`${positionColor(p.position)} text-white text-xs px-1 py-0.5 rounded leading-none min-w-[24px] text-center`}>{p.position}</span>
                    <span className={`text-xs truncate flex-1 ${isActive ? "text-gold font-bold" : "text-foreground"}`}>{p.lastName}</span>
                    <div className="flex items-center gap-0.5 shrink-0" title={`OVR: ${p.overall || 300}`}>
                      <Star className={`w-2.5 h-2.5 fill-current ${starColor(stars)}`} />
                      <span className="text-xs text-muted-foreground">{p.overall || 300}</span>
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-border/50 mt-1 pt-1 px-1.5">
                <div className="flex items-center gap-1">
                  <span className="w-4 text-center text-xs text-muted-foreground">P</span>
                  <PlayerAvatar skinTone={pbpData.homePitcher.skinTone} hairColor={pbpData.homePitcher.hairColor} hairStyle={pbpData.homePitcher.hairStyle} facialHair={pbpData.homePitcher.facialHair || "none"} eyeStyle={pbpData.homePitcher.eyeStyle || undefined} eyebrowStyle={pbpData.homePitcher.eyebrowStyle || undefined} mouthStyle={pbpData.homePitcher.mouthStyle || undefined} eyeBlack={pbpData.homePitcher.eyeBlack ?? undefined} playerId={pbpData.homePitcher.id} headwear={pbpData.homePitcher.headwear} size="sm" jerseyColor={pbpData.homeTeam.primaryColor} className="w-6 h-6 shrink-0" />
                  <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded leading-none min-w-[24px] text-center">P</span>
                  <span className="text-xs text-muted-foreground truncate">{pbpData.homePitcher.lastName}</span>
                </div>
              </div>
            </div>

            {pbpData.conferenceStandings && pbpData.conferenceStandings.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <span className="text-xs text-gold mb-2 block" data-testid="text-conference-name">{pbpData.conferenceInfo?.homeName || "Conference"}</span>
                <div className="space-y-0.5" data-testid="conference-standings">
                  {pbpData.conferenceStandings.slice(0, 8).map((s) => {
                    const isPlaying = s.teamId === pbpData.homeTeam.id || s.teamId === pbpData.awayTeam.id;
                    return (
                      <div key={s.teamId} className={`flex items-center gap-1 text-xs px-1 py-0.5 rounded ${isPlaying ? "text-gold" : "text-muted-foreground"}`} data-testid={`standing-${s.abbreviation}`}>
                        <span className="w-8 truncate">{s.abbreviation}</span>
                        <span className="flex-1 text-right">{s.confWins}-{s.confLosses}</span>
                        <span className="text-muted-foreground/50 ml-1">({s.wins}-{s.losses})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:hidden border-t border-border px-3 py-2">
          <div className="flex gap-3 overflow-x-auto">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <TeamBadge abbreviation={pbpData.awayTeam.abbreviation} primaryColor={pbpData.awayTeam.primaryColor} secondaryColor={pbpData.awayTeam.secondaryColor} name={pbpData.awayTeam.name} size="sm" />
                <span className="text-xs truncate">{pbpData.awayTeam.abbreviation}</span>
              </div>
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {pbpData.awayLineup.slice(0, 9).map((p, i) => {
                  const isActive = currentHalf === "top" && currentAtBat?.batterIndex === i;
                  return (
                    <span key={p.playerId} className={`text-xs flex items-center gap-0.5 ${
                      isActive ? "text-gold font-bold" : "text-muted-foreground"
                    }`}>
                      {i + 1}.
                      <span className={`${positionColor(p.position)} text-white text-xs px-0.5 rounded leading-none`}>{p.position}</span>
                      {p.lastName}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <TeamBadge abbreviation={pbpData.homeTeam.abbreviation} primaryColor={pbpData.homeTeam.primaryColor} secondaryColor={pbpData.homeTeam.secondaryColor} name={pbpData.homeTeam.name} size="sm" />
                <span className="text-xs truncate">{pbpData.homeTeam.abbreviation}</span>
              </div>
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {pbpData.homeLineup.slice(0, 9).map((p, i) => {
                  const isActive = currentHalf === "bottom" && currentAtBat?.batterIndex === i;
                  return (
                    <span key={p.playerId} className={`text-xs flex items-center gap-0.5 ${
                      isActive ? "text-gold font-bold" : "text-muted-foreground"
                    }`}>
                      {i + 1}.
                      <span className={`${positionColor(p.position)} text-white text-xs px-0.5 rounded leading-none`}>{p.position}</span>
                      {p.lastName}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!statsModalPlayer} onOpenChange={(open) => { if (!open) setStatsModalPlayer(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          {statsModalPlayer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-gold">
                  <PlayerAvatar
                    skinTone={statsModalPlayer.appearance?.skinTone}
                    hairColor={statsModalPlayer.appearance?.hairColor}
                    hairStyle={statsModalPlayer.appearance?.hairStyle}
                    facialHair={statsModalPlayer.appearance?.facialHair || "none"}
                    eyeStyle={statsModalPlayer.appearance?.eyeStyle || undefined}
                    eyebrowStyle={statsModalPlayer.appearance?.eyebrowStyle || undefined}
                    mouthStyle={statsModalPlayer.appearance?.mouthStyle || undefined}
                    eyeBlack={statsModalPlayer.appearance?.eyeBlack ?? undefined}
                    playerId={statsModalPlayer.id}
                    headwear={statsModalPlayer.appearance?.headwear}
                    size="md"
                    jerseyColor={statsModalPlayer.team.primaryColor}
                    className="w-10 h-10 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">{statsModalPlayer.position}</Badge>
                      <span className="text-sm truncate">{statsModalPlayer.name}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <TeamBadge abbreviation={statsModalPlayer.team.abbreviation} primaryColor={statsModalPlayer.team.primaryColor} secondaryColor={statsModalPlayer.team.secondaryColor} name={statsModalPlayer.team.name} size="sm" />
                      <span className="text-xs text-muted-foreground">{statsModalPlayer.team.name}</span>
                      {statsModalPlayer.overall && (
                        <span className="text-xs text-muted-foreground ml-1">OVR {statsModalPlayer.overall}</span>
                      )}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {statsModalPlayer.gameStats && (
                <div className="border border-border rounded p-3 bg-background/50">
                  <h4 className="text-xs text-gold mb-2">TODAY'S GAME</h4>
                  {statsModalPlayer.type === "batter" ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[["AB", "ab"], ["H", "h"], ["HR", "hr"], ["RBI", "rbi"], ["BB", "bb"], ["SO", "so"]].map(([label, key]) => (
                        <div key={key} className="text-center">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.gameStats![key]}</div>
                        </div>
                      ))}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">AVG</div>
                        <div className="text-sm text-gold">
                          {Number(statsModalPlayer.gameStats!.ab) > 0
                            ? (Number(statsModalPlayer.gameStats!.h) / Number(statsModalPlayer.gameStats!.ab)).toFixed(3)
                            : ".000"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {[["IP", "ip"], ["H", "h"], ["R", "r"], ["ER", "er"], ["BB", "bb"], ["SO", "so"]].map(([label, key]) => (
                        <div key={key} className="text-center">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.gameStats![key]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {statsModalPlayer.seasonStats ? (
                <div className="border border-border rounded p-3 bg-background/50">
                  <h4 className="text-xs text-gold mb-2">SEASON STATS</h4>
                  {statsModalPlayer.type === "batter" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">G</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.games}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">AB</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.ab}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">AVG</div>
                          <div className="text-sm text-gold font-bold">{statsModalPlayer.seasonStats.avg}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">R</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.r}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">H</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.h}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">HR</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.hr}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">RBI</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.rbi}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">BB</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.bb}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">SO</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.so}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">OBP</div>
                          <div className="text-sm text-foreground">
                            {(statsModalPlayer.seasonStats.ab + statsModalPlayer.seasonStats.bb) > 0
                              ? ((statsModalPlayer.seasonStats.h + statsModalPlayer.seasonStats.bb) / (statsModalPlayer.seasonStats.ab + statsModalPlayer.seasonStats.bb)).toFixed(3)
                              : ".000"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">SLG</div>
                          <div className="text-sm text-foreground">
                            {statsModalPlayer.seasonStats.ab > 0
                              ? (((statsModalPlayer.seasonStats.h - statsModalPlayer.seasonStats.hr) + statsModalPlayer.seasonStats.hr * 4) / statsModalPlayer.seasonStats.ab).toFixed(3)
                              : ".000"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">G</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.pitchingGames}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">W</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.wins}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">L</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.losses}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">ERA</div>
                          <div className="text-sm text-gold font-bold">{statsModalPlayer.seasonStats.era}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">IP</div>
                          <div className="text-sm text-foreground">{(statsModalPlayer.seasonStats.ipOuts / 3).toFixed(1)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">H</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.pHits}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">ER</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.pEr}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">WHIP</div>
                          <div className="text-sm text-foreground">
                            {statsModalPlayer.seasonStats.ipOuts > 0
                              ? (((statsModalPlayer.seasonStats.pHits + statsModalPlayer.seasonStats.pBb) * 3) / statsModalPlayer.seasonStats.ipOuts).toFixed(2)
                              : "0.00"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">K</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.pSo}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">BB</div>
                          <div className="text-sm text-foreground">{statsModalPlayer.seasonStats.pBb}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">K/BB</div>
                          <div className="text-sm text-foreground">
                            {statsModalPlayer.seasonStats.pBb > 0
                              ? (statsModalPlayer.seasonStats.pSo / statsModalPlayer.seasonStats.pBb).toFixed(2)
                              : statsModalPlayer.seasonStats.pSo > 0 ? "INF" : "0.00"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">K/9</div>
                          <div className="text-sm text-foreground">
                            {statsModalPlayer.seasonStats.ipOuts > 0
                              ? ((statsModalPlayer.seasonStats.pSo * 27) / statsModalPlayer.seasonStats.ipOuts).toFixed(1)
                              : "0.0"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-border rounded p-3 bg-background/50 text-center">
                  <span className="text-xs text-muted-foreground">No season stats available</span>
                </div>
              )}

              <div className="flex justify-end">
                <RetroButton size="sm" variant="outline" onClick={() => setStatsModalPlayer(null)} data-testid="button-close-stats-modal">
                  Close
                </RetroButton>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerFace({ position, size = 28 }: { position: string; size?: number }) {
  const skinColor = "#F5D0A9";
  const capColor = position === "P" ? "#ef4444" : position === "C" ? "#f97316" : ["1B", "2B", "3B", "SS"].includes(position) ? "#3b82f6" : "#22c55e";

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0">
      <rect x="3" y="0" width="14" height="6" fill={capColor} rx="2" />
      <rect x="1" y="5" width="18" height="3" fill={capColor} />
      <rect x="4" y="6" width="12" height="10" fill={skinColor} rx="1" />
      <rect x="6" y="9" width="2" height="2" fill="#333" rx="0.5" />
      <rect x="12" y="9" width="2" height="2" fill="#333" rx="0.5" />
      <rect x="8" y="13" width="4" height="1" fill="#c97" rx="0.5" />
      <rect x="3" y="16" width="14" height="4" fill={capColor} rx="1" />
    </svg>
  );
}

function PlayerCard({ type, name, position, stats, gameStats, seasonStats, team, appearance, overall, onClickStats }: {
  type: "batter" | "pitcher";
  name: string;
  position: string;
  stats: Record<string, number>;
  gameStats?: Record<string, number | string>;
  seasonStats?: SeasonStatLine;
  team: TeamInfo;
  appearance?: { skinTone?: string; hairColor?: string; hairStyle?: string; headwear?: string; facialHair?: string; eyeStyle?: string; eyebrowStyle?: string; mouthStyle?: string; eyeBlack?: boolean };
  overall?: number;
  onClickStats?: () => void;
}) {
  const ratingColor = (val: number) => {
    if (val >= 80) return "text-green-400";
    if (val >= 60) return "text-blue-400";
    if (val >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  const getStars = (ovr: number) => {
    if (ovr >= 500) return 5;
    if (ovr >= 400) return 4;
    if (ovr >= 300) return 3;
    if (ovr >= 200) return 2;
    return 1;
  };

  const stars = getStars(overall || 300);

  const batterStatLabels: [string, string][] = [
    ["contact", "CON"],
    ["power", "PWR"],
    ["speed", "SPD"],
    ["fielding", "FLD"],
  ];

  const pitcherStatLabels: [string, string][] = [
    ["velocity", "VEL"],
    ["stuff", "STF"],
    ["control", "CTL"],
  ];

  const statLabels = type === "batter" ? batterStatLabels : pitcherStatLabels;

  const hasGameAction = gameStats && (
    type === "batter"
      ? (Number(gameStats.ab) > 0 || Number(gameStats.bb) > 0)
      : (gameStats.ip !== "0.0" && gameStats.ip !== "0")
  );

  return (
    <div
      className={`border border-border rounded bg-card/60 p-3 ${onClickStats ? "cursor-pointer hover:border-gold/50 transition-colors" : ""}`}
      data-testid={`player-card-${type}`}
      onClick={onClickStats}
    >
      <div className="flex items-center gap-2 mb-3">
        <PlayerAvatar
          skinTone={appearance?.skinTone}
          hairColor={appearance?.hairColor}
          hairStyle={appearance?.hairStyle}
          facialHair={appearance?.facialHair || "none"}
          eyeStyle={appearance?.eyeStyle || undefined}
          eyebrowStyle={appearance?.eyebrowStyle || undefined}
          mouthStyle={appearance?.mouthStyle || undefined}
          eyeBlack={appearance?.eyeBlack ?? undefined}
          headwear={appearance?.headwear}
          size="md"
          jerseyColor={team.primaryColor}
          className="w-10 h-10 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-xs shrink-0">{position}</Badge>
            <span className="text-xs font-semibold text-gold truncate max-w-[150px]">{name}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground">{type === "batter" ? "At Bat" : "Pitching"}</span>
            {overall && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                OVR {overall}
                <span className="flex">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="w-2 h-2 fill-yellow-400 text-yellow-400" />
                  ))}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2">
        {statLabels.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1 flex-1">
              <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${(stats[key] ?? 0) >= 80 ? "bg-green-500" : (stats[key] ?? 0) >= 60 ? "bg-blue-500" : (stats[key] ?? 0) >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, (stats[key] ?? 0))}%` }}
                />
              </div>
              <span className={`text-xs w-6 text-right ${ratingColor(stats[key] ?? 0)}`}>{stats[key] ?? 0}</span>
            </div>
          </div>
        ))}
      </div>

      {hasGameAction && gameStats && (
        <div className="border-t border-border/50 pt-2 mt-1">
          <span className="text-xs text-muted-foreground block mb-1">TODAY</span>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {type === "batter" ? (
              <>
                <span className="text-xs"><span className="text-muted-foreground">AB:</span> <span className="text-foreground">{gameStats.ab}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">H:</span> <span className="text-foreground">{gameStats.h}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">HR:</span> <span className="text-foreground">{gameStats.hr}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">RBI:</span> <span className="text-foreground">{gameStats.rbi}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">BB:</span> <span className="text-foreground">{gameStats.bb}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">K:</span> <span className="text-foreground">{gameStats.so}</span></span>
              </>
            ) : (
              <>
                <span className="text-xs"><span className="text-muted-foreground">IP:</span> <span className="text-foreground">{gameStats.ip}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">H:</span> <span className="text-foreground">{gameStats.h}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">ER:</span> <span className="text-foreground">{gameStats.er}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">BB:</span> <span className="text-foreground">{gameStats.bb}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">K:</span> <span className="text-foreground">{gameStats.so}</span></span>
              </>
            )}
          </div>
        </div>
      )}

      {seasonStats && (
        <div className="border-t border-border/50 pt-2 mt-1">
          <span className="text-xs text-muted-foreground block mb-1">SEASON</span>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {type === "batter" ? (
              <>
                <span className="text-xs"><span className="text-muted-foreground">AVG:</span> <span className="text-gold">{seasonStats.avg}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">HR:</span> <span className="text-foreground">{seasonStats.hr}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">RBI:</span> <span className="text-foreground">{seasonStats.rbi}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">H:</span> <span className="text-foreground">{seasonStats.h}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">G:</span> <span className="text-foreground">{seasonStats.games}</span></span>
              </>
            ) : (
              <>
                <span className="text-xs"><span className="text-muted-foreground">ERA:</span> <span className="text-gold">{seasonStats.era}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">W-L:</span> <span className="text-foreground">{seasonStats.wins}-{seasonStats.losses}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">K:</span> <span className="text-foreground">{seasonStats.pSo}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">BB:</span> <span className="text-foreground">{seasonStats.pBb}</span></span>
                <span className="text-xs"><span className="text-muted-foreground">G:</span> <span className="text-foreground">{seasonStats.pitchingGames}</span></span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiamondView({ bases }: { bases: boolean[] }) {
  return (
    <div className="relative w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64" data-testid="diamond-view">
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
        <table className="w-full text-xs border border-border">
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
          <h3 className="text-xs text-gold mb-2 flex items-center gap-2">
            <TeamBadge abbreviation={data.awayTeam.abbreviation} primaryColor={data.awayTeam.primaryColor} secondaryColor={data.awayTeam.secondaryColor} name={data.awayTeam.name} size="sm" />
            {data.awayTeam.name} Batting
          </h3>
          <BattingTable stats={data.awayBatting} />
          <h3 className="text-xs text-gold mt-4 mb-2">{data.awayTeam.name} Pitching</h3>
          <PitchingTable stats={data.awayPitching} />
        </div>
        <div>
          <h3 className="text-xs text-gold mb-2 flex items-center gap-2">
            <TeamBadge abbreviation={data.homeTeam.abbreviation} primaryColor={data.homeTeam.primaryColor} secondaryColor={data.homeTeam.secondaryColor} name={data.homeTeam.name} size="sm" />
            {data.homeTeam.name} Batting
          </h3>
          <BattingTable stats={data.homeBatting} />
          <h3 className="text-xs text-gold mt-4 mb-2">{data.homeTeam.name} Pitching</h3>
          <PitchingTable stats={data.homePitching} />
        </div>
      </div>
    </div>
  );
}

function BattingTable({ stats }: { stats: BattingStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-border">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="text-left px-2 py-1.5 text-muted-foreground">Player</th>
            <th className="text-left px-1 py-1.5 text-muted-foreground">Pos</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">AB</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">R</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">H</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">HR</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">RBI</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">BB</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">SO</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">AVG</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="px-2 py-1.5 text-foreground">
                <span className="truncate block max-w-[120px]">{s.name}</span>
              </td>
              <td className="px-1 py-1.5 text-gold/70">{s.position}</td>
              <td className="text-center px-1 py-1.5">{s.ab}</td>
              <td className="text-center px-1 py-1.5">{s.r}</td>
              <td className="text-center px-1 py-1.5">{s.h}</td>
              <td className="text-center px-1 py-1.5">{s.hr}</td>
              <td className="text-center px-1 py-1.5">{s.rbi}</td>
              <td className="text-center px-1 py-1.5">{s.bb}</td>
              <td className="text-center px-1 py-1.5">{s.so}</td>
              <td className="text-center px-1 py-1.5 text-gold">{s.avg}</td>
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
      <table className="w-full text-xs border border-border">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="text-left px-2 py-1.5 text-muted-foreground">Pitcher</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">IP</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">H</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">R</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">ER</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">BB</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">SO</th>
            <th className="text-center px-1 py-1.5 text-muted-foreground">ERA</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="px-2 py-1.5 text-foreground">
                <span className="truncate block max-w-[120px]">{s.name}</span>
              </td>
              <td className="text-center px-1 py-1.5">{s.ip}</td>
              <td className="text-center px-1 py-1.5">{s.h}</td>
              <td className="text-center px-1 py-1.5">{s.r}</td>
              <td className="text-center px-1 py-1.5">{s.er}</td>
              <td className="text-center px-1 py-1.5">{s.bb}</td>
              <td className="text-center px-1 py-1.5">{s.so}</td>
              <td className="text-center px-1 py-1.5 text-gold">{s.era}</td>
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
