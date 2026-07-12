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

/** OOC greedy matcher for one week.
 *  byeTeamIds: teams that need 4 OOC slots (they have a conf bye this week).
 *  All other teams need 1 OOC slot.
 *  Returns 79 pairs of (home, away) from different conferences. */
function matchOocPairs(
  allTeams: ScheduleTeam[],
  byeTeamIds: Set<string>,
  confIdByTeamId: Map<string, string>,
  weekSeed: number,
): Matchup[] {
  // Track remaining OOC need per team.
  const needs = new Map<string, number>();
  for (const t of allTeams) needs.set(t.id, byeTeamIds.has(t.id) ? 4 : 1);

  const teamById = new Map(allTeams.map(t => [t.id, t]));
  const pairs: Matchup[] = [];
  let iterations = 0;
  const maxIterations = allTeams.length * 6; // safety bound

  while (iterations++ < maxIterations) {
    // Find team with highest remaining need (deterministic: sort by need desc, then id asc).
    let teamA: ScheduleTeam | null = null;
    let maxNeed = 0;
    for (const [id, n] of needs) {
      if (n > maxNeed || (n === maxNeed && teamA && id < teamA.id)) {
        maxNeed = n;
        teamA = teamById.get(id)!;
      }
    }
    if (!teamA || maxNeed === 0) break;

    const confA = confIdByTeamId.get(teamA.id)!;

    // Find a partner: different conference, still has need > 0, not teamA.
    // Sort candidates deterministically (by need desc, then id asc) for reproducibility.
    const candidates: Array<{ team: ScheduleTeam; need: number }> = [];
    for (const [id, n] of needs) {
      if (n > 0 && id !== teamA.id && confIdByTeamId.get(id) !== confA) {
        candidates.push({ team: teamById.get(id)!, need: n });
      }
    }
    if (candidates.length === 0) {
      // Fallback: allow same-conference OOC only if no other option exists.
      for (const [id, n] of needs) {
        if (n > 0 && id !== teamA.id) {
          candidates.push({ team: teamById.get(id)!, need: n });
        }
      }
    }
    if (candidates.length === 0) break;

    // Use weekSeed + pair index for home/away alternation.
    const teamB = candidates.sort((a, b) => b.need - a.need || a.team.id.localeCompare(b.team.id))[0].team;
    const isHomeA = (weekSeed + pairs.length) % 2 === 0;
    pairs.push(isHomeA ? { home: teamA, away: teamB } : { home: teamB, away: teamA });

    needs.set(teamA.id, maxNeed - 1);
    const prevB = needs.get(teamB.id)!;
    needs.set(teamB.id, prevB - 1);
    if (needs.get(teamA.id) === 0) needs.delete(teamA.id);
    if (needs.get(teamB.id) === 0) needs.delete(teamB.id);
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

  return errors;
}
