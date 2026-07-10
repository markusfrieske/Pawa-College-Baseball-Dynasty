/**
 * Coach Office Inbox — server-side message creation helpers.
 *
 * Call these from route handlers, advance logic, or any background job
 * to drop messages into a coach's inbox.  All functions are fire-and-forget
 * (errors are logged, not thrown) so they never block the primary operation.
 */
import { storage } from "../storage";
import type { CoachMessageCategory } from "@shared/schema";

type MsgCore = {
  category: CoachMessageCategory;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  metadata?: Record<string, unknown>;
};

async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[coach-inbox] ${label}:`, err);
  }
}

// ── Generic helpers ─────────────────────────────────────────────────────────

export async function sendToUser(
  leagueId: string,
  userId: string,
  msg: MsgCore,
): Promise<void> {
  await safe("sendToUser", () =>
    storage.createCoachMessage({ leagueId, userId, ...msg }),
  );
}

export async function sendToTeam(
  leagueId: string,
  teamId: string,
  msg: MsgCore,
): Promise<void> {
  await safe("sendToTeam", async () => {
    const coaches = await storage.getCoachesByLeague(leagueId);
    const coach = coaches.find(c => c.teamId === teamId);
    if (coach?.userId) {
      await storage.createCoachMessage({ leagueId, userId: coach.userId, teamId, ...msg });
    }
  });
}

export async function broadcastToLeague(
  leagueId: string,
  msg: MsgCore,
): Promise<void> {
  await safe("broadcastToLeague", () =>
    storage.broadcastCoachMessage(leagueId, msg),
  );
}

// ── Recruiting ──────────────────────────────────────────────────────────────

export async function notifyRivalOffer(opts: {
  leagueId: string;
  userId: string;
  recruitName: string;
  stars: number;
  position: string;
  rivalTeamName: string;
  recruitId: string;
}): Promise<void> {
  const { leagueId, userId, recruitName, stars, position, rivalTeamName, recruitId } = opts;
  await sendToUser(leagueId, userId, {
    category: "recruiting",
    title: `Rival offer: ${recruitName}`,
    body: `${rivalTeamName} just offered ${stars}★ ${position} ${recruitName} — a recruit you're targeting. Time to respond.`,
    ctaLabel: "View Recruit",
    ctaUrl: `/league/${leagueId}/recruiting?highlight=${recruitId}`,
    metadata: { recruitId, rivalTeamName },
  });
}

export async function notifyRecruitCommitted(opts: {
  leagueId: string;
  userId: string;
  recruitName: string;
  stars: number;
  position: string;
  teamName: string;
  isMyTeam: boolean;
  recruitId: string;
}): Promise<void> {
  const { leagueId, userId, recruitName, stars, position, teamName, isMyTeam, recruitId } = opts;
  if (isMyTeam) {
    await sendToUser(leagueId, userId, {
      category: "recruiting",
      title: `Commitment: ${recruitName}`,
      body: `${stars}★ ${position} ${recruitName} has committed to your program!`,
      ctaLabel: "View Recruit",
      ctaUrl: `/league/${leagueId}/recruiting?highlight=${recruitId}`,
      metadata: { recruitId },
    });
  } else {
    await sendToUser(leagueId, userId, {
      category: "recruiting",
      title: `Recruit signed: ${recruitName}`,
      body: `${stars}★ ${position} ${recruitName} committed to ${teamName}. Update your board.`,
      ctaLabel: "Recruiting Board",
      ctaUrl: `/league/${leagueId}/recruiting`,
      metadata: { recruitId },
    });
  }
}

export async function notifyRecruitDecommitted(opts: {
  leagueId: string;
  userId: string;
  recruitName: string;
  stars: number;
  position: string;
  recruitId: string;
}): Promise<void> {
  const { leagueId, userId, recruitName, stars, position, recruitId } = opts;
  await sendToUser(leagueId, userId, {
    category: "recruiting",
    title: `Decommit: ${recruitName}`,
    body: `${stars}★ ${position} ${recruitName} has decommitted and is back on the board.`,
    ctaLabel: "View Recruit",
    ctaUrl: `/league/${leagueId}/recruiting?highlight=${recruitId}`,
    metadata: { recruitId },
  });
}

// ── Scouting ────────────────────────────────────────────────────────────────

export async function notifyScoutingUnlock(opts: {
  leagueId: string;
  userId: string;
  recruitName: string;
  stars: number;
  position: string;
  milestone: string;
  recruitId: string;
}): Promise<void> {
  const { leagueId, userId, recruitName, stars, position, milestone, recruitId } = opts;
  await sendToUser(leagueId, userId, {
    category: "scouting",
    title: `Scout report: ${recruitName}`,
    body: `New intel on ${stars}★ ${position} ${recruitName} — ${milestone} revealed.`,
    ctaLabel: "View Report",
    ctaUrl: `/league/${leagueId}/recruiting?highlight=${recruitId}`,
    metadata: { recruitId },
  });
}

// ── Game Prep ───────────────────────────────────────────────────────────────

export async function notifyUpcomingGame(opts: {
  leagueId: string;
  userId: string;
  opponentName: string;
  isHome: boolean;
  season: number;
  week: number;
  gameId: string;
}): Promise<void> {
  const { leagueId, userId, opponentName, isHome, season, week, gameId } = opts;
  const venue = isHome ? "at home" : "on the road";
  await sendToUser(leagueId, userId, {
    category: "game_prep",
    title: `Game week: vs ${opponentName}`,
    body: `Season ${season}, Week ${week} — you face ${opponentName} ${venue}. Check the schedule.`,
    ctaLabel: "Open Schedule",
    ctaUrl: `/league/${leagueId}/schedule`,
    metadata: { gameId, season, week },
  });
}

export async function notifyReadyUp(opts: {
  leagueId: string;
  userId: string;
  phase: string;
  week: number;
}): Promise<void> {
  const { leagueId, userId, phase, week } = opts;
  await sendToUser(leagueId, userId, {
    category: "game_prep",
    title: "Ready-up required",
    body: `Week ${week} of ${phase} is waiting for your ready confirmation. Don't hold up the league.`,
    ctaLabel: "Go to War Room",
    ctaUrl: `/league/${leagueId}/war-room`,
    metadata: { phase, week },
  });
}

// ── Reports ─────────────────────────────────────────────────────────────────

export async function notifyReportSubmitted(opts: {
  leagueId: string;
  userId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  gameId: string;
}): Promise<void> {
  const { leagueId, userId, homeTeamName, awayTeamName, homeScore, awayScore, gameId } = opts;
  await sendToUser(leagueId, userId, {
    category: "reports",
    title: "Game report submitted",
    body: `Report received: ${awayTeamName} ${awayScore} @ ${homeTeamName} ${homeScore}. Awaiting confirmation.`,
    ctaLabel: "View Report",
    ctaUrl: `/league/${leagueId}/schedule`,
    metadata: { gameId },
  });
}

export async function notifyReportPending(opts: {
  leagueId: string;
  userId: string;
  homeTeamName: string;
  awayTeamName: string;
  gameId: string;
}): Promise<void> {
  const { leagueId, userId, homeTeamName, awayTeamName, gameId } = opts;
  await sendToUser(leagueId, userId, {
    category: "reports",
    title: "Report awaiting confirmation",
    body: `${awayTeamName} @ ${homeTeamName}: the other coach submitted a score. Confirm or dispute it.`,
    ctaLabel: "Confirm Report",
    ctaUrl: `/league/${leagueId}/schedule`,
    metadata: { gameId },
  });
}

export async function notifyReportFinalized(opts: {
  leagueId: string;
  userId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  gameId: string;
}): Promise<void> {
  const { leagueId, userId, homeTeamName, awayTeamName, homeScore, awayScore, gameId } = opts;
  await sendToUser(leagueId, userId, {
    category: "reports",
    title: "Report confirmed",
    body: `${awayTeamName} ${awayScore} @ ${homeTeamName} ${homeScore} — final. Stats updated.`,
    ctaLabel: "View Schedule",
    ctaUrl: `/league/${leagueId}/schedule`,
    metadata: { gameId },
  });
}

// ── Commissioner ────────────────────────────────────────────────────────────

export async function broadcastPhaseChange(opts: {
  leagueId: string;
  phase: string;
  season: number;
  week: number;
  description: string;
}): Promise<void> {
  const { leagueId, phase, season, week, description } = opts;
  await broadcastToLeague(leagueId, {
    category: "commissioner",
    title: `Phase: ${description}`,
    body: `Season ${season}, Week ${week} — ${description}`,
    ctaLabel: "View League",
    ctaUrl: `/league/${leagueId}`,
    metadata: { phase, season, week },
  });
}

export async function broadcastCommissionerNote(opts: {
  leagueId: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<void> {
  const { leagueId, ...msg } = opts;
  await broadcastToLeague(leagueId, {
    category: "commissioner",
    ...msg,
  });
}

// ── Player Development ──────────────────────────────────────────────────────

export async function notifyPlayerDevelopment(opts: {
  leagueId: string;
  userId: string;
  playerName: string;
  playerId: string;
  teamId: string;
  change: string;
}): Promise<void> {
  const { leagueId, userId, playerName, playerId, teamId, change } = opts;
  await sendToUser(leagueId, userId, {
    category: "player_development",
    title: `Dev update: ${playerName}`,
    body: change,
    ctaLabel: "View Roster",
    ctaUrl: `/league/${leagueId}/roster`,
    metadata: { playerId, teamId },
  });
}

// ── System ──────────────────────────────────────────────────────────────────

export async function notifySystemEvent(opts: {
  leagueId: string;
  userId: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<void> {
  const { leagueId, userId, ...msg } = opts;
  await sendToUser(leagueId, userId, {
    category: "system",
    ...msg,
  });
}

export async function broadcastSystemEvent(opts: {
  leagueId: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<void> {
  const { leagueId, ...msg } = opts;
  await broadcastToLeague(leagueId, { category: "system", ...msg });
}
