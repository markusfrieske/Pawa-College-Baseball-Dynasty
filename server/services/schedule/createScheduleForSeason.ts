/**
 * createScheduleForSeason — authoritative schedule-generation entry point.
 *
 * Two public paths:
 *  1. createScheduleForSeason   — initial creation during dynasty setup / season
 *     rollover. Skips if a complete schedule already exists (idempotent for the
 *     setup flow).
 *  2. publishFullSeasonSchedule — commissioner-triggered explicit republish.
 *     Never short-circuits: always rebuilds and atomically replaces only the
 *     unlocked (isComplete=false) future regular games.
 *
 * Both paths share the same core build → validate → transact logic via the
 * internal _buildAndPublish helper.
 */

import { db } from "../../db";
import { games, leagues, auditLogs } from "../../../shared/schema";
import { eq, and, sql, notInArray } from "drizzle-orm";
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

// ─── Public: initial creation ────────────────────────────────────────────────

export async function createScheduleForSeason(
  leagueId: string,
  season: number = 1
): Promise<void> {
  const league = await storage.getLeague(leagueId);

  if (league?.dynastyPreset === "full_season") {
    await _initialCreateFullSeasonSchedule(leagueId, season);
  } else {
    await generateSchedule(leagueId, season);
  }
}

// ─── Public: explicit commissioner republish ──────────────────────────────────

/**
 * Rebuild and atomically publish the schedule for the given season.
 * Unlike createScheduleForSeason this never short-circuits: it is designed for
 * explicit commissioner-triggered republishing of an already-published schedule.
 * Only unlocked (isComplete = false) regular games are replaced; completed games
 * are left untouched.
 *
 * Returns the number of new games written.
 */
export async function publishFullSeasonSchedule(
  leagueId: string,
  season: number
): Promise<number> {
  const league = await storage.getLeague(leagueId);
  if (league?.dynastyPreset !== "full_season") {
    throw new Error(
      `[publishFullSeasonSchedule] League ${leagueId} is not a full_season dynasty`
    );
  }
  return _buildAndPublish(leagueId, season, /* calledByExplicitPublish */ true);
}

// ─── Public: preview (pure, no DB writes) ────────────────────────────────────

/**
 * Build the schedule as a pure function and return summary stats without
 * writing anything to the database. Safe to call repeatedly.
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Initial creation path — skips when the schedule is already complete.
 * This avoids regenerating a good schedule on every restart / season rollover.
 */
async function _initialCreateFullSeasonSchedule(
  leagueId: string,
  season: number
): Promise<void> {
  const existingGames = await storage.getGamesByLeagueSeason(leagueId, season);
  const existingRegular = existingGames.filter((g) => g.phase === "regular");

  if (existingRegular.length === EXPECTED_TOTAL_GAMES) {
    console.log(
      `[createScheduleForSeason] FS schedule already complete for season ${season} ` +
      `(${existingRegular.length} games) — skipping. Use publish endpoint to force republish.`
    );
    return;
  }

  if (existingRegular.length > 0) {
    console.warn(
      `[createScheduleForSeason] Partial schedule (${existingRegular.length} / ${EXPECTED_TOTAL_GAMES} games) ` +
      `found for season ${season} — rebuilding`
    );
  }

  await _buildAndPublish(leagueId, season, false);
}

/**
 * Core: build → validate → atomically publish.
 *
 * @param explicitPublish  When true the audit log action is "schedule_republished"
 *   (commissioner-triggered) instead of "schedule_published" (initial creation).
 * @returns  Number of new games written into the database.
 */
async function _buildAndPublish(
  leagueId: string,
  season: number,
  explicitPublish: boolean
): Promise<number> {
  const league = await storage.getLeague(leagueId);
  const teams = await storage.getTeamsByLeague(leagueId);
  const conferences = await storage.getConferencesByLeague(leagueId);

  const seedVal = league?.scheduleSeed != null ? parseInt(league.scheduleSeed, 10) : 0;
  const scheduleTeams: ScheduleTeam[] = teams.map((t) => ({
    id: t.id,
    conferenceId: t.conferenceId ?? "",
    name: t.name,
  }));

  const scheduleGames = buildFullSeasonSchedule({
    leagueId,
    season,
    teams: scheduleTeams,
    conferences: conferences.map((c) => ({ id: c.id, name: c.name })),
    seed: Number.isFinite(seedVal) ? seedVal : 0,
  });

  const errors = validateFullSeasonSchedule(scheduleGames, scheduleTeams);
  if (errors.length > 0) {
    const msg = errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(
      `[createScheduleForSeason] FS schedule validation failed for season ${season}: ${msg}`
    );
  }

  // Determine which weeks already have at least one completed regular game.
  // Those weeks are "locked" — we must not touch any game in them so completed
  // rows survive intact and no duplicate games are created.
  const existingGamesForSeason = await storage.getGamesByLeagueSeason(leagueId, season);
  const lockedWeeks = new Set(
    existingGamesForSeason
      .filter((g) => g.phase === "regular" && g.isComplete)
      .map((g) => g.week)
  );

  // Only schedule games for unlocked weeks.
  const gamesToInsert = lockedWeeks.size > 0
    ? scheduleGames.filter((g) => !lockedWeeks.has(g.week))
    : scheduleGames;

  await db.transaction(async (tx) => {
    // Delete only unlocked (not-yet-played) regular games that belong to
    // weeks with no completed games.  This prevents touching any week whose
    // outcome is already recorded.
    if (lockedWeeks.size > 0) {
      const lockedWeekArr = [...lockedWeeks];
      await tx
        .delete(games)
        .where(
          and(
            eq(games.leagueId, leagueId),
            eq(games.season, season),
            eq(games.phase, "regular"),
            eq(games.isComplete, false),
            notInArray(games.week, lockedWeekArr)
          )
        );
    } else {
      // No completed games — safe to delete all unlocked regular games.
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
    }
    for (let i = 0; i < gamesToInsert.length; i += GAME_CHUNK) {
      await tx.insert(games).values(gamesToInsert.slice(i, i + GAME_CHUNK));
    }

    // Bump scheduleVersion on every atomic publish so callers can detect
    // staleness by comparing version numbers.
    await tx
      .update(leagues)
      .set({ scheduleVersion: sql`COALESCE(schedule_version, 0) + 1` })
      .where(eq(leagues.id, leagueId));

    // Durable audit trail.
    await tx.insert(auditLogs).values({
      leagueId,
      action: explicitPublish ? "schedule_republished" : "schedule_published",
      details:
        `Season ${season} FS schedule ${explicitPublish ? "re" : ""}published: ` +
        `${scheduleGames.length} games`,
    });
  });

  console.log(
    `[createScheduleForSeason] FS season ${season} schedule ` +
    `${explicitPublish ? "re" : ""}published: ${scheduleGames.length} games`
  );

  return scheduleGames.length;
}
