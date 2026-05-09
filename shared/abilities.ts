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

export function getRandomAbilities(position: string, count: number, preferGold: boolean = false): string[] {
  const availableAbilities = getAbilitiesForPosition(position);

  // Clamp requested count to the global cap of 7
  const cappedCount = Math.max(0, Math.min(MAX_SPECIAL_ABILITIES, count));
  if (cappedCount === 0 || availableAbilities.length === 0) return [];

  let pool: Ability[];
  if (preferGold) {
    const goldAbilities = availableAbilities.filter(a => a.tier === "gold");
    const blueAbilities = availableAbilities.filter(a => a.tier === "blue");
    pool = [...goldAbilities, ...goldAbilities, ...blueAbilities];
  } else {
    pool = availableAbilities.filter(a => a.tier !== "red");
  }

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

  return selected;
}

export function getAbilityByName(name: string): Ability | undefined {
  return ALL_ABILITIES.find(a => a.name === name);
}

export function calculateOVR(attrs: {
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
  abilities?: string[] | null;
}): number {
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

  let specialBonus = 0;
  if (attrs.abilities && attrs.abilities.length > 0) {
    for (const abilityName of attrs.abilities) {
      const ability = getAbilityByName(abilityName);
      if (ability) {
        if (ability.tier === "gold") specialBonus += 33;
        else if (ability.tier === "blue") specialBonus += 20;
        else if (ability.tier === "red") specialBonus -= 15;
      }
    }
  }

  const raw = Math.round(attrSum * 0.6 + commonSum * 0.25 + specialBonus);
  return Math.max(150, Math.min(650, raw));
}

export function getStarRatingFromOVR(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}
