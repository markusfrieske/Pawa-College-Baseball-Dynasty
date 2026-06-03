import { useState, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { ArrowLeft, ChevronRight, ChevronLeft, Check, AlertTriangle } from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, Team, Player } from "@shared/schema";

interface GameWithTeams extends Game {
  homeTeam: Team;
  awayTeam: Team;
}

interface BatterEntry {
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
  sb: number;
}

interface PitcherEntry {
  playerId: string;
  name: string;
  role: "starter" | "reliever" | "closer";
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  win: boolean;
  loss: boolean;
}

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

function defaultBatter(player: Player): BatterEntry {
  return {
    playerId: player.id,
    name: playerName(player),
    position: player.position,
    ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
    rbi: 0, bb: 0, so: 0, sb: 0,
  };
}

function defaultPitcher(player: Player): PitcherEntry {
  return {
    playerId: player.id,
    name: playerName(player),
    role: "starter",
    ip: "0.0",
    h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0,
    win: false, loss: false,
  };
}

function ipToDecimal(ip: string): number {
  const [whole, frac] = ip.split(".");
  return (parseInt(whole) || 0) + (parseInt(frac) || 0) / 3;
}

function liveEra(er: number, ip: string): string {
  const dec = ipToDecimal(ip);
  if (dec <= 0) return "--";
  return (9 * er / dec).toFixed(2);
}

const STEPS = ["Score & Linescore", "Home Batting", "Away Batting", "Pitching", "Review & Submit"];

export default function ReportGamePage() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isEditMode = new URLSearchParams(search).get("mode") === "edit";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const [numInnings, setNumInnings] = useState(9);
  const [homeInnings, setHomeInnings] = useState<number[]>(Array(9).fill(0));
  const [awayInnings, setAwayInnings] = useState<number[]>(Array(9).fill(0));
  const [homeErrors, setHomeErrors] = useState(0);
  const [awayErrors, setAwayErrors] = useState(0);

  const [homeBatting, setHomeBatting] = useState<BatterEntry[]>([]);
  const [awayBatting, setAwayBatting] = useState<BatterEntry[]>([]);
  const [homePitching, setHomePitching] = useState<PitcherEntry[]>([]);
  const [awayPitching, setAwayPitching] = useState<PitcherEntry[]>([]);
  const [homePitchersInitialized, setHomePitchersInitialized] = useState(false);
  const [awayPitchersInitialized, setAwayPitchersInitialized] = useState(false);

  const { data: gameData, isLoading: gameLoading, isError: gameError } = useQuery<{ game: GameWithTeams; homeTeam: Team; awayTeam: Team }>({
    queryKey: ["/api/leagues", id, "games", gameId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/games/${gameId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Game not found");
      return res.json();
    },
    retry: 1,
  });

  const { data: homePlayers, isLoading: homePlayersLoading } = useQuery<Player[]>({
    queryKey: [`/api/leagues/${id}/roster`, gameData?.game.homeTeamId],
    enabled: !!gameData?.game.homeTeamId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/roster?teamId=${gameData!.game.homeTeamId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch home roster");
      const d = await res.json();
      return d.players ?? d ?? [];
    },
  });

  const { data: awayPlayers, isLoading: awayPlayersLoading } = useQuery<Player[]>({
    queryKey: [`/api/leagues/${id}/roster`, gameData?.game.awayTeamId],
    enabled: !!gameData?.game.awayTeamId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/roster?teamId=${gameData!.game.awayTeamId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch away roster");
      const d = await res.json();
      return d.players ?? d ?? [];
    },
  });

  // Fetch existing report for edit mode pre-population (commissioner only)
  const { data: existingReport } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/leagues", id, "games", gameId, "report"],
    enabled: isEditMode,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/games/${gameId}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
  });

  // Pre-populate form when existing report loads in edit mode
  useEffect(() => {
    if (!isEditMode || !existingReport) return;
    const innings = (existingReport.inningScores as number[][] | null) ?? [];
    if (innings.length > 0) {
      setNumInnings(innings.length);
      setAwayInnings(innings.map((pair: number[]) => pair[0] ?? 0));
      setHomeInnings(innings.map((pair: number[]) => pair[1] ?? 0));
    }
    if (typeof existingReport.homeErrors === "number") setHomeErrors(existingReport.homeErrors);
    if (typeof existingReport.awayErrors === "number") setAwayErrors(existingReport.awayErrors);
    const hb = existingReport.homeBoxData as { batting?: BatterEntry[]; pitching?: PitcherEntry[] } | null;
    const ab = existingReport.awayBoxData as { batting?: BatterEntry[]; pitching?: PitcherEntry[] } | null;
    if (hb?.batting?.length) { setHomeBatting(hb.batting); }
    if (ab?.batting?.length) { setAwayBatting(ab.batting); }
    if (hb?.pitching?.length) { setHomePitching(hb.pitching); setHomePitchersInitialized(true); }
    if (ab?.pitching?.length) { setAwayPitching(ab.pitching); setAwayPitchersInitialized(true); }
  }, [existingReport, isEditMode]);

  interface ReportPayload {
    homeScore: number;
    awayScore: number;
    homeHits: number;
    awayHits: number;
    homeErrors: number;
    awayErrors: number;
    inningScores: number[][];
    homeBoxData: { batting: BatterEntry[]; pitching: PitcherEntry[]; totals: Record<string, number> };
    awayBoxData: { batting: BatterEntry[]; pitching: PitcherEntry[]; totals: Record<string, number> };
  }

  const submitMutation = useMutation({
    mutationFn: async (payload: ReportPayload) => {
      return apiRequest("POST", `/api/leagues/${id}/games/${gameId}/report`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Report Submitted", description: "Waiting for the opposing coach to confirm." });
      setLocation(`/league/${id}/schedule`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: ReportPayload) => {
      return apiRequest("PATCH", `/api/leagues/${id}/games/${gameId}/report`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Report Updated", description: "The submitted report has been corrected." });
      setLocation(`/league/${id}/schedule`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (gameLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-40 w-80" /></div>;
  if (gameError || !gameData) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Game not found or could not be loaded.</p>
      <Link href={`/league/${id}/schedule`} className="text-gold hover:underline text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Schedule
      </Link>
    </div>
  );

  const { game, homeTeam, awayTeam } = gameData;

  const homeScore = homeInnings.reduce((a, b) => a + b, 0);
  const awayScore = awayInnings.reduce((a, b) => a + b, 0);
  const homeHits = homeBatting.reduce((a, b) => a + b.h, 0);
  const awayHits = awayBatting.reduce((a, b) => a + b.h, 0);

  function changeInnings(n: number) {
    setNumInnings(n);
    setHomeInnings(prev => {
      const next = [...prev];
      while (next.length < n) next.push(0);
      return next.slice(0, n);
    });
    setAwayInnings(prev => {
      const next = [...prev];
      while (next.length < n) next.push(0);
      return next.slice(0, n);
    });
  }

  function sortByBattingOrder(players: Player[]): Player[] {
    const ordered = players
      .filter(p => (p as Player & { battingOrder?: number | null }).battingOrder != null)
      .sort((a, b) => ((a as Player & { battingOrder?: number }).battingOrder ?? 99) - ((b as Player & { battingOrder?: number }).battingOrder ?? 99));
    if (ordered.length >= 9) return ordered.slice(0, 9);
    const remaining = players
      .filter(p => (p as Player & { battingOrder?: number | null }).battingOrder == null)
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    return [...ordered, ...remaining].slice(0, 9);
  }

  function initHomeBatting() {
    if (homePlayers && homeBatting.length === 0) {
      setHomeBatting(sortByBattingOrder(homePlayers).map(defaultBatter));
    }
  }

  function initAwayBatting() {
    if (awayPlayers && awayBatting.length === 0) {
      setAwayBatting(sortByBattingOrder(awayPlayers).map(defaultBatter));
    }
  }

  function initPitchers() {
    if (homePlayers && !homePitchersInitialized) {
      const pitchers = homePlayers.filter(p => p.position === "P").slice(0, 3);
      setHomePitching(pitchers.map(defaultPitcher));
      setHomePitchersInitialized(true);
    }
    if (awayPlayers && !awayPitchersInitialized) {
      const pitchers = awayPlayers.filter(p => p.position === "P").slice(0, 3);
      setAwayPitching(pitchers.map(defaultPitcher));
      setAwayPitchersInitialized(true);
    }
  }

  function goNext() {
    const err = validateStep();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    if (step === 1) initHomeBatting();
    if (step === 2) initAwayBatting();
    if (step === 3) initPitchers();
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function goPrev() {
    setStep(s => Math.max(s - 1, 0));
  }

  const [validationError, setValidationError] = useState<string | null>(null);

  function validateStep(): string | null {
    if (step === 1 && homeBatting.length < 9) return `Home team needs at least 9 batters (currently ${homeBatting.length})`;
    if (step === 2 && awayBatting.length < 9) return `Away team needs at least 9 batters (currently ${awayBatting.length})`;
    if (step === 3) {
      if (homePitching.length < 1) return "Home team needs at least 1 pitcher";
      if (awayPitching.length < 1) return "Away team needs at least 1 pitcher";
      const ipRe = /^\d+(\.[012])?$/;
      for (const p of homePitching) {
        if (!ipRe.test(p.ip)) return `Invalid IP format "${p.ip}" for ${p.name}. Use format like "6.0" or "2.1"`;
      }
      for (const p of awayPitching) {
        if (!ipRe.test(p.ip)) return `Invalid IP format "${p.ip}" for ${p.name}. Use format like "6.0" or "2.1"`;
      }
    }
    if (step === 4) {
      const homeBattingRuns = homeBatting.reduce((a, b) => a + b.r, 0);
      const awayBattingRuns = awayBatting.reduce((a, b) => a + b.r, 0);
      if (homeBatting.length > 0 && homeBattingRuns !== homeScore) {
        return `Home team runs in batting (${homeBattingRuns}) don't match linescore total (${homeScore})`;
      }
      if (awayBatting.length > 0 && awayBattingRuns !== awayScore) {
        return `Away team runs in batting (${awayBattingRuns}) don't match linescore total (${awayScore})`;
      }
    }
    return null;
  }

  function handleSubmit() {
    const err = validateStep();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    const inningScores = awayInnings.map((a, i) => [a, homeInnings[i] ?? 0]);

    const homeBoxData = {
      batting: homeBatting,
      pitching: homePitching,
      totals: {
        ab: homeBatting.reduce((a, b) => a + b.ab, 0),
        r: homeScore,
        h: homeHits,
        rbi: homeBatting.reduce((a, b) => a + b.rbi, 0),
        bb: homeBatting.reduce((a, b) => a + b.bb, 0),
        so: homeBatting.reduce((a, b) => a + b.so, 0),
        sb: homeBatting.reduce((a, b) => a + b.sb, 0),
        doubles: homeBatting.reduce((a, b) => a + b.doubles, 0),
        triples: homeBatting.reduce((a, b) => a + b.triples, 0),
        hr: homeBatting.reduce((a, b) => a + b.hr, 0),
      },
    };

    const awayBoxData = {
      batting: awayBatting,
      pitching: awayPitching,
      totals: {
        ab: awayBatting.reduce((a, b) => a + b.ab, 0),
        r: awayScore,
        h: awayHits,
        rbi: awayBatting.reduce((a, b) => a + b.rbi, 0),
        bb: awayBatting.reduce((a, b) => a + b.bb, 0),
        so: awayBatting.reduce((a, b) => a + b.so, 0),
        sb: awayBatting.reduce((a, b) => a + b.sb, 0),
        doubles: awayBatting.reduce((a, b) => a + b.doubles, 0),
        triples: awayBatting.reduce((a, b) => a + b.triples, 0),
        hr: awayBatting.reduce((a, b) => a + b.hr, 0),
      },
    };

    const payload = { homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, inningScores, homeBoxData, awayBoxData };
    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      submitMutation.mutate(payload);
    }
  }

  const isLoading = homePlayersLoading || awayPlayersLoading;
  const isMutating = submitMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/league/${id}/schedule`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-sm">{isEditMode ? "Edit Game Report" : "Report Game Result"}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6 pb-20 md:pb-6">
        <RetroCard>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
              <span className="font-medium">{awayTeam.name}</span>
            </div>
            <div className="flex items-center gap-4 font-pixel text-2xl">
              <span className={awayScore > homeScore ? "text-gold" : "text-muted-foreground"}>{awayScore}</span>
              <span className="text-muted-foreground text-sm">@</span>
              <span className={homeScore > awayScore ? "text-gold" : "text-muted-foreground"}>{homeScore}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">{homeTeam.name}</span>
              <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
            </div>
          </div>
        </RetroCard>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <div key={i} className={`flex-1 min-w-[60px] text-center text-[8px] py-2 px-1 rounded font-pixel border transition-colors ${i === step ? "bg-gold text-forest-dark border-gold" : i < step ? "bg-gold/20 text-gold border-gold/40" : "bg-muted/30 text-muted-foreground border-border"}`}>
              {i < step ? <Check className="w-3 h-3 mx-auto" /> : <span>{i + 1}</span>}
            </div>
          ))}
        </div>

        <RetroCard>
          <RetroCardHeader>
            <span className="font-pixel text-gold text-xs">{STEPS[step]}</span>
          </RetroCardHeader>
          <RetroCardContent className="space-y-4">
            {step === 0 && (
              <LinescoreStep
                numInnings={numInnings}
                homeInnings={homeInnings}
                awayInnings={awayInnings}
                homeErrors={homeErrors}
                awayErrors={awayErrors}
                homeHits={homeHits}
                awayHits={awayHits}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                onChangeInnings={changeInnings}
                onChangeHomeInning={(i: number, v: number) => setHomeInnings(prev => { const n = [...prev]; n[i] = v; return n; })}
                onChangeAwayInning={(i: number, v: number) => setAwayInnings(prev => { const n = [...prev]; n[i] = v; return n; })}
                onChangeHomeErrors={setHomeErrors}
                onChangeAwayErrors={setAwayErrors}
              />
            )}

            {step === 1 && (
              isLoading ? <Skeleton className="h-40 w-full" /> :
              <BattingStep
                label={homeTeam.name}
                players={homePlayers ?? []}
                batting={homeBatting}
                onChange={setHomeBatting}
                onInit={initHomeBatting}
                autoInit
              />
            )}

            {step === 2 && (
              isLoading ? <Skeleton className="h-40 w-full" /> :
              <BattingStep
                label={awayTeam.name}
                players={awayPlayers ?? []}
                batting={awayBatting}
                onChange={setAwayBatting}
                onInit={initAwayBatting}
                autoInit
              />
            )}

            {step === 3 && (
              isLoading ? <Skeleton className="h-40 w-full" /> :
              <PitchingStep
                leagueId={id}
                gameType={game.gameType ?? null}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homePlayers={homePlayers ?? []}
                awayPlayers={awayPlayers ?? []}
                homePitching={homePitching}
                awayPitching={awayPitching}
                onChangeHome={setHomePitching}
                onChangeAway={setAwayPitching}
                onInit={initPitchers}
              />
            )}

            {step === 4 && (
              <ReviewStep
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeScore={homeScore}
                awayScore={awayScore}
                homeHits={homeHits}
                awayHits={awayHits}
                homeErrors={homeErrors}
                awayErrors={awayErrors}
                homeBatting={homeBatting}
                awayBatting={awayBatting}
                homePitching={homePitching}
                awayPitching={awayPitching}
                homeInnings={homeInnings}
                awayInnings={awayInnings}
              />
            )}
          </RetroCardContent>
        </RetroCard>

        {validationError && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/40 rounded text-xs text-red-300" data-testid="text-validation-error">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <div className="flex gap-3 justify-between">
          <RetroButton variant="outline" onClick={goPrev} disabled={step === 0} data-testid="button-prev-step">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </RetroButton>
          {step < STEPS.length - 1 ? (
            <RetroButton onClick={goNext} data-testid="button-next-step">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </RetroButton>
          ) : (
            <RetroButton
              onClick={handleSubmit}
              disabled={isMutating}
              data-testid="button-submit-report"
            >
              {isMutating ? (isEditMode ? "Updating..." : "Submitting...") : (isEditMode ? "Update Report" : "Submit Report")}
            </RetroButton>
          )}
        </div>
      </main>
    </div>
  );
}

interface LinescoreStepProps {
  numInnings: number;
  homeInnings: number[];
  awayInnings: number[];
  homeErrors: number;
  awayErrors: number;
  homeHits: number;
  awayHits: number;
  homeTeam: Team;
  awayTeam: Team;
  onChangeInnings: (n: number) => void;
  onChangeHomeInning: (i: number, v: number) => void;
  onChangeAwayInning: (i: number, v: number) => void;
  onChangeHomeErrors: (v: number) => void;
  onChangeAwayErrors: (v: number) => void;
}

function LinescoreStep({ numInnings, homeInnings, awayInnings, homeErrors, awayErrors, homeHits, awayHits, homeTeam, awayTeam, onChangeInnings, onChangeHomeInning, onChangeAwayInning, onChangeHomeErrors, onChangeAwayErrors }: LinescoreStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Innings Played:</label>
        <div className="flex gap-2">
          {[7, 9].map(n => (
            <RetroButton key={n} size="sm" variant={numInnings === n ? "primary" : "outline"} onClick={() => onChangeInnings(n)} data-testid={`button-innings-${n}`}>
              {n}
            </RetroButton>
          ))}
          <RetroButton
            size="sm"
            variant="outline"
            onClick={() => onChangeInnings(numInnings + 1)}
            data-testid="button-extra-inning"
            title="Add extra inning"
          >
            + Extra
          </RetroButton>
        </div>
        <RetroInput
          type="number"
          min={1}
          max={18}
          value={numInnings}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeInnings(Math.max(1, Math.min(18, parseInt(e.target.value) || 9)))}
          className="w-16 text-center"
          data-testid="input-num-innings"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gold/30">
              <th className="text-left p-2 text-gold/80 min-w-[100px]">Team</th>
              {Array.from({ length: numInnings }, (_, i) => (
                <th key={i} className="text-center p-1 text-gold/80 w-10">{i + 1}</th>
              ))}
              <th className="text-center p-1 text-gold/80 w-10 border-l border-gold/30">R</th>
              <th className="text-center p-1 text-gold/80 w-10">H</th>
              <th className="text-center p-1 text-gold/80 w-10">E</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gold/20">
              <td className="p-2 font-medium flex items-center gap-2">
                <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
                <span>{awayTeam.abbreviation}</span>
              </td>
              {awayInnings.map((v: number, i: number) => (
                <td key={i} className="p-1">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={v}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeAwayInning(i, parseInt(e.target.value) || 0)}
                    className="w-9 h-8 text-center text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                    data-testid={`input-away-inning-${i}`}
                  />
                </td>
              ))}
              <td className="p-1 text-center font-bold text-gold border-l border-gold/30">
                {awayInnings.reduce((a: number, b: number) => a + b, 0)}
              </td>
              <td className="p-1 text-center text-muted-foreground text-xs" title="Hits total from batting step">
                {awayHits > 0 ? awayHits : "—"}
              </td>
              <td className="p-1">
                <input
                  type="number"
                  min={0}
                  value={awayErrors}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeAwayErrors(parseInt(e.target.value) || 0)}
                  className="w-9 h-8 text-center text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                  data-testid="input-away-errors"
                />
              </td>
            </tr>
            <tr>
              <td className="p-2 font-medium flex items-center gap-2">
                <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
                <span>{homeTeam.abbreviation}</span>
              </td>
              {homeInnings.map((v: number, i: number) => (
                <td key={i} className="p-1">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={v}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeHomeInning(i, parseInt(e.target.value) || 0)}
                    className="w-9 h-8 text-center text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                    data-testid={`input-home-inning-${i}`}
                  />
                </td>
              ))}
              <td className="p-1 text-center font-bold text-gold border-l border-gold/30">
                {homeInnings.reduce((a: number, b: number) => a + b, 0)}
              </td>
              <td className="p-1 text-center text-muted-foreground text-xs" title="Hits total from batting step">
                {homeHits > 0 ? homeHits : "—"}
              </td>
              <td className="p-1">
                <input
                  type="number"
                  min={0}
                  value={homeErrors}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeHomeErrors(parseInt(e.target.value) || 0)}
                  className="w-9 h-8 text-center text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                  data-testid="input-home-errors"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BattingStep({ label, players, batting, onChange, onInit, autoInit }: { label: string; players: Player[]; batting: BatterEntry[]; onChange: (b: BatterEntry[]) => void; onInit: () => void; autoInit?: boolean }) {
  useEffect(() => {
    if (autoInit && batting.length === 0 && players.length > 0) onInit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInit, players.length]);

  const activeBatters = batting.length > 0 ? batting : [];

  function addBatter(player: Player) {
    if (batting.find(b => b.playerId === player.id)) return;
    onChange([...batting, defaultBatter(player)]);
  }

  function removeBatter(idx: number) {
    onChange(batting.filter((_, i) => i !== idx));
  }

  function updateBatter<K extends keyof BatterEntry>(idx: number, field: K, value: BatterEntry[K]) {
    const next = [...batting];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  const usedIds = new Set(batting.map(b => b.playerId));
  const available = players.filter(p => !usedIds.has(p.id) && p.position !== "P");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gold">{label} Batting</h3>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-pixel ${batting.length < 9 ? "text-red-400" : "text-green-400"}`} data-testid="text-batter-count">
            {batting.length}/9 batters
          </span>
          {batting.length === 0 && (
            <RetroButton size="sm" variant="outline" onClick={onInit} data-testid="button-load-lineup">
              Load Starting Lineup
            </RetroButton>
          )}
        </div>
      </div>
      {batting.length > 0 && batting.length < 9 && (
        <div className="flex items-center gap-1 text-[10px] text-red-400" data-testid="text-batter-count-warning">
          <AlertTriangle className="w-3 h-3" /> Need at least 9 batters to continue
        </div>
      )}

      {available.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-2">Add batter:</p>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {available.slice(0, 30).map(p => (
              <button
                key={p.id}
                onClick={() => addBatter(p)}
                className="text-[9px] px-2 py-1 bg-muted/40 border border-border rounded hover:border-gold hover:text-gold transition-colors"
                data-testid={`button-add-batter-${p.id}`}
              >
                {p.firstName} {p.lastName} ({p.position})
              </button>
            ))}
          </div>
        </div>
      )}

      {activeBatters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gold/30">
                <th className="text-center p-1 text-gold/80 w-6">#</th>
                <th className="text-left p-1 text-gold/80">Name</th>
                <th className="text-center p-1 text-gold/80 w-10">Pos</th>
                <th className="text-center p-1 text-gold/80 w-8">AB</th>
                <th className="text-center p-1 text-gold/80 w-8">R</th>
                <th className="text-center p-1 text-gold/80 w-8">H</th>
                <th className="text-center p-1 text-gold/80 w-8">2B</th>
                <th className="text-center p-1 text-gold/80 w-8">3B</th>
                <th className="text-center p-1 text-gold/80 w-8">HR</th>
                <th className="text-center p-1 text-gold/80 w-8">RBI</th>
                <th className="text-center p-1 text-gold/80 w-8">BB</th>
                <th className="text-center p-1 text-red-400 w-8">SO</th>
                <th className="text-center p-1 text-gold/80 w-8">SB</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {activeBatters.map((b, i) => (
                <tr key={b.playerId} className="border-b border-gold/10">
                  <td className="p-1 text-center text-muted-foreground font-pixel text-[8px]">{i + 1}</td>
                  <td className="p-1 text-foreground font-medium">{b.name}</td>
                  <td className="p-1 text-center text-muted-foreground text-[9px]">{b.position}</td>
                  {(["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"] as (keyof BatterEntry)[]).map(field => (
                    <td key={field} className="p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={b[field] as number}
                        onChange={e => updateBatter(i, field, parseInt(e.target.value) || 0)}
                        className="w-8 h-7 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-batter-${i}-${field}`}
                      />
                    </td>
                  ))}
                  <td className="p-0.5">
                    <button onClick={() => removeBatter(i)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeBatters.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">No batters added yet. Click "Load Starting Lineup" or add players manually.</p>
      )}
    </div>
  );
}

interface PitcherAvailSlot { available: boolean; limited: boolean; daysOfRest: number; suggestedMaxIP: number; }
interface PitcherAvailRow { playerId: string; name: string; pitchingRole: string | null; slots: Record<string, PitcherAvailSlot>; }

interface PitchingStepProps {
  leagueId: string | undefined;
  gameType: string | null;
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  homePitching: PitcherEntry[];
  awayPitching: PitcherEntry[];
  onChangeHome: (l: PitcherEntry[]) => void;
  onChangeAway: (l: PitcherEntry[]) => void;
  onInit: () => void;
}

const GAME_TYPE_LABEL: Record<string, string> = {
  midweek: "WED",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

function PitchingStep({ leagueId, gameType, homeTeam, awayTeam, homePlayers, awayPlayers, homePitching, awayPitching, onChangeHome, onChangeAway, onInit }: PitchingStepProps) {
  const [availOpen, setAvailOpen] = useState(true);

  useEffect(() => {
    if (homePitching.length === 0 && awayPitching.length === 0 && (homePlayers.length > 0 || awayPlayers.length > 0)) {
      onInit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePlayers.length, awayPlayers.length]);

  const gameDay = gameType ? (GAME_TYPE_LABEL[gameType] ?? null) : null;

  const { data: homeAvailData } = useQuery<{ pitchers: PitcherAvailRow[] }>({
    queryKey: ["/api/leagues", leagueId, "pitcher-availability", homeTeam.id],
    enabled: !!leagueId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/pitcher-availability?teamId=${homeTeam.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: awayAvailData } = useQuery<{ pitchers: PitcherAvailRow[] }>({
    queryKey: ["/api/leagues", leagueId, "pitcher-availability", awayTeam.id],
    enabled: !!leagueId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/pitcher-availability?teamId=${awayTeam.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  function updatePitcher<K extends keyof PitcherEntry>(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, idx: number, field: K, value: PitcherEntry[K]) {
    const next = [...list];
    next[idx] = { ...next[idx], [field]: value };
    setList(next);
  }

  function addPitcher(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, players: Player[]) {
    const usedIds = new Set(list.map(p => p.playerId));
    const pitcher = players.find(p => p.position === "P" && !usedIds.has(p.id));
    if (pitcher) setList([...list, defaultPitcher(pitcher)]);
  }

  function removePitcher(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, idx: number) {
    setList(list.filter((_, i) => i !== idx));
  }

  interface PitcherTableProps {
    team: Team;
    players: Player[];
    pitching: PitcherEntry[];
    onUpdate: <K extends keyof PitcherEntry>(i: number, f: K, v: PitcherEntry[K]) => void;
    onAdd: () => void;
    onRemove: (i: number) => void;
  }

  function PitcherTable({ team, players, pitching, onUpdate, onAdd, onRemove }: PitcherTableProps) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-pixel text-gold">{team.name} - Pitching</h3>
          <RetroButton size="sm" variant="outline" onClick={onAdd} data-testid={`button-add-pitcher-${team.id}`}>+ Add Pitcher</RetroButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gold/30">
                <th className="text-left p-1 text-gold/80">Pitcher</th>
                <th className="text-center p-1 text-gold/80 w-20">Role</th>
                <th className="text-center p-1 text-gold/80 w-12">IP</th>
                <th className="text-center p-1 text-gold/80 w-8">H</th>
                <th className="text-center p-1 text-gold/80 w-8">R</th>
                <th className="text-center p-1 text-gold/80 w-8">ER</th>
                <th className="text-center p-1 text-gold/80 w-8">BB</th>
                <th className="text-center p-1 text-gold/80 w-8">SO</th>
                <th className="text-center p-1 text-gold/80 w-8">HR</th>
                <th className="text-center p-1 text-gold/80 w-12">ERA</th>
                <th className="text-center p-1 text-gold/80 w-8">W</th>
                <th className="text-center p-1 text-gold/80 w-8">L</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {pitching.map((p: PitcherEntry, i: number) => (
                <tr key={p.playerId} className="border-b border-gold/10">
                  <td className="p-1">
                    <select
                      value={p.playerId}
                      onChange={e => {
                        const pl = players.find(pl => pl.id === e.target.value);
                        if (pl) {
                          onUpdate(i, "playerId", pl.id);
                          onUpdate(i, "name", `${pl.firstName} ${pl.lastName}`);
                        }
                      }}
                      className="w-36 h-7 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-1"
                      data-testid={`select-pitcher-${i}-player`}
                    >
                      {players.filter(pl => pl.position === "P" || pl.id === p.playerId).map(pl => (
                        <option key={pl.id} value={pl.id}>{pl.firstName} {pl.lastName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select
                      value={p.role}
                      onChange={e => onUpdate(i, "role", e.target.value as PitcherEntry["role"])}
                      className="w-20 h-7 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-1"
                      data-testid={`select-pitcher-${i}-role`}
                    >
                      <option value="starter">SP</option>
                      <option value="reliever">RP</option>
                      <option value="closer">CL</option>
                    </select>
                  </td>
                  <td className="p-0.5">
                    {(() => {
                      const ipValid = /^\d+(\.[012])?$/.test(p.ip);
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="text"
                            value={p.ip}
                            onChange={e => onUpdate(i, "ip", e.target.value)}
                            className={`w-12 h-7 text-center text-xs bg-muted/40 border rounded focus:outline-none text-foreground ${ipValid ? "border-border focus:border-gold" : "border-red-500 focus:border-red-400"}`}
                            placeholder="0.0"
                            data-testid={`input-pitcher-${i}-ip`}
                          />
                          {!ipValid && p.ip.length > 0 && (
                            <span className="text-[8px] text-red-400 leading-none" data-testid={`text-ip-error-${i}`}>bad format</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  {(["h", "r", "er", "bb", "so", "hr"] as (keyof PitcherEntry)[]).map(field => (
                    <td key={field} className="p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={p[field] as number}
                        onChange={e => onUpdate(i, field, parseInt(e.target.value) || 0)}
                        className="w-8 h-7 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-pitcher-${i}-${field}`}
                      />
                    </td>
                  ))}
                  <td className="p-1 text-center text-[10px] font-mono text-gold/80" data-testid={`text-pitcher-${i}-era`}>
                    {liveEra(p.er, p.ip)}
                  </td>
                  <td className="p-0.5 text-center">
                    <input type="checkbox" checked={p.win} onChange={e => onUpdate(i, "win", e.target.checked)} className="accent-gold" data-testid={`input-pitcher-${i}-win`} />
                  </td>
                  <td className="p-0.5 text-center">
                    <input type="checkbox" checked={p.loss} onChange={e => onUpdate(i, "loss", e.target.checked)} className="accent-red-500" data-testid={`input-pitcher-${i}-loss`} />
                  </td>
                  <td className="p-0.5">
                    <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function AvailPanel({ label, availData, teamId }: { label: string; availData: { pitchers: PitcherAvailRow[] } | undefined; teamId: string }) {
    if (!availData || !gameDay) return null;
    const pitchers = availData.pitchers.slice().sort((a, b) => {
      const order = ["FRI", "SAT", "SUN", "MID", "LRP", "MR1", "MR2", "MR3", "SU", "CP"];
      return (order.indexOf(a.pitchingRole ?? "") ?? 99) - (order.indexOf(b.pitchingRole ?? "") ?? 99);
    });
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-pixel text-gold/80 mb-1">{label}</div>
        <div className="grid gap-1">
          {pitchers.map(p => {
            const slot = p.slots[gameDay] as PitcherAvailSlot | undefined;
            if (!slot) return null;
            const color = !slot.available ? "border-red-700/50 bg-red-950/30" : slot.limited ? "border-yellow-700/50 bg-yellow-950/30" : "border-green-700/50 bg-green-950/30";
            const statusColor = !slot.available ? "text-red-400" : slot.limited ? "text-yellow-400" : "text-green-400";
            const statusText = !slot.available ? "Unavailable" : slot.limited ? `${slot.suggestedMaxIP} IP max` : `${slot.suggestedMaxIP} IP`;
            return (
              <div key={p.playerId} className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${color}`} data-testid={`avail-row-${teamId}-${p.playerId}`}>
                <span className="flex-1 truncate">{p.name}</span>
                {p.pitchingRole && <span className="font-pixel text-[8px] text-muted-foreground">{p.pitchingRole}</span>}
                <span className={`font-pixel text-[9px] ${statusColor}`}>{statusText}</span>
                {slot.daysOfRest < 99 && (
                  <span className="text-[8px] text-muted-foreground">{slot.daysOfRest}d rest</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const hasAvailData = (homeAvailData || awayAvailData) && gameDay;

  return (
    <div className="space-y-6">
      {hasAvailData && (
        <div className="border border-border/60 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            onClick={() => setAvailOpen(o => !o)}
            data-testid="toggle-avail-panel"
          >
            <span className="font-pixel text-gold text-[9px]">PITCHING AVAILABILITY — {gameDay}</span>
            <span className="text-muted-foreground text-xs">{availOpen ? "▲" : "▼"}</span>
          </button>
          {availOpen && (
            <div className="p-3 grid gap-4 sm:grid-cols-2">
              <AvailPanel label={homeTeam.name} availData={homeAvailData} teamId={homeTeam.id} />
              <AvailPanel label={awayTeam.name} availData={awayAvailData} teamId={awayTeam.id} />
            </div>
          )}
        </div>
      )}
      <PitcherTable
        team={homeTeam}
        players={homePlayers}
        pitching={homePitching}
        onUpdate={(i, f, v) => updatePitcher(homePitching, onChangeHome, i, f, v)}
        onAdd={() => addPitcher(homePitching, onChangeHome, homePlayers)}
        onRemove={(i: number) => removePitcher(homePitching, onChangeHome, i)}
      />
      <PitcherTable
        team={awayTeam}
        players={awayPlayers}
        pitching={awayPitching}
        onUpdate={(i, f, v) => updatePitcher(awayPitching, onChangeAway, i, f, v)}
        onAdd={() => addPitcher(awayPitching, onChangeAway, awayPlayers)}
        onRemove={(i: number) => removePitcher(awayPitching, onChangeAway, i)}
      />
    </div>
  );
}

interface ReviewStepProps {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  homeBatting: BatterEntry[];
  awayBatting: BatterEntry[];
  homePitching: PitcherEntry[];
  awayPitching: PitcherEntry[];
  homeInnings: number[];
  awayInnings: number[];
}

function ReviewStep({ homeTeam, awayTeam, homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, homeBatting, awayBatting, homePitching, awayPitching, homeInnings, awayInnings }: ReviewStepProps) {
  function BatterTable({ label, batting }: { label: string; batting: BatterEntry[] }) {
    return (
      <div>
        <p className="text-gold text-[9px] font-pixel mb-1">{label} — Batting</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="border-b border-gold/20">
                <th className="text-center py-1 px-1 text-muted-foreground w-5">#</th>
                <th className="text-left py-1 pr-2 text-muted-foreground">Name</th>
                <th className="text-center px-1 py-1 text-muted-foreground w-8">Pos</th>
                {(["ab","r","h","2B","3B","hr","rbi","bb","so","sb"] as const).map(f => (
                  <th key={f} className={`text-center px-1 py-1 w-6 ${f === "so" ? "text-red-400" : "text-muted-foreground"}`}>{f.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batting.map((b, i) => (
                <tr key={i} className="border-b border-gold/10">
                  <td className="text-center px-1 py-1 text-muted-foreground/60 font-pixel text-[7px]">{i + 1}</td>
                  <td className="py-1 pr-2 truncate max-w-[7rem]">{b.name}</td>
                  <td className="text-center px-1 py-1 text-muted-foreground">{b.position}</td>
                  <td className="text-center px-1 py-1">{b.ab}</td>
                  <td className="text-center px-1 py-1">{b.r}</td>
                  <td className="text-center px-1 py-1">{b.h}</td>
                  <td className="text-center px-1 py-1">{b.doubles}</td>
                  <td className="text-center px-1 py-1">{b.triples}</td>
                  <td className="text-center px-1 py-1">{b.hr}</td>
                  <td className="text-center px-1 py-1">{b.rbi}</td>
                  <td className="text-center px-1 py-1">{b.bb}</td>
                  <td className="text-center px-1 py-1">{b.so}</td>
                  <td className="text-center px-1 py-1">{b.sb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function PitcherTable({ label, pitching }: { label: string; pitching: PitcherEntry[] }) {
    return (
      <div>
        <p className="text-gold text-[9px] font-pixel mb-1">{label} — Pitching</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="border-b border-gold/20">
                <th className="text-left py-1 pr-2 text-muted-foreground">Name</th>
                <th className="text-center px-1 py-1 text-muted-foreground w-10">Role</th>
                {(["ip","h","r","er","bb","so","hr"] as const).map(f => (
                  <th key={f} className="text-center px-1 py-1 text-muted-foreground w-6">{f.toUpperCase()}</th>
                ))}
                <th className="text-center px-1 py-1 text-muted-foreground w-10">ERA</th>
              </tr>
            </thead>
            <tbody>
              {pitching.map((p, i) => (
                <tr key={i} className="border-b border-gold/10">
                  <td className="py-1 pr-2 truncate max-w-[7rem]">
                    {p.name}
                    {p.win && <span className="ml-1 text-green-400 font-pixel text-[6px]">W</span>}
                    {p.loss && <span className="ml-1 text-red-400 font-pixel text-[6px]">L</span>}
                  </td>
                  <td className="text-center px-1 py-1 text-muted-foreground uppercase text-[8px]">
                    {p.role === "starter" ? "SP" : p.role === "reliever" ? "RP" : "CL"}
                  </td>
                  <td className="text-center px-1 py-1">{p.ip}</td>
                  <td className="text-center px-1 py-1">{p.h}</td>
                  <td className="text-center px-1 py-1">{p.r}</td>
                  <td className="text-center px-1 py-1">{p.er}</td>
                  <td className="text-center px-1 py-1">{p.bb}</td>
                  <td className="text-center px-1 py-1">{p.so}</td>
                  <td className="text-center px-1 py-1">{p.hr}</td>
                  <td className="text-center px-1 py-1 text-gold/80">{liveEra(p.er, p.ip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const homeBattingRuns = homeBatting.reduce((a, b) => a + b.r, 0);
  const awayBattingRuns = awayBatting.reduce((a, b) => a + b.r, 0);
  const homeRunsMismatch = homeBatting.length > 0 && homeBattingRuns !== homeScore;
  const awayRunsMismatch = awayBatting.length > 0 && awayBattingRuns !== awayScore;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 bg-yellow-900/20 border border-yellow-700/40 rounded text-xs text-yellow-300">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Review your box score carefully. Once submitted, the opposing coach must confirm or dispute this report.</span>
      </div>

      {(homeRunsMismatch || awayRunsMismatch) && (
        <div className="space-y-1">
          {awayRunsMismatch && (
            <div className="flex items-center gap-1 text-[10px] text-red-400" data-testid="text-away-runs-mismatch">
              <AlertTriangle className="w-3 h-3" /> {awayTeam.abbreviation} batting runs ({awayBattingRuns}) don't match linescore ({awayScore}) — go back to fix
            </div>
          )}
          {homeRunsMismatch && (
            <div className="flex items-center gap-1 text-[10px] text-red-400" data-testid="text-home-runs-mismatch">
              <AlertTriangle className="w-3 h-3" /> {homeTeam.abbreviation} batting runs ({homeBattingRuns}) don't match linescore ({homeScore}) — go back to fix
            </div>
          )}
        </div>
      )}

      {awayInnings.length > 0 && (
        <div className="overflow-x-auto" data-testid="table-linescore-review">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gold/30">
                <th className="text-left p-2 text-gold/80 min-w-[80px]">Team</th>
                {awayInnings.map((_, i) => (
                  <th key={i} className="text-center px-2 py-1 text-gold/80 w-7">{i + 1}</th>
                ))}
                <th className="text-center px-2 py-1 text-gold/80 w-7 border-l border-gold/30">R</th>
                <th className="text-center px-2 py-1 text-gold/80 w-7">H</th>
                <th className="text-center px-2 py-1 text-gold/80 w-7">E</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gold/20">
                <td className="p-2 text-xs flex items-center gap-1">
                  <span className="font-medium">{awayTeam.abbreviation}</span>
                </td>
                {awayInnings.map((v, i) => (
                  <td key={i} className="text-center px-2 py-1">{v}</td>
                ))}
                <td className={`text-center px-2 py-1 border-l border-gold/30 font-bold ${awayRunsMismatch ? "text-red-400" : awayScore > homeScore ? "text-gold" : ""}`}>{awayScore}</td>
                <td className="text-center px-2 py-1">{awayHits}</td>
                <td className="text-center px-2 py-1">{awayErrors}</td>
              </tr>
              <tr>
                <td className="p-2 text-xs font-medium">{homeTeam.abbreviation}</td>
                {homeInnings.map((v, i) => (
                  <td key={i} className="text-center px-2 py-1">{v}</td>
                ))}
                <td className={`text-center px-2 py-1 border-l border-gold/30 font-bold ${homeRunsMismatch ? "text-red-400" : homeScore > awayScore ? "text-gold" : ""}`}>{homeScore}</td>
                <td className="text-center px-2 py-1">{homeHits}</td>
                <td className="text-center px-2 py-1">{homeErrors}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gold/30">
              <th className="text-left p-2 text-gold/80">Team</th>
              <th className="text-center p-2 text-gold/80">R</th>
              <th className="text-center p-2 text-gold/80">H</th>
              <th className="text-center p-2 text-gold/80">E</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gold/20">
              <td className="p-2 font-medium flex items-center gap-2">
                <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
                {awayTeam.name}
              </td>
              <td className={`text-center p-2 font-bold ${awayRunsMismatch ? "text-red-400" : awayScore > homeScore ? "text-gold" : "text-muted-foreground"}`}>{awayScore}</td>
              <td className="text-center p-2">{awayHits}</td>
              <td className="text-center p-2">{awayErrors}</td>
            </tr>
            <tr>
              <td className="p-2 font-medium flex items-center gap-2">
                <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
                {homeTeam.name}
              </td>
              <td className={`text-center p-2 font-bold ${homeRunsMismatch ? "text-red-400" : homeScore > awayScore ? "text-gold" : "text-muted-foreground"}`}>{homeScore}</td>
              <td className="text-center p-2">{homeHits}</td>
              <td className="text-center p-2">{homeErrors}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <BatterTable label={awayTeam.name} batting={awayBatting} />
        <BatterTable label={homeTeam.name} batting={homeBatting} />
        <PitcherTable label={awayTeam.name} pitching={awayPitching} />
        <PitcherTable label={homeTeam.name} pitching={homePitching} />
      </div>
    </div>
  );
}
