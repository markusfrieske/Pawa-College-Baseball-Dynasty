export type PhaseMood = "neutral" | "recruiting" | "spring" | "active" | "postseason" | "offseason" | "signing_day";
export type ParticleType = "none" | "snow" | "leaves" | "sparkles";

export interface MoodConfig {
  mood: PhaseMood;
  overlayH: number;
  overlayS: number;
  overlayOpacity: number;
  particleOpacity: number;
  particleType: ParticleType;
  shimmer: boolean;
  isPostseason: boolean;
  postseasonLabel: string;
}

const DEFAULTS: MoodConfig = {
  mood: "neutral",
  overlayH: 120,
  overlayS: 25,
  overlayOpacity: 0,
  particleOpacity: 0,
  particleType: "none",
  shimmer: false,
  isPostseason: false,
  postseasonLabel: "",
};

export const PHASE_MOODS: Record<string, MoodConfig> = {
  regular_season: {
    ...DEFAULTS,
    mood: "active",
  },
  preseason: {
    ...DEFAULTS,
    mood: "spring",
    overlayH: 85,
    overlayS: 45,
    overlayOpacity: 0.04,
    particleOpacity: 0.05,
    particleType: "leaves",
  },
  spring_training: {
    ...DEFAULTS,
    mood: "spring",
    overlayH: 85,
    overlayS: 45,
    overlayOpacity: 0.04,
    particleOpacity: 0.05,
    particleType: "leaves",
  },
  offseason_departures: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 240,
    overlayS: 25,
    overlayOpacity: 0.04,
    particleOpacity: 0.04,
    particleType: "snow",
  },
  offseason_recruiting_1: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 245,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
  },
  offseason_recruiting_2: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 250,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
  },
  offseason_recruiting_3: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 255,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
  },
  offseason_recruiting_4: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 260,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
  },
  offseason_walkons: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 240,
    overlayS: 25,
    overlayOpacity: 0.04,
    particleOpacity: 0.04,
    particleType: "snow",
  },
  offseason_signing_day: {
    ...DEFAULTS,
    mood: "signing_day",
    overlayH: 43,
    overlayS: 30,
    overlayOpacity: 0.03,
    particleOpacity: 0.06,
    particleType: "sparkles",
  },
  conference_championship: {
    ...DEFAULTS,
    mood: "postseason",
    overlayH: 43,
    overlayS: 56,
    overlayOpacity: 0.06,
    particleOpacity: 0.06,
    particleType: "sparkles",
    shimmer: true,
    isPostseason: true,
    postseasonLabel: "Conference Championships",
  },
  super_regionals: {
    ...DEFAULTS,
    mood: "postseason",
    overlayH: 43,
    overlayS: 58,
    overlayOpacity: 0.07,
    particleOpacity: 0.07,
    particleType: "sparkles",
    shimmer: true,
    isPostseason: true,
    postseasonLabel: "Super Regionals",
  },
  cws: {
    ...DEFAULTS,
    mood: "postseason",
    overlayH: 43,
    overlayS: 60,
    overlayOpacity: 0.08,
    particleOpacity: 0.08,
    particleType: "sparkles",
    shimmer: true,
    isPostseason: true,
    postseasonLabel: "College World Series",
  },
};

export function getMoodForPhase(phase: string): MoodConfig {
  if (PHASE_MOODS[phase]) return PHASE_MOODS[phase];
  if (phase.startsWith("offseason")) {
    return { ...DEFAULTS, mood: "offseason", overlayH: 120, overlayS: 15, overlayOpacity: 0 };
  }
  return DEFAULTS;
}
