import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR, enforceGoldOvrGate } from "@shared/abilities";
import type { InsertRecruit } from "@shared/schema";
import { assignTrajectory } from "@shared/trajectory";
import { normalizeCommonAbilities } from "./normalizeCommonAbilities";
import { assignPitcherArchetype, generateArchetypePitchMix, qualityTierFromStars, noPitches } from "./pitchMixHelpers";

export const HITTER_TOOL_GROUPS: Record<string, string[]> = {
  Speed:    ["running", "stealing"],
  Power:    ["power"],
  Hit:      ["hitForAvg", "clutch", "wRISP"],
  Fielding: ["fielding", "agile", "errorResistance"],
  Arm:      ["arm", "throwing"],
};

export const PITCHER_TOOL_GROUPS: Record<string, string[]> = {
  Control:  ["control"],
  Stuff:    ["stuff"],
  Stamina:  ["stamina"],
};

export function selectTools(starRank: number, isPitcher: boolean): string[] {
  const groups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
  const allToolNames = Object.keys(groups);

  let count: number;
  switch (starRank) {
    case 5:  count = 3 + Math.floor(Math.random() * 3); break;
    case 4:  count = 2 + Math.floor(Math.random() * 3); break;
    case 3:  count = 1 + Math.floor(Math.random() * 3); break;
    case 2:  count = 1 + Math.floor(Math.random() * 2); break;
    default: count = Math.random() < 0.5 ? 1 : 0;     break;
  }
  count = Math.min(count, allToolNames.length);
  if (count === 0) return [];
  const shuffled = [...allToolNames].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function selectRawTools(isPitcher: boolean): string[] {
  const groups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
  const allToolNames = Object.keys(groups);
  const count = 2 + Math.floor(Math.random() * 2);
  const shuffled = [...allToolNames].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, allToolNames.length));
}

export function sampleNormalSpeed(mean = 55, sd = 13, lo = 10, hi = 95): number {
  // Box-Muller transform for a normally-distributed speed value
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(lo, Math.min(hi, Math.round(mean + z * sd)));
}

export function sampleNormalVelocity(mean = 55, sd = 11, lo = 30, hi = 95): number {
  // Box-Muller transform for a normally-distributed pitcher velocity value
  // mean=55 ≈ D1 average ~89 mph fastball; SD=11; clamp [30, 95]
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(lo, Math.min(hi, Math.round(mean + z * sd)));
}

export function genToolAttr(base: number, isTool: boolean): number {
  if (isTool) {
    const boost = 18 + Math.floor(Math.random() * 25);
    return Math.max(10, Math.min(99, base + boost));
  } else {
    const penalty = 5 + Math.floor(Math.random() * 6);
    return Math.max(10, Math.min(99, base - penalty));
  }
}

function genRawToolAttr(base: number, isTool: boolean): number {
  if (isTool) {
    const boost = 18 + Math.floor(Math.random() * 25);
    return Math.max(10, Math.min(99, base + boost));
  } else {
    const penalty = 15 + Math.floor(Math.random() * 16);
    return Math.max(10, Math.min(99, base - penalty));
  }
}

export type RecruitingTheme =
  | "high_velocity"
  | "sluggers"
  | "balanced"
  | "top_heavy"
  | "hidden_gems"
  | "bust_heavy"
  | "elite_pitching"
  | "raw_talent"
  | "position_players"
  | "defense_first"
  | "power_class"
  | "speed_class";

export function getRandomRecruitingTheme(): RecruitingTheme {
  const themes: RecruitingTheme[] = [
    "high_velocity", "sluggers", "balanced", "top_heavy", "hidden_gems",
    "bust_heavy", "elite_pitching", "raw_talent",
    "position_players", "defense_first", "power_class", "speed_class",
  ];
  return themes[Math.floor(Math.random() * themes.length)];
}

function rollWeighted<T>(entries: { value: T; weight: number }[]): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

function getRandomAppearance() {
  const skinTones = ["light", "light", "medium", "medium", "tan", "olive", "dark", "deep"];
  const hairColors = ["black", "brown", "blonde", "red", "gray"];
  const hairStyles = ["short", "buzz", "medium", "fade", "curly", "mullet", "long", "bald"];
  const headwears = ["cap", "helmet", "batting_helmet", "none"];
  const facialHairs = ["none", "none", "none", "none", "none", "stubble", "stubble", "goatee", "mustache"];
  const eyeStyles = ["standard", "standard", "narrow", "wide", "heavy"];
  const eyebrowStyles = ["flat", "flat", "arched", "thick", "furrowed"];
  const mouthStyles = ["neutral", "neutral", "smile", "smirk"];
  const eyeBlack = Math.random() < 0.15;
  return {
    skinTone:     skinTones[Math.floor(Math.random() * skinTones.length)],
    hairColor:    hairColors[Math.floor(Math.random() * hairColors.length)],
    hairStyle:    hairStyles[Math.floor(Math.random() * hairStyles.length)],
    headwear:     headwears[Math.floor(Math.random() * headwears.length)],
    facialHair:   facialHairs[Math.floor(Math.random() * facialHairs.length)],
    eyeStyle:     eyeStyles[Math.floor(Math.random() * eyeStyles.length)],
    eyebrowStyle: eyebrowStyles[Math.floor(Math.random() * eyebrowStyles.length)],
    mouthStyle:   mouthStyles[Math.floor(Math.random() * mouthStyles.length)],
    eyeBlack,
  };
}

export interface GenerateRecruitClassOptions {
  theme?: RecruitingTheme;
  isLegacyClass?: boolean;
  // Wizard config overrides
  wizardStarDistribution?: {
    blueChip: number; five: number; four: number; three: number; two: number; one: number;
  };
  wizardSpecialCounts?: {
    gems: number; busts: number; genGems: number; genBusts: number;
    blueChips: number; jucos: number; rawPlayers: number;
  };
  wizardPositionDistribution?: Partial<Record<string, number>>;
  wizardForcedType?: {
    isBlueChip?: boolean; isGem?: boolean; isBust?: boolean;
    isGenGem?: boolean; isGenBust?: boolean; isRaw?: boolean; starRank?: number;
  };
  wizardRegionSkew?: string;
  // OVR controls
  wizardOvrMin?: number;
  wizardOvrMax?: number;
  wizardOvrAverage?: number;
  wizardOvrDistribution?: "bell" | "top_heavy" | "bottom_heavy" | "flat";
}

export type GeneratedRecruit = Omit<InsertRecruit, "leagueId">;

// SP/C/SS/OF command premium NIL (SP = starting pitcher; OF approximates CF
// since the game uses a single OF bucket rather than CF/LF/RF).
const NIL_PREMIUM_POSITIONS = new Set(["SP", "C", "SS", "OF"]);
// RP/CP and 1B are utility/bench positions that command below-average NIL.
const NIL_UTILITY_POSITIONS = new Set(["RP", "CP", "1B"]);

// Geographic NIL market tiers — high-supply/high-demand states command a
// premium because scouts compete more intensely for their talent.
// Tier A: top baseball states (1.20–1.25×)
const NIL_GEO_TIER_A = new Set(["CA", "TX", "FL", "GA", "NC"]);
// Tier B: strong secondary markets (1.08–1.12×)
const NIL_GEO_TIER_B = new Set(["AZ", "LA", "SC", "TN", "VA", "AL", "MS", "OK"]);
// Tier D: low baseball participation states (0.88–0.93×)
const NIL_GEO_TIER_D = new Set(["AK", "ND", "SD", "MT", "WY", "VT", "ME", "NH", "RI", "WV", "ID"]);

function getGeoMultiplier(homeState: string): number {
  if (NIL_GEO_TIER_A.has(homeState)) return 1.20 + Math.random() * 0.05;
  if (NIL_GEO_TIER_B.has(homeState)) return 1.08 + Math.random() * 0.04;
  if (NIL_GEO_TIER_D.has(homeState)) return 0.88 + Math.random() * 0.05;
  return 1.0;
}

function generateNilCost(
  displayedStar: number,
  isBlueChip: boolean,
  isGenerationalGem: boolean,
  isGenerationalBust: boolean,
  position: string = "SP",
  homeState: string = "",
): number {
  if (isGenerationalBust) {
    return Math.floor(5000 + Math.random() * 25000);
  }
  // Tighter ranges than before — adjacent tiers overlap by ~10% of range
  // so NIL is a meaningful signal of the recruit's displayed star level
  // without being a perfect decoder.
  const ranges: [number, number][] = [
    [5000,   35000],   // 1★  ($5k–$35k)
    [25000,  100000],  // 2★  ($25k–$100k, ~$10k overlap with 1★ top)
    [75000,  250000],  // 3★  ($75k–$250k, ~$25k overlap with 2★ top)
    [200000, 550000],  // 4★  ($200k–$550k, ~$50k overlap with 3★ top)
    [400000, 900000],  // 5★  ($400k–$900k, ~$150k overlap with 4★ top)
  ];
  const idx = Math.min(4, Math.max(0, displayedStar - 1));
  const [min, max] = ranges[idx];
  const baseCost = Math.floor(min + Math.random() * (max - min));

  // Three-tier position multiplier:
  //   Premium (SP, C, SS, OF): 1.10–1.25×
  //   Average (2B, 3B):        1.0×
  //   Utility/bench (RP, CP, 1B): 0.85–0.95×
  let posMultiplier: number;
  if (NIL_PREMIUM_POSITIONS.has(position)) {
    posMultiplier = 1.10 + Math.random() * 0.15;
  } else if (NIL_UTILITY_POSITIONS.has(position)) {
    posMultiplier = 0.85 + Math.random() * 0.10;
  } else {
    posMultiplier = 1.0;
  }

  const geoMultiplier = getGeoMultiplier(homeState);
  const adjusted = Math.floor(baseCost * posMultiplier * geoMultiplier);

  if (isGenerationalGem) return Math.floor(adjusted * (3 + Math.random() * 2));
  if (isBlueChip) return Math.floor(adjusted * (1.5 + Math.random() * 1.0));
  return adjusted;
}

export function generateRecruitClass(
  count: number,
  opts: GenerateRecruitClassOptions = {},
): GeneratedRecruit[] {
  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb", "Jayden", "Bryce", "Hunter", "Chase", "Trey"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Walker", "Hall", "Young", "King"];
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "OF", "OF", "OF", "OF", "OF", "OF"];
  const stateData: { state: string; cities: string[]; pct: number }[] = [
    { state: "AL", cities: ["Birmingham", "Tuscaloosa", "Mobile", "Huntsville"], pct: 1.5 },
    { state: "AK", cities: ["Anchorage", "Fairbanks", "Juneau"], pct: 0.1 },
    { state: "AZ", cities: ["Phoenix", "Tucson", "Scottsdale", "Mesa"], pct: 3.0 },
    { state: "AR", cities: ["Little Rock", "Fayetteville", "Fort Smith"], pct: 1.0 },
    { state: "CA", cities: ["Los Angeles", "San Diego", "San Francisco", "Sacramento", "Fresno", "Long Beach"], pct: 24.0 },
    { state: "CO", cities: ["Denver", "Colorado Springs", "Boulder"], pct: 0.8 },
    { state: "CT", cities: ["Hartford", "New Haven", "Stamford"], pct: 0.6 },
    { state: "DE", cities: ["Wilmington", "Dover", "Newark"], pct: 0.2 },
    { state: "FL", cities: ["Miami", "Tampa", "Orlando", "Jacksonville", "Fort Lauderdale", "Gainesville"], pct: 16.0 },
    { state: "GA", cities: ["Atlanta", "Savannah", "Augusta", "Marietta", "Athens", "Macon"], pct: 6.5 },
    { state: "HI", cities: ["Honolulu", "Hilo", "Pearl City"], pct: 0.3 },
    { state: "ID", cities: ["Boise", "Nampa", "Idaho Falls"], pct: 0.2 },
    { state: "IL", cities: ["Chicago", "Springfield", "Champaign", "Peoria"], pct: 2.5 },
    { state: "IN", cities: ["Indianapolis", "Bloomington", "Fort Wayne", "South Bend"], pct: 1.2 },
    { state: "IA", cities: ["Des Moines", "Iowa City", "Cedar Rapids"], pct: 0.5 },
    { state: "KS", cities: ["Wichita", "Lawrence", "Topeka"], pct: 0.7 },
    { state: "KY", cities: ["Louisville", "Lexington", "Bowling Green"], pct: 1.2 },
    { state: "LA", cities: ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette"], pct: 2.0 },
    { state: "ME", cities: ["Portland", "Bangor", "Augusta"], pct: 0.1 },
    { state: "MD", cities: ["Baltimore", "College Park", "Annapolis"], pct: 1.2 },
    { state: "MA", cities: ["Boston", "Worcester", "Cambridge"], pct: 0.8 },
    { state: "MI", cities: ["Detroit", "Ann Arbor", "Grand Rapids", "Lansing"], pct: 1.5 },
    { state: "MN", cities: ["Minneapolis", "St. Paul", "Rochester"], pct: 0.8 },
    { state: "MS", cities: ["Jackson", "Oxford", "Starkville", "Hattiesburg"], pct: 1.5 },
    { state: "MO", cities: ["St. Louis", "Kansas City", "Columbia", "Springfield"], pct: 1.5 },
    { state: "MT", cities: ["Billings", "Missoula", "Great Falls"], pct: 0.1 },
    { state: "NE", cities: ["Omaha", "Lincoln", "Grand Island"], pct: 0.5 },
    { state: "NV", cities: ["Las Vegas", "Reno", "Henderson"], pct: 0.8 },
    { state: "NH", cities: ["Manchester", "Concord", "Nashua"], pct: 0.2 },
    { state: "NJ", cities: ["Newark", "Trenton", "Jersey City", "Princeton"], pct: 3.0 },
    { state: "NM", cities: ["Albuquerque", "Santa Fe", "Las Cruces"], pct: 0.4 },
    { state: "NY", cities: ["New York", "Buffalo", "Syracuse", "Albany"], pct: 2.5 },
    { state: "NC", cities: ["Charlotte", "Raleigh", "Durham", "Greensboro", "Wilmington"], pct: 4.0 },
    { state: "ND", cities: ["Fargo", "Bismarck", "Grand Forks"], pct: 0.1 },
    { state: "OH", cities: ["Columbus", "Cincinnati", "Cleveland", "Dayton"], pct: 2.5 },
    { state: "OK", cities: ["Oklahoma City", "Tulsa", "Norman", "Stillwater"], pct: 1.5 },
    { state: "OR", cities: ["Portland", "Eugene", "Corvallis"], pct: 1.0 },
    { state: "PA", cities: ["Philadelphia", "Pittsburgh", "State College", "Harrisburg"], pct: 2.0 },
    { state: "RI", cities: ["Providence", "Newport", "Warwick"], pct: 0.2 },
    { state: "SC", cities: ["Charleston", "Columbia", "Greenville", "Myrtle Beach"], pct: 2.0 },
    { state: "SD", cities: ["Sioux Falls", "Rapid City", "Brookings"], pct: 0.1 },
    { state: "TN", cities: ["Nashville", "Memphis", "Knoxville", "Chattanooga"], pct: 2.0 },
    { state: "TX", cities: ["Houston", "Dallas", "Austin", "San Antonio", "Arlington", "Lubbock"], pct: 19.0 },
    { state: "UT", cities: ["Salt Lake City", "Provo", "Ogden"], pct: 0.8 },
    { state: "VT", cities: ["Burlington", "Montpelier", "Rutland"], pct: 0.1 },
    { state: "VA", cities: ["Richmond", "Virginia Beach", "Charlottesville", "Norfolk"], pct: 2.0 },
    { state: "WA", cities: ["Seattle", "Tacoma", "Spokane"], pct: 1.2 },
    { state: "WV", cities: ["Charleston", "Morgantown", "Huntington"], pct: 0.3 },
    { state: "WI", cities: ["Milwaukee", "Madison", "Green Bay"], pct: 1.0 },
    { state: "WY", cities: ["Cheyenne", "Casper", "Laramie"], pct: 0.1 },
  ];

  // Apply region skew: multiply pct for states in the target region
  const regionSkew = opts.wizardRegionSkew ?? "none";
  const REGION_BOOST_STATES: Record<string, string[]> = {
    southeast:  ["AL","FL","GA","LA","MS","NC","SC","TN","VA","AR"],
    sunbelt:    ["FL","TX","GA","AL","AZ","CA","NM","LA","SC","NC"],
    texas:      ["TX"],
    california: ["CA"],
    northeast:  ["NY","PA","NJ","MA","CT","MD","RI","VT","NH","DE"],
    midwest:    ["OH","IL","IN","MI","MO","MN","IA","KS","NE","WI"],
  };
  const boostedStates = REGION_BOOST_STATES[regionSkew] ?? [];
  const BOOST_FACTOR = 2.5;
  const skewedStateData = stateData.map(s => ({
    ...s,
    pct: boostedStates.includes(s.state) ? s.pct * BOOST_FACTOR : s.pct,
  }));

  const totalPct = skewedStateData.reduce((sum, s) => sum + s.pct, 0);
  const pickWeightedState = (): number => {
    const roll = Math.random() * totalPct;
    let cumulative = 0;
    for (let i = 0; i < skewedStateData.length; i++) {
      cumulative += skewedStateData[i].pct;
      if (roll < cumulative) return i;
    }
    return skewedStateData.length - 1;
  };
  const stateAssignments: number[] = [];
  for (let i = 0; i < count; i++) {
    stateAssignments.push(pickWeightedState());
  }
  const priorities = ["Extremely", "Very", "Somewhat", "Not Important"];

  const theme = opts.theme ?? getRandomRecruitingTheme();

  const getPitcherRatio = (t: RecruitingTheme): number => {
    switch (t) {
      case "high_velocity":    return 0.55;
      case "elite_pitching":   return 0.60;
      case "sluggers":         return 0.35;
      case "balanced":         return 0.40;
      case "top_heavy":        return 0.40;
      case "hidden_gems":      return 0.40;
      case "bust_heavy":       return 0.40;
      case "raw_talent":       return 0.45;
      case "position_players": return 0.30;
      case "defense_first":    return 0.30;
      case "power_class":      return 0.30;
      case "speed_class":      return 0.30;
      default:                 return 0.40;
    }
  };

  let pitcherRatio = getPitcherRatio(theme);
  // Wizard position distribution override: support both legacy "P" key and individual SP/RP/CP keys.
  // Apply whenever totalPosWeight > 0 — this correctly handles zero-pitcher intent (pitcherWeight=0).
  if (opts.wizardPositionDistribution) {
    const posDist = opts.wizardPositionDistribution;
    const pitcherWeight = (posDist["P"] ?? 0)
      + (posDist["SP"] ?? 0) + (posDist["RP"] ?? 0) + (posDist["CP"] ?? 0);
    const totalPosWeight = Object.values(posDist).reduce((s, v) => s + (v ?? 0), 0);
    if (totalPosWeight > 0) {
      pitcherRatio = pitcherWeight / totalPosWeight;
    }
  }

  const getStarRank = (idx: number, total: number, t: RecruitingTheme): number => {
    const pct = idx / total;
    if (t === "top_heavy") {
      if (pct < 0.10) return 5;
      if (pct < 0.25) return 4;
      if (pct < 0.70) return 3;
      if (pct < 0.88) return 2;
      return 1;
    }
    if (pct < 0.08) return 5;
    if (pct < 0.20) return 4;
    if (pct < 0.80) return 3;
    if (pct < 0.95) return 2;
    return 1;
  };

  let numBlueChips = Math.max(2, Math.floor(count * 0.03) + (Math.random() < 0.5 ? 1 : 0));
  if (opts.wizardSpecialCounts?.blueChips != null) numBlueChips = Math.min(opts.wizardSpecialCounts.blueChips, count);
  let numGenGems = 1;
  if (opts.wizardSpecialCounts?.genGems != null) numGenGems = Math.min(opts.wizardSpecialCounts.genGems, Math.floor(count * 0.05));
  let numGenBusts = 1;
  if (opts.wizardSpecialCounts?.genBusts != null) numGenBusts = Math.min(opts.wizardSpecialCounts.genBusts, Math.floor(count * 0.05));

  const getGemBustModifier = (t: RecruitingTheme, starRank: number): { isGem: boolean; isBust: boolean } => {
    const roll = Math.random();
    let gemChance: number;
    let bustChance: number;
    if (t === "hidden_gems") { gemChance = 0.24; bustChance = 0.06; }
    else if (t === "bust_heavy") { gemChance = 0.05; bustChance = 0.18; }
    else { gemChance = 0.14; bustChance = 0.12; }
    if (starRank >= 1 && starRank <= 4 && roll < gemChance) return { isGem: true, isBust: false };
    if (starRank >= 3 && starRank <= 5 && roll < bustChance) return { isGem: false, isBust: true };
    return { isGem: false, isBust: false };
  };

  const getTargetAttrAvgForRecruit = (starRank: number, isBlueChip: boolean, isGem: boolean, isBust: boolean, isPitcher: boolean): number => {
    if (isBlueChip) return isPitcher ? 80 + Math.floor(Math.random() * 5) : 68 + Math.floor(Math.random() * 5);
    if (isGem) {
      if (isPitcher) {
        switch (starRank) {
          case 3: return 67 + Math.floor(Math.random() * 10);
          case 2: return 58 + Math.floor(Math.random() * 10);
          case 1: return 51 + Math.floor(Math.random() * 10);
          default: return 67 + Math.floor(Math.random() * 10);
        }
      }
      switch (starRank) {
        case 3: return 55 + Math.floor(Math.random() * 12);
        case 2: return 45 + Math.floor(Math.random() * 12);
        case 1: return 38 + Math.floor(Math.random() * 12);
        default: return 55 + Math.floor(Math.random() * 10);
      }
    }
    if (isBust) {
      switch (starRank) {
        case 5: return 25 + Math.floor(Math.random() * 15);
        case 4: return 20 + Math.floor(Math.random() * 15);
        default: return 25 + Math.floor(Math.random() * 10);
      }
    }
    if (isPitcher) {
      switch (starRank) {
        case 5: return 65 + Math.floor(Math.random() * 7);
        case 4: return 54 + Math.floor(Math.random() * 7);
        case 3: return 43 + Math.floor(Math.random() * 7);
        case 2: return 31 + Math.floor(Math.random() * 7);
        default: return 19 + Math.floor(Math.random() * 6);
      }
    }
    switch (starRank) {
      case 5: return 58 + Math.floor(Math.random() * 12);
      case 4: return 48 + Math.floor(Math.random() * 10);
      case 3: return 38 + Math.floor(Math.random() * 10);
      case 2: return 22 + Math.floor(Math.random() * 12);
      default: return 18 + Math.floor(Math.random() * 8);
    }
  };

  const getAbilityCount = (starRank: number, isBlueChip: boolean = false): number => {
    if (isBlueChip) return 4 + Math.floor(Math.random() * 4);
    switch (starRank) {
      case 5: return 3 + Math.floor(Math.random() * 3);
      case 4: return 2 + Math.floor(Math.random() * 3);
      case 3: return 1 + Math.floor(Math.random() * 3);
      case 2: return Math.floor(Math.random() * 3);
      default: return Math.random() < 0.5 ? 1 : 0;
    }
  };


  const generateScoutingOrder = (isPitcher: boolean, position: string): string[] => {
    const fielderAttributes = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance'];
    const fielderAbilities = ['clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery'];
    const pitcherAttributes = ['velocity', 'control', 'stamina'];
    const pitcherAbilities = ['wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery'];
    const pitchTypes = ['pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL'];
    const catcherAbility = position === 'C' ? ['catcherAbility'] : [];

    let allFields: string[];
    if (isPitcher) {
      allFields = [...pitcherAttributes, ...pitchTypes, ...pitcherAbilities];
    } else {
      allFields = [...fielderAttributes, ...fielderAbilities, ...catcherAbility];
    }
    for (let i = allFields.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allFields[i], allFields[j]] = [allFields[j], allFields[i]];
    }
    return allFields;
  };

  const generateCommonAbilityValue = (targetAvg: number, wide = false): number => {
    const halfRange = wide ? 24 : 18;
    const variance = Math.floor(Math.random() * (halfRange * 2 + 1)) - halfRange;
    return Math.max(1, Math.min(100, targetAvg + variance));
  };

  const allGroupKeys = {
    hitter: new Set<string>(Object.values(HITTER_TOOL_GROUPS).flat()),
    pitcher: new Set<string>(Object.values(PITCHER_TOOL_GROUPS).flat()),
  };

  const generateCommonAbilities = (
    isPitcher: boolean,
    position: string,
    targetAvg: number,
    tooledAttrs?: Set<string>,
    isRaw = false,
  ) => {
    const groupKeys = isPitcher ? allGroupKeys.pitcher : allGroupKeys.hitter;
    const val = (attrName: string) => {
      if (tooledAttrs && groupKeys.has(attrName)) {
        return isRaw
          ? genRawToolAttr(targetAvg, tooledAttrs.has(attrName))
          : genToolAttr(targetAvg, tooledAttrs.has(attrName));
      }
      return generateCommonAbilityValue(targetAvg, isRaw);
    };

    if (isPitcher) {
      return {
        wRISP: val("wRISP"),
        vsLefty: val("vsLefty"),
        poise: val("poise"),
        grit: val("grit"),
        heater: val("heater"),
        agile: val("agile"),
        recovery: val("recovery"),
        clutch: 50, vsLHP: 50, stealing: 50, running: 50, throwing: 50, catcherAbility: 50,
      };
    } else {
      return {
        clutch: val("clutch"),
        vsLHP: val("vsLHP"),
        grit: val("grit"),
        stealing: val("stealing"),
        running: val("running"),
        throwing: val("throwing"),
        recovery: val("recovery"),
        catcherAbility: position === 'C' ? val("catcherAbility") : 50,
        wRISP: val("wRISP"),
        vsLefty: 50, poise: 50, heater: 50,
        agile: val("agile"),
      };
    }
  };

  const getThemeBoost = (t: RecruitingTheme, isPitcher: boolean): { attr: string; boost: number } => {
    if ((t === "high_velocity" || t === "elite_pitching") && isPitcher) return { attr: "velocity", boost: 15 };
    if ((t === "sluggers" || t === "power_class") && !isPitcher) return { attr: "power", boost: 15 };
    if (t === "speed_class" && !isPitcher) return { attr: "speed", boost: 15 };
    if (t === "defense_first" && !isPitcher) return { attr: "fielding", boost: 15 };
    return { attr: "", boost: 0 };
  };

  const starRanks: number[] = [];
  for (let i = 0; i < count; i++) {
    starRanks.push(getStarRank(i, count, theme));
  }
  // Wizard star distribution override
  if (opts.wizardStarDistribution) {
    const dist = opts.wizardStarDistribution;
    const bcCountForDist = opts.wizardSpecialCounts?.blueChips ?? Math.round(count * dist.blueChip / 100);
    const fiveCount = Math.round(count * dist.five / 100);
    const fourCount = Math.round(count * dist.four / 100);
    const threeCount = Math.round(count * dist.three / 100);
    const twoCount  = Math.round(count * dist.two  / 100);
    const oneCount  = Math.round(count * dist.one  / 100);
    const wizardRanks: number[] = [
      ...Array(bcCountForDist).fill(5),
      ...Array(fiveCount).fill(5),
      ...Array(fourCount).fill(4),
      ...Array(threeCount).fill(3),
      ...Array(twoCount).fill(2),
      ...Array(oneCount).fill(1),
    ];
    while (wizardRanks.length < count) wizardRanks.push(3);
    starRanks.splice(0, starRanks.length, ...wizardRanks.slice(0, count));
    // Also align numBlueChips if not explicitly set via wizardSpecialCounts
    if (opts.wizardSpecialCounts?.blueChips == null) {
      numBlueChips = bcCountForDist;
    }
  }

  const gemCandidates = starRanks.map((sr, idx) => ({ sr, idx }))
    .filter(x => x.sr >= 1 && x.sr <= 3 && x.idx >= numBlueChips);
  const bustCandidates = starRanks.map((sr, idx) => ({ sr, idx }))
    .filter(x => x.sr >= 3 && x.sr <= 5 && x.idx >= numBlueChips);

  const shuffledGemCandidates = [...gemCandidates].sort(() => Math.random() - 0.5);
  const generationalGemIdxSet = new Set<number>();
  for (let g = 0; g < Math.min(numGenGems, shuffledGemCandidates.length); g++) {
    generationalGemIdxSet.add(shuffledGemCandidates[g].idx);
  }

  const bustCandidatesFiltered = bustCandidates.filter(x => !generationalGemIdxSet.has(x.idx));
  const shuffledBustCandidates = [...bustCandidatesFiltered].sort(() => Math.random() - 0.5);
  const generationalBustIdxSet = new Set<number>();
  for (let b = 0; b < Math.min(numGenBusts, shuffledBustCandidates.length); b++) {
    generationalBustIdxSet.add(shuffledBustCandidates[b].idx);
  }

  // Wizard regular gem/bust count overrides — pre-assign specific indices
  const forcedGemIdxSet = new Set<number>();
  const forcedBustIdxSet = new Set<number>();
  if (opts.wizardSpecialCounts?.gems != null && opts.wizardSpecialCounts.gems > 0) {
    const eligibleForGem = gemCandidates
      .filter(x => !generationalGemIdxSet.has(x.idx) && !generationalBustIdxSet.has(x.idx))
      .sort(() => Math.random() - 0.5);
    for (let g = 0; g < Math.min(opts.wizardSpecialCounts.gems, eligibleForGem.length); g++) {
      forcedGemIdxSet.add(eligibleForGem[g].idx);
    }
  }
  if (opts.wizardSpecialCounts?.busts != null && opts.wizardSpecialCounts.busts > 0) {
    const eligibleForBust = bustCandidates
      .filter(x => !generationalGemIdxSet.has(x.idx) && !generationalBustIdxSet.has(x.idx) && !forcedGemIdxSet.has(x.idx))
      .sort(() => Math.random() - 0.5);
    for (let b = 0; b < Math.min(opts.wizardSpecialCounts.busts, eligibleForBust.length); b++) {
      forcedBustIdxSet.add(eligibleForBust[b].idx);
    }
  }

  const playerArchetypes: ("normal" | "late_bloomer" | "overdraft" | "raw")[] = new Array(count).fill("normal");

  // Wizard forced type for single-recruit reroll (count=1)
  const forced = opts.wizardForcedType;

  const rawRatio = theme === "raw_talent" ? 0.20 : 0.08;
  // Wizard raw player count override — compute a ratio that matches target count
  const effectiveRawRatio = opts.wizardSpecialCounts?.rawPlayers != null
    ? Math.min(1, opts.wizardSpecialCounts.rawPlayers / Math.max(1, count - numBlueChips))
    : rawRatio;
  const lbRate  = 0.07;
  const odRate  = 0.07;
  for (let i = numBlueChips; i < count; i++) {
    const sr = starRanks[i];
    if (generationalGemIdxSet.has(i) || generationalBustIdxSet.has(i)) continue;
    const roll = Math.random();
    if (roll < effectiveRawRatio) {
      playerArchetypes[i] = "raw";
    } else if (roll < effectiveRawRatio + lbRate && sr >= 2 && sr <= 4) {
      playerArchetypes[i] = "late_bloomer";
    } else if (roll < effectiveRawRatio + lbRate + odRate && sr >= 3 && sr <= 5) {
      playerArchetypes[i] = "overdraft";
    }
  }

  // Pre-compute JUCO override indices
  const jucoOverrideSet = new Set<number>();
  if (opts.wizardSpecialCounts?.jucos != null) {
    const eligibleForJuco = Array.from({ length: count }, (_, i) => i)
      .filter(i => !generationalGemIdxSet.has(i) && !generationalBustIdxSet.has(i) && i >= numBlueChips);
    const shuffledEligible = [...eligibleForJuco].sort(() => Math.random() - 0.5);
    for (let j = 0; j < Math.min(opts.wizardSpecialCounts.jucos, shuffledEligible.length); j++) {
      jucoOverrideSet.add(shuffledEligible[j]);
    }
  }

  // ─── Wizard OVR target pre-computation ────────────────────────────────────
  const ovrMin  = Math.max(150, Math.min(650, opts.wizardOvrMin  ?? 150));
  const ovrMax  = Math.max(150, Math.min(650, opts.wizardOvrMax  ?? 650));
  const ovrAvg  = Math.max(ovrMin, Math.min(ovrMax, opts.wizardOvrAverage ?? Math.round((ovrMin + ovrMax) / 2)));
  const ovrDist = opts.wizardOvrDistribution ?? "bell";
  const hasOvrControls = opts.wizardOvrMin != null || opts.wizardOvrMax != null || opts.wizardOvrAverage != null || opts.wizardOvrDistribution != null;

  // Pre-generate per-slot OVR targets, sorted descending so highest targets
  // align with the highest-ranked (index 0) slots.
  const wizardTargetOvrs: number[] | null = hasOvrControls ? (() => {
    const range = Math.max(1, ovrMax - ovrMin);
    const targets: number[] = [];
    for (let k = 0; k < count; k++) {
      let t: number;
      if (ovrDist === "flat") {
        t = ovrMin + Math.floor(Math.random() * (range + 1));
      } else if (ovrDist === "top_heavy") {
        // power < 1 → values skewed toward 1 (ovrMax)
        t = Math.round(ovrMin + Math.pow(Math.random(), 0.4) * range);
      } else if (ovrDist === "bottom_heavy") {
        // power > 1 → values skewed toward 0 (ovrMin)
        t = Math.round(ovrMin + Math.pow(Math.random(), 2.5) * range);
      } else {
        // bell curve centered at ovrAvg
        const sd = range / 4;
        const u1 = Math.random() || 1e-10;
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        t = Math.round(ovrAvg + z * sd);
      }
      targets.push(Math.max(ovrMin, Math.min(ovrMax, t)));
    }
    // For non-bell distributions, shift all targets so the class mean equals ovrAvg.
    // Bell already centers at ovrAvg via its own formula; no second shift needed.
    if (ovrDist !== "bell" && opts.wizardOvrAverage != null) {
      const currentMean = targets.reduce((s, v) => s + v, 0) / targets.length;
      const shift = Math.round(ovrAvg - currentMean);
      if (shift !== 0) {
        for (let k = 0; k < targets.length; k++) {
          targets[k] = Math.max(ovrMin, Math.min(ovrMax, targets[k] + shift));
        }
      }
    }
    targets.sort((a, b) => b - a);
    return targets;
  })() : null;

  const out: GeneratedRecruit[] = [];

  const defenseFirstPositions = [
    { value: "C",  weight: 3 }, { value: "SS", weight: 3 }, { value: "OF", weight: 5 },
    { value: "2B", weight: 2 }, { value: "3B", weight: 2 }, { value: "1B", weight: 1 },
  ];
  const speedClassPositions = [
    { value: "OF", weight: 9 }, { value: "2B", weight: 3 },
    { value: "SS", weight: 2 }, { value: "C",  weight: 1 }, { value: "3B", weight: 1 },
    { value: "1B", weight: 1 },
  ];
  const powerClassPositions = [
    { value: "1B", weight: 4 }, { value: "3B", weight: 3 }, { value: "OF", weight: 7 },
    { value: "C",  weight: 1 }, { value: "2B", weight: 1 }, { value: "SS", weight: 1 },
  ];

  const PITCHER_KEYS = new Set(["P", "SP", "RP", "CP"]);

  const wizardFieldWeights = opts.wizardPositionDistribution
    ? Object.entries(opts.wizardPositionDistribution)
        .filter(([k]) => !PITCHER_KEYS.has(k))
        .map(([k, v]) => ({ value: k, weight: v ?? 0 }))
        .filter(x => x.weight > 0)
    : null;

  // Build pitcher sub-type weights (SP/RP/CP) if individually specified
  const wizardPitcherSubWeights: { value: string; weight: number }[] | null = (() => {
    const pd = opts.wizardPositionDistribution;
    if (!pd) return null;
    const sp = pd["SP"] ?? 0;
    const rp = pd["RP"] ?? 0;
    const cp = pd["CP"] ?? 0;
    if (sp === 0 && rp === 0 && cp === 0) return null;
    return [
      { value: "SP", weight: sp },
      { value: "RP", weight: rp },
      { value: "CP", weight: cp },
    ].filter(x => x.weight > 0);
  })();

  const pickFieldPosition = (): string => {
    if (wizardFieldWeights && wizardFieldWeights.length > 0) return rollWeighted(wizardFieldWeights);
    if (theme === "defense_first") return rollWeighted(defenseFirstPositions);
    if (theme === "speed_class")   return rollWeighted(speedClassPositions);
    if (theme === "power_class")   return rollWeighted(powerClassPositions);
    return fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
  };

  const pickPitcherPosition = (): string => {
    if (wizardPitcherSubWeights && wizardPitcherSubWeights.length > 0) {
      return rollWeighted(wizardPitcherSubWeights);
    }
    return "P";
  };

  for (let i = 0; i < count; i++) {
    const isPitcher = Math.random() < pitcherRatio;
    const position = isPitcher ? pickPitcherPosition() : pickFieldPosition();

    const stateIdx = stateAssignments[i] || 0;
    const recruitState = stateData[stateIdx];
    const recruitCity = recruitState.cities[Math.floor(Math.random() * recruitState.cities.length)];
    // Apply wizard forced type overrides (used for single-recruit reroll)
    const isBlueChip  = forced?.isBlueChip  != null ? forced.isBlueChip  : i < numBlueChips;
    const isGenerationalGem  = forced?.isGenGem  != null ? forced.isGenGem  : generationalGemIdxSet.has(i);
    const isGenerationalBust = forced?.isGenBust != null ? forced.isGenBust : generationalBustIdxSet.has(i);
    const starRank = forced?.starRank != null ? forced.starRank : starRanks[i];
    const playerArchetype = forced?.isRaw
      ? "raw"
      : (isGenerationalGem || isGenerationalBust || isBlueChip ? "normal" : playerArchetypes[i]);
    const isRawArchetype = playerArchetype === "raw";

    let isGem = false;
    let isBust = false;
    let targetAttrAvg: number;
    let abilityCount: number;

    if (isGenerationalGem) {
      isGem = true;
      targetAttrAvg = -1;
      abilityCount = 5 + Math.floor(Math.random() * 3);
    } else if (isGenerationalBust) {
      isBust = true;
      targetAttrAvg = -1;
      abilityCount = 0;
    } else {
      // Check forced gem/bust override from wizardSpecialCounts
      const isForcedGem  = forced?.isGem  ?? forcedGemIdxSet.has(i);
      const isForcedBust = forced?.isBust ?? forcedBustIdxSet.has(i);
      const gemBust = isBlueChip
        ? { isGem: false, isBust: false }
        : isForcedGem
          ? { isGem: true, isBust: false }
          : isForcedBust
            ? { isGem: false, isBust: true }
            : getGemBustModifier(theme, starRank);
      isGem = gemBust.isGem;
      isBust = isBlueChip ? false : gemBust.isBust;
      targetAttrAvg = getTargetAttrAvgForRecruit(starRank, isBlueChip, isGem, isBust, isPitcher);
      abilityCount = getAbilityCount(starRank, isBlueChip);

      // Apply wizard OVR distribution delta for non-special recruits
      if (wizardTargetOvrs && !isBlueChip && !isGem && !isBust) {
        const targetOvr = wizardTargetOvrs[i];
        // Estimated default mid-OVR per star rank (midpoint of each band)
        const defaultMidOvrs: Record<number, number> = { 1: 174, 2: 249, 3: 349, 4: 449, 5: 519 };
        const defaultMidOvr = (defaultMidOvrs[starRank] ?? 349) + (isPitcher ? 15 : 0);
        const deltaOvr = targetOvr - defaultMidOvr;
        // Rough linear scale: ~10 OVR per attr point for hitters, ~8 for pitchers
        const attrScale = isPitcher ? 8 : 10;
        const deltaAttr = Math.round(deltaOvr / attrScale);
        targetAttrAvg = Math.max(10, Math.min(90, targetAttrAvg + deltaAttr));
      }
    }

    const starRating = starRank;

    // Pre-roll pitcher stamina band so we can gate Intimidator before abilities are assigned.
    // Generational gems always use the starter band (80–99); busts are always low stamina.
    // Regular pitchers follow the 40/10/40/10 role distribution.
    let pitcherStaminaBand: [number, number] | null = null;
    if (isPitcher) {
      if (isGenerationalGem) {
        pitcherStaminaBand = [80, 99];
      } else if (!isGenerationalBust) {
        const roleRoll = Math.random();
        if (roleRoll < 0.40) pitcherStaminaBand = [80, 99];        // starter
        else if (roleRoll < 0.50) pitcherStaminaBand = [50, 79];   // long relief
        else if (roleRoll < 0.90) pitcherStaminaBand = [30, 49];   // mid relief
        else pitcherStaminaBand = [1, 29];                          // closer
      }
    }
    // Lower bound of the band is passed to ability generators so staminaMax gates work correctly.
    const pitcherStaminaForAbilities = pitcherStaminaBand ? pitcherStaminaBand[0] : undefined;

    let abilities: string[];
    if (isGenerationalGem) {
      const availableAbilities = getAbilitiesForPosition(position);
      const goldAbilities = availableAbilities.filter(a => a.tier === "gold");
      const blueAbilities = availableAbilities.filter(
        a => a.tier === "blue" &&
        (pitcherStaminaForAbilities === undefined || a.staminaMax === undefined || pitcherStaminaForAbilities <= a.staminaMax)
      );
      const shuffledGold = [...goldAbilities].sort(() => Math.random() - 0.5);
      const shuffledBlue = [...blueAbilities].sort(() => Math.random() - 0.5);
      const goldTarget = 1;
      const selected: string[] = [];
      for (const a of shuffledGold) { if (selected.length < goldTarget && !selected.includes(a.name)) selected.push(a.name); }
      for (const a of shuffledBlue) { if (selected.length < abilityCount && !selected.includes(a.name)) selected.push(a.name); }
      abilities = selected;
    } else if (isGenerationalBust) {
      const availableAbilities = getAbilitiesForPosition(position);
      const redAbilities = availableAbilities.filter(a => a.tier === "red");
      const shuffledRed = [...redAbilities].sort(() => Math.random() - 0.5);
      abilities = shuffledRed.slice(0, 2).map(a => a.name);
    } else {
      abilities = getRandomAbilities(position, abilityCount, starRank >= 4, pitcherStaminaForAbilities);
    }

    const appearance = getRandomAppearance();

    const recruitType = jucoOverrideSet.has(i) ? "JUCO" : (Math.random() < 0.8 ? "HS" : "JUCO");
    let recruitYear = "FR";
    if (recruitType === "JUCO") {
      const rand = Math.random();
      if (rand < 0.4) recruitYear = "FR";
      else if (rand < 0.8) recruitYear = "SO";
      else recruitYear = "JR";
    }

    const themeBoost = getThemeBoost(theme, isPitcher);
    const genAttr = (avg: number) => Math.max(1, Math.min(100, avg + Math.floor(Math.random() * 37) - 18));

    let velocity: number;
    let power: number;
    let hitForAvg: number;
    let speed: number;
    let arm: number;
    let fielding: number;
    let errorResistance: number;
    let control: number;
    let stamina: number;
    let stuff: number;
    let selectedTools: string[] = [];
    let playerTooledAttrs: Set<string> | undefined;

    if (isGenerationalGem) {
      hitForAvg = 85 + Math.floor(Math.random() * 15);
      power = 85 + Math.floor(Math.random() * 15);
      speed = sampleNormalSpeed(82, 6, 75, 95);
      arm = 85 + Math.floor(Math.random() * 15);
      fielding = 85 + Math.floor(Math.random() * 15);
      errorResistance = 80 + Math.floor(Math.random() * 20);
      velocity = sampleNormalVelocity(82, 5, 70, 95);
      control = 85 + Math.floor(Math.random() * 15);
      stamina = 80 + Math.floor(Math.random() * 20);
      stuff = 85 + Math.floor(Math.random() * 15);
    } else if (isGenerationalBust) {
      hitForAvg = 15 + Math.floor(Math.random() * 25);
      power = 15 + Math.floor(Math.random() * 25);
      speed = sampleNormalSpeed(18, 5, 10, 28);
      arm = 15 + Math.floor(Math.random() * 25);
      fielding = 15 + Math.floor(Math.random() * 25);
      errorResistance = 15 + Math.floor(Math.random() * 25);
      velocity = sampleNormalVelocity(35, 4, 25, 45);
      control = 15 + Math.floor(Math.random() * 25);
      stamina = 15 + Math.floor(Math.random() * 25);
      stuff = 15 + Math.floor(Math.random() * 25);
    } else if (isRawArchetype) {
      selectedTools = selectRawTools(isPitcher);
      const toolGroups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
      playerTooledAttrs = new Set<string>(selectedTools.flatMap(t => toolGroups[t] ?? []));
      const genR = (base: number, attr: string) => genRawToolAttr(base, playerTooledAttrs!.has(attr));
      const hitBoost = isPitcher ? 0 : 6;
      const pitchPenalty = isPitcher ? 3 : 0;
      hitForAvg = genR(targetAttrAvg + hitBoost, "hitForAvg");
      power     = genR(targetAttrAvg + hitBoost, "power");
      speed     = sampleNormalSpeed();
      arm       = genR(targetAttrAvg,            "arm");
      fielding  = genR(targetAttrAvg,            "fielding");
      errorResistance = genR(targetAttrAvg,      "errorResistance");
      velocity  = sampleNormalVelocity();
      control   = genR(targetAttrAvg,               "control");
      stamina   = genR(targetAttrAvg,               "stamina");
      stuff     = genR(targetAttrAvg - pitchPenalty, "stuff");
    } else {
      selectedTools = selectTools(starRank, isPitcher);
      const toolGroups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
      playerTooledAttrs = new Set<string>(selectedTools.flatMap(t => toolGroups[t] ?? []));
      const genT = (base: number, attr: string) => genToolAttr(base, playerTooledAttrs!.has(attr));
      const hitBoost = isPitcher ? 0 : 6;
      const pitchPenalty = isPitcher ? 3 : 0;
      hitForAvg = genT(targetAttrAvg + hitBoost, "hitForAvg");
      power     = genT(targetAttrAvg + hitBoost, "power");
      speed     = sampleNormalSpeed();
      arm       = genT(targetAttrAvg,            "arm");
      fielding  = genT(targetAttrAvg,            "fielding");
      errorResistance = genT(targetAttrAvg,      "errorResistance");
      velocity  = sampleNormalVelocity();
      control   = genT(targetAttrAvg,               "control");
      stamina   = genT(targetAttrAvg,               "stamina");
      stuff     = genT(targetAttrAvg - pitchPenalty, "stuff");
    }

    // ─── Wizard OVR correction retry loop ────────────────────────────────────
    // Skip only for Blue Chips, Generational Gems and Busts — they have hard-coded OVR bands.
    // Regular gems/busts are included so the wizard range still applies to them.
    if (wizardTargetOvrs && !isGenerationalGem && !isGenerationalBust && !isBlueChip) {
      const hitBoostR = isPitcher ? 0 : 6;
      const pitchPenaltyR = isPitcher ? 3 : 0;
      for (let retry = 0; retry < 5; retry++) {
        // Preliminary OVR check using just numeric attrs (pitch mix falls back to stuff)
        const prelimOvr = calculateOVR({ position, hitForAvg, power, speed, arm, fielding, errorResistance, velocity, control, stamina, stuff });
        if (prelimOvr >= ovrMin && prelimOvr <= ovrMax) break;
        const adjust = prelimOvr < ovrMin ? 5 : -5;
        targetAttrAvg = Math.max(10, Math.min(90, targetAttrAvg + adjust));
        if (isRawArchetype) {
          const genR = (base: number, attr: string) => genRawToolAttr(base, playerTooledAttrs!.has(attr));
          hitForAvg = genR(targetAttrAvg + hitBoostR, "hitForAvg");
          power     = genR(targetAttrAvg + hitBoostR, "power");
          arm       = genR(targetAttrAvg, "arm");
          fielding  = genR(targetAttrAvg, "fielding");
          errorResistance = genR(targetAttrAvg, "errorResistance");
          control   = genR(targetAttrAvg, "control");
          stuff     = genR(targetAttrAvg - pitchPenaltyR, "stuff");
        } else {
          const genT = (base: number, attr: string) => genToolAttr(base, playerTooledAttrs!.has(attr));
          hitForAvg = genT(targetAttrAvg + hitBoostR, "hitForAvg");
          power     = genT(targetAttrAvg + hitBoostR, "power");
          arm       = genT(targetAttrAvg, "arm");
          fielding  = genT(targetAttrAvg, "fielding");
          errorResistance = genT(targetAttrAvg, "errorResistance");
          control   = genT(targetAttrAvg, "control");
          stuff     = genT(targetAttrAvg - pitchPenaltyR, "stuff");
        }
      }
    }

    if (themeBoost.attr === "velocity") velocity = Math.min(99, velocity + themeBoost.boost);
    if (theme === "elite_pitching" && isPitcher) stuff = Math.min(99, stuff + 10);
    if (themeBoost.attr === "power")   power    = Math.min(99, power   + themeBoost.boost);
    if (themeBoost.attr === "speed")   speed    = Math.min(99, speed   + themeBoost.boost);
    if (themeBoost.attr === "fielding") fielding = Math.min(99, fielding + themeBoost.boost);

    // Apply role-based stamina band for pitcher recruits.
    // Gems and busts retain their own fixed ranges; all other pitchers use the pre-rolled band.
    if (isPitcher && pitcherStaminaBand && !isGenerationalGem && !isGenerationalBust) {
      const [bandMin, bandMax] = pitcherStaminaBand;
      stamina = bandMin + Math.floor(Math.random() * (bandMax - bandMin + 1));
    }

    const recruitThrowHand = isPitcher ? (Math.random() < 0.28 ? "L" : "R") : "R";
    const pitchMix = isPitcher
      ? generateArchetypePitchMix(
          assignPitcherArchetype("P", recruitThrowHand, velocity, control, stamina, stuff),
          qualityTierFromStars(starRank),
        )
      : { ...noPitches };

    let commonAbilities: ReturnType<typeof generateCommonAbilities>;
    if (isGenerationalGem) {
      const genElite = () => 90 + Math.floor(Math.random() * 10);
      if (isPitcher) {
        commonAbilities = {
          wRISP: genElite(), vsLefty: genElite(), poise: genElite(), grit: genElite(),
          heater: genElite(), agile: genElite(), recovery: genElite(),
          clutch: 50, vsLHP: 50, stealing: 50, running: 50, throwing: 50, catcherAbility: 50,
        };
      } else {
        commonAbilities = {
          clutch: genElite(), vsLHP: genElite(), grit: genElite(), stealing: genElite(),
          running: genElite(), throwing: genElite(), recovery: genElite(),
          catcherAbility: position === 'C' ? genElite() : 50,
          wRISP: 50, vsLefty: 50, poise: 50, heater: 50, agile: 50,
        };
      }
    } else if (isGenerationalBust) {
      const genPoor = () => 10 + Math.floor(Math.random() * 20);
      if (isPitcher) {
        commonAbilities = {
          wRISP: genPoor(), vsLefty: genPoor(), poise: genPoor(), grit: genPoor(),
          heater: genPoor(), agile: genPoor(), recovery: genPoor(),
          clutch: 50, vsLHP: 50, stealing: 50, running: 50, throwing: 50, catcherAbility: 50,
        };
      } else {
        commonAbilities = {
          clutch: genPoor(), vsLHP: genPoor(), grit: genPoor(), stealing: genPoor(),
          running: genPoor(), throwing: genPoor(), recovery: genPoor(),
          catcherAbility: position === 'C' ? genPoor() : 50,
          wRISP: 50, vsLefty: 50, poise: 50, heater: 50, agile: 50,
        };
      }
    } else {
      commonAbilities = generateCommonAbilities(isPitcher, position, targetAttrAvg, playerTooledAttrs, isRawArchetype);
    }

    // Normalize common ability F/G distribution.
    // Recruits are a national pool with no conference context; use "" (Tier 1 defaults).
    // We use R{i}/C{i} as a deterministic seed surrogate since names are not assigned yet.
    // normalizeCommonAbilities returns ONLY common ability keys — merging is safe.
    Object.assign(commonAbilities, normalizeCommonAbilities(
      { position, firstName: `R${i}`, lastName: `C${i}`, ...commonAbilities },
      "",
    ));

    const scoutingOrder = generateScoutingOrder(isPitcher, position);

    const recruitOvrData = {
      position, hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff, ...commonAbilities, abilities,
      ...pitchMix,
    };
    let overall = calculateOVR(recruitOvrData);

    if (isGenerationalGem) {
      overall = Math.max(600, Math.min(650, overall));
    } else if (isGenerationalBust) {
      overall = Math.max(150, Math.min(199, overall));
    } else if (isBlueChip) {
      overall = Math.max(540, Math.min(599, overall));
    } else if (isGem) {
      overall = Math.max(500, Math.min(599, overall));
    } else if (isBust) {
      overall = Math.max(200, Math.min(299, overall));
    } else if (playerArchetype === "late_bloomer") {
      // Late bloomer: OVR depressed below their star tier — looks weaker than ranking suggests
      // but potential is forced high. A 4★ late bloomer will show 3★-range OVR.
      const starCaps: Record<number, number> = { 5: 539, 4: 499, 3: 399, 2: 299, 1: 199 };
      const baseCap = starCaps[starRank] ?? 499;
      const depression = 45 + Math.floor(Math.random() * 40);
      overall = Math.max(150, Math.min(baseCap, overall) - depression);
    } else if (playerArchetype === "overdraft") {
      // Overdraft: OVR inflated above their star tier — looks better than ranking suggests
      // but potential is forced low. A 3★ overdraft will show 4★-range OVR.
      const nextTierFloor: Record<number, number> = { 5: 510, 4: 410, 3: 310, 2: 210, 1: 160 };
      const nextTierCap:  Record<number, number> = { 5: 599, 4: 539, 3: 499, 2: 399, 1: 299 };
      const floor = nextTierFloor[starRank] ?? 410;
      const cap   = nextTierCap[starRank] ?? 499;
      const inflation = 40 + Math.floor(Math.random() * 40);
      overall = Math.max(floor, Math.min(cap, overall + inflation));
    } else {
      const starCaps: Record<number, number> = { 5: 539, 4: 499, 3: 399, 2: 299, 1: 199 };
      const cap = starCaps[starRank] ?? 499;
      overall = Math.max(150, Math.min(cap, overall));
    }
    // Enforce gold OVR gate: generational gems are exempt (they're always elite)
    if (!isGenerationalGem && !isGenerationalBust) {
      const gated = enforceGoldOvrGate(abilities, position, overall, pitcherStaminaForAbilities);
      if (gated !== abilities) {
        abilities = gated;
        // Gold gives +10 OVR, blue gives +5, so each gold→blue swap costs 5 OVR
        overall = Math.max(150, overall - 5);
      }
    }
    // ─── Wizard OVR hard clamp (post all star/archetype/gate adjustments) ────
    // Exempt: generational gems, generational busts, blue chips (fixed OVR bands).
    // For all other recruits, enforce the user-specified [ovrMin, ovrMax] range.
    if (wizardTargetOvrs && !isGenerationalGem && !isGenerationalBust && !isBlueChip) {
      overall = Math.max(ovrMin, Math.min(ovrMax, overall));
    }
    const computedStarRating = getStarRatingFromOVR(overall);

    let potential: number | undefined;
    let potentialFloor: number | undefined;
    let potentialCeiling: number | undefined;

    if (playerArchetype === "late_bloomer") {
      potential = 90 + Math.floor(Math.random() * 10);
      potentialFloor = potential - 4;
      potentialCeiling = Math.min(99, potential + 4);
    } else if (playerArchetype === "overdraft") {
      potential = 50 + Math.floor(Math.random() * 8);
      potentialFloor = potential;
      potentialCeiling = Math.min(57, potential + 4);
    }

    // Weighted trait distribution: low 20%, below-avg 30%, avg 35%, good 12%, elite 3%
    const rollTraitScore = (biasHigh = false, biasLow = false): number => {
      const buckets = biasHigh
        ? [{ min: 60, max: 72, w: 10 }, { min: 73, max: 82, w: 30 }, { min: 83, max: 90, w: 40 }, { min: 91, max: 96, w: 15 }, { min: 97, max: 99, w: 5 }]
        : biasLow
        ? [{ min: 50, max: 59, w: 35 }, { min: 60, max: 69, w: 40 }, { min: 70, max: 78, w: 20 }, { min: 79, max: 85, w: 5 }, { min: 86, max: 90, w: 0 }]
        : [{ min: 50, max: 64, w: 20 }, { min: 65, max: 74, w: 30 }, { min: 75, max: 84, w: 35 }, { min: 85, max: 92, w: 12 }, { min: 93, max: 99, w: 3 }];
      const total = buckets.reduce((s, b) => s + b.w, 0);
      let roll = Math.random() * total;
      for (const b of buckets) {
        roll -= b.w;
        if (roll <= 0) return b.min + Math.floor(Math.random() * (b.max - b.min + 1));
      }
      return buckets[buckets.length - 1].min;
    };

    const workEthicScore = isGenerationalBust
      ? 50 + Math.floor(Math.random() * 10)
      : isGenerationalGem
        ? 88 + Math.floor(Math.random() * 12)
        : playerArchetype === "late_bloomer"
          ? rollTraitScore(true, false)
          : rollTraitScore();

    const coachability = isGenerationalBust
      ? 50 + Math.floor(Math.random() * 10)
      : isGenerationalGem
        ? 85 + Math.floor(Math.random() * 15)
        : playerArchetype === "late_bloomer"
          ? rollTraitScore(true, false)
          : playerArchetype === "overdraft"
            ? rollTraitScore(false, true)
            : rollTraitScore();

    out.push({
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      homeState: recruitState.state,
      hometown: recruitCity,
      starRank,
      classRank: i + 1,
      positionRank: Math.floor(i / 9) + 1,
      recruitType,
      recruitYear,
      overall,
      starRating: isBlueChip || isGem || isBust || isGenerationalGem || isGenerationalBust ? starRating : computedStarRating,
      hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff,
      ...pitchMix,
      ...commonAbilities,
      abilities,
      trajectory: isPitcher ? 2 : assignTrajectory(power, speed, hitForAvg),
      scoutingOrder,
      proximityPriority: priorities[Math.floor(Math.random() * priorities.length)],
      reputationPriority: priorities[Math.floor(Math.random() * priorities.length)],
      playingTimePriority: priorities[Math.floor(Math.random() * priorities.length)],
      academicsPriority: priorities[Math.floor(Math.random() * priorities.length)],
      prestigePriority: priorities[Math.floor(Math.random() * priorities.length)],
      facilitiesPriority: priorities[Math.floor(Math.random() * priorities.length)],
      collegeLifePriority: priorities[Math.floor(Math.random() * priorities.length)],
      commitmentThreshold: 300 + Math.floor(Math.random() * 400),
      tools: selectedTools,
      isBlueChip,
      isGem,
      isBust,
      isGenerationalGem,
      isGenerationalBust,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      facialHair: appearance.facialHair,
      eyeStyle: appearance.eyeStyle,
      eyebrowStyle: appearance.eyebrowStyle,
      mouthStyle: appearance.mouthStyle,
      eyeBlack: appearance.eyeBlack,
      headwear: appearance.headwear,
      ...(potential != null ? { potential } : {}),
      ...(potentialFloor != null ? { potentialFloor } : {}),
      ...(potentialCeiling != null ? { potentialCeiling } : {}),
      playerArchetype,
      workEthicScore,
      coachability,
      nilCost: generateNilCost(
        (isBlueChip || isGem || isBust || isGenerationalGem || isGenerationalBust) ? starRating : computedStarRating,
        isBlueChip,
        isGenerationalGem,
        isGenerationalBust,
        position,
        recruitState.state,
      ),
    });
  }

  // Post-processing: apply position-scarcity NIL multiplier.
  // Group recruits by position, sort best-first by OVR, then give the
  // top-ranked players at each spot a market premium and the deep-bench
  // players a slight discount — mirroring how real NIL markets price scarcity.
  {
    const byPosition = new Map<string, typeof out>();
    for (const r of out) {
      const pos = r.position ?? "SP";
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(r);
    }
    for (const group of byPosition.values()) {
      group.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
      group.forEach((r, idx) => {
        if (r.isGenerationalBust) return; // override is already set
        const rank = idx + 1;
        let mult: number;
        if (rank <= 2)       mult = 1.35 + Math.random() * 0.10; // #1–#2: 1.35–1.45×
        else if (rank <= 5)  mult = 1.10 + Math.random() * 0.10; // #3–#5: 1.10–1.20×
        else if (rank <= 10) mult = 1.0;                          // #6–#10: unchanged
        else                 mult = 0.85 + Math.random() * 0.10; // #11+:  0.85–0.95×
        r.nilCost = Math.floor((r.nilCost ?? 0) * mult);
      });
    }
  }

  const gemCount = out.filter(r => r.isGenerationalGem).length;
  const bustCount = out.filter(r => r.isGenerationalBust).length;
  const bcCount = out.filter(r => r.isBlueChip).length;
  const top20 = [...out].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 20);
  const avgTop20 = top20.reduce((s, r) => s + (r.overall ?? 300), 0) / Math.max(1, top20.length);

  const lateBloomerCount = out.filter(r => r.playerArchetype === "late_bloomer").length;
  const isLegacyClass = opts.isLegacyClass ?? (Math.random() < 0.05);

  let classVintage: string;
  if (gemCount >= 2) {
    classVintage = "gem_heavy";
  } else if (bustCount >= 2) {
    classVintage = "bust_year";
  } else if (lateBloomerCount >= Math.ceil(count * 0.10)) {
    classVintage = "late_bloomer";
  } else if (isLegacyClass) {
    classVintage = "legacy";
  } else if (theme === "elite_pitching") {
    classVintage = "pitching_rich";
  } else if (theme === "raw_talent") {
    classVintage = "raw_talent";
  } else if (theme === "position_players") {
    classVintage = "position_players";
  } else if (theme === "defense_first") {
    classVintage = "defense_first";
  } else if (theme === "power_class") {
    classVintage = "power_class";
  } else if (theme === "speed_class") {
    classVintage = "speed_class";
  } else if (bcCount >= 4 && avgTop20 >= 430) {
    classVintage = "elite";
  } else if (avgTop20 >= 400) {
    classVintage = "strong";
  } else if (avgTop20 >= 360) {
    classVintage = "balanced";
  } else if (theme === "bust_heavy" || bustCount >= 1) {
    classVintage = "volatile";
  } else {
    classVintage = "weak";
  }

  for (const recruit of out) {
    recruit.classVintage = classVintage;
  }

  return out;
}
