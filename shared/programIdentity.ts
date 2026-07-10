/**
 * Program Identity — shared constants for the Team Identity Builder.
 *
 * Four pillars define a program's style:
 *   1. Offensive Identity  — how the offense operates
 *   2. Pitching Identity   — how pitching staff is built/used
 *   3. Recruiting Pitch    — primary selling point to recruits
 *   4. Program Culture     — internal team environment
 *
 * Effects are intentionally small and additive so no identity is "best".
 * Mechanical impact is +0.04–0.06 additive to coach multiplier (recruiting)
 * or +2–5pp retention — transparent and clearly documented per option.
 */

// ─── Offensive Identity ───────────────────────────────────────────────────────

export const OFFENSIVE_IDENTITIES = [
  {
    id: "contact",
    label: "Contact",
    icon: "🎯",
    tagline: "Put the ball in play",
    description: "High average, low strikeouts. You grind out at-bats and manufacture runs.",
    effect: "Small recruiting bonus for high-contact hitters (HIT ≥ 70).",
    recruitEffect: "contact_hitter",
  },
  {
    id: "power",
    label: "Power",
    icon: "💥",
    tagline: "Three true outcomes",
    description: "Built around the long ball. You want hitters who can drive the ball.",
    effect: "Small recruiting bonus for power hitters (PWR ≥ 70).",
    recruitEffect: "power_hitter",
  },
  {
    id: "speed",
    label: "Speed",
    icon: "⚡",
    tagline: "Pressure on every pitch",
    description: "First-to-third, stolen bases, hit-and-run. You make defense uncomfortable.",
    effect: "Small recruiting bonus for speedsters (SPD ≥ 70).",
    recruitEffect: "speed_hitter",
  },
  {
    id: "balanced",
    label: "Balanced",
    icon: "⚖️",
    tagline: "Adapt to any opponent",
    description: "No glaring weakness. Your lineup has tools for every situation.",
    effect: "No specialization. Slight bonus when recruiting well-rounded athletes.",
    recruitEffect: "balanced_hitter",
  },
] as const;

export type OffensiveIdentityId = typeof OFFENSIVE_IDENTITIES[number]["id"];

// ─── Pitching Identity ────────────────────────────────────────────────────────

export const PITCHING_IDENTITIES = [
  {
    id: "power_arms",
    label: "Power Arms",
    icon: "🔥",
    tagline: "Blow it by them",
    description: "High-velocity starters who miss bats. You recruit arms that overpower hitters.",
    effect: "Small recruiting bonus for high-velocity pitchers (VEL ≥ 70).",
    recruitEffect: "power_pitcher",
  },
  {
    id: "command",
    label: "Command",
    icon: "🎯",
    tagline: "Hit every corner",
    description: "Pitching to contact with elite control. Your guys throw strikes and induce weak contact.",
    effect: "Small recruiting bonus for control pitchers (CTRL ≥ 70).",
    recruitEffect: "command_pitcher",
  },
  {
    id: "ground_ball",
    label: "Ground Ball",
    icon: "🌊",
    tagline: "Let the defense work",
    description: "Sinkers, cutters, and backdoor breaking balls. Defense does the heavy lifting.",
    effect: "Small recruiting bonus for ground-ball pitchers (CTRL + STF balanced).",
    recruitEffect: "groundball_pitcher",
  },
  {
    id: "bullpen_depth",
    label: "Bullpen Depth",
    icon: "🛡️",
    tagline: "Everybody pitches",
    description: "Six-inning starters and a lockdown bullpen. Roles are fluid and matchup-driven.",
    effect: "Small recruiting bonus for relievers and multi-inning arms (STM < 60).",
    recruitEffect: "bullpen_pitcher",
  },
] as const;

export type PitchingIdentityId = typeof PITCHING_IDENTITIES[number]["id"];

// ─── Recruiting Pitch ─────────────────────────────────────────────────────────

export const RECRUITING_PITCHES = [
  {
    id: "development",
    label: "Development",
    icon: "📈",
    tagline: "We make you better",
    description: "Players leave your program noticeably improved. You pitch the process, not the destination.",
    effect: "+5% interest gain on email/phone to recruits who prioritize Player Development.",
    retentionNote: "Players who value development feel invested, minor retention benefit.",
    recruitPriority: "playerDevelopmentPriority",
  },
  {
    id: "playing_time",
    label: "Playing Time",
    icon: "⏱️",
    tagline: "Come start Day 1",
    description: "You guarantee opportunity. Recruits who want to play know your door is open.",
    effect: "+5% interest gain on visits/offers to recruits who prioritize Playing Time.",
    retentionNote: "Starters who get reps are more likely to stay.",
    recruitPriority: "playingTimePriority",
  },
  {
    id: "prestige",
    label: "Prestige",
    icon: "🏆",
    tagline: "Win at the highest level",
    description: "You recruit to your brand. National championships, TV exposure, and winning tradition.",
    effect: "+5% interest gain on offers to recruits who prioritize Reputation.",
    retentionNote: "Players drawn to prestige stay when team is winning.",
    recruitPriority: "reputationPriority",
  },
  {
    id: "academics",
    label: "Academics",
    icon: "📚",
    tagline: "Degree comes first",
    description: "You're building graduates. Student-athletes who value their education choose your program.",
    effect: "+5% interest gain on visits/emails to recruits who prioritize Academics.",
    retentionNote: "Academic players stay invested in their degree path.",
    recruitPriority: "academicsPriority",
  },
  {
    id: "campus_life",
    label: "Campus Life",
    icon: "🎓",
    tagline: "Love where you play",
    description: "Your campus and community are the sell. Atmosphere, facilities, and student experience.",
    effect: "+5% interest gain on campus visits to recruits who prioritize College Life.",
    retentionNote: "Players who love campus feel at home and are less likely to transfer.",
    recruitPriority: "collegeLifePriority",
  },
  {
    id: "pro_path",
    label: "Pro Path",
    icon: "🌟",
    tagline: "We get players drafted",
    description: "Your pipeline to the pros is the sell. Players who want to play professionally pick you.",
    effect: "+5% interest gain for 4★/5★ recruits who have draft ambitions.",
    retentionNote: "Draft-track players stay to maximize their draft stock.",
    recruitPriority: null,
  },
] as const;

export type RecruitingPitchId = typeof RECRUITING_PITCHES[number]["id"];

// ─── Program Culture ──────────────────────────────────────────────────────────

export const PROGRAM_CULTURES = [
  {
    id: "family",
    label: "Family",
    icon: "🤝",
    tagline: "Brotherhood first",
    description: "Players don't leave family. Culture, chemistry, and relationships keep your roster together.",
    retentionBonus: 0.04,
    effect: "+4pp transfer retention probability.",
  },
  {
    id: "discipline",
    label: "Discipline",
    icon: "⚔️",
    tagline: "Standards. Every day.",
    description: "Hard work and accountability. Your program attracts players who want structure.",
    retentionBonus: 0.03,
    effect: "+3pp transfer retention. Slight bonus for recruits who value Discipline.",
  },
  {
    id: "player_freedom",
    label: "Player Freedom",
    icon: "🕊️",
    tagline: "Play your game",
    description: "Less rigid, more creative. Players thrive in your system without being micromanaged.",
    retentionBonus: 0.02,
    effect: "+2pp retention. Slight bonus recruiting players who value autonomy.",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "📊",
    tagline: "The data doesn't lie",
    description: "Decisions backed by numbers. Tech-savvy players and families love your approach.",
    retentionBonus: 0.02,
    effect: "+2pp retention. Small bonus recruiting high-upside players who value development data.",
  },
  {
    id: "old_school",
    label: "Old School",
    icon: "🧢",
    tagline: "Play the game right",
    description: "Fundamentals, hustle, and respect for the game. Proven methods, proven results.",
    retentionBonus: 0.03,
    effect: "+3pp retention. Slight bonus for recruits who value tradition.",
  },
] as const;

export type ProgramCultureId = typeof PROGRAM_CULTURES[number]["id"];

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const IDENTITY_DEFAULTS = {
  offensiveIdentity: "balanced" as OffensiveIdentityId,
  pitchingIdentity: "command" as PitchingIdentityId,
  recruitingPitch: "development" as RecruitingPitchId,
  programCulture: "family" as ProgramCultureId,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getOffensiveIdentity(id: string | null | undefined) {
  return OFFENSIVE_IDENTITIES.find(x => x.id === id) ?? OFFENSIVE_IDENTITIES.find(x => x.id === "balanced")!;
}

export function getPitchingIdentity(id: string | null | undefined) {
  return PITCHING_IDENTITIES.find(x => x.id === id) ?? PITCHING_IDENTITIES.find(x => x.id === "command")!;
}

export function getRecruitingPitch(id: string | null | undefined) {
  return RECRUITING_PITCHES.find(x => x.id === id) ?? RECRUITING_PITCHES.find(x => x.id === "development")!;
}

export function getProgramCulture(id: string | null | undefined) {
  return PROGRAM_CULTURES.find(x => x.id === id) ?? PROGRAM_CULTURES.find(x => x.id === "family")!;
}

/**
 * Returns true if the given league phase allows identity editing.
 * Locked during active competition phases.
 */
export function canEditIdentity(currentPhase: string): boolean {
  const LOCKED_PHASES = new Set([
    "regular_season",
    "conference_championship",
    "conference_championships",
    "super_regionals",
    "cws",
  ]);
  // Check prefix for regular_season_week_N style
  if (currentPhase.startsWith("regular_season")) return false;
  return !LOCKED_PHASES.has(currentPhase);
}
