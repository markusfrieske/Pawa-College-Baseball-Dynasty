/**
 * Full Season scheduler — pure function, no DB calls.
 *
 * Invariants (enforced at call site by validateFullSeasonSchedule):
 *   • Exactly 4,172 regular-season games
 *   • Every team plays exactly 56 games across exactly 14 weeks
 *   • Every team plays exactly 4 games per week
 *   • No games vs same-conference opponent in OOC slots
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

/** OOC constrained matcher for one week.
 *  byeTeamIds: teams that need 4 OOC slots (they have a conf bye this week).
 *  All other teams need 1 OOC slot.
 *  Returns 79 pairs of (home, away) guaranteed to be cross-conference.
 *
 *  Algorithm — "task scheduler" max-heap interleaving:
 *    1. Expand each team into N slots (bye=4, normal=1), grouped by conference.
 *    2. Use a greedy max-heap: always pick the highest-slot-count conference
 *       that is different from the previously placed conference.
 *       This guarantees no two adjacent slots share a conference.
 *    3. Pair adjacent positions (0,1), (2,3), … — since no adjacent pair
 *       shares a conference, all pairs are guaranteed cross-conference.
 *       Bye teams appear 4×; their instances are always separated by slots
 *       from other conferences, so no team is ever paired with itself.
 *
 *  Correctness: Hall's marriage theorem guarantees a valid non-adjacent-same-
 *  conf placement exists iff no single conference holds > ⌊totalSlots/2⌋ + 1
 *  slots.  Our largest conf (Big Ten-17 + 1 bye-team × 4 extra slots = max 20)
 *  is far below the threshold (79 for 158 total slots), so the greedy always
 *  succeeds.
 */
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

function matchOocPairs(
  allTeams: ScheduleTeam[],
  byeTeamIds: Set<string>,
  confIdByTeamId: Map<string, string>,
  weekSeed: number,
): Matchup[] {
  // Step 1: Build per-conference team queues.
  //         Shuffle teams within each conference using weekSeed so the
  //         pairing rotates every week instead of repeating the same matchups.
  const shuffledTeams = seededShuffle(allTeams, weekSeed * 2654435761 + 1);
  const confQueues = new Map<string, ScheduleTeam[]>();
  for (const t of shuffledTeams) {
    const conf = confIdByTeamId.get(t.id)!;
    if (!confQueues.has(conf)) confQueues.set(conf, []);
    const count = byeTeamIds.has(t.id) ? 4 : 1;
    for (let i = 0; i < count; i++) confQueues.get(conf)!.push(t);
  }

  // Max-heap entries: [conf, remainingCount]
  // We use a sorted array re-sorted after each pick (small enough: 12 confs).
  const heap: Array<[string, number]> = Array.from(confQueues.entries())
    .map(([conf, arr]) => [conf, arr.length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Step 2: Greedily build the interleaved slot sequence.
  const slots: ScheduleTeam[] = [];
  let lastConf: string | null = null;

  while (heap.length > 0) {
    // Find the highest-count conf that differs from the last placed conf.
    let pickIdx = 0;
    if (heap[0][0] === lastConf) {
      if (heap.length === 1) {
        // Should be impossible given Hall's condition.
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

  // Step 3: Emit pairs from adjacent positions — cross-conf is guaranteed by
  //         the interleaving.  Alternate home/away with weekSeed for fairness.
  const pairs: Matchup[] = [];
  for (let i = 0; i + 1 < slots.length; i += 2) {
    const isHomeA = (weekSeed + pairs.length) % 2 === 0;
    pairs.push(
      isHomeA
        ? { home: slots[i], away: slots[i + 1] }
        : { home: slots[i + 1], away: slots[i] },
    );
  }
  return pairs;
}

/** Build the full 4,172-game schedule as a pure function.
 *  Throws ScheduleValidationError[] if invariants cannot be met. */
export function buildFullSeasonSchedule(params: FullSeasonScheduleParams): InsertGame[] {
  const { leagueId, season, teams, conferences } = params;

  if (teams.length === 0) throw new Error("No teams provided to scheduler");

  const confById = new Map(conferences.map(c => [c.id, c]));
  const confIdByTeamId = new Map(teams.map(t => [t.id, t.conferenceId]));

  // Group teams by conferenceId.
  const teamsByConf = new Map<string, ScheduleTeam[]>();
  for (const t of teams) {
    if (!teamsByConf.has(t.conferenceId)) teamsByConf.set(t.conferenceId, []);
    teamsByConf.get(t.conferenceId)!.push(t);
  }

  // Build per-conference 14-week RR schedule.
  // weekRounds[confId][week (0-indexed)] = { matchups, byeTeam }
  const confWeekRounds = new Map<string, Array<{ matchups: Matchup[]; byeTeam: ScheduleTeam | null }>>();
  for (const [confId, confTeams] of teamsByConf) {
    const rrRounds = generateRoundRobin(confTeams);
    const weekRounds = expandToWeeks(rrRounds);
    confWeekRounds.set(confId, weekRounds);
  }

  const pendingGames: InsertGame[] = [];

  for (let weekIdx = 0; weekIdx < NUM_WEEKS; weekIdx++) {
    const week = weekIdx + 1;
    const byeTeamIds = new Set<string>();

    // Add conference series games (3 games per matchup).
    for (const [confId, weekRounds] of confWeekRounds) {
      const { matchups, byeTeam } = weekRounds[weekIdx];
      if (byeTeam) byeTeamIds.add(byeTeam.id);
      for (const m of matchups) {
        for (let g = 0; g < GAMES_PER_SERIES; g++) {
          pendingGames.push({
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
      }
    }

    // Add OOC midweek games.
    const oocPairs = matchOocPairs(teams, byeTeamIds, confIdByTeamId, weekIdx);
    for (const ooc of oocPairs) {
      pendingGames.push({
        leagueId,
        season,
        week,
        homeTeamId: ooc.home.id,
        awayTeamId: ooc.away.id,
        phase: "regular",
        isConference: false,
        gameType: "midweek",
      });
    }
  }

  return pendingGames;
}

/** Validate that the schedule meets all exact invariants.
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

  // Invariant 2: every team plays exactly 56 games.
  const teamGameCounts = new Map<string, number>();
  for (const t of teams) teamGameCounts.set(t.id, 0);
  for (const g of regularGames) {
    teamGameCounts.set(g.homeTeamId, (teamGameCounts.get(g.homeTeamId) ?? 0) + 1);
    teamGameCounts.set(g.awayTeamId, (teamGameCounts.get(g.awayTeamId) ?? 0) + 1);
  }
  const undercount = teams.filter(t => (teamGameCounts.get(t.id) ?? 0) < EXPECTED_GAMES_PER_TEAM);
  const overcount = teams.filter(t => (teamGameCounts.get(t.id) ?? 0) > EXPECTED_GAMES_PER_TEAM);
  if (undercount.length > 0) {
    errors.push({
      code: "TEAM_GAME_UNDERCOUNT",
      message: `${undercount.length} team(s) have fewer than ${EXPECTED_GAMES_PER_TEAM} games: ${undercount.slice(0, 5).map(t => `${t.name}=${teamGameCounts.get(t.id)}`).join(", ")}`,
    });
  }
  if (overcount.length > 0) {
    errors.push({
      code: "TEAM_GAME_OVERCOUNT",
      message: `${overcount.length} team(s) have more than ${EXPECTED_GAMES_PER_TEAM} games: ${overcount.slice(0, 5).map(t => `${t.name}=${teamGameCounts.get(t.id)}`).join(", ")}`,
    });
  }

  // Invariant 3: exactly 4 games per team per week.
  const teamWeekCounts = new Map<string, Map<number, number>>();
  for (const t of teams) teamWeekCounts.set(t.id, new Map());
  for (const g of regularGames) {
    const w = g.week ?? 0;
    for (const tid of [g.homeTeamId, g.awayTeamId]) {
      const wm = teamWeekCounts.get(tid);
      if (wm) wm.set(w, (wm.get(w) ?? 0) + 1);
    }
  }
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
      message: `${weekViolations} team-week slot(s) have ≠ ${EXPECTED_GAMES_PER_WEEK_PER_TEAM} games (expected ${EXPECTED_GAMES_PER_WEEK_PER_TEAM}/team/week for all 14 weeks)`,
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
      message: `${sameConfOoc.length} OOC game(s) involve teams from the same conference (cross-conference only is required)`,
    });
  }

  return errors;
}
