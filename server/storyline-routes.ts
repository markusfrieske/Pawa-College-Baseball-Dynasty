import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { generateStorylineEvent, resolveVotes, pickStorylineRecruits, ARCHETYPE_DEFS } from "./storylineEngine";
import type { Archetype } from "./storylineEngine";
import type { ChoiceWeights } from "@shared/schema";
import { getAbilitiesForPosition } from "@shared/abilities";

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

// ─── AI Image Generation (Replit OpenAI Integration — no user API key needed) ──
// Uses AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY set by Replit.
// gpt-image-1 always returns base64; stored as a data URL in imageUrl.
// Accepts optional arcStage for stage-aware prompt evolution; retries once on transient failure.
async function generateStorylineImage(
  storylineId: string,
  imagePrompt: string | null,
  arcStage?: number,
): Promise<string | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    console.warn("[storylines] Replit OpenAI integration not configured — skipping image generation");
    return null;
  }

  // Build a stage-aware prompt so the portrait evolves across the recruit's arc
  const stageDescriptors = [
    "at the start of their college baseball recruitment journey, uncertain but hopeful",
    "gaining attention from top programs, building confidence",
    "at a crossroads in their recruitment, weighing major decisions",
    "a recruit whose story has unfolded — seasoned by key choices",
    "a recruit who has fully emerged, defined by the arc of their recruitment",
  ];
  const stageDesc = stageDescriptors[Math.min(arcStage ?? 0, stageDescriptors.length - 1)];
  const basePrompt = imagePrompt
    || `A pixel-art portrait silhouette of a college baseball player ${stageDesc}, retro 8-bit style, dark forest green background, gold rim lighting, mysterious and dramatic atmosphere, no text`;

  async function attemptGenerate(prompt: string): Promise<string | null> {
    const res = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn("[storylines] gpt-image-1 error:", res.status, errText);
      return null;
    }
    const json = await res.json() as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return null;
    return `data:image/png;base64,${b64}`;
  }

  try {
    // First attempt
    let dataUrl = await attemptGenerate(basePrompt);

    // Retry once on failure with a simplified prompt (reduces moderation/timeout risk)
    if (!dataUrl) {
      console.info("[storylines] retrying image generation with simplified prompt...");
      await new Promise(r => setTimeout(r, 2000));
      dataUrl = await attemptGenerate(
        "A retro pixel-art silhouette of a college baseball player, dark background, gold lighting, 8-bit style",
      );
    }

    if (dataUrl) {
      // Persist to DB so subsequent arc-stage regenerations can be compared
      await storage.updateStorylineRecruit(storylineId, { imageUrl: dataUrl });
    }
    return dataUrl;
  } catch (err) {
    console.warn("[storylines] image generation failed:", err);
    return null;
  }
}

// Helper: resolve coach teamId for a league+user — used across multiple endpoints
async function resolveCoachTeamId(leagueId: string, userId: string): Promise<string | null> {
  try {
    const coaches = await storage.getCoachesByLeague(leagueId);
    return coaches.find(c => c.userId === userId)?.teamId ?? null;
  } catch {
    return null;
  }
}

// Helper: verify requesting user is a member of the league (has a team/coach)
async function assertLeagueMember(leagueId: string, userId: string | undefined, res: Response): Promise<boolean> {
  if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
  const teamId = await resolveCoachTeamId(leagueId, userId);
  if (!teamId) { res.status(403).json({ message: "You are not a member of this league" }); return false; }
  return true;
}

export function registerStorylineRoutes(app: Express) {

  // GET /api/leagues/:id/storylines — all storyline recruits with recruit data + latest events
  app.get("/api/leagues/:id/storylines", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Enforce league membership
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const season = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

      // Resolve current user's teamId once (not per-storyline to avoid N+1)
      const myTeamId = await resolveCoachTeamId(leagueId, req.session.userId!);

      const enriched = await Promise.all(storylines.map(async (sl) => {
        const recruit = await storage.getRecruit(sl.recruitId);
        const events = await storage.getStorylineEventsByRecruit(sl.id);
        const latestEvent = events.find(e => !e.resolvedChoice) || events[0] || null;

        let myVote: string | null = null;
        let voteCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        if (latestEvent) {
          const votes = await storage.getStorylineVotesByEvent(latestEvent.id);
          for (const v of votes) voteCounts[v.choice] = (voteCounts[v.choice] || 0) + 1;

          if (myTeamId) {
            const myVoteRow = await storage.getStorylineVoteByTeam(latestEvent.id, myTeamId);
            myVote = myVoteRow?.choice ?? null;
          }
        }

        const archetypeDef = ARCHETYPE_DEFS[sl.archetype as Archetype];

        // Resolve overlapping recruit name if linked
        let overlappingRecruitName: string | null = null;
        if (sl.overlappingRecruitId) {
          const ovlSl = await storage.getStorylineRecruit(sl.overlappingRecruitId);
          if (ovlSl) {
            const ovlR = await storage.getRecruit(ovlSl.recruitId);
            if (ovlR) overlappingRecruitName = `${ovlR.firstName} ${ovlR.lastName}`;
          }
        }

        return {
          ...sl,
          recruit,
          archetypeName: archetypeDef?.name ?? sl.archetype,
          archetypeDescription: archetypeDef?.description ?? "",
          archetypeFlavor: archetypeDef?.flavor ?? "",
          latestEvent,
          allEvents: events,
          totalEvents: events.length,
          resolvedEvents: events.filter(e => e.resolvedChoice).length,
          voteCounts,
          myVote,
          overlappingRecruitName,
        };
      }));

      res.json({ storylines: enriched });
    } catch (err) {
      console.error("[storylines] GET error:", err);
      res.status(500).json({ message: "Failed to fetch storylines" });
    }
  });

  // GET /api/leagues/:id/storylines/events — all events for the current week
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
      const leagueId = String(req.params.id);
      const sl = await storage.getStorylineRecruit(String(req.params.storylineId));
      if (!sl) return res.status(404).json({ message: "Storyline not found" });
      // Security: verify this storyline belongs to the requested league AND user is a member
      if (sl.leagueId !== leagueId) return res.status(403).json({ message: "Storyline does not belong to this league" });
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const recruit = await storage.getRecruit(sl.recruitId);
      const events = await storage.getStorylineEventsByRecruit(sl.id);

      const enrichedEvents = await Promise.all(events.map(async (event) => {
        const votes = await storage.getStorylineVotesByEvent(event.id);
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

        let myVote: string | null = null;
        if (req.session.userId) {
          try {
            const coaches = await storage.getCoachesByLeague(String(req.params.id));
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
      const leagueId = String(req.params.id);
      const eventId = String(req.params.eventId);
      const { choice } = req.body;

      if (!["A", "B", "C", "D"].includes(choice)) {
        return res.status(400).json({ message: "Invalid choice. Must be A, B, C, or D" });
      }

      const event = await storage.getStorylineEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      // Security: verify event belongs to the requested league
      if (event.leagueId !== leagueId) return res.status(403).json({ message: "Event does not belong to this league" });
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

  // POST /api/leagues/:id/storylines/:storylineId/generate-image — async AI image generation
  app.post("/api/leagues/:id/storylines/:storylineId/generate-image", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const storylineId = String(req.params.storylineId);
      const sl = await storage.getStorylineRecruit(storylineId);
      if (!sl) return res.status(404).json({ message: "Storyline not found" });
      if (sl.leagueId !== leagueId) return res.status(403).json({ message: "Storyline does not belong to this league" });
      // League membership guard: only members may trigger AI image generation (cost control)
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;
      // Note: cached image can be force-refreshed by calling this endpoint again; no short-circuit on imageUrl

      // Use Replit OpenAI integration (AI_INTEGRATIONS env vars) — no user API key needed
      const imageUrl = await generateStorylineImage(storylineId, sl.imagePrompt ?? null);
      if (imageUrl) {
        return res.json({ imageUrl, cached: false });
      }
      // Fallback: UI already handles null imageUrl with a silhouette placeholder icon
      res.json({ imageUrl: null, cached: false, fallback: true });
    } catch (err) {
      console.error("[storylines] generate-image error:", err);
      res.status(500).json({ message: "Failed to generate image" });
    }
  });

  // POST /api/leagues/:id/storylines/generate — generate new weekly events (commissioner only, or from advance)
  app.post("/api/leagues/:id/storylines/generate", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
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

    const created: import("@shared/schema").StorylineRecruit[] = [];
    for (const pick of picks) {
      const sl = await storage.createStorylineRecruit({
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
      created.push(sl);
    }

    // Link ~15% of storyline pairs (overlapping arcs)
    const shuffledCreated = [...created].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffledCreated.length - 1; i += 2) {
      if (Math.random() < 0.15) {
        await storage.updateStorylineRecruit(shuffledCreated[i].id, { overlappingRecruitId: shuffledCreated[i + 1].id });
        await storage.updateStorylineRecruit(shuffledCreated[i + 1].id, { overlappingRecruitId: shuffledCreated[i].id });
      }
    }

    // Generate first event for each storyline recruit
    await generateWeeklyStorylineEvents(leagueId, season, 1);

    // Kick off background image generation for each storyline (fire-and-forget)
    // Stage 0 = arc beginning — portrait shows recruit at the start of their journey
    for (const sl of created) {
      generateStorylineImage(sl.id, sl.imagePrompt ?? null, 0).catch(() => {});
    }

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
    // 1. Resolve all unresolved events from previous weeks
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId);
    for (const event of unresolved) {
      if (event.week >= currentWeek) continue;

      const votes = await storage.getStorylineVotesByEvent(event.id);
      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl) continue;

      const { winningChoice, ovrDelta } = resolveVotes(
        votes,
        event.choiceAWeights as ChoiceWeights,
        event.choiceBWeights as ChoiceWeights,
        event.choiceCWeights as ChoiceWeights,
        event.choiceDWeights as ChoiceWeights | null,
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

      // Always advance arc stage and post activity feed event, even if OVR delta is 0
      const recruit = await storage.getRecruit(sl.recruitId);
      if (recruit) {
        // Apply OVR delta (even 0 is fine — just no change)
        if (ovrDelta !== 0) {
          const newOvr = Math.max(100, Math.min(720, (recruit.overall ?? 250) + ovrDelta));
          await storage.updateRecruit(recruit.id, { overall: newOvr });
        }

        // Ability side effects based on arc outcome magnitude
        // Positive outcome: chance to gain a blue/gold ability from position pool
        // Negative outcome: chance to gain a red (negative) ability
        try {
          const allPositionAbilities = getAbilitiesForPosition(recruit.position ?? "P");
          const currentAbilities: string[] = (recruit.abilities as string[]) ?? [];
          const storyLocked: string[] = (recruit.storyLockedAbilities as string[]) ?? [];

          if (ovrDelta >= 15 || (ovrDelta >= 8 && Math.random() < 0.50)) {
            // Positive arc outcome: grant a new ability (gold if legendary, else blue)
            const tier = sl.isLegendary && Math.random() < 0.30 ? "gold" : "blue";
            const pool = allPositionAbilities
              .filter(a => a.tier === tier && !currentAbilities.includes(a.name))
              .sort(() => Math.random() - 0.5);
            if (pool.length > 0 && currentAbilities.length < 7) {
              const gained = pool[0].name;
              const newAbilities = [...currentAbilities, gained];
              await storage.updateRecruit(recruit.id, { abilities: newAbilities });
              if (!storyLocked.includes(gained)) {
                await storage.updateRecruit(recruit.id, { storyLockedAbilities: [...storyLocked, gained] });
              }
            }
          } else if (ovrDelta <= -15 || (ovrDelta <= -8 && Math.random() < 0.50)) {
            // Negative arc outcome: grant a red (negative) ability OR remove a blue one
            const redPool = allPositionAbilities
              .filter(a => a.tier === "red" && !currentAbilities.includes(a.name))
              .sort(() => Math.random() - 0.5);
            if (redPool.length > 0) {
              const gained = redPool[0].name;
              const newAbilities = [...currentAbilities, gained];
              await storage.updateRecruit(recruit.id, { abilities: newAbilities });
              if (!storyLocked.includes(gained)) {
                await storage.updateRecruit(recruit.id, { storyLockedAbilities: [...storyLocked, gained] });
              }
            }
          }
        } catch (abilityErr) {
          console.warn("[storylines] ability side effect error (non-critical):", abilityErr);
        }

        await storage.updateStorylineRecruit(sl.id, {
          resolvedOvrDelta: (sl.resolvedOvrDelta ?? 0) + ovrDelta,
          currentArcStage: sl.currentArcStage + 1,
        });

        // Auto-generate/refresh image on EVERY arc stage change (fire-and-forget)
        // Portrait evolves with the recruit's story — stage passed for scenario-specific prompt
        generateStorylineImage(sl.id, sl.imagePrompt ?? null, sl.currentArcStage + 1).catch(() => {});

        // Always post STORYLINE league event (activity feed)
        const ovrStr = ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta === 0 ? "±0" : `${ovrDelta}`;
        await storage.createLeagueEvent({
          leagueId,
          eventType: "STORYLINE",
          description: `STORYLINE: ${recruit.firstName} ${recruit.lastName} — Choice ${winningChoice} wins. ${outcomeText} (OVR ${ovrStr})`,
          season,
          week: currentWeek,
        });

        // Also post to dynasty news (Sully Pump as recruiting analyst journalist)
        try {
          await storage.createDynastyNews({
            leagueId,
            title: `Storyline Update: ${recruit.firstName} ${recruit.lastName}`,
            content: `Week ${currentWeek} arc resolution — Choice ${winningChoice} carried the vote.\n\n"${outcomeText}"\n\nOVR impact: ${ovrStr}`,
            category: "recruiting",
            journalist: "sully",
            authorName: "Sully Pump",
            season,
            week: currentWeek,
          });
        } catch {
          // Dynasty news creation is non-critical
        }
      }

      resolved++;
    }

    // 2. Generate 2–4 new events for this week (throttled)
    generated = await generateWeeklyStorylineEvents(leagueId, season, currentWeek);

    // 3. Simulate CPU team votes on newly generated events
    await simulateCpuVotes(leagueId);
  } catch (err) {
    console.error("[storylines] generateAndResolve error:", err);
  }

  return { resolved, generated };
}

// Throttle to 2–4 active events per week, rotating through storyline recruits
async function generateWeeklyStorylineEvents(leagueId: string, season: number, week: number): Promise<number> {
  let count = 0;
  try {
    const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

    // Only generate for recruits without an active (unresolved) event
    const eligible = await Promise.all(
      storylines.map(async (sl) => {
        const events = await storage.getStorylineEventsByRecruit(sl.id);
        const hasActive = events.some(e => !e.resolvedChoice);
        return hasActive ? null : sl;
      })
    );
    const ready = eligible.filter((sl): sl is NonNullable<typeof sl> => sl !== null);

    if (ready.length === 0) return 0;

    // Throttle: pick 2–4 recruits to generate events for (prioritize legendary)
    const maxEvents = Math.min(ready.length, 2 + Math.floor(Math.random() * 3)); // 2, 3, or 4
    const prioritized = [
      ...ready.filter(sl => sl.isLegendary),
      ...ready.filter(sl => !sl.isLegendary),
    ].slice(0, maxEvents);

    for (const sl of prioritized) {
      const recruit = await storage.getRecruit(sl.recruitId);
      if (!recruit) continue;

      const recruitName = `${recruit.firstName} ${recruit.lastName}`;

      // Resolve linked (overlapping) recruit name for narrative injection
      let linkedRecruitName: string | null = null;
      if (sl.overlappingRecruitId) {
        try {
          const linkedSl = await storage.getStorylineRecruit(sl.overlappingRecruitId);
          if (linkedSl) {
            const linkedR = await storage.getRecruit(linkedSl.recruitId);
            if (linkedR) linkedRecruitName = `${linkedR.firstName} ${linkedR.lastName}`;
          }
        } catch {}
      }

      const eventData = generateStorylineEvent(
        sl.id, leagueId, season, week,
        sl.archetype as Archetype,
        sl.currentArcStage,
        sl.isLegendary,
        recruitName,
        linkedRecruitName ?? undefined,
      );

      await storage.createStorylineEvent(eventData);
      count++;
    }
  } catch (err) {
    console.error("[storylines] generateWeeklyEvents error:", err);
  }
  return count;
}

// Compute a positivity score for a choice's weights — used for CPU weighted voting
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

// Simulate CPU team votes on all unresolved events (weighted by choice positivity)
async function simulateCpuVotes(leagueId: string): Promise<void> {
  try {
    const teams = await storage.getTeamsByLeague(leagueId);
    const cpuTeams = teams.filter(t => t.isCpu);
    if (cpuTeams.length === 0) return;

    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId);

    for (const event of unresolved) {
      // Build positivity scores for each available choice
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

        // 70% chance a CPU team votes on any given event
        if (Math.random() > 0.70) continue;

        // CPU votes weighted by choice positivity (safer choices preferred)
        const choice = weightedRandomChoice(scores);
        await storage.createStorylineVote({ eventId: event.id, teamId: team.id, choice });
      }
    }
  } catch (err) {
    console.error("[storylines] simulateCpuVotes error:", err);
  }
}
