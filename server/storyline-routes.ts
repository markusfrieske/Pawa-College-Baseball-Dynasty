import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { generateStorylineEvent, resolveVotes, pickStorylineRecruits, ARCHETYPE_DEFS } from "./storylineEngine";
import type { Archetype } from "./storylineEngine";

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

export function registerStorylineRoutes(app: Express) {

  // GET /api/leagues/:id/storylines — all storyline recruits with recruit data + latest events
  app.get("/api/leagues/:id/storylines", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const season = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

      const enriched = await Promise.all(storylines.map(async (sl) => {
        const recruit = await storage.getRecruit(sl.recruitId);
        const events = await storage.getStorylineEventsByRecruit(sl.id);
        const latestEvent = events.find(e => !e.resolvedChoice) || events[0] || null;

        let myVote: string | null = null;
        let voteCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        if (latestEvent) {
          const votes = await storage.getStorylineVotesByEvent(latestEvent.id);
          for (const v of votes) voteCounts[v.choice] = (voteCounts[v.choice] || 0) + 1;

          if (req.session.userId) {
            const coach = await storage.getCoach(req.session.userId).catch(() => undefined);
            if (coach?.teamId) {
              const myVoteRow = await storage.getStorylineVoteByTeam(latestEvent.id, coach.teamId);
              myVote = myVoteRow?.choice ?? null;
            }
          }
        }

        const archetypeDef = ARCHETYPE_DEFS[sl.archetype as Archetype];
        return {
          ...sl,
          recruit,
          archetypeName: archetypeDef?.name ?? sl.archetype,
          archetypeDescription: archetypeDef?.description ?? "",
          archetypeFlavor: archetypeDef?.flavor ?? "",
          latestEvent,
          totalEvents: events.length,
          resolvedEvents: events.filter(e => e.resolvedChoice).length,
          voteCounts,
          myVote,
        };
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[storylines] GET error:", err);
      res.status(500).json({ message: "Failed to fetch storylines" });
    }
  });

  // GET /api/leagues/:id/storylines/events — all events for the current week
  app.get("/api/leagues/:id/storylines/events", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const events = await storage.getStorylineEventsByLeague(leagueId, league.currentSeason);
      const unresolved = events.filter(e => !e.resolvedChoice);

      const enriched = await Promise.all(unresolved.map(async (event) => {
        const votes = await storage.getStorylineVotesByEvent(event.id);
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

        const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
        const recruit = sl ? await storage.getRecruit(sl.recruitId) : null;

        let myVote: string | null = null;
        if (req.session.userId) {
          try {
            const coaches = await storage.getCoachesByLeague(leagueId);
            const myCoach = coaches.find(c => c.userId === req.session.userId);
            if (myCoach?.teamId) {
              const myVoteRow = await storage.getStorylineVoteByTeam(event.id, myCoach.teamId);
              myVote = myVoteRow?.choice ?? null;
            }
          } catch {}
        }

        return { ...event, voteCounts: counts, myVote, storylineRecruit: sl, recruit };
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[storylines] GET events error:", err);
      res.status(500).json({ message: "Failed to fetch storyline events" });
    }
  });

  // GET /api/leagues/:id/storylines/:storylineId — single storyline detail
  app.get("/api/leagues/:id/storylines/:storylineId", requireAuth, async (req, res) => {
    try {
      const sl = await storage.getStorylineRecruit(req.params.storylineId);
      if (!sl) return res.status(404).json({ message: "Storyline not found" });

      const recruit = await storage.getRecruit(sl.recruitId);
      const events = await storage.getStorylineEventsByRecruit(sl.id);

      const enrichedEvents = await Promise.all(events.map(async (event) => {
        const votes = await storage.getStorylineVotesByEvent(event.id);
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

        let myVote: string | null = null;
        if (req.session.userId) {
          try {
            const coaches = await storage.getCoachesByLeague(req.params.id);
            const myCoach = coaches.find(c => c.userId === req.session.userId);
            if (myCoach?.teamId) {
              const myVoteRow = await storage.getStorylineVoteByTeam(event.id, myCoach.teamId);
              myVote = myVoteRow?.choice ?? null;
            }
          } catch {}
        }
        return { ...event, voteCounts: counts, myVote };
      }));

      const archetypeDef = ARCHETYPE_DEFS[sl.archetype as Archetype];

      res.json({
        ...sl,
        recruit,
        archetypeName: archetypeDef?.name ?? sl.archetype,
        archetypeDescription: archetypeDef?.description ?? "",
        archetypeFlavor: archetypeDef?.flavor ?? "",
        events: enrichedEvents,
      });
    } catch (err) {
      console.error("[storylines] GET single error:", err);
      res.status(500).json({ message: "Failed to fetch storyline" });
    }
  });

  // POST /api/leagues/:id/storylines/events/:eventId/vote — cast or change vote
  app.post("/api/leagues/:id/storylines/events/:eventId/vote", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const eventId = req.params.eventId;
      const { choice } = req.body;

      if (!["A", "B", "C", "D"].includes(choice)) {
        return res.status(400).json({ message: "Invalid choice. Must be A, B, C, or D" });
      }

      const event = await storage.getStorylineEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.resolvedChoice) return res.status(400).json({ message: "This event has already been resolved" });
      if (!event.choiceD && choice === "D") return res.status(400).json({ message: "Choice D is not available for this event" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const myCoach = coaches.find(c => c.userId === req.session.userId);
      if (!myCoach?.teamId) return res.status(403).json({ message: "You must be part of this league to vote" });

      const existing = await storage.getStorylineVoteByTeam(eventId, myCoach.teamId);
      if (existing) {
        await storage.updateStorylineVote(existing.id, { choice });
      } else {
        await storage.createStorylineVote({ eventId, teamId: myCoach.teamId, choice });
      }

      const votes = await storage.getStorylineVotesByEvent(eventId);
      const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
      for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

      res.json({ success: true, voteCounts: counts, myVote: choice });
    } catch (err) {
      console.error("[storylines] VOTE error:", err);
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // POST /api/leagues/:id/storylines/generate — generate new weekly events (commissioner only, or from advance)
  app.post("/api/leagues/:id/storylines/generate", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can manually trigger storyline events" });
      }

      const generated = await generateAndResolveStorylineEvents(leagueId, league.currentSeason, league.currentWeek);
      res.json({ success: true, ...generated });
    } catch (err) {
      console.error("[storylines] GENERATE error:", err);
      res.status(500).json({ message: "Failed to generate storyline events" });
    }
  });
}

// ─── Core Storyline Logic (also called from advance-week) ─────────────────────

export async function initializeStorylineRecruits(leagueId: string, season: number): Promise<number> {
  try {
    const recruits = await storage.getRecruitsByLeague(leagueId);
    if (recruits.length === 0) return 0;

    // Remove any existing storylines for this season
    await storage.deleteStorylineRecruitsByLeague(leagueId, season);

    const picks = pickStorylineRecruits(recruits.map(r => ({
      id: r.id,
      overall: r.overall ?? 250,
      starRank: r.starRank ?? 3,
      isBlueChip: r.isBlueChip,
      isGenerationalGem: r.isGenerationalGem,
      firstName: r.firstName,
      lastName: r.lastName,
      position: r.position,
    })));

    for (const pick of picks) {
      await storage.createStorylineRecruit({
        leagueId,
        recruitId: pick.recruitId,
        season,
        archetype: pick.archetype,
        tier: pick.tier,
        hiddenVars: pick.hiddenVars,
        isLegendary: pick.isLegendary,
        imagePrompt: pick.imagePrompt,
        currentArcStage: 0,
        resolvedOvrDelta: 0,
      });
    }

    // Generate first event for each storyline recruit
    await generateWeeklyStorylineEvents(leagueId, season, 1);

    return picks.length;
  } catch (err) {
    console.error("[storylines] initializeStorylineRecruits error:", err);
    return 0;
  }
}

export async function generateAndResolveStorylineEvents(
  leagueId: string,
  season: number,
  currentWeek: number,
): Promise<{ resolved: number; generated: number }> {
  let resolved = 0;
  let generated = 0;

  try {
    // 1. Resolve all unresolved events from last week
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId);
    for (const event of unresolved) {
      if (event.week >= currentWeek) continue; // Only resolve events from previous weeks

      const votes = await storage.getStorylineVotesByEvent(event.id);
      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl) continue;

      const { winningChoice, ovrDelta } = resolveVotes(
        votes,
        event.choiceAWeights as any,
        event.choiceBWeights as any,
        event.choiceCWeights as any,
        event.choiceDWeights as any,
      );

      const outcomeText = winningChoice === "A" ? event.choiceAOutcome
        : winningChoice === "B" ? event.choiceBOutcome
        : winningChoice === "C" ? event.choiceCOutcome
        : (event.choiceDOutcome ?? event.choiceCOutcome);

      await storage.updateStorylineEvent(event.id, {
        resolvedChoice: winningChoice,
        resolvedOutcomeText: outcomeText,
        ovrDelta,
        resolvedAt: new Date(),
      });

      // Apply OVR delta to the actual recruit
      if (ovrDelta !== 0) {
        const recruit = await storage.getRecruit(sl.recruitId);
        if (recruit) {
          const newOvr = Math.max(100, Math.min(720, (recruit.overall ?? 250) + ovrDelta));
          await storage.updateRecruit(recruit.id, { overall: newOvr });

          await storage.updateStorylineRecruit(sl.id, {
            resolvedOvrDelta: (sl.resolvedOvrDelta ?? 0) + ovrDelta,
            currentArcStage: sl.currentArcStage + 1,
          });

          // Create league event for the activity feed
          const signText = ovrDelta > 0 ? `+${ovrDelta}` : `${ovrDelta}`;
          await storage.createLeagueEvent({
            leagueId,
            eventType: "STORYLINE",
            description: `STORYLINE: ${recruit.firstName} ${recruit.lastName} — Choice ${winningChoice} wins. ${outcomeText} (OVR ${signText})`,
            season,
            week: currentWeek,
          });
        }
      }

      resolved++;
    }

    // 2. Generate new events for this week
    generated = await generateWeeklyStorylineEvents(leagueId, season, currentWeek);
  } catch (err) {
    console.error("[storylines] generateAndResolve error:", err);
  }

  return { resolved, generated };
}

async function generateWeeklyStorylineEvents(leagueId: string, season: number, week: number): Promise<number> {
  let count = 0;
  try {
    const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

    for (const sl of storylines) {
      // Check if this recruit already has an unresolved event this week
      const existing = await storage.getStorylineEventsByRecruit(sl.id);
      const hasActiveEvent = existing.some(e => !e.resolvedChoice);
      if (hasActiveEvent) continue;

      const recruit = await storage.getRecruit(sl.recruitId);
      if (!recruit) continue;

      const recruitName = `${recruit.firstName} ${recruit.lastName}`;
      const eventData = generateStorylineEvent(
        sl.id, leagueId, season, week,
        sl.archetype as any,
        sl.currentArcStage,
        sl.isLegendary,
        recruitName,
      );

      await storage.createStorylineEvent(eventData);
      count++;
    }
  } catch (err) {
    console.error("[storylines] generateWeeklyEvents error:", err);
  }
  return count;
}
