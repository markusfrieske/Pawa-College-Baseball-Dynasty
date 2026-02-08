import { storage } from "./storage";
import type { Team, Player, Recruit, Coach, InsertStoryEvent } from "@shared/schema";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(pct: number): boolean {
  return Math.random() * 100 < pct;
}

const PERSONALITIES = ["leader", "hot_head", "coachable", "lazy", "clutch_gene", "team_player", "lone_wolf", "grinder"] as const;
const WORK_ETHICS = ["elite", "high", "average", "low"] as const;

interface DramaContext {
  leagueId: string;
  season: number;
  week: number;
  teams: Team[];
  humanTeamIds: string[];
}

export async function generateWeeklyDrama(leagueId: string, season: number, week: number) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const humanTeamIds = teams.filter(t => !t.isCpu && t.coachId).map(t => t.id);

  if (humanTeamIds.length === 0) return;

  const ctx: DramaContext = { leagueId, season, week, teams, humanTeamIds };

  for (const teamId of humanTeamIds) {
    const teamPlayers = await storage.getPlayersByTeam(teamId);
    const team = teams.find(t => t.id === teamId)!;
    const coach = team.coachId ? (await storage.getCoach(team.coachId) ?? null) : null;

    if (chance(18)) {
      await generateChoiceDrama(ctx, team, teamPlayers, coach);
    }

    if (chance(15)) {
      await generateAutomaticDrama(ctx, team, teamPlayers);
    }
  }
}

async function generateChoiceDrama(ctx: DramaContext, team: Team, players: Player[], coach: Coach | null) {
  const dramaTypes = ["booster_pressure", "player_discipline", "nil_negotiation", "recruit_flip"];
  const eventType = pick(dramaTypes);

  switch (eventType) {
    case "booster_pressure":
      await generateBoosterPressure(ctx, team, players);
      break;
    case "player_discipline":
      await generatePlayerDiscipline(ctx, team, players);
      break;
    case "nil_negotiation":
      await generateNilNegotiation(ctx, team, players);
      break;
    case "recruit_flip":
      await generateRecruitFlip(ctx, team);
      break;
  }
}

async function generateAutomaticDrama(ctx: DramaContext, team: Team, players: Player[]) {
  const autoTypes = ["chemistry", "academic_probation", "media_controversy", "breakout_performance"];
  const eventType = pick(autoTypes);

  switch (eventType) {
    case "chemistry":
      await generateChemistryEvent(ctx, team, players);
      break;
    case "academic_probation":
      await generateAcademicProbation(ctx, team, players);
      break;
    case "media_controversy":
      await generateMediaControversy(ctx, team, players);
      break;
    case "breakout_performance":
      await generateBreakoutPerformance(ctx, team, players);
      break;
  }
}

async function generateBoosterPressure(ctx: DramaContext, team: Team, players: Player[]) {
  if (players.length < 5) return;

  const lowerPlayer = players
    .filter(p => (p.overall || 500) < 600 && !p.declaredForDraft && !p.inTransferPortal)
    .sort(() => Math.random() - 0.5)[0];
  if (!lowerPlayer) return;

  const boosterNames = ["Jim Crawford", "Bill Henderson", "Dave Martinez", "Robert Chen", "Thomas Wright", "Richard Moore"];
  const boosterName = pick(boosterNames);

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "booster_pressure",
    category: "drama",
    title: `Booster ${boosterName} Demands Playing Time for ${lowerPlayer.firstName} ${lowerPlayer.lastName}`,
    description: `A major booster, ${boosterName}, has reached out demanding that ${lowerPlayer.firstName} ${lowerPlayer.lastName} gets more playing time. He's hinting that NIL funding could be affected if his wishes aren't met. How do you handle this situation?`,
    journalist: "jimbo",
    status: "pending",
    requiresChoice: true,
    choices: [
      {
        id: "comply",
        label: "Give In",
        description: `Guarantee ${lowerPlayer.firstName} more playing time to keep the booster happy.`,
        consequences: { nilBudgetChange: 500000, teamMoraleChange: -10, playerMoraleChange: 15 }
      },
      {
        id: "refuse",
        label: "Stand Your Ground",
        description: "Tell the booster that lineup decisions are yours alone.",
        consequences: { nilBudgetChange: -300000, teamMoraleChange: 10, coachRepChange: 5 }
      },
      {
        id: "compromise",
        label: "Compromise",
        description: `Promise to give ${lowerPlayer.firstName} a fair evaluation period.`,
        consequences: { nilBudgetChange: 0, teamMoraleChange: 0, playerMoraleChange: 5 }
      }
    ],
    targetPlayerId: lowerPlayer.id,
  });
}

async function generatePlayerDiscipline(ctx: DramaContext, team: Team, players: Player[]) {
  const eligiblePlayers = players.filter(p => !p.declaredForDraft && !p.inTransferPortal && (p.overall || 500) > 550);
  if (eligiblePlayers.length === 0) return;

  const player = pick(eligiblePlayers);
  const incidents = [
    { title: "caught breaking curfew", detail: "was spotted out past curfew at a local restaurant the night before a game" },
    { title: "missed mandatory practice", detail: "failed to show up for a required team practice without prior notice" },
    { title: "involved in locker room argument", detail: "got into a heated verbal altercation with a teammate in the locker room" },
    { title: "posted controversial social media", detail: "posted something questionable on social media that's getting attention" },
  ];
  const incident = pick(incidents);

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "player_discipline",
    category: "drama",
    title: `${player.firstName} ${player.lastName} ${incident.title}`,
    description: `${player.firstName} ${player.lastName} ${incident.detail}. The team is watching to see how you handle this. Your response will set the tone for the program.`,
    journalist: "jimbo",
    status: "pending",
    requiresChoice: true,
    choices: [
      {
        id: "suspend",
        label: "Suspend 2 Games",
        description: `Bench ${player.firstName} for the next 2 games to send a message.`,
        consequences: { playerMoraleChange: -20, teamMoraleChange: 10, coachRepChange: 5, playerSuspended: 2 }
      },
      {
        id: "warning",
        label: "Private Warning",
        description: `Have a private conversation and issue a warning.`,
        consequences: { playerMoraleChange: 5, teamMoraleChange: -5, coachRepChange: -2 }
      },
      {
        id: "ignore",
        label: "Let It Slide",
        description: "Overlook the incident this time.",
        consequences: { playerMoraleChange: 10, teamMoraleChange: -15, coachRepChange: -10 }
      }
    ],
    targetPlayerId: player.id,
  });
}

async function generateNilNegotiation(ctx: DramaContext, team: Team, players: Player[]) {
  const starPlayers = players.filter(p => (p.overall || 500) > 700 && !p.declaredForDraft && !p.inTransferPortal);
  if (starPlayers.length === 0) return;

  const player = pick(starPlayers);
  const demandAmount = Math.round((50000 + Math.random() * 200000) / 10000) * 10000;

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "nil_negotiation",
    category: "drama",
    title: `${player.firstName} ${player.lastName} Wants More NIL Money`,
    description: `Your star ${player.position}, ${player.firstName} ${player.lastName} (${player.starRating}-star, OVR ${player.overall}), has been approached by other programs and wants a bigger NIL deal. He's asking for $${demandAmount.toLocaleString()} or he'll consider the transfer portal.`,
    journalist: "jimbo",
    status: "pending",
    requiresChoice: true,
    choices: [
      {
        id: "meet_demands",
        label: "Pay Up",
        description: `Give ${player.firstName} the full $${demandAmount.toLocaleString()}.`,
        consequences: { nilSpendChange: demandAmount, playerMoraleChange: 20, portalRisk: 0 }
      },
      {
        id: "counter_offer",
        label: "Counter Offer",
        description: `Offer $${Math.round(demandAmount * 0.6).toLocaleString()} and emphasize the program's value.`,
        consequences: { nilSpendChange: Math.round(demandAmount * 0.6), playerMoraleChange: 5, portalRisk: 15 }
      },
      {
        id: "let_walk",
        label: "Let Him Walk",
        description: "Tell him that no player is bigger than the program.",
        consequences: { nilSpendChange: 0, playerMoraleChange: -30, portalRisk: 60, teamMoraleChange: -5 }
      }
    ],
    targetPlayerId: player.id,
  });
}

async function generateRecruitFlip(ctx: DramaContext, team: Team) {
  const recruits = await storage.getRecruitsByLeague(ctx.leagueId);
  const interests = await storage.getRecruitingInterestsByTeam(team.id);
  
  const targetedRecruits = interests
    .filter(i => i.interestLevel > 40 && i.isTargeted)
    .map(i => {
      const recruit = recruits.find(r => r.id === i.recruitId);
      return recruit ? { recruit, interest: i } : null;
    })
    .filter(Boolean) as { recruit: Recruit; interest: any }[];

  if (targetedRecruits.length === 0) return;

  const { recruit } = pick(targetedRecruits);
  const rivalTeam = pick(ctx.teams.filter(t => t.id !== team.id));

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "recruit_flip",
    category: "drama",
    title: `${rivalTeam.name} Making Late Push for ${recruit.firstName} ${recruit.lastName}`,
    description: `Jimbo's hearing that ${rivalTeam.name} is making an aggressive push for ${recruit.starRating}-star ${recruit.position} ${recruit.firstName} ${recruit.lastName} from ${recruit.hometown}, ${recruit.homeState}. They're offering a big NIL package. Your recruit's attention is being pulled. How do you respond?`,
    journalist: "jimbo",
    status: "pending",
    requiresChoice: true,
    choices: [
      {
        id: "match_offer",
        label: "Match Their Offer",
        description: "Increase your NIL pitch and ramp up communication.",
        consequences: { recruitActionsUsed: 2, interestChange: 15, nilSpendChange: 50000 }
      },
      {
        id: "personal_touch",
        label: "Call the Recruit Directly",
        description: "Have a heart-to-heart phone call to reinforce the relationship.",
        consequences: { recruitActionsUsed: 1, interestChange: chance(60) ? 10 : -5 }
      },
      {
        id: "trust_relationship",
        label: "Trust the Relationship",
        description: "Don't panic. Let your existing relationship speak for itself.",
        consequences: { interestChange: chance(40) ? 5 : -10 }
      }
    ],
    targetRecruitId: recruit.id,
    relatedTeamId: rivalTeam.id,
  });
}

async function generateChemistryEvent(ctx: DramaContext, team: Team, players: Player[]) {
  const eligiblePlayers = players.filter(p => !p.declaredForDraft && !p.inTransferPortal);
  if (eligiblePlayers.length < 2) return;

  const player1 = pick(eligiblePlayers);
  const player2 = pick(eligiblePlayers.filter(p => p.id !== player1.id));
  
  const isPositive = chance(50);

  if (isPositive) {
    await storage.createStoryEvent({
      leagueId: ctx.leagueId,
      teamId: team.id,
      season: ctx.season,
      week: ctx.week,
      eventType: "chemistry",
      category: "automatic",
      title: `${player1.lastName} & ${player2.lastName} Developing Strong Bond`,
      description: `Something special is happening in the ${team.name} clubhouse. ${player1.firstName} ${player1.lastName} and ${player2.firstName} ${player2.lastName} have been inseparable during practice and it's showing on the field. Their chemistry is giving the whole team a boost. This is what building a program is all about!`,
      journalist: "jimbo",
      status: "resolved",
      requiresChoice: false,
      consequences: { teamMoraleChange: 5, player1Boost: 3, player2Boost: 3 },
      targetPlayerId: player1.id,
    });
  } else {
    await storage.createStoryEvent({
      leagueId: ctx.leagueId,
      teamId: team.id,
      season: ctx.season,
      week: ctx.week,
      eventType: "chemistry",
      category: "automatic",
      title: `Tension Between ${player1.lastName} & ${player2.lastName}`,
      description: `There's friction in the ${team.name} locker room. ${player1.firstName} ${player1.lastName} and ${player2.firstName} ${player2.lastName} haven't been seeing eye-to-eye lately, and teammates are starting to notice. It hasn't boiled over yet, but the coaching staff is keeping an eye on it.`,
      journalist: "jimbo",
      status: "resolved",
      requiresChoice: false,
      consequences: { teamMoraleChange: -5, player1Penalty: -2, player2Penalty: -2 },
      targetPlayerId: player1.id,
    });
  }
}

async function generateAcademicProbation(ctx: DramaContext, team: Team, players: Player[]) {
  const eligiblePlayers = players.filter(p => !p.declaredForDraft && !p.inTransferPortal);
  if (eligiblePlayers.length === 0) return;

  const player = pick(eligiblePlayers);

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "academic_probation",
    category: "automatic",
    title: `${player.firstName} ${player.lastName} Placed on Academic Watch`,
    description: `${player.firstName} ${player.lastName}'s grades have slipped this semester and the academic office has flagged the situation. If things don't improve, eligibility could be at risk next season. The ${team.name} academic support staff is working with ${player.firstName} to get back on track.`,
    journalist: "jimbo",
    status: "resolved",
    requiresChoice: false,
    consequences: { playerPenalty: -5, eligibilityRisk: true },
    targetPlayerId: player.id,
  });
}

async function generateMediaControversy(ctx: DramaContext, team: Team, players: Player[]) {
  const controversies = [
    {
      title: `${team.name} Facilities Under Fire After Viral Video`,
      description: `A video of the ${team.name} facilities has gone viral -- and not for good reasons. Former players are questioning whether the program is investing enough in its baseball infrastructure. It's a PR headache, but the coaching staff is confident the program is moving in the right direction.`,
    },
    {
      title: `Local Media Questions ${team.name} Recruiting Strategy`,
      description: `A prominent local sports writer published a piece questioning ${team.name}'s recruiting approach this cycle. "Are they targeting the right players?" the article asks. The piece has sparked debate among the fanbase and could affect how recruits perceive the program.`,
    },
    {
      title: `${team.name} Fan Frustration Grows on Social Media`,
      description: `The ${team.mascot} faithful are getting restless on social media. A string of recent results has fans questioning the direction of the program. While social media noise doesn't always matter, recruits and their families DO see these conversations. It's a perception battle.`,
    },
  ];
  const controversy = pick(controversies);

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "media_controversy",
    category: "automatic",
    title: controversy.title,
    description: controversy.description,
    journalist: "jimbo",
    status: "resolved",
    requiresChoice: false,
    consequences: { prestigeChange: -1, recruitingImpact: -5 },
  });
}

async function generateBreakoutPerformance(ctx: DramaContext, team: Team, players: Player[]) {
  const lowerRatedPlayers = players.filter(p => (p.starRating || 3) <= 2 && !p.declaredForDraft && !p.inTransferPortal);
  if (lowerRatedPlayers.length === 0) return;

  const player = pick(lowerRatedPlayers);

  const scenarios = [
    `${player.firstName} ${player.lastName} has been absolutely CRUSHING it lately. The ${player.eligibility} ${player.position} came in as a ${player.starRating}-star nobody, but has been turning heads in practice and games. Scouts are starting to take notice. Could this be the breakout story of the season for ${team.name}?`,
    `Keep your eye on ${player.firstName} ${player.lastName}. The ${player.eligibility} ${player.position} for ${team.name} has been on a tear recently, performing well above expectations. What started as a depth piece might be developing into something special. This is why you develop your whole roster.`,
  ];

  await storage.createStoryEvent({
    leagueId: ctx.leagueId,
    teamId: team.id,
    season: ctx.season,
    week: ctx.week,
    eventType: "breakout_performance",
    category: "automatic",
    title: `${player.firstName} ${player.lastName} Emerging as ${team.name} Surprise`,
    description: pick(scenarios),
    journalist: "jimbo",
    status: "resolved",
    requiresChoice: false,
    consequences: { playerBoost: 10 },
    targetPlayerId: player.id,
  });
}

export async function resolveDramaChoice(eventId: string, choiceId: string): Promise<{ event: any; consequences: Record<string, any> }> {
  const event = await storage.updateStoryEvent(eventId, {
    status: "resolved",
    chosenOptionId: choiceId,
    resolvedAt: new Date(),
  });

  if (!event) throw new Error("Event not found");

  const choiceList = event.choices as any[];
  const chosen = choiceList.find((c: any) => c.id === choiceId);
  if (!chosen) throw new Error("Invalid choice");

  const consequences = chosen.consequences || {};

  if (event.teamId && consequences.nilBudgetChange) {
    const team = await storage.getTeam(event.teamId);
    if (team) {
      await storage.updateTeam(team.id, {
        nilBudget: Math.max(0, team.nilBudget + consequences.nilBudgetChange),
      });
    }
  }

  if (event.teamId && consequences.nilSpendChange) {
    const team = await storage.getTeam(event.teamId);
    if (team) {
      await storage.updateTeam(team.id, {
        nilSpent: team.nilSpent + consequences.nilSpendChange,
      });
    }
  }

  if (event.targetRecruitId && consequences.interestChange && event.teamId) {
    const interest = await storage.getRecruitingInterest(event.targetRecruitId, event.teamId);
    if (interest) {
      await storage.updateRecruitingInterest(interest.id, {
        interestLevel: Math.max(0, Math.min(100, interest.interestLevel + consequences.interestChange)),
      });
    }
  }

  if (event.targetPlayerId && consequences.portalRisk && chance(consequences.portalRisk)) {
    await storage.updatePlayer(event.targetPlayerId, {
      pendingDeparture: true,
      departureType: "transfer_portal",
      transferReason: "Unhappy with NIL situation",
    });
  }

  await storage.updateStoryEvent(eventId, { consequences });

  return { event, consequences };
}
