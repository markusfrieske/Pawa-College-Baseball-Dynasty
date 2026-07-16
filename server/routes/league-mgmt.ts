/**
 * League management routes: commissioning tools, recruit class generation,
 * team/recruit CRUD, schedule generation, digests, news, admin endpoints,
 * and NCAA roster management.
 *
 * Depends on recruit-engine.ts for schedule/recruit/player generation.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, calculateSignInterestThreshold } from "../route-helpers";
import { invalidateLeague } from "../cache";
import { getRealRosters } from "../realRostersLoader";
import { normalizeCommonAbilities } from "../normalizeCommonAbilities";
import { generateRecruitClass, getLastClassSeed, RECRUIT_GENERATOR_VERSION } from "../recruit-generator";
import { calculateOVR, getStarRatingFromOVR } from "../../shared/abilities";
import { getPotentialRange, rollV3Potential } from "../../shared/potential";
import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "../rosterScaleFactors";
import { getRecruitPoolSize } from "../utils";
import { assignTrajectory } from "../../shared/trajectory";
import { validateAndNormalizeRecruitingClass, ClassValidationError, ClassValidationResult } from "../lib/validateRecruitingClass";
import { getAdvancePreflight, type AdvancePreflightResult } from "../lib/advancePreflight";
import { validateWizardConfig } from "../lib/validateWizardConfig";
import { replaceLeagueRecruitingClass } from "../lib/replaceLeagueRecruitingClass";
import { archetypeDefs } from "../storylineEngine";
import { createScheduleForSeason } from "../services/schedule/createScheduleForSeason";
import {
  generateSchedule,
  generateRecruits,
  generateCpuCoaches,
  getTeamsForConference,
  generateExhibitionGames,
} from "../recruit-engine";
import { RecruitingTheme } from "../recruit-generator";
import { accumulatePlayerStats, updatePitcherRestFromBox } from "../game-engine";
import { calibrateRpiOvr } from "../calibrateRpiOvr";
import { pool } from "../db";
import type { AdvanceDigestCategories } from "@shared/schema";
import { resolveRecruitSigningWinner } from "../signing-resolver";

const settingsSchema = z.object({
  auditLogPublic: z.boolean().optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  cpuRecruitingAggression: z.number().int().min(1).max(5).optional(),
  emailDigestsEnabled: z.boolean().optional(),
  showReadyNamesToAll: z.boolean().optional(),
  gameMode: z.enum(["simulated", "reported"]).optional(),
  // The following fields are creation-time locked for full_season leagues.
  // Accepting them in the schema lets us detect and reject mutation attempts.
  maxTeams: z.number().int().optional(),
  conferenceCount: z.number().int().optional(),
  seasonLength: z.string().optional(),
  progressionEnabled: z.boolean().optional(),
});

type SimulateGameFn = (homeTeamId: string, awayTeamId: string, gameType?: string | null, homePhil?: string, awayPhil?: string, week?: number | null) => Promise<{ homeScore: number; awayScore: number; boxScore: string }>;

export async function updateRecruitStages(leagueId: string, week: number) {
  const recruits = await storage.getRecruitsByLeague(leagueId);
  const unsignedRecruits = recruits.filter(r => !r.signedTeamId);

  // Pre-load everything needed for the loop in parallel — eliminates N+1 queries
  const league = await storage.getLeague(leagueId);
  const [allLeagueInterests, allLeaguePlayers, allLeagueTeams, storylineRecruitsData] = await Promise.all([
    storage.getRecruitingInterestsByLeague(leagueId),
    storage.getPlayersByLeague(leagueId),
    storage.getTeamsByLeague(leagueId),
    league ? storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason) : Promise.resolve([]),
  ]);

  // Group interests by recruitId in memory
  const interestsByRecruit = new Map<string, typeof allLeagueInterests>();
  for (const interest of allLeagueInterests) {
    if (!interestsByRecruit.has(interest.recruitId)) interestsByRecruit.set(interest.recruitId, []);
    interestsByRecruit.get(interest.recruitId)!.push(interest);
  }

  // Group players by teamId in memory
  const playersByTeam = new Map<string, typeof allLeaguePlayers>();
  for (const player of allLeaguePlayers) {
    if (!playersByTeam.has(player.teamId)) playersByTeam.set(player.teamId, []);
    playersByTeam.get(player.teamId)!.push(player);
  }

  const storylineRecruitIds = new Set(storylineRecruitsData.map(sl => sl.recruitId));

  // NIL recruiting-envelope tracking for auto-sign paths — updated synchronously before any await
  // so concurrent promises within Promise.all see accurate remaining budgets.
  // Gates on the recruiting alloc (65% envelope), falls back to total budget for legacy leagues.
  const nilRecruitingSpentByTeam = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, t.nilRecruitingSpent || 0])
  );
  // Running total for nilSpent (global) so multiple same-team signs don't overwrite from stale snapshot
  const nilSpentByTeam = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, t.nilSpent || 0])
  );
  const teamMap = new Map(allLeagueTeams.map(t => [t.id, t]));
  // Track in-flight commits so concurrent Promise.all promises see accurate roster projections
  const teamCommitsMap = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, recruits.filter(r => r.signedTeamId === t.id).length])
  );

  // Parallelize per-recruit processing — each recruit's DB writes are independent
  await Promise.all(unsignedRecruits.map(async (recruit) => {
    const allInterests = interestsByRecruit.get(recruit.id) ?? [];
    if (allInterests.length === 0) return;
    
    const sortedInterests = allInterests
      .filter(i => i.interestLevel > 0)
      .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
    
    const topInterestLevel = sortedInterests[0]?.interestLevel || 0;
    const currentStage = recruit.stage || "open";
    
    let newStage = currentStage;
    
    // Star-based thresholds: higher-rated recruits take longer to decide
    const starRating = recruit.starRating || 3;
    const isBlueChip = recruit.isBlueChip || false;
    // Storyline recruits hold out longer — +2 week delay, +10 interest required
    const isStoryline = storylineRecruitIds.has(recruit.id);
    const storylineWeekBonus = isStoryline ? 2 : 0;
    const storylineInterestBonus = isStoryline ? 10 : 0;
    
    // Prestige commit-threshold reduction: high-prestige programs close recruits at lower interest.
    // The "brand" sells itself — find the top school with an offer and check its prestige.
    const topSchoolWithOffer = sortedInterests.filter(i => i.hasOffer).sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0))[0];
    const topSchoolTeam = topSchoolWithOffer ? allLeagueTeams.find(t => t.id === topSchoolWithOffer.teamId) : null;
    const topSchoolPrestige = topSchoolTeam?.prestige || 5;
    // Up to -5 threshold reduction for prestige 9, -3 for prestige 8
    const prestigeThresholdReduction = topSchoolPrestige >= 9 ? 5 : topSchoolPrestige >= 8 ? 3 : 0;
    
    // Season-length-aware verbal week: recruits become committable at a fixed offset AFTER the
    // regular season ends, so all season lengths funnel commit decisions into the offseason
    // recruiting window (weeks +1 through +4 relative to season end). This prevents the
    // broken behavior where medium/long seasons had recruits committing mid-regular-season
    // (verbalWeek=6 with a 15-week season = regular season week 6, far too early).
    //
    // Offsets from season end:
    //   3★: +1 (commit possible in offseason week 1)
    //   4★: +2 (commit possible in offseason week 2)
    //   5★: +3 (commit possible in offseason week 3)
    //   BC:  +4 (commit possible in offseason week 4 — final week before signing day)
    const seasonLength = league?.seasonLength || "standard";
    const seasonMaxWeeks = seasonLength === "full_season" ? 14 : seasonLength === "long" ? 15 : seasonLength === "medium" ? 10 : 5;
    const verbalOffset = isBlueChip ? 4 : starRating >= 5 ? 3 : starRating >= 4 ? 2 : 1;
    const verbalWeek = seasonMaxWeeks + verbalOffset + storylineWeekBonus;
    const verbalInterest = Math.max(50, (isBlueChip ? 85 : starRating >= 5 ? 80 : starRating >= 4 ? 70 : 60) + storylineInterestBonus - prestigeThresholdReduction);
    // Shared with the manual /sign endpoint (server/routes/recruiting.ts) so
    // auto-commit and manual signing always require the same interest level.
    const signInterest = calculateSignInterestThreshold(starRating, isBlueChip, isStoryline, topSchoolPrestige);
    
    // Passive weekly buzz: high College Life + Prestige programs generate ambient interest each week.
    // Represents organic brand awareness — recruits hear about the program passively.
    // For medium/long seasons, buzz is capped at 1%/week (vs 1-2% for short/standard) to prevent
    // elite programs from gaining a compounding advantage over many more in-season recruiting weeks.
    if (sortedInterests.length > 0) {
      const maxBuzzGain = (seasonLength === "long" || seasonLength === "medium" || seasonLength === "full_season") ? 1 : 2;
      for (const interest of allInterests) {
        const buzzTeam = allLeagueTeams.find(t => t.id === interest.teamId);
        if (!buzzTeam) continue;
        const cl = buzzTeam.collegeLife || 5;
        const pr = buzzTeam.prestige || 5;
        const buzzScore = (cl + pr) / 2; // average of the two; range 1–9
        // Only programs with combined average 7+ generate meaningful passive buzz
        if (buzzScore >= 7) {
          const buzzGain = Math.min(maxBuzzGain, buzzScore >= 8.5 ? 2 : 1);
          const newLevel = Math.min(99, (interest.interestLevel || 0) + buzzGain);
          if (newLevel !== interest.interestLevel) {
            await storage.updateRecruitingInterest(interest.id, { interestLevel: newLevel });
          }
        }
      }
    }
    
    if (sortedInterests.length >= 1) {
      if (week >= verbalWeek && topInterestLevel >= verbalInterest && sortedInterests.some(i => i.hasOffer)) {
        newStage = "verbal";
      } else if (week >= Math.max(3, verbalWeek - 4) && topInterestLevel >= 55) {
        newStage = "top3";
      } else if (week >= Math.max(2, verbalWeek - 6) && topInterestLevel >= 35) {
        newStage = "top5";
      } else if (week >= 2 && topInterestLevel >= 20) {
        newStage = "top8";
      }
    }
    
    const stageOrder = ["open", "top8", "top5", "top3", "verbal", "signed"];
    if (stageOrder.indexOf(newStage) > stageOrder.indexOf(currentStage)) {
      await storage.updateRecruit(recruit.id, { stage: newStage });
      
      if (newStage === "verbal") {
        const verbalResolution = resolveRecruitSigningWinner(
          { id: recruit.id, starRating: starRating, isBlueChip: isBlueChip, nilCost: recruit.nilCost ?? 0 },
          allInterests.map(i => ({ teamId: i.teamId, interestLevel: i.interestLevel, hasOffer: i.hasOffer ?? false })),
          teamMap,
          (teamId, cost) => {
            const prevRecSpent = nilRecruitingSpentByTeam.get(teamId) ?? 0;
            const t = teamMap.get(teamId);
            const recAlloc = t?.nilRecruitingAlloc ?? t?.nilBudget ?? 0;
            return !!t && (recAlloc - prevRecSpent) >= cost;
          }
        );
        if (verbalResolution.winnerTeamId) {
          const winnerId = verbalResolution.winnerTeamId;
          const winnerRoster = playersByTeam.get(winnerId) ?? [];
          const inFlightCommits = teamCommitsMap.get(winnerId) ?? 0;
          const departing = winnerRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
          const portal = winnerRoster.filter(p => p.inTransferPortal).length;
          if (winnerRoster.length - departing - portal + inFlightCommits + 1 <= 30) {
            const nilCost = recruit.nilCost ?? 0;
            const newRecSpent = (nilRecruitingSpentByTeam.get(winnerId) ?? 0) + nilCost;
            const newTotalSpent = (nilSpentByTeam.get(winnerId) ?? 0) + nilCost;
            nilRecruitingSpentByTeam.set(winnerId, newRecSpent);
            nilSpentByTeam.set(winnerId, newTotalSpent);
            teamCommitsMap.set(winnerId, inFlightCommits + 1);
            await storage.updateRecruit(recruit.id, { stage: "signed", signedTeamId: winnerId });
            await storage.updateTeam(winnerId, {
              nilRecruitingSpent: newRecSpent,
              nilSpent: newTotalSpent,
            });
          }
        }
      }
    }
    
    let justSigned = false;
    if (currentStage === "verbal") {
      const alreadyVerbalResolution = resolveRecruitSigningWinner(
        { id: recruit.id, starRating: starRating, isBlueChip: isBlueChip, nilCost: recruit.nilCost ?? 0 },
        allInterests.map(i => ({ teamId: i.teamId, interestLevel: i.interestLevel, hasOffer: i.hasOffer ?? false })),
        teamMap,
        (teamId, cost) => {
          const prevRecSpent = nilRecruitingSpentByTeam.get(teamId) ?? 0;
          const t = teamMap.get(teamId);
          const recAlloc = t?.nilRecruitingAlloc ?? t?.nilBudget ?? 0;
          return !!t && (recAlloc - prevRecSpent) >= cost;
        }
      );
      if (alreadyVerbalResolution.winnerTeamId) {
        const winnerId = alreadyVerbalResolution.winnerTeamId;
        const winnerRoster = playersByTeam.get(winnerId) ?? [];
        const inFlightCommits = teamCommitsMap.get(winnerId) ?? 0;
        const departing = winnerRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
        const portal = winnerRoster.filter(p => p.inTransferPortal).length;
        if (winnerRoster.length - departing - portal + inFlightCommits + 1 <= 30) {
          const nilCost = recruit.nilCost ?? 0;
          const newRecSpent = (nilRecruitingSpentByTeam.get(winnerId) ?? 0) + nilCost;
          const newTotalSpent = (nilSpentByTeam.get(winnerId) ?? 0) + nilCost;
          nilRecruitingSpentByTeam.set(winnerId, newRecSpent);
          nilSpentByTeam.set(winnerId, newTotalSpent);
          teamCommitsMap.set(winnerId, inFlightCommits + 1);
          await storage.updateRecruit(recruit.id, { stage: "signed", signedTeamId: winnerId });
          await storage.updateTeam(winnerId, {
            nilRecruitingSpent: newRecSpent,
            nilSpent: newTotalSpent,
          });
          justSigned = true;
        }
      }
    }

    // Decommitment check: verbal recruit can flip if a rival with an offer closes the gap.
    // College Life mismatch modifier: if the leader's college life doesn't match recruit priority,
    // de-commit risk increases. If it matches well, risk decreases.
    const FLIP_THRESHOLD = 15;
    if (currentStage === "verbal" && !justSigned) {
      const schoolsWithOffers = sortedInterests
        .filter(i => i.hasOffer)
        .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
      if (schoolsWithOffers.length >= 2) {
        const leader = schoolsWithOffers[0];
        const rival = schoolsWithOffers[1];
        const gap = (leader.interestLevel || 0) - (rival.interestLevel || 0);
        // College Life stability modifier
        const leaderTeamForCL = allLeagueTeams.find(t => t.id === leader.teamId);
        const collegeLifePriority = (recruit as any).collegeLifePriority || "Somewhat";
        const leaderCL = leaderTeamForCL?.collegeLife || 5;
        // High priority + low college life = +15% decommit risk; high match = -10% risk
        const clMismatch = collegeLifePriority === "Extremely" && leaderCL <= 4 ? 0.15
          : collegeLifePriority === "Very" && leaderCL <= 3 ? 0.10
          : (collegeLifePriority === "Extremely" || collegeLifePriority === "Very") && leaderCL >= 8 ? -0.10
          : 0;
        const baseFlipChance = 0.35;
        const flipChance = Math.max(0.05, Math.min(0.75, baseFlipChance + clMismatch));
        if (gap < FLIP_THRESHOLD && (rival.interestLevel || 0) > 40 && Math.random() < flipChance) {
          await storage.updateRecruit(recruit.id, { stage: "top3" });
          try {
            const leaderTeam = allLeagueTeams.find(t => t.id === leader.teamId);
            const rivalTeam = allLeagueTeams.find(t => t.id === rival.teamId);
            if (leaderTeam) {
              await storage.createLeagueEvent({
                leagueId,
                teamId: leader.teamId,
                teamName: leaderTeam!.name,
                teamAbbreviation: leaderTeam!.abbreviation || leaderTeam!.name.slice(0, 4).toUpperCase(),
                eventType: "DECOMMIT",
                description: `${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${recruit.starRating ?? 0}★) decommitted from ${leaderTeam!.name} — ${rivalTeam?.name ?? "a rival"} is closing the gap`,
                season: league?.currentSeason ?? 1,
                week,
                metadata: { recruitId: recruit.id, alertType: "lost", leaderTeamName: leaderTeam!.name, rivalTeamName: rivalTeam?.name ?? null },
              });
            }
            if (rivalTeam) {
              await storage.createLeagueEvent({
                leagueId,
                teamId: rival.teamId,
                teamName: rivalTeam.name,
                teamAbbreviation: rivalTeam.abbreviation || rivalTeam.name.slice(0, 4).toUpperCase(),
                eventType: "DECOMMIT",
                description: `${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${recruit.starRating ?? 0}★) decommitted from ${leaderTeam!.name} and is now showing increased interest in ${rivalTeam.name}`,
                season: league?.currentSeason ?? 1,
                week,
                metadata: { recruitId: recruit.id, alertType: "gain", leaderTeamName: leaderTeam!.name, rivalTeamName: rivalTeam.name },
              });
            }
          } catch (e) {
            console.error("[decommit] Failed to create decommit event:", e);
          }
        }
      }
    }
  }));
}

export function registerLeagueMgmtRoutes(app: Express, simulateGame?: SimulateGameFn): void {
// ============ RECRUIT STAGE PROGRESSION FUNCTION ============

// Generate recruiting class for dynasty setup
app.post("/api/leagues/:id/recruiting/generate", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }
    
    // Commissioner-only action
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can generate a recruiting class" });
    }

    // Delete existing recruits for this league
    await storage.deleteRecruitsByLeague(req.params.id as string);

    // Scale recruit class to league size: teams.length × 5 (min 40)
    // forceStorylineReset=true: commissioner explicitly regenerated the class, so existing
    // storyline data for this season must be wiped and rebuilt for the new recruits.
    const leagueTeamsForCount = await storage.getTeamsByLeague(req.params.id as string);
    const recruitCount = getRecruitPoolSize(leagueTeamsForCount.length, league?.dynastyPreset ?? undefined);
    const generatedVintage = await generateRecruits(req.params.id as string, recruitCount, true);
    await storage.updateLeague(req.params.id as string, { currentClassVintage: generatedVintage });

    await storage.createAuditLog({
      leagueId: league.id,
      userId: req.session.userId,
      action: "Recruiting Class Generated",
      details: `Generated ${recruitCount} recruits for the recruiting class (${leagueTeamsForCount.length} teams × 5)`,
    });

    res.json({
      success: true,
      count: recruitCount,
      storylineReset: true,
      storylineResetWarning: "Existing storyline arcs and events for this season were wiped and rebuilt for the new recruiting class.",
    });
  } catch (error) {
    console.error("Failed to generate recruiting class:", error);
    res.status(500).json({ message: "Failed to generate recruiting class" });
  }
});

// Simulate week - auto-resolve all games for the current week
app.post("/api/leagues/:id/simulate", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can simulate games" });
    }

    const games = await storage.getGamesByLeague(league.id);
    const currentWeekGames = games.filter(g => 
      g.week === league.currentWeek && 
      g.season === league.currentSeason &&
      !g.isComplete
    );

    const simTeams = await storage.getTeamsByLeague(league.id);
    const simUserCoachForSim = (await storage.getCoachesByLeague(league.id)).find((c: any) => c.userId === req.session.userId);
    const simUserTeamIdForSim = simUserCoachForSim?.teamId;
    let simUserTeamGame: {
      homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string;
      homeScore: number; awayScore: number; inningScores: number[][];
      homeHits: number; awayHits: number; homeErrors: number; awayErrors: number;
      isHome: boolean; homeColor?: string; awayColor?: string;
    } | undefined;

    for (const game of currentWeekGames) {
      const result = await simulateGame!(game.homeTeamId, game.awayTeamId, game.gameType, undefined, undefined, game.week);
      await storage.updateGame(game.id, {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isComplete: true,
        boxScore: result.boxScore,
      });
      try { const box = JSON.parse(result.boxScore); const hwDigest = result.homeScore > result.awayScore; await accumulatePlayerStats(league.id, league.currentSeason, game.homeTeamId, box.home, hwDigest); await accumulatePlayerStats(league.id, league.currentSeason, game.awayTeamId, box.away, !hwDigest); await updatePitcherRestFromBox(box.home, box.away, game); } catch (e) { console.error("Stat accumulation error:", e); }
      if (simUserTeamIdForSim && !simUserTeamGame &&
          (game.homeTeamId === simUserTeamIdForSim || game.awayTeamId === simUserTeamIdForSim)) {
        try {
          const box = JSON.parse(result.boxScore);
          const ht = simTeams.find((t: any) => t.id === game.homeTeamId);
          const at = simTeams.find((t: any) => t.id === game.awayTeamId);
          simUserTeamGame = {
            homeTeam: ht?.name ?? "Home", awayTeam: at?.name ?? "Away",
            homeAbbr: ht?.abbreviation ?? "HME", awayAbbr: at?.abbreviation ?? "AWY",
            homeScore: result.homeScore, awayScore: result.awayScore,
            inningScores: box.innings ?? [],
            homeHits: box.home?.totals?.h ?? 0, awayHits: box.away?.totals?.h ?? 0,
            homeErrors: box.home?.errors ?? 0, awayErrors: box.away?.errors ?? 0,
            isHome: game.homeTeamId === simUserTeamIdForSim,
            homeColor: ht?.primaryColor ?? "#FFD700",
            awayColor: at?.primaryColor ?? "#7eb8f7",
          };
        } catch { /* non-critical */ }
      }
    }

    await storage.createAuditLog({
      leagueId: league.id,
      userId: req.session.userId,
      action: "Simulated Week",
      details: `Auto-resolved ${currentWeekGames.length} games for week ${league.currentWeek}`,
    });

    res.json({ success: true, gamesSimulated: currentWeekGames.length, userTeamGame: simUserTeamGame });
  } catch (error) {
    console.error("Failed to simulate week:", error);
    res.status(500).json({ message: "Failed to simulate week" });
  }
});

// Toggle ready status for user's coach
app.post("/api/leagues/:id/ready", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const coaches = await storage.getCoachesByLeague(league.id);
    const userCoach = coaches.find((c: { userId: string | null }) => c.userId === req.session.userId);
    if (!userCoach) {
      return res.status(403).json({ message: "You don't have a coach in this league" });
    }

    // Toggle ready status
    const newReadyStatus = !userCoach.isReady;
    await storage.updateCoach(userCoach.id, { isReady: newReadyStatus });

    res.json({ success: true, isReady: newReadyStatus });
  } catch (error) {
    console.error("Failed to toggle ready status:", error);
    res.status(500).json({ message: "Failed to toggle ready status" });
  }
});

// Get ready status for all teams in a league — accessible to all league members (commissioners and coaches)
app.get("/api/leagues/:id/ready-status", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const allLeagueCoaches = await storage.getCoachesByLeague(league.id);
    const isCommissioner = hasCommissionerAccess(league, req.session.userId);
    const requestingCoach = allLeagueCoaches.find(c => c.userId === req.session.userId);
    if (!isCommissioner && !requestingCoach) {
      return res.status(403).json({ message: "Not authorized to view readiness data" });
    }

    const teams = await storage.getTeamsByLeague(league.id);
    const coaches = allLeagueCoaches;
    const games = await storage.getGamesByLeague(league.id);
    
    // Get current week's games that need scores
    const currentWeekGames = games.filter(g => 
      g.week === league.currentWeek && 
      g.season === league.currentSeason &&
      !g.isComplete
    );

    // Get all recruiting interests for accurate action counts
    const allInterests = await storage.getRecruitingInterestsByLeague(league.id);

    // Get this week's recruiting actions for per-team action counts and last-activity timestamps
    const weekActions = await storage.getRecruitingActionsLogByLeagueWeek(league.id, league.currentSeason, league.currentWeek);

    // Get recent league events (current season, non-nudge) as activity signals for non-recruiting phases
    const recentLeagueEvents = await storage.getLeagueEvents(league.id, 200);
    const currentSeasonEvents = recentLeagueEvents.filter(e =>
      e.season === league.currentSeason &&
      e.teamId !== null &&
      e.eventType !== "NUDGE"
    );

    // Pre-group by teamId to avoid repeated filter+sort inside map
    const interestsByTeam = new Map<string, typeof allInterests>();
    for (const i of allInterests) {
      if (!interestsByTeam.has(i.teamId)) interestsByTeam.set(i.teamId, []);
      interestsByTeam.get(i.teamId)!.push(i);
    }

    const weekActionsByTeam = new Map<string, typeof weekActions>();
    for (const a of weekActions) {
      if (!weekActionsByTeam.has(a.teamId)) weekActionsByTeam.set(a.teamId, []);
      weekActionsByTeam.get(a.teamId)!.push(a);
    }

    // Latest event timestamp per team (events already sorted desc by storage)
    const latestEventByTeam = new Map<string, number>();
    for (const e of currentSeasonEvents) {
      const tid = e.teamId!;
      if (!latestEventByTeam.has(tid)) {
        latestEventByTeam.set(tid, new Date(e.createdAt).getTime());
      }
    }

    const readyStatus = teams.map(team => {
      const coach = coaches.find(c => c.teamId === team.id);
      const isHumanControlled = !!coach?.userId;
      
      // Check if team has pending scores to report
      const pendingGames = currentWeekGames.filter(g => 
        (g.homeTeamId === team.id || g.awayTeamId === team.id)
      );
      const hasReportedScores = pendingGames.length === 0 || 
        pendingGames.every(g => g.homeScore !== null && g.awayScore !== null);

      // Calculate actual scout and recruit actions from interests
      const teamInterests = interestsByTeam.get(team.id) ?? [];
      const scoutActionsUsed = teamInterests.filter(i => i.scoutPercentage > 0).length;
      const recruitActionsUsed = teamInterests.filter(i => i.interestLevel > 0).length;

      // Per-team actions this week and last activity timestamp from recruiting log
      const teamWeekActions = weekActionsByTeam.get(team.id) ?? [];
      const currentWeekActionCount = teamWeekActions.length;
      const latestRecruitTs = teamWeekActions.reduce((best, a) => {
        const t = new Date(a.createdAt).getTime();
        return t > best ? t : best;
      }, 0);

      // Latest event timestamp (pre-grouped above)
      const latestEventTs = latestEventByTeam.get(team.id) ?? 0;

      // Use the most recent signal across both sources
      const bestTs = Math.max(latestRecruitTs, latestEventTs);
      const lastActivityAt = bestTs > 0
        ? new Date(bestTs).toISOString()
        : null;

      return {
        teamId: team.id,
        teamName: team.name,
        abbreviation: team.abbreviation,
        isHumanControlled,
        userId: coach?.userId ?? null,
        coachId: coach?.id ?? null,
        coachName: coach ? `${coach.firstName} ${coach.lastName}` : "CPU",
        isReady: coach?.isReady ?? false,
        isAutoPilot: team.isAutoPilot ?? false,
        departuresFinalized: team.departuresFinalized,
        walkonReady: team.walkonReady ?? false,
        scoutActionsUsed,
        recruitActionsUsed,
        currentWeekActionCount,
        lastActivityAt,
        hasReportedScores,
      };
    });

    const isDeparturesPhase = league.currentPhase === "offseason_departures";
    const isWalkonsPhase = league.currentPhase === "offseason_walkons";
    
    const getReadyState = (s: typeof readyStatus[0]) => {
      // Auto-pilot teams are always treated as ready — CPU manages them
      if (s.isAutoPilot) return true;
      if (isDeparturesPhase) return s.departuresFinalized;
      if (isWalkonsPhase) return s.walkonReady;
      return s.isReady;
    };
    
    const allHumansReady = readyStatus
      .filter(s => s.isHumanControlled)
      .every(s => getReadyState(s));

    const humanCount = readyStatus.filter(s => s.isHumanControlled).length;
    const readyCount = readyStatus.filter(s => s.isHumanControlled && getReadyState(s)).length;

    // Commissioner gets full detailed response; coaches get a minimal aggregate + optional names
    if (isCommissioner) {
      res.json({
        readyStatus,
        allHumansReady,
        currentPhase: league.currentPhase,
        phaseDeadline: league.phaseDeadline ?? null,
        humanCount,
        readyCount,
      });
    } else {
      // Coaches always see aggregate counts + their own status.
      // When showReadyNamesToAll is enabled they also get the full per-team list.
      const showNames = league.showReadyNamesToAll ?? false;
      const humanReadyStatus = readyStatus.filter(s => s.isHumanControlled);
      const notReadyTeams = showNames
        ? humanReadyStatus
            .filter(s => !getReadyState(s))
            .map((s: any) => ({ teamId: s.teamId, teamName: s.teamName, abbreviation: s.abbreviation }))
        : [];
      const myEntry = readyStatus.find(s => s.userId === req.session.userId) ?? null;
      const coachReadyStatus = showNames
        ? humanReadyStatus.map((s: any) => ({
            teamId: s.teamId,
            teamName: s.teamName,
            abbreviation: s.abbreviation,
            userId: s.userId,
            isHumanControlled: true,
            isReady: getReadyState(s),
            isAutoPilot: s.isAutoPilot,
            departuresFinalized: s.departuresFinalized,
            walkonReady: s.walkonReady,
          }))
        : myEntry ? [{
            teamId: myEntry.teamId,
            teamName: myEntry.teamName,
            abbreviation: myEntry.abbreviation,
            userId: myEntry.userId,
            isHumanControlled: true,
            isReady: getReadyState(myEntry),
            isAutoPilot: myEntry.isAutoPilot,
            departuresFinalized: myEntry.departuresFinalized,
            walkonReady: myEntry.walkonReady,
          }] : [];
      res.json({
        readyStatus: coachReadyStatus,
        notReadyTeams,
        allHumansReady,
        currentPhase: league.currentPhase,
        phaseDeadline: league.phaseDeadline ?? null,
        humanCount,
        readyCount,
        showReadyNamesToAll: showNames,
      });
    }
  } catch (error) {
    console.error("Failed to get ready status:", error);
    res.status(500).json({ message: "Failed to get ready status" });
  }
});

// Send a nudge notification to a stalled coach (commissioner only)
app.post("/api/leagues/:id/teams/:teamId/nudge", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const teamId = req.params.teamId as string;

    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can send nudges" });
    }

    const coaches = await storage.getCoachesByLeague(leagueId);
    const targetCoach = coaches.find(c => c.teamId === teamId);
    if (!targetCoach || !targetCoach.userId) {
      return res.status(400).json({ message: "Cannot nudge a CPU team" });
    }

    const teams = await storage.getTeamsByLeague(leagueId);
    const team = teams.find(t => t.id === teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const phaseLabel: Record<string, string> = {
      offseason_departures: "submit their player departures",
      offseason_recruiting_1: "take recruiting actions",
      offseason_recruiting_2: "take recruiting actions",
      offseason_recruiting_3: "take recruiting actions",
      offseason_recruiting_4: "take recruiting actions",
      offseason_signing_day: "finalize their signing day decisions",
      offseason_walkons: "complete their roster cuts & walk-ons",
      regular_season: "advance the week",
      preseason: "mark themselves ready",
      spring_training: "mark themselves ready",
    };
    const action = phaseLabel[league.currentPhase] || "take action";

    await storage.createLeagueEvent({
      leagueId,
      teamId,
      teamName: team.name,
      teamAbbreviation: team.abbreviation,
      eventType: "NUDGE",
      description: `${team.abbreviation} (${targetCoach.firstName} ${targetCoach.lastName}) has been reminded to ${action}.`,
      season: league.currentSeason,
      week: league.currentWeek,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to send nudge:", error);
    res.status(500).json({ message: "Failed to send nudge" });
  }
});

// Helper function to convert letter grade to numeric value (0-100)
function letterGradeToNumeric(grade: string): number {
  const gradeMap: Record<string, number> = {
    'S': 95, 'A': 85, 'B': 75, 'C': 65, 'D': 55, 'E': 34, 'F': 24, 'G': 9
  };
  return gradeMap[grade.toUpperCase()] ?? 50;
}

// Helper function to parse CSV data
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

app.post("/api/leagues/:id/recruiting/import", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }
    
    // Commissioner-only action
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can import a recruiting class" });
    }

    // Delete existing recruits for this league
    await storage.deleteRecruitsByLeague(req.params.id as string);

    const { csvData } = req.body;
    let recruitCount = 0;

    if (csvData && typeof csvData === 'string' && csvData.trim()) {
      // Parse CSV data
      const lines = csvData.trim().split('\n');
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;
        
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        // Detect if pitcher or fielder based on position
        const position = row.position || row.pos || 'IF';
        const isPitcher = ['SP', 'RP', 'P'].includes(position.toUpperCase());

        // Initial overall placeholder (will be recalculated from attributes below)
        const overallValue = parseInt(row.overall) || 500;
        const starRating = getStarRatingFromOVR(overallValue);

        // Parse recruit data from CSV
        const recruit: any = {
          leagueId: league.id,
          firstName: row.firstname || row.first || row['first name'] || 'Player',
          lastName: row.lastname || row.last || row['last name'] || 'Unknown',
          position: position.toUpperCase(),
          homeState: row.homestate || row.state || row['home state'] || 'TX',
          hometown: row.hometown || row.city || row['home city'] || 'Houston',
          classRank: i,
          positionRank: Math.ceil(i / 5),
          overall: overallValue,
          starRating: parseInt(row.starrating) || parseInt(row.stars) || starRating,
          starRank: parseInt(row.starrating) || parseInt(row.stars) || starRating,
          recruitType: row.recruittype || row.type || 'HS',
          throwHand: row.throwhand || row.throws || 'R',
          batHand: row.bathand || row.bats || 'R',
        };

        // Fielder attributes with letter grade support
        const fielderAttrs = ['hitforavg', 'contact', 'power', 'speed', 'runspeed', 'arm', 
          'armstrength', 'fielding', 'errorresistance', 'clutch', 'vslhp', 'grit', 
          'stealing', 'running', 'throwing', 'recovery', 'catcherability'];
        
        // Map CSV headers to schema fields
        const attrMap: Record<string, string> = {
          'contact': 'hitForAvg', 'hitforavg': 'hitForAvg',
          'power': 'power',
          'speed': 'speed', 'runspeed': 'speed',
          'arm': 'arm', 'armstrength': 'arm',
          'fielding': 'fielding',
          'errorresistance': 'errorResistance',
          'clutch': 'clutch',
          'vslhp': 'vsLHP', 'vsleft': 'vsLHP',
          'grit': 'grit',
          'stealing': 'stealing',
          'running': 'running',
          'throwing': 'throwing',
          'recovery': 'recovery',
          'catcherability': 'catcherAbility', 'catcher': 'catcherAbility'
        };

        // Process fielder attributes
        for (const [csvKey, schemaKey] of Object.entries(attrMap)) {
          if (row[csvKey]) {
            const val = row[csvKey];
            recruit[schemaKey] = /^[A-Ga-g]$/.test(val) 
              ? letterGradeToNumeric(val) 
              : parseInt(val) || 50;
          }
        }

        // Pitcher attributes with letter grade support
        const pitcherAttrMap: Record<string, string> = {
          'velocity': 'velocity', 'velo': 'velocity',
          'control': 'control',
          'stamina': 'stamina',
          'stuff': 'stuff', 'pitchmix': 'stuff',
          'wrisp': 'wRISP', 'risp': 'wRISP',
          'vslefty': 'vsLefty',
          'poise': 'poise',
          'heater': 'heater',
          'agile': 'agile'
        };

        // Process pitcher attributes
        for (const [csvKey, schemaKey] of Object.entries(pitcherAttrMap)) {
          if (row[csvKey]) {
            const val = row[csvKey];
            recruit[schemaKey] = /^[A-Ga-g]$/.test(val) 
              ? letterGradeToNumeric(val) 
              : parseInt(val) || 50;
          }
        }

        // Priority fields (text values: Not, Somewhat, Very, Extremely)
        const priorityMap: Record<string, string> = {
          'proximitypriority': 'proximityPriority', 'proximity': 'proximityPriority',
          'reputationpriority': 'reputationPriority', 'reputation': 'reputationPriority', 'coachreputation': 'reputationPriority',
          'playingtimepriority': 'playingTimePriority', 'playingtime': 'playingTimePriority',
          'academicspriority': 'academicsPriority', 'academics': 'academicsPriority',
          'prestigepriority': 'prestigePriority', 'prestige': 'prestigePriority', 'schoolprestige': 'prestigePriority',
          'facilitiespriority': 'facilitiesPriority', 'facilities': 'facilitiesPriority'
        };
        
        for (const [csvKey, schemaKey] of Object.entries(priorityMap)) {
          if (row[csvKey]) {
            const val = row[csvKey].toLowerCase();
            // Map possible values to standard format
            let priority = 'Somewhat';
            if (val.includes('not') || val === 'n') priority = 'Not';
            else if (val.includes('extremely') || val === 'e') priority = 'Extremely';
            else if (val.includes('very') || val === 'v') priority = 'Very';
            else if (val.includes('somewhat') || val === 's') priority = 'Somewhat';
            recruit[schemaKey] = priority;
          }
        }
        
        // Special abilities (comma-separated list)
        if (row.abilities || row.specialabilities) {
          const abilitiesStr = row.abilities || row.specialabilities;
          recruit.abilities = abilitiesStr.split(',').map((a: string) => a.trim()).filter((a: string) => a);
        }
        
        // Boolean flags
        if (row.isbluechip || row.bluechip) {
          recruit.isBlueChip = ['true', '1', 'yes', 'y'].includes((row.isbluechip || row.bluechip).toLowerCase());
        }
        if (row.isgem || row.gem) {
          recruit.isGem = ['true', '1', 'yes', 'y'].includes((row.isgem || row.gem).toLowerCase());
        }
        if (row.isbust || row.bust) {
          recruit.isBust = ['true', '1', 'yes', 'y'].includes((row.isbust || row.bust).toLowerCase());
        }
        
        // Appearance
        if (row.skintone) recruit.skinTone = row.skintone;
        if (row.haircolor) recruit.hairColor = row.haircolor;
        if (row.hairstyle) recruit.hairStyle = row.hairstyle;

        // Recalculate OVR from attributes using the formula
        recruit.overall = calculateOVR(recruit);
        recruit.starRating = getStarRatingFromOVR(recruit.overall);
        recruit.starRank = recruit.starRating;

        await storage.createRecruit(recruit);
        recruitCount++;
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Imported",
        details: `Imported ${recruitCount} recruits from CSV file`,
      });
    } else {
      // Generate new recruiting class scaled to league size
      // forceStorylineReset=true: commissioner-initiated generation, so existing storyline data
      // for this season is wiped and rebuilt for the newly generated recruits.
      const importTeams = await storage.getTeamsByLeague(req.params.id as string);
      recruitCount = getRecruitPoolSize(importTeams.length, league?.dynastyPreset ?? undefined);
      const importGeneratedVintage = await generateRecruits(req.params.id as string, recruitCount, true);
      await storage.updateLeague(req.params.id as string, { currentClassVintage: importGeneratedVintage });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Imported",
        details: `Generated ${recruitCount} new recruits for the recruiting class`,
      });
    }

    res.json({
      success: true,
      count: recruitCount,
      storylineReset: true,
      storylineResetWarning: "Existing storyline arcs and events for this season were wiped and rebuilt for the new recruiting class.",
    });
  } catch (error) {
    console.error("Failed to import recruiting class:", error);
    res.status(500).json({ message: "Failed to import recruiting class" });
  }
});

// ─── Recruiting Wizard Endpoints ───────────────────────────────────────────

// Return the recommended recruit pool size for a given league (or 80 for standalone).
// No auth required — the number itself is non-sensitive.
app.get("/api/recruit-class-target", async (req, res) => {
  try {
    const leagueId = req.query.leagueId as string | undefined;
    if (!leagueId) {
      return res.json({ targetSize: 80 });
    }
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const teams = await storage.getTeamsByLeague(leagueId);
    const targetSize = getRecruitPoolSize(teams.length, league.dynastyPreset);
    res.json({ targetSize, teamCount: teams.length, preset: league.dynastyPreset });
  } catch (error) {
    console.error("Failed to get recruit class target:", error);
    res.status(500).json({ message: "Failed to get target size" });
  }
});

// League-agnostic generate endpoint — works without a league (no auth required)
app.post("/api/recruiting/generate-preview", async (req, res) => {
  try {
    const { config, seed: callerSeed } = req.body as { config: any; seed?: string };
    if (!config) return res.status(400).json({ message: "config required" });
    const configErrors = validateWizardConfig(config);
    if (configErrors) {
      return res.status(400).json({ message: configErrors.errors.join("; "), errors: configErrors.errors });
    }
    const theme = (config.theme as RecruitingTheme) || "balanced";
    const count = Math.min(Math.max(Number(config.count) || 75, 20), 5000);
    const fogDensity: number = Math.min(100, Math.max(0, Number(config.fogDensity ?? 100)));
    // Forward OVR controls as a unit: if any field differs from defaults, send all four
    // so the generator receives the correct average even when only distribution or range changes.
    const wOvrMin  = config.ovrMin  != null ? Number(config.ovrMin)  : 150;
    const wOvrMax  = config.ovrMax  != null ? Number(config.ovrMax)  : 650;
    const wOvrAvg  = config.ovrAverage != null ? Number(config.ovrAverage) : 300;
    const wOvrDist = config.ovrDistribution || "bell";
    const hasOvrChanges = wOvrMin !== 150 || wOvrMax !== 650 || wOvrAvg !== 300 || wOvrDist !== "bell";
    const recruits = generateRecruitClass(count, {
      theme,
      wizardStarDistribution: config.starDistribution,
      wizardSpecialCounts: config.specialCounts,
      wizardPositionDistribution: config.positionDistribution,
      wizardRegionSkew: config.regionSkew || "none",
      ...(hasOvrChanges ? {
        wizardOvrMin: wOvrMin,
        wizardOvrMax: wOvrMax,
        wizardOvrAverage: wOvrAvg,
        wizardOvrDistribution: wOvrDist as "bell" | "top_heavy" | "bottom_heavy" | "flat",
      } : {}),
      // Accept caller-provided seed for deterministic reproduction (same seed => same class)
      ...(callerSeed ? { seed: callerSeed } : {}),
    });
    const masterSeed = getLastClassSeed();
    const initialScoutingLevel = Math.round((1 - fogDensity / 100) * 100);
    const recruitsWithFog = recruits.map(r => ({ ...r, scoutingLevel: initialScoutingLevel }));
    res.json({ recruits: recruitsWithFog, masterSeed, generatorVersion: RECRUIT_GENERATOR_VERSION });
  } catch (error) {
    console.error("Failed to generate wizard preview:", error);
    res.status(500).json({ message: "Failed to generate class" });
  }
});

// League-agnostic reroll endpoint — works without a league (no auth required)
app.post("/api/recruiting/reroll-single", async (req, res) => {
  try {
    const { theme = "balanced", forcedType, masterSeed: incomingMasterSeed, templateRecruitId, rerollNonce } = req.body as { theme?: string; forcedType?: any; masterSeed?: string; templateRecruitId?: string; rerollNonce?: number };
    // Derive a deterministic sub-seed from master seed + recruit identity + nonce
    // Nonce ensures repeated rerolls of the same recruit produce different results
    let derivedSeedStr: string | undefined;
    if (incomingMasterSeed && templateRecruitId) {
      const { derivedSeed: ds } = await import("../../shared/seededRng");
      const nonceStr = rerollNonce != null ? `_reroll_${rerollNonce}` : "_reroll";
      derivedSeedStr = ds(incomingMasterSeed, templateRecruitId + nonceStr).toString();
    }
    const recruits = generateRecruitClass(1, {
      theme: (theme as RecruitingTheme) || "balanced",
      wizardForcedType: forcedType,
      ...(derivedSeedStr ? { seed: derivedSeedStr } : {}),
    });
    res.json({ recruit: recruits[0] });
  } catch (error) {
    console.error("Failed to reroll single recruit:", error);
    res.status(500).json({ message: "Failed to reroll recruit" });
  }
});

// Generate a class preview from wizard config (no DB write)
app.post("/api/leagues/:id/recruiting/generate-wizard", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }
    const { config, seed: callerSeed2 } = req.body as { config: any; seed?: string };
    if (!config) return res.status(400).json({ message: "config required" });
    const configErrors2 = validateWizardConfig(config);
    if (configErrors2) {
      return res.status(400).json({ message: configErrors2.errors.join("; "), errors: configErrors2.errors });
    }

    const theme = (config.theme as RecruitingTheme) || "balanced";
    const rawCount = Number(config.count) || 75;

    // Enforce the league-derived minimum class size.
    // Commissioners may generate MORE than the target (override), but not less,
    // to ensure all teams have adequate recruits to recruit from.
    const teams = await storage.getTeamsByLeague(req.params.id as string);
    const leagueTargetMin = getRecruitPoolSize(teams.length, league.dynastyPreset);
    if (rawCount < leagueTargetMin) {
      return res.status(400).json({
        message: `Class size ${rawCount} is below the league minimum of ${leagueTargetMin} for a ${teams.length}-team league. Increase the class size or the server will reject it.`,
        minimumCount: leagueTargetMin,
      });
    }

    const count = Math.min(Math.max(rawCount, leagueTargetMin), 5000);
    const fogDensity: number = Math.min(100, Math.max(0, Number(config.fogDensity ?? 100)));

    // Forward OVR controls as a unit: if any field differs from defaults, send all four
    // so the generator receives the correct average even when only distribution or range changes.
    const wOvrMin2  = config.ovrMin  != null ? Number(config.ovrMin)  : 150;
    const wOvrMax2  = config.ovrMax  != null ? Number(config.ovrMax)  : 650;
    const wOvrAvg2  = config.ovrAverage != null ? Number(config.ovrAverage) : 300;
    const wOvrDist2 = config.ovrDistribution || "bell";
    const hasOvrChanges2 = wOvrMin2 !== 150 || wOvrMax2 !== 650 || wOvrAvg2 !== 300 || wOvrDist2 !== "bell";
    const recruits = generateRecruitClass(count, {
      theme,
      wizardStarDistribution: config.starDistribution,
      wizardSpecialCounts: config.specialCounts,
      wizardPositionDistribution: config.positionDistribution,
      wizardRegionSkew: config.regionSkew || "none",
      ...(hasOvrChanges2 ? {
        wizardOvrMin: wOvrMin2,
        wizardOvrMax: wOvrMax2,
        wizardOvrAverage: wOvrAvg2,
        wizardOvrDistribution: wOvrDist2 as "bell" | "top_heavy" | "bottom_heavy" | "flat",
      } : {}),
      // Accept caller-provided seed for deterministic reproduction (same seed => same class)
      ...(callerSeed2 ? { seed: callerSeed2 } : {}),
    });
    const masterSeed2 = getLastClassSeed();

    // Apply fog density: 100% = fully hidden (scoutingLevel=0), 0% = fully revealed (scoutingLevel=100)
    const initialScoutingLevel = Math.round((1 - fogDensity / 100) * 100);
    const recruitsWithFog = recruits.map(r => ({ ...r, scoutingLevel: initialScoutingLevel }));

    res.json({ recruits: recruitsWithFog, masterSeed: masterSeed2, generatorVersion: RECRUIT_GENERATOR_VERSION });
  } catch (error) {
    console.error("Failed to generate wizard class:", error);
    res.status(500).json({ message: "Failed to generate class" });
  }
});

// Reroll a single recruit with type constraints (no DB write)
app.post("/api/leagues/:id/recruiting/reroll-recruit", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }
    const { theme = "balanced", forcedType, masterSeed: incomingMasterSeed, templateRecruitId, rerollNonce } = req.body as { theme?: string; forcedType?: any; masterSeed?: string; templateRecruitId?: string; rerollNonce?: number };

    // Derive a deterministic sub-seed from master seed + recruit identity + nonce
    // Nonce ensures repeated rerolls of the same recruit produce different results
    let derivedSeedStr2: string | undefined;
    if (incomingMasterSeed && templateRecruitId) {
      const { derivedSeed: ds } = await import("../../shared/seededRng");
      const nonceStr2 = rerollNonce != null ? `_reroll_${rerollNonce}` : "_reroll";
      derivedSeedStr2 = ds(incomingMasterSeed, templateRecruitId + nonceStr2).toString();
    }
    const recruits = generateRecruitClass(1, {
      theme: (theme as RecruitingTheme) || "balanced",
      wizardForcedType: forcedType,
      ...(derivedSeedStr2 ? { seed: derivedSeedStr2 } : {}),
    });

    res.json({ recruit: recruits[0] });
  } catch (error) {
    console.error("Failed to reroll recruit:", error);
    res.status(500).json({ message: "Failed to reroll recruit" });
  }
});

// Save wizard class to DB (deletes existing + batch creates)
app.post("/api/leagues/:id/recruiting/save-wizard-class", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }
    const { recruits: rawRecruits, storyPlan: rawStoryPlan, generation: rawGeneration, ai_assisted: rawAiAssisted } = req.body as { recruits: any[]; storyPlan?: any; generation?: { seed: string; version: number }; ai_assisted?: boolean };
    if (!Array.isArray(rawRecruits) || rawRecruits.length === 0) {
      return res.status(400).json({ message: "recruits array required" });
    }
    // Validate generation seed if provided
    const generation = (rawGeneration && typeof rawGeneration.seed === "string" && rawGeneration.seed.length > 0)
      ? { seed: rawGeneration.seed, version: rawGeneration.version ?? 1 }
      : undefined;
    let validatedWizard;
    try {
      validatedWizard = validateAndNormalizeRecruitingClass(rawRecruits);
    } catch (e) {
      if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
      throw e;
    }

    // Validate storyPlan shape and allowlist arcTemplateKey values against
    // the canonical ARCHETYPE_DEFS registry.  Invalid keys would poison the
    // storyline recruit's archetype and break weekly event generation paths.
    let storyPlan: import("@shared/schema").WizardStoryPlan | undefined;
    if (rawStoryPlan && rawStoryPlan.mode === "authored" && Array.isArray(rawStoryPlan.cast)) {
      const validArchetypeKeys = new Set(Object.keys(archetypeDefs));
      for (const member of rawStoryPlan.cast as any[]) {
        if (member.arcMode === "template" && member.arcTemplateKey) {
          if (!validArchetypeKeys.has(member.arcTemplateKey)) {
            return res.status(400).json({
              message: `Invalid arcTemplateKey "${member.arcTemplateKey}". Must be one of: ${[...validArchetypeKeys].join(", ")}`,
            });
          }
        }
      }
      storyPlan = rawStoryPlan as import("@shared/schema").WizardStoryPlan;
    }

    const leagueId = req.params.id as string;
    const { count: savedCount } = await replaceLeagueRecruitingClass({
      leagueId,
      season: league.currentSeason,
      recruits: (validatedWizard.recruits.map(r => ({ ...r, leagueId })) as any),
      initStorylines: true,
      storyPlan,
      // Pass master seed so storyline recruit selection is deterministic
      masterSeed: generation?.seed,
      saveState: {
        trigger: "pre_restore",
        label: `Pre-wizard-class replacement (season ${league.currentSeason})`,
        userId: req.session.userId,
      },
      audit: {
        userId: req.session.userId ?? "system",
        action: "Recruiting Class Created (Wizard)",
        details: `Commissioner created a recruiting class of ${validatedWizard.recruits.length} recruits via the class wizard${generation ? ` [seed: ${generation.seed}, v${generation.version}]` : ""}${rawAiAssisted ? " [AI-Assisted]" : ""}`,
      },
    });

    if (savedCount !== validatedWizard.recruits.length) {
      return res.status(500).json({
        message: `Save incomplete: only ${savedCount} of ${validatedWizard.recruits.length} recruits were saved. Please try again.`,
      });
    }

    res.json({ success: true, count: savedCount });
  } catch (error) {
    console.error("Failed to save wizard class:", error);
    res.status(500).json({ message: "Failed to save class" });
  }
});

// Load a saved recruiting class into a league (replaces current recruit pool)
app.post("/api/leagues/:id/recruiting/load-saved-class", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }

    // ── Phase guard: allowlist — only safe in early offseason / initial setup ──
    // The window is deliberately narrow: dynasty_setup (initial commissioner
    // configuration before any game has been played) and the early offseason
    // phases that occur before recruiting activities begin for the next class.
    // Any other phase — including preseason, season, postseason, signing day,
    // walk-on phase — is rejected so coaches cannot lose accumulated work.
    const ALLOWED_PHASES = new Set([
      "dynasty_setup",   // initial setup before first season
      "offseason",       // post-CWS before any recruiting actions begin
      "offseason_departures", // graduation/transfer window, still pre-recruiting
    ]);
    if (!ALLOWED_PHASES.has(league.currentPhase)) {
      return res.status(409).json({
        message: `Cannot replace the recruiting class during the "${league.currentPhase}" phase. ` +
          `Load a saved class only during initial dynasty setup or early offseason (before recruiting activity begins).`,
      });
    }

    // ── Activity guard: reject if any coach has already taken recruiting actions ─
    // Check recruiting interests AND actions-log rows.  Any non-zero count from
    // either table means coaches have spent time/actions on specific recruits and
    // replacing the pool would silently wipe scouting, visit, call, and commit data.
    const [existingInterests, existingActions] = await Promise.all([
      storage.getRecruitingInterestsByLeague(req.params.id as string),
      storage.getRecruitingActionsLogBySeason(req.params.id as string, league.currentSeason),
    ]);
    const activityCount = existingInterests.length + existingActions.length;
    if (activityCount > 0) {
      return res.status(409).json({
        message: `Cannot replace the recruiting class — ${activityCount} recruiting activity record(s) already exist for this season ` +
          `(${existingInterests.length} interest(s), ${existingActions.length} action(s)). ` +
          `Load a saved class only before any coach has started recruiting activity.`,
      });
    }

    const { savedClassId } = req.body as { savedClassId: string };
    if (!savedClassId) return res.status(400).json({ message: "savedClassId required" });

    const savedClass = await storage.getSavedRecruitingClass(String(savedClassId));
    if (!savedClass) return res.status(404).json({ message: "Saved class not found" });
    if (savedClass.userId && savedClass.userId !== req.session.userId) {
      return res.status(403).json({ message: "You do not own this saved class" });
    }

    // classData may be either a plain recruits array (legacy) or an object
    // { recruits: [...], storyPlan: {...} } (wizard-saved with story plan).
    const rawClassData = savedClass.classData as any;
    const recruitSource = Array.isArray(rawClassData)
      ? rawClassData
      : Array.isArray(rawClassData?.recruits) ? rawClassData.recruits : rawClassData;

    let validatedLoad;
    try {
      validatedLoad = validateAndNormalizeRecruitingClass(recruitSource);
    } catch (e) {
      if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
      throw e;
    }

    // Extract authored storyPlan if present in the saved class data
    let loadedStoryPlan: import("@shared/schema").WizardStoryPlan | undefined;
    if (
      !Array.isArray(rawClassData) &&
      rawClassData?.storyPlan?.mode === "authored" &&
      Array.isArray(rawClassData.storyPlan.cast)
    ) {
      loadedStoryPlan = rawClassData.storyPlan as import("@shared/schema").WizardStoryPlan;
    }

    const leagueId = req.params.id as string;
    const { count: loadedCount } = await replaceLeagueRecruitingClass({
      leagueId,
      season: league.currentSeason,
      recruits: (validatedLoad.recruits.map(r => ({ ...r, leagueId })) as any),
      initStorylines: true,
      storyPlan: loadedStoryPlan,
      saveState: {
        trigger: "pre_restore",
        label: `Pre-load-saved-class "${savedClass.name}" (season ${league.currentSeason})`,
        userId: req.session.userId,
      },
      audit: {
        userId: req.session.userId ?? "system",
        action: "Recruiting Class Loaded",
        details: `Commissioner loaded saved class "${savedClass.name}" (${validatedLoad.recruits.length} recruits)`,
      },
    });

    res.json({ success: true, count: loadedCount, className: savedClass.name });
  } catch (error) {
    console.error("Failed to load saved class:", error);
    res.status(500).json({ message: "Failed to load saved class" });
  }
});

// ───────────────────────────────────────────────────────────────────────────

app.patch("/api/leagues/:id/deadline", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can set a deadline" });
    }
    const { deadline } = req.body;
    const phaseDeadline = deadline ? new Date(deadline) : null;
    if (phaseDeadline && isNaN(phaseDeadline.getTime())) {
      return res.status(400).json({ message: "Invalid deadline date" });
    }
    const updated = await storage.updateLeague(req.params.id as string, { phaseDeadline });
    res.json(updated);
  } catch (error) {
    console.error("Failed to update deadline:", error);
    res.status(500).json({ message: "Failed to update deadline" });
  }
});

app.patch("/api/leagues/:id/settings", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can change league settings" });
    }
    const result = settingsSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid settings data" });
    }

    // Full Season preset: certain settings are locked at dynasty creation and cannot be changed.
    const isFullSeason = (league as any).dynastyPreset === "full_season";
    if (isFullSeason) {
      const FULL_SEASON_LOCKED_FIELDS = ["maxTeams", "conferenceCount", "seasonLength", "progressionEnabled"] as const;
      const attempted = FULL_SEASON_LOCKED_FIELDS.filter(f => (result.data as any)[f] !== undefined);
      if (attempted.length > 0) {
        return res.status(409).json({
          message: `Full Season dynasties have locked settings that cannot be changed after creation: ${attempted.join(", ")}.`,
        });
      }
      if (result.data.gameMode !== undefined && result.data.gameMode !== "simulated") {
        return res.status(409).json({
          message: "Full Season dynasties are locked to Simulated game mode and cannot be switched to Reported mode.",
        });
      }
    }

    const updateData: Record<string, any> = {};
    if (result.data.auditLogPublic !== undefined) updateData.auditLogPublic = result.data.auditLogPublic;
    if (result.data.cpuDifficulty !== undefined) updateData.cpuDifficulty = result.data.cpuDifficulty;
    if (result.data.cpuRecruitingAggression !== undefined) updateData.cpuRecruitingAggression = result.data.cpuRecruitingAggression;
    if (result.data.emailDigestsEnabled !== undefined) updateData.emailDigestsEnabled = result.data.emailDigestsEnabled;
    if (result.data.showReadyNamesToAll !== undefined) updateData.showReadyNamesToAll = result.data.showReadyNamesToAll;
    // Only allow gameMode changes on non-full_season leagues (locked above).
    if (result.data.gameMode !== undefined && !isFullSeason) updateData.gameMode = result.data.gameMode;
    const updated = await storage.updateLeague(req.params.id as string, updateData);
    res.json(updated);
  } catch (error) {
    console.error("Failed to update settings:", error);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

app.patch("/api/leagues/:id/co-commissioners", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (league.commissionerId !== req.session.userId) {
      return res.status(403).json({ message: "Only the primary commissioner can manage delegates" });
    }
    const { userId, action } = req.body as { userId: string; action: "add" | "remove" };
    if (!userId || !["add", "remove"].includes(action)) {
      return res.status(400).json({ message: "userId and action (add|remove) are required" });
    }
    if (userId === league.commissionerId) {
      return res.status(400).json({ message: "The primary commissioner cannot be a co-commissioner" });
    }
    // Verify target user is a coach in this league
    const coaches = await storage.getCoachesByLeague(league.id);
    const targetCoach = coaches.find(c => c.userId === userId);
    if (!targetCoach) {
      return res.status(400).json({ message: "Target user is not a coach in this league" });
    }
    const current: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
    let updated: string[];
    if (action === "add") {
      updated = current.includes(userId) ? current : [...current, userId];
    } else {
      updated = current.filter(id => id !== userId);
    }
    const updatedLeague = await storage.updateLeague(league.id, { coCommissionerIds: updated });
    const targetCoachName = `${targetCoach.firstName} ${targetCoach.lastName}`;
    await storage.createAuditLog({
      leagueId: league.id,
      userId: req.session.userId,
      action: action === "add" ? "Delegate Added" : "Delegate Removed",
      details: `${targetCoachName} was ${action === "add" ? "granted" : "revoked"} co-commissioner access`,
    });
    res.json(updatedLeague);
  } catch (error) {
    console.error("Failed to update co-commissioners:", error);
    res.status(500).json({ message: "Failed to update co-commissioners" });
  }
});

app.delete("/api/leagues/:id", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const deletingUserId = req.session.userId;
    if (!deletingUserId || league.commissionerId !== deletingUserId) {
      console.warn(`[delete-league] 403: commissionerId=${league.commissionerId} sessionUserId=${deletingUserId} leagueId=${leagueId}`);
      return res.status(403).json({ message: "Only the commissioner can delete a league" });
    }
    
    await storage.deleteLeague(leagueId);
    res.json({ message: "League deleted" });
  } catch (error) {
    console.error("Failed to delete league:", error);
    res.status(500).json({ message: "Failed to delete league" });
  }
});

// League invite routes

// Team routes
app.get("/api/leagues/:id/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const team = await storage.getTeam(req.params.teamId as string);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const coach = team.coachId ? await storage.getCoach(team.coachId) : undefined;
    const teamPlayers = await storage.getPlayersByTeam(team.id);
    const teamGames = await storage.getGamesByTeam(team.id);
    const allTeams = await storage.getTeamsByLeague(req.params.id as string);

    // Enrich games with team info
    const gamesWithTeams = teamGames.map(game => {
      const homeTeam = allTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = allTeams.find(t => t.id === game.awayTeamId);
      return {
        ...game,
        homeTeam: homeTeam ? { name: homeTeam.name, abbreviation: homeTeam.abbreviation } : undefined,
        awayTeam: awayTeam ? { name: awayTeam.name, abbreviation: awayTeam.abbreviation } : undefined,
      };
    });

    // Calculate record
    let wins = 0, losses = 0, conferenceWins = 0, conferenceLosses = 0;
    teamGames.forEach(game => {
      if (game.homeScore !== null && game.awayScore !== null) {
        const isHome = game.homeTeamId === team.id;
        const ourScore = isHome ? game.homeScore : game.awayScore;
        const theirScore = isHome ? game.awayScore : game.homeScore;
        if (ourScore > theirScore) {
          wins++;
          if (game.isConference) conferenceWins++;
        } else {
          losses++;
          if (game.isConference) conferenceLosses++;
        }
      }
    });

    res.json({
      ...team,
      coach,
      players: teamPlayers,
      games: gamesWithTeams,
      record: { wins, losses, conferenceWins, conferenceLosses },
    });
  } catch (error) {
    console.error("Failed to fetch team:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
});

// Program profile endpoint
app.get("/api/leagues/:id/teams/:teamId/program-profile", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const teamId = req.params.teamId as string;

    const [team, league, allTeams] = await Promise.all([
      storage.getTeam(teamId),
      storage.getLeague(leagueId),
      storage.getTeamsByLeague(leagueId),
    ]);

    if (!team || !league) {
      return res.status(404).json({ message: "Team not found" });
    }

    // Security: ensure team belongs to this league
    if (team.leagueId !== leagueId) {
      return res.status(403).json({ message: "Team does not belong to this league" });
    }

    const [coach, conferences, teamStandings, allLeagueStandings, teamHistory, teamGames, currentRoster] = await Promise.all([
      team.coachId ? storage.getCoach(team.coachId) : Promise.resolve(undefined),
      storage.getConferencesByLeague(leagueId),
      storage.getStandingsByTeam(teamId),
      storage.getAllStandingsByLeague(leagueId),
      storage.getPlayerHistoryByTeam(teamId),
      storage.getGamesByTeam(teamId),
      storage.getPlayersByTeam(teamId),
    ]);

    // Determine if the coach is the commissioner
    const isCommissioner = !!(coach?.userId && league.commissionerId === coach.userId);
    // Commissioner tenure: seasons they've served (best proxy — full league run)
    const commissionerSeasons = isCommissioner ? league.currentSeason : 0;

    // Conference for this team
    const teamConferenceId = team.conferenceId;

    // Compute all-time W/L from completed regular-season and postseason game results
    // (standings can exclude certain phases; game results are the authoritative source)
    let allTimeWins = 0;
    let allTimeLosses = 0;
    for (const game of teamGames) {
      if (!game.isComplete) continue;
      const isHome = game.homeTeamId === teamId;
      const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
      const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
      if (ourScore > theirScore) allTimeWins++;
      else allTimeLosses++;
    }

    // Group all league standings by season for conference finish calculation
    const standingsBySeason: Record<number, typeof allLeagueStandings> = {};
    for (const s of allLeagueStandings) {
      if (!standingsBySeason[s.season]) standingsBySeason[s.season] = [];
      standingsBySeason[s.season].push(s);
    }

    // Build team lookup for conference filtering
    const teamConferenceMap: Record<string, string | null> = {};
    for (const t of allTeams) {
      teamConferenceMap[t.id] = t.conferenceId;
    }

    // Determine postseason outcomes per season from team games
    interface PostseasonGames {
      confChamp: { played: boolean; won: boolean };
      superRegionals: { played: boolean; won: boolean };
      cws: { played: boolean; won: boolean };
    }
    const postseasonBySeason: Record<number, PostseasonGames> = {};
    for (const game of teamGames) {
      if (!game.isComplete) continue;
      const phase = game.phase;
      if (!["conference_championship", "super_regionals", "cws"].includes(phase)) continue;
      const season = game.season;
      if (!postseasonBySeason[season]) {
        postseasonBySeason[season] = {
          confChamp: { played: false, won: false },
          superRegionals: { played: false, won: false },
          cws: { played: false, won: false },
        };
      }
      const isHome = game.homeTeamId === teamId;
      const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
      const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
      const won = ourScore > theirScore;
      if (phase === "conference_championship") {
        postseasonBySeason[season].confChamp.played = true;
        if (won) postseasonBySeason[season].confChamp.won = true;
      } else if (phase === "super_regionals") {
        postseasonBySeason[season].superRegionals.played = true;
        if (won) postseasonBySeason[season].superRegionals.won = true;
      } else if (phase === "cws") {
        postseasonBySeason[season].cws.played = true;
        if (won) postseasonBySeason[season].cws.won = true;
      }
    }

    // Detect CWS champion: CWS is best-of-3, champion wins 2 games total.
    // Track wins/losses per season from this team's CWS games.
    const cwsWinsBySeasonCount: Record<number, { wins: number; losses: number }> = {};
    for (const game of teamGames) {
      if (!game.isComplete || game.phase !== "cws") continue;
      if (!cwsWinsBySeasonCount[game.season]) cwsWinsBySeasonCount[game.season] = { wins: 0, losses: 0 };
      const isHome = game.homeTeamId === teamId;
      const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
      const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
      if (ourScore > theirScore) cwsWinsBySeasonCount[game.season].wins++;
      else cwsWinsBySeasonCount[game.season].losses++;
    }

    // Current season stat block (may be in-progress)
    const currentStanding = teamStandings.find(s => s.season === league.currentSeason);
    const currentSeasonStats = currentStanding ? {
      season: currentStanding.season,
      wins: currentStanding.wins,
      losses: currentStanding.losses,
      confWins: currentStanding.conferenceWins,
      confLosses: currentStanding.conferenceLosses,
    } : null;

    // Build season history — only completed seasons (season < currentSeason)
    const completedStandings = teamStandings.filter(s => s.season < league.currentSeason);
    const seasonHistory = completedStandings.map((standing) => {
      const season = standing.season;

      // Conference finish
      const seasonStandings = standingsBySeason[season] || [];
      const confTeamStandings = seasonStandings
        .filter(s => teamConferenceMap[s.teamId] === teamConferenceId)
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return a.losses - b.losses;
        });
      const confFinish = confTeamStandings.findIndex(s => s.teamId === teamId) + 1 || null;

      // Postseason result label
      const ps = postseasonBySeason[season];
      let postseasonResult = "—";
      if (ps) {
        const cwsRecord = cwsWinsBySeasonCount[season];
        if (ps.cws.played) {
          // CWS champion wins 2 games in best-of-3 format
          if (cwsRecord && cwsRecord.wins >= 2) {
            postseasonResult = "CWS Champion";
          } else {
            postseasonResult = "CWS";
          }
        } else if (ps.superRegionals.played) {
          postseasonResult = "Super Regionals";
        } else if (ps.confChamp.played) {
          postseasonResult = "Conf. Champ.";
        }
      }

      return {
        season,
        wins: standing.wins,
        losses: standing.losses,
        confWins: standing.conferenceWins,
        confLosses: standing.conferenceLosses,
        confFinish,
        postseasonResult,
      };
    }).sort((a, b) => b.season - a.season);

    // Aggregate postseason milestones
    const confChampAppearances = Object.values(postseasonBySeason).filter(ps => ps.confChamp.played).length;
    const confChampionships = Object.values(postseasonBySeason).filter(ps => ps.confChamp.won).length;
    const superRegionalsAppearances = Object.values(postseasonBySeason).filter(ps => ps.superRegionals.played).length;
    const cwsAppearances = Object.values(postseasonBySeason).filter(ps => ps.cws.played).length;
    // CWS champion: won at least 2 CWS games (best-of-3)
    const cwsTitles = Object.values(cwsWinsBySeasonCount).filter(r => r.wins >= 2).length;

    // Recruiting Hall of Fame — top 5 all-time players ever on this roster, ranked by signing-time OVR.
    // signingOvr is captured in finalizeSigningDay when a recruit converts to a player, and is copied
    // into player_history when the player departs. This is the authoritative pre-development baseline.
    // Falls back to departure/current OVR for pre-migration rows where signingOvr is null.
    // Excluded: players who were cut and sent to JUCO (departureType = cut_juco).
    const departureStatusMap: Record<string, string> = {
      graduated: "graduated",
      draft: "drafted",
      transfer_portal: "transferred",
      transfer_signed: "transferred",
      transfer_juco: "transferred",
    };

    const activePlayerEntries = currentRoster
      .filter(p => !p.inTransferPortal)
      .map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        overall: p.overall,
        signingOvr: p.signingOvr ?? p.overall,
        starRating: p.starRating,
        status: "active" as const,
        draftRound: null as number | null,
        season: null as number | null,
        abilities: (p.abilities ?? []) as string[],
      }));

    const historicPlayerEntries = teamHistory
      .filter(p => p.departureType !== "cut_juco")
      .map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        overall: p.overall,
        signingOvr: p.signingOvr ?? p.overall,
        starRating: p.starRating,
        status: (departureStatusMap[p.departureType] ?? p.departureType) as string,
        draftRound: p.draftRound,
        season: p.departedSeason,
        abilities: (p.abilities ?? []) as string[],
      }));

    const hofPlayers = [...activePlayerEntries, ...historicPlayerEntries]
      .sort((a, b) => b.signingOvr - a.signingOvr)
      .slice(0, 5);

    // Top drafted players: combine player_history + active roster players with draftRound set
    // Sorted by draft round asc then OVR desc — no arbitrary cap
    const activeDraftedPlayers = currentRoster
      .filter(p => p.draftRound != null)
      .map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        overall: p.overall,
        starRating: p.starRating,
        draftRound: p.draftRound as number,
        departedSeason: league.currentSeason,
      }));
    const historicDraftedPlayers = teamHistory
      .filter(p => p.draftRound != null)
      .map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        overall: p.overall,
        starRating: p.starRating,
        draftRound: p.draftRound as number,
        departedSeason: p.departedSeason,
      }));
    const draftedPlayers = [...activeDraftedPlayers, ...historicDraftedPlayers]
      .sort((a, b) => a.draftRound - b.draftRound || b.overall - a.overall);

    res.json({
      team: {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
        mascot: team.mascot,
        prestige: team.prestige,
        facilities: team.facilities,
        academics: team.academics,
        stadium: team.stadium,
        collegeLife: team.collegeLife,
        marketing: team.marketing,
        prevPrestige: team.prevPrestige ?? null,
        prevFacilities: team.prevFacilities ?? null,
        prevAcademics: team.prevAcademics ?? null,
        prevStadium: team.prevStadium ?? null,
        prevCollegeLife: team.prevCollegeLife ?? null,
        isCpu: team.isCpu,
        conferenceName: conferences.find(c => c.id === team.conferenceId)?.name ?? null,
      },
      coach: coach ? {
        id: coach.id,
        firstName: coach.firstName,
        lastName: coach.lastName,
        archetype: coach.archetype,
        level: coach.level,
        xp: coach.xp,
        userId: coach.userId,
      } : null,
      isCommissioner,
      commissionerSeasons,
      currentSeason: league.currentSeason,
      allTimeWins,
      allTimeLosses,
      confChampAppearances,
      confChampionships,
      superRegionalsAppearances,
      cwsAppearances,
      cwsTitles,
      currentSeasonStats,
      seasonHistory,
      recruitingHoF: hofPlayers,
      topDraftedPlayers: draftedPlayers,
    });
  } catch (error) {
    console.error("Failed to fetch program profile:", error);
    res.status(500).json({ message: "Failed to fetch program profile" });
  }
});

// Single recruit route
app.get("/api/leagues/:id/recruits/:recruitId", requireAuth, async (req, res) => {
  try {
    const recruit = await storage.getRecruit(req.params.recruitId as string);
    // Cross-league IDOR guard: ensure this recruit belongs to the league in the URL.
    if (!recruit || recruit.leagueId !== (req.params.id as string)) {
      return res.status(404).json({ message: "Recruit not found" });
    }

    // Get user's team to find their interest in this recruit
    const [leagueTeams, coaches] = await Promise.all([
      storage.getTeamsByLeague(req.params.id as string),
      storage.getCoachesByLeague(req.params.id as string),
    ]);
    const userCoach = coaches.find(c => c.userId === req.session.userId);
    const userTeam = userCoach?.teamId ? leagueTeams.find(t => t.id === userCoach.teamId) : undefined;
    
    let interest = null;
    if (userTeam) {
      interest = await storage.getRecruitingInterest(recruit.id, userTeam.id);
    }

    // Fetch stored top schools from database (only includes teams in the league)
    const teamMap = new Map(leagueTeams.map(t => [t.id, t]));
    const storedTopSchools = await storage.getRecruitTopSchools(recruit.id);
    const stage = (recruit.stage || "open").toLowerCase();
    const topSchoolsCount = stage === "top3" ? 3 : stage === "top5" ? 5 : 8;
    
    // Deduplicate by teamId, keeping the entry with the highest combined interest
    const dedupedDetail = new Map<string, typeof storedTopSchools[0]>();
    for (const ts of storedTopSchools) {
      if (!ts.isActive || !teamMap.has(ts.teamId)) continue;
      const existing = dedupedDetail.get(ts.teamId);
      if (!existing || (ts.interestLevel + ts.accumulatedInterest) > (existing.interestLevel + existing.accumulatedInterest)) {
        dedupedDetail.set(ts.teamId, ts);
      }
    }
    let topSchools = Array.from(dedupedDetail.values())
      .sort((a, b) => (b.interestLevel + b.accumulatedInterest) - (a.interestLevel + a.accumulatedInterest))
      .slice(0, topSchoolsCount)
      .map(ts => {
        const team = teamMap.get(ts.teamId)!;
        const combined = Math.min(100, ts.interestLevel + ts.accumulatedInterest);
        return {
          teamId: ts.teamId,
          teamName: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          interestLevel: combined,
          previousInterestLevel: ts.previousInterestLevel ?? null,
        };
      });
    
    // Fallback if no stored top schools
    if (topSchools.length === 0) {
      const seedFromId = (id: string) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
          hash = ((hash << 5) - hash) + id.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash);
      };
      const seed = seedFromId(recruit.id);
      const seededShuffle = <T,>(arr: T[], s: number): T[] => {
        const result = Array.from(arr);
        for (let i = result.length - 1; i > 0; i--) {
          const j = (s * (i + 1)) % result.length;
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      };
      const shuffledTeams = seededShuffle(leagueTeams, seed).slice(0, topSchoolsCount);
      topSchools = shuffledTeams.map((team, idx) => ({
        teamId: team.id,
        teamName: team.name,
        abbreviation: team.abbreviation,
        primaryColor: team.primaryColor,
        interestLevel: Math.max(10, 100 - (idx * 10) - ((seed + idx) % 10)),
        previousInterestLevel: null,
      })).sort((a, b) => b.interestLevel - a.interestLevel);
    }

    let actualPotential = recruit.potential;
    if (actualPotential == null) {
      actualPotential = rollV3Potential(recruit.starRating ?? undefined, recruit.playerArchetype ?? "normal");
      storage.updateRecruit(recruit.id, { potential: actualPotential }).catch(() => {});
    }
    let dynamicPotentialFloor = recruit.potentialFloor;
    let dynamicPotentialCeiling = recruit.potentialCeiling;
    if (actualPotential != null && userTeam?.coachId) {
      const coach = await storage.getCoach(userTeam.coachId);
      if (coach) {
        const evalSkill = coach.evaluationSkill || 1;
        const dynRange = getPotentialRange(actualPotential, evalSkill);
        dynamicPotentialFloor = dynRange.floor;
        dynamicPotentialCeiling = dynRange.ceiling;
      }
    }

    const signedTeam = recruit.signedTeamId ? teamMap.get(recruit.signedTeamId) : null;

    // Signing-day holdback — same logic as the bulk /recruits endpoint.
    // Hold back the last 50% of attr fields and last 50% of common-ability fields
    // until signingDayRevealed = true. Blue chips and generational gems are exempt.
    const SD_ATTR_KEYS = new Set([
      'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
      'velocity', 'control', 'stamina',
      'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchVSL', 'pitchFK', 'pitchSFF', 'pitchSHU',
    ]);
    const SD_COMMON_KEYS = new Set([
      'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery',
      'wRISP', 'vsLefty', 'poise', 'heater', 'agile', 'catcherAbility',
    ]);
    const sdIsPitcher = ['P', 'SP', 'RP', 'CP'].includes(recruit.position || '');
    const sdDefaultAttr = sdIsPitcher
      ? ['velocity', 'control', 'stamina', 'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchVSL', 'pitchFK', 'pitchSFF', 'pitchSHU']
      : ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance'];
    const sdDefaultCommon = sdIsPitcher
      ? ['wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery']
      : ['clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility'];
    const sdScoutingOrder = (recruit.scoutingOrder as string[]) || [];
    const sdAttrFromOrder   = sdScoutingOrder.filter((f: string) => SD_ATTR_KEYS.has(f));
    const sdCommonFromOrder = sdScoutingOrder.filter((f: string) => SD_COMMON_KEYS.has(f));
    const sdAttrOrder   = sdAttrFromOrder.length   > 0 ? sdAttrFromOrder   : sdDefaultAttr;
    const sdCommonOrder = sdCommonFromOrder.length > 0 ? sdCommonFromOrder : sdDefaultCommon;
    const sdHoldbackFields: string[] = recruit.signingDayRevealed
      ? []
      : (recruit.isBlueChip || recruit.isGenerationalGem)
        ? []
        : [
            ...sdAttrOrder.slice(Math.floor(sdAttrOrder.length * 0.50)),
            ...sdCommonOrder.slice(Math.floor(sdCommonOrder.length * 0.50)),
          ];
    const sdMasked: Record<string, unknown> = { ...recruit };
    for (const field of sdHoldbackFields) {
      sdMasked[field] = null;
    }

    res.json({
      recruit: {
        ...sdMasked,
        potential: actualPotential,
        potentialFloor: dynamicPotentialFloor,
        potentialCeiling: dynamicPotentialCeiling,
        interest,
        signedTeamName: signedTeam?.name ?? null,
        signedTeamAbbreviation: signedTeam?.abbreviation ?? null,
        signedTeamPrimaryColor: signedTeam?.primaryColor ?? null,
        signedTeamSecondaryColor: signedTeam?.secondaryColor ?? null,
        signingDayLockedFields: sdHoldbackFields,
      },
      topSchools,
    });
  } catch (error) {
    console.error("Failed to fetch recruit:", error);
    res.status(500).json({ message: "Failed to fetch recruit" });
  }
});

// Update recruit (commissioner only)
app.patch("/api/leagues/:id/recruits/:recruitId", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can edit recruits" });
    }

    const recruit = await storage.getRecruit(req.params.recruitId as string);
    if (!recruit) {
      return res.status(404).json({ message: "Recruit not found" });
    }

    if (recruit.leagueId !== req.params.id as string) {
      return res.status(403).json({ message: "Recruit does not belong to this league" });
    }

    const allowedFields = [
      'firstName', 'lastName', 'position', 'hometown', 'homeState',
      'batHand', 'throwHand', 'recruitType', 'recruitYear',
      'skinTone', 'hairColor', 'hairStyle', 'headwear',
      'overall', 'starRating', 'classRank', 'positionRank',
      'isBlueChip', 'isGem', 'isBust', 'isGenerationalGem', 'isGenerationalBust',
      'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
      'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
      'velocity', 'control', 'stamina', 'stuff',
      'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
      'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchVSL', 'pitchFK', 'pitchSFF', 'pitchSHU',
      'abilities',
      'proximityPriority', 'reputationPriority', 'playingTimePriority',
      'academicsPriority', 'prestigePriority', 'facilitiesPriority', 'dealbreaker'
    ];

    const sanitizedData: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body && key !== 'overall' && key !== 'starRating') {
        sanitizedData[key] = req.body[key];
      }
    }

    const mergedRecruit = { ...recruit, ...sanitizedData };
    sanitizedData['overall'] = calculateOVR(mergedRecruit);
    sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall']);
    sanitizedData['starRank'] = sanitizedData['starRating'];

    const updated = await storage.updateRecruit(req.params.recruitId as string, sanitizedData);
    
    await storage.createAuditLog({
      leagueId: req.params.id as string,
      userId: req.session.userId,
      action: "Recruit Edited",
      details: `Edited recruit ${recruit.firstName} ${recruit.lastName}`,
    });

    res.json(updated);
  } catch (error) {
    console.error("Failed to update recruit:", error);
    res.status(500).json({ message: "Failed to update recruit" });
  }
});

// Batch update recruits (commissioner only)
app.patch("/api/leagues/:id/recruits/batch", requireAuth, async (req, res) => {
  try {
    const league = await storage.getLeague(req.params.id as string);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can edit recruits" });
    }

    const { updates } = req.body as { updates: { id: string; changes: Record<string, unknown> }[] };
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: "Updates must be an array" });
    }

    const allowedFields = [
      'firstName', 'lastName', 'position', 'hometown', 'homeState',
      'batHand', 'throwHand', 'recruitType', 'recruitYear',
      'skinTone', 'hairColor', 'hairStyle', 'headwear',
      'overall', 'starRating', 'classRank', 'positionRank',
      'isBlueChip', 'isGem', 'isBust', 'isGenerationalGem', 'isGenerationalBust',
      'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
      'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
      'velocity', 'control', 'stamina', 'stuff',
      'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
      'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchVSL', 'pitchFK', 'pitchSFF', 'pitchSHU',
      'abilities',
      'proximityPriority', 'reputationPriority', 'playingTimePriority',
      'academicsPriority', 'prestigePriority', 'facilitiesPriority', 'dealbreaker'
    ];

    const results = [];
    for (const update of updates) {
      const recruit = await storage.getRecruit(update.id);
      if (recruit && recruit.leagueId === req.params.id as string) {
        const sanitizedData: Record<string, unknown> = {};
        for (const key of allowedFields) {
          if (key in update.changes && key !== 'overall' && key !== 'starRating') {
            sanitizedData[key] = update.changes[key];
          }
        }
        const mergedRecruit = { ...recruit, ...sanitizedData };
        sanitizedData['overall'] = calculateOVR(mergedRecruit as any);
        sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall'] as number);
        sanitizedData['starRank'] = sanitizedData['starRating'];
        const updated = await storage.updateRecruit(update.id, sanitizedData);
        results.push(updated);
      }
    }

    await storage.createAuditLog({
      leagueId: req.params.id as string,
      userId: req.session.userId,
      action: "Batch Recruit Edit",
      details: `Edited ${results.length} recruits via recruiting editor`,
    });

    res.json({ success: true, count: results.length });
  } catch (error) {
    console.error("Failed to batch update recruits:", error);
    res.status(500).json({ message: "Failed to batch update recruits" });
  }
});

// Dynasty Setup routes
app.get("/api/leagues/:id/dynasty-setup", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId;
    
    const league = await storage.getLeague(leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }
    
    const teams = await storage.getTeamsByLeague(leagueId);
    const conferences = await storage.getConferencesByLeague(leagueId);
    const recruits = await storage.getRecruitsByLeague(leagueId);
    const games = await storage.getGamesByLeague(leagueId);
    const invites = await storage.getLeagueInvitesByLeague(leagueId);
    
    const teamsWithCoaches = await Promise.all(teams.map(async (team) => {
      const coach = team.coachId ? await storage.getCoach(team.coachId) : null;
      let user = null;
      if (coach?.userId) {
        const userData = await storage.getUser(coach.userId);
        user = userData ? { email: userData.email } : null;
      }
      return { ...team, coach, user };
    }));
    
    const isCommissioner = hasCommissionerAccess(league, userId);
    
    res.json({
      league,
      teams: teamsWithCoaches,
      conferences,
      invites,
      hasRecruits: recruits.length > 0,
      hasSchedule: games.length > 0,
      isCommissioner,
    });
  } catch (error) {
    console.error("Failed to fetch dynasty setup:", error);
    res.status(500).json({ message: "Failed to fetch dynasty setup" });
  }
});

// Load a saved recruiting class into a league's recruiting pool (pre-start)
app.post("/api/leagues/:id/load-recruiting-class", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, userId)) {
      return res.status(403).json({ message: "Only the commissioner can load a recruiting class." });
    }

    const schema = z.object({ savedRecruitingClassId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "savedRecruitingClassId is required" });
    }
    const { savedRecruitingClassId } = parsed.data;

    const savedClass = await storage.getSavedRecruitingClass(savedRecruitingClassId);
    if (!savedClass) return res.status(404).json({ message: "Saved recruiting class not found." });
    if (savedClass.userId && savedClass.userId !== userId) {
      return res.status(403).json({ message: "You do not own this saved recruiting class." });
    }

    let validatedLrc;
    try {
      validatedLrc = validateAndNormalizeRecruitingClass(savedClass.classData as unknown);
    } catch (e) {
      if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
      throw e;
    }

    // Clear existing recruits and replace with the saved class
    const { count: lrcCount } = await replaceLeagueRecruitingClass({
      leagueId,
      season: league.currentSeason,
      recruits: (validatedLrc.recruits.map(r => ({ ...r, leagueId })) as any),
      audit: {
        userId: userId ?? "system",
        action: "Recruiting Class Loaded (Pre-Start)",
        details: `Commissioner loaded saved class "${savedClass.name}" (${validatedLrc.recruits.length} recruits) before dynasty start`,
      },
    });

    res.json({ ok: true, count: lrcCount, className: savedClass.name });
  } catch (error) {
    console.error("Failed to load recruiting class:", error);
    res.status(500).json({ message: "Failed to load recruiting class" });
  }
});

// Start dynasty - changes phase from dynasty_setup to preseason
app.post("/api/leagues/:id/start", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId;
    const { rosterId, recruitingClassId, perTeamRosters } = req.body || {};
    
    const league = await storage.getLeague(leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }
    
    if (!hasCommissionerAccess(league, userId)) {
      return res.status(403).json({ message: "Only the commissioner can start dynasty" });
    }

    // ── Early validation gate: recruiting class ───────────────────────────────
    // Validate any saved recruiting class BEFORE touching any roster data so
    // an invalid class returns 422 without leaving the league in a partial state.
    let prevalidatedClass: ClassValidationResult | undefined;
    if (recruitingClassId) {
      const earlyClass = await storage.getSavedRecruitingClass(recruitingClassId);
      // If the class doesn't exist or isn't owned by this user, fail hard BEFORE
      // touching any league data.  Returning 422 here keeps the league in dynasty_setup
      // so the commissioner can retry with a valid class.
      if (!earlyClass || earlyClass.userId !== userId) {
        return res.status(422).json({ message: "Recruiting class not found or not authorized. Provide a valid recruitingClassId owned by your account." });
      }
      try {
        prevalidatedClass = validateAndNormalizeRecruitingClass(earlyClass.classData as unknown);
      } catch (e) {
        if (e instanceof ClassValidationError) {
          return res.status(422).json({ message: `Recruiting class is invalid: ${e.message}` });
        }
        throw e;
      }
    }

    // ── Atomic start claim ────────────────────────────────────────────────────
    // Use an UPDATE with a WHERE guard instead of a read-then-check to prevent
    // two concurrent /start requests from both seeing 'dynasty_setup' and both
    // running setup.  The winning request sets phase to 'starting'; all others
    // get rowCount=0 and return success immediately.
    const claimResult = await pool.query(
      `UPDATE leagues SET current_phase = 'starting' WHERE id = $1 AND current_phase = 'dynasty_setup' RETURNING id`,
      [leagueId],
    );
    if ((claimResult.rowCount ?? 0) === 0) {
      // Another concurrent request won or the dynasty is already past setup.
      return res.json({ success: true, alreadyStarted: true });
    }

    // Apply saved roster if specified (legacy single-roster format)
    if (rosterId) {
      const savedRoster = await storage.getSavedRoster(rosterId);
      if (savedRoster && savedRoster.userId === userId) {
        const rosterData = savedRoster.rosterData as any;
        if (rosterData?.teams) {
          const teams = await storage.getTeamsByLeague(leagueId);
          for (const teamData of rosterData.teams) {
            const matchingTeam = teams.find(t => t.name === teamData.teamName);
            if (matchingTeam && teamData.players) {
              const existingPlayers = await storage.getPlayersByTeam(matchingTeam.id);
              for (const p of existingPlayers) {
                await storage.deletePlayer(p.id);
              }
              for (const playerData of teamData.players) {
                await storage.createPlayer({
                  ...playerData,
                  teamId: matchingTeam.id,
                  leagueId,
                });
              }
            }
          }
        }
      }
    }

    // Apply per-team saved rosters (map of teamName → savedRosterId)
    if (perTeamRosters && typeof perTeamRosters === "object") {
      const NUMERIC_ROSTER_ATTRS = [
        "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
        "velocity", "control", "stamina", "stuff", "clutch", "vsLHP", "grit",
        "stealing", "running", "throwing", "recovery", "wRISP", "vsLefty",
        "poise", "heater", "agile", "catcherAbility",
      ];
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      for (const [teamName, savedRosterId] of Object.entries(perTeamRosters as Record<string, string>)) {
        if (!savedRosterId) continue;
        const savedRoster = await storage.getSavedRoster(savedRosterId);
        if (!savedRoster || savedRoster.userId !== userId) continue;
        const matchingTeam = leagueTeams.find(t => t.name === teamName);
        if (!matchingTeam) continue;
        const savedPlayers = savedRoster.rosterData as any[];
        if (!Array.isArray(savedPlayers)) continue;
        const existingPlayers = await storage.getPlayersByTeam(matchingTeam.id);
        for (const sp of savedPlayers) {
          const existing = existingPlayers.find(
            p => p.firstName === sp.firstName && p.lastName === sp.lastName,
          );
          if (!existing) continue;
          const updates: Record<string, unknown> = {};
          for (const attr of NUMERIC_ROSTER_ATTRS) {
            if (typeof sp[attr] === "number") updates[attr] = sp[attr];
          }
          if (Array.isArray(sp.abilities)) updates.abilities = sp.abilities;
          if (Object.keys(updates).length > 0) {
            await storage.updatePlayer(existing.id, updates as any);
          }
        }
      }
    }
    
    // Generate CPU coaches for teams that don't have one
    await generateCpuCoaches(leagueId);
    
    // Apply saved recruiting class if specified, otherwise auto-generate
    const existingRecruits = await storage.getRecruitsByLeague(leagueId);
    if (existingRecruits.length === 0) {
      if (recruitingClassId && prevalidatedClass) {
        // Saved-class path — prevalidatedClass was already validated at the top of this
        // handler before any mutations; use it directly without re-validating.
        await replaceLeagueRecruitingClass({
          leagueId,
          season: league.currentSeason,
          recruits: prevalidatedClass.recruits.map(r => ({ ...r, leagueId })) as any,
          initStorylines: true,
          asyncStorylines: true,
          audit: {
            userId: userId ?? "system",
            action: "Recruiting Class Loaded (Dynasty Start)",
            details: `Saved class applied at dynasty start (${prevalidatedClass.recruits.length} recruits)`,
          },
        });
      } else if (!recruitingClassId) {
        const teams = await storage.getTeamsByLeague(leagueId);
        const recruitCount = getRecruitPoolSize(teams.length, league?.dynastyPreset ?? undefined);
        const joinGeneratedVintage = await generateRecruits(leagueId, recruitCount);
        await storage.updateLeague(leagueId, { currentClassVintage: joinGeneratedVintage });
      }
    }
    
    // Auto-generate schedule if not already present
    const existingGames = await storage.getGamesByLeague(leagueId);
    if (existingGames.length === 0) {
      await createScheduleForSeason(leagueId, 1);
      if (league?.dynastyPreset !== "full_season") {
        await generateExhibitionGames(leagueId, 1);
      }
    }
    
    await storage.updateLeague(leagueId, { currentPhase: "preseason" });
    invalidateLeague(leagueId);
    
    await storage.createAuditLog({
      leagueId,
      userId: userId || "system",
      action: "start_dynasty",
      details: JSON.stringify({ 
        season: league.currentSeason,
        rosterId: rosterId || "default",
        recruitingClassId: recruitingClassId || "auto",
      }),
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to start dynasty:", error);
    // Revert the transitional 'starting' phase back to 'dynasty_setup' so the
    // commissioner can retry.  Only reverts if we actually won the atomic claim
    // (i.e. a concurrent request that never touched the DB would already have
    // returned early above).
    const leagueId = req.params.id as string;
    await pool.query(
      `UPDATE leagues SET current_phase = 'dynasty_setup' WHERE id = $1 AND current_phase = 'starting'`,
      [leagueId],
    ).catch((revertErr) => {
      console.error("[start-dynasty] Failed to revert transitional phase:", revertErr);
    });
    res.status(500).json({ message: "Failed to start dynasty" });
  }
});

// Generate schedule
app.post("/api/leagues/:id/schedule/generate", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId;
    
    const league = await storage.getLeague(leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }
    
    if (!hasCommissionerAccess(league, userId)) {
      return res.status(403).json({ message: "Only the commissioner can generate schedule" });
    }
    
    await createScheduleForSeason(leagueId, 1);
    if (league?.dynastyPreset !== "full_season") {
      await generateExhibitionGames(leagueId, 1);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to generate schedule:", error);
    res.status(500).json({ message: "Failed to generate schedule" });
  }
});

// Schedule health dashboard — commissioner only
app.get("/api/leagues/:id/schedule/health", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;

    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }

    const season = league.currentSeason;
    const seasonLength = league.seasonLength || "standard";
    const numWeeks = seasonLength === "full_season" ? 14 : seasonLength === "long" ? 15 : seasonLength === "medium" ? 10 : 5;
    const maxGamesPerWeek = seasonLength === "short" || seasonLength === "standard" ? 2 : 4;
    const expectedGamesPerTeam = maxGamesPerWeek * numWeeks;

    const [allGames, allTeams] = await Promise.all([
      storage.getGamesByLeagueSeason(leagueId, season),
      storage.getTeamsByLeague(leagueId),
    ]);

    const regularGames = allGames.filter(g => g.phase === "regular");
    const humanTeamIds = new Set(allTeams.filter(t => !t.isCpu).map(t => t.id));
    const teamById = new Map(allTeams.map(t => [t.id, t]));

    const repeatThreshold = seasonLength === "short" || seasonLength === "standard" ? 2
      : seasonLength === "medium" ? 3 : 4;

    const teamStats = allTeams.map(team => {
      const myGames = regularGames.filter(
        g => g.homeTeamId === team.id || g.awayTeamId === team.id
      );
      const confGames = myGames.filter(g => g.isConference).length;
      const oocGames = myGames.filter(g => !g.isConference).length;

      const gamesByWeek = new Map<number, number>();
      for (let w = 1; w <= numWeeks; w++) gamesByWeek.set(w, 0);
      for (const g of myGames) {
        const w = g.week ?? 0;
        if (w >= 1 && w <= numWeeks) gamesByWeek.set(w, (gamesByWeek.get(w) ?? 0) + 1);
      }

      const byeWeeks = Array.from(gamesByWeek.entries())
        .filter(([, c]) => c === 0)
        .map(([w]) => w);
      const overloadedWeeks = Array.from(gamesByWeek.entries())
        .filter(([, c]) => c > maxGamesPerWeek)
        .map(([w, c]) => ({ week: w, count: c }));

      const opponentCounts = new Map<string, number>();
      for (const g of myGames) {
        const oppId = g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId;
        if (oppId) opponentCounts.set(oppId, (opponentCounts.get(oppId) ?? 0) + 1);
      }
      const repeatOpponents = Array.from(opponentCounts.entries())
        .filter(([, c]) => c > repeatThreshold)
        .sort((a, b) => b[1] - a[1])
        .map(([oppId, count]) => ({
          opponentId: oppId,
          opponentName: teamById.get(oppId)?.name ?? oppId,
          count,
        }));

      const humanMatchups = myGames.filter(g => {
        const oppId = g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId;
        return !!oppId && humanTeamIds.has(oppId) && oppId !== team.id;
      }).length;

      return {
        teamId: team.id,
        teamName: team.name,
        conferenceName: (team as any).conferenceName || "",
        isHuman: !team.isCpu,
        totalGames: myGames.length,
        confGames,
        oocGames,
        byeWeeks,
        overloadedWeeks,
        repeatOpponents,
        humanMatchups,
      };
    });

    const weekStats = Array.from({ length: numWeeks }, (_, i) => {
      const week = i + 1;
      const wGames = regularGames.filter(g => g.week === week);
      const teamsThisWeek = new Set<string>();
      for (const g of wGames) {
        if (g.homeTeamId) teamsThisWeek.add(g.homeTeamId);
        if (g.awayTeamId) teamsThisWeek.add(g.awayTeamId);
      }
      return {
        week,
        totalGames: wGames.length,
        confGames: wGames.filter(g => g.isConference).length,
        oocGames: wGames.filter(g => !g.isConference).length,
        teamsWithGames: teamsThisWeek.size,
        teamsOnBye: allTeams.length - teamsThisWeek.size,
      };
    });

    // Human-vs-human matchup matrix (symmetric)
    const humanTeamArr = allTeams.filter(t => !t.isCpu);
    const humanMatchupMatrix: Record<string, Record<string, number>> = {};
    for (const ht of humanTeamArr) {
      humanMatchupMatrix[ht.id] = {};
      for (const ht2 of humanTeamArr) {
        if (ht.id !== ht2.id) humanMatchupMatrix[ht.id][ht2.id] = 0;
      }
    }
    for (const g of regularGames) {
      if (
        g.homeTeamId && g.awayTeamId &&
        humanTeamIds.has(g.homeTeamId) && humanTeamIds.has(g.awayTeamId)
      ) {
        if (humanMatchupMatrix[g.homeTeamId]) {
          humanMatchupMatrix[g.homeTeamId][g.awayTeamId] =
            (humanMatchupMatrix[g.homeTeamId][g.awayTeamId] ?? 0) + 1;
        }
        if (humanMatchupMatrix[g.awayTeamId]) {
          humanMatchupMatrix[g.awayTeamId][g.homeTeamId] =
            (humanMatchupMatrix[g.awayTeamId][g.homeTeamId] ?? 0) + 1;
        }
      }
    }

    // Warnings
    const warnings: Array<{ severity: string; code: string; message: string }> = [];
    const isFullSeason = (league as any).dynastyPreset === "full_season";

    // Full Season uses strict zero-tolerance invariants (exact counts required).
    // Custom leagues use 15% tolerance bands.
    const tolerance = isFullSeason ? 0 : 0.15;
    const underTarget = teamStats.filter(t => t.totalGames < expectedGamesPerTeam - (isFullSeason ? 0 : expectedGamesPerTeam * tolerance));
    const overTarget = teamStats.filter(t => t.totalGames > expectedGamesPerTeam + (isFullSeason ? 0 : expectedGamesPerTeam * tolerance));

    // Strict full_season invariants
    if (isFullSeason) {
      const EXPECTED_TOTAL = 4172;
      if (regularGames.length !== EXPECTED_TOTAL) {
        warnings.push({
          severity: "error",
          code: "FS_TOTAL_GAME_MISMATCH",
          message: `Full Season requires exactly ${EXPECTED_TOTAL} regular-season games; found ${regularGames.length}`,
        });
      }
      const wrongCount = teamStats.filter(t => t.totalGames !== 56);
      if (wrongCount.length > 0) {
        warnings.push({
          severity: "error",
          code: "FS_TEAM_GAME_COUNT_VIOLATION",
          message: `${wrongCount.length} team(s) do not have exactly 56 regular-season games: ${wrongCount.slice(0, 5).map(t => `${t.teamName}=${t.totalGames}`).join(", ")}`,
        });
      }
      // In full season, every team should play exactly 4 games/week — odd-conf byes get 4 OOC games so no week should ever be 0 games.
      // Check for any 0-game weeks (true byes)
      const trueByeViolations = teamStats.filter(t => t.byeWeeks.length > 0);
      if (trueByeViolations.length > 0) {
        warnings.push({
          severity: "error",
          code: "FS_TRUE_BYE_WEEK",
          message: `Full Season: ${trueByeViolations.length} team(s) have at least one week with 0 games (all teams should play 4 games/week)`,
        });
      }
      // Week range: all regular games must be in weeks 1-14
      const outOfRangeGames = regularGames.filter(g => {
        const w = g.week ?? 0;
        return w < 1 || w > 14;
      });
      if (outOfRangeGames.length > 0) {
        warnings.push({
          severity: "error",
          code: "FS_WEEK_RANGE_VIOLATION",
          message: `Full Season: ${outOfRangeGames.length} game(s) have week values outside the required 1–14 range`,
        });
      }
      // OOC conference separation: no OOC game may have both teams in the same conference
      const confIdByTeamIdMap = new Map(allTeams.map(t => [t.id, t.conferenceId]));
      const sameConfOocGames = regularGames.filter(g => {
        if (g.isConference) return false;
        const cH = confIdByTeamIdMap.get(g.homeTeamId ?? "");
        const cA = confIdByTeamIdMap.get(g.awayTeamId ?? "");
        return cH && cA && cH === cA;
      });
      if (sameConfOocGames.length > 0) {
        warnings.push({
          severity: "error",
          code: "FS_OOC_SAME_CONF",
          message: `Full Season: ${sameConfOocGames.length} OOC game(s) involve teams from the same conference`,
        });
      }
      // Standings contamination: standings wins/losses must not exceed what's
      // possible from completed regular-season games (no exhibition/postseason bleed).
      const fsStandings = await storage.getStandingsByLeague(leagueId, season);
      const regWins = new Map<string, number>();
      const regLosses = new Map<string, number>();
      for (const g of regularGames) {
        if (g.homeScore == null || g.awayScore == null) continue; // not completed
        const homeWon = g.homeScore > g.awayScore;
        const hId = g.homeTeamId ?? "";
        const aId = g.awayTeamId ?? "";
        regWins.set(hId, (regWins.get(hId) ?? 0) + (homeWon ? 1 : 0));
        regLosses.set(hId, (regLosses.get(hId) ?? 0) + (homeWon ? 0 : 1));
        regWins.set(aId, (regWins.get(aId) ?? 0) + (homeWon ? 0 : 1));
        regLosses.set(aId, (regLosses.get(aId) ?? 0) + (homeWon ? 1 : 0));
      }
      const contaminatedTeams = fsStandings.filter(s => {
        const rw = regWins.get(s.teamId) ?? 0;
        const rl = regLosses.get(s.teamId) ?? 0;
        return (s.wins ?? 0) > rw || (s.losses ?? 0) > rl;
      });
      if (contaminatedTeams.length > 0) {
        warnings.push({
          severity: "error",
          code: "FS_STANDINGS_CONTAMINATION",
          message: `${contaminatedTeams.length} team(s) have standings totals exceeding their regular-season game results (possible exhibition/postseason contamination)`,
        });
      }
    }
    const teamsWithByes = teamStats.filter(t => t.byeWeeks.length > 1);
    const teamsWithOverloaded = teamStats.filter(t => t.overloadedWeeks.length > 0);
    const teamsWithRepeats = teamStats.filter(t => t.repeatOpponents.length > 0);

    if (underTarget.length > 0) warnings.push({
      severity: "warning",
      code: "GAME_COUNT_LOW",
      message: `${underTarget.length} team(s) have significantly fewer games than the ${expectedGamesPerTeam}-game target: ${underTarget.map(t => t.teamName).join(", ")}`,
    });
    if (overTarget.length > 0) warnings.push({
      severity: "warning",
      code: "GAME_COUNT_HIGH",
      message: `${overTarget.length} team(s) have significantly more games than expected: ${overTarget.map(t => t.teamName).join(", ")}`,
    });
    if (teamsWithOverloaded.length > 0) warnings.push({
      severity: "error",
      code: "OVERLOADED_WEEKS",
      message: `${teamsWithOverloaded.length} team(s) have weeks with more than ${maxGamesPerWeek} games scheduled`,
    });
    if (teamsWithByes.length > 0) warnings.push({
      severity: "warning",
      code: "EXCESSIVE_BYES",
      message: `${teamsWithByes.length} team(s) have 2 or more bye weeks: ${teamsWithByes.map(t => `${t.teamName} (${t.byeWeeks.length})`).join(", ")}`,
    });
    if (teamsWithRepeats.length > 0) warnings.push({
      severity: "info",
      code: "REPEAT_OPPONENTS",
      message: `${teamsWithRepeats.length} team(s) face an opponent more than expected based on season length`,
    });

    if (humanTeamArr.length > 1) {
      const hvhCounts: number[] = [];
      for (let i = 0; i < humanTeamArr.length; i++) {
        for (let j = i + 1; j < humanTeamArr.length; j++) {
          hvhCounts.push(humanMatchupMatrix[humanTeamArr[i].id][humanTeamArr[j].id] ?? 0);
        }
      }
      const maxHvH = Math.max(...hvhCounts);
      const minHvH = Math.min(...hvhCounts);
      if (maxHvH - minHvH > 2) {
        warnings.push({
          severity: "warning",
          code: "HUMAN_MATCHUP_IMBALANCE",
          message: `Human-vs-human matchup counts are imbalanced (range: ${minHvH}–${maxHvH} per pair)`,
        });
      }
    }

    const gameCounts = teamStats.map(t => t.totalGames);
    const summary = {
      minGames: gameCounts.length ? Math.min(...gameCounts) : 0,
      maxGames: gameCounts.length ? Math.max(...gameCounts) : 0,
      avgGames: gameCounts.length
        ? Math.round(gameCounts.reduce((a, b) => a + b, 0) / gameCounts.length)
        : 0,
      teamsUnderTarget: underTarget.length,
      teamsOverTarget: overTarget.length,
      totalByes: teamStats.reduce((a, t) => a + t.byeWeeks.length, 0),
      teamsWithRepeats: teamsWithRepeats.length,
      humanVsHumanGames: regularGames.filter(
        g => g.homeTeamId && g.awayTeamId &&
          humanTeamIds.has(g.homeTeamId) && humanTeamIds.has(g.awayTeamId)
      ).length,
      hasErrors: warnings.some(w => w.severity === "error"),
      hasWarnings: warnings.some(w => w.severity === "warning"),
    };

    res.json({
      season,
      seasonLength,
      numWeeks,
      numTeams: allTeams.length,
      expectedGamesPerTeam,
      maxGamesPerWeek,
      teamStats,
      weekStats,
      humanMatchupMatrix,
      humanTeamNames: Object.fromEntries(
        humanTeamArr.map(t => [t.id, t.name])
      ),
      warnings,
      summary,
    });
  } catch (error) {
    console.error("Failed to compute schedule health:", error);
    res.status(500).json({ message: "Failed to compute schedule health" });
  }
});

// Commissioner Preflight Check
app.get("/api/leagues/:id/commissioner/preflight", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;

    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, userId)) {
      return res.status(403).json({ message: "Commissioner only" });
    }

    const isReportedMode = league.gameMode === "reported";
    const currentPhase = league.currentPhase;
    const RECRUITING_PHASES = [
      "offseason_recruiting_1",
      "offseason_recruiting_2",
      "offseason_recruiting_3",
      "offseason_recruiting_4",
      "recruiting",
    ];
    const isRecruitingPhase = RECRUITING_PHASES.includes(currentPhase);
    const isDeparturesPhase = currentPhase === "offseason_departures";
    const isWalkonsPhase = currentPhase === "offseason_walkons";

    const [teams, coaches, playerCountMap, allGames, gameReports, recruits] = await Promise.all([
      storage.getTeamsByLeague(leagueId),
      storage.getCoachesByLeague(leagueId),
      storage.getPlayerCountsByLeague(leagueId),
      storage.getGamesByLeague(leagueId),
      storage.getGameReportsByLeague(leagueId),
      isRecruitingPhase ? storage.getRecruitsByLeague(leagueId) : Promise.resolve([]),
    ]);

    const humanTeams = teams.filter(t => !t.isCpu);
    const humanTeamIds = new Set(humanTeams.map(t => t.id));
    const teamById = new Map(teams.map(t => [t.id, t]));

    // Helper: truncate items list to max 5
    const truncate = (items: string[], max = 5): string[] => {
      if (items.length <= max) return items;
      const extra = items.length - max;
      return [...items.slice(0, max), `…and ${extra} more`];
    };

    // coaches_ready: human coaches not ready (respect phase + autopilot + deadline-forced)
    const deadlinePassed = league.phaseDeadline
      ? new Date() > new Date(league.phaseDeadline)
      : false;
    const humanCoachEntries = coaches.filter(c => c.userId && c.teamId && humanTeamIds.has(c.teamId));
    const notReadyCoaches = humanCoachEntries.filter(c => {
      const team = teamById.get(c.teamId!);
      if (team?.isAutoPilot) return false; // autopilot always counts as ready
      if (deadlinePassed) return false; // deadline elapsed → commissioner can force-advance; not a blocker
      if (isDeparturesPhase) return !(team?.departuresFinalized ?? false);
      if (isWalkonsPhase) return !(team?.walkonReady ?? false);
      return !(c.isReady ?? false);
    });
    const coachesReadyCheck = {
      id: "coaches_ready",
      label: "Coaches ready",
      status: notReadyCoaches.length === 0 ? "pass" : "fail",
      detail: notReadyCoaches.length === 0
        ? "All human coaches are ready to advance"
        : `${notReadyCoaches.length} coach(es) not yet ready`,
      count: notReadyCoaches.length,
      items: truncate(notReadyCoaches.map(c => {
        const team = teamById.get(c.teamId!);
        return `${team?.name ?? c.teamId} (${c.firstName} ${c.lastName})`;
      })),
    };

    // pending_reports (reported mode only)
    const pendingReports = isReportedMode ? gameReports.filter(r => r.status === "pending") : [];
    const pendingReportsCheck = {
      id: "pending_reports",
      label: "Pending game reports",
      status: !isReportedMode ? "pass" : pendingReports.length === 0 ? "pass" : "fail",
      detail: !isReportedMode
        ? "Not applicable (simulated mode)"
        : pendingReports.length === 0
        ? "No pending game reports"
        : `${pendingReports.length} report(s) awaiting review`,
      count: pendingReports.length,
      items: truncate(pendingReports.map(r => `Game #${r.gameId.slice(0, 8)}`)),
    };

    // disputed_reports
    const disputedReports = isReportedMode ? gameReports.filter(r => r.status === "disputed") : [];
    const disputedReportsCheck = {
      id: "disputed_reports",
      label: "Disputed reports",
      status: !isReportedMode ? "pass" : disputedReports.length === 0 ? "pass" : "fail",
      detail: !isReportedMode
        ? "Not applicable (simulated mode)"
        : disputedReports.length === 0
        ? "No disputed reports"
        : `${disputedReports.length} disputed report(s) need resolution`,
      count: disputedReports.length,
      items: truncate(disputedReports.map(r => `Game #${r.gameId.slice(0, 8)}`)),
    };

    // unreported_games: delegate to the shared getAdvancePreflight() service so the
    // commissioner UI and the /advance POST route agree on exactly which games block.
    let advPreflightResult: AdvancePreflightResult;
    try {
      advPreflightResult = await getAdvancePreflight(leagueId);
    } catch {
      advPreflightResult = { canAdvance: !isReportedMode, blockers: [], isReportedMode };
    }
    const unreportedGamesCheck = {
      id: "unreported_games",
      label: "Unreported human games",
      status: !isReportedMode ? "pass" : advPreflightResult.blockers.length === 0 ? "pass" : "fail",
      detail: !isReportedMode
        ? "Not applicable (simulated mode)"
        : advPreflightResult.blockers.length === 0
        ? "All current-week human-vs-human games have accepted reports"
        : `${advPreflightResult.blockers.length} current-week game(s) missing accepted report`,
      count: advPreflightResult.blockers.length,
      items: truncate(advPreflightResult.blockers.map(b => `W${b.week}: ${b.homeTeamName ?? "?"} vs ${b.awayTeamName ?? "?"}`)),
    };

    // roster_limits: teams with >25 players
    const overLimitTeams = teams.filter(t => (playerCountMap.get(t.id) ?? 0) > 25 && currentPhase !== "offseason_walkons");
    const rosterLimitsCheck = {
      id: "roster_limits",
      label: "Roster limits",
      status: overLimitTeams.length === 0 ? "pass" : "fail",
      detail: overLimitTeams.length === 0
        ? "All rosters are within the 25-player limit"
        : `${overLimitTeams.length} team(s) exceed the 25-player limit`,
      count: overLimitTeams.length,
      items: truncate(overLimitTeams.map(t => `${t.name} (${playerCountMap.get(t.id)} players)`)),
    };

    // orphan_teams: human teams with no coach assigned
    const coachTeamIds = new Set(coaches.map(c => c.teamId).filter(Boolean));
    const orphanTeams = humanTeams.filter(t => !coachTeamIds.has(t.id));
    const orphanTeamsCheck = {
      id: "orphan_teams",
      label: "Coach assignments",
      status: orphanTeams.length === 0 ? "pass" : "warn",
      detail: orphanTeams.length === 0
        ? "All human teams have a coach assigned"
        : `${orphanTeams.length} human team(s) have no coach`,
      count: orphanTeams.length,
      items: truncate(orphanTeams.map(t => t.name)),
    };

    // duplicate_games: same home+away+week+season with >1 completed game
    const gameKeys = new Map<string, number>();
    for (const g of allGames.filter(g => g.isComplete)) {
      const key = `${g.homeTeamId}|${g.awayTeamId}|${g.week}|${g.season}`;
      gameKeys.set(key, (gameKeys.get(key) ?? 0) + 1);
    }
    const dupKeys = Array.from(gameKeys.entries()).filter(([, c]) => c > 1);
    const duplicateGamesCheck = {
      id: "duplicate_games",
      label: "Duplicate games",
      status: dupKeys.length === 0 ? "pass" : "fail",
      detail: dupKeys.length === 0
        ? "No duplicate game entries detected"
        : `${dupKeys.length} duplicate game slot(s) found`,
      count: dupKeys.length,
      items: truncate(dupKeys.map(([key]) => {
        const [homeId, awayId, week] = key.split("|");
        const home = teamById.get(homeId)?.name ?? homeId;
        const away = teamById.get(awayId)?.name ?? awayId;
        return `W${week}: ${home} vs ${away}`;
      })),
    };

    // recruiting_class: recruiting phase but no active recruits
    const recruitingClassCheck = {
      id: "recruiting_class",
      label: "Recruiting class",
      status: !isRecruitingPhase ? "pass" : recruits.length > 0 ? "pass" : "warn",
      detail: !isRecruitingPhase
        ? "Not a recruiting phase"
        : recruits.length > 0
        ? `${recruits.length} recruits in the active class`
        : "No active recruiting class found",
      count: isRecruitingPhase ? recruits.length : 0,
      items: [] as string[],
    };

    const checks = [
      coachesReadyCheck,
      pendingReportsCheck,
      disputedReportsCheck,
      unreportedGamesCheck,
      rosterLimitsCheck,
      orphanTeamsCheck,
      duplicateGamesCheck,
      recruitingClassCheck,
    ];

    const canAdvance = !checks.some(c => c.status === "fail");

    res.json({ canAdvance, checks, runAt: new Date().toISOString() });
  } catch (error) {
    console.error("Preflight check failed:", error);
    res.status(500).json({ message: "Preflight check failed" });
  }
});

// League Events (Activity Feed) routes
app.get("/api/leagues/:id/events", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;
    // Verify league exists and user is a member
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const isMember = coaches.some(c => c.userId === userId) || league.commissionerId === userId;
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const eventType = req.query.type as string | undefined;
    const events = await storage.getLeagueEvents(leagueId, limit, eventType);
    res.json(events);
  } catch (error) {
    console.error("Failed to fetch league events:", error);
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

// "Since Last Advance" digest feed — history + latest
// Commissioner actions are league-wide administrative events, but many (e.g. roster edits,
// trade vetoes for a specific team) are only meaningful to the coach whose team was affected.
// Filter them per-viewer: keep league-wide actions (no other team named) plus any action that
// explicitly names the viewer's own team; drop actions that name a *different* team only.
//
// Coach ready status follows the same visibility rule used elsewhere for readiness (see the
// /ready endpoints): the commissioner always sees the full named list; regular coaches only see
// other coaches' names/ready-state when the league has `showReadyNamesToAll` enabled — otherwise
// they only see their own team's entry plus an aggregate ready count.
async function filterDigestForViewer<T extends {
  commissionerActions: AdvanceDigestCategories["commissionerActions"];
  coachReadyStatus: AdvanceDigestCategories["coachReadyStatus"];
}>(
  digest: T,
  leagueId: string,
  userId: string,
): Promise<T> {
  const [teams, coaches, league] = await Promise.all([
    storage.getTeamsByLeague(leagueId),
    storage.getCoachesByLeague(leagueId),
    storage.getLeague(leagueId),
  ]);
  const viewerCoach = coaches.find(c => c.userId === userId);
  const viewerTeamName = viewerCoach?.teamId ? teams.find(t => t.id === viewerCoach.teamId)?.name : undefined;
  const isCommissioner = league?.commissionerId === userId;
  const allTeamNames = teams.map(t => t.name);

  const filteredActions = digest.commissionerActions.filter(a => {
    const text = `${a.action} ${a.details ?? ""}`;
    const namedTeams = allTeamNames.filter(name => text.includes(name));
    if (namedTeams.length === 0) return true; // league-wide action, visible to everyone
    if (viewerTeamName && namedTeams.includes(viewerTeamName)) return true; // affects the viewer's own team
    return false; // affects only other teams — not relevant to this viewer
  });

  const showReadyNames = isCommissioner || (league?.showReadyNamesToAll ?? false);
  const filteredReadyStatus = showReadyNames
    ? digest.coachReadyStatus
    : digest.coachReadyStatus.filter(s => s.teamName === viewerTeamName);

  return { ...digest, commissionerActions: filteredActions, coachReadyStatus: filteredReadyStatus };
}

app.get("/api/leagues/:id/digests", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const isMember = coaches.some(c => c.userId === userId) || league.commissionerId === userId;
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const digests = await storage.getAdvanceDigestsByLeague(leagueId, limit);
    const filtered = await Promise.all(digests.map(d => {
      const cats = d.categories as AdvanceDigestCategories;
      return filterDigestForViewer(
        { commissionerActions: cats.commissionerActions, coachReadyStatus: cats.coachReadyStatus },
        leagueId, userId,
      );
    }));
    const result = digests.map((d, i) => ({
      ...d,
      categories: {
        ...(d.categories as AdvanceDigestCategories),
        commissionerActions: filtered[i].commissionerActions,
        coachReadyStatus: filtered[i].coachReadyStatus,
      },
    }));
    res.json(result);
  } catch (error) {
    console.error("Failed to fetch digests:", error);
    res.status(500).json({ message: "Failed to fetch digests" });
  }
});

app.get("/api/leagues/:id/digests/latest", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const isMember = coaches.some(c => c.userId === userId) || league.commissionerId === userId;
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const digest = await storage.getLatestAdvanceDigest(leagueId);
    if (!digest) return res.json(null);
    const cats = digest.categories as AdvanceDigestCategories;
    const filtered = await filterDigestForViewer(
      { commissionerActions: cats.commissionerActions, coachReadyStatus: cats.coachReadyStatus },
      leagueId, userId,
    );
    res.json({
      ...digest,
      categories: {
        ...cats,
        commissionerActions: filtered.commissionerActions,
        coachReadyStatus: filtered.coachReadyStatus,
      },
    });
  } catch (error) {
    console.error("Failed to fetch latest digest:", error);
    res.status(500).json({ message: "Failed to fetch latest digest" });
  }
});

app.get("/api/leagues/:id/digests/:digestId", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId as string;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const isMember = coaches.some(c => c.userId === userId) || league.commissionerId === userId;
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const digest = await storage.getAdvanceDigest(req.params.digestId as string);
    if (!digest || digest.leagueId !== leagueId) return res.status(404).json({ message: "Digest not found" });
    const cats = digest.categories as AdvanceDigestCategories;
    const filtered = await filterDigestForViewer(
      { commissionerActions: cats.commissionerActions, coachReadyStatus: cats.coachReadyStatus },
      leagueId, userId,
    );
    res.json({
      ...digest,
      categories: {
        ...cats,
        commissionerActions: filtered.commissionerActions,
        coachReadyStatus: filtered.coachReadyStatus,
      },
    });
  } catch (error) {
    console.error("Failed to fetch digest:", error);
    res.status(500).json({ message: "Failed to fetch digest" });
  }
});

// Decommit Alerts — DECOMMIT events scoped to a specific team for the current week
app.get("/api/leagues/:id/decommit-alerts", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId!;
    const teamId = req.query.teamId as string;
    if (!teamId) return res.status(400).json({ message: "teamId required" });
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const isCommissioner = hasCommissionerAccess(league, userId);
    const myCoach = coaches.find(c => c.userId === userId);
    if (!isCommissioner && !myCoach) return res.status(403).json({ message: "Not a member of this league" });
    if (!isCommissioner && myCoach?.teamId !== teamId) return res.status(403).json({ message: "Not authorized for this team" });
    const leagueTeams = await storage.getTeamsByLeague(leagueId);
    const teamBelongsToLeague = leagueTeams.some(t => t.id === teamId);
    if (!teamBelongsToLeague) return res.status(403).json({ message: "Team does not belong to this league" });
    const events = await storage.getLeagueEventsByTeam(teamId, "DECOMMIT", 30);
    const filtered = events.filter(e => e.season === league.currentSeason && e.week >= league.currentWeek - 1);
    res.json(filtered);
  } catch (error) {
    console.error("Failed to fetch decommit alerts:", error);
    res.status(500).json({ message: "Failed to fetch decommit alerts" });
  }
});

// Dynasty News routes
app.get("/api/leagues/:id/news", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const news = await storage.getDynastyNewsByLeague(leagueId);
    res.json(news);
  } catch (error) {
    console.error("Failed to fetch dynasty news:", error);
    res.status(500).json({ message: "Failed to fetch news" });
  }
});

app.post("/api/leagues/:id/news", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const userId = req.session.userId;
    // Accept both "content" (legacy) and "body" (newsroom panel) as the post text.
    const { title, content, body, category, isSticky, imageUrl } = req.body;
    const postContent = (content || body || "").trim();

    if (!title || !postContent) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });

    const user = await storage.getUser(userId!);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Allow commissioner OR any coach in this league to post.
    const isComm = hasCommissionerAccess(league, userId);
    const coaches = await storage.getCoachesByLeague(leagueId);
    const myCoach = coaches.find(c => c.userId === userId);
    if (!isComm && !myCoach) {
      return res.status(403).json({ message: "Only league members can post news" });
    }

    // Use coach full name if available, fall back to email prefix.
    const authorName = myCoach
      ? `${myCoach.firstName} ${myCoach.lastName}`.trim()
      : user.email.split("@")[0] || "Unknown";

    const news = await storage.createDynastyNews({
      leagueId,
      authorId: userId,
      authorName,
      title,
      content: postContent,
      category: category || "general",
      imageUrl: imageUrl || null,
      isSticky: isSticky || false,
    });

    res.json(news);
  } catch (error) {
    console.error("Failed to create dynasty news:", error);
    res.status(500).json({ message: "Failed to create news" });
  }
});

app.delete("/api/leagues/:id/news/:newsId", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.id as string;
    const newsId = req.params.newsId as string;
    const userId = req.session.userId;

    const league = await storage.getLeague(leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const post = await storage.getDynastyNewsById(newsId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const isComm = hasCommissionerAccess(league, userId);
    const isAuthor = post.authorId === userId;
    if (!isComm && !isAuthor) {
      return res.status(403).json({ message: "You can only delete your own posts" });
    }

    await storage.deleteDynastyNews(newsId);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete dynasty news:", error);
    res.status(500).json({ message: "Failed to delete news" });
  }
});

// ── Conference Teams (static lookup, used by roster-viewing UI) ─────────
app.get("/api/conference-teams", async (_req, res) => {
  try {
    const allConferences = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
    const result = allConferences.map(conf => ({
      conference: conf,
      teams: getTeamsForConference(conf).map(t => t.name),
    }));
    res.json(result);
  } catch (error) {
    console.error("Failed to get conference teams:", error);
    res.status(500).json({ message: "Failed to get conference teams" });
  }
});

// ── Admin: RPI OVR Calibration ───────────────────────────────────────────
// One-time migration endpoint that adjusts all player OVRs in the database
// to match the 2026 NCAA RPI ranking order.
// Protected by SESSION_SECRET passed as x-admin-key header.
app.post("/api/admin/calibrate-rpi-ovr", async (req, res) => {
  try {
    const providedKey = req.headers["x-admin-key"];
    const expectedKey = process.env.SESSION_SECRET;
    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(403).json({ message: "Forbidden: invalid or missing admin key" });
    }
    const dryRun = req.query.dryRun as string === "true" || req.body?.dryRun === true;
    console.log(`[calibrate-rpi] Admin endpoint triggered. dryRun=${dryRun}`);
    const summary = await calibrateRpiOvr(dryRun);
    return res.json({
      success: true,
      dryRun,
      ...summary,
    });
  } catch (error) {
    console.error("[calibrate-rpi] Admin endpoint error:", error);
    return res.status(500).json({ message: "Calibration failed", error: String(error) });
  }
});

// === Admin: Sync pitchVSL for all real-roster pitchers ===
// Runs the v6 pitch_vsl sync on demand. Protected by SESSION_SECRET header.
// Processes 545 canonical pitchers in batches of 50 to avoid statement timeouts.
app.post("/api/admin/sync-pitch-vsl", async (req, res) => {
  try {
    const providedKey = req.headers["x-admin-key"];
    const expectedKey = process.env.SESSION_SECRET;
    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(403).json({ message: "Forbidden: invalid or missing admin key" });
    }

    const PITCH_VSL_MAP: Record<string, number> = {
      "Cooper|Moore|P|LSU": 3, "William|Schmidt|P|LSU": 4, "Zac|Cowan|P|LSU": 3,
      "Aidan|King|P|Florida": 4, "Liam|Peterson|P|Florida": 4, "Jackson|Barberi|P|Florida": 4,
      "Christian|Rodriguez|P|Florida": 4, "Cooper|Walls|P|Florida": 4, "Blaine|Rowland|P|Florida": 4,
      "Connor|Fennell|P|Vanderbilt": 4, "Nate|Taylor|P|Vanderbilt": 4, "Miller|Green|P|Vanderbilt": 4,
      "Patrick|Reilly|P|Vanderbilt": 4, "Jakob|Schulz|P|Vanderbilt": 3, "Drew|Beam|P|Vanderbilt": 4,
      "Shane|Sdao|P|Texas A&M": 4, "Weston|Moss|P|Texas A&M": 4, "Juan|Vargas|P|Texas A&M": 4,
      "Grant|Cunningham|P|Texas A&M": 4, "Tegan|Kuhns|P|Tennessee": 4, "Landon|Mack|P|Tennessee": 4,
      "Evan|Blanco|P|Tennessee": 4, "Brandon|Arvidson|P|Tennessee": 4, "Tyler|Keele|P|Tennessee": 3,
      "Dalton|Rogers|P|Tennessee": 4, "Cade|Townsend|P|Ole Miss": 4, "Taylor|Rabe|P|Ole Miss": 4,
      "Aiden|Sims|P|Ole Miss": 4, "Hudson|Calhoun|P|Ole Miss": 4, "Grayson|Saunier|P|Ole Miss": 4,
      "Colin|Fisher|P|Arkansas": 4, "Ethan|McElvain|P|Arkansas": 4, "Hunter|Dietz|P|Arkansas": 4,
      "Steele|Eaves|P|Arkansas": 4, "James|DeCremer|P|Arkansas": 4, "Zane|Adams|P|Alabama": 4,
      "Owen|Sarna|P|Alabama": 4, "Bobby|Alcock|P|Alabama": 4, "Hagan|Banks|P|Alabama": 4,
      "Ashton|Crowther|P|Alabama": 4, "Luke|Smyers|P|Alabama": 4, "Drew|Whalen|P|Auburn": 4,
      "Jake|Marciano|P|Auburn": 4, "Garrett|Brewer|P|Auburn": 4, "Alex|Petrovic|P|Auburn": 4,
      "Mason|Barnett|P|Auburn": 4, "Andreas|Alvarez|P|Auburn": 4, "Joey|Volchko|P|Georgia": 4,
      "Dylan|Vigue|P|Georgia": 4, "Matt|Scott|P|Georgia": 4, "Duke|Stone|P|Mississippi State": 4,
      "Tyler|Pitzer|P|Mississippi State": 4, "Jackson|Logar|P|Mississippi State": 4,
      "Jack|Bauer|P|Mississippi State": 4, "Maddox|Miller|P|Mississippi State": 4,
      "Brandon|Stone|P|South Carolina": 4, "Amp|Phillips|P|South Carolina": 4,
      "Marcus|Hall|P|South Carolina": 4, "Zach|Swanson|P|South Carolina": 4,
      "Dylan|Reeves|P|South Carolina": 3, "Trevor|Mack|P|South Carolina": 4,
      "Jaxon|Jelkin|P|Kentucky": 4, "Nate|Harris|P|Kentucky": 4, "Tommy|Skelding|P|Kentucky": 4,
      "Chase|Alderman|P|Kentucky": 4, "Mason|Wright|P|Kentucky": 4, "Gavin|Porter|P|Kentucky": 3,
      "Brady|Kehlenbrink|P|Missouri": 4, "Tyler|Stokes|P|Missouri": 4, "Drew|Walters|P|Missouri": 4,
      "Landon|Price|P|Missouri": 4, "Jake|Donaldson|P|Missouri": 3, "LJ|Mercurius|P|Oklahoma": 4,
      "Cord|Rager|P|Oklahoma": 4, "Kadyn|Leon|P|Oklahoma": 4, "Reid|Hensley|P|Oklahoma": 4,
      "Mason|Bixby|P|Oklahoma": 4, "Dylan|Volantis|P|Texas": 4, "Ruger|Riojas|P|Texas": 4,
      "Thomas|Burns|P|Texas": 4, "Sam|Cozart|P|Texas": 4, "Haiden|Leffew|P|Texas": 4,
      "Kade|Bing|P|Texas": 4, "Cal|Higgins|P|Texas": 3, "Cole|Stokes|P|Clemson": 3,
      "Talan|Bell|P|Clemson": 4, "Drew|Titsworth|P|Clemson": 4, "Camden|Cross|P|Clemson": 4,
      "Aidan|Weaver|P|Duke": 4, "Ben|Dean|P|Duke": 4, "Marcus|Holloway|P|Duke": 4,
      "Ethan|Brooks|P|Duke": 4, "John|Abraham|P|Florida State": 4, "Marcus|Harrell|P|Florida State": 4,
      "Wes|Mendes|P|Florida State": 4, "Justin|Shadek|P|Georgia Tech": 4,
      "Cooper|Underwood|P|Georgia Tech": 4, "Carson|Ballard|P|Georgia Tech": 3,
      "Iyan|Wilson|P|Georgia Tech": 4, "Cade|Brown|P|Georgia Tech": 3,
      "Wyatt|Danilowicz|P|Louisville": 4, "Dominic|Jacoby|P|Louisville": 4,
      "Peter|Michael|P|Louisville": 4, "Kade|Elam|P|Louisville": 4, "Ryan|Bilka|P|Miami": 4,
      "AJ|Ciscar|P|Miami": 4, "TJ|Coats|P|Miami": 4, "Marco|Reyes|P|Miami": 4,
      "Tommy|Santiago|P|Miami": 4, "Anthony|Perez|P|Miami": 4, "Cam|Andrews|P|NC State": 4,
      "Collins|Black|P|NC State": 4, "Aiden|Kitchings|P|NC State": 4, "Tyler|Barnes|P|NC State": 3,
      "Caden|Glauber|P|North Carolina": 4, "Ryan|Lynch|P|North Carolina": 3,
      "Folger|Boaz|P|North Carolina": 4, "Jackson|Rose|P|North Carolina": 4,
      "Jack|Radel|P|Notre Dame": 4, "Ty|Uber|P|Notre Dame": 4, "Noah|Rooney|P|Notre Dame": 4,
      "Chase|Van Ameyde|P|Notre Dame": 3, "Dylan|Singleton|P|Notre Dame": 4,
      "Brady|Walsh|P|Notre Dame": 4, "David|Leslie|P|Pittsburgh": 4, "Drew|Lafferty|P|Pittsburgh": 4,
      "Ryan|Kowalski|P|Pittsburgh": 4, "Chris|Varga|P|Pittsburgh": 4, "Cole|Clark|P|California": 4,
      "Otto|Espinoza|P|California": 3, "Parker|Warner|P|Stanford": 4, "Aidan|Keenan|P|Stanford": 3,
      "Drew|Dowd|P|Stanford": 4, "David|Wiser|P|Stanford": 4, "Colt|Peterson|P|Stanford": 3,
      "Tyler|Kapa|P|Virginia": 4, "Joe|Colucci|P|Virginia": 4, "Max|Stammel|P|Virginia": 4,
      "Noah|Yoder|P|Virginia": 4, "Brett|Renfrow|P|Virginia Tech": 4,
      "Logan|Eisenreich|P|Virginia Tech": 4, "Aiden|Robertson|P|Virginia Tech": 4,
      "Noah|Sorrells|P|Virginia Tech": 4, "Ethan|Douglas|P|Virginia Tech": 4,
      "Ethan|Grim|P|Virginia Tech": 4, "Chris|Levonas|P|Wake Forest": 4,
      "Cameron|Bagwell|P|Wake Forest": 4, "Troy|Dressler|P|Wake Forest": 4,
      "Josh|Hartle|P|Wake Forest": 4, "Ryan|Brennecke|P|Wake Forest": 3,
      "Brady|Miller|P|Boston College": 4, "Drew|Grumbles|P|Boston College": 4,
      "Tyler|Mudd|P|Boston College": 4, "Henry|Leake|P|Boston College": 4,
      "Zach|Bates|P|Illinois": 4, "Mitch|Dye|P|Illinois": 4, "Landon|Yorek|P|Illinois": 4,
      "Liam|McKillop|P|Illinois": 4, "Ike|Young|P|Illinois": 3, "Aiden|Flinn|P|Illinois": 4,
      "Chase|Linn|P|Indiana": 4, "Pete|Haas|P|Indiana": 4, "Brayton|Thomas|P|Indiana": 4,
      "Owen|Keiser|P|Indiana": 3, "Bryce|Donnelly|P|Indiana": 3, "Tyler|Guerin|P|Iowa": 4,
      "Justin|Hackett|P|Iowa": 4, "Ganon|Archer|P|Iowa": 4, "Derek|Nagel|P|Iowa": 4,
      "Jaron|Bleeker|P|Iowa": 4, "Lance|Williams|P|Maryland": 4, "Austin|Weiss|P|Maryland": 4,
      "Logan|Hastings|P|Maryland": 4, "Brayden|Ryan|P|Maryland": 4, "Ryan|Bailey|P|Maryland": 4,
      "Max|Mendez|P|Maryland": 4, "Kurt|Barr|P|Michigan": 4, "Gavin|DeVooght|P|Michigan": 4,
      "Max|Debiec|P|Michigan": 4, "Cade|Montgomery|P|Michigan": 4, "Tyler|Bischoff|P|Michigan": 3,
      "Ethan|VanBuskirk|P|Michigan": 4, "Gannon|Grundman|P|Michigan State": 4,
      "Josh|Klug|P|Michigan State": 4, "Tyler|Hemmesch|P|Minnesota": 4,
      "Will|Whelan|P|Minnesota": 4, "Marcus|Kruzan|P|Minnesota": 4, "Ben|Gregory|P|Minnesota": 4,
      "Ethan|Felling|P|Minnesota": 4, "Ty|Horn|P|Nebraska": 4, "Shea|Wendt|P|Nebraska": 4,
      "Kevin|Mannell|P|Nebraska": 4, "J.D.|Hennen|P|Nebraska": 4, "Garrett|Shearer|P|Northwestern": 4,
      "Matt|Kouser|P|Northwestern": 4, "Zach|Erdman|P|Purdue": 3, "Rohan|Kasanagottu|P|USC": 1,
      "Hayden|Lewis|P|Washington": 3, "Wyatt|Queen|P|Oregon State": 3,
      "Sky|Collins|P|Fresno State": 4, "Cody|Wentworth|P|Fresno State": 4,
      "Wyatt|Crowell|P|Fresno State": 4, "Brody|Barnum|P|Fresno State": 4,
      "Nate|Romero|P|Fresno State": 4, "Marcus|Saavedra|P|Fresno State": 4,
      "Rohan|Lettow|P|San Diego State": 4, "Trey|Telfer|P|San Diego State": 4,
      "Aidan|Russell|P|San Diego State": 4, "Issac|Araiza|P|San Diego State": 4,
      "Alito|McBean|P|San Diego State": 4, "Caden|Takagi|P|UNLV": 4,
      "Brandon|Mejia|P|UNLV": 4, "Cooper|Sheff|P|UNLV": 4, "Antonio|Avila|P|Nevada": 4,
      "Dayne|Pengelly|P|New Mexico": 4, "Ty|Cunningham|P|New Mexico": 4,
      "Ryan|Baca|P|New Mexico": 4, "Dylan|Rogers|P|Air Force": 4,
      "Josh|Shropshire|P|Air Force": 4, "Gio|Sambito|P|Air Force": 4,
      "Owen|Prescott|P|Columbia": 3, "Sam|Whitfield|P|Columbia": 4,
      "Nate|Callahan|P|Columbia": 3, "Colin|Barrett|P|Cornell": 4, "Liam|Dugan|P|Cornell": 3,
      "Patrick|Chen|P|Cornell": 3, "Will|McKenna|P|Dartmouth": 3, "Chase|Hodgson|P|Dartmouth": 3,
      "Matt|Archer|P|Dartmouth": 3, "Carter|Simms|P|Dartmouth": 2, "Matt|Cavanagh|P|Harvard": 4,
      "Ben|Portman|P|Harvard": 4, "Luke|Hennessey|P|Harvard": 4, "Mike|Gallagher|P|Penn": 4,
      "Tyler|Brock|P|Penn": 4, "Chris|Navarro|P|Penn": 4, "Ryan|Keane|P|Penn": 4,
      "Nick|Santora|P|Penn": 3, "Cole|Richter|P|Penn": 2, "Will|Stratton|P|Princeton": 3,
      "Ian|Coughlin|P|Princeton": 4, "Matt|Delaney|P|Princeton": 4, "Andrew|Chin|P|Princeton": 3,
      "Tom|Randolph|P|Princeton": 3, "Carter|Hamilton|P|Yale": 4, "Jack|Winthrop|P|Yale": 4,
      "Tim|Buckley|P|Yale": 3, "Colin|Wyatt|P|Brown": 3, "Aiden|Pierce|P|Brown": 2,
      "Luke|Jones|P|Coastal Carolina": 4, "Ryan|Lynch|P|Coastal Carolina": 3,
      "Dominick|Carbone|P|Coastal Carolina": 4, "Keenan|Tillery|P|Coastal Carolina": 4,
      "Thomas|Crabtree|P|Southern Miss": 4, "Camden|Sunstrom|P|Southern Miss": 4,
      "KL|Farr|P|Southern Miss": 3, "Levi|Perkins|P|Troy": 4, "Jaxon|Smith|P|Troy": 3,
      "Marcus|Dean|P|Troy": 3, "Chase|Hunley|P|Marshall": 4, "Aiden|Curry|P|Marshall": 3,
      "Ethan|Cross|P|Marshall": 2, "Collin|Hebert|P|Louisiana": 4, "Drew|Simon|P|Louisiana": 4,
      "Bryce|Comeaux|P|Louisiana": 3, "Cole|Fowler|P|Old Dominion": 3,
      "Ryan|Webb|P|Old Dominion": 3, "Landon|Peck|P|Old Dominion": 3,
      "Hunter|Ponder|P|Arkansas State": 3, "Nolan|Schubart|P|Arkansas State": 3,
      "Brady|Ward|P|Arkansas State": 3, "Jake|Pennington|P|Arkansas State": 3,
      "Elijah|Ford|P|Arkansas State": 2, "Ty|Fisher|P|Georgia Southern": 4,
      "David|Johnson|P|Georgia Southern": 4, "Ryan|Gilmore|P|Georgia Southern": 4,
      "Cooper|Edge|P|Georgia Southern": 3, "Ben|Norris|P|Georgia Southern": 3,
      "Ryne|Stanley|P|App State": 4, "Jake|Blevins|P|App State": 4,
      "Hunter|Morefield|P|App State": 4, "Austin|Holbrook|P|App State": 4,
      "Jackson|Pratt|P|Georgia State": 2, "Miles|Langlois|P|South Alabama": 4,
      "Blake|Pfister|P|South Alabama": 4, "Bryce|Donovan|P|South Alabama": 3,
      "Tyler|Blohm|P|James Madison": 4, "Nick|Walters|P|James Madison": 4,
      "Landon|May|P|James Madison": 3, "Tanner|Bibee|P|Cal State Fullerton": 4,
      "Jared|Meza|P|Cal State Fullerton": 4, "Ethan|Park|P|Cal State Fullerton": 2,
      "Brandon|Vu|P|Cal State Fullerton": 4, "Travis|Stump|P|Long Beach State": 4,
      "Tommy|Reyes|P|Long Beach State": 4, "Nick|Luna|P|Long Beach State": 4,
      "Ryan|Tanaka|P|UC Irvine": 4, "Justin|Nguyen|P|UC Irvine": 4,
      "Derek|Sato|P|UC Irvine": 4, "Tyler|Marsh|P|UC Irvine": 3,
      "Shane|Bishop|P|UC Santa Barbara": 4, "Tyler|Manning|P|UC Santa Barbara": 4,
      "Ethan|Reed|P|UC Santa Barbara": 4, "Kai|Nelson|P|UC San Diego": 4,
      "Sam|Torres|P|UC San Diego": 4, "Ryan|Cho|P|UC San Diego": 4,
      "Jason|Park|P|UC San Diego": 3, "Luke|Simmons|P|UC San Diego": 2,
      "Kekoa|Kalani|P|Hawaii": 4, "Brandon|Lau|P|Hawaii": 4, "Jake|Perreira|P|Hawaii": 3,
      "Dustin|Medeiros|P|Hawaii": 4, "Nick|Yamada|P|Hawaii": 4, "Logan|Davis|P|Cal Poly": 4,
      "Connor|Marsh|P|Cal Poly": 4, "Brady|Ferguson|P|Cal Poly": 4, "Derek|Pugh|P|Cal Poly": 4,
      "Jordan|Reese|P|Cal Poly": 3, "Gavin|Ortiz|P|Cal Poly": 2, "Matt|Whitfield|P|UC Davis": 4,
      "Danny|Vega|P|Cal State Northridge": 3, "Alex|Duarte|P|Cal State Northridge": 3,
      "Kevin|Park|P|Cal State Northridge": 2, "Ryan|Orozco|P|Cal State Bakersfield": 4,
      "Chris|Valdez|P|Cal State Bakersfield": 3, "Isaac|Ayala|P|Cal State Bakersfield": 2,
      "Terrence|Brooks|P|Grambling State": 3, "Kendrick|Mouton|P|Grambling State": 3,
      "Andre|Landry|P|Grambling State": 3, "Marlon|Baptiste|P|Southern University": 3,
      "Donovan|Arceneaux|P|Southern University": 4, "Antoine|Breaux|P|Southern University": 3,
      "Marcus|Odom|P|Florida A&M": 4, "Devin|Holloway|P|Florida A&M": 3,
      "Raheem|Knox|P|Florida A&M": 4, "Tyree|Garrison|P|Bethune-Cookman": 3,
      "DeMarco|Hines|P|Bethune-Cookman": 3, "Jaheim|Grady|P|Bethune-Cookman": 3,
      "Jaquez|Tillman|P|Jackson State": 3, "Kayden|Stamps|P|Jackson State": 3,
      "Quentin|Pratt|P|Jackson State": 3, "Javoris|Clay|P|Jackson State": 3,
      "Terrell|Graves|P|North Carolina A&T": 4, "Khalid|Person|P|North Carolina A&T": 3,
      "Rashaun|Keith|P|North Carolina A&T": 4, "Tylon|Rivers|P|North Carolina A&T": 3,
      "Devante|Staton|P|North Carolina A&T": 3, "DeShawn|Perry|P|Alabama State": 4,
      "Rodney|Austin|P|Alabama State": 4, "Marcus|Odom|P|Alabama State": 4,
      "Jameson|Fuller|P|Alabama State": 3, "Antione|Steele|P|Alabama State": 4,
      "Darian|Epps|P|Norfolk State": 4, "Deshon|Sparks|P|Alcorn State": 3,
      "Reginald|Crook|P|Alcorn State": 3, "Damion|Riggs|P|Alcorn State": 3,
      "Cortland|Price|P|Prairie View A&M": 3, "Derrius|Lane|P|Prairie View A&M": 3,
      "Latrell|Mixon|P|Prairie View A&M": 3, "Kendall|Booker|P|Texas Southern": 3,
      "Javoris|Pryor|P|Texas Southern": 3, "Ladarion|Spears|P|Texas Southern": 4,
      "Solomon|Grant|P|Howard": 4, "Landon|Wyatt|P|Howard": 3, "Caleb|Saunders|P|Howard": 3,
      "Marquis|Odom|P|Delaware State": 3, "Tavon|Bass|P|Delaware State": 3,
      "DeShawn|Hooks|P|Delaware State": 3, "Rasheed|Mason|P|Coppin State": 3,
      "Deshawn|Mosley|P|Coppin State": 3, "Lamont|Gill|P|Coppin State": 3,
      "Jermaine|Pollard|P|North Carolina Central": 4, "Darian|Foxx|P|North Carolina Central": 3,
      "Jaylen|Oglesby|P|North Carolina Central": 3, "Kevon|Price|P|Maryland Eastern Shore": 3,
      "Jaylin|Hooks|P|Maryland Eastern Shore": 3, "Khalil|Craig|P|Maryland Eastern Shore": 3,
      "Jamir|Stone|P|Maryland Eastern Shore": 3, "Rasheed|Kirk|P|Maryland Eastern Shore": 3,
      "Davion|Ash|P|Maryland Eastern Shore": 3, "Jake|Cline|P|Missouri State": 4,
      "Tyler|Drummond|P|Missouri State": 4, "Brandon|Wertz|P|Missouri State": 4,
      "Tanner|Briggs|P|Missouri State": 4, "Brett|Lohse|P|Missouri State": 4,
      "Ryan|Fetter|P|Missouri State": 3, "Drew|Patterson|P|Indiana State": 4,
      "Ryan|Quigley|P|Illinois State": 4, "Jake|Ellison|P|Illinois State": 4,
      "Nate|Reeves|P|Illinois State": 3, "Lane|Otten|P|Southern Illinois": 4,
      "Trent|Shelton|P|Southern Illinois": 4, "Drew|Fulks|P|Southern Illinois": 4,
      "Mitch|Darby|P|Bradley": 4, "Sam|Tuttle|P|Bradley": 4, "Tanner|Vogt|P|Bradley": 4,
      "Ben|Rapp|P|Bradley": 2, "Luke|Bauer|P|Evansville": 4, "Trent|Bower|P|Evansville": 4,
      "Jason|Kline|P|Evansville": 3, "Ryan|Slager|P|Valparaiso": 4,
      "Blake|Dunn|P|Valparaiso": 4, "Nate|Hoover|P|Valparaiso": 4,
      "Matt|Dolan|P|Valparaiso": 2, "Marcus|DiLeo|P|UIC": 4, "Tony|Palumbo|P|UIC": 4,
      "Jacob|Perez|P|UIC": 3, "Braden|Holcomb|P|Belmont": 4, "Cade|Pennell|P|Belmont": 4,
      "Liam|Knox|P|Belmont": 4, "Austin|Blount|P|Belmont": 3, "James|Wyatt|P|Belmont": 3,
      "Kyle|Wickliffe|P|Murray State": 4, "Cole|Brashear|P|Murray State": 4,
      "Wyatt|Greer|P|Murray State": 3, "Mason|Hart|P|Murray State": 4,
      "Trey|Moss|P|Murray State": 4, "Jake|Norris|P|Western Illinois": 4,
      "Sam|Thorn|P|Western Illinois": 4, "Cole|Bridges|P|Western Illinois": 3,
      "Tyler|Goff|P|Western Illinois": 3, "Ryan|Stout|P|Western Illinois": 3,
      "Matt|Engle|P|Western Illinois": 2, "Chase|Plumb|P|Western Illinois": 2,
      "Zach|Zirbel|P|Northern Iowa": 3, "Brady|Hoffman|P|Creighton": 4,
      "Cole|Meier|P|Creighton": 4, "Boede|Rahe|P|Kansas": 4, "Manning|West|P|Kansas": 4,
      "Carter|Fink|P|Kansas": 4, "David|Perez|P|West Virginia": 4,
      "Reese|Bassinger|P|West Virginia": 4, "Griffin|Kirn|P|West Virginia": 4,
      "Ben|Jacobs|P|Arizona State": 4, "Brock|Peery|P|Arizona State": 4,
      "Kade|Boyd|P|Arizona State": 4, "Casey|Hintz|P|Arizona": 4,
      "Owen|Kramkowski|P|Arizona": 4, "Bryce|Lavelle|P|Arizona": 4,
      "Cooper|Stinson|P|Baylor": 4, "Mason|Marriott|P|Baylor": 4,
      "Carter|Dorighi|P|Baylor": 4, "Brody|Drost|P|Baylor": 4, "Cole|Gambill|P|BYU": 4,
      "Talmage|Bushman|P|BYU": 4, "Jaden|Robinson|P|BYU": 4, "Kaden|Lampi|P|BYU": 4,
      "Caleb|Wood|P|Cincinnati": 4, "Jacob|McNeely|P|Cincinnati": 4,
      "Tyler|Spaulding|P|Cincinnati": 4, "Drew|Stahl|P|Cincinnati": 4,
      "Cole|Schweitzer|P|Cincinnati": 4, "Andrew|Bishop|P|Houston": 4,
      "Anthony|Tulimero|P|Houston": 4, "Carter|Powell|P|Houston": 4,
      "Drew|Markle|P|Houston": 4, "Caleb|Bovio|P|Houston": 4, "Brycen|Mautz|P|Houston": 4,
      "Owen|Boerema|P|Kansas State": 4, "Caden|Favors|P|Kansas State": 4,
      "Brandon|Bishop|P|Oklahoma State": 4, "Ben|Hampton|P|Oklahoma State": 4,
      "Tommy|LaPour|P|TCU": 4, "Louis|Rodriguez|P|TCU": 4, "Nolan|Smith|P|TCU": 4,
      "Caedmon|Parker|P|TCU": 4, "Carson|Hansen|P|Texas Tech": 4,
      "Kyle|Robinson|P|Texas Tech": 4, "Jacob|Rogers|P|Texas Tech": 4,
      "Drew|Schultz|P|UCF": 4, "Jacob|Curi|P|UCF": 4, "Tyler|Davis|P|UCF": 4,
      "Carson|Maddox|P|UCF": 4, "Bryson|Van Sickle|P|Utah": 4, "Drew|Vermilye|P|Utah": 4,
      "Jaxon|Walker|P|Utah": 4, "Carter|Spivey|P|East Carolina": 4,
      "Marcus|Seyller|P|East Carolina": 4, "Nathan|Doran|P|East Carolina": 4,
      "Justin|Coleman|P|East Carolina": 4, "Chase|Bilek|P|Wichita State": 4,
      "Mason|Kokalis|P|Wichita State": 4, "Ryne|Poole|P|Wichita State": 4,
      "Will|Dreiling|P|Wichita State": 4, "Tyson|Hardin|P|Tulane": 4,
      "Jackson|Lofton|P|Tulane": 4, "Tanner|Creevy|P|Tulane": 4,
      "Cole|Fontaine|P|Tulane": 3, "Pierre|Thibodaux|P|Tulane": 4,
      "Brandon|McPherson|P|Memphis": 4, "Jonah|Cox|P|Memphis": 4,
      "Braxton|Vines|P|Memphis": 4, "Caleb|Hensley|P|Memphis": 3,
      "Luke|Randolph|P|Memphis": 4, "Daniel|Cantu|P|South Florida": 4,
      "Connor|Hincks|P|South Florida": 4, "Chris|Clements|P|South Florida": 4,
      "Caleb|Noftsger|P|Charlotte": 4, "Jake|Goodman|P|Charlotte": 4,
      "Lucas|Steele|P|UAB": 4, "Cam|Clements|P|UAB": 3, "Dylan|Windham|P|UAB": 4,
      "Parker|Smith|P|Rice": 4, "Riley|Cooper|P|Rice": 4, "Drew|Dowd|P|Rice": 4,
      "Chase|Centala|P|Rice": 4, "Alex|Royalty|P|Florida Atlantic": 4,
      "Jake|Stevenson|P|Florida Atlantic": 3, "Matt|Calhoun|P|Florida Atlantic": 4,
      "Cooper|Reed|P|North Texas": 4, "Logan|Sanders|P|North Texas": 4,
      "Carlos|Johnson|P|North Texas": 4, "Brock|Whittlesey|P|Dallas Baptist": 4,
      "Wyatt|Gonzales|P|Dallas Baptist": 4, "Mason|Ornelas|P|Dallas Baptist": 3,
      "Patrick|Christensen|P|Pepperdine": 4, "Lucien|Wechsberg|P|Pepperdine": 4,
      "AJ|Bianchina|P|Pepperdine": 4, "Esteban|Sepulveda|P|Pepperdine": 4,
      "Joe|Cardinale|P|Pepperdine": 4, "Jaden|Sheffield|P|Loyola Marymount": 4,
      "Alex|Chavez|P|Loyola Marymount": 4, "Colin|Caycedo|P|Loyola Marymount": 4,
      "Robbie|Ayers|P|Loyola Marymount": 4, "Gavin|Jacobsen|P|Loyola Marymount": 4,
      "Kevin|Sim|P|San Diego": 4, "Nick|Suspenzi|P|San Diego": 4,
      "Patrick|Reilly|P|San Diego": 4, "Bret|Barber|P|San Diego": 4,
      "Connor|Dougherty|P|San Diego": 4, "Cole|Tremain|P|Saint Mary's": 4,
      "Cole|Percival|P|Saint Mary's": 4, "Ryan|Gonzalez|P|Saint Mary's": 4,
      "Payton|Knowles|P|Gonzaga": 4, "Landon|Hood|P|Gonzaga": 4,
      "Max|Bayles|P|Santa Clara": 4, "James|Bose|P|Santa Clara": 4,
      "Troy|Claussen|P|Santa Clara": 4, "Jacob|Sharp|P|Portland": 4,
      "Morgan|Codron|P|Portland": 4, "Quin|Dufort|P|Portland": 4,
      "Cole|Katayama-Stall|P|Portland": 4, "Aidan|Risse|P|San Francisco": 4,
      "Logan|Schweizer|P|San Francisco": 4, "TJ|Rogers|P|San Francisco": 4,
    };

    type PitchEntry2 = { fn: string; ln: string; pos: string; tn: string; vsl: number };
    const entries: PitchEntry2[] = [];
    for (const [compositeKey, vslVal] of Object.entries(PITCH_VSL_MAP)) {
      const parts = compositeKey.split("|");
      if (parts.length !== 4) continue;
      const [fn, ln, pos, tn] = parts;
      entries.push({ fn, ln, pos, tn, vsl: vslVal });
    }

    const BATCH_SIZE = 50;
    let totalUpdated = 0;
    const batchResults: number[] = [];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const fns  = batch.map(e => e.fn);
      const lns  = batch.map(e => e.ln);
      const poss = batch.map(e => e.pos);
      const tns  = batch.map(e => e.tn);
      const vsls = batch.map(e => e.vsl);
      const { rowCount } = await pool.query(`
        UPDATE players p
        SET pitch_vsl = src.vsl
        FROM (
          SELECT
            unnest($1::text[]) AS first_name,
            unnest($2::text[]) AS last_name,
            unnest($3::text[]) AS position,
            unnest($4::text[]) AS team_name,
            unnest($5::int[])  AS vsl
        ) AS src
        JOIN teams t ON t.name = src.team_name
        WHERE p.first_name = src.first_name
          AND p.last_name  = src.last_name
          AND p.position   = src.position
          AND p.team_id    = t.id
          AND (p.pitch_vsl IS DISTINCT FROM src.vsl)
      `, [fns, lns, poss, tns, vsls]);
      const updated = rowCount ?? 0;
      batchResults.push(updated);
      totalUpdated += updated;
    }

    await pool.query(`
      INSERT INTO _startup_migrations (key)
      VALUES ('real-roster-pitch-sync-v6')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log(`[sync-pitch-vsl] Admin sync complete: ${totalUpdated} player rows updated across ${entries.length} pitchers`);

    return res.json({
      success: true,
      totalUpdated,
      pitchersInMap: entries.length,
      batches: batchResults.length,
      batchResults,
    });
  } catch (error) {
    console.error("[sync-pitch-vsl] Admin endpoint error:", error);
    return res.status(500).json({ message: "Sync failed", error: String(error) });
  }
});

// === Default Roster Data API (returns base roster for a team) ===
app.get("/api/default-roster/:teamName", async (req, res) => {
  try {
    const teamName = decodeURIComponent(req.params.teamName as string);
    const { SEC_REAL_ROSTERS } = await getRealRosters();
    const roster = SEC_REAL_ROSTERS[teamName];
    if (!roster) return res.status(404).json({ message: "Team roster not found" });
    res.json(roster);
  } catch (error) {
    console.error("Failed to get default roster:", error);
    res.status(500).json({ message: "Failed to get default roster" });
  }
});

// === NCAA 2026 Public Roster API (no auth required) ===
const ALL_CONFERENCES_ORDERED = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];

function getConferenceForTeam(teamName: string): string {
  for (const conf of ALL_CONFERENCES_ORDERED) {
    if (getTeamsForConference(conf).some(t => t.name === teamName)) return conf;
  }
  return "";
}

app.get("/api/ncaa-rosters", async (_req, res) => {
  try {
    const { ALL_REAL_ROSTERS } = await getRealRosters();
    const result = ALL_CONFERENCES_ORDERED.map(conf => {
      const confTeams = getTeamsForConference(conf);
      return {
        conference: conf,
        teams: confTeams.map(t => {
          const roster = ALL_REAL_ROSTERS[t.name] ?? [];
          const players = roster.map(rp => {
            // ALL_REAL_ROSTERS is already fully calibrated (normalizeCommonAbilities,
            // enforceGoldOvrGate, and elite speed boost are baked in by buildCalibratedRosters).
            const isPitcherPos = ["P", "SP", "RP", "CP"].includes(rp.position);
            const trajectory = rp.trajectory ?? (isPitcherPos ? 2 : assignTrajectory(rp.power ?? 50, rp.speed ?? 50, rp.hitForAvg ?? 50));
            const overall = calculateOVR({ ...rp, abilities: rp.abilities ?? [], trajectory });
            const starRating = getStarRatingFromOVR(overall);
            return { ...rp, overall, starRating, trajectory };
          });
          return {
            name: t.name,
            mascot: t.mascot,
            abbreviation: t.abbreviation,
            prestige: t.prestige,
            nationalRank: NATIONAL_RANKS[t.name] ?? TOTAL_NATIONAL_TEAMS,
            conference: conf,
            primaryColor: t.primaryColor,
            secondaryColor: t.secondaryColor,
            players,
          };
        }),
      };
    });
    res.json(result);
  } catch (error) {
    console.error("Failed to get ncaa rosters:", error);
    res.status(500).json({ message: "Failed to get NCAA rosters" });
  }
});

app.get("/api/ncaa-rosters/:teamName", async (req, res) => {
  try {
    const teamName = decodeURIComponent(req.params.teamName as string);
    const { ALL_REAL_ROSTERS } = await getRealRosters();
    const roster = ALL_REAL_ROSTERS[teamName];
    if (!roster) return res.status(404).json({ message: "Team roster not found" });

    const conferenceName = getConferenceForTeam(teamName);
    const teams = getTeamsForConference(conferenceName);
    const teamData = teams.find(t => t.name === teamName);

    const players = roster.map(rp => {
      // ALL_REAL_ROSTERS is already fully calibrated (normalizeCommonAbilities,
      // enforceGoldOvrGate, and elite speed boost are baked in by buildCalibratedRosters).
      const isPitcherPos = ["P", "SP", "RP", "CP"].includes(rp.position);
      const trajectory = rp.trajectory ?? (isPitcherPos ? 2 : assignTrajectory(rp.power ?? 50, rp.speed ?? 50, rp.hitForAvg ?? 50));
      const overall = calculateOVR({ ...rp, abilities: rp.abilities ?? [], trajectory });
      const starRating = getStarRatingFromOVR(overall);
      return { ...rp, overall, starRating, trajectory };
    });

    res.json({
      name: teamName,
      conference: conferenceName,
      prestige: teamData?.prestige ?? 5,
      nationalRank: NATIONAL_RANKS[teamName] ?? TOTAL_NATIONAL_TEAMS,
      primaryColor: teamData?.primaryColor ?? "#1a3a2a",
      secondaryColor: teamData?.secondaryColor ?? "#d4af37",
      players,
    });
  } catch (error) {
    console.error("Failed to get team ncaa roster:", error);
    res.status(500).json({ message: "Failed to get team roster" });
  }
});

// Coach self-leave: coach removes themselves from the league
app.delete("/api/leagues/:leagueId/coaches/:coachId", requireAuth, async (req, res) => {
  try {
    const { leagueId, coachId } = req.params as { leagueId: string; coachId: string };
    const userId = req.session.userId!;
    const coach = await storage.getCoach(coachId);
    if (!coach) return res.status(404).json({ message: "Coach not found" });
    if (coach.leagueId !== leagueId) return res.status(400).json({ message: "Coach not in this league" });
    if (coach.userId !== userId) return res.status(403).json({ message: "You can only remove yourself" });
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (league.commissionerId === userId) return res.status(400).json({ message: "Commissioners must transfer their role before leaving" });
    await storage.leaveLeague(coachId, leagueId, userId);
    res.json({ message: "You have left the league" });
  } catch (error) {
    console.error("Failed to leave league:", error);
    res.status(500).json({ message: "Failed to leave league" });
  }
});

// Commissioner removes a coach from the league
app.delete("/api/leagues/:leagueId/coaches/:coachId/remove", requireAuth, async (req, res) => {
  try {
    const { leagueId, coachId } = req.params as { leagueId: string; coachId: string };
    const userId = req.session.userId!;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, userId)) return res.status(403).json({ message: "Only the commissioner can remove coaches" });
    const coach = await storage.getCoach(coachId);
    if (!coach) return res.status(404).json({ message: "Coach not found" });
    if (coach.leagueId !== leagueId) return res.status(400).json({ message: "Coach not in this league" });
    if (coach.userId === userId) return res.status(400).json({ message: "Commissioners cannot remove themselves" });
    if (coach.userId === league.commissionerId) return res.status(403).json({ message: "The primary commissioner cannot be removed" });
    await storage.leaveLeague(coachId, leagueId, userId);
    res.json({ message: "Coach removed from league" });
  } catch (error) {
    console.error("Failed to remove coach:", error);
    res.status(500).json({ message: "Failed to remove coach" });
  }
});

// Commissioner reallocates NIL budget between planning envelopes
app.post("/api/leagues/:leagueId/teams/:teamId/nil-realloc", requireAuth, async (req, res) => {
  try {
    const { leagueId, teamId } = req.params as { leagueId: string; teamId: string };
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (!hasCommissionerAccess(league, req.session.userId)) {
      return res.status(403).json({ message: "Only the commissioner can reallocate NIL envelopes" });
    }
    const schema = z.object({
      nilRecruitingAlloc: z.number().int().min(0),
      nilRetentionReserve: z.number().int().min(0),
      nilWalkonReserve: z.number().int().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid envelope values", errors: parsed.error.issues });
    const { nilRecruitingAlloc, nilRetentionReserve, nilWalkonReserve } = parsed.data;
    const team = await storage.getTeam(teamId);
    if (!team || team.leagueId !== leagueId) return res.status(404).json({ message: "Team not found in this league" });
    const total = nilRecruitingAlloc + nilRetentionReserve + nilWalkonReserve;
    if (total !== (team.nilBudget || 0)) {
      return res.status(400).json({
        message: `Envelope totals ($${total.toLocaleString()}) must equal the team's NIL budget ($${(team.nilBudget || 0).toLocaleString()})`,
      });
    }
    await storage.updateTeam(teamId, { nilRecruitingAlloc, nilRetentionReserve, nilWalkonReserve });
    await storage.createAuditLog({
      leagueId,
      userId: req.session.userId,
      action: "NIL Envelope Reallocation",
      details: `${team.name}: recruiting=$${(nilRecruitingAlloc / 1000).toFixed(0)}K, retention=$${(nilRetentionReserve / 1000).toFixed(0)}K, walkons=$${(nilWalkonReserve / 1000).toFixed(0)}K (total=$${(total / 1000).toFixed(0)}K)`,
    });
    res.json({ success: true, nilRecruitingAlloc, nilRetentionReserve, nilWalkonReserve });
  } catch (error) {
    console.error("Failed to reallocate NIL envelopes:", error);
    res.status(500).json({ message: "Failed to reallocate NIL envelopes" });
  }
});

// Commissioner transfers their role to another human coach
app.patch("/api/leagues/:leagueId/commissioner", requireAuth, async (req, res) => {
  try {
    const leagueId = req.params.leagueId as string;
    const userId = req.session.userId!;
    const { newUserId } = req.body as { newUserId: string };
    if (!newUserId) return res.status(400).json({ message: "newUserId is required" });
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    if (league.commissionerId !== userId) return res.status(403).json({ message: "Only the commissioner can transfer the role" });
    if (newUserId === userId) return res.status(400).json({ message: "You are already the commissioner" });
    const coaches = await storage.getCoachesByLeague(leagueId);
    const targetCoach = coaches.find(c => c.userId === newUserId);
    if (!targetCoach) return res.status(400).json({ message: "Target user must have an active coach in this league" });
    await storage.transferCommissioner(leagueId, newUserId, userId);
    res.json({ message: "Commissioner role transferred", newCommissionerId: newUserId });
  } catch (error) {
    console.error("Failed to transfer commissioner:", error);
    res.status(500).json({ message: "Failed to transfer commissioner" });
  }
});

}
