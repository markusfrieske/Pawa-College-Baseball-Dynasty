import type { ChoiceWeights, StorylineHiddenVars } from "@shared/schema";
import { isPitcher } from "@shared/positions";

// Maps a raw position string to the canonical key used in scenePromptByPosition.
// Returns null for pitchers (handled via scenePromptPitcher) and unrecognised positions.
export function positionToSceneGroupKey(position: string): string | null {
  if (position === "C") return "C";
  if (["LF", "CF", "RF", "OF", "DH"].includes(position)) return "OF";
  if (position === "SS") return "SS";
  if (position === "3B") return "3B";
  if (position === "1B") return "1B";
  return null;
}

// ─── Rating Delta Bands ────────────────────────────────────────────────────────
const DELTAS = {
  minor_pos:    [1, 3],
  moderate_pos: [4, 8],
  major_pos:    [9, 15],
  legendary_pos:[16, 20],
  minor_neg:    [-3, -1],
  moderate_neg: [-8, -4],
  major_neg:    [-15, -9],
  legendary_neg:[-20, -16],
  neutral:      [0, 0],
} as const;

type DeltaKey = keyof typeof DELTAS;

function roll(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function resolveWeights(weights: ChoiceWeights): number {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let rng = Math.random() * total;
  for (const [key, prob] of Object.entries(weights) as [DeltaKey, number][]) {
    rng -= prob;
    if (rng <= 0) {
      const [min, max] = DELTAS[key];
      return roll(min, max);
    }
  }
  return 0;
}

// Apply a recruit's volatility (1–10) to an OVR delta.
// High volatility amplifies swings; low volatility dampens them.
// Neutral zone (volatility 5) = ×1.0 multiplier; range ≈ ×0.6–×1.4.
export function applyVolatilityModifier(delta: number, volatility: number): number {
  if (delta === 0) return 0;
  const multiplier = 0.6 + (Math.max(1, Math.min(10, volatility)) - 1) * (0.8 / 9);
  return Math.round(delta * multiplier);
}

// ─── Hidden Variable Generation ───────────────────────────────────────────────
export function rollHiddenVars(starRank: number, isBlueChip: boolean, isLegendary: boolean): StorylineHiddenVars {
  const base = starRank / 5;
  return {
    storyMomentum: roll(isLegendary ? 7 : 3, 10),
    volatility: isLegendary ? roll(6, 10) : roll(1, 10),
    stability: Math.round(base * 6 + roll(0, 3)),
    pressure: isBlueChip ? roll(5, 10) : roll(1, 7),
    breakoutSeed: Math.random() < (isLegendary ? 0.85 : isBlueChip ? 0.45 : 0.25),
    collapseSeed: Math.random() < (isLegendary ? 0.3 : 0.15),
    ceilingModifier: isLegendary ? roll(5, 18) : roll(-8, 12),
    loyaltySeed: roll(2, 10),
  };
}

// ─── Archetype Definitions ────────────────────────────────────────────────────
export interface ArchetypeEventTemplate {
  id: string;
  scenePrompt?: string;         // pixel art scene image prompt — default (hitter/neutral)
  scenePromptPitcher?: string;  // pitcher-specific override; used when recruit is a pitcher
  scenePromptByPosition?: Partial<Record<string, string>>; // keyed by canonical group: C, OF, SS, 3B, 1B
  eventText: string;
  eventTextPitcher?: string;    // pitcher-specific override for event body text
  choiceA: string; choiceAOutcome: string; choiceAWeights: ChoiceWeights;
  choiceB: string; choiceBOutcome: string; choiceBWeights: ChoiceWeights;
  choiceC: string; choiceCOutcome: string; choiceCWeights: ChoiceWeights;
  choiceD?: string; choiceDOutcome?: string; choiceDWeights?: ChoiceWeights;
}

export type Archetype =
  | "late_bloomer" | "velocity_freak" | "swing_rebuild" | "position_change"
  | "summer_breakout" | "social_media_star" | "confidence_crisis" | "burnout_candidate"
  | "injury_risk" | "academic_concern" | "transfer_rumors" | "two_sport_athlete"
  | "knuckleball_specialist" | "rivalry_recruit" | "generational_prodigy"
  | "financial_pressure" | "coaching_change" | "first_gen_student"
  | "draft_agent_pressure" | "small_town_hero"
  // ─── Five distinct legendary storyline templates ──────────────────────────
  | "the_phenom" | "the_collapse" | "the_two_sport_icon" | "the_scientist" | "folk_hero";

// Archetype evolves at arcStage >= 2 when cumulative delta crosses +15 or -15.
export const ARCHETYPE_TRANSITIONS: Record<Archetype, { positive?: Archetype; negative?: Archetype }> = {
  late_bloomer:         { positive: "summer_breakout",      negative: "confidence_crisis" },
  velocity_freak:       { positive: "generational_prodigy",  negative: "burnout_candidate" },
  swing_rebuild:        { positive: "summer_breakout",      negative: "injury_risk" },
  position_change:      { positive: "late_bloomer",          negative: "academic_concern" },
  summer_breakout:      { positive: "generational_prodigy",  negative: "confidence_crisis" },
  social_media_star:    { positive: "rivalry_recruit",       negative: "burnout_candidate" },
  confidence_crisis:    { positive: "late_bloomer",          negative: "academic_concern" },
  burnout_candidate:    { positive: "swing_rebuild",         negative: "injury_risk" },
  injury_risk:          { positive: "late_bloomer",          negative: "academic_concern" },
  academic_concern:     { positive: "rivalry_recruit",       negative: "transfer_rumors" },
  transfer_rumors:      { positive: "rivalry_recruit",       negative: "academic_concern" },
  two_sport_athlete:    { positive: "summer_breakout",      negative: "burnout_candidate" },
  knuckleball_specialist: { positive: "velocity_freak",     negative: "injury_risk" },
  rivalry_recruit:      { positive: "generational_prodigy",  negative: "confidence_crisis" },
  generational_prodigy: { positive: "generational_prodigy",  negative: "velocity_freak" },
  // Legendary template transitions
  the_phenom:           { positive: "generational_prodigy",  negative: "the_collapse" },
  the_collapse:         { positive: "folk_hero",             negative: "burnout_candidate" },
  the_two_sport_icon:   { positive: "the_phenom",            negative: "the_collapse" },
  the_scientist:        { positive: "the_phenom",            negative: "academic_concern" },
  folk_hero:            { positive: "generational_prodigy",  negative: "confidence_crisis" },
  // ─── New regular archetypes ──────────────────────────────────────────────
  financial_pressure:   { positive: "summer_breakout",       negative: "burnout_candidate" },
  coaching_change:      { positive: "late_bloomer",          negative: "confidence_crisis" },
  first_gen_student:    { positive: "summer_breakout",       negative: "academic_concern" },
  draft_agent_pressure: { positive: "generational_prodigy",  negative: "transfer_rumors" },
  small_town_hero:      { positive: "rivalry_recruit",       negative: "confidence_crisis" },
};

// When a transition target is position-incompatible, substitute with a narratively
// equivalent archetype that works for that position rather than blocking the transition.
// Keys are pitcher-only or hitter-only archetypes; values are position-safe alternatives.
//
// AUDIT (keep in sync with PITCHER_ONLY_ARCHETYPES / HITTER_ONLY_ARCHETYPES):
//   PITCHER_ONLY covered: velocity_freak ✓  knuckleball_specialist ✓  injury_risk ✓
//   HITTER_ONLY  covered: swing_rebuild ✓
// When adding a new position-specific archetype, add a fallback entry here too.
const PITCHER_FALLBACK_FOR_NONPITCHER: Partial<Record<Archetype, Archetype>> = {
  velocity_freak:          "burnout_candidate",   // same negative energy, position-agnostic
  knuckleball_specialist:  "confidence_crisis",   // quirky → self-doubt arc, works for any player
  injury_risk:             "academic_concern",    // both are eligibility/progress obstacles
};
const HITTER_FALLBACK_FOR_PITCHER: Partial<Record<Archetype, Archetype>> = {
  swing_rebuild:           "late_bloomer",        // positive development arc, position-agnostic
};

// Safe universal default used when a position-specific archetype has no fallback entry.
// This should only fire if a new archetype was added to a position-only set without
// a corresponding fallback — the [archetype-guard] warning surfaces the gap immediately.
const ARCHETYPE_GUARD_DEFAULT: Archetype = "confidence_crisis";

/**
 * Potentially transitions a player's storyline archetype based on accumulated OVR delta.
 *
 * @param currentArchetype - The player's current archetype.
 * @param cumulativeOvrDelta - Total OVR change accumulated across arc stages.
 * @param arcStage - How many arc stages have elapsed (transition requires >= 2).
 * @param isLegendary - Whether the player has a legendary storyline (higher transition chance).
 * @param position - The player's position string (e.g. "SP", "SS", "C").
 *   Required so the position compatibility guard can substitute pitcher-only or hitter-only
 *   archetypes with a position-safe fallback rather than assigning a narratively wrong archetype.
 *   Must be supplied for every call site — recruit or existing roster player.
 */
export function maybeTransitionArchetype(
  currentArchetype: Archetype,
  cumulativeOvrDelta: number,
  arcStage: number,
  isLegendary: boolean,
  position: string,
): Archetype {
  if (arcStage < 2) return currentArchetype;
  const transitionChance = isLegendary ? 0.60 : 0.35;
  if (Math.random() > transitionChance) return currentArchetype;

  // Resolve a transition target to a position-appropriate archetype.
  // If the target is incompatible, use the defined fallback rather than blocking the transition.
  // If no fallback entry exists, warn and return the universal safe default so a future expansion
  // gap is surfaced immediately rather than silently assigning a mismatched archetype.
  const resolveTarget = (target: Archetype): Archetype => {
    const pitcherPos = isPitcher(position);
    if (!pitcherPos && PITCHER_ONLY_ARCHETYPES.has(target)) {
      const fallback = PITCHER_FALLBACK_FOR_NONPITCHER[target];
      if (fallback === undefined) {
        console.warn(
          `[archetype-guard] No PITCHER_FALLBACK_FOR_NONPITCHER entry for "${target}" ` +
          `(position=${position}). Add a fallback to keep transitions narratively consistent. ` +
          `Falling back to "${ARCHETYPE_GUARD_DEFAULT}".`
        );
        return ARCHETYPE_GUARD_DEFAULT;
      }
      return fallback;
    }
    if (pitcherPos && HITTER_ONLY_ARCHETYPES.has(target)) {
      const fallback = HITTER_FALLBACK_FOR_PITCHER[target];
      if (fallback === undefined) {
        console.warn(
          `[archetype-guard] No HITTER_FALLBACK_FOR_PITCHER entry for "${target}" ` +
          `(position=${position}). Add a fallback to keep transitions narratively consistent. ` +
          `Falling back to "${ARCHETYPE_GUARD_DEFAULT}".`
        );
        return ARCHETYPE_GUARD_DEFAULT;
      }
      return fallback;
    }
    return target;
  };

  const transitions = ARCHETYPE_TRANSITIONS[currentArchetype];
  if (cumulativeOvrDelta >= 15 && transitions.positive) return resolveTarget(transitions.positive);
  if (cumulativeOvrDelta <= -15 && transitions.negative) return resolveTarget(transitions.negative);
  return currentArchetype;
}

export const ARCHETYPES: Archetype[] = [
  "late_bloomer", "velocity_freak", "swing_rebuild", "position_change",
  "summer_breakout", "social_media_star", "confidence_crisis", "burnout_candidate",
  "injury_risk", "academic_concern", "transfer_rumors", "two_sport_athlete",
  "knuckleball_specialist", "rivalry_recruit", "generational_prodigy",
  "financial_pressure", "coaching_change", "first_gen_student",
  "draft_agent_pressure", "small_town_hero",
];

// Archetypes whose event text is specific to pitchers (velocity, arm injuries, bullpen, etc.)
const PITCHER_ONLY_ARCHETYPES = new Set<Archetype>([
  "velocity_freak",
  "knuckleball_specialist",
  "injury_risk",        // events reference Tommy John, bullpen sessions, arm velocity
]);

// Archetypes whose event text is specific to hitters (swing, batting cage, hit counts, etc.)
const HITTER_ONLY_ARCHETYPES = new Set<Archetype>([
  "swing_rebuild",      // events reference swing mechanics, batter at tee, homers
]);

export interface ArchetypeDefinition {
  name: string;
  description: string;
  flavor: string;
  events: ArchetypeEventTemplate[];
  legendaryEvents?: ArchetypeEventTemplate[];
}

const W = {
  // Mostly positive, minor variance
  safe_pos: { minor_pos: 0.40, moderate_pos: 0.30, major_pos: 0.10, legendary_pos: 0.02, minor_neg: 0.08, moderate_neg: 0.06, major_neg: 0.02, legendary_neg: 0.00, neutral: 0.02 } as ChoiceWeights,
  // Strong positive, some risk
  bold_pos: { minor_pos: 0.20, moderate_pos: 0.30, major_pos: 0.22, legendary_pos: 0.06, minor_neg: 0.06, moderate_neg: 0.08, major_neg: 0.06, legendary_neg: 0.01, neutral: 0.01 } as ChoiceWeights,
  // Big swing: legendary possible, also bad possible
  high_risk: { minor_pos: 0.10, moderate_pos: 0.18, major_pos: 0.18, legendary_pos: 0.12, minor_neg: 0.08, moderate_neg: 0.12, major_neg: 0.14, legendary_neg: 0.06, neutral: 0.02 } as ChoiceWeights,
  // Mostly flat/small
  cautious: { minor_pos: 0.30, moderate_pos: 0.15, major_pos: 0.04, legendary_pos: 0.01, minor_neg: 0.10, moderate_neg: 0.08, major_neg: 0.02, legendary_neg: 0.00, neutral: 0.30 } as ChoiceWeights,
  // Likely negative
  risky_neg: { minor_pos: 0.08, moderate_pos: 0.06, major_pos: 0.02, legendary_pos: 0.00, minor_neg: 0.26, moderate_neg: 0.28, major_neg: 0.20, legendary_neg: 0.08, neutral: 0.02 } as ChoiceWeights,
  // Neutral with slight upside
  neutral_up: { minor_pos: 0.22, moderate_pos: 0.12, major_pos: 0.04, legendary_pos: 0.01, minor_neg: 0.12, moderate_neg: 0.06, major_neg: 0.02, legendary_neg: 0.00, neutral: 0.41 } as ChoiceWeights,
};

export const ARCHETYPE_DEFS: Record<Archetype, ArchetypeDefinition> = {

  late_bloomer: {
    name: "The Late Bloomer",
    description: "Nobody noticed him — until the one scout everyone ignores filed the report that changed everything.",
    flavor: "He doesn't look like much in the box scores. Ask the guy with the binoculars.",
    events: [
      {
        id: "lb_1",
        scenePrompt: "Pixel art scene: lone infielder at 5am taking ground balls in an empty stadium with only the maintenance lights on, a single hunched scout in the stands writing frantically on a notepad nobody else saw, pre-dawn sky.",
        scenePromptPitcher: "Pixel art scene: lone pitcher at 5am throwing bullpen in an empty stadium with only the maintenance lights on, a single hunched scout in the stands writing frantically on a notepad nobody else saw, pre-dawn sky.",
        eventText: "Ernie Voss is 68 years old, semi-retired, and wrong about prospects so often that other scouts laugh at his reports. He filed a one-page note on {name} last week that said: 'This kid is different. I don't know how yet. But he is.' Three programs are now watching to see if Ernie is finally right.",
        choiceA: "Trust Ernie — reach out to {name} before anyone else does", choiceAOutcome: "Moving on a scout's instinct before the data catches up proves decisive. You're first in the room.", choiceAWeights: W.bold_pos,
        choiceB: "Watch quietly — let the information develop before acting", choiceBOutcome: "Patient observation reveals real growth. Your measured approach builds the right foundation.", choiceBWeights: W.safe_pos,
        choiceC: "Request your own private workout — see it yourself", choiceCOutcome: "The private session confirms something is genuinely different. You've now seen what Ernie saw.", choiceCWeights: W.neutral_up,
        choiceD: "Share Ernie's report with your analytics staff for a data check", choiceDOutcome: "The analytics team's skepticism delays your move. Rivals who trusted their eyes are already calling.", choiceDWeights: W.high_risk,
      },
      {
        id: "lb_2",
        scenePrompt: "Pixel art scene: a scouting forum post on a glowing laptop screen titled 'The Most Undervalued Prospect Nobody Is Talking About,' twelve programs simultaneously reaching for phones in separate dugouts, the name at the top of the article.",
        eventText: "A scouting blog nobody reads published a deep-dive on {name} at 11pm last night. By 7am it had been shared across every major recruiting forum. Twelve programs that ignored him for two years are now suddenly very interested. Your relationship is three months old. Is that enough?",
        choiceA: "Move fast — invite him for an official visit before the weekend", choiceAOutcome: "Your head start on the relationship becomes the decisive advantage in a suddenly crowded field.", choiceAWeights: W.bold_pos,
        choiceB: "Call him personally — remind him you were here before the article", choiceBOutcome: "The reminder that you showed up when it wasn't obvious lands exactly right.", choiceBWeights: W.safe_pos,
        choiceC: "Send a detailed breakdown you've assembled over months — show your work", choiceCOutcome: "Depth of observation impresses him. He can tell who actually watched and who just read a blog.", choiceCWeights: W.neutral_up,
      },
      {
        id: "lb_3",
        scenePrompt: "Pixel art scene: phone screen lit up at midnight showing a batting cage video with 38 million view counter, notification storm of college logos and scout accounts flooding the comments, a shocked father's silhouette in the background.",
        scenePromptPitcher: "Pixel art scene: phone screen lit up at midnight showing a bullpen session video with 38 million view counter, notification storm of college logos and scout accounts flooding the comments, a shocked father's silhouette in the background.",
        eventText: "{name} posted a workout clip at 11pm on a Wednesday. By 6am his father was calling you: 'I don't know what's happening. Can we talk today?' The clip has 38 million views. He looks completely different from the player you first scouted. You need to decide how to handle the next twelve hours.",
        choiceA: "Drive to his house today — show up in person before anyone else can", choiceAOutcome: "The physical presence in a digital firestorm is something no other program will do. It's unforgettable.", choiceAWeights: W.bold_pos,
        choiceB: "Call the father back immediately — calm, honest, and ready to listen", choiceBOutcome: "Being the steady voice when the family is overwhelmed earns lasting trust.", choiceBWeights: W.safe_pos,
        choiceC: "Wait for the storm to settle — contact him in 72 hours when others have moved on", choiceCOutcome: "The measured response reads as confident. He notices you didn't panic.", choiceCWeights: W.cautious,
        choiceD: "Make a public offer — capitalize on the moment before it fades", choiceDOutcome: "The public offer goes viral too, but it puts pressure on him at the worst possible time. He goes quiet.", choiceDWeights: W.high_risk,
      },
    ],
  },

  velocity_freak: {
    name: "The Velocity Freak",
    description: "He broke two radar guns at the same showcase. Command is a rumor. The ceiling is terrifying.",
    flavor: "Three MLB scouts haven't left the parking lot. Neither have the umpires who need to file incident reports.",
    events: [
      {
        id: "vf_1",
        scenePrompt: "Pixel art scene: pitcher mid-delivery on a showcase mound, two radar guns in the foreground displaying error messages, three MLB scouts leaning forward with wide eyes in the upper deck, nine wild pitches chalked on a board behind the dugout.",
        eventText: "{name} broke two radar guns at a June showcase — both read ERROR before the third one finally registered 103 mph. He also threw nine wild pitches, hit a batter, and walked six. Three MLB scouts are still in the parking lot two hours later because none of them can agree on what they just saw. His high school coach is drinking coffee and staring at the wall.",
        choiceA: "Call him tonight — tell him you saw something historic and you want to develop it", choiceAOutcome: "Being first to frame what happened as extraordinary rather than disastrous changes the whole narrative.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out to his pitching coach — understand the command plan before engaging", choiceBOutcome: "The intel from his existing coach reveals a serious mechanical approach already in place.", choiceBWeights: W.safe_pos,
        choiceC: "Invite him for a private bullpen with your pitching staff next week", choiceCOutcome: "The controlled environment shows you a full picture — including whether the command issues are fixable.", choiceCWeights: W.neutral_up,
        choiceD: "Offer a scholarship immediately, unconditionally — secure the arm", choiceDOutcome: "The early offer locks him in. The command problems are now yours to solve.", choiceDWeights: W.high_risk,
      },
      {
        id: "vf_2",
        scenePrompt: "Pixel art scene: sports science firm logo on a glass door, pitcher sitting in a biomechanics lab with sensors taped to his arm, two researchers in white coats staring at monitors with expressions of disbelief, a readout showing arm speed data off the charts.",
        eventText: "A sports science firm called Apex Kinematics has offered to train {name} for free — and wants unlimited biometric access to his arm in exchange. They believe his shoulder rotation speed may be physically anomalous. He's 17. His parents are asking you what you think. No other program has been asked.",
        choiceA: "Encourage it — the data will only help his development and yours", choiceAOutcome: "The science validates what scouts already suspected. His stock among knowledgeable programs jumps dramatically.", choiceAWeights: W.bold_pos,
        choiceB: "Advise caution — protect his arm from becoming a laboratory subject", choiceBOutcome: "Your protectiveness reads as genuine care. He trusts you more than any other program.", choiceBWeights: W.safe_pos,
        choiceC: "Ask to be included in the data process — position yourself as a development partner", choiceCOutcome: "Getting into the room creates a unique developmental relationship no other school can offer.", choiceCWeights: W.neutral_up,
      },
      {
        id: "vf_3",
        scenePrompt: "Pixel art scene: state showcase stage at night, scoreboard flashing 104 mph, crowd of scouts erupting while the pitcher on the mound stands alone staring at his own hand in awe, rival coaches visibly defeated in the dugout across the field.",
        eventText: "{name} touched 104 at the state showcase — the gun didn't break this time — retired nine straight batters, then tried his first curveball and it sailed over the backstop into the stands. A woman in the third row had to duck. Two scouts burst out laughing. One of them was crying at the same time. That's the range of outcomes with this arm. You have 48 hours to make a move.",
        choiceA: "Make the offer tonight — the 104 is real, the curveball will come", choiceAOutcome: "Locking him in now secures the most explosive arm in the class. The command work starts tomorrow.", choiceAWeights: W.bold_pos,
        choiceB: "Tell him exactly what you see — the good and the problem — and commit anyway", choiceBOutcome: "Radical honesty combined with a scholarship offer is an unusually powerful combination. He respects it deeply.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a former first-rounder from your program who went through the same thing", choiceCOutcome: "The peer mentor story of a raw arm becoming a pro is exactly the narrative he needs right now.", choiceCWeights: W.bold_pos,
        choiceD: "Ask for one more session before committing — evaluate command progress", choiceDOutcome: "The delay signals hesitation at the worst moment. A rival moves that night. He remembers who believed first.", choiceDWeights: W.risky_neg,
      },
    ],
  },

  swing_rebuild: {
    name: "The Swing Rebuilder",
    description: "His old coach said he was done on the radio. The guru who never works with teenagers just made an exception.",
    flavor: "He hit .141 last spring. His exit velocity in the cage last Tuesday was 116 mph.",
    events: [
      {
        id: "sr_1",
        scenePrompt: "Pixel art scene: reclusive hitting guru in a dim private facility adjusting a teenager's stance at a tee, no windows, walls covered in handwritten notes and slow-motion freeze frames, a single lamp over the tee, outside world completely absent.",
        eventText: "A reclusive hitting instructor known only as 'The Architect' — who has refused to work with anyone under 25 for the past decade — personally reached out to offer {name} free private instruction. Nobody knows why. His previous coach went on a local radio station last month to say publicly that {name} was 'mechanically unfixable.' Early exit velocity numbers from The Architect's facility are being described as 'absurd' by people who've seen them.",
        choiceA: "Call him immediately — tell him you've been watching through the noise all along", choiceAOutcome: "Being the program that stayed curious while everyone else wrote him off creates a bond that won't break.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out to The Architect — understand the plan before engaging the player", choiceBOutcome: "The intel from the source confirms this is real. You now know what's coming before anyone else does.", choiceBWeights: W.safe_pos,
        choiceC: "Send him footage of your program's best hitters — show him what's possible here", choiceCOutcome: "The developmental vision you paint alongside the rebuild creates a compelling future picture.", choiceCWeights: W.neutral_up,
        choiceD: "Wait for game results before engaging — the cage numbers could be inflated", choiceDOutcome: "By the time the game results arrive, four other programs have already built relationships. You're playing catch-up.", choiceDWeights: W.high_risk,
      },
      {
        id: "sr_2",
        scenePrompt: "Pixel art scene: scouts in the front row leaping from their seats in slow-motion as a baseball screams on a line into the gap, one scout's notepad flying from his hands, another already dialing a phone, the batter's follow-through perfect and effortless.",
        eventText: "{name}'s first competitive at-bat after four months with The Architect ended with a 117 mph exit velocity line drive that nearly ended an outfielder's career. He went 3-for-4 with two homers in the scrimmage. Scouts who saw the old swing are openly skeptical. Scouts who saw this swing are calling general managers. The radio host who called him unfixable has not commented.",
        choiceA: "Invite him for an official visit immediately — capitalize on the momentum", choiceAOutcome: "The timing of the visit amid his surge makes your program feel like part of the breakthrough story.", choiceAWeights: W.high_risk,
        choiceB: "Call him just to say you watched — no pitch, just acknowledgment", choiceBOutcome: "The simplest call lands the deepest. He's had enough sales pitches. You just talked to him like a person.", choiceBWeights: W.safe_pos,
        choiceC: "Send him the actual exit velocity data with a note: 'We saw this coming'", choiceCOutcome: "The data with context — that you believed before it arrived — is the most powerful thing you can show him.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  position_change: {
    name: "The Convert",
    description: "The best shortstop in the state. Then the shoulder came apart. Now everything has to change.",
    flavor: "He's never thrown to second base from his knees. He did it twice in practice yesterday.",
    events: [
      {
        id: "pc_1",
        scenePrompt: "Pixel art scene: former star shortstop sitting on a trainer's table with an MRI image on the wall, three coaches looking at it with mixed expressions, a catcher's mitt on the bench he hasn't touched yet, a barely healed surgery scar visible on the shoulder.",
        eventText: "{name} was the consensus best shortstop in his state until March, when his shoulder came apart — three tears, six months recovery. His surgeon said 'never shortstop again.' A rival coach publicly called him 'a cautionary tale.' His arm is still a weapon — he just can't field. The only paths forward are first base or behind the plate. He hasn't decided which yet. He's also considering quitting.",
        choiceA: "Show up to his first catcher practice — be there in person before anyone else", choiceAOutcome: "Physical presence at the moment he's most uncertain about his future is an act of faith he will never forget.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with a current player who made the same position switch and flourished", choiceBOutcome: "The peer story of survival and reinvention is far more powerful than anything a coach can say.", choiceBWeights: W.safe_pos,
        choiceC: "Offer specialized position conversion staff — give him a concrete development plan", choiceCOutcome: "The concrete plan converts uncertainty into a roadmap. He can see the path now.", choiceCWeights: W.neutral_up,
        choiceD: "Make a scholarship offer now — show the injury doesn't change your evaluation", choiceDOutcome: "The early offer is bold and loyal. It lands perfectly — he's been waiting for someone to not flinch.", choiceDWeights: W.high_risk,
      },
      {
        id: "pc_2",
        scenePrompt: "Pixel art scene: catcher throwing to second base from his knees in a cloud of dust, catcher's coach standing frozen with a dropped clipboard, three scouts immediately turning to each other with open mouths, the stopwatch in one hand reading an impossible time.",
        eventText: "{name} threw out a runner at second from his knees in live practice — his third week behind the plate. The catcher's coach dropped his clipboard and said nothing for 45 seconds. When he finally spoke, he said: 'That took me four years to teach my last guy.' The scouts who were there are now calling each other. The rival coach who said 'cautionary tale' has not been seen at a practice since.",
        choiceA: "Call him the same night — tell him what you saw and what it means", choiceAOutcome: "Being first to name the magnitude of what just happened is a gift. He's still processing it himself.", choiceAWeights: W.bold_pos,
        choiceB: "Arrange for him to work with your program's catcher development coach", choiceBOutcome: "Putting elite positional resources in front of him makes the vision tangible.", choiceBWeights: W.safe_pos,
        choiceC: "Let the moment breathe — reach out in three days with a thoughtful note", choiceCOutcome: "The delayed but thoughtful response stands out against the immediate flood of calls from others.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  summer_breakout: {
    name: "The Summer Breakout",
    description: "Unknown in June. Fourth in the state in July. His parents hired an agent. He's 17.",
    flavor: "The pitching at those three showcases was terrible, and scouts are saying so. But he still hit .520 against it.",
    events: [
      {
        id: "sb_1",
        scenePrompt: "Pixel art scene: summer showcase ranking board updating in real time, a player's name jumping from unranked to #4 in the state, scouts on phones all simultaneously, a 17-year-old's parents shaking hands with a man in a business suit who arrived out of nowhere.",
        scenePromptPitcher: "Pixel art scene: summer showcase ranking board updating in real time, a pitcher's name jumping from unranked to #4 in the state, scouts on phones all simultaneously, a 17-year-old's parents shaking hands with a man in a business suit who arrived out of nowhere.",
        scenePromptByPosition: {
          C: "Pixel art scene: summer showcase ranking board updating in real time, a catcher's name jumping from unranked to #4 in the state, scouts comparing phone screens simultaneously, a 17-year-old's parents shaking hands with a business-suited man who arrived out of nowhere, a catcher's helmet and chest protector stacked in the corner of the frame.",
          OF: "Pixel art scene: summer showcase ranking board updating in real time, an outfielder's name jumping from unranked to #4 in the state, scouts comparing phone screens simultaneously, a 17-year-old's parents shaking hands with a business-suited man who arrived out of nowhere, a slow-motion replay of a diving catch playing on a nearby laptop screen.",
        },
        eventText: "{name} was unranked entering June. He dominated three consecutive showcase events — best player on the field, every time — and is now fourth in the state. His parents have hired a 35-year-old agent who drove three hours to introduce himself at the second showcase. The agent's first email to programs arrived at 6am this morning. It has 14 bullet points and a logo.",
        choiceA: "Ignore the agent — call the player directly, like you always have", choiceAOutcome: "Going around the noise and straight to the person signals you see him, not his new representation.", choiceAWeights: W.bold_pos,
        choiceB: "Engage the agent professionally — play it right to get access to the player", choiceBOutcome: "Respecting the process earns access. The agent tells him you were professional and serious.", choiceBWeights: W.safe_pos,
        choiceC: "Invite his family — parents, not the agent — for a campus visit", choiceCOutcome: "Going to the family directly over the agent is a bold move that resonates with parents who are still figuring this out.", choiceCWeights: W.neutral_up,
        choiceD: "Wait to see if the summer performance holds into fall before fully committing", choiceDOutcome: "Hesitation in a seller's market costs you the room. Three programs have already made offers. You're late.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sb_2",
        scenePrompt: "Pixel art scene: fall baseball game at dusk, player pressing badly at the plate, stance tight and mechanical compared to the summer, a distant scout lowering his binoculars slowly, the player's father watching alone in empty bleachers looking worried.",
        scenePromptPitcher: "Pixel art scene: fall baseball game at dusk, pitcher struggling on the mound, delivery stiff and labored compared to the summer, a distant scout lowering his binoculars slowly, the player's father watching alone in empty bleachers looking worried.",
        scenePromptByPosition: {
          C: "Pixel art scene: fall baseball game at dusk, catcher in full gear visibly struggling behind the plate — a passed ball rolling to the backstop, a runner advancing — a distant scout lowering his binoculars slowly, the player's father watching alone in empty bleachers looking worried.",
          OF: "Pixel art scene: fall baseball game at dusk, outfielder misjudging a fly ball in deep center, the ball dropping behind him while he over-runs it, a distant scout lowering his binoculars slowly, the player's father watching alone in empty bleachers looking worried.",
        },
        eventText: "{name} is 2-for-18 in fall ball against real competition and visibly pressing. The agent has stopped responding to scout emails. Two programs quietly rescinded their offers without explanation. His father texted you at midnight: 'He's not sleeping. He thinks he fooled everyone this summer and now they know. Can you call him?' What do you do?",
        eventTextPitcher: "{name} has posted a 7.40 ERA in fall ball against real competition and is visibly unraveling on the mound — windup short, release point all over the place, walking batters he'd have blown away in June. The agent has stopped responding to scout emails. Two programs quietly rescinded their offers without explanation. His father texted you at midnight: 'He's not sleeping. He thinks he fooled everyone this summer and now they know. Can you call him?' What do you do?",
        choiceA: "Call him immediately — not as a recruiter, as someone who believes him", choiceAOutcome: "Your presence at the moment he's convinced he's a fraud is the thing he will carry for years.", choiceAWeights: W.bold_pos,
        choiceB: "Call the father first — understand the full picture before reaching out to the player", choiceBOutcome: "The father's trust becomes the gateway to the player at the right moment. You earn both.", choiceBWeights: W.safe_pos,
        choiceC: "Send him the summer film — specific clips of what made the showcase real", choiceCOutcome: "The visual evidence of what you saw, curated by someone who watched closely, cuts through the doubt.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  social_media_star: {
    name: "The Social Media Star",
    description: "4.2 million followers. A training clip with 40 million views. Then a DM from two years ago resurfaced.",
    flavor: "Gatorade, Nike, and a fast food chain all called the same afternoon. He missed three practices that week.",
    events: [
      {
        id: "sm_1",
        scenePrompt: "Pixel art scene: player in a batting cage with ring lights, a phone on a tripod filming everything, notifications flooding the screen showing millions of views, Gatorade and Nike logos appearing in comments, the actual baseball game happening ignored in the background outside.",
        scenePromptPitcher: "Pixel art scene: pitcher in a bullpen with ring lights, a phone on a tripod filming everything, notifications flooding the screen showing millions of views, Gatorade and Nike logos appearing in comments, the actual game happening ignored in the background outside.",
        eventText: "{name} has 4.2 million followers and his latest training clip hit 40 million views in three days — more than any MLB player's content this week. Gatorade, Nike, and a fast food chain all called on the same afternoon. He was supposed to be at a key showcase that weekend. He wasn't there. His high school coach called you, not to complain — to ask for advice.",
        choiceA: "Call {name} directly — acknowledge the moment, then ask one honest question about baseball", choiceAOutcome: "The honest question about what he actually wants — not what the brand wants — opens a real conversation nobody else is having.", choiceAWeights: W.bold_pos,
        choiceB: "Call the high school coach back — build the alliance that has access to him", choiceBOutcome: "The coach becomes your inside relationship. He's worried too and appreciates that you treated this seriously.", choiceBWeights: W.high_risk,
        choiceC: "Connect him with a current player at your program who navigated early fame", choiceCOutcome: "Peer testimony from someone who's lived it and came through it is more useful than anything a coach can say.", choiceCWeights: W.safe_pos,
        choiceD: "Say nothing — let the brand cycle play out and contact him when it quiets down", choiceDOutcome: "Silence reads as indifference. A program that didn't blink at the distraction has already called. He's talking to them.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sm_2",
        scenePrompt: "Pixel art scene: phone screen showing a screenshot of an old DM blowing up in viral shares, angry and defensive comments flooding in, the player sitting in the dark of his bedroom staring at the ceiling, a mother's hand visible placing a glass of water on the nightstand.",
        eventText: "A DM {name} sent two years ago — at 15 years old — surfaces on social media. It's ambiguous but the context is gone and the framing is brutal. Three programs rescinded their offers without calling first. His mother calls you crying: 'You're the only one who hasn't taken it back. I need to know if that's still true.' You haven't decided yet.",
        choiceA: "Tell her you're still in — and call him directly to hear his side", choiceAOutcome: "Loyalty in the ugliest moment creates something that no other program will ever be able to replicate.", choiceAWeights: W.bold_pos,
        choiceB: "Ask to speak with him privately before making any decision — get the real story", choiceBOutcome: "The conversation reveals exactly what happened. What you learn makes the decision clearer and the bond deeper.", choiceBWeights: W.safe_pos,
        choiceC: "Pull back for now — your program's reputation has to be protected first", choiceCOutcome: "The decision to protect the program over the person is remembered. By him. By his mother. By everyone watching.", choiceCWeights: W.risky_neg,
      },
    ],
  },

  confidence_crisis: {
    name: "The Confidence Crisis",
    description: "He was the #1 prospect in his state. Then his father passed away. He still shows up. He's just not there.",
    flavor: "Scouts who watched him in September say he's a different player. He is. His dad died in October.",
    events: [
      {
        id: "cc_1",
        scenePrompt: "Pixel art scene: player alone at the far end of an empty dugout, helmet in his hands, staring at the dirt floor, an empty batting cage behind him, the stadium completely still, a small photo visible tucked inside his helmet.",
        scenePromptPitcher: "Pixel art scene: pitcher alone at the far end of an empty dugout, cap pulled down, staring at his hand, an empty bullpen mound behind him, stadium completely still, a small photo tucked inside his hat band.",
        scenePromptByPosition: {
          C: "Pixel art scene: catcher in full gear sitting alone at the far end of an empty dugout, mask resting on the bench beside him, shin guards still strapped, staring at a small photo tucked into his chest protector, home plate visible through the dugout entrance, stadium completely still.",
          OF: "Pixel art scene: outfielder standing motionless alone in center field, glove hanging limp at his side, the vast empty outfield grass stretching in every direction around him, a small photo tucked under the brim of his cap, stadium completely still.",
          SS: "Pixel art scene: shortstop alone on the infield dirt at his position, head bowed over his glove held in both hands, empty stadium all around him, a small photo tucked inside his glove, the clay of the infield lit only by maintenance lights.",
        },
        eventText: "{name}'s father built a batting cage in their backyard when he was six years old and coached him every single day for twelve years. He passed away in October. {name} still shows up to every practice. He still takes every at-bat. He just hasn't had a hit since the funeral, and every scout who sees him says the same thing: 'Something's gone.' What do you do when the thing that's gone isn't fixable by a pitching coach?",
        eventTextPitcher: "{name}'s father built a pitching mound in their backyard when he was six years old and coached him every single day for twelve years. He passed away in October. {name} still shows up to every bullpen session. He still takes the mound for every start. He just hasn't thrown a clean inning since the funeral — walked 14 in his last two outings — and every scout who sees him says the same thing: 'Something's gone.' What do you do when the thing that's gone can't be fixed with mechanics?",
        choiceA: "Show up to a game — just to sit in the stands, not to recruit", choiceAOutcome: "Being physically present with no agenda is an act of humanity that coaches almost never do. He notices.", choiceAWeights: W.bold_pos,
        choiceB: "Write him a real letter — not about baseball, about loss and what it means to keep going", choiceBOutcome: "The letter arrives on a bad day and becomes the thing he reads three times. Your name is different to him now.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a current player who lost a parent and came through it", choiceCOutcome: "Peer understanding of this specific kind of grief is something no coach can manufacture. The connection is real.", choiceCWeights: W.neutral_up,
        choiceD: "Give him space — wait until he's ready before reaching out", choiceDOutcome: "Absence in the darkest period reads as absence. He can't distinguish 'giving space' from 'moving on.' Three programs didn't wait.", choiceDWeights: W.risky_neg,
      },
      {
        id: "cc_2",
        scenePrompt: "Pixel art scene: player sitting alone in a dugout after a walk-off hit, teammates celebrating on the field, the player quietly crying with his hands in his lap while everyone else erupts around him, a scout in the stands already on the phone, another one crying too.",
        scenePromptPitcher: "Pixel art scene: pitcher sitting alone in a dugout after a game-ending strikeout, teammates celebrating on the field, the player quietly crying with his hands on his knees while everyone else erupts, a scout in the stands already on the phone, another one wiping his eye.",
        scenePromptByPosition: {
          C: "Pixel art scene: catcher sitting alone in a dugout, mask off and set on the bench, after throwing out a runner to end a fall scrimmage, teammates celebrating on the field, the catcher quietly crying with both hands in his lap while everyone else erupts, a scout in the stands already on the phone, another one wiping his eye.",
          OF: "Pixel art scene: outfielder sitting alone in a dugout after a diving catch that saved a fall scrimmage, teammates celebrating on the field, the outfielder quietly crying with his glove resting on his knee while everyone else erupts around him, a scout in the stands already on the phone, another one wiping his eye.",
        },
        eventText: "{name} hit a walk-off in a meaningless fall scrimmage and sobbed in the dugout for ten minutes afterward while his teammates celebrated without him. His teammate told you afterward: 'He said it was the first time he felt anything at the plate since his dad died.' Two scouts in the stands saw it. One of them called you right after. The other one was crying and couldn't talk yet.",
        eventTextPitcher: "{name} struck out the side in a meaningless fall scrimmage and sobbed in the dugout for ten minutes afterward while his teammates celebrated without him. His teammate told you afterward: 'He said it was the first time he felt anything on the mound since his dad died.' Two scouts in the stands saw it. One of them called you right after. The other one was crying and couldn't talk yet.",
        choiceA: "Don't call. Write. Tell him what watching that meant — one coach to one person", choiceAOutcome: "The written word at the right moment becomes the thing he keeps. The relationship changes permanently.", choiceAWeights: W.safe_pos,
        choiceB: "Call him the next morning — just to check in, not to recruit", choiceBOutcome: "The call with no agenda lands exactly right. He talks for 40 minutes. You mostly listen.", choiceBWeights: W.high_risk,
        choiceC: "Reach out to his mother first — tell her what you saw from the stands", choiceCOutcome: "The mother becomes your strongest ally. She calls her son that night and tells him what you said.", choiceCWeights: W.bold_pos,
      },
      {
        id: "cc_3",
        scenePrompt: "Pixel art scene: player standing at the plate in a key game moment, a single beam of stadium light cutting through the dust onto him, his stance quietly transformed from the rigid thing it was three months ago, his hands loose, breath visible in the cold air, one scout lowering his binoculars slowly with the look of someone seeing a ghost come back to life.",
        scenePromptPitcher: "Pixel art scene: pitcher stepping onto the mound in a key game moment, a single beam of stadium light cutting through the dust onto him, his set and exhale quietly transformed from the mechanical thing it was three months ago, one scout lowering his binoculars slowly with the look of someone seeing a ghost come back to life.",
        eventText: "{name} stepped into the batter's box in the seventh inning last Friday and looked different. Not physically — his stance. Loose. Present. The thing he lost in October was suddenly, improbably back. He hit a line drive to left center. Jogged to second. Stood there looking at the sky for a moment before anyone could make sense of what they'd just seen. His high school coach texted you after: 'He's coming back. I thought you should know first.'",
        eventTextPitcher: "{name} stepped onto the mound in the seventh inning last Friday and looked different. Not physically — his grip, his set, his exhale before the wind-up. The thing he lost in October was suddenly, improbably back. He struck out the side on nine pitches. Walked to the dugout without a word. His high school coach texted you after: 'He's coming back. I thought you should know first.'",
        choiceA: "Call him immediately — acknowledge what you saw without making it bigger than he needs it to be", choiceAOutcome: "The call that names the moment without dramatizing it is exactly the right register. He says: 'I feel like myself again.' You say: 'I know. I could tell.'", choiceAWeights: W.bold_pos,
        choiceB: "Send him a simple message — two sentences, nothing more", choiceBOutcome: "The restraint of two sentences in a moment everyone is rushing to claim lands like a deep breath. He reads it four times.", choiceBWeights: W.safe_pos,
        choiceC: "Give it another week — make sure this is real before reinvesting fully", choiceCOutcome: "The week of caution is reasonable and costs you nothing except first-mover advantage. Other programs notice the same thing.", choiceCWeights: W.cautious,
      },
    ],
  },

  burnout_candidate: {
    name: "The Burnout Risk",
    description: "287 innings this summer. His mother cornered you at the showcase. She said 'please' twice.",
    flavor: "He texted you at midnight from a lake 200 miles away. He was supposed to be at the showcase.",
    events: [
      {
        id: "bc_1",
        scenePrompt: "Pixel art scene: exhausted player at a summer showcase, dark circles carved under his eyes, travel bags from three different programs piled in the dugout, overcast hazy sky, a mother in the background moving deliberately toward a coach with a look of quiet determination.",
        scenePromptPitcher: "Pixel art scene: exhausted pitcher at a summer showcase, arm sleeve, dark circles carved under his eyes, travel bags from three different travel programs piled in the dugout, overcast hazy sky, a mother in the background moving deliberately toward a coach with quiet determination.",
        scenePromptByPosition: {
          C: "Pixel art scene: exhausted catcher at a summer showcase in full gear, shin guards scuffed from three consecutive tournaments, dark circles carved under his eyes, travel bags from three different programs piled beside him, overcast hazy sky, a mother in the background moving deliberately toward a coach with quiet determination.",
          OF: "Pixel art scene: exhausted outfielder at a summer showcase, dark circles carved under his eyes, three different travel team jerseys half-folded in an open duffel bag at his feet, overcast hazy sky, a mother in the background moving deliberately toward a coach with quiet determination.",
        },
        eventText: "{name} threw 287 innings across three travel programs this summer. He showed up to the showcase looking gray. His mother found you between games and said quietly: 'He told me last night he wants to quit. Please don't offer him a scholarship right now. Please.' She said 'please' twice. He's on the mound warming up fifty yards away and doesn't know she's talking to you.",
        choiceA: "Honor the mother's request — call him tomorrow, but not about baseball", choiceAOutcome: "Respecting a mother's read of her son's breaking point creates a trust that no scholarship can buy.", choiceAWeights: W.bold_pos,
        choiceB: "Watch the start without approaching — let the performance speak without pressure", choiceBOutcome: "Your quiet presence without demands registers. He sees you in the stands after. He doesn't say anything. He nods.", choiceBWeights: W.safe_pos,
        choiceC: "Speak with his high school coach after the game — understand the full picture", choiceCOutcome: "The coach has been watching this all summer and has information nobody else has. It changes your approach.", choiceCWeights: W.neutral_up,
        choiceD: "Make the offer anyway — the talent justifies it and rest will follow a decision", choiceDOutcome: "The offer arrives the same night the mother asked you not to. She finds out. The conversation is over.", choiceDWeights: W.risky_neg,
      },
      {
        id: "bc_2",
        scenePrompt: "Pixel art scene: empty showcase field with a lone chair where the player was supposed to be warming up, a phone notification showing a midnight text from a lake 200 miles away, coaches standing in the parking lot looking at each other, fishing dock in the inset image on the phone screen.",
        scenePromptPitcher: "Pixel art scene: empty bullpen where the pitcher was supposed to throw, a phone notification showing a midnight text from a lake 200 miles away, coaches standing in the parking lot looking at each other, a fishing dock in the inset image on the phone screen.",
        scenePromptByPosition: {
          C: "Pixel art scene: empty home plate area where the catcher was supposed to be running warm-up drills, a lone catcher's mask sitting on the ground behind the dish, a phone notification showing a midnight text from a lake 200 miles away, coaches standing in the parking lot looking at each other, a fishing dock in the inset image on the phone screen.",
          OF: "Pixel art scene: empty outfield grass where the outfielder was supposed to be shagging flies, a lone glove resting on the warning track, a phone notification showing a midnight text from a lake 200 miles away, coaches standing in the parking lot looking at each other, a fishing dock in the inset image on the phone screen.",
        },
        eventText: "{name} didn't show up to a major showcase — a $2,000 event his family already paid for. His high school coach says he's 'unavailable.' His Instagram shows him fishing at a lake 200 miles away. He texted you at midnight: 'Sorry coach. I needed to breathe. I'll understand if this changes things.' He's the first recruit who's ever apologized to you for needing rest.",
        choiceA: "Text back immediately: 'Fish as long as you need. We'll be here.'", choiceAOutcome: "Four words and a period. He screenshots it. He shows his mother. She calls you the next morning.", choiceAWeights: W.bold_pos,
        choiceB: "Wait until he comes back — then call and ask what he needs, not what happened", choiceBOutcome: "Asking what he needs instead of demanding an explanation is the rarest response. He wasn't expecting it.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a current player who nearly walked away and chose to stay", choiceCOutcome: "The story of someone who almost quit — told by that person, not a coach — resonates in a way nothing else can.", choiceCWeights: W.neutral_up,
      },
      {
        id: "bc_3",
        scenePrompt: "Pixel art scene: player alone in a high school gym in December, just him and a tee and complete silence, working without the crowd or the pressure or the travel bags — a single light overhead — smiling at the ball before he hits it, nobody watching.",
        scenePromptPitcher: "Pixel art scene: pitcher alone in a high school gym in December, just him and a net and complete silence, working without the crowd or the pressure or the radar gun — a single light overhead — smiling before each throw, nobody watching.",
        eventText: "{name} called you in December. It was the first call he'd initiated in six months. He said: 'I think I needed to remember why I started. I went home, hit in my dad's gym for a week. Nobody watching. No showcases. I figured something out.' He paused. 'I'm ready to make a decision. But I wanted to talk to you first, before I talked to anyone else.' He sounds different — quieter and more certain at the same time.",
        eventTextPitcher: "{name} called you in December. It was the first call he'd initiated in six months. He said: 'I think I needed to remember why I started. I went home, threw in my dad's garage for a week. Nobody watching. No radar gun. I figured something out.' He paused. 'I'm ready to make a decision. But I wanted to talk to you first, before I talked to anyone else.' He sounds different — quieter and more certain at the same time.",
        choiceA: "Let him lead — ask what he figured out and genuinely listen to the answer", choiceAOutcome: "What he figured out turns out to be the most important thing he's said to you in months. You learn something about him — and he sees that you learned it.", choiceAWeights: W.bold_pos,
        choiceB: "Acknowledge the call first — tell him you've been thinking about him", choiceBOutcome: "The acknowledgment that he was in your thoughts when he went quiet is something he didn't expect. It matters.", choiceBWeights: W.safe_pos,
        choiceC: "Keep the conversation light — don't push for the decision, let it come naturally", choiceCOutcome: "The absence of pressure after months of everyone pressing him is the thing that finally makes him exhale. He commits that same week.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  injury_risk: {
    name: "The Comeback Kid",
    description: "Tommy John at 16. Came back. Tore it again at 17. Now, 20 months later, he hit 91 on a changeup grip.",
    flavor: "His physical therapist is smiling. His parents are crying. He's staring at his own hand like he's never seen it before.",
    events: [
      {
        id: "ir_1",
        scenePrompt: "Pixel art scene: pitcher in a recovery bullpen, a physical therapist watching every movement with hands raised ready to intervene, medical monitoring equipment on a nearby table, the pitcher's parents visible through a chain link fence gripping it with white knuckles, a radar gun reading 91 in the foreground.",
        eventText: "{name} had Tommy John surgery at 16, returned to the mound at 17, and tore his UCL again three starts in. He's now 20 months post-second surgery and back in live bullpen sessions for the first time. He hit 91 mph — on a changeup grip, not even a fastball. His physical therapist is smiling. His parents, watching through the chain-link fence, are crying. He's looking at his own throwing hand like he doesn't recognize it.",
        choiceA: "Call him tonight — tell him exactly what 91 on a changeup grip means to you", choiceAOutcome: "Naming the significance of what he just did — in technical terms — shows him you actually understand what happened. He's never heard that from a coach.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out to his physical therapist first — understand the recovery trajectory", choiceBOutcome: "The PT's perspective confirms the timeline is real and provides the medical credibility to make an informed, genuine offer.", choiceBWeights: W.safe_pos,
        choiceC: "Offer to cover an independent evaluation with your program's medical staff", choiceCOutcome: "Investing in his health before you've made him a player signals that you see him as a person first.", choiceCWeights: W.neutral_up,
        choiceD: "Wait for three more live sessions before committing — protect yourself from the risk", choiceDOutcome: "Your caution is rational. The program that called the night of the first session is already his favorite. You're behind.", choiceDWeights: W.risky_neg,
      },
      {
        id: "ir_2",
        scenePrompt: "Pixel art scene: pitcher mid-delivery frozen in time, one radar gun in the foreground reading 94 mph, the pitcher's face showing two expressions simultaneously — ecstasy and fear — hand reaching instinctively toward his elbow, catcher sprinting toward the mound.",
        eventText: "{name} struck out four consecutive batters in live BP, touching 94 mph. Then he stopped mid-windup and walked to the dugout without a word. His trainer ran over. {name} was holding his elbow lightly. 'It's not pain,' he said quietly. 'It just feels different. In a good way, I think. But I've been wrong about that before.' He sat alone for twenty minutes. When he came back out, he asked if anyone wanted to play catch.",
        choiceA: "Support whatever timeline he needs — tell him explicitly that patience is your plan", choiceAOutcome: "The unconditional timeline removes the pressure that has haunted every previous comeback attempt. Something visibly settles in him.", choiceAWeights: W.risky_neg,
        choiceB: "Offer specialized biomechanics consultation — give him elite resources, not just words", choiceBOutcome: "The specific medical offer translates care into action. It's the thing that makes the difference between feeling supported and being supported.", choiceBWeights: W.safe_pos,
        choiceC: "Reach out to encourage the aggressive timeline — showcase while the momentum is there", choiceCOutcome: "Pushing the timeline on an arm that has failed twice before is a risk he knows better than anyone. He hears the pressure. The relationship cools.", choiceCWeights: W.bold_pos,
      },
      {
        id: "ir_3",
        scenePrompt: "Pixel art scene: medical consultation room, pitcher and his parents sitting across from two surgeons with differing body language — one leaning forward with a pen, the other sitting back with arms folded — an MRI image on the light board between them, the pitcher looking not at either surgeon but at a spot on the wall where no one is looking.",
        eventText: "The medical news on {name} came back ambiguous. One surgeon recommends shutting the arm down for eight months. Another says there's no structural reason he can't pitch through it with careful management. Two programs quietly withdrew. Four others are waiting. He told you what neither surgeon said: 'I feel fine. I just don't know who to trust anymore.' He's never said that to another coach.",
        choiceA: "Get him a third opinion — on your program's dime, no strings, just information", choiceAOutcome: "The offer of independent information with no agenda signals that you're solving his problem, not yours. He calls the next morning.", choiceAWeights: W.bold_pos,
        choiceB: "Tell him honestly what you would do if it were your arm — give him a real answer", choiceBOutcome: "The personal answer, not the coaching answer, is something he wasn't expecting. It becomes the conversation he references when he announces his decision.", choiceBWeights: W.safe_pos,
        choiceC: "Tell him you'll support whatever he decides — and that the offer stands regardless", choiceCOutcome: "The unconditional commitment through the medical uncertainty is the most powerful thing a program can offer. He files it differently from every other pitch.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  academic_concern: {
    name: "The Eligibility Question",
    description: "A 34 on the ACT. Speaks three languages. GPA of 2.4 because he refuses to do homework for teachers he considers lazy.",
    flavor: "His coach warned you: 'He'll fail out of somewhere in two semesters. Recruit him anyway.'",
    events: [
      {
        id: "ac_1",
        scenePrompt: "Pixel art scene: student-athlete at a kitchen table with textbooks he clearly hasn't opened, ACT score report showing 34 on one side, GPA report showing 2.4 on the other, a half-finished handwritten letter to a college coach explaining his academic philosophy, a baseball glove used as a paperweight.",
        eventText: "{name} scored a 34 on the ACT. He speaks three languages. He built a working weather prediction model for a science fair and won by 40 points. His GPA is a 2.4 because he refuses to do homework for teachers he considers intellectually dishonest. His high school coach told you privately: 'He will fail out of your school in one semester unless you give him room to breathe. But he can play. God, he can play.'",
        choiceA: "Call him and have the real conversation — not about GPA, about what drives him", choiceAOutcome: "The conversation about what actually motivates him reveals something surprising. You build a relationship nobody else has thought to build.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with students at your program who share his mindset", choiceBOutcome: "Peer examples of people who found their place — academically and athletically — make the vision real.", choiceBWeights: W.safe_pos,
        choiceC: "Show him your academic flexibility options — independent study, honors programs", choiceCOutcome: "The specific academic structures that could actually work for him are the conversation he's never been offered before.", choiceCWeights: W.neutral_up,
        choiceD: "Focus only on baseball — let the academic issues work themselves out", choiceDOutcome: "The academic problems don't work themselves out. They surface in October of his freshman year. You were warned.", choiceDWeights: W.cautious,
      },
      {
        id: "ac_2",
        scenePrompt: "Pixel art scene: player holding a grade report with a look of surprised satisfaction, a formal 4-page letter typed in legal brief style on the table beside it, a coach's phone screen showing three school names with data annotations, the letter ending with 'P.S. I will require academic latitude. I hope that is compatible.'",
        eventText: "{name} cleared eligibility — barely. Then he sent his three finalist schools a 4-page letter organized like a legal brief explaining his decision criteria. With citations. Your program made the list. His postscript reads: 'I will require academic latitude. I do not do mediocre work. I hope that is compatible with your program's culture.' You have one chance to answer correctly.",
        choiceA: "Write back — match the formality, acknowledge the postscript directly, be honest about what you can offer", choiceAOutcome: "The written response in kind signals a program that speaks his language. He reads yours twice. His mother reads it three times.", choiceAWeights: W.bold_pos,
        choiceB: "Call instead of writing — show you can operate outside the format he set", choiceBOutcome: "The call surprises him. The directness and the willingness to be human over formal is exactly what he was testing for.", choiceBWeights: W.safe_pos,
        choiceC: "Have your academic dean reach out — show you take the question seriously at an institutional level", choiceCOutcome: "Elevating the response to an institutional level signals genuine investment in the academic side of his experience.", choiceCWeights: W.neutral_up,
      },
      {
        id: "ac_3",
        scenePrompt: "Pixel art scene: academic advisor's office, the recruit sitting across a desk with a letter visible — the phrase 'Eligible to Enroll' barely readable — the advisor and recruit shaking hands across the desk, the recruit's phone lit up with twelve unread messages from coaches.",
        eventText: "{name} cleared full academic eligibility — just barely, again, but this time without any asterisks. His advisor sent a letter. His mother framed it. He texted you the photo of the framed letter and one line: 'It's real now.' He hasn't responded to eleven coaches who reached out since the news broke. Your message was the twelfth. He responded to yours.",
        choiceA: "Ask him one question: 'What made you text me that photo?'", choiceAOutcome: "The question cuts directly to what matters. The answer tells you more about where this is heading than any amount of recruiting talk.", choiceAWeights: W.bold_pos,
        choiceB: "Respond simply — acknowledge the moment, tell him you're proud, and leave it there", choiceBOutcome: "The cleanest response to a moment that's already been through enough complexity is the one that says 'I see you' without needing anything back.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him when he wants to visit — make the next step concrete while the energy is real", choiceCOutcome: "The forward motion captures the momentum before it dissipates. He picks a date before the call ends.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  transfer_rumors: {
    name: "The Rumor Mill",
    description: "He decommitted from the defending national champion at 11:47pm on a Tuesday. Nobody knows why.",
    flavor: "By noon the next day his parents had hired a handler. His old coach was giving interviews. He hadn't said a word.",
    events: [
      {
        id: "tr_1",
        scenePrompt: "Pixel art scene: 40 phones lighting up simultaneously in coaches offices at midnight, a single recruit sitting in his childhood bedroom unaware of the storm, his old school's banner on the wall slowly tilting sideways in the draft from an open window, a handler's business card on the nightstand.",
        eventText: "{name} decommitted from the defending national champion at 11:47pm on a Tuesday with no statement, no explanation, no warning. By 6am, forty programs had called his family. By noon, his parents had hired a handler who immediately began screening all contact. By 4pm, his old coach was giving a radio interview about 'respecting a young man's journey.' Nobody knows what actually happened. The handler's first email says he's 'exploring all options with an open mind.' What's your move?",
        choiceA: "Call him directly — not the handler. Use the personal relationship you already have", choiceAOutcome: "Going around the handler directly to the player signals you're not treating this like a transaction. He picks up.", choiceAWeights: W.bold_pos,
        choiceB: "Call the handler professionally — ask for 15 minutes, no pitch", choiceBOutcome: "The professional courtesy earns a scheduled call. The 15 minutes becomes 45. The handler tells him you were different.", choiceBWeights: W.safe_pos,
        choiceC: "Reach out through a mutual connection — find the back channel", choiceCOutcome: "The right intermediary bypasses the noise entirely and gets you a real conversation.", choiceCWeights: W.neutral_up,
        choiceD: "Wait three days — let the circus thin before engaging seriously", choiceDOutcome: "Three days in this market is a week anywhere else. The programs that called first have already had visits.", choiceDWeights: W.risky_neg,
      },
      {
        id: "tr_2",
        scenePrompt: "Pixel art scene: viral sports article on a phone screen reading '[Player Name] to Sign with Rival Program as Early as This Week,' the recruit reading it alone on his bed looking more annoyed than sad, three coaches at separate tables simultaneously reading the same article in horror, a 'Published 4 minutes ago' timestamp.",
        eventText: "A national college baseball reporter publishes '{name} to Sign with [rival program] as Early as This Week' — a story that has been shared 50,000 times and is now in every recruiting newsletter in the country. Three scouts who know his family say the story is completely fabricated. {name}'s handler issued a statement that said 'we have no comment at this time,' which most people are reading as confirmation. The rival program is now intensifying contact. Your relationship is real — but the clock just accelerated.",
        choiceA: "Call him — ask if the story is true, directly and without panic", choiceAOutcome: "The direct, calm question in a moment of chaos reads as confidence. He laughs. He tells you what's actually happening.", choiceAWeights: W.safe_pos,
        choiceB: "Ignore the story entirely — continue your normal relationship without referencing it", choiceBOutcome: "The refusal to react to noise is noticed. He's been watching which programs panic. Yours didn't.", choiceBWeights: W.neutral_up,
        choiceC: "Make a public counter-move — escalate your offer and visibility", choiceCOutcome: "The public escalation either swings the narrative back or creates pressure he didn't want. It depends entirely on his personality.", choiceCWeights: W.high_risk,
      },
      {
        id: "tr_3",
        scenePrompt: "Pixel art scene: phone screen showing a text conversation with a simple message — 'Can we talk tomorrow? Just you and me. No handlers.' — sent at 10:14pm, phone resting face-up on a dark desk, a single notification light blinking, the rest of the room completely dark and still.",
        eventText: "{name} texted you at 10:14pm on a Wednesday. One message: 'Can we talk tomorrow? Just you and me. No handlers.' The handler doesn't know. The rival programs don't know. His family doesn't know. He's given you a window that nobody else has been offered. Tomorrow morning he has a formal commitment meeting with two other schools. He hasn't told you that part — but you know.",
        choiceA: "Call at 7am — be first, be present, and ask him what he actually wants", choiceAOutcome: "The early call cuts through everything scheduled after it. He's direct in a way he hasn't been with anyone else. The conversation changes the math.", choiceAWeights: W.bold_pos,
        choiceB: "Text back simply: 'Of course. I'll be ready whenever you are.' — let him set the terms", choiceBOutcome: "Giving him the control he asked for is exactly the right response. He calls at 6:45. He says: 'I wanted to hear your voice before the day starts.'", choiceBWeights: W.safe_pos,
        choiceC: "Prepare a single, honest pitch — no frills, just the truth about what you can offer", choiceCOutcome: "The preparation for honesty produces the most direct conversation you've had. He responds to clarity the way he hasn't responded to anything else.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  two_sport_athlete: {
    name: "The Two-Sport Athlete",
    description: "He told the football programs he's baseball-only. He told the baseball programs the same thing. He told your assistant coach something different.",
    flavor: "His AAU football coach warned you. 'You should know what you're getting into.'",
    events: [
      {
        id: "ts_1",
        scenePrompt: "Pixel art scene: player standing at a literal fork in a road at dusk, one path lit by a baseball diamond, the other by a football stadium's glow, a phone in his hand with two different coaches' texts both reading 'call me when you're ready,' an AAU football coach's truck parked at the edge of the frame watching.",
        eventText: "{name} is a 4.2-grade linebacker and hits .380 with 109 mph exit velocity. He told the Power Five football programs he's baseball-only. He told the baseball programs the same. He told your assistant coach at a private dinner last week that he's 'still figuring it out.' His AAU football coach called you unprompted: 'I just want you to know what you're getting into. He loves football. He might love it more. I'm not saying don't recruit him. I'm saying be careful.'",
        choiceA: "Be honest with him — tell him you heard the football coach and still want him for baseball", choiceAOutcome: "The radical transparency about what you know is something no other program has tried. He respects it enormously.", choiceAWeights: W.bold_pos,
        choiceB: "Focus the conversation entirely on baseball development — make the vision compelling enough to settle the question", choiceBOutcome: "The clarity of the baseball path laid out in specific, exciting terms makes the choice feel easier than he expected.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a player who made the same choice and never looked back", choiceCOutcome: "The peer testimony of someone who chose baseball over football and has no regrets is the most persuasive story available.", choiceCWeights: W.neutral_up,
        choiceD: "Offer flexibility — structure a commitment that leaves the football door open for one more semester", choiceDOutcome: "The flexibility either wins him or locks in the indecision that was already the problem. High variance.", choiceDWeights: W.high_risk,
      },
      {
        id: "ts_2",
        scenePrompt: "Pixel art scene: ESPN feature segment playing on a TV screen showing the player in a football helmet, baseball mentioned only in a scrolling footnote at the bottom, the player watching the segment alone in his room looking uncomfortable, phone in hand, unsent text to a baseball coach glowing on the screen.",
        eventText: "ESPN ran a full feature on {name}. It was about football. Baseball was mentioned once, in a scrolling chyron. He texted you that night — the first time he's ever initiated contact — and wrote: 'I didn't love how that came out. Can we talk?' He's never called first. You don't know if this is the moment or a moment. But he called first.",
        choiceA: "Call him immediately — tonight, not tomorrow", choiceAOutcome: "The immediate response to a first-time outreach is the answer to the question he was actually asking: 'Do you care?'", choiceAWeights: W.bold_pos,
        choiceB: "Text back: 'Of course. Tomorrow morning, whenever you're up.' — give him space to set the terms", choiceBOutcome: "Letting him control the timing of a conversation he initiated shows respect for his pace. He calls at 7am.", choiceBWeights: W.risky_neg,
        choiceC: "Respond warmly but wait for him to schedule it — don't pounce on the opening", choiceCOutcome: "The measured response is respectful. The conversation happens on his terms and goes deeper than expected.", choiceCWeights: W.safe_pos,
      },
      {
        id: "ts_3",
        scenePrompt: "Pixel art scene: football coach's office, a college football program banner on the wall, the recruit sitting across from his longtime football coach — the man who recruited him, mentored him — the coach's desk cleared of everything except one document, the player's phone face-down in his lap, a baseball hat barely visible in his jacket pocket.",
        eventText: "{name}'s football coach called a private meeting. Nobody outside the two of them knows what was said. What happened after: {name} texted you within the hour. The message was two lines: 'I've made my decision. Baseball. I need you to trust that I'm sure.' He didn't tell you what was said in that room. He didn't owe you that. He offered you the outcome instead.",
        choiceA: "Tell him you trust him and ask one thing: what he needs from you right now", choiceAOutcome: "The immediate pivot to 'what do you need' before anything about your program signals that you understand what he actually went through.", choiceAWeights: W.bold_pos,
        choiceB: "Accept without any questions — confirm the offer and welcome him", choiceBOutcome: "Taking the decision at face value without requiring explanation is a form of respect he didn't know he needed until it arrived.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him to take 24 hours — make sure the decision holds after a night's sleep", choiceCOutcome: "The brief check shows care rather than desperation. He calls back in eight hours, more certain than before.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  knuckleball_specialist: {
    name: "The Knuckleball Artist",
    description: "Five catchers have refused to warm him up. He went 9-0 last season. Nobody knows what to do.",
    flavor: "Two MLB scouts left his start without filing reports. They said they didn't know what they'd witnessed.",
    events: [
      {
        id: "kb_1",
        scenePrompt: "Pixel art scene: knuckleball leaving a pitcher's fingertips mid-delivery, the ball rendered in slow motion showing no spin whatsoever, three batters frozen in baffled stances with one of them's helmet knocked sideways by a swing that missed by a foot, the catcher 15 feet behind the plate looking at his glove with confusion.",
        eventText: "Five catchers have refused to warm up {name} mid-session — just stood up and walked off the field — because his knuckleball is too unpredictable to catch safely. He's never thrown a fastball above 68 mph. His ERA last season was 0.84. He went 9-0 with a complete game shutout in the regional final. Every traditional pitching metric says he shouldn't exist. Every actual result says otherwise. No one knows what to do with him.",
        choiceA: "Embrace it completely — recruit him specifically because he's unreplicable", choiceAOutcome: "Committing fully to his style instead of hedging sends a message no other program will send. He's been waiting for it.", choiceAWeights: W.high_risk,
        choiceB: "Connect him with a knuckleball pitcher who played at the professional level", choiceBOutcome: "Expert mentorship on this rare craft — from someone who's actually lived it — transforms his development trajectory.", choiceBWeights: W.neutral_up,
        choiceC: "Offer him the freedom to develop without the pressure of secondary pitch development", choiceCOutcome: "The promise of not being 'fixed' is the most valuable thing you can offer. He's been waiting for a program that gets it.", choiceCWeights: W.bold_pos,
        choiceD: "Ask him to develop a secondary pitch before committing — protect yourself from the risk", choiceDOutcome: "The request to add a pitch he doesn't need reads as 'we don't actually understand you.' He crosses you off the list that afternoon.", choiceDWeights: W.risky_neg,
      },
      {
        id: "kb_2",
        scenePrompt: "Pixel art scene: packed stadium scoreboard showing 14 strikeouts in 7 innings, two suits walking out of the stadium early with hands raised in 'I give up' gestures while everyone else watches in stunned silence, the pitcher on the mound standing alone in a golden spotlight looking at his own fingertips.",
        eventText: "Against the third-ranked team in the state, {name} threw 7 innings, 0 runs, 14 strikeouts. Two MLB scouts left in the 6th inning without filing reports — one of them told a colleague in the parking lot: 'I genuinely don't know what to write.' A third scout called the Commissioner of Baseball from the parking lot. He later said he wasn't sure why. 'Felt like the right move.' Whatever this is, it's real.",
        choiceA: "Be the program that publicly champions what everyone else is afraid to understand", choiceAOutcome: "The public belief in something that confuses the industry makes you into a story — and him into a legend in the making.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out to MLB teams quietly — ask if there's a professional development interest", choiceBOutcome: "Showing a professional pipeline for his specific gift is the most exciting thing you can offer a pitcher no one has a template for.", choiceBWeights: W.cautious,
        choiceC: "Make the offer and let the results speak — stop analyzing and just commit", choiceCOutcome: "The offer without caveats or qualifiers is what a 9-0 pitcher with a 0.84 ERA deserves. He accepts before the call ends.", choiceCWeights: W.bold_pos,
      },
      {
        id: "kb_3",
        scenePrompt: "Pixel art scene: high school pitching coach's office, a new coach sitting at a desk that used to belong to someone else, the knuckleball pitcher standing in the doorway with a bag over his shoulder looking at a whiteboard covered in conventional pitching diagrams, a knuckleball grip diagram in a frame on the wall behind him — the only thing not erased.",
        eventText: "The high school coach who built {name}'s entire development around the knuckleball retired in December. The new coach held a team meeting in January and said the words: 'We're running a conventional program now.' {name} is 17, his identity is the knuckleball, and the one adult who understood what he was doing just left the building. He called you the night of the meeting. He didn't say much. Neither did you. But he stayed on the phone for 45 minutes.",
        choiceA: "Offer your pitching staff as his new development home — make the program the place the knuckleball gets built", choiceAOutcome: "Positioning your staff as the successor to his mentor fills the gap in a way no other program can claim. He commits before the spring.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with a professional knuckleball pitcher — give him a mentor the new coach can't take away", choiceBOutcome: "The external mentor transforms his development from program-dependent to pitcher-owned. He sees a future that doesn't require anyone's permission.", choiceBWeights: W.safe_pos,
        choiceC: "Invite him to your campus to throw — let him feel what it's like to be surrounded by coaches who don't flinch", choiceCOutcome: "The visit is the first time he's thrown the knuckleball for coaches who leaned in instead of looking away. He cries in the parking lot after.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  rivalry_recruit: {
    name: "The Rivalry Flashpoint",
    description: "He grew up wearing your rival's gear. His father played there. He's taken three private visits to your campus and told no one.",
    flavor: "The rival program just found out. Their head coach drove to his high school himself. The internet found out that, too.",
    events: [
      {
        id: "rr_1",
        scenePrompt: "Pixel art scene: recruit walking through an unfamiliar campus at dawn, rival program's gear half-hidden under a jacket, three private visit stickers in different school colors in his bag, a hand-written note to himself visible: 'Don't tell anyone yet,' rival program's banners visible through a campus window in the distance.",
        eventText: "{name} grew up in your rival's city. Wore their gear as a kid. His father played there for three years. He has taken three secret private visits to your program — told no one, not his coach, not his parents, not the rival's staff. Then your rival's lead recruiter called you: 'We know about the visits. We will make sure he doesn't come.' It wasn't a question.",
        choiceA: "Call {name} immediately — tell him what just happened and ask what he actually wants", choiceAOutcome: "The honesty about the call, delivered directly to him, gives him information no one else would share. It changes the dynamic.", choiceAWeights: W.bold_pos,
        choiceB: "Say nothing about the call — let the relationship develop without the political noise", choiceBOutcome: "Keeping the conversation about baseball and not the rivalry builds a foundation that isn't based on competition.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a player who came from rival territory and thrived here", choiceCOutcome: "The proof that the transition is survivable — told by someone who did it — is more powerful than anything you say.", choiceCWeights: W.neutral_up,
        choiceD: "Lean into it — make him feel like landing here would mean something historic", choiceDOutcome: "The 'be a legend' narrative either ignites him or adds pressure he didn't want. He's already carrying enough.", choiceDWeights: W.high_risk,
      },
      {
        id: "rr_2",
        scenePrompt: "Pixel art scene: rival head coach's car visible in a high school parking lot mid-afternoon, student-athletes watching from windows, a viral tweet on someone's phone showing a photo of the car, the recruit watching from a second floor window alone, rival program flags visible in a duffel bag at his feet in his room.",
        eventText: "The rival program's head coach drove to {name}'s high school unannounced. Someone photographed the car. The photo went viral by 3pm. By 5pm both fan bases were arguing about it online. By 7pm {name} had received 200 messages from strangers telling him what to do. He hasn't posted anything. He hasn't said anything. He texted you one word: 'Chaos.'",
        choiceA: "Text back two words: 'We're steady.' Nothing else.", choiceAOutcome: "Two words in 200 messages of noise. He reads it five times. He tells his mother what you said. She calls you.", choiceAWeights: W.bold_pos,
        choiceB: "Call and ask how he's doing — not about the decision, about him", choiceBOutcome: "Being the coach who asks about the person in the middle of the storm is what separates you from everyone screaming about baseball.", choiceBWeights: W.safe_pos,
        choiceC: "Invite him for a quiet visit this week — get him out of the noise and into a real environment", choiceCOutcome: "The visit away from the chaos provides perspective that no phone call can deliver.", choiceCWeights: W.neutral_up,
      },
      {
        id: "rr_3",
        scenePrompt: "Pixel art scene: commitment announcement in a home living room — family gathered around a table, rival team's pennant visible on the wall, the recruit reaching forward to flip it face-down before placing a new pennant from your program in its place, his father's expression unreadable, his mother already crying, the player's face showing the calm of someone who has already made peace with the weight of this.",
        eventText: "{name} told you last night. He's choosing your program. He grew up in their city, wore their gear, his father played there — and he's choosing you. He says he needs one thing from you before he announces: 'Don't make me into a story about them. Let me be a story about you.' He's been carrying this for three months. He's about to face the fallout. He just needs to know you see who he actually is.",
        choiceA: "Tell him exactly who you see — not the rivalry, not the story — just him", choiceAOutcome: "The answer that has nothing to do with the rivalry is the one he needed. He hangs up, makes the call to his father, and sleeps for the first time in two weeks.", choiceAWeights: W.bold_pos,
        choiceB: "Promise to stand beside him publicly when the reaction comes — he won't face it alone", choiceBOutcome: "The commitment to show up in the storm is the thing he didn't know to ask for. Knowing you'll be there changes the weight of the decision.", choiceBWeights: W.safe_pos,
        choiceC: "Keep it quiet as long as he needs — give him full control of the timeline", choiceCOutcome: "The control over his own story is the gift no other program thought to offer. He uses it wisely. When he announces, it's on his terms.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  // ─── Five Distinct Legendary Storyline Templates ─────────────────────────────
  the_phenom: {
    name: "The Phenom",
    description: "The story broke wrong. He's narrowed to two schools. Yours is one. And he's been completely silent for 72 hours.",
    flavor: "A scout who has seen exactly one player like this in 38 years. The other one is in the Hall of Fame.",
    events: [
      {
        id: "ph_1",
        scenePrompt: "Pixel art scene: 6am breaking news alert on every screen in a coach's office — incorrect story that the recruit has already committed — 40 other coaches frantically calling simultaneously, the recruit himself sitting in his kitchen with no phone visible, completely unaware, eating cereal.",
        eventText: "Word came through back channels that {name} had narrowed to two schools — yours and a rival. The next morning at 5:58am, a national outlet broke the story — and got it wrong. They said he'd already committed to the rival. The story has been shared 80,000 times. {name} has not posted. His family isn't answering calls. His coach says he's 'unavailable.' You have a relationship — but everyone in the country is flooding that same relationship right now.",
        choiceA: "Don't call. Write a handwritten note. Mail it today — analog in a digital catastrophe", choiceAOutcome: "The letter arrives two days later. By then, the storm has passed. He reads it alone. It's the only thing that felt like a person wrote it.", choiceAWeights: W.bold_pos,
        choiceB: "Contact his high school coach directly — the one relationship that hasn't been flooded", choiceBOutcome: "The coach has access that nobody else does right now. He passes along your message. A call is scheduled for that evening.", choiceBWeights: W.safe_pos,
        choiceC: "Wait 24 hours and call when the noise has dropped — lead with calm, not urgency", choiceCOutcome: "Your composure in the chaos is exactly what he's been looking for. When you do call, you're the only person who doesn't seem panicked.", choiceCWeights: W.neutral_up,
        choiceD: "Make a public statement correcting the record and reaffirming your offer", choiceDOutcome: "The public statement gets coverage — and adds more noise to a situation he was already drowning in. He doesn't appreciate it.", choiceDWeights: W.high_risk,
      },
      {
        id: "ph_2",
        scenePrompt: "Pixel art scene: elderly scout in stadium bleachers at sunset with binoculars and a jaw that won't close, a coaching staff member beside him frozen mid-sentence, the player on the field far below doing something that has no name yet, the whole stadium holding still.",
        eventText: "A scout who has been doing this for 38 years pulls you aside after a {name} workout and says very quietly: 'I've seen exactly one player like this in my entire career. The other one is in the Hall of Fame.' He says it once, packs up his radar gun, and leaves without writing anything down. {name} is choosing between five programs at the end of this week. You have one more scheduled conversation.",
        choiceA: "Lead with development — your specific plan for how a talent like his becomes a professional", choiceAOutcome: "The detailed, specific developmental roadmap lands as the most credible thing he's heard. It's not a promise — it's a plan.", choiceAWeights: W.bold_pos,
        choiceB: "Lead with culture — let your current players speak for what it means to be here", choiceBOutcome: "Peer testimony from players he already respects carries more weight than anything a coach can say. The call goes long.", choiceBWeights: W.safe_pos,
        choiceC: "Lead with legacy — ask him what he wants people to say about his time in college baseball", choiceCOutcome: "The question nobody else asked turns into a 90-minute conversation. He calls you back the next morning.", choiceCWeights: W.neutral_up,
      },
      {
        id: "ph_3",
        scenePrompt: "Pixel art scene: commitment day — two school pennants on a table, a clock on the wall showing 58 minutes remaining, a mother on the phone with a coach, hands trembling slightly, the rest of the family watching her face for the answer.",
        eventText: "Commitment day. {name} has narrowed to two schools — yours and the rival. His mother calls with 58 minutes left. Her voice is steady. She says: 'Every coach has told us about their program. Tell me something no coach has said. About my son.' There's no prepared answer for this. Whatever you say next is the real closing argument.",
        choiceA: "Tell her one specific thing you noticed about him that had nothing to do with baseball", choiceAOutcome: "The observation that transcends the sport — the human thing you saw — is the thing she carries out of the call. He commits.", choiceAWeights: W.bold_pos,
        choiceB: "Tell her about a player you coached through something hard — and what happened next", choiceBOutcome: "The specific story of how you show up when it isn't easy is the answer to the question she was actually asking.", choiceBWeights: W.safe_pos,
        choiceC: "Tell her honestly what you don't know and how you'd face that together", choiceCOutcome: "The admission of uncertainty from a head coach is so rare it's disarming. She says: 'Okay. I believe you.' The call ends.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_collapse: {
    name: "The Collapse",
    description: "He was the #1 recruit in his region. Then something happened. No one knows exactly what.",
    flavor: "Two coaches who know his family called you separately and said the same thing: 'Someone needs to show up. Not call. Show up.'",
    events: [
      {
        id: "tc_1",
        scenePrompt: "Pixel art scene: a faded #1 ranking board with the player's name at the top but crossed out in shadow, the player's old program logo on the wall behind him distancing itself, whispers rendered as dark silhouettes leaning toward each other, the recruit sitting alone in a dugout corner while the world debates what happened to him.",
        eventText: "{name} was the consensus #1 recruit in his region six months ago. Then something happened. His old program went completely silent. His ranking evaporated. He stopped showing up at showcases. No statement, no explanation, nothing. Rumors are everywhere and none of them agree. Two coaches who know his family have called you separately — neither one knew the other called — and both said exactly the same thing: 'Someone needs to show up. Not call. Show up.'",
        choiceA: "Drive to his town — show up at a game, no announcement, no agenda", choiceAOutcome: "You are the only coach who appeared in person. His family sees you in the third row. Nothing is said. Everything is communicated.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out through a trusted mutual connection — find the right door first", choiceBOutcome: "The right intermediary provides access and context that no cold contact can earn. The conversation that follows is honest.", choiceBWeights: W.neutral_up,
        choiceC: "Watch from a distance — monitor before risking a misstep", choiceCOutcome: "Cautious observation avoids mistakes but also avoids the relationship. Others who showed up are now the ones he calls.", choiceCWeights: W.cautious,
        choiceD: "Pull back entirely — the uncertainty is too great for a scholarship commitment right now", choiceDOutcome: "Pulling back in someone's worst moment is a decision he will remember exactly. So will the coaches who didn't.", choiceDWeights: W.risky_neg,
      },
      {
        id: "tc_2",
        scenePrompt: "Pixel art scene: player and coach in a dim locker room, single lamp overhead, amber light on both of them, no one else present, the player mid-sentence with the look of someone who has never said this out loud before, the coach completely still and listening.",
        eventText: "{name} finally talks to you. Not about baseball. About what actually happened. It takes an hour. When he's done, he's quiet for a moment, and then he says: 'Every program that's still recruiting me is doing it because they think I'll bounce back. I need someone who'd still be here if I don't.' It's the most honest thing a recruit has ever said to you. The coaches who backed off are now calling again because his numbers are improving.",
        choiceA: "Tell him directly: 'I was here before the numbers came back. That doesn't change.'", choiceAOutcome: "The statement requires no elaboration. He knew whether it was true before you said it. Hearing you say it out loud matters.", choiceAWeights: W.bold_pos,
        choiceB: "Offer something concrete — a support structure that exists regardless of performance", choiceBOutcome: "Translating the words into a real plan is what separates care from performance. He can feel the difference.", choiceBWeights: W.safe_pos,
        choiceC: "Be honest about the uncertainty — and stay in it with him rather than resolving it artificially", choiceCOutcome: "Refusing to tie it up neatly is the most human response. He says: 'You're the first person who didn't try to fix me.'", choiceCWeights: W.neutral_up,
      },
      {
        id: "tc_3",
        scenePrompt: "Pixel art scene: player back on the field, scoreboard showing real numbers, former doubters visible as shadowy figures returning to the outfield fence, one coach's phone lighting up with a text from a rival school saying 'we want back in,' the player visible on the mound or at the plate, light breaking behind the stadium.",
        eventText: "{name} is back on the field. His numbers are trending up. His grades are recovering. The programs that distanced themselves are now calling again — the same ones that didn't return his father's calls three months ago. He told you last week: 'You were the only one who didn't ghost me.' He's ready to make a decision. You are the obvious choice. But he's going to make you close anyway, because he's earned the right to.",
        choiceA: "Reference a specific moment from the hard period — show him you were paying attention", choiceAOutcome: "Naming a specific detail from the darkness shows him you were present in ways he didn't know. The relationship is permanent.", choiceAWeights: W.bold_pos,
        choiceB: "Ask him what he wants this next chapter to look like — let him define it", choiceBOutcome: "Giving him total authorship of the vision after a period when everything was out of his control is the most powerful gift.", choiceBWeights: W.safe_pos,
        choiceC: "Make the offer now — no conditions, no qualifiers, no asterisks", choiceCOutcome: "The unconditional offer is the last thing he needs to hear. He says yes before you've finished the sentence.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_two_sport_icon: {
    name: "The Two-Sport Icon",
    description: "An NFL GM flew to his high school game. He has an agent at 17. You have a meeting Thursday. ESPN also arrives Thursday.",
    flavor: "He told you he's choosing baseball. He hasn't told his agent yet. Or his football coaches. He's telling you first.",
    events: [
      {
        id: "tsi_1",
        scenePrompt: "Pixel art scene: private jet on a high school airstrip behind the outfield fence, NFL logo subtly visible on the tail, two contracts glowing on a desk in an office visible through a window, a 17-year-old warming up on the field unaware of the jet, ESPN news van just arriving in the parking lot.",
        eventText: "An NFL general manager flew to {name}'s high school game on a private jet — announced nothing, just showed up. {name} has a certified agent at 17. He is projected as a top-15 NFL pick and a top-5 MLB Draft pick by two separate outlets. ESPN is arriving Thursday. You also have a meeting scheduled Thursday — the one you arranged three weeks ago, before any of this. You have one hour with him before the cameras arrive.",
        choiceA: "Lead with the baseball path — specific, credible, and built around who he actually is as a player", choiceAOutcome: "The specificity of the baseball development vision cuts through the noise of abstract football projections. He was waiting for this conversation.", choiceAWeights: W.bold_pos,
        choiceB: "Lead with health and longevity — frame baseball as the sport that gives him the most years", choiceBOutcome: "The durability argument, framed around his body and his future in a sport where careers run longer, lands unexpectedly well.", choiceBWeights: W.safe_pos,
        choiceC: "Lead with identity — ask him which sport he thinks about when he wakes up at 3am", choiceCOutcome: "The question nobody else thought to ask opens a conversation that has nothing to do with contracts. He answers immediately.", choiceCWeights: W.neutral_up,
        choiceD: "Offer maximum flexibility — make baseball as low-commitment as possible to reduce friction", choiceDOutcome: "The flexibility offer reads as uncertainty about your own sport. He was looking for conviction. You showed him options instead.", choiceDWeights: W.high_risk,
      },
      {
        id: "tsi_2",
        scenePrompt: "Pixel art scene: national radio show graphic on a screen with the football coach's quote visible — 'baseball would waste a generational football talent' — the player alone in his room looking at an old photo of himself at age 7 in a baseball uniform with an older man, phone on the nightstand with notification light blinking, the photo just posted on his Instagram with no caption.",
        eventText: "{name}'s football coach went on national radio and said baseball would 'waste a generational football talent.' The quote went everywhere. At his next game, rival fans held up signs about it. He didn't respond publicly. That night he posted on Instagram a photo of himself at age 7 in a baseball uniform with his grandfather. No caption. Just the photo. 47,000 people liked it in two hours. His grandfather passed away four years ago.",
        choiceA: "Recognize the post for what it is — reach out about the grandfather, not about baseball", choiceAOutcome: "The call that begins 'I saw the photo' — not 'I saw the quote' — lands in a completely different part of him.", choiceAWeights: W.bold_pos,
        choiceB: "Stay completely above the football coach drama — don't acknowledge it at all", choiceBOutcome: "Your silence on the controversy reads as maturity. He's had enough people piling on. Your calm is conspicuous.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him privately what he wanted people to understand with the photo", choiceCOutcome: "The question gives him space to articulate something he couldn't say out loud. The answer changes your relationship.", choiceCWeights: W.neutral_up,
      },
      {
        id: "tsi_3",
        scenePrompt: "Pixel art scene: pre-dawn phone call in a quiet room, player's face lit only by the phone screen, a handwritten note in front of him with 'baseball' circled twice and underlined, an agent's business card face-down on the desk beside him, the coach's voice the only sound in the room.",
        eventText: "{name} calls you at 6am. Before you can say anything, he says: 'I've decided. Baseball. Your program.' He says your program was the only one that made him feel like a baseball player and not a contract negotiation. Then he says: 'I haven't told my agent yet. Or my football coaches. I'm telling you first.' He pauses. 'I need you to not make a big deal about this right now.'",
        choiceA: "Say: 'We'll make this as quiet as you need it to be. Welcome.' Nothing more.", choiceAOutcome: "The restraint in the moment he asked for restraint is the final proof that you were the right call. He sighs with relief.", choiceAWeights: W.safe_pos,
        choiceB: "Tell him you're honored to be first and ask what he needs from you right now", choiceBOutcome: "Turning it immediately into 'what do you need' signals that the relationship is already about him, not the announcement.", choiceBWeights: W.bold_pos,
        choiceC: "Share with him briefly what this means for the program — give him context for what he's choosing", choiceCOutcome: "The honest picture of what his decision means — without pressure — gives him something concrete to hold as he faces the calls ahead.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_scientist: {
    name: "The Scientist",
    description: "He sent a 14-page program audit before you had a chance to reach out. He rated your pitching infrastructure 4.2 out of 10.",
    flavor: "The postscript read: 'I am still interested. I believe these gaps are fixable. Prove it.'",
    events: [
      {
        id: "sci_1",
        scenePrompt: "Pixel art scene: coaching staff around a conference table staring at a 14-page printed report with charts and annotated Statcast citations, one coach's coffee getting cold, a sticky note on the front cover reading 'Preliminary Program Assessment — [School Name],' the last page visible with a postscript in a slightly different font that reads 'I am still interested.'",
        eventText: "Before your program had reached out, {name} sent a 14-page PDF with the subject line: 'Preliminary Program Assessment.' It contains annotated Statcast citations, spin rate development comparisons across eight programs, and three specific gaps in your pitching infrastructure — each rated with a numerical severity score. Your program was rated 4.2 out of 10 in pitching development. The postscript, in a slightly different font, reads: 'I am still interested. I believe these gaps are fixable. Prove it.' He's 17.",
        choiceA: "Build a counter-response — answer the document with your own data, point by point", choiceAOutcome: "Meeting the audit with equal rigor signals a program that respects intelligence as a form of athleticism. He reads your response three times.", choiceAWeights: W.bold_pos,
        choiceB: "Schedule a meeting with your analytics staff — let the numbers people meet the numbers person", choiceBOutcome: "The room of data-minded coaches and analysts is exactly the environment he was looking for. The 90-minute meeting runs three hours.", choiceBWeights: W.safe_pos,
        choiceC: "Acknowledge the gaps directly — tell him what you're doing to address each one", choiceCOutcome: "Intellectual honesty under audit builds faster trust than defensiveness. He annotates your response in green instead of red.", choiceCWeights: W.neutral_up,
        choiceD: "Call his coach — a recruit auditing a program before being contacted is unusual enough to warrant a conversation", choiceDOutcome: "His coach tells you: 'That's just how he is. He did this to seven programs. The three who called me didn't get a second email.' You're one of the three now.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sci_2",
        scenePrompt: "Pixel art scene: laptop screen showing a color-coded pre-call agenda with timestamps, topics like 'Spin Rate Development Philosophy (12 min)' and 'Exit Velocity Improvement Rate by Position, 5 years (18 min),' a coach's chair positioned in front of an empty call screen, the call timer already running, a sticky note reading 'Analytics coach is at wedding.'",
        eventText: "{name} has sent a pre-call agenda for your 90-minute scheduled conversation. It is color-coded. It is time-stamped. Topics include 'Spin Rate Development Philosophy,' 'Exit Velocity Improvement Rate by Position over 5 Years,' and 'Program Culture as a Data Variable.' Your analytics coach is at a wedding in Savannah and unreachable. The call starts in 11 minutes.",
        choiceA: "Take the call yourself — be transparent about what you know and what you don't", choiceAOutcome: "Intellectual humility from a head coach, in real time, is the rarest thing a scientist encounters. He respects it more than expertise.", choiceAWeights: W.bold_pos,
        choiceB: "Reschedule — you need the right people on this call, and 'winging it' would be an insult to the agenda", choiceBOutcome: "The willingness to delay rather than perform impresses him. 'Most coaches would have just faked it,' he tells his mother afterward.", choiceBWeights: W.safe_pos,
        choiceC: "Send a pre-call response addressing the agenda topics with current data — buy yourself preparation time", choiceCOutcome: "The data response before the call signals a program that takes the conversation seriously enough to prepare for it properly.", choiceCWeights: W.neutral_up,
      },
      {
        id: "sci_3",
        scenePrompt: "Pixel art scene: whiteboard with three school names and annotated data columns below each, a pen hovering over one of them, the room empty and quiet except for a single overhead light, the pen's shadow falling across the other two names as it moves decisively toward the third.",
        eventText: "{name} has completed his analysis. He's chosen three finalists. Your program is one of them. His final question — sent to all three by email, at the same time, timestamped 9:14am — reads: 'What is one decision you would make differently about your program if you had access to perfect information from the beginning? I am not looking for a strategic answer. I am looking for an honest one.' Two other programs have already responded. He's shared their answers with you, without naming them. One was political. One hung up.",
        choiceA: "Name a real decision you'd change — a specific one, with the actual reasoning", choiceAOutcome: "The willingness to name a real mistake, in writing, with the actual reasoning, is the highest form of intellectual honesty. He writes back one word: 'Perfect.'", choiceAWeights: W.bold_pos,
        choiceB: "Turn it back to him — ask what his model would change about your program, and engage with the answer", choiceBOutcome: "Making his analysis part of the actual program conversation transforms the relationship from evaluation to collaboration. He wasn't expecting that.", choiceBWeights: W.neutral_up,
        choiceC: "Describe your current data infrastructure and how you're actively evolving it right now", choiceCOutcome: "Showing the in-progress work — not the finished product — is what he was actually asking to see. He ranks your answer first.", choiceCWeights: W.safe_pos,
      },
    ],
  },

  folk_hero: {
    name: "The Folk Hero",
    description: "A town of 600 people. His games draw 4,000. He's been offered a TV deal. He asks every school the same question.",
    flavor: "'If I come here, will I have to change who I am?' He's asked every program. Most gave political answers.",
    events: [
      {
        id: "fh_1",
        scenePrompt: "Pixel art scene: tiny rural ballpark packed beyond capacity, fans on truck beds and tailgates visible behind the outfield fence, a TV news satellite truck parked on main street, the player on the mound or at the plate completely at home in the chaos, a college coach sitting alone in wooden bleachers that creak, completely out of his element.",
        eventText: "{name} plays for a town of 600 people. His games draw 4,000. Local TV has done eleven features. He's been approached about a regional TV deal. He's never been to a city with a subway system. He's asked every program the same question at the start of every recruiting conversation: 'If I come here, will I have to change who I am?' Most coaches pivoted to talking about their facilities. He crossed them off the list immediately.",
        choiceA: "Go to his town — attend a game in those wooden bleachers, walk main street, just be there", choiceAOutcome: "Showing up in his world instead of inviting him to yours sends a message that no zoom call or campus visit can replicate.", choiceAWeights: W.bold_pos,
        choiceB: "Answer his question directly and honestly — even if the honest answer is complicated", choiceBOutcome: "The direct answer — including the complicated parts — is the first honest response he's received from a college program. He calls his mother immediately after.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a current player who came from a small town and found their footing", choiceCOutcome: "The peer story of someone who made the transition without losing themselves is the most persuasive evidence available.", choiceCWeights: W.neutral_up,
        choiceD: "Lead with the academic and economic opportunity — show how the education changes his family's trajectory", choiceDOutcome: "The family angle resonates. He hasn't thought about what a college degree does for his parents. He's quiet for a long time after.", choiceDWeights: W.neutral_up,
      },
      {
        id: "fh_2",
        scenePrompt: "Pixel art scene: national TV satellite trucks filling the street outside a small-town home, neighbors watching from their porches and yards, the recruit standing in the front doorway looking at the circus that arrived overnight, a hand-written sign in someone's yard that reads 'Stay Home,' a coach's car parked two blocks away watching from a distance.",
        eventText: "A national outlet ran a cover story on {name} this week. He woke up to satellite trucks outside his house. Sixty programs that had never called are now calling. He texted you — not the other coaches, you — and said: 'I don't want this. I just want to play ball. I'm not performing for anybody. Can we talk like normal people?' He's never described any other conversation as 'like normal people' before.",
        choiceA: "Call him back immediately and say four words: 'I know. I'm listening.'", choiceAOutcome: "The four words without an agenda are the exact opposite of every other call he's taking. He talks for an hour. You mostly listen.", choiceAWeights: W.bold_pos,
        choiceB: "Invite him for a quiet private visit — no media, no fanfare, no event around it", choiceBOutcome: "The quiet visit is the demonstration that your program understands what he was asking for. The visit goes long.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him what 'normal' means to him in this context — let him define what he needs", choiceCOutcome: "The question before the offer turns out to be more powerful than the offer itself. He knows you're actually listening.", choiceCWeights: W.neutral_up,
      },
      {
        id: "fh_3",
        scenePrompt: "Pixel art scene: commitment announcement in a high school gymnasium with the bleachers overflowing — 800 people crammed in, another hundred watching through gym windows from outside — the player at a podium with tears visible, 600 members of his community behind him, a coach in the corner barely visible, also crying.",
        eventText: "{name} announces his commitment in his high school gymnasium. The room holds 400. 800 people show up. Another hundred watch through the windows from outside. He stands at the podium for a long moment before speaking, looks directly at you in the corner of the room, and says: 'I picked the school that felt like home.' The town erupts. You realize you've gained not just a player — but a story that will travel with your program for a generation.",
        choiceA: "Invite the town — arrange for his community to visit your campus early in the season", choiceAOutcome: "Bringing his world into yours is an act of respect that defines the relationship permanently. He talks about it every time someone asks why he chose your school.", choiceAWeights: W.bold_pos,
        choiceB: "Give him the platform — let him represent where he came from in everything your program does", choiceBOutcome: "Making him an ambassador for his own story gives him something bigger than baseball to carry. He thrives.", choiceBWeights: W.safe_pos,
        choiceC: "Keep it quiet — let the baseball speak for itself, the way he's always preferred", choiceCOutcome: "Respecting the preference for substance over performance is how you keep the trust you worked so hard to earn.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  generational_prodigy: {
    name: "The Generational Prodigy",
    description: "He has a manager, a nutritionist, and a documentary crew. He's 17. He's been texting your assistant coach at midnight.",
    flavor: "They're projecting him as a top-3 MLB Draft pick after one year. He called you the morning it published to talk about your pitching staff.",
    events: [
      {
        id: "gp_1",
        scenePrompt: "Pixel art scene: 17-year-old in a dugout surrounded by a documentary camera crew, a nutritionist with a food container, and a manager on the phone — all of them there for him, none of them him — the player himself staring at the field with an expression of complete exhaustion, a Baseball America cover with his face visible in someone's hand in the background.",
        eventText: "{name} has a manager — not an agent, a manager — who has an LLC. He has a nutritionist, a documentary crew that has been following him for fourteen months, and a social media strategist who is not him. He was on the cover of Baseball America before he graduated high school. He is 17. Your assistant coach told you this morning that {name} has been texting him at midnight asking questions about your program's pitching philosophy. Not the manager. Him.",
        choiceA: "Text him back directly — cut through every intermediary and talk to the actual person", choiceAOutcome: "Going straight to the player, not the manager, is something no other program has done. He texts back in four minutes.", choiceAWeights: W.bold_pos,
        choiceB: "Win the family first — the parents are overwhelmed too and nobody is taking care of them", choiceBOutcome: "The family relationship is the foundation that the manager can't displace. His mother tells him what you said about her.", choiceBWeights: W.safe_pos,
        choiceC: "Offer a sanctuary — pitch your program as the place where he can be a baseball player, not a brand", choiceCOutcome: "The specific framing of 'just being a baseball player' is something nobody in his orbit has offered him. He's been waiting for it.", choiceCWeights: W.neutral_up,
        choiceD: "Back away — the infrastructure around him is too complex and the risk of misalignment is too high", choiceDOutcome: "The withdrawal is noted by his camp. They cross you off a list that had 60 names. Three weeks later, he becomes what everyone said he would.", choiceDWeights: W.risky_neg,
      },
      {
        id: "gp_2",
        scenePrompt: "Pixel art scene: national newspaper front page projected on a wall showing 'Top-3 MLB Draft Pick After One Year of College' with {name}'s photo, the player himself on the phone with a coach at 7am ignoring the article on his desk, the documentary crew in the background filming him ignoring it, manager visible through a glass wall looking unhappy about the call.",
        eventText: "A national outlet projects {name} as a top-3 MLB Draft pick after one year of college. He calls you the morning it publishes — before your coffee — and says: 'I don't want to talk about that. Can we talk about your program instead?' You don't know if it's a test. You don't know if he's performing indifference. You do know that he called you at 7am and his manager doesn't know about the call.",
        choiceA: "Follow his lead — talk about the program exactly as asked, without referencing the article at all", choiceAOutcome: "Respecting what he asked for, exactly, in a world where everyone ignores what he asks for, is the most powerful possible response.", choiceAWeights: W.bold_pos,
        choiceB: "Acknowledge the article once, honestly, then move to the program conversation he asked for", choiceBOutcome: "The brief honesty before moving on shows you won't pretend reality doesn't exist — but you also won't dwell where he doesn't want to go.", choiceBWeights: W.safe_pos,
        choiceC: "Build a one-year plan — show him specifically how your program maximizes a one-year showcase", choiceCOutcome: "The concrete one-year plan signals you understand and support his professional trajectory without pretending it's anything else.", choiceCWeights: W.neutral_up,
        choiceD: "Make the biggest NIL offer in your program's history — show him you understand what he's worth", choiceDOutcome: "The offer registers as noise in a conversation that was about something else entirely. He wraps up the call shortly after.", choiceDWeights: W.high_risk,
      },
      {
        id: "gp_3",
        scenePrompt: "Pixel art scene: 11pm phone call in a kitchen, entire family gathered at the table, the coach's face visible on a phone screen held by the father, the question hanging in the air like smoke, the player visible in the doorway listening but not entering, the manager's car visible through the kitchen window parked outside.",
        eventText: "The night before {name}'s commitment announcement, his manager calls you — not the family, the manager — and says the player has one final question he wants you to answer before morning. The question: 'When he struggles — not if, when — what exactly happens? What do you actually do?' The manager says he's asked five programs this question. Three gave PR answers. One said it was an unusual question. You're the fifth.",
        choiceA: "Give the specific, concrete answer — name exactly what happens, step by step, when a player struggles at your program", choiceAOutcome: "The operational specificity is the answer to the question everyone else avoided. He commits before the manager gets off the phone.", choiceAWeights: W.bold_pos,
        choiceB: "Speak from your own experience as a player who struggled — make it human, not procedural", choiceBOutcome: "The personal story converts the question from a test into a conversation. He's in the doorway listening. He walks into the kitchen.", choiceBWeights: W.safe_pos,
        choiceC: "Name a current player who struggled and what happened next — let the evidence speak", choiceCOutcome: "The concrete example of what happened to a real person at your program is the most credible version of the answer possible.", choiceCWeights: W.neutral_up,
      },
    ],
    legendaryEvents: [
      {
        id: "gp_legend_1",
        scenePrompt: "Pixel art scene: Hall of Fame legends in silhouette in a stadium luxury box watching a young player below, a golden ethereal glow emanating from the player on the field, a stat line floating on the scoreboard that has never appeared in recorded college baseball history, the whole stadium holding its breath as if aware it is witnessing something that will be described for decades.",
        eventText: "LEGENDARY MOMENT — {name} has produced numbers that have never appeared at this level of play in recorded history. Multiple Hall of Famers have reached out to him personally. A sitting MLB commissioner mentioned him by name in a press conference unprompted. The documentary crew has gone from following him to following the people following him. Every decision made from this point forward will be written about.",
        choiceA: "Be physically present at every milestone — make yourself part of the legend being written", choiceAOutcome: "Being woven into the greatest recruiting story of a generation is something no rival program can replicate. History remembers who was in the room.", choiceAWeights: { minor_pos: 0.05, moderate_pos: 0.15, major_pos: 0.30, legendary_pos: 0.30, minor_neg: 0.02, moderate_neg: 0.04, major_neg: 0.06, legendary_neg: 0.03, neutral: 0.05 },
        choiceB: "Be the steady, grounding voice — the one person not swept up in the magnitude of the moment", choiceBOutcome: "When everyone else is chasing the star, the coach who stays calm and human stands out in a way that cannot be manufactured.", choiceBWeights: W.bold_pos,
        choiceC: "Declare publicly that this is the most important recruit in your program's history", choiceCOutcome: "The public declaration is bold. He sees it. He either loves the weight of it or feels the pressure of it. No way to know which until it's done.", choiceCWeights: W.high_risk,
      },
    ],
  },

  // ─── Five New Regular Archetypes ─────────────────────────────────────────────

  financial_pressure: {
    name: "The Scholarship Kid",
    description: "His father works double shifts. His mother asked if the scholarship covers books. His dream costs money they don't have.",
    flavor: "He told you he's never been on a plane. He said it quietly, like it was something he was confessing.",
    events: [
      {
        id: "fp_1",
        scenePrompt: "Pixel art scene: kitchen table at night, two adults in work clothes across from their son with recruitment brochures spread out, a calculator open on the table, a handwritten budget visible at one corner, the son looking at the brochure photos like they belong to a different world.",
        eventText: "{name}'s father works double shifts. His mother asked you — directly, the first time she spoke — whether the scholarship covers books. His family has never watched a college game in person. He's never flown on a plane. He told you all of this quietly, like it was something he was confessing. He can play. Everyone can see that. The question nobody has thought to answer is whether someone will make this actually possible.",
        choiceA: "Walk his family through every dollar — the full scholarship breakdown, meal plans, textbooks, travel", choiceAOutcome: "The specific dollar breakdown transforms the abstract into the possible. His mother takes notes. His father stops looking at the floor.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with a current player who came from the same financial situation and made it work", choiceBOutcome: "The peer testimony of someone who had the same kitchen conversation and came out the other side changes everything in the room.", choiceBWeights: W.safe_pos,
        choiceC: "Offer to arrange a campus visit — let him see it with his own eyes before the financial details become the obstacle", choiceCOutcome: "The visit makes the destination real before the cost becomes the only story. He comes back quieter and more certain.", choiceCWeights: W.neutral_up,
        choiceD: "Lead with the scholarship dollar amount — make the financial case before anything else", choiceDOutcome: "The number lands before the relationship does. He nods. His mother writes it down. But nothing in the room feels connected yet.", choiceDWeights: W.cautious,
      },
      {
        id: "fp_2",
        scenePrompt: "Pixel art scene: recruit reading a letter from a rival school on his phone while riding a bus, the offer number visible on the screen, his work uniform partially visible under an open jacket, his stop coming up, the look on his face not excited — calculating.",
        eventText: "A rival program offered {name} a full scholarship plus a $12,000 NIL package his first year — more money than anyone in his family has ever been offered for anything. He texted you the number. Not to negotiate. He texted it because he needed someone to tell him honestly whether it was enough to say yes to a program he doesn't love as much as yours. He's waiting for your answer.",
        choiceA: "Be honest — tell him what you can offer and what it means, dollar for dollar", choiceAOutcome: "The honesty about what you have and why it's still the right choice builds a trust the rival's number cannot buy.", choiceAWeights: W.bold_pos,
        choiceB: "Ask what his family actually needs — find the specific number that makes this possible for them", choiceBOutcome: "The question of what they need — not what the rival offered — shifts the conversation to something you can actually solve.", choiceBWeights: W.safe_pos,
        choiceC: "Tell him the rival's offer is real and fair and ask what would make your program worth the difference to him", choiceCOutcome: "Acknowledging the rival's offer without panic or politics earns a respect no competing bid can replicate.", choiceCWeights: W.neutral_up,
      },
      {
        id: "fp_3",
        scenePrompt: "Pixel art scene: scholarship letter spread open on the kitchen table, his mother's handwriting circling the total dollar figure, his father standing in the doorway in work clothes reading it over her shoulder, the player watching their faces — not the letter — with an expression of quiet resolve.",
        eventText: "The scholarship letter arrived. His mother called you before {name} did. She said three words: 'We can do this.' Then she passed the phone to his father, who said: 'Thank you for explaining it the way you did.' Then she got back on and said: 'He wants to come. He just doesn't know how to say it yet.' {name} gets on the phone ten seconds later and says: 'I'm in.' He says it the way people say things they've been rehearsing for months.",
        choiceA: "Welcome him fully — make the first moments of his commitment feel like the beginning, not the finish", choiceAOutcome: "The warmth of the welcome is what he carries into his first day on campus. He brings his family for every home game.", choiceAWeights: W.bold_pos,
        choiceB: "Tell him what comes next — the practical steps, so the family knows the path is clear", choiceBOutcome: "The roadmap removes the final uncertainty. His mother relaxes in a way she hasn't in months. The family starts planning.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him if he has questions — give him space to voice whatever he's been holding back", choiceCOutcome: "The question opens the real conversation. What he says next tells you more about him than anything in his film.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  coaching_change: {
    name: "The Orphaned Prospect",
    description: "His coach — the man who built him, believed in him first, and made the call that started everything — retired in March.",
    flavor: "He told three programs he was 'figuring things out.' He told you he didn't know who he was without his coach.",
    events: [
      {
        id: "coc_1",
        scenePrompt: "Pixel art scene: high school dugout after the final practice of the season, the retiring coach and the player sitting on the bench alone with the field lights still on, the coach's keys to the equipment shed on the bench between them, other players' cleats hanging on the wall still dusty from the last game.",
        scenePromptPitcher: "Pixel art scene: bullpen at the end of the season, the retiring pitching coach and the pitcher sitting on the mound together after everyone else has left, the coach's radar gun on the rubber between them, the field lights still on.",
        eventText: "{name}'s high school coach — the man who found him, built his mechanics, made the call to three college programs that started everything — retired in March. He didn't announce it. He told the players first, then their parents, then sent one email to coaches he trusted. You were on the list. {name} hasn't spoken publicly. He pulled out of two scheduled showcases. He told your assistant coach he's 'figuring things out.' He told you something different: 'I don't know who I am without him.'",
        choiceA: "Drive to one of his games — show up without an agenda and just be present", choiceAOutcome: "Being there when his baseball world has lost its center is an act of steadiness no phone call can replicate.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out to his coach — ask if he's willing to stay involved as a bridge to the transition", choiceBOutcome: "The retired coach agrees to make one more call on his behalf. It's the call that changes the trajectory.", choiceBWeights: W.safe_pos,
        choiceC: "Give him space — check in once a week without pressure until he finds his footing", choiceCOutcome: "The consistent, low-pressure contact over six weeks becomes the relationship he leans on when he's ready to move forward.", choiceCWeights: W.neutral_up,
        choiceD: "Make an offer now — give him something concrete to hold in the uncertainty", choiceDOutcome: "The offer lands before the ground is solid. He appreciates it. He's not ready to accept it. The relationship doesn't break, but it pauses.", choiceDWeights: W.cautious,
      },
      {
        id: "coc_2",
        scenePrompt: "Pixel art scene: new high school coach's first practice, clipboard in front of him like a shield, skeptical expression, while the player performs at another level entirely — the gap between them visible in every body language cue, two scouts in the stands watching the dynamic more than the play.",
        scenePromptPitcher: "Pixel art scene: new high school pitching coach's first bullpen session, clipboard in front of him like a shield, skeptical expression, while the pitcher on the mound delivers something clearly extraordinary — the gap between them visible in every body language cue, two scouts in the stands watching the dynamic more than the velocity readout.",
        eventText: "The new coach isn't sure what to do with {name}. He treats him like any other player, which is the problem. {name} spent five years being treated as someone particular. The shift is visible: his mechanics are intact but something in his approach has flattened. His old coach called you last week and said: 'Someone needs to remind him why he's different. I can't be that person anymore.'",
        choiceA: "Call him and tell him what his old coach told you — with permission — so he knows he's still being seen", choiceAOutcome: "The message from his old coach, carried by you, is the most credible affirmation available. He plays the next game differently.", choiceAWeights: W.bold_pos,
        choiceB: "Invite him for a campus visit focused entirely on development — show him what a staff that sees him looks like", choiceBOutcome: "The visit surrounded by coaches who respond specifically to who he is restores something he didn't know had gone missing.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a player on your roster who navigated a coaching transition in high school", choiceCOutcome: "The peer story of how to perform when the person who believed in you first is gone lands in exactly the right place.", choiceCWeights: W.neutral_up,
      },
      {
        id: "coc_3",
        scenePrompt: "Pixel art scene: video call at night — recruit at his desk, old coach visible on a laptop screen behind him with a baseball from their first season hanging on the wall, the recruit holding his phone showing a text with your program's logo — asking his old mentor for the last guidance he'll ever need to ask for.",
        eventText: "{name} called his old coach before making his decision. The coach told you afterward — unprompted, in a message you weren't expecting: 'He asked me which program would take care of him the way I did. I told him yours. I hope that's true.' There's a weight to that sentence that doesn't leave easily. It's also the clearest endorsement any mentor has ever given you.",
        choiceA: "Call the retired coach and thank him — and tell him exactly how you plan to honor his investment", choiceAOutcome: "The coach tells {name} about the call. {name} says: 'That's the only confirmation I needed.' He commits that evening.", choiceAWeights: W.bold_pos,
        choiceB: "Call {name} and acknowledge what his coach said — make the relationship explicit", choiceBOutcome: "Naming the trust that's been passed to you is the most honest thing you can do with it. He hears it as a commitment, not a pitch.", choiceBWeights: W.safe_pos,
        choiceC: "Let it speak for itself — make the offer and let the endorsement do the work", choiceCOutcome: "The offer alongside the knowledge of what his coach said is enough. He calls back in two hours.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  first_gen_student: {
    name: "The First One",
    description: "Nobody in his family has ever been to college. His grandmother keeps the recruiting letters in a shoebox she hides under her bed.",
    flavor: "He asked you what office hours were. He wasn't joking. He asked it quietly, like he'd been afraid to ask.",
    events: [
      {
        id: "fgs_1",
        scenePrompt: "Pixel art scene: grandmother's bedroom, a shoebox open on the bed containing a collection of college recruitment letters sorted by color, each envelope carefully resealed after reading, the grandmother holding one up toward the window light to read it better, her face a mixture of pride and complete unfamiliarity with the institutions named inside.",
        eventText: "{name} is the first person in his family to be recruited by a four-year college. His grandmother collects every letter — sorts them, keeps them in a shoebox under her bed, asks him to read them aloud to her in the evenings. She calls every school 'The University.' He told you this. He also told you that he asked his guidance counselor what 'office hours' meant and felt embarrassed about it for a week. He's brilliant. He's terrified. He needs someone to tell him both of those things are okay at the same time.",
        choiceA: "Walk him through exactly what college is — the practical, unglamorous reality — and let him ask anything", choiceAOutcome: "The conversation that demystifies the institution — with no condescension and no glossing — is the one that makes college feel like something he could actually belong to.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with a first-gen player on your roster who knows this exact feeling", choiceBOutcome: "The peer who has already crossed this distance and survived is the guide no coach can be. They talk for three hours.", choiceBWeights: W.safe_pos,
        choiceC: "Invite the family for a campus visit — let his grandmother see it in person", choiceCOutcome: "The grandmother's reaction to the visit is the thing that resolves months of uncertainty. She holds her son's hand and says: 'This is where you go.'", choiceCWeights: W.neutral_up,
        choiceD: "Focus on the baseball — keep the conversation on what he knows and is confident about", choiceDOutcome: "The baseball conversation is comfortable. But the fear underneath the baseball decision doesn't go away because you didn't address it.", choiceDWeights: W.cautious,
      },
      {
        id: "fgs_2",
        scenePrompt: "Pixel art scene: campus tour in the evening with the rest of his family — parents, grandmother, and two younger siblings all in a line behind a tour guide — the recruit looking not at the buildings but at his family's faces as they look at the buildings, the youngest sibling pointing at the library with wide eyes.",
        eventText: "He brought his whole family to the campus visit. His grandmother. His parents. Two younger siblings. They walked in a single-file line behind the tour guide and asked questions about everything — the dining hall, the library, the academic advising office, the weight room. His grandmother asked if students were allowed to keep food in their rooms. {name} looked mortified. The tour guide smiled and answered perfectly. {name} looked at you afterward and said: 'Nobody made them feel small.' He was surprised. He shouldn't have had to be.",
        choiceA: "Tell him directly: 'Nobody here will ever make your family feel small. That's not who we are.'", choiceAOutcome: "The direct commitment to something he hadn't dared to ask for fills the silence that's followed him through every other campus visit.", choiceAWeights: W.bold_pos,
        choiceB: "Follow up with the tour guide — make sure his family knows they're welcome back anytime", choiceBOutcome: "The follow-up demonstrates institutional warmth, not individual courtesy. He tells his grandmother. She calls the school directly.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him what the visit meant to him — let him process it out loud before you say anything", choiceCOutcome: "What he says takes you by surprise. It has almost nothing to do with baseball and everything to do with the look on his mother's face.", choiceCWeights: W.neutral_up,
      },
      {
        id: "fgs_3",
        scenePrompt: "Pixel art scene: nighttime phone call, recruit at his kitchen table with his acceptance letter spread open in front of him, his parents visible through a doorway watching the call without trying to look like they're watching, the word 'ADMITTED' barely visible on the letter, a first-generation college student sticker on the corner of his laptop.",
        eventText: "The acceptance letter came. {name} called you before he called anyone else in his family — before his parents even knew. He said: 'I got in. I'm the first one.' Then the line went quiet for almost ten seconds. When he came back he said: 'My dad's going to cry when I tell him. I know it.' He paused. 'I'm going to your school. I just needed to tell someone first who would understand what this actually is.'",
        choiceA: "Tell him what it actually is — in specific terms that honor the weight of what he just said", choiceAOutcome: "The acknowledgment that matches the magnitude — without diminishing or dramatizing it — is the last thing he needs before the new chapter starts.", choiceAWeights: W.bold_pos,
        choiceB: "Tell him to go tell his dad — and let him know you'll be here when the dust settles", choiceBOutcome: "Sending him to the moment instead of keeping him on the phone is the most generous response available. He calls back two hours later, voice still shaking.", choiceBWeights: W.safe_pos,
        choiceC: "Ask him how he feels — give him the space to say something he hasn't said yet", choiceCOutcome: "What he says next is something you write down. It stays with you for the rest of your career.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  draft_agent_pressure: {
    name: "The Early Declare Candidate",
    description: "His agent called two MLB teams before his high school graduation. One of them called back.",
    flavor: "He told you the number. You knew what it meant. He asked you to tell him it wasn't enough. You couldn't.",
    events: [
      {
        id: "dap_1",
        scenePrompt: "Pixel art scene: agent on a phone call in a glass-walled office, documents visible on the desk, the recruit sitting across from him looking at his hands rather than the papers, an MLB logo faintly visible on one of the pages, the player's high school jersey hanging framed on the wall behind the agent — the only thing in the room that still belongs to him.",
        scenePromptPitcher: "Pixel art scene: agent on a phone call in a glass-walled office, a radar gun printout visible on the desk, the pitcher sitting across from him looking at his hand rather than the papers, an MLB logo faintly visible on one of the pages, the player's high school jersey hanging framed on the wall behind the agent — the only thing in the room that still belongs to him.",
        eventText: "{name}'s agent initiated contact with three MLB teams before graduation. One responded with a preliminary slot value number. The agent shared it with the family. The family shared it with {name}. {name} shared it with you — not to negotiate, but because he trusts you and he's scared. He said: 'They want me to skip college entirely. Tell me it's not the right move.' He's asking you to make a case you may not be able to make honestly.",
        choiceA: "Be honest — tell him exactly what college offers and what going pro now costs him in development time", choiceAOutcome: "The honest comparison — both sides, no spin — is what he was actually asking for. He makes a different decision than his agent expected.", choiceAWeights: W.bold_pos,
        choiceB: "Ask him what he wants — before any of the numbers, just what he actually wants", choiceBOutcome: "The question before the answer reveals that his first instinct, before the agent, was always college. He needed someone to ask.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a player who chose college over a draft slot and has no regrets", choiceCOutcome: "The peer story of the road not taken — told by someone who took yours — is the most persuasive narrative available.", choiceCWeights: W.neutral_up,
        choiceD: "Tell him the number isn't enough — even if you're not entirely sure that's true", choiceDOutcome: "The confident dismissal of the number provides short-term direction. But if the slot is real, the advice has a shelf life.", choiceDWeights: W.high_risk,
      },
      {
        id: "dap_2",
        scenePrompt: "Pixel art scene: pro scout sitting across a kitchen table from the player's parents, a one-page letter face-up between them with a dollar figure highlighted, the player standing in the doorway not having been invited to sit down, watching his parents' body language change as they read the number.",
        scenePromptPitcher: "Pixel art scene: pro scout sitting across a kitchen table from the pitcher's parents, a one-page letter face-up between them with a slot bonus figure highlighted, the pitcher standing in the doorway not having been invited to sit down, watching his parents' body language change as they read the number.",
        eventText: "An MLB scout visited {name}'s home — without the agent, with the family. {name} wasn't invited to the first part of the meeting. He watched from the doorway while a pro scout explained what a slot bonus could do for his parents. His mother called you afterward, not to tell you the number — to ask you a question: 'Is he ready? Truly ready? Because they're not going to wait for him to be.' She wasn't asking about his ability. She was asking about the rest of him.",
        choiceA: "Answer honestly — tell her what you believe about his readiness, including the parts that aren't about baseball", choiceAOutcome: "The honest assessment — not just the scouting report but the full person — is the answer she was looking for. She thanks you. She doesn't share what she decides.", choiceAWeights: W.bold_pos,
        choiceB: "Tell her what college offers that the slot bonus cannot — the full picture of what four years becomes", choiceBOutcome: "The articulation of what money can't buy — in specific, credible terms — shifts the room's center of gravity.", choiceBWeights: W.safe_pos,
        choiceC: "Ask her what she wants for him — not the contract, not the career, just what she wants for her son", choiceCOutcome: "The question is the one nobody else thought to ask. The answer changes the conversation they have with {name} that night.", choiceCWeights: W.neutral_up,
      },
      {
        id: "dap_3",
        scenePrompt: "Pixel art scene: draft decision deadline calendar on a wall with a date circled in red, the player alone in his bedroom at midnight reading a printed offer letter on one side and a college program information sheet on the other, a phone on the nightstand with three missed calls from the agent, one unanswered text from you that just reads 'We're here either way.'",
        scenePromptPitcher: "Pixel art scene: draft decision deadline calendar on a wall with a date circled in red, the pitcher alone in his bedroom at midnight reading a printed bonus offer on one side and a college program information sheet on the other, a phone on the nightstand with three missed calls from the agent, one unanswered text from you that just reads 'We're here either way.'",
        eventText: "The deadline is in 48 hours. {name} has read every offer letter, every projection, every development timeline. His agent has called six times today. His family has stopped weighing in — they've made their peace with whatever he decides. At midnight he texts you: 'I haven't made up my mind. I keep thinking about what you said. I think I know what I want. I just need to hear someone say it's okay to want it.'",
        choiceA: "Tell him: 'It's okay to want it. Whatever it is — it's okay.' And mean it.", choiceAOutcome: "The unconditional permission is the last thing he needed. He makes his decision that night. He texts you before he texts his agent.", choiceAWeights: W.bold_pos,
        choiceB: "Ask him what he wants — and tell him you'll support it regardless of which direction it goes", choiceBOutcome: "The open question with no agenda is the safest ground he's stood on in weeks. The answer surprises him as much as it surprises you.", choiceBWeights: W.safe_pos,
        choiceC: "Remind him of a specific reason he said he wanted college — something from early in your relationship", choiceCOutcome: "The callback to his own words, spoken before the pressure arrived, reconnects him to the person who was sure before the money made it complicated.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  small_town_hero: {
    name: "The Local Legend",
    description: "He's played against maybe 40 quality arms his entire life. His region is so thin that nobody knows how good he actually is.",
    flavor: "His coach drove six hours to get him to a real showcase. He was the best player there by a distance. Nobody had heard of him.",
    events: [
      {
        id: "sth_1",
        scenePrompt: "Pixel art scene: regional showcase event at dusk, player standing out in every drill while scouts check their clipboards looking for a name they can't find, one scout finally tapping another on the shoulder and pointing with a question on his face — neither of them has any film on this player.",
        scenePromptPitcher: "Pixel art scene: regional showcase event at dusk, pitcher dealing with unprecedented stuff while scouts check their clipboards looking for a name they can't find, one scout finally tapping another on the shoulder and pointing with a question on his face — neither of them has any prior data on this arm.",
        eventText: "{name} drove six hours to his first real showcase. His coach arranged it. His parents followed in their own car. He was the best player on the field by a distance — and nobody there had any film on him, any scouting report, any context at all. Two scouts stood in the parking lot for fifteen minutes just trying to figure out who he was. His coach handed them a one-page handwritten player note. It's the only document that exists on him. You were the first program to call.",
        choiceA: "Call the same day — be first, establish the relationship before anyone else catches up", choiceAOutcome: "The immediate call signals that someone saw what happened and moved on it. He's never received a college call before. He answers on the second ring.", choiceAWeights: W.bold_pos,
        choiceB: "Ask his coach to arrange a private workout before anyone else can see him", choiceBOutcome: "The private workout gives you a complete picture before the field fills. What you see confirms the showcase wasn't a fluke.", choiceBWeights: W.safe_pos,
        choiceC: "Research his high school program first — understand the competition level before assigning weight to the numbers", choiceCOutcome: "The research reveals the context: he's dominated genuinely thin competition. The showcase, though, was not thin. You proceed with confidence.", choiceCWeights: W.neutral_up,
        choiceD: "Wait for more exposure events before committing resources — one showcase isn't enough data", choiceDOutcome: "By the second showcase, four programs have already called. Your caution costs you first-mover advantage in a market you didn't know existed.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sth_2",
        scenePrompt: "Pixel art scene: player on a campus visit tour looking at everything with wide eyes — not the facilities, but the players around him — realizing for the first time that the gap between himself and elite competition might be smaller than he thought, a coach watching his face rather than pointing at the buildings.",
        eventText: "{name} visited your campus and watched a practice for the first time. He's never seen players this good in person. Afterward, he sat in the parking lot for twenty minutes before calling his parents. He told you later: 'I thought I might not be good enough. Then I watched. And I thought — I might actually be better than most of those guys. I don't know how to feel about that.' He's never had competition that could tell him who he is. Your program might be the first place that can.",
        choiceA: "Tell him what you actually see — compare him directly to players you've coached, specifically and honestly", choiceAOutcome: "The specific comparison — by name, by metric, by what you observed — is the most credible response to a question he's been carrying his whole career.", choiceAWeights: W.bold_pos,
        choiceB: "Put him in a drill with your players — let the competition answer the question he can't ask out loud", choiceBOutcome: "The drill session answers everything. He performs. He knows. You both know. No words required for the next ten minutes.", choiceBWeights: W.safe_pos,
        choiceC: "Acknowledge the uncertainty — tell him you didn't know either and you found out together", choiceCOutcome: "The honesty about the discovery process removes the pressure to pretend certainty nobody has yet. He exhales visibly.", choiceCWeights: W.neutral_up,
      },
      {
        id: "sth_3",
        scenePrompt: "Pixel art scene: small-town gym on a weeknight, the player's commitment announcement watched on a laptop by his entire hometown — parents, old coaches, teachers, the scout who drove six hours — everyone crammed into a room designed for fifteen, someone's phone held up showing a livestream, a handwritten banner in the background.",
        scenePromptPitcher: "Pixel art scene: small-town gym on a weeknight, the pitcher's commitment announcement watched on a laptop by his entire hometown — parents, old coaches, teachers, the scout who drove six hours — everyone crammed into a room designed for fifteen, someone's phone held up showing a livestream, a handwritten banner in the background.",
        eventText: "{name} committed to your program. His hometown watched the announcement on a laptop in his old high school gym. Forty people in a room designed for fifteen. His elementary school coach was there. The scout who drove six hours to get him to that first showcase was there. His announcement was 38 words. When he finished, his old coach stood up and said: 'That's our boy.' The room erupted. You got a text from his coach the next morning. It said: 'Don't waste him.'",
        choiceA: "Call his coach and tell him exactly what you plan to do — make a specific promise", choiceAOutcome: "The specific promise to the person who made this possible is a commitment that travels back through the community. {name} hears about the call. He shows up to your campus three weeks early.", choiceAWeights: W.bold_pos,
        choiceB: "Call {name} and acknowledge the whole town — let him know what his commitment means beyond baseball", choiceBOutcome: "Acknowledging the community as part of what he brought with him is the most respectful welcome you can offer. He repeats it to his parents word for word.", choiceBWeights: W.safe_pos,
        choiceC: "Let him settle in — reach out in a week when the excitement has calmed and the real work begins", choiceCOutcome: "The measured approach respects the magnitude of the moment without manufacturing more noise. When you call, he's ready to talk about baseball.", choiceCWeights: W.neutral_up,
      },
    ],
  },
};

// ─── Storyline Recruit Selection ──────────────────────────────────────────────
export interface StorylinePickConfig {
  count: number;        // how many storyline recruits to pick (default 10)
  legendaryCount: number; // how many should be legendary (default 1)
  recentLegendaryCount?: number; // legendaries in recent past cohorts — used for quota smoothing
}

// Tier distribution: exactly 2/2/2/2/2 = 10 total
// "unknown" = two recruits whose tier is deliberately hidden (fog of war)
const TIER_DISTRIBUTION: Record<string, number> = {
  elite: 2,
  above_average: 2,
  average: 2,
  below_average: 2,
  unknown: 2,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickStorylineRecruits(
  recruits: Array<{ id: string; overall: number; starRank: number; isBlueChip?: boolean | null; isGenerationalGem?: boolean | null; firstName: string; lastName: string; position: string }>,
  config?: Partial<StorylinePickConfig>,
): Array<{
  recruitId: string;
  archetype: Archetype;
  tier: string;
  hiddenVars: StorylineHiddenVars;
  isLegendary: boolean;
  imagePrompt: string;
}> {
  const TARGET_COUNT = config?.count ?? 10;
  const usedIds = new Set<string>();
  const picked: Array<{ recruit: typeof recruits[0]; tier: string }> = [];

  // Tier-specific pools with OVR ranges, filled in order; each falls back to global remaining pool
  const TIER_FILTERS: Array<{ name: string; filter: (r: typeof recruits[0]) => boolean }> = [
    { name: "elite",         filter: r => r.overall >= 500 },
    { name: "above_average", filter: r => r.overall >= 350 && r.overall < 500 },
    { name: "average",       filter: r => r.overall >= 250 && r.overall < 350 },
    { name: "below_average", filter: r => r.overall < 250 },
    { name: "unknown",       filter: () => true },
  ];

  for (const { name, filter } of TIER_FILTERS) {
    const needed = TIER_DISTRIBUTION[name];
    // Primary pool: recruits matching this tier's OVR range, not yet picked
    const primary = shuffle(recruits.filter(r => filter(r) && !usedIds.has(r.id)));
    // Secondary fallback: any remaining recruit (in case primary bucket is under-populated)
    const fallback = shuffle(recruits.filter(r => !usedIds.has(r.id) && !primary.some(p => p.id === r.id)));
    let filled = 0;
    for (const r of [...primary, ...fallback]) {
      if (filled >= needed) break;
      if (!usedIds.has(r.id)) {
        picked.push({ recruit: r, tier: name });
        usedIds.add(r.id);
        filled++;
      }
    }
    // If pool is exhausted for this tier, log a warning and accept fewer — never re-insert
    // a duplicate recruitId since that would violate the DB unique index.
    if (filled < needed) {
      console.warn(`[storyline-pick] pool exhausted for tier "${name}": got ${filled}/${needed}`);
    }
  }

  // Deduplicate by recruitId before trimming (safety net — primary/fallback logic should
  // already prevent duplicates, but this guards against any edge-case double-insertion).
  const seenIds = new Set<string>();
  const dedupedPicked = picked.filter(p => {
    if (seenIds.has(p.recruit.id)) return false;
    seenIds.add(p.recruit.id);
    return true;
  });

  // Trim to exactly TARGET_COUNT
  const finalPicked = dedupedPicked.slice(0, TARGET_COUNT);

  // Legendary quota: throttle to 15% when over-represented, guarantee 100% when starved.
  const recentLegendaryCount = config?.recentLegendaryCount ?? 0;
  let legendaryCount: number;
  if (config?.legendaryCount !== undefined) {
    legendaryCount = config.legendaryCount;
  } else {
    const prob = recentLegendaryCount >= 2 ? 0.15 : recentLegendaryCount === 0 ? 1.0 : 0.40;
    legendaryCount = Math.random() < prob ? 1 : 0;
  }

  // Legendary slot: best available from finalPicked (gem > bluechip > 4-star+)
  const sorted = [...finalPicked].sort((a, b) => {
    const scoreA = (a.recruit.isGenerationalGem ? 3 : 0) + (a.recruit.isBlueChip ? 2 : 0) + (a.recruit.starRank >= 4 ? 1 : 0);
    const scoreB = (b.recruit.isGenerationalGem ? 3 : 0) + (b.recruit.isBlueChip ? 2 : 0) + (b.recruit.starRank >= 4 ? 1 : 0);
    return scoreB - scoreA;
  });
  const legendaryId = legendaryCount > 0 && sorted.length > 0 ? sorted[0].recruit.id : null;

  return finalPicked.map(({ recruit: r, tier }) => {
    const isLegendary = r.id === legendaryId;
    const archetype = pickArchetypeForRecruit(r, isLegendary);
    const hiddenVars = rollHiddenVars(r.starRank, r.isBlueChip ?? false, isLegendary);
    const imagePrompt = buildImagePrompt(r.firstName, r.lastName, r.position, archetype, isLegendary);
    return { recruitId: r.id, archetype, tier, hiddenVars, isLegendary, imagePrompt };
  });
}

// Five distinct legendary template archetypes — randomly assigned to legendary recruits
const LEGENDARY_ARCHETYPES: Archetype[] = [
  "the_phenom", "the_collapse", "the_two_sport_icon", "the_scientist", "folk_hero",
];

function pickArchetypeForRecruit(
  r: { starRank: number; isBlueChip?: boolean | null; isGenerationalGem?: boolean | null; position: string },
  isLegendary: boolean,
): Archetype {
  if (isLegendary) {
    return LEGENDARY_ARCHETYPES[Math.floor(Math.random() * LEGENDARY_ARCHETYPES.length)];
  }
  const isPitcherPos = isPitcher(r.position);
  if (r.isBlueChip) {
    const eliteAll: Archetype[] = ["summer_breakout", "velocity_freak", "rivalry_recruit", "social_media_star", "generational_prodigy", "draft_agent_pressure"];
    // velocity_freak (pitcher-only) must be excluded for position players
    const elite = isPitcherPos
      ? eliteAll.filter(a => !HITTER_ONLY_ARCHETYPES.has(a))
      : eliteAll.filter(a => !PITCHER_ONLY_ARCHETYPES.has(a));
    return elite[Math.floor(Math.random() * elite.length)];
  }
  if (isPitcherPos) {
    const pitcherArch: Archetype[] = ["velocity_freak", "knuckleball_specialist", "burnout_candidate", "injury_risk", "late_bloomer", "coaching_change", "financial_pressure"];
    return pitcherArch[Math.floor(Math.random() * pitcherArch.length)];
  }
  if (r.starRank <= 2) {
    // Low-star position players: none of these contain pitcher-only archetypes
    const lowArch: Archetype[] = ["late_bloomer", "academic_concern", "position_change", "confidence_crisis", "financial_pressure", "first_gen_student", "small_town_hero"];
    return lowArch[Math.floor(Math.random() * lowArch.length)];
  }
  // General fallback for position players: exclude pitcher-only archetypes
  const generalPool = ARCHETYPES.filter(a => !PITCHER_ONLY_ARCHETYPES.has(a));
  return generalPool[Math.floor(Math.random() * generalPool.length)];
}

function getTierFromOVR(ovr: number): string {
  if (ovr >= 500) return "elite";
  if (ovr >= 350) return "above_average";
  if (ovr >= 250) return "average";
  return "below_average";
}

function buildImagePrompt(firstName: string, lastName: string, position: string, archetype: Archetype, isLegendary: boolean): string {
  const archetypeDef = ARCHETYPE_DEFS[archetype];
  const legendaryPrefix = isLegendary ? "legendary, god-tier, ethereal glow, " : "";
  return `Retro pixel art college baseball player portrait. ${legendaryPrefix}${position} position player. ${archetypeDef.flavor} 16-bit SNES style, dark background, gold and green palette, dramatic lighting. Character: ${firstName} ${lastName}. Archetype: ${archetypeDef.name}.`;
}

// ─── Event Generation ─────────────────────────────────────────────────────────
export function generateStorylineEvent(
  storylineRecruitId: string,
  leagueId: string,
  season: number,
  week: number,
  archetype: Archetype,
  arcStage: number,
  isLegendary: boolean,
  recruitName: string,
  linkedRecruitName?: string,   // name of linked/overlapping arc recruit for narrative injection
  position?: string,            // recruit's field position — used to select position-aware scene prompts
  usedTemplateIds?: string[],   // template IDs already used this season for this recruit
): {
  storylineRecruitId: string;
  leagueId: string;
  season: number;
  week: number;
  templateId: string;
  scenePrompt: string | undefined;
  eventText: string;
  choiceA: string; choiceAOutcome: string; choiceAWeights: ChoiceWeights;
  choiceB: string; choiceBOutcome: string; choiceBWeights: ChoiceWeights;
  choiceC: string; choiceCOutcome: string; choiceCWeights: ChoiceWeights;
  choiceD?: string; choiceDOutcome?: string; choiceDWeights?: ChoiceWeights;
} {
  const def = ARCHETYPE_DEFS[archetype];
  let pool = [...def.events];
  if (isLegendary && def.legendaryEvents && arcStage >= 2) {
    pool = [...pool, ...def.legendaryEvents];
  }
  // Filter out templates already used this season to avoid weekly duplicates.
  // Callers MUST pre-filter exhausted recruits before invoking (the routes-level
  // nonExhausted filter enforces this for weekly generation).  If unusedPool is
  // unexpectedly empty — a caller contract violation — fall back to the full pool
  // to prevent a runtime crash and emit an explicit warning for debugging.
  const usedSet = new Set(usedTemplateIds ?? []);
  const unusedPool = pool.filter(t => !usedSet.has(t.id));
  if (unusedPool.length === 0 && usedSet.size > 0) {
    console.warn(
      `[storylineEngine] generateStorylineEvent: all ${pool.length} template(s) exhausted ` +
      `for archetype "${archetype}" (recruit "${recruitId}") — falling back to full pool. ` +
      `Caller should have filtered exhausted recruits before invoking this function.`
    );
  }
  const availablePool = unusedPool.length > 0 ? unusedPool : pool;
  const template = availablePool[Math.floor(Math.random() * availablePool.length)];

  const interpolate = (text: string) => {
    let out = text.replace(/\{name\}/g, recruitName);
    if (linkedRecruitName && arcStage >= 2 && !out.includes(linkedRecruitName)) {
      const linkedPhrases = [
        ` Meanwhile, ${linkedRecruitName} — another top recruit in this class — is watching how this unfolds.`,
        ` Scouts note that ${linkedRecruitName}'s recruiting decision could influence ${recruitName}'s choice.`,
        ` The buzz around ${linkedRecruitName} has made programs reconsider their approach with ${recruitName} as well.`,
      ];
      out += linkedPhrases[arcStage % linkedPhrases.length];
    }
    return out;
  };

  // Select the most-specific available scene prompt using the priority chain:
  //   scenePromptByPosition[groupKey] → scenePromptPitcher → scenePrompt (default)
  const pitcherMode = Boolean(position && isPitcher(position));
  const posGroupKey = position ? positionToSceneGroupKey(position) : null;
  const scenePrompt =
    (posGroupKey && template.scenePromptByPosition?.[posGroupKey]) ||
    (pitcherMode && template.scenePromptPitcher) ||
    template.scenePrompt;
  const resolvedEventText = (pitcherMode && template.eventTextPitcher)
    ? template.eventTextPitcher
    : template.eventText;

  return {
    storylineRecruitId,
    leagueId,
    season,
    week,
    templateId: template.id,
    scenePrompt,
    eventText: interpolate(resolvedEventText),
    choiceA: template.choiceA,
    choiceAOutcome: interpolate(template.choiceAOutcome),
    choiceAWeights: template.choiceAWeights,
    choiceB: template.choiceB,
    choiceBOutcome: interpolate(template.choiceBOutcome),
    choiceBWeights: template.choiceBWeights,
    choiceC: template.choiceC,
    choiceCOutcome: interpolate(template.choiceCOutcome),
    choiceCWeights: template.choiceCWeights,
    choiceD: template.choiceD,
    choiceDOutcome: template.choiceD ? interpolate(template.choiceDOutcome ?? "") : undefined,
    choiceDWeights: template.choiceDWeights,
  };
}

// ─── Vote Resolution ──────────────────────────────────────────────────────────
export function resolveVotes(
  votes: Array<{ choice: string }>,
  choiceAWeights: ChoiceWeights,
  choiceBWeights: ChoiceWeights,
  choiceCWeights: ChoiceWeights,
  choiceDWeights?: ChoiceWeights | null,
): { winningChoice: string; ovrDelta: number } {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const v of votes) {
    counts[v.choice] = (counts[v.choice] || 0) + 1;
  }

  if (votes.length === 0) {
    const choices = choiceDWeights ? ["A", "B", "C", "D"] : ["A", "B", "C"];
    const winningChoice = choices[Math.floor(Math.random() * choices.length)];
    const weights = winningChoice === "A" ? choiceAWeights : winningChoice === "B" ? choiceBWeights : winningChoice === "C" ? choiceCWeights : choiceDWeights!;
    return { winningChoice, ovrDelta: resolveWeights(weights) };
  }

  const choices = choiceDWeights ? (["A", "B", "C", "D"] as const) : (["A", "B", "C"] as const);
  const maxCount = Math.max(...choices.map(c => counts[c]));
  const tiedChoices = choices.filter(c => counts[c] === maxCount);
  const winningChoice = tiedChoices[Math.floor(Math.random() * tiedChoices.length)];
  const weights = winningChoice === "A" ? choiceAWeights : winningChoice === "B" ? choiceBWeights : winningChoice === "C" ? choiceCWeights : (choiceDWeights ?? choiceCWeights);
  return { winningChoice, ovrDelta: resolveWeights(weights) };
}

export { ARCHETYPE_DEFS as archetypeDefs };
