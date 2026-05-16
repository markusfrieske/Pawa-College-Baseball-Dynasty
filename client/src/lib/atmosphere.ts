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
  /** RGB triplet as space-separated integers e.g. "196 163 90" for use with rgb(var(--atm-accent) / alpha) */
  accentColor: string;
  /** RGB triplet for glow effects */
  glowColor: string;
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
  accentColor: "196 163 90",
  glowColor: "196 163 90",
};

export const PHASE_MOODS: Record<string, MoodConfig> = {
  regular_season: {
    ...DEFAULTS,
    mood: "active",
    accentColor: "80 160 90",
    glowColor: "60 140 70",
  },
  preseason: {
    ...DEFAULTS,
    mood: "spring",
    overlayH: 85,
    overlayS: 45,
    overlayOpacity: 0.04,
    particleOpacity: 0.05,
    particleType: "leaves",
    accentColor: "110 180 70",
    glowColor: "90 160 55",
  },
  spring_training: {
    ...DEFAULTS,
    mood: "spring",
    overlayH: 85,
    overlayS: 45,
    overlayOpacity: 0.04,
    particleOpacity: 0.05,
    particleType: "leaves",
    accentColor: "110 180 70",
    glowColor: "90 160 55",
  },
  offseason_departures: {
    ...DEFAULTS,
    mood: "offseason",
    overlayH: 200,
    overlayS: 15,
    overlayOpacity: 0.03,
    particleOpacity: 0,
    particleType: "none",
    accentColor: "90 110 100",
    glowColor: "70 90 80",
  },
  offseason_recruiting_1: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 245,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
    accentColor: "120 110 200",
    glowColor: "100 90 180",
  },
  offseason_recruiting_2: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 250,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
    accentColor: "120 110 200",
    glowColor: "100 90 180",
  },
  offseason_recruiting_3: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 255,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
    accentColor: "120 110 200",
    glowColor: "100 90 180",
  },
  offseason_recruiting_4: {
    ...DEFAULTS,
    mood: "recruiting",
    overlayH: 260,
    overlayS: 35,
    overlayOpacity: 0.05,
    particleOpacity: 0.05,
    particleType: "snow",
    accentColor: "120 110 200",
    glowColor: "100 90 180",
  },
  offseason_walkons: {
    ...DEFAULTS,
    mood: "offseason",
    overlayH: 200,
    overlayS: 12,
    overlayOpacity: 0.03,
    particleOpacity: 0,
    particleType: "none",
    accentColor: "90 110 100",
    glowColor: "70 90 80",
  },
  offseason_signing_day: {
    ...DEFAULTS,
    mood: "signing_day",
    overlayH: 43,
    overlayS: 30,
    overlayOpacity: 0.03,
    particleOpacity: 0.06,
    particleType: "sparkles",
    accentColor: "196 163 90",
    glowColor: "220 190 110",
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
    accentColor: "196 163 90",
    glowColor: "220 190 100",
  },
  conference_championships: {
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
    accentColor: "196 163 90",
    glowColor: "220 190 100",
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
    accentColor: "210 175 90",
    glowColor: "230 200 105",
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
    accentColor: "220 185 90",
    glowColor: "240 210 110",
  },
};

export function getMoodForPhase(phase: string): MoodConfig {
  if (PHASE_MOODS[phase]) return PHASE_MOODS[phase];
  if (phase.startsWith("offseason")) {
    return { ...DEFAULTS, mood: "offseason", overlayH: 120, overlayS: 15, overlayOpacity: 0 };
  }
  return DEFAULTS;
}
