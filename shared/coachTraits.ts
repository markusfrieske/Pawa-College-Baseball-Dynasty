export interface PersonalityType {
  id: string;
  name: string;
  description: string;
  archetypes: string[];
}

export const PERSONALITY_TYPES: PersonalityType[] = [
  {
    id: "players_coach",
    name: "The Players' Coach",
    description: "Players run through walls for you. Your locker room is tight and your culture is everything.",
    archetypes: ["Player's Coach", "Balanced"],
  },
  {
    id: "disciplinarian",
    name: "The Disciplinarian",
    description: "High standards, no excuses. Your program earns its reputation through accountability.",
    archetypes: ["Old School", "Academic Dean"],
  },
  {
    id: "innovator",
    name: "The Innovator",
    description: "You see angles others miss. Analytics, matchups, tendencies — always one step ahead.",
    archetypes: ["Tactician", "Pure CEO"],
  },
  {
    id: "grinder",
    name: "The Grinder",
    description: "Outwork everyone. Your staff scouts harder, recruits longer, and prepares deeper.",
    archetypes: ["Scout Master"],
  },
  {
    id: "showman",
    name: "The Showman",
    description: "High energy, magnetic personality. You turn heads in living rooms and on signing day.",
    archetypes: ["Dealmaker"],
  },
];

export function getPersonalityForArchetype(archetype: string): PersonalityType {
  const match = PERSONALITY_TYPES.find(p => p.archetypes.includes(archetype));
  return match ?? PERSONALITY_TYPES[0];
}

export interface TraitBadge {
  id: string;
  name: string;
  description: string;
  tier: "gold" | "silver" | "bronze";
  category: "recruiting" | "development" | "program" | "game";
}

export const TRAIT_BADGES: TraitBadge[] = [
  // Gold
  { id: "national_legend", name: "National Legend", description: "Won the College World Series", tier: "gold", category: "program" },
  { id: "five_star_whisperer", name: "5★ Whisperer", description: "Elite program that attracts blue-chip talent", tier: "gold", category: "recruiting" },
  { id: "dynasty_builder", name: "Dynasty Builder", description: "Built a program from nothing into a powerhouse", tier: "gold", category: "program" },
  { id: "draft_guru", name: "Draft Guru", description: "Developed more MLB draft picks than anyone in the league", tier: "gold", category: "development" },
  // Silver
  { id: "conference_king", name: "Conference King", description: "Multiple conference championships to their name", tier: "silver", category: "program" },
  { id: "pit_bull_recruiter", name: "Pit Bull Recruiter", description: "Relentless on the recruiting trail, never stops fighting", tier: "silver", category: "recruiting" },
  { id: "iron_evaluator", name: "Iron Evaluator", description: "Elite eye for talent — sees what others miss", tier: "silver", category: "recruiting" },
  { id: "development_machine", name: "Development Machine", description: "Players get measurably better every season", tier: "silver", category: "development" },
  { id: "closer", name: "The Closer", description: "Rarely loses a committed recruit once they're in the pipeline", tier: "silver", category: "recruiting" },
  // Bronze
  { id: "consistent_winner", name: "Consistent Winner", description: "Reliable. Shows up every season", tier: "bronze", category: "program" },
  { id: "recruiting_ace", name: "Recruiting Ace", description: "Year-in, year-out brings in strong classes", tier: "bronze", category: "recruiting" },
  { id: "community_builder", name: "Community Builder", description: "Exceptional team culture and player satisfaction", tier: "bronze", category: "development" },
  { id: "game_manager", name: "Game Manager", description: "Puts players in position to succeed situationally", tier: "bronze", category: "game" },
];

export function getTraitBadgesForArchetype(archetype: string): string[] {
  const byArchetype: Record<string, string[]> = {
    "Balanced":        ["consistent_winner", "recruiting_ace", "game_manager"],
    "Pure CEO":        ["conference_king", "consistent_winner", "pit_bull_recruiter"],
    "Player's Coach":  ["community_builder", "recruiting_ace", "closer"],
    "Tactician":       ["game_manager", "iron_evaluator", "consistent_winner"],
    "Old School":      ["consistent_winner", "game_manager", "development_machine"],
    "Scout Master":    ["iron_evaluator", "recruiting_ace", "pit_bull_recruiter"],
    "Academic Dean":   ["community_builder", "consistent_winner", "development_machine"],
    "Dealmaker":       ["pit_bull_recruiter", "closer", "recruiting_ace"],
  };
  return byArchetype[archetype] ?? ["consistent_winner", "recruiting_ace"];
}

export interface CoachingPhilosophy {
  statement: string;
  importance: "extremely" | "very" | "somewhat";
}

export function getPhilosophyForArchetype(archetype: string): CoachingPhilosophy[] {
  const byArchetype: Record<string, CoachingPhilosophy[]> = {
    "Balanced": [
      { statement: "Recruit for the Long Term", importance: "extremely" },
      { statement: "Build Team Chemistry", importance: "very" },
      { statement: "Play Small Ball", importance: "somewhat" },
    ],
    "Pure CEO": [
      { statement: "Win Now", importance: "extremely" },
      { statement: "Elite Program Standards", importance: "very" },
      { statement: "Build a National Brand", importance: "somewhat" },
    ],
    "Player's Coach": [
      { statement: "Player Development First", importance: "extremely" },
      { statement: "Positive Culture", importance: "very" },
      { statement: "Trust the Process", importance: "somewhat" },
    ],
    "Tactician": [
      { statement: "Pitching Wins Championships", importance: "extremely" },
      { statement: "Game Management Mastery", importance: "very" },
      { statement: "Exploit Every Matchup", importance: "somewhat" },
    ],
    "Old School": [
      { statement: "Play the Right Way", importance: "extremely" },
      { statement: "Defense and Pitching", importance: "very" },
      { statement: "Earn Everything", importance: "somewhat" },
    ],
    "Scout Master": [
      { statement: "Scouting Advantage", importance: "extremely" },
      { statement: "Find Hidden Gems", importance: "very" },
      { statement: "Build Through Recruiting", importance: "somewhat" },
    ],
    "Academic Dean": [
      { statement: "Academic Excellence", importance: "extremely" },
      { statement: "Graduation Rate Matters", importance: "very" },
      { statement: "Character Counts", importance: "somewhat" },
    ],
    "Dealmaker": [
      { statement: "Land the Blue Chips", importance: "extremely" },
      { statement: "NIL Budget Mastery", importance: "very" },
      { statement: "Close Every Deal", importance: "somewhat" },
    ],
  };
  return byArchetype[archetype] ?? byArchetype["Balanced"];
}

export interface CareerMilestone {
  id: string;
  name: string;
  description: string;
  tier: "gold" | "silver" | "bronze";
  category: "wins" | "recruiting" | "postseason" | "development" | "career";
}

export interface MilestoneEntry {
  id: string;
  season: number;
}

export const CAREER_MILESTONES: CareerMilestone[] = [
  // Bronze milestones
  { id: "first_win", name: "First Win", description: "Won your first career game", tier: "bronze", category: "wins" },
  { id: "first_season", name: "First Season", description: "Completed your first full season", tier: "bronze", category: "career" },
  { id: "first_signing", name: "First Signing", description: "Signed your first recruit", tier: "bronze", category: "recruiting" },
  { id: "winning_record", name: "Winning Record", description: "Finished a season above .500", tier: "bronze", category: "wins" },
  { id: "ten_wins", name: "10-Win Season", description: "Won 10+ games in a season", tier: "bronze", category: "wins" },
  { id: "signed_3star", name: "Signed a 3-Star", description: "Signed your first 3-star recruit", tier: "bronze", category: "recruiting" },
  { id: "level_5", name: "Experienced Coach", description: "Reached coach level 5", tier: "bronze", category: "career" },
  // Silver milestones
  { id: "wins_50", name: "50-Win Club", description: "Reached 50 career wins", tier: "silver", category: "wins" },
  { id: "wins_100", name: "100-Win Club", description: "Reached 100 career wins", tier: "silver", category: "wins" },
  { id: "first_conf_championship", name: "Conference Champion", description: "Won your first conference championship", tier: "silver", category: "postseason" },
  { id: "first_cws", name: "CWS Appearance", description: "Made your first College World Series", tier: "silver", category: "postseason" },
  { id: "signed_4star", name: "Signed a 4-Star", description: "Signed your first 4-star recruit", tier: "silver", category: "recruiting" },
  { id: "first_draft_pick", name: "First Draft Pick", description: "Developed your first MLB draft pick", tier: "silver", category: "development" },
  { id: "twenty_win_season", name: "20-Win Season", description: "Won 20+ games in a single season", tier: "silver", category: "wins" },
  { id: "all_american_coach", name: "All-American Coach", description: "Had a player named All-American", tier: "silver", category: "development" },
  { id: "level_10", name: "Elite Coach", description: "Reached coach level 10", tier: "silver", category: "career" },
  // Gold milestones
  { id: "national_champion", name: "National Champion", description: "Won the College World Series", tier: "gold", category: "postseason" },
  { id: "signed_5star", name: "Signed a 5-Star", description: "Signed your first 5-star recruit", tier: "gold", category: "recruiting" },
  { id: "dynasty_five_seasons", name: "Dynasty Builder", description: "Coached the same program for 5+ seasons", tier: "gold", category: "career" },
  { id: "wins_250", name: "Coaching Legend", description: "Reached 250 career wins", tier: "gold", category: "wins" },
  { id: "five_draft_picks", name: "MLB Feeder Program", description: "Developed 5+ MLB draft picks", tier: "gold", category: "development" },
  { id: "three_conf_championships", name: "Conference Dynasty", description: "Won 3+ conference championships", tier: "gold", category: "postseason" },
  { id: "signed_blue_chip", name: "Blue Chip Closer", description: "Signed a Blue Chip 5-star recruit", tier: "gold", category: "recruiting" },
];

/**
 * Evaluate which career milestones a coach has earned.
 * Returns a full {id, season} array — preserving existing unlock seasons and
 * stamping newly unlocked milestones with the provided currentSeason.
 *
 * @param coach        - Career stats used to evaluate condition milestones
 * @param recruiting   - Aggregated recruiting data for star-tier milestones
 * @param currentSeason - The season to stamp on newly-unlocked milestones
 */
export function evaluateMilestones(
  coach: {
    careerWins: number;
    careerLosses: number;
    level: number;
    confChampionships: number;
    cwsAppearances: number;
    nationalChampionships: number;
    allAmericans: number;
    draftPicks: number;
    careerMilestones?: MilestoneEntry[] | null;
    seasonsCoached?: number;
    bestSeasonWins?: number;
  },
  recruiting: {
    totalSigned: number;
    threeStars: number;
    fourStars: number;
    fiveStars: number;
    blueChipsSigned: number;
  } = { totalSigned: 0, threeStars: 0, fourStars: 0, fiveStars: 0, blueChipsSigned: 0 },
  currentSeason = 1,
): MilestoneEntry[] {
  const existing = new Map<string, number>(
    (coach.careerMilestones ?? []).map(m => [m.id, m.season])
  );

  const result: MilestoneEntry[] = [...existing.entries()].map(([id, season]) => ({ id, season }));

  const totalGames = coach.careerWins + coach.careerLosses;
  const bestSeasonWins = coach.bestSeasonWins ?? 0;

  const check = (id: string, condition: boolean) => {
    if (condition && !existing.has(id)) {
      result.push({ id, season: currentSeason });
    }
  };

  // Wins-based — career totals
  check("first_win", coach.careerWins >= 1);
  check("winning_record", coach.careerWins > coach.careerLosses && totalGames > 0);
  check("wins_50", coach.careerWins >= 50);
  check("wins_100", coach.careerWins >= 100);
  check("wins_250", coach.careerWins >= 250);
  // Single-season win thresholds — require per-season history data
  check("ten_wins", bestSeasonWins >= 10);
  check("twenty_win_season", bestSeasonWins >= 20);

  // Career progression
  check("first_season", (coach.seasonsCoached ?? 0) >= 1);
  check("level_5", coach.level >= 5);
  check("level_10", coach.level >= 10);
  check("dynasty_five_seasons", (coach.seasonsCoached ?? 0) >= 5);

  // Postseason
  check("first_conf_championship", coach.confChampionships >= 1);
  check("three_conf_championships", coach.confChampionships >= 3);
  check("first_cws", coach.cwsAppearances >= 1);
  check("national_champion", coach.nationalChampionships >= 1);

  // Development
  check("all_american_coach", coach.allAmericans >= 1);
  check("first_draft_pick", coach.draftPicks >= 1);
  check("five_draft_picks", coach.draftPicks >= 5);

  // Recruiting — driven by actual aggregated signing data
  check("first_signing", recruiting.totalSigned >= 1);
  check("signed_3star", recruiting.threeStars >= 1);
  check("signed_4star", recruiting.fourStars >= 1);
  check("signed_5star", recruiting.fiveStars >= 1);
  check("signed_blue_chip", recruiting.blueChipsSigned >= 1);

  return result;
}

export interface ArchetypeMetadata {
  name: string;
  tagline: string;
  description: string;
  bonuses: string[];
  penalties: string[];
  personalityAlignment: string;
}

export const ARCHETYPE_METADATA: Record<string, ArchetypeMetadata> = {
  "Balanced": {
    name: "Balanced",
    tagline: "The Complete Package",
    description: "No glaring weaknesses, no dominant strength. Wins through consistency and adaptability.",
    bonuses: ["Competitive across all recruiting categories", "Solid at both hitting and pitching development"],
    penalties: ["No specialized advantage in recruiting battles"],
    personalityAlignment: "The Players' Coach",
  },
  "Pure CEO": {
    name: "Pure CEO",
    tagline: "Program Over Everything",
    description: "You run your program like a business. Relationships are assets, wins are the bottom line.",
    bonuses: ["+15% prestige bonus on all visits", "Campus visits generate 20% more interest"],
    penalties: ["Lower player development floor"],
    personalityAlignment: "The Innovator",
  },
  "Player's Coach": {
    name: "Player's Coach",
    tagline: "They Run Through Walls For You",
    description: "Deep player relationships drive everything. Retention is elite and locker room morale is contagious.",
    bonuses: ["+15% phone call interest gain", "+20% retention probability"],
    penalties: ["Weaker closing ability on cold prospects"],
    personalityAlignment: "The Players' Coach",
  },
  "Tactician": {
    name: "Tactician",
    tagline: "The Chess Master",
    description: "Sees the game three moves ahead. Players trust your system and buy in completely.",
    bonuses: ["+15% pitching recruiting bonus", "20% improvement in Head Coach visit effectiveness"],
    penalties: ["Weaker on social/culture recruiting pitches"],
    personalityAlignment: "The Innovator",
  },
  "Old School": {
    name: "Old School",
    tagline: "Respect the Game",
    description: "Your program demands character, discipline, and accountability. It shows on the field.",
    bonuses: ["+10% proximity bonus across all actions", "+10% hitting recruiting bonus"],
    penalties: ["Weaker NIL leverage in bidding wars"],
    personalityAlignment: "The Disciplinarian",
  },
  "Scout Master": {
    name: "Scout Master",
    tagline: "I'll Find Them First",
    description: "You find talent before anyone else knows it exists. The scouting advantage is real.",
    bonuses: ["+15% evaluation skill effectiveness", "+25% scouting speed"],
    penalties: ["Weaker marketing/brand recruiting pitches"],
    personalityAlignment: "The Grinder",
  },
  "Academic Dean": {
    name: "Academic Dean",
    tagline: "Student First, Athlete Second",
    description: "Academic fit matters. You attract players who want to graduate — and they do.",
    bonuses: ["+15% academics-minded prospect interest", "+10% player retention rate"],
    penalties: ["Weaker pull on pure athletic development recruits"],
    personalityAlignment: "The Disciplinarian",
  },
  "Dealmaker": {
    name: "Dealmaker",
    tagline: "I'll Get It Done",
    description: "Elite closer. You make offer calls at the perfect moment and rarely walk away empty-handed.",
    bonuses: ["+15% scholarship offer interest gain", "+20% blue chip prospect interest"],
    penalties: ["Weaker long-term development reputation"],
    personalityAlignment: "The Showman",
  },
};

/**
 * One-line gameplay descriptions for each coaching philosophy statement.
 * Keyed by the exact statement string used in getPhilosophyForArchetype().
 */
export const PHILOSOPHY_DESCRIPTIONS: Record<string, string> = {
  "Recruit for the Long Term":   "+10% email/phone gain with early-pipeline recruits (stages 1–3)",
  "Build Team Chemistry":        "+12% campus visit interest gain; +8% transfer retention chance",
  "Play Small Ball":             "+0.35 run execution bonus in game simulation; minor flat recruiting bonus",
  "Win Now":                     "+14% scholarship offer interest gain",
  "Elite Program Standards":     "+12% campus visit conversion rate",
  "Build a National Brand":      "+7% bonus on all actions with out-of-state recruits",
  "Player Development First":    "+14% email/phone for development-minded recruits; +6% for all others; improves potential range reveal",
  "Positive Culture":            "+12% campus visit; +4% email/phone; +8% transfer retention chance",
  "Trust the Process":           "+7% email/phone/offer gain with mid-pipeline recruits (stage 3+); +4% retention bonus",
  "Pitching Wins Championships": "+14% head coach visit bonus with pitching recruits",
  "Game Management Mastery":     "+12% head coach visit effectiveness overall",
  "Exploit Every Matchup":       "+5% email/phone; +4% scouting reveal; improved potential narrowing",
  "Play the Right Way":          "+14% bonus on all actions with same-state recruits (+7% same region); +4% retention",
  "Defense and Pitching":        "+12% phone call bonus with pitching recruits",
  "Earn Everything":             "+7% HC visit and campus visit effectiveness; +5% retention chance",
  "Scouting Advantage":          "+10% scouting reveal per action (primary); +4% email/phone (secondary)",
  "Find Hidden Gems":            "+12% scouting reveal on 1–2★ recruits; improved potential narrowing; +5% email/phone",
  "Build Through Recruiting":    "+5% email/phone; +5% scouting reveal per action",
  "Academic Excellence":         "+14% on all actions with academics-priority recruits",
  "Graduation Rate Matters":     "+12% campus visit interest gain; +8% transfer retention chance",
  "Character Counts":            "+8% email/phone with academics-focused recruits",
  "Land the Blue Chips":         "+14% offer interest with 4★+ and blue-chip recruits",
  "NIL Budget Mastery":          "Offer gain scales with remaining NIL budget: +18% (full) to +6% (depleted)",
  "Close Every Deal":            "+7% on all actions with recruits in late pipeline (stage 4+)",
};
