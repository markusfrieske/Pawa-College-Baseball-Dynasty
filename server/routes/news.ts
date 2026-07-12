/**
 * League News — commissioner-authored blog posts visible to all members
 * GET  /api/leagues/:id/news              → list (paginated, newest first)
 * POST /api/leagues/:id/news              → create (commissioner only)
 * DELETE /api/leagues/:id/news/:postId    → delete (commissioner only)
 *
 * Advance Schedule
 * PUT /api/leagues/:id/advance-schedule   → set nextAdvanceAt + note (commissioner)
 *
 * Top Players
 * GET /api/leagues/:id/top-players        → top hitters + pitchers by OVR
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { requireAuth, hasCommissionerAccess } from "../route-helpers";
import { players, teams } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export function registerNewsRoutes(app: Express): void {

  // ── GET /api/leagues/:id/news ─────────────────────────────────────────────
  app.get("/api/leagues/:id/news", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      const posts = await storage.getLeagueNewsPosts(leagueId);
      return res.json({ posts });
    } catch (err) {
      console.error("[news] GET error", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  // ── POST /api/leagues/:id/news ────────────────────────────────────────────
  app.post("/api/leagues/:id/news", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const bodySchema = z.object({
        title: z.string().min(1).max(120),
        subtitle: z.string().max(200).optional(),
        body: z.string().min(1).max(5000),
        imageUrl: z.string().url().optional().or(z.literal("")),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });

      const post = await storage.createLeagueNewsPost({
        leagueId,
        commissionerId: userId,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle ?? null,
        body: parsed.data.body,
        imageUrl: parsed.data.imageUrl || null,
      });
      return res.json({ post });
    } catch (err) {
      console.error("[news] POST error", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  // ── DELETE /api/leagues/:id/news/:postId ──────────────────────────────────
  app.delete("/api/leagues/:id/news/:postId", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const postId = req.params.postId as string;
      const userId = req.session.userId!;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      await storage.deleteLeagueNewsPost(postId, leagueId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[news] DELETE error", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  // ── PUT /api/leagues/:id/advance-schedule ─────────────────────────────────
  app.put("/api/leagues/:id/advance-schedule", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const bodySchema = z.object({
        nextAdvanceAt: z.string().nullable(),
        advanceScheduleNote: z.string().max(200).nullable().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });

      const nextAt = parsed.data.nextAdvanceAt ? new Date(parsed.data.nextAdvanceAt) : null;
      await storage.updateLeague(leagueId, {
        nextAdvanceAt: nextAt ?? undefined,
        advanceScheduleNote: parsed.data.advanceScheduleNote ?? null,
      } as any);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[news] advance-schedule PUT error", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  // ── GET /api/leagues/:id/top-players ─────────────────────────────────────
  app.get("/api/leagues/:id/top-players", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const PITCHER_POS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
      const rows = await db
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          position: players.position,
          overall: players.overall,
          eligibility: players.eligibility,
          teamId: players.teamId,
          teamName: teams.name,
          teamAbbreviation: teams.abbreviation,
          teamPrimaryColor: teams.primaryColor,
        })
        .from(players)
        .innerJoin(teams, eq(players.teamId, teams.id))
        .where(eq(teams.leagueId, leagueId))
        .orderBy(desc(players.overall))
        .limit(50);

      const hitters = rows.filter(p => !PITCHER_POS.includes(p.position)).slice(0, 10);
      const pitchers = rows.filter(p => PITCHER_POS.includes(p.position)).slice(0, 10);
      return res.json({ hitters, pitchers });
    } catch (err) {
      console.error("[news] top-players error", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });
}
