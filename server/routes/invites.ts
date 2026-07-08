/**
 * League invite-link routes.
 * Commissioners generate/revoke links; anyone with a link can preview and accept.
 */

import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, ensureCoachTraits } from "../route-helpers";
import { invalidateLeague } from "../cache";

export function registerInviteRoutes(app: Express): void {
  // ── Create an invite link (commissioner only) ─────────────────────────────
  app.post("/api/leagues/:id/invites", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can generate invite links" });
      }

      const { label, expiresIn } = req.body || {};
      let expiresAt: Date | undefined;
      if (expiresIn) {
        const match = String(expiresIn).match(/^(\d+)(h|d)$/);
        if (!match) {
          return res.status(400).json({ message: "Invalid expiry format. Use values like '24h', '3d', '7d'." });
        }
        const amount = parseInt(match[1]);
        const ms = match[2] === "h" ? amount * 3_600_000 : amount * 86_400_000;
        expiresAt = new Date(Date.now() + ms);
      }

      let inviteCode: string;
      let attempts = 0;
      do {
        inviteCode = randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();
        const existing = await storage.getLeagueInviteByCode(inviteCode);
        if (!existing) break;
        attempts++;
      } while (attempts < 5);

      if (attempts >= 5) {
        return res.status(500).json({ message: "Failed to generate unique invite code" });
      }

      const invite = await storage.createLeagueInvite({
        leagueId: league.id,
        inviteCode,
        invitedById: req.session.userId!,
        label: label || null,
        expiresAt: expiresAt ?? null,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Invite Link Created",
        details: `Generated invite link: ${inviteCode}${label ? ` (${label})` : ""}`,
      });

      invalidateLeague(league.id);
      res.json(invite);
    } catch (error) {
      console.error("Failed to create invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  // ── Preview an invite link (public) ─────────────────────────────────────
  app.get("/api/invites/:code", async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code as string);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      if (invite.status !== "pending") {
        const statusMsg = invite.status === "accepted"
          ? "This invite link has already been used"
          : invite.status === "revoked"
          ? "This invite link has been revoked by the commissioner"
          : "This invite link is no longer valid";
        return res.status(400).json({ message: statusMsg });
      }
      if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
        return res.status(400).json({ message: "This invite link has expired" });
      }
      const league = await storage.getLeague(invite.leagueId);
      const teams = await storage.getTeamsByLeague(invite.leagueId);
      const availableTeams = teams.filter(t => t.isCpu);
      res.json({ invite, league, availableTeams });
    } catch (error) {
      console.error("Failed to fetch invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  // ── Accept an invite link (authenticated) ───────────────────────────────
  app.post("/api/invites/:code/accept", requireAuth, async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code as string);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite link has already been used or revoked" });
      }
      if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
        return res.status(400).json({ message: "This invite link has expired" });
      }

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Authentication required" });

      const existingTeams = await storage.getTeamsByLeague(invite.leagueId);
      const teamsWithCoaches = existingTeams.filter(t => t.coachId);
      const coaches = await Promise.all(teamsWithCoaches.map(t => storage.getCoach(t.coachId!)));
      if (coaches.some(c => c && c.userId === userId)) {
        return res.status(400).json({ message: "You are already a coach in this league" });
      }

      const { teamId, coachData } = req.body;
      if (!teamId) return res.status(400).json({ message: "Team selection is required" });

      const team = await storage.getTeam(teamId);
      if (!team || !team.isCpu) return res.status(400).json({ message: "This team is not available" });
      if (team.leagueId !== invite.leagueId) return res.status(400).json({ message: "Invalid team selection" });

      const baseCoachData = {
        firstName: coachData?.firstName || "New",
        lastName: coachData?.lastName || "Coach",
        leagueId: invite.leagueId,
        teamId,
        archetype: coachData?.archetype || "Balanced",
        userId: req.session.userId!,
        scoutingSkill: 1,
        evaluationSkill: 1,
        pitchingRecruitingSkill: 1,
        hittingRecruitingSkill: 1,
        ...(coachData ? {
          skinTone: coachData.skinTone || "light",
          hairColor: coachData.hairColor || "brown",
          hairStyle: coachData.hairStyle || "short",
        } : {}),
      };

      const coach = await storage.createCoach(baseCoachData);
      try { await ensureCoachTraits(coach, 1); } catch (err) {
        console.error("[inviteJoin] ensureCoachTraits failed:", err);
      }

      await storage.updateLeagueInvite(invite.id, {
        status: "accepted",
        teamId,
        acceptedById: req.session.userId,
      });

      await storage.updateTeam(teamId, { isCpu: false, coachId: coach.id });

      await storage.createAuditLog({
        leagueId: invite.leagueId,
        userId: req.session.userId,
        action: "Invite Accepted",
        details: `${user.email || "A player"} joined the league and selected ${team.name}`,
      });

      res.json({ success: true, leagueId: invite.leagueId, teamId });
    } catch (error) {
      console.error("Failed to accept invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // ── Revoke an invite link (commissioner only) ────────────────────────────
  app.post("/api/invites/:code/revoke", requireAuth, async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code as string);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      const league = await storage.getLeague(invite.leagueId);
      if (!league || league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can revoke invites" });
      }
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "Only pending invites can be revoked" });
      }
      await storage.updateLeagueInvite(invite.id, { status: "revoked" });
      await storage.createAuditLog({
        leagueId: invite.leagueId,
        userId: req.session.userId,
        action: "Invite Revoked",
        details: `Revoked invite link: ${invite.inviteCode}`,
      });
      invalidateLeague(invite.leagueId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to revoke invite:", error);
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });
}
