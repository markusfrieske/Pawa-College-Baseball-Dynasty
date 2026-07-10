/**
 * Team Identity Routes
 *
 * GET  /api/leagues/:id/identity — returns the logged-in coach's identity
 * PATCH /api/leagues/:id/identity — updates identity (phase-locked during competition)
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import {
  OFFENSIVE_IDENTITIES,
  PITCHING_IDENTITIES,
  RECRUITING_PITCHES,
  PROGRAM_CULTURES,
  IDENTITY_DEFAULTS,
  canEditIdentity,
} from "@shared/programIdentity";

const VALID_OFFENSIVE  = OFFENSIVE_IDENTITIES.map(x => x.id) as [string, ...string[]];
const VALID_PITCHING   = PITCHING_IDENTITIES.map(x => x.id)  as [string, ...string[]];
const VALID_PITCHES    = RECRUITING_PITCHES.map(x => x.id)   as [string, ...string[]];
const VALID_CULTURES   = PROGRAM_CULTURES.map(x => x.id)     as [string, ...string[]];

const identityPatchSchema = z.object({
  offensiveIdentity: z.enum(VALID_OFFENSIVE).optional(),
  pitchingIdentity:  z.enum(VALID_PITCHING).optional(),
  recruitingPitch:   z.enum(VALID_PITCHES).optional(),
  programCulture:    z.enum(VALID_CULTURES).optional(),
});

export function registerIdentityRoutes(app: Express): void {
  // ── GET /api/leagues/:id/identity ─────────────────────────────────────────
  app.get("/api/leagues/:id/identity", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId   = req.session.userId!;

      const [league, coaches] = await Promise.all([
        storage.getLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);

      if (!league) return res.status(404).json({ message: "League not found" });

      const coach = coaches.find(c => c.userId === userId);
      if (!coach) return res.status(403).json({ message: "You are not a coach in this league" });

      res.json({
        offensiveIdentity: coach.offensiveIdentity ?? IDENTITY_DEFAULTS.offensiveIdentity,
        pitchingIdentity:  coach.pitchingIdentity  ?? IDENTITY_DEFAULTS.pitchingIdentity,
        recruitingPitch:   coach.recruitingPitch   ?? IDENTITY_DEFAULTS.recruitingPitch,
        programCulture:    coach.programCulture    ?? IDENTITY_DEFAULTS.programCulture,
        canEdit: canEditIdentity(league.currentPhase),
        currentPhase: league.currentPhase,
      });
    } catch (err) {
      console.error("[identity] GET failed:", err);
      res.status(500).json({ message: "Failed to load identity" });
    }
  });

  // ── PATCH /api/leagues/:id/identity ───────────────────────────────────────
  app.patch("/api/leagues/:id/identity", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId   = req.session.userId!;

      const parse = identityPatchSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ message: "Invalid identity fields", errors: parse.error.flatten() });
      }

      const [league, coaches] = await Promise.all([
        storage.getLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);

      if (!league) return res.status(404).json({ message: "League not found" });

      if (!canEditIdentity(league.currentPhase)) {
        return res.status(409).json({
          message: "Identity cannot be changed during active competition. Edit during the offseason or preseason.",
        });
      }

      const coach = coaches.find(c => c.userId === userId);
      if (!coach) return res.status(403).json({ message: "You are not a coach in this league" });

      const updates: Record<string, string> = {};
      if (parse.data.offensiveIdentity) updates.offensiveIdentity = parse.data.offensiveIdentity;
      if (parse.data.pitchingIdentity)  updates.pitchingIdentity  = parse.data.pitchingIdentity;
      if (parse.data.recruitingPitch)   updates.recruitingPitch   = parse.data.recruitingPitch;
      if (parse.data.programCulture)    updates.programCulture    = parse.data.programCulture;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      await storage.updateCoach(coach.id, updates as any);

      res.json({
        offensiveIdentity: updates.offensiveIdentity ?? coach.offensiveIdentity ?? IDENTITY_DEFAULTS.offensiveIdentity,
        pitchingIdentity:  updates.pitchingIdentity  ?? coach.pitchingIdentity  ?? IDENTITY_DEFAULTS.pitchingIdentity,
        recruitingPitch:   updates.recruitingPitch   ?? coach.recruitingPitch   ?? IDENTITY_DEFAULTS.recruitingPitch,
        programCulture:    updates.programCulture    ?? coach.programCulture    ?? IDENTITY_DEFAULTS.programCulture,
        canEdit: true,
      });
    } catch (err) {
      console.error("[identity] PATCH failed:", err);
      res.status(500).json({ message: "Failed to update identity" });
    }
  });
}
