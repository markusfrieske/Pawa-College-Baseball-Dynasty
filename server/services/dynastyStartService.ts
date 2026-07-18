import { randomUUID } from "crypto";
import { pool } from "../db";
import { storage } from "../storage";
import {
  generateCpuCoaches,
  generateExhibitionGames,
  generatePlayersForTeam,
  generateRecruits,
} from "../recruit-engine";
import { createScheduleForSeason } from "./schedule/createScheduleForSeason";
import { replaceLeagueRecruitingClass } from "../lib/replaceLeagueRecruitingClass";
import type { ClassValidationResult } from "../lib/validateRecruitingClass";
import { getRecruitPoolSize } from "../utils";
import { autoAssignLineup } from "../route-helpers";
import { checkTeamRosterStructure } from "../rosterValidation";
import { invalidateLeague } from "../cache";
import type { WizardStoryPlan } from "@shared/schema";
import { initializeStorylineRecruits } from "../storyline-routes";

export interface DynastyStartInput {
  leagueId: string;
  userId: string;
  rosterId?: string | null;
  recruitingClassId?: string | null;
  perTeamRosters?: Record<string, string> | null;
  validatedRecruitingClass?: ClassValidationResult;
  storyPlan?: WizardStoryPlan;
  masterSeed?: string;
}

export interface DynastyStartResult {
  success: true;
  jobId?: string;
  alreadyStarted?: boolean;
}

export class DynastyStartInProgressError extends Error {
  constructor(public readonly jobId: string) {
    super("Dynasty start is already in progress");
    this.name = "DynastyStartInProgressError";
  }
}

export class DynastyStartConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DynastyStartConflictError";
  }
}

interface StartMetadata {
  input?: {
    rosterId: string | null;
    recruitingClassId: string | null;
    perTeamRosters: Record<string, string> | null;
  };
  completedStages?: string[];
  stage?: string;
}

const STAGES = [
  "saved_rosters",
  "generated_rosters",
  "coaches",
  "recruiting",
  "schedule",
  "validation",
] as const;

function stableInput(input: DynastyStartInput): StartMetadata["input"] {
  const perTeamRosters = input.perTeamRosters
    ? Object.fromEntries(Object.entries(input.perTeamRosters).sort(([a], [b]) => a.localeCompare(b)))
    : null;
  return {
    rosterId: input.rosterId ?? null,
    recruitingClassId: input.recruitingClassId ?? null,
    perTeamRosters,
  };
}

function sameInput(a: StartMetadata["input"], b: StartMetadata["input"]): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function claimStartOperation(input: DynastyStartInput): Promise<{
  jobId: string;
  token: string;
  completedStages: Set<string>;
} | { alreadyStarted: true }> {
  const client = await pool.connect();
  const token = randomUUID();
  try {
    await client.query("BEGIN");
    const leagueResult = await client.query<{ current_phase: string }>(
      `SELECT current_phase FROM leagues WHERE id = $1 FOR UPDATE`,
      [input.leagueId],
    );
    const phase = leagueResult.rows[0]?.current_phase;
    if (!phase) throw new DynastyStartConflictError("League not found");
    if (phase !== "dynasty_setup" && phase !== "starting") {
      await client.query("COMMIT");
      return { alreadyStarted: true };
    }

    const jobResult = await client.query<{
      id: string;
      status: string;
      lease_expires_at: string | null;
      metadata: StartMetadata | null;
    }>(
      `SELECT id, status, lease_expires_at, metadata
         FROM league_jobs
        WHERE league_id = $1 AND job_type = 'dynasty_start'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [input.leagueId],
    );
    const existing = jobResult.rows[0];
    const requestedInput = stableInput(input);
    const leaseActive = existing?.status === "running"
      && existing.lease_expires_at
      && new Date(existing.lease_expires_at).getTime() > Date.now();
    if (leaseActive) {
      await client.query("COMMIT");
      throw new DynastyStartInProgressError(existing.id);
    }

    let jobId: string;
    let completedStages = new Set<string>();
    if (existing) {
      const metadata = existing.metadata ?? {};
      completedStages = new Set(metadata.completedStages ?? []);
      if (completedStages.size > 0 && metadata.input && !sameInput(metadata.input, requestedInput)) {
        throw new DynastyStartConflictError(
          "This start operation already applied configuration. Retry with the same roster and recruiting class selections.",
        );
      }
      jobId = existing.id;
      await client.query(
        `UPDATE league_jobs
            SET status = 'running', locked_by = $2,
                lease_expires_at = now() + interval '10 minutes',
                attempt_count = attempt_count + 1,
                error_message = NULL,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('input', $3::jsonb),
                updated_at = now()
          WHERE id = $1`,
        [jobId, token, JSON.stringify(requestedInput)],
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO league_jobs
           (league_id, job_type, status, progress, locked_by, lease_expires_at, attempt_count, metadata)
         VALUES ($1, 'dynasty_start', 'running', 0, $2, now() + interval '10 minutes', 1,
                 jsonb_build_object('input', $3::jsonb, 'completedStages', '[]'::jsonb))
         RETURNING id`,
        [input.leagueId, token, JSON.stringify(requestedInput)],
      );
      jobId = inserted.rows[0].id;
    }

    await client.query(
      `UPDATE leagues SET current_phase = 'starting' WHERE id = $1 AND current_phase IN ('dynasty_setup', 'starting')`,
      [input.leagueId],
    );
    await client.query("COMMIT");
    return { jobId, token, completedStages };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function renew(jobId: string, token: string): Promise<void> {
  const renewed = await pool.query(
    `UPDATE league_jobs
        SET lease_expires_at = now() + interval '10 minutes', updated_at = now()
      WHERE id = $1 AND locked_by = $2 AND status = 'running'
      RETURNING id`,
    [jobId, token],
  );
  if ((renewed.rowCount ?? 0) !== 1) throw new Error("Dynasty-start lease was lost");
}

async function checkpoint(
  jobId: string,
  token: string,
  completedStages: Set<string>,
  stage: string,
  progress: number,
): Promise<void> {
  completedStages.add(stage);
  const result = await pool.query(
    `UPDATE league_jobs
        SET progress = $3,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('completedStages', $4::jsonb, 'stage', $5::text),
            lease_expires_at = now() + interval '10 minutes',
            updated_at = now()
      WHERE id = $1 AND locked_by = $2 AND status = 'running'
      RETURNING id`,
    [jobId, token, progress, JSON.stringify([...completedStages]), stage],
  );
  if ((result.rowCount ?? 0) !== 1) throw new Error("Dynasty-start lease was lost");
}

async function applySavedRosters(input: DynastyStartInput): Promise<void> {
  if (input.rosterId) {
    const savedRoster = await storage.getSavedRoster(input.rosterId);
    if (!savedRoster || savedRoster.userId !== input.userId) {
      throw new DynastyStartConflictError("Saved roster not found or not authorized");
    }
    const rosterData = savedRoster.rosterData as any;
    if (rosterData?.teams) {
      const teams = await storage.getTeamsByLeague(input.leagueId);
      for (const teamData of rosterData.teams) {
        const matchingTeam = teams.find(t => t.name === teamData.teamName);
        if (!matchingTeam || !Array.isArray(teamData.players)) continue;
        await storage.deletePlayersByTeam(matchingTeam.id);
        for (const playerData of teamData.players) {
          await storage.createPlayer({ ...playerData, teamId: matchingTeam.id, leagueId: input.leagueId } as any);
        }
      }
    }
  }

  if (input.perTeamRosters) {
    const numericAttrs = [
      "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
      "velocity", "control", "stamina", "stuff", "clutch", "vsLHP", "grit",
      "stealing", "running", "throwing", "recovery", "wRISP", "vsLefty",
      "poise", "heater", "agile", "catcherAbility",
    ];
    const teams = await storage.getTeamsByLeague(input.leagueId);
    for (const [teamName, savedRosterId] of Object.entries(input.perTeamRosters)) {
      if (!savedRosterId) continue;
      const savedRoster = await storage.getSavedRoster(savedRosterId);
      if (!savedRoster || savedRoster.userId !== input.userId) {
        throw new DynastyStartConflictError(`Saved roster for ${teamName} is not authorized`);
      }
      const matchingTeam = teams.find(t => t.name === teamName);
      if (!matchingTeam) throw new DynastyStartConflictError(`Unknown team in roster map: ${teamName}`);
      const savedPlayers = savedRoster.rosterData as any[];
      if (!Array.isArray(savedPlayers)) throw new DynastyStartConflictError(`Invalid saved roster for ${teamName}`);
      const existingPlayers = await storage.getPlayersByTeam(matchingTeam.id);
      for (const savedPlayer of savedPlayers) {
        const existing = existingPlayers.find(
          p => p.firstName === savedPlayer.firstName && p.lastName === savedPlayer.lastName,
        );
        if (!existing) continue;
        const updates: Record<string, unknown> = {};
        for (const attr of numericAttrs) if (typeof savedPlayer[attr] === "number") updates[attr] = savedPlayer[attr];
        if (Array.isArray(savedPlayer.abilities)) updates.abilities = savedPlayer.abilities;
        if (Object.keys(updates).length > 0) await storage.updatePlayer(existing.id, updates as any);
      }
    }
  }
}

async function ensureRosters(leagueId: string): Promise<void> {
  const league = await storage.getLeague(leagueId);
  if (!league) throw new DynastyStartConflictError("League not found");
  const teams = await storage.getTeamsByLeague(leagueId);
  const conferences = await storage.getConferencesByLeague(leagueId);
  const confNames = new Map(conferences.map(c => [c.id, c.name]));
  for (const team of teams) {
    let players = await storage.getPlayersByTeam(team.id);
    if (players.length < 20 || players.length > 30) {
      if (players.length > 0) await storage.deletePlayersByTeam(team.id);
      await generatePlayersForTeam(
        team.id,
        league.progressionEnabled ?? false,
        team.name,
        team.conferenceId ? confNames.get(team.conferenceId) : undefined,
      );
      players = await storage.getPlayersByTeam(team.id);
    }
    const violations = checkTeamRosterStructure(team.name, players);
    if (violations.length > 0) {
      throw new Error(`Roster validation failed for ${team.name}: ${violations.map(v => v.message).join("; ")}`);
    }
    if (players.filter(p => p.battingOrder != null).length < 9) {
      await autoAssignLineup(players, team.id);
    }
  }
}

async function ensureRecruiting(input: DynastyStartInput): Promise<void> {
  const league = await storage.getLeague(input.leagueId);
  if (!league) throw new DynastyStartConflictError("League not found");
  if (input.recruitingClassId) {
    if (!input.validatedRecruitingClass) throw new DynastyStartConflictError("Recruiting class was not validated");
    await replaceLeagueRecruitingClass({
      leagueId: input.leagueId,
      season: league.currentSeason,
      recruits: input.validatedRecruitingClass.recruits.map(r => ({ ...r, leagueId: input.leagueId })) as any,
      initStorylines: true,
      // Starting is not complete until storyline rows and opening events exist.
      // The synchronous path keeps storyline-recruit creation in the class
      // replacement transaction and surfaces event-generation failures.
      asyncStorylines: false,
      storyPlan: input.storyPlan,
      masterSeed: input.masterSeed,
      audit: {
        userId: input.userId,
        action: "Recruiting Class Loaded (Dynasty Start)",
        details: `Saved class applied at dynasty start (${input.validatedRecruitingClass.recruits.length} recruits)`,
      },
    });
    return;
  }
  const teams = await storage.getTeamsByLeague(input.leagueId);
  const expected = getRecruitPoolSize(teams.length, league.dynastyPreset ?? undefined);
  const existing = await storage.getRecruitsByLeague(input.leagueId);
  if (existing.length !== expected) {
    if (existing.length > 0) await storage.deleteRecruitsByLeague(input.leagueId);
    const vintage = await generateRecruits(
      input.leagueId,
      expected,
      false,
      league.currentSeason,
      { awaitStorylines: true },
    );
    await storage.updateLeague(input.leagueId, { currentClassVintage: vintage });
  }
  const storylines = await storage.getStorylineRecruitsByLeague(input.leagueId, league.currentSeason);
  if (storylines.length !== 10) {
    const initialized = await initializeStorylineRecruits(input.leagueId, league.currentSeason, true);
    if (initialized !== 10) throw new Error(`Expected 10 storyline recruits, initialized ${initialized}`);
  }
}

async function validateStartState(leagueId: string): Promise<void> {
  const result = await pool.query<{
    max_teams: number;
    dynasty_preset: string;
    season_length: string;
    progression_enabled: boolean;
    teams: string;
    standings: string;
    coaches: string;
    bad_rosters: string;
    recruits: string;
    regular_games: string;
    storylines: string;
    storyline_events: string;
  }>(
    `SELECT l.max_teams, l.dynasty_preset, l.season_length, l.progression_enabled,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) AS teams,
            (SELECT COUNT(*) FROM standings s WHERE s.league_id = l.id AND s.season = 1) AS standings,
            (SELECT COUNT(*) FROM coaches c WHERE c.league_id = l.id AND c.team_id IS NOT NULL) AS coaches,
            (SELECT COUNT(*) FROM (
               SELECT t.id FROM teams t LEFT JOIN players p ON p.team_id = t.id
                WHERE t.league_id = l.id GROUP BY t.id HAVING COUNT(p.id) < 20 OR COUNT(p.id) > 30
             ) bad) AS bad_rosters,
            (SELECT COUNT(*) FROM recruits r WHERE r.league_id = l.id) AS recruits,
            (SELECT COUNT(*) FROM games g WHERE g.league_id = l.id AND g.season = 1 AND g.phase = 'regular') AS regular_games
            ,(SELECT COUNT(*) FROM storyline_recruits sr WHERE sr.league_id = l.id AND sr.season = 1) AS storylines
            ,(SELECT COUNT(*) FROM storyline_events se WHERE se.league_id = l.id AND se.season = 1) AS storyline_events
       FROM leagues l WHERE l.id = $1`,
    [leagueId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("League disappeared during dynasty start");
  const teamCount = Number(row.teams);
  if (teamCount !== Number(row.max_teams)) throw new Error(`Expected ${row.max_teams} teams, found ${teamCount}`);
  if (Number(row.standings) !== teamCount) throw new Error("Missing or duplicate Season 1 standings rows");
  if (Number(row.coaches) !== teamCount) throw new Error("Every team must have exactly one coach before start");
  if (Number(row.bad_rosters) !== 0) throw new Error("One or more teams have an invalid roster size");
  if (Number(row.recruits) === 0) throw new Error("Recruiting class is empty");
  if (Number(row.regular_games) === 0) throw new Error("Season 1 schedule is empty");
  if (Number(row.storylines) !== 10) throw new Error(`Expected 10 storyline recruits, found ${row.storylines}`);
  if (Number(row.storyline_events) === 0) throw new Error("No opening storyline events were generated");
  if (row.dynasty_preset === "full_season") {
    if (teamCount !== 149 || row.season_length !== "full_season" || !row.progression_enabled) {
      throw new Error("Full Season rules are not canonical");
    }
    if (Number(row.regular_games) !== 4172) throw new Error("Full Season schedule must contain exactly 4,172 regular games");
  }
}

export async function runDurableDynastyStart(input: DynastyStartInput): Promise<DynastyStartResult> {
  const claim = await claimStartOperation(input);
  if ("alreadyStarted" in claim) return { success: true, alreadyStarted: true };
  const { jobId, token, completedStages } = claim;
  let heartbeatLost = false;
  const heartbeat = setInterval(() => {
    renew(jobId, token).catch(() => { heartbeatLost = true; });
  }, 30_000);
  const assertOwned = async () => {
    if (heartbeatLost) throw new Error("Dynasty-start lease was lost");
    await renew(jobId, token);
  };

  try {
    if (!completedStages.has(STAGES[0])) {
      await assertOwned();
      await applySavedRosters(input);
      await checkpoint(jobId, token, completedStages, STAGES[0], 15);
    }
    if (!completedStages.has(STAGES[1])) {
      await assertOwned();
      await ensureRosters(input.leagueId);
      await checkpoint(jobId, token, completedStages, STAGES[1], 45);
    }
    if (!completedStages.has(STAGES[2])) {
      await assertOwned();
      await generateCpuCoaches(input.leagueId);
      await checkpoint(jobId, token, completedStages, STAGES[2], 55);
    }
    if (!completedStages.has(STAGES[3])) {
      await assertOwned();
      await ensureRecruiting(input);
      await checkpoint(jobId, token, completedStages, STAGES[3], 72);
    }
    if (!completedStages.has(STAGES[4])) {
      await assertOwned();
      const league = await storage.getLeague(input.leagueId);
      await createScheduleForSeason(input.leagueId, 1);
      if (league?.dynastyPreset !== "full_season") await generateExhibitionGames(input.leagueId, 1);
      await checkpoint(jobId, token, completedStages, STAGES[4], 90);
    }
    if (!completedStages.has(STAGES[5])) {
      await assertOwned();
      await validateStartState(input.leagueId);
      await checkpoint(jobId, token, completedStages, STAGES[5], 98);
    }

    await assertOwned();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const finished = await client.query(
        `UPDATE league_jobs
            SET status = 'complete', progress = 100, lease_expires_at = NULL, updated_at = now()
          WHERE id = $1 AND locked_by = $2 AND status = 'running'
          RETURNING id`,
        [jobId, token],
      );
      if ((finished.rowCount ?? 0) !== 1) throw new Error("Dynasty-start lease was lost before final commit");
      await client.query(`UPDATE leagues SET current_phase = 'preseason' WHERE id = $1 AND current_phase = 'starting'`, [input.leagueId]);
      await client.query(
        `INSERT INTO audit_logs (league_id, user_id, action, details)
         VALUES ($1, $2, 'start_dynasty', $3)`,
        [input.leagueId, input.userId, JSON.stringify({
          rosterId: input.rosterId ?? "default",
          recruitingClassId: input.recruitingClassId ?? "auto",
          jobId,
        })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    invalidateLeague(input.leagueId);
    return { success: true, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE league_jobs
          SET status = 'failed', error_message = $3, updated_at = now()
        WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
      [jobId, token, message],
    ).catch(() => {});
    // Intentionally leave the league in "starting". A retry reclaims the failed
    // operation and resumes from durable checkpoints instead of pretending that
    // partially applied work was rolled back.
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
