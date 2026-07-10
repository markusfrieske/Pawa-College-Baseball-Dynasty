/**
 * Postgame Recap Generator
 *
 * Pure computation: given box score + game context → InsertGameRecap fields.
 * Called from finalizeGame() (step 7) for both simulated and reported games.
 */

import type {
  InsertGameRecap,
  RecapPlayerOfGame,
  RecapHitter,
  RecapPitchingLine,
  RecapPitchingPitcher,
} from "@shared/schema";

// ── Box score shape (matches game-finalizer + schedule page) ───────────────
interface BoxBatter {
  name: string;
  position?: string;
  ab: number;
  r: number;
  h: number;
  doubles?: number;
  triples?: number;
  hr?: number;
  rbi?: number;
  bb?: number;
  so?: number;
  sb?: number;
  avg?: string;
}

interface BoxPitcher {
  name: string; // may contain " (W)", " (L)", " (S)"
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr?: number;
  era?: string;
}

interface BoxTeam {
  batting: BoxBatter[];
  pitching: BoxPitcher[];
  totals?: {
    ab?: number;
    r?: number;
    h?: number;
    rbi?: number;
  };
  errors?: number;
}

interface BoxScore {
  innings: number[][];
  home: BoxTeam;
  away: BoxTeam;
}

interface TeamInfo {
  name: string;
  abbreviation: string;
  primaryColor?: string | null;
}

interface GameContext {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeScore: number;
  awayScore: number;
  phase: string | null;
  gameType: string | null;
  season: number;
  week: number;
  isConference: boolean | null;
}

interface SeriesInfo {
  /** null when not a conference series game */
  status: string | null;
}

interface StandingsInfo {
  /** e.g. "LSU improve to 8-3 in the SEC" */
  impact: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ipToDecimal(ip: string): number {
  const parts = ip.split(".");
  const whole = parseInt(parts[0] ?? "0", 10) || 0;
  const frac = parseInt(parts[1] ?? "0", 10) || 0;
  return whole + frac / 3;
}

/** Parse decision out of pitcher name; returns null if none found. */
function parseDecision(name: string): { baseName: string; decision: "W" | "L" | "S" | null } {
  const m = name.match(/^(.*?)\s*\(([WLS])\)\s*$/);
  if (m) return { baseName: m[1].trim(), decision: m[2] as "W" | "L" | "S" };
  return { baseName: name.trim(), decision: null };
}

/** Ordinal: 1 → "1st", 4 → "4th" */
function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

/** Compute batter "impact score" for player of the game selection */
function batterImpact(b: BoxBatter): number {
  return (b.hr ?? 0) * 4 + (b.rbi ?? 0) * 2 + b.r * 1.5 + b.h * 1 - (b.so ?? 0) * 0.3;
}

// ── Headline generation ────────────────────────────────────────────────────

function generateHeadline(
  winnerName: string,
  loserName: string,
  winScore: number,
  lossScore: number,
  innings: number[][],
  homeWon: boolean,
): string {
  const margin = winScore - lossScore;

  // Shutout
  if (lossScore === 0) {
    const templates = [
      `${winnerName} blanks ${loserName} for shutout victory`,
      `${winnerName} shuts out ${loserName}`,
    ];
    return templates[winScore % 2];
  }

  if (!innings || innings.length === 0) {
    if (margin >= 7) return `${winnerName} cruises past ${loserName}`;
    if (margin === 1) return `${winnerName} edges ${loserName} in tight finish`;
    return `${winnerName} defeats ${loserName}`;
  }

  // Winner's runs by inning: innings[i] = [awayRuns, homeRuns]
  const winnerInnings = innings.map(i => (homeWon ? i[1] : i[0]) ?? 0);
  const loserInnings  = innings.map(i => (homeWon ? i[0] : i[1]) ?? 0);

  // Blowout: margin ≥ 8
  if (margin >= 8) {
    return `${winnerName} rolls past ${loserName} with dominant showing`;
  }

  // Pitching duel: both teams scored ≤ 4 combined
  if (winScore + lossScore <= 5) {
    return `${winnerName} edges ${loserName} in pitching duel`;
  }

  // Early rally: winner scored 3+ in first 2 innings
  const earlyRuns = (winnerInnings[0] ?? 0) + (winnerInnings[1] ?? 0);
  if (earlyRuns >= 3) {
    return `${winnerName} rides early ${earlyRuns}-run rally past ${loserName}`;
  }

  // Late comeback: winner was trailing at the midpoint
  const mid = Math.max(3, Math.floor(innings.length / 2));
  const winnerThroughMid = winnerInnings.slice(0, mid).reduce((a, b) => a + b, 0);
  const loserThroughMid  = loserInnings.slice(0, mid).reduce((a, b) => a + b, 0);
  if (loserThroughMid > winnerThroughMid && mid >= 3) {
    return `${winnerName} rallies from behind to down ${loserName}`;
  }

  // One-run thriller
  if (margin === 1) {
    return `${winnerName} holds off ${loserName} in one-run thriller`;
  }

  // Two-run game
  if (margin === 2) {
    return `${winnerName} survives ${loserName} in close contest`;
  }

  return `${winnerName} defeats ${loserName}`;
}

// ── Turning point ──────────────────────────────────────────────────────────

function computeTurningPoint(
  innings: number[][],
  homeWon: boolean,
  winnerAbbr: string,
): string | null {
  if (!innings || innings.length === 0) return null;

  let bestInning = -1;
  let bestRuns = 0;

  for (let i = 0; i < innings.length; i++) {
    const winnerRuns = homeWon ? (innings[i][1] ?? 0) : (innings[i][0] ?? 0);
    if (winnerRuns > bestRuns) {
      bestRuns = winnerRuns;
      bestInning = i;
    }
  }

  if (bestInning === -1 || bestRuns < 2) return null;

  // Compute score after the best inning
  let winnerTotal = 0;
  let loserTotal  = 0;
  for (let i = 0; i <= bestInning; i++) {
    winnerTotal += homeWon ? (innings[i][1] ?? 0) : (innings[i][0] ?? 0);
    loserTotal  += homeWon ? (innings[i][0] ?? 0) : (innings[i][1] ?? 0);
  }

  const inningNum = bestInning + 1;
  return `A ${bestRuns}-run ${ordinal(inningNum)} inning gave ${winnerAbbr} a ${winnerTotal}-${loserTotal} lead`;
}

// ── Player of the game ─────────────────────────────────────────────────────

function pickPlayerOfGame(
  winnerBox: BoxTeam,
  winnerAbbr: string,
  winnerColor: string | undefined,
): RecapPlayerOfGame | null {
  // Try batters first
  const batters = (winnerBox.batting ?? []).filter(b => b.ab > 0 || (b.hr ?? 0) > 0);
  if (batters.length > 0) {
    const best = batters.reduce((a, b) => batterImpact(a) > batterImpact(b) ? a : b);
    const score = batterImpact(best);
    if (score >= 2) {
      const parts: string[] = [];
      if (best.h > 0) parts.push(`${best.h}-for-${best.ab}`);
      if ((best.hr ?? 0) > 0) parts.push(`${best.hr} HR`);
      if ((best.rbi ?? 0) > 0) parts.push(`${best.rbi} RBI`);
      if (best.r > 0 && (best.rbi ?? 0) === 0) parts.push(`${best.r} R`);

      const highlights: string[] = [];
      if ((best.hr ?? 0) >= 2) highlights.push(`multi-HR game`);
      else if ((best.hr ?? 0) === 1) highlights.push(`solo blast`);
      if ((best.rbi ?? 0) >= 4) highlights.push(`4+ RBI performance`);
      else if ((best.rbi ?? 0) >= 3) highlights.push(`3-RBI day`);
      if (best.h >= 3) highlights.push(`${best.h}-hit game`);

      return {
        name: best.name,
        teamAbbr: winnerAbbr,
        teamColor: winnerColor,
        statLine: parts.join(", ") || `${best.h ?? 0}H`,
        highlight: highlights[0] ?? "standout performance",
        category: "hitting",
      };
    }
  }

  // Fall back to starter pitcher (most IP, fewest ER among decision holders or just most IP)
  const pitchers = (winnerBox.pitching ?? []);
  if (pitchers.length > 0) {
    const starter = [...pitchers].sort((a, b) => ipToDecimal(b.ip) - ipToDecimal(a.ip))[0];
    if (starter && ipToDecimal(starter.ip) >= 4) {
      const { baseName } = parseDecision(starter.name);
      const er = starter.er;
      const erStr = er === 0 ? "no earned runs" : `${er} ER`;
      return {
        name: baseName,
        teamAbbr: winnerAbbr,
        teamColor: winnerColor,
        statLine: `${starter.ip} IP, ${starter.so} K, ${erStr}`,
        highlight: er === 0 ? "dominant start" : `${starter.so}-strikeout outing`,
        category: "pitching",
      };
    }
  }

  return null;
}

// ── Top hitters ────────────────────────────────────────────────────────────

function pickTopHitters(
  homeBox: BoxTeam,
  awayBox: BoxTeam,
  homeAbbr: string,
  awayAbbr: string,
): RecapHitter[] {
  const all: Array<{ batter: BoxBatter; abbr: string }> = [
    ...(homeBox.batting ?? []).filter(b => b.ab > 0).map(b => ({ batter: b, abbr: homeAbbr })),
    ...(awayBox.batting ?? []).filter(b => b.ab > 0).map(b => ({ batter: b, abbr: awayAbbr })),
  ];

  return all
    .filter(({ batter }) => batterImpact(batter) >= 1.5)
    .sort((a, b) => batterImpact(b.batter) - batterImpact(a.batter))
    .slice(0, 4)
    .map(({ batter, abbr }) => {
      const parts: string[] = [];
      if (batter.h > 0) parts.push(`${batter.h}-for-${batter.ab}`);
      if ((batter.hr ?? 0) > 0) parts.push(`${batter.hr} HR`);
      if ((batter.rbi ?? 0) > 0) parts.push(`${batter.rbi} RBI`);
      if ((batter.bb ?? 0) > 0 && batter.h === 0) parts.push(`${batter.bb} BB`);
      return {
        name: batter.name,
        teamAbbr: abbr,
        statLine: parts.join(", ") || `${batter.h}H`,
      };
    });
}

// ── Pitching line ──────────────────────────────────────────────────────────

function buildPitchingLine(
  homeBox: BoxTeam,
  awayBox: BoxTeam,
  homeAbbr: string,
  awayAbbr: string,
  homeWon: boolean,
): RecapPitchingLine {
  const winnerBox  = homeWon ? homeBox : awayBox;
  const loserBox   = homeWon ? awayBox : homeBox;
  const winnerAbbr = homeWon ? homeAbbr : awayAbbr;
  const loserAbbr  = homeWon ? awayAbbr : homeAbbr;

  const line: RecapPitchingLine = {};

  const findPitcher = (box: BoxTeam, decision: "W" | "L" | "S"): BoxPitcher | null => {
    for (const p of box.pitching ?? []) {
      const parsed = parseDecision(p.name);
      if (parsed.decision === decision) return p;
    }
    return null;
  };

  const buildPP = (p: BoxPitcher, abbr: string): RecapPitchingPitcher => ({
    name: parseDecision(p.name).baseName,
    teamAbbr: abbr,
    ip: p.ip,
    er: p.er,
    so: p.so,
  });

  const wp = findPitcher(winnerBox, "W");
  if (wp) line.winner = buildPP(wp, winnerAbbr);

  const lp = findPitcher(loserBox, "L");
  if (lp) line.loser = buildPP(lp, loserAbbr);

  const sv = findPitcher(winnerBox, "S");
  if (sv) {
    const { baseName } = parseDecision(sv.name);
    line.save = { name: baseName, teamAbbr: winnerAbbr, ip: sv.ip };
  }

  return line;
}

// ── Badges ─────────────────────────────────────────────────────────────────

function computeBadges(
  phase: string | null,
  gameType: string | null,
  homeScore: number,
  awayScore: number,
  isConference: boolean | null,
): string[] {
  const badges: string[] = [];
  const margin = Math.abs(homeScore - awayScore);
  const lowerScore = Math.min(homeScore, awayScore);

  // Postseason
  if (
    phase === "super_regionals" ||
    phase === "cws" ||
    phase === "conference_championship" ||
    gameType === "super_regionals" ||
    gameType === "cws"
  ) {
    badges.push("postseason");
  }

  // Shutout
  if (lowerScore === 0) badges.push("shutout");

  // Blowout
  if (margin >= 8) badges.push("blowout");

  // Extra innings (more than 9 innings in line score)
  // We don't have innings count here but can add later if needed

  // Walk-off potential badge comes from the caller if needed
  return badges;
}

// ── Main export ────────────────────────────────────────────────────────────

export interface RecapInput {
  game: GameContext;
  boxScore: BoxScore | null;
  seriesInfo?: SeriesInfo;
  standingsInfo?: StandingsInfo;
  isRivalry?: boolean;
  isUpset?: boolean;
}

/**
 * Generate a complete recap payload from game context and box score.
 * Returns fields ready to insert into game_recaps (minus id/createdAt).
 */
export function generateGameRecap(input: RecapInput): Omit<InsertGameRecap, "id" | "createdAt"> {
  const { game, boxScore, seriesInfo, standingsInfo, isRivalry, isUpset } = input;
  const {
    homeTeam, awayTeam,
    homeScore, awayScore,
    phase, gameType,
    season, week, leagueId,
    isConference,
  } = game;

  const homeWon = homeScore > awayScore;
  const winner  = homeWon ? homeTeam : awayTeam;
  const loser   = homeWon ? awayTeam : homeTeam;
  const winScore  = homeWon ? homeScore : awayScore;
  const lossScore = homeWon ? awayScore : homeScore;
  const statsIncomplete = !boxScore;

  // Badges
  const badges = computeBadges(phase, gameType, homeScore, awayScore, isConference ?? false);
  if (isRivalry) badges.push("rivalry");
  if (isUpset) badges.push("upset");

  // Headline
  const innings = boxScore?.innings ?? [];
  const headline = generateHeadline(winner.name, loser.name, winScore, lossScore, innings, homeWon);

  if (statsIncomplete) {
    return {
      gameId: game.id,
      leagueId,
      headline,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      homeTeamAbbr: homeTeam.abbreviation,
      awayTeamAbbr: awayTeam.abbreviation,
      homeTeamColor: homeTeam.primaryColor ?? null,
      awayTeamColor: awayTeam.primaryColor ?? null,
      homeScore,
      awayScore,
      lineScore: null,
      playerOfGame: null,
      turningPoint: null,
      topHitters: [],
      pitchingLine: null,
      standingsImpact: standingsInfo?.impact ?? null,
      seriesStatus: seriesInfo?.status ?? null,
      badges,
      statsIncomplete: true,
      phase: phase ?? null,
      season,
      week,
    };
  }

  const winnerBox = homeWon ? boxScore.home : boxScore.away;

  const playerOfGame = pickPlayerOfGame(
    winnerBox,
    winner.abbreviation,
    winner.primaryColor ?? undefined,
  );

  const topHitters = pickTopHitters(
    boxScore.home, boxScore.away,
    homeTeam.abbreviation, awayTeam.abbreviation,
  );

  const pitchingLine = buildPitchingLine(
    boxScore.home, boxScore.away,
    homeTeam.abbreviation, awayTeam.abbreviation,
    homeWon,
  );

  const turningPoint = computeTurningPoint(innings, homeWon, winner.abbreviation);

  // Build line score: [[awayRuns, homeRuns], ...] per inning
  const lineScore = innings.length > 0 ? innings : null;

  return {
    gameId: game.id,
    leagueId,
    headline,
    homeTeamName: homeTeam.name,
    awayTeamName: awayTeam.name,
    homeTeamAbbr: homeTeam.abbreviation,
    awayTeamAbbr: awayTeam.abbreviation,
    homeTeamColor: homeTeam.primaryColor ?? null,
    awayTeamColor: awayTeam.primaryColor ?? null,
    homeScore,
    awayScore,
    lineScore,
    playerOfGame: playerOfGame ?? null,
    turningPoint: turningPoint ?? null,
    topHitters,
    pitchingLine: Object.keys(pitchingLine).length > 0 ? pitchingLine : null,
    standingsImpact: standingsInfo?.impact ?? null,
    seriesStatus: seriesInfo?.status ?? null,
    badges,
    statsIncomplete: false,
    phase: phase ?? null,
    season,
    week,
  };
}
