/**
 * Roster and player management routes.
 *
 * Endpoints:
 *   GET  /api/leagues/:id/roster                           — team roster
 *   GET  /api/leagues/:id/pitcher-availability             — pitcher rest slots
 *   GET  /api/leagues/:id/players/:playerId                — single player profile
 *   PATCH /api/leagues/:id/players/:playerId               — commissioner bulk-edit
 *   POST  /api/leagues/:id/players/:playerId/declare-draft — draft declaration
 *   POST  /api/leagues/:id/players/:playerId/enter-portal  — transfer portal entry
 *   GET  /api/leagues/:id/players-leaving                  — departure summary
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireLeagueMember, hasCommissionerAccess } from "../route-helpers";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";

// ── Player PATCH allowlists ───────────────────────────────────────────────────
//
// Two separate strict schemas guard the commissioner bulk-edit endpoint:
//
//  • playerIdentityPatchSchema  — structural/identity fields (position, eligibility).
//    No impact on game-balance computations.
//
//  • playerCompetitivePatchSchema — game-balance fields (attributes, abilities,
//    pitch mix, potential).  Changing these directly affects simulation outcomes.
//
// The PATCH handler validates against a merged strict schema so both groups can
// be updated in a single request, but unknown/forbidden fields (e.g. teamId,
// overall, leagueId, pendingDeparture) always return 400.

/** Identity / structural fields — non-competitive (name, jersey, appearance, eligibility). */
export const playerIdentityPatchSchema = z.object({
  firstName:   z.string().min(1).max(50).optional(),
  lastName:    z.string().min(1).max(50).optional(),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  homeState:   z.string().max(30).optional(),
  hometown:    z.string().max(80).optional(),
  position:    z.string().max(10).optional(),
  eligibility: z.enum(["FR", "SO", "JR", "SR"]).optional(),
}).strict();

/** Competitive / game-balance fields — affects simulation outcomes. */
export const playerCompetitivePatchSchema = z.object({
  abilities:       z.array(z.string()).optional(),
  potential:       z.number().int().min(0).max(100).optional(),
  // Hitter attributes
  hitForAvg:       z.number().int().min(0).max(100).optional(),
  power:           z.number().int().min(0).max(100).optional(),
  speed:           z.number().int().min(0).max(100).optional(),
  arm:             z.number().int().min(0).max(100).optional(),
  fielding:        z.number().int().min(0).max(100).optional(),
  errorResistance: z.number().int().min(0).max(100).optional(),
  clutch:          z.number().int().min(0).max(100).optional(),
  vsLHP:           z.number().int().min(0).max(100).optional(),
  grit:            z.number().int().min(0).max(100).optional(),
  stealing:        z.number().int().min(0).max(100).optional(),
  running:         z.number().int().min(0).max(100).optional(),
  throwing:        z.number().int().min(0).max(100).optional(),
  recovery:        z.number().int().min(0).max(100).optional(),
  catcherAbility:  z.number().int().min(0).max(100).optional(),
  // Pitcher attributes
  velocity:        z.number().int().min(0).max(100).optional(),
  control:         z.number().int().min(0).max(100).optional(),
  stamina:         z.number().int().min(0).max(100).optional(),
  stuff:           z.number().int().min(0).max(100).optional(),
  wRISP:           z.number().int().min(0).max(100).optional(),
  vsLefty:         z.number().int().min(0).max(100).optional(),
  poise:           z.number().int().min(0).max(100).optional(),
  heater:          z.number().int().min(0).max(100).optional(),
  agile:           z.number().int().min(0).max(100).optional(),
  // Pitch mix (0-7 per pitch)
  pitchFB:         z.number().int().min(0).max(7).optional(),
  pitch2S:         z.number().int().min(0).max(7).optional(),
  pitchSL:         z.number().int().min(0).max(7).optional(),
  pitchCB:         z.number().int().min(0).max(7).optional(),
  pitchCH:         z.number().int().min(0).max(7).optional(),
  pitchCT:         z.number().int().min(0).max(7).optional(),
  pitchSNK:        z.number().int().min(0).max(7).optional(),
  pitchSPL:        z.number().int().min(0).max(7).optional(),
  pitchSHU:        z.number().int().min(0).max(7).optional(),
  pitchCCH:        z.number().int().min(0).max(7).optional(),
  pitchHSL:        z.number().int().min(0).max(7).optional(),
  pitchSWP:        z.number().int().min(0).max(7).optional(),
  pitchKN:         z.number().int().min(0).max(7).optional(),
  pitchVSL:        z.number().int().min(0).max(7).optional(),
  pitchSFF:        z.number().int().min(0).max(7).optional(),
  pitchFK:         z.number().int().min(0).max(7).optional(),
  pitchSCB:        z.number().int().min(0).max(7).optional(),
  pitchPCB:        z.number().int().min(0).max(7).optional(),
}).strict();

// Combined handler schema: accepts either or both groups; rejects everything else.
// Built from the two allowlists' .shape so the merged result is also strict.
const playerPatchSchema = z.object({
  ...playerIdentityPatchSchema.shape,
  ...playerCompetitivePatchSchema.shape,
}).strict();
import { ALL_GAME_DAYS, computeWeeklyAvailability } from "@shared/pitcherRest";
import type { GameDay } from "@shared/pitcherRest";
import type { Player } from "@shared/schema";
import {
  generateDraftDeclarationNewsArticle,
  generateTransferPortalNewsArticle,
} from "../news-engine";
import { invalidateLeague } from "../cache";

export function registerRosterRoutes(app: Express): void {
  app.get("/api/leagues/:id/roster", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const requestedTeamId = req.query.teamId as string | undefined;
      
      let team;
      if (requestedTeamId) {
        team = leagueTeams.find((t) => t.id === requestedTeamId);
        if (!team) {
          return res.status(404).json({ message: "Team not found" });
        }
      } else {
        const userId = req.session.userId;
        const coaches = await storage.getCoachesByLeague(req.params.id as string);
        const userCoach = coaches.find((c) => c.userId === userId);
        team = userCoach?.teamId ? leagueTeams.find((t) => t.id === userCoach.teamId) : undefined;
      }
      
      if (!team) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const teamPlayers = await storage.getPlayersByTeam(team.id);
      
      // Filter out players who have declared for the draft or are otherwise flagged as departing
      const activePlayers = teamPlayers.filter(p => !p.declaredForDraft && !p.pendingDeparture);

      res.json({
        players: activePlayers,
        team: team,
      });
    } catch (error) {
      console.error("Failed to fetch roster:", error);
      res.status(500).json({ message: "Failed to fetch roster" });
    }
  });

  // Pitcher availability endpoint
  app.get("/api/leagues/:id/pitcher-availability", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.query.teamId as string | undefined;
      const userId = req.session.userId;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const isCommissioner = hasCommissionerAccess(league, userId);

      let targetTeamId = teamId;
      if (!targetTeamId) {
        const coaches = await storage.getCoachesByLeague(leagueId);
        const userCoach = coaches.find(c => c.userId === userId);
        const leagueTeams = await storage.getTeamsByLeague(leagueId);
        const userTeam = userCoach?.teamId ? leagueTeams.find(t => t.id === userCoach.teamId) : undefined;
        targetTeamId = userTeam?.id;
      } else if (!isCommissioner) {
        const coaches = await storage.getCoachesByLeague(leagueId);
        const userCoach = coaches.find(c => c.userId === userId);
        if (!userCoach || userCoach.teamId !== targetTeamId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      if (!targetTeamId) return res.status(400).json({ message: "No team found" });

      const players = await storage.getPlayersByTeam(targetTeamId);
      const pitchers = players.filter(p => p.position === "P" && !p.pendingDeparture && !p.declaredForDraft);
      const currentWeek = league.currentWeek ?? 1;

      const result = pitchers.map(p => {
        const slots: Record<string, unknown> = {};
        for (const day of ALL_GAME_DAYS) {
          slots[day] = computeWeeklyAvailability(
            p.lastPitchedOuts ?? 0,
            p.lastPitchedWeek ?? null,
            (p.lastPitchedDay ?? null) as GameDay | null,
            p.stamina ?? 50,
            currentWeek,
          )[day];
        }
        return {
          playerId: p.id,
          name: `${p.firstName} ${p.lastName}`,
          pitchingRole: p.pitchingRole ?? null,
          lastPitchedOuts: p.lastPitchedOuts ?? 0,
          lastPitchedWeek: p.lastPitchedWeek ?? null,
          lastPitchedDay: p.lastPitchedDay ?? null,
          stamina: p.stamina ?? 50,
          slots,
        };
      });

      res.json({ currentWeek, pitchers: result });
    } catch (error) {
      console.error("Failed to fetch pitcher availability:", error);
      res.status(500).json({ message: "Failed to fetch pitcher availability" });
    }
  });

  // Get single player by id
  app.get("/api/leagues/:id/players/:playerId", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player) return res.status(404).json({ message: "Player not found" });
      res.json(player);
    } catch (error) {
      console.error("Failed to fetch player:", error);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  // Update player (commissioner only)
  app.patch("/api/leagues/:id/players/:playerId", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit players" });
      }

      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Enforce league scoping: verify the player's team belongs to this league
      const playerTeamForScope = await storage.getTeam(player.teamId);
      if (!playerTeamForScope || playerTeamForScope.leagueId !== req.params.id as string) {
        return res.status(403).json({ message: "Player does not belong to this league" });
      }

      // Build a field-by-field change summary for the audit log
      const EDITABLE_FIELD_LABELS: Record<string, string> = {
        position: "Position", eligibility: "Eligibility", potential: "Potential",
        hitForAvg: "Contact", power: "Power", speed: "Speed", arm: "Arm",
        fielding: "Fielding", errorResistance: "Error Res", clutch: "Clutch",
        vsLHP: "vs LHP", grit: "Grit", stealing: "Stealing", running: "Running",
        throwing: "Throwing", recovery: "Recovery", catcherAbility: "Catcher",
        velocity: "Velocity", control: "Control", stamina: "Stamina", stuff: "Stuff",
        wRISP: "W/RISP", vsLefty: "vs Lefty", poise: "Poise", heater: "Heater",
        agile: "Agile", abilities: "Abilities",
      };
      const changeSummary: string[] = [];
      for (const [field, label] of Object.entries(EDITABLE_FIELD_LABELS)) {
        const body = req.body as Record<string, unknown>;
        if (!(field in body)) continue;
        const oldVal = (player as Record<string, unknown>)[field];
        const newVal = body[field];
        const oldStr = Array.isArray(oldVal) ? (oldVal as string[]).join(", ") || "none" : String(oldVal ?? "");
        const newStr = Array.isArray(newVal) ? (newVal as string[]).join(", ") || "none" : String(newVal ?? "");
        if (oldStr !== newStr) {
          changeSummary.push(`${label}: ${oldStr} → ${newStr}`);
        }
      }

      // Parse and strip to the strict allowlist — drops any unknown keys from req.body.
      const patchParsed = playerPatchSchema.safeParse(req.body);
      if (!patchParsed.success) {
        return res.status(400).json({ message: "Invalid player update fields", errors: patchParsed.error.flatten() });
      }
      const patchData = patchParsed.data;

      const mergedPlayer = { ...player, ...patchData };
      // Recalculate OVR using the new (merged) position — converted players get the
      // correct positional attribute weights applied immediately.
      const recalcedOverall = calculateOVR(mergedPlayer);
      const recalcedStar = getStarRatingFromOVR(recalcedOverall);
      const positionChanged = patchData.position != null && patchData.position !== player.position;
      const shouldSetOriginal = positionChanged && !player.originalPosition;
      const updated = await storage.updatePlayer(req.params.playerId as string, {
        ...patchData,
        overall: recalcedOverall,
        starRating: recalcedStar,
        ...(shouldSetOriginal ? { originalPosition: player.position } : {}),
      });

      // Sync the current-season stat row's position so the career stats display
      // immediately reflects the new position after conversion.
      if (positionChanged) {
        await storage.updatePlayerSeasonStatsPosition(
          req.params.playerId as string,
          req.params.id as string,
          league.currentSeason,
          req.body.position,
        );
      }

      // Use the already-fetched team for the richer audit entry
      const playerTeamName = playerTeamForScope.name ?? "Unknown Team";
      const playerName = `${player.firstName} ${player.lastName}`;
      const changeDetail = changeSummary.length > 0
        ? changeSummary.join("; ")
        : "No attribute changes";

      const auditDetails = `Commissioner edited ${playerName} (${playerTeamName}): ${changeDetail}`;

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Roster Edit",
        details: auditDetails,
      });

      // Also surface in the activity feed so all coaches see the edit in the News tab
      await storage.createLeagueEvent({
        leagueId: req.params.id as string,
        eventType: "roster_edit" as any,        description: `Commissioner edited ${playerName} (${playerTeamName}). Changes: ${changeDetail}`,
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to update player:", error);
      res.status(500).json({ message: "Failed to update player" });
    }
  });

  // Declare player for draft (commissioner or owning coach)
  app.post("/api/leagues/:id/players/:playerId/declare-draft", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if player's team belongs to this league
      const team = await storage.getTeam(player.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Verify team belongs to the league in the URL
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === team.id);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Check if user is commissioner or owns this player's team
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isTeamCoach = userCoach && team && userCoach.teamId === team.id;
      
      if (!isCommissioner && !isTeamCoach) {
        return res.status(403).json({ message: "Only the commissioner or team coach can declare players for draft" });
      }

      // Check eligibility: must be RS (redshirt) and at least sophomore level with high skill
      // RS eligibility format: "RS" for redshirt freshmen who haven't played
      // High skill = 4 or 5 star rating OR overall >= 500
      const isRedshirt = player.eligibility === "RS";
      const isHighSkill = player.starRating >= 4 || player.overall >= 500;
      
      // For RS sophomores - eligibility would still show RS but they've had a year
      // In reality, RS players who are sophomores or higher (played 2+ years) can declare
      // Since we use RS as a blanket term, we'll check for high skill + RS eligibility
      
      if (!isRedshirt) {
        return res.status(400).json({ 
          message: "Only redshirt players can declare for the draft early" 
        });
      }

      if (!isHighSkill) {
        return res.status(400).json({ 
          message: "Only high-skill players (4+ stars or 500+ overall) can declare for the draft" 
        });
      }

      if (player.declaredForDraft) {
        return res.status(400).json({ message: "Player has already declared for the draft" });
      }

      // Update player to mark as declared for draft
      const updated = await storage.updatePlayer(req.params.playerId as string, {
        declaredForDraft: true,
        draftDeclarationDate: new Date(),
      });

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Draft Declaration",
        details: `${player.firstName} ${player.lastName} (${team?.abbreviation || 'Unknown'}) declared for the MLB Draft`,
      });

      try {
        const leagueForEvent = await storage.getLeague(req.params.id as string);
        await storage.createLeagueEvent({
          leagueId: req.params.id as string,
          teamId: team?.id,
          teamName: team?.name,
          teamAbbreviation: team?.abbreviation,
          eventType: "DRAFT",
          description: `${player.firstName} ${player.lastName} (${player.position}, ${team?.abbreviation || "UNK"}) declared for the MLB Draft`,
          season: leagueForEvent?.currentSeason || 1,
          week: leagueForEvent?.currentWeek || 1,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has declared for the MLB Draft`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to declare player for draft:", error);
      res.status(500).json({ message: "Failed to declare player for draft" });
    }
  });

  // Enter player into transfer portal (commissioner or owning coach)
  app.post("/api/leagues/:id/players/:playerId/enter-portal", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const player = await storage.getPlayer(req.params.playerId as string);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if player's team belongs to this league
      const team = await storage.getTeam(player.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === team.id);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Check if user is commissioner or owns this player's team
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isTeamCoach = userCoach && userCoach.teamId === team.id;
      
      if (!isCommissioner && !isTeamCoach) {
        return res.status(403).json({ message: "Only the commissioner or team coach can enter players into the transfer portal" });
      }

      if (player.inTransferPortal) {
        return res.status(400).json({ message: "Player is already in the transfer portal" });
      }

      if (player.declaredForDraft) {
        return res.status(400).json({ message: "Player has already declared for the draft" });
      }

      // Seniors cannot enter portal (they're graduating)
      if (player.eligibility === "SR") {
        return res.status(400).json({ message: "Seniors cannot enter the transfer portal" });
      }

      const { reason } = req.body as { reason?: string };

      const updated = await storage.updatePlayer(req.params.playerId as string, {
        inTransferPortal: true,
        portalEntryDate: new Date(),
        portalReason: reason || "Seeking new opportunity",
      });

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Transfer Portal Entry",
        details: `${player.firstName} ${player.lastName} (${team.abbreviation}) entered the transfer portal${reason ? `: ${reason}` : ''}`,
      });

      try {
        const leagueForEvent = await storage.getLeague(req.params.id as string);
        await storage.createLeagueEvent({
          leagueId: req.params.id as string,
          teamId: team.id,
          teamName: team.name,
          teamAbbreviation: team.abbreviation,
          eventType: "TRANSFER",
          description: `${player.firstName} ${player.lastName} (${player.position}, ${team.abbreviation}) entered the transfer portal`,
          season: leagueForEvent?.currentSeason || 1,
          week: leagueForEvent?.currentWeek || 1,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has entered the transfer portal`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to enter player into portal:", error);
      res.status(500).json({ message: "Failed to enter player into transfer portal" });
    }
  });

  // Get players leaving (graduates, draft declarations, transfer portal) - summary by team
  app.get("/api/leagues/:id/players-leaving", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const playersLeavingByTeam: Record<string, {
        teamId: string;
        teamName: string;
        abbreviation: string;
        primaryColor: string;
        secondaryColor: string;
        graduates: typeof allPlayers;
        draftDeclarations: typeof allPlayers;
        transfers: typeof allPlayers;
        totalLeaving: number;
      }> = {};

      // Initialize for all teams
      for (const team of teams) {
        playersLeavingByTeam[team.id] = {
          teamId: team.id,
          teamName: team.name,
          // @ts-ignore
        mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          graduates: [],
          draftDeclarations: [],
          transfers: [],
          totalLeaving: 0,
        };
      }

      // Get all players for all teams
      const allPlayers: Player[] = [];
      for (const team of teams) {
        const teamPlayers = await storage.getPlayersByTeam(team.id);
        allPlayers.push(...teamPlayers);
      }

      // Categorize players
      for (const player of allPlayers) {
        const teamData = playersLeavingByTeam[player.teamId];
        if (!teamData) continue;

        if (player.eligibility === "SR") {
          teamData.graduates.push(player);
          teamData.totalLeaving++;
        } else if (player.declaredForDraft) {
          teamData.draftDeclarations.push(player);
          teamData.totalLeaving++;
        } else if (player.inTransferPortal) {
          teamData.transfers.push(player);
          teamData.totalLeaving++;
        }
      }

      // Calculate league totals
      const leagueTotals = {
        graduates: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.graduates.length, 0),
        draftDeclarations: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.draftDeclarations.length, 0),
        transfers: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.transfers.length, 0),
        total: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.totalLeaving, 0),
      };

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason },
        teams: Object.values(playersLeavingByTeam).sort((a, b) => b.totalLeaving - a.totalLeaving),
        totals: leagueTotals,
      });
    } catch (error) {
      console.error("Failed to get players leaving:", error);
      res.status(500).json({ message: "Failed to get players leaving" });
    }
  });

}
