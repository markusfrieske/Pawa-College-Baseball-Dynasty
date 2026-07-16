/**
 * Departures, roster management, and player lifecycle routes.
 *
 * Endpoints:
 *   GET    /api/leagues/:id/departures                — finalized departures
 *   POST   /api/leagues/:id/departures/finalize        — finalize departures
 *   POST   /api/leagues/:id/players/:pId/keep          — retain a departing player
 *   GET    /api/leagues/:id/players/:pId/departure-details
 *   GET    /api/leagues/:id/transfer-portal            — active transfer portal
 *   POST   /api/leagues/:id/transfer-portal/:rId/scout
 *   POST   /api/leagues/:id/transfer-portal/:rId/offer
 *   POST   /api/leagues/:id/transfer-portal/:rId/commit
 *   PATCH  /api/leagues/:id/players/:pId              — update player (captain etc.)
 *   DELETE /api/leagues/:id/players/:pId              — release player
 *   GET    /api/leagues/:id/players                   — roster list
 *   GET    /api/leagues/:id/players/:pId              — player detail
 *   POST   /api/leagues/:id/players/:pId/cut          — cut player (offseason)
 *   ... and more departures/roster endpoints
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, calculatePhilosophyRetentionBonus, calculateIdentityRetentionBonus, autoAssignLineup, ensureCoachTraits, loadLeagueScopedPlayer } from "../route-helpers";
import { evaluatePlayerPromises, processOffseasonDepartures } from "../offseason-helpers";
import type { TransferPortalInterest } from "@shared/schema";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";

export function registerDeparturesRoutes(app: Express): void {
  // ============ DEPARTURES SYSTEM ============
  
  // Get all departures for the departures screen
  app.get("/api/leagues/:id/departures", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Safety net: if we're in offseason_departures but departure flags were never set
      // (e.g. SR-skip path, legacy "offseason" bump, or any other missed transition),
      // trigger processing now so the screen is never empty.
      if (league.currentPhase === "offseason_departures") {
        const existingPending = await storage.getPendingDeparturesByLeague(req.params.id as string);
        const hasValidDepartures = existingPending.some(
          p => p.departureType === "graduated" || p.departureType === "draft"
        );
        if (!hasValidDepartures) {
          try {
            await evaluatePlayerPromises(req.params.id as string, league.currentSeason);
            await processOffseasonDepartures(req.params.id as string, league.currentSeason);
            console.log(`[departures-GET] safety-net: triggered departure processing for league=${req.params.id as string} season=${league.currentSeason}`);
          } catch (e) {
            console.error("[departures-GET] safety-net departure processing error:", e);
          }
        }
      }

      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeam = teams.find(t => t.id === userCoach?.teamId);

      const departuresByTeam: Record<string, any> = {};

      for (const team of teams) {
        const roster = await storage.getPlayersByTeam(team.id);
        const pending = roster.filter(p => p.pendingDeparture);
        const promises = await storage.getPlayerPromisesByTeam(team.id);

        departuresByTeam[team.id] = {
          teamId: team.id,
          teamName: team.name,
          mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          isCpu: team.isCpu,
          departuresFinalized: team.departuresFinalized,
          nilBudget: team.nilBudget,
          nilSpent: team.nilSpent,
          nilRemaining: team.nilBudget - (team.nilSpent || 0),
          rosterSize: roster.filter(p => !p.pendingDeparture).length,
          graduates: pending.filter(p => p.departureType === "graduated"),
          draftDeclarations: pending.filter(p => p.departureType === "draft"),
          transfers: pending.filter(p => p.departureType === "transfer"),
          promises: promises.filter(p => p.isActive),
        };
      }

      res.json({
        league: { 
          id: league.id, 
          name: league.name, 
          currentSeason: league.currentSeason,
          currentPhase: league.currentPhase,
        },
        userTeamId: userTeam?.id,
        userTeam: userTeam ? departuresByTeam[userTeam.id] : null,
        allTeams: Object.values(departuresByTeam).sort((a: any, b: any) => {
          const aTotal = a.graduates.length + a.draftDeclarations.length + a.transfers.length;
          const bTotal = b.graduates.length + b.draftDeclarations.length + b.transfers.length;
          return bTotal - aTotal;
        }),
      });
    } catch (error) {
      console.error("Failed to get departures:", error);
      res.status(500).json({ message: "Failed to get departures" });
    }
  });

  // Retain a draft-eligible player with NIL offer
  app.post("/api/leagues/:id/departures/retain-draft", requireAuth, async (req, res) => {
    try {
      const { playerId, nilOffer } = req.body;
      if (!playerId || nilOffer === undefined) {
        return res.status(400).json({ message: "playerId and nilOffer are required" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "No team assigned" });

      // Use league-scoped loader so cross-league IDOR is impossible.
      const player = await loadLeagueScopedPlayer(req.params.id as string, playerId);
      if (!player || !player.pendingDeparture || player.departureType !== "draft") {
        return res.status(400).json({ message: "Player not found or not a draft departure" });
      }
      if (player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      if (player.retentionStatus === "retained" || player.retentionStatus === "rejected") {
        return res.status(400).json({ message: "Already processed" });
      }

      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      // Validate against retention envelope when set, else total budget
      const nilRemaining = team.nilRetentionReserve != null
        ? (team.nilRetentionReserve - (team.nilRetentionSpent || 0))
        : (team.nilBudget - (team.nilSpent || 0));
      if (nilOffer > nilRemaining) {
        const envelopeLabel = team.nilRetentionReserve != null ? "retention envelope" : "NIL budget";
        return res.status(400).json({ message: `Insufficient NIL ${envelopeLabel}. You have $${nilRemaining.toLocaleString()} remaining.` });
      }

      const askMin = player.draftAskMin || 50000;
      const askMax = player.draftAskMax || 100000;
      
      let stayChance: number;
      if (nilOffer >= askMax) {
        stayChance = 0.95;
      } else if (nilOffer >= askMin) {
        stayChance = 0.5 + 0.4 * ((nilOffer - askMin) / (askMax - askMin));
      } else if (nilOffer >= askMin * 0.5) {
        stayChance = 0.1 + 0.4 * ((nilOffer) / askMin);
      } else {
        stayChance = 0.1;
      }

      const roll = Math.random();
      const stayed = roll < stayChance;

      if (stayed) {
        await storage.updatePlayer(playerId, {
          pendingDeparture: false,
          departureType: null,
          retentionStatus: "retained",
          declaredForDraft: false,
          nilOffered: nilOffer,
        });
        await storage.updateTeam(team.id, {
          nilSpent: (team.nilSpent || 0) + nilOffer,
          nilRetentionSpent: (team.nilRetentionSpent || 0) + nilOffer,
        });
        
        await storage.createAuditLog({
          leagueId: req.params.id as string,
          userId: req.session.userId,
          action: "Draft Retention: Success",
          details: `${player.firstName} ${player.lastName} retained with $${nilOffer.toLocaleString()} NIL offer.`,
        });
      } else {
        await storage.updatePlayer(playerId, {
          retentionStatus: "rejected",
          nilOffered: nilOffer,
        });
        
        await storage.createAuditLog({
          leagueId: req.params.id as string,
          userId: req.session.userId,
          action: "Draft Retention: Failed",
          details: `${player.firstName} ${player.lastName} rejected $${nilOffer.toLocaleString()} NIL offer and will enter the MLB Draft.`,
        });
      }

      res.json({ 
        success: stayed, 
        playerId, 
        playerName: `${player.firstName} ${player.lastName}`,
        nilOffer,
        stayChance: Math.round(stayChance * 100),
      });
    } catch (error) {
      console.error("Failed to retain draft player:", error);
      res.status(500).json({ message: "Failed to retain player" });
    }
  });

  // Retain a transfer portal player with NIL + promises
  app.post("/api/leagues/:id/departures/retain-transfer", requireAuth, async (req, res) => {
    try {
      const { playerId, nilOffer, playerPromise, teamPromise } = req.body;
      if (!playerId) {
        return res.status(400).json({ message: "playerId is required" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "No team assigned" });

      // Use league-scoped loader so cross-league IDOR is impossible.
      const player = await loadLeagueScopedPlayer(req.params.id as string, playerId);
      if (!player || !player.pendingDeparture || player.departureType !== "transfer") {
        return res.status(400).json({ message: "Player not found or not a transfer departure" });
      }
      if (player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      if (player.retentionStatus === "retained" || player.retentionStatus === "rejected") {
        return res.status(400).json({ message: "Already processed" });
      }

      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      const offer = nilOffer || 0;
      // Validate against retention envelope when set, else total budget
      const nilRemaining = team.nilRetentionReserve != null
        ? (team.nilRetentionReserve - (team.nilRetentionSpent || 0))
        : (team.nilBudget - (team.nilSpent || 0));
      if (offer > nilRemaining) {
        const envelopeLabel = team.nilRetentionReserve != null ? "retention envelope" : "NIL budget";
        return res.status(400).json({ message: `Insufficient NIL ${envelopeLabel}. You have $${nilRemaining.toLocaleString()} remaining.` });
      }

      // Calculate retention chance
      // Sophomores are easier to retain (2 years of eligibility left); JRs are harder.
      const isSophomore = player.eligibility === "SO";
      let retentionChance = isSophomore ? 0.40 : 0.30; // base

      // Captain retention bonus (+15pp — leadership means more ties to the program)
      if (player.captainRole) {
        retentionChance += 0.15;
      }

      // NIL bonus (up to +25%)
      if (offer > 0) {
        const nilFactor = Math.min(offer / 200000, 1);
        retentionChance += 0.25 * nilFactor;
      }

      // Player promise bonus (up to +25%)
      const promiseDifficulty: Record<string, number> = {
        easy: 0.10,
        medium: 0.18,
        hard: 0.25,
      };
      if (playerPromise?.type && playerPromise?.difficulty) {
        retentionChance += promiseDifficulty[playerPromise.difficulty] || 0.10;
      }

      // Team promise bonus (up to +20%)
      const teamPromiseDifficulty: Record<string, number> = {
        easy: 0.08,
        medium: 0.14,
        hard: 0.20,
      };
      if (teamPromise?.type && teamPromise?.difficulty) {
        retentionChance += teamPromiseDifficulty[teamPromise.difficulty] || 0.08;
      }

      // Philosophy retention bonus: culture/chemistry/academics philosophies improve player loyalty
      retentionChance += calculatePhilosophyRetentionBonus(userCoach);
      // Identity culture bonus: program culture affects transfer likelihood (+2–4pp, capped via culture def)
      retentionChance += calculateIdentityRetentionBonus(userCoach);
      retentionChance = Math.min(retentionChance, 0.98);

      const roll = Math.random();
      const stayed = roll < retentionChance;

      if (stayed) {
        await storage.updatePlayer(playerId, {
          pendingDeparture: false,
          departureType: null,
          retentionStatus: "retained",
          inTransferPortal: false,
          nilOffered: offer,
        });
        if (offer > 0) {
          await storage.updateTeam(team.id, {
            nilSpent: (team.nilSpent || 0) + offer,
            nilRetentionSpent: (team.nilRetentionSpent || 0) + offer,
          });
        }

        // Create promise records if promises were made
        if (playerPromise?.type) {
          await storage.createPlayerPromise({
            leagueId: req.params.id as string,
            teamId: team.id,
            playerId,
            season: league.currentSeason + 1,
            promiseType: playerPromise.type,
            promiseCategory: "player",
            targetValue: playerPromise.targetValue || playerPromise.difficulty,
            nilAmount: 0,
          });
        }
        if (teamPromise?.type) {
          await storage.createPlayerPromise({
            leagueId: req.params.id as string,
            teamId: team.id,
            playerId,
            season: league.currentSeason + 1,
            promiseType: teamPromise.type,
            promiseCategory: "team",
            targetValue: teamPromise.targetValue || teamPromise.difficulty,
            nilAmount: 0,
          });
        }

        await storage.createAuditLog({
          leagueId: req.params.id as string,
          userId: req.session.userId,
          action: "Transfer Retention: Success",
          details: `${player.firstName} ${player.lastName} convinced to stay with $${offer.toLocaleString()} NIL${playerPromise?.type ? ` + ${playerPromise.type} promise` : ""}${teamPromise?.type ? ` + ${teamPromise.type} promise` : ""}.`,
        });
      } else {
        await storage.updatePlayer(playerId, {
          retentionStatus: "rejected",
          nilOffered: offer,
        });

        await storage.createAuditLog({
          leagueId: req.params.id as string,
          userId: req.session.userId,
          action: "Transfer Retention: Failed",
          details: `${player.firstName} ${player.lastName} rejected retention offer and will enter the transfer portal.`,
        });
      }

      res.json({
        success: stayed,
        playerId,
        playerName: `${player.firstName} ${player.lastName}`,
        nilOffer: offer,
        retentionChance: Math.round(retentionChance * 100),
      });
    } catch (error) {
      console.error("Failed to retain transfer player:", error);
      res.status(500).json({ message: "Failed to retain player" });
    }
  });

  // ─── Set or clear a team captain ─────────────────────────────────────────────
  // POST /api/leagues/:id/teams/:teamId/captain
  // Body: { playerId: string, action: 'set' | 'clear' }
  // Validates: 1 pitcher_captain + 1 fielder_captain max per team per season.
  app.post("/api/leagues/:id/teams/:teamId/captain", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, teamId } = req.params as Record<string, string>;
      const { playerId, action } = req.body as { playerId: string; action: "set" | "clear" };

      if (!playerId || !["set", "clear"].includes(action)) {
        return res.status(400).json({ message: "playerId and action ('set'|'clear') are required" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = league.commissionerId === req.session.userId ||
        (league.coCommissionerIds || []).includes(req.session.userId!);
      if (!isCommissioner && userCoach?.teamId !== teamId) {
        return res.status(403).json({ message: "Not authorized for this team" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player || player.teamId !== teamId) {
        return res.status(404).json({ message: "Player not found on this team" });
      }

      if (action === "clear") {
        await storage.updatePlayer(playerId, { captainRole: null, captainSeason: null });
        return res.json({ success: true, cleared: true });
      }

      // Determine slot: pitchers → pitcher_captain, fielders → fielder_captain
      const pitcherPositions = new Set(["P", "SP", "RP", "CP"]);
      const role = pitcherPositions.has(player.position) ? "pitcher_captain" : "fielder_captain";

      // Find existing captain in this slot and clear them first
      const roster = await storage.getPlayersByTeam(teamId);
      const existingCaptain = roster.find(p => p.captainRole === role && p.id !== playerId);
      if (existingCaptain) {
        await storage.updatePlayer(existingCaptain.id, { captainRole: null, captainSeason: null });
      }

      await storage.updatePlayer(playerId, {
        captainRole: role,
        captainSeason: league.currentSeason,
      });

      return res.json({ success: true, captainRole: role, captainSeason: league.currentSeason });
    } catch (error) {
      console.error("Failed to set captain:", error);
      res.status(500).json({ message: "Failed to set captain" });
    }
  });

  // Finalize departures - mark team as ready (does NOT advance the league phase)
  app.post("/api/leagues/:id/departures/finalize", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      if (league.currentPhase !== "offseason_departures") {
        return res.status(400).json({ message: "Not in departures phase" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "Not authorized" });

      await storage.updateTeam(userCoach.teamId, { departuresFinalized: true });

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Departures Marked Ready",
        details: `Coach marked their departures as finalized and ready to advance.`,
      });

      const teams = await storage.getTeamsByLeague(req.params.id as string);
      // Auto-pilot teams are always treated as departed-ready (CPU manages them)
      const humanTeams = teams.filter(t => !t.isCpu && !t.isAutoPilot);
      const allReady = humanTeams.every(t => t.departuresFinalized);

      res.json({ 
        success: true,
        teamMarkedReady: true,
        allTeamsReady: allReady,
        readyCount: humanTeams.filter(t => t.departuresFinalized).length,
        totalHumanTeams: humanTeams.length,
      });
    } catch (error) {
      console.error("Failed to finalize departures:", error);
      res.status(500).json({ message: "Failed to finalize departures" });
    }
  });

  // Get transfer portal players for the league
  app.get("/api/leagues/:id/transfer-portal", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const portalPlayers = await storage.getTransferPortalPlayersByLeague(req.params.id as string);
      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const teamsMap = new Map(teams.map(t => [t.id, t]));
      
      // Get user's coach for portal interests
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      let myInterests: Record<string, TransferPortalInterest> = {};
      if (userCoach?.teamId) {
        const portalInterests = await storage.getTransferPortalInterestsByTeam(userCoach.teamId);
        myInterests = Object.fromEntries(portalInterests.map(i => [i.playerId, i]));
      }

      const playersWithDetails = portalPlayers.map(player => ({
        ...player,
        originalTeam: teamsMap.get(player.teamId) || null,
        myInterest: myInterests[player.id] || null,
      }));

      res.json({
        players: playersWithDetails,
        myTeamId: userCoach?.teamId || null,
        isCommissioner: hasCommissionerAccess(league, req.session.userId),
      });
    } catch (error) {
      console.error("Failed to get transfer portal:", error);
      res.status(500).json({ message: "Failed to get transfer portal" });
    }
  });

  // Update interest in a portal player
  app.post("/api/leagues/:id/transfer-portal/:playerId/interest", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      if (!userCoach?.teamId) {
        return res.status(403).json({ message: "You must have a team to recruit from the portal" });
      }

      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player || !player.inTransferPortal) {
        return res.status(404).json({ message: "Player not found in transfer portal" });
      }

      // Check player is in this league
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === player.teamId);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Can't recruit your own player
      if (player.teamId === userCoach.teamId) {
        return res.status(400).json({ message: "Cannot recruit your own player from the portal" });
      }

      const { isTargeted, notes } = req.body as { isTargeted?: boolean; notes?: string };

      let interest = await storage.getTransferPortalInterest(req.params.playerId as string, userCoach.teamId);
      
      if (interest) {
        interest = await storage.updateTransferPortalInterest(interest.id, {
          isTargeted: isTargeted ?? interest.isTargeted,
          notes: notes !== undefined ? notes : interest.notes,
        });
      } else {
        interest = await storage.createTransferPortalInterest({
          playerId: req.params.playerId as string,
          teamId: userCoach.teamId,
          isTargeted: isTargeted ?? false,
          notes: notes || null,
        });
      }

      res.json({ success: true, interest });
    } catch (error) {
      console.error("Failed to update portal interest:", error);
      res.status(500).json({ message: "Failed to update portal interest" });
    }
  });

  // Sign player from transfer portal
  app.post("/api/leagues/:id/transfer-portal/:playerId/sign", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      if (!userCoach?.teamId) {
        return res.status(403).json({ message: "You must have a team to sign from the portal" });
      }

      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player || !player.inTransferPortal) {
        return res.status(404).json({ message: "Player not found in transfer portal" });
      }

      // Verify player is in this league
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === player.teamId);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Can't sign your own player from the portal
      if (player.teamId === userCoach.teamId) {
        return res.status(400).json({ message: "Cannot sign your own player from the portal" });
      }

      const oldTeam = await storage.getTeam(player.teamId);
      const newTeam = await storage.getTeam(userCoach.teamId);

      // Update player to new team and remove from portal
      const updated = await storage.updatePlayer(req.params.playerId as string, {
        teamId: userCoach.teamId,
        inTransferPortal: false,
        portalEntryDate: null,
        portalReason: null,
      });

      // Clean up portal interests
      await storage.deleteTransferPortalInterestsByPlayer(req.params.playerId as string);

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Transfer Portal Signing",
        details: `${player.firstName} ${player.lastName} transferred from ${oldTeam?.abbreviation || 'Unknown'} to ${newTeam?.abbreviation || 'Unknown'}`,
      });

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has signed with ${newTeam?.name || 'your team'}`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to sign portal player:", error);
      res.status(500).json({ message: "Failed to sign portal player" });
    }
  });

  // Batch update players (commissioner only)
  app.patch("/api/leagues/:id/players/batch", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit players" });
      }

      const { updates } = req.body as { updates: { id: string; changes: Record<string, unknown> }[] };
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const allowedFields = [
        'firstName', 'lastName', 'position', 'hometown', 'homeState',
        'batHand', 'throwHand', 'eligibility',
        'skinTone', 'hairColor', 'hairStyle', 'headwear',
        'overall', 'starRating',
        'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
        'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
        'velocity', 'control', 'stamina', 'stuff',
        'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
        'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchVSL', 'pitchFK', 'pitchSFF', 'pitchSHU',
        'abilities'
      ];

      // Get all teams in this league to verify player ownership
      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const leagueTeamIds = new Set(teams.map(t => t.id));

      const results = [];
      for (const update of updates) {
        const player = await storage.getPlayer(update.id);
        // Verify player exists and belongs to a team in this league
        if (player && leagueTeamIds.has(player.teamId)) {
          const sanitizedData: Record<string, unknown> = {};
          for (const key of allowedFields) {
            if (key in update.changes && key !== 'overall' && key !== 'starRating') {
              sanitizedData[key] = update.changes[key];
            }
          }
          const mergedPlayer = { ...player, ...sanitizedData };
          const positionChanged = 'position' in sanitizedData && sanitizedData['position'] !== player.position;
          if (positionChanged && !player.originalPosition) {
            sanitizedData['originalPosition'] = player.position;
          }
          // Recalculate OVR using the new (merged) position — converted players get
          // the correct positional attribute weights applied immediately.
          sanitizedData['overall'] = calculateOVR(mergedPlayer as any);
          sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall'] as number);
          const updated = await storage.updatePlayer(update.id, sanitizedData);
          results.push(updated);

          // Sync current-season stat row's position so career stats display reflects
          // the new position without waiting for the next game to be simulated.
          if (positionChanged) {
            await storage.updatePlayerSeasonStatsPosition(
              update.id,
              req.params.id as string,
              league.currentSeason,
              sanitizedData['position'] as string,
            );
          }
        }
      }

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Batch Player Edit",
        details: `Edited ${results.length} players via roster editor`,
      });

      res.json({ success: true, count: results.length });
    } catch (error) {
      console.error("Failed to batch update players:", error);
      res.status(500).json({ message: "Failed to batch update players" });
    }
  });

  // Depth chart reorder - update depth order for players at a position
  app.put("/api/leagues/:id/depth-chart", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { orders } = req.body as { orders: { playerId: string; depthOrder: number }[] };
      if (!Array.isArray(orders)) {
        return res.status(400).json({ message: "Orders must be an array" });
      }

      const teamId = userCoach?.teamId;
      for (const order of orders) {
        const player = await storage.getPlayer(order.playerId);
        if (player && (isCommissioner || player.teamId === teamId)) {
          await storage.updatePlayer(order.playerId, { depthOrder: order.depthOrder });
        }
      }

      res.json({ success: true, count: orders.length });
    } catch (error) {
      console.error("Failed to update depth chart:", error);
      res.status(500).json({ message: "Failed to update depth chart" });
    }
  });

  // Batting order - set batting order for the user's team
  app.put("/api/leagues/:id/batting-order", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { orders } = req.body as { orders: { playerId: string; battingOrder: number | null }[] };
      if (!Array.isArray(orders)) {
        return res.status(400).json({ message: "Orders must be an array" });
      }

      for (const order of orders) {
        if (order.battingOrder !== null && (order.battingOrder < 1 || order.battingOrder > 9)) {
          return res.status(400).json({ message: "Batting order must be 1-9 or null" });
        }
      }

      const usedNumbers = orders
        .map(o => o.battingOrder)
        .filter((n): n is number => n !== null);
      if (new Set(usedNumbers).size !== usedNumbers.length) {
        return res.status(400).json({ message: "Duplicate batting order numbers not allowed" });
      }

      const teamId = userCoach?.teamId;
      for (const order of orders) {
        const player = await storage.getPlayer(order.playerId);
        if (player && (isCommissioner || player.teamId === teamId)) {
          await storage.updatePlayer(order.playerId, { battingOrder: order.battingOrder });
        }
      }

      res.json({ success: true, count: orders.length });
    } catch (error) {
      console.error("Failed to update batting order:", error);
      res.status(500).json({ message: "Failed to update batting order" });
    }
  });

  // Lineup position - set the defensive position each batter plays in the lineup
  app.put("/api/leagues/:id/lineup-position", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const validPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"];
      const { assignments } = req.body as { assignments: { playerId: string; lineupPosition: string | null }[] };
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "Assignments must be an array" });
      }

      for (const a of assignments) {
        if (a.lineupPosition !== null && !validPositions.includes(a.lineupPosition)) {
          return res.status(400).json({ message: `Invalid lineup position: ${a.lineupPosition}` });
        }
      }

      const PITCHER_POS_LP = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
      const teamId = userCoach?.teamId;
      for (const a of assignments) {
        // League-scoped loader: silently skips players from other leagues.
        const player = await loadLeagueScopedPlayer(req.params.id as string, a.playerId);
        if (!player) continue;
        if (!isCommissioner && player.teamId !== teamId) continue;
        if (PITCHER_POS_LP.includes(player.position)) continue;
        await storage.updatePlayer(a.playerId, { lineupPosition: a.lineupPosition });
      }

      res.json({ success: true, count: assignments.length });
    } catch (error) {
      console.error("Failed to update lineup positions:", error);
      res.status(500).json({ message: "Failed to update lineup positions" });
    }
  });

  // Pitching roles - set pitching roles for the user's team
  app.put("/api/leagues/:id/pitching-roles", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const validRoles = ["FRI", "SAT", "SUN", "MID", "LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"];
      const { assignments } = req.body as { assignments: { playerId: string; pitchingRole: string | null }[] };
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "Assignments must be an array" });
      }

      for (const assignment of assignments) {
        if (assignment.pitchingRole !== null && !validRoles.includes(assignment.pitchingRole)) {
          return res.status(400).json({ message: `Invalid pitching role: ${assignment.pitchingRole}. Valid roles: ${validRoles.join(", ")}` });
        }
      }

      const teamId = userCoach?.teamId;
      for (const assignment of assignments) {
        const player = await storage.getPlayer(assignment.playerId);
        if (!player) continue;
        if (!isCommissioner && player.teamId !== teamId) continue;
        const PITCHER_POS_ROLES = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
        if (!PITCHER_POS_ROLES.includes(player.position)) {
          return res.status(400).json({ message: `Player ${player.firstName} ${player.lastName} is not a pitcher` });
        }
        await storage.updatePlayer(assignment.playerId, { pitchingRole: assignment.pitchingRole });
      }

      res.json({ success: true, count: assignments.length });
    } catch (error) {
      console.error("Failed to update pitching roles:", error);
      res.status(500).json({ message: "Failed to update pitching roles" });
    }
  });

  // Auto-lineup - auto-assign batting order, rotation, and bullpen
  app.post("/api/leagues/:id/auto-lineup", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      let teamId = userCoach?.teamId;
      if (!teamId && isCommissioner && req.body?.teamId) {
        const suppliedTeam = await storage.getTeam(req.body.teamId);
        if (!suppliedTeam || suppliedTeam.leagueId !== req.params.id as string) {
          return res.status(400).json({ message: "Team does not belong to this league" });
        }
        teamId = suppliedTeam.id;
      }
      if (!teamId) return res.status(400).json({ message: "No team assigned" });

      const teamPlayers = await storage.getPlayersByTeam(teamId);
      await autoAssignLineup(teamPlayers, teamId);

      const updatedRoster = await storage.getPlayersByTeam(teamId);
      res.json({ success: true, roster: updatedRoster });
    } catch (error: any) {
      console.error("Failed to auto-assign lineup:", error?.message || error);
      console.error("Stack:", error?.stack);
      res.status(500).json({ message: "Failed to auto-assign lineup" });
    }
  });

  // Coach profile route
  app.get("/api/leagues/:id/coach", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      
      // Find the coach belonging to the authenticated user
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach) {
        return res.status(404).json({ message: "No coach found for this user" });
      }

      const team = userCoach.teamId ? await storage.getTeam(userCoach.teamId) : undefined;
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Auto-assign personality/traits/philosophy/milestones on first render
      try {
        await ensureCoachTraits(userCoach);
        const fresh = await storage.getCoach(userCoach.id);
        if (fresh) { res.json({ coach: fresh, team, isOwnCoach: true }); return; }
      } catch (traitErr) {
        console.error("[coach-profile] ensureCoachTraits failed:", traitErr);
      }

      res.json({
        coach: userCoach,
        team,
        isOwnCoach: true,
      });
    } catch (error) {
      console.error("Failed to fetch coach:", error);
      res.status(500).json({ message: "Failed to fetch coach" });
    }
  });

  // Unlock a coach perk
  app.post("/api/leagues/:id/coach/upgrade-perk", requireAuth, async (req, res) => {
    try {
      const { perkId } = req.body;
      if (typeof perkId !== "string" || !perkId) {
        return res.status(400).json({ message: "perkId required" });
      }

      const { COACH_PERKS, canUnlockPerk } = await import("@shared/coachPerks");
      const perk = COACH_PERKS.find(p => p.id === perkId);
      if (!perk) return res.status(400).json({ message: "Unknown perk" });

      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      if (!userCoach) return res.status(404).json({ message: "No coach found for this user" });

      const check = canUnlockPerk(userCoach, perkId);
      if (!check.ok) return res.status(400).json({ message: check.reason });

      const currentPerks = (userCoach.perks as Record<string, boolean> | null) ?? {};
      const updatedCoach = await storage.updateCoach(userCoach.id, {
        perks: { ...currentPerks, [perkId]: true },
        skillPoints: (userCoach.skillPoints || 0) - perk.cost,
      });

      res.json({ coach: updatedCoach });
    } catch (error) {
      console.error("Failed to unlock perk:", error);
      res.status(500).json({ message: "Failed to unlock perk" });
    }
  });

  // Upgrade a coach skill (legacy — kept for backward compat)
  app.post("/api/leagues/:id/coach/upgrade-skill", requireAuth, async (req, res) => {
    try {
      const { skill } = req.body;
      const validSkills = ["scouting", "evaluation", "pitching", "hitting"];
      
      if (!validSkills.includes(skill)) {
        return res.status(400).json({ message: "Invalid skill type" });
      }
      
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach) {
        return res.status(404).json({ message: "No coach found for this user" });
      }
      
      if ((userCoach.skillPoints || 0) < 1) {
        return res.status(400).json({ message: "Not enough skill points" });
      }
      
      // Get current skill level and check max
      const skillFieldMap: Record<string, keyof typeof userCoach> = {
        scouting: "scoutingSkill",
        evaluation: "evaluationSkill",
        pitching: "pitchingRecruitingSkill",
        hitting: "hittingRecruitingSkill",
      };
      
      const skillField = skillFieldMap[skill];
      const currentLevel = (userCoach[skillField] as number) || 1;
      
      if (currentLevel >= 10) {
        return res.status(400).json({ message: "Skill already at maximum level" });
      }
      
      // Update coach
      const updatedCoach = await storage.updateCoach(userCoach.id, {
        [skillField]: currentLevel + 1,
        skillPoints: (userCoach.skillPoints || 0) - 1,
      });
      
      res.json({ coach: updatedCoach });
    } catch (error) {
      console.error("Failed to upgrade skill:", error);
      res.status(500).json({ message: "Failed to upgrade skill" });
    }
  });

  // View any coach by ID (for viewing other coaches)
  app.get("/api/coaches/:coachId", requireAuth, async (req, res) => {
    try {
      let coach = await storage.getCoach(req.params.coachId as string);
      if (!coach) {
        return res.status(404).json({ message: "Coach not found" });
      }

      try {
        await ensureCoachTraits(coach);
        coach = (await storage.getCoach(coach.id)) ?? coach;
      } catch (traitErr) {
        console.error("[coach-by-id] ensureCoachTraits failed:", traitErr);
      }

      const team = coach.teamId ? await storage.getTeam(coach.teamId) : undefined;
      const isOwnCoach = coach.userId === req.session.userId;

      // Check if requesting user is commissioner of the coach's league
      let isCommissioner = false;
      if (coach.leagueId) {
        const coachLeague = await storage.getLeague(coach.leagueId);
        if (coachLeague) {
          isCommissioner = hasCommissionerAccess(coachLeague, req.session.userId);
        }
      }

      res.json({
        coach,
        team,
        isOwnCoach,
        isCommissioner,
      });
    } catch (error) {
      console.error("Failed to fetch coach:", error);
      res.status(500).json({ message: "Failed to fetch coach" });
    }
  });

  // Coach season history by coach ID
  app.get("/api/coaches/:coachId/season-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getCoachSeasonHistory(req.params.coachId as string);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch coach season history:", error);
      res.status(500).json({ message: "Failed to fetch coach season history" });
    }
  });

  // Coach season history for the current user in a league
  app.get("/api/leagues/:id/coach/season-history", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(404).json({ message: "No coach found" });
      const history = await storage.getCoachSeasonHistory(userCoach.id);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch coach season history:", error);
      res.status(500).json({ message: "Failed to fetch coach season history" });
    }
  });

  // Recruiting record helper — builds aggregated stats from class snapshots + player history
  async function buildRecruitingRecord(coach: { id: string; teamId?: string | null; leagueId: string }) {
    const history = await storage.getCoachSeasonHistory(coach.id);
    if (history.length === 0) {
      return {
        totalSigned: 0, fiveStars: 0, fourStars: 0, threeStars: 0, twoStars: 0, oneStars: 0,
        blueChipsSigned: 0,
        avgClassRank: null as number | null, bestClassRank: null as number | null,
        topClassSeason: null as number | null, topRecruitName: null as string | null,
        topRecruitOvr: null as number | null, topRecruitStars: null as number | null,
        draftPicksDeveloped: 0, allAmericansDeveloped: 0, seasonsRecorded: 0,
        seasonHistory: [] as Array<{
          season: number; classRank: number | null; classScore: number | null;
          totalSigned: number; fiveStars: number; fourStars: number;
          threeStars: number; twoStars: number; oneStars: number;
          classStarAvg: number | null; topRecruitName: string | null; topRecruitStars: number | null;
        }>,
      };
    }

    // Aggregate from class snapshots for star breakdown
    let fiveStars = 0, fourStars = 0, threeStars = 0, twoStars = 0, oneStars = 0;
    const leagueSnaps = await storage.getRecruitingClassSnapshotsAllSeasons(coach.leagueId);

    // Season-by-season history with star breakdown from snapshots
    // Uses per-row teamId (stored at season finalization) for accurate team-season attribution
    const seasonHistory = history.map(entry => {
      const rowTeamId = entry.teamId ?? coach.teamId ?? "";
      const snap = leagueSnaps.find(s => s.teamId === rowTeamId && s.season === entry.season);
      return {
        season: entry.season,
        classRank: entry.classRank ?? null,
        classScore: entry.classScore ?? null,
        totalSigned: entry.totalSigned,
        fiveStars: snap?.fiveStars ?? 0,
        fourStars: snap?.fourStars ?? 0,
        threeStars: snap?.threeStars ?? 0,
        twoStars: snap?.twoStars ?? 0,
        oneStars: snap?.oneStars ?? 0,
        classStarAvg: entry.classStarAvg ?? null,
        topRecruitName: entry.topRecruitName ?? null,
        topRecruitStars: entry.topRecruitStars ?? null,
        recruitingScore: entry.recruitingScore ?? null,
        recruitingGrade: entry.recruitingGrade ?? null,
        recruitingBreakdown: entry.recruitingBreakdown ?? null,
      };
    }).sort((a, b) => b.season - a.season); // most recent first

    for (const entry of history) {
      const rowTeamId = entry.teamId ?? coach.teamId ?? "";
      const snap = leagueSnaps.find(s => s.teamId === rowTeamId && s.season === entry.season);
      if (snap) {
        fiveStars += snap.fiveStars;
        fourStars += snap.fourStars;
        threeStars += snap.threeStars;
        twoStars += snap.twoStars;
        oneStars += snap.oneStars;
      }
    }

    // Best recruit across all seasons
    const bestEntry = [...history].sort((a, b) => (b.topRecruitOvr ?? 0) - (a.topRecruitOvr ?? 0))[0];
    const bestClassEntry = [...history].filter(h => h.classRank != null).sort((a, b) => (a.classRank ?? 999) - (b.classRank ?? 999))[0];
    const rankedSeasons = history.filter(h => h.classRank != null);
    const avgClassRank = rankedSeasons.length > 0
      ? Math.round(rankedSeasons.reduce((s, h) => s + (h.classRank ?? 0), 0) / rankedSeasons.length)
      : null;

    // Draft picks developed — bounded to team+season windows from coach_season_history
    // This avoids overcounting inherited production from before/after coach tenure
    let draftPicksDeveloped = 0;
    let blueChipsSigned = 0;
    // Build map: teamId -> Set of seasons the coach was at that team
    const coachTeamSeasons = new Map<string, Set<number>>();
    for (const h of history) {
      const tid = h.teamId ?? coach.teamId ?? "";
      if (!tid) continue;
      if (!coachTeamSeasons.has(tid)) coachTeamSeasons.set(tid, new Set());
      coachTeamSeasons.get(tid)!.add(h.season);
    }
    if (coachTeamSeasons.size > 0) {
      const playerHist = await storage.getPlayerHistoryByLeague(coach.leagueId);
      draftPicksDeveloped = playerHist.filter(ph => {
        if (!ph.teamId || ph.draftRound == null) return false;
        const seasons = coachTeamSeasons.get(ph.teamId);
        return seasons != null && seasons.has((ph as any).season);
      }).length;
      // Blue chips signed — bounded to teams coach was at; recruits schema has no signedSeason
      // so team-match is the tightest bound possible without a schema addition
      const allRecruits = await storage.getRecruitsByLeague(coach.leagueId);
      blueChipsSigned = allRecruits.filter(r =>
        r.signedTeamId != null &&
        coachTeamSeasons.has(r.signedTeamId) &&
        r.isBlueChip === true &&
        r.starRating === 5
      ).length;
    }

    // Use stored career recruiting score (rolling weighted avg + milestone bonuses, computed at signing day)
    const coachFull = await storage.getCoach(coach.id);
    const careerRecruitingScore = coachFull?.careerRecruitingScore ?? null;

    return {
      totalSigned: history.reduce((s, h) => s + h.totalSigned, 0),
      fiveStars, fourStars, threeStars, twoStars, oneStars,
      blueChipsSigned,
      avgClassRank,
      bestClassRank: bestClassEntry?.classRank ?? null,
      topClassSeason: bestClassEntry?.season ?? null,
      topRecruitName: bestEntry?.topRecruitName ?? null,
      topRecruitOvr: bestEntry?.topRecruitOvr ?? null,
      topRecruitStars: bestEntry?.topRecruitStars ?? null,
      draftPicksDeveloped,
      allAmericansDeveloped: 0,
      seasonsRecorded: history.length,
      careerRecruitingScore,
      seasonHistory,
    };
  }

  // Recruiting record — own coach in a league
  app.get("/api/leagues/:id/coach/recruiting-record", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(404).json({ message: "No coach found" });
      const record = await buildRecruitingRecord({ id: userCoach.id, teamId: userCoach.teamId, leagueId });
      res.json(record);
    } catch (error) {
      console.error("Failed to fetch recruiting record:", error);
      res.status(500).json({ message: "Failed to fetch recruiting record" });
    }
  });

  // Recruiting record — any coach by ID
  app.get("/api/coaches/:coachId/recruiting-record", requireAuth, async (req, res) => {
    try {
      const coach = await storage.getCoach(req.params.coachId as string);
      if (!coach) return res.status(404).json({ message: "Coach not found" });
      const record = await buildRecruitingRecord({ id: coach.id, teamId: coach.teamId, leagueId: coach.leagueId });
      res.json(record);
    } catch (error) {
      console.error("Failed to fetch recruiting record:", error);
      res.status(500).json({ message: "Failed to fetch recruiting record" });
    }
  });

  // Update coach strategy (roster, geography, recruiting style, game philosophy)
  app.patch("/api/coaches/:id/strategy", requireAuth, async (req, res) => {
    try {
      const coach = await storage.getCoach(req.params.id as string);
      if (!coach) return res.status(404).json({ message: "Coach not found" });

      const league = await storage.getLeague(coach.leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isOwnCoach = coach.userId === req.session.userId;
      if (!isCommissioner && !isOwnCoach) {
        return res.status(403).json({ message: "You can only edit your own strategy." });
      }

      const validRosterStrategies = ["pitching_first", "contact_hitting", "power_hitting", "speed_defense", "balanced"];
      const validGeographyStrategies = ["local_regional", "texas", "california", "florida", "national"];
      const validStyleStrategies = ["all_in_few", "spread_wide", "top_prospects", "high_potential", "best_available"];
      const validPhilosophyStrategies = ["small_ball", "power_ball", "aggressive", "conservative", "balanced"];

      const { rosterStrategy, recruitingGeographyStrategy, recruitingStyleStrategy, gamePhilosophyStrategy } = req.body;
      const update: Record<string, string> = {};

      if (rosterStrategy !== undefined) {
        if (!validRosterStrategies.includes(rosterStrategy)) return res.status(400).json({ message: "Invalid roster strategy" });
        update.rosterStrategy = rosterStrategy;
      }
      if (recruitingGeographyStrategy !== undefined) {
        if (!validGeographyStrategies.includes(recruitingGeographyStrategy)) return res.status(400).json({ message: "Invalid geography strategy" });
        update.recruitingGeographyStrategy = recruitingGeographyStrategy;
      }
      if (recruitingStyleStrategy !== undefined) {
        if (!validStyleStrategies.includes(recruitingStyleStrategy)) return res.status(400).json({ message: "Invalid recruiting style" });
        update.recruitingStyleStrategy = recruitingStyleStrategy;
      }
      if (gamePhilosophyStrategy !== undefined) {
        if (!validPhilosophyStrategies.includes(gamePhilosophyStrategy)) return res.status(400).json({ message: "Invalid game philosophy" });
        update.gamePhilosophyStrategy = gamePhilosophyStrategy;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid strategy fields provided" });
      }

      const updated = await storage.updateCoach(coach.id, update as any);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update coach strategy:", error);
      res.status(500).json({ message: "Failed to update coach strategy" });
    }
  });

  // Power Rankings — star/attribute-based team strength ranking
  app.get("/api/leagues/:id/power-rankings", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const userTeamId = userCoach?.teamId ?? null;

      const allPlayers = await storage.getPlayersByLeague(leagueId);
      const allRecruits = await storage.getRecruitsByLeague(leagueId);

      // Group players by team
      const playersByTeam = new Map<string, typeof allPlayers>();
      for (const p of allPlayers) {
        if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
        playersByTeam.get(p.teamId)!.push(p);
      }

      // Group signed recruits by team
      const signedByTeam = new Map<string, typeof allRecruits>();
      for (const r of allRecruits) {
        if (r.signedTeamId) {
          if (!signedByTeam.has(r.signedTeamId)) signedByTeam.set(r.signedTeamId, []);
          signedByTeam.get(r.signedTeamId)!.push(r);
        }
      }

      const avgNums = (nums: number[]): number =>
        nums.length === 0 ? 0 : Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);

      const PITCHER_POS_SET = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);

      // Build raw data per team
      const teamData = leagueTeams.map(team => {
        const players = playersByTeam.get(team.id) || [];
        const pitchers = players.filter(p => PITCHER_POS_SET.has(p.position));
        const hitters = players.filter(p => !PITCHER_POS_SET.has(p.position));
        const signed = signedByTeam.get(team.id) || [];

        const avgOvr = avgNums(players.map(p => p.overall));
        const hitterAvgOvr = avgNums(hitters.map(p => p.overall));
        const pitcherAvgOvr = avgNums(pitchers.map(p => p.overall));
        const recruitingScore = avgNums(signed.map(r => r.overall));

        return {
          teamId: team.id,
          teamName: team.name,
          mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          isCpu: team.isCpu,
          avgOvr,
          hitterAvgOvr,
          pitcherAvgOvr,
          recruitingScore,
          hasSignedRecruits: signed.length > 0,
        };
      }).sort((a, b) => b.avgOvr - a.avgOvr);

      const n = teamData.length;

      const computePercentile = (vals: number[], val: number): number => {
        const sorted = [...vals].sort((a, b) => a - b);
        const rank = sorted.filter(v => v < val).length;
        return n <= 1 ? 100 : Math.round((rank / (n - 1)) * 100);
      };

      const ovrVals = teamData.map(t => t.avgOvr);
      const hitVals = teamData.map(t => t.hitterAvgOvr);
      const pitchVals = teamData.map(t => t.pitcherAvgOvr);
      const recruVals = teamData.map(t => t.recruitingScore);

      // Build previous-rank lookup from the stored snapshot (set at each week advance)
      const prevRankings = (league.prevPowerRankings as { teamId: string; rank: number }[] | null) ?? [];
      const prevRankMap = new Map(prevRankings.map(r => [r.teamId, r.rank]));

      const rankings = teamData.map((t, i) => {
        const currentRank = i + 1;
        const prevRank = prevRankMap.get(t.teamId);
        const rankDelta = prevRank != null ? prevRank - currentRank : null;
        return {
          rank: currentRank,
          rankDelta,
          ...t,
          ovrPercentile: computePercentile(ovrVals, t.avgOvr),
          hitterPercentile: computePercentile(hitVals, t.hitterAvgOvr),
          pitcherPercentile: computePercentile(pitchVals, t.pitcherAvgOvr),
          recruitingPercentile: computePercentile(recruVals, t.recruitingScore),
        };
      });

      res.json({ rankings, userTeamId });
    } catch (error) {
      console.error("Failed to fetch power rankings:", error);
      res.status(500).json({ message: "Failed to fetch power rankings" });
    }
  });

  // Top 100 MLB Prospects
  app.get("/api/leagues/:id/top-prospects", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [allPlayers, leagueTeams] = await Promise.all([
        storage.getPlayersByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
      ]);

      const teamMap = new Map(leagueTeams.map(t => [t.id, t]));
      const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);

      const activePlayers = allPlayers.filter(p => !p.pendingDeparture && !p.declaredForDraft);

      const withTeam = activePlayers.map(p => {
        const team = teamMap.get(p.teamId);
        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          eligibility: p.eligibility,
          overall: p.overall ?? 0,
          starRating: p.starRating ?? 1,
          batHand: p.batHand ?? "R",
          throwHand: p.throwHand ?? "R",
          teamId: p.teamId,
          teamName: team?.name ?? "Unknown",
          teamAbbreviation: team?.abbreviation ?? "???",
          teamPrimaryColor: team?.primaryColor ?? "#666",
          teamSecondaryColor: team?.secondaryColor ?? "#999",
          category: PITCHER_POSITIONS.has(p.position) ? "pitcher" : "hitter",
        };
      });

      const hitters = withTeam
        .filter(p => p.category === "hitter")
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 100);

      const pitchers = withTeam
        .filter(p => p.category === "pitcher")
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 100);

      res.json({ hitters, pitchers, currentSeason: league.currentSeason ?? 1 });
    } catch (error) {
      console.error("Failed to fetch top prospects:", error);
      res.status(500).json({ message: "Failed to fetch top prospects" });
    }
  });

  // League stats - aggregate batting/pitching from box scores
  app.get("/api/leagues/:id/stats", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      let season = req.query.season as string ? parseInt(req.query.season as string) : league.currentSeason;
      const allGames = await storage.getGamesByLeague(req.params.id as string);
      let seasonGames = allGames.filter(g => g.season === season && g.isComplete && g.boxScore);
      
      if (seasonGames.length === 0 && !(req.query.season as string) && season > 1) {
        season = season - 1;
        seasonGames = allGames.filter(g => g.season === season && g.isComplete && g.boxScore);
      }
      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const teamsMap = new Map(teams.map(t => [t.id, t]));

      interface BatterAgg {
        name: string; playerId: string; teamId: string; games: number; ab: number; r: number; h: number;
        doubles: number; triples: number; hr: number; rbi: number; bb: number; hbp: number; so: number; sb: number;
        cs: number; exitVeloTotal: number; barrels: number; ballsInPlay: number; hardHits: number;
        putouts: number; assists: number; fieldingErrors: number; totalChances: number;
      }
      interface PitcherAgg {
        name: string; playerId: string; teamId: string; games: number; ip: number; h: number; r: number; er: number;
        bb: number; so: number; hr: number; wins: number; losses: number;
        totalPitches: number; whiffs: number; spinRateTotal: number;
      }
      interface TeamAgg {
        teamId: string; games: number; runsScored: number; runsAllowed: number; hits: number; hitsAllowed: number;
        totalAB: number; totalBB: number; totalSO: number; totalHR: number; totalDoubles: number; totalTriples: number;
        totalHBP: number; totalSB: number; errors: number;
      }

      const batters = new Map<string, BatterAgg>();
      const pitchers = new Map<string, PitcherAgg>();
      const teamStats = new Map<string, TeamAgg>();

      for (const game of seasonGames) {
        let box: any;
        try { box = JSON.parse(game.boxScore!); } catch { continue; }
        if (!box.home || !box.away) continue;

        const sides = [
          { data: box.home, teamId: game.homeTeamId, oppTeamId: game.awayTeamId, isHome: true },
          { data: box.away, teamId: game.awayTeamId, oppTeamId: game.homeTeamId, isHome: false },
        ];

        for (const side of sides) {
          const tKey = side.teamId;
          if (!teamStats.has(tKey)) {
            teamStats.set(tKey, {
              teamId: tKey, games: 0, runsScored: 0, runsAllowed: 0, hits: 0, hitsAllowed: 0,
              totalAB: 0, totalBB: 0, totalSO: 0, totalHR: 0, totalDoubles: 0, totalTriples: 0,
              totalHBP: 0, totalSB: 0, errors: 0,
            });
          }
          const ts = teamStats.get(tKey)!;
          ts.games++;
          const teamScore = side.isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
          const oppScore = side.isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
          ts.runsScored += teamScore;
          ts.runsAllowed += oppScore;
          ts.errors += side.data.errors || 0;

          if (side.data.batting) {
            for (const b of side.data.batting) {
              ts.totalAB += b.ab || 0;
              ts.hits += b.h || 0;
              ts.totalBB += b.bb || 0;
              ts.totalSO += b.so || 0;
              ts.totalHR += b.hr || 0;
              ts.totalDoubles += b.doubles || 0;
              ts.totalTriples += b.triples || 0;
              ts.totalHBP += b.hbp || 0;
              ts.totalSB += b.sb || 0;

              const bKey = `${b.name}_${side.teamId}`;
              if (!batters.has(bKey)) {
                batters.set(bKey, {
                  name: b.name, playerId: b.playerId || "", teamId: side.teamId, games: 0, ab: 0, r: 0, h: 0,
                  doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0,
                  cs: 0, exitVeloTotal: 0, barrels: 0, ballsInPlay: 0, hardHits: 0,
                  putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
                });
              }
              const ba = batters.get(bKey)!;
              ba.games++;
              ba.ab += b.ab || 0;
              ba.r += b.r || 0;
              ba.h += b.h || 0;
              ba.doubles += b.doubles || 0;
              ba.triples += b.triples || 0;
              ba.hr += b.hr || 0;
              ba.rbi += b.rbi || 0;
              ba.bb += b.bb || 0;
              ba.hbp += b.hbp || 0;
              ba.so += b.so || 0;
              ba.sb += b.sb || 0;
              ba.cs += b.cs || 0;
              ba.exitVeloTotal += b.exitVelo || 0;
              ba.barrels += b.barrels || 0;
              ba.ballsInPlay += b.ballsInPlay || 0;
              ba.hardHits += b.hardHits || 0;
              ba.putouts += b.putouts || 0;
              ba.assists += b.assists || 0;
              ba.fieldingErrors += b.fieldingErrors || 0;
              ba.totalChances += b.totalChances || 0;
            }
          }

          if (side.data.pitching) {
            for (const p of side.data.pitching) {
              ts.hitsAllowed += p.h || 0;
              const pKey = `${p.name}_${side.teamId}`;
              if (!pitchers.has(pKey)) {
                pitchers.set(pKey, {
                  name: p.name, playerId: p.playerId || "", teamId: side.teamId, games: 0, ip: 0, h: 0, r: 0, er: 0,
                  bb: 0, so: 0, hr: 0, wins: 0, losses: 0,
                  totalPitches: 0, whiffs: 0, spinRateTotal: 0,
                });
              }
              const pa = pitchers.get(pKey)!;
              pa.games++;
              const ipParts = String(p.ip).split(".");
              const fullInnings = parseInt(ipParts[0]) || 0;
              const partialInnings = parseInt(ipParts[1]) || 0;
              pa.ip += fullInnings + partialInnings / 3;
              pa.h += p.h || 0;
              pa.r += p.r || 0;
              pa.er += p.er || 0;
              pa.bb += p.bb || 0;
              pa.so += p.so || 0;
              pa.hr += p.hr || 0;
              pa.totalPitches += p.totalPitches || 0;
              pa.whiffs += p.whiffs || 0;
              pa.spinRateTotal += p.spinRate || 0;
            }

            if (side.data.pitching.length > 0) {
              const starter = side.data.pitching[0];
              const sKey = `${starter.name}_${side.teamId}`;
              const pa = pitchers.get(sKey);
              if (pa) {
                const teamScore = side.isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
                const oppScore = side.isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
                if (teamScore > oppScore) pa.wins++;
                else pa.losses++;
              }
            }
          }
        }
      }

      const FIP_CONSTANT = 3.10;
      const LEAGUE_AVG_RPG = 4.5;

      const battingLeaders = Array.from(batters.values())
        .filter(b => b.ab >= 10)
        .map(b => {
          const avg = b.ab > 0 ? b.h / b.ab : 0;
          const obp = (b.ab + b.bb + b.hbp) > 0 ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp) : 0;
          const singles = b.h - b.doubles - b.triples - b.hr;
          const totalBases = singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
          const slg = b.ab > 0 ? totalBases / b.ab : 0;
          const ops = obp + slg;
          const wOBA = (b.ab + b.bb + b.hbp) > 0
            ? (0.69 * b.bb + 0.72 * b.hbp + 0.89 * singles + 1.27 * b.doubles + 1.62 * b.triples + 2.10 * b.hr) / (b.ab + b.bb + b.hbp)
            : 0;
          const wRAA = ((wOBA - 0.320) / 1.25) * (b.ab + b.bb + b.hbp);
          const battingWar = wRAA / 10;

          const babip = (b.ab - b.so - b.hr) > 0 ? (b.h - b.hr) / (b.ab - b.so - b.hr) : 0;

          const leagueWOBA = 0.320;
          const wOBAScale = 1.25;
          const lgRPA = 0.12;
          const wRCplus = lgRPA > 0 ? ((((wOBA - leagueWOBA) / wOBAScale) + lgRPA) / lgRPA) * 100 : 100;

          const lgOBP = 0.320;
          const lgSLG = 0.410;
          const opsPlus = obp > 0 || slg > 0 ? Math.round(100 * (obp / lgOBP + slg / lgSLG - 1)) : 0;

          const avgExitVelo = b.games > 0 ? b.exitVeloTotal / b.games : 0;
          const barrelPct = b.ballsInPlay > 0 ? (b.barrels / b.ballsInPlay) * 100 : 0;
          const hardHitPct = b.ballsInPlay > 0 ? (b.hardHits / b.ballsInPlay) * 100 : 0;

          const fldPct = b.totalChances > 0 ? (b.putouts + b.assists) / b.totalChances : 0;
          const lgFldPct = 0.970;
          const oaa = Math.round((fldPct - lgFldPct) * b.totalChances * 0.5);
          const drs = Math.round((fldPct - lgFldPct) * b.totalChances * 0.7 + (b.assists * 0.05));

          return {
            ...b,
            avg: avg.toFixed(3),
            obp: obp.toFixed(3),
            slg: slg.toFixed(3),
            ops: ops.toFixed(3),
            war: Math.max(0, battingWar).toFixed(1),
            babip: babip.toFixed(3),
            wOBA: wOBA.toFixed(3),
            wRCplus: Math.round(Math.max(0, wRCplus)),
            opsPlus: Math.max(0, opsPlus),
            avgExitVelo: avgExitVelo.toFixed(1),
            barrelPct: barrelPct.toFixed(1),
            hardHitPct: hardHitPct.toFixed(1),
            oaa,
            drs,
            fldPct: fldPct.toFixed(3),
            cs: b.cs,
            teamAbbr: teamsMap.get(b.teamId)?.abbreviation || "???",
            teamColor: teamsMap.get(b.teamId)?.primaryColor || "#666",
          };
        });

      const pitchingLeaders = Array.from(pitchers.values())
        .filter(p => p.ip >= 3)
        .map(p => {
          const era = p.ip > 0 ? (p.er * 9) / p.ip : 0;
          const fip = p.ip > 0 ? ((13 * p.hr + 3 * p.bb - 2 * p.so) / p.ip) + FIP_CONSTANT : 0;
          const whip = p.ip > 0 ? (p.bb + p.h) / p.ip : 0;
          const kPer9 = p.ip > 0 ? (p.so * 9) / p.ip : 0;
          const bbPer9 = p.ip > 0 ? (p.bb * 9) / p.ip : 0;
          const raaPitch = p.ip > 0 ? ((LEAGUE_AVG_RPG / 9 - era / 9) * p.ip) : 0;
          const pitchingWar = raaPitch / 10;

          const bfApprox = Math.round(p.ip * 3 + p.h + p.bb);
          const kPct = bfApprox > 0 ? (p.so / bfApprox) * 100 : 0;
          const bbPct = bfApprox > 0 ? (p.bb / bfApprox) * 100 : 0;
          const whiffRate = p.totalPitches > 0 ? (p.whiffs / p.totalPitches) * 100 : 0;
          const siera = p.ip > 0 ? (era * 0.6 + fip * 0.4) : 0;
          const avgSpinRate = p.games > 0 ? Math.round(p.spinRateTotal / p.games) : 0;

          return {
            ...p,
            ipDisplay: `${Math.floor(p.ip)}.${Math.round((p.ip % 1) * 3)}`,
            era: era.toFixed(2),
            fip: Math.max(0, fip).toFixed(2),
            whip: whip.toFixed(2),
            kPer9: kPer9.toFixed(1),
            bbPer9: bbPer9.toFixed(1),
            war: Math.max(0, pitchingWar).toFixed(1),
            kPct: kPct.toFixed(1),
            bbPct: bbPct.toFixed(1),
            whiffRate: whiffRate.toFixed(1),
            siera: Math.max(0, siera).toFixed(2),
            avgSpinRate,
            totalPitches: p.totalPitches,
            teamAbbr: teamsMap.get(p.teamId)?.abbreviation || "???",
            teamColor: teamsMap.get(p.teamId)?.primaryColor || "#666",
          };
        });

      const teamStatsArray = Array.from(teamStats.values()).map(ts => {
        const battingAvg = ts.totalAB > 0 ? ts.hits / ts.totalAB : 0;
        const singles = ts.hits - ts.totalDoubles - ts.totalTriples - ts.totalHR;
        const totalBases = singles + ts.totalDoubles * 2 + ts.totalTriples * 3 + ts.totalHR * 4;
        const slg = ts.totalAB > 0 ? totalBases / ts.totalAB : 0;
        const obp = (ts.totalAB + ts.totalBB + ts.totalHBP) > 0
          ? (ts.hits + ts.totalBB + ts.totalHBP) / (ts.totalAB + ts.totalBB + ts.totalHBP) : 0;
        const ops = obp + slg;

        return {
          ...ts,
          teamName: teamsMap.get(ts.teamId)?.name || "Unknown",
          teamAbbr: teamsMap.get(ts.teamId)?.abbreviation || "???",
          teamColor: teamsMap.get(ts.teamId)?.primaryColor || "#666",
          battingAvg: battingAvg.toFixed(3),
          obp: obp.toFixed(3),
          slg: slg.toFixed(3),
          ops: ops.toFixed(3),
          rpg: ts.games > 0 ? (ts.runsScored / ts.games).toFixed(1) : "0.0",
          rapg: ts.games > 0 ? (ts.runsAllowed / ts.games).toFixed(1) : "0.0",
        };
      });

      res.json({
        season,
        battingLeaders,
        pitchingLeaders,
        teamStats: teamStatsArray.sort((a, b) => parseFloat(b.battingAvg) - parseFloat(a.battingAvg)),
        totalGames: seasonGames.length,
      });
    } catch (error) {
      console.error("Failed to fetch league stats:", error);
      res.status(500).json({ message: "Failed to fetch league stats" });
    }
  });

}
