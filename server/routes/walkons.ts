/**
 * Walk-on management routes.
 *
 * Endpoints (all under /api/leagues/:id/):
 *   GET    /walkons            — pool for current league
 *   GET    /walkons/bids       — team bids + NIL summary
 *   POST   /walkons/:wId/bid   — place/update a bid
 *   DELETE /walkons/:wId/bid   — remove a bid
 *   POST   /walkons/confirm    — finalize walk-on selections (human)
 *   POST   /walkons/ready      — mark team ready for phase advance
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import { z } from "zod";

export function registerWalkonRoutes(app: Express): void {
  // ============ WALK-ON MANAGEMENT ENDPOINTS ============
  app.get("/api/leagues/:id/walkons", requireAuth, async (req, res) => {
    try {
      const walkons = await storage.getWalkonsByLeague(req.params.id as string);
      res.json(walkons);
    } catch (error) {
      res.status(500).json({ message: "Failed to get walk-on pool" });
    }
  });

  // GET team's bids + NIL summary for the walk-on bid page
  app.get("/api/leagues/:id/walkons/bids", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.json({ bids: {}, nilBudget: 0, nilSpent: 0, committedBids: 0 });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.json({ bids: {}, nilBudget: 0, nilSpent: 0, committedBids: 0 });
      const teamBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const bids: Record<string, number> = {};
      let committedBids = 0;
      for (const b of teamBids) {
        bids[b.walkonPoolId] = b.bidAmount;
        committedBids += b.bidAmount;
      }
      res.json({
        bids,
        nilBudget: team.nilBudget,
        nilSpent: team.nilSpent,
        committedBids,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get bid data" });
    }
  });

  // GET post-auction results for the requesting team.
  // Reads from league.lastWalkonAuction (persisted before walkons are deleted)
  // so all coaches can see their won/lost summary after the phase advances.
  // Returns { results: [] } when no auction has been resolved this season.
  app.get("/api/leagues/:id/walkons/auction-results", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.json({ results: [] });

      if (!league.lastWalkonAuction) return res.json({ results: [] });

      let allTeamResults: Record<string, unknown[]>;
      try {
        allTeamResults = JSON.parse(league.lastWalkonAuction);
      } catch {
        return res.json({ results: [] });
      }

      const teamResults = (allTeamResults[userCoach.teamId] as unknown[]) || [];
      res.json({ results: teamResults });
    } catch (error) {
      res.status(500).json({ message: "Failed to get auction results" });
    }
  });

  // POST blind bid on a walk-on (upsert — teams can change their bid before ready-up)
  app.post("/api/leagues/:id/walkons/:walkonId/bid", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, walkonId } = req.params as Record<string, string>;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }

      const bidSchema = z.object({ bidAmount: z.number().int().min(1) });
      const parsed = bidSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "bidAmount must be a positive integer" });
      const { bidAmount } = parsed.data;

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      if (team.walkonReady) {
        return res.status(400).json({ message: "Unmark ready before changing bids" });
      }

      // Roster-slot cap: max active bids ≤ open roster slots.
      // Active roster excludes players with departureType set (draft-declared seniors,
      // transfers, etc.) since those slots will be vacated before the new season.
      // This ensures the highest bidder can always honor their win — no
      // cap-based reassignment is needed at auction resolution time.
      const allRoster = await storage.getPlayersByTeam(team.id);
      const activeRoster = allRoster.filter(p => !p.departureType);
      const MAX_WALKON_BID_ROSTER = 25;
      const openSlots = MAX_WALKON_BID_ROSTER - activeRoster.length;
      if (openSlots <= 0) {
        return res.status(400).json({
          message: `Roster is full (${activeRoster.length}/${MAX_WALKON_BID_ROSTER} active players). Cut a player before bidding.`
        });
      }
      // Count current active bids (excluding any existing bid on this walk-on, which will be replaced)
      const allExistingBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const activeBidsExcludingThis = allExistingBids.filter(b => b.walkonPoolId !== walkonId).length;
      if (activeBidsExcludingThis >= openSlots) {
        return res.status(400).json({
          message: `Cannot place more bids than open roster slots. You have ${openSlots} open slot${openSlots !== 1 ? "s" : ""} and ${activeBidsExcludingThis} other active bid${activeBidsExcludingThis !== 1 ? "s" : ""}. Cut a player or remove a bid first.`
        });
      }

      const walkons = await storage.getWalkonsByLeague(leagueId);
      const walkon = walkons.find(w => w.id === walkonId);
      if (!walkon) return res.status(404).json({ message: "Walk-on not found" });
      if (walkon.awardedTeamId) return res.status(400).json({ message: "Auction already resolved" });

      // Validate bid against walk-on envelope when set, else total budget
      // Also deduct other committed bids from the same envelope
      const existingBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const committedOther = existingBids.reduce((s, b) => b.walkonPoolId === walkonId ? s : s + b.bidAmount, 0);
      const envelopeAvail = team.nilWalkonReserve != null
        ? (team.nilWalkonReserve - (team.nilWalkonSpent || 0))
        : (team.nilBudget - (team.nilSpent || 0));
      const available = envelopeAvail - committedOther;
      if (bidAmount > available) {
        const envelopeLabel = team.nilWalkonReserve != null ? "walk-on envelope" : "NIL budget";
        return res.status(400).json({ message: `Bid exceeds available ${envelopeLabel}. Available: $${available.toLocaleString()}` });
      }

      const bid = await storage.upsertWalkonBid(leagueId, walkonId, team.id, bidAmount);
      res.json(bid);
    } catch (error) {
      console.error("Bid error:", error);
      res.status(500).json({ message: "Failed to place bid" });
    }
  });

  // DELETE — withdraw a bid on a walk-on
  app.delete("/api/leagues/:id/walkons/:walkonId/bid", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, walkonId } = req.params as Record<string, string>;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (team.walkonReady) {
        return res.status(400).json({ message: "Unmark ready before changing bids" });
      }
      await storage.deleteWalkonBid(walkonId, team.id);
      res.json({ message: "Bid withdrawn" });
    } catch (error) {
      res.status(500).json({ message: "Failed to withdraw bid" });
    }
  });

  app.post("/api/leagues/:id/walkons/cut/:playerId", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, playerId } = req.params as Record<string, string>;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) {
        return res.status(403).json({ message: "No team found" });
      }
      
      const player = await storage.getPlayer(playerId);
      if (!player || player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      
      const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
      await storage.createPlayerHistory({
        leagueId,
        teamId: userCoach.teamId,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        finalEligibility: player.eligibility,
        overall: player.overall,
        starRating: player.starRating,
        signingOvr: player.signingOvr ?? player.overall,
        ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
        departureType: "cut_juco",
        departedSeason: league.currentSeason,
        seasonsPlayed: eligMap[player.eligibility] || 1,
        abilities: player.abilities || [],
        homeState: player.homeState,
        hometown: player.hometown,
        sourcePlayerId: player.id,
      });
      
      await storage.deletePlayer(playerId);

      try {
        const teamForEvent = await storage.getTeam(userCoach.teamId);
        await storage.createLeagueEvent({
          leagueId,
          teamId: userCoach.teamId,
          teamName: teamForEvent?.name,
          teamAbbreviation: teamForEvent?.abbreviation,
          eventType: "ROSTER_CUT",
          description: `${teamForEvent?.name || "A team"} cut ${player.firstName} ${player.lastName} (${player.position}) — sent to JUCO`,
          season: league.currentSeason,
          week: league.currentWeek,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ message: "Player cut and sent to JUCO" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cut player" });
    }
  });

  app.post("/api/leagues/:id/walkons/ready", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) {
        return res.status(403).json({ message: "No team found" });
      }
      
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      
      const updated = await storage.updateTeam(team.id, { walkonReady: !team.walkonReady });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle ready status" });
    }
  });

  app.get("/api/leagues/:id/walkons/readiness", requireAuth, async (req, res) => {
    try {
      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const readiness = teams.map(t => ({
        teamId: t.id,
        teamName: t.name,
        isCpu: t.isCpu,
        walkonReady: t.walkonReady,
        abbreviation: t.abbreviation,
      }));
      res.json(readiness);
    } catch (error) {
      res.status(500).json({ message: "Failed to get readiness" });
    }
  });

}
