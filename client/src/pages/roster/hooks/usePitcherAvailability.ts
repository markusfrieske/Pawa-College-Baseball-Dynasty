import { useMemo } from "react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { computePitcherAvailability, ALL_GAME_DAYS } from "@shared/pitcherRest";
import type { GameDay } from "@shared/pitcherRest";
import type { PitcherAvailRow, PitcherSlot } from "../types";

export function usePitcherAvailability(players: Player[], currentWeek: number): Map<string, PitcherAvailRow> {
  return useMemo(() => {
    const map = new Map<string, PitcherAvailRow>();
    for (const p of players) {
      if (!isPitcher(p.position)) continue;
      const slots: Record<string, PitcherSlot> = {};
      for (const day of ALL_GAME_DAYS) {
        slots[day] = computePitcherAvailability(
          p.lastPitchedOuts ?? 0,
          (p.lastPitchedWeek as number | null) ?? null,
          (p.lastPitchedDay as GameDay | null) ?? null,
          p.stamina ?? 50,
          currentWeek,
          day,
        );
      }
      map.set(p.id, {
        playerId: p.id,
        slots,
        lastPitchedOuts: p.lastPitchedOuts ?? 0,
        lastPitchedWeek: (p.lastPitchedWeek as number | null) ?? null,
        lastPitchedDay: (p.lastPitchedDay as string | null) ?? null,
        stamina: p.stamina ?? 50,
      });
    }
    return map;
  }, [players, currentWeek]);
}
