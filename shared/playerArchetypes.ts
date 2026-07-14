/**
 * Baseball Archetype Catalog — V1
 *
 * Each archetype defines the position-specific development identity for a player:
 * which attributes grow fastest, which receive secondary emphasis, which are exposed
 * in regression events, and which are irrelevant (receive no development points).
 *
 * Design principles:
 * - Two players with the same archetype develop similarly but not identically.
 * - Archetype is separate from development trait (Normal/Raw/Late Bloomer/Early Peaker).
 * - Position and archetype are separate; a Power Ace can pitch in relief.
 * - Irrelevant attributes receive zero allocation in both growth and regression.
 */

export type AttrKey =
  | "hitForAvg" | "power" | "speed" | "arm" | "fielding" | "errorResistance"
  | "velocity" | "control" | "stamina" | "stuff"
  | "clutch" | "vsLHP" | "grit" | "stealing" | "running" | "throwing"
  | "recovery" | "wRISP" | "vsLefty" | "poise" | "heater" | "agile"
  | "catcherAbility" | "pitchMix";

export type ArchetypeRelationship = "primary" | "secondary" | "positionCore" | "weakness" | "irrelevant";

export interface AttrWeight {
  attr: AttrKey;
  relationship: ArchetypeRelationship;
}

export interface PlayerArchetype {
  id: string;
  label: string;
  description: string;
  eligiblePositions: string[];
  attrs: AttrWeight[];
  iconKey: string;
  colorToken: string;
}

const PITCHER_POSITIONS = ["P", "SP", "RP", "CP"];
const CORNER_INFIELD = ["1B", "3B", "DH"];
const MIDDLE_INFIELD = ["2B", "SS"];
const OUTFIELD = ["LF", "CF", "RF", "OF"];
const CATCHER = ["C"];
const ALL_HITTER = [...CATCHER, ...CORNER_INFIELD, ...MIDDLE_INFIELD, ...OUTFIELD, "DH"];

export const PLAYER_ARCHETYPES: PlayerArchetype[] = [

  // ── PITCHERS ─────────────────────────────────────────────────────────────

  {
    id: "power_ace",
    label: "Power Ace",
    description: "Overpowers hitters with elite velocity and a dominant fastball. Command and poise grow as secondary skills. Stamina and fielding get little emphasis.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "velocity",  relationship: "primary" },
      { attr: "heater",    relationship: "primary" },
      { attr: "pitchMix",  relationship: "primary" },
      { attr: "control",   relationship: "secondary" },
      { attr: "poise",     relationship: "secondary" },
      { attr: "wRISP",     relationship: "positionCore" },
      { attr: "recovery",  relationship: "weakness" },
      { attr: "stamina",   relationship: "weakness" },
      { attr: "grit",      relationship: "weakness" },
      { attr: "agile",     relationship: "weakness" },
      { attr: "vsLefty",   relationship: "positionCore" },
    ],
    iconKey: "flame",
    colorToken: "red",
  },

  {
    id: "command_artist",
    label: "Command Artist",
    description: "Paints corners with pinpoint control. Poise and RISP performance are primary strengths. Relies on location over raw stuff.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "control",   relationship: "primary" },
      { attr: "poise",     relationship: "primary" },
      { attr: "wRISP",     relationship: "primary" },
      { attr: "vsLefty",   relationship: "primary" },
      { attr: "pitchMix",  relationship: "secondary" },
      { attr: "recovery",  relationship: "secondary" },
      { attr: "stamina",   relationship: "positionCore" },
      { attr: "heater",    relationship: "weakness" },
      { attr: "velocity",  relationship: "weakness" },
      { attr: "agile",     relationship: "weakness" },
    ],
    iconKey: "target",
    colorToken: "blue",
  },

  {
    id: "movement_specialist",
    label: "Movement Specialist",
    description: "Generates swing-and-miss with pitch diversity and elite movement. Develops repertoire depth and existing pitch grades. Command and poise grow well; stamina is a weakness.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "pitchMix",  relationship: "primary" },
      { attr: "stuff",     relationship: "primary" },
      { attr: "control",   relationship: "secondary" },
      { attr: "poise",     relationship: "secondary" },
      { attr: "vsLefty",   relationship: "secondary" },
      { attr: "recovery",  relationship: "positionCore" },
      { attr: "velocity",  relationship: "positionCore" },
      { attr: "stamina",   relationship: "weakness" },
      { attr: "agile",     relationship: "weakness" },
      { attr: "wRISP",     relationship: "positionCore" },
    ],
    iconKey: "spin",
    colorToken: "purple",
  },

  {
    id: "workhorse",
    label: "Workhorse",
    description: "Eats innings with durability and consistency. Stamina, recovery, and grit are primary. Velocity and pitch diversity get less emphasis.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "stamina",   relationship: "primary" },
      { attr: "recovery",  relationship: "primary" },
      { attr: "grit",      relationship: "primary" },
      { attr: "control",   relationship: "primary" },
      { attr: "velocity",  relationship: "secondary" },
      { attr: "poise",     relationship: "secondary" },
      { attr: "wRISP",     relationship: "positionCore" },
      { attr: "pitchMix",  relationship: "weakness" },
      { attr: "heater",    relationship: "weakness" },
      { attr: "agile",     relationship: "weakness" },
    ],
    iconKey: "horse",
    colorToken: "brown",
  },

  {
    id: "highleverage_power",
    label: "High-Leverage Power",
    description: "Dominates in short stints with a power arsenal. Velocity, heater, poise, and recovery are primary. Stamina is not a priority.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "velocity",  relationship: "primary" },
      { attr: "heater",    relationship: "primary" },
      { attr: "poise",     relationship: "primary" },
      { attr: "recovery",  relationship: "primary" },
      { attr: "control",   relationship: "secondary" },
      { attr: "pitchMix",  relationship: "secondary" },
      { attr: "wRISP",     relationship: "positionCore" },
      { attr: "stamina",   relationship: "weakness" },
      { attr: "grit",      relationship: "weakness" },
      { attr: "agile",     relationship: "weakness" },
    ],
    iconKey: "bolt",
    colorToken: "orange",
  },

  {
    id: "highleverage_finesse",
    label: "High-Leverage Finesse",
    description: "Out-thinks hitters in high-leverage spots. Control, movement, poise, and Vs Lefty are primary. Raw velocity and stamina are weaknesses.",
    eligiblePositions: PITCHER_POSITIONS,
    attrs: [
      { attr: "control",   relationship: "primary" },
      { attr: "pitchMix",  relationship: "primary" },
      { attr: "poise",     relationship: "primary" },
      { attr: "vsLefty",   relationship: "primary" },
      { attr: "recovery",  relationship: "primary" },
      { attr: "wRISP",     relationship: "secondary" },
      { attr: "grit",      relationship: "positionCore" },
      { attr: "velocity",  relationship: "weakness" },
      { attr: "stamina",   relationship: "weakness" },
      { attr: "heater",    relationship: "weakness" },
    ],
    iconKey: "scissors",
    colorToken: "teal",
  },

  // ── CATCHERS ─────────────────────────────────────────────────────────────

  {
    id: "field_general",
    label: "Field General",
    description: "A defensive leader behind the plate. Catcher ability, poise, and arm are primary. Contact and fielding develop as secondary skills.",
    eligiblePositions: CATCHER,
    attrs: [
      { attr: "catcherAbility", relationship: "primary" },
      { attr: "poise",          relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "fielding",       relationship: "secondary" },
      { attr: "throwing",       relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "power",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "mask",
    colorToken: "slate",
  },

  {
    id: "power_backstop",
    label: "Power Backstop",
    description: "Brings offensive punch from behind the plate. Power and clutch are primary, but catcher skills and arm develop adequately.",
    eligiblePositions: CATCHER,
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "clutch",         relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "catcherAbility", relationship: "secondary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "vsLHP",          relationship: "secondary" },
      { attr: "errorResistance",relationship: "positionCore" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "running",        relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "hammer",
    colorToken: "red",
  },

  {
    id: "contact_receiver",
    label: "Contact Receiver",
    description: "Makes consistent contact and handles pitching staffs well. Contact, Vs LHP, and error resistance are primary. Power is a weakness.",
    eligiblePositions: CATCHER,
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "vsLHP",          relationship: "primary" },
      { attr: "catcherAbility", relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "fielding",       relationship: "secondary" },
      { attr: "clutch",         relationship: "secondary" },
      { attr: "throwing",       relationship: "positionCore" },
      { attr: "power",          relationship: "weakness" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "glove",
    colorToken: "green",
  },

  {
    id: "athletic_catcher",
    label: "Athletic Catcher",
    description: "Uses athleticism to add value on both sides. Speed, arm, contact, and fielding develop together. Catcher ability and power lag behind.",
    eligiblePositions: CATCHER,
    attrs: [
      { attr: "speed",          relationship: "primary" },
      { attr: "running",        relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "throwing",       relationship: "secondary" },
      { attr: "errorResistance",relationship: "secondary" },
      { attr: "catcherAbility", relationship: "weakness" },
      { attr: "power",          relationship: "weakness" },
    ],
    iconKey: "run",
    colorToken: "blue",
  },

  // ── CORNER INFIELD / DH ──────────────────────────────────────────────────

  {
    id: "middle_order_slugger",
    label: "Middle-Order Slugger",
    description: "Built to drive in runs from the heart of the order. Power, clutch, and RISP performance lead development. Contact and Vs LHP grow secondarily.",
    eligiblePositions: [...CORNER_INFIELD, "DH"],
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "clutch",         relationship: "primary" },
      { attr: "wRISP",          relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "vsLHP",          relationship: "secondary" },
      { attr: "errorResistance",relationship: "positionCore" },
      { attr: "arm",            relationship: "positionCore" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
      { attr: "running",        relationship: "weakness" },
    ],
    iconKey: "bat_swing",
    colorToken: "red",
  },

  {
    id: "pure_hitter",
    label: "Pure Hitter",
    description: "Makes contact from any spot in the lineup. Contact, Vs LHP, and clutch performance are primary. Speed and arm are secondary at best.",
    eligiblePositions: [...CORNER_INFIELD, "DH"],
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "vsLHP",          relationship: "primary" },
      { attr: "clutch",         relationship: "primary" },
      { attr: "power",          relationship: "secondary" },
      { attr: "errorResistance",relationship: "secondary" },
      { attr: "wRISP",          relationship: "positionCore" },
      { attr: "arm",            relationship: "weakness" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "bat",
    colorToken: "blue",
  },

  {
    id: "two_way_corner",
    label: "Two-Way Corner",
    description: "A balanced corner player who contributes on both sides. Power, arm, fielding, and error resistance develop together. Speed and stealing are weaknesses.",
    eligiblePositions: CORNER_INFIELD,
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "throwing",       relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "shield",
    colorToken: "gold",
  },

  {
    id: "defensive_anchor",
    label: "Defensive Anchor",
    description: "Elite defensive player anchoring the corners. Fielding, error resistance, arm, and throwing are primary. Power and speed barely develop.",
    eligiblePositions: CORNER_INFIELD,
    attrs: [
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "throwing",       relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "recovery",       relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
      { attr: "power",          relationship: "weakness" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "wall",
    colorToken: "slate",
  },

  // ── MIDDLE INFIELD ───────────────────────────────────────────────────────

  {
    id: "table_setter",
    label: "Table Setter",
    description: "Ignites the offense at the top of the order. Contact, speed, running, and stealing are primary. Power gets little emphasis.",
    eligiblePositions: MIDDLE_INFIELD,
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "speed",          relationship: "primary" },
      { attr: "running",        relationship: "primary" },
      { attr: "stealing",       relationship: "primary" },
      { attr: "vsLHP",          relationship: "secondary" },
      { attr: "errorResistance",relationship: "secondary" },
      { attr: "fielding",       relationship: "positionCore" },
      { attr: "arm",            relationship: "positionCore" },
      { attr: "power",          relationship: "weakness" },
      { attr: "clutch",         relationship: "weakness" },
    ],
    iconKey: "spark",
    colorToken: "yellow",
  },

  {
    id: "defensive_wizard",
    label: "Defensive Wizard",
    description: "Makes the spectacular look routine. Fielding, error resistance, arm, throwing, and agility are primary. Power and clutch are weaknesses.",
    eligiblePositions: MIDDLE_INFIELD,
    attrs: [
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "throwing",       relationship: "primary" },
      { attr: "agile",          relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "speed",          relationship: "secondary" },
      { attr: "power",          relationship: "weakness" },
      { attr: "clutch",         relationship: "weakness" },
      { attr: "stealing",       relationship: "weakness" },
    ],
    iconKey: "wand",
    colorToken: "teal",
  },

  {
    id: "power_speed_infielder",
    label: "Power-Speed Infielder",
    description: "Combines middle-infield tools with pop. Power, speed, and arm are primary. Error resistance and baserunning get less emphasis.",
    eligiblePositions: MIDDLE_INFIELD,
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "speed",          relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "fielding",       relationship: "secondary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "running",        relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
      { attr: "errorResistance",relationship: "weakness" },
    ],
    iconKey: "lightning",
    colorToken: "orange",
  },

  {
    id: "contact_technician",
    label: "Contact Technician",
    description: "Makes contact at a high rate with excellent patience. Contact, Vs LHP, clutch, and error resistance are primary. Power and arm are weaknesses.",
    eligiblePositions: MIDDLE_INFIELD,
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "vsLHP",          relationship: "primary" },
      { attr: "clutch",         relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "agile",          relationship: "secondary" },
      { attr: "fielding",       relationship: "secondary" },
      { attr: "speed",          relationship: "positionCore" },
      { attr: "power",          relationship: "weakness" },
      { attr: "arm",            relationship: "weakness" },
    ],
    iconKey: "precision",
    colorToken: "green",
  },

  // ── OUTFIELD ─────────────────────────────────────────────────────────────

  {
    id: "speed_power_outfielder",
    label: "Speed-Power Outfielder",
    description: "A dangerous five-tool threat combining home run power with elite speed. Power, speed, running, and stealing lead development. Contact and arm develop secondarily.",
    eligiblePositions: [...OUTFIELD, "OF"],
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "speed",          relationship: "primary" },
      { attr: "running",        relationship: "primary" },
      { attr: "stealing",       relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "arm",            relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
      { attr: "fielding",       relationship: "weakness" },
      { attr: "errorResistance",relationship: "weakness" },
    ],
    iconKey: "rocket",
    colorToken: "red",
  },

  {
    id: "centerfield_catalyst",
    label: "Center-Field Catalyst",
    description: "A defensive centerfield presence who sparks the lineup. Speed, fielding, error resistance, and running are primary. Power barely develops.",
    eligiblePositions: [...OUTFIELD, "OF"],
    attrs: [
      { attr: "speed",          relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "running",        relationship: "primary" },
      { attr: "hitForAvg",      relationship: "secondary" },
      { attr: "arm",            relationship: "secondary" },
      { attr: "stealing",       relationship: "positionCore" },
      { attr: "power",          relationship: "weakness" },
      { attr: "clutch",         relationship: "weakness" },
    ],
    iconKey: "wind",
    colorToken: "cyan",
  },

  {
    id: "corner_masher",
    label: "Corner Masher",
    description: "A left-handed bat built for corner outfield. Power, contact, clutch, and RISP performance are primary. Speed and stealing are weaknesses.",
    eligiblePositions: [...OUTFIELD, "OF"],
    attrs: [
      { attr: "power",          relationship: "primary" },
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "clutch",         relationship: "primary" },
      { attr: "wRISP",          relationship: "primary" },
      { attr: "arm",            relationship: "secondary" },
      { attr: "vsLHP",          relationship: "secondary" },
      { attr: "errorResistance",relationship: "positionCore" },
      { attr: "speed",          relationship: "weakness" },
      { attr: "stealing",       relationship: "irrelevant" },
    ],
    iconKey: "cannon_bat",
    colorToken: "maroon",
  },

  {
    id: "cannon_defender",
    label: "Cannon Defender",
    description: "A defensive specialist with an elite throwing arm. Arm, throwing, fielding, and error resistance are primary. Contact and stealing lag significantly.",
    eligiblePositions: [...OUTFIELD, "OF"],
    attrs: [
      { attr: "arm",            relationship: "primary" },
      { attr: "throwing",       relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "power",          relationship: "secondary" },
      { attr: "recovery",       relationship: "secondary" },
      { attr: "speed",          relationship: "positionCore" },
      { attr: "hitForAvg",      relationship: "weakness" },
      { attr: "stealing",       relationship: "weakness" },
    ],
    iconKey: "cannon",
    colorToken: "dark_green",
  },

  {
    id: "five_tool_outfielder",
    label: "Five-Tool Outfielder",
    description: "Balanced development across all five tools. No single attribute dominates; growth is distributed widely. Potential, not archetype, determines whether elite ratings are reachable.",
    eligiblePositions: [...OUTFIELD, "OF"],
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "power",          relationship: "primary" },
      { attr: "speed",          relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "secondary" },
      { attr: "running",        relationship: "secondary" },
      { attr: "clutch",         relationship: "positionCore" },
    ],
    iconKey: "star5",
    colorToken: "gold",
  },

  // ── UTILITY ──────────────────────────────────────────────────────────────

  {
    id: "super_utility",
    label: "Super Utility",
    description: "Can play anywhere on the field. Contact, fielding, error resistance, arm, speed, and agility all develop together. Receives a smaller position-conversion penalty.",
    eligiblePositions: ALL_HITTER,
    attrs: [
      { attr: "hitForAvg",      relationship: "primary" },
      { attr: "fielding",       relationship: "primary" },
      { attr: "errorResistance",relationship: "primary" },
      { attr: "arm",            relationship: "primary" },
      { attr: "speed",          relationship: "primary" },
      { attr: "agile",          relationship: "primary" },
      { attr: "running",        relationship: "secondary" },
      { attr: "throwing",       relationship: "secondary" },
      { attr: "recovery",       relationship: "secondary" },
      { attr: "power",          relationship: "weakness" },
    ],
    iconKey: "swiss_army",
    colorToken: "purple",
  },
];

/** Fast O(1) lookup by archetype id. */
export const ARCHETYPES_BY_ID: Readonly<Record<string, PlayerArchetype>> =
  Object.fromEntries(PLAYER_ARCHETYPES.map(a => [a.id, a]));

/** All archetypes valid for a given position. */
export function getArchetypesForPosition(position: string): PlayerArchetype[] {
  return PLAYER_ARCHETYPES.filter(a => a.eligiblePositions.includes(position));
}

/** Growth selection weight for a given relationship. */
export function growthWeight(rel: ArchetypeRelationship): number {
  switch (rel) {
    case "primary":      return 3.0;
    case "secondary":    return 1.6;
    case "positionCore": return 1.0;
    case "weakness":     return 0.35;
    case "irrelevant":   return 0;
  }
}

/** Regression selection weight for a given relationship. */
export function regressionWeight(rel: ArchetypeRelationship): number {
  switch (rel) {
    case "primary":      return 0.35;
    case "secondary":    return 0.75;
    case "positionCore": return 1.00;
    case "weakness":     return 1.50;
    case "irrelevant":   return 0;
  }
}

/** Cap modifier for a given relationship. */
export function capModifier(rel: ArchetypeRelationship): number {
  switch (rel) {
    case "primary":      return +6;
    case "secondary":    return +2;
    case "positionCore": return  0;
    case "weakness":     return -4;
    case "irrelevant":   return  0;
  }
}

/**
 * Development trait (timing/volatility).
 * Stored in players.playerArchetype (the existing column) for legacy compatibility.
 * Exposed as "developmentProfile" in V3 UI.
 */
export type DevelopmentProfile = "normal" | "raw" | "late_bloomer" | "overdraft";

/** Class-year multiplier for a development profile. */
export function developmentTraitMultiplier(
  profile: DevelopmentProfile,
  eligibility: string,
): number {
  switch (profile) {
    case "raw":
      return eligibility === "FR" ? 0.80 : eligibility === "SO" ? 1.05 : 1.20;
    case "late_bloomer":
      return eligibility === "FR" ? 0.65 : eligibility === "SO" ? 0.90 : 1.30;
    case "overdraft":
      return eligibility === "FR" ? 0.80 : eligibility === "SO" ? 0.70 : 0.60;
    default: // normal
      return 1.00;
  }
}

/** Variance factor for a development profile. */
export function developmentTraitVariance(profile: DevelopmentProfile): number {
  switch (profile) {
    case "raw":          return 0.25;
    case "late_bloomer": return 0.20;
    case "overdraft":    return 0.10;
    default:             return 0.10;
  }
}
