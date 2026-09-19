import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
export type RosterLens = "overview" | "batting" | "pitching" | "fielding";
export type RatingKey = "hitForAvg" | "power" | "speed" | "clutch" | "velocity" | "control" | "stamina" | "stuff" | "arm" | "fielding" | "errorResistance";
export interface RatingColumn { key: RatingKey; label: string; short: string; }
export const rosterMetrics: Record<RosterLens, RatingColumn[]> = {
  overview: [],
  batting: [{key:"hitForAvg",label:"Hit for average",short:"HIT"},{key:"power",label:"Power",short:"PWR"},{key:"speed",label:"Speed",short:"SPD"},{key:"clutch",label:"Clutch",short:"CLT"}],
  pitching: [{key:"velocity",label:"Velocity rating",short:"VEL"},{key:"control",label:"Control",short:"CTL"},{key:"stamina",label:"Stamina",short:"STA"},{key:"stuff",label:"Stuff",short:"STF"}],
  fielding: [{key:"arm",label:"Arm",short:"ARM"},{key:"fielding",label:"Fielding",short:"FLD"},{key:"errorResistance",label:"Error resistance",short:"ERR"},{key:"speed",label:"Speed",short:"SPD"}],
};
export function rosterRating(player: Player, key: RatingKey): number | null {
  // Non-pitcher default pitching attributes are not evidence of a pitching role.
  if (["velocity","control","stamina","stuff"].includes(key) && !isPitcher(player.position)) return null;
  return player[key] ?? null;
}
