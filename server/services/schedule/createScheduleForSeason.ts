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
import { games } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../../storage";
import { generateSchedule } from "../../recruit-engine";
import {
  buildFullSeasonSchedule,
  validateFullSeasonSchedule,
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

async function createFullSeasonSchedule(
  leagueId: string,
  season: number
): Promise<void> {
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
      `[createScheduleForSeason] Partial schedule (${existingRegular.length} games) found for season ${season} — deleting and regenerating`
    );
  }

  const teams = await storage.getTeamsByLeague(leagueId);
  const conferences = await storage.getConferencesByLeague(leagueId);

  const seedVal = league.scheduleSeed != null ? parseInt(league.scheduleSeed, 10) : 0;
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
    await tx
      .delete(games)
      .where(
        and(
          eq(games.leagueId, leagueId),
          eq(games.season, season),
          eq(games.phase, "regular")
        )
      );
    for (let i = 0; i < scheduleGames.length; i += GAME_CHUNK) {
      await tx.insert(games).values(scheduleGames.slice(i, i + GAME_CHUNK));
    }
  });

  console.log(
    `[createScheduleForSeason] FS season ${season} schedule created: ${scheduleGames.length} games`
  );
}
