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
    lateBloomers?: number; overdrafts?: number;
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
  position: string = "SP",
  homeState: string = "",
): number {
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

  if (isBlueChip) return Math.floor(adjusted * (1.2 + Math.random() * 0.6));
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
  let numGenGems = 2;
  if (opts.wizardSpecialCounts?.genGems != null) numGenGems = Math.min(opts.wizardSpecialCounts.genGems, Math.floor(count * 0.05));
  let numGenBusts = 3 + Math.floor(Math.random() * 3);
  if (opts.wizardSpecialCounts?.genBusts != null) numGenBusts = Math.min(opts.wizardSpecialCounts.genBusts, Math.floor(count * 0.10));
  const numRegGems = opts.wizardSpecialCounts?.gems != null
    ? Math.min(opts.wizardSpecialCounts.gems, Math.floor(count * 0.15))
    : 5 + Math.floor(Math.random() * 6);
  const numRegBusts = opts.wizardSpecialCounts?.busts != null
    ? Math.min(opts.wizardSpecialCounts.busts, Math.floor(count * 0.15))
    : 5 + Math.floor(Math.random() * 6);
  const rawTalentBase = theme === "raw_talent" ? (10 + Math.floor(Math.random() * 7)) : (5 + Math.floor(Math.random() * 6));
  const numRawPlayers = opts.wizardSpecialCounts?.rawPlayers != null
    ? Math.min(opts.wizardSpecialCounts.rawPlayers, Math.floor(count * 0.20))
    : rawTalentBase;

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
    if (isBlueChip) return isPitcher ? 80 + Math.floor(Math.random() * 5) : 82 + Math.floor(Math.random() * 6);
    if (isGem) {
      if (isPitcher) {
        // Pitcher gem targetAttrAvg — calibrated for the original clamp+OVR system.
        // Gem/bust/blueChip pitcher OVRs are still clamped to their archetype bands;
        // the retry loop is scoped to normal pitchers only where it reliably converges.
        switch (starRank) {
          case 4: return 80 + Math.floor(Math.random() * 8);
          case 3: return 65 + Math.floor(Math.random() * 8);
          case 2: return 54 + Math.floor(Math.random() * 8);
          case 1: return 43 + Math.floor(Math.random() * 8);
          default: return 65 + Math.floor(Math.random() * 8);
        }
      }
      // Hitter gem: starting targetAttrAvg calibrated so the OVR retry converges to the gem's target band
      switch (starRank) {
        case 4: return 82 + Math.floor(Math.random() * 6);   // 4★ gem → BC OVR (540-599)
        case 3: return 75 + Math.floor(Math.random() * 8);   // 3★ gem → 5★ OVR (500-539)
        case 2: return 68 + Math.floor(Math.random() * 10);  // 2★ gem → 4★ OVR (400-499)
        case 1: return 58 + Math.floor(Math.random() * 10);  // 1★ gem → 3★ OVR (300-399)
        default: return 75 + Math.floor(Math.random() * 8);
      }
    }
    if (isBust) {
      if (isPitcher) {
        // Pitcher bust targetAttrAvg — calibrated for the original clamp+OVR system.
        switch (starRank) {
          case 5: return 43 + Math.floor(Math.random() * 8);
          case 4: return 31 + Math.floor(Math.random() * 8);
          case 3: return 19 + Math.floor(Math.random() * 6);
          default: return 19 + Math.floor(Math.random() * 6);
        }
      }
      // Hitter bust: starting targetAttrAvg calibrated so the OVR retry converges to the bust's target band
      switch (starRank) {
        case 5: return 58 + Math.floor(Math.random() * 10);  // 5★ bust → 3★ OVR (300-399)
        case 4: return 52 + Math.floor(Math.random() * 10);  // 4★ bust → 2★ OVR (200-299)
        case 3: return 47 + Math.floor(Math.random() * 6);   // 3★ bust → 1★ OVR (150-199)
        default: return 47 + Math.floor(Math.random() * 6);
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
    // Hitter normal: starting targetAttrAvg calibrated to produce the correct OVR band via formula + retry
    switch (starRank) {
      case 5: return 75 + Math.floor(Math.random() * 8);   // targets 500-539
      case 4: return 68 + Math.floor(Math.random() * 10);  // targets 400-499
      case 3: return 58 + Math.floor(Math.random() * 10);  // targets 300-399
      case 2: return 52 + Math.floor(Math.random() * 10);  // targets 200-299
      default: return 47 + Math.floor(Math.random() * 6);  // targets 150-199
    }
  };

  // Returns the target OVR band [lo, hi] for a given hitter recruit tier.
  // Bands match the validator's expected ranges (validate-recruits.ts).
  // The retry loop converges targetAttrAvg until calculateOVR() lands within this band.
  // Ceiling clamps are applied after the retry as a safety net for tool-boost variance.
  const getRecruitOvrBand = (
    starRank: number, isGem: boolean, isBust: boolean, isBlueChip: boolean,
    isGenGem: boolean = false, isGenBust: boolean = false,
  ): [number, number] => {
    if (isBlueChip) return [540, 599];
    if (isGenGem) return [600, 650];
    if (isGenBust) return [150, 199];
    if (isGem) {
      const bands: Record<number, [number, number]> = { 1: [300, 399], 2: [400, 499], 3: [500, 539], 4: [540, 599] };
      return bands[starRank] ?? [500, 539];
    }
    if (isBust) {
      const bands: Record<number, [number, number]> = { 3: [150, 199], 4: [200, 299], 5: [300, 399] };
      return bands[starRank] ?? [200, 299];
    }
    // Normal: ±1 tier variance (matches NORMAL_OVR_BANDS in validate-recruits.ts)
    const normalBands: Record<number, [number, number]> = { 1: [150, 299], 2: [150, 399], 3: [200, 499], 4: [300, 539], 5: [400, 539] };
    return normalBands[starRank] ?? [300, 399];
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

  // Pre-assign guaranteed regular gems (numRegGems guaranteed minimum; wizard override already baked into numRegGems)
  const forcedGemIdxSet = new Set<number>();
  const eligibleForRegGem = gemCandidates
    .filter(x => !generationalGemIdxSet.has(x.idx) && !generationalBustIdxSet.has(x.idx))
    .sort(() => Math.random() - 0.5);
  for (let g = 0; g < Math.min(numRegGems, eligibleForRegGem.length); g++) {
    forcedGemIdxSet.add(eligibleForRegGem[g].idx);
  }

  // Pre-assign guaranteed regular busts (numRegBusts guaranteed minimum; wizard override already baked into numRegBusts)
  const forcedBustIdxSet = new Set<number>();
  const eligibleForRegBust = bustCandidates
    .filter(x => !generationalGemIdxSet.has(x.idx) && !generationalBustIdxSet.has(x.idx) && !forcedGemIdxSet.has(x.idx))
    .sort(() => Math.random() - 0.5);
  for (let b = 0; b < Math.min(numRegBusts, eligibleForRegBust.length); b++) {
    forcedBustIdxSet.add(eligibleForRegBust[b].idx);
  }

  const playerArchetypes: ("normal" | "late_bloomer" | "overdraft" | "raw")[] = new Array(count).fill("normal");

  // Wizard forced type for single-recruit reroll (count=1)
  const forced = opts.wizardForcedType;

  // Pre-assign guaranteed raw players (numRawPlayers guaranteed minimum; wizard override already baked into numRawPlayers)
  const forcedRawIdxSet = new Set<number>();
  {
    const eligibleForRaw = Array.from({ length: count }, (_, i) => i)
      .filter(i => i >= numBlueChips
               && !generationalGemIdxSet.has(i) && !generationalBustIdxSet.has(i)
               && !forcedGemIdxSet.has(i) && !forcedBustIdxSet.has(i));
    const shuffledForRaw = [...eligibleForRaw].sort(() => Math.random() - 0.5);
    for (let r = 0; r < Math.min(numRawPlayers, shuffledForRaw.length); r++) {
      forcedRawIdxSet.add(shuffledForRaw[r]);
      playerArchetypes[shuffledForRaw[r]] = "raw";
    }
  }

  // Pre-assign wizard-specified late bloomers and overdrafts
  const forcedLBIdxSet = new Set<number>();
  const forcedODIdxSet = new Set<number>();
  if (opts.wizardSpecialCounts?.lateBloomers != null && opts.wizardSpecialCounts.lateBloomers > 0) {
    const eligible = Array.from({ length: count }, (_, i) => i)
      .filter(i => i >= numBlueChips
               && !generationalGemIdxSet.has(i) && !generationalBustIdxSet.has(i)
               && !forcedRawIdxSet.has(i) && !forcedGemIdxSet.has(i) && !forcedBustIdxSet.has(i)
               && starRanks[i] >= 2 && starRanks[i] <= 4);
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const target = Math.min(opts.wizardSpecialCounts.lateBloomers, shuffled.length);
    for (let j = 0; j < target; j++) {
      forcedLBIdxSet.add(shuffled[j]);
      playerArchetypes[shuffled[j]] = "late_bloomer";
    }
  }
  if (opts.wizardSpecialCounts?.overdrafts != null && opts.wizardSpecialCounts.overdrafts > 0) {
    const eligible = Array.from({ length: count }, (_, i) => i)
      .filter(i => i >= numBlueChips
               && !generationalGemIdxSet.has(i) && !generationalBustIdxSet.has(i)
               && !forcedRawIdxSet.has(i) && !forcedGemIdxSet.has(i) && !forcedBustIdxSet.has(i)
               && !forcedLBIdxSet.has(i)
               && starRanks[i] >= 3 && starRanks[i] <= 5);
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const target = Math.min(opts.wizardSpecialCounts.overdrafts, shuffled.length);
    for (let j = 0; j < target; j++) {
      forcedODIdxSet.add(shuffled[j]);
      playerArchetypes[shuffled[j]] = "overdraft";
    }
  }

  const lbRate = 0.07;
  const odRate = 0.07;
  for (let i = numBlueChips; i < count; i++) {
    const sr = starRanks[i];
    if (generationalGemIdxSet.has(i) || generationalBustIdxSet.has(i)) continue;
    if (forcedRawIdxSet.has(i) || forcedGemIdxSet.has(i) || forcedBustIdxSet.has(i)) continue;
    if (forcedLBIdxSet.has(i) || forcedODIdxSet.has(i)) continue;
    const roll = Math.random();
    if (roll < lbRate && sr >= 2 && sr <= 4) {
      playerArchetypes[i] = "late_bloomer";
    } else if (roll < lbRate + odRate && sr >= 3 && sr <= 5) {
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
      // Hitter attrs: starting point for OVR retry (targets [540,599] for 3★, lower for 1-2★).
      // Retry fine-tunes attrs to hit the correct band. Pitcher attrs unchanged (Task #191).
      hitForAvg = isPitcher ? 85 + Math.floor(Math.random() * 15) : 73 + Math.floor(Math.random() * 8);
      power     = isPitcher ? 85 + Math.floor(Math.random() * 15) : 73 + Math.floor(Math.random() * 8);
      speed = sampleNormalSpeed(82, 6, 75, 95);
      arm       = isPitcher ? 85 + Math.floor(Math.random() * 15) : 73 + Math.floor(Math.random() * 8);
      fielding  = isPitcher ? 85 + Math.floor(Math.random() * 15) : 73 + Math.floor(Math.random() * 8);
      errorResistance = isPitcher ? 80 + Math.floor(Math.random() * 20) : 73 + Math.floor(Math.random() * 8);
      velocity = sampleNormalVelocity(82, 5, 70, 95);
      control = 85 + Math.floor(Math.random() * 15);
      stamina = 80 + Math.floor(Math.random() * 20);
      stuff = 85 + Math.floor(Math.random() * 15);
    } else if (isGenerationalBust) {
      // Hitter attrs calibrated so calculateOVR (with all-G/F common + 2 red specials) lands ~150-199.
      // Low speed (10-28) is the key OVR depressant alongside poor common/special abilities.
      // Pitcher attrs unchanged (Task #191 covers pitcher calibration).
      hitForAvg = isPitcher ? 15 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 5);
      power     = isPitcher ? 15 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 5);
      speed = sampleNormalSpeed(18, 5, 10, 28);
      arm       = isPitcher ? 15 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 5);
      fielding  = isPitcher ? 15 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 5);
      errorResistance = isPitcher ? 15 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 5);
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

    // ─── OVR calibration retry loop — all non-pitcher hitters ──────────────
    // Uses full calculateOVR (attrs + trial common + existing specials) so the
    // settled OVR matches the final stored value. Pitchers are skipped (Task #191).
    // GenGem/GenBust are included with their own fixed-style common ability generation
    // and direct attr adjustment (speed is never touched — it's fixed for all three).
    // Hitter themeBoosts applied BEFORE the retry loop so convergence targets the
    // final boosted attr values (power/speed/fielding only — velocity/stuff are pitcher attrs
    // applied after the pitcher wizard retry loop to avoid being overwritten by it).
    if (themeBoost.attr === "power")    power    = Math.min(99, power    + themeBoost.boost);
    if (themeBoost.attr === "speed")    speed    = Math.min(99, speed    + themeBoost.boost);
    if (themeBoost.attr === "fielding") fielding = Math.min(99, fielding + themeBoost.boost);

    // Fix trajectory before the retry loop so the OVR formula uses the same value throughout:
    // retry loop, recruitOvrData, and the recruit object all reference this single value.
    // This ensures stored overall == calculateOVR(final recruit attrs) with no trajectory drift.
    // Pitchers always use trajectory=2 (the formula default); for hitters, trajectory is derived
    // from the initial (pre-retry) attrs. The retry adjusts attrs proportionally, so the
    // trajectory classification (Power/Speed/Contact/Balanced) rarely changes during retry.
    const trajectory = isPitcher ? 2 : assignTrajectory(power, speed, hitForAvg);

    let lastHitterCommon: ReturnType<typeof generateCommonAbilities> | null = null;

    if (!isPitcher) {
      const hitBoostR = 6;
      const [defaultLo, defaultHi] = getRecruitOvrBand(
        starRank, isGem, isBust, isBlueChip, isGenerationalGem, isGenerationalBust,
      );
      // Wizard override applies only to normal non-special recruits
      const useWizard = wizardTargetOvrs && !isBlueChip && !isGem && !isBust && !isGenerationalGem && !isGenerationalBust;
      const retryLo = useWizard ? ovrMin : defaultLo;
      const retryHi = useWizard ? ovrMax : defaultHi;

      // Generate trialCommon ONCE before the retry loop.
      // Regenerating inside the loop adds random normalizeCommonAbilities noise that
      // can shift OVR by ±20 pts per iteration, making attr-based convergence unreliable.
      // Fixing common here makes each retry iteration purely a function of attrs.
      let trialCommon: ReturnType<typeof generateCommonAbilities>;
      if (isGenerationalGem) {
        const genElite = () => 90 + Math.floor(Math.random() * 10);
        trialCommon = {
          clutch: genElite(), vsLHP: genElite(), grit: genElite(), stealing: genElite(),
          running: genElite(), throwing: genElite(), recovery: genElite(),
          catcherAbility: position === 'C' ? genElite() : 50,
          wRISP: 50, vsLefty: 50, poise: 50, heater: 50, agile: 50,
        };
      } else if (isGenerationalBust) {
        const genPoor = () => 10 + Math.floor(Math.random() * 20);
        trialCommon = {
          clutch: genPoor(), vsLHP: genPoor(), grit: genPoor(), stealing: genPoor(),
          running: genPoor(), throwing: genPoor(), recovery: genPoor(),
          catcherAbility: position === 'C' ? genPoor() : 50,
          wRISP: 50, vsLefty: 50, poise: 50, heater: 50, agile: 50,
        };
      } else {
        trialCommon = generateCommonAbilities(false, position, targetAttrAvg, playerTooledAttrs, isRawArchetype);
        Object.assign(trialCommon, normalizeCommonAbilities(
          { position, firstName: `R${i}`, lastName: `C${i}`, ...trialCommon }, "",
        ));
      }
      lastHitterCommon = trialCommon;

      for (let retry = 0; retry <= 25; retry++) {
        const trialOvr = calculateOVR({
          position, hitForAvg, power, speed, arm, fielding, errorResistance,
          velocity, control, stamina, stuff,
          ...trialCommon, abilities, trajectory,
        });
        lastHitterCommon = trialCommon;
        if (trialOvr >= retryLo && trialOvr <= retryHi) break;
        if (retry === 25) break;
        if (isGenerationalGem) {
          // Step=2 keeps us within the 50-OVR [600,650] band without overshooting.
          const adjust = trialOvr < retryLo ? 2 : -2;
          hitForAvg = Math.max(30, Math.min(89, hitForAvg + adjust));
          power     = Math.max(30, Math.min(89, power     + adjust));
          arm       = Math.max(30, Math.min(89, arm       + adjust));
          fielding  = Math.max(30, Math.min(89, fielding  + adjust));
          errorResistance = Math.max(30, Math.min(89, errorResistance + adjust));
        } else if (isGenerationalBust) {
          const adjust = trialOvr < retryLo ? 5 : -5;
          hitForAvg = Math.max(40, Math.min(75, hitForAvg + adjust));
          power     = Math.max(40, Math.min(75, power     + adjust));
          arm       = Math.max(40, Math.min(75, arm       + adjust));
          fielding  = Math.max(40, Math.min(75, fielding  + adjust));
          errorResistance = Math.max(40, Math.min(75, errorResistance + adjust));
        } else {
          // Adaptive step: large when far from band, small near boundary to prevent
          // oscillation past narrow bands (e.g. gem 3★ [500–539] width=40).
          // With fixed trialCommon, OVR is purely a function of attrs — monotonic,
          // so the adaptive step reliably converges without overshooting.
          const distToLo = Math.max(0, retryLo - trialOvr);
          const distToHi = Math.max(0, trialOvr - retryHi);
          const dist = Math.max(distToLo, distToHi);
          const step = dist > 100 ? 5 : dist > 40 ? 3 : dist > 10 ? 2 : 1;
          const adjust = trialOvr < retryLo ? step : -step;
          hitForAvg = Math.max(1, Math.min(99, hitForAvg + adjust));
          power     = Math.max(1, Math.min(99, power     + adjust));
          arm       = Math.max(1, Math.min(99, arm       + adjust));
          fielding  = Math.max(1, Math.min(99, fielding  + adjust));
          errorResistance = Math.max(1, Math.min(99, errorResistance + adjust));
        }
      }
    }

    // ─── Wizard OVR correction retry loop — pitchers only ────────────────────
    // Preserved for pitchers in wizard mode to honor user-specified OVR ranges.
    // Uses preliminary attr-only OVR (pitch mix not yet generated here).
    if (isPitcher && wizardTargetOvrs && !isGenerationalGem && !isGenerationalBust && !isBlueChip) {
      const pitchPenaltyR = 3;
      for (let retry = 0; retry < 5; retry++) {
        const prelimOvr = calculateOVR({ position, hitForAvg, power, speed, arm, fielding, errorResistance, velocity, control, stamina, stuff });
        if (prelimOvr >= ovrMin && prelimOvr <= ovrMax) break;
        const adjust = prelimOvr < ovrMin ? 5 : -5;
        targetAttrAvg = Math.max(10, Math.min(90, targetAttrAvg + adjust));
        if (isRawArchetype) {
          const genR = (base: number, attr: string) => genRawToolAttr(base, playerTooledAttrs!.has(attr));
          hitForAvg = genR(targetAttrAvg, "hitForAvg");
          power     = genR(targetAttrAvg, "power");
          arm       = genR(targetAttrAvg, "arm");
          fielding  = genR(targetAttrAvg, "fielding");
          errorResistance = genR(targetAttrAvg, "errorResistance");
          control   = genR(targetAttrAvg, "control");
          stuff     = genR(targetAttrAvg - pitchPenaltyR, "stuff");
        } else {
          const genT = (base: number, attr: string) => genToolAttr(base, playerTooledAttrs!.has(attr));
          hitForAvg = genT(targetAttrAvg, "hitForAvg");
          power     = genT(targetAttrAvg, "power");
          arm       = genT(targetAttrAvg, "arm");
          fielding  = genT(targetAttrAvg, "fielding");
          errorResistance = genT(targetAttrAvg, "errorResistance");
          control   = genT(targetAttrAvg, "control");
          stuff     = genT(targetAttrAvg - pitchPenaltyR, "stuff");
        }
      }
    }

    // Pitcher-specific themeBoosts applied AFTER the pitcher wizard retry.
    // (The pitcher wizard retry regenerates velocity/stuff from targetAttrAvg, so the boost
    //  must come after to avoid being overwritten.)
    if (themeBoost.attr === "velocity") velocity = Math.min(99, velocity + themeBoost.boost);
    if (theme === "elite_pitching" && isPitcher) stuff = Math.min(99, stuff + 10);

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
    if (lastHitterCommon !== null) {
      // All hitters that went through the retry loop (including genGem/genBust hitters).
      // Common abilities were already generated and normalized inside the retry — reuse directly.
      commonAbilities = lastHitterCommon;
    } else if (isGenerationalGem) {
      // Only pitcher genGems reach here (hitter genGems have lastHitterCommon set above).
      const genElite = () => 90 + Math.floor(Math.random() * 10);
      commonAbilities = {
        wRISP: genElite(), vsLefty: genElite(), poise: genElite(), grit: genElite(),
        heater: genElite(), agile: genElite(), recovery: genElite(),
        clutch: 50, vsLHP: 50, stealing: 50, running: 50, throwing: 50, catcherAbility: 50,
      };
    } else if (isGenerationalBust) {
      // Only pitcher genBusts reach here.
      const genPoor = () => 10 + Math.floor(Math.random() * 20);
      commonAbilities = {
        wRISP: genPoor(), vsLefty: genPoor(), poise: genPoor(), grit: genPoor(),
        heater: genPoor(), agile: genPoor(), recovery: genPoor(),
        clutch: 50, vsLHP: 50, stealing: 50, running: 50, throwing: 50, catcherAbility: 50,
      };
    } else {
      // Regular pitchers and any rare hitter paths that didn't trigger the retry loop.
      commonAbilities = generateCommonAbilities(isPitcher, position, targetAttrAvg, playerTooledAttrs, isRawArchetype);
    }

    // Normalize common ability F/G distribution (skip for hitters whose retry already normalized).
    // Recruits are a national pool with no conference context; use "" (Tier 1 defaults).
    // normalizeCommonAbilities returns ONLY common ability keys — merging is safe.
    if (lastHitterCommon === null) {
      Object.assign(commonAbilities, normalizeCommonAbilities(
        { position, firstName: `R${i}`, lastName: `C${i}`, ...commonAbilities },
        "",
      ));
    }

    // ─── OVR calibration retry loop — normal pitchers only ──────────────────────
    // Adjusts velocity and control until calculateOVR() naturally lands inside the
    // correct star band — the same way hitter attrs are converged above.
    // Scoped to normal pitchers only (not gem/bust/blueChip): those archetypes retain
    // their intentional post-hoc OVR clamps (same as genGem/genBust for hitters),
    // because the pitcher OVR formula's headroom (~53 pts from vel+ctrl) cannot
    // reliably bridge the 70-100 pt gap needed for gem (500-539+) and bust (150-199)
    // bands from a typical starting OVR of 380-460.
    // Pitch mix and common abilities are fixed before this loop so OVR is a
    // monotonic function of velocity/control, guaranteeing convergence.
    // Stamina is excluded: it is set by pitcherStaminaBand and must stay independent.
    // Stuff is excluded: it has no effect on OVR when pitch field data is present
    // (pitch data takes over from the stuff-based fallback in calculateOVR).
    if (isPitcher && !isGenerationalGem && !isGenerationalBust && !isGem && !isBust && !isBlueChip) {
      const [retryLo, retryHi] = getRecruitOvrBand(
        starRank, false, false, false, false, false,
      );
      for (let retry = 0; retry <= 25; retry++) {
        const trialOvr = calculateOVR({
          position, hitForAvg, power, speed, arm, fielding, errorResistance,
          velocity, control, stamina, stuff, ...commonAbilities, abilities,
          ...pitchMix, trajectory,
        });
        if (trialOvr >= retryLo && trialOvr <= retryHi) break;
        if (retry === 25) break;
        const distToLo = Math.max(0, retryLo - trialOvr);
        const distToHi = Math.max(0, trialOvr - retryHi);
        const dist = Math.max(distToLo, distToHi);
        const step = dist > 100 ? 5 : dist > 40 ? 3 : dist > 10 ? 2 : 1;
        const adjust = trialOvr < retryLo ? step : -step;
        velocity = Math.max(1, Math.min(99, velocity + adjust));
        control  = Math.max(1, Math.min(99, control  + adjust));
      }
    }

    const scoutingOrder = generateScoutingOrder(isPitcher, position);

    const recruitOvrData = {
      position, hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff, ...commonAbilities, abilities,
      ...pitchMix, trajectory,
    };
    let overall = calculateOVR(recruitOvrData);

    // ─── OVR adjustments — generational extremes, pitcher archetype clamps, and intentional distortions ──
    // Normal hitters: retry loop has already landed calculateOVR() in the correct band. No post-hoc clamp.
    // Normal pitchers: retry loop convergences velocity/control to band. No post-hoc clamp.
    // Generational gems/busts (all positions): fixed attr ranges + intentional extreme clamp retained.
    // Pitcher gems/busts/blueChips: retain intentional post-hoc OVR clamps — the pitcher OVR
    //   formula's ~53-pt velocity+control headroom cannot reliably bridge the gem/bust band gap.
    //   These clamps make pitcher gem/bust/blueChip OVRs match their archetype bands.
    // late_bloomer and overdraft: intentional OVR distortion applied to non-gem/bust hitters.
    if (isGenerationalGem && isPitcher) {
      overall = Math.max(600, Math.min(650, overall));
    } else if (isGenerationalBust && isPitcher) {
      overall = Math.max(150, Math.min(199, overall));
    } else if (isBlueChip && isPitcher) {
      overall = Math.max(540, Math.min(599, overall));
    } else if (isGem && isPitcher) {
      const gemPitcherRanges: Record<number, [number, number]> = {
        4: [540, 599], 3: [500, 539], 2: [400, 499], 1: [300, 399],
      };
      const [gLo, gHi] = gemPitcherRanges[starRank] ?? [500, 539];
      overall = Math.max(gLo, Math.min(gHi, overall));
    } else if (isBust && isPitcher) {
      const bustPitcherRanges: Record<number, [number, number]> = {
        5: [300, 399], 4: [200, 299], 3: [150, 199],
      };
      const [bLo, bHi] = bustPitcherRanges[starRank] ?? [200, 299];
      overall = Math.max(bLo, Math.min(bHi, overall));
    } else if (playerArchetype === "late_bloomer" && !isGem && !isBust) {
      // Late bloomer: OVR depressed below their star tier — intentional archetype distortion.
      // Hitters: retry calibrated attrs to star band; clamp then depresses OVR one tier lower.
      // Gems and busts are exempt — their OVR band is already set by the gem/bust mechanic.
      const starCaps: Record<number, number> = { 5: 539, 4: 499, 3: 399, 2: 299, 1: 199 };
      const baseCap = starCaps[starRank] ?? 499;
      const depression = 45 + Math.floor(Math.random() * 40);
      overall = Math.max(150, Math.min(baseCap, overall) - depression);
    } else if (playerArchetype === "overdraft" && !isGem && !isBust) {
      // Overdraft: OVR inflated above their star tier — intentional archetype distortion.
      // Hitters: retry calibrated attrs to star band; inflation then pushes OVR one tier higher.
      // Gems and busts are exempt — their OVR band is already set by the gem/bust mechanic.
      const nextTierFloor: Record<number, number> = { 5: 510, 4: 410, 3: 310, 2: 210, 1: 160 };
      const nextTierCap:  Record<number, number> = { 5: 599, 4: 539, 3: 499, 2: 399, 1: 299 };
      const floor = nextTierFloor[starRank] ?? 410;
      const cap   = nextTierCap[starRank] ?? 499;
      const inflation = 40 + Math.floor(Math.random() * 40);
      overall = Math.max(floor, Math.min(cap, overall + inflation));
    }

    // Enforce gold OVR gate: generational gems/busts are exempt (extreme archetypes).
    if (!isGenerationalGem && !isGenerationalBust) {
      const gated = enforceGoldOvrGate(abilities, position, overall, pitcherStaminaForAbilities);
      if (gated !== abilities) {
        abilities = gated;
        // Precise recalculate for both pitchers and hitters so stored OVR = formula OVR.
        overall = calculateOVR({ ...recruitOvrData, abilities: gated });
        // Post-gate re-retry for gem/bust/blueChip: the gold→blue swap shifts specialTotal
        // and can push OVR outside the retry-targeted band. Re-converge attrs (≤5 iterations)
        // for pitchers (velocity/control/stuff) and hitters (batting attrs).
        if (isGem || isBust || isBlueChip) {
          const [rrLo, rrHi] = getRecruitOvrBand(starRank, isGem, isBust, isBlueChip, false, false);
          for (let rr = 0; rr <= 5; rr++) {
            overall = calculateOVR({
              position, hitForAvg, power, speed, arm, fielding, errorResistance,
              velocity, control, stamina, stuff,
              ...commonAbilities, abilities, ...pitchMix, trajectory,
            });
            if (overall >= rrLo && overall <= rrHi) break;
            if (rr === 5) break;
            const dist = Math.max(Math.max(0, rrLo - overall), Math.max(0, overall - rrHi));
            const adj = overall < rrLo ? (dist > 10 ? 2 : 1) : -(dist > 10 ? 2 : 1);
            if (isPitcher) {
              velocity = Math.max(1, Math.min(99, velocity + adj));
              control  = Math.max(1, Math.min(99, control  + adj));
              stuff    = Math.max(1, Math.min(99, stuff    + adj));
            } else {
              hitForAvg       = Math.max(1, Math.min(99, hitForAvg       + adj));
              power           = Math.max(1, Math.min(99, power           + adj));
              arm             = Math.max(1, Math.min(99, arm             + adj));
              fielding        = Math.max(1, Math.min(99, fielding        + adj));
              errorResistance = Math.max(1, Math.min(99, errorResistance + adj));
            }
          }
        }
      }
    }
    // Re-apply pitcher gem/bust/blueChip OVR clamps after gold gate.
    // The gold gate recalculates OVR directly from attrs (which may be above/below
    // the clamp band), and the 5-step post-gate re-retry is insufficient to fully
    // converge in all cases. Re-clamping here ensures the final stored OVR is in band.
    // Generational gems/busts are exempt — their earlier clamp already handles them.
    if (isPitcher && !isGenerationalGem && !isGenerationalBust) {
      if (isBlueChip) {
        overall = Math.max(540, Math.min(599, overall));
      } else if (isGem) {
        const gemPRanges: Record<number, [number, number]> = {
          4: [540, 599], 3: [500, 539], 2: [400, 499], 1: [300, 399],
        };
        const [gpLo, gpHi] = gemPRanges[starRank] ?? [500, 539];
        overall = Math.max(gpLo, Math.min(gpHi, overall));
      } else if (isBust) {
        const bustPRanges: Record<number, [number, number]> = {
          5: [300, 399], 4: [200, 299], 3: [150, 199],
        };
        const [bpLo, bpHi] = bustPRanges[starRank] ?? [200, 299];
        overall = Math.max(bpLo, Math.min(bpHi, overall));
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
      trajectory,
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
        position,
        recruitState.state,
      ),
    });
  }

  // ─── Class composition summary log ──────────────────────────────────────
  {
    const genGemCount  = out.filter(r => r.isGenerationalGem).length;
    const genBustCount = out.filter(r => r.isGenerationalBust).length;
    const bcCount      = out.filter(r => r.isBlueChip && !r.isGenerationalGem).length;
    const gemCount     = out.filter(r => r.isGem && !r.isGenerationalGem).length;
    const bustCount    = out.filter(r => r.isBust && !r.isGenerationalBust).length;
    const rawCount     = out.filter(r => r.playerArchetype === "raw").length;
    const lbCount      = out.filter(r => r.playerArchetype === "late_bloomer").length;
    const odCount      = out.filter(r => r.playerArchetype === "overdraft").length;
    const normalCount  = out.length - genGemCount - genBustCount - bcCount - gemCount - bustCount - rawCount - lbCount - odCount;
    console.log(
      `[recruit-class] theme=${theme} count=${out.length} | ` +
      `genGems=${genGemCount} genBusts=${genBustCount} blueChips=${bcCount} ` +
      `gems=${gemCount} busts=${bustCount} raw=${rawCount} ` +
      `lateBloomer=${lbCount} overdraft=${odCount} normal=${normalCount}`
    );
  }

  // Post-processing pass 1: assign display-based positionRank (fog-of-war).
  // Coaches see position rank based on displayed star rating + class rank as
  // tiebreaker — not true OVR.  A hidden gem appears lower in the position
  // pecking order than their talent warrants; a bust appears higher.
  {
    const byPosition = new Map<string, typeof out>();
    for (const r of out) {
      const pos = r.position ?? "SP";
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(r);
    }
    for (const group of byPosition.values()) {
      // Sort by displayed star descending, then classRank ascending as tiebreaker
      group.sort((a, b) => {
        const starDiff = (b.starRating ?? 0) - (a.starRating ?? 0);
        if (starDiff !== 0) return starDiff;
        return (a.classRank ?? 999) - (b.classRank ?? 999);
      });
      group.forEach((r, idx) => { r.positionRank = idx + 1; });
    }
  }

  // Post-processing pass 2: apply position-scarcity NIL multiplier.
  // Multiplier uses displayed star ordering so no hidden-value information
  // is leaked through NIL cost.
  {
    const byPosition = new Map<string, typeof out>();
    for (const r of out) {
      const pos = r.position ?? "SP";
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(r);
    }
    for (const group of byPosition.values()) {
      group.sort((a, b) => {
        const starDiff = (b.starRating ?? 0) - (a.starRating ?? 0);
        if (starDiff !== 0) return starDiff;
        return (a.classRank ?? 999) - (b.classRank ?? 999);
      });
      group.forEach((r, idx) => {
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
