import { APIRequestContext } from "@playwright/test";

export interface GuestSession {
  userId: string;
}

export interface League {
  id: string;
  name: string;
  currentPhase: string;
  currentSeason: number;
  currentWeek: number;
}

export interface Conference {
  id: string;
  name: string;
}

export async function createGuestSession(request: APIRequestContext): Promise<string> {
  const resp = await request.post("/api/auth/guest");
  if (!resp.ok()) {
    throw new Error(`Failed to create guest session: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.id as string;
}

export async function createLeague(
  request: APIRequestContext,
  opts: {
    name: string;
    maxTeams?: number;
    cpuDifficulty?: string;
    selectedConferences?: string[];
    seasonLength?: string;
    progressionEnabled?: boolean;
  }
): Promise<League> {
  const resp = await request.post("/api/leagues", {
    data: {
      name: opts.name,
      maxTeams: opts.maxTeams ?? 13,
      cpuDifficulty: opts.cpuDifficulty ?? "beginner",
      selectedConferences: opts.selectedConferences ?? ["SEC", "ACC", "Big 12"],
      seasonLength: opts.seasonLength ?? "standard",
      progressionEnabled: opts.progressionEnabled ?? false,
    },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to create league: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function getConferences(
  request: APIRequestContext,
  leagueId: string
): Promise<Conference[]> {
  const resp = await request.get(`/api/leagues/${leagueId}/team-selection`);
  if (!resp.ok()) {
    throw new Error(`Failed to get team selection: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.conferences as Conference[];
}

export async function selectTeams(
  request: APIRequestContext,
  leagueId: string,
  selectedTeams: { conferenceId: string; teamNames: string[] }[]
): Promise<void> {
  const resp = await request.post(`/api/leagues/${leagueId}/team-selection`, {
    data: { selectedTeams },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to select teams: ${resp.status()} ${await resp.text()}`);
  }
}

export async function startDynasty(
  request: APIRequestContext,
  leagueId: string
): Promise<void> {
  const resp = await request.post(`/api/leagues/${leagueId}/start`, {
    data: {},
  });
  if (!resp.ok()) {
    throw new Error(`Failed to start dynasty: ${resp.status()} ${await resp.text()}`);
  }
}

export async function getLeague(
  request: APIRequestContext,
  leagueId: string
): Promise<League> {
  const resp = await request.get(`/api/leagues/${leagueId}`);
  if (!resp.ok()) {
    throw new Error(`Failed to get league: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function getLeagueTeams(
  request: APIRequestContext,
  leagueId: string
): Promise<Array<{ id: string; name: string; isCpu: boolean }>> {
  const resp = await request.get(`/api/leagues/${leagueId}`);
  if (!resp.ok()) {
    throw new Error(`Failed to get league teams: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.teams ?? [];
}

export async function setupCoach(
  request: APIRequestContext,
  leagueId: string,
  teamId: string
): Promise<void> {
  const resp = await request.post(`/api/leagues/${leagueId}/setup`, {
    data: {
      teamId,
      coach: {
        firstName: "Test",
        lastName: "Coach",
        archetype: "Balanced",
      },
    },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to setup coach: ${resp.status()} ${await resp.text()}`);
  }
}

export async function simToOffseason(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/sim-to-offseason`, {
    data: {},
    timeout: 120000,
  });
  if (!resp.ok()) {
    throw new Error(`sim-to-offseason failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function simToSigningDay(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/sim-to-signing-day`, {
    data: {},
    timeout: 120000,
  });
  if (!resp.ok()) {
    throw new Error(`sim-to-signing-day failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function advanceWeek(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/advance`, {
    data: {},
  });
  if (!resp.ok()) {
    throw new Error(`advance failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * Commissioner force-advance: marks all coaches ready then advances the phase.
 * Required for readiness-gated phases (preseason, spring_training, regular_season)
 * where /advance blocks until human coaches mark themselves ready.
 * Uses the /force-advance endpoint which marks coaches ready and 307-redirects to /advance.
 */
export async function forceAdvanceWeek(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/force-advance`, {
    data: {},
  });
  if (!resp.ok()) {
    throw new Error(`force-advance failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function finalizeDepartures(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/departures/finalize`, {
    data: {},
  });
  if (resp.status() === 403) {
    return null;
  }
  if (!resp.ok()) {
    throw new Error(`finalizeDepartures failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function markWalkonsReady(
  request: APIRequestContext,
  leagueId: string
): Promise<unknown> {
  const resp = await request.post(`/api/leagues/${leagueId}/walkons/ready`, {
    data: {},
  });
  if (resp.status() === 400 || resp.status() === 403) {
    return null;
  }
  if (!resp.ok()) {
    throw new Error(`markWalkonsReady failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function advanceFullSeason(
  request: APIRequestContext,
  leagueId: string
): Promise<number> {
  let league = await getLeague(request, leagueId);

  await simToOffseason(request, leagueId);
  league = await getLeague(request, leagueId);

  if (league.currentPhase === "offseason_departures") {
    await finalizeDepartures(request, leagueId);
    await simToSigningDay(request, leagueId);
    league = await getLeague(request, leagueId);
  }

  if (league.currentPhase === "offseason_walkons") {
    await markWalkonsReady(request, leagueId);
    let safetyBreak = 0;
    while (league.currentPhase === "offseason_walkons" && safetyBreak < 10) {
      await advanceWeek(request, leagueId);
      league = await getLeague(request, leagueId);
      safetyBreak++;
    }
    if (league.currentPhase === "offseason_walkons") {
      throw new Error(`Walkon phase stuck after ${safetyBreak} advance attempts`);
    }
  }

  return league.currentSeason;
}

export async function getTeamsForConferences(
  request: APIRequestContext,
  leagueId: string,
  maxTeams: number
): Promise<{ conferenceId: string; teamNames: string[] }[]> {
  const resp = await request.get(`/api/leagues/${leagueId}/team-selection`);
  const data = await resp.json();

  const pools: { conference: { id: string; name: string }; teams: { name: string }[] }[] =
    data.conferenceTeamPools ?? [];

  const result: { conferenceId: string; teamNames: string[] }[] = [];
  let remaining = maxTeams;

  // Mirror the server's distribution: first `extras` conferences get floor(N/k)+1,
  // the rest get floor(N/k). This matches the confTargetMap logic in routes.ts.
  const baseCount = Math.floor(maxTeams / pools.length);
  const extras = maxTeams % pools.length;

  for (let i = 0; i < pools.length; i++) {
    if (remaining <= 0) break;
    const pool = pools[i];
    const take = Math.min(remaining, baseCount + (i < extras ? 1 : 0));
    const names = (pool.teams ?? []).slice(0, take).map((t: { name: string }) => t.name);
    if (names.length) {
      result.push({ conferenceId: pool.conference.id, teamNames: names });
      remaining -= names.length;
    }
  }

  return result;
}
