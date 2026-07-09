import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hasCommissionerAccess, requireAuth, advancingLeagues } from "../route-helpers";
import {
  captureLeagueSaveState,
  listLeagueSaveStates,
  restoreLeagueSaveState,
} from "../lib/leagueSaveState";

const createSaveStateSchema = z.object({
  label: z.string().min(1).max(100),
});

export function registerSaveStateRoutes(app: Express) {
  app.get("/api/leagues/:id/save-states", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      const saveStates = await listLeagueSaveStates(league.id);
      return res.json(saveStates);
    } catch (err) {
      console.error("[save-states] list error:", err);
      return res.status(500).json({ message: "Failed to list save states" });
    }
  });

  app.post("/api/leagues/:id/save-states", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      if (advancingLeagues.has(league.id)) {
        return res.status(409).json({ message: "League is currently advancing — try again after it finishes." });
      }
      const body = createSaveStateSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Label is required (1–100 chars)" });
      }
      advancingLeagues.add(league.id);
      try {
        const id = await captureLeagueSaveState(
          league.id,
          "manual",
          body.data.label,
          req.session.userId
        );
        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId!,
          action: "Save State Created",
          details: `Manual save state created: "${body.data.label}"`,
        });
        return res.json({ id, message: "Save state created" });
      } finally {
        advancingLeagues.delete(league.id);
      }
    } catch (err) {
      console.error("[save-states] create error:", err);
      return res.status(500).json({ message: "Failed to create save state" });
    }
  });

  app.post(
    "/api/leagues/:id/save-states/:saveStateId/restore",
    requireAuth,
    async (req, res) => {
      try {
        const league = await storage.getLeague(req.params.id);
        if (!league) return res.status(404).json({ message: "League not found" });
        if (!hasCommissionerAccess(league, req.session.userId)) {
          return res.status(403).json({ message: "Commissioner access required" });
        }
        if (advancingLeagues.has(league.id)) {
          return res
            .status(409)
            .json({ message: "League is currently advancing — try again after it finishes." });
        }
        advancingLeagues.add(league.id);
        try {
          await restoreLeagueSaveState(
            req.params.saveStateId,
            league.id,
            req.session.userId
          );
          await storage.createAuditLog({
            leagueId: league.id,
            userId: req.session.userId!,
            action: "Save State Restored",
            details: `Rolled back league to save state ${req.params.saveStateId}`,
          });
          return res.json({ message: "League restored successfully" });
        } finally {
          advancingLeagues.delete(league.id);
        }
      } catch (err: any) {
        console.error("[save-states] restore error:", err);
        const msg = err?.message === "Save state not found" ? err.message : "Failed to restore save state";
        return res.status(err?.message === "Save state not found" ? 404 : 500).json({ message: msg });
      }
    }
  );
}
