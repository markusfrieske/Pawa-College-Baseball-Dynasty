/**
 * League invite-link routes.
 * Commissioners generate/revoke links; anyone with a link can preview and accept.
 */

import type { Express } from "express";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, ensureCoachTraits } from "../route-helpers";
import { invalidateLeague } from "../cache";
import { pool } from "../db";

const inviteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many invite attempts. Please try again later." },
});

/** Thrown inside the invite-accept transaction to short-circuit with a specific HTTP status. */
class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

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
  //
  // The entire claim flow (validate → lock → create coach → update invite →
  // update team) runs inside a single serialized DB transaction on one dedicated
  // connection.  Every mutation uses `client.query()` on that same connection so
  // all changes are visible to each other and are released atomically on COMMIT.
  //
  // Concurrent accepts for the same code or the same team both SELECT...FOR UPDATE
  // — the second one blocks until the first commits, then sees status≠'pending' or
  // is_cpu=false and returns 409 Conflict.
  app.post("/api/invites/:code/accept", requireAuth, inviteRateLimit, async (req, res) => {
    const userId = req.session.userId!;
    const code = req.params.code as string;
    const { teamId, coachData } = req.body as {
      teamId?: string;
      coachData?: {
        firstName?: string;
        lastName?: string;
        archetype?: string;
        skinTone?: string;
        hairColor?: string;
        hairStyle?: string;
      };
    };

    // Validate required body fields before acquiring the DB connection.
    if (!teamId) {
      return res.status(400).json({ message: "Team selection is required" });
    }

    // Variables that need to survive the transaction scope for post-commit work.
    let claimedLeagueId: string | undefined;
    let newCoachId: string | null = null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ── Step 1: lock the invite row ──────────────────────────────────────
      const { rows: invRows } = await client.query<{
        id: string; status: string; expires_at: string | null; league_id: string;
      }>(
        `SELECT id, status, expires_at, league_id
           FROM league_invites
          WHERE invite_code = $1
            FOR UPDATE`,
        [code],
      );
      const invRow = invRows[0];
      if (!invRow) throw new HttpError(404, "Invite not found");
      if (invRow.status !== "pending") {
        throw new HttpError(409, "This invite link has already been used or revoked");
      }
      if (invRow.expires_at && new Date(invRow.expires_at) <= new Date()) {
        throw new HttpError(400, "This invite link has expired");
      }

      const leagueId = invRow.league_id;
      claimedLeagueId = leagueId;

      const { rows: leagueRows } = await client.query<{ current_phase: string }>(
        `SELECT current_phase FROM leagues WHERE id = $1 FOR SHARE`,
        [leagueId],
      );
      if (leagueRows[0]?.current_phase !== "dynasty_setup") {
        throw new HttpError(409, "This dynasty has already started");
      }

      // ── Step 2: duplicate-user guard ─────────────────────────────────────
      // Two simultaneous accepts by the same user both SELECT here; whoever
      // committed first will already have inserted a coaches row, so the
      // second sees rowCount=1 and returns 409.
      const dupCheck = await client.query(
        `SELECT id FROM coaches WHERE league_id = $1 AND user_id = $2 LIMIT 1`,
        [leagueId, userId],
      );
      if ((dupCheck.rowCount ?? 0) > 0) {
        throw new HttpError(409, "You are already a coach in this league");
      }

      // ── Step 3: lock the target team row ─────────────────────────────────
      const { rows: tmRows } = await client.query<{
        id: string; is_cpu: boolean; league_id: string; coach_id: string | null;
      }>(
        `SELECT id, is_cpu, league_id, coach_id
           FROM teams
          WHERE id = $1
            FOR UPDATE`,
        [teamId],
      );
      const tmRow = tmRows[0];
      if (!tmRow) throw new HttpError(400, "This team is not available");
      if (!tmRow.is_cpu) throw new HttpError(409, "This team has already been claimed");
      if (tmRow.league_id !== leagueId) throw new HttpError(400, "Invalid team selection");

      // ── Step 4: retire any CPU coaches currently on this team ────────────
      await client.query(
        `UPDATE coaches SET team_id = NULL WHERE team_id = $1 AND user_id IS NULL`,
        [teamId],
      );

      // ── Step 5: create the human coach inside the transaction ─────────────
      const firstName = coachData?.firstName || "New";
      const lastName  = coachData?.lastName  || "Coach";
      const archetype = coachData?.archetype || "Balanced";
      const skinTone  = coachData?.skinTone  || "light";
      const hairColor = coachData?.hairColor || "brown";
      const hairStyle = coachData?.hairStyle || "short";

      const { rows: coachRows } = await client.query<{ id: string }>(
        `INSERT INTO coaches
           (user_id, team_id, league_id, first_name, last_name, archetype,
            skin_tone, hair_color, hair_style)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [userId, teamId, leagueId, firstName, lastName, archetype,
         skinTone, hairColor, hairStyle],
      );
      newCoachId = coachRows[0].id;

      // ── Step 6: mark the invite as accepted ──────────────────────────────
      await client.query(
        `UPDATE league_invites
            SET status = 'accepted', team_id = $1, accepted_by_id = $2
          WHERE id = $3`,
        [teamId, userId, invRow.id],
      );

      // ── Step 7: claim the team for the human coach ───────────────────────
      await client.query(
        `UPDATE teams SET is_cpu = false, coach_id = $1 WHERE id = $2`,
        [newCoachId, teamId],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err instanceof HttpError) {
        return res.status(err.status).json({ message: err.message });
      }
      // Unique-constraint violation (23505): same user or same team claimed concurrently.
      if ((err as any)?.code === "23505") {
        return res.status(409).json({ message: "This team or coach slot has already been claimed" });
      }
      console.error("Failed to accept invite:", err);
      return res.status(500).json({ message: "Failed to accept invite" });
    } finally {
      client.release();
    }

    // ── Post-commit: best-effort coach enrichment and audit log ──────────────
    // These run outside the transaction so a failure here does NOT roll back the
    // invite acceptance.
    if (newCoachId) {
      try {
        const coach = await storage.getCoach(newCoachId);
        if (coach) {
          await ensureCoachTraits(coach, 1).catch(err =>
            console.error("[inviteJoin] ensureCoachTraits failed:", err),
          );
        }
      } catch (err) {
        console.error("[inviteJoin] post-commit coach setup failed:", err);
      }
    }

    if (claimedLeagueId) {
      try {
        const [user, team] = await Promise.all([
          storage.getUser(userId),
          storage.getTeam(teamId),
        ]);
        await storage.createAuditLog({
          leagueId: claimedLeagueId,
          userId,
          action: "Invite Accepted",
          details: `${user?.email || "A player"} joined the league and selected ${team?.name || teamId}`,
        });
        invalidateLeague(claimedLeagueId);
      } catch (err) {
        console.error("[inviteJoin] audit log failed:", err);
      }
    }

    res.json({ success: true, leagueId: claimedLeagueId, teamId });
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
