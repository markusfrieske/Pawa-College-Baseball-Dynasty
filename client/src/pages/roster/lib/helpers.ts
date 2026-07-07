import type { Player } from "@shared/schema";
import { isPitcher, isCatcher, isOutfielder } from "@shared/positions";

export const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitchers" },
  { value: "C", label: "Catchers" },
  { value: "IF", label: "Infielders" },
  { value: "OF", label: "Outfielders" },
];

export const eligibilityOptions = [
  { value: "all", label: "All Years" },
  { value: "FR", label: "Freshman" },
  { value: "SO", label: "Sophomore" },
  { value: "JR", label: "Junior" },
  { value: "SR", label: "Senior" },
];

export function ovrToStar(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}

export const ATTR_LABELS: Record<string, string> = {
  hitForAvg: "Contact",
  power: "Power",
  speed: "Speed",
  arm: "Arm",
  fielding: "Fielding",
  errorResistance: "Errors",
  clutch: "Clutch",
  vsLHP: "vs LHP",
  grit: "Grit",
  stealing: "Stealing",
  running: "Running",
  throwing: "Throwing",
  recovery: "Recovery",
  catcherAbility: "Catcher",
  velocity: "Velocity",
  control: "Control",
  stamina: "Stamina",
  stuff: "Stuff",
  wRISP: "W/RISP",
  vsLefty: "vs Lefty",
  poise: "Poise",
  heater: "Heater",
  agile: "Agile",
};

export function getTopAttrDeltas(
  deltas: Record<string, number> | null | undefined,
  limit = 3
): Array<{ label: string; delta: number }> {
  if (!deltas) return [];
  return Object.entries(deltas)
    .filter(([key, val]) => key !== "overall" && val !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([key, val]) => ({
      label: ATTR_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim(),
      delta: val,
    }));
}

export function groupPlayersByCategory(players: Player[]) {
  const byStarOvr = (a: Player, b: Player) => b.starRating - a.starRating || b.overall - a.overall;
  const pitchers = players.filter(p => isPitcher(p.position))
    .sort((a, b) => (b.stamina ?? 0) - (a.stamina ?? 0) || byStarOvr(a, b));
  const catchers = players.filter(p => isCatcher(p.position)).sort(byStarOvr);
  const firstBase = players.filter(p => p.position === "1B").sort(byStarOvr);
  const secondBase = players.filter(p => p.position === "2B").sort(byStarOvr);
  const thirdBase = players.filter(p => p.position === "3B").sort(byStarOvr);
  const shortstops = players.filter(p => p.position === "SS").sort(byStarOvr);
  const otherInfielders = players.filter(p => !isPitcher(p.position) && !isCatcher(p.position) && !isOutfielder(p.position) && !["1B","2B","3B","SS"].includes(p.position)).sort(byStarOvr);
  const outfielders = players.filter(p => isOutfielder(p.position)).sort(byStarOvr);
  return { pitchers, catchers, firstBase, secondBase, thirdBase, shortstops, otherInfielders, outfielders };
}

export function sortByDepth(list: Player[]): Player[] {
  return [...list].sort((a, b) => {
    const aOrder = a.depthOrder || 0;
    const bOrder = b.depthOrder || 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.overall - a.overall;
  });
}

export function availOutsToIpStr(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function availRestNeeded(outs: number): number {
  if (outs === 0) return 0;
  if (outs <= 3) return 1;
  if (outs <= 9) return 2;
  if (outs <= 15) return 3;
  if (outs <= 21) return 4;
  if (outs <= 27) return 5;
  return 6;
}

export const DAY_LABEL: Record<string, string> = {
  WED: "Wednesday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
