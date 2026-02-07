import { storage } from "./storage";
import type { Team, Game } from "@shared/schema";

type Journalist = "addie" | "sully";

const ADDIE_NAME = "Addie Frisk";
const SULLY_NAME = "Sully Pump";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateGameNews(
  winner: Team,
  loser: Team,
  winnerScore: number,
  loserScore: number,
  context: { season: number; week: number; phase: string; isUpset?: boolean; winStreak?: number }
): { title: string; content: string } {
  const margin = winnerScore - loserScore;
  const isBlowout = margin >= 7;
  const isClose = margin <= 2;

  const titles: string[] = [];
  const bodies: string[] = [];

  if (isBlowout) {
    titles.push(
      `${winner.name} Rolls Past ${loser.name} in Dominant Fashion!`,
      `${winner.abbreviation} Puts On a Clinic Against ${loser.name}!`,
      `It Wasn't Even Close! ${winner.name} Crushes ${loser.abbreviation}`,
      `${winner.name} Makes a Statement with Blowout Win Over ${loser.abbreviation}!`,
    );
    bodies.push(
      `Oh my, where do I even start?! The ${winner.name} ${winner.mascot} absolutely dismantled the ${loser.name} ${loser.mascot} today, ${winnerScore}-${loserScore}. This wasn't just a win -- this was a message sent to the entire conference. ${winner.abbreviation} looked sharp from the first pitch to the last, and honestly? I'm still catching my breath from watching it! If you weren't paying attention to ${winner.name} before, you'd better start now.`,
      `Well THAT just happened! ${winner.name} came out firing on all cylinders and never let up, cruising to a ${winnerScore}-${loserScore} victory over ${loser.name}. The ${winner.mascot} offense was absolutely electric today, and ${loser.abbreviation} had no answer. I've covered a lot of games this season, but this one was something special. ${winner.name} is playing with serious confidence right now.`,
      `Wow, wow, WOW! The ${winner.name} ${winner.mascot} put on an absolute show today, rolling over ${loser.name} by a final of ${winnerScore}-${loserScore}. From top to bottom, ${winner.abbreviation} was the better team today and it showed. The ${loser.mascot} are going to want to forget this one in a hurry.`,
    );
  } else if (isClose) {
    titles.push(
      `${winner.name} Edges Out ${loser.abbreviation} in a Thriller!`,
      `Instant Classic! ${winner.abbreviation} Survives ${loser.name}`,
      `${winner.name} Pulls Off the Gutsy Win Over ${loser.abbreviation}!`,
      `Nail-Biter! ${winner.name} Holds Off ${loser.name}, ${winnerScore}-${loserScore}`,
    );
    bodies.push(
      `I am STILL shaking from that one! The ${winner.name} ${winner.mascot} pulled out a heart-stopping ${winnerScore}-${loserScore} win over the ${loser.name} ${loser.mascot}. This game had everything -- momentum swings, clutch plays, and an ending that had me on the edge of my seat. Both teams gave it absolutely everything they had. What a game!`,
      `If you love college baseball, THIS is why! ${winner.name} and ${loser.name} went toe-to-toe in an absolute war today, with the ${winner.mascot} barely coming out on top, ${winnerScore}-${loserScore}. Every single at-bat felt like it mattered. Hats off to both teams -- this was one for the ages. ${winner.abbreviation} finds a way to win the close ones!`,
      `Talk about a battle! ${winner.name} gutted out a ${winnerScore}-${loserScore} victory over ${loser.name} in a game that could've gone either way. The ${loser.mascot} fought hard, but ${winner.abbreviation} made the plays when it counted most. These are the games that build championship teams, and ${winner.name} just passed the test.`,
    );
  } else {
    titles.push(
      `${winner.name} Takes Down ${loser.abbreviation}, ${winnerScore}-${loserScore}`,
      `${winner.abbreviation} Gets the Win Over ${loser.name}!`,
      `Solid Outing for ${winner.name} Against ${loser.abbreviation}`,
      `${winner.name} Keeps Rolling with Win Over ${loser.name}`,
    );
    bodies.push(
      `The ${winner.name} ${winner.mascot} picked up a solid ${winnerScore}-${loserScore} win over the ${loser.name} ${loser.mascot} today. It was a well-played game with ${winner.abbreviation} doing just enough to pull away. Good pitching, timely hitting -- the recipe for success was there, and they executed. Another quality win for ${winner.name}!`,
      `Add another W to the column! ${winner.name} handled business against ${loser.name} with a ${winnerScore}-${loserScore} victory. The ${winner.mascot} controlled the pace of this game for most of the afternoon and never looked too uncomfortable. It wasn't flashy, but it was effective -- and at this point in the season, that's all that matters.`,
      `${winner.name} did what good teams do today -- they won. A ${winnerScore}-${loserScore} decision over ${loser.name} might not make national headlines, but the ${winner.mascot} will take it and move on. Clean baseball, smart baserunning, and enough pitching to get the job done. ${winner.abbreviation} continues to build momentum!`,
    );
  }

  if (context.isUpset) {
    titles.length = 0;
    titles.push(
      `UPSET ALERT! ${winner.name} Stuns ${loser.abbreviation}!`,
      `Nobody Saw This Coming! ${winner.abbreviation} Knocks Off ${loser.name}!`,
      `${winner.name} Pulls Off the Upset of the Week Over ${loser.abbreviation}!`,
    );
    bodies.length = 0;
    bodies.push(
      `DID THAT JUST HAPPEN?! The ${winner.name} ${winner.mascot} just pulled off one of the biggest upsets of the season, knocking off the ${loser.name} ${loser.mascot} ${winnerScore}-${loserScore}! Nobody gave ${winner.abbreviation} a chance coming into this one, and they absolutely proved everyone wrong. This is why we play the games, people! What an incredible effort by ${winner.name}!`,
      `I am absolutely floored right now! ${winner.name} came in as the underdog and walked out as the giant slayer, taking down ${loser.name} ${winnerScore}-${loserScore}. The ${winner.mascot} played with nothing to lose and everything to gain, and it showed on every single play. ${loser.abbreviation} has some serious questions to answer after this one. College baseball is WILD!`,
    );
  }

  return { title: pick(titles), content: pick(bodies) };
}

function generatePostseasonGameNews(
  winner: Team,
  loser: Team,
  winnerScore: number,
  loserScore: number,
  phase: string
): { title: string; content: string } {
  const phaseLabel = phase === "conference_championship" ? "Conference Championship" :
    phase === "super_regionals" ? "Super Regionals" : "College World Series";

  const titles = [
    `${winner.name} Advances in ${phaseLabel} with Win Over ${loser.abbreviation}!`,
    `${winner.abbreviation} Stays Alive! Takes Down ${loser.name} in ${phaseLabel}!`,
    `Postseason Magic! ${winner.name} Eliminates ${loser.abbreviation}!`,
  ];

  const bodies = [
    `The stakes couldn't be higher, and ${winner.name} delivered! The ${winner.mascot} knocked off ${loser.name} ${winnerScore}-${loserScore} in the ${phaseLabel}, and the celebration was ELECTRIC. Postseason baseball hits different, and ${winner.abbreviation} showed they belong on this stage. ${loser.abbreviation} fought hard, but it just wasn't enough today. What a moment for ${winner.name}!`,
    `${phaseLabel} action and ${winner.name} is MOVING ON! A ${winnerScore}-${loserScore} victory over ${loser.name} keeps the ${winner.mascot}' season alive, and honestly? They look like a team of destiny right now. ${loser.abbreviation} gave them a battle, but ${winner.abbreviation} made the plays that matter most in the postseason. I'm getting chills just writing this!`,
    `Another day, another postseason thriller! ${winner.name} took care of business against ${loser.name}, winning ${winnerScore}-${loserScore} in the ${phaseLabel}. The ${winner.mascot} showed incredible composure when the pressure was on. This team is built for the moment. ${loser.abbreviation} can hold their heads high, but ${winner.abbreviation} is the one dancing tonight!`,
  ];

  return { title: pick(titles), content: pick(bodies) };
}

function generateCWSChampionNews(champion: Team, runnerUp: Team): { title: string; content: string } {
  const titles = [
    `${champion.name} Wins the College World Series!`,
    `CHAMPIONS! ${champion.abbreviation} Takes Home the Title!`,
    `Dynasty Moment: ${champion.name} Are Your National Champions!`,
  ];

  const bodies = [
    `I'm literally crying right now! The ${champion.name} ${champion.mascot} have won the COLLEGE WORLD SERIES! They defeated the ${runnerUp.name} ${runnerUp.mascot} in an unforgettable championship series, and I don't think anyone in ${champion.city} is sleeping tonight! From the first pitch of the season to the final out, this team believed in each other. What an incredible journey for ${champion.abbreviation}! Congratulations to the coaches, the players, and every single fan who believed. THIS is what college baseball is all about!`,
    `Put it in the RECORD BOOKS! ${champion.name} has done it -- they are your College World Series CHAMPIONS! After defeating ${runnerUp.name} in the finals, the ${champion.mascot} can officially call themselves the best team in college baseball. This program, this coaching staff, these players -- they put in the work all season long and it paid off in the biggest way possible. ${champion.city} is going to be celebrating for WEEKS!`,
  ];

  return { title: pick(titles), content: pick(bodies) };
}

function generateRecruitCommitNews(
  recruitName: string,
  stars: number,
  position: string,
  homeState: string,
  hometown: string,
  team: Team,
  overall: number,
  classRank: number
): { title: string; content: string } {
  const starLabel = stars >= 5 ? "five-star" : stars >= 4 ? "four-star" : "three-star";
  const isBlueChip = stars >= 4;

  if (stars >= 5) {
    const titles = [
      `MASSIVE Get! ${starLabel.toUpperCase()} ${position} ${recruitName} Commits to ${team.name}!`,
      `${team.abbreviation} Lands the Big One! ${recruitName} Is ${team.name}-Bound!`,
      `Recruiting Earthquake! ${recruitName} Chooses ${team.abbreviation}!`,
    ];
    const bodies = [
      `Alright, listen up, because this is HUGE. ${recruitName}, the ${starLabel} ${position} out of ${hometown}, ${homeState} -- ranked #${classRank} in the class -- has committed to ${team.name}. I've been tracking this kid since day one, and let me tell you, ${team.abbreviation} just landed a future All-American. The ${team.mascot} coaching staff pulled off a masterclass in recruiting here. This commitment changes the entire landscape. Other programs? Take notes.`,
      `I called it. I CALLED IT. ${recruitName}, one of the top ${position}s in the entire country, is heading to ${team.name}. The ${starLabel} prospect out of ${hometown}, ${homeState} had offers from everywhere, but ${team.abbreviation} made the pitch that stuck. At #${classRank} in the class, this is the kind of commitment that turns a good recruiting class into a GREAT one. ${team.name} just made a statement, and the rest of the conference heard it loud and clear.`,
    ];
    return { title: pick(titles), content: pick(bodies) };
  }

  if (stars >= 4) {
    const titles = [
      `${team.abbreviation} Snags ${starLabel} ${position} ${recruitName}!`,
      `Blue Chip Alert! ${recruitName} Commits to ${team.name}!`,
      `${team.name} Adds Another Gem: ${recruitName} Signs On!`,
    ];
    const bodies = [
      `Another quality addition for ${team.name}! ${recruitName}, a ${starLabel} ${position} from ${hometown}, ${homeState}, has officially committed to the ${team.mascot}. Ranked #${classRank} in the class, this kid has serious upside and the tools to make an immediate impact. ${team.abbreviation} continues to recruit at a high level, and this commitment is proof that the program is trending in the right direction. Smart pickup.`,
      `Mark it down -- ${recruitName} is going to be a name you hear a LOT in ${team.city}. The ${starLabel} ${position} out of ${hometown}, ${homeState} has committed to ${team.name}, and I think this is a steal at #${classRank}. I've watched the film, I've done the research, and this kid fits ${team.abbreviation}'s system perfectly. The ${team.mascot} are building something special with this class.`,
    ];
    return { title: pick(titles), content: pick(bodies) };
  }

  const titles = [
    `${team.abbreviation} Picks Up ${position} ${recruitName}`,
    `${recruitName} Commits to ${team.name}`,
    `New Addition: ${team.name} Lands ${position} ${recruitName}`,
  ];
  const bodies = [
    `${team.name} adds another piece to the puzzle. ${recruitName}, a ${position} from ${hometown}, ${homeState}, has committed to the ${team.mascot}. Ranked #${classRank} in the class, this might fly under the radar for some, but I see the potential here. ${team.abbreviation} has a knack for developing talent, and ${recruitName} could be a diamond in the rough. Keep this name on your radar.`,
    `Solid addition for ${team.name} here. ${recruitName}, a ${position} out of ${hometown}, ${homeState}, is headed to ${team.abbreviation}. Not every commit is going to be a five-star headliner, and that's okay -- the programs that win championships are the ones that find the right fits, and I think ${recruitName} fits what ${team.name} is building.`,
  ];
  return { title: pick(titles), content: pick(bodies) };
}

function generateConferenceStandingsNews(
  leader: Team,
  conferenceTeams: { team: Team; wins: number; losses: number }[],
  conferenceName: string
): { title: string; content: string } | null {
  if (conferenceTeams.length < 2) return null;

  const sorted = [...conferenceTeams].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const top = sorted[0];
  const second = sorted[1];
  const gap = top.wins - second.wins;

  if (top.wins === 0) return null;

  if (gap >= 3) {
    return {
      title: `${top.team.name} Running Away with the ${conferenceName}!`,
      content: `Is anyone going to catch ${top.team.name}? The ${top.team.mascot} sit at ${top.wins}-${top.losses} in ${conferenceName} play, holding a ${gap}-game lead over ${second.team.name}. At this point, ${top.team.abbreviation} is making it look easy! The rest of the conference better figure something out soon, because the ${top.team.mascot} train isn't slowing down. I love watching a team play with this kind of confidence -- it's contagious!`,
    };
  }

  if (gap === 0 && top.wins >= 3) {
    return {
      title: `${conferenceName} Race Heating Up Between ${top.team.abbreviation} and ${second.team.abbreviation}!`,
      content: `Now THIS is what I'm talking about! ${top.team.name} and ${second.team.name} are locked in a dead heat at the top of the ${conferenceName} standings, both sitting at ${top.wins}-${top.losses}. Every game matters from here on out, and I am HERE for it. Who's going to blink first? Will the ${top.team.mascot} hold steady, or will ${second.team.abbreviation} make their move? This conference race is going to keep us all on the edge of our seats!`,
    };
  }

  return null;
}

function generateSeasonPreviewNews(teams: Team[]): { title: string; content: string } {
  const sorted = [...teams].sort((a, b) => (b.prestige || 5) - (a.prestige || 5));
  const top3 = sorted.slice(0, 3);
  const dark = sorted.slice(3, 6);

  return {
    title: "A New Season Dawns! Who Will Rise to the Top?",
    content: `IT'S GAMEDAY SEASON! I am SO excited for what's ahead, and I know you are too! The preseason buzz is unreal this year. ${top3[0]?.name || "The favorites"} come in as the team to beat, but don't sleep on ${top3[1]?.name || "the challengers"} and ${top3[2]?.name || "the dark horses"}. As for sleeper picks? Keep your eye on ${dark[0]?.name || "some underdogs"} -- I've got a feeling about them this year. Grab your scorecards, settle in, and get ready for what promises to be an absolutely incredible season of college baseball!`,
  };
}

function generateWeekRecapNews(
  results: { winner: Team; loser: Team; winnerScore: number; loserScore: number }[],
  week: number,
  season: number
): { title: string; content: string } | null {
  if (results.length === 0) return null;

  const bigWins = results.filter(r => (r.winnerScore - r.loserScore) >= 5);
  const closeGames = results.filter(r => (r.winnerScore - r.loserScore) <= 2);

  let recap = `What a week it was! Week ${week} gave us ${results.length} games and plenty of drama. `;

  if (bigWins.length > 0) {
    const big = pick(bigWins);
    recap += `${big.winner.name} turned heads with a commanding ${big.winnerScore}-${big.loserScore} win over ${big.loser.abbreviation}. `;
  }

  if (closeGames.length > 0) {
    const close = pick(closeGames);
    recap += `Meanwhile, ${close.winner.abbreviation} barely escaped with a ${close.winnerScore}-${close.loserScore} nail-biter against ${close.loser.name}. `;
  }

  recap += `We're only getting started, and I cannot WAIT to see what next week brings!`;

  return {
    title: `Week ${week} Recap: The Biggest Stories from Around the Diamond`,
    content: recap,
  };
}

function generateDraftDeclarationNews(
  playerName: string,
  position: string,
  team: Team,
  overall: number,
  stars: number
): { title: string; content: string } {
  const titles = [
    `${playerName} Declares for the MLB Draft!`,
    `${team.abbreviation} Loses ${position} ${playerName} to Draft Declaration`,
    `Draft Bound: ${playerName} Heading Pro After ${team.name} Career`,
  ];
  const bodies = [
    `Big news out of ${team.city} -- ${playerName}, the ${stars}-star ${position} for ${team.name}, has officially declared for the MLB Draft. This is a huge loss for the ${team.mascot} program, but you can't blame the kid for chasing his dream. With an overall rating of ${overall}, scouts have been drooling over this talent all season. I've been saying it all year: ${playerName} was destined for the next level. Best of luck to him -- ${team.abbreviation} fans will be cheering from the stands!`,
    `The MLB Draft just got more interesting! ${playerName} from ${team.name} has declared, and scouts across the country are already sharpening their pencils. The ${stars}-star ${position} was one of the best players in college baseball, and now he's taking his talents to the professional ranks. ${team.abbreviation} knew this day might come, but it still stings. Time for the coaching staff to adjust the roster and find the next man up.`,
  ];
  return { title: pick(titles), content: pick(bodies) };
}

function generateTransferPortalNews(
  playerName: string,
  position: string,
  fromTeam: Team,
  stars: number
): { title: string; content: string } {
  const titles = [
    `${playerName} Enters the Transfer Portal from ${fromTeam.abbreviation}`,
    `Portal Watch: ${fromTeam.name} ${position} ${playerName} Looking for New Home`,
    `${fromTeam.abbreviation} Loses ${playerName} to the Transfer Portal`,
  ];
  const bodies = [
    `Transfer portal alert! ${playerName}, a ${stars}-star ${position} from ${fromTeam.name}, has entered the portal and is exploring new options. This is a name to watch, folks. Programs looking for ${position} help should be picking up the phone right now. The portal is reshaping college baseball before our eyes, and ${playerName} is the latest example. Where will they land? Stay tuned -- I'll be tracking this one closely.`,
    `Another one hits the portal. ${playerName}, the ${position} from ${fromTeam.name}, is officially looking for a new home. The ${fromTeam.mascot} are going to miss this production, but the portal giveth and the portal taketh away. I've already got my sources telling me there are programs very interested. This could be a program-changing addition for whoever lands ${playerName}.`,
  ];
  return { title: pick(titles), content: pick(bodies) };
}

export async function generateGameNewsArticles(
  leagueId: string,
  games: Game[],
  teams: Team[],
  season: number,
  week: number,
  phase: string
): Promise<void> {
  const completedGames = games.filter(g => g.isComplete && g.homeScore !== null && g.awayScore !== null);
  if (completedGames.length === 0) return;

  const standingsData = await storage.getStandingsByLeague(leagueId, season);

  for (const game of completedGames) {
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    if (!homeTeam || !awayTeam) continue;

    const homeScore = game.homeScore!;
    const awayScore = game.awayScore!;
    const winner = homeScore > awayScore ? homeTeam : awayTeam;
    const loser = homeScore > awayScore ? awayTeam : homeTeam;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);

    const isUpset = (winner.prestige || 5) < (loser.prestige || 5) - 2;

    const isPostseason = phase === "conference_championship" || phase === "super_regionals" || phase === "cws";

    let newsData: { title: string; content: string };

    if (isPostseason) {
      newsData = generatePostseasonGameNews(winner, loser, winnerScore, loserScore, phase);
    } else {
      const shouldReport = isUpset || (winnerScore - loserScore) >= 5 || (winnerScore - loserScore) <= 2 || Math.random() < 0.35;
      if (!shouldReport) continue;

      newsData = generateGameNews(winner, loser, winnerScore, loserScore, {
        season,
        week,
        phase,
        isUpset,
      });
    }

    await storage.createDynastyNews({
      leagueId,
      authorName: ADDIE_NAME,
      title: newsData.title,
      content: newsData.content,
      category: isPostseason ? "postseason" : "game",
      journalist: "addie",
      season,
      week,
      isAutoGenerated: true,
    });
  }

  if (completedGames.length >= 3 && !phase.includes("offseason") && Math.random() < 0.5) {
    const recapResults = completedGames.map(g => {
      const homeTeam = teams.find(t => t.id === g.homeTeamId)!;
      const awayTeam = teams.find(t => t.id === g.awayTeamId)!;
      const homeScore = g.homeScore!;
      const awayScore = g.awayScore!;
      return {
        winner: homeScore > awayScore ? homeTeam : awayTeam,
        loser: homeScore > awayScore ? awayTeam : homeTeam,
        winnerScore: Math.max(homeScore, awayScore),
        loserScore: Math.min(homeScore, awayScore),
      };
    }).filter(r => r.winner && r.loser);

    const recap = generateWeekRecapNews(recapResults, week, season);
    if (recap) {
      await storage.createDynastyNews({
        leagueId,
        authorName: ADDIE_NAME,
        title: recap.title,
        content: recap.content,
        category: "recap",
        journalist: "addie",
        season,
        week,
        isAutoGenerated: true,
      });
    }
  }
}

export async function generateCWSChampionNewsArticle(
  leagueId: string,
  champion: Team,
  runnerUp: Team,
  season: number
): Promise<void> {
  const newsData = generateCWSChampionNews(champion, runnerUp);
  await storage.createDynastyNews({
    leagueId,
    authorName: ADDIE_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "postseason",
    journalist: "addie",
    season,
    isSticky: true,
    isAutoGenerated: true,
  });
}

export async function generateRecruitCommitNewsArticle(
  leagueId: string,
  recruitName: string,
  stars: number,
  position: string,
  homeState: string,
  hometown: string,
  team: Team,
  overall: number,
  classRank: number,
  season: number,
  week?: number
): Promise<void> {
  if (stars < 3) return;
  if (stars === 3 && Math.random() > 0.2) return;

  const newsData = generateRecruitCommitNews(recruitName, stars, position, homeState, hometown, team, overall, classRank);
  await storage.createDynastyNews({
    leagueId,
    authorName: SULLY_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "recruiting",
    journalist: "sully",
    season,
    week,
    isAutoGenerated: true,
  });
}

export async function generateDraftDeclarationNewsArticle(
  leagueId: string,
  playerName: string,
  position: string,
  team: Team,
  overall: number,
  stars: number,
  season: number
): Promise<void> {
  if (stars < 3 && overall < 600) return;

  const newsData = generateDraftDeclarationNews(playerName, position, team, overall, stars);
  await storage.createDynastyNews({
    leagueId,
    authorName: SULLY_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "recruiting",
    journalist: "sully",
    season,
    isAutoGenerated: true,
  });
}

export async function generateTransferPortalNewsArticle(
  leagueId: string,
  playerName: string,
  position: string,
  fromTeam: Team,
  stars: number,
  season: number
): Promise<void> {
  if (stars < 3) return;

  const newsData = generateTransferPortalNews(playerName, position, fromTeam, stars);
  await storage.createDynastyNews({
    leagueId,
    authorName: SULLY_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "recruiting",
    journalist: "sully",
    season,
    isAutoGenerated: true,
  });
}

export async function generateSeasonPreviewNewsArticle(
  leagueId: string,
  teams: Team[],
  season: number
): Promise<void> {
  const newsData = generateSeasonPreviewNews(teams);
  await storage.createDynastyNews({
    leagueId,
    authorName: ADDIE_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "announcement",
    journalist: "addie",
    season,
    week: 1,
    isAutoGenerated: true,
  });
}

export async function generateConferenceUpdateNews(
  leagueId: string,
  teams: Team[],
  season: number,
  week: number
): Promise<void> {
  const conferences = await storage.getConferencesByLeague(leagueId);
  const standings = await storage.getStandingsByLeague(leagueId, season);

  for (const conf of conferences) {
    const confTeams = teams.filter(t => t.conferenceId === conf.id);
    const confStandings = confTeams.map(team => {
      const s = standings.find(st => st.teamId === team.id);
      return { team, wins: s?.conferenceWins || 0, losses: s?.conferenceLosses || 0 };
    });

    const newsData = generateConferenceStandingsNews(
      confTeams[0],
      confStandings,
      conf.name
    );

    if (newsData) {
      await storage.createDynastyNews({
        leagueId,
        authorName: ADDIE_NAME,
        title: newsData.title,
        content: newsData.content,
        category: "conference",
        journalist: "addie",
        season,
        week,
        isAutoGenerated: true,
      });
    }
  }
}

export async function generateDeparturesSummaryNews(
  leagueId: string,
  season: number,
  graduated: number,
  draftDeclared: number,
  transferPortal: number
): Promise<void> {
  const total = graduated + draftDeclared + transferPortal;
  if (total === 0) return;

  let content = `The offseason is officially here, and the roster movement is already underway across the league. `;
  if (graduated > 0) {
    content += `${graduated} player${graduated > 1 ? 's' : ''} ${graduated > 1 ? 'are' : 'is'} graduating and moving on -- best of luck to them in whatever comes next! `;
  }
  if (draftDeclared > 0) {
    content += `${draftDeclared} player${draftDeclared > 1 ? 's have' : ' has'} declared for the MLB Draft, chasing the big league dream. `;
  }
  if (transferPortal > 0) {
    content += `And ${transferPortal} player${transferPortal > 1 ? 's are' : ' is'} considering the transfer portal, which means recruiting season never really ends! `;
  }
  content += `Coaches better have their phones charged, because the next few weeks are going to be hectic!`;

  await storage.createDynastyNews({
    leagueId,
    authorName: ADDIE_NAME,
    title: `Offseason Movement: ${total} Players on the Move League-Wide`,
    content,
    category: "announcement",
    journalist: "addie",
    season,
    isAutoGenerated: true,
  });
}
