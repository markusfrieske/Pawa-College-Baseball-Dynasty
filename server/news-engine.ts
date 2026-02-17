import { storage } from "./storage";
import type { Team, Game } from "@shared/schema";

type Journalist = "addie" | "sully" | "jimbo";

const ADDIE_NAME = "Addie Frisk";
const SULLY_NAME = "Sully Pump";
const JIMBO_NAME = "Jimbo Farrell";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickJournalist(exclude?: Journalist): { journalist: Journalist; authorName: string } {
  const all: { journalist: Journalist; authorName: string }[] = [
    { journalist: "addie", authorName: ADDIE_NAME },
    { journalist: "sully", authorName: SULLY_NAME },
    { journalist: "jimbo", authorName: JIMBO_NAME },
  ];
  const pool = exclude ? all.filter(j => j.journalist !== exclude) : all;
  return pick(pool);
}

function generateGameNews(
  winner: Team,
  loser: Team,
  winnerScore: number,
  loserScore: number,
  context: { season: number; week: number; phase: string; isUpset?: boolean; winStreak?: number },
  journalist: Journalist
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
      `${winner.abbreviation} Flexes: ${winnerScore}-${loserScore} Demolition of ${loser.name}`,
    );
    if (journalist === "addie") {
      bodies.push(
        `Oh my, where do I even start?! The ${winner.name} ${winner.mascot} absolutely dismantled the ${loser.name} ${loser.mascot} today, ${winnerScore}-${loserScore}. This wasn't just a win -- this was a message sent to the entire conference. ${winner.abbreviation} looked sharp from the first pitch to the last, and honestly? I'm still catching my breath from watching it!\n\nIf you weren't paying attention to ${winner.name} before, you'd better start now. Every part of their game was clicking today -- the bats were alive, the defense was airtight, and the pitching staff gave ${loser.abbreviation} absolutely nothing to work with. You love to see a complete team performance like this. The question now: Can anybody slow down the ${winner.mascot}?`,
        `Well THAT just happened! ${winner.name} came out firing on all cylinders and never let up, cruising to a ${winnerScore}-${loserScore} victory over ${loser.name}. The ${winner.mascot} offense was absolutely electric today, and ${loser.abbreviation} had no answer.\n\nI've covered a lot of games this season, but this one was something special. The energy in the stadium was palpable from the opening pitch, and ${winner.name} fed off that crowd like I've never seen. Their lineup went through the order with surgical precision, and by the middle innings, it was already feeling like a foregone conclusion. ${winner.name} is playing with serious confidence right now, and that should worry everyone else on their schedule.`,
      );
    } else if (journalist === "sully") {
      bodies.push(
        `Let me paint you a picture: ${winner.name} walked into this game like they owned the place -- and by the third inning, they basically did. A ${winnerScore}-${loserScore} drubbing of ${loser.name} that left the ${loser.mascot} dugout looking like a funeral.\n\nI've been doing this long enough to know when a team is clicking, and ${winner.abbreviation} is clicking on a level that should concern the entire conference. Their bats were relentless, stringing together hits like a symphony of destruction. And the pitching? Dominant doesn't even begin to describe it. ${loser.name} was overmatched from jump street.`,
        `Okay, let's be real for a second -- ${loser.name} probably wants to burn the tape on this one. ${winner.name} came out swinging and never stopped, rolling to a ${winnerScore}-${loserScore} victory that was somehow even more lopsided than the score suggests.\n\nI was tracking the at-bats, and ${winner.abbreviation} was making hard contact from the jump. Their approach at the plate was patient, disciplined, and absolutely punishing. Meanwhile, ${loser.abbreviation} couldn't find a rhythm on offense to save their lives. This was men against boys, and ${winner.name} left no doubt about who the better team is right now.`,
      );
    } else {
      bodies.push(
        `You know what I love about a good blowout? It tells you something real about a team's character. And what ${winner.name} just did to ${loser.name} -- a ${winnerScore}-${loserScore} beatdown -- told me everything I needed to know about where this program stands.\n\nThe ${winner.mascot} came prepared, executed their game plan to perfection, and frankly, looked like the best team in the region doing it. I've been following this squad for weeks, and I can tell you the work they've been putting in behind the scenes is paying dividends. ${loser.abbreviation} caught the ${winner.mascot} on the wrong day, and there was nothing they could do about it.`,
        `In my years covering college baseball, I've seen my share of one-sided affairs, but ${winner.name}'s ${winnerScore}-${loserScore} demolition of ${loser.name} was something else entirely. The ${winner.mascot} were dialed in from the first pitch -- mechanically sound, mentally sharp, and utterly dominant.\n\n${loser.abbreviation} came in with a game plan, I'm sure of it. But ${winner.name} shredded whatever playbook they brought and replaced it with their own. This is the kind of performance that changes the narrative of a season. If you weren't taking ${winner.abbreviation} seriously before today, I'd suggest you start.`,
      );
    }
  } else if (isClose) {
    titles.push(
      `${winner.name} Edges Out ${loser.abbreviation} in a Thriller!`,
      `Instant Classic! ${winner.abbreviation} Survives ${loser.name}`,
      `${winner.name} Pulls Off the Gutsy Win Over ${loser.abbreviation}!`,
      `Nail-Biter! ${winner.name} Holds Off ${loser.name}, ${winnerScore}-${loserScore}`,
      `Down to the Wire: ${winner.abbreviation} Takes It ${winnerScore}-${loserScore}`,
    );
    if (journalist === "addie") {
      bodies.push(
        `I am STILL shaking from that one! The ${winner.name} ${winner.mascot} pulled out a heart-stopping ${winnerScore}-${loserScore} win over the ${loser.name} ${loser.mascot}. This game had everything -- momentum swings, clutch plays, and an ending that had me on the edge of my seat.\n\nBoth teams gave it absolutely everything they had, and you could feel the intensity radiating from the field. ${winner.abbreviation} dug deep when it mattered most, finding that extra gear that separates good teams from great ones. ${loser.name} has nothing to hang their heads about -- they played their hearts out. But at the end of the day, someone has to win, and ${winner.name} wanted it just a little bit more.`,
        `If you love college baseball, THIS is why! ${winner.name} and ${loser.name} went toe-to-toe in an absolute war today, with the ${winner.mascot} barely coming out on top, ${winnerScore}-${loserScore}. Every single at-bat felt like it mattered.\n\nThe tension in the late innings was thick enough to cut with a knife. Both pitching staffs were dealing, both defenses were making plays, and it came down to one moment -- one swing -- that decided the outcome. Hats off to both teams. This was one for the ages. ${winner.abbreviation} finds a way to win the close ones, and that's a trait that will serve them well when the stakes get even higher.`,
      );
    } else if (journalist === "sully") {
      bodies.push(
        `Talk about a battle! ${winner.name} gutted out a ${winnerScore}-${loserScore} victory over ${loser.name} in a game that could've gone either way. The ${loser.mascot} fought hard, but ${winner.abbreviation} made the plays when it counted most.\n\nThis was a chess match between two evenly matched teams, and it came down to execution in the biggest moments. I had my eye on the bullpen matchups down the stretch, and ${winner.name} got the edge with some smart pitcher management. ${loser.abbreviation} left a couple runners stranded in scoring position late, and in a game this tight, you can't afford that. These are the games that build championship teams, and ${winner.name} just passed the test.`,
        `I need a minute to catch my breath after that one. ${winner.name} over ${loser.name}, ${winnerScore}-${loserScore}, in a game that aged me about five years. The scouting report said this would be close, and boy, was it ever.\n\nEvery pitch in the final three innings felt like it carried the weight of the world. ${loser.abbreviation} made a late push that had ${winner.name} fans squirming in their seats, but the ${winner.mascot} defense came up huge with a play that might be the highlight of the week. In a season full of nail-biters, this one stands out.`,
      );
    } else {
      bodies.push(
        `Games like this are why I do what I do. ${winner.name} squeaked past ${loser.name} ${winnerScore}-${loserScore} in a game that had absolutely everything -- tension, drama, and a finish that'll have both fan bases talking for weeks.\n\nFrom a tactical standpoint, both coaching staffs called excellent games. The pitching matchups were fascinating, the in-game adjustments were sharp, and the players executed under enormous pressure. ${winner.abbreviation} ultimately won because they made one more play than ${loser.abbreviation} did. That's how thin the margins are at this level. This was college baseball at its absolute finest.`,
        `I've been tracking ${winner.name} closely this season, and what they showed today -- a ${winnerScore}-${loserScore} white-knuckle win over ${loser.name} -- tells me this team has the mental toughness to make a deep run.\n\nLet's break down the key moment: down to the wire, both teams exhausting their bullpens, and ${winner.abbreviation} comes through with a clutch at-bat when everything was on the line. That's not luck. That's preparation meeting opportunity. ${loser.name} played a tremendous game and should feel good about where they are, but ${winner.name} just proved something important about their character.`,
      );
    }
  } else {
    titles.push(
      `${winner.name} Takes Down ${loser.abbreviation}, ${winnerScore}-${loserScore}`,
      `${winner.abbreviation} Gets the Win Over ${loser.name}!`,
      `Solid Outing for ${winner.name} Against ${loser.abbreviation}`,
      `${winner.name} Keeps Rolling with Win Over ${loser.name}`,
      `Business as Usual: ${winner.abbreviation} Handles ${loser.name}`,
    );
    if (journalist === "addie") {
      bodies.push(
        `The ${winner.name} ${winner.mascot} picked up a solid ${winnerScore}-${loserScore} win over the ${loser.name} ${loser.mascot} today. It was a well-played game with ${winner.abbreviation} doing just enough to pull away. Good pitching, timely hitting -- the recipe for success was there, and they executed.\n\nWhat impressed me most was the way ${winner.name} controlled the tempo from the early innings. They didn't try to do too much, just played smart, fundamental baseball. The ${winner.mascot} got contributions up and down the lineup, and their pitching staff kept ${loser.abbreviation} off balance all afternoon. Another quality win for ${winner.name} -- and the wins are starting to pile up!`,
        `Add another W to the column! ${winner.name} handled business against ${loser.name} with a ${winnerScore}-${loserScore} victory. The ${winner.mascot} controlled the pace of this game for most of the afternoon and never looked too uncomfortable.\n\nIt wasn't flashy, but it was effective -- and at this point in the season, that's all that matters. ${winner.abbreviation} continues to show the kind of consistency that coaches dream about. They might not make SportsCenter every night, but they're racking up wins and building momentum. Sometimes the best teams are the ones that make winning look routine.`,
      );
    } else if (journalist === "sully") {
      bodies.push(
        `${winner.name} did what good teams do today -- they won. A ${winnerScore}-${loserScore} decision over ${loser.name} might not make national headlines, but the ${winner.mascot} will take it and move on. Clean baseball, smart baserunning, and enough pitching to get the job done.\n\n${winner.abbreviation} continues to build momentum, and there's a quiet confidence about this team that I find really compelling. They're not the loudest team in the room, but they're doing their talking on the field. The stat line tells the story: efficient hitting, solid defense, and a pitching staff that knows how to work ahead in the count. That's winning baseball.`,
        `No drama needed -- ${winner.name} just took care of business, beating ${loser.name} ${winnerScore}-${loserScore} in a game that played out about how you'd expect. The ${winner.mascot} were the better team today, and they showed it from the opening pitch.\n\nI've been tracking the advanced numbers on ${winner.abbreviation}, and they're impressive. Their run differential is one of the best in the league, and games like this are why. They don't beat themselves, they make the routine plays, and they capitalize when the other team makes mistakes. That's a recipe for a long, successful season.`,
      );
    } else {
      bodies.push(
        `${winner.name} took a steady ${winnerScore}-${loserScore} victory over ${loser.name} today, and while it might not be the most exciting game I've covered this week, it was exactly the kind of performance that championship-caliber programs deliver consistently.\n\nLooking at the tape, ${winner.abbreviation} executed their game plan with precision. Their starter was efficient, their defense was clean, and the offense got contributions from multiple spots in the lineup. ${loser.abbreviation} competed, but ${winner.name} was just a step ahead all game long. In my opinion, this is a team that's building toward something special -- and games like this are the bricks.`,
        `If I had to describe ${winner.name}'s ${winnerScore}-${loserScore} win over ${loser.name} in one word, it would be "professional." From the first pitch to the last out, the ${winner.mascot} played with purpose, discipline, and a clear understanding of what they needed to do to win.\n\nI've been covering this league long enough to know that the teams who consistently handle their business against beatable opponents are the ones you find standing at the end of the season. ${winner.abbreviation} checked every box today: quality at-bats, efficient pitching, and error-free defense. That's the complete package right there.`,
      );
    }
  }

  if (context.isUpset) {
    titles.length = 0;
    titles.push(
      `UPSET ALERT! ${winner.name} Stuns ${loser.abbreviation}!`,
      `Nobody Saw This Coming! ${winner.abbreviation} Knocks Off ${loser.name}!`,
      `${winner.name} Pulls Off the Upset of the Week Over ${loser.abbreviation}!`,
      `STUNNER: ${winner.abbreviation} Takes Down ${loser.name} in Shocking Fashion!`,
    );
    bodies.length = 0;
    if (journalist === "addie") {
      bodies.push(
        `DID THAT JUST HAPPEN?! The ${winner.name} ${winner.mascot} just pulled off one of the biggest upsets of the season, knocking off the ${loser.name} ${loser.mascot} ${winnerScore}-${loserScore}! Nobody gave ${winner.abbreviation} a chance coming into this one, and they absolutely proved everyone wrong.\n\nThis is why we play the games, people! The underdog came out with fire in their eyes, and the ${loser.mascot} were flat-footed from the jump. I've been saying all season that any team can beat any other team on any given day, and today was living proof. The ${winner.name} locker room must be going absolutely CRAZY right now. What an incredible effort!`,
      );
    } else if (journalist === "sully") {
      bodies.push(
        `I am absolutely floored right now! ${winner.name} came in as the underdog and walked out as the giant slayer, taking down ${loser.name} ${winnerScore}-${loserScore}. The ${winner.mascot} played with nothing to lose and everything to gain, and it showed on every single play.\n\n${loser.abbreviation} has some serious questions to answer after this one. Were they looking past ${winner.name}? Did they not take them seriously enough? Whatever the case, the ${loser.mascot} got a reality check today, and it came in the form of a ${winner.name} team that refused to back down. College baseball is WILD, and I love every minute of it.`,
      );
    } else {
      bodies.push(
        `Well, well, well. If you had ${winner.name} beating ${loser.name} on your bingo card, you might be the only one in the country. A ${winnerScore}-${loserScore} upset that nobody saw coming, and let me tell you, the aftermath is going to be fascinating.\n\nI've been studying the matchup data, and while ${loser.abbreviation} was the clear favorite on paper, the numbers don't account for heart, preparation, and the intangible edge that comes from playing with house money. ${winner.name} was loose, aggressive, and fearless today. Meanwhile, ${loser.name} looked like a team playing scared. In my experience, that dynamic produces upsets more often than people think.`,
      );
    }
  }

  return { title: pick(titles), content: pick(bodies) };
}

function generatePostseasonGameNews(
  winner: Team,
  loser: Team,
  winnerScore: number,
  loserScore: number,
  phase: string,
  journalist: Journalist
): { title: string; content: string } {
  const phaseLabel = phase === "conference_championship" ? "Conference Championship" :
    phase === "super_regionals" ? "Super Regionals" : "College World Series";

  const titles = [
    `${winner.name} Advances in ${phaseLabel} with Win Over ${loser.abbreviation}!`,
    `${winner.abbreviation} Stays Alive! Takes Down ${loser.name} in ${phaseLabel}!`,
    `Postseason Magic! ${winner.name} Eliminates ${loser.abbreviation}!`,
    `${phaseLabel}: ${winner.abbreviation} Punches Their Ticket Past ${loser.name}!`,
  ];

  const bodies: string[] = [];
  if (journalist === "addie") {
    bodies.push(
      `The stakes couldn't be higher, and ${winner.name} delivered! The ${winner.mascot} knocked off ${loser.name} ${winnerScore}-${loserScore} in the ${phaseLabel}, and the celebration was ELECTRIC. Postseason baseball hits different, and ${winner.abbreviation} showed they belong on this stage.\n\n${loser.abbreviation} fought hard, but it just wasn't enough today. The ${winner.mascot} played with a sense of urgency and purpose that you only see in teams that truly believe they can win it all. Every at-bat was focused, every pitch was intentional, and the defense behind their pitcher was spectacular. What a moment for ${winner.name}!`,
      `${phaseLabel} action and ${winner.name} is MOVING ON! A ${winnerScore}-${loserScore} victory over ${loser.name} keeps the ${winner.mascot}' season alive, and honestly? They look like a team of destiny right now.\n\n${loser.abbreviation} gave them a battle, but ${winner.abbreviation} made the plays that matter most in the postseason. The crowd was incredible, the atmosphere was electric, and ${winner.name} fed off every ounce of energy in the building. I'm getting chills just writing this! This team has something special, and I can't wait to see how far they go.`,
    );
  } else if (journalist === "sully") {
    bodies.push(
      `Another day, another postseason thriller! ${winner.name} took care of business against ${loser.name}, winning ${winnerScore}-${loserScore} in the ${phaseLabel}. The ${winner.mascot} showed incredible composure when the pressure was on.\n\nThis team is built for the moment. ${loser.abbreviation} can hold their heads high, but ${winner.abbreviation} is the one dancing tonight. What struck me most was their approach at the plate in big spots -- patient, disciplined, waiting for their pitch. That's not something you can teach; that's something you either have or you don't. And ${winner.name}? They've got it in spades.`,
      `Postseason baseball continues to deliver, and ${winner.name} continues to deliver results! A ${winnerScore}-${loserScore} win over ${loser.name} in the ${phaseLabel} moves the ${winner.mascot} one step closer to the ultimate prize.\n\nI've been charting their postseason numbers, and the trend is clear: ${winner.abbreviation} plays their best baseball when the lights are brightest. Their pitching staff has been dominant, their lineup has been clutch, and their coaching staff has made all the right calls. ${loser.abbreviation} put up a fight, but the ${winner.mascot} are on a mission.`,
    );
  } else {
    bodies.push(
      `If you want to understand what separates ${winner.name} from the pack, you just saw it. A ${winnerScore}-${loserScore} victory over ${loser.name} in the ${phaseLabel} that was equal parts dominant and composed.\n\nI've been tracking this team's trajectory all season, and what I see now is a program that peaked at exactly the right time. Their preparation for this matchup was evident from the first inning -- they knew ${loser.abbreviation}'s tendencies, they exploited the matchups, and they executed under pressure. This is what championship-caliber programs look like. The road ahead only gets harder, but ${winner.abbreviation} has shown they're ready for whatever comes next.`,
    );
  }

  return { title: pick(titles), content: pick(bodies) };
}

function generateCWSChampionNews(champion: Team, runnerUp: Team): { title: string; content: string } {
  const titles = [
    `${champion.name} Wins the College World Series!`,
    `CHAMPIONS! ${champion.abbreviation} Takes Home the Title!`,
    `Dynasty Moment: ${champion.name} Are Your National Champions!`,
  ];

  const bodies = [
    `I'm literally crying right now! The ${champion.name} ${champion.mascot} have won the COLLEGE WORLD SERIES! They defeated the ${runnerUp.name} ${runnerUp.mascot} in an unforgettable championship series, and I don't think anyone in ${champion.city} is sleeping tonight!\n\nFrom the first pitch of the season to the final out, this team believed in each other. What an incredible journey for ${champion.abbreviation}! The coaching staff put together a masterful game plan, the players executed when it mattered most, and the fans created an atmosphere that carried this team through every challenge. Congratulations to everyone involved. THIS is what college baseball is all about!`,
    `Put it in the RECORD BOOKS! ${champion.name} has done it -- they are your College World Series CHAMPIONS! After defeating ${runnerUp.name} in the finals, the ${champion.mascot} can officially call themselves the best team in college baseball.\n\nThis program, this coaching staff, these players -- they put in the work all season long and it paid off in the biggest way possible. ${champion.city} is going to be celebrating for WEEKS! The dynasty continues to grow, and the future looks even brighter. What a season, what a team, what a moment in history!`,
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
      `Alright, listen up, because this is HUGE. ${recruitName}, the ${starLabel} ${position} out of ${hometown}, ${homeState} -- ranked #${classRank} in the class -- has committed to ${team.name}.\n\nI've been tracking this kid since day one, and let me tell you, ${team.abbreviation} just landed a future All-American. The ${team.mascot} coaching staff pulled off a masterclass in recruiting here. This commitment changes the entire landscape. Other programs? Take notes. When you see talent like ${recruitName} on the board, you better come correct, because ${team.name} just showed everyone how it's done.`,
      `I called it. I CALLED IT. ${recruitName}, one of the top ${position}s in the entire country, is heading to ${team.name}. The ${starLabel} prospect out of ${hometown}, ${homeState} had offers from everywhere, but ${team.abbreviation} made the pitch that stuck.\n\nAt #${classRank} in the class, this is the kind of commitment that turns a good recruiting class into a GREAT one. ${team.name} just made a statement, and the rest of the conference heard it loud and clear. The question now is: what does ${team.abbreviation}'s class look like when it's all said and done? Because if they keep recruiting like this, watch out.`,
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
      `Another quality addition for ${team.name}! ${recruitName}, a ${starLabel} ${position} from ${hometown}, ${homeState}, has officially committed to the ${team.mascot}. Ranked #${classRank} in the class, this kid has serious upside and the tools to make an immediate impact.\n\n${team.abbreviation} continues to recruit at a high level, and this commitment is proof that the program is trending in the right direction. The coaching staff has done a phenomenal job selling their vision, and prospects are buying in. Smart pickup that addresses a real need on the roster.`,
      `Mark it down -- ${recruitName} is going to be a name you hear a LOT in ${team.city}. The ${starLabel} ${position} out of ${hometown}, ${homeState} has committed to ${team.name}, and I think this is a steal at #${classRank}.\n\nI've watched the film, I've done the research, and this kid fits ${team.abbreviation}'s system perfectly. The ${team.mascot} are building something special with this class, and ${recruitName} is a key piece of the puzzle. Other programs wanted him, but ${team.name} closed the deal.`,
    ];
    return { title: pick(titles), content: pick(bodies) };
  }

  const titles = [
    `${team.abbreviation} Picks Up ${position} ${recruitName}`,
    `${recruitName} Commits to ${team.name}`,
    `New Addition: ${team.name} Lands ${position} ${recruitName}`,
  ];
  const bodies = [
    `${team.name} adds another piece to the puzzle. ${recruitName}, a ${position} from ${hometown}, ${homeState}, has committed to the ${team.mascot}. Ranked #${classRank} in the class, this might fly under the radar for some, but I see the potential here.\n\n${team.abbreviation} has a knack for developing talent, and ${recruitName} could be a diamond in the rough. Not every great player comes in with five stars next to their name -- sometimes the best ones are the ones who had something to prove. Keep this name on your radar.`,
    `Solid addition for ${team.name} here. ${recruitName}, a ${position} out of ${hometown}, ${homeState}, is headed to ${team.abbreviation}. Not every commit is going to be a five-star headliner, and that's okay.\n\nThe programs that win championships are the ones that find the right fits, and I think ${recruitName} fits what ${team.name} is building. Their coaching staff has a track record of player development that speaks for itself, and I expect ${recruitName} to benefit from that system.`,
  ];
  return { title: pick(titles), content: pick(bodies) };
}

function generateConferenceStandingsNews(
  leader: Team,
  conferenceTeams: { team: Team; wins: number; losses: number }[],
  conferenceName: string,
  journalist: Journalist
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
      content: journalist === "jimbo"
        ? `The numbers don't lie, and right now, they're telling a pretty clear story in the ${conferenceName}. ${top.team.name} sits at ${top.wins}-${top.losses}, a ${gap}-game cushion over ${second.team.name}, and the gap feels even bigger than it looks on paper.\n\nI've been digging into the advanced metrics, and ${top.team.abbreviation}'s dominance extends beyond the win column. Their run differential is elite, their pitching staff leads the conference in ERA, and their lineup is producing at an absurd clip. Unless something dramatic changes, the ${conferenceName} title race might already be over. The rest of the conference needs to figure something out fast, because ${top.team.name} is pulling away.`
        : `Is anyone going to catch ${top.team.name}? The ${top.team.mascot} sit at ${top.wins}-${top.losses} in ${conferenceName} play, holding a ${gap}-game lead over ${second.team.name}. At this point, ${top.team.abbreviation} is making it look easy!\n\nThe rest of the conference better figure something out soon, because the ${top.team.mascot} train isn't slowing down. Every week I keep waiting for them to stumble, and every week they prove me wrong. I love watching a team play with this kind of confidence -- it's contagious, and it's spreading through their entire roster!`,
    };
  }

  if (gap === 0 && top.wins >= 3) {
    return {
      title: `${conferenceName} Race Heating Up Between ${top.team.abbreviation} and ${second.team.abbreviation}!`,
      content: journalist === "jimbo"
        ? `The ${conferenceName} just became appointment viewing. ${top.team.name} and ${second.team.name} are deadlocked at ${top.wins}-${top.losses}, and the remaining schedule is going to determine who walks away with the conference crown.\n\nLooking at their respective strengths, this is a fascinating matchup of styles. ${top.team.abbreviation} relies on pitching and defense, while ${second.team.abbreviation} has been more offense-driven. If these two meet down the stretch, it could be an all-time classic. I've been charting the strength of schedule for both teams, and the edge is razor-thin. This is going to come down to the wire.`
        : `Now THIS is what I'm talking about! ${top.team.name} and ${second.team.name} are locked in a dead heat at the top of the ${conferenceName} standings, both sitting at ${top.wins}-${top.losses}. Every game matters from here on out, and I am HERE for it.\n\nWho's going to blink first? Will the ${top.team.mascot} hold steady, or will ${second.team.abbreviation} make their move? This conference race is going to keep us all on the edge of our seats! I love it when the regular season has this much on the line.`,
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
    content: `IT'S GAMEDAY SEASON! I am SO excited for what's ahead, and I know you are too! The preseason buzz is unreal this year.\n\n${top3[0]?.name || "The favorites"} come in as the team to beat, but don't sleep on ${top3[1]?.name || "the challengers"} and ${top3[2]?.name || "the dark horses"}. As for sleeper picks? Keep your eye on ${dark[0]?.name || "some underdogs"} -- I've got a feeling about them this year. The rosters are loaded, the coaching staffs have been grinding all offseason, and the stage is set for what promises to be an absolutely incredible season of college baseball!\n\nGrab your scorecards, settle in, and get ready. I'll be here every week breaking it all down for you.`,
  };
}

function generateWeekRecapNews(
  results: { winner: Team; loser: Team; winnerScore: number; loserScore: number }[],
  week: number,
  season: number,
  journalist: Journalist
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

  if (journalist === "jimbo") {
    recap += `\n\nLooking at the bigger picture, this week's results have significant implications for conference standings and postseason positioning. The teams that took care of business strengthened their resumes, while the ones that stumbled now have some ground to make up. I'll be watching the next few weeks very closely to see which direction the trends go.`;
  } else if (journalist === "sully") {
    recap += `\n\nThe recruiting trail never sleeps either -- I've been hearing rumblings about some programs making big moves on the trail. Keep your eye on the commitment tracker, because some of these wins on the field are translating directly into wins on the recruiting front.`;
  } else {
    recap += `\n\nWe're only getting started, and I cannot WAIT to see what next week brings! Every week in this league delivers something unexpected, and I have a feeling the surprises are just getting started.`;
  }

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
    `Big news out of ${team.city} -- ${playerName}, the ${stars}-star ${position} for ${team.name}, has officially declared for the MLB Draft. This is a huge loss for the ${team.mascot} program, but you can't blame the kid for chasing his dream.\n\nWith an overall rating of ${overall}, scouts have been drooling over this talent all season. I've been saying it all year: ${playerName} was destined for the next level. The question now is where he'll land and what round he'll go in. Best of luck to him -- ${team.abbreviation} fans will be cheering from the stands!`,
    `The MLB Draft just got more interesting! ${playerName} from ${team.name} has declared, and scouts across the country are already sharpening their pencils. The ${stars}-star ${position} was one of the best players in college baseball, and now he's taking his talents to the professional ranks.\n\n${team.abbreviation} knew this day might come, but it still stings. Losing a player of ${playerName}'s caliber leaves a hole that won't be easy to fill. Time for the coaching staff to adjust the roster and find the next man up. The pipeline has to keep producing, because that's how you stay competitive.`,
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
    `Transfer portal alert! ${playerName}, a ${stars}-star ${position} from ${fromTeam.name}, has entered the portal and is exploring new options. This is a name to watch, folks.\n\nPrograms looking for ${position} help should be picking up the phone right now. The portal is reshaping college baseball before our eyes, and ${playerName} is the latest example. Where will they land? Stay tuned -- I'll be tracking this one closely. In today's landscape, the transfer portal is just as important as high school recruiting.`,
    `Another one hits the portal. ${playerName}, the ${position} from ${fromTeam.name}, is officially looking for a new home. The ${fromTeam.mascot} are going to miss this production, but the portal giveth and the portal taketh away.\n\nI've already got my sources telling me there are programs very interested. This could be a program-changing addition for whoever lands ${playerName}. The portal window moves fast, though, so expect a decision sooner rather than later.`,
  ];
  return { title: pick(titles), content: pick(bodies) };
}

function generatePowerRankingsNews(
  teams: Team[],
  standingsData: any[],
  season: number,
  week: number
): { title: string; content: string } {
  const ranked = teams.map(t => {
    const s = standingsData.find(st => st.teamId === t.id);
    const wins = s?.wins || 0;
    const losses = s?.losses || 0;
    const pct = wins + losses > 0 ? wins / (wins + losses) : 0;
    return { team: t, wins, losses, pct, prestige: t.prestige || 5 };
  }).sort((a, b) => b.pct - a.pct || b.wins - a.wins || b.prestige - a.prestige);

  const top5 = ranked.slice(0, 5);
  const risers = ranked.filter(t => t.wins > t.losses && t.prestige < 6).slice(0, 2);

  let content = `Welcome to Jimbo's Week ${week} Power Rankings! Here's who's hot, who's not, and who's turning heads this season.\n\n`;
  
  top5.forEach((t, i) => {
    content += `${i + 1}. ${t.team.name} (${t.wins}-${t.losses}) -- `;
    if (i === 0) content += `The top spot belongs to the ${t.team.mascot}, and they've earned every bit of it. Dominant on both sides of the ball.\n`;
    else if (i === 1) content += `Right on the heels of the leader. ${t.team.abbreviation} is playing championship-caliber baseball right now.\n`;
    else if (i === 2) content += `Don't look now, but ${t.team.abbreviation} is making a serious case for a top seed.\n`;
    else content += `Solid and steady. The ${t.team.mascot} keep winning and keep climbing.\n`;
  });

  if (risers.length > 0) {
    content += `\nRisers to Watch: ${risers.map(r => `${r.team.name} (${r.wins}-${r.losses})`).join(", ")}. These are the programs that are outperforming their preseason expectations, and I'm here for it.`;
  }

  return {
    title: `Jimbo's Power Rankings: Week ${week}`,
    content,
  };
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

  const enrichedGames = completedGames.map(g => {
    const homeTeam = teams.find(t => t.id === g.homeTeamId);
    const awayTeam = teams.find(t => t.id === g.awayTeamId);
    if (!homeTeam || !awayTeam) return null;
    const homeScore = g.homeScore!;
    const awayScore = g.awayScore!;
    const winner = homeScore > awayScore ? homeTeam : awayTeam;
    const loser = homeScore > awayScore ? awayTeam : homeTeam;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);
    const margin = winnerScore - loserScore;
    const isUpset = (winner.prestige || 5) < (loser.prestige || 5) - 2;
    const combinedPrestige = (homeTeam.prestige || 5) + (awayTeam.prestige || 5);
    let compellingScore = combinedPrestige;
    if (isUpset) compellingScore += 20;
    if (margin <= 2) compellingScore += 10;
    if (margin >= 5) compellingScore += 5;
    return { game: g, homeTeam, awayTeam, winner, loser, winnerScore, loserScore, margin, isUpset, compellingScore, homeScore, awayScore };
  }).filter(Boolean) as any[];

  if (enrichedGames.length === 0) return;

  const isPostseason = phase === "conference_championship" || phase === "super_regionals" || phase === "cws";

  if (isPostseason) {
    for (const eg of enrichedGames) {
      const newsData = generatePostseasonGameNews(eg.winner, eg.loser, eg.winnerScore, eg.loserScore, phase, "addie");
      await storage.createDynastyNews({
        leagueId,
        authorName: ADDIE_NAME,
        title: newsData.title,
        content: newsData.content,
        category: "postseason",
        journalist: "addie",
        season,
        week,
        isAutoGenerated: true,
      });
    }
  } else {
    const bestGame = enrichedGames.sort((a: any, b: any) => b.compellingScore - a.compellingScore)[0];
    if (bestGame) {
      const newsData = generateGameNews(bestGame.winner, bestGame.loser, bestGame.winnerScore, bestGame.loserScore, {
        season,
        week,
        phase,
        isUpset: bestGame.isUpset,
      }, "addie");

      let playerStatLine = "";
      try {
        const allStats = await storage.getPlayerSeasonStatsBySeason(leagueId, season);
        const winnerPlayers = await storage.getPlayersByTeam(bestGame.winner.id);
        const winnerIds = new Set(winnerPlayers.map(p => p.id));
        const winnerStats = allStats.filter(s => winnerIds.has(s.playerId));
        const topBatter = winnerStats.filter(s => (s.hits || 0) > 0).sort((a, b) => (b.hits || 0) - (a.hits || 0))[0];
        const topPitcher = winnerStats.filter(s => (s.inningsPitched || 0) > 0).sort((a, b) => (b.strikeouts || 0) - (a.strikeouts || 0))[0];
        const batPlayer = topBatter ? winnerPlayers.find(p => p.id === topBatter.playerId) : null;
        const pitchPlayer = topPitcher ? winnerPlayers.find(p => p.id === topPitcher.playerId) : null;
        const lines: string[] = [];
        if (batPlayer && topBatter) {
          lines.push(`${batPlayer.firstName} ${batPlayer.lastName} leads the ${bestGame.winner.abbreviation} offense with ${topBatter.hits} hits and ${topBatter.homeRuns || 0} home runs on the season`);
        }
        if (pitchPlayer && topPitcher && pitchPlayer.id !== batPlayer?.id) {
          lines.push(`${pitchPlayer.firstName} ${pitchPlayer.lastName} has been dominant on the mound with ${topPitcher.strikeouts} strikeouts this year`);
        }
        if (lines.length > 0) {
          playerStatLine = "\n\nBy the numbers: " + lines.join(". ") + ".";
        }
      } catch {}

      await storage.createDynastyNews({
        leagueId,
        authorName: ADDIE_NAME,
        title: newsData.title,
        content: newsData.content + playerStatLine,
        category: "game",
        journalist: "addie",
        season,
        week,
        isAutoGenerated: true,
      });
    }
  }

  if (completedGames.length >= 2 && !isPostseason) {
    const recapResults = enrichedGames.map((eg: any) => ({
      winner: eg.winner,
      loser: eg.loser,
      winnerScore: eg.winnerScore,
      loserScore: eg.loserScore,
    }));

    const recap = generateWeekRecapNews(recapResults, week, season, "jimbo");
    if (recap) {
      await storage.createDynastyNews({
        leagueId,
        authorName: JIMBO_NAME,
        title: recap.title,
        content: recap.content,
        category: "recap",
        journalist: "jimbo",
        season,
        week,
        isAutoGenerated: true,
      });
    }
  }

  if (week % 4 === 0 && !isPostseason) {
    const powerRankings = generatePowerRankingsNews(teams, standingsData, season, week);
    await storage.createDynastyNews({
      leagueId,
      authorName: JIMBO_NAME,
      title: powerRankings.title,
      content: powerRankings.content,
      category: "rankings",
      journalist: "jimbo",
      season,
      week,
      isAutoGenerated: true,
    });
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
  if (stars < 3 && overall < 400) return;

  const newsData = generateDraftDeclarationNews(playerName, position, team, overall, stars);
  await storage.createDynastyNews({
    leagueId,
    authorName: SULLY_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "transaction",
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
  const newsData = generateTransferPortalNews(playerName, position, fromTeam, stars);
  await storage.createDynastyNews({
    leagueId,
    authorName: SULLY_NAME,
    title: newsData.title,
    content: newsData.content,
    category: "transaction",
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
      conf.name,
      "jimbo"
    );

    if (newsData) {
      await storage.createDynastyNews({
        leagueId,
        authorName: JIMBO_NAME,
        title: newsData.title,
        content: newsData.content,
        category: "conference",
        journalist: "jimbo",
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
    content += `And ${transferPortal} player${transferPortal > 1 ? 's are' : ' is'} looking for new homes in the transfer portal. `;
  }
  content += `\n\nEvery departure creates an opportunity, and that's what makes the offseason so fascinating. New players will step into bigger roles, recruits will fill the gaps, and by the time next season rolls around, every roster in the league will look different. Stay tuned -- the offseason never sleeps!`;

  await storage.createDynastyNews({
    leagueId,
    authorName: ADDIE_NAME,
    title: `Offseason Shake-Up: ${total} Players Moving On`,
    content,
    category: "offseason",
    journalist: "addie",
    season,
    isAutoGenerated: true,
  });
}
