import type { ReportFieldSource as FieldSource } from "./report-roster-identity";
import type { Player } from "@shared/schema";
import { playerName, matchRosterPlayer, ocrNumberOrDefault } from "./ocr-batting-merge";

export interface PitcherEntry {
  playerId: string;
  name: string;
  role: "starter" | "reliever" | "closer";
  ip: string;
  h: number; r: number; er: number; bb: number; so: number; hr: number;
  win: boolean; loss: boolean;
}

export function defaultPitcher(player: Player): PitcherEntry {
  return {
    playerId: player.id, name: playerName(player), role: "starter",
    ip: "0.0", h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, win: false, loss: false,
  };
}

export function ipToDecimal(ip: string): number {
  const [whole, frac] = ip.split(".");
  return (parseInt(whole) || 0) + (parseInt(frac) || 0) / 3;
}

export function liveEra(er: number, ip: string): string {
  const dec = ipToDecimal(ip);
  if (dec <= 0) return "--";
  return (9 * er / dec).toFixed(2);
}

export interface OcrPitchingPlayer {
  name?: string; ip?: string; h?: number; r?: number; er?: number; bb?: number; so?: number; hr?: number;
  decision?: "W" | "L" | "S" | null;
}

export function ocrPitchersToEntries(data: Record<string, unknown>, players: Player[]): PitcherEntry[] {
  const raw = (data.players as OcrPitchingPlayer[] | undefined) ?? [];
  return raw
    .map((p, idx) => {
      const match = matchRosterPlayer(p.name ?? "", players);
      const base = match ? defaultPitcher(match) : {
        playerId: `screenshot-${idx}-${p.name}`, name: p.name || `Unidentified pitcher ${idx + 1}`, role: "starter" as const,
        ip: "0.0", h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, win: false, loss: false,
      };
      return {
        ...base,
        role: idx === 0 ? "starter" as const : "reliever" as const,
        ip: p.ip ?? base.ip,
        h: ocrNumberOrDefault(p.h), r: ocrNumberOrDefault(p.r), er: ocrNumberOrDefault(p.er),
        bb: ocrNumberOrDefault(p.bb), so: ocrNumberOrDefault(p.so), hr: ocrNumberOrDefault(p.hr),
        win: p.decision === "W", loss: p.decision === "L",
      };
    });
}

const PITCHING_META_FIELDS: (keyof OcrPitchingPlayer)[] = ["h", "r", "er", "bb", "so", "hr"];

export function pitchingFieldMeta(side: "home" | "away", data: Record<string, unknown>, entries: PitcherEntry[]): Record<string, FieldSource> {
  const raw = (data.players as OcrPitchingPlayer[] | undefined ?? []);
  const meta: Record<string, FieldSource> = {};
  entries.forEach((entry, idx) => {
    const r = raw[idx];
    meta[`pitching.${side}.${entry.playerId}.name`] = r?.name != null ? "ocr" : "low";
    meta[`pitching.${side}.${entry.playerId}.ip`] = r?.ip != null ? "ocr" : "low";
    PITCHING_META_FIELDS.forEach(f => {
      meta[`pitching.${side}.${entry.playerId}.${f}`] = r?.[f] != null ? "ocr" : "low";
    });
  });
  return meta;
}

