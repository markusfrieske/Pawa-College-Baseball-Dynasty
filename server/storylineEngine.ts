import type { ChoiceWeights, StorylineHiddenVars } from "@shared/schema";

// ─── Rating Delta Bands ────────────────────────────────────────────────────────
const DELTAS = {
  minor_pos:    [1, 3],
  moderate_pos: [4, 8],
  major_pos:    [9, 15],
  legendary_pos:[16, 22],
  minor_neg:    [-3, -1],
  moderate_neg: [-8, -4],
  major_neg:    [-15, -9],
  legendary_neg:[-22, -16],
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
  | "knuckleball_specialist" | "rivalry_recruit" | "generational_prodigy";

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
}

// Tier distribution: 1 legendary, 2 elite, 2 above_average, 3 average, 2 below_average = 10 total
const TIER_DISTRIBUTION: Record<string, number> = {
  legendary: 1,
  elite: 2,
  above_average: 2,
  average: 3,
  below_average: 2,
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
  config: StorylinePickConfig = { count: 10, legendaryCount: 1 },
): Array<{
  recruitId: string;
  archetype: Archetype;
  tier: string;
  hiddenVars: StorylineHiddenVars;
  isLegendary: boolean;
  imagePrompt: string;
}> {
  const usedIds = new Set<string>();
  const result: typeof recruits = [];

  // 1. Pick legendary slot (gems first, then blue chips, then high-star)
  const legendaryCandidates = shuffle(
    recruits.filter(r => r.isGenerationalGem || r.isBlueChip || r.starRank >= 4)
  );
  let legendaryPick: typeof recruits[0] | null = null;
  for (const r of legendaryCandidates) {
    if (!usedIds.has(r.id)) { legendaryPick = r; usedIds.add(r.id); break; }
  }
  if (legendaryPick) result.push(legendaryPick);

  // 2. Pick by tier buckets
  const tierBuckets: Record<string, typeof recruits> = {
    elite: shuffle(recruits.filter(r => r.overall >= 500 && !usedIds.has(r.id))),
    above_average: shuffle(recruits.filter(r => r.overall >= 350 && r.overall < 500 && !usedIds.has(r.id))),
    average: shuffle(recruits.filter(r => r.overall >= 250 && r.overall < 350 && !usedIds.has(r.id))),
    below_average: shuffle(recruits.filter(r => r.overall < 250 && !usedIds.has(r.id))),
  };

  const tierOrder: Array<keyof typeof TIER_DISTRIBUTION> = ["elite", "above_average", "average", "below_average"];
  for (const tier of tierOrder) {
    const needed = TIER_DISTRIBUTION[tier];
    const pool = tierBuckets[tier];
    let filled = 0;
    for (const r of pool) {
      if (filled >= needed) break;
      if (!usedIds.has(r.id)) {
        result.push(r);
        usedIds.add(r.id);
        filled++;
      }
    }
    // If a tier bucket is short, fill from any remaining recruit
    if (filled < needed) {
      const fallback = shuffle(recruits.filter(r => !usedIds.has(r.id)));
      for (const r of fallback) {
        if (filled >= needed) break;
        result.push(r);
        usedIds.add(r.id);
        filled++;
      }
    }
  }

  // Trim to target count if somehow over
  const selected = result.slice(0, config.count);
  const legendaryId = legendaryPick?.id;

  return selected.map(r => {
    const isLegendary = r.id === legendaryId;
    const archetype = pickArchetypeForRecruit(r, isLegendary);
    const tier = isLegendary ? "legendary" : getTierFromOVR(r.overall);
    const hiddenVars = rollHiddenVars(r.starRank, r.isBlueChip ?? false, isLegendary);
    const imagePrompt = buildImagePrompt(r.firstName, r.lastName, r.position, archetype, isLegendary);
    return { recruitId: r.id, archetype, tier, hiddenVars, isLegendary, imagePrompt };
  });
}

function pickArchetypeForRecruit(
  r: { starRank: number; isBlueChip?: boolean | null; isGenerationalGem?: boolean | null; position: string },
  isLegendary: boolean,
): Archetype {
  if (isLegendary) return "generational_prodigy";
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

  const interpolate = (text: string) => text.replace(/\{name\}/g, recruitName);

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

  // CPU simulation: if no votes, pick randomly weighted by choice count
  if (votes.length === 0) {
    const choices = choiceDWeights ? ["A", "B", "C", "D"] : ["A", "B", "C"];
    const winningChoice = choices[Math.floor(Math.random() * choices.length)];
    const weights = winningChoice === "A" ? choiceAWeights : winningChoice === "B" ? choiceBWeights : winningChoice === "C" ? choiceCWeights : choiceDWeights!;
    return { winningChoice, ovrDelta: resolveWeights(weights) };
  }

  const winningChoice = (["A", "B", "C", "D"] as const).reduce((best, c) => (counts[c] > counts[best] ? c : best), "A" as "A" | "B" | "C" | "D");
  const weights = winningChoice === "A" ? choiceAWeights : winningChoice === "B" ? choiceBWeights : winningChoice === "C" ? choiceCWeights : (choiceDWeights ?? choiceCWeights);
  return { winningChoice, ovrDelta: resolveWeights(weights) };
}

export { ARCHETYPE_DEFS as archetypeDefs };
