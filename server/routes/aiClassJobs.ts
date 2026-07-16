/**
 * AI class job endpoints (Task 1367).
 *
 * POST /api/class-projects/:projectId/ai-jobs       — create + process job
 * GET  /api/class-projects/:projectId/ai-jobs/:jobId — poll status
 * POST /api/class-projects/:projectId/ai-jobs/:jobId/accept — accept into draft
 * DELETE /api/class-projects/:projectId/ai-jobs/:jobId       — soft-discard (audit preserved)
 * GET  /api/class-projects/:projectId/ai-quota               — quota remaining
 */

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import type { InsertAiClassJob } from "@shared/schema";

const aiGenRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "AI generation rate limit reached. Please try again later." },
});

const RATE_LIMIT = parseInt(process.env.AI_CLASS_JOBS_RATE_LIMIT_PER_HOUR ?? "10", 10);

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ─── Procedural fallbacks (used when AI is unavailable) ──────────────────────

const THEME_NAMES = [
  "The Proving Ground", "Unfinished Business", "Rising Tide", "The Long Haul",
  "Diamond in the Rough", "Fire Season", "The Next Wave", "Built Different",
  "Second Wind", "Cornerstone", "The Big Stage", "Full Circle",
];
const THEME_DESCS = [
  "A class defined by grit and competition from day one.",
  "Players with something to prove, driving the team forward.",
  "Momentum is building—this class will change the culture.",
  "Depth and development over raw star power.",
  "Hidden talent lurks beneath modest rankings.",
  "High-intensity personalities who perform under pressure.",
  "Young talent reshaping the program's identity.",
  "Physically and mentally built for the grind of college baseball.",
];

function proceduralThemeDraft(prompt: string) {
  const idx = (prompt.length + prompt.charCodeAt(0)) % THEME_NAMES.length;
  return {
    themeName: THEME_NAMES[idx],
    description: THEME_DESCS[idx % THEME_DESCS.length],
    suggestedTags: ["depth", "development", "culture"],
    suggestedPositionBias: "balanced",
    aiAssisted: false,
  };
}

const ROLE_LABELS = [
  "The Franchise Arm", "The Gap-Closer", "The Glue Guy", "The Dark Horse",
  "The Comeback Kid", "The Silent Ace", "The Floor Raiser", "The Wildcard",
  "The Captain's Shadow", "The Late Bloomer",
];
const ARC_FAMILIES = ["redemption", "emergence", "rivalry", "injury", "breakthrough"] as const;

function proceduralCastProposal(cast: string[]) {
  const roles = cast.slice(0, 10).map((id, i) => ({
    templateRecruitId: id,
    storySlot: `slot_${i + 1}`,
    roleLabel: ROLE_LABELS[i % ROLE_LABELS.length],
    rationale: "Procedurally assigned based on roster balance.",
    suggestedArcFamily: ARC_FAMILIES[i % ARC_FAMILIES.length],
  }));
  return { roles, aiAssisted: false };
}

function proceduralArcDraft(recruitName: string) {
  return {
    chapters: [
      {
        title: "First Impression",
        eventText: `${recruitName} arrives on campus with something to prove.`,
        choices: [
          {
            label: "Push hard early",
            outcomeText: "Strong start builds confidence but risks fatigue.",
            effectPreset: "confidence_minor_gain",
          },
          {
            label: "Take it slow",
            outcomeText: "Patient approach steadies development.",
            effectPreset: "none",
          },
        ],
      },
      {
        title: "The Crucible",
        eventText: `A tough stretch tests ${recruitName}'s resolve.`,
        choices: [
          {
            label: "Fight through it",
            outcomeText: "Resilience earns respect from teammates.",
            effectPreset: "confidence_major_gain",
          },
          {
            label: "Seek coaching",
            outcomeText: "Technical fix unlocks a new gear.",
            effectPreset: "skill_minor_gain",
          },
        ],
      },
      {
        title: "Defining Moment",
        eventText: `${recruitName} faces a pivotal crossroads.`,
        choices: [
          {
            label: "Step up",
            outcomeText: "Memorable performance cements legacy.",
            effectPreset: "performance_major_gain",
          },
          {
            label: "Play it safe",
            outcomeText: "Steady, reliable output keeps the team afloat.",
            effectPreset: "none",
          },
        ],
      },
    ],
    aiAssisted: false,
  };
}

function proceduralTextRewrite(text: string) {
  return { rewrittenText: text, aiAssisted: false };
}

// ─── AI handlers ─────────────────────────────────────────────────────────────

async function runThemeDraft(prompt: string): Promise<Record<string, unknown>> {
  const client = getOpenAI();
  if (!client) return proceduralThemeDraft(prompt);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "theme_draft",
          strict: true,
          schema: {
            type: "object",
            properties: {
              themeName: { type: "string", description: "Class theme name, max 40 chars" },
              description: { type: "string", description: "Class theme description, max 200 chars" },
              suggestedTags: {
                type: "array",
                items: { type: "string" },
                description: "2-4 tags from: power, speed, pitching, defense, depth, development, culture, upside, grit"
              },
              suggestedPositionBias: {
                type: "string",
                enum: ["balanced", "pitching_heavy", "hitting_heavy", "speed_heavy", "power_heavy"]
              },
            },
            required: ["themeName", "description", "suggestedTags", "suggestedPositionBias"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You are a creative director for a college baseball dynasty simulator. Draft a class theme from the coach's prompt. Be creative and evocative with the theme name.`,
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 256,
    });
    const raw = JSON.parse(response.choices[0].message.content ?? "{}");
    return { ...raw, aiAssisted: true };
  } catch {
    return proceduralThemeDraft(prompt);
  }
}

interface CastCandidate {
  templateRecruitId: string;
  name: string;
  position: string;
  starRating: number;
  overall: number;
}

async function runCastProposal(prompt: string, cast: string[], candidates: CastCandidate[]): Promise<Record<string, unknown>> {
  const client = getOpenAI();
  if (!client) return proceduralCastProposal(cast.length > 0 ? cast : candidates.map(c => c.templateRecruitId));
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cast_proposal",
          strict: true,
          schema: {
            type: "object",
            properties: {
              roles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    templateRecruitId: { type: "string" },
                    storySlot: { type: "string" },
                    roleLabel: { type: "string", description: "Max 30 chars" },
                    rationale: { type: "string", description: "Max 100 chars" },
                    suggestedArcFamily: {
                      type: "string",
                      enum: ["redemption", "emergence", "rivalry", "injury", "breakthrough", "mentor", "underdog", "comeback"]
                    },
                  },
                  required: ["templateRecruitId", "storySlot", "roleLabel", "rationale", "suggestedArcFamily"],
                  additionalProperties: false,
                },
              },
            },
            required: ["roles"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You are a sports storytelling director for a college baseball dynasty simulator. Given a roster of recruits with their details and a coach's creative direction, propose up to 10 story role concepts drawn from the candidate pool. Each role must reference a real templateRecruitId from the list. Be creative and varied — draw on position, star rating, and name to craft distinctive roles.`,
        },
        {
          role: "user",
          content: `Recruit candidates:\n${JSON.stringify(candidates.slice(0, 20), null, 2)}\n\nDirector's note: ${prompt}`,
        },
      ],
      max_tokens: 512,
    });
    const raw = JSON.parse(response.choices[0].message.content ?? "{}");
    return { ...raw, aiAssisted: true };
  } catch {
    return proceduralCastProposal(cast);
  }
}

async function runArcDraft(prompt: string, recruitName: string): Promise<Record<string, unknown>> {
  const client = getOpenAI();
  if (!client) return proceduralArcDraft(recruitName);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "arc_draft",
          strict: true,
          schema: {
            type: "object",
            properties: {
              chapters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Chapter title, max 40 chars" },
                    eventText: { type: "string", description: "Narrative event text, max 200 chars" },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string", description: "Choice label, max 30 chars" },
                          outcomeText: { type: "string", description: "Outcome description, max 150 chars" },
                          effectPreset: {
                            type: "string",
                            enum: ["confidence_minor_gain", "confidence_major_gain", "skill_minor_gain", "skill_major_gain", "performance_minor_gain", "performance_major_gain", "none"]
                          },
                        },
                        required: ["label", "outcomeText", "effectPreset"],
                        additionalProperties: false,
                      },
                      minItems: 2,
                      maxItems: 2,
                    },
                  },
                  required: ["title", "eventText", "choices"],
                  additionalProperties: false,
                },
              },
            },
            required: ["chapters"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You are a narrative designer for a college baseball dynasty simulator. Draft a 3-chapter story arc for a recruit. Each chapter has exactly 2 choices. Chapters must escalate in narrative stakes. Keep language punchy and evocative.`,
        },
        {
          role: "user",
          content: `Recruit name: ${recruitName}\n\nCoach's arc direction: ${prompt}`,
        },
      ],
      max_tokens: 768,
    });
    const raw = JSON.parse(response.choices[0].message.content ?? "{}");
    return { ...raw, aiAssisted: true };
  } catch {
    return proceduralArcDraft(recruitName);
  }
}

async function runTextRewrite(prompt: string, originalText: string): Promise<Record<string, unknown>> {
  const client = getOpenAI();
  if (!client) return proceduralTextRewrite(originalText);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "text_rewrite",
          strict: true,
          schema: {
            type: "object",
            properties: {
              rewrittenText: { type: "string", description: "The rewritten text, same meaning, tone adjusted" },
            },
            required: ["rewrittenText"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You are an editor for a college baseball dynasty simulator. Rewrite the provided text according to the coach's tone direction. Keep the same meaning and roughly the same length. Preserve key facts.`,
        },
        {
          role: "user",
          content: `Original text: "${originalText}"\n\nTone direction: ${prompt}`,
        },
      ],
      max_tokens: 256,
    });
    const raw = JSON.parse(response.choices[0].message.content ?? "{}");
    return { ...raw, aiAssisted: true };
  } catch {
    return proceduralTextRewrite(originalText);
  }
}

async function dispatchJob(
  jobType: string,
  prompt: string,
  metadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (jobType) {
    case "theme_draft":
      return runThemeDraft(prompt);
    case "cast_proposal": {
      const castIds = (metadata.cast as string[]) ?? [];
      const candidates = Array.isArray(metadata.candidates) ? (metadata.candidates as CastCandidate[]) : castIds.map(id => ({ templateRecruitId: id, name: id, position: "?", starRating: 3, overall: 300 }));
      return runCastProposal(prompt, castIds, candidates);
    }
    case "arc_draft":
      return runArcDraft(prompt, (metadata.recruitName as string) ?? "The Recruit");
    case "text_rewrite":
      return runTextRewrite(prompt, (metadata.originalText as string) ?? "");
    default:
      return { error: "Unknown job type" };
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerAiClassJobRoutes(app: Express): void {

  // POST /api/class-projects/bootstrap — create an ephemeral draft project and return its id.
  // Used by the wizard to acquire a projectId when none was provided at launch.
  app.post("/api/class-projects/bootstrap", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const project = await storage.createRecruitingClassProject({
        ownerUserId: userId,
        name: "Wizard Draft",
        status: "draft",
        currentDraftRevision: 0,
      });
      return res.json({ projectId: project.id });
    } catch (err) {
      console.error("[bootstrap]", err);
      return res.status(500).json({ error: "Failed to bootstrap project" });
    }
  });

  // POST /api/class-projects/:projectId/ai-jobs — create + process job synchronously
  app.post("/api/class-projects/:projectId/ai-jobs", requireAuth, aiGenRateLimit, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const projectId = req.params.projectId as string;
      const { jobType, prompt, metadata = {} } = req.body as {
        jobType: string;
        prompt: string;
        metadata?: Record<string, unknown>;
      };

      if (!jobType) return res.status(400).json({ error: "jobType required" });
      if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt required" });
      if (prompt.length > 1000) return res.status(400).json({ error: "prompt too long (max 1000 chars)" });

      const validJobTypes = ["theme_draft", "cast_proposal", "arc_draft", "text_rewrite"];
      if (!validJobTypes.includes(jobType)) return res.status(400).json({ error: "invalid jobType" });

      // Verify project ownership
      const project = await storage.getRecruitingClassProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.ownerUserId !== userId) return res.status(403).json({ error: "Forbidden" });

      // Rate limit check (only count non-rejected jobs)
      const usedCount = await storage.countAiClassJobsInHour(userId);
      if (usedCount >= RATE_LIMIT) {
        return res.status(429).json({
          error: `Rate limit reached: ${RATE_LIMIT} AI jobs per hour`,
          usedCount,
          limit: RATE_LIMIT,
        });
      }

      // Create job record in 'running' state
      const jobData: InsertAiClassJob = {
        projectId,
        userId,
        jobType,
        prompt,
        modelIdentifier: "gpt-4o-mini",
        schemaVersion: 1,
        status: "running",
      };
      const job = await storage.createAiClassJob(jobData);

      // Dispatch AI/procedural handler
      let responseJson: Record<string, unknown>;
      let finalStatus = "complete";
      try {
        responseJson = await dispatchJob(jobType, prompt, metadata as Record<string, unknown>);
      } catch (err) {
        finalStatus = "failed";
        responseJson = { error: "Dispatch failed", fallback: true };
      }

      // Determine if this is a procedural fallback (AI unavailable or call failed)
      const isFallback = finalStatus === "failed" || responseJson.aiAssisted === false;
      let fallbackJson: Record<string, unknown> | undefined;

      // Per spec: jobs that used fallback stay as "failed" (AI call did not succeed),
      // but we store the procedural fallback payload so the UI can display it.
      // Only pure AI success → "complete".
      if (isFallback) {
        fallbackJson = responseJson;
        finalStatus = "failed"; // keep as failed — AI call was not successful
      }

      const updated = await storage.updateAiClassJob(job.id, {
        status: finalStatus,
        responseJson: isFallback ? undefined : responseJson, // only store AI response when real
        fallbackJson: isFallback ? fallbackJson : undefined,
      });

      res.json({
        job: updated,
        quotaUsed: usedCount + 1,
        quotaLimit: RATE_LIMIT,
        quotaRemaining: Math.max(0, RATE_LIMIT - usedCount - 1),
      });
    } catch (err) {
      console.error("[ai-class-jobs] POST error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/class-projects/:projectId/ai-jobs/:jobId — poll status
  app.get("/api/class-projects/:projectId/ai-jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const jobId = req.params.jobId as string;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/class-projects/:projectId/ai-jobs/:jobId/accept
  // Marks the job as accepted and merges validated AI content into the project draft.
  app.post("/api/class-projects/:projectId/ai-jobs/:jobId/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const projectId = req.params.projectId as string;
      const jobId = req.params.jobId as string;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (job.projectId !== projectId) return res.status(403).json({ error: "Forbidden" });
      if (job.acceptedAt) return res.status(409).json({ error: "Already accepted" });

      // Mark job as accepted (audit trail)
      const updated = await storage.updateAiClassJob(jobId, { acceptedAt: new Date() });

      // Merge validated AI content into project classData draft
      // Use responseJson for real AI output; fall back to fallbackJson for procedural suggestions
      const project = await storage.getRecruitingClassProject(projectId);
      const mergedContent = (job.responseJson ?? job.fallbackJson) as Record<string, unknown> | null;
      if (project && mergedContent) {
        const existingData = (project.classData as Record<string, unknown>) ?? {};
        const aiContent = mergedContent;
        const patch: Record<string, unknown> = { ai_assisted: true };

        // Allowlist of validated effectPreset values the AI is permitted to emit.
        // Any unknown value is clamped to "none" — never trust AI deltas blindly.
        const VALID_EFFECT_PRESETS = new Set([
          "confidence_minor_gain", "confidence_major_gain",
          "skill_minor_gain", "skill_major_gain",
          "performance_minor_gain", "performance_major_gain",
          "none",
        ]);

        function sanitizeChapter(ch: unknown): Record<string, unknown> | null {
          if (!ch || typeof ch !== "object") return null;
          const c = ch as Record<string, unknown>;
          const preset =
            typeof c.effectPreset === "string" && VALID_EFFECT_PRESETS.has(c.effectPreset)
              ? c.effectPreset
              : "none";
          return {
            label: typeof c.label === "string" ? c.label.slice(0, 200) : "",
            outcomeText: typeof c.outcomeText === "string" ? c.outcomeText.slice(0, 1000) : "",
            effectPreset: preset,
          };
        }

        // Apply content by job type — only merge safe known fields
        if (job.jobType === "theme_draft") {
          if (aiContent.themeName) patch.themeName = aiContent.themeName;
          if (aiContent.description) patch.description = aiContent.description;
          if (Array.isArray(aiContent.suggestedTags)) patch.tags = aiContent.suggestedTags;
          if (aiContent.suggestedPositionBias) patch.positionBias = aiContent.suggestedPositionBias;
        } else if (job.jobType === "arc_draft") {
          if (Array.isArray(aiContent.chapters)) {
            patch.aiArcChapters = aiContent.chapters
              .map(sanitizeChapter)
              .filter((ch): ch is Record<string, unknown> => ch !== null);
          }
        } else if (job.jobType === "text_rewrite") {
          if (aiContent.rewrittenText) patch.description = aiContent.rewrittenText;
        } else if (job.jobType === "cast_proposal") {
          if (Array.isArray(aiContent.roles)) patch.aiCastRoles = aiContent.roles;
        }

        await storage.updateRecruitingClassProject(projectId, {
          classData: { ...existingData, ...patch, lastAiJobId: jobId },
        });
      }

      res.json({ job: updated });
    } catch (err) {
      console.error("[ai-class-jobs] accept error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/class-projects/:projectId/ai-jobs/:jobId
  // Soft-discard: sets rejectedAt for audit trail. Row is never hard-deleted.
  app.delete("/api/class-projects/:projectId/ai-jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const jobId = req.params.jobId as string;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (job.rejectedAt) return res.json({ ok: true, alreadyRejected: true });
      const updated = await storage.updateAiClassJob(jobId, { rejectedAt: new Date() });
      res.json({ ok: true, job: updated });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/class-projects/:projectId/ai-quota
  app.get("/api/class-projects/:projectId/ai-quota", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const usedCount = await storage.countAiClassJobsInHour(userId);
      res.json({
        used: usedCount,
        limit: RATE_LIMIT,
        remaining: Math.max(0, RATE_LIMIT - usedCount),
      });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
