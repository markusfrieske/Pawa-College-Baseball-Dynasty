/**
 * AI class job endpoints (Task 1367).
 *
 * POST /api/class-projects/:projectId/ai-jobs       — create + process job
 * GET  /api/class-projects/:projectId/ai-jobs/:jobId — poll status
 * POST /api/class-projects/:projectId/ai-jobs/:jobId/accept — accept into draft
 * DELETE /api/class-projects/:projectId/ai-jobs/:jobId       — discard
 * GET  /api/class-projects/:projectId/ai-quota               — quota remaining
 */

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import type { InsertAiClassJob } from "@shared/schema";

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
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a creative director for a college baseball dynasty simulator. Draft a class theme from the coach's prompt.
Return JSON: { "themeName": string (≤40 chars), "description": string (≤200 chars), "suggestedTags": string[] (2-4 items from: power, speed, pitching, defense, depth, development, culture, upside, grit), "suggestedPositionBias": string (one of: balanced, pitching_heavy, hitting_heavy, speed_heavy, power_heavy) }`,
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

async function runCastProposal(prompt: string, cast: string[]): Promise<Record<string, unknown>> {
  const client = getOpenAI();
  if (!client) return proceduralCastProposal(cast);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a sports storytelling director for a college baseball dynasty simulator. Given a list of recruit IDs and a coach's creative direction, propose story role concepts.
Return JSON: { "roles": [ { "templateRecruitId": string, "storySlot": string, "roleLabel": string (≤30 chars), "rationale": string (≤100 chars), "suggestedArcFamily": string (one of: redemption, emergence, rivalry, injury, breakthrough, mentor, underdog, comeback) } ] }
Include one entry per recruit ID provided. Be creative and varied.`,
        },
        {
          role: "user",
          content: `Cast IDs: ${JSON.stringify(cast)}\n\nDirector's note: ${prompt}`,
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
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a narrative designer for a college baseball dynasty simulator. Draft a 3-chapter story arc for a recruit.
Return JSON: { "chapters": [ { "title": string (≤40 chars), "eventText": string (≤200 chars), "choices": [ { "label": string (≤30 chars), "outcomeText": string (≤150 chars), "effectPreset": string (one of: confidence_minor_gain, confidence_major_gain, skill_minor_gain, skill_major_gain, performance_minor_gain, performance_major_gain, none) } ] } ] }
Each chapter has exactly 2 choices. Chapters must escalate in narrative stakes. Keep language punchy and evocative.`,
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
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an editor for a college baseball dynasty simulator. Rewrite the provided text according to the coach's tone direction.
Return JSON: { "rewrittenText": string }
Keep the same meaning and roughly the same length. Preserve key facts. Apply the tone requested.`,
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
    case "cast_proposal":
      return runCastProposal(prompt, (metadata.cast as string[]) ?? []);
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

  // POST /api/class-projects/:projectId/ai-jobs — create + process job synchronously
  app.post("/api/class-projects/:projectId/ai-jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string;
      const { projectId } = req.params;
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

      // Rate limit check
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

      // Compute fallback if needed
      const isFallback = finalStatus === "failed" || responseJson.aiAssisted === false;
      let fallbackJson: Record<string, unknown> | undefined;
      if (isFallback) {
        fallbackJson = responseJson;
        finalStatus = "complete";
      }

      const updated = await storage.updateAiClassJob(job.id, {
        status: finalStatus,
        responseJson: isFallback ? fallbackJson : responseJson,
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
      const userId = (req as any).user?.id as string;
      const { jobId } = req.params;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/class-projects/:projectId/ai-jobs/:jobId/accept
  app.post("/api/class-projects/:projectId/ai-jobs/:jobId/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string;
      const { jobId } = req.params;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const updated = await storage.updateAiClassJob(jobId, { acceptedAt: new Date() });
      res.json({ job: updated });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/class-projects/:projectId/ai-jobs/:jobId
  app.delete("/api/class-projects/:projectId/ai-jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string;
      const { jobId } = req.params;
      const job = await storage.getAiClassJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteAiClassJob(jobId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/class-projects/:projectId/ai-quota
  app.get("/api/class-projects/:projectId/ai-quota", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string;
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
