import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { generateStorylineEvent, resolveVotes, pickStorylineRecruits, ARCHETYPE_DEFS, maybeTransitionArchetype, applyVolatilityModifier, positionToSceneGroupKey } from "./storylineEngine";
import type { Archetype } from "./storylineEngine";
import { isPitcher } from "@shared/positions";
import type { ChoiceWeights } from "@shared/schema";
import { getAbilitiesForPosition } from "@shared/abilities";

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

// Core image generation helper — builds the styled prompt, calls OpenAI with retries,
// and optionally stores the result via updateStorylineEventImageByTemplateId (global NULL-only backfill).
// Pass skipGlobalBackfill=true when the caller will handle persistence itself (e.g. league-scoped forced regen).
async function generateEventSceneImageCore(
  templateId: string,
  scenePrompt: string,
  logTag: string,
  skipGlobalBackfill = false,
): Promise<string | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    console.warn(`[storylines] OpenAI not configured — skipping ${logTag}`);
    return null;
  }

  async function attemptGenerate(prompt: string): Promise<string | null> {
    const res = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1536x1024" }),
    });
    if (!res.ok) {
      console.warn(`[storylines] ${logTag} error:`, res.status, await res.text());
      return null;
    }
    const json = await res.json() as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  }

  const styledPrompt = `High-quality modern pixel art, vivid saturated colors, diverse rich palette, no green color cast, Shovel Knight and Octopath Traveler aesthetic, cinematic dramatic lighting, no text — ${scenePrompt}`;
  const fallbackPrompt = "High-quality modern pixel art, vivid saturated colors, diverse rich palette, no green color cast, Shovel Knight and Octopath Traveler aesthetic, cinematic dramatic lighting, college baseball recruitment drama, bold pixel characters, bright stadium lights, no text";
  const delays = [1000, 2000, 4000];
  let dataUrl: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const prompt = attempt < 2 ? styledPrompt : fallbackPrompt;
      dataUrl = await attemptGenerate(prompt);
      if (dataUrl) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, delays[attempt]));
    } catch (err) {
      console.warn(`[storylines] ${logTag} attempt ${attempt + 1} threw:`, err);
      if (attempt < 2) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }

  if (dataUrl && !skipGlobalBackfill) {
    await storage.updateStorylineEventImageByTemplateId(templateId, dataUrl).catch(err =>
      console.warn(`[storylines] failed to backfill ${logTag} by templateId:`, err),
    );
  }
  return dataUrl;
}

// Generates a wide retro scene image for a specific storyline event template.
// Checks the templateId cache first to avoid re-generating the same scene.
async function generateEventSceneImage(
  eventId: string,
  templateId: string,
  scenePrompt: string,
): Promise<string | null> {
  const cached = await storage.getFirstStorylineEventImageByTemplateId(templateId).catch(() => null);
  if (cached) {
    await storage.updateStorylineEvent(eventId, { eventImageUrl: cached }).catch(err =>
      console.warn("[storylines] failed to copy cached event image:", err),
    );
    return cached;
  }
  const dataUrl = await generateEventSceneImageCore(templateId, scenePrompt, "event scene image");
  if (dataUrl) {
    await storage.updateStorylineEvent(eventId, { eventImageUrl: dataUrl }).catch(err =>
      console.warn("[storylines] failed to persist generated event image:", err),
    );
  }
  return dataUrl;
}

// Generates a fresh scene image unconditionally, bypassing the templateId cache.
// Skips the global backfill so the caller can scope persistence to its own league.
async function generateEventSceneImageForced(
  templateId: string,
  scenePrompt: string,
): Promise<string | null> {
  return generateEventSceneImageCore(templateId, scenePrompt, "forced scene image regen", true);
}

// Runs at startup to backfill scene images for any existing events that are missing them.
// Groups events by templateId, resolves the recruit's position for the first event per template,
// selects the most-specific scenePrompt variant (by position → pitcher → default), then generates
// once per unique template (with a 2-second throttle between requests) and updates all matching rows.
export async function warmupEventSceneImages(): Promise<void> {
  try {
    const eventsWithoutImages = await storage.getStorylineEventsWithMissingImages();
    if (eventsWithoutImages.length === 0) return;

    const seenTemplates = new Set<string>();
    const toProcess: Array<{ eventId: string; templateId: string; scenePrompt: string }> = [];

    for (const event of eventsWithoutImages) {
      if (!event.templateId || seenTemplates.has(event.templateId)) continue;
      seenTemplates.add(event.templateId);

      // Find the matching template definition
      let template: import("./storylineEngine").ArchetypeEventTemplate | undefined;
      for (const def of Object.values(ARCHETYPE_DEFS)) {
        const all = [...def.events, ...(def.legendaryEvents ?? [])];
        const t = all.find(e => e.id === event.templateId);
        if (t) { template = t; break; }
      }
      if (!template) continue;

      // Resolve the recruit's position so we can pick the most-specific prompt variant.
      // Chain: scenePromptByPosition[groupKey] → scenePromptPitcher → scenePrompt (default)
      let position: string | null = null;
      if (event.storylineRecruitId) {
        const sr = await storage.getStorylineRecruit(event.storylineRecruitId).catch(() => null);
        if (sr?.recruitId) {
          const recruit = await storage.getRecruit(sr.recruitId).catch(() => null);
          position = recruit?.position ?? null;
        }
      }

      const pitcherMode = Boolean(position && isPitcher(position));
      const posGroupKey = position ? positionToSceneGroupKey(position) : null;
      const scenePrompt =
        (posGroupKey && template.scenePromptByPosition?.[posGroupKey]) ||
        (pitcherMode && template.scenePromptPitcher) ||
        template.scenePrompt;

      if (scenePrompt) {
        toProcess.push({ eventId: event.id, templateId: event.templateId, scenePrompt });
      }
    }

    if (toProcess.length === 0) return;
    console.log(`[storylines] warmup: ${toProcess.length} unique template(s) need scene images`);

    for (const item of toProcess) {
      await generateEventSceneImage(item.eventId, item.templateId, item.scenePrompt).catch(err =>
        console.warn(`[storylines] warmup failed for template ${item.templateId}:`, err),
      );
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.warn("[storylines] warmupEventSceneImages error:", err);
  }
}

async function resolveCoachTeamId(leagueId: string, userId: string): Promise<string | null> {
  const coaches = await storage.getCoachesByLeague(leagueId);
  return coaches.find(c => c.userId === userId)?.teamId ?? null;
}

async function assertLeagueMember(leagueId: string, userId: string | undefined, res: Response): Promise<boolean> {
  if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
  const teamId = await resolveCoachTeamId(leagueId, userId);
  if (!teamId) { res.status(403).json({ message: "You are not a member of this league" }); return false; }
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

        return {
          ...sl,
          recruit,
          archetypeName: archetypeDef?.name ?? sl.archetype,
          archetypeDescription: archetypeDef?.description ?? "",
          archetypeFlavor: archetypeDef?.flavor ?? "",
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

  // POST /api/leagues/:id/storylines/events/:eventId/regenerate-image — commissioner-only
  // Bypasses the templateId cache and generates a fresh scene image for the given event.
  app.post("/api/leagues/:id/storylines/events/:eventId/regenerate-image", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const eventId  = String(req.params.eventId);

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can regenerate scene images" });
      }

      const event = await storage.getStorylineEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.leagueId !== leagueId) return res.status(403).json({ message: "Event does not belong to this league" });
      if (!event.templateId) return res.status(400).json({ message: "Event has no template — cannot regenerate" });

      // Resolve position-specific prompt using the same priority chain as generation
      let position: string | null = null;
      if (event.storylineRecruitId) {
        const sr = await storage.getStorylineRecruit(event.storylineRecruitId).catch(() => null);
        if (sr?.recruitId) {
          const recruit = await storage.getRecruit(sr.recruitId).catch(() => null);
          position = recruit?.position ?? null;
        }
      }

      let template: import("./storylineEngine").ArchetypeEventTemplate | undefined;
      for (const def of Object.values(ARCHETYPE_DEFS)) {
        const all = [...def.events, ...(def.legendaryEvents ?? [])];
        const t = all.find(e => e.id === event.templateId);
        if (t) { template = t; break; }
      }
      if (!template) return res.status(400).json({ message: "Template not found in definitions" });

      const pitcherMode = Boolean(position && isPitcher(position));
      const posGroupKey = position ? positionToSceneGroupKey(position) : null;
      const scenePrompt =
        (posGroupKey && template.scenePromptByPosition?.[posGroupKey]) ||
        (pitcherMode && template.scenePromptPitcher) ||
        template.scenePrompt;

      if (!scenePrompt) return res.status(400).json({ message: "No scene prompt available for this template" });

      // Generate first — existing images are untouched until we have a successful result.
      const newImageUrl = await generateEventSceneImageForced(event.templateId, scenePrompt);
      if (!newImageUrl) {
        return res.status(500).json({ message: "Image generation failed — check OpenAI configuration" });
      }

      // Overwrite all events in THIS league sharing the templateId (league-scoped; no cross-league side effects).
      await storage.setStorylineEventImageByLeagueAndTemplate(leagueId, event.templateId, newImageUrl);

      res.json({ eventImageUrl: newImageUrl });
    } catch (err) {
      console.error("[storylines] regenerate-image error:", err);
      res.status(500).json({ message: "Failed to regenerate scene image" });
    }
  });

  // POST /api/leagues/:id/storylines/generate — commissioner-only manual trigger
  app.post("/api/leagues/:id/storylines/generate", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can manually trigger storyline events" });
      }

      const unresolvedEvents = await storage.getUnresolvedStorylineEvents(leagueId, league.currentSeason);
      if (unresolvedEvents.length >= 10) {
        return res.status(409).json({
          message: "Weekly event cap reached (10 active events). Advance the week or resolve pending events before generating more.",
          unresolvedCount: unresolvedEvents.length,
        });
      }

      const generated = await generateAndResolveStorylineEvents(leagueId, league.currentSeason, league.currentWeek);
      res.json({ success: true, ...generated });
    } catch (err) {
      console.error("[storylines] GENERATE error:", err);
      res.status(500).json({ message: "Failed to generate storyline events" });
    }
  });
}

// ─── Core Storyline Logic ──────────────────────────────────────────────────────

export async function initializeStorylineRecruits(leagueId: string, season: number, force = false): Promise<number> {
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
    for (const pick of picks) {
      const sl = await storage.createStorylineRecruit({
        leagueId,
        recruitId: pick.recruitId,
        season,
        archetype: pick.archetype,
        tier: pick.tier,
        hiddenVars: pick.hiddenVars,
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

    await generateWeeklyStorylineEvents(leagueId, season, 1);

    return picks.length;
  } catch (err) {
    console.error("[storylines] initializeStorylineRecruits error:", err);
    return 0;
  }
}

// Resolve-only sweep: settles all pending unresolved storyline events without generating new ones.
// Used at phase boundaries (e.g. offseason_recruiting_4 → signing_day) to clear the slate cleanly.
export async function resolveAllPendingStorylineEvents(
  leagueId: string,
  season: number,
  currentWeek: number,
): Promise<number> {
  let resolved = 0;
  try {
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    for (const event of unresolved) {
      const votes = await storage.getStorylineVotesByEvent(event.id);
      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl) continue;

      const { winningChoice, ovrDelta: rawDelta } = resolveVotes(
        votes,
        event.choiceAWeights as ChoiceWeights,
        event.choiceBWeights as ChoiceWeights,
        event.choiceCWeights as ChoiceWeights,
        event.choiceDWeights as ChoiceWeights | null,
      );

      const volatility = (sl.hiddenVars as { volatility?: number })?.volatility ?? 5;
      const ovrDelta = applyVolatilityModifier(rawDelta, volatility);

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

      const recruit = await storage.getRecruit(sl.recruitId);
      if (recruit && ovrDelta !== 0) {
        const newOvr = Math.max(100, Math.min(720, (recruit.overall ?? 250) + ovrDelta));
        await storage.updateRecruit(recruit.id, { overall: newOvr });
      }

      const newCumulativeDelta = (sl.resolvedOvrDelta ?? 0) + ovrDelta;
      const newArcStage = sl.currentArcStage + 1;
      await storage.updateStorylineRecruit(sl.id, {
        resolvedOvrDelta: newCumulativeDelta,
        currentArcStage: newArcStage,
      });

      resolved++;
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
): Promise<{ resolved: number; generated: number }> {
  let resolved = 0;
  let generated = 0;

  try {
    // Season-scoped: only resolve events from the current season to prevent cross-season bleed
    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    for (const event of unresolved) {
      if (event.week >= currentWeek) continue;

      const votes = await storage.getStorylineVotesByEvent(event.id);
      const sl = await storage.getStorylineRecruit(event.storylineRecruitId);
      if (!sl) continue;

      const { winningChoice, ovrDelta: rawDelta } = resolveVotes(
        votes,
        event.choiceAWeights as ChoiceWeights,
        event.choiceBWeights as ChoiceWeights,
        event.choiceCWeights as ChoiceWeights,
        event.choiceDWeights as ChoiceWeights | null,
      );

      // Apply recruit's volatility hidden variable to amplify/dampen the OVR swing
      const volatility = (sl.hiddenVars as { volatility?: number })?.volatility ?? 5;
      const ovrDelta = applyVolatilityModifier(rawDelta, volatility);

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

      const recruit = await storage.getRecruit(sl.recruitId);
      if (recruit) {
        if (ovrDelta !== 0) {
          const newOvr = Math.max(100, Math.min(720, (recruit.overall ?? 250) + ovrDelta));
          await storage.updateRecruit(recruit.id, { overall: newOvr });
        }

        try {
          const allPositionAbilities = getAbilitiesForPosition(recruit.position ?? "P");
          const currentAbilities: string[] = (recruit.abilities as string[]) ?? [];
          const storyLocked: string[] = (recruit.storyLockedAbilities as string[]) ?? [];

          if (ovrDelta >= 15 || (ovrDelta >= 8 && Math.random() < 0.50)) {
            const tier = sl.isLegendary && Math.random() < 0.30 ? "gold" : "blue";
            const pool = allPositionAbilities
              .filter(a => a.tier === tier && !currentAbilities.includes(a.name))
              .sort(() => Math.random() - 0.5);
            if (pool.length > 0 && currentAbilities.length < 7) {
              const gained = pool[0].name;
              await storage.updateRecruit(recruit.id, { abilities: [...currentAbilities, gained] });
              if (!storyLocked.includes(gained)) {
                await storage.updateRecruit(recruit.id, { storyLockedAbilities: [...storyLocked, gained] });
              }
            }
          } else if (ovrDelta <= -15 || (ovrDelta <= -8 && Math.random() < 0.50)) {
            const removable = allPositionAbilities
              .filter(a => (a.tier === "blue" || a.tier === "gold") && currentAbilities.includes(a.name) && storyLocked.includes(a.name))
              .sort(() => Math.random() - 0.5);

            let updated = [...currentAbilities];
            if (removable.length > 0) {
              const toRemove = removable[0].name;
              updated = updated.filter(a => a !== toRemove);
              await storage.updateRecruit(recruit.id, {
                abilities: updated,
                storyLockedAbilities: storyLocked.filter(a => a !== toRemove),
              });
            }

            const redPool = allPositionAbilities
              .filter(a => a.tier === "red" && !updated.includes(a.name))
              .sort(() => Math.random() - 0.5);
            if (redPool.length > 0 && updated.length < 7) {
              const gained = redPool[0].name;
              await storage.updateRecruit(recruit.id, { abilities: [...updated, gained] });
              const latestLocked = (await storage.getRecruit(recruit.id))?.storyLockedAbilities as string[] ?? storyLocked;
              if (!latestLocked.includes(gained)) {
                await storage.updateRecruit(recruit.id, { storyLockedAbilities: [...latestLocked, gained] });
              }
            }
          }
        } catch (abilityErr) {
          console.warn("[storylines] ability side effect error:", abilityErr);
        }

        const newCumulativeDelta = (sl.resolvedOvrDelta ?? 0) + ovrDelta;
        const newArcStage = sl.currentArcStage + 1;
        const transitionedArchetype = maybeTransitionArchetype(
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
        await storage.createLeagueEvent({
          leagueId,
          eventType: "STORYLINE",
          description: `STORYLINE: ${recruit.firstName} ${recruit.lastName} — Choice ${winningChoice} wins. ${outcomeText} (OVR ${ovrStr})`,
          season,
          week: currentWeek,
        });

        storage.createDynastyNews({
          leagueId,
          title: `Storyline Update: ${recruit.firstName} ${recruit.lastName}`,
          content: `Week ${currentWeek} arc resolution — Choice ${winningChoice} carried the vote.\n\n"${outcomeText}"\n\nOVR impact: ${ovrStr}`,
          category: "recruiting",
          journalist: "sully",
          authorName: "Sully Pump",
          season,
          week: currentWeek,
        }).catch(err => console.warn("[storylines] dynasty news creation failed:", err));
      }

      resolved++;
    }

    generated = await generateWeeklyStorylineEvents(leagueId, season, currentWeek);
    await simulateCpuVotes(leagueId);
  } catch (err) {
    console.error("[storylines] generateAndResolve error:", err);
  }

  return { resolved, generated };
}

async function generateWeeklyStorylineEvents(leagueId: string, season: number, week: number): Promise<number> {
  let count = 0;
  try {
    const storylines = await storage.getStorylineRecruitsByLeague(leagueId, season);

    const eligible = await Promise.all(
      storylines.map(async (sl) => {
        const events = await storage.getStorylineEventsByRecruit(sl.id);
        // Scope the pending-event check to the current season so resolved events from
        // a prior season don't permanently block new event generation for this recruit.
        const currentSeasonEvents = events.filter(e => e.season === season);
        return currentSeasonEvents.some(e => !e.resolvedChoice) ? null : sl;
      })
    );
    const ready = eligible.filter((sl): sl is NonNullable<typeof sl> => sl !== null);
    if (ready.length === 0) return 0;

    // Filter to non-exhausted recruits FIRST so maxEvents reflects actual capacity
    // and the weekly floor is computed from recruits we can actually generate for.
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

    // When every recruit has exhausted their templates, reset usedTemplateIds for all
    // so the arcs can loop and continue rather than permanently stalling.
    if (nonExhausted.length === 0) {
      console.log(`[storylines] all ready recruits exhausted — resetting usedTemplateIds to allow arc continuation`);
      for (const sl of ready) {
        await storage.updateStorylineRecruit(sl.id, { usedTemplateIds: [] });
        sl.usedTemplateIds = [];
      }
      nonExhausted = ready;
    }

    // Build per-recruit unresolved map so we can enforce a per-recruit cap of 1
    // (no recruit gets a second event until their first one is resolved).
    const currentUnresolved = await storage.getUnresolvedStorylineEvents(leagueId, season);
    const unresolvedByRecruit = new Set(currentUnresolved.map(e => e.storylineRecruitId));

    // Apply per-recruit cap: skip any recruit that already has an unresolved event.
    const cappedNonExhausted = nonExhausted.filter(sl => !unresolvedByRecruit.has(sl.id));

    // Enforce absolute cap of 10 total unresolved events.
    const unresolvedCount = currentUnresolved.length;
    const slotsRemaining = Math.max(0, 10 - unresolvedCount);
    if (slotsRemaining === 0) {
      console.log(`[storylines] 10 unresolved events already — skipping generation this week`);
      return 0;
    }
    if (unresolvedCount > 0) {
      console.log(`[storylines] ${unresolvedCount} unresolved events — ${slotsRemaining} slot(s) remaining`);
    }

    if (cappedNonExhausted.length === 0) {
      console.log(`[storylines] all non-exhausted recruits already have an active event — skipping`);
      return 0;
    }

    // Target 2–3 events per week; floor at min(2, slotsRemaining) so available
    // capacity is always used. Hard cap ensures total unresolved never exceeds 10.
    const targetEvents = Math.max(Math.min(2, slotsRemaining), 2 + Math.floor(Math.random() * 2));
    const maxEvents = Math.min(cappedNonExhausted.length, slotsRemaining, targetEvents);

    // Legendary-first, non-legendary shuffled so all 10 recruits rotate fairly
    const prioritized = [
      ...cappedNonExhausted.filter(sl => sl.isLegendary),
      ...cappedNonExhausted.filter(sl => !sl.isLegendary).sort(() => Math.random() - 0.5),
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

      const eventData = generateStorylineEvent(
        sl.id, leagueId, season, week,
        sl.archetype as Archetype,
        sl.currentArcStage,
        sl.isLegendary,
        recruitName,
        linkedRecruitName,
        recruit.position ?? undefined,
        (sl.usedTemplateIds as string[] | null) ?? [],
      );

      const { scenePrompt: _scenePrompt, ...insertableEventData } = eventData;
      const createdEvent = await storage.createStorylineEvent({ ...insertableEventData, archetypeAtEvent: sl.archetype });
      count++;

      // Track which template was used so we don't repeat it for this recruit this season.
      // Use Set semantics to deduplicate against retries or concurrency races.
      if (eventData.templateId) {
        const currentUsed = (sl.usedTemplateIds as string[] | null) ?? [];
        const dedupedUsed = Array.from(new Set([...currentUsed, eventData.templateId]));
        await storage.updateStorylineRecruit(sl.id, { usedTemplateIds: dedupedUsed });
      }

      if (eventData.templateId && eventData.scenePrompt) {
        const evId = createdEvent.id;
        const templateId = eventData.templateId;
        const scenePrompt = eventData.scenePrompt;
        generateEventSceneImage(evId, templateId, scenePrompt).catch(err =>
          console.warn("[storylines] async event image gen failed:", err),
        );
      }
    }

    // Schedule a 30-second delayed backfill to catch any events whose images
    // failed due to rate limits or transient OpenAI errors during generation.
    if (count > 0) {
      setTimeout(() => {
        warmupEventSceneImages().catch(err =>
          console.warn("[storylines] delayed image backfill failed:", err),
        );
      }, 30_000);
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
