/**
 * createScheduleForSeason — authoritative schedule-generation entry point.
 *
 * Routes calls to the exact Full Season scheduler (buildFullSeasonSchedule)
 * for dynastyPreset === "full_season" leagues, and to the legacy custom
 * scheduler (generateSchedule) for all other presets.
 *
 * All Phase-4 schedule entry points must go through this function so that
 * Season 1 and every subsequent season use the same code path.
 */

import { db } from "../../db";
import { games, leagues, auditLogs } from "../../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { generateSchedule } from "../../recruit-engine";
import {
  buildFullSeasonSchedule,
  validateFullSeasonSchedule,
  type ScheduleTeam,
  type ScheduleConference,
} from "./fullSeasonScheduler";

const EXPECTED_TOTAL_GAMES = 4172;
const GAME_CHUNK = 500;

export async function createScheduleForSeason(
  leagueId: string,
  season: number = 1
): Promise<void> {
  const league = await storage.getLeague(leagueId);

  if (league?.dynastyPreset === "full_season") {
    await createFullSeasonSchedule(leagueId, season);
  } else {
    await generateSchedule(leagueId, season);
  }
}

/**
 * Preview-only: builds the schedule as a pure function and returns summary
 * stats without writing anything to the database.  Safe to call repeatedly.
 */
export async function previewFullSeasonSchedule(
  leagueId: string,
  season: number = 1
): Promise<{
  totalGames: number;
  teamCount: number;
  conferenceCount: number;
  homeRangeMin: number;
  homeRangeMax: number;
  maxOocPairMeetings: number;
  minUniqueOocOpponents: number;
  validationErrors: { code: string; message: string }[];
}> {
  const league = await storage.getLeague(leagueId);
  const teams = await storage.getTeamsByLeague(leagueId);
  const confs = await storage.getConferencesByLeague(leagueId);

  const seedVal = league?.scheduleSeed != null ? parseInt(league.scheduleSeed, 10) : 0;
  const scheduleTeams: ScheduleTeam[] = teams.map((t) => ({
    id: t.id,
    conferenceId: t.conferenceId ?? "",
    name: t.name,
  }));
  const scheduleConfs: ScheduleConference[] = confs.map((c) => ({ id: c.id, name: c.name }));

  const scheduleGames = buildFullSeasonSchedule({
    leagueId,
    season,
    teams: scheduleTeams,
    conferences: scheduleConfs,
    seed: Number.isFinite(seedVal) ? seedVal : 0,
  });

  const errors = validateFullSeasonSchedule(scheduleGames, scheduleTeams);

  const homeCount = new Map<string, number>();
  for (const t of scheduleTeams) homeCount.set(t.id, 0);
  for (const g of scheduleGames) homeCount.set(g.homeTeamId, (homeCount.get(g.homeTeamId) ?? 0) + 1);
  const homeVals = [...homeCount.values()];

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairCounts = new Map<string, number>();
  const oocOpps = new Map<string, Set<string>>();
  for (const t of scheduleTeams) oocOpps.set(t.id, new Set());
  for (const g of scheduleGames.filter((g) => !g.isConference)) {
    const k = pairKey(g.homeTeamId, g.awayTeamId);
    pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
    oocOpps.get(g.homeTeamId)!.add(g.awayTeamId);
    oocOpps.get(g.awayTeamId)!.add(g.homeTeamId);
  }

  return {
    totalGames: scheduleGames.length,
    teamCount: scheduleTeams.length,
    conferenceCount: scheduleConfs.length,
    homeRangeMin: Math.min(...homeVals),
    homeRangeMax: Math.max(...homeVals),
    maxOocPairMeetings: pairCounts.size > 0 ? Math.max(...pairCounts.values()) : 0,
    minUniqueOocOpponents: oocOpps.size > 0 ? Math.min(...[...oocOpps.values()].map((s) => s.size)) : 0,
    validationErrors: errors,
  };
}

async function createFullSeasonSchedule(
  leagueId: string,
  season: number
): Promise<void> {
  const league = await storage.getLeague(leagueId);
  const existingGames = await storage.getGamesByLeagueSeason(leagueId, season);
  const existingRegular = existingGames.filter((g) => g.phase === "regular");

  if (existingRegular.length === EXPECTED_TOTAL_GAMES) {
    console.log(
      `[createScheduleForSeason] FS schedule already complete for season ${season} (${existingRegular.length} games) — skipping`
    );
    return;
  }

  if (existingRegular.length > 0) {
    console.warn(
      `[createScheduleForSeason] Partial schedule (${existingRegular.length} games) found for season ${season} — deleting unlocked games and regenerating`
    );
  }

  const teams = await storage.getTeamsByLeague(leagueId);
  const conferences = await storage.getConferencesByLeague(leagueId);

  const seedVal = league?.scheduleSeed != null ? parseInt(league.scheduleSeed, 10) : 0;
  const scheduleGames = buildFullSeasonSchedule({
    leagueId,
    season,
    teams: teams.map((t) => ({
      id: t.id,
      conferenceId: t.conferenceId ?? "",
      name: t.name,
    })),
    conferences: conferences.map((c) => ({ id: c.id, name: c.name })),
    seed: Number.isFinite(seedVal) ? seedVal : 0,
  });

  const scheduleTeams = teams.map((t) => ({
    id: t.id,
    conferenceId: t.conferenceId ?? "",
    name: t.name,
  }));
  const errors = validateFullSeasonSchedule(scheduleGames, scheduleTeams);
  if (errors.length > 0) {
    const msg = errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(
      `[createScheduleForSeason] FS schedule validation failed for season ${season}: ${msg}`
    );
  }

  await db.transaction(async (tx) => {
    // Delete only unlocked (not-yet-played) regular-phase games so that any
    // games already marked complete are never removed.
    await tx
      .delete(games)
      .where(
        and(
          eq(games.leagueId, leagueId),
          eq(games.season, season),
          eq(games.phase, "regular"),
          eq(games.isComplete, false)
        )
      );
    for (let i = 0; i < scheduleGames.length; i += GAME_CHUNK) {
      await tx.insert(games).values(scheduleGames.slice(i, i + GAME_CHUNK));
    }

    // Bump scheduleVersion to track every atomic publish.
    await tx
      .update(leagues)
      .set({ scheduleVersion: sql`COALESCE(schedule_version, 0) + 1` })
      .where(eq(leagues.id, leagueId));

    // Write audit log entry.
    await tx.insert(auditLogs).values({
      leagueId,
      action: "schedule_published",
      details: `Season ${season} FS schedule published: ${scheduleGames.length} games`,
    });
  });

  console.log(
    `[createScheduleForSeason] FS season ${season} schedule created: ${scheduleGames.length} games`
  );
}
