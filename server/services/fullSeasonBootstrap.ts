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
import { db } from "../db";
import { games } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
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
  // Idempotency guarantee: delete-before-regenerate per team.
  // A team with 0 players → generate fresh.
  // A team with 1-24 players (partial crash) → delete all then regenerate.
  // A team with exactly 25 players → skip (already complete).
  // Deleting before re-inserting ensures a restart after a partial write
  // always converges to a consistent 25-player state without duplicates.
  await updateProgress(jobId, 20, "Building rosters");
  const league = await storage.getLeague(leagueId);
  const progressionEnabled = league?.progressionEnabled ?? true;

  const confNameById = new Map(conferences.map(c => [c.id, c.name]));

  // Determine which teams need player generation; clean up partial writes first.
  const teamsNeedingPlayers: typeof leagueTeams = [];
  for (const team of leagueTeams) {
    const existingPlayers = await storage.getPlayersByTeam(team.id);
    if (existingPlayers.length === EXPECTED_PLAYERS_PER_TEAM) continue; // already done
    if (existingPlayers.length > 0) {
      // Partial write from a prior crashed run — delete before regenerating.
      await storage.deletePlayersByTeam(team.id);
    }
    teamsNeedingPlayers.push(team);
  }

  // Process teams in parallel batches of 8 to balance speed and DB pressure.
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

  // Auto-assign lineups — independently idempotent per team.
  // A team has a complete lineup if ≥ 9 players have battingOrder set.
  // This check is independent of teamsNeedingPlayers so a crash after player
  // generation but before lineup assignment is correctly repaired on resume.
  await updateProgress(jobId, 48, "Assigning lineups");
  for (const team of leagueTeams) {
    const teamPlayers = await storage.getPlayersByTeam(team.id);
    const assignedCount = teamPlayers.filter(p => p.battingOrder != null).length;
    if (assignedCount < 9) {
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
  // Idempotency guarantee: check EXACT expected count.
  // A partial write (crash mid-class-generation) leaves existingRecruits.length > 0
  // but < recruitCount.  In that case, delete the partial class and regenerate
  // in full.  Skipping only when the count matches exactly prevents silently
  // serving a truncated class on bootstrap resume.
  await updateProgress(jobId, 58, "Generating recruiting class");
  // Full-season bootstrap always uses the full_season preset formula.
  const recruitCount = getRecruitPoolSize(leagueTeams.length, "full_season");
  const existingRecruits = await storage.getRecruitsByLeague(leagueId);
  if (existingRecruits.length === recruitCount) {
    console.log(`[bootstrap:${leagueId}] Recruiting class: already complete (${existingRecruits.length} recruits)`);
  } else {
    if (existingRecruits.length > 0) {
      // Partial class from a prior crashed run — delete before regenerating.
      await storage.deleteRecruitsByLeague(leagueId);
    }
    const vintage = await generateRecruits(leagueId, recruitCount, true);
    await storage.updateLeague(leagueId, { currentClassVintage: vintage });
    console.log(`[bootstrap:${leagueId}] Recruiting class: ${recruitCount} recruits generated`);
  }

  // ── Checkpoint 7: Schedule ────────────────────────────────────────────────
  // Transaction guarantee: the delete + bulk-insert runs inside a single DB
  // transaction so a crash mid-insert leaves 0 games (not a partial set).
  // On the next resume, 0 games triggers a clean regeneration.
  await updateProgress(jobId, 65, "Creating schedule");
  const existingGames = await storage.getGamesByLeagueSeason(leagueId, 1);
  const existingRegular = existingGames.filter((g: any) => g.phase === "regular");
  if (existingRegular.length !== EXPECTED_TOTAL_GAMES) {
    if (existingRegular.length > 0) {
      console.warn(`[bootstrap:${leagueId}] Partial schedule found (${existingRegular.length} games), deleting and regenerating`);
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

    // Atomic: delete any existing regular games + insert all new ones in one transaction.
    const GAME_CHUNK = 500;
    await db.transaction(async (tx) => {
      await tx.delete(games).where(
        and(eq(games.leagueId, leagueId), eq(games.season, 1), eq(games.phase, "regular"))
      );
      for (let i = 0; i < scheduleGames.length; i += GAME_CHUNK) {
        await tx.insert(games).values(scheduleGames.slice(i, i + GAME_CHUNK));
      }
    });
    console.log(`[bootstrap:${leagueId}] Schedule: ${scheduleGames.length} games created (transactional)`);
  } else {
    console.log(`[bootstrap:${leagueId}] Schedule: already exists (${existingRegular.length} games)`);
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
