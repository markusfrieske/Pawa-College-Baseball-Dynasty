import type { Player } from "@shared/schema";
import type { FieldSource } from "@/components/ocr-review-screen";

export interface BatterEntry {
  playerId: string;
  name: string;
  position: string;
  ab: number; r: number; h: number; doubles: number; triples: number; hr: number;
  rbi: number; bb: number; so: number; sb: number;
  // True when OCR could not confidently read a name for this row (e.g. a name cut off by
  // a scroll boundary between two batting screenshots). The row is still kept — never
  // silently dropped — so the coach can identify/correct it during review.
  needsName?: boolean;
}

export interface OcrBattingPlayer {
  name?: string; position?: string | null;
  ab?: number; r?: number; h?: number; doubles?: number; triples?: number; hr?: number;
  rbi?: number; bb?: number; so?: number; sb?: number;
}

export function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

export function defaultBatter(player: Player): BatterEntry {
  return {
    playerId: player.id, name: playerName(player), position: player.position,
    ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0,
  };
}

export function normalizeOcrName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * OCR-extracted names come from Power Pros' own in-game display and can be romanized
 * differently than the roster spelling. This does a best-effort fuzzy match (exact name,
 * then last-name + first-initial, then last-name substring) so screenshot data prefills
 * against real roster players wherever possible. Unmatched names still import as
 * synthetic rows so the coach can see and fix them in the review form.
 */
export function matchRosterPlayer(ocrName: string, players: Player[]): Player | undefined {
  const norm = normalizeOcrName(ocrName);
  if (!norm) return undefined;
  const parts = norm.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const lastName = parts[parts.length - 1];
  const firstInitial = parts[0][0];

  const exact = players.find(p => normalizeOcrName(`${p.firstName} ${p.lastName}`) === norm);
  if (exact) return exact;

  const lastNameMatches = players.filter(p => p.lastName.toLowerCase() === lastName);
  if (lastNameMatches.length === 1) return lastNameMatches[0];
  if (lastNameMatches.length > 1) {
    return lastNameMatches.find(p => p.firstName.toLowerCase()[0] === firstInitial) ?? lastNameMatches[0];
  }

  return players.find(p => p.lastName.toLowerCase().includes(lastName) || lastName.includes(p.lastName.toLowerCase()));
}

export function ocrNumberOrDefault(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export const BATTING_META_FIELDS: (keyof OcrBattingPlayer)[] = ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"];

/** Count of OCR-provided (non-null) fields on a raw batting row — used to pick the most
 * complete duplicate when the same batter appears across multiple overlapping screenshots. */
export function battingRowCompleteness(p: OcrBattingPlayer): number {
  return (p.name ? 1 : 0) + BATTING_META_FIELDS.filter(f => p[f] != null).length;
}

export interface BattingMergeResult { entries: BatterEntry[]; fieldMeta: Record<string, FieldSource>; screenshotCount: number; }

/**
 * Merges row-level batting extractions from one or more screenshots of the same team/category
 * into a single deduplicated table. Power Pros' batting screen often doesn't fit on one
 * screen, so coaches attach multiple screenshots (with scroll overlap) per team; the same
 * player can appear in more than one screenshot and must be recognized as one row rather
 * than counted twice. Rows with an unreadable name are preserved (never dropped) and
 * flagged with `needsName` for the coach to resolve during review. Duplicates are resolved
 * by keeping whichever raw row has the most OCR-provided fields (most complete read).
 */
export function mergeBattingRows(side: "home" | "away", screenshots: OcrBattingPlayer[][], players: Player[]): BattingMergeResult {
  interface Candidate { key: string; row: OcrBattingPlayer; order: number; }
  const candidates: Candidate[] = [];
  let order = 0;
  let unnamedSeq = 0;
  screenshots.forEach(rows => {
    rows.forEach(row => {
      const hasName = !!(row.name && row.name.trim());
      let key: string;
      if (hasName) {
        const match = matchRosterPlayer(row.name!, players);
        key = match ? `player:${match.id}` : `unmatched:${normalizeOcrName(row.name!)}`;
      } else {
        // Rows with no readable name are never merged into each other — each stays distinct
        // so the coach can identify and fix each one individually.
        key = `noname:${unnamedSeq++}`;
      }
      candidates.push({ key, row, order: order++ });
    });
  });

  const groups = new Map<string, Candidate[]>();
  candidates.forEach(c => {
    if (!groups.has(c.key)) groups.set(c.key, []);
    groups.get(c.key)!.push(c);
  });

  const orderedKeys = Array.from(groups.keys()).sort(
    (a, b) => Math.min(...groups.get(a)!.map(c => c.order)) - Math.min(...groups.get(b)!.map(c => c.order))
  );

  const entries: BatterEntry[] = [];
  const fieldMeta: Record<string, FieldSource> = {};

  orderedKeys.forEach(key => {
    const group = groups.get(key)!;
    const best = group.reduce((a, b) => (battingRowCompleteness(b.row) >= battingRowCompleteness(a.row) ? b : a));
    const hasName = !!(best.row.name && best.row.name.trim());
    const match = hasName ? matchRosterPlayer(best.row.name!, players) : undefined;
    const base: BatterEntry = match
      ? { ...defaultBatter(match), needsName: false }
      : {
          playerId: `screenshot-${key}`,
          name: hasName ? best.row.name! : "(unidentified batter)",
          position: best.row.position ?? "?",
          ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0,
          needsName: !hasName,
        };
    const entry: BatterEntry = {
      ...base,
      ab: ocrNumberOrDefault(best.row.ab), r: ocrNumberOrDefault(best.row.r), h: ocrNumberOrDefault(best.row.h),
      doubles: ocrNumberOrDefault(best.row.doubles), triples: ocrNumberOrDefault(best.row.triples), hr: ocrNumberOrDefault(best.row.hr),
      rbi: ocrNumberOrDefault(best.row.rbi), bb: ocrNumberOrDefault(best.row.bb), so: ocrNumberOrDefault(best.row.so), sb: ocrNumberOrDefault(best.row.sb),
    };
    entries.push(entry);
    fieldMeta[`batting.${side}.${entry.playerId}.name`] = hasName ? "ocr" : "low";
    BATTING_META_FIELDS.forEach(f => {
      fieldMeta[`batting.${side}.${entry.playerId}.${f}`] = best.row[f] != null ? "ocr" : "low";
    });
  });

  return { entries, fieldMeta, screenshotCount: screenshots.length };
}
