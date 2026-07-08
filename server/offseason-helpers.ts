/**
 * Offseason helper functions shared between departures routes and the
 * season-progression logic in routes.ts.
 *
 * Exported:
 *   evaluatePlayerPromises    — marks promise outcomes at season end
 *   processOffseasonDepartures — handles grad/transfer/draft departures
 */

import { storage } from "./storage";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import { rollWeightedPotential } from "@shared/potential";
import { assignTrajectory } from "@shared/trajectory";
import { computeLegacyScore } from "./game-engine";
import { generateDraftDeclarationNewsArticle, generateTransferPortalNewsArticle } from "./news-engine";

export async function evaluatePlayerPromises(leagueId: string, completedSeason: number) {
  const activePromises = await storage.getActivePromisesByLeague(leagueId);
  const promisesForSeason = activePromises.filter(p => p.season === completedSeason);
  
  if (promisesForSeason.length === 0) return { evaluated: 0, met: 0, broken: 0 };

  const teams = await storage.getTeamsByLeague(leagueId);
  const teamStandings: Record<string, any> = {};
  for (const team of teams) {
    const standings = await storage.getStandingsByLeague(leagueId, completedSeason);
    const teamStanding = standings.find(s => s.teamId === team.id);
    teamStandings[team.id] = teamStanding || { wins: 0, losses: 0 };
  }

  let met = 0;
  let broken = 0;

  for (const promise of promisesForSeason) {
    const player = await storage.getPlayer(promise.playerId);
    if (!player) {
      await storage.updatePlayerPromise(promise.id, { isActive: false, isMet: false, evaluatedSeason: completedSeason });
      broken++;
      continue;
    }

    let isMet = false;
    const target = promise.targetValue;

    if (promise.promiseType === "leadershipRole") {
      // Met if the player is currently designated as a captain in the completed season
      isMet = !!(player.captainRole && player.captainSeason === completedSeason);
    } else if (promise.promiseCategory === "player") {
      // Player promises are based on simulated stats - since we don't track per-game stats yet,
      // we evaluate based on player overall and promise difficulty
      const difficulty = target; // "easy", "medium", "hard"
      const overallFactor = Math.min(1.0, (player.overall || 300) / 650);
      
      if (difficulty === "easy") {
        isMet = Math.random() < 0.7 + overallFactor * 0.2;
      } else if (difficulty === "medium") {
        isMet = Math.random() < 0.4 + overallFactor * 0.3;
      } else {
        isMet = Math.random() < 0.15 + overallFactor * 0.3;
      }
    } else if (promise.promiseCategory === "team") {
      const standing = teamStandings[promise.teamId];
      const totalGames = (standing?.wins || 0) + (standing?.losses || 0);
      const winPct = totalGames > 0 ? (standing?.wins || 0) / totalGames : 0;

      if (promise.promiseType === "winPercentage") {
        const targetPct = parseFloat(target) || 0.5;
        isMet = winPct >= targetPct;
      } else if (promise.promiseType === "conferenceChampionship") {
        isMet = Math.random() < winPct * 0.5; // approximate based on record
      } else if (promise.promiseType === "cwsChampionship") {
        isMet = Math.random() < winPct * 0.15; // very hard to achieve
      } else {
        const difficulty = target;
        if (difficulty === "easy") isMet = winPct >= 0.45;
        else if (difficulty === "medium") isMet = winPct >= 0.55;
        else isMet = winPct >= 0.65;
      }
    }

    await storage.updatePlayerPromise(promise.id, {
      isActive: false,
      isMet,
      evaluatedSeason: completedSeason,
    });

    if (isMet) {
      met++;
    } else {
      broken++;
      // Auto-flag player for departure next offseason
      if (player) {
        await storage.updatePlayer(player.id, {
          inTransferPortal: true,
          portalReason: `Broken promise: ${promise.promiseType}`,
        });
      }
    }
  }

  return { evaluated: promisesForSeason.length, met, broken };
}

// ============ SHARED FINALIZE DEPARTURES HELPER ============
export async function finalizeDeparturesInternal(leagueId: string, league: any) {
  await processOffseasonDepartures(leagueId, league.currentSeason);

  const teams = await storage.getTeamsByLeague(leagueId);
  let totalGraduated = 0;
  let totalDrafted = 0;
  let totalTransferred = 0;

  const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };

  // Pre-load all players for the entire league at once to avoid N+1 per team
  const allLeaguePlayers = await storage.getPlayersByLeague(leagueId);
  const rosterByTeam = new Map<string, typeof allLeaguePlayers>();
  for (const p of allLeaguePlayers) {
    if (!rosterByTeam.has(p.teamId)) rosterByTeam.set(p.teamId, []);
    rosterByTeam.get(p.teamId)!.push(p);
  }

  const historyRecords: any[] = [];
  const playerIdsToDelete: string[] = [];
  const transferUpdates: Array<{ id: string }> = [];
  const retainedUpdates: Array<{ id: string }> = [];

  for (const team of teams) {
    const roster = rosterByTeam.get(team.id) ?? [];
    const pending = roster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained");

    for (const player of pending) {
      if (player.departureType === "graduated" || player.departureType === "draft") {
        historyRecords.push({
          leagueId,
          teamId: team.id,
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          finalEligibility: player.eligibility,
          overall: player.overall ?? 300,
          starRating: player.starRating ?? 3,
          signingOvr: player.signingOvr ?? player.overall ?? 300,
          ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
          departureType: player.departureType,
          draftRound: player.draftRound || null,
          departedSeason: league.currentSeason,
          seasonsPlayed: eligMap[player.eligibility] || 1,
          abilities: player.abilities || [],
          homeState: player.homeState || "",
          hometown: player.hometown || "",
          sourcePlayerId: player.id,
        });
        playerIdsToDelete.push(player.id);
        if (player.departureType === "graduated") totalGraduated++;
        else totalDrafted++;
      } else if (player.departureType === "transfer") {
        historyRecords.push({
          leagueId,
          teamId: team.id,
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          finalEligibility: player.eligibility,
          overall: player.overall ?? 300,
          starRating: player.starRating ?? 3,
          signingOvr: player.signingOvr ?? player.overall ?? 300,
          ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
          departureType: "transfer_portal",
          departedSeason: league.currentSeason,
          seasonsPlayed: eligMap[player.eligibility] || 1,
          abilities: player.abilities || [],
          homeState: player.homeState || "",
          hometown: player.hometown || "",
          sourcePlayerId: player.id,
        });
        transferUpdates.push({ id: player.id });
        totalTransferred++;
      }
    }

    const retained = roster.filter(p => p.pendingDeparture && p.retentionStatus === "retained");
    for (const player of retained) {
      retainedUpdates.push({ id: player.id });
    }
  }

  // Batch-insert all history records, batch-delete all departing players, and
  // run transfer/retained player updates in parallel
  await Promise.all([
    storage.batchCreatePlayerHistories(historyRecords),
    storage.batchDeletePlayers(playerIdsToDelete),
    Promise.all(transferUpdates.map(u => storage.updatePlayer(u.id, {
      pendingDeparture: false,
      retentionStatus: null,
      inTransferPortal: true,
    }))),
    Promise.all(retainedUpdates.map(u => storage.updatePlayer(u.id, {
      pendingDeparture: false,
      departureType: null,
      draftRound: null,
    }))),
  ]);

  // Safety sweep: clear any pendingDeparture:true flags that weren't handled above
  // (edge cases: partial failures, promise-broken players, etc.). This guarantees the
  // next season always starts with a clean slate and the idempotency guard won't fire early.
  const stragglers = await storage.getPendingDeparturesByLeague(leagueId);
  if (stragglers.length > 0) {
    console.log(`[departures] finalize safety sweep: clearing ${stragglers.length} remaining stale pendingDeparture flags`);
    await Promise.all(stragglers.map(p =>
      storage.updatePlayer(p.id, { pendingDeparture: false, departureType: null })
    ));
  }

  // Add transfer portal players to the existing recruiting pool as TRANSFER recruits
  const existingRecruits = await storage.getRecruitsByLeague(leagueId);
  const existingSourceIds = new Set(existingRecruits.filter(r => r.sourcePlayerId).map(r => r.sourcePlayerId));

  // Re-use the already-loaded league players; refresh portal status after updates above
  const allTeamsForTransfers = teams;
  const allPlayersAfterUpdate = await storage.getPlayersByLeague(leagueId);
  const portalByTeam = new Map<string, typeof allPlayersAfterUpdate>();
  for (const p of allPlayersAfterUpdate) {
    if (!portalByTeam.has(p.teamId)) portalByTeam.set(p.teamId, []);
    portalByTeam.get(p.teamId)!.push(p);
  }

  const transfersToAdd: Array<{ player: any; teamName: string }> = [];
  
  for (const team of allTeamsForTransfers) {
    const portalPlayers = (portalByTeam.get(team.id) ?? []).filter(p => p.inTransferPortal);
    for (const player of portalPlayers) {
      if (!existingSourceIds.has(player.id)) {
        transfersToAdd.push({ player, teamName: team.name });
      }
    }
  }
  
  // Collect all OVRs for ranking after batch creation
  const allOvrs = existingRecruits.map(r => r.overall || 0);
  for (const { player } of transfersToAdd) {
    allOvrs.push(player.overall || 300);
  }
  allOvrs.sort((a, b) => b - a);
  
  let transferRecruitsCreated = 0;
  for (const { player, teamName } of transfersToAdd) {
    try {
      const ovr = calculateOVR(player);
      const starRating = getStarRatingFromOVR(ovr);
      
      const higherOrEqual = allOvrs.filter(o => o >= ovr);
      const classRank = Math.max(1, higherOrEqual.indexOf(ovr) + 1 || higherOrEqual.length);
      // positionRank is display-based (fog-of-war): rank among same-position recruits
      // by displayed starRating descending.  OVR is not used here so gems/busts
      // appear at the rank coaches would expect from their star badges.
      const posRecruits = existingRecruits.filter(r => r.position === player.position);
      const posRank = posRecruits.filter(r => (r.starRating || 0) > starRating).length + 1;
      
      const validEligibilities = ["FR", "SO", "JR", "SR", "RS"];
      const recruitYear = validEligibilities.includes(player.eligibility) ? player.eligibility : "SO";
      const playerAbilities = Array.isArray(player.abilities) ? player.abilities : [];
      
      await storage.createRecruit({
          leagueId,
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          throwHand: player.throwHand || "R",
          batHand: player.batHand || "R",
          homeState: player.homeState || "TX",
          hometown: player.hometown || "Unknown",
          starRank: starRating,
          classRank,
          positionRank: posRank,
          recruitType: "TRANSFER",
          recruitYear,
          overall: ovr,
          starRating,
          hitForAvg: player.hitForAvg ?? 50,
          power: player.power ?? 50,
          speed: player.speed ?? 50,
          arm: player.arm ?? 50,
          fielding: player.fielding ?? 50,
          errorResistance: player.errorResistance ?? 50,
          clutch: player.clutch ?? 50,
          vsLHP: player.vsLHP ?? 50,
          grit: player.grit ?? 50,
          stealing: player.stealing ?? 50,
          running: player.running ?? 50,
          throwing: player.throwing ?? 50,
          recovery: player.recovery ?? 50,
          catcherAbility: player.catcherAbility ?? 50,
          velocity: player.velocity ?? 50,
          control: player.control ?? 50,
          stamina: player.stamina ?? 50,
          stuff: player.stuff ?? 50,
          wRISP: player.wRISP ?? 50,
          vsLefty: player.vsLefty ?? 50,
          poise: player.poise ?? 50,
          heater: player.heater ?? 50,
          agile: player.agile ?? 50,
          pitchFB: player.pitchFB ?? 1,
          pitch2S: player.pitch2S ?? 0,
          pitchSL: player.pitchSL ?? 0,
          pitchCB: player.pitchCB ?? 0,
          pitchCH: player.pitchCH ?? 0,
          pitchCT: player.pitchCT ?? 0,
          pitchSNK: player.pitchSNK ?? 0,
          pitchVSL: player.pitchVSL ?? 0,
          pitchSPL: (player as any).pitchSPL ?? 0,
          pitchFK:  (player as any).pitchFK  ?? 0,
          pitchSFF: (player as any).pitchSFF ?? 0,
          pitchSHU: (player as any).pitchSHU ?? 0,
          pitchCCH: (player as any).pitchCCH ?? 0,
          pitchHSL: (player as any).pitchHSL ?? 0,
          pitchSWP: (player as any).pitchSWP ?? 0,
          pitchKN:  (player as any).pitchKN  ?? 0,
          pitchSCB: (player as any).pitchSCB ?? 0,
          pitchPCB: (player as any).pitchPCB ?? 0,
          abilities: playerAbilities,
          potential: player.potential ?? rollWeightedPotential(),
          nilCost: (function() {
            const ovr = calculateOVR(player);
            const sr = getStarRatingFromOVR(ovr);
            const ranges: [number, number][] = [[5000,25000],[25000,75000],[75000,200000],[200000,500000],[500000,1000000]];
            const [mn, mx] = ranges[Math.min(4, Math.max(0, sr - 1))];
            return Math.floor(mn + Math.random() * (mx - mn));
          })(),
          sourcePlayerId: player.id,
          fromTeamName: teamName,
          trajectory: (player as any).trajectory ?? (["P","SP","RP","CP"].includes(player.position) ? 2 : assignTrajectory(player.power ?? 50, player.speed ?? 50, player.hitForAvg ?? 50)),
          commitmentThreshold: 450,
          proximityPriority: "Somewhat",
          reputationPriority: "Very Important",
          playingTimePriority: "Extremely Important",
          academicsPriority: "Not Important",
          prestigePriority: "Extremely Important",
          facilitiesPriority: "Somewhat",
          originPrestige: allTeamsForTransfers.find(t => t.name === teamName)?.prestige ?? null,
          skinTone: player.skinTone || "light",
          hairColor: player.hairColor || "brown",
          hairStyle: player.hairStyle || "short",
          headwear: player.headwear || "cap",
        });
      transferRecruitsCreated++;
    } catch (e) {
      console.error(`Failed to create TRANSFER recruit for ${player.firstName} ${player.lastName} (player ${player.id}) from ${teamName}:`, e);
    }
  }
  console.log(`Transfer portal: ${transfersToAdd.length} portal players found, ${transferRecruitsCreated} TRANSFER recruits created`);
  
  // Regenerate top schools interest to include transfer recruits
  await generateTopSchoolsForLeague(leagueId);

  const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_recruiting_1" });

  return { updatedLeague, graduated: totalGraduated, drafted: totalDrafted, transferred: totalTransferred };
}

// ============ OFFSEASON DEPARTURES ============
function generateDraftAsk(overall: number): { min: number; max: number } {
  const baseMin = Math.floor((overall - 300) * 2000 + 50000);
  const baseMax = Math.floor(baseMin * (1.5 + Math.random() * 0.5));
  const variance = Math.floor(Math.random() * 20000);
  return { 
    min: Math.max(25000, baseMin + variance), 
    max: Math.max(50000, baseMax + variance) 
  };
}

const transferReasons = [
  "Wants more playing time",
  "Looking for a fresh start",
  "Unhappy with team direction",
  "Seeking better facilities",
  "Wants to be closer to home",
  "Dissatisfied with role on team",
  "Looking for more competitive program",
  "Academic opportunities elsewhere",
];


export async function processOffseasonDepartures(leagueId: string, completedSeason: number) {
  const teams = await storage.getTeamsByLeague(leagueId);
  let totalGraduated = 0;
  let totalDraftDeclared = 0;
  let totalTransferPortal = 0;

  const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
  if (existingPending.length > 0) {
    const grads = existingPending.filter(p => p.departureType === "graduated");
    const drafts = existingPending.filter(p => p.departureType === "draft");
    const transfers = existingPending.filter(p => p.departureType === "transfer");
    if (grads.length > 0 || drafts.length > 0) {
      // Valid previous run — graduates/draft entries are present; return cached result.
      console.log(`[departures] idempotency: found ${grads.length} grads, ${drafts.length} drafts, ${transfers.length} transfers — returning cached result`);
      return { graduated: grads.length, draftDeclared: drafts.length, transferPortal: transfers.length };
    }
    // Stale flags exist but no grads or drafts — these are leftover flags from a
    // prior season (e.g. un-cleared transfer portal or promise-broken players).
    // Clear them so the full departure run can proceed cleanly for this season.
    console.log(`[departures] idempotency: found ${existingPending.length} stale pendingDeparture flags with no grads/drafts — clearing before re-run`);
    await Promise.all(existingPending.map(p =>
      storage.updatePlayer(p.id, { pendingDeparture: false, departureType: null })
    ));
  }
  
  // Phase 1: Collect all seniors and potential departures across ALL teams
  const allSeniors: Array<{ player: any; team: any }> = [];
  const allRosterPlayers: Array<{ player: any; team: any }> = [];
  
  for (const team of teams) {
    const roster = await storage.getPlayersByTeam(team.id);
    for (const player of roster) {
      allRosterPlayers.push({ player, team });
      if ((player.eligibility as string) === "SR") {
        allSeniors.push({ player, team });
      }
    }
  }
  
  // Phase 2: MLB Draft Projection - top players get drafted instead of just graduating
  // Collect all departing players (seniors + previously declared juniors/RS)
  const allDepartingPlayers: Array<{ player: any; team: any; isJunior: boolean }> = [];
  
  for (const { player, team } of allSeniors) {
    allDepartingPlayers.push({ player, team, isJunior: false });
  }
  
  // Also include juniors/RS/SOs with high enough OVR for draft consideration
  // Threshold raised to 500: only genuinely elite underclassmen declare early
  const juniorDraftCandidates = allRosterPlayers.filter(({ player }) => 
    (player.eligibility === "JR" || player.eligibility === "RS" || player.eligibility === "SO") && 
    !player.declaredForDraft &&
    (player.overall || 0) >= 500
  );
  for (const { player, team } of juniorDraftCandidates) {
    allDepartingPlayers.push({ player, team, isJunior: true });
  }
  
  // Previously declared draft players
  const previouslyDeclared = allRosterPlayers.filter(({ player }) => 
    player.declaredForDraft && player.eligibility !== "SR"
  );
  for (const { player, team } of previouslyDeclared) {
    if (!allDepartingPlayers.find(d => d.player.id === player.id)) {
      allDepartingPlayers.push({ player, team, isJunior: true });
    }
  }
  
  // Sort all departing players by OVR descending to project draft rounds
  const sortedByOvr = [...allDepartingPlayers].sort((a, b) => (b.player.overall || 0) - (a.player.overall || 0));
  
  // Project 3 rounds of MLB Draft (about 90 picks for 30 teams, but we scale to league size)
  // Each round has ~(number of teams * 2-3) picks, so roughly top 10% of all departures
  const totalDepartures = allSeniors.length + previouslyDeclared.length;
  const draftPicks = Math.max(6, Math.ceil(totalDepartures * 0.10)); // At least 6 picks
  const round1Picks = Math.ceil(draftPicks / 3);
  const round2Picks = Math.ceil(draftPicks / 3);
  const round3Picks = draftPicks - round1Picks - round2Picks;
  
  // Map each top player to a draft round
  const draftProjections = new Map<string, number>();
  for (let i = 0; i < Math.min(sortedByOvr.length, draftPicks); i++) {
    const round = i < round1Picks ? 1 : i < round1Picks + round2Picks ? 2 : 3;
    draftProjections.set(sortedByOvr[i].player.id, round);
  }

  // Track draftPicks for each team's coach
  try {
    const teamDraftCounts = new Map<string, number>();
    for (let i = 0; i < Math.min(sortedByOvr.length, draftPicks); i++) {
      const tId = sortedByOvr[i].team.id;
      teamDraftCounts.set(tId, (teamDraftCounts.get(tId) || 0) + 1);
    }
    const leagueCoaches = await storage.getCoachesByLeague(leagueId);
    for (const [tId, count] of Array.from(teamDraftCounts.entries())) {
      const dpCoach = leagueCoaches.find(c => c.teamId === tId);
      if (dpCoach) {
        const newDraftPicks = dpCoach.draftPicks + count;
        await storage.updateCoach(dpCoach.id, { draftPicks: newDraftPicks, legacyScore: computeLegacyScore({ ...dpCoach, draftPicks: newDraftPicks }) });
      }
    }
  } catch (e) { console.error("Draft picks coach stats error:", e); }

  // Phase 3: Process each team's departures
  for (const team of teams) {
    const roster = await storage.getPlayersByTeam(team.id);
    
    // Seniors: check if they're projected to be drafted
    const seniors = roster.filter(p => (p.eligibility as string) === "SR");
    for (const senior of seniors) {
      const projectedRound = draftProjections.get(senior.id);
      if (projectedRound) {
        // Senior is projected to be drafted
        await storage.updatePlayer(senior.id, {
          pendingDeparture: true,
          departureType: "draft",
          retentionStatus: "none", // Seniors can't be retained from draft
          draftRound: projectedRound,
        });
        totalDraftDeclared++;
      } else {
        // Regular graduation
        await storage.updatePlayer(senior.id, {
          pendingDeparture: true,
          departureType: "graduated",
          retentionStatus: "none",
        });
        totalGraduated++;
      }
    }
    
    // Juniors/RS/SOs projected in first 3 rounds auto-declare for draft
    const juniorsOnTeam = roster.filter(p => 
      (p.eligibility === "JR" || p.eligibility === "RS" || p.eligibility === "SO") &&
      !p.declaredForDraft
    );
    for (const player of juniorsOnTeam) {
      const projectedRound = draftProjections.get(player.id);
      if (projectedRound) {
        const ask = generateDraftAsk(player.overall);
        // Retention multiplier is eligibility-based: SOs are easier to retain (2 years left),
        // JRs/RS are harder (1 year left or already grad-eligible).
        const isSophomore = player.eligibility === "SO";
        const draftMultiplier = isSophomore
          ? (projectedRound === 1 ? 1.5 : projectedRound === 2 ? 1.2 : 1.0)
          : (projectedRound === 1 ? 2.0 : projectedRound === 2 ? 1.5 : 1.2);
        await storage.updatePlayer(player.id, {
          pendingDeparture: true,
          departureType: "draft",
          retentionStatus: "pending",
          draftAskMin: Math.floor(ask.min * draftMultiplier),
          draftAskMax: Math.floor(ask.max * draftMultiplier),
          draftRound: projectedRound,
          declaredForDraft: true,
        });
        totalDraftDeclared++;
        try {
          await generateDraftDeclarationNewsArticle(
            leagueId, `${player.firstName} ${player.lastName}`,
            player.position, team, player.overall, player.starRating || 3, completedSeason
          );
        } catch (e) { console.error("Draft news error:", e); }
      }
    }
    
    // Previously declared draft players (carried over from before)
    const prevDeclared = roster.filter(p => p.declaredForDraft && p.eligibility !== "SR" && !juniorsOnTeam.find(j => j.id === p.id && draftProjections.has(j.id)));
    for (const player of prevDeclared) {
      if (player.pendingDeparture) continue; // Already processed
      const projectedRound = draftProjections.get(player.id);
      const ask = generateDraftAsk(player.overall);
      await storage.updatePlayer(player.id, {
        pendingDeparture: true,
        departureType: "draft",
        retentionStatus: "pending",
        draftAskMin: player.draftAskMin || ask.min,
        draftAskMax: player.draftAskMax || ask.max,
        draftRound: projectedRound || null,
      });
      totalDraftDeclared++;
    }
    
    // Transfer portal - lower-rated players
    // Academics retention: high-academics programs lose fewer players to portal.
    // A great degree is part of the value — players stay even through adversity.
    const academicsRetentionFactor = team.academics >= 9 ? 0.60 : team.academics >= 8 ? 0.75 : team.academics >= 7 ? 0.85 : 1.0;
    const nonDeparting = roster.filter(p => 
      p.eligibility !== "SR" && 
      !p.declaredForDraft &&
      !p.inTransferPortal &&
      !p.pendingDeparture &&
      !draftProjections.has(p.id) &&
      (p.overall || 300) < 350 &&
      !p.captainRole // captains are protected from random portal entry
    );
    const portalCount = Math.max(0, Math.floor(nonDeparting.length * (0.1 + Math.random() * 0.1) * academicsRetentionFactor));
    const shuffled = nonDeparting.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(portalCount, shuffled.length); i++) {
      const reason = transferReasons[Math.floor(Math.random() * transferReasons.length)];
      await storage.updatePlayer(shuffled[i].id, { 
        pendingDeparture: true,
        departureType: "transfer",
        retentionStatus: (shuffled[i].eligibility === "JR" || shuffled[i].eligibility === "SO") ? "pending" : "none",
        inTransferPortal: true,
        transferReason: reason,
      });
      totalTransferPortal++;
      try {
        await generateTransferPortalNewsArticle(
          leagueId, `${shuffled[i].firstName} ${shuffled[i].lastName}`,
          shuffled[i].position, team, shuffled[i].starRating || 3, completedSeason
        );
      } catch (e) { console.error("Transfer portal news error:", e); }
    }
    
    const existingPortal = roster.filter(p => p.inTransferPortal && !p.pendingDeparture && !shuffled.slice(0, portalCount).find(s => s.id === p.id));
    for (const player of existingPortal) {
      await storage.updatePlayer(player.id, {
        pendingDeparture: true,
        departureType: "transfer",
        retentionStatus: (player.eligibility === "JR" || player.eligibility === "SO") ? "pending" : "none",
        transferReason: player.transferReason || transferReasons[Math.floor(Math.random() * transferReasons.length)],
      });
      totalTransferPortal++;
    }

    // Positional competition pass: SO/JR players buried behind a higher-rated teammate
    // at their same position have an elevated (35%) chance of entering the portal,
    // regardless of their own OVR. They remain retainable (status: "pending").
    const alreadySelectedIds = new Set([
      ...shuffled.slice(0, portalCount).map((p: any) => p.id),
      ...existingPortal.map((p: any) => p.id),
    ]);
    const competitionCandidates = roster.filter(p =>
      (p.eligibility === "SO" || p.eligibility === "JR") &&
      !p.declaredForDraft &&
      !p.inTransferPortal &&
      !p.pendingDeparture &&
      !draftProjections.has(p.id) &&
      !alreadySelectedIds.has(p.id)
    );
    for (const player of competitionCandidates) {
      const hasHigherRatedTeammate = roster.some(tm =>
        tm.id !== player.id &&
        !tm.pendingDeparture &&
        !tm.declaredForDraft &&
        tm.position === player.position &&
        (tm.overall || 0) > (player.overall || 0)
      );
      // Captains have ~40% lower competition-based portal chance (35% → ~21%)
      const competitionThreshold = player.captainRole ? 0.21 : 0.35;
      if (hasHigherRatedTeammate && Math.random() < competitionThreshold) {
        await storage.updatePlayer(player.id, {
          pendingDeparture: true,
          departureType: "transfer",
          retentionStatus: "pending",
          inTransferPortal: true,
          transferReason: "Wants more playing time",
        });
        totalTransferPortal++;
        try {
          await generateTransferPortalNewsArticle(
            leagueId, `${player.firstName} ${player.lastName}`,
            player.position, team, player.starRating || 3, completedSeason
          );
        } catch (e) { console.error("Transfer portal news error:", e); }
      }
    }
  }
  
  return { graduated: totalGraduated, draftDeclared: totalDraftDeclared, transferPortal: totalTransferPortal };
}

// ============ CPU TRANSFER PORTAL RECRUITING ============


export async function generateTopSchoolsForLeague(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const recruits = await storage.getRecruitsByLeague(leagueId);
  
  if (teams.length === 0 || recruits.length === 0) return;
  
  // Sort recruits by overall rating (descending) so top recruits get processed first
  const sortedRecruits = [...recruits].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  
  // Calculate fair share and max cap for distribution
  const fairShare = Math.max(1, Math.ceil(recruits.length / teams.length));
  const maxCap = fairShare + Math.ceil(fairShare * 0.5); // Allow 50% overflow max
  
  // Track #1 assignments per team
  const teamTopInterestCount: Map<string, number> = new Map();
  teams.forEach(t => teamTopInterestCount.set(t.id, 0));
  
  // Priority weight mapping
  const priorityWeight = (priority: string | null): number => {
    switch (priority) {
      case "Extremely": return 4;
      case "Very": return 3;
      case "Somewhat": return 2;
      case "Not Important": return 1;
      default: return 2;
    }
  };
  
  // Score calculator for a recruit-team pair
  const calculateScore = (recruit: typeof recruits[0], team: typeof teams[0]): number => {
    let score = 0;
    const starRank = recruit.starRank || 3;
    const teamPrestige = team.prestige || 5;
    
    // Prestige affinity: high-star recruits strongly prefer high-prestige schools,
    // low-star recruits prefer lower-prestige schools (more playing time, better fit)
    const prestigeAffinity = (() => {
      if (starRank >= 5) {
        return teamPrestige >= 7 ? 40 : teamPrestige >= 5 ? 15 : 0;
      } else if (starRank === 4) {
        return teamPrestige >= 6 ? 30 : teamPrestige >= 4 ? 20 : 5;
      } else if (starRank === 3) {
        return Math.abs(teamPrestige - 5) <= 2 ? 25 : 10;
      } else if (starRank === 2) {
        return teamPrestige <= 5 ? 30 : teamPrestige <= 7 ? 15 : 0;
      } else {
        return teamPrestige <= 4 ? 35 : teamPrestige <= 6 ? 15 : 0;
      }
    })();
    score += prestigeAffinity;
    
    // Proximity: Higher scores for teams in same state
    const proximityWeight = priorityWeight(recruit.proximityPriority);
    if (recruit.homeState === team.state) {
      score += 30 * proximityWeight;
    } else {
      score += 10 * proximityWeight;
    }
    
    // Academics
    const academicsWeight = priorityWeight(recruit.academicsPriority);
    score += (team.academics || 5) * 3 * academicsWeight;
    
    // Prestige (priority-weighted on top of affinity)
    const prestigeWeight = priorityWeight(recruit.prestigePriority);
    score += teamPrestige * 3 * prestigeWeight;
    
    // Prestige dream school seeding: 8-9 prestige programs get a probability bump to appear
    // on more recruits' Top Schools lists — they're already in the conversation
    if (teamPrestige >= 9) score += 12;
    else if (teamPrestige >= 8) score += 7;
    
    // Facilities
    const facilitiesWeight = priorityWeight(recruit.facilitiesPriority);
    score += (team.facilities || 5) * 3 * facilitiesWeight;
    
    // Reputation
    const reputationWeight = priorityWeight(recruit.reputationPriority);
    score += (teamPrestige + (team.facilities || 5)) * 1.5 * reputationWeight;
    
    // College Life: recruits who care about campus social experience favor high-CL programs
    const collegeLifeWeight = priorityWeight((recruit as any).collegeLifePriority || "Somewhat");
    score += (team.collegeLife || 5) * 3 * collegeLifeWeight;

    // Stadium: transfer portal recruits weight stadium more highly — they've played D1,
    // they know what a great venue means for exposure and experience
    const isTransfer = (recruit as any).recruitType === "TRANSFER";
    const teamStadium = team.stadium || 5;
    if (isTransfer) {
      score += teamStadium * 4; // raw stadium bonus for transfer recruits
    } else {
      // Non-transfers: stadium contributes via reputation weight
      score += teamStadium * 0.5 * reputationWeight;
    }
    
    // Playing time - low-star recruits value this more
    const playingTimeWeight = priorityWeight(recruit.playingTimePriority);
    const ptBonus = starRank <= 2 ? 1.5 : 1.0;
    score += (10 - teamPrestige) * 2 * playingTimeWeight * ptBonus;
    
    // Add randomness for variety
    score += Math.floor(Math.random() * 25);
    
    return score;
  };
  
  // Store all recruit top schools data for post-generation rebalancing
  const recruitTopSchoolsData: Map<string, { teamId: string; score: number; rank: number }[]> = new Map();
  
  for (const recruit of sortedRecruits) {
    // Score each team
    const teamScores = teams.map(team => ({
      team,
      score: calculateScore(recruit, team)
    }));
    
    // Sort by score for top schools list
    const sortedTeams = [...teamScores].sort((a, b) => b.score - a.score);
    const numTopSchools = 5 + Math.floor(Math.random() * 4);
    let topSchools = sortedTeams.slice(0, Math.min(numTopSchools, teams.length));
    
    // BALANCED #1 SELECTION with progressive enforcement
    if (topSchools.length > 1) {
      const topScore = topSchools[0].score;
      
      // Find best candidate that's within 15% of top score AND under fair share
      let bestSwapIdx = -1;
      let bestSwapScore = 0;
      
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidateTeam = topSchools[i].team;
        const candidateCount = teamTopInterestCount.get(candidateTeam.id) || 0;
        const scorePct = topSchools[i].score / topScore;
        
        // Check if current #1 is at or over max cap - must swap
        const top1Count = teamTopInterestCount.get(topSchools[0].team.id) || 0;
        const mustSwap = top1Count >= maxCap;
        
        // Swap if candidate is under fair share and within threshold
        // Or must swap if #1 is at max cap
        if (candidateCount < fairShare && (scorePct >= 0.85 || mustSwap)) {
          if (topSchools[i].score > bestSwapScore) {
            bestSwapIdx = i;
            bestSwapScore = topSchools[i].score;
          }
        }
      }
      
      // Perform swap if found
      if (bestSwapIdx > 0) {
        const temp = topSchools[0];
        topSchools[0] = topSchools[bestSwapIdx];
        topSchools[bestSwapIdx] = temp;
      }
    }
    
    // Track #1 assignment
    if (topSchools.length > 0) {
      const topTeamId = topSchools[0].team.id;
      teamTopInterestCount.set(topTeamId, (teamTopInterestCount.get(topTeamId) || 0) + 1);
    }
    
    // Store data for database creation
    recruitTopSchoolsData.set(recruit.id, topSchools.map((ts, idx) => ({
      teamId: ts.team.id,
      score: ts.score,
      rank: idx + 1
    })));
  }
  
  // POST-GENERATION REBALANCING PASS
  // Find teams that are over-represented and under-represented
  const overRepTeams = Array.from(teamTopInterestCount.entries())
    .filter(([_, count]) => count > maxCap)
    .map(([id]) => id);
  const underRepTeams = Array.from(teamTopInterestCount.entries())
    .filter(([_, count]) => count < Math.max(1, fairShare - 2))
    .map(([id]) => id);
  
  // If significant imbalance, perform targeted swaps with score proximity check
  if (overRepTeams.length > 0 && underRepTeams.length > 0) {
    for (const recruitId of Array.from(recruitTopSchoolsData.keys())) {
      const topSchools = recruitTopSchoolsData.get(recruitId)!;
      if (topSchools.length < 2) continue;
      
      // Sort by current rank to get #1
      topSchools.sort((a, b) => a.rank - b.rank);
      const current1 = topSchools[0];
      if (!overRepTeams.includes(current1.teamId)) continue;
      
      // Find a swap candidate from under-represented teams WITH SCORE PROXIMITY CHECK
      const top1Score = current1.score;
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidate = topSchools[i];
        // Only swap if candidate score is within 15% of #1 score (preserves priority matching)
        const scorePct = candidate.score / top1Score;
        if (scorePct < 0.85) continue; // Skip if too far below in score
        
        if (underRepTeams.includes(candidate.teamId)) {
          // Swap ranks
          const oldRank1TeamId = current1.teamId;
          topSchools[i].rank = 1;
          topSchools[0].rank = i + 1;
          
          // Update counts
          teamTopInterestCount.set(oldRank1TeamId, (teamTopInterestCount.get(oldRank1TeamId) || 1) - 1);
          teamTopInterestCount.set(candidate.teamId, (teamTopInterestCount.get(candidate.teamId) || 0) + 1);
          
          // Re-sort by rank
          topSchools.sort((a, b) => a.rank - b.rank);
          
          // Update over/under lists
          const newOverCount = teamTopInterestCount.get(oldRank1TeamId) || 0;
          if (newOverCount <= maxCap) {
            const idx = overRepTeams.indexOf(oldRank1TeamId);
            if (idx >= 0) overRepTeams.splice(idx, 1);
          }
          const newUnderCount = teamTopInterestCount.get(candidate.teamId) || 0;
          if (newUnderCount >= Math.max(1, fairShare - 2)) {
            const idx = underRepTeams.indexOf(candidate.teamId);
            if (idx >= 0) underRepTeams.splice(idx, 1);
          }
          break;
        }
      }
    }
  }
  
  // Collect all top-school rows, then batch-insert in one shot
  const allTopSchoolRows: import("@shared/schema").InsertRecruitTopSchools[] = [];
  for (const [recruitId, topSchools] of Array.from(recruitTopSchoolsData.entries())) {
    topSchools.sort((a, b) => a.rank - b.rank);
    const maxScore = Math.max(...topSchools.map(t => t.score)) || 100;
    for (let i = 0; i < topSchools.length; i++) {
      const ts = topSchools[i];
      const baseInterest = Math.max(30, 80 - (i * 8));
      const scoreBonus = Math.floor((ts.score / maxScore) * 5);
      const interestLevel = Math.min(80, baseInterest + scoreBonus);
      allTopSchoolRows.push({
        recruitId,
        teamId: ts.teamId,
        interestLevel,
        rank: i + 1,
        isActive: true,
        accumulatedInterest: 0,
      });
    }
  }
  await storage.batchCreateRecruitTopSchools(allTopSchoolRows);
}

// Random appearance generator for players/recruits
// conferenceName: biases skin tone distribution by conference
// eligibility: biases facial hair probability (SR/JR more likely than FR)
