/**
 * Coach Rivalry Routes
 *
 * GET /api/leagues/:id/rivalries          — all HvH rivalries in the league
 * GET /api/leagues/:id/coaches/:coachId/rivalries — one coach's rivalries
 *
 * Only games between two human coaches (userId non-null) are counted.
 * Recruiting conflicts are derived on-the-fly from recruiting_interests.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import { db } from "../db";
import { recruits, recruitingInterests } from "@shared/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import type { Coach, CoachRivalry, Team } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rivalryKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

function heatScore(r: CoachRivalry, recruitingConflicts: number): number {
  return Math.min(
    100,
    r.gamesPlayed * 5 +
    r.postseasonGames * 15 +
    recruitingConflicts * 4,
  );
}

function heatLabel(score: number): string {
  if (score >= 75) return "Scorching";
  if (score >= 50) return "Heated";
  if (score >= 25) return "Warming";
  return "Developing";
}

function heatColor(score: number): string {
  if (score >= 75) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-muted-foreground";
}

function formatCoach(coach: Coach, team: Team | undefined | null) {
  return {
    id: coach.id,
    firstName: coach.firstName,
    lastName: coach.lastName,
    level: coach.level,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    teamAbbreviation: team?.abbreviation ?? null,
    teamPrimaryColor: team?.primaryColor ?? null,
    teamSecondaryColor: team?.secondaryColor ?? null,
  };
}

interface RecruitingConflictEntry {
  conflicts: number;
  coachASignings: number;
  coachBSignings: number;
}

async function computeRecruitingConflicts(
  leagueId: string,
  teamIdToCoachId: Map<string, string>,
): Promise<Map<string, RecruitingConflictEntry>> {
  const result = new Map<string, RecruitingConflictEntry>();
  if (teamIdToCoachId.size < 2) return result;

  const leagueRecruits = await db
    .select({ id: recruits.id, signedTeamId: recruits.signedTeamId })
    .from(recruits)
    .where(eq(recruits.leagueId, leagueId));

  if (leagueRecruits.length === 0) return result;

  const recruitIds = leagueRecruits.map(r => r.id);
  const signedByRecruit = new Map(
    leagueRecruits.filter(r => r.signedTeamId).map(r => [r.id, r.signedTeamId!]),
  );

  const humanTeamIds = [...teamIdToCoachId.keys()];

  const BATCH = 1000;
  const allInterests: Array<{ recruitId: string; teamId: string }> = [];
  for (let i = 0; i < recruitIds.length; i += BATCH) {
    const batch = recruitIds.slice(i, i + BATCH);
    const rows = await db
      .select({ recruitId: recruitingInterests.recruitId, teamId: recruitingInterests.teamId })
      .from(recruitingInterests)
      .where(
        and(
          inArray(recruitingInterests.recruitId, batch),
          inArray(recruitingInterests.teamId, humanTeamIds),
          or(
            eq(recruitingInterests.hasOffer, true),
            eq(recruitingInterests.isTargeted, true),
          ),
        ),
      );
    allInterests.push(...rows);
  }

  // Group by recruitId → list of human teamIds
  const byRecruit = new Map<string, string[]>();
  for (const row of allInterests) {
    const list = byRecruit.get(row.recruitId) ?? [];
    list.push(row.teamId);
    byRecruit.set(row.recruitId, list);
  }

  for (const [recruitId, teamIds] of byRecruit) {
    const humanTeams = [...new Set(teamIds)].filter(t => teamIdToCoachId.has(t));
    if (humanTeams.length < 2) continue;

    const signerCoachId = signedByRecruit.has(recruitId)
      ? teamIdToCoachId.get(signedByRecruit.get(recruitId)!)
      : null;

    for (let i = 0; i < humanTeams.length; i++) {
      for (let j = i + 1; j < humanTeams.length; j++) {
        const ci = teamIdToCoachId.get(humanTeams[i])!;
        const cj = teamIdToCoachId.get(humanTeams[j])!;
        const [aId, bId] = ci < cj ? [ci, cj] : [cj, ci];
        const key = `${aId}:${bId}`;

        const entry = result.get(key) ?? { conflicts: 0, coachASignings: 0, coachBSignings: 0 };
        entry.conflicts++;
        if (signerCoachId === aId) entry.coachASignings++;
        else if (signerCoachId === bId) entry.coachBSignings++;
        result.set(key, entry);
      }
    }
  }

  return result;
}

function enrichRivalry(
  r: CoachRivalry,
  coachMap: Map<string, Coach>,
  teamMap: Map<string, Team>,
  recruitingConflicts: Map<string, RecruitingConflictEntry>,
  userCoachId: string | null,
) {
  const coachA = coachMap.get(r.coachAId);
  const coachB = coachMap.get(r.coachBId);
  const teamA = coachA?.teamId ? teamMap.get(coachA.teamId) : null;
  const teamB = coachB?.teamId ? teamMap.get(coachB.teamId) : null;

  const key = `${r.coachAId}:${r.coachBId}`;
  const rc = recruitingConflicts.get(key) ?? { conflicts: 0, coachASignings: 0, coachBSignings: 0 };

  const heat = heatScore(r, rc.conflicts);

  const isMyRivalry = userCoachId && (r.coachAId === userCoachId || r.coachBId === userCoachId);
  const amA = isMyRivalry && userCoachId === r.coachAId;

  const myWins    = amA ? r.coachAWins : r.coachBWins;
  const theirWins = amA ? r.coachBWins : r.coachAWins;
  const myRuns    = amA ? r.coachARunsScored : r.coachBRunsScored;
  const theirRuns = amA ? r.coachBRunsScored : r.coachARunsScored;

  const streakIsMe =
    isMyRivalry && r.currentStreakWinnerId === userCoachId && r.currentStreakLength > 1;
  const streakIsThem =
    isMyRivalry && r.currentStreakWinnerId !== userCoachId && r.currentStreakWinnerId != null && r.currentStreakLength > 1;

  return {
    id: r.id,
    coachA: coachA ? formatCoach(coachA, teamA) : null,
    coachB: coachB ? formatCoach(coachB, teamB) : null,
    record: {
      gamesPlayed: r.gamesPlayed,
      coachAWins: r.coachAWins,
      coachBWins: r.coachBWins,
      coachARunsScored: r.coachARunsScored,
      coachBRunsScored: r.coachBRunsScored,
      avgRunDiff:
        r.gamesPlayed > 0
          ? Math.round((Math.abs(r.coachARunsScored - r.coachBRunsScored) / r.gamesPlayed) * 10) / 10
          : 0,
      postseasonGames: r.postseasonGames,
      coachAPostseasonWins: r.coachAPostseasonWins,
      coachBPostseasonWins: r.coachBPostseasonWins,
      currentStreakWinnerId: r.currentStreakWinnerId ?? null,
      currentStreakLength: r.currentStreakLength,
      lastMeetingSeason: r.lastMeetingSeason ?? null,
      lastMeetingWeek: r.lastMeetingWeek ?? null,
      lastMeetingCoachAScore: r.lastMeetingCoachAScore ?? null,
      lastMeetingCoachBScore: r.lastMeetingCoachBScore ?? null,
      lastMeetingWinnerId: r.lastMeetingWinnerId ?? null,
      biggestWinMargin: r.biggestWinMargin,
      biggestWinCoachId: r.biggestWinCoachId ?? null,
    },
    recruiting: rc,
    heatScore: heat,
    heatLabel: heatLabel(heat),
    heatColor: heatColor(heat),
    isMyRivalry: !!isMyRivalry,
    // Perspective fields (only meaningful when isMyRivalry)
    myWins,
    theirWins,
    myRuns,
    theirRuns,
    myPostseasonWins: amA ? r.coachAPostseasonWins : r.coachBPostseasonWins,
    myRecruitSignings: amA ? rc.coachASignings : rc.coachBSignings,
    theirRecruitSignings: amA ? rc.coachBSignings : rc.coachASignings,
    streakIsMe,
    streakIsThem,
    streakLength: r.currentStreakLength,
    updatedAt: r.updatedAt,
  };
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerRivalryRoutes(app: Express): void {
  // ── GET /api/leagues/:id/rivalries ─────────────────────────────────────────
  app.get("/api/leagues/:id/rivalries", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;

      const [league, coaches, teams, rivalries] = await Promise.all([
        storage.getLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
        storage.getRivalriesByLeague(leagueId),
      ]);

      if (!league) return res.status(404).json({ message: "League not found" });

      const humanCoaches = coaches.filter(c => !!c.userId);
      const humanCoachIds = new Set(humanCoaches.map(c => c.id));

      // Only rivalries between human coaches
      const hvhRivalries = rivalries.filter(
        r => humanCoachIds.has(r.coachAId) && humanCoachIds.has(r.coachBId),
      );

      const coachMap = new Map(coaches.map(c => [c.id, c]));
      const teamMap = new Map(teams.map(t => [t.id, t]));

      // teamId → coachId for human coaches with a team
      const teamIdToCoachId = new Map<string, string>(
        humanCoaches.filter(c => !!c.teamId).map(c => [c.teamId!, c.id]),
      );

      const userCoach = humanCoaches.find(c => c.userId === userId);

      const recruitingConflicts = await computeRecruitingConflicts(leagueId, teamIdToCoachId);

      const enriched = hvhRivalries
        .map(r => enrichRivalry(r, coachMap, teamMap, recruitingConflicts, userCoach?.id ?? null))
        .sort((a, b) => b.heatScore - a.heatScore);

      res.json({
        rivalries: enriched,
        myRivalries: enriched.filter(r => r.isMyRivalry),
        userCoachId: userCoach?.id ?? null,
      });
    } catch (err) {
      console.error("[rivalries] GET /rivalries failed:", err);
      res.status(500).json({ message: "Failed to load rivalries" });
    }
  });

  // ── GET /api/leagues/:id/coaches/:coachId/rivalries ────────────────────────
  app.get("/api/leagues/:id/coaches/:coachId/rivalries", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, coachId } = req.params as { id: string; coachId: string };
      const userId = req.session.userId!;

      const [league, coaches, teams, rivalries] = await Promise.all([
        storage.getLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
        storage.getRivalriesByCoach(coachId, leagueId),
      ]);

      if (!league) return res.status(404).json({ message: "League not found" });

      const targetCoach = coaches.find(c => c.id === coachId);
      if (!targetCoach) return res.status(404).json({ message: "Coach not found" });

      const humanCoaches = coaches.filter(c => !!c.userId);
      const humanCoachIds = new Set(humanCoaches.map(c => c.id));
      const hvhRivalries = rivalries.filter(
        r => humanCoachIds.has(r.coachAId) && humanCoachIds.has(r.coachBId),
      );

      const coachMap = new Map(coaches.map(c => [c.id, c]));
      const teamMap = new Map(teams.map(t => [t.id, t]));
      const teamIdToCoachId = new Map<string, string>(
        humanCoaches.filter(c => !!c.teamId).map(c => [c.teamId!, c.id]),
      );

      const userCoach = humanCoaches.find(c => c.userId === userId);
      const recruitingConflicts = await computeRecruitingConflicts(leagueId, teamIdToCoachId);

      const enriched = hvhRivalries
        .map(r => enrichRivalry(r, coachMap, teamMap, recruitingConflicts, coachId))
        .sort((a, b) => b.heatScore - a.heatScore);

      const targetTeam = targetCoach.teamId ? teamMap.get(targetCoach.teamId) : null;

      res.json({
        rivalries: enriched,
        coach: formatCoach(targetCoach, targetTeam),
        isOwnProfile: userCoach?.id === coachId,
      });
    } catch (err) {
      console.error("[rivalries] GET coach rivalries failed:", err);
      res.status(500).json({ message: "Failed to load coach rivalries" });
    }
  });
}
