import type { ChoiceWeights, StorylineHiddenVars } from "@shared/schema";

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
  eventText: string;
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
};

export function maybeTransitionArchetype(
  currentArchetype: Archetype,
  cumulativeOvrDelta: number,
  arcStage: number,
  isLegendary: boolean,
): Archetype {
  if (arcStage < 2) return currentArchetype;
  const transitionChance = isLegendary ? 0.60 : 0.35;
  if (Math.random() > transitionChance) return currentArchetype;

  const transitions = ARCHETYPE_TRANSITIONS[currentArchetype];
  if (cumulativeOvrDelta >= 15 && transitions.positive) return transitions.positive;
  if (cumulativeOvrDelta <= -15 && transitions.negative) return transitions.negative;
  return currentArchetype;
}

export const ARCHETYPES: Archetype[] = [
  "late_bloomer", "velocity_freak", "swing_rebuild", "position_change",
  "summer_breakout", "social_media_star", "confidence_crisis", "burnout_candidate",
  "injury_risk", "academic_concern", "transfer_rumors", "two_sport_athlete",
  "knuckleball_specialist", "rivalry_recruit", "generational_prodigy",
];

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
    description: "Under the radar now, but quietly growing into something special.",
    flavor: "He doesn't look like much in the box scores — yet.",
    events: [
      {
        id: "lb_1",
        eventText: "{name} has been putting in quiet extra work with the pitching coach after every practice. Sources say his stuff has noticeably ticked up. How does the coaching staff approach this development moment?",
        choiceA: "Push him harder — structured elite workload", choiceAOutcome: "The intense program pays dividends. His mechanics sharpen dramatically.", choiceAWeights: W.bold_pos,
        choiceB: "Let it breathe — controlled organic growth", choiceBOutcome: "He develops at his own pace, steady and sure.", choiceBWeights: W.safe_pos,
        choiceC: "Film review and analytical approach", choiceCOutcome: "Breaking down his mechanics on video reveals subtle adjustments.", choiceCWeights: W.neutral_up,
        choiceD: "Showcase him at a high-profile scrimmage", choiceDOutcome: "Competing against elite talent either accelerates or exposes him.", choiceDWeights: W.high_risk,
      },
      {
        id: "lb_2",
        eventText: "A regional scouting report on {name} quietly circulates. Whispers of a 'sleeper' catch attention — multiple programs are now paying closer attention than they let on.",
        choiceA: "Invite him for an official campus visit immediately", choiceAOutcome: "The official attention validates his trajectory and motivates a surge.", choiceAWeights: W.bold_pos,
        choiceB: "Maintain current relationship — steady build", choiceBOutcome: "Consistent communication proves more valuable than flashy moves.", choiceBWeights: W.safe_pos,
        choiceC: "Send a detailed film breakdown showing belief", choiceCOutcome: "Showing you've studied his game impresses him.", choiceCWeights: W.neutral_up,
      },
      {
        id: "lb_3",
        eventText: "{name} posted a viral batting practice video that has every scout's inbox flooded. He looks like a different player. The question is whether it translates to game action.",
        choiceA: "Offer a scholarship now — before others do", choiceAOutcome: "Moving first locks him in and provides a stability boost.", choiceAWeights: W.bold_pos,
        choiceB: "Schedule a head coach visit this weekend", choiceBOutcome: "The personal touch from the head coach strengthens the relationship.", choiceBWeights: W.safe_pos,
        choiceC: "Let the tape speak — don't overreact", choiceCOutcome: "Measured response. He notices teams that don't panic.", choiceCWeights: W.cautious,
        choiceD: "Host a private workout for thorough evaluation", choiceDOutcome: "The workout either confirms the viral clip or exposes limitations.", choiceDWeights: W.high_risk,
      },
    ],
  },

  velocity_freak: {
    name: "The Velocity Freak",
    description: "Triple-digit heat, zero idea where it's going. Electric arm, erratic results.",
    flavor: "The radar gun loves him. The strike zone… less so.",
    events: [
      {
        id: "vf_1",
        eventText: "{name} touched 98 mph in a bullpen session but walked seven in his last start. His arm is electric; his command is absent. The pitching coach debate is getting heated.",
        choiceA: "Full mechanics overhaul — the velocity can wait", choiceAOutcome: "The rebuild works. His command improves at the cost of some velocity.", choiceAWeights: W.safe_pos,
        choiceB: "Throw more. Trust the reps to iron out command", choiceBOutcome: "Volume brings either breakthrough or breakdown.", choiceBWeights: W.high_risk,
        choiceC: "Bullpen work only — live game pressure later", choiceCOutcome: "Controlled environment builds confidence step by step.", choiceCWeights: W.neutral_up,
        choiceD: "Bring in a specialist curveball coach", choiceDOutcome: "Adding a secondary pitch might unlock everything — or overwhelm him.", choiceDWeights: W.bold_pos,
      },
      {
        id: "vf_2",
        eventText: "The {name} experiment is dividing opinions. His pure stuff rates elite but game results are inconsistent. MLB scouts are still showing up — the ceiling conversations are real.",
        choiceA: "Start him in a big conference game — sink or swim", choiceAOutcome: "Facing elite competition might crystallize his development.", choiceAWeights: W.high_risk,
        choiceB: "Structured approach: mid-week starts only", choiceBOutcome: "Low-pressure reps build a foundation.", choiceBWeights: W.safe_pos,
        choiceC: "Mental performance coaching sessions", choiceCOutcome: "Addressing the mental game changes everything.", choiceCWeights: W.neutral_up,
      },
      {
        id: "vf_3",
        eventText: "{name}'s fastball clocked 101 at the state showcase. Rival coaches are shaking their heads. Now he has to decide: keep pursuing the pure power approach or add refinement?",
        choiceA: "Offer a full scholarship on the spot", choiceAOutcome: "Locking him in now secures the upside.", choiceAWeights: W.bold_pos,
        choiceB: "Suggest he focus on the off-speed this summer", choiceBOutcome: "The off-speed development transforms him into a complete pitcher.", choiceBWeights: W.safe_pos,
        choiceC: "Introduce him to an MLB pitcher mentor", choiceCOutcome: "Mentorship from a pro unlocks his full potential or raises expectations too high.", choiceCWeights: W.bold_pos,
        choiceD: "Wait and see — don't commit yet", choiceDOutcome: "Holding back while rivals move could cost the relationship.", choiceDWeights: W.risky_neg,
      },
    ],
  },

  swing_rebuild: {
    name: "The Swing Rebuilder",
    description: "Tearing down a flawed swing to build something elite. Brutal process, massive upside.",
    flavor: "He hit .198 last summer. Now he's rebuilding from scratch with elite coaching.",
    events: [
      {
        id: "sr_1",
        eventText: "{name} is in the middle of a full swing overhaul with a renowned hitting instructor. His numbers have temporarily cratered, but the underlying metrics look promising. Risk or reward?",
        choiceA: "Accelerate the rebuild — all-in on new approach", choiceAOutcome: "The aggressive timeline either completes the transformation or breaks the process.", choiceAWeights: W.high_risk,
        choiceB: "Support the process with patient communication", choiceBOutcome: "He feels understood and valued. The rebuild continues with confidence.", choiceBWeights: W.safe_pos,
        choiceC: "Offer specialized hitting facility access", choiceCOutcome: "Elite resources make the difference in his development.", choiceCWeights: W.bold_pos,
        choiceD: "Suggest a hybrid approach — partial adjustment only", choiceDOutcome: "Compromise might preserve contact while adding power.", choiceDWeights: W.neutral_up,
      },
      {
        id: "sr_2",
        eventText: "Three months into his swing rebuild, {name} went 3-for-4 with two homers in a scrimmage. Scouts who saw the old swing are skeptical. Those who saw this one aren't.",
        choiceA: "Invite him to a live game showcase immediately", choiceAOutcome: "Game performance either validates everything or reveals the rebuild needs more time.", choiceAWeights: W.high_risk,
        choiceB: "Continue the relationship with detailed evaluation support", choiceBOutcome: "Steady engagement builds mutual trust.", choiceBWeights: W.safe_pos,
        choiceC: "Share the analytical data with him — show him the proof", choiceCOutcome: "Showing the exit velocity and angle data electrifies his confidence.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  position_change: {
    name: "The Convert",
    description: "Moving positions entirely. Athleticism is there — the question is the learning curve.",
    flavor: "He spent three years at shortstop. Now they want him behind the plate.",
    events: [
      {
        id: "pc_1",
        eventText: "{name} is converting from outfield to catcher, and the transition is fascinating scouts. His athleticism is off the charts, but the position requires years to master. How do you handle this?",
        choiceA: "Offer resources: dedicated catcher development staff", choiceAOutcome: "Elite instruction accelerates the conversion.", choiceAWeights: W.bold_pos,
        choiceB: "Let him choose his timeline for the switch", choiceBOutcome: "Ownership of the decision increases his commitment.", choiceBWeights: W.safe_pos,
        choiceC: "Suggest dual-position development path", choiceCOutcome: "Flexibility could make him more valuable — or unfocused.", choiceCWeights: W.neutral_up,
        choiceD: "Push the conversion aggressively — compete immediately", choiceDOutcome: "Throwing him in immediately could accelerate or derail the process.", choiceDWeights: W.high_risk,
      },
      {
        id: "pc_2",
        eventText: "After eight weeks at his new position, {name} is showing unexpected aptitude. His blocking has improved dramatically. One scout called him 'a future stud back there.' Momentum is real.",
        choiceA: "Lock in a commitment around his new position", choiceAOutcome: "Showing positional belief cements the relationship.", choiceAWeights: W.bold_pos,
        choiceB: "Schedule a visit focused on position development", choiceBOutcome: "Facility and coaching tours impress him.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a college player making the same transition", choiceCOutcome: "Peer mentorship is surprisingly impactful.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  summer_breakout: {
    name: "The Summer Breakout",
    description: "Had the summer of his life on the showcase circuit. Boards lit up overnight.",
    flavor: "Nobody knew his name in June. Everyone does now.",
    events: [
      {
        id: "sb_1",
        eventText: "{name} dominated three consecutive showcase events over the summer, launching himself from unranked to a top-30 prospect in his state. The attention is new — and overwhelming.",
        choiceA: "Strike fast: official offer before the buzz fades", choiceAOutcome: "Being first with an offer in a hot market is decisive.", choiceAWeights: W.bold_pos,
        choiceB: "Build a personal relationship amid the chaos", choiceBOutcome: "While others throw scholarships, you listen. He notices.", choiceBWeights: W.safe_pos,
        choiceC: "Invite his family for a campus visit", choiceCOutcome: "Family approval is often the deciding factor.", choiceCWeights: W.neutral_up,
        choiceD: "Hold back — evaluate if this is real development or a hot streak", choiceDOutcome: "Waiting too long while rivals act costs you the relationship.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sb_2",
        eventText: "{name}'s fall season results are under a microscope. Everyone wants to see if the summer performance was real. He's pressing — and it shows in early fall games.",
        choiceA: "Encourage him: remind him of what you saw this summer", choiceAOutcome: "Your belief in him when he's pressing steadies him.", choiceAWeights: W.safe_pos,
        choiceB: "Reduce pressure: let him know the offer stands regardless", choiceBOutcome: "Unconditional support unlocks his natural game.", choiceBWeights: W.bold_pos,
        choiceC: "Send detailed analytical breakdown of why he's good", choiceCOutcome: "Data-driven encouragement resonates with him specifically.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  social_media_star: {
    name: "The Social Media Star",
    description: "Massive following, highlight-reel plays. Is the brand bigger than the game?",
    flavor: "2.4M followers on a pitching account. His ERA, though…",
    events: [
      {
        id: "sm_1",
        eventText: "{name}'s latest training montage has 8 million views. Corporate sponsorship inquiries are pouring in. His focus on his brand is raising legitimate questions about his priorities.",
        choiceA: "Embrace the platform — help him leverage it", choiceAOutcome: "Working with the brand instead of against it creates a motivated and focused player.", choiceAWeights: W.bold_pos,
        choiceB: "Have a frank conversation about priorities", choiceBOutcome: "The honest discussion either refocuses him or creates friction.", choiceBWeights: W.high_risk,
        choiceC: "Connect him with a current player managing similar attention", choiceCOutcome: "Peer mentorship from someone who navigated this is invaluable.", choiceCWeights: W.safe_pos,
        choiceD: "Stay quiet — let the distractions play out naturally", choiceDOutcome: "Watching without acting risks losing him to a flashier program.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sm_2",
        eventText: "{name} posted a controversial tweet that caught backlash. Now scouts are questioning his character. Some programs quietly dropped him. You have a decision to make.",
        choiceA: "Stand by him publicly — show character-first values", choiceAOutcome: "Your loyalty in a hard moment creates an unbreakable bond.", choiceAWeights: W.bold_pos,
        choiceB: "Private conversation first, then decide", choiceBOutcome: "Understanding the full story before acting is the mature move.", choiceBWeights: W.safe_pos,
        choiceC: "Pull back and reassess — risk isn't worth it", choiceCOutcome: "Protecting the program reputation means a missed opportunity.", choiceCWeights: W.risky_neg,
      },
    ],
  },

  confidence_crisis: {
    name: "The Confidence Crisis",
    description: "Immense talent haunted by self-doubt. The mental game is the battleground.",
    flavor: "Coaches say he's a top-5 talent. He thinks he's barely average.",
    events: [
      {
        id: "cc_1",
        eventText: "{name} went 0-for-12 in his last three games and is visibly struggling mentally. Scouts who watched him six weeks ago are confused — this doesn't look like the same player.",
        choiceA: "Send a handwritten letter emphasizing your belief in him", choiceAOutcome: "The personal gesture cuts through the noise and reignites his confidence.", choiceAWeights: W.bold_pos,
        choiceB: "Schedule a phone call — just to talk, not recruit", choiceBOutcome: "Human connection over recruiting tactics changes the dynamic.", choiceBWeights: W.safe_pos,
        choiceC: "Offer access to your sports psychologist", choiceCOutcome: "Professional mental coaching could be the missing piece.", choiceCWeights: W.neutral_up,
        choiceD: "Give him space — don't add pressure right now", choiceDOutcome: "Absence during a dark moment can cost the relationship permanently.", choiceDWeights: W.risky_neg,
      },
      {
        id: "cc_2",
        eventText: "{name} had a breakthrough game — 4 hits including a walk-off homer. He's riding a wave of emotion. This is the moment to build a foundation, not exploit it.",
        choiceA: "Be there immediately — share the joy genuinely", choiceAOutcome: "Your authentic celebration of his success deepens trust.", choiceAWeights: W.safe_pos,
        choiceB: "Offer a scholarship in the moment — capitalize on the high", choiceBOutcome: "The timing either feels inspired or opportunistic.", choiceBWeights: W.high_risk,
        choiceC: "Send a meaningful film clip highlighting what made the game special", choiceCOutcome: "Showing you understand his game at a deep level resonates.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  burnout_candidate: {
    name: "The Burnout Risk",
    description: "Played year-round since age 10. The mileage is showing. Something has to give.",
    flavor: "Elite talent, but the engine is running on fumes.",
    events: [
      {
        id: "bc_1",
        eventText: "{name} showed up to a summer showcase visibly exhausted. He's been pitching for three different travel teams simultaneously. His performance was below expectations but scouts are still watching.",
        choiceA: "Encourage a rest period — champion his recovery", choiceAOutcome: "Advocating for his health builds enormous trust and enables a comeback.", choiceAWeights: W.bold_pos,
        choiceB: "Schedule a lighter showcase opportunity instead", choiceBOutcome: "A smaller stage with lower stakes lets him perform authentically.", choiceBWeights: W.safe_pos,
        choiceC: "Have a direct conversation about workload management", choiceCOutcome: "Concrete planning reduces burnout risk and builds confidence.", choiceCWeights: W.neutral_up,
        choiceD: "Push through — the next showcase is too important to miss", choiceDOutcome: "Pushing an exhausted athlete can trigger serious physical or mental setbacks.", choiceDWeights: W.risky_neg,
      },
      {
        id: "bc_2",
        eventText: "Reports surface that {name} is seriously considering stepping away from baseball for a semester to recover mentally. His family supports the idea. This is a crucial moment.",
        choiceA: "Support the break — promise his spot will be here when he returns", choiceAOutcome: "Showing you value him as a person over a recruit creates lifelong loyalty.", choiceAWeights: W.bold_pos,
        choiceB: "Offer flexible program options — reduced schedule freshman year", choiceBOutcome: "Creative solutions address his real concerns.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a current player who took similar time off", choiceCOutcome: "Peer perspective on returning from a break is powerfully reassuring.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  injury_risk: {
    name: "The Comeback Kid",
    description: "Coming off a significant injury. The talent is undeniable; the question marks are real.",
    flavor: "Tommy John at 17. Back on the mound at 18. Still lighting up radars.",
    events: [
      {
        id: "ir_1",
        eventText: "{name} is eight months post-surgery and throwing in bullpen sessions again. Scouts are cautiously optimistic but no one is fully committing yet. His velocity is at 87% of pre-injury levels.",
        choiceA: "Commit fully — show you believe in his full recovery", choiceAOutcome: "Your early trust sets the foundation for a loyal, motivated player.", choiceAWeights: W.bold_pos,
        choiceB: "Express genuine interest but wait for full medical clearance", choiceBOutcome: "Measured approach respects both parties.", choiceBWeights: W.safe_pos,
        choiceC: "Offer to pay for an independent medical evaluation", choiceCOutcome: "Investing in his health signals your seriousness and builds trust.", choiceCWeights: W.neutral_up,
        choiceD: "Wait to see full velocity return before engaging seriously", choiceDOutcome: "Too cautious — rivals who showed faith earlier have the advantage.", choiceDWeights: W.risky_neg,
      },
      {
        id: "ir_2",
        eventText: "{name} hit 94 mph in his return start — his highest velocity since before the injury. The buzz is electric. But he felt tightness in the elbow afterward and is being extra cautious.",
        choiceA: "Encourage aggressive timeline — showcase him at a big event", choiceAOutcome: "Rushing the return risks re-injury and destroys trust.", choiceAWeights: W.risky_neg,
        choiceB: "Support the cautious approach fully", choiceBOutcome: "Patience and support build the relationship for the long game.", choiceBWeights: W.safe_pos,
        choiceC: "Offer specialized biomechanics consultation", choiceCOutcome: "Elite medical resources make a real difference in recovery confidence.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  academic_concern: {
    name: "The Eligibility Question",
    description: "Borderline GPA. Dreams of college ball. Needs academic support to get there.",
    flavor: "Coach says he's his best player. The registrar has concerns.",
    events: [
      {
        id: "ac_1",
        eventText: "{name} needs a 2.8 GPA in his final semester to meet minimum eligibility requirements. He's currently at a 2.5. There's a tutor available but it means giving up some showcase appearances.",
        choiceA: "Fund a dedicated academic tutoring program for him", choiceAOutcome: "The investment in his education pays dividends in loyalty and eligibility.", choiceAWeights: W.bold_pos,
        choiceB: "Connect him with current players who navigated similar situations", choiceBOutcome: "Peer guidance is highly effective for academic motivation.", choiceBWeights: W.safe_pos,
        choiceC: "Maintain recruiting relationship without academic involvement", choiceCOutcome: "Non-intervention is neutral but misses a chance to differentiate.", choiceCWeights: W.cautious,
        choiceD: "Look for academic programs that might fit his current GPA", choiceDOutcome: "Finding creative academic paths shows you're invested in his whole future.", choiceDWeights: W.neutral_up,
      },
      {
        id: "ac_2",
        eventText: "{name} passed all his classes and cleared eligibility — but barely. His family is relieved and he's motivated to prove he belongs. Now the question is who he commits to.",
        choiceA: "Celebrate the achievement personally and follow up immediately", choiceAOutcome: "Sharing in the victory builds a genuine personal bond.", choiceAWeights: W.safe_pos,
        choiceB: "Offer a scholarship — reward the hard work", choiceBOutcome: "Moving at the moment of achievement cements the relationship.", choiceBWeights: W.bold_pos,
        choiceC: "Highlight your academic support services in detail", choiceCOutcome: "Showing continued academic investment addresses his real concerns.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  transfer_rumors: {
    name: "The Rumor Mill",
    description: "Every week there's a new 'leader.' He's been committed three times. Trust is everything here.",
    flavor: "He decommitted from two top-10 programs. Now he's 'evaluating everything.'",
    events: [
      {
        id: "tr_1",
        eventText: "{name} decommitted from his verbal commitment overnight, citing a 'desire to explore other options.' Every program in the region is calling. Your relationship is established — but is it enough?",
        choiceA: "Move immediately — campus visit this weekend", choiceAOutcome: "Speed and decisiveness in a competitive situation wins the room.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out personally — don't pitch, just listen", choiceBOutcome: "Understanding the real reason for the decommitment gives you a real advantage.", choiceBWeights: W.safe_pos,
        choiceC: "Let the dust settle before engaging seriously", choiceCOutcome: "Waiting gives rivals time to build stronger relationships.", choiceCWeights: W.risky_neg,
        choiceD: "Have your best player call him directly", choiceDOutcome: "Peer recruitment in this situation can be the decisive factor.", choiceDWeights: W.neutral_up,
      },
      {
        id: "tr_2",
        eventText: "A national media report lists {name} as 'likely headed to' a rival program. Insiders say it's not that simple — there are real concerns about the rival's coaching staff.",
        choiceA: "Address the report directly — ask if there's anything you can answer", choiceAOutcome: "Transparency cuts through rumors and shows confidence.", choiceAWeights: W.safe_pos,
        choiceB: "Don't acknowledge the report — continue your normal approach", choiceBOutcome: "Staying steady while others react demonstrates maturity.", choiceBWeights: W.neutral_up,
        choiceC: "Intensify the pitch — make the competing offer clearly superior", choiceCOutcome: "Coming in stronger can flip the narrative — or feel desperate.", choiceCWeights: W.high_risk,
      },
    ],
  },

  two_sport_athlete: {
    name: "The Two-Sport Athlete",
    description: "Elite talent in baseball AND football. Division 1 offers in both. The clock is ticking.",
    flavor: "Power conference football offer on the table. He loves baseball more, but football pays more.",
    events: [
      {
        id: "ts_1",
        eventText: "{name} just received a full football scholarship offer from a power conference program. His baseball coaches say he's a first-round bat. He's genuinely torn between the two sports.",
        choiceA: "Make the strongest possible baseball case — career earning potential, love of game", choiceAOutcome: "A compelling narrative about the baseball path convinces him this is his sport.", choiceAWeights: W.bold_pos,
        choiceB: "Let him explore — make clear the offer remains open", choiceBOutcome: "Respect for his process keeps the door open.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with professional baseball players who faced the same choice", choiceCOutcome: "Real stories from players who chose baseball are powerfully persuasive.", choiceCWeights: W.neutral_up,
        choiceD: "Offer a flexible arrangement — start baseball, football remains an option", choiceDOutcome: "Creative solutions address his real dilemma but complicate program planning.", choiceDWeights: W.high_risk,
      },
      {
        id: "ts_2",
        eventText: "{name} broke his wrist playing football in the offseason — 8 weeks minimum recovery. His baseball development window is now compressed. Programs are reassessing their interest.",
        choiceA: "Stand firm — express that your offer and belief are unchanged", choiceAOutcome: "Unconditional support during injury is rarely offered. He remembers it forever.", choiceAWeights: W.bold_pos,
        choiceB: "Reassess the offer level based on the injury risk", choiceBOutcome: "Rational risk management, but he'll know you wavered.", choiceBWeights: W.risky_neg,
        choiceC: "Offer recovery resources — trainers, facilities", choiceCOutcome: "Investing in his recovery makes the path forward clear.", choiceCWeights: W.safe_pos,
      },
    ],
  },

  knuckleball_specialist: {
    name: "The Knuckleball Artist",
    description: "Throws a pitch nobody can teach. Impossible ceiling or career dead-end. Nobody knows.",
    flavor: "He throws one pitch. But good lord, can nobody hit it.",
    events: [
      {
        id: "kb_1",
        eventText: "{name}'s knuckleball clocked 52 mph and batters looked completely helpless against it in his last start. Every traditional pitching metric says he's a liability. Every actual result says otherwise.",
        choiceA: "Embrace the uniqueness — build your staff around him", choiceAOutcome: "Committing fully to his style unleashes his full potential.", choiceAWeights: W.high_risk,
        choiceB: "Encourage a second pitch as a safety net", choiceBOutcome: "Adding velocity as a backup option might help or might dilute the pure approach.", choiceBWeights: W.neutral_up,
        choiceC: "Connect him with a famous knuckleball pitcher for mentorship", choiceCOutcome: "Expert mentorship on this rare craft is transformational.", choiceCWeights: W.bold_pos,
        choiceD: "Evaluate the risk against traditional pitching development", choiceDOutcome: "Overthinking the approach makes him feel like a science project, not a player.", choiceDWeights: W.risky_neg,
      },
      {
        id: "kb_2",
        eventText: "Against a nationally ranked program, {name}'s knuckleball baffled 15 batters across 7 innings. Two scouts left without filing reports — they didn't know what to write. His future is genuinely unclear.",
        choiceA: "Champion the unconventional — show you see what others don't", choiceAOutcome: "Being the program that believed in his unique gift changes everything.", choiceAWeights: W.bold_pos,
        choiceB: "Offer but hedge — evaluate traditional stuff in parallel", choiceBOutcome: "Cautious approach misses the moment of peak belief.", choiceBWeights: W.cautious,
        choiceC: "Reach out to MLB teams who might track his development", choiceCOutcome: "Showing a professional pipeline for his unique path excites him enormously.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  rivalry_recruit: {
    name: "The Rivalry Flashpoint",
    description: "A top recruit from your biggest rival school's backyard. Landing him sends a message.",
    flavor: "He grew up rooting for your fiercest rival. This one's personal for both programs.",
    events: [
      {
        id: "rr_1",
        eventText: "{name} is from the heart of rival country. Every metric says he should sign with them. But something has him exploring. He's taken two visits to your program — more than anyone expected.",
        choiceA: "Make him feel like he'd be part of history — a culture shift", choiceAOutcome: "The 'become a legend here' narrative resonates deeply with competitive players.", choiceAWeights: W.bold_pos,
        choiceB: "Focus purely on fit and development — ignore the rivalry angle", choiceBOutcome: "The rivalry angle is noise. The fit conversation is substance.", choiceBWeights: W.safe_pos,
        choiceC: "Connect him with a player who made a similar choice and flourished", choiceCOutcome: "Proof that the risk paid off for someone else is persuasive.", choiceCWeights: W.neutral_up,
        choiceD: "Lean into the rivalry — make it about proving something", choiceDOutcome: "The chip-on-the-shoulder narrative either motivates or overwhelms him.", choiceDWeights: W.high_risk,
      },
      {
        id: "rr_2",
        eventText: "The rival program found out you're heavily recruiting {name} and has gone all-in. The head coach called. The assistant coach is texting his parents. The pressure is real.",
        choiceA: "Match the intensity — this is war, recruit accordingly", choiceAOutcome: "Going all-in on intensity can win the battle but risks alienating the player.", choiceAWeights: W.high_risk,
        choiceB: "Be the steady, calmer voice in the chaos", choiceBOutcome: "When everyone else panics, your composure stands out.", choiceBWeights: W.safe_pos,
        choiceC: "Address it head-on: 'We want you here — here's exactly why'", choiceCOutcome: "Direct, honest communication in a chaotic moment builds trust.", choiceCWeights: W.bold_pos,
      },
    ],
  },

  // ─── Five Distinct Legendary Storyline Templates ─────────────────────────────
  the_phenom: {
    name: "The Phenom",
    description: "Once-in-a-generation talent whose ceiling scouts argue about in hushed tones.",
    flavor: "The numbers don't capture what he is. The eye test barely does.",
    events: [
      {
        id: "ph_1",
        eventText: "{name}'s showcase footage went viral overnight. Every major program's DM is full. He has 40+ scholarship offers and hasn't returned a single call. How do you cut through the noise?",
        choiceA: "Send a handwritten letter — analog in a digital world", choiceAOutcome: "The personal touch lands differently when everyone else is flooding his inbox.", choiceAWeights: W.bold_pos,
        choiceB: "Fly out with your head coach — show the full commitment", choiceBOutcome: "The in-person visit from your entire staff signals seriousness.", choiceBWeights: W.safe_pos,
        choiceC: "Connect with his high school coach first — earn trust through respect", choiceCOutcome: "Going through trusted relationships opens doors that cold contact can't.", choiceCWeights: W.neutral_up,
        choiceD: "Make a public offer — highest NIL deal in your program's history", choiceDOutcome: "Public money plays either excite him or set an uncomfortable precedent.", choiceDWeights: W.high_risk,
      },
      {
        id: "ph_2",
        eventText: "A scout pulls you aside after a {name} workout: 'I've seen one player like this in 30 years.' He's choosing between five elite programs next week. What's your closing argument?",
        choiceA: "Development path — show exactly how your program elevates phenoms to pros", choiceAOutcome: "The program's track record of developing elite talent speaks for itself.", choiceAWeights: W.bold_pos,
        choiceB: "Culture — let current players tell the story of what it means to be here", choiceBOutcome: "Peer testimonials from players he admires carry enormous weight.", choiceBWeights: W.safe_pos,
        choiceC: "Legacy — paint the picture of what his impact on your program's history could be", choiceCOutcome: "Elite players respond to the chance to define an era.", choiceCWeights: W.neutral_up,
      },
      {
        id: "ph_3",
        eventText: "Commitment day. {name} has narrowed it to two schools — yours and a rival. His family calls with one hour left. His mother says: 'Tell us one thing no one else has said.' What do you say?",
        choiceA: "Name a specific player you developed and what his life looks like now", choiceAOutcome: "The concrete, personal story is more powerful than any promise.", choiceAWeights: W.bold_pos,
        choiceB: "Tell her that her son is more than a prospect — you see the whole person", choiceBOutcome: "The statement that transcends baseball is the one she remembers.", choiceBWeights: W.safe_pos,
        choiceC: "Be honest about what you don't know — and how you'll face it together", choiceCOutcome: "Vulnerability from a head coach is disarming and memorable.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_collapse: {
    name: "The Collapse",
    description: "A top-ranked recruit whose world is falling apart — and how they respond defines everything.",
    flavor: "The talent was never the question. The question was always the person.",
    events: [
      {
        id: "tc_1",
        eventText: "{name} was the top recruit in his region six months ago. Now there are whispers — family situation, attitude issues, a drop in grades. His ranking has collapsed. Is this still a player worth recruiting?",
        choiceA: "Go deeper — reach out privately and hear the real story", choiceAOutcome: "Understanding what's actually happening puts you in a unique position of trust.", choiceAWeights: W.bold_pos,
        choiceB: "Watch from a distance — monitor the situation without committing", choiceBOutcome: "Cautious observation avoids risk but also avoids the relationship.", choiceBWeights: W.cautious,
        choiceC: "Pull back — the uncertainty is too great for a scholarship offer", choiceCOutcome: "Protecting your class from uncertainty is responsible — and costly if wrong.", choiceCWeights: W.risky_neg,
        choiceD: "Reach out through a trusted mentor in his community", choiceDOutcome: "Going through the right intermediary can open a door that direct contact can't.", choiceDWeights: W.neutral_up,
      },
      {
        id: "tc_2",
        eventText: "{name} opens up to you. His family is going through something serious. He says: 'I need a school that won't give up on me when things get hard.' The coaches who backed off are calling again now that he's stabilizing.",
        choiceA: "Stay steady — you were there when others weren't, and that matters", choiceAOutcome: "The coaches who showed up in the dark earn loyalty that doesn't fade.", choiceAWeights: W.bold_pos,
        choiceB: "Offer a hardship support framework — concrete help, not just words", choiceBOutcome: "Translating care into a real support plan signals a program built for people.", choiceBWeights: W.safe_pos,
        choiceC: "Be honest about the expectations — great relationships require honesty", choiceCOutcome: "Grounded honesty in this moment builds something real.", choiceCWeights: W.neutral_up,
      },
      {
        id: "tc_3",
        eventText: "{name} is back. His performance is trending up, his grades are recovering. The programs that left are now calling. He's told you: 'You were the only one who didn't ghost me.' How do you close?",
        choiceA: "Reference specific moments — show him you paid attention throughout", choiceAOutcome: "Remembering the details of someone's struggle is a profound form of respect.", choiceAWeights: W.bold_pos,
        choiceB: "Let him lead — ask what he wants from this chapter of his life", choiceBOutcome: "Putting him in control of the conversation gives him agency after a period of chaos.", choiceBWeights: W.safe_pos,
        choiceC: "Make the offer now — signal certainty in an uncertain time", choiceCOutcome: "A scholarship offer in the middle of a comeback is an act of faith with real power.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_two_sport_icon: {
    name: "The Two-Sport Icon",
    description: "Exceptional in two sports — and every program wants a piece of him, including football.",
    flavor: "He's the most recruited player in his county. In two sports.",
    events: [
      {
        id: "tsi_1",
        eventText: "{name} is a top baseball and football recruit. Both programs are making their pitches simultaneously. His agent — yes, he has an agent at 17 — says he's leaning toward the sport that shows him the clearest path. What's your argument for baseball?",
        choiceA: "Draft projection — show him the MLB path and the timeline", choiceAOutcome: "Elite baseball players often go pro faster than football. That story matters.", choiceAWeights: W.bold_pos,
        choiceB: "Health — baseball careers last longer, the body takes less punishment", choiceBOutcome: "The longevity argument lands differently when framed around his future.", choiceBWeights: W.safe_pos,
        choiceC: "Identity — he was born to play baseball, and your program will prove it", choiceCOutcome: "The emotional argument about who he really is cuts through the spreadsheets.", choiceCWeights: W.neutral_up,
        choiceD: "Flexibility — structure his commitment so he can explore both for longer", choiceDOutcome: "Offering the most flexibility either wins him or loses him to indecision.", choiceDWeights: W.high_risk,
      },
      {
        id: "tsi_2",
        eventText: "{name}'s football coach went public saying baseball would 'waste his potential.' It's created a media circus. He's being pulled in two directions and his commitment has been postponed indefinitely. How do you respond?",
        choiceA: "Stay entirely above the drama — let your program speak for itself", choiceAOutcome: "Dignity under fire signals a program with strong values.", choiceAWeights: W.bold_pos,
        choiceB: "Reach out privately to check in on him — not about baseball, about him", choiceBOutcome: "Checking on the person, not the recruit, is what rare coaches do.", choiceBWeights: W.safe_pos,
        choiceC: "Request a private meeting — present your full vision with no outside noise", choiceCOutcome: "The direct, quiet conversation is often the most powerful one.", choiceCWeights: W.neutral_up,
      },
      {
        id: "tsi_3",
        eventText: "{name} has made his decision — baseball. He tells you privately before the announcement. He says your program was 'the only one that made him feel like a baseball player, not a recruiting trophy.' How do you respond?",
        choiceA: "Tell him the story of a similar player who chose baseball and never looked back", choiceAOutcome: "Grounding the moment in someone else's success gives him something to hold.", choiceAWeights: W.safe_pos,
        choiceB: "Make him the centerpiece of your program's identity immediately", choiceBOutcome: "Investing fully from day one sets the tone for the entire relationship.", choiceBWeights: W.bold_pos,
        choiceC: "Keep it quiet — respect his timeline, let him control the announcement", choiceCOutcome: "Giving him control in a moment when everyone wanted to control him is meaningful.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  the_scientist: {
    name: "The Scientist",
    description: "A cerebral, analytically gifted recruit who evaluates programs the way scouts evaluate players.",
    flavor: "He's read every paper written about spin rate. He's cross-referencing your pitching staff with Statcast data.",
    events: [
      {
        id: "sci_1",
        eventText: "{name} sent your program a 12-page PDF comparing your pitching development metrics to eight other programs. He highlighted gaps. He called it 'preliminary diligence.' How do you respond to a 17-year-old who just audited your program?",
        choiceA: "Respond in kind — build a counter-presentation using your own data", choiceAOutcome: "Meeting him at his level signals a program that respects intelligence.", choiceAWeights: W.bold_pos,
        choiceB: "Set up a meeting with your analytics staff — let the numbers people talk", choiceBOutcome: "Connecting him with his future teammates in the data room is the right move.", choiceBWeights: W.safe_pos,
        choiceC: "Address his gaps directly — acknowledge what he found and your response plan", choiceCOutcome: "Intellectual honesty under scrutiny builds trust faster than defensiveness.", choiceCWeights: W.neutral_up,
        choiceD: "Call his coach — this level of formality from a recruit is a concern", choiceDOutcome: "Treating his intelligence as a problem is exactly the wrong read of who he is.", choiceDWeights: W.risky_neg,
      },
      {
        id: "sci_2",
        eventText: "{name} has narrowed his list by projected WAR contribution of recruits from each program over five years. He requests a 90-minute call specifically about your development philosophy. Your most analytical coach is traveling. How do you handle this?",
        choiceA: "Take the call yourself and be transparent about what you know and don't know", choiceAOutcome: "Intellectual humility from the head coach is exactly what a scientist respects.", choiceAWeights: W.bold_pos,
        choiceB: "Reschedule — get the right people on the call, don't wing it", choiceBOutcome: "Respecting the process shows you understand what he values.", choiceBWeights: W.safe_pos,
        choiceC: "Send a pre-call brief with your current data before the conversation", choiceCOutcome: "Arriving prepared signals a program that takes the conversation seriously.", choiceCWeights: W.neutral_up,
      },
      {
        id: "sci_3",
        eventText: "{name} has completed his analysis. He's chosen three finalists — your program is one of them. His final question: 'What would you do differently if you could rebuild your program with perfect data?' What's your answer?",
        choiceA: "Give a specific, honest answer — name a decision you'd change", choiceAOutcome: "The willingness to name a real mistake is the highest form of intellectual honesty.", choiceAWeights: W.bold_pos,
        choiceB: "Turn it back to him — ask what his model would change and engage with the answer", choiceBOutcome: "Making his insight part of the actual conversation elevates the relationship.", choiceBWeights: W.neutral_up,
        choiceC: "Describe your current data infrastructure and how you're already evolving", choiceCOutcome: "Showing the work in progress is better than describing the finished product.", choiceCWeights: W.safe_pos,
      },
    ],
  },

  folk_hero: {
    name: "The Folk Hero",
    description: "A recruit from a small town whose story has captured the imagination of an entire region.",
    flavor: "The whole county shuts down on his game days. He's never played before a crowd smaller than two thousand.",
    events: [
      {
        id: "fh_1",
        eventText: "{name} plays for a town of 800 people. His games draw crowds of 3,000. Local TV has done six features. He's the most famous person in his county, and he's never left the state. How do you build a relationship with someone whose entire world is in one place?",
        choiceA: "Go to his town — attend a game, walk the main street, meet the community", choiceAOutcome: "Showing up in someone's world sends a message that no zoom call can replicate.", choiceAWeights: W.bold_pos,
        choiceB: "Connect with his coach, his pastor, his neighbors — learn who he is through them", choiceBOutcome: "Understanding his world through the people who shaped it is the deepest kind of research.", choiceBWeights: W.safe_pos,
        choiceC: "Send a video from current players who came from similar backgrounds", choiceCOutcome: "Peer connection to players who understand the transition from small-town to college is powerful.", choiceCWeights: W.neutral_up,
        choiceD: "Lead with the academics — show how the education transforms family trajectories", choiceDOutcome: "For some recruits, the family's future matters more than the program's ranking.", choiceDWeights: W.neutral_up,
      },
      {
        id: "fh_2",
        eventText: "A national outlet writes a feature on {name}. Suddenly 30 new programs are calling. He tells you he's overwhelmed. 'I just want to play ball,' he says. 'Not perform for people.' How do you stand out in a suddenly crowded field?",
        choiceA: "Be direct: 'We won't make this bigger than it needs to be. Here's what we offer.'", choiceAOutcome: "Simplicity in a circus is its own kind of power.", choiceAWeights: W.bold_pos,
        choiceB: "Invite him for a quiet, private visit — no fanfare, just the program", choiceBOutcome: "A quiet visit signals you understand what he's asking for.", choiceBWeights: W.safe_pos,
        choiceC: "Acknowledge the noise and ask what he needs to tune it out", choiceCOutcome: "Recognizing the problem before offering a solution shows real listening.", choiceCWeights: W.neutral_up,
      },
      {
        id: "fh_3",
        eventText: "{name} has committed to your program. At the announcement, he says: 'I picked the school that felt like home.' The room cheers. His town cheers. You've gained not just a player — but a story. How do you honor that?",
        choiceA: "Invite the town — host a group visit from his community early in the season", choiceAOutcome: "Bringing his world into yours is an act of respect that defines the relationship.", choiceAWeights: W.bold_pos,
        choiceB: "Let him be the bridge — give him the platform to represent where he came from", choiceBOutcome: "Making him an ambassador for his story gives him something bigger to carry.", choiceBWeights: W.safe_pos,
        choiceC: "Keep it quiet — let the baseball speak for itself, the way he's always preferred", choiceCOutcome: "Respecting his preference for substance over spectacle is how you keep the trust.", choiceCWeights: W.neutral_up,
      },
    ],
  },

  generational_prodigy: {
    name: "The Generational Prodigy",
    description: "Once-in-a-decade talent. The pressure, the expectations, the weight of greatness.",
    flavor: "They're comparing him to players who've been in the Hall of Fame for 20 years.",
    events: [
      {
        id: "gp_1",
        eventText: "{name} is being called the best prospect in the country. Magazine features. National TV appearances. Every conversation about him starts with 'generational talent.' He's 17 years old and overwhelmed.",
        choiceA: "Offer a sanctuary — a program that protects him from the noise", choiceAOutcome: "Being the safe harbor in the storm of expectations is uniquely powerful.", choiceAWeights: W.bold_pos,
        choiceB: "Celebrate the recognition — lean into the greatness narrative", choiceBOutcome: "Matching his energy on the hype creates excitement about your program.", choiceBWeights: W.neutral_up,
        choiceC: "Connect with the parents first — they're overwhelmed too", choiceCOutcome: "Winning over the family is the decisive move with elite prospects.", choiceCWeights: W.safe_pos,
        choiceD: "Back off — the pressure around him is a recruiting liability", choiceDOutcome: "Pulling back while others push hard costs you a real shot at a generational player.", choiceDWeights: W.risky_neg,
      },
      {
        id: "gp_2",
        eventText: "A national publication projects {name} as a potential top-5 MLB Draft pick — after ONE year of college. The conversation around him has shifted from recruit to future professional. How do you respond?",
        choiceA: "Commit to a one-year max showcase plan — build his draft stock", choiceAOutcome: "Showing you understand and support his professional trajectory is a differentiator.", choiceAWeights: W.bold_pos,
        choiceB: "Emphasize the college experience — multiple years of development", choiceBOutcome: "The development and growth narrative appeals to players and families.", choiceBWeights: W.safe_pos,
        choiceC: "Let him set the timeline — total flexibility", choiceCOutcome: "Full flexibility either shows you're his partner or that you're not a serious program.", choiceCWeights: W.high_risk,
        choiceD: "Offer the biggest NIL package in your league's history", choiceDOutcome: "Financial power plays can win or create resentment that follows the relationship.", choiceDWeights: W.high_risk,
      },
      {
        id: "gp_3",
        eventText: "The night before {name}'s commitment announcement, his family reaches out to you privately. They have one final question: 'Can you protect him from himself when the pressure gets too much?'",
        choiceA: "Commit fully and specifically — name your plan", choiceAOutcome: "The specific, concrete answer to the right question wins the most important recruit of your career.", choiceAWeights: W.safe_pos,
        choiceB: "Speak from the heart — share your philosophy as a coach", choiceBOutcome: "Authenticity in this final moment seals a relationship built on genuine trust.", choiceBWeights: W.bold_pos,
        choiceC: "Reference specific player development success stories", choiceCOutcome: "Evidence-based answers satisfy parents who've heard promises before.", choiceCWeights: W.neutral_up,
      },
    ],
    legendaryEvents: [
      {
        id: "gp_legend_1",
        eventText: "LEGENDARY MOMENT — {name} posted numbers that haven't been seen at this level in recorded history. Multiple Hall of Famers have reached out personally. The whole sport is watching what happens next.",
        choiceA: "Be present at every milestone — make yourself part of his legend", choiceAOutcome: "Being woven into the greatest recruiting story of the era is priceless.", choiceAWeights: { minor_pos: 0.05, moderate_pos: 0.15, major_pos: 0.30, legendary_pos: 0.30, minor_neg: 0.02, moderate_neg: 0.04, major_neg: 0.06, legendary_neg: 0.03, neutral: 0.05 },
        choiceB: "Stay grounded — be the one voice of calm and reason", choiceBOutcome: "When everyone chases the star, the steady voice cuts through.", choiceBWeights: W.bold_pos,
        choiceC: "Publicly declare this is the greatest recruiting class of your career", choiceCOutcome: "Public commitment is bold — he either loves it or feels the weight.", choiceCWeights: W.high_risk,
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
    // Hard invariant: if pool was completely exhausted, backfill by re-assigning from already-
    // used recruits with a new tier label (guarantees exactly TARGET_COUNT total picks).
    if (filled < needed) {
      for (const { recruit: r } of [...picked].reverse()) {
        if (filled >= needed) break;
        // Only re-label if this recruit hasn't already been given a second label
        if (!picked.some(p => p.tier === name && p.recruit.id === r.id)) {
          picked.push({ recruit: r, tier: name });
          filled++;
        }
      }
    }
  }

  // Trim to exactly TARGET_COUNT (handles edge case where fallback overfilled)
  const finalPicked = picked.slice(0, TARGET_COUNT);

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
  if (r.isBlueChip) {
    const elite: Archetype[] = ["summer_breakout", "velocity_freak", "rivalry_recruit", "social_media_star", "generational_prodigy"];
    return elite[Math.floor(Math.random() * elite.length)];
  }
  if (r.position === "P") {
    const pitcherArch: Archetype[] = ["velocity_freak", "knuckleball_specialist", "burnout_candidate", "injury_risk", "late_bloomer"];
    return pitcherArch[Math.floor(Math.random() * pitcherArch.length)];
  }
  if (r.starRank <= 2) {
    const lowArch: Archetype[] = ["late_bloomer", "academic_concern", "position_change", "confidence_crisis"];
    return lowArch[Math.floor(Math.random() * lowArch.length)];
  }
  return ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
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
): {
  storylineRecruitId: string;
  leagueId: string;
  season: number;
  week: number;
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
  const template = pool[arcStage % pool.length];

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

  return {
    storylineRecruitId,
    leagueId,
    season,
    week,
    eventText: interpolate(template.eventText),
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
