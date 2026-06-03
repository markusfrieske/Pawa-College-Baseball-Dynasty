export type GameDay = "WED" | "FRI" | "SAT" | "SUN";

const DAY_OFFSET: Record<GameDay, number> = {
  WED: 0,
  FRI: 2,
  SAT: 3,
  SUN: 4,
};

export const GAME_TYPE_TO_DAY: Record<string, GameDay> = {
  midweek: "WED",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

export function ipToOuts(ip: string): number {
  const parts = String(ip).split(".");
  const whole = parseInt(parts[0]) || 0;
  const frac = parseInt(parts[1]) || 0;
  return whole * 3 + frac;
}

function outsToRestNeeded(outs: number): number {
  if (outs === 0) return 0;
  if (outs <= 3) return 1;
  if (outs <= 9) return 2;
  if (outs <= 15) return 3;
  if (outs <= 21) return 4;
  if (outs <= 27) return 5;
  return 6;
}

export function fullStaminaIP(stamina: number): number {
  return 1 + Math.floor((stamina || 50) / 15);
}

export interface PitcherSlotAvailability {
  available: boolean;
  limited: boolean;
  daysOfRest: number;
  suggestedMaxIP: number;
}

export function computePitcherAvailability(
  lastPitchedOuts: number,
  lastPitchedWeek: number | null,
  lastPitchedDay: GameDay | null,
  stamina: number,
  currentWeek: number,
  slot: GameDay,
): PitcherSlotAvailability {
  const maxIP = fullStaminaIP(stamina);

  if (lastPitchedWeek == null || lastPitchedDay == null || lastPitchedWeek !== currentWeek) {
    return { available: true, limited: false, daysOfRest: 99, suggestedMaxIP: maxIP };
  }

  const lastDayOffset = DAY_OFFSET[lastPitchedDay] ?? 0;
  const slotDayOffset = DAY_OFFSET[slot] ?? 0;

  if (slotDayOffset <= lastDayOffset) {
    return { available: true, limited: false, daysOfRest: 99, suggestedMaxIP: maxIP };
  }

  const daysOfRest = slotDayOffset - lastDayOffset;
  const restNeeded = outsToRestNeeded(lastPitchedOuts);

  let suggestedMaxIP: number;
  if (daysOfRest < restNeeded || daysOfRest === 0) {
    suggestedMaxIP = 0;
  } else if (daysOfRest === 1) {
    suggestedMaxIP = 1;
  } else if (daysOfRest === 2) {
    suggestedMaxIP = 2;
  } else if (daysOfRest === 3) {
    suggestedMaxIP = 4;
  } else if (daysOfRest === 4) {
    suggestedMaxIP = 5;
  } else {
    suggestedMaxIP = maxIP;
  }

  const available = suggestedMaxIP > 0;
  const limited = suggestedMaxIP > 0 && suggestedMaxIP <= 2;

  return { available, limited, daysOfRest, suggestedMaxIP };
}

export const ALL_GAME_DAYS: GameDay[] = ["WED", "FRI", "SAT", "SUN"];

export function computeWeeklyAvailability(
  lastPitchedOuts: number,
  lastPitchedWeek: number | null,
  lastPitchedDay: GameDay | null,
  stamina: number,
  currentWeek: number,
): Record<GameDay, PitcherSlotAvailability> {
  const result = {} as Record<GameDay, PitcherSlotAvailability>;
  for (const day of ALL_GAME_DAYS) {
    result[day] = computePitcherAvailability(
      lastPitchedOuts,
      lastPitchedWeek,
      lastPitchedDay,
      stamina,
      currentWeek,
      day,
    );
  }
  return result;
}
