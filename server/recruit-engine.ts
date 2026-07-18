/**
 * Recruit engine: schedule generation, recruit class generation, player generation,
 * and CPU coach generation. These are module-scope helpers used by both route
 * handlers and season-simulation functions.
 *
 * All functions are exported so they can be imported wherever needed instead
 * of relying on closure scope inside registerRoutes.
 */
import { storage } from "./storage";
import type { InsertGame } from "@shared/schema";
import { calculateOVR, getStarRatingFromOVR, getRandomAbilities, getAbilitiesForPosition, enforceGoldOvrGate } from "../shared/abilities";
import { generateRecruitClass, selectTools, genToolAttr, sampleNormalSpeed, sampleNormalVelocity, HITTER_TOOL_GROUPS, PITCHER_TOOL_GROUPS, pickHandedness } from "./recruit-generator";
import { normalizeCommonAbilities } from "./normalizeCommonAbilities";
import { assignPitcherArchetype, generateArchetypePitchMix, qualityTierFromOvr } from "./pitchMixHelpers";
import { getPotentialRange, getProgressionZone, rollWeightedPotential, rollV3Potential, getPotentialGrade } from "../shared/potential";
import { initializeStorylineRecruits } from "./storyline-routes";

import { assignTrajectory } from "../shared/trajectory";
import { getRealRosters } from "./realRostersLoader";
import { potentialGradeToNumber, ensureCoachTraits } from "./route-helpers";
import { noPitches } from "./pitchMixHelpers";


// Helper functions

export const SCOUT_ATTRS = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina", "stuff"] as const;

/** Reveal exactly `count` new attributes chosen at random from those not yet in `existing`. */
export function getAttributesToRevealCount(count: number, existing: string[] = []): string[] {
  const remaining = SCOUT_ATTRS.filter(a => !existing.includes(a));
  const toReveal: string[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    toReveal.push(...remaining.splice(idx, 1));
  }
  return toReveal;
}

/**
 * Percentage-based wrapper used for the **first** scout action (no existing attrs).
 * Uses target-based count so the floor is applied once, not compounded across calls.
 */
export function getAttributesToReveal(percentage: number, existing: string[] = []): string[] {
  const targetTotal = Math.floor((percentage / 100) * SCOUT_ATTRS.length);
  const needToReveal = Math.max(0, targetTotal - existing.length);
  return getAttributesToRevealCount(needToReveal, existing);
}

export async function generateSchedule(leagueId: string, season: number = 1) {
  const league = await storage.getLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  
  const numTeams = leagueTeams.length;
  if (numTeams < 2) return;

  const seasonLength = league?.seasonLength || "standard";
  const isFullSeason = seasonLength === "full_season";

  type TeamType = typeof leagueTeams[0];
  type Matchup = { home: TeamType; away: TeamType };

  const shuffle = <T>(arr: T[]): T[] => {
    const a = Array.from(arr);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const generateRoundRobin = (teams: TeamType[]): Matchup[][] => {
    const n = teams.length;
    if (n < 2) return [];
    const list = Array.from(teams);
    if (n % 2 !== 0) list.push(null as any);
    const count = list.length;
    const rounds: Matchup[][] = [];
    for (let r = 0; r < count - 1; r++) {
      const round: Matchup[] = [];
      for (let i = 0; i < count / 2; i++) {
        const t1 = list[i];
        const t2 = list[count - 1 - i];
        if (t1 && t2) {
          round.push(r % 2 === 0 ? { home: t1, away: t2 } : { home: t2, away: t1 });
        }
      }
      rounds.push(round);
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
    return rounds;
  }

  const numWeeks = seasonLength === "full_season" ? 14 : seasonLength === "long" ? 15 : seasonLength === "medium" ? 10 : 5;

  const confMap = new Map<string, TeamType[]>();
  for (const team of leagueTeams) {
    const cid = team.conferenceId || "none";
    if (!confMap.has(cid)) confMap.set(cid, []);
    confMap.get(cid)!.push(team);
  }

  // Per-conference games-per-series (gps):
  //
  // Standard format: 3-game Fri/Sat/Sun conference series + 1 OOC midweek per week.
  // Short season uses 1-game series; long and medium always use 3-game series.
  //
  // For odd-sized conferences (e.g. a 5-team conf in a 13-team league) teams will end up
  // with fewer conference games than even-conference teams because of the phantom-team bye.
  // The safety top-up loop below adds extra OOC midweek games to close that gap; post-
  // generation validation uses a soft range check rather than requiring strict equality.
  const confGpsMap = new Map<string, number>();
  for (const [cid, confTeams] of Array.from(confMap)) {
    if (seasonLength === "short") {
      confGpsMap.set(cid, 1);
    } else {
      // medium and long: always 3-game Fri/Sat/Sun series, regardless of conference size
      confGpsMap.set(cid, 3);
    }
  }

  // For backward compat references, confGamesPerSeries stays 3 for even confs
  const confGamesPerSeries = seasonLength === "short" ? 1 : 3;

  const confWeeklyRounds = new Map<string, Matchup[][]>();
  for (const [cid, confTeams] of Array.from(confMap)) {
    const rounds = generateRoundRobin(confTeams);
    let weekRounds: Matchup[][] = [];

    if (isFullSeason) {
      // ── Full-season conference schedule (14 weeks) ─────────────────────────
      // Target: ~40 conference games per team (13–14 3-game series).
      //
      // Per-conference series targets by size:
      //   ≤14 opponents (8,10,11,12,13,14-team confs): double the round-robin
      //     (home + away copy) so teams play each opponent at least once, with
      //     repeat opponents filling remaining weeks. Slice to 14 weeks.
      //     • 8-team (7 rds):  doubled=14, slice=14 → 14 series per team ✓
      //     • 10-team (9 rds): doubled=18, slice=14 → 14 series per team ✓
      //     • 12-team (11 rds): doubled=22, slice=14 → 14 series per team ✓
      //     • 14-team (13 rds): doubled=26, slice=14 → 14 series per team ✓
      //   >14 opponents (16,17-team confs): more rounds than weeks → skip
      //     doubling; slice the raw round-robin to 14 for a partial round-robin.
      //     This guarantees every team plays at least 14/15 = 93% of conference
      //     opponents (well above the 60% minimum for large conferences).
      //     Odd (17-team with phantom): ~13 real series per team after byes.
      if (rounds.length <= numWeeks) {
        // Small/mid conferences: double for home & away variety, then fill
        const reversedRounds = rounds.map(round => round.map(m => ({ home: m.away, away: m.home })));
        weekRounds = [...rounds, ...reversedRounds];
      } else {
        // Large conferences (16–17 teams): partial round-robin via slicing
        weekRounds = Array.from(rounds);
      }
    } else if (seasonLength === "long") {
      const reversedRounds = rounds.map(round => round.map(m => ({ home: m.away, away: m.home })));
      weekRounds = [...rounds, ...reversedRounds];
    } else {
      weekRounds = Array.from(rounds);
    }

    while (weekRounds.length < numWeeks) {
      for (const r of shuffle(rounds)) {
        if (weekRounds.length >= numWeeks) break;
        weekRounds.push(r.map(m => Math.random() > 0.5 ? m : { home: m.away, away: m.home }));
      }
    }

    // Always take the first numWeeks rounds deterministically so the schedule
    // is reproducible and consistent. The round-robin algorithm already
    // distributes bye weeks evenly across all positions; no pre-slice shuffle
    // is needed. Any remaining game-count deficit for odd-sized conferences
    // is closed by the top-up OOC loop below.
    weekRounds = weekRounds.slice(0, numWeeks);
    const shuffledOrder = shuffle(weekRounds.map((_, i) => i));
    let ordered = shuffledOrder.map(i => weekRounds[i]);

    // Enforce no back-to-back same-conference-opponent constraint.
    // Strategy: scan left-to-right; on conflict at week w, try every possible swap
    // partner (w+2 … end) deterministically and keep the first one that resolves
    // the conflict. If no single swap works, re-shuffle and retry up to 5 times.
    // For typical season lengths (5–10 weeks) this always resolves.
    const hasConflict = (rounds: typeof ordered): number => {
      for (let w = 0; w < rounds.length - 1; w++) {
        const A = rounds[w];
        const B = rounds[w + 1];
        if (A.some(mA => B.some(mB =>
          (mA.home.id === mB.home.id && mA.away.id === mB.away.id) ||
          (mA.home.id === mB.away.id && mA.away.id === mB.home.id)
        ))) return w;
      }
      return -1;
    }

    let resolved = false;
    for (let outerAttempt = 0; outerAttempt < 5 && !resolved; outerAttempt++) {
      let conflictW: number;
      while ((conflictW = hasConflict(ordered)) !== -1) {
        let swapped = false;
        for (let swapWith = conflictW + 2; swapWith < ordered.length; swapWith++) {
          [ordered[conflictW + 1], ordered[swapWith]] = [ordered[swapWith], ordered[conflictW + 1]];
          if (hasConflict(ordered) !== conflictW) { swapped = true; break; }
          // Revert — this swap introduced an equal or earlier conflict
          [ordered[conflictW + 1], ordered[swapWith]] = [ordered[swapWith], ordered[conflictW + 1]];
        }
        if (!swapped) break; // No single swap resolved it — fall through to re-shuffle
      }
      if (hasConflict(ordered) === -1) { resolved = true; break; }
      ordered = shuffle(Array.from(ordered)); // Re-shuffle and try again
    }

    confWeeklyRounds.set(cid, ordered);
  }

  // Track which teams have already faced each other as OOC opponents this season
  const oocSeasonHistory = new Map<string, Set<string>>();

  // Buffer all game inserts; flushed in one batch at the end (M2 performance).
  const pendingGames: InsertGame[] = [];

  // Track per-team game counts in-memory during generation (avoids a post-loop DB query).
  const teamGameCounts = new Map<string, number>();
  for (const t of leagueTeams) teamGameCounts.set(t.id, 0);

  // Track per-team, per-week midweek OOC game counts so the top-up loop can
  // distribute extra games to the lightest weeks instead of stacking on the last week.
  const teamWeekMidweekCounts = new Map<string, Map<number, number>>();
  for (const t of leagueTeams) teamWeekMidweekCounts.set(t.id, new Map<number, number>());

  // Track conf-bye weeks: weeks where a team has no conference series scheduled.
  // These are the true deficit weeks preferred for top-up OOC placement.
  const teamConfByeWeeks = new Map<string, Set<number>>();
  for (const t of leagueTeams) teamConfByeWeeks.set(t.id, new Set<number>());

  // ── Full-season fast OOC precomputation ───────────────────────────────────
  // The standard backtracking matchOOC() is fine for small custom leagues but
  // would recurse 74 levels deep for 149 teams (N/2 pairs per week × 14 weeks).
  // For full_season we precompute a conference-interleaved team order so the
  // per-week OOC matching degrades to a simple O(N) index-pair operation.
  //
  // Interleaving: slot = [c0[0], c1[0], ..., c11[0], c0[1], c1[1], ...]
  // Same-conference teams are ~numConfs positions apart in the list.
  // Pairing index i with i+N/2: the conference offset is (N/2) % numConfs.
  // With N=149, numConfs=12 → N/2=74, 74 % 12 = 2, so pairs are always 2+
  // conferences apart — guaranteed cross-conference for nearly every pair.
  const confArraysFull: (typeof leagueTeams)[] = [];
  const interleavedTeamsFull: (typeof leagueTeams[0])[] = [];
  const confByTeamIdFull = new Map<string, string>();
  if (isFullSeason) {
    for (const [cid, teams] of Array.from(confMap)) {
      confArraysFull.push(teams);
      for (const t of teams) confByTeamIdFull.set(t.id, cid);
    }
    const maxSlot = Math.max(...confArraysFull.map(c => c.length));
    for (let slot = 0; slot < maxSlot; slot++) {
      for (const conf of confArraysFull) {
        if (slot < conf.length) interleavedTeamsFull.push(conf[slot]);
      }
    }
  }

  let totalGames = 0;
  for (let week = 0; week < numWeeks; week++) {
    const weekConfSeries: Matchup[] = [];

    for (const [cid, rounds] of Array.from(confWeeklyRounds)) {
      const round = rounds[week];
      if (!round) continue;
      for (const matchup of round) {
        weekConfSeries.push({ ...matchup, _cid: cid } as Matchup & { _cid: string });
      }
    }

    // Record which teams have a conf-bye this week (no conference series scheduled).
    // These are the preferred weeks for top-up OOC games since the team has capacity.
    const teamsWithConfSeriesThisWeek = new Set<string>();
    for (const s of weekConfSeries) {
      teamsWithConfSeriesThisWeek.add(s.home.id);
      teamsWithConfSeriesThisWeek.add(s.away.id);
    }
    for (const t of leagueTeams) {
      if (!teamsWithConfSeriesThisWeek.has(t.id)) {
        teamConfByeWeeks.get(t.id)!.add(week + 1);
      }
    }

    for (const series of weekConfSeries as (Matchup & { _cid?: string })[]) {
      const gps = confGpsMap.get(series._cid ?? "") ?? confGamesPerSeries;
      const gameTypeList =
        gps === 3 ? ["friday", "saturday", "sunday"]
        : ["friday"];
      for (let g = 0; g < gps; g++) {
        pendingGames.push({
          leagueId,
          season,
          week: week + 1,
          homeTeamId: series.home.id,
          awayTeamId: series.away.id,
          phase: "regular",
          isConference: true,
          gameType: gameTypeList[g] || "friday",
        });
        totalGames++;
        teamGameCounts.set(series.home.id, (teamGameCounts.get(series.home.id) ?? 0) + 1);
        teamGameCounts.set(series.away.id, (teamGameCounts.get(series.away.id) ?? 0) + 1);
      }
    }

    const oocPairs: Matchup[] = [];
    const conferences = Array.from(confMap.keys());

    if (isFullSeason && confArraysFull.length >= 2 && interleavedTeamsFull.length >= 2) {
      // ── Full-season fast OOC matching ──────────────────────────────────────
      // Strategy: rotate the interleaved list by (week × rotStep) each week,
      // then pair rotated[1+i] with rotated[1+i+half].
      //   • rotated[0] is the weekly bye team (rotates through all 149 over time).
      //   • The interleaved ordering guarantees index i and i+half are from
      //     conferences that are (half % numConfs) = 74 % 12 = 2 apart → always
      //     different for the vast majority of pairings.
      //   • 149 is prime, so rotStep=numConfs+1=13 is coprime to N → the offset
      //     cycles through all 149 positions, giving variety across 14 weeks.
      // Same-conference residual pairs (near array boundaries) are skipped; the
      // top-up loop below fills those deficits with extra OOC midweek games.
      const N = interleavedTeamsFull.length; // 149
      const numConfsFull = confArraysFull.length; // 12
      const rotStep = numConfsFull + 1; // 13 — coprime to 149
      const offset = (week * rotStep) % N;
      const rotated = offset === 0
        ? interleavedTeamsFull
        : [...interleavedTeamsFull.slice(offset), ...interleavedTeamsFull.slice(0, offset)];

      // rotated[0] is the weekly bye; pair rotated[1..half] with rotated[half+1..N-1]
      const half = Math.floor((N - 1) / 2); // 74 for N=149
      for (let i = 0; i < half; i++) {
        const t1 = rotated[1 + i];
        const t2 = rotated[1 + i + half];
        if (!t1 || !t2) continue;
        // Skip same-conference pairings (top-up loop handles deficit)
        if (confByTeamIdFull.get(t1.id) === confByTeamIdFull.get(t2.id)) continue;
        const isHome = Math.random() > 0.5;
        oocPairs.push(isHome ? { home: t1, away: t2 } : { home: t2, away: t1 });
        if (!oocSeasonHistory.has(t1.id)) oocSeasonHistory.set(t1.id, new Set());
        if (!oocSeasonHistory.has(t2.id)) oocSeasonHistory.set(t2.id, new Set());
        oocSeasonHistory.get(t1.id)!.add(t2.id);
        oocSeasonHistory.get(t2.id)!.add(t1.id);
      }
    } else if (conferences.length >= 2) {
      // ── Standard backtracking OOC matching (custom leagues, up to ~20 teams) ──
      // Build conference lookup once per league (idempotent across weeks)
      const confByTeamId = new Map<string, string>();
      for (const [cid, teams] of Array.from(confMap)) {
        for (const t of teams) confByTeamId.set(t.id, cid);
      }

      // Sort teams most-constrained first: teams with fewer cross-conf
      // candidates are placed first so backtracking finds solutions faster.
      const allTeams = Array.from(leagueTeams).sort((a: any, b: any) => {
        const optsA = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(a.id)).length;
        const optsB = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(b.id)).length;
        return optsA - optsB;
      });

      // Build candidate lists per team:
      //   Tier 1 – cross-conference AND not yet met this season (preferred)
      //   Tier 2 – cross-conference AND already met this season (acceptable)
      // Within each tier, rotate by week so the same match-up doesn't recur
      // every time we fall back to repeat opponents.
      const candidatesFor = new Map<string, TeamType[]>();
      for (const team of allTeams) {
        const confId = confByTeamId.get(team.id)!;
        const xConf = allTeams.filter(t => confByTeamId.get(t.id) !== confId);
        const offset = week % Math.max(xConf.length, 1);
        const rotated = [...xConf.slice(offset), ...xConf.slice(0, offset)];
        const tier1 = rotated.filter(t => !oocSeasonHistory.get(team.id)?.has(t.id));
        const tier2 = rotated.filter(t => oocSeasonHistory.get(team.id)?.has(t.id));
        candidatesFor.set(team.id, [...tier1, ...tier2]);
      }

      // For odd-N leagues: rotate a bye team each week so perfect-matching succeeds.
      // The bye team sits out OOC this week (gets only conference games).
      let oocParticipants = Array.from(allTeams);
      if (oocParticipants.length % 2 !== 0) {
        const byeIdx = week % oocParticipants.length;
        const byeTeamId = oocParticipants[byeIdx].id;
        oocParticipants = oocParticipants.filter((_, i) => i !== byeIdx);
        // Remove bye team from all candidate lists so it cannot be selected as opponent
        for (const [tid, cands] of Array.from(candidatesFor)) {
          candidatesFor.set(tid, cands.filter(t => t.id !== byeTeamId));
        }
      }

      // Backtracking perfect-matching:
      // Recurse through oocParticipants in order; skip already-paired teams.
      // Try each candidate from candidatesFor until a complete matching is found.
      // This guarantees every non-bye team gets exactly one cross-conf OOC game per week.
      const workPairs: Matchup[] = [];
      const used = new Set<string>();

      const matchOOC = (idx: number): boolean => {
        while (idx < oocParticipants.length && used.has(oocParticipants[idx].id)) idx++;
        if (idx >= oocParticipants.length) return true; // all participants paired

        const team = oocParticipants[idx];
        for (const opp of candidatesFor.get(team.id) ?? []) {
          if (used.has(opp.id)) continue;
          used.add(team.id);
          used.add(opp.id);
          const isHome = Math.random() > 0.5;
          workPairs.push(isHome ? { home: team, away: opp } : { home: opp, away: team });
          if (matchOOC(idx + 1)) return true;
          used.delete(team.id);
          used.delete(opp.id);
          workPairs.pop();
        }
        return false; // no valid partner — caller will try a different branch
      }

      const matched = matchOOC(0);

      if (matched) {
        for (const pair of workPairs) {
          oocPairs.push(pair);
          const hId = pair.home.id;
          const aId = pair.away.id;
          if (!oocSeasonHistory.has(hId)) oocSeasonHistory.set(hId, new Set());
          if (!oocSeasonHistory.has(aId)) oocSeasonHistory.set(aId, new Set());
          oocSeasonHistory.get(hId)!.add(aId);
          oocSeasonHistory.get(aId)!.add(hId);
        }
      }
      // matched should always be true for balanced multi-conf leagues;
      // if it ever fails (all-same-conf edge case) week simply has no OOC games.
    } else {
      // Single conference fallback: pair within the conference
      const available = shuffle(Array.from(leagueTeams));
      for (let i = 0; i + 1 < available.length; i += 2) {
        oocPairs.push({ home: available[i], away: available[i + 1] });
      }
    }

    // Guard: each team should appear at most once in oocPairs this week (cap = 1 midweek OOC).
    // Log an error if the matching produced a duplicate (should never happen).
    {
      const oocTeamSeen = new Set<string>();
      for (const ooc of oocPairs) {
        for (const tid of [ooc.home.id, ooc.away.id]) {
          if (oocTeamSeen.has(tid)) {
            const name = leagueTeams.find(t => t.id === tid)?.name ?? tid;
            console.error(`[schedule-ooc-guard] Week ${week + 1}: team ${name} assigned >1 OOC game (expected ≤1)`);
          }
          oocTeamSeen.add(tid);
        }
      }
    }

    for (const ooc of oocPairs) {
      const wk = week + 1;
      pendingGames.push({
        leagueId,
        season,
        week: wk,
        homeTeamId: ooc.home.id,
        awayTeamId: ooc.away.id,
        phase: "regular",
        isConference: false,
        gameType: "midweek",
      });
      totalGames++;
      teamGameCounts.set(ooc.home.id, (teamGameCounts.get(ooc.home.id) ?? 0) + 1);
      teamGameCounts.set(ooc.away.id, (teamGameCounts.get(ooc.away.id) ?? 0) + 1);
      const hMw = teamWeekMidweekCounts.get(ooc.home.id)!;
      hMw.set(wk, (hMw.get(wk) ?? 0) + 1);
      const aMw = teamWeekMidweekCounts.get(ooc.away.id)!;
      aMw.set(wk, (aMw.get(wk) ?? 0) + 1);
    }
  }

  // Target: reach targetGamesPerTeam regular-season games for each team.
  // Odd-sized conferences (e.g. 5-team) get fewer conf games due to phantom-team byes;
  // the top-up loop below bridges the gap with extra OOC midweek games.
  const targetGamesPerTeam = seasonLength === "full_season" ? 56 : seasonLength === "long" ? 60 : seasonLength === "medium" ? 40 : 20;
  const topupCeiling = targetGamesPerTeam + 4; // prevent runaway inflation
  const confByTeamFinal = new Map<string, string>();
  for (const [cid, teams] of Array.from(confMap)) for (const t of teams) confByTeamFinal.set(t.id, cid);
  // Safety top-up: adds OOC midweek games for any team below the target.
  // Partners may be at or above the base target (to handle odd-conf deficits) as long as
  // they have not exceeded the per-team ceiling.
  // topupSkipped: teams whose week slots are fully at cap; exclude from further attempts
  // to prevent infinite loops when a team genuinely cannot be placed.
  const topupSkipped = new Set<string>();
  for (let topupIter = 0; topupIter < leagueTeams.length * 10; topupIter++) {
    const underserved = leagueTeams
      .filter(t => (teamGameCounts.get(t.id) ?? 0) < targetGamesPerTeam && !topupSkipped.has(t.id))
      .sort((a: any, b: any) => (teamGameCounts.get(a.id) ?? 0) - (teamGameCounts.get(b.id) ?? 0));
    if (underserved.length === 0) break;
    const t1 = underserved[0];
    // Allow any cross-conf team that has not hit the ceiling (not just underserved ones)
    const t2 = leagueTeams
      .filter(t =>
        t.id !== t1.id &&
        confByTeamFinal.get(t.id) !== confByTeamFinal.get(t1.id) &&
        (teamGameCounts.get(t.id) ?? 0) < topupCeiling
      )
      .sort((a: any, b: any) => (teamGameCounts.get(a.id) ?? 0) - (teamGameCounts.get(b.id) ?? 0))[0];
    if (!t2) {
      console.error(`[schedule-topup] No cross-conf partner available for ${t1.name} (${teamGameCounts.get(t1.id)} games, target ${targetGamesPerTeam}, ceiling ${topupCeiling}); stopping top-up`);
      break;
    }
    const mw1 = teamWeekMidweekCounts.get(t1.id)!;
    const mw2 = teamWeekMidweekCounts.get(t2.id)!;
    const bye1 = teamConfByeWeeks.get(t1.id)!;
    const bye2 = teamConfByeWeeks.get(t2.id)!;

    // Week selection — two tiers, picked in priority order:
    //
    // Tier 1 (cap = 1): Both teams have midweek=0 this week — no game assigned yet.
    //   Prefer weeks where at least one team is also on conf-bye (most capacity).
    //   Stop immediately when both teams are on conf-bye (ideal slot found).
    //
    // Tier 2 (cap = 2): Tier 1 produced no result. Both teams must be under cap=2
    //   AND at least one must be on conf-bye (deficit week — no 3-game series).
    //   Pick the lightest combined week. This is only reached when Tier 1 fails,
    //   which happens when all weeks already have 1 OOC game for at least one team
    //   (e.g. odd-conf teams in even-total leagues whose regular OOC fills every week).
    //
    // If still no valid week, mark t1 as exhausted (topupSkipped) and continue so
    // other underserved teams can still receive their top-up games.

    let topupWeek: number | null = null;

    // Tier 1 — both teams have zero midweek games this week (cap = 1 enforced)
    for (let w = 1; w <= numWeeks; w++) {
      const c1 = mw1.get(w) ?? 0;
      const c2 = mw2.get(w) ?? 0;
      if (c1 !== 0 || c2 !== 0) continue;
      if (topupWeek === null || bye1.has(w) || bye2.has(w)) topupWeek = w;
      if (bye1.has(w) && bye2.has(w)) break; // both on bye — ideal
    }

    // Tier 2 — fallback: conf-bye week(s) for at least one team, both under cap=2
    if (topupWeek === null) {
      let bestScore = Infinity;
      for (let w = 1; w <= numWeeks; w++) {
        const c1 = mw1.get(w) ?? 0;
        const c2 = mw2.get(w) ?? 0;
        if (c1 >= 2 || c2 >= 2) continue;
        if (!bye1.has(w) && !bye2.has(w)) continue; // must be a deficit week
        const score = c1 + c2 + (bye1.has(w) && bye2.has(w) ? 0 : 1);
        if (score < bestScore) { bestScore = score; topupWeek = w; }
      }
    }

    // Tier 3 — last resort: any week where both teams are under cap=2, picking the
    // lightest week (minimise max(c1,c2), break ties by c1+c2). This handles odd-conf
    // configurations where a team has a conf-bye AND league-OOC-bye in the same week,
    // creating a deficit too large to fill from conf-bye weeks alone. Without this tier
    // those teams cannot reach targetGamesPerTeam. The global cap=2 (no week gets more
    // than 2 midweek OOC games per team) prevents runaway flooding.
    if (topupWeek === null) {
      let bestMax = Infinity;
      let bestSum = Infinity;
      for (let w = 1; w <= numWeeks; w++) {
        const c1 = mw1.get(w) ?? 0;
        const c2 = mw2.get(w) ?? 0;
        if (c1 >= 2 || c2 >= 2) continue;
        const wMax = Math.max(c1, c2);
        const wSum = c1 + c2;
        if (wMax < bestMax || (wMax === bestMax && wSum < bestSum)) {
          bestMax = wMax; bestSum = wSum; topupWeek = w;
        }
      }
    }

    // No valid week found (all weeks at cap=2 for at least one team) — mark t1 as
    // exhausted and continue so other underserved teams still receive their top-up games.
    if (topupWeek === null) {
      console.warn(
        `[schedule-topup] No valid week for ${t1.name}+${t2.name} —` +
        ` skipping ${t1.name} (games=${teamGameCounts.get(t1.id)}, target=${targetGamesPerTeam}).`
      );
      topupSkipped.add(t1.id);
      continue;
    }

    const isHome = Math.random() > 0.5;
    pendingGames.push({
      leagueId, season, week: topupWeek,
      homeTeamId: isHome ? t1.id : t2.id,
      awayTeamId: isHome ? t2.id : t1.id,
      phase: "regular", isConference: false, gameType: "midweek",
    });
    mw1.set(topupWeek, (mw1.get(topupWeek) ?? 0) + 1);
    mw2.set(topupWeek, (mw2.get(topupWeek) ?? 0) + 1);
    teamGameCounts.set(t1.id, (teamGameCounts.get(t1.id) ?? 0) + 1);
    teamGameCounts.set(t2.id, (teamGameCounts.get(t2.id) ?? 0) + 1);
    totalGames++;
  }

  // Atomically replace the unplayed regular schedule. A failed or retried
  // dynasty start can never leave a partial schedule or append duplicates.
  await storage.replaceRegularGamesByLeagueSeason(leagueId, season, pendingGames);

  // Post-generation validation: soft range check — warn if any team is more than 4 below target.
  const gameCounts = leagueTeams.map(t => teamGameCounts.get(t.id) ?? 0);
  const minGames = Math.min(...gameCounts);
  const maxGames = Math.max(...gameCounts);
  const farBelow = leagueTeams.filter(t => (teamGameCounts.get(t.id) ?? 0) < targetGamesPerTeam - 4);
  if (farBelow.length > 0) {
    console.warn(
      `[schedule-validation] WARNING: ${farBelow.length} team(s) more than 4 games below target ${targetGamesPerTeam}:`,
      farBelow.map(t => `${t.name}=${teamGameCounts.get(t.id)}`).join(', ')
    );
  } else {
    console.log(`[schedule-validation] OK — team game counts: min=${minGames} max=${maxGames} target=${targetGamesPerTeam}`);
  }

  // Hard total-game check for full_season: total games must be within ±5 absolute
  // of numTeams × targetGamesPerTeam / 2. A deviation larger than ±5 indicates
  // the top-up or OOC matching failed to meet the schedule contract.
  if (isFullSeason) {
    const expectedTotal = Math.round(leagueTeams.length * targetGamesPerTeam / 2);
    const toleranceGames = 5; // ±5 absolute (per task requirement)
    const diff = totalGames - expectedTotal;
    if (Math.abs(diff) > toleranceGames) {
      console.error(
        `[schedule-validation] FULL_SEASON HARD CHECK: total games ${totalGames} is` +
        ` outside ±${toleranceGames} of expected ${expectedTotal} (diff=${diff > 0 ? '+' : ''}${diff}).` +
        ` This may indicate a top-up or OOC matching failure.`
      );
    } else {
      console.log(
        `[schedule-validation] full_season total games OK: ${totalGames}` +
        ` (expected ~${expectedTotal}, diff=${diff > 0 ? '+' : ''}${diff})`
      );
    }
  }

  console.log(`Schedule generated for league ${leagueId} season ${season}: ${seasonLength} format, ${numWeeks} weeks, ${totalGames} total games (batched ${pendingGames.length} game inserts)`);
}

export async function generateExhibitionGames(leagueId: string, season: number) {
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  if (leagueTeams.length < 2) return;

  // Idempotent — skip if exhibition games already exist for this season
  const existing = await storage.getGamesByLeagueSeason(leagueId, season);
  if (existing.some((g: any) => g.phase === "exhibition")) return;

  const shuffle = <T>(arr: T[]): T[] => {
    const a = Array.from(arr);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Build conference lookup from team.conferenceId (no extra DB call needed)
  const confByTeamId = new Map<string, string>();
  for (const t of leagueTeams) {
    if (t.conferenceId) confByTeamId.set(t.id, t.conferenceId);
  }
  const hasMultipleConfs =
    new Set(leagueTeams.map(t => t.conferenceId).filter(Boolean)).size >= 2;

  const league = await storage.getLeague(leagueId);
  const TARGET = league?.seasonLength === "full_season" ? 4 : league?.seasonLength === "long" ? 9 : league?.seasonLength === "medium" ? 6 : 3; // 3/6/9 spring games per standard/medium/long; full_season=4
  const matchups: Array<{ homeTeamId: string; awayTeamId: string }> = [];
  const gameCounts = new Map(leagueTeams.map(t => [t.id, 0]));

  // Track which teams have already faced each other in exhibition (for variety across rounds)
  const exhibHistory = new Map<string, Set<string>>();

  const addPair = (aId: string, bId: string) => {
    const homeFirst = Math.random() > 0.5;
    matchups.push({ homeTeamId: homeFirst ? aId : bId, awayTeamId: homeFirst ? bId : aId });
    gameCounts.set(aId, gameCounts.get(aId)! + 1);
    gameCounts.set(bId, gameCounts.get(bId)! + 1);
    if (!exhibHistory.has(aId)) exhibHistory.set(aId, new Set());
    if (!exhibHistory.has(bId)) exhibHistory.set(bId, new Set());
    exhibHistory.get(aId)!.add(bId);
    exhibHistory.get(bId)!.add(aId);
  }

  // Build cross-conference candidate list for a given participant set and round.
  //   Tier 1 – cross-conf AND not yet met in exhibition (preferred)
  //   Tier 2 – cross-conf AND already met in exhibition (acceptable repeat)
  // Rotated by round so repeat pairings vary across rounds.
  const buildCandidatesFor = (
    participants: typeof leagueTeams,
    round: number,
  ): Map<string, typeof leagueTeams> => {
    const map = new Map<string, typeof leagueTeams>();
    for (const team of participants) {
      const confId = confByTeamId.get(team.id);
      const xConf = participants.filter(t => confByTeamId.get(t.id) !== confId);
      const offset = round % Math.max(xConf.length, 1);
      const rotated = [...xConf.slice(offset), ...xConf.slice(0, offset)];
      const tier1 = rotated.filter(t => !exhibHistory.get(team.id)?.has(t.id));
      const tier2 = rotated.filter(t =>  exhibHistory.get(team.id)?.has(t.id));
      map.set(team.id, [...tier1, ...tier2]);
    }
    return map;
  }

  // Attempt a backtracking perfect OOC matching on the given participants.
  // Returns the pairs if successful, null if no complete matching exists.
  const tryOOCMatch = (
    participants: typeof leagueTeams,
    candidatesFor: Map<string, typeof leagueTeams>,
  ): Array<[string, string]> | null => {
    const pairs: Array<[string, string]> = [];
    const used = new Set<string>();
    const bt = (idx: number): boolean => {
      while (idx < participants.length && used.has(participants[idx].id)) idx++;
      if (idx >= participants.length) return true;
      const team = participants[idx];
      for (const opp of candidatesFor.get(team.id) ?? []) {
        if (used.has(opp.id)) continue;
        used.add(team.id);
        used.add(opp.id);
        pairs.push([team.id, opp.id]);
        if (bt(idx + 1)) return true;
        used.delete(team.id);
        used.delete(opp.id);
        pairs.pop();
      }
      return false;
    }
    return bt(0) ? pairs : null;
  }

  // Maximal OOC greedy: pairs as many cross-conference opponents as possible.
  // Teams with no available OOC partner are left without a game in this round —
  // the top-up phase compensates. Never creates same-conference exhibition pairings.
  const greedyOOCPair = (participants: typeof leagueTeams, round: number) => {
    const cands = buildCandidatesFor(participants, round);
    const tempUsed = new Set<string>();
    for (const team of participants) {
      if (tempUsed.has(team.id)) continue;
      // OOC only — if no cross-conf partner is free, team simply sits out this round
      const partner = (cands.get(team.id) ?? []).find(t => !tempUsed.has(t.id));
      if (!partner) continue;
      tempUsed.add(team.id);
      tempUsed.add(partner.id);
      addPair(team.id, partner.id);
    }
  }

  // 3 proper rounds — each team plays at most once per round.
  // For odd-N leagues, rotate byes so no team sits out more than once.
  const hadBye = new Set<string>();

  // Sort most-constrained-first: teams in smaller conferences have fewer cross-conf options.
  // This ordering is stable across rounds, so compute it once.
  const sorted = Array.from(leagueTeams).sort((a: any, b: any) => {
    const aCands = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(a.id)).length;
    const bCands = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(b.id)).length;
    return aCands - bCands;
  });

  for (let round = 0; round < TARGET; round++) {
    if (hasMultipleConfs) {
      // --- Conference-aware backtracking perfect matching (OOC only) ---

      if (sorted.length % 2 !== 0) {
        // Odd-N: the bye team must be chosen so the remaining participants have a feasible
        // OOC perfect matching. We test each candidate bye in preference order and pick the
        // first one that allows backtracking to succeed.
        //
        // Preference order: teams that (a) haven't had a bye yet, then (b) most games first
        // (sitting out costs them the least). Also try teams that have already had a bye if
        // needed (shouldn't occur in normal ≤16-team leagues over 3 rounds).
        const noBye = sorted.filter(t => !hadBye.has(t.id));
        const maxG = noBye.length > 0 ? Math.max(...noBye.map(t => gameCounts.get(t.id)!)) : 0;
        const preferred = noBye
          .filter(t => gameCounts.get(t.id)! === maxG)
          .sort(() => Math.random() - 0.5);    // random order within same-game-count tier
        const otherNoBye = noBye.filter(t => gameCounts.get(t.id)! !== maxG);
        const alreadyBye = sorted.filter(t => hadBye.has(t.id));
        const byeCandidates = [...preferred, ...otherNoBye, ...alreadyBye];

        let roundDone = false;
        for (const byeTeam of byeCandidates) {
          const participants = sorted.filter(t => t.id !== byeTeam.id);
          const cands = buildCandidatesFor(participants, round);
          const pairs = tryOOCMatch(participants, cands);
          if (pairs !== null) {
            hadBye.add(byeTeam.id);
            for (const [a, b] of Array.from(pairs)) addPair(a, b);
            roundDone = true;
            break;
          }
        }

        if (!roundDone) {
          // No bye candidate enabled a perfect OOC matching (degenerate distribution).
          // Give bye to preferred candidate and use conference-aware greedy fallback.
          const byeTeam = byeCandidates[0];
          hadBye.add(byeTeam.id);
          const participants = sorted.filter(t => t.id !== byeTeam.id);
          greedyOOCPair(participants, round);
          console.warn(`[exhibition] Round ${round + 1}: no bye enables perfect OOC — greedy fallback for league ${leagueId}`);
        }
      } else {
        // Even-N: straightforward backtracking perfect OOC match.
        const cands = buildCandidatesFor(sorted, round);
        const pairs = tryOOCMatch(sorted, cands);
        if (pairs !== null) {
          for (const [a, b] of Array.from(pairs)) addPair(a, b);
        } else {
          // Extremely unlikely for even-N multi-conf leagues. Use OOC-aware greedy fallback.
          greedyOOCPair(sorted, round);
          console.warn(`[exhibition] Round ${round + 1}: even-N backtracking failed — greedy fallback for league ${leagueId}`);
        }
      }
    } else {
      // Single conference — fall back to random pairing within the conference.
      let pool = shuffle(Array.from(leagueTeams));
      if (pool.length % 2 !== 0) {
        const noBye = pool.filter(t => !hadBye.has(t.id));
        const maxG = Math.max(...noBye.map(t => gameCounts.get(t.id)!));
        const top = noBye.filter(t => gameCounts.get(t.id)! === maxG);
        const byeTeam = top[Math.floor(Math.random() * top.length)];
        hadBye.add(byeTeam.id);
        pool = pool.filter(t => t.id !== byeTeam.id);
      }
      for (let i = 0; i < pool.length; i += 2) {
        addPair(pool[i].id, pool[i + 1].id);
      }
    }
  }

  // Top-up: bring every underserved team to TARGET games.
  //
  // Iterative approach: always pick the most-underserved team and find it a partner.
  // In multi-conf mode all top-up games must be OOC — same-conference pairings are
  // never created. Preference is given to cross-conf partners also below TARGET;
  // if none exist, a partner already at TARGET is used (allowing it to reach TARGET+1)
  // to ensure the underserved team still reaches TARGET. Only if no cross-conf partner
  // is available at all is the underserved team skipped.
  // Single-conf mode accepts same-conference pairings.
  const topupSkipped = new Set<string>();
  for (let iter = 0; iter < leagueTeams.length * (TARGET + 2); iter++) {
    const underserved = leagueTeams
      .filter(t => (gameCounts.get(t.id) ?? 0) < TARGET && !topupSkipped.has(t.id))
      .sort((a: any, b: any) => (gameCounts.get(a.id) ?? 0) - (gameCounts.get(b.id) ?? 0));
    if (underserved.length === 0) break;

    const t1 = underserved[0];
    const t1Conf = confByTeamId.get(t1.id);

    let partner: (typeof leagueTeams)[number] | undefined;
    if (hasMultipleConfs) {
      // OOC only: prefer underserved cross-conf first, then fall back to a team already at
      // TARGET (pushing it to TARGET+1) to ensure t1 still reaches TARGET.
      // Never pair with a same-conference team.
      const xConfPool = leagueTeams
        .filter(t => t.id !== t1.id && confByTeamId.get(t.id) !== t1Conf && !topupSkipped.has(t.id))
        .sort((a: any, b: any) => (gameCounts.get(a.id) ?? 0) - (gameCounts.get(b.id) ?? 0));
      partner = xConfPool.find(t => (gameCounts.get(t.id) ?? 0) < TARGET)
             ?? xConfPool.find(t => (gameCounts.get(t.id) ?? 0) === TARGET);
    } else {
      // Single-conf: any team strictly below TARGET.
      partner = shuffle(Array.from(leagueTeams))
        .filter(t => t.id !== t1.id && (gameCounts.get(t.id) ?? 0) < TARGET)[0];
    }

    if (!partner) {
      console.warn(`[exhibition-topup] No eligible partner for ${t1.name} (${gameCounts.get(t1.id)} games) — skipping`);
      topupSkipped.add(t1.id);
      continue;
    }
    addPair(t1.id, partner.id);
  }

  for (const { homeTeamId, awayTeamId } of matchups) {
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId, awayTeamId,
      phase: "exhibition", isConference: false, gameType: "exhibition",
    });
  }
  const minExhib = Math.min(...leagueTeams.map(t => gameCounts.get(t.id)!));
  const maxExhib = Math.max(...leagueTeams.map(t => gameCounts.get(t.id)!));
  const teamsBelow = leagueTeams.filter(t => gameCounts.get(t.id)! < TARGET).length;
  const note = teamsBelow > 0
    ? `${teamsBelow} team(s) below ${TARGET} (skewed conference split)`
    : "all teams at or above TARGET";
  console.log(`[exhibition] Generated ${matchups.length} exhibition games for league ${leagueId} season ${season} (per-team: ${minExhib}–${maxExhib}; ${note})`);
}

export function getTeamsForConference(conferenceName: string) {
  const conferenceTeams: Record<string, Array<{ name: string; mascot: string; abbreviation: string; city: string; state: string; primaryColor: string; secondaryColor: string; prestige: number; stadium: number; facilities: number; collegeLife: number; marketing: number; academics: number; fanbasePassion: string; fanbaseType: string; enrollment: number; nilBudget: number }>> = {
    "SEC": [
      { name: "Alabama", mascot: "Crimson Tide", abbreviation: "BAMA", city: "Tuscaloosa", state: "AL", primaryColor: "#9e1b32", secondaryColor: "#ffffff", prestige: 8, stadium: 6, facilities: 7, collegeLife: 8, marketing: 9, academics: 5, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 38000, nilBudget: 5500000 },
      { name: "Arkansas", mascot: "Razorbacks", abbreviation: "ARK", city: "Fayetteville", state: "AR", primaryColor: "#9d2235", secondaryColor: "#ffffff", prestige: 8, stadium: 9, facilities: 9, collegeLife: 6, marketing: 7, academics: 5, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 30000, nilBudget: 4000000 },
      { name: "Auburn", mascot: "Tigers", abbreviation: "AUB", city: "Auburn", state: "AL", primaryColor: "#0c2340", secondaryColor: "#e87722", prestige: 7, stadium: 5, facilities: 6, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 3500000 },
      { name: "Florida", mascot: "Gators", abbreviation: "FL", city: "Gainesville", state: "FL", primaryColor: "#0037ff", secondaryColor: "#fc4903", prestige: 9, stadium: 8, facilities: 9, collegeLife: 8, marketing: 8, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 55000, nilBudget: 5000000 },
      { name: "Georgia", mascot: "Bulldogs", abbreviation: "UGA", city: "Athens", state: "GA", primaryColor: "#ba0c2f", secondaryColor: "#000000", prestige: 7, stadium: 4, facilities: 5, collegeLife: 8, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 40000, nilBudget: 4000000 },
      { name: "Kentucky", mascot: "Wildcats", abbreviation: "UK", city: "Lexington", state: "KY", primaryColor: "#0033a0", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 7, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 2500000 },
      { name: "LSU", mascot: "Tigers", abbreviation: "LSU", city: "Baton Rouge", state: "LA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 9, stadium: 9, facilities: 9, collegeLife: 9, marketing: 8, academics: 4, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 35000, nilBudget: 5000000 },
      { name: "Mississippi State", mascot: "Bulldogs", abbreviation: "MSST", city: "Starkville", state: "MS", primaryColor: "#660000", secondaryColor: "#ffffff", prestige: 8, stadium: 9, facilities: 8, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 23000, nilBudget: 3000000 },
      { name: "Missouri", mascot: "Tigers", abbreviation: "MIZ", city: "Columbia", state: "MO", primaryColor: "#f1b82d", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 31000, nilBudget: 2500000 },
      { name: "Oklahoma", mascot: "Sooners", abbreviation: "OU", city: "Norman", state: "OK", primaryColor: "#841617", secondaryColor: "#fdf9d8", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 28000, nilBudget: 3000000 },
      { name: "Ole Miss", mascot: "Rebels", abbreviation: "MISS", city: "Oxford", state: "MS", primaryColor: "#14213d", secondaryColor: "#ce1126", prestige: 7, stadium: 9, facilities: 8, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 24000, nilBudget: 3500000 },
      { name: "South Carolina", mascot: "Gamecocks", abbreviation: "SC", city: "Columbia", state: "SC", primaryColor: "#73000a", secondaryColor: "#000000", prestige: 8, stadium: 8, facilities: 7, collegeLife: 7, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 35000, nilBudget: 3000000 },
      { name: "Tennessee", mascot: "Volunteers", abbreviation: "TENN", city: "Knoxville", state: "TN", primaryColor: "#ff8200", secondaryColor: "#ffffff", prestige: 7, stadium: 6, facilities: 7, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 4000000 },
      { name: "Texas", mascot: "Longhorns", abbreviation: "TEX", city: "Austin", state: "TX", primaryColor: "#bf5700", secondaryColor: "#ffffff", prestige: 9, stadium: 9, facilities: 9, collegeLife: 8, marketing: 9, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 52000, nilBudget: 6000000 },
      { name: "Texas A&M", mascot: "Aggies", abbreviation: "TAMU", city: "College Station", state: "TX", primaryColor: "#500000", secondaryColor: "#ffffff", prestige: 7, stadium: 7, facilities: 9, collegeLife: 7, marketing: 8, academics: 6, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 72000, nilBudget: 4500000 },
      { name: "Vanderbilt", mascot: "Commodores", abbreviation: "VAN", city: "Nashville", state: "TN", primaryColor: "#866d4b", secondaryColor: "#000000", prestige: 9, stadium: 5, facilities: 9, collegeLife: 7, marketing: 7, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 4000000 },
    ],
    "ACC": [
      { name: "Boston College", mascot: "Eagles", abbreviation: "BC", city: "Chestnut Hill", state: "MA", primaryColor: "#8b0000", secondaryColor: "#c4a77d", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 15000, nilBudget: 1500000 },
      { name: "California", mascot: "Golden Bears", abbreviation: "CAL", city: "Berkeley", state: "CA", primaryColor: "#003262", secondaryColor: "#fdb515", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Clemson", mascot: "Tigers", abbreviation: "CLEM", city: "Clemson", state: "SC", primaryColor: "#f66733", secondaryColor: "#522d80", prestige: 6, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 27000, nilBudget: 3000000 },
      { name: "Duke", mascot: "Blue Devils", abbreviation: "DUKE", city: "Durham", state: "NC", primaryColor: "#003087", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 4, collegeLife: 6, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 2000000 },
      { name: "Florida State", mascot: "Seminoles", abbreviation: "FSU", city: "Tallahassee", state: "FL", primaryColor: "#782f40", secondaryColor: "#ceb888", prestige: 7, stadium: 7, facilities: 7, collegeLife: 9, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 45000, nilBudget: 3500000 },
      { name: "Georgia Tech", mascot: "Yellow Jackets", abbreviation: "GT", city: "Atlanta", state: "GA", primaryColor: "#003057", secondaryColor: "#b3a369", prestige: 4, stadium: 5, facilities: 6, collegeLife: 6, marketing: 5, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Louisville", mascot: "Cardinals", abbreviation: "LOU", city: "Louisville", state: "KY", primaryColor: "#ad0000", secondaryColor: "#000000", prestige: 5, stadium: 6, facilities: 6, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 23000, nilBudget: 2500000 },
      { name: "Miami", mascot: "Hurricanes", abbreviation: "MIA", city: "Coral Gables", state: "FL", primaryColor: "#f47321", secondaryColor: "#005030", prestige: 8, stadium: 6, facilities: 6, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 3500000 },
      { name: "NC State", mascot: "Wolfpack", abbreviation: "NCS", city: "Raleigh", state: "NC", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 6, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "North Carolina", mascot: "Tar Heels", abbreviation: "UNC", city: "Chapel Hill", state: "NC", primaryColor: "#7bafd4", secondaryColor: "#ffffff", prestige: 7, stadium: 5, facilities: 6, collegeLife: 7, marketing: 7, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 31000, nilBudget: 3000000 },
      { name: "Notre Dame", mascot: "Fighting Irish", abbreviation: "ND", city: "South Bend", state: "IN", primaryColor: "#0c2340", secondaryColor: "#c99700", prestige: 5, stadium: 4, facilities: 5, collegeLife: 6, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 13000, nilBudget: 3000000 },
      { name: "Pittsburgh", mascot: "Panthers", abbreviation: "PITT", city: "Pittsburgh", state: "PA", primaryColor: "#003594", secondaryColor: "#ffb81c", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1500000 },
      { name: "Stanford", mascot: "Cardinal", abbreviation: "STAN", city: "Stanford", state: "CA", primaryColor: "#8c1515", secondaryColor: "#ffffff", prestige: 8, stadium: 5, facilities: 7, collegeLife: 7, marketing: 7, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 3000000 },
      { name: "Virginia", mascot: "Cavaliers", abbreviation: "UVA", city: "Charlottesville", state: "VA", primaryColor: "#232d4b", secondaryColor: "#f84c1e", prestige: 6, stadium: 4, facilities: 6, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 26000, nilBudget: 2500000 },
      { name: "Virginia Tech", mascot: "Hokies", abbreviation: "VT", city: "Blacksburg", state: "VA", primaryColor: "#630031", secondaryColor: "#cf4420", prestige: 5, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "Wake Forest", mascot: "Demon Deacons", abbreviation: "WAKE", city: "Winston-Salem", state: "NC", primaryColor: "#9e7e38", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 6, collegeLife: 6, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 2000000 },
    ],
    "Big 12": [
      { name: "Arizona", mascot: "Wildcats", abbreviation: "ARIZ", city: "Tucson", state: "AZ", primaryColor: "#002449", secondaryColor: "#cc0033", prestige: 5, stadium: 4, facilities: 4, collegeLife: 8, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 2000000 },
      { name: "Arizona State", mascot: "Sun Devils", abbreviation: "ASU", city: "Tempe", state: "AZ", primaryColor: "#8c1d40", secondaryColor: "#ffc627", prestige: 7, stadium: 6, facilities: 5, collegeLife: 9, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 75000, nilBudget: 2500000 },
      { name: "Baylor", mascot: "Bears", abbreviation: "BAY", city: "Waco", state: "TX", primaryColor: "#154734", secondaryColor: "#ffc72c", prestige: 4, stadium: 6, facilities: 7, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 20000, nilBudget: 2000000 },
      { name: "BYU", mascot: "Cougars", abbreviation: "BYU", city: "Provo", state: "UT", primaryColor: "#002e5d", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 4, marketing: 5, academics: 6, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 35000, nilBudget: 2000000 },
      { name: "Cincinnati", mascot: "Bearcats", abbreviation: "CIN", city: "Cincinnati", state: "OH", primaryColor: "#e00122", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Houston", mascot: "Cougars", abbreviation: "HOU", city: "Houston", state: "TX", primaryColor: "#c8102e", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Kansas", mascot: "Jayhawks", abbreviation: "KU", city: "Lawrence", state: "KS", primaryColor: "#0051ba", secondaryColor: "#e8000d", prestige: 3, stadium: 4, facilities: 5, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 28000, nilBudget: 1500000 },
      { name: "Kansas State", mascot: "Wildcats", abbreviation: "KSU", city: "Manhattan", state: "KS", primaryColor: "#512888", secondaryColor: "#ffffff", prestige: 3, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1500000 },
      { name: "Oklahoma State", mascot: "Cowboys", abbreviation: "OKST", city: "Stillwater", state: "OK", primaryColor: "#ff7300", secondaryColor: "#000000", prestige: 8, stadium: 9, facilities: 9, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 2500000 },
      { name: "TCU", mascot: "Horned Frogs", abbreviation: "TCU", city: "Fort Worth", state: "TX", primaryColor: "#4d1979", secondaryColor: "#a3a9ac", prestige: 7, stadium: 7, facilities: 7, collegeLife: 7, marketing: 7, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 2500000 },
      { name: "Texas Tech", mascot: "Red Raiders", abbreviation: "TTU", city: "Lubbock", state: "TX", primaryColor: "#cc0000", secondaryColor: "#000000", prestige: 5, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 40000, nilBudget: 2000000 },
      { name: "UCF", mascot: "Knights", abbreviation: "UCF", city: "Orlando", state: "FL", primaryColor: "#ba9b37", secondaryColor: "#000000", prestige: 4, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 72000, nilBudget: 1500000 },
      { name: "Utah", mascot: "Utes", abbreviation: "UTAH", city: "Salt Lake City", state: "UT", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 3, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 2000000 },
      { name: "West Virginia", mascot: "Mountaineers", abbreviation: "WVU", city: "Morgantown", state: "WV", primaryColor: "#002855", secondaryColor: "#eaaa00", prestige: 4, stadium: 5, facilities: 5, collegeLife: 9, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 26000, nilBudget: 1500000 },
    ],
    "Big Ten": [
      { name: "Illinois", mascot: "Fighting Illini", abbreviation: "ILL", city: "Champaign", state: "IL", primaryColor: "#e84a27", secondaryColor: "#13294b", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 1500000 },
      { name: "Indiana", mascot: "Hoosiers", abbreviation: "IU", city: "Bloomington", state: "IN", primaryColor: "#990000", secondaryColor: "#ffffff", prestige: 5, stadium: 6, facilities: 7, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 45000, nilBudget: 2000000 },
      { name: "Iowa", mascot: "Hawkeyes", abbreviation: "IOWA", city: "Iowa City", state: "IA", primaryColor: "#000000", secondaryColor: "#ffcd00", prestige: 3, stadium: 3, facilities: 3, collegeLife: 9, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 32000, nilBudget: 1500000 },
      { name: "Maryland", mascot: "Terrapins", abbreviation: "MD", city: "College Park", state: "MD", primaryColor: "#e03a3e", secondaryColor: "#ffd520", prestige: 5, stadium: 5, facilities: 6, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 2000000 },
      { name: "Michigan", mascot: "Wolverines", abbreviation: "MICH", city: "Ann Arbor", state: "MI", primaryColor: "#00274c", secondaryColor: "#ffcb05", prestige: 5, stadium: 7, facilities: 7, collegeLife: 7, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "Michigan State", mascot: "Spartans", abbreviation: "MSU", city: "East Lansing", state: "MI", primaryColor: "#18453b", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Minnesota", mascot: "Golden Gophers", abbreviation: "MINN", city: "Minneapolis", state: "MN", primaryColor: "#862334", secondaryColor: "#ffc72c", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 2000000 },
      { name: "Nebraska", mascot: "Cornhuskers", abbreviation: "NEB", city: "Lincoln", state: "NE", primaryColor: "#e41c38", secondaryColor: "#ffffff", prestige: 4, stadium: 7, facilities: 6, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 24000, nilBudget: 2000000 },
      { name: "Northwestern", mascot: "Wildcats", abbreviation: "NW", city: "Evanston", state: "IL", primaryColor: "#4e2a84", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 4, collegeLife: 5, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 2000000 },
      { name: "Ohio State", mascot: "Buckeyes", abbreviation: "OSU", city: "Columbus", state: "OH", primaryColor: "#bb0000", secondaryColor: "#666666", prestige: 5, stadium: 5, facilities: 6, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 61000, nilBudget: 3000000 },
      { name: "Oregon", mascot: "Ducks", abbreviation: "ORE", city: "Eugene", state: "OR", primaryColor: "#154733", secondaryColor: "#fee123", prestige: 4, stadium: 6, facilities: 6, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 2500000 },
      { name: "Penn State", mascot: "Nittany Lions", abbreviation: "PSU", city: "State College", state: "PA", primaryColor: "#041e42", secondaryColor: "#ffffff", prestige: 4, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 88000, nilBudget: 2000000 },
      { name: "Purdue", mascot: "Boilermakers", abbreviation: "PUR", city: "West Lafayette", state: "IN", primaryColor: "#ceb888", secondaryColor: "#000000", prestige: 4, stadium: 3, facilities: 3, collegeLife: 6, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Rutgers", mascot: "Scarlet Knights", abbreviation: "RUT", city: "New Brunswick", state: "NJ", primaryColor: "#cc0033", secondaryColor: "#5f6a72", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "USC", mascot: "Trojans", abbreviation: "USC", city: "Los Angeles", state: "CA", primaryColor: "#990000", secondaryColor: "#ffc72c", prestige: 6, stadium: 4, facilities: 5, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "B", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "UCLA", mascot: "Bruins", abbreviation: "UCLA", city: "Los Angeles", state: "CA", primaryColor: "#2774ae", secondaryColor: "#ffd100", prestige: 8, stadium: 6, facilities: 7, collegeLife: 8, marketing: 8, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 46000, nilBudget: 3500000 },
      { name: "Washington", mascot: "Huskies", abbreviation: "WASH", city: "Seattle", state: "WA", primaryColor: "#4b2e83", secondaryColor: "#b7a57a", prestige: 4, stadium: 5, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 48000, nilBudget: 2000000 },
    ],
    "Pac-12": [
      { name: "Oregon State", mascot: "Beavers", abbreviation: "ORST", city: "Corvallis", state: "OR", primaryColor: "#dc4405", secondaryColor: "#000000", prestige: 9, stadium: 6, facilities: 8, collegeLife: 6, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 34000, nilBudget: 3500000 },
      { name: "Washington State", mascot: "Cougars", abbreviation: "WSU", city: "Pullman", state: "WA", primaryColor: "#981e32", secondaryColor: "#5e6a71", prestige: 4, stadium: 3, facilities: 4, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 30000, nilBudget: 1500000 },
      { name: "Fresno State", mascot: "Bulldogs", abbreviation: "FRES", city: "Fresno", state: "CA", primaryColor: "#db0032", secondaryColor: "#002e6d", prestige: 7, stadium: 5, facilities: 5, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 1800000 },
      { name: "San Diego State", mascot: "Aztecs", abbreviation: "SDSU", city: "San Diego", state: "CA", primaryColor: "#a6192e", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 36000, nilBudget: 1800000 },
      { name: "UNLV", mascot: "Rebels", abbreviation: "UNLV", city: "Las Vegas", state: "NV", primaryColor: "#cf0a2c", secondaryColor: "#666666", prestige: 4, stadium: 4, facilities: 4, collegeLife: 9, marketing: 6, academics: 4, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 30000, nilBudget: 1200000 },
      { name: "Nevada", mascot: "Wolf Pack", abbreviation: "NEV", city: "Reno", state: "NV", primaryColor: "#003366", secondaryColor: "#807f84", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 900000 },
      { name: "New Mexico", mascot: "Lobos", abbreviation: "UNM", city: "Albuquerque", state: "NM", primaryColor: "#ba0c2f", secondaryColor: "#a7a8aa", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1000000 },
      { name: "Air Force", mascot: "Falcons", abbreviation: "AF", city: "Colorado Springs", state: "CO", primaryColor: "#003594", secondaryColor: "#8a8d8f", prestige: 3, stadium: 3, facilities: 4, collegeLife: 2, marketing: 4, academics: 8, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 800000 },
    ],
    "AAC": [
      { name: "East Carolina", mascot: "Pirates", abbreviation: "ECU", city: "Greenville", state: "NC", primaryColor: "#592a8a", secondaryColor: "#fdc82f", prestige: 7, stadium: 7, facilities: 6, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 28000, nilBudget: 2000000 },
      { name: "Wichita State", mascot: "Shockers", abbreviation: "WICH", city: "Wichita", state: "KS", primaryColor: "#ffc72c", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 6, collegeLife: 5, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 16000, nilBudget: 1800000 },
      { name: "Tulane", mascot: "Green Wave", abbreviation: "TUL", city: "New Orleans", state: "LA", primaryColor: "#006747", secondaryColor: "#418fde", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 1800000 },
      { name: "Memphis", mascot: "Tigers", abbreviation: "MEM", city: "Memphis", state: "TN", primaryColor: "#003087", secondaryColor: "#8e9090", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1500000 },
      { name: "South Florida", mascot: "Bulls", abbreviation: "USF", city: "Tampa", state: "FL", primaryColor: "#006747", secondaryColor: "#cfc493", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1800000 },
      { name: "Charlotte", mascot: "49ers", abbreviation: "CLT", city: "Charlotte", state: "NC", primaryColor: "#046a38", secondaryColor: "#b9975b", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "UAB", mascot: "Blazers", abbreviation: "UAB", city: "Birmingham", state: "AL", primaryColor: "#1e6b52", secondaryColor: "#f4c300", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1200000 },
      { name: "Rice", mascot: "Owls", abbreviation: "RICE", city: "Houston", state: "TX", primaryColor: "#00205b", secondaryColor: "#a4a8b1", prestige: 6, stadium: 7, facilities: 6, collegeLife: 7, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 8000, nilBudget: 1500000 },
      { name: "Florida Atlantic", mascot: "Owls", abbreviation: "FAU", city: "Boca Raton", state: "FL", primaryColor: "#003366", secondaryColor: "#cc0000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "North Texas", mascot: "Mean Green", abbreviation: "UNT", city: "Denton", state: "TX", primaryColor: "#00853e", secondaryColor: "#000000", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 1000000 },
      { name: "Dallas Baptist", mascot: "Patriots", abbreviation: "DBU", city: "Dallas", state: "TX", primaryColor: "#002d72", secondaryColor: "#c8102e", prestige: 7, stadium: 5, facilities: 6, collegeLife: 5, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 1500000 },
    ],
    "WCC": [
      { name: "Pepperdine", mascot: "Waves", abbreviation: "PEPP", city: "Malibu", state: "CA", primaryColor: "#00205b", secondaryColor: "#f47920", prestige: 5, stadium: 4, facilities: 5, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1200000 },
      { name: "Loyola Marymount", mascot: "Lions", abbreviation: "LMU", city: "Los Angeles", state: "CA", primaryColor: "#8a0029", secondaryColor: "#003595", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "San Diego", mascot: "Toreros", abbreviation: "USD", city: "San Diego", state: "CA", primaryColor: "#003b70", secondaryColor: "#c69214", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 1000000 },
      { name: "Saint Mary's", mascot: "Gaels", abbreviation: "SMC", city: "Moraga", state: "CA", primaryColor: "#06315b", secondaryColor: "#d20f29", prestige: 5, stadium: 3, facilities: 4, collegeLife: 5, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 4000, nilBudget: 1200000 },
      { name: "Gonzaga", mascot: "Bulldogs", abbreviation: "GONZ", city: "Spokane", state: "WA", primaryColor: "#002967", secondaryColor: "#c8102e", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 8000, nilBudget: 1500000 },
      { name: "Santa Clara", mascot: "Broncos", abbreviation: "SCU", city: "Santa Clara", state: "CA", primaryColor: "#aa003d", secondaryColor: "#a59b80", prestige: 3, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 800000 },
      { name: "Portland", mascot: "Pilots", abbreviation: "POR", city: "Portland", state: "OR", primaryColor: "#582c83", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 4, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "San Francisco", mascot: "Dons", abbreviation: "SFU", city: "San Francisco", state: "CA", primaryColor: "#00543c", secondaryColor: "#fdb913", prestige: 3, stadium: 2, facilities: 3, collegeLife: 8, marketing: 4, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 11000, nilBudget: 700000 },
    ],
    "Ivy League": [
      { name: "Columbia", mascot: "Lions", abbreviation: "COL", city: "New York", state: "NY", primaryColor: "#9bcbeb", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 8, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 33000, nilBudget: 500000 },
      { name: "Cornell", mascot: "Big Red", abbreviation: "COR", city: "Ithaca", state: "NY", primaryColor: "#b31b1b", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 5, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 25000, nilBudget: 500000 },
      { name: "Dartmouth", mascot: "Big Green", abbreviation: "DART", city: "Hanover", state: "NH", primaryColor: "#00693e", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 5, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 7000, nilBudget: 400000 },
      { name: "Harvard", mascot: "Crimson", abbreviation: "HARV", city: "Cambridge", state: "MA", primaryColor: "#a51c30", secondaryColor: "#000000", prestige: 4, stadium: 2, facilities: 4, collegeLife: 6, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 23000, nilBudget: 600000 },
      { name: "Penn", mascot: "Quakers", abbreviation: "PENN", city: "Philadelphia", state: "PA", primaryColor: "#011f5b", secondaryColor: "#990000", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 500000 },
      { name: "Princeton", mascot: "Tigers", abbreviation: "PRIN", city: "Princeton", state: "NJ", primaryColor: "#e77500", secondaryColor: "#000000", prestige: 3, stadium: 2, facilities: 4, collegeLife: 5, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 500000 },
      { name: "Yale", mascot: "Bulldogs", abbreviation: "YALE", city: "New Haven", state: "CT", primaryColor: "#00356b", secondaryColor: "#ffffff", prestige: 4, stadium: 2, facilities: 4, collegeLife: 6, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 600000 },
      { name: "Brown", mascot: "Bears", abbreviation: "BRN", city: "Providence", state: "RI", primaryColor: "#4e3629", secondaryColor: "#c00404", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 400000 },
    ],
    "Sun Belt": [
      { name: "Coastal Carolina", mascot: "Chanticleers", abbreviation: "CCU", city: "Conway", state: "SC", primaryColor: "#006f71", secondaryColor: "#a27752", prestige: 8, stadium: 6, facilities: 7, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 11000, nilBudget: 2000000 },
      { name: "Southern Miss", mascot: "Golden Eagles", abbreviation: "USM", city: "Hattiesburg", state: "MS", primaryColor: "#ffab00", secondaryColor: "#000000", prestige: 7, stadium: 5, facilities: 5, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 15000, nilBudget: 1500000 },
      { name: "Troy", mascot: "Trojans", abbreviation: "TROY", city: "Troy", state: "AL", primaryColor: "#8b2332", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 4, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 18000, nilBudget: 1000000 },
      { name: "Marshall", mascot: "Thundering Herd", abbreviation: "MAR", city: "Huntington", state: "WV", primaryColor: "#00b140", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Louisiana", mascot: "Ragin' Cajuns", abbreviation: "ULL", city: "Lafayette", state: "LA", primaryColor: "#ce181e", secondaryColor: "#ffffff", prestige: 7, stadium: 6, facilities: 5, collegeLife: 6, marketing: 5, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 17000, nilBudget: 1500000 },
      { name: "Old Dominion", mascot: "Monarchs", abbreviation: "ODU", city: "Norfolk", state: "VA", primaryColor: "#003057", secondaryColor: "#8b8d8e", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1000000 },
      { name: "Arkansas State", mascot: "Red Wolves", abbreviation: "ARST", city: "Jonesboro", state: "AR", primaryColor: "#cc092f", secondaryColor: "#000000", prestige: 3, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 800000 },
      { name: "Georgia Southern", mascot: "Eagles", abbreviation: "GASO", city: "Statesboro", state: "GA", primaryColor: "#041e42", secondaryColor: "#87714d", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1000000 },
      { name: "App State", mascot: "Mountaineers", abbreviation: "APP", city: "Boone", state: "NC", primaryColor: "#222222", secondaryColor: "#ffcc00", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 21000, nilBudget: 1000000 },
      { name: "Georgia State", mascot: "Panthers", abbreviation: "GAST", city: "Atlanta", state: "GA", primaryColor: "#0039a6", secondaryColor: "#cc0000", prestige: 3, stadium: 4, facilities: 4, collegeLife: 7, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 54000, nilBudget: 1000000 },
      { name: "South Alabama", mascot: "Jaguars", abbreviation: "USA", city: "Mobile", state: "AL", primaryColor: "#00205b", secondaryColor: "#bf0d3e", prestige: 5, stadium: 5, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 1200000 },
      { name: "James Madison", mascot: "Dukes", abbreviation: "JMU", city: "Harrisonburg", state: "VA", primaryColor: "#450084", secondaryColor: "#cbb778", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 1500000 },
    ],
    "Big West": [
      { name: "Cal State Fullerton", mascot: "Titans", abbreviation: "CSUF", city: "Fullerton", state: "CA", primaryColor: "#00274c", secondaryColor: "#f47920", prestige: 9, stadium: 6, facilities: 6, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 42000, nilBudget: 2000000 },
      { name: "UC Irvine", mascot: "Anteaters", abbreviation: "UCI", city: "Irvine", state: "CA", primaryColor: "#0064a4", secondaryColor: "#ffd200", prestige: 6, stadium: 4, facilities: 5, collegeLife: 6, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 36000, nilBudget: 1500000 },
      { name: "UC Santa Barbara", mascot: "Gauchos", abbreviation: "UCSB", city: "Santa Barbara", state: "CA", primaryColor: "#003660", secondaryColor: "#febc11", prestige: 6, stadium: 3, facilities: 5, collegeLife: 9, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1500000 },
      { name: "Long Beach State", mascot: "Dirtbags", abbreviation: "LBSU", city: "Long Beach", state: "CA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 7, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 39000, nilBudget: 1500000 },
      { name: "UC San Diego", mascot: "Tritons", abbreviation: "UCSD", city: "San Diego", state: "CA", primaryColor: "#182b49", secondaryColor: "#c69214", prestige: 3, stadium: 3, facilities: 4, collegeLife: 7, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 42000, nilBudget: 1000000 },
      { name: "Hawaii", mascot: "Rainbow Warriors", abbreviation: "HAW", city: "Honolulu", state: "HI", primaryColor: "#024731", secondaryColor: "#ffffff", prestige: 4, stadium: 5, facilities: 4, collegeLife: 9, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 19000, nilBudget: 1500000 },
      { name: "Cal Poly", mascot: "Mustangs", abbreviation: "CPOL", city: "San Luis Obispo", state: "CA", primaryColor: "#154734", secondaryColor: "#bd8b13", prestige: 7, stadium: 4, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1500000 },
      { name: "UC Davis", mascot: "Aggies", abbreviation: "UCD", city: "Davis", state: "CA", primaryColor: "#002855", secondaryColor: "#daaa00", prestige: 3, stadium: 3, facilities: 4, collegeLife: 6, marketing: 4, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 40000, nilBudget: 1000000 },
      { name: "Cal State Northridge", mascot: "Matadors", abbreviation: "CSUN", city: "Northridge", state: "CA", primaryColor: "#ce1126", secondaryColor: "#000000", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 4, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 800000 },
      { name: "Cal State Bakersfield", mascot: "Roadrunners", abbreviation: "CSUB", city: "Bakersfield", state: "CA", primaryColor: "#003399", secondaryColor: "#f0ab00", prestige: 2, stadium: 2, facilities: 3, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 11000, nilBudget: 600000 },
    ],
    "HBCU": [
      { name: "Grambling State", mascot: "Tigers", abbreviation: "GRAM", city: "Grambling", state: "LA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 6, stadium: 4, facilities: 3, collegeLife: 5, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 800000 },
      { name: "Southern University", mascot: "Jaguars", abbreviation: "SOU", city: "Baton Rouge", state: "LA", primaryColor: "#0033a0", secondaryColor: "#fdd023", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 900000 },
      { name: "Florida A&M", mascot: "Rattlers", abbreviation: "FAMU", city: "Tallahassee", state: "FL", primaryColor: "#006747", secondaryColor: "#f47920", prestige: 6, stadium: 5, facilities: 4, collegeLife: 7, marketing: 7, academics: 5, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 10000, nilBudget: 1200000 },
      { name: "Bethune-Cookman", mascot: "Wildcats", abbreviation: "BCU", city: "Daytona Beach", state: "FL", primaryColor: "#8b0000", secondaryColor: "#ffd700", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 700000 },
      { name: "Jackson State", mascot: "Tigers", abbreviation: "JKST", city: "Jackson", state: "MS", primaryColor: "#002b5c", secondaryColor: "#ffffff", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 7, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 1000000 },
      { name: "North Carolina A&T", mascot: "Aggies", abbreviation: "NCAT", city: "Greensboro", state: "NC", primaryColor: "#004684", secondaryColor: "#ffc72c", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 13000, nilBudget: 900000 },
      { name: "Alabama State", mascot: "Hornets", abbreviation: "ALST", city: "Montgomery", state: "AL", primaryColor: "#000000", secondaryColor: "#d4a843", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 700000 },
      { name: "Norfolk State", mascot: "Spartans", abbreviation: "NSU", city: "Norfolk", state: "VA", primaryColor: "#006747", secondaryColor: "#ffc72c", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 6000, nilBudget: 700000 },
      { name: "Alcorn State", mascot: "Braves", abbreviation: "ALCN", city: "Lorman", state: "MS", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 2, collegeLife: 3, marketing: 4, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 3500, nilBudget: 600000 },
      { name: "Prairie View A&M", mascot: "Panthers", abbreviation: "PVAM", city: "Prairie View", state: "TX", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 3, collegeLife: 4, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 600000 },
      { name: "Texas Southern", mascot: "Tigers", abbreviation: "TXSO", city: "Houston", state: "TX", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 4, stadium: 4, facilities: 3, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 700000 },
      { name: "Howard", mascot: "Bison", abbreviation: "HOW", city: "Washington", state: "DC", primaryColor: "#003a63", secondaryColor: "#e51937", prestige: 5, stadium: 4, facilities: 4, collegeLife: 7, marketing: 7, academics: 7, fanbasePassion: "A", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "Delaware State", mascot: "Hornets", abbreviation: "DSU", city: "Dover", state: "DE", primaryColor: "#c8102e", secondaryColor: "#00529b", prestige: 3, stadium: 3, facilities: 3, collegeLife: 4, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 500000 },
      { name: "Coppin State", mascot: "Eagles", abbreviation: "COPP", city: "Baltimore", state: "MD", primaryColor: "#002d72", secondaryColor: "#ffc72c", prestige: 2, stadium: 2, facilities: 2, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
      { name: "North Carolina Central", mascot: "Eagles", abbreviation: "NCCU", city: "Durham", state: "NC", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 4, stadium: 4, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 8000, nilBudget: 600000 },
      { name: "Maryland Eastern Shore", mascot: "Hawks", abbreviation: "UMES", city: "Princess Anne", state: "MD", primaryColor: "#8b0000", secondaryColor: "#b7a57a", prestige: 2, stadium: 1, facilities: 2, collegeLife: 3, marketing: 3, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
    ],
    "Missouri Valley": [
      { name: "Missouri State", mascot: "Bears", abbreviation: "MOST", city: "Springfield", state: "MO", primaryColor: "#8b0000", secondaryColor: "#ffffff", prestige: 6, stadium: 8, facilities: 6, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1500000 },
      { name: "Indiana State", mascot: "Sycamores", abbreviation: "INST", city: "Terre Haute", state: "IN", primaryColor: "#00529b", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Illinois State", mascot: "Redbirds", abbreviation: "ILST", city: "Normal", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 4, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1000000 },
      { name: "Southern Illinois", mascot: "Salukis", abbreviation: "SIU", city: "Carbondale", state: "IL", primaryColor: "#8b0000", secondaryColor: "#000000", prestige: 6, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1200000 },
      { name: "Bradley", mascot: "Braves", abbreviation: "BRAD", city: "Peoria", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 4, stadium: 7, facilities: 5, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Evansville", mascot: "Purple Aces", abbreviation: "EVAN", city: "Evansville", state: "IN", primaryColor: "#461d7c", secondaryColor: "#f47920", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Valparaiso", mascot: "Beacons", abbreviation: "VALP", city: "Valparaiso", state: "IN", primaryColor: "#613318", secondaryColor: "#fdd023", prestige: 3, stadium: 3, facilities: 3, collegeLife: 4, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "UIC", mascot: "Flames", abbreviation: "UIC", city: "Chicago", state: "IL", primaryColor: "#001e62", secondaryColor: "#ce1126", prestige: 4, stadium: 3, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1000000 },
      { name: "Belmont", mascot: "Bruins", abbreviation: "BELT", city: "Nashville", state: "TN", primaryColor: "#002d72", secondaryColor: "#ce1126", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 900000 },
      { name: "Murray State", mascot: "Racers", abbreviation: "MURR", city: "Murray", state: "KY", primaryColor: "#002d72", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 800000 },
      { name: "Western Illinois", mascot: "Leathernecks", abbreviation: "WIU", city: "Macomb", state: "IL", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 2, stadium: 2, facilities: 2, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 600000 },
      { name: "Northern Iowa", mascot: "Panthers", abbreviation: "UNI", city: "Cedar Falls", state: "IA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 4, collegeLife: 5, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 1000000 },
      { name: "Creighton", mascot: "Bluejays", abbreviation: "CREI", city: "Omaha", state: "NE", primaryColor: "#005ca9", secondaryColor: "#ffffff", prestige: 5, stadium: 9, facilities: 7, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1500000 },
    ],
  };
  
  return conferenceTeams[conferenceName] || [];
}

export async function generateRecruits(
  leagueId: string,
  count: number,
  forceStorylineReset = false,
  targetSeason?: number,
  opts?: {
    pitcherRatio?: number;
    positionGroupWeights?: { C?: number; IF?: number; OF?: number };
    awaitStorylines?: boolean;
  },
) {
  const leagueForProgression = await storage.getLeague(leagueId);
  const progressionEnabled = leagueForProgression?.progressionEnabled ?? false;

  const classOpts: import("./recruit-generator").GenerateRecruitClassOptions = {};
  if (opts?.pitcherRatio != null) classOpts.pitcherRatio = opts.pitcherRatio;
  if (opts?.positionGroupWeights) classOpts.positionGroupWeights = opts.positionGroupWeights;
  const recruits = generateRecruitClass(count, classOpts);

  // Build all recruit rows in memory, then batch-insert to avoid N sequential round-trips
  const recruitRows = recruits.map(r => ({
    leagueId,
    ...r,
    ...(progressionEnabled ? (() => {
      if (r.potential != null) {
        const range = getPotentialRange(r.potential);
        return { potentialFloor: range.floor, potentialCeiling: range.ceiling };
      }
      let pot = rollV3Potential(r.starRating ?? undefined, r.playerArchetype ?? "normal");
      if (r.isBlueChip) pot = Math.max(78, pot);
      if (r.isGenerationalGem) pot = Math.max(74, pot);
      if (r.isGem && !r.isGenerationalGem) pot = Math.max(74, pot);
      const range = getPotentialRange(pot);
      return { potential: pot, potentialFloor: range.floor, potentialCeiling: range.ceiling };
    })() : {}),
  }));

  await storage.batchCreateRecruits(recruitRows);

  await generateTopSchoolsForLeague(leagueId);

  // Initialize storyline recruits after recruit class generation — fire-and-forget so the
  // caller (e.g. /api/leagues/:id/start) can respond before the heavyweight arc setup runs.
  const leagueForStoryline = await storage.getLeague(leagueId);
  if (leagueForStoryline) {
    const storylineSeason = targetSeason ?? leagueForStoryline.currentSeason;
    const doInit = async () => {
      try {
        console.log(`[storylines] Initializing storyline recruits for league ${leagueId} season ${storylineSeason} (force=${forceStorylineReset})…`);
        if (forceStorylineReset) {
          console.warn(`[storylines] Commissioner-triggered recruit class reset — existing storyline data for season ${storylineSeason} will be wiped and regenerated.`);
        }
        const storylineCount = await initializeStorylineRecruits(leagueId, storylineSeason, forceStorylineReset);
        console.log(`[storylines] Storyline initialization complete — ${storylineCount} recruits assigned arcs for season ${storylineSeason}`);
      } catch (err) {
        console.error("[storylines] Failed to initialize storyline recruits:", err);
      }
    };
    // Run asynchronously — do not await so generateRecruits returns sooner
    if (opts?.awaitStorylines) {
      await doInit();
      const initialized = await storage.getStorylineRecruitsByLeague(leagueId, storylineSeason);
      if (initialized.length !== 10) {
        throw new Error(`Expected 10 storyline recruits, found ${initialized.length}`);
      }
    } else {
      doInit().catch(err => console.error("[storylines] generateRecruits background init threw:", err));
    }
  }

  return recruits[0]?.classVintage ?? null;
}

// Generate top schools for all recruits in a league based on their priorities
// With BALANCED DISTRIBUTION: ensures each team gets a fair share of #1 recruit interests
export async function generateTopSchoolsForLeague(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const recruits = await storage.getRecruitsByLeague(leagueId);
  
  if (teams.length === 0 || recruits.length === 0) return;
  
  // Sort recruits by overall rating (descending) so top recruits get processed first
  const sortedRecruits = Array.from(recruits).sort((a: any, b: any) => (b.overall || 0) - (a.overall || 0));
  
  // Calculate fair share and max cap for distribution
  const fairShare = Math.max(1, Math.ceil(recruits.length / teams.length));
  const maxCap = fairShare + Math.ceil(fairShare * 0.5); // Allow 50% overflow max
  
  // Track #1 assignments per team
  const teamTopInterestCount: Map<string, number> = new Map();
  teams.forEach(t => teamTopInterestCount.set(t.id, 0));
  
  // Priority weight mapping
  const priorityWeight = (priority: string | null): number => {
    switch (priority) {
      case "Extremely": return 4;
      case "Very": return 3;
      case "Somewhat": return 2;
      case "Not Important": return 1;
      default: return 2;
    }
  };
  
  // Score calculator for a recruit-team pair
  const calculateScore = (recruit: typeof recruits[0], team: typeof teams[0]): number => {
    let score = 0;
    const starRank = recruit.starRank || 3;
    const teamPrestige = team.prestige || 5;
    
    // Prestige affinity: high-star recruits strongly prefer high-prestige schools,
    // low-star recruits prefer lower-prestige schools (more playing time, better fit)
    const prestigeAffinity = (() => {
      if (starRank >= 5) {
        return teamPrestige >= 7 ? 40 : teamPrestige >= 5 ? 15 : 0;
      } else if (starRank === 4) {
        return teamPrestige >= 6 ? 30 : teamPrestige >= 4 ? 20 : 5;
      } else if (starRank === 3) {
        return Math.abs(teamPrestige - 5) <= 2 ? 25 : 10;
      } else if (starRank === 2) {
        return teamPrestige <= 5 ? 30 : teamPrestige <= 7 ? 15 : 0;
      } else {
        return teamPrestige <= 4 ? 35 : teamPrestige <= 6 ? 15 : 0;
      }
    })();
    score += prestigeAffinity;
    
    // Proximity: Higher scores for teams in same state
    const proximityWeight = priorityWeight(recruit.proximityPriority);
    if (recruit.homeState === team.state) {
      score += 30 * proximityWeight;
    } else {
      score += 10 * proximityWeight;
    }
    
    // Academics
    const academicsWeight = priorityWeight(recruit.academicsPriority);
    score += (team.academics || 5) * 3 * academicsWeight;
    
    // Prestige (priority-weighted on top of affinity)
    const prestigeWeight = priorityWeight(recruit.prestigePriority);
    score += teamPrestige * 3 * prestigeWeight;
    
    // Prestige dream school seeding: 8-9 prestige programs get a probability bump to appear
    // on more recruits' Top Schools lists — they're already in the conversation
    if (teamPrestige >= 9) score += 12;
    else if (teamPrestige >= 8) score += 7;
    
    // Facilities
    const facilitiesWeight = priorityWeight(recruit.facilitiesPriority);
    score += (team.facilities || 5) * 3 * facilitiesWeight;
    
    // Reputation
    const reputationWeight = priorityWeight(recruit.reputationPriority);
    score += (teamPrestige + (team.facilities || 5)) * 1.5 * reputationWeight;
    
    // College Life: recruits who care about campus social experience favor high-CL programs
    const collegeLifeWeight = priorityWeight((recruit as any).collegeLifePriority || "Somewhat");
    score += (team.collegeLife || 5) * 3 * collegeLifeWeight;

    // Stadium: transfer portal recruits weight stadium more highly — they've played D1,
    // they know what a great venue means for exposure and experience
    const isTransfer = (recruit as any).recruitType === "TRANSFER";
    const teamStadium = team.stadium || 5;
    if (isTransfer) {
      score += teamStadium * 4; // raw stadium bonus for transfer recruits
    } else {
      // Non-transfers: stadium contributes via reputation weight
      score += teamStadium * 0.5 * reputationWeight;
    }
    
    // Playing time - low-star recruits value this more
    const playingTimeWeight = priorityWeight(recruit.playingTimePriority);
    const ptBonus = starRank <= 2 ? 1.5 : 1.0;
    score += (10 - teamPrestige) * 2 * playingTimeWeight * ptBonus;
    
    // Add randomness for variety
    score += Math.floor(Math.random() * 25);
    
    return score;
  };
  
  // Store all recruit top schools data for post-generation rebalancing
  const recruitTopSchoolsData: Map<string, { teamId: string; score: number; rank: number }[]> = new Map();
  
  for (const recruit of sortedRecruits) {
    // Score each team
    const teamScores = teams.map(team => ({
      team,
      score: calculateScore(recruit, team)
    }));
    
    // Sort by score for top schools list
    const sortedTeams = Array.from(teamScores).sort((a: any, b: any) => b.score - a.score);
    const numTopSchools = 5 + Math.floor(Math.random() * 4);
    let topSchools = sortedTeams.slice(0, Math.min(numTopSchools, teams.length));
    
    // BALANCED #1 SELECTION with progressive enforcement
    if (topSchools.length > 1) {
      const topScore = topSchools[0].score;
      
      // Find best candidate that's within 15% of top score AND under fair share
      let bestSwapIdx = -1;
      let bestSwapScore = 0;
      
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidateTeam = topSchools[i].team;
        const candidateCount = teamTopInterestCount.get(candidateTeam.id) || 0;
        const scorePct = topSchools[i].score / topScore;
        
        // Check if current #1 is at or over max cap - must swap
        const top1Count = teamTopInterestCount.get(topSchools[0].team.id) || 0;
        const mustSwap = top1Count >= maxCap;
        
        // Swap if candidate is under fair share and within threshold
        // Or must swap if #1 is at max cap
        if (candidateCount < fairShare && (scorePct >= 0.85 || mustSwap)) {
          if (topSchools[i].score > bestSwapScore) {
            bestSwapIdx = i;
            bestSwapScore = topSchools[i].score;
          }
        }
      }
      
      // Perform swap if found
      if (bestSwapIdx > 0) {
        const temp = topSchools[0];
        topSchools[0] = topSchools[bestSwapIdx];
        topSchools[bestSwapIdx] = temp;
      }
    }
    
    // Track #1 assignment
    if (topSchools.length > 0) {
      const topTeamId = topSchools[0].team.id;
      teamTopInterestCount.set(topTeamId, (teamTopInterestCount.get(topTeamId) || 0) + 1);
    }
    
    // Store data for database creation
    recruitTopSchoolsData.set(recruit.id, topSchools.map((ts, idx) => ({
      teamId: ts.team.id,
      score: ts.score,
      rank: idx + 1
    })));
  }
  
  // POST-GENERATION REBALANCING PASS
  // Find teams that are over-represented and under-represented
  const overRepTeams = Array.from(teamTopInterestCount.entries())
    .filter(([_, count]) => count > maxCap)
    .map(([id]) => id);
  const underRepTeams = Array.from(teamTopInterestCount.entries())
    .filter(([_, count]) => count < Math.max(1, fairShare - 2))
    .map(([id]) => id);
  
  // If significant imbalance, perform targeted swaps with score proximity check
  if (overRepTeams.length > 0 && underRepTeams.length > 0) {
    for (const recruitId of Array.from(recruitTopSchoolsData.keys())) {
      const topSchools = recruitTopSchoolsData.get(recruitId)!;
      if (topSchools.length < 2) continue;
      
      // Sort by current rank to get #1
      topSchools.sort((a: any, b: any) => a.rank - b.rank);
      const current1 = topSchools[0];
      if (!overRepTeams.includes(current1.teamId)) continue;
      
      // Find a swap candidate from under-represented teams WITH SCORE PROXIMITY CHECK
      const top1Score = current1.score;
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidate = topSchools[i];
        // Only swap if candidate score is within 15% of #1 score (preserves priority matching)
        const scorePct = candidate.score / top1Score;
        if (scorePct < 0.85) continue; // Skip if too far below in score
        
        if (underRepTeams.includes(candidate.teamId)) {
          // Swap ranks
          const oldRank1TeamId = current1.teamId;
          topSchools[i].rank = 1;
          topSchools[0].rank = i + 1;
          
          // Update counts
          teamTopInterestCount.set(oldRank1TeamId, (teamTopInterestCount.get(oldRank1TeamId) || 1) - 1);
          teamTopInterestCount.set(candidate.teamId, (teamTopInterestCount.get(candidate.teamId) || 0) + 1);
          
          // Re-sort by rank
          topSchools.sort((a: any, b: any) => a.rank - b.rank);
          
          // Update over/under lists
          const newOverCount = teamTopInterestCount.get(oldRank1TeamId) || 0;
          if (newOverCount <= maxCap) {
            const idx = overRepTeams.indexOf(oldRank1TeamId);
            if (idx >= 0) overRepTeams.splice(idx, 1);
          }
          const newUnderCount = teamTopInterestCount.get(candidate.teamId) || 0;
          if (newUnderCount >= Math.max(1, fairShare - 2)) {
            const idx = underRepTeams.indexOf(candidate.teamId);
            if (idx >= 0) underRepTeams.splice(idx, 1);
          }
          break;
        }
      }
    }
  }
  
  // Collect all top-school rows, then batch-insert in one shot
  const allTopSchoolRows: import("@shared/schema").InsertRecruitTopSchools[] = [];
  for (const [recruitId, topSchools] of Array.from(recruitTopSchoolsData.entries())) {
    topSchools.sort((a: any, b: any) => a.rank - b.rank);
    const maxScore = Math.max(...topSchools.map(t => t.score)) || 100;
    for (let i = 0; i < topSchools.length; i++) {
      const ts = topSchools[i];
      const baseInterest = Math.max(30, 80 - (i * 8));
      const scoreBonus = Math.floor((ts.score / maxScore) * 5);
      const interestLevel = Math.min(80, baseInterest + scoreBonus);
      allTopSchoolRows.push({
        recruitId,
        teamId: ts.teamId,
        interestLevel,
        rank: i + 1,
        isActive: true,
        accumulatedInterest: 0,
      });
    }
  }
  await storage.batchCreateRecruitTopSchools(allTopSchoolRows);
}

// Random appearance generator for players/recruits
// conferenceName: biases skin tone distribution by conference
// eligibility: biases facial hair probability (SR/JR more likely than FR)
export function getRandomAppearance(conferenceName?: string, eligibility?: string) {
  let skinTones: string[];
  if (conferenceName === "HBCU") {
    skinTones = ["dark","dark","dark","deep","deep","deep","medium","tan","olive"];
  } else if (["Pac-12","WCC"].includes(conferenceName ?? "")) {
    skinTones = ["medium","medium","tan","tan","olive","olive","light","dark"];
  } else if (["AAC","Sun Belt"].includes(conferenceName ?? "")) {
    skinTones = ["light","medium","medium","tan","tan","olive","dark","dark"];
  } else {
    skinTones = ["light","light","medium","medium","tan","olive","dark","deep"];
  }

  const hairColors = ["black", "brown", "blonde", "red", "gray"];
  const hairStyles = ["short", "buzz", "medium", "fade", "curly", "mullet", "long", "bald"];
  const headwears = ["cap", "helmet", "batting_helmet", "none"];
  const eyeStyles: string[] = ["standard", "standard", "narrow", "wide", "heavy"];
  const eyebrowStyles: string[] = ["flat", "flat", "arched", "thick", "furrowed"];
  const mouthStyles: string[] = ["neutral", "neutral", "smile", "smirk"];

  // Facial hair weighted by eligibility (players only — not recruits)
  let facialHair = "none";
  const fhRoll = Math.random();
  if (eligibility === "SR") {
    if      (fhRoll < 0.22) facialHair = "stubble";
    else if (fhRoll < 0.34) facialHair = "goatee";
    else if (fhRoll < 0.40) facialHair = "mustache";
    else if (fhRoll < 0.43) facialHair = "beard";
  } else if (eligibility === "JR") {
    if      (fhRoll < 0.15) facialHair = "stubble";
    else if (fhRoll < 0.22) facialHair = "goatee";
    else if (fhRoll < 0.26) facialHair = "mustache";
  } else if (eligibility === "SO") {
    if      (fhRoll < 0.08) facialHair = "stubble";
    else if (fhRoll < 0.11) facialHair = "goatee";
  } else { // FR or unknown
    if (fhRoll < 0.04) facialHair = "stubble";
  }

  // Eye black only for players (not recruits — caller decides); ~28% chance
  const eyeBlack = Math.random() < 0.28;

  return {
    skinTone:     skinTones[Math.floor(Math.random() * skinTones.length)],
    hairColor:    hairColors[Math.floor(Math.random() * hairColors.length)],
    hairStyle:    hairStyles[Math.floor(Math.random() * hairStyles.length)],
    headwear:     headwears[Math.floor(Math.random() * headwears.length)],
    facialHair,
    eyeStyle:     eyeStyles[Math.floor(Math.random() * eyeStyles.length)],
    eyebrowStyle: eyebrowStyles[Math.floor(Math.random() * eyebrowStyles.length)],
    mouthStyle:   mouthStyles[Math.floor(Math.random() * mouthStyles.length)],
    eyeBlack,
  };
}

/**
 * #66 — Conference-flavored ability selection for CPU-generated players.
 * HBCU teams lean athletic/scrappy; Ivy League teams lean cerebral/strategic.
 * All other conferences use the standard randomized ability pool.
 */
export function getConferenceFlavoredAbilities(
  conference: string | undefined,
  position: string,
  count: number,
  preferGold: boolean
): string[] {
  const isPitcher = ["P", "SP", "RP", "CP"].includes(position);

  if (conference === "HBCU") {
    const pitcherPool = [
      "Indomitable Soul", "Big Boy Speed", "Groundball Pitcher", "Straddle",
      "Slugger Killer", "Guts", "Strikeout", "Inside Pitch", "Intimidator",
      "Pace", "Heavy Ball", "Houdini", "Natural Shuuto", "Fireman",
    ];
    const hitterPool = [
      "Express Baserunning", "High Speed Charge", "Unrelenting", "Walkoff Hitter",
      "Late Night Hero", "Contact Hitter", "Resilient", "Slap Happy", "Good Bunt",
      "vs. Ace", "Shock Commander", "Artist", "High Ball Hitter", "First Pitch King",
      "Bunt Artisan", "Insurer", "Outside Hitter", "Bases Loaded Slugger",
    ];
    const pool = isPitcher ? pitcherPool : hitterPool;
    const shuffled = Array.from(pool).sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
  }

  if (conference === "Ivy League") {
    const pitcherPool = [
      "Sangfroid", "Decisive", "Tunneling", "High Spin Gyroball", "Sharpness",
      "Perfect Combustion", "Halting Quickness", "Monster Stuff", "Doctor K",
      "Precision Instrument", "Winner's Luck", "Release", "Escape Pitch", "Painter",
    ];
    const hitterPool = [
      "Good Bunt", "vs. Ace", "Artist", "Consigliere", "Trickster", "Disturbance",
      "Opposite Field Hitter", "Spray Hitter", "Pinch Hitter", "Counterattack",
      "High-Speed Laser", "Milliner", "Final Hit", "Surprise!", "Inside Hitter",
    ];
    const pool = isPitcher ? pitcherPool : hitterPool;
    const shuffled = Array.from(pool).sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
  }

  return getRandomAbilities(position, count, preferGold);
}

export async function generatePlayersForTeam(teamId: string, progressionEnabled: boolean = false, teamName?: string, conferenceName?: string) {
  // Calibrated rosters (via ROSTER_SCALE_FACTORS in realRosters.ts) already encode
  // the correct inter-conference AND intra-conference attribute spread based on real
  // 2026 RPI data. No additional scaling is applied here — attributes are passed
  // straight through so the in-game OVR matches the scouting/analysis OVR exactly.
  const { SEC_REAL_ROSTERS } = await getRealRosters();
  const realRoster = teamName ? SEC_REAL_ROSTERS[teamName] : undefined;
  const pendingInserts: Parameters<typeof storage.createPlayer>[0][] = [];

  if (realRoster && realRoster.length > 0) {
    const usedJerseyNumbers = new Set<number>();

    for (const rp of realRoster) {
      const randomAppearance = getRandomAppearance(conferenceName, rp.eligibility);
      const appearance = {
        skinTone: rp.skinTone || randomAppearance.skinTone,
        hairColor: rp.hairColor || randomAppearance.hairColor,
        hairStyle: rp.hairStyle || randomAppearance.hairStyle,
        headwear: randomAppearance.headwear,
        facialHair: randomAppearance.facialHair,
        eyeStyle: randomAppearance.eyeStyle,
        eyebrowStyle: randomAppearance.eyebrowStyle,
        mouthStyle: randomAppearance.mouthStyle,
        eyeBlack: randomAppearance.eyeBlack,
      };
      usedJerseyNumbers.add(rp.jerseyNumber);
      const isPitcher = ["P", "SP", "RP", "CP"].includes(rp.position);
      const playerData = {
        position: rp.position,
        hitForAvg: rp.hitForAvg, power: rp.power, speed: rp.speed, arm: rp.arm,
        fielding: rp.fielding, errorResistance: rp.errorResistance,
        velocity: rp.velocity, control: rp.control, stamina: rp.stamina, stuff: rp.stuff,
        clutch: rp.clutch, vsLHP: rp.vsLHP, grit: rp.grit, stealing: rp.stealing,
        running: rp.running, throwing: rp.throwing, recovery: rp.recovery,
        wRISP: rp.wRISP, vsLefty: rp.vsLefty, poise: rp.poise, heater: rp.heater, agile: rp.agile,
        catcherAbility: rp.catcherAbility ?? null,
        abilities: rp.abilities,
        trajectory: rp.trajectory ?? (isPitcher ? 2 : assignTrajectory(rp.power, rp.speed, rp.hitForAvg)),
      };

      // ALL_REAL_ROSTERS is already fully calibrated: normalizeCommonAbilities,
      // enforceGoldOvrGate, and elite speed boost are all baked in by buildCalibratedRosters.
      // Just compute OVR directly from the calibrated attributes — no re-transforms needed.
      const rawOverall = calculateOVR(playerData);
      const overall = Math.max(1, Math.min(999, rawOverall));
      const starRating = getStarRatingFromOVR(overall);

      pendingInserts.push({
        teamId,
        firstName: rp.firstName,
        lastName: rp.lastName,
// REMOVED DUPLICATE position: rp.position,
        eligibility: rp.eligibility,
        homeState: rp.homeState,
        hometown: rp.hometown,
        jerseyNumber: rp.jerseyNumber,
        overall,
        starRating,
        ...playerData,
        batHand: rp.batHand || "R",
        throwHand: rp.throwHand || "R",
        // catcherAbility is part of playerData (already calibrated from buildCalibratedRosters)
        skinTone: appearance.skinTone,
        hairColor: appearance.hairColor,
        hairStyle: appearance.hairStyle,
        facialHair: appearance.facialHair,
        eyeStyle: appearance.eyeStyle,
        eyebrowStyle: appearance.eyebrowStyle,
        mouthStyle: appearance.mouthStyle,
        eyeBlack: appearance.eyeBlack,
        headwear: appearance.headwear,
        potential: typeof rp.potential === 'string' ? potentialGradeToNumber(rp.potential as string) : (rp.potential ?? 71),
        ...(isPitcher
          ? (() => {
              // Generate archetype mix for fields not in RealPlayer interface
              // (pitchCCH, pitchHSL, pitchSWP, pitchKN, pitchSCB, pitchPCB),
              // then override with the canonical real-roster pitch values so that
              // hand-curated data (e.g. pitchVSL for Aidan King) is preserved.
              const archMix = generateArchetypePitchMix(
                assignPitcherArchetype(rp.position, rp.throwHand || "R", rp.velocity, rp.control, rp.stamina, rp.stuff),
                qualityTierFromOvr(rawOverall),
              );
              return {
                ...archMix,
                pitchFB: rp.pitchFB,
                pitch2S: rp.pitch2S,
                pitchSL: rp.pitchSL,
                pitchCB: rp.pitchCB,
                pitchCH: rp.pitchCH,
                pitchCT: rp.pitchCT,
                pitchSNK: rp.pitchSNK,
                ...(rp.pitchSPL !== undefined ? { pitchSPL: rp.pitchSPL } : {}),
                ...(rp.pitchVSL !== undefined ? { pitchVSL: rp.pitchVSL } : {}),
                ...(rp.pitchFK  !== undefined ? { pitchFK:  rp.pitchFK  } : {}),
                ...(rp.pitchSFF !== undefined ? { pitchSFF: rp.pitchSFF } : {}),
                ...(rp.pitchSHU !== undefined ? { pitchSHU: rp.pitchSHU } : {}),
              };
            })()
          : noPitches),
      });
    }

    const remaining = 25 - realRoster.length;
    if (remaining > 0) {
      const fillerNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron"];
      const fillerLastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas"];
      const fillerStates = [
        { state: "CA", cities: ["Los Angeles", "San Diego"] },
        { state: "TX", cities: ["Houston", "Dallas"] },
        { state: "FL", cities: ["Miami", "Tampa"] },
        { state: "GA", cities: ["Atlanta", "Savannah"] },
      ];
      const existingPositions = realRoster.map(rp => rp.position);
      const hasCatcher = existingPositions.filter(p => p === "C").length;
      const hasPitchers = existingPositions.filter(p => p === "P").length;
      const fillerPositions: string[] = [];
      if (hasCatcher < 2) fillerPositions.push(...Array(2 - hasCatcher).fill("C"));
      if (hasPitchers < 12) fillerPositions.push(...Array(Math.min(remaining - fillerPositions.length, 12 - hasPitchers)).fill("P"));
      while (fillerPositions.length < remaining) {
        const fieldPos = ["1B", "2B", "SS", "3B", "LF", "CF", "RF"];
        fillerPositions.push(fieldPos[Math.floor(Math.random() * fieldPos.length)]);
      }
      // Deterministic FR assignment: count FR already in the real roster, fill
      // exactly (5 - realFrCount) filler slots as FR, rest as SO/JR.
      // Never set an existing player's eligibility — only newly-created fillers.
      const realFrCount = realRoster.filter(p => p.eligibility === "FR").length;
      const frFillersNeeded = Math.max(0, 5 - realFrCount);

      for (let f = 0; f < remaining; f++) {
        const fillerElig = f < frFillersNeeded ? "FR" : (Math.random() < 0.5 ? "SO" : "JR");
        const appearance = getRandomAppearance(conferenceName, fillerElig);
        const targetAvg = 25 + Math.floor(Math.random() * 15);
        const genAttr = () => Math.max(1, Math.min(99, targetAvg + Math.floor(Math.random() * 21) - 10));
        const pos = fillerPositions[f];
        const abilities: string[] = [];
        const playerData = {
          hitForAvg: genAttr(), power: genAttr(), speed: sampleNormalSpeed(), arm: genAttr(),
          fielding: genAttr(), errorResistance: genAttr(),
          velocity: sampleNormalVelocity(), control: genAttr(), stamina: genAttr(), stuff: genAttr(),
          clutch: genAttr(), vsLHP: genAttr(), grit: genAttr(), stealing: genAttr(),
          running: genAttr(), throwing: genAttr(), recovery: genAttr(),
          wRISP: genAttr(), vsLefty: genAttr(), poise: genAttr(), heater: genAttr(), agile: genAttr(),
          // catcherAbility included so normalization can adjust it for catchers
          catcherAbility: pos === "C" ? genAttr() : null,
          abilities,
        };
        // Normalize common ability distribution by conference tier.
        // Returns ONLY common ability keys — no identity fields leak back.
        Object.assign(playerData, normalizeCommonAbilities(
          { position: pos, firstName: `Filler${f}`, lastName: `${teamId}`, ...playerData },
          conferenceName ?? "",
        ));
        const rawOvr = calculateOVR(playerData);
        const ovr = Math.max(1, Math.min(999, rawOvr));
        let jerseyNum = realRoster.length + f + 1;
        while (usedJerseyNumbers.has(jerseyNum)) jerseyNum++;
        usedJerseyNumbers.add(jerseyNum);
        const stEntry = fillerStates[Math.floor(Math.random() * fillerStates.length)];

        const fillerThrowHand = (() => {
          const r = Math.random();
          if (pos === "P") return r < 0.30 ? "L" : "R";
          return r < 0.10 ? "L" : "R";
        })();
        const fillerBatHand = (() => {
          if (pos === "P") return Math.random() < 0.15 ? "L" : "R";
          const r = Math.random();
          if (r < 0.28) return "L";
          if (r < 0.31) return "S";
          return "R";
        })();

        pendingInserts.push({
          teamId,
          firstName: fillerNames[Math.floor(Math.random() * fillerNames.length)],
          lastName: fillerLastNames[Math.floor(Math.random() * fillerLastNames.length)],
          position: pos,
          eligibility: fillerElig,
          homeState: stEntry.state,
          hometown: stEntry.cities[Math.floor(Math.random() * stEntry.cities.length)],
          jerseyNumber: jerseyNum,
          overall: ovr,
          starRating: getStarRatingFromOVR(ovr),
          ...playerData,
          batHand: fillerBatHand,
          throwHand: fillerThrowHand,
          // catcherAbility already in playerData (possibly normalized for catchers)
          skinTone: appearance.skinTone,
          hairColor: appearance.hairColor,
          hairStyle: appearance.hairStyle,
          facialHair: appearance.facialHair,
          eyeStyle: appearance.eyeStyle,
          eyebrowStyle: appearance.eyebrowStyle,
          mouthStyle: appearance.mouthStyle,
          eyeBlack: appearance.eyeBlack,
          headwear: appearance.headwear,
          potential: rollV3Potential(),
          ...(pos === "P"
            ? generateArchetypePitchMix(
                assignPitcherArchetype(pos, fillerThrowHand, playerData.velocity, playerData.control, playerData.stamina, playerData.stuff),
                qualityTierFromOvr(rawOvr),
              )
            : noPitches),
        });
      }
    }
    await storage.batchCreatePlayers(pendingInserts);
    return;
  }

  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez"];
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const rosterStates = [
    { state: "CA", cities: ["Los Angeles", "San Diego", "Sacramento", "Long Beach"] },
    { state: "TX", cities: ["Houston", "Dallas", "Austin", "San Antonio"] },
    { state: "FL", cities: ["Miami", "Tampa", "Orlando", "Jacksonville"] },
    { state: "GA", cities: ["Atlanta", "Savannah", "Augusta", "Athens"] },
    { state: "NC", cities: ["Charlotte", "Raleigh", "Durham"] },
    { state: "TN", cities: ["Nashville", "Memphis", "Knoxville"] },
    { state: "AZ", cities: ["Phoenix", "Tucson", "Scottsdale"] },
    { state: "LA", cities: ["New Orleans", "Baton Rouge", "Shreveport"] },
    { state: "AL", cities: ["Birmingham", "Tuscaloosa", "Mobile"] },
    { state: "SC", cities: ["Charleston", "Columbia", "Greenville"] },
    { state: "MS", cities: ["Jackson", "Oxford", "Starkville"] },
    { state: "OH", cities: ["Columbus", "Cincinnati", "Cleveland"] },
    { state: "IL", cities: ["Chicago", "Springfield", "Champaign"] },
    { state: "PA", cities: ["Philadelphia", "Pittsburgh", "State College"] },
    { state: "NY", cities: ["New York", "Buffalo", "Syracuse"] },
    { state: "VA", cities: ["Richmond", "Virginia Beach", "Charlottesville"] },
  ];

  // Class balance: 6 SR, 6 JR, 8 SO, 5 FR = 25 total (exactly 5 FR required)
  const eligibilityDistribution = [
    ...Array(6).fill("SR"),
    ...Array(6).fill("JR"),
    ...Array(8).fill("SO"),
    ...Array(5).fill("FR"),
  ];

  // Position distribution: 12 pitchers, 2 catchers, 11 fielders = 25 total
  const positionDistribution = [
    ...Array(12).fill("P"), // 12 pitchers
    ...Array(2).fill("C"),  // 2 catchers
    "1B", "2B", "SS", "3B", // 4 infielders
    "LF", "CF", "RF",       // 3 outfielders
    "SS", "3B", "CF", "RF", // 4 utility fielders (depth)
  ];

  // Shuffle the distributions for randomization
  const shuffledEligibilities = Array.from(eligibilityDistribution).sort(() => Math.random() - 0.5);
  const shuffledPositions = Array.from(positionDistribution).sort(() => Math.random() - 0.5);

  // Target attribute average by star tier (OVR ≈ 9 * avgAttr + special bonus)
  // All roster players capped at 159-650 OVR (only generational recruits can exceed)
  const getTargetAttrAvg = (): { avg: number; starTier: number } => {
    const roll = Math.random();
    if (roll < 0.05) return { avg: 65 + Math.floor(Math.random() * 8), starTier: 5 };  // 65-72 avg → ~585-648 OVR (capped 650)
    if (roll < 0.25) return { avg: 55 + Math.floor(Math.random() * 10), starTier: 4 };  // 55-64 avg → ~495-576 OVR
    if (roll < 0.65) return { avg: 42 + Math.floor(Math.random() * 10), starTier: 3 };  // 42-51 avg → ~378-459 OVR
    if (roll < 0.90) return { avg: 26 + Math.floor(Math.random() * 12), starTier: 2 };  // 26-37 avg → ~234-333 OVR
    return { avg: 18 + Math.floor(Math.random() * 8), starTier: 1 };                    // 18-25 avg → ~162-225 OVR (min ~159)
  };

  const genAttrAroundAvg = (avg: number) => Math.max(1, Math.min(100, avg + Math.floor(Math.random() * 21) - 10));

  for (let i = 0; i < 25; i++) {
    const position = shuffledPositions[i];
    const eligibility = shuffledEligibilities[i];
    const rosterStateEntry = rosterStates[Math.floor(Math.random() * rosterStates.length)];

    const { avg: targetAvg, starTier } = getTargetAttrAvg();
    const isPitcherPos = position === "P";

    // Apply tool archetype system — same logic as recruit-generator.ts
    const cpuTools = selectTools(starTier, isPitcherPos);
    const cpuToolGroups = isPitcherPos ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
    const cpuTooledAttrs = new Set<string>(cpuTools.flatMap(t => cpuToolGroups[t] ?? []));
    const genT = (attr: string) => genToolAttr(targetAvg, cpuTooledAttrs.has(attr));

    const abilityCount = starTier === 5 ? 3 + Math.floor(Math.random() * 3) :   // 3-5
                         starTier === 4 ? 2 + Math.floor(Math.random() * 3) :   // 2-4
                         starTier === 3 ? 1 + Math.floor(Math.random() * 3) :   // 1-3
                         starTier === 2 ? Math.floor(Math.random() * 3) :       // 0-2
                         Math.random() < 0.5 ? 1 : 0;                            // 1★: 50% of 1
    // #66 — use conference-flavored ability pools for HBCU/Ivy; generic pool for all others
    const abilities = getConferenceFlavoredAbilities(conferenceName, position, abilityCount, starTier >= 4);

    const appearance = getRandomAppearance(conferenceName, eligibility);

    const hitForAvg = genT("hitForAvg");
    const power = genT("power");
    const speed = sampleNormalSpeed();
    const arm = genT("arm");
    const fielding = genT("fielding");
    const errorResistance = genT("errorResistance");
    const velocity = sampleNormalVelocity();
    const control = genT("control");
    const stamina = genT("stamina");
    const stuff = genT("stuff");
    const clutch = genT("clutch");
    const vsLHPVal = genAttrAroundAvg(targetAvg); // not in any tool group — flat variance
    const grit = genAttrAroundAvg(targetAvg);     // not in any tool group — flat variance
    const stealing = genT("stealing");
    const running = genT("running");
    const throwing = genT("throwing");
    const recovery = genAttrAroundAvg(targetAvg); // not in any tool group — flat variance
    const wRISP = genT("wRISP");
    const vsLefty = genAttrAroundAvg(targetAvg);  // not in any tool group — flat variance
    const poise = genAttrAroundAvg(targetAvg);    // not in any tool group — flat variance
    const heater = genAttrAroundAvg(targetAvg);   // not in any tool group — flat variance
    const agile = genT("agile");

    const playerData = {
      hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff,
      clutch, vsLHP: vsLHPVal, grit, stealing, running, throwing, recovery,
      wRISP, vsLefty, poise, heater, agile,
      abilities,
    };

    const rawOverall = calculateOVR(playerData);
    const overall = Math.max(1, Math.min(999, rawOverall));
    const starRating = getStarRatingFromOVR(overall);
    const cpuThrowHand = isPitcherPos ? (Math.random() < 0.28 ? "L" : "R") : "R";
    const cpuBatHand = (() => {
      if (isPitcherPos) return Math.random() < 0.15 ? "L" : "R";
      const r = Math.random();
      if (r < 0.28) return "L";
      if (r < 0.31) return "S";
      return "R";
    })();

    pendingInserts.push({
      teamId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      eligibility,
      homeState: rosterStateEntry.state,
      hometown: rosterStateEntry.cities[Math.floor(Math.random() * rosterStateEntry.cities.length)],
      jerseyNumber: i + 1,
      overall,
      starRating,
      ...playerData,
      catcherAbility: position === "C" ? genAttrAroundAvg(targetAvg) : null,
      batHand: cpuBatHand,
      throwHand: cpuThrowHand,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      facialHair: appearance.facialHair,
      eyeStyle: appearance.eyeStyle,
      eyebrowStyle: appearance.eyebrowStyle,
      mouthStyle: appearance.mouthStyle,
      eyeBlack: appearance.eyeBlack,
      headwear: appearance.headwear,
      potential: rollV3Potential(),
      ...(isPitcherPos
        ? generateArchetypePitchMix(
            assignPitcherArchetype(position, cpuThrowHand, velocity, control, stamina, stuff),
            qualityTierFromOvr(overall),
          )
        : noPitches),
      tools: cpuTools,
    });
  }
  await storage.batchCreatePlayers(pendingInserts);
}

// Generate veteran CPU coaches for teams that don't have a coach
export async function generateCpuCoaches(leagueId: string) {
  const firstNames = ["Bob", "Jim", "Steve", "Mike", "Tom", "Bill", "Joe", "Dave", "Rick", "Jack", "Paul", "John", "Mark", "Dan", "Pete", "Tony", "Ray", "Frank", "Ed", "Gary"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"];
  const archetypes = ["Balanced", "Pure CEO", "Player's Coach", "Tactician", "Old School", "Scout Master", "Academic Dean", "Dealmaker"];

  const teams = await storage.getTeamsByLeague(leagueId);
  
  for (const team of teams) {
    // Skip if team already has a coach
    if (team.coachId) continue;
    
    // Generate random veteran experience (5-25 seasons of experience)
    const seasonsExperience = 5 + Math.floor(Math.random() * 21);
    
    // Calculate level based on experience (1 level per 2 seasons on average, with variance)
    const level = Math.min(25, Math.max(1, Math.floor(seasonsExperience * 0.4 + Math.random() * 5)));
    
    // XP is level * 1000 (they've already leveled up)
    const xp = level * 1000;
    
    // Generate skill points - total skill points = level (each level gives 1 point)
    // Distribute across 4 skill trees (1-4 max per tree)
    const distributeSkillPoints = (totalPoints: number): [number, number, number, number] => {
      const skills: [number, number, number, number] = [1, 1, 1, 1]; // Start at 1 each
      let remaining = totalPoints;
      
      while (remaining > 0) {
        const idx = Math.floor(Math.random() * 4);
        if (skills[idx] < 4) {
          skills[idx]++;
          remaining--;
        } else if (skills.every(s => s >= 4)) {
          break; // Max all skills reached
        }
      }
      return skills;
    };
    
    const [scoutingSkill, evaluationSkill, pitchingRecruitingSkill, hittingRecruitingSkill] = distributeSkillPoints(level);
    
    // Generate career stats based on experience
    const winsPerSeason = 20 + Math.floor(Math.random() * 25);
    const lossesPerSeason = 45 - winsPerSeason + Math.floor(Math.random() * 10);
    const careerWins = seasonsExperience * winsPerSeason + Math.floor(Math.random() * 50);
    const careerLosses = seasonsExperience * lossesPerSeason + Math.floor(Math.random() * 50);
    
    // Conference record (slightly less than overall)
    const confWins = Math.floor(careerWins * 0.4 + Math.random() * careerWins * 0.1);
    const confLosses = Math.floor(careerLosses * 0.4 + Math.random() * careerLosses * 0.1);
    
    // Achievements based on experience and randomness
    const confChampionships = Math.floor(Math.random() * Math.min(seasonsExperience * 0.15, 5));
    const cwsAppearances = Math.floor(Math.random() * Math.min(seasonsExperience * 0.2, 8));
    const nationalChampionships = Math.random() < 0.1 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    const coachOfYearAwards = Math.floor(Math.random() * Math.min(seasonsExperience * 0.05, 3));
    const allAmericans = Math.floor(seasonsExperience * 0.5 + Math.random() * 10);
    const draftPicks = Math.floor(seasonsExperience * 2 + Math.random() * 20);
    
    // Random appearance
    const appearance = getRandomAppearance();
    
    const coach = await storage.createCoach({
      userId: null, // CPU coach - no user
      teamId: team.id,
      leagueId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      archetype: archetypes[Math.floor(Math.random() * archetypes.length)],
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
    });
    // Set career stats and skills after creation (not in insertCoachSchema)
    await storage.updateCoach(coach.id, {
      careerWins,
      careerLosses,
      confWins,
      confLosses,
      confChampionships,
      cwsAppearances,
      nationalChampionships,
      coachOfYearAwards,
      allAmericans,
      draftPicks,
    });

    // Initialize personality/traits/philosophy at creation time
    try { await ensureCoachTraits(coach, 1); } catch (traitErr) {
      console.error("[generateCpuCoach] ensureCoachTraits failed:", traitErr);
    }
    
    // Link coach to team
    await storage.updateTeam(team.id, { coachId: coach.id });
  }
}
