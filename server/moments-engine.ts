import { storage } from "./storage";
import type { Team, Player, Coach, Moment } from "@shared/schema";

export async function detectMoments(leagueId: string, season: number, week: number) {
  try {
    const teams = await storage.getTeamsByLeague(leagueId);
    const existingMoments = await storage.getMomentsByLeague(leagueId);
    const existingCategories = new Set(existingMoments.map(m => `${m.category}-${m.teamId}-${m.season}`));

    for (const team of teams) {
      const coach = team.coachId ? await storage.getCoach(team.coachId) : null;
      const standing = await getTeamStanding(leagueId, team.id, season);

      await detectCoachMilestones(leagueId, team, coach, season, week, existingCategories);
      await detectSeasonMilestones(leagueId, team, standing, season, week, existingCategories);
      await detectProgramFirsts(leagueId, team, coach, season, week, existingCategories);
    }
  } catch (err) {
    console.error("[Moments] Error detecting moments:", err);
  }
}

async function getTeamStanding(leagueId: string, teamId: string, season: number) {
  const allStandings = await storage.getStandingsByLeague(leagueId, season);
  return allStandings.find((s: { teamId: string }) => s.teamId === teamId);
}

async function detectCoachMilestones(
  leagueId: string,
  team: Team,
  coach: Coach | null | undefined,
  season: number,
  week: number,
  existing: Set<string>
) {
  if (!coach) return;

  const winMilestones = [50, 100, 200, 300, 500];
  for (const milestone of winMilestones) {
    const key = `coach_wins_${milestone}-${team.id}-${season}`;
    if (existing.has(key)) continue;
    if (coach.careerWins >= milestone && coach.careerWins - 5 < milestone) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "coach_milestone",
        category: `coach_wins_${milestone}`,
        title: `Coach ${coach.firstName} ${coach.lastName} Reaches ${milestone} Career Wins`,
        description: `A milestone moment at ${team.name}. Coach ${coach.firstName} ${coach.lastName} has reached ${milestone} career victories, cementing ${coach.lastName}'s legacy in the program. The ${coach.archetype.replace("_", " ")} coach has built something special here, and this milestone is a testament to years of dedication and excellent recruiting. The ${team.name} faithful salute their coach.`,
        journalist: "addie",
        targetCoachId: coach.id,
        metadata: { wins: coach.careerWins, milestone },
      });
      existing.add(key);
    }
  }

  const levelMilestones = [5, 10, 15, 20];
  for (const level of levelMilestones) {
    const key = `coach_level_${level}-${team.id}-${season}`;
    if (existing.has(key)) continue;
    if (coach.level >= level && coach.level <= level + 1) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "coach_milestone",
        category: `coach_level_${level}`,
        title: `Coach ${coach.lastName} Reaches Level ${level}`,
        description: `Coach ${coach.firstName} ${coach.lastName} has reached Level ${level} in their coaching career. This veteran ${coach.archetype.replace("_", " ")} has honed their skills through seasons of competition and is now one of the most experienced coaches in the league. The skill tree is opening up, and the recruiting advantages are real.`,
        journalist: "sully",
        targetCoachId: coach.id,
        metadata: { level: coach.level },
      });
      existing.add(key);
    }
  }
}

async function detectSeasonMilestones(
  leagueId: string,
  team: Team,
  standing: { wins: number; losses: number; conferenceWins: number; conferenceLosses: number } | undefined,
  season: number,
  week: number,
  existing: Set<string>
) {
  if (!standing) return;
  const { wins, losses } = standing;

  if (wins >= 10) {
    const key = `ten_win_season-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "dynasty_achievement",
        category: "ten_win_season",
        title: `${team.name} Reaches 10-Win Milestone`,
        description: `${team.name} has hit double-digit wins this season with a ${wins}-${losses} record. This kind of consistency doesn't happen by accident -- it's the result of solid recruiting, good coaching, and players who show up every day. The ${team.name} program is building something worth watching.`,
        journalist: "sully",
        metadata: { wins, losses },
      });
      existing.add(key);
    }
  }

  if (wins >= 20) {
    const key = `twenty_win_season-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "dynasty_achievement",
        category: "twenty_win_season",
        title: `Dominant: ${team.name} Reaches 20 Wins`,
        description: `Twenty wins. Let that sink in. ${team.name} has been absolutely dominant this season with a ${wins}-${losses} record. This is elite-level performance, the kind of season that defines programs for years to come. The ${team.name} faithful are witnessing something special, and the rest of the league knows it.`,
        journalist: "addie",
        metadata: { wins, losses },
      });
      existing.add(key);
    }
  }

  if (losses >= 5 && wins === 0) {
    const key = `winless_streak-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "dynasty_achievement",
        category: "winless_streak",
        title: `${team.name} Struggling at 0-${losses}`,
        description: `It has been a brutal start for ${team.name}. Sitting at 0-${losses}, the ${team.name} program is searching for answers. The coaching staff is under pressure, and the players are feeling it. Every team goes through rough patches, but this one is testing the resolve of everyone in the program. Something has to change.`,
        journalist: "sully",
        metadata: { wins, losses },
      });
      existing.add(key);
    }
  }

  const totalGames = wins + losses;
  if (totalGames >= 8 && team.prestige && team.prestige <= 40 && wins >= Math.floor(totalGames * 0.7)) {
    const key = `cinderella_run-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "dynasty_achievement",
        category: "cinderella_run",
        title: `Cinderella Story: ${team.name}'s Improbable Season`,
        description: `Nobody saw this coming. ${team.name}, picked by many to finish near the bottom, is sitting at ${wins}-${losses} and making the entire league take notice. This is a Cinderella story in the making -- a low-prestige program with big-time heart. The players believe, the coach believes, and now the rest of us are starting to believe too. This is why we love college baseball.`,
        journalist: "addie",
        metadata: { wins, losses, prestige: team.prestige },
      });
      existing.add(key);
    }
  }
}

async function detectProgramFirsts(
  leagueId: string,
  team: Team,
  coach: Coach | null | undefined,
  season: number,
  week: number,
  existing: Set<string>
) {
  if (!coach) return;
  if (season <= 1) return;

  if (coach.confChampionships === 1) {
    const key = `first_conf_title-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "program_first",
        category: "first_conf_title",
        title: `Historic: ${team.name} Wins First Conference Championship`,
        description: `HISTORY HAS BEEN MADE. ${team.name} has won their first-ever conference championship under Coach ${coach.firstName} ${coach.lastName}. This is a watershed moment for the program -- years of recruiting, development, and belief have culminated in a title. The celebration at ${team.stadium || team.name + " Field"} will be one for the ages. This program will never be the same.`,
        journalist: "addie",
        targetCoachId: coach.id,
        metadata: { confChampionships: coach.confChampionships },
      });
      existing.add(key);
    }
  }

  if (coach.nationalChampionships === 1) {
    const key = `first_natl_title-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "program_first",
        category: "first_natl_title",
        title: `CHAMPIONS: ${team.name} Wins First National Championship`,
        description: `THE IMPOSSIBLE HAS HAPPENED. ${team.name} is the NATIONAL CHAMPION for the first time in program history. Coach ${coach.firstName} ${coach.lastName} has taken this team from aspirations to the absolute pinnacle of college baseball. The confetti is falling, the players are dogpiling, and ${team.name} fans are in tears. This is what dynasty mode is all about. Remember this moment.`,
        journalist: "addie",
        targetCoachId: coach.id,
        metadata: { nationalChampionships: coach.nationalChampionships },
      });
      existing.add(key);
    }
  }

  if (coach.nationalChampionships >= 2) {
    const key = `dynasty_titles_${coach.nationalChampionships}-${team.id}-${season}`;
    if (!existing.has(key)) {
      await createMoment(leagueId, team.id, season, week, {
        momentType: "dynasty_achievement",
        category: `dynasty_titles_${coach.nationalChampionships}`,
        title: `Dynasty Confirmed: ${team.name} Wins Championship #${coach.nationalChampionships}`,
        description: `At this point, it's not a question anymore -- ${team.name} is a DYNASTY. National Championship number ${coach.nationalChampionships} is in the books, and Coach ${coach.lastName} has built something that will be talked about for generations. Multiple titles, sustained excellence, elite recruiting -- this is what it looks like when everything comes together. ${team.name} sits atop the college baseball world, and they don't look like they're coming down anytime soon.`,
        journalist: "sully",
        targetCoachId: coach.id,
        metadata: { nationalChampionships: coach.nationalChampionships },
      });
      existing.add(key);
    }
  }
}

async function createMoment(
  leagueId: string,
  teamId: string,
  season: number,
  week: number,
  data: {
    momentType: string;
    category: string;
    title: string;
    description: string;
    journalist: string;
    targetPlayerId?: string;
    targetCoachId?: string;
    metadata?: Record<string, any>;
  }
) {
  const moment = await storage.createMoment({
    leagueId,
    teamId,
    season,
    week,
    momentType: data.momentType,
    category: data.category,
    title: data.title,
    description: data.description,
    journalist: data.journalist,
    targetPlayerId: data.targetPlayerId || null,
    targetCoachId: data.targetCoachId || null,
    metadata: data.metadata || {},
  });

  await storage.createDynastyNews({
    leagueId,
    authorName: data.journalist === "sully" ? "Sully Pump" : "Addie Frisk",
    title: data.title,
    content: data.description,
    category: "moment",
    journalist: data.journalist,
    season,
    week,
    isAutoGenerated: true,
    isSticky: true,
  });

  return moment;
}
