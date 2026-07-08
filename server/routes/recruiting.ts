/**
 * Recruiting routes.
 *
 * Endpoints:
 *   GET  /api/leagues/:id/recommended-actions    — war room recommendations
 *   GET  /api/leagues/:id/recruits               — recruiting pool
 *   POST /api/leagues/:id/recruits/:rId/scout    — scout a recruit
 *   POST /api/leagues/:id/recruits/:rId/email    — send email
 *   POST /api/leagues/:id/recruits/:rId/call     — phone call
 *   POST /api/leagues/:id/recruits/:rId/visit    — campus visit
 *   POST /api/leagues/:id/recruits/:rId/hcvisit  — head coach visit
 *   POST /api/leagues/:id/recruits/:rId/offer    — scholarship offer
 *   POST /api/leagues/:id/recruits/:rId/commit   — commit/decommit recruit
 *   POST /api/leagues/:id/recruits/:rId/notes    — update personal notes
 *   GET  /api/leagues/:id/recruiting-pipeline    — pipeline summary
 *   GET  /api/leagues/:id/recruiting-preferences — load saved preferences
 *   POST /api/leagues/:id/recruiting-preferences — save preferences
 *   GET  /api/leagues/:id/roster-forecast        — next-year roster forecast
 *   GET  /api/leagues/:id/recruits/:rId/scouting-history
 *   GET  /api/leagues/:id/compare-recruits
 *   GET  /api/leagues/:id/recruit-trends
 *   GET  /api/leagues/:id/recruiting-scores
 *   POST /api/leagues/:id/recruiting-scores/recalculate
 *   GET  /api/leagues/:id/recruiting-scores/history
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, calculatePhilosophyRetentionBonus } from "../route-helpers";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import { ALL_GAME_DAYS, computeWeeklyAvailability } from "@shared/pitcherRest";
import type { GameDay } from "@shared/pitcherRest";
import type { Player } from "@shared/schema";
import { generateRecruitCommitNewsArticle } from "../news-engine";
import { invalidateLeague } from "../cache";
import { getActionPointCost } from "@shared/stateDistance";

export function registerRecruitingRoutes(app: Express): void {
  // ============ RECOMMENDED ACTIONS (WAR ROOM) ============
  //
  // Decision-support layer: for each recruit, computes the single highest-value
  // next action (Email/Phone/Campus Visit/HC Visit/Offer/Scout/Hold) plus a
  // human-readable reason and an urgency score, respecting the same weekly/season
  // action constraints enforced by the action endpoints above. This layer is
  // purely advisory — it reads existing signals (interest, competition, stage,
  // scouting %, position needs, trend) and never touches interest-gain math,
  // the multiplier stack, or CPU AI.
  const RECOMMENDABLE_POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];

  type RecommendedAction = "email" | "phone" | "campus_visit" | "hc_visit" | "offer" | "scout" | "hold";

  interface RecruitRecommendationInput {
    starRating: number;
    interestLevel: number;
    scoutPct: number;
    stage: string;
    teamsIn: number;
    offersOut: number;
    trend: "up" | "down" | "flat";
    positionNeed: boolean;
    userIsLeader: boolean;
    hasOffer: boolean;
    isTargeted: boolean;
    phoneUsedThisWeek: boolean;
    emailUsedThisWeek: boolean;
    visitUsed: boolean;
    hcVisitUsed: boolean;
    remainingPoints: number;
    remainingScoutPoints: number;
  }

  function decideRecruitAction(input: RecruitRecommendationInput): { action: RecommendedAction; reason: string; urgency: number } {
    const {
      starRating, interestLevel, scoutPct, stage, teamsIn, offersOut, trend,
      positionNeed, userIsLeader, hasOffer, isTargeted, phoneUsedThisWeek,
      emailUsedThisWeek, visitUsed, hcVisitUsed, remainingPoints, remainingScoutPoints,
    } = input;

    const needBoost = positionNeed ? 10 : 0;
    const starBoost = Math.max(0, starRating - 3) * 5;
    const stageBoost = stage === "verbal" ? 25 : stage === "top3" ? 18 : stage === "top5" ? 10 : stage === "top8" ? 5 : 0;
    const competitionBoost = Math.min(20, teamsIn * 5) + offersOut * 5;

    // Already verbally committed to us — steady contact only, no urgent action.
    if (stage === "verbal" && userIsLeader) {
      return { action: "hold", reason: "Verbally committed to you — maintain contact but no urgent action needed", urgency: 5 + needBoost };
    }

    // Committed elsewhere — long-shot territory, deprioritize.
    if (stage === "verbal" && !userIsLeader) {
      return { action: "hold", reason: "Verbally committed to a rival program — unlikely to flip without a major push", urgency: 8 };
    }

    // Scouting gap — can't make an informed pitch without more intel.
    if (scoutPct < 25 && remainingScoutPoints > 0) {
      return {
        action: "scout",
        reason: `Only ${scoutPct}% scouted — reveal more before investing recruiting points`,
        urgency: 25 + needBoost + starBoost,
      };
    }

    // Heavy rival competition at a late stage with no offer yet — lock it in.
    if (!hasOffer && (teamsIn >= 3 || offersOut >= 1) && ["top5", "top3"].includes(stage) && remainingPoints >= 1) {
      return {
        action: "offer",
        reason: `${teamsIn} rival team${teamsIn === 1 ? "" : "s"} in${offersOut > 0 ? ` (${offersOut} with an offer out)` : ""} — extend a scholarship offer before they lock in`,
        urgency: 80 + competitionBoost + stageBoost + needBoost + starBoost,
      };
    }

    // Elite/blue-chip recruits deep in the pipeline get the head coach treatment.
    if (!hcVisitUsed && starRating >= 5 && ["top5", "top3"].includes(stage) && remainingPoints >= 1) {
      return {
        action: "hc_visit",
        reason: "Elite recruit late in the pipeline — a Head Coach Visit makes the strongest personal impression",
        urgency: 70 + stageBoost + needBoost,
      };
    }

    // High-value recruits not yet campus-visited, once they've shown real interest.
    if (!visitUsed && (starRating >= 4 || positionNeed) && ["top8", "top5", "top3"].includes(stage) && remainingPoints >= 1) {
      return {
        action: "campus_visit",
        reason: positionNeed
          ? "Fills a roster need — a Campus Visit can seal the deal"
          : "High-value target — a Campus Visit converts interest into commitment",
        urgency: 60 + stageBoost + needBoost + starBoost,
      };
    }

    // Slipping away — interest trending down, needs a touchpoint this week.
    if (trend === "down" && interestLevel > 0) {
      if (!phoneUsedThisWeek && remainingPoints >= 1) {
        return { action: "phone", reason: "Interest is trending down — a phone call can stop the slide", urgency: 55 + needBoost + starBoost };
      }
      if (!emailUsedThisWeek && remainingPoints >= 1) {
        return { action: "email", reason: "Interest is trending down — send an email to re-engage", urgency: 50 + needBoost + starBoost };
      }
    }

    // Standard weekly cadence — keep the relationship warm.
    if (!phoneUsedThisWeek && remainingPoints >= 1) {
      return {
        action: "phone",
        reason: positionNeed ? "Fills a roster need — keep the relationship warm with a call" : "No contact yet this week — a phone call keeps interest growing",
        urgency: 35 + needBoost + starBoost + (isTargeted ? 5 : 0),
      };
    }
    if (!emailUsedThisWeek && remainingPoints >= 1) {
      return {
        action: "email",
        reason: positionNeed ? "Fills a roster need — a quick email maintains momentum" : "No contact yet this week — an email maintains momentum",
        urgency: 30 + needBoost + starBoost + (isTargeted ? 5 : 0),
      };
    }

    return { action: "hold", reason: remainingPoints < 1 ? "Out of recruiting points this week" : "Already contacted this week — nothing further to do right now", urgency: 5 };
  }

  app.get("/api/leagues/:id/recruiting/recommendations", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const userTeam = userCoach ? leagueTeams.find(t => t.id === userCoach.teamId) : leagueTeams.find(t => !t.isCpu);
      if (!userTeam) return res.status(400).json({ message: "No team assigned" });

      const [leagueRecruits, interests, allTeamActions, allLeagueInterests, allLeagueTopSchools, roster] = await Promise.all([
        storage.getRecruitsByLeague(leagueId),
        storage.getRecruitingInterestsByTeam(userTeam.id),
        storage.getRecruitingActionsLogByTeam(userTeam.id, leagueId),
        storage.getRecruitingInterestsByLeague(leagueId),
        storage.getRecruitTopSchoolsByLeague(leagueId),
        storage.getPlayersByTeam(userTeam.id),
      ]);

      const interestMap = new Map(interests.map(i => [i.recruitId, i]));

      // Rival competition signal (teams with meaningful interest or an offer out)
      const teamsInMap = new Map<string, { teamsIn: number; offersOut: number }>();
      for (const ri of allLeagueInterests) {
        if (ri.teamId === userTeam.id) continue;
        if ((ri.interestLevel || 0) <= 20 && !ri.hasOffer) continue;
        const entry = teamsInMap.get(ri.recruitId) ?? { teamsIn: 0, offersOut: 0 };
        entry.teamsIn++;
        if (ri.hasOffer) entry.offersOut++;
        teamsInMap.set(ri.recruitId, entry);
      }

      // Perceived leader (highest combined interest among active top-school entries)
      const topSchoolsByRecruit = new Map<string, typeof allLeagueTopSchools>();
      for (const ts of allLeagueTopSchools) {
        if (!ts.isActive) continue;
        const arr = topSchoolsByRecruit.get(ts.recruitId) ?? [];
        arr.push(ts);
        topSchoolsByRecruit.set(ts.recruitId, arr);
      }
      const leaderMap = new Map<string, string>();
      for (const [rid, arr] of Array.from(topSchoolsByRecruit.entries())) {
        const best = arr.reduce((a, b) => (a.interestLevel + a.accumulatedInterest) >= (b.interestLevel + b.accumulatedInterest) ? a : b);
        leaderMap.set(rid, best.teamId);
      }

      // Weekly/premium action usage + recent trend, from this team's action log
      const weeklyActionsUsed: Record<string, Set<string>> = {};
      const premiumActionsUsed: Record<string, Set<string>> = {};
      const actionsByRecruit = new Map<string, typeof allTeamActions>();
      for (const a of allTeamActions) {
        const arr = actionsByRecruit.get(a.recruitId) ?? [];
        arr.push(a);
        actionsByRecruit.set(a.recruitId, arr);

        if (a.actionType === "visit" || a.actionType === "head_coach_visit") {
          if (!premiumActionsUsed[a.recruitId]) premiumActionsUsed[a.recruitId] = new Set();
          premiumActionsUsed[a.recruitId].add(a.actionType);
        }
        if ((a.actionType === "phone" || a.actionType === "email") && a.week === league.currentWeek && a.season === league.currentSeason) {
          if (!weeklyActionsUsed[a.recruitId]) weeklyActionsUsed[a.recruitId] = new Set();
          weeklyActionsUsed[a.recruitId].add(a.actionType);
        }
      }
      const currentSeason = league.currentSeason;
      const currentWeek = league.currentWeek;
      const getTrend = (recruitId: string): "up" | "down" | "flat" => {
        const actions = actionsByRecruit.get(recruitId) ?? [];
        const recent = actions.filter(a => a.season === currentSeason && (currentWeek - a.week) >= 0 && (currentWeek - a.week) <= 2);
        const totalGain = recent.reduce((s, a) => s + (a.interestChange || 0), 0);
        if (totalGain > 5) return "up";
        if (totalGain < -5) return "down";
        return "flat";
      };

      // Position needs (mirrors /recruiting/pipeline logic)
      const seniors = roster.filter(p => p.eligibility === "SR");
      const positionCounts: Record<string, number> = {};
      const seniorPositions: Record<string, number> = {};
      for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      for (const s of seniors) seniorPositions[s.position] = (seniorPositions[s.position] || 0) + 1;
      const needPositions = new Set<string>();
      for (const pos of RECOMMENDABLE_POSITIONS) {
        const current = positionCounts[pos] || 0;
        const graduating = seniorPositions[pos] || 0;
        if (current - graduating < 2) needPositions.add(pos);
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const remainingPoints = Math.max(0, maxRecruitingActions - (userCoach?.recruitActionsUsed || 0));
      const maxScoutActions = getMaxScoutActions(userCoach);
      const remainingScoutPoints = Math.max(0, maxScoutActions - (userCoach?.scoutActionsUsed || 0));

      const recommendations: {
        recruitId: string;
        firstName: string;
        lastName: string;
        position: string;
        starRating: number;
        stage: string;
        action: RecommendedAction;
        reason: string;
        urgency: number;
        interestLevel: number;
        trend: "up" | "down" | "flat";
        teamsIn: number;
        positionNeed: boolean;
      }[] = [];

      for (const recruit of leagueRecruits) {
        if (recruit.signedTeamId) continue; // signed anywhere — no action needed
        const interest = interestMap.get(recruit.id);
        const interestLevel = interest?.interestLevel ?? 0;
        const scoutPct = interest?.scoutPercentage ?? 0;
        const stage = (recruit.stage || "open").toLowerCase();
        const ti = teamsInMap.get(recruit.id) ?? { teamsIn: 0, offersOut: 0 };
        const trend = getTrend(recruit.id);
        const positionNeed = needPositions.has(recruit.position);
        const userIsLeader = leaderMap.get(recruit.id) === userTeam.id;
        const weeklyUsed = weeklyActionsUsed[recruit.id] ?? new Set<string>();
        const premiumUsed = premiumActionsUsed[recruit.id] ?? new Set<string>();

        const decision = decideRecruitAction({
          starRating: recruit.starRating || 0,
          interestLevel,
          scoutPct,
          stage,
          teamsIn: ti.teamsIn,
          offersOut: ti.offersOut,
          trend,
          positionNeed,
          userIsLeader,
          hasOffer: !!interest?.hasOffer,
          isTargeted: !!interest?.isTargeted,
          phoneUsedThisWeek: weeklyUsed.has("phone"),
          emailUsedThisWeek: weeklyUsed.has("email"),
          visitUsed: premiumUsed.has("visit"),
          hcVisitUsed: premiumUsed.has("head_coach_visit"),
          remainingPoints,
          remainingScoutPoints,
        });

        recommendations.push({
          recruitId: recruit.id,
          firstName: recruit.firstName,
          lastName: recruit.lastName,
          position: recruit.position,
          starRating: recruit.starRating || 0,
          stage,
          ...decision,
          interestLevel,
          trend,
          teamsIn: ti.teamsIn,
          positionNeed,
        });
      }

      const actionable = recommendations.filter(r => r.action !== "hold");
      const topActions = [...actionable].sort((a, b) => b.urgency - a.urgency).slice(0, 5);
      const highRisk = recommendations
        .filter(r => (r.teamsIn >= 3 && r.action !== "hold") || (r.trend === "down" && r.interestLevel > 0))
        .sort((a, b) => b.urgency - a.urgency)
        .slice(0, 8);
      const soonToCommit = recommendations
        .filter(r => ["top3", "verbal"].includes(r.stage) && r.interestLevel >= 60)
        .sort((a, b) => b.interestLevel - a.interestLevel)
        .slice(0, 8);
      const slippingAway = recommendations
        .filter(r => r.trend === "down" && r.interestLevel > 0)
        .sort((a, b) => b.urgency - a.urgency)
        .slice(0, 8);
      const uncoveredNeeds = Array.from(needPositions).filter(pos => {
        const targetedAtPosition = leagueRecruits.some(r =>
          r.position === pos && !r.signedTeamId && interestMap.get(r.id)?.isTargeted
        );
        return !targetedAtPosition;
      });

      res.json({
        season: league.currentSeason,
        week: league.currentWeek,
        remainingPoints,
        remainingScoutPoints,
        recommendations,
        weeklyPlan: { topActions, highRisk, soonToCommit, slippingAway, uncoveredNeeds },
      });
    } catch (error) {
      console.error("Failed to fetch recruiting recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recruiting recommendations" });
    }
  });

  // ============ RECRUITING CALCULATION HELPERS ============
  
  // Clipped-gain observability counter. Incremented whenever a gain lands outside
  // the expected band so operators can grep for summary lines in server logs.
  let _sanityClippedCount = 0;

  function assertInterestGainSane(actionType: string, interestGain: number, baseGain: number) {
    // Tightened band: 0.4× to 5.0× base (previously 0.25×–8×).
    // After the school-bonus normalization (0.80–1.25) and per-action multiplier
    // caps (email/phone 4.5×, visits/offer 3.0×) the legitimate range is
    // ≈0.36×–4.5×, so anything outside 0.4×–5.0× is a real anomaly.
    const expectedMin = Math.ceil(baseGain * 0.4);
    const expectedMax = Math.ceil(baseGain * 5.0);
    if (interestGain < expectedMin || interestGain > expectedMax) {
      _sanityClippedCount++;
      console.warn(
        `[recruiting-sanity] ${actionType}: interestGain=${interestGain} outside [${expectedMin},${expectedMax}] (base=${baseGain}) — cumulative clips: ${_sanityClippedCount}`,
      );
    }
  }

  function calculatePriorityBonus(pitchTopic: string, recruit: any, team: any): { bonus: number; matchLevel: string } {
    const priorityMap: Record<string, string> = {
      proximity: recruit.proximityPriority,
      reputation: recruit.reputationPriority,
      playingTime: recruit.playingTimePriority,
      academics: recruit.academicsPriority,
      prestige: recruit.prestigePriority,
      facilities: recruit.facilitiesPriority,
      collegeLife: (recruit as any).collegeLifePriority || "Somewhat",
    };
    
    const priorityValue = priorityMap[pitchTopic] || "Somewhat";
    
    // Convert priority text to multiplier
    const priorityMultipliers: Record<string, number> = {
      "Not Important": 0.5,
      "Somewhat": 1.0,
      "Very": 1.5,
      "Extremely": 2.0,
    };
    
    const multiplier = priorityMultipliers[priorityValue] || 1.0;
    return { bonus: multiplier, matchLevel: priorityValue };
  }
  
  // Normalize a 1-10 team attribute into the range 0.80–1.25.
  // At attr=1 → 0.80, attr=5 → 1.0, attr=10 → 1.25.
  // This replaces the old attr/5 formula (range 0.2–2.0) which caused extreme
  // stacking and is inconsistent with the design spec of ~0.7–1.4 school bonus.
  function normalizeAttrBonus(attr: number): number {
    const clamped = Math.max(1, Math.min(10, attr));
    return 0.75 + clamped * 0.05;
  }

  // Calculate school attribute bonus for a pitch topic.
  // Range: ~0.80–1.375 (topic bonus × overall quality modifier).
  // Rising programs (improved national rank 10+ spots last season) get a temporary
  // recruitingRankBoost (0.05 or 0.10) added to the quality modifier for one season.
  function calculateSchoolBonus(pitchTopic: string, team: any): number {
    const attributeMap: Record<string, number> = {
      proximity: 1.0,                                // No school attribute for proximity
      reputation: normalizeAttrBonus(team.prestige || 5),
      playingTime: 1.0,                              // Playing time is situational
      academics: normalizeAttrBonus(team.academics || 5),
      prestige: normalizeAttrBonus(team.prestige || 5),
      facilities: normalizeAttrBonus(team.facilities || 5),
      collegeLife: normalizeAttrBonus(team.collegeLife || 5),
    };
    const topicBonus = attributeMap[pitchTopic] || 1.0;

    // Overall program quality modifier: 0.92 (all attrs 1) to 1.10 (all attrs 10)
    // Includes collegeLife so all 5 real attributes contribute equally
    const overallQuality = ((team.prestige || 5) + (team.facilities || 5) + (team.academics || 5) + (team.collegeLife || 5)) / 40;
    // Apply rising-program rank boost (0 baseline, +0.05 for 10+ spots, +0.10 for 20+ spots)
    const rankBoost = typeof team.recruitingRankBoost === "number" ? team.recruitingRankBoost : 0;
    const qualityModifier = 0.9 + (overallQuality * 0.2) + rankBoost;

    return topicBonus * qualityModifier;
  }
  
  const ARCHETYPE_RECRUITING_ACTION_BONUS: Record<string, number> = {
    "Scout Master": 4,
    "Dealmaker": 4,
    "Pure CEO": 2,
    "Player's Coach": 0,
    "Balanced": 0,
    "Academic Dean": 0,
    "Tactician": -2,
    "Old School": -4,
  };

  const ARCHETYPE_INTEREST_MULTIPLIERS: Record<string, number> = {
    "Pure CEO": 1.15,
    "Dealmaker": 1.12,
    "Player's Coach": 1.10,
    "Scout Master": 1.08,
    "Balanced": 1.0,
    "Academic Dean": 1.0,
    "Tactician": 0.95,
    "Old School": 0.90,
  };

  function getMaxRecruitingActions(coach: any): number {
    const baseActions = 15;
    const skillBonus = Math.floor(((coach?.pitchingRecruitingSkill || 1) + (coach?.hittingRecruitingSkill || 1)) / 2);
    const archetypeBonus = ARCHETYPE_RECRUITING_ACTION_BONUS[coach?.archetype] || 0;
    return Math.max(4, baseActions + skillBonus + archetypeBonus);
  }

  function getMaxScoutActions(coach: any): number {
    const baseActions = 25;
    const skillBonus = Math.floor(((coach?.scoutingSkill || 1) + (coach?.evaluationSkill || 1)) / 2);
    const archetypeScoutBonus: Record<string, number> = {
      "Scout Master": 6,
      "Academic Dean": 3,
      "Balanced": 0,
      "Pure CEO": 0,
      "Player's Coach": 2,
      "Dealmaker": -2,
      "Tactician": 2,
      "Old School": -2,
    };
    const archBonus = archetypeScoutBonus[coach?.archetype] || 0;
    return Math.max(4, baseActions + skillBonus + archBonus);
  }

  const ARCHETYPE_PITCHER_BONUS: Record<string, number> = {
    "Tactician": 1.20,
    "Old School": 1.15,
    "Scout Master": 1.05,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Dealmaker": 1.0,
    "Player's Coach": 1.0,
    "Academic Dean": 1.0,
  };

  const ARCHETYPE_HITTER_BONUS: Record<string, number> = {
    "Player's Coach": 1.20,
    "Dealmaker": 1.10,
    "Scout Master": 1.05,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Tactician": 1.0,
    "Old School": 1.0,
    "Academic Dean": 1.0,
  };

  const ARCHETYPE_POTENTIAL_NARROWING: Record<string, number> = {
    "Scout Master": 1.30,
    "Academic Dean": 1.15,
    "Tactician": 1.10,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Player's Coach": 1.0,
    "Dealmaker": 0.90,
    "Old School": 0.85,
  };

  // Additive philosophy bonus from coach's 3 philosophy statements.
  // Each statement contributes a flat additive amount to the final coach multiplier.
  // Importance scaling: extremely=1.0×, very=0.67×, somewhat=0.33× of the full base bonus.
  // Stacks additively (not multiplicatively) with archetype×skill×position to prevent compounding.
  function calculatePhilosophyBonus(coach: any, recruit: any, actionType: string, team?: any): number {
    const philosophy = Array.isArray(coach.coachingPhilosophy)
      ? (coach.coachingPhilosophy as { statement: string; importance: string }[])
      : [];
    if (philosophy.length === 0) return 0;

    const importanceScale: Record<string, number> = { extremely: 1.0, very: 0.67, somewhat: 0.33 };

    const PITCHER_POSITIONS = ["P", "SP", "RP", "CL", "CP", "LHP", "RHP"];
    const isPitcher = PITCHER_POSITIONS.includes(recruit.position || "");
    // Map string stage to numeric pipeline index (open=0 … signed=5)
    const STAGE_ORDER = ["open", "top8", "top5", "top3", "verbal", "signed"];
    const stageIndex = STAGE_ORDER.indexOf((recruit.stage || "open").toLowerCase());
    const stars    = recruit.starRating || 2;
    const isBlueChip = !!recruit.isBlueChip;
    const academicsPriority  = recruit.academicsPriority  || "Somewhat";
    const reputationPriority = recruit.reputationPriority || "Somewhat";
    const highAcademics  = academicsPriority  === "Very" || academicsPriority  === "Extremely";
    const highReputation = reputationPriority === "Very" || reputationPriority === "Extremely";

    // Proximity helpers (used by "Play the Right Way" and "Build a National Brand")
    const recruitState = recruit.homeState || "";
    const teamState    = team?.state || "";
    const sameState    = !!recruitState && recruitState === teamState;
    const sameRegion   = !sameState && (() => {
      if (!recruitState || !teamState) return false;
      const regions: string[][] = [
        ["FL","GA","AL","SC","NC","TN","MS","LA"],
        ["TX","AZ","NM","OK"],
        ["OH","IN","IL","MI","WI","MN","IA","MO","NE","KS"],
        ["NY","PA","NJ","MA","CT","MD","VA"],
        ["CA","WA","OR","CO","UT","NV"],
      ];
      const rr = regions.find(r => r.includes(recruitState));
      const tr = regions.find(r => r.includes(teamState));
      return !!(rr && tr && rr === tr);
    })();

    const isEmail  = actionType === "email";
    const isPhone  = actionType === "phone";
    const isEmailPhone  = isEmail || isPhone;
    const isVisit  = actionType === "visit" || actionType === "campus_visit";
    const isHCVisit = actionType === "head_coach_visit" || actionType === "hc_visit";
    const isOffer  = actionType === "offer";

    let total = 0;

    for (const { statement, importance } of philosophy) {
      const scale = importanceScale[importance] ?? 0.33;
      let base = 0;

      switch (statement) {
        // ── Balanced philosophies ─────────────────────────────────────────────
        case "Recruit for the Long Term":
          // Early-pipeline email/phone (open/top8/top5 = indices 0-2) get a relationship-depth bonus
          if (isEmailPhone && stageIndex <= 2) base = 0.10;
          break;
        case "Build Team Chemistry":
          // Campus visits benefit from the team-culture sell
          if (isVisit) base = 0.12;
          break;
        case "Play Small Ball":
          // Philosophy bleeds into recruiting culture — minor flat bonus on all actions
          base = 0.04;
          break;

        // ── Pure CEO philosophies ─────────────────────────────────────────────
        case "Win Now":
          // Offer aggression — offers land harder
          if (isOffer) base = 0.14;
          break;
        case "Elite Program Standards":
          // High standards make campus visits more converting
          if (isVisit) base = 0.12;
          break;
        case "Build a National Brand":
          // Reduces out-of-state penalty; slight bonus even in-state
          base = sameState ? 0.02 : 0.07;
          break;

        // ── Player's Coach philosophies ───────────────────────────────────────
        case "Player Development First":
          // Always active: recruits who care about development (high reputation priority)
          // respond stronger; flat bonus for all other email/phone
          if (isEmailPhone) base = highReputation ? 0.14 : 0.06;
          break;
        case "Positive Culture":
          // Campus visits benefit most; email/phone get a smaller relationship bonus
          if (isVisit) base = 0.12;
          else if (isEmailPhone) base = 0.04;
          break;
        case "Trust the Process":
          // Recruits already in mid-pipeline (top5+ = indices 2+) are more receptive
          if ((isEmailPhone || isOffer) && stageIndex >= 2) base = 0.07;
          break;

        // ── Tactician philosophies ────────────────────────────────────────────
        case "Pitching Wins Championships":
          // HC visits with pitching recruits — elite personal sell
          if (isHCVisit && isPitcher) base = 0.14;
          break;
        case "Game Management Mastery":
          // HC visits are broadly more effective (coach's tactical reputation)
          if (isHCVisit) base = 0.12;
          break;
        case "Exploit Every Matchup":
          // Systematic approach improves email/phone pitch quality
          if (isEmailPhone) base = 0.05;
          break;

        // ── Old School philosophies ───────────────────────────────────────────
        case "Play the Right Way":
          // Regional powerhouse: same-state recruits respond strongly; same-region moderately
          if (sameState) base = 0.14;
          else if (sameRegion) base = 0.07;
          break;
        case "Defense and Pitching":
          // Phone calls with pitching recruits — old-school grind on the phone
          if (isPhone && isPitcher) base = 0.12;
          break;
        case "Earn Everything":
          // Sustained effort boosts visit effectiveness (HC and campus)
          if (isHCVisit || isVisit) base = 0.07;
          break;

        // ── Scout Master philosophies ─────────────────────────────────────────
        // NOTE: primary effects of "Scouting Advantage" and "Find Hidden Gems" are in
        // calculatePhilosophyScoutBonus (scouting reveal %). Recruiting bonuses here
        // are small secondary effects only.
        case "Scouting Advantage":
          // Secondary: deeper intel translates into a slightly sharper pitch on phone/email
          if (isEmailPhone) base = 0.04;
          break;
        case "Find Hidden Gems":
          // Secondary: pitching to under-the-radar recruits is more natural for this coach
          if (isEmailPhone && stars <= 2) base = 0.05;
          break;
        case "Build Through Recruiting":
          // Dual: email/phone volume mindset (recruiting) + wider scouting reveals (scouting)
          if (isEmailPhone) base = 0.05;
          break;

        // ── Academic Dean philosophies ────────────────────────────────────────
        case "Academic Excellence":
          // Recruits who prioritize academics respond to all actions significantly better
          if (highAcademics) base = 0.14;
          break;
        case "Graduation Rate Matters":
          // Campus visits are more effective when academics is part of the pitch
          if (isVisit) base = 0.12;
          break;
        case "Character Counts":
          // Email/phone with academics-minded recruits earns extra interest
          if (isEmailPhone && highAcademics) base = 0.08;
          break;

        // ── Dealmaker philosophies ────────────────────────────────────────────
        case "Land the Blue Chips":
          // Scholarship offers to 4★+ and blue-chip recruits generate outsized interest
          if (isOffer && (stars >= 4 || isBlueChip)) base = 0.14;
          break;
        case "NIL Budget Mastery":
          // Offer bonus scales with how much NIL budget remains: more budget = stronger positioning.
          // Full budget (100% remaining): +0.18; half remaining: +0.12; nearly empty: +0.06.
          if (isOffer) {
            const nilBudget = team?.nilBudget || 0;
            const nilSpent = team?.nilSpent || 0;
            const nilRatio = nilBudget > 0 ? Math.max(0, (nilBudget - nilSpent) / nilBudget) : 0.5;
            base = 0.06 + nilRatio * 0.12;
          }
          break;
        case "Close Every Deal":
          // Late-stage recruits (top3+ = indices 3+) respond to any action with higher intent
          if (stageIndex >= 3) base = 0.07;
          break;
      }

      total += base * scale;
    }

    return total;
  }

  // Calculate coach skill bonus for recruiting action.
  // Returns: skillBonus × archetypeBonus × positionBonus + philosophyAddon
  // philosophyAddon is additive (not multiplicative) to prevent compounding.
  function calculateCoachBonus(coach: any, recruit: any, actionType: string, team?: any): number {
    if (!coach) return 1.0;
    
    const isPitcher = recruit.position === "P";
    const baseSkill = isPitcher 
      ? (coach.pitchingRecruitingSkill || 1)
      : (coach.hittingRecruitingSkill || 1);
    const skillBonus = 1.0 + (baseSkill - 1) * 0.05;
    
    const archetypeBonus = ARCHETYPE_INTEREST_MULTIPLIERS[coach.archetype] || 1.0;
    const positionBonus = isPitcher
      ? (ARCHETYPE_PITCHER_BONUS[coach.archetype] || 1.0)
      : (ARCHETYPE_HITTER_BONUS[coach.archetype] || 1.0);

    const philosophyAddon = calculatePhilosophyBonus(coach, recruit, actionType, team);
    
    return skillBonus * archetypeBonus * positionBonus + philosophyAddon;
  }
  
  // Returns scouting reveal bonuses from the coach's philosophy statements.
  // revealBonus: additional % to add to revealAmount per scouting action (0-20)
  // narrowBonus: additive boost to potentialNarrowMultiplier (0-0.3)
  function calculatePhilosophyScoutBonus(coach: any, recruit: any): { revealBonus: number; narrowBonus: number } {
    const philosophy = Array.isArray(coach?.coachingPhilosophy)
      ? (coach.coachingPhilosophy as { statement: string; importance: string }[])
      : [];
    if (philosophy.length === 0) return { revealBonus: 0, narrowBonus: 0 };

    const importanceScale: Record<string, number> = { extremely: 1.0, very: 0.67, somewhat: 0.33 };
    const stars = recruit?.starRating || 2;
    const isLowStar = stars <= 2;

    let revealBonus = 0;
    let narrowBonus = 0;

    for (const { statement, importance } of philosophy) {
      const scale = importanceScale[importance] ?? 0.33;
      switch (statement) {
        case "Scouting Advantage":
          // PRIMARY scouting effect: reveals +10% more per action at full importance
          revealBonus += 10 * scale;
          break;
        case "Find Hidden Gems":
          // PRIMARY scouting effect: deeper reveal on sub-3★; moderate on everyone else
          revealBonus += (isLowStar ? 12 : 4) * scale;
          // Better potential narrowing on low-star prospects
          if (isLowStar) narrowBonus += 0.20 * scale;
          break;
        case "Build Through Recruiting":
          // SECONDARY scouting effect (primary is email/phone recruiting bonus)
          revealBonus += 5 * scale;
          break;
        case "Exploit Every Matchup":
          // Scouting clarity on positional fit; also has small recruiting bonus
          revealBonus += 4 * scale;
          narrowBonus += 0.10 * scale;
          break;
        case "Player Development First":
          // Better potential/eval insight — improves potential range narrowing
          narrowBonus += 0.15 * scale;
          break;
      }
    }

    return { revealBonus: Math.round(revealBonus), narrowBonus };
  }

  // Returns flat retention-chance bonus from culture/chemistry/stability philosophies.
  // Called from the transfer retention endpoint to give certain archetypes higher player loyalty.
  function calculateProximityBonus(recruitState: string, teamState: string, team?: any): number {
    if (recruitState === teamState) return 1.5; // Same state — never compressed
    
    // Regional proximity groupings
    const regions: Record<string, string[]> = {
      southeast: ["FL", "GA", "AL", "SC", "NC", "TN", "MS", "LA"],
      southwest: ["TX", "AZ", "NM", "OK"],
      midwest: ["OH", "IN", "IL", "MI", "WI", "MN", "IA", "MO", "NE", "KS"],
      northeast: ["NY", "PA", "NJ", "MA", "CT", "MD", "VA"],
      west: ["CA", "WA", "OR", "CO", "UT", "NV"],
    };
    
    let recruitRegion = "";
    let teamRegion = "";
    
    for (const [region, states] of Object.entries(regions)) {
      if (states.includes(recruitState)) recruitRegion = region;
      if (states.includes(teamState)) teamRegion = region;
    }
    
    const rawBonus = (recruitRegion && recruitRegion === teamRegion) ? 1.2 : 1.0;
    
    // National brand compression: prestige 8-9 OR stadium 8-9 reduces out-of-region/state gap
    // Region: 1.2 → up to 1.27 | Out-of-region: 1.0 → up to 1.10
    if (team) {
      const prestige = team.prestige || 5;
      const stadium = team.stadium || 5;
      const brandScore = Math.max(prestige, stadium);
      if (brandScore >= 8) {
        const compressionBoost = brandScore >= 9 ? 0.10 : 0.07;
        return Math.min(1.45, rawBonus + compressionBoost);
      }
    }
    
    return rawBonus;
  }

  // ── Recruiting math: expected gain ranges (after rebalance) ──────────────────
  //
  //  ACTION          BASE      TYPICAL GAIN    BEST CASE    FLOOR
  //  Email           3–7       ~5–8%           ~28% (cap)   1%
  //  Phone/topic     3–9       ~5–10%          ~36% (cap)   1%
  //  Campus Visit    20–35     ~25–40%         ~88% (cap)   5%
  //  HC Visit        25–40     ~30–45%         ~100% (cap)  5%
  //  Offer           15–24     ~18–25%         ~65% (cap)   2%
  //
  //  Multiplier components:
  //    priority:    0.5 (Not Important) – 2.0 (Extremely)
  //    school:      ~0.80–1.375 (normalizeAttrBonus × qualityModifier)
  //    coach:       ~0.90–1.66 (skill 1-10 × archetype × position)
  //    proximity:   1.0 (different region), 1.2 (same region), 1.5 (same state)
  //
  //  Caps prevent a single action from dominating:
  //    email/phone per-topic: totalMultiplier capped at 4.5×
  //    visit/hcv/offer:       totalMultiplier capped at 3.0×
  //
  //  ── Expected weekly progress by star tier (mid-prestige school, balanced coach) ──
  //
  //  Signing thresholds: 1–2★ need 65%, 3★ 65%, 4★ 70%, 5★ 80%, blue chip 90%.
  //  Typical weekly inputs: 1 email (~6%), 1 phone/2 topics (~14%), plus visit/offer
  //  as one-time boosts. Below: points/week excluding one-time actions.
  //
  //  Star  Threshold  Weekly inputs   Est. weeks to threshold (excl. visit/offer)
  //  1★    65%        email+phone≈20  ~3 weeks — easily signed early
  //  2★    65%        email+phone≈20  ~3 weeks — a few rivals may compete
  //  3★    65%        email+phone≈20  ~3 weeks — competitive with 2+ schools
  //  4★    70%        email+phone≈20  ~4 weeks — needs visit or offer to close
  //  5★    80%        email+phone≈20  ~4 weeks — requires perfect topic match + visit
  //  BC    90%        email+phone≈20  ~5+ weeks — visit + HCV + offer nearly required
  //
  //  (Season length Standard = 5 recruiting weeks; these are baseline estimates.
  //   Priority match, school quality, coach level, and proximity shift gains ±50%.)
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Transfer portal recruit interest modifiers ────────────────────────────
  // Applies prestige-band and playing-time depth checks for TRANSFER recruits.
  // Both human and CPU paths call these after the base compute functions.

  /** Returns prestige-band multiplier for TRANSFER recruits (1.0 for all others).
   *  teamPrestige vs. originPrestige ± 2:
   *    > +2 above band:  1.15× (upgrade — recruit sees a step up)
   *    within ± 2:       1.0×  (normal)
   *    < -2 below band:  0.6×  (too far down — significant penalty) */
  function computePrestigeBandMod(recruit: any, team: any): number {
    if (recruit.recruitType !== "TRANSFER") return 1.0;
    const op = recruit.originPrestige;
    if (op == null) return 1.0;
    const tp = team.prestige || 5;
    if (tp > op + 2) return 1.15;
    if (tp < op - 2) return 0.6;
    return 1.0;
  }

  /** Returns playing-time depth multiplier for TRANSFER recruits (1.0 for all others).
   *  Hitters: if any roster player at the same position has a higher OVR → 0.5×
   *  Pitchers: if 5+ roster pitchers have higher OVR → 0.5× */
  function computePlayingTimeMod(recruit: any, teamPlayers: any[]): number {
    if (recruit.recruitType !== "TRANSFER") return 1.0;
    const recruitOvr = recruit.overall || 0;
    const PITCHER_POSITIONS = ["P", "SP", "RP", "CL", "CP", "LHP", "RHP"];
    const isPitcher = PITCHER_POSITIONS.includes(recruit.position);
    if (isPitcher) {
      const pitchersAbove = teamPlayers.filter(
        p => PITCHER_POSITIONS.includes(p.position) && (p.overall || 0) > recruitOvr
      ).length;
      return pitchersAbove >= 5 ? 0.5 : 1.0;
    } else {
      const posPlayers = teamPlayers.filter(
        p => p.position === recruit.position && (p.overall || 0) > recruitOvr
      );
      return posPlayers.length > 0 ? 0.5 : 1.0;
    }
  }

  // Shared per-action interest formulas. Both human endpoints and the CPU
  // recruiter call these so the math is guaranteed to be identical.
  function computeEmailGain(recruit: any, team: any, coach: any, topic: string) {
    const baseGain = 3 + Math.floor(Math.random() * 5);
    const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, team);
    const schoolBonus = calculateSchoolBonus(topic, team);
    const coachBonus = calculateCoachBonus(coach, recruit, "email", team);
    const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, team.state, team) : 1.0;
    // Cap at 4.5× to prevent a single email from being dominant
    const totalMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
    const interestGain = Math.max(1, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, matchLevel, totalMultiplier };
  }
  function computePhoneGain(recruit: any, team: any, coach: any, topics: string[]) {
    let totalInterestGain = 0;
    const pitchResults: { topic: string; gain: number; matchLevel: string }[] = [];
    for (const topic of topics) {
      const baseGain = 3 + Math.floor(Math.random() * 7);
      const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, team);
      const schoolBonus = calculateSchoolBonus(topic, team);
      const coachBonus = calculateCoachBonus(coach, recruit, "phone", team);
      const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, team.state, team) : 1.0;
      // Cap per-topic at 4.5× (same as email) so multi-topic calls don't stack absurdly
      const topicMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
      const gain = Math.max(1, Math.round(baseGain * topicMultiplier));
      // Sanity-check each topic individually (avoids false positives from aggregate base averaging)
      assertInterestGainSane(`phone:${topic}`, gain, baseGain);
      totalInterestGain += gain;
      pitchResults.push({ topic, gain, matchLevel });
    }
    return { totalInterestGain, pitchResults };
  }
  function computeVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 20 + Math.floor(Math.random() * 16);
    // Use normalized attr bonuses (0.80–1.25) instead of raw attr/5 (0.2–2.0)
    const facilitiesBonus = normalizeAttrBonus(team.facilities || 5);
    const academicsBonus  = normalizeAttrBonus(team.academics  || 5);
    const prestigeBonus   = normalizeAttrBonus(team.prestige   || 5);
    const collegeLifeBonus = normalizeAttrBonus(team.collegeLife || 5);
    const schoolAttrBonus = (facilitiesBonus + academicsBonus + prestigeBonus + collegeLifeBonus) / 4;
    const coachBonus = calculateCoachBonus(coach, recruit, "visit", team);
    const { bonus: priorityBonus } = calculatePriorityBonus("facilities", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state, team);
    // Cap at 3.0× — visits already have a large base (20–35); compound extremes would eclipse everything else
    const totalMultiplier = Math.min(3.0, schoolAttrBonus * coachBonus * priorityBonus * proximityBonus);
    const interestGain = Math.max(5, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeHeadCoachVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 25 + Math.floor(Math.random() * 16);
    const coachBonus = calculateCoachBonus(coach, recruit, "head_coach_visit", team);
    const levelBonus = 1.0 + ((coach?.level || 1) - 1) * 0.03;
    const { bonus: priorityBonus } = calculatePriorityBonus("prestige", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state, team);
    // Stadium bonus: HC visit is the stadium experience moment — high stadium amplifies it
    // same way prestige does. normalizeAttrBonus gives 0.80–1.25 range.
    const stadiumBonus = normalizeAttrBonus(team.stadium || 5);
    // Cap at 3.0× — HC visit is the premium action; base alone (25–40) is strong
    const totalMultiplier = Math.min(3.0, coachBonus * levelBonus * priorityBonus * proximityBonus * stadiumBonus);
    const interestGain = Math.max(5, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeOfferGain(recruit: any, team: any, coach: any) {
    const baseGain = 15 + Math.floor(Math.random() * 10);
    // Normalized prestige bonus: 0.80–1.25 (was raw prestige/5 = 0.2–2.0)
    const prestigeBonus = normalizeAttrBonus(team.prestige || 5);
    const coachBonus = calculateCoachBonus(coach, recruit, "offer", team);
    const { bonus: priorityBonus } = calculatePriorityBonus("playingTime", recruit, team);
    // Cap at 3.0× — offer is primarily gated, not a primary gain engine
    const totalMultiplier = Math.min(3.0, prestigeBonus * coachBonus * priorityBonus);
    const interestGain = Math.max(2, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain };
  }

  // Recruiting action: phone call with up to 3 pitch topics
  app.post("/api/leagues/:id/recruiting/:recruitId/phone", requireAuth, async (req, res) => {
    try {
      const { pitchTopic, pitchTopics } = req.body || {};
      const topics: string[] = pitchTopics && Array.isArray(pitchTopics) && pitchTopics.length > 0 
        ? pitchTopics.slice(0, 3) 
        : [pitchTopic || "reputation"];
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const phoneThisWeek = existingActions.filter(a => 
        a.actionType === "phone" && a.week === league.currentWeek && a.season === league.currentSeason
      );
      if (phoneThisWeek.length >= 1) {
        return res.status(400).json({ message: "You've already called this recruit this week. Max 1 phone call per recruit per week." });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const phoneCost = getActionPointCost("phone", userTeam.state, recruit.homeState);
      if ((userCoach?.recruitActionsUsed || 0) + phoneCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Phone calls cost ${phoneCost} recruiting points. You don't have enough points remaining this week.` });
      }

      const { totalInterestGain: rawPhoneGain, pitchResults: rawPitchResults } = computePhoneGain(recruit, userTeam, userCoach, topics);
      // TRANSFER recruit modifiers: adjust each topic's gain individually
      const phoneTransferPlayers = recruit.recruitType === "TRANSFER" ? await storage.getPlayersByTeam(userTeam.id) : [];
      const phonePrestigeMod = computePrestigeBandMod(recruit, userTeam);
      const phonePlayingTimeMod = computePlayingTimeMod(recruit, phoneTransferPlayers);
      const pitchResults = rawPitchResults.map(pr => {
        const mod = pr.topic === "prestige" ? phonePrestigeMod : pr.topic === "playingTime" ? phonePlayingTimeMod : 1.0;
        return { ...pr, gain: Math.max(1, Math.round(pr.gain * mod)) };
      });
      const totalInterestGain = pitchResults.reduce((s, pr) => s + pr.gain, 0);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: totalInterestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + totalInterestGain),
        });
      }

      const phoneTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const phoneUserTopSchool = phoneTopSchools.find(ts => ts.teamId === userTeam.id);
      if (phoneUserTopSchool) {
        await storage.updateRecruitTopSchool(phoneUserTopSchool.id, { 
          accumulatedInterest: (phoneUserTopSchool.accumulatedInterest || 0) + totalInterestGain 
        });
      }

      // Per-topic sanity checks already run inside computePhoneGain; no aggregate check needed here.
      const topicSummary = pitchResults.map(p => `${p.topic} (${p.matchLevel}, +${p.gain}%)`).join(", ");
      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "phone",
        interestChange: totalInterestGain,
        notes: `Phone call: ${topicSummary}`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + phoneCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + phoneCost);
      invalidateLeague(req.params.id as string);
      res.json({ 
        interest, 
        interestGain: totalInterestGain, 
        pitchResults,
        actionsRemaining,
      });
    } catch (error) {
      console.error("Failed to make phone call:", error);
      res.status(500).json({ message: "Failed to make phone call" });
    }
  });

  // Recruiting action: email with pitch topic
  app.post("/api/leagues/:id/recruiting/:recruitId/email", requireAuth, async (req, res) => {
    try {
      const { pitchTopic } = req.body || {};
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const existingEmailActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const emailThisWeek = existingEmailActions.filter(a => 
        a.actionType === "email" && a.week === league.currentWeek && a.season === league.currentSeason
      );
      if (emailThisWeek.length >= 1) {
        return res.status(400).json({ message: "You've already emailed this recruit this week. Max 1 email per recruit per week." });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      if ((userCoach?.recruitActionsUsed || 0) >= maxRecruitingActions) {
        return res.status(400).json({ message: `You've used all ${maxRecruitingActions} recruiting points this week` });
      }

      // Calculate interest gain with modifiers (email is less effective than phone)
      const topic = pitchTopic || "reputation";
      const { baseGain, interestGain: rawEmailGain, matchLevel, totalMultiplier } = computeEmailGain(recruit, userTeam, userCoach, topic);
      // TRANSFER recruit modifiers: prestige band (for prestige topic) and playing time depth (for playingTime topic)
      const emailTransferPlayers = recruit.recruitType === "TRANSFER" ? await storage.getPlayersByTeam(userTeam.id) : [];
      const emailPrestigeMod = computePrestigeBandMod(recruit, userTeam);
      const emailPlayingTimeMod = computePlayingTimeMod(recruit, emailTransferPlayers);
      const emailTopicMod = topic === "prestige" ? emailPrestigeMod : topic === "playingTime" ? emailPlayingTimeMod : 1.0;
      const interestGain = Math.max(1, Math.round(rawEmailGain * emailTopicMod));
      assertInterestGainSane("email", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      // Sync top schools interest
      const emailTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const emailUserTopSchool = emailTopSchools.find(ts => ts.teamId === userTeam.id);
      if (emailUserTopSchool) {
        await storage.updateRecruitTopSchool(emailUserTopSchool.id, { 
          accumulatedInterest: (emailUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "email",
        interestChange: interestGain,
        notes: `Email about ${topic} (${matchLevel} priority, +${interestGain}%)`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + 1,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + 1);
      invalidateLeague(req.params.id as string);
      res.json({ 
        interest, 
        interestGain, 
        pitchTopic: topic, 
        matchLevel,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
      });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });
  
  // Recruiting action: campus visit (high value, limited uses)
  app.post("/api/leagues/:id/recruiting/:recruitId/visit", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const actionCost = getActionPointCost("visit", userTeam.state, recruit.homeState);
      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const actionsUsed = userCoach?.recruitActionsUsed || 0;
      if (actionsUsed + actionCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Campus Visit costs ${actionCost} recruiting points. You only have ${maxRecruitingActions - actionsUsed} remaining.` });
      }

      const seasonVisits = await storage.getSeasonVisitCount(userTeam.id, req.params.id as string, league.currentSeason);
      if (seasonVisits.total >= 20) {
        return res.status(400).json({ message: `You've used all 20 visits for this season (${seasonVisits.campusVisits} campus + ${seasonVisits.hcVisits} head coach). The cap resets next season.` });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const previousVisit = existingActions.find(a => a.actionType === "visit");
      if (previousVisit) {
        return res.status(400).json({ message: "You've already used your Campus Visit for this recruit. This action can only be done once per recruit." });
      }

      const { baseGain, interestGain, totalMultiplier } = computeVisitGain(recruit, userTeam, userCoach);
      assertInterestGainSane("visit", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      const visitTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const visitUserTopSchool = visitTopSchools.find(ts => ts.teamId === userTeam.id);
      if (visitUserTopSchool) {
        await storage.updateRecruitTopSchool(visitUserTopSchool.id, { 
          accumulatedInterest: (visitUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "visit",
        interestChange: interestGain,
        notes: `Campus Visit (+${interestGain}% interest) [Costs ${actionCost} points]`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: actionsUsed + actionCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - (actionsUsed + actionCost);
      invalidateLeague(req.params.id as string);
      res.json({ 
        interest, 
        interestGain,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
        actionCost,
      });
    } catch (error) {
      console.error("Failed to schedule visit:", error);
      res.status(500).json({ message: "Failed to schedule visit" });
    }
  });

  // Recruiting action: Head Coach Visit (premium, 1 per recruit, costs 2 actions)
  app.post("/api/leagues/:id/recruiting/:recruitId/head-coach-visit", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const actionCost = getActionPointCost("head_coach_visit", userTeam.state, recruit.homeState);
      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const actionsUsed = userCoach?.recruitActionsUsed || 0;
      if (actionsUsed + actionCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Head Coach Visit costs ${actionCost} recruiting points. You only have ${maxRecruitingActions - actionsUsed} remaining.` });
      }

      const seasonVisitsHcv = await storage.getSeasonVisitCount(userTeam.id, req.params.id as string, league.currentSeason);
      if (seasonVisitsHcv.total >= 20) {
        return res.status(400).json({ message: `You've used all 20 visits for this season (${seasonVisitsHcv.campusVisits} campus + ${seasonVisitsHcv.hcVisits} head coach). The cap resets next season.` });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const previousHCV = existingActions.find(a => a.actionType === "head_coach_visit");
      if (previousHCV) {
        return res.status(400).json({ message: "You've already used your Head Coach Visit for this recruit. This action can only be done once per recruit." });
      }

      const { baseGain, interestGain: rawHcvGain, totalMultiplier } = computeHeadCoachVisitGain(recruit, userTeam, userCoach);
      // TRANSFER recruit: prestige band modifier applies (HC visit pitches prestige)
      const hcvPrestigeMod = computePrestigeBandMod(recruit, userTeam);
      const interestGain = Math.max(5, Math.round(rawHcvGain * hcvPrestigeMod));
      assertInterestGainSane("head_coach_visit", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      const hcvTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const hcvUserTopSchool = hcvTopSchools.find(ts => ts.teamId === userTeam.id);
      if (hcvUserTopSchool) {
        await storage.updateRecruitTopSchool(hcvUserTopSchool.id, { 
          accumulatedInterest: (hcvUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "head_coach_visit",
        interestChange: interestGain,
        notes: `Head Coach Visit (+${interestGain}% interest) [Costs ${actionCost} points]`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: actionsUsed + actionCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - (actionsUsed + actionCost);
      invalidateLeague(req.params.id as string);
      res.json({ 
        interest, 
        interestGain,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
        actionCost,
      });
    } catch (error) {
      console.error("Failed to schedule head coach visit:", error);
      res.status(500).json({ message: "Failed to schedule head coach visit" });
    }
  });

  // Recruiting action: offer scholarship
  app.post("/api/leagues/:id/recruiting/:recruitId/offer", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      if ((userCoach?.recruitActionsUsed || 0) >= maxRecruitingActions) {
        return res.status(400).json({ message: `You've used all ${maxRecruitingActions} recruiting points this week` });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      const { baseGain, interestGain: rawOfferGain } = computeOfferGain(recruit, userTeam, userCoach);
      // TRANSFER recruit: playing time depth modifier applies (offer triggers playingTime priority)
      const offerTransferPlayers = recruit.recruitType === "TRANSFER" ? await storage.getPlayersByTeam(userTeam.id) : [];
      const offerPlayingTimeMod = computePlayingTimeMod(recruit, offerTransferPlayers);
      const interestGain = Math.max(2, Math.round(rawOfferGain * offerPlayingTimeMod));
      assertInterestGainSane("offer", interestGain, baseGain);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
          hasOffer: true,
        });
      } else {
        if (interest.hasOffer) {
          return res.status(400).json({ message: "Already offered scholarship" });
        }
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
          hasOffer: true,
        });
      }

      // Sync top schools interest
      const offerTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const offerUserTopSchool = offerTopSchools.find(ts => ts.teamId === userTeam.id);
      if (offerUserTopSchool) {
        await storage.updateRecruitTopSchool(offerUserTopSchool.id, { 
          accumulatedInterest: (offerUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "offer",
        interestChange: interestGain,
        notes: `Offered scholarship (+${interestGain}% interest)`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + 1,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + 1);
      invalidateLeague(req.params.id as string);
      res.json({ interest, interestGain, actionsRemaining });
    } catch (error) {
      console.error("Failed to offer scholarship:", error);
      res.status(500).json({ message: "Failed to offer scholarship" });
    }
  });

  app.post("/api/leagues/:id/recruiting/:recruitId/target", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        const allInterests = await storage.getRecruitingInterestsByTeam(userTeam.id);
        const currentTargets = allInterests.filter(i => i.isTargeted).length;
        if (currentTargets >= 20) {
          return res.status(400).json({ message: "Maximum 20 targets reached. Remove a target first." });
        }
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          isTargeted: true,
        });
      } else {
        if (!interest.isTargeted) {
          const allInterests = await storage.getRecruitingInterestsByTeam(userTeam.id);
          const currentTargets = allInterests.filter(i => i.isTargeted).length;
          if (currentTargets >= 20) {
            return res.status(400).json({ message: "Maximum 20 targets reached. Remove a target first." });
          }
        }
        interest = await storage.updateRecruitingInterest(interest.id, {
          isTargeted: !interest.isTargeted,
        });
      }

      invalidateLeague(req.params.id as string);
      res.json(interest);
    } catch (error) {
      console.error("Failed to target recruit:", error);
      res.status(500).json({ message: "Failed to target recruit" });
    }
  });

  // Update recruit notes
  app.patch("/api/leagues/:id/recruiting/:recruitId/notes", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const { notes } = req.body;
      if (typeof notes !== "string") {
        return res.status(400).json({ message: "Notes must be a string" });
      }

      const interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      if (!interest) {
        return res.status(404).json({ message: "Recruit interest not found" });
      }

      await storage.updateRecruitingInterest(interest.id, { notes: notes || null });
      const updated = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      res.json(updated);
    } catch (error) {
      console.error("Failed to update notes:", error);
      res.status(500).json({ message: "Failed to update notes" });
    }
  });

  app.patch("/api/leagues/:id/recruiting/:recruitId/board-rank", requireAuth, async (req, res) => {
    try {
      const [leagueTeams, coaches] = await Promise.all([
        storage.getTeamsByLeague(req.params.id as string),
        storage.getCoachesByLeague(req.params.id as string),
      ]);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);

      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const { boardRank } = req.body;
      if (boardRank !== null && boardRank !== undefined) {
        if (typeof boardRank !== "number" || !Number.isInteger(boardRank) || boardRank < 1 || boardRank > 99) {
          return res.status(400).json({ message: "boardRank must be an integer between 1 and 99, or null" });
        }
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: 0,
          scoutPercentage: 0,
          isTargeted: false,
          hasOffer: false,
          revealedAttributes: [],
          minOverall: 1,
          maxOverall: 999,
          minStar: 1,
          maxStar: 5,
          revealedAbilitiesCount: 0,
          notes: null,
          boardRank: boardRank ?? null,
        });
        return res.json(interest);
      }

      await storage.updateRecruitingInterest(interest.id, { boardRank: boardRank ?? null });
      const updated = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);

      res.json(updated);
    } catch (error) {
      console.error("Failed to update board rank:", error);
      res.status(500).json({ message: "Failed to update board rank" });
    }
  });

  // Sign/commit a recruit to your team
  app.post("/api/leagues/:id/recruiting/:recruitId/sign", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach || !userCoach.teamId) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const userTeam = leagueTeams.find((t) => t.id === userCoach.teamId);
      if (!userTeam) {
        return res.status(400).json({ message: "Team not found" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      if (recruit.signedTeamId) {
        return res.status(400).json({ message: "Recruit already signed to a team" });
      }

      const roster = await storage.getPlayersByTeam(userTeam.id);
      const leagueRecruits = await storage.getRecruitsByLeague(req.params.id as string);
      const currentCommits = leagueRecruits.filter(r => r.signedTeamId === userTeam.id).length;
      const departingCount = roster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
      const portalCount = roster.filter(p => p.inTransferPortal).length;
      const projectedSize = roster.length - departingCount - portalCount + currentCommits + 1;
      if (projectedSize > 30) {
        return res.status(400).json({ message: "Roster would exceed 30-player limit. Release or manage your roster before signing more recruits." });
      }

      // NIL budget enforcement
      const nilCost = recruit.nilCost || 0;
      const nilRemaining = (userTeam.nilBudget || 0) - (userTeam.nilSpent || 0);
      if (nilCost > nilRemaining) {
        return res.status(400).json({
          message: `Insufficient NIL budget. This recruit costs $${nilCost.toLocaleString()} but you only have $${nilRemaining.toLocaleString()} remaining.`,
        });
      }

      // Sign the recruit
      const updatedRecruit = await storage.updateRecruit(recruit.id, {
        signedTeamId: userTeam.id,
        stage: "signed",
      });

      // Deduct NIL cost from team budget
      if (nilCost > 0) {
        await storage.updateTeam(userTeam.id, { nilSpent: (userTeam.nilSpent || 0) + nilCost });
      }

      // Award XP to the coach for signing a recruit
      const SIGN_XP_BASE = 50;
      const starBonus = (recruit.starRank || 1) * 25; // 25 extra per star
      const signXp = SIGN_XP_BASE + starBonus;
      
      const newXp = userCoach.xp + signXp;
      const newLevel = Math.floor(newXp / 1000) + 1;
      const skillPointsGained = newLevel > userCoach.level ? 1 : 0;
      
      await storage.updateCoach(userCoach.id, {
        xp: newXp,
        level: newLevel,
        skillPoints: userCoach.skillPoints + skillPointsGained,
      });

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Recruit Signed",
        details: `Signed ${recruit.firstName} ${recruit.lastName} (${recruit.starRank}-star ${recruit.position})`,
      });

      try {
        const league = await storage.getLeague(req.params.id as string);
        await generateRecruitCommitNewsArticle(
          req.params.id as string,
          `${recruit.firstName} ${recruit.lastName}`,
          recruit.starRank || 3,
          recruit.position,
          recruit.homeState,
          recruit.hometown,
          userTeam,
          recruit.overall,
          recruit.classRank,
          league?.currentSeason || 1,
          league?.currentWeek
        );
        const stars = "★".repeat(recruit.starRank || 1);
        await storage.createLeagueEvent({
          leagueId: req.params.id as string,
          teamId: userTeam.id,
          teamName: userTeam.name,
          teamAbbreviation: userTeam.abbreviation,
          eventType: "SIGNING",
          description: `${userTeam.name} signed ${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${stars} ${recruit.homeState || ""})`,
          season: league?.currentSeason || 1,
          week: league?.currentWeek || 1,
        });
      } catch (e) {
        console.error("Recruit commit news error:", e);
      }

      invalidateLeague(req.params.id as string);
      res.json(updatedRecruit);
    } catch (error) {
      console.error("Failed to sign recruit:", error);
      res.status(500).json({ message: "Failed to sign recruit" });
    }
  });

  // Get all commits (signed recruits) for all teams in a league
  app.get("/api/leagues/:id/commits", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      
      // Group signed recruits by team
      const signedRecruits = recruits.filter(r => r.signedTeamId);
      
      const commitsByTeam = leagueTeams.map(team => {
        const teamCommits = signedRecruits.filter(r => r.signedTeamId === team.id);
        const avgStarRating = teamCommits.length > 0 
          ? teamCommits.reduce((sum, r) => sum + (r.starRating || 3), 0) / teamCommits.length 
          : 0;
        const avgOverall = teamCommits.length > 0
          ? teamCommits.reduce((sum, r) => sum + (r.overall || 300), 0) / teamCommits.length
          : 0;
        const fiveStars = teamCommits.filter(r => r.starRating === 5).length;
        const fourStars = teamCommits.filter(r => r.starRating >= 4).length;
        const classScore = teamCommits.length > 0
          ? (avgStarRating * 20) + (avgOverall / 50) + (fiveStars * 15) + (fourStars * 5) + (teamCommits.length * 3)
          : 0;
        return {
          team: {
            id: team.id,
            name: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
            prestige: team.prestige,
            isCpu: team.isCpu,
          },
          commits: teamCommits.map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            starRating: r.starRating,
            overall: r.overall,
            classRank: r.classRank,
            positionRank: r.positionRank,
            homeState: r.homeState,
            hometown: r.hometown,
            recruitType: r.recruitType,
          })),
          commitCount: teamCommits.length,
          avgStarRating,
          avgOverall,
          fiveStars,
          fourStars,
          classScore,
          classRank: 0,
        };
      }).sort((a, b) => b.classScore - a.classScore);

      let rankCounter = 1;
      commitsByTeam.forEach((t) => {
        if (t.commitCount > 0) {
          t.classRank = rankCounter++;
        }
      });

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason, currentPhase: league.currentPhase },
        commitsByTeam,
        totalCommits: signedRecruits.length,
        totalRecruits: recruits.length,
      });
    } catch (error) {
      console.error("Failed to fetch commits:", error);
      res.status(500).json({ message: "Failed to fetch commits" });
    }
  });

  // Signing-day reveal: full recruit data for signed recruits on a team
  app.get("/api/leagues/:id/signing-day-reveal", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const teamId = req.query.teamId as string | undefined;
      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      const signedRecruits = recruits.filter(r => r.signedTeamId);

      // Resolve the authenticated user's team so the UI can default to it
      let myTeamId: string | null = null;
      if (req.session.userId && !req.session.isGuest) {
        const leagueCoaches = await storage.getCoachesByLeague(league.id);
        const myCoach = leagueCoaches.find(c => c.userId === req.session.userId);
        if (myCoach?.teamId) myTeamId = myCoach.teamId;
      }

      const targetTeams = teamId
        ? leagueTeams.filter(t => t.id === teamId)
        : leagueTeams;

      const teamData = targetTeams.map(team => {
        const teamRecruits = signedRecruits.filter(r => r.signedTeamId === team.id);
        return {
          team: {
            id: team.id,
            name: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
            conference: team.conferenceId,
            prestige: team.prestige,
            isCpu: team.isCpu,
          },
          recruits: teamRecruits.map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            throwHand: r.throwHand,
            batHand: r.batHand,
            homeState: r.homeState,
            hometown: r.hometown,
            starRating: r.starRating,
            overall: r.overall,
            classRank: r.classRank,
            positionRank: r.positionRank,
            recruitType: r.recruitType,
            recruitYear: r.recruitYear,
            isBlueChip: r.isBlueChip,
            isGem: r.isGem,
            isBust: r.isBust,
            isGenerationalGem: r.isGenerationalGem,
            isGenerationalBust: r.isGenerationalBust,
            gemBustRevealed: r.gemBustRevealed,
            potential: r.potential,
            abilities: r.abilities,
            hitForAvg: r.hitForAvg,
            power: r.power,
            speed: r.speed,
            arm: r.arm,
            fielding: r.fielding,
            errorResistance: r.errorResistance,
            clutch: r.clutch,
            stealing: r.stealing,
            running: r.running,
            throwing: r.throwing,
            recovery: r.recovery,
            catcherAbility: r.catcherAbility,
            vsLHP: r.vsLHP,
            grit: r.grit,
            velocity: r.velocity,
            control: r.control,
            stamina: r.stamina,
            stuff: r.stuff,
            wRISP: r.wRISP,
            vsLefty: r.vsLefty,
            poise: r.poise,
            heater: r.heater,
            agile: r.agile,
            skinTone: r.skinTone,
            hairColor: r.hairColor,
            hairStyle: r.hairStyle,
            facialHair: r.facialHair,
            eyeBlack: r.eyeBlack,
            headwear: r.headwear,
            fromTeamName: r.fromTeamName,
          })),
        };
      });

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason },
        teamData,
        myTeamId,
        allTeams: leagueTeams.map(t => ({
          id: t.id,
          name: t.name,
          abbreviation: t.abbreviation,
          primaryColor: t.primaryColor,
          secondaryColor: t.secondaryColor,
          isCpu: t.isCpu,
        })),
      });
    } catch (error) {
      console.error("Failed to fetch signing-day reveal data:", error);
      res.status(500).json({ message: "Failed to fetch reveal data" });
    }
  });

  // Mark signed recruits as revealed after the coach watches the Signing Day Reveal screen.
  // Accepts optional ?teamId= to reveal only one team's class at a time.
  app.post("/api/leagues/:id/signing-day-reveal/complete", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Enforce league membership: caller must be a coach in this league
      const userId = req.session.userId;
      const leagueCoaches = await storage.getCoachesByLeague(league.id);
      const isMember = leagueCoaches.some(c => c.userId === userId);
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this league" });
      }

      const teamId = req.query.teamId as string | undefined;

      // Validate teamId belongs to this league if provided
      if (teamId) {
        const leagueTeams = await storage.getTeamsByLeague(league.id);
        const validTeam = leagueTeams.some(t => t.id === teamId);
        if (!validTeam) {
          return res.status(400).json({ message: "Team not found in this league" });
        }
      }

      const recruits = await storage.getRecruitsByLeague(league.id);
      const toReveal = recruits.filter(r =>
        r.signedTeamId &&
        !r.signingDayRevealed &&
        (!teamId || r.signedTeamId === teamId)
      );

      for (const r of toReveal) {
        await storage.updateRecruit(r.id, { signingDayRevealed: true });
        // Also unlock exact OVR and full abilities in every team's recruiting_interests row
        const interests = await storage.getRecruitingInterestsByRecruit(r.id);
        const totalAbilities = (r.abilities as string[] || []).length;
        for (const interest of interests) {
          await storage.updateRecruitingInterest(interest.id, {
            minOverall: r.overall,
            maxOverall: r.overall,
            revealedAbilitiesCount: totalAbilities,
          });
        }
      }

      console.log(`[signing-day-reveal/complete] Set signingDayRevealed=true for ${toReveal.length} recruits` +
        (teamId ? ` (teamId=${teamId})` : " (all teams)"));

      res.json({ revealed: toReveal.length });
    } catch (error) {
      console.error("Failed to complete signing-day reveal:", error);
      res.status(500).json({ message: "Failed to complete reveal" });
    }
  });

  // Roster routes
  app.get("/api/leagues/:id/roster", requireAuth, async (req, res) => {
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
        team = userCoach ? leagueTeams.find((t) => t.id === userCoach.teamId) : leagueTeams.find((t) => !t.isCpu);
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
  app.get("/api/leagues/:id/pitcher-availability", requireAuth, async (req, res) => {
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
        const userTeam = userCoach ? leagueTeams.find(t => t.id === userCoach.teamId) : leagueTeams.find(t => !t.isCpu);
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
  app.get("/api/leagues/:id/players/:playerId", requireAuth, async (req, res) => {
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
  app.patch("/api/leagues/:id/players/:playerId", requireAuth, async (req, res) => {
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
        if (!(field in req.body)) continue;
        const oldVal = (player as Record<string, unknown>)[field];
        const newVal = req.body[field];
        const oldStr = Array.isArray(oldVal) ? (oldVal as string[]).join(", ") || "none" : String(oldVal ?? "");
        const newStr = Array.isArray(newVal) ? (newVal as string[]).join(", ") || "none" : String(newVal ?? "");
        if (oldStr !== newStr) {
          changeSummary.push(`${label}: ${oldStr} → ${newStr}`);
        }
      }

      const mergedPlayer = { ...player, ...req.body };
      // Recalculate OVR using the new (merged) position — converted players get the
      // correct positional attribute weights applied immediately.
      const recalcedOverall = calculateOVR(mergedPlayer);
      const recalcedStar = getStarRatingFromOVR(recalcedOverall);
      const positionChanged = req.body.position != null && req.body.position !== player.position;
      const shouldSetOriginal = positionChanged && !player.originalPosition;
      const updated = await storage.updatePlayer(req.params.playerId as string, {
        ...req.body,
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
  app.post("/api/leagues/:id/players/:playerId/declare-draft", requireAuth, async (req, res) => {
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
  app.post("/api/leagues/:id/players/:playerId/enter-portal", requireAuth, async (req, res) => {
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
      if (player.eligibility === "Sr") {
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
  app.get("/api/leagues/:id/players-leaving", requireAuth, async (req, res) => {
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

        if (player.eligibility === "Sr") {
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
