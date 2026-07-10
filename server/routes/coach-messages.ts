/**
 * Coach Office Inbox
 *
 * GET  /api/leagues/:id/messages             — list messages for the caller
 * GET  /api/leagues/:id/messages/unread-count — badge count
 * POST /api/leagues/:id/messages/:msgId/read    — mark one read
 * POST /api/leagues/:id/messages/:msgId/archive — archive one
 * POST /api/leagues/:id/messages/mark-all-read  — mark all read
 * POST /api/leagues/:id/messages/broadcast       — commissioner → all coaches
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess } from "../route-helpers";
import { COACH_MESSAGE_CATEGORIES } from "@shared/schema";

const broadcastSchema = z.object({
  category: z.enum(COACH_MESSAGE_CATEGORIES),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().max(500).optional(),
});

export function registerCoachMessageRoutes(app: Express): void {
  // ── GET /api/leagues/:id/messages ─────────────────────────────────────────
  app.get("/api/leagues/:id/messages", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const category = req.query.category as string | undefined;
      const unreadOnly = req.query.unread === "true";
      const archivedOnly = req.query.archived === "true";
      const limitRaw = parseInt((req.query.limit as string) ?? "50", 10);
      const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);
      const offsetRaw = parseInt((req.query.offset as string) ?? "0", 10);
      const offset = Math.max(0, isNaN(offsetRaw) ? 0 : offsetRaw);

      const messages = await storage.getCoachMessages({
        leagueId,
        userId,
        category: COACH_MESSAGE_CATEGORIES.includes(category as never) ? category : undefined,
        unreadOnly,
        archivedOnly,
        limit,
        offset,
      });

      res.json({ messages, hasMore: messages.length === limit });
    } catch (err) {
      console.error("[coach-messages] GET failed:", err);
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  // ── GET /api/leagues/:id/messages/unread-count ────────────────────────────
  app.get("/api/leagues/:id/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const count = await storage.getCoachMessageUnreadCount(leagueId, userId);
      res.json({ count });
    } catch (err) {
      console.error("[coach-messages] unread-count failed:", err);
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  // ── POST /api/leagues/:id/messages/:msgId/read ────────────────────────────
  app.post("/api/leagues/:id/messages/:msgId/read", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;
      const msgId = req.params.msgId;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      await storage.markCoachMessageRead(msgId, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[coach-messages] mark-read failed:", err);
      res.status(500).json({ message: "Failed to mark read" });
    }
  });

  // ── POST /api/leagues/:id/messages/:msgId/archive ─────────────────────────
  app.post("/api/leagues/:id/messages/:msgId/archive", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;
      const msgId = req.params.msgId;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      await storage.markCoachMessageArchived(msgId, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[coach-messages] archive failed:", err);
      res.status(500).json({ message: "Failed to archive message" });
    }
  });

  // ── POST /api/leagues/:id/messages/mark-all-read ──────────────────────────
  app.post("/api/leagues/:id/messages/mark-all-read", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      await storage.markAllCoachMessagesRead(leagueId, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[coach-messages] mark-all-read failed:", err);
      res.status(500).json({ message: "Failed to mark all read" });
    }
  });

  // ── POST /api/leagues/:id/messages/broadcast ──────────────────────────────
  app.post("/api/leagues/:id/messages/broadcast", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can broadcast messages" });
      }

      const parsed = broadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid message", errors: parsed.error.flatten() });
      }

      await storage.broadcastCoachMessage(leagueId, parsed.data);
      res.json({ ok: true });
    } catch (err) {
      console.error("[coach-messages] broadcast failed:", err);
      res.status(500).json({ message: "Failed to broadcast message" });
    }
  });
}
