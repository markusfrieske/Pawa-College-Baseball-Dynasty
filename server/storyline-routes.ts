import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { generateStorylineEvent, resolveVotes, pickStorylineRecruits, ARCHETYPE_DEFS, maybeTransitionArchetype, generateStoryOutcomes, PUBLIC_STORY_LABELS, getPublicArcFlavor, derivePublicArcStatus } from "./storylineEngine";
import type { Archetype } from "./storylineEngine";
import type { ChoiceWeights, StoryOutcome } from "@shared/schema";
import { getAbilitiesForPosition, calculateOVR } from "@shared/abilities";
import { isPitcher } from "@shared/positions";
import { hasCommissionerAccess, isLeagueMember } from "./route-helpers";
import { checkStorylineHealth } from "./lib/storylineHealth";
import { getSeasonMaxWeeks } from "@shared/phase";

// ─── Advance Index Mapping ─────────────────────────────────────────────────────
// Maps league phase + week to a 0–9 advance index used for slot-based story scheduling.
// Recruits at slot S fire chapter C at advance (S + C*3) % 10.
export function advanceIndexForPhaseWeek(phase: string, week: number, maxRegWeeks = 5): number {
  if (phase === "spring_training" || phase === "preseason") return 0;
  if (phase === "regular_season") return Math.min(4, Math.max(1, week));
  if (phase === "conference_championship") return 5;
  if (phase === "super_regionals" || phase === "cws") {
    // Distribute SR/CWS advances across slots 6–9 based on week offset past regular season
    return Math.min(9, Math.max(6, 6 + ((week - maxRegWeeks - 1) % 4)));
  }
  return 4; // default: treat as late regular season
}

// ─── Attribute-First Story Outcome Application ────────────────────────────────
// Applies a StoryOutcome to a recruit's attributes and abilities, computes the
// new OVR via calculateOVR(), and writes the results back to the DB.
// Returns { ovrDelta, abilityGain, abilityRemove, abilityTier } for news + audit.
//
// When eventId is provided the function is fully idempotent:
//   • If storyline_resolutions already has a row for this event, returns cached ovrDelta immediately.
//   • Otherwise wraps all DB writes in a transaction and inserts a resolution record at commit.
export async function applyStoryOutcomeToRecruit(
  recruit: Awaited<ReturnType<typeof storage.getRecruit>>,
  outcome: StoryOutcome,
  volatility: number,
  isLegendary: boolean,
  eventId?: string,
  winningChoice?: string,
): Promise<{ ovrDelta: number; abilityGain?: string; abilityRemove?: string; abilityTier?: string }> {
  if (!recruit) return { ovrDelta: 0 };

  // ── 1. Compute all updates (pure, no I/O) ─────────────────────────────────
  const volScale = 0.6 + (Math.max(1, Math.min(10, volatility)) - 1) * (0.8 / 9);

  const HITTER_STORY_ATTRS = new Set([
    'hitForAvg', 'power', 'speed', 'arm', 'fielding',
    'errorResistance', 'clutch', 'vsLHP', 'grit',
    'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
  ]);
  const PITCHER_STORY_ATTRS = new Set([
    'velocity', 'control', 'stamina', 'stuff', 'wRISP',
    'vsLefty', 'poise', 'heater', 'agile',
  ]);
  const isPitcherRecruit = Boolean(recruit.position && isPitcher(recruit.position));
  const allowedAttrs = isPitcherRecruit ? PITCHER_STORY_ATTRS : HITTER_STORY_ATTRS;

  const attrUpdates: Record<string, number> = {};
  for (const { field, delta } of outcome.attrChanges) {
    if (!allowedAttrs.has(field)) {
      console.warn(`[storylines] attrChanges field "${field}" not in allowlist for ${isPitcherRecruit ? 'pitcher' : 'hitter'} — skipping`);
      continue;
    }
    const current = (recruit as Record<string, unknown>)[field];
    const currentNum = typeof current === 'number' ? current : 50;
    attrUpdates[field] = Math.max(1, Math.min(99, currentNum + Math.round(delta * volScale)));
  }

  const allPositionAbilities = getAbilitiesForPosition(recruit.position ?? "OF");
  let currentAbilities: string[] = (recruit.abilities as string[] | null) ?? [];
  let storyLocked: string[] = (recruit.storyLockedAbilities as string[] | null) ?? [];
  let abilityGain: string | undefined;
  let abilityRemoveResult: string | undefined;
  let abilityTier: string | undefined;

  if (outcome.abilityRemove) {
    let toRemoveName: string | undefined;
    if (outcome.abilityRemove === 'random_story') {
      const removable = allPositionAbilities
        .filter(a => (a.tier === 'blue' || a.tier === 'gold') && currentAbilities.includes(a.name) && storyLocked.includes(a.name))
        .sort(() => Math.random() - 0.5);
      if (removable.length > 0) toRemoveName = removable[0].name;
    } else if (outcome.abilityRemove === 'random_positive') {
      const removable = allPositionAbilities
        .filter(a => a.tier !== 'red' && currentAbilities.includes(a.name) && storyLocked.includes(a.name))
        .sort(() => Math.random() - 0.5);
      if (removable.length > 0) toRemoveName = removable[0].name;
    }
    if (toRemoveName) {
      abilityRemoveResult = toRemoveName;
      currentAbilities = currentAbilities.filter(a => a !== toRemoveName);
      storyLocked = storyLocked.filter(a => a !== toRemoveName);
    }
  }

  if (outcome.abilityGrant) {
    let tier = outcome.abilityGrant.tier as 'gold' | 'blue' | 'red';
    if (isLegendary && tier === 'blue' && Math.random() < 0.30) tier = 'gold';
    const abilityPool = allPositionAbilities
      .filter(a => a.tier === tier && !currentAbilities.includes(a.name))
      .sort(() => Math.random() - 0.5);
    if (abilityPool.length > 0 && currentAbilities.length < 7) {
      abilityGain = abilityPool[0].name;
      abilityTier = tier;
      currentAbilities = [...currentAbilities, abilityGain];
      if (!storyLocked.includes(abilityGain)) storyLocked = [...storyLocked, abilityGain];
    }
  }

  const merged = { ...recruit, ...attrUpdates, abilities: currentAbilities };
  const newOvr = Math.max(100, Math.min(720, calculateOVR(merged as Parameters<typeof calculateOVR>[0])));
  const ovrDelta = newOvr - (recruit.overall ?? 250);

  const finalUpdates: Record<string, unknown> = {
    ...attrUpdates,
    overall: newOvr,
    abilities: currentAbilities,
    storyLockedAbilities: storyLocked,
  };
  if (outcome.positionChange && outcome.positionChange !== recruit.position) {
    finalUpdates.position = outcome.positionChange;
  }

  const beforeSnapshot = JSON.stringify({ overall: recruit.overall });
  const afterSnapshot  = JSON.stringify({ overall: newOvr });
  const effectSnapshot = JSON.stringify({ attrUpdates, abilityGain, abilityRemoveResult });

  // ── 2. Persist changes ────────────────────────────────────────────────────
  if (eventId) {
    // Single atomic transaction: sentinel INSERT + recruit UPDATE + snapshot UPDATE.
    // If any step fails → ROLLBACK removes the sentinel row so the next retry
    // can attempt resolution again.  Only a full COMMIT makes the resolution
    // visible, guaranteeing exactly-once application even under concurrent calls.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Try to claim the resolution slot (first writer wins, concurrent block)
      const sentinel = await client.query(
        `INSERT INTO storyline_resolutions (event_id, winning_choice)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING id`,
        [eventId, winningChoice ?? "A"],
      );

      if ((sentinel.rowCount ?? 0) === 0) {
        // A prior committed transaction already resolved this event.
        // Read its cached snapshot delta and return without mutation.
        await client.query("COMMIT");
        const cached = await client.query<{ ovrDelta: number }>(
          `SELECT COALESCE(
             (after_ratings->>'overall')::int - (before_ratings->>'overall')::int,
             0
           ) AS "ovrDelta"
           FROM storyline_resolutions WHERE event_id = $1 LIMIT 1`,
          [eventId],
        );
        client.release();
        const cachedDelta = cached.rows[0]?.ovrDelta ?? 0;
        console.log(`[storylines] idempotency hit event=${eventId} cachedDelta=${cachedDelta}`);
        return { ovrDelta: cachedDelta };
      }

      // We own the sentinel — apply recruit changes inside this transaction.
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const [col, val] of Object.entries(finalUpdates)) {
        setClauses.push(`"${col}" = $${idx++}`);
        params.push(typeof val === "object" ? JSON.stringify(val) : val);
      }
      params.push(recruit.id);
      if (setClauses.length > 0) {
        await client.query(
          `UPDATE recruits SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params,
        );
      }
      if (outcome.leavePool) {
        await client.query(`UPDATE recruits SET stage = 'left_pool' WHERE id = $1`, [recruit.id]);
      }

      // Stamp the sentinel with full snapshot data (completes the ledger row)
      await client.query(
        `UPDATE storyline_resolutions
           SET effect_snapshot = $1, before_ratings = $2, after_ratings = $3
         WHERE event_id = $4`,
        [effectSnapshot, beforeSnapshot, afterSnapshot, eventId],
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } else {
    // No eventId — legacy path without ledger.
    await storage.updateRecruit(recruit.id, finalUpdates as Parameters<typeof storage.updateRecruit>[1]);
    if (outcome.leavePool) {
      try {
        await storage.updateRecruit(recruit.id, { stage: 'left_pool' } as Parameters<typeof storage.updateRecruit>[1]);
      } catch (e) {
        console.warn('[storylines] leavePool update failed:', e);
      }
    }
  }

  return { ovrDelta, abilityGain, abilityRemove: abilityRemoveResult, abilityTier };
}

// Derive StoryOutcome for the winning choice from event data.
// Falls back to generating from weights when storyOutcomes is absent (old events).
function getOutcomeForChoice(
  event: { storyOutcomes?: Record<string, StoryOutcome> | null; choiceAWeights: unknown; choiceBWeights: unknown; choiceCWeights: unknown; choiceDWeights?: unknown },
  winningChoice: string,
  position: string | null | undefined,
  isLegendary: boolean,
): StoryOutcome {
  if (event.storyOutcomes && event.storyOutcomes[winningChoice]) {
    return event.storyOutcomes[winningChoice];
  }
  // Fallback: derive from weights (handles events created before the overhaul)
  const pitcherMode = Boolean(position && isPitcher(position));
  const outcomes = generateStoryOutcomes(
    event.choiceAWeights as ChoiceWeights,
    event.choiceBWeights as ChoiceWeights,
    event.choiceCWeights as ChoiceWeights,
    event.choiceDWeights as ChoiceWeights | undefined,
    pitcherMode,
    isLegendary,
  );
  return outcomes[winningChoice] ?? outcomes.A;
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

export async function warmupEventSceneImages(): Promise<void> {}

// ─── Risk/Reward Hint Helpers ─────────────────────────────────────────────────
// Derive game-like hint labels from ChoiceWeights without exposing exact probability numbers.
// Exposed on every active event in GET /storylines so coaches can assess risk/reward before voting.

function _positivityScore(w: ChoiceWeights): number {
  return (
    (w.minor_pos ?? 0) * 1 + (w.moderate_pos ?? 0) * 2 + (w.major_pos ?? 0) * 3 + (w.legendary_pos ?? 0) * 4 -
    (w.minor_neg ?? 0) * 1 - (w.moderate_neg ?? 0) * 2 - (w.major_neg ?? 0) * 3 - (w.legendary_neg ?? 0) * 4
  );
}

function buildChoiceHints(event: {
  choiceAWeights: unknown; choiceBWeights: unknown; choiceCWeights: unknown;
  choiceDWeights?: unknown; choiceD?: string | null;
}): Array<{ choice: string; riskLevel: 'low' | 'medium' | 'high'; rewardLevel: 'low' | 'medium' | 'high'; flavor: string }> {
  const pairs: Array<{ choice: string; weights: unknown }> = [
    { choice: 'A', weights: event.choiceAWeights },
    { choice: 'B', weights: event.choiceBWeights },
    { choice: 'C', weights: event.choiceCWeights },
  ];
  if (event.choiceD) pairs.push({ choice: 'D', weights: event.choiceDWeights });

  return pairs.map(({ choice, weights }) => {
    if (!weights) return { choice, riskLevel: 'low' as const, rewardLevel: 'low' as const, flavor: 'Unknown outcome' };
    const w = weights as ChoiceWeights;
    const pos = _positivityScore(w);
    const negMass = (w.minor_neg ?? 0) + (w.moderate_neg ?? 0) + (w.major_neg ?? 0) + (w.legendary_neg ?? 0);
    const posMass = (w.minor_pos ?? 0) + (w.moderate_pos ?? 0) + (w.major_pos ?? 0) + (w.legendary_pos ?? 0);
    const hasLegPos = (w.legendary_pos ?? 0) > 0.05;
    const hasLegNeg = (w.legendary_neg ?? 0) > 0.05;

    const riskLevel: 'low' | 'medium' | 'high' = negMass > 0.35 ? 'high' : negMass > 0.15 ? 'medium' : 'low';
    const rewardLevel: 'low' | 'medium' | 'high' = posMass > 0.50 ? 'high' : posMass > 0.25 ? 'medium' : 'low';

    let flavor: string;
    if (hasLegPos && hasLegNeg) flavor = 'All-or-nothing — extraordinary ceiling or devastating floor';
    else if (hasLegPos) flavor = 'Rare upside — could unlock a defining career moment';
    else if (hasLegNeg) flavor = 'Dangerous call — potential program-altering setback';
    else if (pos >= 1.0) flavor = 'Favored outcome — leans strongly positive';
    else if (pos >= 0.4) flavor = 'Moderate upside — slightly positive lean';
    else if (pos <= -0.4) flavor = 'Difficult path — leans negative';
    else flavor = 'Balanced — outcome is genuinely uncertain';

    return { choice, riskLevel, rewardLevel, flavor };
  });
}

function buildMoodHint(hiddenVars: Record<string, unknown> | null | undefined): 'rising' | 'steady' | 'falling' {
  if (!hiddenVars) return 'steady';
  const momentum = Number(hiddenVars.storyMomentum ?? 5);
  if (momentum >= 8) return 'rising';
  if (momentum <= 3) return 'falling';
  return 'steady';
}

function buildRecruitingImpactHint(hiddenVars: Record<string, unknown> | null | undefined): 'high impact' | 'moderate impact' | 'low impact' {
  if (!hiddenVars) return 'moderate impact';
  const volatility = Number(hiddenVars.volatility ?? 5);
  if (volatility >= 8) return 'high impact';
  if (volatility <= 3) return 'low impact';
  return 'moderate impact';
}

async function resolveCoachTeamId(leagueId: string, userId: string): Promise<string | null> {
  const coaches = await storage.getCoachesByLeague(leagueId);
  return coaches.find(c => c.userId === userId)?.teamId ?? null;
}

async function assertLeagueMember(leagueId: string, userId: string | undefined, res: Response): Promise<boolean> {
  if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
  const league = await storage.getLeague(leagueId);
  if (!league) { res.status(404).json({ message: "League not found" }); return false; }
  // Commissioner and co-commissioners always have access — they don't need a coach team
  if (hasCommissionerAccess(league, userId)) return true;
  // Non-commissioner: any coach record with a matching userId is sufficient for read access.
  // We intentionally do NOT require a non-null teamId so that coaches who joined via invite
  // but whose team assignment is in progress still receive 200 instead of 403.
  const leagueCoaches = await storage.getCoachesByLeague(leagueId);
  if (!isLeagueMember(leagueCoaches, userId)) {
    res.status(403).json({ message: "You are not a member of this league" });
    return false;
  }
  return true;
}

export function registerStorylineRoutes(app: Express) {

  // GET /api/leagues/:id/storylines
  app.get("/api/leagues/:id/storylines", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const season = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);
      const myTeamId = await resolveCoachTeamId(leagueId, req.session.userId!);

      const enriched = await Promise.all(storylines.map(async (sl) => {
        const recruit = await storage.getRecruit(sl.recruitId);
        const events = await storage.getStorylineEventsByRecruit(sl.id);

        // activeEvent: the current unresolved event coaches can vote on (null if none pending)
        const activeEvent = events.find(e => !e.resolvedChoice) ?? null;

        // latestResolvedEvent: the most recently resolved event.
        // Primary sort: week desc. Tiebreaker: resolvedAt desc, then createdAt desc.
        const resolvedEvents = events.filter(e => e.resolvedChoice);
        const latestResolvedEvent = resolvedEvents.length > 0
          ? resolvedEvents.reduce((best, e) => {
              if (e.week !== best.week) return e.week > best.week ? e : best;
              const eTs = e.resolvedAt ? new Date(e.resolvedAt).getTime() : new Date(e.createdAt).getTime();
              const bestTs = best.resolvedAt ? new Date(best.resolvedAt).getTime() : new Date(best.createdAt).getTime();
              return eTs > bestTs ? e : best;
            }, resolvedEvents[0])
          : null;

        // Keep latestEvent as an alias for activeEvent for backwards compatibility
        // with any other code paths that still reference it.
        const latestEvent = activeEvent;

        let myVote: string | null = null;
        let voteCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        if (activeEvent) {
          const votes = await storage.getStorylineVotesByEvent(activeEvent.id);
          for (const v of votes) voteCounts[v.choice] = (voteCounts[v.choice] || 0) + 1;
          if (myTeamId) {
            const myVoteRow = await storage.getStorylineVoteByTeam(activeEvent.id, myTeamId);
            myVote = myVoteRow?.choice ?? null;
          }
        }

        // latestResolvedVoteCounts + latestResolvedMyVote: vote distribution and
        // the current coach's own choice for the most recent resolved event.
        // Fetched independently so they remain visible even when an active vote is open.
        let latestResolvedVoteCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        let latestResolvedMyVote: string | null = null;
        if (latestResolvedEvent) {
          const resolvedVotes = await storage.getStorylineVotesByEvent(latestResolvedEvent.id);
          for (const v of resolvedVotes) latestResolvedVoteCounts[v.choice] = (latestResolvedVoteCounts[v.choice] || 0) + 1;
          if (myTeamId) {
            const resolvedMyVoteRow = await storage.getStorylineVoteByTeam(latestResolvedEvent.id, myTeamId);
            latestResolvedMyVote = resolvedMyVoteRow?.choice ?? null;
          }
        }

        const archetypeDef = ARCHETYPE_DEFS[sl.archetype as Archetype];

        let overlappingRecruitName: string | null = null;
        if (sl.overlappingRecruitId) {
          const ovlSl = await storage.getStorylineRecruit(sl.overlappingRecruitId);
          if (ovlSl) {
            const ovlR = await storage.getRecruit(ovlSl.recruitId);
            if (ovlR) overlappingRecruitName = `${ovlR.firstName} ${ovlR.lastName}`;
          }
        }

        // Risk/reward hints — derived from active event weights + hidden vars.
        // No raw probability numbers are exposed; only labeled tiers and flavor text.
        const hv = sl.hiddenVars as unknown as Record<string, unknown> | null ?? null;
        const choiceHints = activeEvent ? buildChoiceHints(activeEvent) : null;
        const moodHint = buildMoodHint(hv);
        const recruitingImpactHint = buildRecruitingImpactHint(hv);

        // Scrub gem/bust/tier spoilers from the recruit sub-object before
        // returning — coaches must not be able to discover isGenerationalGem,
        // isGenerationalBust, or isBlueChip via the storylines endpoint.
        const publicRecruit = recruit ? (() => {
          const { isGenerationalGem: _g, isGenerationalBust: _b, ...safeRecruit } = recruit as Record<string, unknown>;
          return safeRecruit;
        })() : null;

        const archetypeKey = sl.archetype as Archetype;
        const publicStoryLabel = PUBLIC_STORY_LABELS[archetypeKey] ?? "Scouting Report";
        const publicArcFlavor = getPublicArcFlavor(archetypeKey);
        const publicArcStatus = derivePublicArcStatus(moodHint, recruitingImpactHint, sl.currentArcStage ?? 0);

        return {
          // Spread storyline_recruit columns but override identity-revealing fields
          ...sl,
          // Replace raw internal archetype key with the neutral public label so coaches
          // cannot identify gem/bust/phenom/collapse archetypes from network traffic.
          archetype: publicStoryLabel,
          // Strip legendary/tier — replaced with a non-spoiling high-interest flag
          isHighInterest: sl.isLegendary,
          isLegendary: undefined,
          tier: undefined,
          // Strip featuredTeamName — reveals which program is prominently recruiting
          featuredTeamName: undefined,
          // Public-safe metadata (no gem/bust/generational truth)
          publicStoryLabel,
          publicArcFlavor,
          publicArcStatus,
          // Scrubbed recruit object
          recruit: publicRecruit,
          // Remove the raw archetype def fields that expose internal names
          archetypeName: undefined,
          archetypeDescription: undefined,
          archetypeFlavor: undefined,
          archetypeImageUrl: archetypeDef?.imageUrl ?? null,
          totalArcEvents: (archetypeDef?.events.length ?? 3) + (sl.isLegendary ? (archetypeDef?.legendaryEvents?.length ?? 0) : 0),
          activeEvent,
          latestResolvedEvent,
          latestResolvedVoteCounts,
          latestResolvedMyVote,
          latestEvent,
          allEvents: events,
          totalEvents: events.length,
          resolvedEvents: resolvedEvents.length,
          voteCounts,
          myVote,
          overlappingRecruitName,
          choiceHints,
          moodHint,
          recruitingImpactHint,
        };
      }));

      res.json({ storylines: enriched });
    } catch (err) {
      console.error("[storylines] GET error:", err);
      res.status(500).json({ message: "Failed to fetch storylines" });
    }
  });

  // GET /api/leagues/:id/storylines/events
  app.get("/api/leagues/:id/storylines/events", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const events = await storage.getStorylineEventsByLeague(leagueId, league.currentSeason);
      const unresolved = events.filter(e => !e.resolvedChoice);

      const enriched = await Promise.all(unresolved.map(async (event) => {
        const votes = await storage.getStorylineVotesByEvent(event.id);
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

        const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
        const recruit = sl ? await storage.getRecruit(sl.recruitId) : null;

        let myVote: string | null = null;
        const coaches = await storage.getCoachesByLeague(leagueId);
        const myCoach = coaches.find(c => c.userId === req.session.userId);
        if (myCoach?.teamId) {
          const myVoteRow = await storage.getStorylineVoteByTeam(event.id, myCoach.teamId);
          myVote = myVoteRow?.choice ?? null;
        }

        return { ...event, voteCounts: counts, myVote, storylineRecruit: sl, recruit };
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[storylines] GET events error:", err);
      res.status(500).json({ message: "Failed to fetch storyline events" });
    }
  });

  // GET /api/leagues/:id/storylines/:storylineId
  app.get("/api/leagues/:id/storylines/:storylineId", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const sl = await storage.getStorylineRecruit(String(req.params.storylineId));
      if (!sl) return res.status(404).json({ message: "Storyline not found" });
      if (sl.leagueId !== leagueId) return res.status(403).json({ message: "Storyline does not belong to this league" });
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const recruit = await storage.getRecruit(sl.recruitId);
      const events = await storage.getStorylineEventsByRecruit(sl.id);

      const enrichedEvents = await Promise.all(events.map(async (event) => {
        const votes = await storage.getStorylineVotesByEvent(event.id);
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

        let myVote: string | null = null;
        const coaches = await storage.getCoachesByLeague(leagueId);
        const myCoach = coaches.find(c => c.userId === req.session.userId);
        if (myCoach?.teamId) {
          const myVoteRow = await storage.getStorylineVoteByTeam(event.id, myCoach.teamId);
          myVote = myVoteRow?.choice ?? null;
        }
        return { ...event, voteCounts: counts, myVote };
      }));

      const archetypeDef = ARCHETYPE_DEFS[sl.archetype as Archetype];
      const archetypeKey = sl.archetype as Archetype;
      const publicRecruit = recruit ? (() => {
        const { isGenerationalGem: _g, isGenerationalBust: _b, ...safeRecruit } = recruit as Record<string, unknown>;
        return safeRecruit;
      })() : null;

      const singlePublicLabel = PUBLIC_STORY_LABELS[archetypeKey] ?? "Scouting Report";
      res.json({
        ...sl,
        archetype: singlePublicLabel,
        isHighInterest: sl.isLegendary,
        isLegendary: undefined,
        tier: undefined,
        featuredTeamName: undefined,
        recruit: publicRecruit,
        publicStoryLabel: singlePublicLabel,
        publicArcFlavor: getPublicArcFlavor(archetypeKey),
        archetypeName: undefined,
        archetypeDescription: undefined,
        archetypeFlavor: undefined,
        events: enrichedEvents,
      });
    } catch (err) {
      console.error("[storylines] GET single error:", err);
      res.status(500).json({ message: "Failed to fetch storyline" });
    }
  });

  // GET /api/leagues/:id/recruits/:recruitId/storyline — arc history for a specific recruit
  app.get("/api/leagues/:id/recruits/:recruitId/storyline", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const recruitId = String(req.params.recruitId);

      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const sl = await storage.getStorylineRecruitByRecruitId(recruitId);
      if (!sl || sl.leagueId !== leagueId) {
        return res.json({ storylineRecruit: null, events: [] });
      }

      const allEvents = await storage.getStorylineEventsByRecruit(sl.id);
      // Return all resolved events (resolvedChoice set), sorted oldest-first.
      // Use resolvedAt if available, otherwise fall back to createdAt for sort.
      const resolvedEvents = allEvents
        .filter(e => e.resolvedChoice !== null)
        .sort((a, b) => {
          const aTime = a.resolvedAt ? new Date(a.resolvedAt).getTime() : new Date(a.createdAt).getTime();
          const bTime = b.resolvedAt ? new Date(b.resolvedAt).getTime() : new Date(b.createdAt).getTime();
          return aTime - bTime;
        })
        .map(e => {
          const choiceMap: Record<string, string> = {
            A: e.choiceA,
            B: e.choiceB,
            C: e.choiceC,
            D: e.choiceD ?? "",
          };
          const archetypeKey = e.archetypeAtEvent ?? null;
          const publicStoryLabelAtEvent = archetypeKey
            ? (PUBLIC_STORY_LABELS[archetypeKey as Archetype] ?? "Scouting Report")
            : null;
          return {
            id: e.id,
            week: e.week,
            season: e.season,
            eventText: e.eventText,
            // Use the neutral public label rather than the raw archetype key so coaches
            // cannot discover gem/bust/phenom/collapse status via network traffic.
            archetypeAtEvent: publicStoryLabelAtEvent,
            publicStoryLabelAtEvent,
            resolvedChoice: e.resolvedChoice,
            resolvedChoiceLabel: choiceMap[e.resolvedChoice!] ?? e.resolvedChoice,
            resolvedOutcomeText: e.resolvedOutcomeText,
            ovrDelta: e.ovrDelta,
            resolvedAt: e.resolvedAt,
          };
        });

      const arcHistoryKey = sl.archetype as Archetype;
      const arcHistoryPublicLabel = PUBLIC_STORY_LABELS[arcHistoryKey] ?? "Scouting Report";

      res.json({
        storylineRecruit: {
          id: sl.id,
          archetype: arcHistoryPublicLabel,
          publicStoryLabel: arcHistoryPublicLabel,
          currentArcStage: sl.currentArcStage,
          isHighInterest: sl.isLegendary,
          resolvedOvrDelta: sl.resolvedOvrDelta,
          imageUrl: sl.imageUrl,
        },
        events: resolvedEvents,
      });
    } catch (err) {
      console.error("[storylines] GET recruit arc history error:", err);
      res.status(500).json({ message: "Failed to fetch storyline arc history" });
    }
  });

  // GET /api/leagues/:id/storyline-season-wrap/:season — season wrap summary for offseason recap
  app.get("/api/leagues/:id/storyline-season-wrap/:season", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const season = parseInt(String(req.params.season));
      if (isNaN(season)) return res.status(400).json({ message: "Invalid season" });

      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

      const entries = await Promise.all(storylines.map(async (sl) => {
        const recruit = await storage.getRecruit(sl.recruitId);
        const wrapKey = sl.archetype as Archetype;
        const publicLabel = PUBLIC_STORY_LABELS[wrapKey] ?? "Scouting Report";
        return {
          storylineRecruitId: sl.id,
          recruitId: sl.recruitId,
          firstName: recruit?.firstName ?? "Unknown",
          lastName: recruit?.lastName ?? "Recruit",
          position: recruit?.position ?? "",
          archetype: publicLabel,
          publicStoryLabel: publicLabel,
          isHighInterest: sl.isLegendary,
          resolvedOvrDelta: sl.resolvedOvrDelta,
          committed: !!recruit?.signedTeamId,
          signedTeamId: recruit?.signedTeamId ?? null,
        };
      }));

      // Sort: high-interest first, then by absolute OVR impact descending
      entries.sort((a, b) => {
        if (a.isHighInterest !== b.isHighInterest) return a.isHighInterest ? -1 : 1;
        return Math.abs(b.resolvedOvrDelta) - Math.abs(a.resolvedOvrDelta);
      });

      res.json({ season, entries });
    } catch (err) {
      console.error("[storylines] GET season wrap error:", err);
      res.status(500).json({ message: "Failed to fetch storyline season wrap" });
    }
  });

  // POST /api/leagues/:id/storylines/events/:eventId/vote  (frontend contract)
  app.post("/api/leagues/:id/storylines/events/:eventId/vote", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const eventId = String(req.params.eventId);
      const { choice } = req.body;

      if (!["A", "B", "C", "D"].includes(choice)) {
        return res.status(400).json({ message: "Invalid choice — must be A, B, C, or D" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const teamId = await resolveCoachTeamId(leagueId, req.session.userId!);
      if (!teamId) return res.status(403).json({ message: "You are not a member of this league" });

      const event = await storage.getStorylineEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.resolvedChoice) return res.status(400).json({ message: "This event has already been resolved" });

      // Reject D votes on 3-choice events
      if (choice === "D" && !event.choiceD) {
        return res.status(400).json({ message: "Choice D is not available for this event" });
      }

      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl || sl.leagueId !== leagueId) return res.status(403).json({ message: "Event does not belong to this league" });

      const existing = await storage.getStorylineVoteByTeam(eventId, teamId);
      if (existing) {
        const updated = await storage.updateStorylineVote(existing.id, { choice });
        return res.json(updated);
      }

      const vote = await storage.createStorylineVote({ eventId, teamId, choice });
      res.json(vote);
    } catch (err) {
      console.error("[storylines] VOTE (events route) error:", err);
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // POST /api/leagues/:id/storylines/:storylineId/vote  (legacy / alternate contract)
  app.post("/api/leagues/:id/storylines/:storylineId/vote", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const teamId = await resolveCoachTeamId(leagueId, req.session.userId!);
      if (!teamId) return res.status(403).json({ message: "You are not a member of this league" });

      const { eventId, choice } = req.body;
      if (!eventId || !["A", "B", "C", "D"].includes(choice)) {
        return res.status(400).json({ message: "Invalid vote: eventId and choice (A-D) required" });
      }

      const event = await storage.getStorylineEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.resolvedChoice) return res.status(400).json({ message: "This event has already been resolved" });

      // Reject D votes on 3-choice events
      if (choice === "D" && !event.choiceD) {
        return res.status(400).json({ message: "Choice D is not available for this event" });
      }

      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl || sl.leagueId !== leagueId) return res.status(403).json({ message: "Event does not belong to this league" });

      const existing = await storage.getStorylineVoteByTeam(eventId, teamId);
      if (existing) {
        const updated = await storage.updateStorylineVote(existing.id, { choice });
        return res.json(updated);
      }

      const vote = await storage.createStorylineVote({ eventId, teamId, choice });
      res.json(vote);
    } catch (err) {
      console.error("[storylines] VOTE error:", err);
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // POST /api/leagues/:id/storylines/generate — commissioner + co-commissioner manual trigger
  app.post("/api/leagues/:id/storylines/generate", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner or co-commissioners can manually trigger storyline events" });
      }

      const unresolvedEvents = await storage.getUnresolvedStorylineEvents(leagueId, league.currentSeason);
      if (unresolvedEvents.length >= 10) {
        return res.status(409).json({
          message: "Weekly event cap reached (10 active events). Advance the week or resolve pending events before generating more.",
          unresolvedCount: unresolvedEvents.length,
        });
      }

      const generated = await generateAndResolveStorylineEvents(leagueId, league.currentSeason, league.currentWeek, league.seasonLength ?? "standard", undefined, league.currentPhase);
      res.json({ success: true, ...generated });
    } catch (err) {
      console.error("[storylines] GENERATE error:", err);
      res.status(500).json({ message: "Failed to generate storyline events" });
    }
  });

  // POST /api/leagues/:id/storylines/repair
  // Commissioner + co-commissioners: initializes storyline recruits if missing for the current season.
  // Repairs dynasties started with a saved recruiting class before the auto-init fix.
  app.post("/api/leagues/:id/storylines/repair", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner or co-commissioners can repair storylines" });
      }

      const existing = await storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason);
      if (existing.length > 0) {
        return res.json({ success: true, initialized: existing.length, alreadyPresent: true });
      }

      const recruits = await storage.getRecruitsByLeague(leagueId);
      if (recruits.length === 0) {
        return res.status(409).json({ message: "No recruits found — cannot initialize storylines without a recruiting class" });
      }

      const count = await initializeStorylineRecruits(leagueId, league.currentSeason);
      console.log(`[storylines] repair: initialized ${count} storyline recruits for league ${leagueId}`);
      res.json({ success: true, initialized: count, alreadyPresent: false });
    } catch (err) {
      console.error("[storylines] REPAIR error:", err);
      res.status(500).json({ message: "Failed to repair storylines" });
    }
  });

  // GET /api/leagues/:id/storylines/health
  // Commissioner + co-commissioners: run a health check on storyline data integrity.
  // Returns a StorylineHealthReport with issue codes, severity, and repair hints.
  app.get("/api/leagues/:id/storylines/health", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner or co-commissioners can view storyline health" });
      }
      const report = await checkStorylineHealth(leagueId, league.currentSeason, league.currentWeek);
      res.json(report);
    } catch (err) {
      console.error("[storylines] HEALTH error:", err);
      res.status(500).json({ message: "Failed to run storyline health check" });
    }
  });

  // POST /api/leagues/:id/storylines/health/repair
  // Commissioner + co-commissioners: attempt automated repair of detected issues.
  // Repairs are additive — they do not delete data that already exists.
  app.post("/api/leagues/:id/storylines/health/repair", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner or co-commissioners can repair storyline health" });
      }

      // Run health check first so we know what to fix
      const before = await checkStorylineHealth(leagueId, league.currentSeason, league.currentWeek);
      const actions: string[] = [];

      // Repair: missing storyline recruits — initialize them
      const missingIssue = before.issues.find(i => i.code === "MISSING_STORYLINE_RECRUITS");
      if (missingIssue) {
        const recruits = await storage.getRecruitsByLeague(leagueId);
        if (recruits.length > 0) {
          const count = await initializeStorylineRecruits(leagueId, league.currentSeason);
          actions.push(`Initialized ${count} storyline recruits`);
        }
      }

      // Repair: mismatch — existing storyline data has orphaned recruit references; re-init
      const mismatchIssue = before.issues.find(i => i.code === "STORYLINE_CLASS_MISMATCH");
      if (mismatchIssue) {
        actions.push("Storyline class mismatch detected — manual DB inspection recommended; auto-repair only initializes missing arcs");
      }

      // Repair: stale unresolved events — resolve them with the deterministic fallback
      const staleIssue = before.issues.find(i => i.code === "STALE_UNRESOLVED_EVENTS");
      if (staleIssue) {
        const resolved = await catchUpAndResolveStorylineArcs(leagueId, league.currentSeason, league.currentWeek);
        actions.push(`Resolved ${resolved} stale storyline event(s) using deterministic fallback`);
      }

      // Re-run health to get the updated state
      const after = await checkStorylineHealth(leagueId, league.currentSeason, league.currentWeek);

      res.json({
        success: true,
        actionsPerformed: actions,
        before: { healthy: before.healthy, issueCount: before.issues.length },
        after: { healthy: after.healthy, issueCount: after.issues.length },
        report: after,
      });
    } catch (err) {
      console.error("[storylines] HEALTH/REPAIR error:", err);
      res.status(500).json({ message: "Failed to repair storyline health issues" });
    }
  });
}

// ─── Core Storyline Logic ──────────────────────────────────────────────────────

// startWeek: the league's currentWeek when this season's in-season phase begins.
// For regular season starts this is always 1 (week counter resets at walkons).
// For late self-heal initializations it reflects the actual advance week so the
// proportional arc formula can map correctly to the remaining season window.
export async function initializeStorylineRecruits(leagueId: string, season: number, force = false, startWeek = 1): Promise<number> {
  try {
    if (!force) {
      const existing = await storage.getStorylineRecruitsByLeague(leagueId, season);
      if (existing.length > 0) {
        console.log(`[storylines] initializeStorylineRecruits: skipping — ${existing.length} records already exist for league ${leagueId} season ${season}`);
        return existing.length;
      }
    }

    const recruits = await storage.getRecruitsByLeague(leagueId);
    if (recruits.length === 0) return 0;

    await storage.deleteStorylineRecruitsByLeague(leagueId, season);

    let recentLegendaryCount = 0;
    for (let s = Math.max(1, season - 4); s < season; s++) {
      try {
        const prev = await storage.getStorylineRecruitsByLeague(leagueId, s);
        recentLegendaryCount += prev.filter(sl => sl.isLegendary).length;
      } catch (err) {
        console.warn(`[storylines] failed to fetch season ${s} legendaries for quota:`, err);
      }
    }

    const picks = pickStorylineRecruits(recruits.map(r => ({
      id: r.id,
      overall: r.overall ?? 250,
      starRank: r.starRank ?? 3,
      isBlueChip: r.isBlueChip,
      isGenerationalGem: r.isGenerationalGem,
      firstName: r.firstName,
      lastName: r.lastName,
      position: r.position,
    })), { recentLegendaryCount });

    const created: import("@shared/schema").StorylineRecruit[] = [];
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      // Assign a fixed story slot (0–9) so slot-based scheduling spreads 3 events/advance
      // across all 10 recruits evenly. Chapter C fires at advance (slot + C*3) % 10.
      const storySlot = i % 10;
      const sl = await storage.createStorylineRecruit({
        leagueId,
        recruitId: pick.recruitId,
        season,
        archetype: pick.archetype,
        tier: pick.tier,
        storySlot,
        hiddenVars: { ...pick.hiddenVars, startWeek },
        isLegendary: pick.isLegendary,
        currentArcStage: 0,
        resolvedOvrDelta: 0,
      });
      created.push(sl);
    }

    // Link ~15% of storyline pairs as overlapping arcs
    const shuffledCreated = [...created].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffledCreated.length - 1; i += 2) {
      if (Math.random() < 0.15) {
        await storage.updateStorylineRecruit(shuffledCreated[i].id, { overlappingRecruitId: shuffledCreated[i + 1].id });
        await storage.updateStorylineRecruit(shuffledCreated[i + 1].id, { overlappingRecruitId: shuffledCreated[i].id });
      }
    }

    // Fire first arc events at advance index 0 (spring training / season start).
    // Slot-based scheduling: only slot-0 recruits' chapter 0 fires here.
    await generateWeeklyStorylineEvents(leagueId, season, startWeek, 0);

    return picks.length;
  } catch (err) {
    console.error("[storylines] initializeStorylineRecruits error:", err);
    return 0;
  }
}

// Shared resolution helper — resolves one pending storyline event using the
// attribute-first StoryOutcome system. Handles OVR recompute, ability changes,
// arc progression, league events, and dynasty news in a single call.
async function resolveOneStorylineEvent(
  event: Awaited<ReturnType<typeof storage.getUnresolvedStorylineEvents>>[number],
  leagueId: string,
  season: number,
  currentWeek: number,
): Promise<boolean> {
  try {
    const votes = await storage.getStorylineVotesByEvent(event.id);
    const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
    if (!sl) return false;

    // Build positivity scores for each choice so the deterministic fallback can
    // bias toward the recruit's personality profile when no votes were cast.
    const hv = sl.hiddenVars as unknown as Record<string, unknown> | null ?? null;
    const positivityScores = [
      event.choiceAWeights, event.choiceBWeights, event.choiceCWeights,
      ...(event.choiceD ? [event.choiceDWeights] : []),
    ].map(w => {
      if (!w) return 0;
      const cw = w as ChoiceWeights;
      return (
        (cw.minor_pos ?? 0) * 1 + (cw.moderate_pos ?? 0) * 2 + (cw.major_pos ?? 0) * 3 + (cw.legendary_pos ?? 0) * 4 -
        (cw.minor_neg ?? 0) * 1 - (cw.moderate_neg ?? 0) * 2 - (cw.major_neg ?? 0) * 3 - (cw.legendary_neg ?? 0) * 4
      );
    });

    const { winningChoice, usedFallback } = resolveVotes(votes, !!event.choiceD, {
      hiddenVars: hv,
      positivityScores,
    });
    if (usedFallback) {
      console.log(`[storylines] no-vote deterministic fallback for event ${event.id}: choice=${winningChoice}`);
    }
    const volatility = (sl.hiddenVars as { volatility?: number })?.volatility ?? 5;

    const outcomeText = winningChoice === "A" ? event.choiceAOutcome
      : winningChoice === "B" ? event.choiceBOutcome
      : winningChoice === "C" ? event.choiceCOutcome
      : (event.choiceDOutcome ?? event.choiceCOutcome);

    const recruit = await storage.getRecruit(sl.recruitId);
    let ovrDelta = 0;
    let abilityGain: string | undefined;
    let abilityRemove: string | undefined;
    let abilityTier: string | undefined;

    if (recruit) {
      try {
        const outcome = getOutcomeForChoice(
          event as Parameters<typeof getOutcomeForChoice>[0],
          winningChoice,
          recruit.position,
          sl.isLegendary,
        );
        const result = await applyStoryOutcomeToRecruit(recruit, outcome, volatility, sl.isLegendary, event.id, winningChoice);
        ovrDelta = result.ovrDelta;
        abilityGain = result.abilityGain;
        abilityRemove = result.abilityRemove;
        abilityTier = result.abilityTier;
      } catch (applyErr) {
        console.warn("[storylines] applyStoryOutcome error:", applyErr);
      }
    }

    await storage.updateStorylineEvent(event.id, {
      resolvedChoice: winningChoice,
      resolvedOutcomeText: outcomeText,
      ovrDelta,
      resolvedAbilityGain: abilityGain,
      resolvedAbilityRemove: abilityRemove,
      resolvedAbilityTier: abilityTier,
      resolvedAt: new Date(),
    });

    if (recruit) {
      const newCumulativeDelta = (sl.resolvedOvrDelta ?? 0) + ovrDelta;
      const newArcStage = sl.currentArcStage + 1;
      // Skip random archetype transitions for authored arcs — the commissioner
      // explicitly chose this archetype in the Arc Studio and it must be stable.
      const isAuthoredArc = Boolean((sl.hiddenVars as unknown as Record<string, unknown> | null)?.authoredArc);
      const transitionedArchetype = isAuthoredArc
        ? (sl.archetype as Archetype)
        : maybeTransitionArchetype(
            sl.archetype as Archetype,
            newCumulativeDelta,
            newArcStage,
            sl.isLegendary,
            recruit.position,
          );

      await storage.updateStorylineRecruit(sl.id, {
        resolvedOvrDelta: newCumulativeDelta,
        currentArcStage: newArcStage,
        ...(transitionedArchetype !== sl.archetype ? { archetype: transitionedArchetype } : {}),
      });

      const ovrStr = ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta === 0 ? "±0" : `${ovrDelta}`;

      // Build ability-first headline: lead with ability change if one occurred
      let newsTitle: string;
      let newsContent: string;
      if (abilityGain && abilityTier) {
        const tierLabel = abilityTier === 'gold' ? 'GOLD' : abilityTier === 'red' ? 'RED' : 'BLUE';
        newsTitle = `[${tierLabel}] ${abilityGain} — ${recruit.firstName} ${recruit.lastName}`;
        newsContent = `Choice ${winningChoice} wins the vote — "${abilityGain}" (${tierLabel}) unlocked through the storyline arc.\n\n"${outcomeText}"\n\nOVR: ${ovrStr}`;
      } else if (abilityRemove) {
        newsTitle = `Ability Lost: ${abilityRemove} — ${recruit.firstName} ${recruit.lastName}`;
        newsContent = `Choice ${winningChoice} wins — "${abilityRemove}" was removed by this storyline outcome.\n\n"${outcomeText}"\n\nOVR: ${ovrStr}`;
      } else {
        newsTitle = `Storyline Update: ${recruit.firstName} ${recruit.lastName}`;
        newsContent = `Choice ${winningChoice} carries the vote.\n\n"${outcomeText}"\n\nOVR: ${ovrStr}`;
      }

      await storage.createLeagueEvent({
        leagueId,
        eventType: "STORYLINE",
        description: `STORYLINE: ${recruit.firstName} ${recruit.lastName} — Choice ${winningChoice}. ${abilityGain ? `Ability gained: ${abilityGain}. ` : ''}${outcomeText.slice(0, 120)}`,
        season,
        week: currentWeek,
      });

      storage.createDynastyNews({
        leagueId,
        title: newsTitle,
        content: newsContent,
        category: "recruiting",
        journalist: "sully",
        authorName: "Sully Pump",
        season,
        week: currentWeek,
      }).catch(err => console.warn("[storylines] dynasty news creation failed:", err));

      // Notify coaches who have this recruit on their board (if ability changed)
      if (abilityGain || abilityRemove) {
        try {
          const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
          const boardTeamIds = interests.filter(i => (i.interestLevel ?? 0) > 0 && i.teamId).map(i => i.teamId!);
          for (const teamId of boardTeamIds) {
            const tierLabel = abilityTier === 'gold' ? '[GOLD] ' : abilityTier === 'red' ? '[RED] ' : abilityTier === 'blue' ? '[BLUE] ' : '';
            const abilityMsg = abilityGain
              ? `gained ${tierLabel}"${abilityGain}" via storyline arc`
              : `lost "${abilityRemove}" via storyline arc`;
            await storage.createLeagueEvent({
              leagueId,
              teamId,
              eventType: "STORYLINE_ABILITY",
              description: `${recruit.firstName} ${recruit.lastName} ${abilityMsg} (Choice ${winningChoice})`,
              season,
              week: currentWeek,
            }).catch(() => {});
          }
        } catch (notifyErr) {
          // non-fatal — notifications best-effort
        }
      }
    }

    return true;
  } catch (err) {
    console.error("[storylines] resolveOneStorylineEvent error:", err);
    return false;
  }
}

// Resolve-only sweep: settles all pending storyline events that are overdue (week < currentWeek)
// without generating any new events. Uses the same full resolution pipeline as normal weekly
// progression — archetype transitions, ability side effects, league events, dynasty news —
// so phase-boundary resolution is behaviorally consistent with normal weekly resolution.
// Events generated for currentWeek or later are intentionally skipped to preserve the
// commissioner voting window on newly-created arcs.
export async function resolveAllPendingStorylineEvents(
  leagueId: string,
  season: number,
  currentWeek: number,
): Promise<number> {
  let resolved = 0;
  try {
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    for (const event of unresolved) {
      // Skip events generated for the current week or later — only resolve overdue arcs.
      if (event.week >= currentWeek) continue;
      const ok = await resolveOneStorylineEvent(event, leagueId, season, currentWeek);
      if (ok) resolved++;
    }
  } catch (err) {
    console.error("[storylines] resolveAllPendingStorylineEvents error:", err);
  }
  return resolved;
}

export async function generateAndResolveStorylineEvents(
  leagueId: string,
  season: number,
  currentWeek: number,
  seasonLength: string = "medium",
  maxWeeks?: number,
  phase?: string,
): Promise<{ resolved: number; generated: number }> {
  let resolved = 0;
  let generated = 0;

  // getSeasonMaxWeeks(seasonLength) is the single source of truth for max regular-season weeks.
  // The explicit maxWeeks parameter from the caller (advanceLeagueStep) always takes precedence;
  // if omitted by a legacy caller, we derive it from the seasonLength string via shared constants.
  const effectiveMaxWeeks = maxWeeks ?? getSeasonMaxWeeks(seasonLength);

  try {
    // Season-scoped: resolve all overdue pending events using the new StoryOutcome pipeline
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    for (const event of unresolved) {
      if (event.week >= currentWeek) continue;
      const ok = await resolveOneStorylineEvent(event, leagueId, season, currentWeek);
      if (ok) resolved++;
    }

    // Compute the advance index for slot-based scheduling.
    // Postseason phases (conference_championship, super_regionals, cws) use advance indices 5–9
    // and must generate even when currentWeek > effectiveMaxWeeks.
    const effectivePhase = phase ?? "regular_season";
    const isPostseasonPhase = ["conference_championship", "super_regionals", "cws"].includes(effectivePhase);
    if (currentWeek > effectiveMaxWeeks && !isPostseasonPhase) {
      console.log(`[storylines] week ${currentWeek} > maxWeeks ${effectiveMaxWeeks} (phase=${effectivePhase}) — skipping regular-season generation`);
    } else {
      const advanceIndex = advanceIndexForPhaseWeek(effectivePhase, currentWeek, effectiveMaxWeeks);
      console.log(`[storylines] generateWeekly: week=${currentWeek} phase=${effectivePhase} advanceIndex=${advanceIndex}`);
      generated = await generateWeeklyStorylineEvents(leagueId, season, currentWeek, advanceIndex);
    }
    await simulateCpuVotes(leagueId);
  } catch (err) {
    console.error("[storylines] generateAndResolve error:", err);
  }

  return { resolved, generated };
}

// week: raw league week used to stamp new events in the DB (for resolution ordering)
// advanceIndex: 0–9, derived from phase + week by advanceIndexForPhaseWeek().
// Slot-based filter: recruit at slot S fires chapter C when ⌊(C×10 + S) / 3⌋ === advanceIndex.
// This guarantees monotonically increasing advance indices per recruit (ch0 < ch1 < ch2)
// AND exactly 3 beats per advance across all 10 advances (30 beats total).
//
// Beat index for (S, C) = C*10 + S; advance = beat // 3.
// Example schedule (10 recruits, 3 chapters, 10 advances):
//   Advance 0: slots 0,1,2 ch0 | Advance 1: slots 3,4,5 ch0 | Advance 2: slots 6,7,8 ch0
//   Advance 3: slot 9 ch0, slots 0,1 ch1 | ... | Advance 9: slots 7,8,9 ch2
/**
 * Generates the initial arc events (advance index 0) for an already-initialized
 * storyline recruit set.  Called as a best-effort step AFTER the recruiting
 * class has been committed, so any failure here does not corrupt the pool.
 */
export async function generateInitialStorylineEvents(
  leagueId: string,
  season: number,
  startWeek = 1
): Promise<void> {
  try {
    await generateWeeklyStorylineEvents(leagueId, season, startWeek, 0);
  } catch (err) {
    console.error("[storylines] generateInitialStorylineEvents failed:", err);
  }
}

async function generateWeeklyStorylineEvents(
  leagueId: string,
  season: number,
  week: number,
  advanceIndex: number,
): Promise<number> {
  let count = 0;
  try {
    const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

    // Pre-filter: skip recruits that already have an unresolved event this season
    const currentUnresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    const unresolvedByRecruit = new Set(currentUnresolved.map(e => e.storylineRecruitId));

    const eligible = await Promise.all(
      storylines.map(async (sl) => {
        if (unresolvedByRecruit.has(sl.id)) return null;
        const events = await storage.getStorylineEventsByRecruit(sl.id);
        const currentSeasonEvents = events.filter(e => e.season === season);
        return currentSeasonEvents.some(e => !e.resolvedChoice) ? null : sl;
      })
    );
    const ready = eligible.filter((sl): sl is NonNullable<typeof sl> => sl !== null);
    if (ready.length === 0) return 0;

    // Enforce absolute unresolved-event cap of 10
    const unresolvedCount = currentUnresolved.length;
    const slotsRemaining = Math.max(0, 10 - unresolvedCount);
    if (slotsRemaining === 0) {
      console.log(`[storylines] 10 unresolved events already — skipping generation this advance`);
      return 0;
    }

    // Filter to non-exhausted recruits; reset all if everyone exhausted
    const isExhausted = (sl: typeof ready[0]) => {
      const def = ARCHETYPE_DEFS[sl.archetype as Archetype];
      const currentUsed = (sl.usedTemplateIds as string[] | null) ?? [];
      const allTemplateIds = [
        ...def.events.map((e) => e.id),
        ...(sl.isLegendary && def.legendaryEvents ? def.legendaryEvents.map((e) => e.id) : []),
      ];
      return currentUsed.length > 0 && allTemplateIds.every((id) => currentUsed.includes(id));
    };

    let nonExhausted = ready.filter((sl) => !isExhausted(sl));
    if (nonExhausted.length === 0) {
      console.log(`[storylines] all recruits exhausted — resetting usedTemplateIds`);
      for (const sl of ready) {
        await storage.updateStorylineRecruit(sl.id, { usedTemplateIds: [] });
        sl.usedTemplateIds = [];
      }
      nonExhausted = ready;
    }

    // ── Slot-based scheduling ──────────────────────────────────────────────────
    // Recruit at slot S fires chapter C when ⌊(C×10 + S) / 3⌋ === advanceIndex.
    // Beat index = C*10 + S; advance = beat // 3. Guaranteed monotonic per recruit
    // and exactly 3 beats per advance across all 10 advance indices (30 beats total).
    const slotScheduled = nonExhausted.filter(sl => {
      if (sl.storySlot === null || sl.storySlot === undefined) return false;
      const expectedAdvance = Math.floor((sl.currentArcStage * 10 + sl.storySlot) / 3);
      return expectedAdvance === advanceIndex;
    });

    // Fallback for recruits without a storySlot (created before the overhaul):
    // only include never-fired recruits (stage 0) so they still get their first event
    const legacyFallback = nonExhausted.filter(sl =>
      (sl.storySlot === null || sl.storySlot === undefined) && sl.currentArcStage === 0
    );

    const effectivePool = slotScheduled.length > 0
      ? slotScheduled
      : legacyFallback;

    if (effectivePool.length === 0) {
      console.log(`[storylines] advanceIndex=${advanceIndex} — no recruits scheduled for this advance`);
      return 0;
    }

    // Hard cap at 3 events per advance (matching the slot design: 3 recruits/advance)
    const maxEvents = Math.min(effectivePool.length, slotsRemaining, 3);

    // Legendary-first within the scheduled pool
    const prioritized = [
      ...effectivePool.filter(sl => sl.isLegendary),
      ...effectivePool.filter(sl => !sl.isLegendary).sort(() => Math.random() - 0.5),
    ].slice(0, maxEvents);

    for (const sl of prioritized) {
      const recruit = await storage.getRecruit(sl.recruitId);
      if (!recruit) continue;

      const recruitName = `${recruit.firstName} ${recruit.lastName}`;
      let linkedRecruitName: string | undefined;

      if (sl.overlappingRecruitId) {
        const linkedSl = await storage.getStorylineRecruit(sl.overlappingRecruitId).catch(() => null);
        if (linkedSl) {
          const linkedR = await storage.getRecruit(linkedSl.recruitId).catch(() => null);
          if (linkedR) linkedRecruitName = `${linkedR.firstName} ${linkedR.lastName}`;
        }
      }

      let featuredTeamName: string | undefined = sl.featuredTeamName ?? undefined;
      if (!featuredTeamName) {
        try {
          const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
          if (interests.length > 0) {
            const top = interests.reduce((best, cur) => (cur.interestLevel ?? 0) > (best.interestLevel ?? 0) ? cur : best);
            if (top.teamId) {
              const team = await storage.getTeam(top.teamId);
              if (team?.name) featuredTeamName = team.name;
            }
          }
        } catch (e) {
          // non-fatal
        }
        if (featuredTeamName) {
          await storage.updateStorylineRecruit(sl.id, { featuredTeamName });
        }
      }

      const eventData = generateStorylineEvent(
        sl.id, leagueId, season, week,
        sl.archetype as Archetype,
        sl.currentArcStage,
        sl.isLegendary,
        recruitName,
        linkedRecruitName,
        recruit.position ?? undefined,
        (sl.usedTemplateIds as string[] | null) ?? [],
        // Do NOT pass featuredTeamName — {team} must resolve to "the program"
        // to prevent event text from revealing which specific school is recruiting.
        undefined,
      );

      // storyOutcomes is generated inside generateStorylineEvent and included in eventData
      const { scenePrompt: _scenePrompt, ...insertableEventData } = eventData;
      await storage.createStorylineEvent({ ...insertableEventData, archetypeAtEvent: sl.archetype });
      count++;

      if (eventData.templateId) {
        const currentUsed = (sl.usedTemplateIds as string[] | null) ?? [];
        const dedupedUsed = Array.from(new Set([...currentUsed, eventData.templateId]));
        await storage.updateStorylineRecruit(sl.id, { usedTemplateIds: dedupedUsed });
      }
    }

  } catch (err) {
    console.error("[storylines] generateWeeklyEvents error:", err);
  }
  return count;
}

function choicePositivityScore(weights: ChoiceWeights): number {
  return (
    (weights.minor_pos ?? 0) * 1 +
    (weights.moderate_pos ?? 0) * 2 +
    (weights.major_pos ?? 0) * 3 +
    (weights.legendary_pos ?? 0) * 4 -
    (weights.minor_neg ?? 0) * 1 -
    (weights.moderate_neg ?? 0) * 2 -
    (weights.major_neg ?? 0) * 3 -
    (weights.legendary_neg ?? 0) * 4
  );
}

function weightedRandomChoice(scores: Record<string, number>): string {
  const entries = Object.entries(scores).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    const keys = Object.keys(scores);
    return keys[Math.floor(Math.random() * keys.length)];
  }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let rng = Math.random() * total;
  for (const [choice, score] of entries) {
    rng -= score;
    if (rng <= 0) return choice;
  }
  return entries[entries.length - 1][0];
}

async function simulateCpuVotes(leagueId: string): Promise<void> {
  try {
    const teams = await storage.getTeamsByLeague(leagueId);
    const cpuTeams = teams.filter(t => t.isCpu);
    if (cpuTeams.length === 0) return;

    const league = await storage.getLeague(leagueId);
    const currentSeason = league?.currentSeason ?? 1;
    // Season-scoped: only simulate CPU votes for current-season unresolved events
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId, currentSeason);

    for (const event of unresolved) {
      const scores: Record<string, number> = {
        A: Math.max(0.1, choicePositivityScore(event.choiceAWeights as ChoiceWeights)),
        B: Math.max(0.1, choicePositivityScore(event.choiceBWeights as ChoiceWeights)),
        C: Math.max(0.1, choicePositivityScore(event.choiceCWeights as ChoiceWeights)),
      };
      if (event.choiceD && event.choiceDWeights) {
        scores.D = Math.max(0.1, choicePositivityScore(event.choiceDWeights as ChoiceWeights));
      }

      for (const team of cpuTeams) {
        const existing = await storage.getStorylineVoteByTeam(event.id, team.id);
        if (existing) continue;
        if (Math.random() > 0.70) continue;
        await storage.createStorylineVote({ eventId: event.id, teamId: team.id, choice: weightedRandomChoice(scores) });
      }
    }
  } catch (err) {
    console.error("[storylines] simulateCpuVotes error:", err);
  }
}

// Force-generate and immediately resolve ALL remaining arc events for storyline recruits
// that didn't complete their arcs during normal weekly advancement (e.g., late self-heal,
// rate-limiting, or final-week timing gaps).  Called once before the pre-postseason sweep
// so every recruit finishes their full arc before offseason signing day.
//
// Algorithm: round-loop
//   1. Generate one event per non-exhausted recruit that has no pending unresolved event.
//   2. Resolve every pending event with a far-future week boundary so newly-generated
//      events are included regardless of their stamped week number.
//   3. Repeat until no new events were generated or resolved (convergence).
export async function catchUpAndResolveStorylineArcs(
  leagueId: string,
  season: number,
  currentWeek: number,
): Promise<number> {
  let totalResolved = 0;
  const MAX_ROUNDS = 30;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);
      const unresolvedNow = await storage.getUnresolvedStorylineEvents(leagueId, season);
      const unresolvedByRecruit = new Set(unresolvedNow.map(e => e.storylineRecruitId));

      let generated = 0;

      for (const sl of storylines) {
        const def = ARCHETYPE_DEFS[sl.archetype as Archetype];
        if (!def) continue;

        const allTemplateIds = [
          ...def.events.map((e) => e.id),
          ...(sl.isLegendary && def.legendaryEvents ? def.legendaryEvents.map((e) => e.id) : []),
        ];

        const currentUsed: string[] = (sl.usedTemplateIds as string[] | null) ?? [];
        // Skip fully-exhausted recruits
        if (currentUsed.length > 0 && allTemplateIds.every((id) => currentUsed.includes(id))) continue;
        // Must resolve any existing unresolved event before generating the next one
        if (unresolvedByRecruit.has(sl.id)) continue;

        const recruit = await storage.getRecruit(sl.recruitId);
        if (!recruit) continue;

        // Use already-resolved featuredTeamName; only re-resolve when missing
        let featuredTeamName: string | undefined = sl.featuredTeamName ?? undefined;
        if (!featuredTeamName) {
          try {
            const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
            if (interests.length > 0) {
              const top = interests.reduce((best, cur) => (cur.interestLevel ?? 0) > (best.interestLevel ?? 0) ? cur : best);
              if (top.teamId) {
                const team = await storage.getTeam(top.teamId);
                if (team?.name) featuredTeamName = team.name;
              }
            }
          } catch (e) {
            // non-fatal
          }
          if (featuredTeamName) {
            await storage.updateStorylineRecruit(sl.id, { featuredTeamName });
          }
        }

        const recruitName = `${recruit.firstName} ${recruit.lastName}`;
        const eventData = generateStorylineEvent(
          sl.id, leagueId, season, currentWeek,
          sl.archetype as Archetype,
          sl.currentArcStage,
          sl.isLegendary,
          recruitName,
          undefined,
          recruit.position ?? undefined,
          currentUsed,
          // Do NOT pass featuredTeamName — {team} must resolve to "the program"
          // to prevent event text from revealing which specific school is recruiting.
          undefined,
        );

        const { scenePrompt: _scenePrompt, ...insertableEventData } = eventData;
        await storage.createStorylineEvent({ ...insertableEventData, archetypeAtEvent: sl.archetype });

        if (eventData.templateId) {
          const dedupedUsed = Array.from(new Set([...currentUsed, eventData.templateId]));
          await storage.updateStorylineRecruit(sl.id, { usedTemplateIds: dedupedUsed });
        }

        generated++;
      }

      // Resolve everything pending — use a far-future week so newly-generated events
      // (stamped at currentWeek) are not skipped by the event.week >= boundary check.
      const resolved = await resolveAllPendingStorylineEvents(leagueId, season, currentWeek + 9999);
      totalResolved += resolved;

      if (generated === 0 && resolved === 0) {
        console.log(`[storylines] catch-up: complete after ${round + 1} round(s) — ${totalResolved} total arc events resolved`);
        break;
      }

      console.log(`[storylines] catch-up round ${round + 1}: generated ${generated}, resolved ${resolved}`);
    }
  } catch (err) {
    console.error("[storylines] catchUpAndResolveStorylineArcs error:", err);
  }

  return totalResolved;
}
