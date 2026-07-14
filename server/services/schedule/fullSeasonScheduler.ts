/**
 * Full Season scheduler — pure function, no DB calls.
 *
 * Invariants (enforced at call site by validateFullSeasonSchedule):
 *   • Exactly 4,172 regular-season games
 *   • Every team plays exactly 56 games across exactly 14 weeks
 *   • Every team plays exactly 4 games per week
 *   • No games vs same-conference opponent in OOC slots
 *   • Every team hosts between 26 and 30 games (home/away diff ≤ 4)
 *   • Every team faces ≥ 8 unique OOC opponents
 *   • No OOC pair plays each other more than 3 times across the season
 *
 * Per-week breakdown (149 teams, 12 confs, 3 odd confs):
 *   Conf games:  219  (each matchup = 3-game Fri/Sat/Sun series)
 *   OOC games:    79  (1 midweek game each)
 *   ─────────────────
 *   Total/week:  298  = 149 × 4 / 2
 *   Total 14wks: 4172
 *
 * Odd conferences (Big Ten-17, AAC-11, Missouri Valley-13):
 *   One team per odd-conf per week has a conf bye → needs 4 OOC games instead of 1.
 *   Non-bye teams: 3 conf + 1 OOC = 4 ✓
 *   Bye teams:     0 conf + 4 OOC = 4 ✓
 */

import type { InsertGame } from "@shared/schema";

export interface ScheduleTeam {
  id: string;
  conferenceId: string;
  name: string;
}

export interface ScheduleConference {
  id: string;
  name: string;
}

export interface FullSeasonScheduleParams {
  leagueId: string;
  season: number;
  teams: ScheduleTeam[];
  conferences: ScheduleConference[];
  /** Integer seed for deterministic OOC matching. Same seed → identical schedule. */
  seed?: number;
}

export interface ScheduleValidationError {
  code: string;
  message: string;
}

const NUM_WEEKS = 14;
const GAMES_PER_SERIES = 3;
const EXPECTED_GAMES_PER_TEAM = 56;
const EXPECTED_GAMES_PER_WEEK_PER_TEAM = 4;
const EXPECTED_TOTAL_GAMES = 4172;
const HOME_MIN = 26;
const HOME_MAX = 30;
const OOC_MAX_PAIR_MEETINGS = 3;
const OOC_MIN_UNIQUE_OPPONENTS = 8;
const HOME_AWAY_MAX_DIFF = 4;

type Matchup = { home: ScheduleTeam; away: ScheduleTeam };

/** Generate a round-robin schedule for a list of teams.
 *  If team count is odd, a null phantom is added to handle byes.
 *  Returns an array of rounds; each round is an array of real matchups (phantom byes excluded). */
function generateRoundRobin(teams: ScheduleTeam[]): Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }> {
  const list: (ScheduleTeam | null)[] = [...teams];
  if (list.length % 2 !== 0) list.push(null);
  const count = list.length;
  const rounds: Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }> = [];

  for (let r = 0; r < count - 1; r++) {
    const matchups: Matchup[] = [];
    let byeTeam: ScheduleTeam | null = null;
    for (let i = 0; i < count / 2; i++) {
      const t1 = list[i];
      const t2 = list[count - 1 - i];
      if (t1 === null) { byeTeam = t2 as ScheduleTeam; continue; }
      if (t2 === null) { byeTeam = t1; continue; }
      matchups.push(r % 2 === 0 ? { home: t1, away: t2 } : { home: t2, away: t1 });
    }
    rounds.push({ matchups, byeTeam });
    const last = list.pop()!;
    list.splice(1, 0, last);
  }
  return rounds;
}

/** Reverse a round's home/away for doubled schedules. */
function reverseRound(round: { matchups: Matchup[]; byeTeam: ScheduleTeam | null }) {
  return {
    matchups: round.matchups.map(m => ({ home: m.away, away: m.home })),
    byeTeam: round.byeTeam,
  };
}

/** Expand conference RR rounds to exactly NUM_WEEKS (14) rounds.
 *  Small conferences (< 14 raw rounds) get doubled; large ones (>= 14) get sliced. */
function expandToWeeks(
  rounds: Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }>,
): Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }> {
  if (rounds.length >= NUM_WEEKS) return rounds.slice(0, NUM_WEEKS);
  const reversed = rounds.map(reverseRound);
  const doubled = [...rounds, ...reversed];
  return doubled.slice(0, NUM_WEEKS);
}

/** Deterministic Fisher-Yates shuffle seeded with a 32-bit LCG.
 *  Same seed always produces the same permutation. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223;
    const j = ((s >>> 0) % (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Build the conference-interleaved slot sequence for one week's OOC assignment.
 * Returns a flat array of team slots (bye teams appear 4 times, others once).
 * Adjacent positions are guaranteed to be from different conferences.
 */
function buildOocSlots(
  allTeams: ScheduleTeam[],
  byeTeamIds: Set<string>,
  confIdByTeamId: Map<string, string>,
  weekSeed: number,
): ScheduleTeam[] {
  const shuffledTeams = seededShuffle(allTeams, weekSeed);
  const confQueues = new Map<string, ScheduleTeam[]>();
  for (const t of shuffledTeams) {
    const conf = confIdByTeamId.get(t.id)!;
    if (!confQueues.has(conf)) confQueues.set(conf, []);
    const count = byeTeamIds.has(t.id) ? 4 : 1;
    for (let i = 0; i < count; i++) confQueues.get(conf)!.push(t);
  }

  const heap: Array<[string, number]> = Array.from(confQueues.entries())
    .map(([conf, arr]) => [conf, arr.length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const slots: ScheduleTeam[] = [];
  let lastConf: string | null = null;

  while (heap.length > 0) {
    let pickIdx = 0;
    if (heap[0][0] === lastConf) {
      if (heap.length === 1) {
        throw new Error(
          `OOC matcher: stuck — only remaining conf is ${heap[0][0]} (same as last). ` +
          `Total slots: ${slots.length + heap[0][1]}`,
        );
      }
      pickIdx = 1;
    }

    const [conf, remaining] = heap[pickIdx];
    slots.push(confQueues.get(conf)!.shift()!);
    lastConf = conf;

    heap.splice(pickIdx, 1);
    if (remaining > 1) {
      heap.push([conf, remaining - 1]);
      heap.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }
  }

  return slots;
}

/**
 * Pair key for two team IDs — order-independent.
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Build all OOC games across 14 weeks with:
 *   • Per-week pair count tracking (max 2 preferred, hard limit via validator = 3)
 *   • Running home/away balance assignment (conference counts pre-seeded)
 *   • Lookahead-8 matching to avoid over-met pairs
 */
function buildOocSchedule(
  allTeams: ScheduleTeam[],
  weekByeTeamIds: Array<Set<string>>,
  confIdByTeamId: Map<string, string>,
  homeCount: Map<string, number>,
  awayCount: Map<string, number>,
  baseSeed: number,
  leagueId: string,
  season: number,
): InsertGame[] {
  const pairCount = new Map<string, number>();
  const getPairCnt = (a: string, b: string) => pairCount.get(pairKey(a, b)) ?? 0;
  const incPairCnt = (a: string, b: string) => {
    const k = pairKey(a, b);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  };

  const LOOKAHEAD = 8;
  const oocGames: InsertGame[] = [];

  for (let weekIdx = 0; weekIdx < NUM_WEEKS; weekIdx++) {
    const week = weekIdx + 1;
    const byeTeamIds = weekByeTeamIds[weekIdx];

    // Per-week seed derived from base seed so same base → same per-week sequence.
    const weekSeed = (((baseSeed ^ (weekIdx * 0x9e3779b9)) >>> 0) * 2654435761 + weekIdx) >>> 0;

    const slots = buildOocSlots(allTeams, byeTeamIds, confIdByTeamId, weekSeed);

    const used = new Set<number>();

    for (let i = 0; i < slots.length; i++) {
      if (used.has(i)) continue;
      const a = slots[i];
      const confA = confIdByTeamId.get(a.id)!;

      let bestJ = -1;
      let bestScore = Infinity;

      // Full scan: no lookahead cap. We score every candidate and pick the best.
      // Score = pairMeetings * 10000 + (j - i), so fewer past meetings always wins,
      // with proximity as tiebreak (prefer slots close to i to preserve cross-conf
      // adjacency from the interleaved sequence).
      // Fast-exit: if we find an adjacent fresh pair, accept immediately.
      for (let j = i + 1; j < slots.length; j++) {
        if (used.has(j)) continue;
        const b = slots[j];
        if (confIdByTeamId.get(b.id) === confA) continue; // must be cross-conf
        const cnt = getPairCnt(a.id, b.id);
        const score = cnt * 10_000 + (j - i);
        if (score < bestScore) {
          bestScore = score;
          bestJ = j;
          if (cnt === 0 && j === i + 1) break; // adjacent fresh pair — can't do better
        }
      }
      if (bestJ === -1) {
        // Last resort: any unused slot (may violate cross-conf, validator will catch)
        for (let j = i + 1; j < slots.length; j++) {
          if (!used.has(j)) { bestJ = j; break; }
        }
      }
      if (bestJ === -1) break;

      used.add(i);
      used.add(bestJ);

      const b = slots[bestJ];
      incPairCnt(a.id, b.id);

      // Home/away: the team further behind on home games becomes home.
      // Balance = homeCount - awayCount; lower = needs more home games.
      const aBalance = (homeCount.get(a.id) ?? 0) - (awayCount.get(a.id) ?? 0);
      const bBalance = (homeCount.get(b.id) ?? 0) - (awayCount.get(b.id) ?? 0);
      const aIsHome = aBalance <= bBalance;

      const home = aIsHome ? a : b;
      const away = aIsHome ? b : a;

      homeCount.set(home.id, (homeCount.get(home.id) ?? 0) + 1);
      awayCount.set(away.id, (awayCount.get(away.id) ?? 0) + 1);

      oocGames.push({
        leagueId,
        season,
        week,
        homeTeamId: home.id,
        awayTeamId: away.id,
        phase: "regular",
        isConference: false,
        gameType: "midweek",
      });
    }
  }

  return oocGames;
}

/**
 * Swap repair pass: mutates OOC game home/away in-place until all teams
 * are within [HOME_MIN, HOME_MAX] home games, or no valid swap is found.
 * Only OOC games are swapped to preserve conference series integrity.
 */
function repairHomeAwayBalance(
  games: InsertGame[],
  teams: ScheduleTeam[],
  homeCount: Map<string, number>,
  awayCount: Map<string, number>,
): void {
  const oocIdxs: number[] = [];
  for (let i = 0; i < games.length; i++) {
    if (!games[i].isConference) oocIdxs.push(i);
  }

  const MAX_PASSES = 300;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Find the team most over the ceiling
    let worstOver: string | null = null;
    let worstOverVal = 0;
    for (const t of teams) {
      const h = homeCount.get(t.id) ?? 0;
      if (h > HOME_MAX && h - HOME_MAX > worstOverVal) {
        worstOverVal = h - HOME_MAX;
        worstOver = t.id;
      }
    }

    if (worstOver !== null) {
      let swapped = false;
      for (const idx of oocIdxs) {
        const g = games[idx];
        if (g.homeTeamId !== worstOver) continue;
        const awayH = homeCount.get(g.awayTeamId) ?? 0;
        if (awayH >= HOME_MAX) continue; // swapping would push away team over limit
        // Perform swap
        [g.homeTeamId, g.awayTeamId] = [g.awayTeamId, g.homeTeamId];
        homeCount.set(worstOver, (homeCount.get(worstOver) ?? 0) - 1);
        awayCount.set(worstOver, (awayCount.get(worstOver) ?? 0) + 1);
        homeCount.set(g.homeTeamId, (homeCount.get(g.homeTeamId) ?? 0) + 1);
        awayCount.set(g.homeTeamId, (awayCount.get(g.homeTeamId) ?? 0) - 1);
        swapped = true;
        break;
      }
      if (!swapped) break; // can't fix this team — stop to avoid infinite loop
      continue;
    }

    // Find the team most under the floor
    let worstUnder: string | null = null;
    let worstUnderVal = 0;
    for (const t of teams) {
      const h = homeCount.get(t.id) ?? 0;
      if (h < HOME_MIN && HOME_MIN - h > worstUnderVal) {
        worstUnderVal = HOME_MIN - h;
        worstUnder = t.id;
      }
    }

    if (worstUnder !== null) {
      let swapped = false;
      for (const idx of oocIdxs) {
        const g = games[idx];
        if (g.awayTeamId !== worstUnder) continue;
        const homeH = homeCount.get(g.homeTeamId) ?? 0;
        if (homeH <= HOME_MIN) continue; // swapping would push home team under floor
        [g.homeTeamId, g.awayTeamId] = [g.awayTeamId, g.homeTeamId];
        homeCount.set(worstUnder, (homeCount.get(worstUnder) ?? 0) + 1);
        awayCount.set(worstUnder, (awayCount.get(worstUnder) ?? 0) - 1);
        homeCount.set(g.awayTeamId, (homeCount.get(g.awayTeamId) ?? 0) - 1);
        awayCount.set(g.awayTeamId, (awayCount.get(g.awayTeamId) ?? 0) + 1);
        swapped = true;
        break;
      }
      if (!swapped) break;
      continue;
    }

    break; // all teams within [HOME_MIN, HOME_MAX]
  }
}

/**
 * Post-processing repair: find any OOC pair that has met > OOC_MAX_PAIR_MEETINGS times
 * and swap their opponents within the same week until all pairs are within the limit.
 * Runs up to MAX_PASSES swap attempts.
 */
function repairOocOvermetPairs(
  games: InsertGame[],
  confIdByTeamId: Map<string, string>,
): void {
  const getPK = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Index OOC games by week for fast lookup
  const oocByWeek = new Map<number, number[]>();
  for (let idx = 0; idx < games.length; idx++) {
    const g = games[idx];
    if (g.isConference) continue;
    const w = g.week ?? 0;
    if (!oocByWeek.has(w)) oocByWeek.set(w, []);
    oocByWeek.get(w)!.push(idx);
  }

  // Build pair count map
  const cnt = new Map<string, number>();
  for (const idxs of oocByWeek.values()) {
    for (const idx of idxs) {
      const g = games[idx];
      const k = getPK(g.homeTeamId, g.awayTeamId);
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
  }

  const MAX_PASSES = 200;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Find the first over-met game
    let fixIdx = -1;
    let fixA = '', fixB = '', fixWeek = 0;

    outer:
    for (const [, idxs] of oocByWeek) {
      for (const idx of idxs) {
        const g = games[idx];
        if ((cnt.get(getPK(g.homeTeamId, g.awayTeamId)) ?? 0) > OOC_MAX_PAIR_MEETINGS) {
          fixIdx = idx;
          fixA = g.homeTeamId;
          fixB = g.awayTeamId;
          fixWeek = g.week ?? 0;
          break outer;
        }
      }
    }
    if (fixIdx === -1) break; // all pairs within limit

    const confA = confIdByTeamId.get(fixA)!;
    const confB = confIdByTeamId.get(fixB)!;
    const weekIdxs = oocByWeek.get(fixWeek) ?? [];

    let swapped = false;
    for (const idx of weekIdxs) {
      if (idx === fixIdx) continue;
      const g = games[idx];
      const C = g.homeTeamId;
      const D = g.awayTeamId;
      const confC = confIdByTeamId.get(C)!;
      const confD = confIdByTeamId.get(D)!;

      // Attempt swap1: (A vs B, C vs D) → (A vs C, B vs D)
      if (confC !== confA && confD !== confB) {
        const acCnt = cnt.get(getPK(fixA, C)) ?? 0;
        const bdCnt = cnt.get(getPK(fixB, D)) ?? 0;
        if (acCnt < OOC_MAX_PAIR_MEETINGS && bdCnt < OOC_MAX_PAIR_MEETINGS) {
          // Update pair counts
          cnt.set(getPK(fixA, fixB), (cnt.get(getPK(fixA, fixB)) ?? 0) - 1);
          cnt.set(getPK(C, D), (cnt.get(getPK(C, D)) ?? 0) - 1);
          cnt.set(getPK(fixA, C), acCnt + 1);
          cnt.set(getPK(fixB, D), bdCnt + 1);
          // Patch games: A keeps its home/away role; C slots into B's position
          const fixGame = games[fixIdx];
          if (fixGame.homeTeamId === fixA) { fixGame.awayTeamId = C; }
          else { fixGame.homeTeamId = C; }
          // D stays in its original role; B slots into C's position
          if (g.homeTeamId === C) { g.homeTeamId = fixB; }
          else { g.awayTeamId = fixB; }
          swapped = true;
          break;
        }
      }

      // Attempt swap2: (A vs B, C vs D) → (A vs D, B vs C)
      if (confD !== confA && confC !== confB) {
        const adCnt = cnt.get(getPK(fixA, D)) ?? 0;
        const bcCnt = cnt.get(getPK(fixB, C)) ?? 0;
        if (adCnt < OOC_MAX_PAIR_MEETINGS && bcCnt < OOC_MAX_PAIR_MEETINGS) {
          cnt.set(getPK(fixA, fixB), (cnt.get(getPK(fixA, fixB)) ?? 0) - 1);
          cnt.set(getPK(C, D), (cnt.get(getPK(C, D)) ?? 0) - 1);
          cnt.set(getPK(fixA, D), adCnt + 1);
          cnt.set(getPK(fixB, C), bcCnt + 1);
          const fixGame = games[fixIdx];
          if (fixGame.homeTeamId === fixA) { fixGame.awayTeamId = D; }
          else { fixGame.homeTeamId = D; }
          if (g.homeTeamId === D) { g.homeTeamId = fixB; }
          else { g.awayTeamId = fixB; }
          swapped = true;
          break;
        }
      }
    }
    if (!swapped) break; // can't fix any remaining over-met pair — stop
  }
}

/** Build the full 4,172-game schedule as a pure function.
 *  Throws if team list is empty. Validation is done by validateFullSeasonSchedule. */
export function buildFullSeasonSchedule(params: FullSeasonScheduleParams): InsertGame[] {
  const { leagueId, season, teams, conferences, seed = 0 } = params;

  if (teams.length === 0) throw new Error("No teams provided to scheduler");

  const confIdByTeamId = new Map(teams.map(t => [t.id, t.conferenceId]));

  // Group teams by conferenceId.
  const teamsByConf = new Map<string, ScheduleTeam[]>();
  for (const t of teams) {
    if (!teamsByConf.has(t.conferenceId)) teamsByConf.set(t.conferenceId, []);
    teamsByConf.get(t.conferenceId)!.push(t);
  }

  // Build per-conference 14-week RR schedule.
  const confWeekRounds = new Map<string, Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }>>();
  for (const [confId, confTeams] of teamsByConf) {
    const rrRounds = generateRoundRobin(confTeams);
    const weekRounds = expandToWeeks(rrRounds);
    confWeekRounds.set(confId, weekRounds);
  }

  // Track home/away counts to drive OOC assignment and swap repair.
  const homeCount = new Map<string, number>();
  const awayCount = new Map<string, number>();
  for (const t of teams) { homeCount.set(t.id, 0); awayCount.set(t.id, 0); }

  const confGames: InsertGame[] = [];
  const weekByeTeamIds: Array<Set<string>> = [];

  // Step 1: emit conference series and accumulate home/away counts.
  for (let weekIdx = 0; weekIdx < NUM_WEEKS; weekIdx++) {
    const week = weekIdx + 1;
    const byeTeamIds = new Set<string>();

    for (const [, weekRounds] of confWeekRounds) {
      const { matchups, byeTeam } = weekRounds[weekIdx];
      if (byeTeam) byeTeamIds.add(byeTeam.id);
      for (const m of matchups) {
        for (let g = 0; g < GAMES_PER_SERIES; g++) {
          confGames.push({
            leagueId,
            season,
            week,
            homeTeamId: m.home.id,
            awayTeamId: m.away.id,
            phase: "regular",
            isConference: true,
            gameType: "weekend",
          });
        }
        homeCount.set(m.home.id, (homeCount.get(m.home.id) ?? 0) + GAMES_PER_SERIES);
        awayCount.set(m.away.id, (awayCount.get(m.away.id) ?? 0) + GAMES_PER_SERIES);
      }
    }

    weekByeTeamIds.push(byeTeamIds);
  }

  // Step 2: generate OOC games with pair count tracking and running balance.
  const oocGames = buildOocSchedule(
    teams,
    weekByeTeamIds,
    confIdByTeamId,
    homeCount,
    awayCount,
    seed,
    leagueId,
    season,
  );

  const allGames = [...confGames, ...oocGames];

  // Step 3a: fix any OOC pairs that exceeded the 3-meeting cap.
  repairOocOvermetPairs(allGames, confIdByTeamId);

  // Step 3b: recompute home/away counts after the OOC pair repair may have
  // swapped game assignments, invalidating the running counts from Step 2.
  homeCount.clear();
  awayCount.clear();
  for (const t of teams) { homeCount.set(t.id, 0); awayCount.set(t.id, 0); }
  for (const g of allGames) {
    homeCount.set(g.homeTeamId, (homeCount.get(g.homeTeamId) ?? 0) + 1);
    awayCount.set(g.awayTeamId, (awayCount.get(g.awayTeamId) ?? 0) + 1);
  }

  // Step 3c: swap repair — ensure all teams host 26-30 games.
  repairHomeAwayBalance(allGames, teams, homeCount, awayCount);

  return allGames;
}

/** Validate that the schedule meets all invariants.
 *  Returns an array of error objects (empty = valid). */
export function validateFullSeasonSchedule(
  games: InsertGame[],
  teams: ScheduleTeam[],
): ScheduleValidationError[] {
  const errors: ScheduleValidationError[] = [];
  const regularGames = games.filter(g => g.phase === "regular");

  // Invariant 1: exact total game count.
  if (regularGames.length !== EXPECTED_TOTAL_GAMES) {
    errors.push({
      code: "TOTAL_GAMES_MISMATCH",
      message: `Expected ${EXPECTED_TOTAL_GAMES} regular-season games, got ${regularGames.length}`,
    });
  }

  // Build per-team counts.
  const teamHomeCount = new Map<string, number>();
  const teamAwayCount = new Map<string, number>();
  const teamWeekCounts = new Map<string, Map<number, number>>();
  for (const t of teams) {
    teamHomeCount.set(t.id, 0);
    teamAwayCount.set(t.id, 0);
    teamWeekCounts.set(t.id, new Map());
  }

  for (const g of regularGames) {
    teamHomeCount.set(g.homeTeamId, (teamHomeCount.get(g.homeTeamId) ?? 0) + 1);
    teamAwayCount.set(g.awayTeamId, (teamAwayCount.get(g.awayTeamId) ?? 0) + 1);
    const w = g.week ?? 0;
    for (const tid of [g.homeTeamId, g.awayTeamId]) {
      const wm = teamWeekCounts.get(tid);
      if (wm) wm.set(w, (wm.get(w) ?? 0) + 1);
    }
  }

  // Invariant 2: every team plays exactly 56 games.
  const undercount = teams.filter(t => (teamHomeCount.get(t.id) ?? 0) + (teamAwayCount.get(t.id) ?? 0) < EXPECTED_GAMES_PER_TEAM);
  const overcount  = teams.filter(t => (teamHomeCount.get(t.id) ?? 0) + (teamAwayCount.get(t.id) ?? 0) > EXPECTED_GAMES_PER_TEAM);
  if (undercount.length > 0) {
    errors.push({
      code: "TEAM_GAME_UNDERCOUNT",
      message: `${undercount.length} team(s) have fewer than ${EXPECTED_GAMES_PER_TEAM} games: ` +
        undercount.slice(0, 5).map(t => `${t.name}=${teamHomeCount.get(t.id)! + teamAwayCount.get(t.id)!}`).join(", "),
    });
  }
  if (overcount.length > 0) {
    errors.push({
      code: "TEAM_GAME_OVERCOUNT",
      message: `${overcount.length} team(s) have more than ${EXPECTED_GAMES_PER_TEAM} games: ` +
        overcount.slice(0, 5).map(t => `${t.name}=${teamHomeCount.get(t.id)! + teamAwayCount.get(t.id)!}`).join(", "),
    });
  }

  // Invariant 3: exactly 4 games per team per week.
  let weekViolations = 0;
  for (const [, wm] of teamWeekCounts) {
    for (let w = 1; w <= NUM_WEEKS; w++) {
      const count = wm.get(w) ?? 0;
      if (count !== EXPECTED_GAMES_PER_WEEK_PER_TEAM) weekViolations++;
    }
  }
  if (weekViolations > 0) {
    errors.push({
      code: "WEEKLY_GAME_COUNT_VIOLATION",
      message: `${weekViolations} team-week slot(s) have ≠ ${EXPECTED_GAMES_PER_WEEK_PER_TEAM} games`,
    });
  }

  // Invariant 4: all games in weeks 1-14.
  const outOfRange = regularGames.filter(g => !g.week || g.week < 1 || g.week > NUM_WEEKS);
  if (outOfRange.length > 0) {
    errors.push({
      code: "GAME_OUT_OF_WEEK_RANGE",
      message: `${outOfRange.length} game(s) have week outside 1–${NUM_WEEKS}`,
    });
  }

  // Invariant 5: OOC games must not involve same-conference opponents.
  const confIdByTeamId = new Map(teams.map(t => [t.id, t.conferenceId]));
  const oocGames = regularGames.filter(g => !g.isConference);
  const sameConfOoc = oocGames.filter(g => {
    const confH = confIdByTeamId.get(g.homeTeamId);
    const confA = confIdByTeamId.get(g.awayTeamId);
    return confH && confA && confH === confA;
  });
  if (sameConfOoc.length > 0) {
    errors.push({
      code: "OOC_SAME_CONFERENCE",
      message: `${sameConfOoc.length} OOC game(s) involve teams from the same conference`,
    });
  }

  // Invariant 6: every team hosts between HOME_MIN and HOME_MAX games.
  const homeBelow = teams.filter(t => (teamHomeCount.get(t.id) ?? 0) < HOME_MIN);
  const homeAbove = teams.filter(t => (teamHomeCount.get(t.id) ?? 0) > HOME_MAX);
  if (homeBelow.length > 0) {
    errors.push({
      code: "HOME_GAME_UNDERCOUNT",
      message: `${homeBelow.length} team(s) host fewer than ${HOME_MIN} home games: ` +
        homeBelow.slice(0, 5).map(t => `${t.name}=${teamHomeCount.get(t.id)}`).join(", "),
    });
  }
  if (homeAbove.length > 0) {
    errors.push({
      code: "HOME_GAME_OVERCOUNT",
      message: `${homeAbove.length} team(s) host more than ${HOME_MAX} home games: ` +
        homeAbove.slice(0, 5).map(t => `${t.name}=${teamHomeCount.get(t.id)}`).join(", "),
    });
  }

  // Invariant 7: home/away diff ≤ HOME_AWAY_MAX_DIFF per team.
  const diffViolators = teams.filter(t => {
    const h = teamHomeCount.get(t.id) ?? 0;
    const a = teamAwayCount.get(t.id) ?? 0;
    return Math.abs(h - a) > HOME_AWAY_MAX_DIFF;
  });
  if (diffViolators.length > 0) {
    errors.push({
      code: "HOME_AWAY_DIFF_EXCEEDED",
      message: `${diffViolators.length} team(s) have home/away diff > ${HOME_AWAY_MAX_DIFF}: ` +
        diffViolators.slice(0, 5).map(t => {
          const h = teamHomeCount.get(t.id) ?? 0;
          const a = teamAwayCount.get(t.id) ?? 0;
          return `${t.name}=${h}H/${a}A`;
        }).join(", "),
    });
  }

  // Invariant 8: OOC pair meetings ≤ OOC_MAX_PAIR_MEETINGS.
  const oocPairCount = new Map<string, number>();
  for (const g of oocGames) {
    const k = pairKey(g.homeTeamId, g.awayTeamId);
    oocPairCount.set(k, (oocPairCount.get(k) ?? 0) + 1);
  }
  const overmetPairs: string[] = [];
  for (const [k, cnt] of oocPairCount) {
    if (cnt > OOC_MAX_PAIR_MEETINGS) overmetPairs.push(`${k}(${cnt}x)`);
  }
  if (overmetPairs.length > 0) {
    errors.push({
      code: "OOC_PAIR_OVERMET",
      message: `${overmetPairs.length} OOC pair(s) meet more than ${OOC_MAX_PAIR_MEETINGS} times: ` +
        overmetPairs.slice(0, 5).join(", "),
    });
  }

  // Invariant 9: ≥ OOC_MIN_UNIQUE_OPPONENTS unique OOC opponents per team.
  const oocOpponents = new Map<string, Set<string>>();
  for (const t of teams) oocOpponents.set(t.id, new Set());
  for (const g of oocGames) {
    oocOpponents.get(g.homeTeamId)?.add(g.awayTeamId);
    oocOpponents.get(g.awayTeamId)?.add(g.homeTeamId);
  }
  const fewOoc = teams.filter(t => (oocOpponents.get(t.id)?.size ?? 0) < OOC_MIN_UNIQUE_OPPONENTS);
  if (fewOoc.length > 0) {
    errors.push({
      code: "OOC_INSUFFICIENT_VARIETY",
      message: `${fewOoc.length} team(s) face fewer than ${OOC_MIN_UNIQUE_OPPONENTS} unique OOC opponents: ` +
        fewOoc.slice(0, 5).map(t => `${t.name}=${oocOpponents.get(t.id)?.size}`).join(", "),
    });
  }

  return errors;
}
