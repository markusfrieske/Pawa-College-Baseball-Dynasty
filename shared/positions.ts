export const PITCHER_POSITIONS = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"] as const;
export const CATCHER_POSITIONS = ["C"] as const;
export const INFIELD_POSITIONS = ["1B", "2B", "SS", "3B"] as const;
export const OUTFIELD_POSITIONS = ["OF", "DH"] as const;

export function isPitcher(position: string): boolean {
  return PITCHER_POSITIONS.includes(position as typeof PITCHER_POSITIONS[number]);
}

export function isCatcher(position: string): boolean {
  return CATCHER_POSITIONS.includes(position as typeof CATCHER_POSITIONS[number]);
}

export function isInfielder(position: string): boolean {
  return INFIELD_POSITIONS.includes(position as typeof INFIELD_POSITIONS[number]);
}

export function isOutfielder(position: string): boolean {
  return OUTFIELD_POSITIONS.includes(position as typeof OUTFIELD_POSITIONS[number]);
}

export function isHitter(position: string): boolean {
  return !isPitcher(position);
}

export function getPitcherRoleLabel(stamina: number): string {
  if (stamina >= 80) return "Weekend Starter";
  if (stamina >= 55) return "Midweek Starter";
  if (stamina >= 35) return "Middle Reliever";
  if (stamina >= 20) return "Setup";
  return "Closer";
}
