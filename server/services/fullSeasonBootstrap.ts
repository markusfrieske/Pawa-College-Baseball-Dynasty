/**
 * Full Season bootstrap service — 8 idempotent checkpoints.
 *
 * Checkpoints:
 *   1. league_row     — league already exists (created at job-enqueue time)
 *   2. conferences    — 12 conferences created
 *   3. teams          — 149 teams + standings rows created
 *   4. players        — 3,725 players created (25/team, via generatePlayersForTeam)
 *   5. cpu_coaches    — CPU coaches assigned to all 149 teams
 *   6. recruiting     — recruiting class generated
 *   7. schedule       — exactly 4,172-game schedule created
 *   8. validation     — schedule health invariants pass
 *
 * Each checkpoint is idempotent: if it detects it has already been completed
 * (by checking the DB state), it skips and moves to the next.
 */

import { storage } from "../storage";
import {
  getTeamsForConference,
  generateCpuCoaches,
  generatePlayersForTeam,
  generateRecruits,
  generateExhibitionGames,
} from "../recruit-engine";
import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "../rosterScaleFactors";
import { FULL_SEASON_CONF_NAMES } from "../../shared/catalog";
import { getRecruitPoolSize } from "../utils";
import { autoAssignLineup } from "../route-helpers";
import { buildFullSeasonSchedule, validateFullSeasonSchedule } from "./schedule/fullSeasonScheduler";

const EXPECTED_PLAYERS_PER_TEAM = 25;
const EXPECTED_TOTAL_GAMES = 4172;

async function updateProgress(jobId: string, progress: number, stage: string): Promise<void> {
  await storage.updateLeagueJob(jobId, {
    progress,
    metadata: { stage } as any,
  });
}

/** Main bootstrap entry point. Throws on fatal errors. */
export async function runFullSeasonBootstrap(leagueId: string, jobId: string): Promise<void> {

  // ── Checkpoint 2: Conferences ──────────────────────────────────────────────
  await updateProgress(jobId, 5, "Creating conferences");
  let conferences = await storage.getConferencesByLeague(leagueId);
  if (conferences.length < FULL_SEASON_CONF_NAMES.length) {
    const existing = new Set(conferences.map(c => c.name));
    for (const confName of FULL_SEASON_CONF_NAMES) {
      if (!existing.has(confName)) {
        await storage.createConference({ leagueId, name: confName });
      }
    }
    conferences = await storage.getConferencesByLeague(leagueId);
  }
  console.log(`[bootstrap:${leagueId}] Conferences: ${conferences.length}`);

  // ── Checkpoint 3: Teams + Standings ───────────────────────────────────────
  await updateProgress(jobId, 10, "Creating teams");
  let leagueTeams = await storage.getTeamsByLeague(leagueId);
  if (leagueTeams.length < TOTAL_NATIONAL_TEAMS) {
    const existingTeamNames = new Set(leagueTeams.map(t => t.name));
    for (const conf of conferences) {
      const confTeams = getTeamsForConference(conf.name);
      for (const teamData of confTeams) {
        if (!existingTeamNames.has(teamData.name)) {
          const team = await storage.createTeam({
            ...teamData,
            leagueId,
            conferenceId: conf.id,
            isCpu: true,
            nationalRank: NATIONAL_RANKS[teamData.name] ?? TOTAL_NATIONAL_TEAMS,
          });
          existingTeamNames.add(teamData.name);
          leagueTeams.push(team);
        }
      }
    }
    leagueTeams = await storage.getTeamsByLeague(leagueId);
  }
  // Standings idempotency: check per-team (teams may exist but standings may be missing
  // if a prior run crashed between team creation and standings creation).
  const existingStandings = await storage.getStandingsByLeague(leagueId, 1);
  const teamsWithStandings = new Set(existingStandings.map(s => s.teamId));
  for (const team of leagueTeams) {
    if (!teamsWithStandings.has(team.id)) {
      await storage.createStandings({ leagueId, teamId: team.id, season: 1 });
    }
  }
  console.log(`[bootstrap:${leagueId}] Teams: ${leagueTeams.length}`);

  // ── Checkpoint 4: Players ─────────────────────────────────────────────────
  await updateProgress(jobId, 20, "Building rosters");
  const league = await storage.getLeague(leagueId);
  const progressionEnabled = league?.progressionEnabled ?? true;

  const confNameById = new Map(conferences.map(c => [c.id, c.name]));

  // Determine which teams still need players
  const teamsNeedingPlayers: typeof leagueTeams = [];
  for (const team of leagueTeams) {
    const existingPlayers = await storage.getPlayersByTeam(team.id);
    if (existingPlayers.length < EXPECTED_PLAYERS_PER_TEAM) {
      teamsNeedingPlayers.push(team);
    }
  }

  // Process teams in parallel batches of 8 to balance speed and DB pressure
  const BATCH_SIZE = 8;
  for (let i = 0; i < teamsNeedingPlayers.length; i += BATCH_SIZE) {
    const batch = teamsNeedingPlayers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(team => {
      const confName = team.conferenceId ? confNameById.get(team.conferenceId) : undefined;
      return generatePlayersForTeam(team.id, progressionEnabled, team.name, confName);
    }));
    const pct = 20 + Math.round((i / Math.max(teamsNeedingPlayers.length, 1)) * 28);
    await updateProgress(jobId, pct, "Building rosters");
  }
  console.log(`[bootstrap:${leagueId}] Players: generated for ${teamsNeedingPlayers.length} teams`);

  // Auto-assign lineups for all teams that needed player generation
  if (teamsNeedingPlayers.length > 0) {
    await updateProgress(jobId, 48, "Assigning lineups");
    for (const team of leagueTeams) {
      const teamPlayers = await storage.getPlayersByTeam(team.id);
      await autoAssignLineup(teamPlayers, team.id);
    }
  }

  // ── Checkpoint 5: CPU Coaches ──────────────────────────────────────────────
  await updateProgress(jobId, 52, "Setting up coaches");
  const existingCoaches = await storage.getCoachesByLeague(leagueId);
  const teamsWithCoaches = new Set(existingCoaches.map(c => c.teamId));
  const teamsMissingCoaches = leagueTeams.filter(t => !teamsWithCoaches.has(t.id));
  if (teamsMissingCoaches.length > 0) {
    await generateCpuCoaches(leagueId);
  }
  console.log(`[bootstrap:${leagueId}] Coaches assigned`);

  // ── Checkpoint 6: Recruiting Class ───────────────────────────────────────
  await updateProgress(jobId, 58, "Generating recruiting class");
  const existingRecruits = await storage.getRecruitsByLeague(leagueId);
  if (existingRecruits.length === 0) {
    const recruitCount = getRecruitPoolSize(leagueTeams.length);
    const vintage = await generateRecruits(leagueId, recruitCount, true);
    await storage.updateLeague(leagueId, { currentClassVintage: vintage });
    console.log(`[bootstrap:${leagueId}] Recruiting class: ${recruitCount} recruits generated`);
  } else {
    console.log(`[bootstrap:${leagueId}] Recruiting class: already exists (${existingRecruits.length} recruits)`);
  }

  // ── Checkpoint 7: Schedule ────────────────────────────────────────────────
  await updateProgress(jobId, 65, "Creating schedule");
  const existingGames = await storage.getGamesByLeagueSeason(leagueId, 1);
  const regularGames = existingGames.filter((g: any) => g.phase === "regular");
  if (regularGames.length !== EXPECTED_TOTAL_GAMES) {
    if (regularGames.length > 0) {
      console.warn(`[bootstrap:${leagueId}] Partial schedule found (${regularGames.length} games), deleting and regenerating`);
      await storage.deleteRegularGamesByLeagueSeason(leagueId, 1);
    }

    const currentTeams = await storage.getTeamsByLeague(leagueId);
    const currentConfs = await storage.getConferencesByLeague(leagueId);

    const scheduleGames = buildFullSeasonSchedule({
      leagueId,
      season: 1,
      teams: currentTeams.map(t => ({
        id: t.id,
        conferenceId: t.conferenceId ?? "",
        name: t.name,
      })),
      conferences: currentConfs.map(c => ({ id: c.id, name: c.name })),
    });

    await updateProgress(jobId, 72, "Creating schedule");
    await storage.batchCreateGames(scheduleGames);
    console.log(`[bootstrap:${leagueId}] Schedule: ${scheduleGames.length} games created`);
  } else {
    console.log(`[bootstrap:${leagueId}] Schedule: already exists (${regularGames.length} games)`);
  }

  // Exhibition games (spring training)
  const exhibitionGames = existingGames.filter((g: any) => g.phase === "exhibition");
  if (exhibitionGames.length === 0) {
    await generateExhibitionGames(leagueId, 1);
  }

  // ── Checkpoint 8: Health Validation ──────────────────────────────────────
  await updateProgress(jobId, 88, "Validating universe");
  const finalGames = await storage.getGamesByLeagueSeason(leagueId, 1);
  const finalRegular = finalGames.filter((g: any) => g.phase === "regular");
  const finalTeams = await storage.getTeamsByLeague(leagueId);

  const violations = validateFullSeasonSchedule(
    finalRegular.map((g: any) => ({
      leagueId: g.leagueId,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      phase: g.phase,
      isConference: g.isConference,
      gameType: g.gameType,
    })),
    finalTeams.map(t => ({
      id: t.id,
      conferenceId: t.conferenceId ?? "",
      name: t.name,
    })),
  );

  if (violations.length > 0) {
    const msg = violations.map(v => `[${v.code}] ${v.message}`).join("; ");
    throw new Error(`Schedule validation failed: ${msg}`);
  }

  console.log(`[bootstrap:${leagueId}] Validation passed — ${finalRegular.length} regular-season games, ${finalTeams.length} teams`);
  await updateProgress(jobId, 100, "Done");
}
