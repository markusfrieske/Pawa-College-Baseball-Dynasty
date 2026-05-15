import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import type { InsertRecruit } from "@shared/schema";

// ── Tool archetype system ─────────────────────────────────────────────────────
// Each player is assigned a set of "tools" — areas of specialisation.
// Tool attributes are boosted well above the tier baseline; non-tool attributes
// are mildly penalised below it.  This makes low-star players feel distinct
// rather than uniformly poor across the board.

export const HITTER_TOOL_GROUPS: Record<string, string[]> = {
  Speed:    ["speed", "running", "stealing"],
  Power:    ["power"],
  Hit:      ["hitForAvg", "clutch", "wRISP"],
  Fielding: ["fielding", "agile", "errorResistance"],
  Arm:      ["arm", "throwing"],
};

export const PITCHER_TOOL_GROUPS: Record<string, string[]> = {
  Velocity: ["velocity"],
  Control:  ["control"],
  Stuff:    ["stuff"],
  Stamina:  ["stamina"],
};

/**
 * Randomly choose how many tools a player gets by star tier and pick which ones.
 * Returns an array of tool-name strings (e.g. ["Speed", "Fielding"]).
 */
export function selectTools(starRank: number, isPitcher: boolean): string[] {
  const groups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
  const allToolNames = Object.keys(groups);

  let count: number;
  switch (starRank) {
    case 5:  count = 3 + Math.floor(Math.random() * 3); break; // 3–5
    case 4:  count = 2 + Math.floor(Math.random() * 3); break; // 2–4
    case 3:  count = 1 + Math.floor(Math.random() * 3); break; // 1–3
    case 2:  count = 1 + Math.floor(Math.random() * 2); break; // 1–2
    default: count = Math.random() < 0.5 ? 1 : 0;     break; // 0–1
  }
  count = Math.min(count, allToolNames.length);
  if (count === 0) return [];
  const shuffled = [...allToolNames].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate a single attribute value with a tool boost or non-tool penalty.
 *
 * @param base     - The tier baseline (already includes position adjustments
 *                   like hitBoost or pitchPenalty).
 * @param isTool   - Whether this attribute belongs to one of the player's tools.
 * @returns        A value clamped to [10, 99].
 */
export function genToolAttr(base: number, isTool: boolean): number {
  if (isTool) {
    // +20 to +35 above the baseline
    const boost = 20 + Math.floor(Math.random() * 16);
    return Math.max(10, Math.min(99, base + boost));
  } else {
    // -5 to -10 below the baseline
    const penalty = 5 + Math.floor(Math.random() * 6);
    return Math.max(10, Math.min(99, base - penalty));
  }
}

export type RecruitingTheme = "high_velocity" | "sluggers" | "balanced" | "top_heavy" | "hidden_gems";

export function getRandomRecruitingTheme(): RecruitingTheme {
  const themes: RecruitingTheme[] = ["high_velocity", "sluggers", "balanced", "top_heavy", "hidden_gems"];
  return themes[Math.floor(Math.random() * themes.length)];
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
  // Recruits may wear eye black, but less commonly than active players (~15% vs ~28%).
  // High school & incoming college players wear it selectively — not player-only restriction.
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
}

export type GeneratedRecruit = Omit<InsertRecruit, "leagueId">;

export function generateRecruitClass(
  count: number,
  opts: GenerateRecruitClassOptions = {},
): GeneratedRecruit[] {
  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb", "Jayden", "Bryce", "Hunter", "Chase", "Trey"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Walker", "Hall", "Young", "King"];
  // OF positions (LF/CF/RF) get 2× weight vs each infield slot to ensure teams
  // can field enough outfielders each class.
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "LF", "LF", "CF", "CF", "RF", "RF"];
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

  const totalPct = stateData.reduce((sum, s) => sum + s.pct, 0);
  const pickWeightedState = (): number => {
    const roll = Math.random() * totalPct;
    let cumulative = 0;
    for (let i = 0; i < stateData.length; i++) {
      cumulative += stateData[i].pct;
      if (roll < cumulative) return i;
    }
    return stateData.length - 1;
  };
  const stateAssignments: number[] = [];
  for (let i = 0; i < count; i++) {
    stateAssignments.push(pickWeightedState());
  }
  const priorities = ["Extremely", "Very", "Somewhat", "Not Important"];

  const theme = opts.theme ?? getRandomRecruitingTheme();

  const getPitcherRatio = (theme: RecruitingTheme): number => {
    switch (theme) {
      case "high_velocity": return 0.55;
      case "sluggers": return 0.35;
      case "balanced": return 0.40;
      case "top_heavy": return 0.40;
      case "hidden_gems": return 0.40;
      default: return 0.40;
    }
  };

  const pitcherRatio = getPitcherRatio(theme);

  const getStarRank = (idx: number, total: number, theme: RecruitingTheme): number => {
    const pct = idx / total;
    if (theme === "top_heavy") {
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

  const numBlueChips = Math.max(2, Math.floor(count * 0.03) + (Math.random() < 0.5 ? 1 : 0));

  const getGemBustModifier = (theme: RecruitingTheme, starRank: number): { isGem: boolean; isBust: boolean } => {
    const roll = Math.random();
    const gemChance = theme === "hidden_gems" ? 0.18 : 0.10;
    const bustChance = theme === "hidden_gems" ? 0.04 : 0.08;
    if (starRank >= 1 && starRank <= 3 && roll < gemChance) return { isGem: true, isBust: false };
    if (starRank >= 3 && starRank <= 5 && roll < bustChance) return { isGem: false, isBust: true };
    return { isGem: false, isBust: false };
  };

  // Pitcher OVR formula: pitchCore*0.85 + pitchField*0.20 + pitchCommon*0.25
  // produces ~90 fewer OVR points than the hitter formula at the same raw attribute
  // average (e.g. hitter at avg=43 → OVR ~317; pitcher at avg=43 → OVR ~237).
  // Pitcher bands are therefore calibrated ~22 points higher than hitter bands so
  // generated pitcher recruits land in the correct OVR tier for their star rank.
  const getTargetAttrAvgForRecruit = (starRank: number, isBlueChip: boolean, isGem: boolean, isBust: boolean, isPitcher: boolean): number => {
    if (isBlueChip) return isPitcher ? 80 + Math.floor(Math.random() * 5) : 68 + Math.floor(Math.random() * 5);
    if (isGem) {
      if (isPitcher) {
        // Gem pitchers still punch well above their star tier, but bands are
        // scaled down proportionally with the regular pitcher deflation.
        switch (starRank) {
          case 3: return 67 + Math.floor(Math.random() * 10);  // was 77-88
          case 2: return 58 + Math.floor(Math.random() * 10);  // was 67-78
          case 1: return 51 + Math.floor(Math.random() * 10);  // was 60-71
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
      // Pitcher-specific bands recalibrated so regular recruits stay well below 400 OVR.
      // Target OVR bands (before per-star cap):
      //   5★ → 350-499 (capped at 499; only blue chips touch 500+)
      //   4★ → 280-449 (capped at 449)
      //   3★ → 220-374 (capped at 374; avg ≈ 290)
      //   2★ → 170-299 (capped at 299)
      //   1★ → 159-224 (floor-clamped at 159)
      switch (starRank) {
        case 5: return 65 + Math.floor(Math.random() * 7);   // 65-71 (was 80-89)
        case 4: return 54 + Math.floor(Math.random() * 7);   // 54-60 (was 70-77)
        case 3: return 43 + Math.floor(Math.random() * 7);   // 43-49 (was 60-69)
        case 2: return 31 + Math.floor(Math.random() * 7);   // 31-37 (was 44-53)
        default: return 19 + Math.floor(Math.random() * 6);  // 19-24 (was 30-37)
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

  const generatePitchMix = (isPitcher: boolean) => {
    const empty = {
      pitchFB: 0 as (0 | 1), pitch2S: 0 as (0 | 1), pitchSL: 0, pitchCB: 0,
      pitchCH: 0 as (0 | 1), pitchCT: 0, pitchSNK: 0, pitchSPL: 0, pitchSHU: 0,
      pitchCCH: 0, pitchHSL: 0, pitchSWP: 0, pitchKN: 0, pitchVSL: 0,
      pitchSFF: 0, pitchFK: 0, pitchSCB: 0, pitchPCB: 0,
    };
    if (!isPitcher) return empty;

    const pitchFB = 1;
    const pitch2S = Math.random() < 0.5 ? 1 : 0;

    const commonPool = ['SL', 'CB', 'CH', 'CT', 'SNK', 'SPL'];
    const rarePool = ['SHU', 'CCH', 'HSL', 'SWP', 'KN', 'VSL', 'SFF', 'FK', 'SCB', 'PCB'];

    const shuffledCommon = [...commonPool].sort(() => Math.random() - 0.5);
    const shuffledRare = [...rarePool].sort(() => Math.random() - 0.5);

    const numCommon = 2 + Math.floor(Math.random() * 2);
    const numRare = Math.random() < 0.3 ? 1 : 0;
    const selectedSecondary = new Set([
      ...shuffledCommon.slice(0, numCommon),
      ...shuffledRare.slice(0, numRare),
    ]);

    const rndRating = () => 1 + Math.floor(Math.random() * 7);

    return {
      pitchFB, pitch2S,
      pitchSL: selectedSecondary.has('SL') ? rndRating() : 0,
      pitchCB: selectedSecondary.has('CB') ? rndRating() : 0,
      pitchCH: (selectedSecondary.has('CH') ? 1 : 0) as 0 | 1,
      pitchCT: selectedSecondary.has('CT') ? rndRating() : 0,
      pitchSNK: selectedSecondary.has('SNK') ? rndRating() : 0,
      pitchSPL: selectedSecondary.has('SPL') ? rndRating() : 0,
      pitchSHU: selectedSecondary.has('SHU') ? rndRating() : 0,
      pitchCCH: selectedSecondary.has('CCH') ? rndRating() : 0,
      pitchHSL: selectedSecondary.has('HSL') ? rndRating() : 0,
      pitchSWP: selectedSecondary.has('SWP') ? rndRating() : 0,
      pitchKN: selectedSecondary.has('KN') ? rndRating() : 0,
      pitchVSL: selectedSecondary.has('VSL') ? rndRating() : 0,
      pitchSFF: selectedSecondary.has('SFF') ? rndRating() : 0,
      pitchFK: selectedSecondary.has('FK') ? rndRating() : 0,
      pitchSCB: selectedSecondary.has('SCB') ? rndRating() : 0,
      pitchPCB: selectedSecondary.has('PCB') ? rndRating() : 0,
    };
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

  const generateCommonAbilityValue = (targetAvg: number): number => {
    const variance = Math.floor(Math.random() * 21) - 10;
    return Math.max(1, Math.min(100, targetAvg + variance));
  };

  // When tooledAttrs is provided, common abilities that belong to a tool group
  // are boosted/penalised via genToolAttr; attrs NOT in any tool group always use
  // flat variance regardless (consistent with CPU roster generation in routes.ts).
  const generateCommonAbilities = (
    isPitcher: boolean,
    position: string,
    targetAvg: number,
    tooledAttrs?: Set<string>,
  ) => {
    // Pre-compute the full set of keys that appear in ANY group for this player type
    // so we never apply a tool penalty to flavour/utility attrs that aren't grouped.
    const allGroupKeys = new Set<string>(
      Object.values(isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS).flat(),
    );

    const val = (attrName: string) => {
      if (tooledAttrs && allGroupKeys.has(attrName)) {
        // Only apply boost/penalty to attrs that are in at least one tool group
        return genToolAttr(targetAvg, tooledAttrs.has(attrName));
      }
      return generateCommonAbilityValue(targetAvg);
    };

    if (isPitcher) {
      return {
        // In-tool-group for pitchers: velocity/control/stuff/stamina (handled above in main attrs).
        // All common pitcher abilities fall outside PITCHER_TOOL_GROUPS → flat variance.
        wRISP: val("wRISP"),
        vsLefty: val("vsLefty"),
        poise: val("poise"),
        grit: val("grit"),
        heater: val("heater"),
        agile: val("agile"),
        recovery: val("recovery"),
        clutch: 50,
        vsLHP: 50,
        stealing: 50,
        running: 50,
        throwing: 50,
        catcherAbility: 50,
      };
    } else {
      return {
        // In-tool-group for hitters: hitForAvg/power/speed/arm/fielding/errorResistance
        // handled above.  Common hitter abilities that ARE in groups: clutch, wRISP (Hit),
        // stealing/running (Speed), throwing (Arm), agile (Fielding).
        // Not in any hitter group → flat: vsLHP, grit, recovery, vsLefty, poise, heater.
        clutch: val("clutch"),
        vsLHP: val("vsLHP"),        // not in any hitter group → flat
        grit: val("grit"),          // not in any hitter group → flat
        stealing: val("stealing"),
        running: val("running"),
        throwing: val("throwing"),
        recovery: val("recovery"),  // not in any hitter group → flat
        catcherAbility: position === 'C' ? val("catcherAbility") : 50,
        wRISP: val("wRISP"),        // in Hit group → boosted/penalised
        vsLefty: 50,
        poise: 50,
        heater: 50,
        agile: val("agile"),
      };
    }
  };

  const getThemeBoost = (theme: RecruitingTheme, isPitcher: boolean): { attr: string; boost: number } => {
    if (theme === "high_velocity" && isPitcher) return { attr: "velocity", boost: 15 };
    if (theme === "sluggers" && !isPitcher) return { attr: "power", boost: 15 };
    return { attr: "", boost: 0 };
  };

  const starRanks: number[] = [];
  for (let i = 0; i < count; i++) {
    starRanks.push(getStarRank(i, count, theme));
  }
  const gemCandidates = starRanks.map((sr, idx) => ({ sr, idx })).filter(x => (x.sr >= 1 && x.sr <= 3) && x.idx >= numBlueChips);
  const bustCandidates = starRanks.map((sr, idx) => ({ sr, idx })).filter(x => (x.sr >= 3 && x.sr <= 5) && x.idx >= numBlueChips);
  const generationalGemIdx = gemCandidates.length > 0 ? gemCandidates[Math.floor(Math.random() * gemCandidates.length)].idx : -1;
  // Prevent collision: if gem and bust would land on the same index, the
  // recruit gets contradictory flags. Exclude the gem index from the bust pool.
  const bustCandidatesFiltered = bustCandidates.filter(x => x.idx !== generationalGemIdx);
  const generationalBustIdx = bustCandidatesFiltered.length > 0 ? bustCandidatesFiltered[Math.floor(Math.random() * bustCandidatesFiltered.length)].idx : -1;

  const out: GeneratedRecruit[] = [];

  for (let i = 0; i < count; i++) {
    const isPitcher = Math.random() < pitcherRatio;
    const position = isPitcher ? "P" : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];

    const starRank = starRanks[i];
    const stateIdx = stateAssignments[i] || 0;
    const recruitState = stateData[stateIdx];
    const recruitCity = recruitState.cities[Math.floor(Math.random() * recruitState.cities.length)];
    const isBlueChip = i < numBlueChips;
    const isGenerationalGem = i === generationalGemIdx;
    const isGenerationalBust = i === generationalBustIdx;

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
      const gemBust = isBlueChip
        ? { isGem: false, isBust: false }
        : getGemBustModifier(theme, starRank);
      isGem = gemBust.isGem;
      isBust = isBlueChip ? false : gemBust.isBust;
      targetAttrAvg = getTargetAttrAvgForRecruit(starRank, isBlueChip, isGem, isBust, isPitcher);
      abilityCount = getAbilityCount(starRank, isBlueChip);
    }

    const starRating = starRank;

    let abilities: string[];
    if (isGenerationalGem) {
      const availableAbilities = getAbilitiesForPosition(position);
      const goldAbilities = availableAbilities.filter(a => a.tier === "gold");
      const blueAbilities = availableAbilities.filter(a => a.tier === "blue");
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
      abilities = getRandomAbilities(position, abilityCount, starRank >= 4);
    }

    const appearance = getRandomAppearance();

    const recruitType = Math.random() < 0.8 ? "HS" : "JUCO";
    let recruitYear = "FR";
    if (recruitType === "JUCO") {
      const rand = Math.random();
      if (rand < 0.4) recruitYear = "FR";
      else if (rand < 0.8) recruitYear = "SO";
      else recruitYear = "JR";
    }

    const themeBoost = getThemeBoost(theme, isPitcher);
    const genAttr = (avg: number) => Math.max(1, Math.min(100, avg + Math.floor(Math.random() * 21) - 10));

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
      speed = 80 + Math.floor(Math.random() * 20);
      arm = 85 + Math.floor(Math.random() * 15);
      fielding = 85 + Math.floor(Math.random() * 15);
      errorResistance = 80 + Math.floor(Math.random() * 20);
      velocity = 85 + Math.floor(Math.random() * 15);
      control = 85 + Math.floor(Math.random() * 15);
      stamina = 80 + Math.floor(Math.random() * 20);
      stuff = 85 + Math.floor(Math.random() * 15);
    } else if (isGenerationalBust) {
      hitForAvg = 15 + Math.floor(Math.random() * 25);
      power = 15 + Math.floor(Math.random() * 25);
      speed = 15 + Math.floor(Math.random() * 25);
      arm = 15 + Math.floor(Math.random() * 25);
      fielding = 15 + Math.floor(Math.random() * 25);
      errorResistance = 15 + Math.floor(Math.random() * 25);
      velocity = 15 + Math.floor(Math.random() * 25);
      control = 15 + Math.floor(Math.random() * 25);
      stamina = 15 + Math.floor(Math.random() * 25);
      stuff = 15 + Math.floor(Math.random() * 25);
    } else {
      // Select tools for this player and build the set of all tooled attribute keys.
      selectedTools = selectTools(starRank, isPitcher);
      const toolGroups = isPitcher ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
      playerTooledAttrs = new Set<string>(selectedTools.flatMap(t => toolGroups[t] ?? []));
      const genT = (base: number, attr: string) => genToolAttr(base, playerTooledAttrs!.has(attr));

      // Hitters get a +6 boost to core hitting attrs; pitchers use a higher
      // targetAttrAvg (from getTargetAttrAvgForRecruit) to compensate for the
      // pitcher OVR formula producing ~90 fewer points than the hitter formula
      // at the same raw attribute average.
      const hitBoost = isPitcher ? 0 : 6;
      const pitchPenalty = isPitcher ? 3 : 0;

      hitForAvg = genT(targetAttrAvg + hitBoost, "hitForAvg");
      power     = genT(targetAttrAvg + hitBoost, "power");
      speed     = genT(targetAttrAvg + hitBoost, "speed");
      arm       = genT(targetAttrAvg,            "arm");
      fielding  = genT(targetAttrAvg,            "fielding");
      errorResistance = genT(targetAttrAvg,      "errorResistance");
      velocity  = genT(targetAttrAvg - pitchPenalty, "velocity");
      control   = genT(targetAttrAvg,               "control");
      stamina   = genT(targetAttrAvg,               "stamina");
      stuff     = genT(targetAttrAvg - pitchPenalty, "stuff");
    }

    if (themeBoost.attr === "velocity") velocity = Math.min(99, velocity + themeBoost.boost);
    if (themeBoost.attr === "power") power = Math.min(99, power + themeBoost.boost);

    const pitchMix = generatePitchMix(isPitcher);

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
      commonAbilities = generateCommonAbilities(isPitcher, position, targetAttrAvg, playerTooledAttrs);
    }

    const scoutingOrder = generateScoutingOrder(isPitcher, position);

    const recruitOvrData = {
      position,
      hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff,
      ...commonAbilities,
      abilities,
    };
    let overall = calculateOVR(recruitOvrData);

    if (isGenerationalGem) {
      overall = Math.max(651, Math.min(999, overall));
    } else if (isGenerationalBust) {
      overall = Math.min(overall, 149);
    } else if (isBlueChip) {
      overall = Math.max(500, Math.min(650, overall));
    } else if (isGem || isBust) {
      // Gems punch above their star band; busts below. Neither gets a per-star cap.
      overall = Math.max(159, Math.min(650, overall));
    } else {
      // Regular recruits: per-star ceiling so 500+ stays blue-chip territory
      // and the overall average stays realistic.
      const starCaps: Record<number, number> = { 5: 499, 4: 449, 3: 374, 2: 299, 1: 224 };
      const cap = starCaps[starRank] ?? 499;
      overall = Math.max(159, Math.min(cap, overall));
    }
    const computedStarRating = getStarRatingFromOVR(overall);

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
      hitForAvg,
      power,
      speed,
      arm,
      fielding,
      errorResistance,
      velocity,
      control,
      stamina,
      stuff,
      ...pitchMix,
      ...commonAbilities,
      abilities,
      scoutingOrder,
      proximityPriority: priorities[Math.floor(Math.random() * priorities.length)],
      reputationPriority: priorities[Math.floor(Math.random() * priorities.length)],
      playingTimePriority: priorities[Math.floor(Math.random() * priorities.length)],
      academicsPriority: priorities[Math.floor(Math.random() * priorities.length)],
      prestigePriority: priorities[Math.floor(Math.random() * priorities.length)],
      facilitiesPriority: priorities[Math.floor(Math.random() * priorities.length)],
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
    });
  }

  return out;
}
