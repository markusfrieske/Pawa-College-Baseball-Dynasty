import { useQuery } from "@tanstack/react-query";
import { Trophy, Star } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";

export interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  bracketType?: string;
  bracketRound?: number;
  bracketSide?: string;
  homeSeed?: number;
  awaySeed?: number;
  homeTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
}

interface PostseasonData {
  phase: string;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
}

// ── FS postseason types ───────────────────────────────────────────────────────

interface FSEntry {
  teamId: string;
  nationalSeed: number;
  qualificationType: string;
  selectionReason: string;
  team: { name: string; abbreviation: string; primaryColor: string } | null;
  wins: number;
  losses: number;
}

interface FSSeries {
  id: string;
  bracketSlot: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWins: number;
  awayWins: number;
  seriesStatus: string;
  winnerId?: string;
  homeTeam: { name: string; abbreviation: string } | null;
  awayTeam: { name: string; abbreviation: string } | null;
  winner: { name: string; abbreviation: string } | null;
}

interface FSCWSGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  bracketType: string | null;
  bracketRound: number | null;
  bracketSide?: string | null;
  homeTeam: { name: string; abbreviation: string } | null;
  awayTeam: { name: string; abbreviation: string } | null;
}

interface FSPostseasonData {
  season: number;
  entries: FSEntry[];
  srSeries: FSSeries[];
  cwsSeries: FSSeries[];
  cwsGames: FSCWSGame[];
  currentPhase: string;
  currentPhaseStep: string | null;
}

// ── Phase / label maps ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  conference_championship: "Conference Championships",
  super_regionals: "Super Regionals",
  cws: "College World Series",
  offseason: "Postseason Complete",
};

const WB_LABELS: Record<number, string> = { 1: "WB R1", 2: "WB R2", 3: "WB Semis", 4: "WB Final" };
const LB_LABELS: Record<number, string> = {
  2: "LBR1", 3: "LBR2", 4: "LB Qtrs", 5: "LB Semis", 6: "LBR5", 7: "LB Final",
};

// ── Shared game card ──────────────────────────────────────────────────────────

function GameCard({ game }: { game: PostseasonGame }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  return (
    <div className="bg-muted/30 rounded p-2 border border-border" data-testid={`game-card-${game.id}`}>
      <div className={`flex items-center justify-between gap-2 py-1 ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""}`}>
        <span className="text-xs font-medium truncate">{game.homeTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
      </div>
      <div className="border-t border-border/50 my-0.5" />
      <div className={`flex items-center justify-between gap-2 py-1 ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""}`}>
        <span className="text-xs font-medium truncate">{game.awayTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.awayScore : "-"}</span>
      </div>
      {!game.isComplete && (
        <div className="text-center mt-1">
          <Badge variant="outline" className="text-[8px]">Upcoming</Badge>
        </div>
      )}
    </div>
  );
}

function CWSSeriesStatus({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  if (completedGames.length === 0) return null;
  const winsMap: Record<string, { name: string; wins: number }> = {};
  for (const g of completedGames) {
    const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[winnerId]) winsMap[winnerId] = { name: winnerTeam?.abbreviation || "TBD", wins: 0 };
    winsMap[winnerId].wins++;
  }
  const entries = Object.values(winsMap);
  const champion = entries.find(e => e.wins >= 2);
  return (
    <div className="mt-3 pt-3 border-t border-border">
      {champion ? (
        <div className="text-center">
          <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
            {champion.name} Wins the CWS!
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 text-xs">
          {entries.map(e => (
            <span key={e.name} className="font-pixel">{e.name}: {e.wins} {e.wins === 1 ? "win" : "wins"}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BracketDisplay({ games }: { games: PostseasonGame[] }) {
  const hasDoubleElim = games.some(
    g => (g.bracketType === "winners" || g.bracketType === "losers" || g.bracketType === "grand_final" || g.bracketType === "grand_final_reset") && !g.bracketSide
  );
  if (!hasDoubleElim) {
    const completedGames = games.filter(g => g.isComplete);
    const upcomingGames = games.filter(g => !g.isComplete);
    return (
      <div className="space-y-3">
        {completedGames.length > 0 && (
          <div>
            <p className="text-[9px] text-muted-foreground font-pixel mb-1">Completed</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {completedGames.map(game => <GameCard key={game.id} game={game} />)}
            </div>
          </div>
        )}
        {upcomingGames.length > 0 && (
          <div>
            <p className="text-[9px] text-muted-foreground font-pixel mb-1">Next Round</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {upcomingGames.map(game => <GameCard key={game.id} game={game} />)}
            </div>
          </div>
        )}
      </div>
    );
  }

  const wbGames = games.filter(g => g.bracketType === "winners");
  const lbGames = games.filter(g => g.bracketType === "losers");
  const gfGame = games.find(g => g.bracketType === "grand_final");
  const gfResetGm = games.find(g => g.bracketType === "grand_final_reset");
  const wbRounds = Array.from(new Set(wbGames.map(g => g.bracketRound ?? 1))).sort((a, b) => a - b);
  const lbRounds = Array.from(new Set(lbGames.map(g => g.bracketRound ?? 2))).sort((a, b) => a - b);
  const lossMap: Record<string, number> = {};
  for (const g of [...wbGames, ...lbGames].filter(g2 => g2.isComplete)) {
    const loserId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
    lossMap[loserId] = (lossMap[loserId] ?? 0) + 1;
  }
  const getWinner = (g: PostseasonGame) => {
    if (!g.isComplete) return null;
    return (g.homeScore ?? 0) > (g.awayScore ?? 0)
      ? { abbr: g.homeTeam?.abbreviation || "TBD", seed: g.homeSeed }
      : { abbr: g.awayTeam?.abbreviation || "TBD", seed: g.awaySeed };
  };
  const wbFinal = wbGames.find(g => g.bracketRound === 4);
  const lbFinal = lbGames.find(g => g.bracketRound === 7);
  const wbChamp = wbFinal?.isComplete ? getWinner(wbFinal) : null;
  const lbChamp = lbFinal?.isComplete ? getWinner(lbFinal) : null;
  const srChamp = gfResetGm?.isComplete ? getWinner(gfResetGm) : gfGame?.isComplete ? getWinner(gfGame) : null;
  const wbR2Games = wbGames.filter(g => (g.bracketRound ?? 1) === 2);
  let byeSeedAbbr: string | null = null;
  for (const g of wbR2Games) {
    if (g.homeSeed === 1) { byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed"; break; }
    if (g.awaySeed === 1) { byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed"; break; }
  }
  if (!byeSeedAbbr) {
    for (const g of wbGames) {
      if (g.homeSeed === 1) { byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed"; break; }
      if (g.awaySeed === 1) { byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed"; break; }
    }
  }
  const lossTag = (teamId: string) => {
    const l = lossMap[teamId] ?? 0;
    return l > 0 ? <span className="ml-1 text-[7px] text-amber-400/70">{l}L</span> : null;
  };
  const CommGameCard = ({ game, label }: { game: PostseasonGame; label?: string }) => {
    const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
    const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);
    return (
      <div className="bg-muted/30 rounded p-1.5 border border-border text-[10px]">
        {label && <p className="text-[7px] font-pixel text-muted-foreground mb-0.5 uppercase">{label}</p>}
        <div className={`flex items-center justify-between gap-1 py-0.5 ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""}`}>
          <span className="truncate flex-1">{game.homeTeam?.abbreviation || "TBD"}{lossTag(game.homeTeamId)}</span>
          <span className="font-pixel flex-shrink-0">{game.isComplete ? game.homeScore : "-"}</span>
        </div>
        <div className="border-t border-border/30 my-0.5" />
        <div className={`flex items-center justify-between gap-1 py-0.5 ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""}`}>
          <span className="truncate flex-1">{game.awayTeam?.abbreviation || "TBD"}{lossTag(game.awayTeamId)}</span>
          <span className="font-pixel flex-shrink-0">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
        {!game.isComplete && <p className="text-[7px] text-center text-muted-foreground/50 mt-0.5">Upcoming</p>}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-[8px] font-pixel text-gold uppercase">Winners Bracket</p>
          {wbRounds.map(r => (
            <div key={r} className="space-y-1">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase">{WB_LABELS[r] ?? `WB R${r}`}</p>
              {wbGames.filter(g => (g.bracketRound ?? 1) === r).map(g => <CommGameCard key={g.id} game={g} />)}
              {r === 1 && byeSeedAbbr && (
                <div className="bg-muted/20 border border-gold/20 rounded px-1.5 py-1 text-center">
                  <p className="text-[6px] font-pixel text-gold/70 uppercase">#1 Seed — BYE</p>
                  <p className="text-[7px] font-pixel text-muted-foreground">{byeSeedAbbr} → WBR2</p>
                </div>
              )}
            </div>
          ))}
          {wbChamp && !gfGame && (
            <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center">
              <p className="text-[6px] font-pixel text-muted-foreground">WB CHAMPION</p>
              <p className="text-gold font-pixel text-[9px]">{wbChamp.abbr}</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-[8px] font-pixel text-amber-400 uppercase">Losers Bracket</p>
          {lbRounds.map(r => (
            <div key={r} className="space-y-1">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase">{LB_LABELS[r] ?? `LB R${r}`}</p>
              {lbGames.filter(g => (g.bracketRound ?? 2) === r).map(g => <CommGameCard key={g.id} game={g} />)}
            </div>
          ))}
          {lbChamp && !gfGame && (
            <div className="bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1 text-center">
              <p className="text-[6px] font-pixel text-muted-foreground">LB CHAMPION</p>
              <p className="text-amber-400 font-pixel text-[9px]">{lbChamp.abbr}</p>
            </div>
          )}
        </div>
      </div>
      {gfGame && (
        <div className="border-t border-gold/20 pt-2 space-y-1">
          <p className="text-[8px] font-pixel text-gold uppercase text-center">Grand Final</p>
          <div className="max-w-[200px] mx-auto space-y-1">
            <CommGameCard game={gfGame} label="Grand Final" />
            {gfResetGm && <CommGameCard game={gfResetGm} label="If Necessary (Reset)" />}
          </div>
          {srChamp && (
            <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center max-w-[200px] mx-auto">
              <p className="text-[6px] font-pixel text-muted-foreground">SR CHAMPION → CWS</p>
              <p className="text-gold font-pixel text-[9px]">{srChamp.abbr}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FS-specific components ────────────────────────────────────────────────────

function FSSRSeriesCard({ series }: { series: FSSeries }) {
  const isDone = series.seriesStatus === "complete";
  const winner = series.winner;
  return (
    <div
      className={`bg-muted/30 rounded p-2 border text-[10px] ${isDone ? "border-border" : "border-gold/30"}`}
      data-testid={`fs-sr-series-${series.bracketSlot}`}
    >
      <p className="text-[7px] font-pixel text-muted-foreground mb-1 uppercase">{series.bracketSlot}</p>
      <div className={`flex items-center justify-between py-0.5 ${winner?.name === series.homeTeam?.name ? "text-gold" : ""}`}>
        <span className="truncate">{series.homeTeam?.abbreviation || "TBD"}</span>
        <span className="font-pixel ml-2">{series.homeWins}</span>
      </div>
      <div className="border-t border-border/30 my-0.5" />
      <div className={`flex items-center justify-between py-0.5 ${winner?.name === series.awayTeam?.name ? "text-gold" : ""}`}>
        <span className="truncate">{series.awayTeam?.abbreviation || "TBD"}</span>
        <span className="font-pixel ml-2">{series.awayWins}</span>
      </div>
      {!isDone && <p className="text-[7px] text-center text-gold/50 font-pixel mt-0.5">Bo3</p>}
      {isDone && winner && (
        <p className="text-[7px] text-center text-gold font-pixel mt-0.5">{winner.abbreviation} wins</p>
      )}
    </div>
  );
}

function FSCWSBracket({
  bracketId,
  games,
  entries,
}: {
  bracketId: "A" | "B";
  games: FSCWSGame[];
  entries: FSEntry[];
}) {
  const bGames = games.filter(g => g.bracketType?.startsWith(`cws_${bracketId}_`));
  if (bGames.length === 0) return (
    <div className="text-[9px] text-muted-foreground font-pixel text-center py-2">Awaiting bracket</div>
  );

  const gameWinner = (g: FSCWSGame) =>
    g.isComplete ? ((g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeam : g.awayTeam) : null;
  const gameLoser = (g: FSCWSGame) =>
    g.isComplete ? ((g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeam : g.homeTeam) : null;

  const MiniGame = ({ g, label }: { g: FSCWSGame; label: string }) => {
    const hw = g.isComplete && (g.homeScore ?? 0) > (g.awayScore ?? 0);
    const aw = g.isComplete && (g.awayScore ?? 0) > (g.homeScore ?? 0);
    return (
      <div className="bg-muted/20 rounded p-1 border border-border/50">
        <p className="text-[6px] font-pixel text-muted-foreground uppercase mb-0.5">{label}</p>
        <div className={`flex justify-between text-[9px] ${hw ? "text-gold" : aw ? "text-muted-foreground" : ""}`}>
          <span>{g.homeTeam?.abbreviation || "TBD"}</span>
          <span className="font-pixel">{g.isComplete ? g.homeScore : "-"}</span>
        </div>
        <div className={`flex justify-between text-[9px] ${aw ? "text-gold" : hw ? "text-muted-foreground" : ""}`}>
          <span>{g.awayTeam?.abbreviation || "TBD"}</span>
          <span className="font-pixel">{g.isComplete ? g.awayScore : "-"}</span>
        </div>
      </div>
    );
  };

  const wbr1 = bGames.filter(g => g.bracketType === `cws_${bracketId}_W` && g.bracketRound === 1);
  const wbr2 = bGames.filter(g => g.bracketType === `cws_${bracketId}_W` && g.bracketRound === 2);
  const lbr1 = bGames.filter(g => g.bracketType === `cws_${bracketId}_L` && g.bracketRound === 1);
  const lbr2 = bGames.filter(g => g.bracketType === `cws_${bracketId}_L` && g.bracketRound === 2);
  const bf1 = bGames.filter(g => g.bracketType === `cws_${bracketId}_BF` && g.bracketRound === 1);
  const bf2 = bGames.filter(g => g.bracketType === `cws_${bracketId}_BF` && g.bracketRound === 2);

  const wbr2Winner = wbr2[0] && wbr2[0].isComplete ? gameWinner(wbr2[0]) : null;
  const lbr2Winner = lbr2[0] && lbr2[0].isComplete ? gameWinner(lbr2[0]) : null;
  const bf1Winner = bf1[0] && bf1[0].isComplete ? gameWinner(bf1[0]) : null;
  const bf2Winner = bf2[0] && bf2[0].isComplete ? gameWinner(bf2[0]) : null;
  const bracketChamp = bf2Winner ?? (bf1Winner && wbr2Winner && bf1Winner.name === wbr2Winner.name ? wbr2Winner : null);

  return (
    <div className="space-y-1.5">
      {wbr1.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-gold/70 uppercase mb-0.5">WBR1</p>
          {wbr1.map(g => <MiniGame key={g.id} g={g} label={g.bracketSide ?? "WBR1"} />)}
        </div>
      )}
      {(wbr2.length > 0 || lbr1.length > 0) && (
        <div className="grid grid-cols-2 gap-1">
          <div>
            <p className="text-[7px] font-pixel text-gold/70 uppercase mb-0.5">WBR2</p>
            {wbr2.map(g => <MiniGame key={g.id} g={g} label="WBR2" />)}
          </div>
          <div>
            <p className="text-[7px] font-pixel text-amber-400/70 uppercase mb-0.5">LBR1</p>
            {lbr1.map(g => <MiniGame key={g.id} g={g} label="LBR1" />)}
          </div>
        </div>
      )}
      {lbr2.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-amber-400/70 uppercase mb-0.5">LBR2</p>
          {lbr2.map(g => <MiniGame key={g.id} g={g} label="LBR2" />)}
        </div>
      )}
      {bf1.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-gold uppercase mb-0.5">Bracket Final</p>
          {bf1.map(g => <MiniGame key={g.id} g={g} label="BF1" />)}
          {bf2.map(g => <MiniGame key={g.id} g={g} label="BF2 (If Nec.)" />)}
        </div>
      )}
      {bracketChamp && (
        <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center">
          <p className="text-[6px] font-pixel text-muted-foreground">BRACKET {bracketId} CHAMPION</p>
          <p className="text-gold font-pixel text-[9px]">{bracketChamp.abbreviation}</p>
        </div>
      )}
    </div>
  );
}

function FSPostseasonSection({ leagueId, phase }: { leagueId: string; phase: string }) {
  const { data: fs } = useQuery<FSPostseasonData>({
    queryKey: ["/api/leagues", leagueId, "fs-postseason"],
    enabled: !!leagueId,
    refetchInterval: 5000,
  });

  if (!fs) return null;

  const inSR = ["super_regionals", "cws", "offseason"].includes(phase);
  const inCWS = ["cws", "offseason"].includes(phase);

  const cwsFinalGames = fs.cwsGames.filter(g => g.bracketType === "cws_final");
  const finalWinsA: Record<string, number> = {};
  for (const g of cwsFinalGames.filter(g => g.isComplete)) {
    const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    finalWinsA[wId] = (finalWinsA[wId] ?? 0) + 1;
  }
  const cwsChampId = Object.entries(finalWinsA).find(([, w]) => w >= 2)?.[0];
  const cwsChamp = cwsChampId
    ? (fs.cwsGames.find(g => g.homeTeamId === cwsChampId || g.awayTeamId === cwsChampId)?.homeTeamId === cwsChampId
        ? fs.cwsGames.find(g => g.homeTeamId === cwsChampId)?.homeTeam
        : fs.cwsGames.find(g => g.awayTeamId === cwsChampId)?.awayTeam)
    : null;

  return (
    <div className="space-y-4 mt-3">
      {/* National seeding */}
      {fs.entries.length > 0 && (
        <div>
          <p className="text-[9px] font-pixel text-gold uppercase mb-2">National Field ({fs.entries.length} teams)</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {fs.entries.map(e => (
              <div
                key={e.teamId}
                className="flex items-center gap-2 px-1.5 py-1 rounded bg-muted/20 text-[9px]"
                data-testid={`fs-seed-row-${e.nationalSeed}`}
              >
                <span className="w-5 font-pixel text-gold flex-shrink-0">{e.nationalSeed}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{e.team?.abbreviation ?? "—"}</span>
                  {e.selectionReason && (
                    <span className="block truncate text-[6px] text-muted-foreground/70" title={e.selectionReason}>
                      {e.selectionReason}
                    </span>
                  )}
                </div>
                {e.qualificationType === "auto_bid" ? (
                  <Star className="w-2.5 h-2.5 text-gold flex-shrink-0" title="Auto bid" />
                ) : (
                  <span className="text-[7px] text-muted-foreground flex-shrink-0">AL</span>
                )}
                <span className="text-muted-foreground flex-shrink-0">{e.wins}-{e.losses}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SR series */}
      {inSR && fs.srSeries.length > 0 && (
        <div>
          <p className="text-[9px] font-pixel text-gold uppercase mb-2">Super Regionals</p>
          <div className="grid grid-cols-2 gap-2">
            {fs.srSeries.map(s => <FSSRSeriesCard key={s.id} series={s} />)}
          </div>
        </div>
      )}

      {/* CWS two-bracket */}
      {inCWS && fs.cwsGames.length > 0 && (
        <div>
          <p className="text-[9px] font-pixel text-gold uppercase mb-2">College World Series</p>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-[8px] font-pixel text-gold/80 mb-1">Bracket A (1,4,5,8)</p>
              <FSCWSBracket bracketId="A" games={fs.cwsGames} entries={fs.entries} />
            </div>
            <div>
              <p className="text-[8px] font-pixel text-gold/80 mb-1">Bracket B (2,3,6,7)</p>
              <FSCWSBracket bracketId="B" games={fs.cwsGames} entries={fs.entries} />
            </div>
          </div>
          {/* CWS Final */}
          {cwsFinalGames.length > 0 && (
            <div className="border-t border-gold/20 pt-2">
              <p className="text-[8px] font-pixel text-gold uppercase text-center mb-1.5">CWS Final (Best of 3)</p>
              <div className="flex items-center justify-center gap-4 mb-2">
                {(() => {
                  const g1 = cwsFinalGames[0];
                  if (!g1) return null;
                  const homeId = g1.homeTeamId;
                  const awayId = g1.awayTeamId;
                  const hw = finalWinsA[homeId] ?? 0;
                  const aw = finalWinsA[awayId] ?? 0;
                  return (
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className={hw >= 2 ? "text-gold font-pixel" : ""}>{g1.homeTeam?.abbreviation || "?"}</span>
                      <span className="font-pixel text-sm">{hw} – {aw}</span>
                      <span className={aw >= 2 ? "text-gold font-pixel" : ""}>{g1.awayTeam?.abbreviation || "?"}</span>
                    </div>
                  );
                })()}
              </div>
              {cwsChamp && (
                <div className="text-center">
                  <Trophy className="w-5 h-5 text-gold mx-auto mb-1" />
                  <p className="font-pixel text-gold text-xs" data-testid="text-cws-fs-champion">
                    {cwsChamp.name} — CWS Champion!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

interface PostseasonBracketProps {
  leagueId: string;
  phase: string;
  dynastyPreset?: string;
}

export function PostseasonBracket({ leagueId, phase, dynastyPreset }: PostseasonBracketProps) {
  const { data } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
    refetchInterval: 5000,
  });

  if (!data) return null;

  const isFS = dynastyPreset === "full_season";

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-3 w-full">
          <Trophy className="w-5 h-5 text-gold" />
          <span>{PHASE_LABELS[phase] || "Postseason"}</span>
          {isFS && (
            <Badge variant="outline" className="text-[8px] text-gold border-gold/40 ml-auto">Full Season</Badge>
          )}
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {data.conferenceChampionships.length > 0 && (
          <div className="mb-4">
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">Conference Championships</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.conferenceChampionships.map(game => <GameCard key={game.id} game={game} />)}
            </div>
          </div>
        )}

        {/* FS mode: show seeding + SR series + two-bracket CWS */}
        {isFS ? (
          <FSPostseasonSection leagueId={leagueId} phase={phase} />
        ) : (
          <>
            {data.superRegionals.length > 0 && (
              <div className="mb-4">
                <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">Super Regionals Bracket</h4>
                <BracketDisplay games={data.superRegionals} />
              </div>
            )}
            {data.cws.length > 0 && (
              <div>
                <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">College World Series (Best of 3)</h4>
                <div className="space-y-2">
                  {data.cws.map((game, i) => (
                    <div key={game.id}>
                      <p className="text-[9px] text-muted-foreground font-pixel mb-1">Game {i + 1}</p>
                      <GameCard game={game} />
                    </div>
                  ))}
                </div>
                <CWSSeriesStatus games={data.cws} />
              </div>
            )}
          </>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}
