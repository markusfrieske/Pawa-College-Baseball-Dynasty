export interface Ability {
  name: string;
  description: string;
  tier: "gold" | "blue" | "red";
  category: "pitcher" | "fielder" | "catcher" | "neutral";
}

export const PITCHER_GOLD_ABILITIES: Ability[] = [
  { name: "Explosive Fastball", description: "Fastball speed and power is increased at the cost of control", tier: "gold", category: "pitcher" },
  { name: "Perfect Combustion", description: "With RISP, stamina consumption is greatly increased, but abilities are also greatly increased", tier: "gold", category: "pitcher" },
  { name: "Big Boy Speed", description: "Greatly increased perceived speed of fastball", tier: "gold", category: "pitcher" },
  { name: "Monster Stuff", description: "Batted balls are extremely unlikely to fly", tier: "gold", category: "pitcher" },
  { name: "Gas Tank", description: "Stamina is very quickly recovered", tier: "gold", category: "pitcher" },
  { name: "Delayed Arm", description: "Pitch location indicator will appear much later and smaller", tier: "gold", category: "pitcher" },
  { name: "Gear Change", description: "When facing a strong hitter in a specific scenario, a starting pitcher's ability will greatly increase", tier: "gold", category: "pitcher" },
  { name: "Miracle Sharpness", description: "Breaking balls break extremely late", tier: "gold", category: "pitcher" },
  { name: "Sangfroid", description: "Abilities will greatly improve with runners in scoring position", tier: "gold", category: "pitcher" },
  { name: "Wizard Mode", description: "Starting pitcher's abilities greatly improve in the second half of the game", tier: "gold", category: "pitcher" },
  { name: "Star of Victory", description: "When this pitcher takes the mound, wins are extremely easy to come by", tier: "gold", category: "pitcher" },
  { name: "Showtime", description: "The better a pitcher pitches, the better their batting becomes and vice versa", tier: "gold", category: "pitcher" },
  { name: "Slugger Killer", description: "When facing a strong batter, pitcher's ability will greatly increase", tier: "gold", category: "pitcher" },
  { name: "Precision Instrument", description: "Control of low pitches is greatly improved", tier: "gold", category: "pitcher" },
  { name: "Halting Quickness", description: "Delivery while pitching out of the stretch is incredibly quick, hampering stolen base attempts", tier: "gold", category: "pitcher" },
  { name: "Iron Arm", description: "Mood barely affects performance", tier: "gold", category: "pitcher" },
  { name: "Fighting Spirit", description: "Pitcher will pitch full of fighting spirit, much less likely to be rattled", tier: "gold", category: "pitcher" },
  { name: "Top Gear", description: "Pitcher will have a very strong start to the game", tier: "gold", category: "pitcher" },
  { name: "Grit", description: "Even when stamina is low, pitching ability will remain consistent", tier: "gold", category: "pitcher" },
  { name: "Doctor K", description: "When batter has 2 strikes, pitcher's ability is greatly increased", tier: "gold", category: "pitcher" },
  { name: "Painter", description: "Control of inside pitches is greatly improved", tier: "gold", category: "pitcher" },
  { name: "High Spin Gyroball", description: "Fastball spins without movement and appears much faster than it truly is", tier: "gold", category: "pitcher" },
  { name: "Lefty Killer", description: "Pitcher's ability increases dramatically when facing left-handed batters", tier: "gold", category: "pitcher" },
  { name: "Cross Cannon", description: "Pitch speed will appear much faster when throwing to the inside corner of an opposite-handed batter", tier: "gold", category: "pitcher" },
  { name: "Indomitable Soul", description: "Pitcher is almost impossible to rattle", tier: "gold", category: "pitcher" },
  { name: "Phantasmagoric", description: "Mixing fastballs and breaking balls will greatly increase both perceived speed and break", tier: "gold", category: "pitcher" },
  { name: "Houdini", description: "Becomes extremely unlikely that a mistake pitch will land in the middle of the strikezone", tier: "gold", category: "pitcher" },
];

export const PITCHER_BLUE_ABILITIES: Ability[] = [
  { name: "Intimidator", description: "When pitching in relief, strike fear into opposing batters", tier: "blue", category: "pitcher" },
  { name: "Heavy Ball", description: "Batted balls are unlikely to fly", tier: "blue", category: "pitcher" },
  { name: "Winner's Luck", description: "When this pitcher takes the mound, wins are easy to come by", tier: "blue", category: "pitcher" },
  { name: "Pace", description: "Mixing fastballs and breaking balls will increase both perceived speed and break", tier: "blue", category: "pitcher" },
  { name: "Straddle", description: "Makes it more difficult to get tired when pitching multiple innings in relief", tier: "blue", category: "pitcher" },
  { name: "Natural Shuuto", description: "When throwing a fastball, there will always be arm-side run", tier: "blue", category: "pitcher" },
  { name: "True Slider", description: "When throwing a fastball, there will always be glove-side run", tier: "blue", category: "pitcher" },
  { name: "Sharpness", description: "Breaking balls will break later", tier: "blue", category: "pitcher" },
  { name: "Fireman", description: "Pitcher becomes more effective when entering the game in the middle of an inning", tier: "blue", category: "pitcher" },
  { name: "Constant Speed", description: "Pitch speed is very consistent", tier: "blue", category: "pitcher" },
  { name: "Crossfire", description: "Pitch speed will appear faster when throwing inside to an opposite-handed batter", tier: "blue", category: "pitcher" },
  { name: "Good Pickoff", description: "Pickoff motion becomes quicker and chance of an erroneous throw is lowered", tier: "blue", category: "pitcher" },
  { name: "Guts", description: "The negative effects of stamina loss are lessened", tier: "blue", category: "pitcher" },
  { name: "Decisive", description: "If there is a chance for defeat, a pitcher's ability will improve", tier: "blue", category: "pitcher" },
  { name: "Gyroball", description: "Fastball spins without movement and appears faster than it truly is", tier: "blue", category: "pitcher" },
  { name: "vs. Strong Batters", description: "When facing a strong batter, pitcher's ability will increase", tier: "blue", category: "pitcher" },
  { name: "Staredown", description: "Pitcher's ability increases when there are runners on first or first/third", tier: "blue", category: "pitcher" },
  { name: "Strong Starter", description: "Pitcher will have a strong start to the game", tier: "blue", category: "pitcher" },
  { name: "Kageura", description: "The better a pitcher pitches, the better their batting becomes", tier: "blue", category: "pitcher" },
  { name: "Strong Finisher", description: "Starting pitcher's abilities improve in the second half of the game", tier: "blue", category: "pitcher" },
  { name: "Quick Hands", description: "Pitcher reacts quicker to balls hit back up the middle", tier: "blue", category: "pitcher" },
  { name: "Strikeout", description: "When batter has 2 strikes, pitcher's ability is increased", tier: "blue", category: "pitcher" },
  { name: "Tunneling", description: "Pitch location indicator will appear later and smaller", tier: "blue", category: "pitcher" },
  { name: "Inside Pitch", description: "Control of inside pitches is improved", tier: "blue", category: "pitcher" },
  { name: "Escape Pitch", description: "Becomes unlikely that a mistake pitch will land in the middle of the strikezone", tier: "blue", category: "pitcher" },
  { name: "Low Ball", description: "Control of low pitches is improved", tier: "blue", category: "pitcher" },
  { name: "Release", description: "Pitching motion for fastballs and breaking pitches becomes the same", tier: "blue", category: "pitcher" },
];

export const PITCHER_RED_ABILITIES: Ability[] = [
  { name: "Unlucky Pitch", description: "Mistake pitches are more likely to land in the middle of the strike zone", tier: "red", category: "pitcher" },
  { name: "Glass Heart", description: "Very easy to become rattled", tier: "red", category: "pitcher" },
  { name: "Lightweight Ball", description: "Batted balls are more likely to fly", tier: "red", category: "pitcher" },
  { name: "Frozen", description: "Pitcher's ability decreases when there are runners on first or first/third", tier: "red", category: "pitcher" },
  { name: "Shuuto Spin", description: "Fastballs will occasionally spin towards the pitcher's arm side", tier: "red", category: "pitcher" },
  { name: "Walk", description: "Walks are easier to surrender", tier: "red", category: "pitcher" },
  { name: "Slow Starter", description: "For a starter, abilities are worsened in the early innings", tier: "red", category: "pitcher" },
  { name: "Poor Finisher", description: "Pitcher's ability gets worse if a victory is near", tier: "red", category: "pitcher" },
  { name: "Hot Head", description: "Very easy to become rattled and angry", tier: "red", category: "pitcher" },
  { name: "Cowardly", description: "Pitcher's abilities drop dramatically if runners are in scoring position", tier: "red", category: "pitcher" },
  { name: "Loser's Luck", description: "When this pitcher takes the mound, losses are easy to come by", tier: "red", category: "pitcher" },
  { name: "Confusion", description: "When starting, randomly begin some innings confused", tier: "red", category: "pitcher" },
];

export const FIELDER_GOLD_ABILITIES: Ability[] = [
  { name: "Artist", description: "Hitting a homerun with power swing becomes significantly easier", tier: "gold", category: "fielder" },
  { name: "Hit Machine", description: "It is very easy to get a hit when using contact swing", tier: "gold", category: "fielder" },
  { name: "First Pitch King", description: "Batter's abilities greatly increase prior to the first strike", tier: "gold", category: "fielder" },
  { name: "Ace Killer", description: "Batter's abilities are greatly increased while facing an Ace-Class pitcher", tier: "gold", category: "fielder" },
  { name: "Surprise!", description: "May cause a tremendous upset under certain conditions", tier: "gold", category: "fielder" },
  { name: "Emergency Strength", description: "When losing, batter's abilities will greatly increase", tier: "gold", category: "fielder" },
  { name: "Outside Hitter", description: "Exit velocity of balls hit in the outside of the zone will be greatly increased", tier: "gold", category: "fielder" },
  { name: "Counterattack", description: "If the batter failed to record a hit in the previous at bat, abilities will be greatly increased next at-bat", tier: "gold", category: "fielder" },
  { name: "Spirit Head", description: "Will slide head-first into a base when the situation calls for it", tier: "gold", category: "fielder" },
  { name: "Bases Loaded King", description: "Batter's abilities will greatly improve when bases are loaded", tier: "gold", category: "fielder" },
  { name: "Shock Commander", description: "Very skilled at creating opportunities", tier: "gold", category: "fielder" },
  { name: "Heat Up", description: "The more strikes the batter has in the at-bat, the more their abilities will increase", tier: "gold", category: "fielder" },
  { name: "Slap Happy", description: "Lowers chance of fouling a ball off, while greatly raising the chance of an opposite field hit", tier: "gold", category: "fielder" },
  { name: "Late Night Hero", description: "If there is a runner on base that could score the go-ahead run after the 6th inning, batting ability greatly increases", tier: "gold", category: "fielder" },
  { name: "High Ball Hitter", description: "Exit velocity of balls hit in the top of the zone will be greatly increased", tier: "gold", category: "fielder" },
  { name: "Express Baserunning", description: "Running speed is greatly enhanced when baserunning", tier: "gold", category: "fielder" },
  { name: "High-Speed Laser", description: "Speed of thrown balls will be greatly increased and their trajectory low", tier: "gold", category: "fielder" },
  { name: "Wide Angle Cannon", description: "Can hit with power to the opposite field extremely effectively", tier: "gold", category: "fielder" },
  { name: "Gambler", description: "With runners in scoring position, batter's abilities are greatly increased", tier: "gold", category: "fielder" },
  { name: "Strike Thrower", description: "Throw with extreme accuracy", tier: "gold", category: "fielder" },
  { name: "Emotional Pillar", description: "Greatly increase teammate's abilities when in the game", tier: "gold", category: "fielder" },
  { name: "God of Pinch Hitting", description: "When pinch hitting, ability is greatly increased", tier: "gold", category: "fielder" },
  { name: "Low Ball Hitter", description: "Exit velocity of balls hit in the bottom of the zone will be greatly increased", tier: "gold", category: "fielder" },
  { name: "Lightning Speed", description: "Run speed while stealing is greatly increased and disturbs the pitcher", tier: "gold", category: "fielder" },
  { name: "Legendary Walkoff Hitter", description: "Batter's ability greatly increases if there is a chance to walkoff", tier: "gold", category: "fielder" },
  { name: "Iron Man", description: "Extremely difficult to get injured", tier: "gold", category: "fielder" },
  { name: "Trickster", description: "Put an extreme amount of pressure on the pitcher and defense after reaching base", tier: "gold", category: "fielder" },
  { name: "Inside Hitter", description: "Exit velocity of balls hit in the inside of the zone will be greatly increased", tier: "gold", category: "fielder" },
  { name: "Puller Hitter", description: "Power to the pull side is greatly increased", tier: "gold", category: "fielder" },
  { name: "Magician", description: "When fielding, sometimes show magical defense", tier: "gold", category: "fielder" },
  { name: "Unrelenting", description: "Greatly improve batting ability after accruing two hits", tier: "gold", category: "fielder" },
  { name: "Flying Start", description: "Speed when running to first base is greatly increased", tier: "gold", category: "fielder" },
  { name: "Heavy Tank", description: "When running towards the catcher, collide to try and force a dropped ball", tier: "gold", category: "fielder" },
];

export const FIELDER_BLUE_ABILITIES: Ability[] = [
  { name: "Contact Hitter", description: "It is easy to get a hit when using contact swing", tier: "blue", category: "fielder" },
  { name: "Push", description: "Exit velocity of balls hit in the outside of the zone will be increased", tier: "blue", category: "fielder" },
  { name: "Batter Intimidator", description: "Strike fear into the opposing pitcher", tier: "blue", category: "fielder" },
  { name: "Unpredictable", description: "May cause an upset under certain conditions", tier: "blue", category: "fielder" },
  { name: "Consigliere", description: "Bat with a shining reluctance in clutch situations", tier: "blue", category: "fielder" },
  { name: "Pull Hit", description: "Exit velocity of balls hit in the inside of the zone will be increased", tier: "blue", category: "fielder" },
  { name: "Multi-Hit", description: "Improve batting ability after accruing two hits", tier: "blue", category: "fielder" },
  { name: "Disturbance", description: "Put extra pressure on the pitcher and the defense after reaching base", tier: "blue", category: "fielder" },
  { name: "Tough Out", description: "Becomes much easier to foul pitches off in a 2-strike count", tier: "blue", category: "fielder" },
  { name: "Resilient", description: "When losing, batter's ability will increase", tier: "blue", category: "fielder" },
  { name: "Spray Hitter", description: "Can successfully hit with power even to the opposite field", tier: "blue", category: "fielder" },
  { name: "High Speed Charge", description: "Fielder responds to a bunted ball quicker", tier: "blue", category: "fielder" },
  { name: "Walkoff Hitter", description: "Batter's ability increases if there is a chance to walkoff", tier: "blue", category: "fielder" },
  { name: "Locked and Loaded", description: "Hitting one homerun will increase a batter's power", tier: "blue", category: "fielder" },
  { name: "Defensive Artisan", description: "Have a chance to skillfully show off while fielding", tier: "blue", category: "fielder" },
  { name: "First Pitch Hitter", description: "Batter's abilities increase prior to the first strike", tier: "blue", category: "fielder" },
  { name: "vs. Ace", description: "Batter's abilities are increased while facing an Ace-Class pitcher", tier: "blue", category: "fielder" },
  { name: "Pinch Hitter", description: "When pinch hitting, ability is increased", tier: "blue", category: "fielder" },
  { name: "Insurer", description: "Ability is increased when leading late in the game", tier: "blue", category: "fielder" },
  { name: "vs. Fastballs", description: "Batter's skill at making effective contact against fastballs is increased", tier: "blue", category: "fielder" },
  { name: "vs. Breaking Pitches", description: "Batter's skill at making effective contact with breaking balls is increased", tier: "blue", category: "fielder" },
  { name: "Chance Maker", description: "Skilled at creating opportunities", tier: "blue", category: "fielder" },
  { name: "Good Infield Hit", description: "Run speed when running to first base is increased", tier: "blue", category: "fielder" },
  { name: "Opposite Field Hitter", description: "Lowers chance of fouling a ball off, while raising the chance of an opposite field hit", tier: "blue", category: "fielder" },
  { name: "Final Hit", description: "If there is a runner on base that could score the go-ahead run after the 6th inning, batting ability increases", tier: "blue", category: "fielder" },
  { name: "Two-Strike Hitter", description: "Batter's ability increases with 2 strikes", tier: "blue", category: "fielder" },
  { name: "Power Hitter", description: "Hitting a homerun with power swing becomes easier", tier: "blue", category: "fielder" },
  { name: "Good Bunt", description: "Bunting ability increases", tier: "blue", category: "fielder" },
  { name: "Bunt Artisan", description: "Bunting ability greatly increases", tier: "blue", category: "fielder" },
  { name: "Pull Hitter", description: "Power to the pull side is increased", tier: "blue", category: "fielder" },
  { name: "Pressure Run", description: "If the opportunity arises, player slides hard into second base to break up a double play", tier: "blue", category: "fielder" },
  { name: "Head-first Slide", description: "Will slide head-first into a base when the situation calls for it", tier: "blue", category: "fielder" },
  { name: "Home Defense", description: "Catcher acts as a wall when defending home plate", tier: "blue", category: "fielder" },
  { name: "Storming Home", description: "When running home, runner will collide with the catcher on a close play", tier: "blue", category: "fielder" },
  { name: "Bases Loaded Slugger", description: "Batter's abilities will improve when bases are loaded", tier: "blue", category: "fielder" },
  { name: "Good Mood", description: "The player's good mood will increase the team's morale", tier: "blue", category: "fielder" },
  { name: "Line Drive", description: "Becomes easier to hit a line drive with a power swing", tier: "blue", category: "fielder" },
  { name: "Revenge", description: "If failed to record a hit in previous at-bat against same pitcher, abilities increase", tier: "blue", category: "fielder" },
  { name: "Laser Beam", description: "Speed of thrown balls will be increased and their trajectory low", tier: "blue", category: "fielder" },
  { name: "Predicament", description: "The more strikes the batter has in the at-bat, the more their abilities will increase", tier: "blue", category: "fielder" },
];

export const FIELDER_RED_ABILITIES: Ability[] = [
  { name: "Error Prone", description: "Fielder is more likely to commit an error with runners in scoring position", tier: "red", category: "fielder" },
  { name: "Timely Whiff", description: "Batter's abilities are worsened with 2 strikes", tier: "red", category: "fielder" },
  { name: "Milliner", description: "Batter's abilities are greatly worsened with 2 strikes", tier: "red", category: "fielder" },
  { name: "Double Play", description: "Batter is more likely to ground into a double play", tier: "red", category: "fielder" },
  { name: "Bad Mood", description: "The player's bad mood will decrease the team's morale", tier: "red", category: "fielder" },
];

export const CATCHER_GOLD_ABILITIES: Ability[] = [
  { name: "The Almanac", description: "The catcher can really bring out the very best of their pitcher", tier: "gold", category: "catcher" },
  { name: "Trash Talker", description: "The catcher can whisper to the batter to unsettle them", tier: "gold", category: "catcher" },
  { name: "Iron Wall", description: "Act as a solid wall behind the plate when faced with charging runners", tier: "gold", category: "catcher" },
  { name: "Bazooka Arm", description: "When throwing to prevent a steal, throw speed is greatly increased and stays low", tier: "gold", category: "catcher" },
];

export const NEUTRAL_ABILITIES: Ability[] = [
  { name: "Wild Fastball", description: "Fastball speed and power is increased at the cost of control", tier: "blue", category: "neutral" },
  { name: "Bad Ball Hitter", description: "Batter will be able to reach balls outside of the strikezone", tier: "blue", category: "neutral" },
  { name: "Groundball Pitcher", description: "Pitcher is skilled at inducing groundballs", tier: "blue", category: "neutral" },
  { name: "Full Throttle", description: "With RISP, stamina consumption is increased, but abilities are also increased", tier: "blue", category: "neutral" },
  { name: "Strength Distribution", description: "Pitcher prioritizes stronger batters and cuts corners against weak batters", tier: "blue", category: "neutral" },
  { name: "Flyball Pitcher", description: "Pitcher is skilled at inducing flyballs", tier: "blue", category: "neutral" },
  { name: "Poker Face", description: "The pitcher's appearance will not change even if stamina is depleted", tier: "blue", category: "neutral" },
];

export const ALL_PITCHER_ABILITIES = [...PITCHER_GOLD_ABILITIES, ...PITCHER_BLUE_ABILITIES, ...PITCHER_RED_ABILITIES];
export const ALL_FIELDER_ABILITIES = [...FIELDER_GOLD_ABILITIES, ...FIELDER_BLUE_ABILITIES, ...FIELDER_RED_ABILITIES];
export const ALL_CATCHER_ABILITIES = [...CATCHER_GOLD_ABILITIES];
export const ALL_ABILITIES = [...ALL_PITCHER_ABILITIES, ...ALL_FIELDER_ABILITIES, ...ALL_CATCHER_ABILITIES, ...NEUTRAL_ABILITIES];

export function getAbilitiesForPosition(position: string): Ability[] {
  const pitcherPositions = ["SP", "RP", "CP", "P"];
  const catcherPositions = ["C"];
  
  if (pitcherPositions.includes(position)) {
    return [...ALL_PITCHER_ABILITIES, ...NEUTRAL_ABILITIES.filter(a => a.category === "neutral")];
  } else if (catcherPositions.includes(position)) {
    return [...ALL_FIELDER_ABILITIES, ...ALL_CATCHER_ABILITIES];
  } else {
    return ALL_FIELDER_ABILITIES;
  }
}

export const MAX_SPECIAL_ABILITIES = 7;

/**
 * Sanitize a player's ability list to enforce two hard rules:
 *   1. No duplicate ability names.
 *   2. Maximum one gold-tier ability per player.
 *
 * When a second (or later) gold ability is found it is replaced with a
 * position-appropriate blue ability that is not already in the list.
 * Replacement blue abilities are drawn in stable array order so the result
 * is deterministic given the same input.
 */
export function sanitizeAbilities(position: string, abilities: string[]): string[] {
  const availableAbilities = getAbilitiesForPosition(position);
  const bluePool = availableAbilities.filter(a => a.tier === "blue").map(a => a.name);

  // 1. Deduplicate while preserving order.
  const seen = new Set<string>();
  const deduped = abilities.filter(name => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  // 2. Cap gold abilities at 1 — keep the first gold encountered.
  let goldSeen = false;
  const result: string[] = [];
  const extraGoldsToReplace: number[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const ability = getAbilityByName(deduped[i]);
    if (ability && ability.tier === "gold") {
      if (!goldSeen) {
        goldSeen = true;
        result.push(deduped[i]);
      } else {
        extraGoldsToReplace.push(i);
        result.push("__REPLACE__");
      }
    } else {
      result.push(deduped[i]);
    }
  }

  if (extraGoldsToReplace.length === 0) return result;

  // Fill replacement slots with randomly-chosen blue abilities not already in the list.
  const inResult = new Set(result.filter(n => n !== "__REPLACE__"));
  const available = bluePool.filter(n => !inResult.has(n));
  // Shuffle the available pool so replacements are drawn randomly.
  for (let k = available.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [available[k], available[j]] = [available[j], available[k]];
  }
  let repIdx = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === "__REPLACE__") {
      if (repIdx < available.length) {
        result[i] = available[repIdx++];
      } else {
        // No blue ability available — drop this slot entirely.
        result[i] = "";
      }
    }
  }

  return result.filter(n => n !== "");
}

/**
 * Enforce the OVR >= 500 gate on gold abilities.
 * If `ovr` is below 500, any gold ability in the list is replaced with a
 * randomly-chosen position-appropriate blue ability not already present.
 * Returns the original array reference unchanged when no replacement is needed.
 */
export function enforceGoldOvrGate(abilities: string[], position: string, ovr: number): string[] {
  if (ovr >= 500) return abilities;
  const hasGold = abilities.some(name => getAbilityByName(name)?.tier === "gold");
  if (!hasGold) return abilities;

  const availableAbilities = getAbilitiesForPosition(position);
  const bluePool = availableAbilities.filter(a => a.tier === "blue").map(a => a.name);

  const result = [...abilities];
  const inResult = new Set(result);

  for (let i = 0; i < result.length; i++) {
    const ability = getAbilityByName(result[i]);
    if (ability?.tier === "gold") {
      inResult.delete(result[i]);
      const available = bluePool.filter(n => !inResult.has(n));
      if (available.length > 0) {
        const replacement = available[Math.floor(Math.random() * available.length)];
        result[i] = replacement;
        inResult.add(replacement);
      } else {
        result[i] = "";
      }
    }
  }
  return result.filter(n => n !== "");
}

export function getRandomAbilities(position: string, count: number, preferGold: boolean = false): string[] {
  const availableAbilities = getAbilitiesForPosition(position);

  // Clamp requested count to the global cap of 7
  const cappedCount = Math.max(0, Math.min(MAX_SPECIAL_ABILITIES, count));
  if (cappedCount === 0 || availableAbilities.length === 0) return [];

  // Build pool: when preferGold, include gold once (not doubled — dedup handles selection)
  const goldAbilities = availableAbilities.filter(a => a.tier === "gold");
  const blueAbilities = availableAbilities.filter(a => a.tier === "blue");
  const pool: Ability[] = preferGold
    ? [...goldAbilities, ...blueAbilities]
    : blueAbilities;

  const selected: string[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  for (const ability of shuffled) {
    if (selected.length >= cappedCount) break;
    if (!selected.includes(ability.name)) {
      selected.push(ability.name);
    }
  }

  // 15% chance to swap one slot for a red ability — never exceeds cappedCount
  const redAbilities = availableAbilities.filter(a => a.tier === "red");
  if (redAbilities.length > 0 && Math.random() < 0.15 && selected.length > 0) {
    const randomRed = redAbilities[Math.floor(Math.random() * redAbilities.length)];
    if (!selected.includes(randomRed.name)) {
      selected[selected.length - 1] = randomRed.name;
    }
  }

  // Final guarantee: no duplicates and at most 1 gold.
  return sanitizeAbilities(position, selected);
}

export function getAbilityByName(name: string): Ability | undefined {
  return ALL_ABILITIES.find(a => a.name === name);
}

// ---------------------------------------------------------------------------
// Hitter OVR: lookup-table system with linear interpolation
// ---------------------------------------------------------------------------
function hitterInterp(table: [number, number][], value: number): number {
  const v = Math.max(table[0][0], Math.min(table[table.length - 1][0], value));
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (v >= x0 && v <= x1) {
      return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

const H_CONTACT:  [number, number][] = [[10,4],[20,9],[30,19],[40,29],[50,44],[60,59],[70,79],[80,104],[90,134],[100,169]];
const H_POWER:    [number, number][] = [[10,4],[20,9],[30,19],[40,29],[50,44],[60,59],[70,86],[80,117],[90,147],[100,182]];
const H_RUNNING:  [number, number][] = [[10,2],[20,5],[30,11],[40,17],[50,26],[60,35],[70,48],[80,82],[90,100],[100,121]];
const H_THROWING: [number, number][] = [[10,2],[20,5],[30,11],[40,17],[50,26],[60,35],[70,47],[80,62],[90,80],[100,101]];
const H_DEFENSE:  [number, number][] = [[10,2],[20,5],[30,11],[40,17],[50,26],[60,35],[70,47],[80,62],[90,80],[100,101]];
const H_ERROR:    [number, number][] = [[10,1],[20,3],[30,7],[40,12],[50,17],[60,23],[70,31],[80,41],[90,53]];
const TRAJ_PTS:   Record<number, number> = { 1: 0, 2: 9, 3: 13, 4: 17 };

function commonGrade(v: number): "S" | "A" | "B" | "C" | "D" {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  return "D";
}

const COMMON_OVR: Record<string, Record<"S"|"A"|"B"|"C"|"D", number>> = {
  clutch:         { D: 0, C: 3, B: 6, A: 9,  S: 24 },
  vsLHP:          { D: 0, C: 3, B: 6, A: 9,  S: 24 },
  stealing:       { D: 0, C: 3, B: 6, A: 9,  S: 24 },
  running:        { D: 0, C: 2, B: 4, A: 6,  S: 21 },
  throwing:       { D: 0, C: 2, B: 4, A: 6,  S: 21 },
  grit:           { D: 0, C: 2, B: 4, A: 6,  S: 21 },
  catcherAbility: { D: 0, C: 3, B: 6, A: 9,  S: 24 },
};

const HITTER_NAMED_PTS: Record<string, number> = {
  "Contact Hitter":   9,
  "Power Hitter":     9,
  "Spray Hitter":     9,
  "Line Drive":       9,
  "Bad Ball Hitter":  2,
  "Bunt Artisan":     3,
  "Good Bunt":        3,
  "Head-first Slide": 5,
};
// ---------------------------------------------------------------------------

export function calculateOVR(attrs: {
  position?: string | null;
  hitForAvg?: number | null;
  power?: number | null;
  speed?: number | null;
  arm?: number | null;
  fielding?: number | null;
  errorResistance?: number | null;
  velocity?: number | null;
  control?: number | null;
  stamina?: number | null;
  stuff?: number | null;
  clutch?: number | null;
  vsLHP?: number | null;
  grit?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  recovery?: number | null;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  heater?: number | null;
  agile?: number | null;
  catcherAbility?: number | null;
  trajectory?: number | null;
  abilities?: string[] | null;
}): number {
  const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);
  const isPitcher = attrs.position ? PITCHER_POSITIONS.has(attrs.position) : null;

  if (isPitcher === true) {
    // Pitcher formula unchanged
    let specialBonus = 0;
    if (attrs.abilities && attrs.abilities.length > 0) {
      for (const abilityName of attrs.abilities) {
        const ability = getAbilityByName(abilityName);
        if (ability) {
          if (ability.tier === "gold") specialBonus += 10;
          else if (ability.tier === "blue") specialBonus += 5;
          else if (ability.tier === "red") specialBonus -= 7;
        }
      }
    }
    const pitchCore =
      (attrs.velocity ?? 0) + (attrs.control ?? 0) +
      (attrs.stamina ?? 0) + (attrs.stuff ?? 0);
    const pitchField = (attrs.arm ?? 0) + (attrs.fielding ?? 0);
    const pitchCommon =
      (attrs.heater ?? 0) + (attrs.poise ?? 0) + (attrs.recovery ?? 0) +
      (attrs.wRISP ?? 0) + (attrs.vsLefty ?? 0);
    const raw = Math.round(pitchCore * 0.85 + pitchField * 0.20 + pitchCommon * 0.25 + specialBonus);
    return Math.max(150, Math.min(650, raw));
  }

  if (isPitcher === false) {
    // Hitter formula: lookup-table attributes + graded common abilities + named special ability points
    const traj = Math.round(Math.max(1, Math.min(4, attrs.trajectory ?? 2)));
    const trajPts    = TRAJ_PTS[traj] ?? 9;
    const contactPts = hitterInterp(H_CONTACT,  attrs.hitForAvg ?? 50);
    const powerPts   = hitterInterp(H_POWER,    attrs.power ?? 50);
    const runPts     = hitterInterp(H_RUNNING,  attrs.speed ?? 50);
    const throwPts   = hitterInterp(H_THROWING, attrs.arm ?? 50);
    const defPts     = hitterInterp(H_DEFENSE,  attrs.fielding ?? 50);
    const errPts     = hitterInterp(H_ERROR,    Math.min(90, attrs.errorResistance ?? 50));
    const attrTotal  = trajPts + contactPts + powerPts + runPts + throwPts + defPts + errPts;

    let commonTotal = 0;
    const commonInputs: Array<[keyof typeof COMMON_OVR, number | null | undefined]> = [
      ["clutch",         attrs.clutch],
      ["vsLHP",          attrs.vsLHP],
      ["stealing",       attrs.stealing],
      ["running",        attrs.running],
      ["throwing",       attrs.throwing],
      ["grit",           attrs.grit],
      ["catcherAbility", attrs.catcherAbility],
    ];
    for (const [key, val] of commonInputs) {
      commonTotal += COMMON_OVR[key][commonGrade(val ?? 0)];
    }

    let specialTotal = 0;
    if (attrs.abilities && attrs.abilities.length > 0) {
      for (const abilityName of attrs.abilities) {
        if (HITTER_NAMED_PTS[abilityName] !== undefined) {
          specialTotal += HITTER_NAMED_PTS[abilityName];
        } else {
          const ability = getAbilityByName(abilityName);
          if (ability) {
            if (ability.tier === "gold") specialTotal += 15;
            else if (ability.tier === "blue") specialTotal += 6;
            else if (ability.tier === "red") specialTotal -= 7;
          }
        }
      }
    }

    const raw = Math.round(attrTotal + commonTotal + specialTotal);
    return Math.max(150, Math.min(650, raw));
  }

  // Fallback (no position provided): original mixed formula
  let specialBonus = 0;
  if (attrs.abilities && attrs.abilities.length > 0) {
    for (const abilityName of attrs.abilities) {
      const ability = getAbilityByName(abilityName);
      if (ability) {
        if (ability.tier === "gold") specialBonus += 10;
        else if (ability.tier === "blue") specialBonus += 5;
        else if (ability.tier === "red") specialBonus -= 7;
      }
    }
  }
  const attrFields = [
    attrs.hitForAvg, attrs.power, attrs.speed, attrs.arm,
    attrs.fielding, attrs.errorResistance, attrs.velocity,
    attrs.control, attrs.stamina, attrs.stuff,
  ];
  let attrSum = 0;
  for (const v of attrFields) { attrSum += (v ?? 50); }

  const commonFields = [
    attrs.clutch, attrs.vsLHP, attrs.grit, attrs.stealing,
    attrs.running, attrs.throwing, attrs.recovery,
    attrs.wRISP, attrs.vsLefty, attrs.poise, attrs.heater, attrs.agile,
  ];
  let commonSum = 0;
  for (const v of commonFields) { commonSum += (v ?? 50); }

  const raw = Math.round(attrSum * 0.6 + commonSum * 0.25 + specialBonus);
  return Math.max(150, Math.min(650, raw));
}

export function getStarRatingFromOVR(ovr: number): number {
  if (ovr >= 550) return 5;
  if (ovr >= 450) return 4;
  if (ovr >= 350) return 3;
  if (ovr >= 250) return 2;
  return 1;
}
