import type { IStorage } from "../storage";
import { calculateSignInterestThreshold } from "../route-helpers";
import { resolveRecruitSigningWinner } from "../signing-resolver";

export type RecruitStageStore = Pick<IStorage,
  "getRecruitsByLeague" | "getLeague" | "getRecruitingInterestsByLeague" |
  "getPlayersByLeague" | "getTeamsByLeague" | "getStorylineRecruitsByLeague" |
  "updateRecruitingInterest" | "updateRecruit" | "updateTeam" | "createLeagueEvent">;

// Decisions intentionally use pre-buzz interest, matching the existing rules.
export async function runRecruitStageProgression(leagueId: string, week: number, storage: RecruitStageStore, strictEvents = false) {
  const recruits = await storage.getRecruitsByLeague(leagueId);
  const unsignedRecruits = recruits.filter(r => !r.signedTeamId).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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

  // Running NIL recruiting envelope shared by sequential signing decisions.
  // Gates on the recruiting alloc (65% envelope), falls back to total budget for legacy leagues.
  const nilRecruitingSpentByTeam = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, t.nilRecruitingSpent || 0])
  );
  // Running total for nilSpent (global) so multiple same-team signs don't overwrite from stale snapshot
  const nilSpentByTeam = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, t.nilSpent || 0])
  );
  const teamMap = new Map(allLeagueTeams.map(t => [t.id, t]));
  // Track commits made earlier in this pass for roster projections
  const teamCommitsMap = new Map<string, number>(
    allLeagueTeams.map(t => [t.id, recruits.filter(r => r.signedTeamId === t.id).length])
  );

  // Stable ID order prevents same-team balance writes racing each other. This
  // is an integrity ordering policy, not a newly balanced signing priority.
  for (const recruit of unsignedRecruits) {
    const allInterests = interestsByRecruit.get(recruit.id) ?? [];
    if (allInterests.length === 0) continue;
    
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
            if (strictEvents) throw e;
            console.error("[decommit] Failed to create decommit event:", e);
          }
        }
      }
    }
  }
}
