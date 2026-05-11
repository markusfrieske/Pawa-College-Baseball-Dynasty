import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { generateStorylineEvent, resolveVotes, pickStorylineRecruits, ARCHETYPE_DEFS, maybeTransitionArchetype } from "./storylineEngine";
import type { Archetype } from "./storylineEngine";
import type { ChoiceWeights } from "@shared/schema";
import { getAbilitiesForPosition } from "@shared/abilities";

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
  next();
}

// AI image generation via Replit OpenAI integration (gpt-image-1, base64 response stored as data URL).
// arcStage drives stage-specific prompt phrasing; retries once with a simplified prompt on failure.
async function generateStorylineImage(
  storylineId: string,
  imagePrompt: string | null,
  arcStage?: number,
): Promise<string | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    console.warn("[storylines] OpenAI integration not configured — skipping image generation");
    return null;
  }

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
      console.warn("[storylines] gpt-image-1 error:", res.status, await res.text());
      return null;
    }
    const json = await res.json() as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  }

  try {
    let dataUrl = await attemptGenerate(basePrompt);
    if (!dataUrl) {
      await new Promise(r => setTimeout(r, 2000));
      dataUrl = await attemptGenerate(
        "A retro pixel-art silhouette of a college baseball player, dark background, gold lighting, 8-bit style",
      );
    }
    if (dataUrl) await storage.updateStorylineRecruit(storylineId, { imageUrl: dataUrl });
    return dataUrl;
  } catch (err) {
    console.warn("[storylines] image generation failed:", err);
    return null;
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

  // POST /api/leagues/:id/storylines/:storylineId/vote
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

  // POST /api/leagues/:id/storylines/:storylineId/generate-image
  app.post("/api/leagues/:id/storylines/:storylineId/generate-image", requireAuth, async (req, res) => {
    try {
      const leagueId = String(req.params.id);
      if (!await assertLeagueMember(leagueId, req.session.userId, res)) return;

      const sl = await storage.getStorylineRecruit(String(req.params.storylineId));
      if (!sl || sl.leagueId !== leagueId) return res.status(404).json({ message: "Storyline not found" });

      // Fire async — don't block the response
      generateStorylineImage(sl.id, sl.imagePrompt ?? null, sl.currentArcStage).catch(err =>
        console.warn("[storylines] background image gen failed:", err),
      );

      res.json({ success: true, message: "Image generation started" });
    } catch (err) {
      console.error("[storylines] generate-image error:", err);
      res.status(500).json({ message: "Failed to generate image" });
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

      const unresolvedEvents = await storage.getUnresolvedStorylineEvents(leagueId);
      if (unresolvedEvents.length >= 4) {
        return res.status(409).json({
          message: "Weekly event cap reached (4 active events). Advance the week or resolve pending events before generating more.",
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

export async function initializeStorylineRecruits(leagueId: string, season: number): Promise<number> {
  try {
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
        imagePrompt: pick.imagePrompt,
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

    for (const sl of created) {
      generateStorylineImage(sl.id, sl.imagePrompt ?? null, 0).catch(err =>
        console.warn("[storylines] initial image gen failed for", sl.id, err),
      );
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
        );

        await storage.updateStorylineRecruit(sl.id, {
          resolvedOvrDelta: newCumulativeDelta,
          currentArcStage: newArcStage,
          ...(transitionedArchetype !== sl.archetype ? { archetype: transitionedArchetype } : {}),
        });

        generateStorylineImage(sl.id, sl.imagePrompt ?? null, sl.currentArcStage + 1).catch(err =>
          console.warn("[storylines] arc stage image gen failed:", err),
        );

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
        return events.some(e => !e.resolvedChoice) ? null : sl;
      })
    );
    const ready = eligible.filter((sl): sl is NonNullable<typeof sl> => sl !== null);
    if (ready.length === 0) return 0;

    // Enforce 4-event weekly ceiling across all triggers
    const currentUnresolved = await storage.getUnresolvedStorylineEvents(leagueId);
    const remainingSlots = Math.max(0, 4 - currentUnresolved.length);
    if (remainingSlots === 0) return 0;

    // Legendary-first, non-legendary shuffled so all 10 recruits rotate fairly
    const maxEvents = Math.min(ready.length, remainingSlots, 2 + Math.floor(Math.random() * 3));
    const prioritized = [
      ...ready.filter(sl => sl.isLegendary),
      ...ready.filter(sl => !sl.isLegendary).sort(() => Math.random() - 0.5),
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
      );

      await storage.createStorylineEvent({ ...eventData, archetypeAtEvent: sl.archetype });
      count++;
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

    const unresolved = await storage.getUnresolvedStorylineEvents(leagueId);

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
