/**
 * Power Pros Japanese stat mapping module.
 *
 * Single source of truth for all Japanese-to-English stat field translations used
 * across eBaseball Power Pros screenshots. Every screen type's column headers,
 * linescore labels, and decision markers are defined here so that mapping bugs or
 * new screen additions only require a change in one place.
 *
 * Usage:
 *   import { translateHeader, buildGlossaryText, COLUMN_ORDER, SCREEN_FIELDS } from "./powerProsMapping";
 *
 * Adding a new screen type:
 *   1. Add its header entries to HEADER_MAP below (or ADVANCED_CONTACT_HEADERS for
 *      the advanced-contact extension slot).
 *   2. Add a COLUMN_ORDER entry for the new category with the ordered column list.
 *   3. Update the LLM prompt helper (buildCategoryInstructions) if needed.
 */

// ---------------------------------------------------------------------------
// Core Japanese → English field name mapping
// ---------------------------------------------------------------------------

/**
 * Each entry describes one Japanese header/label found in Power Pros screenshots.
 *
 * - `japanese`   Raw Japanese text as it appears in the game UI.
 * - `english`    The app's internal English field key (used in parsed OCR JSON
 *                and box-score payload fields).
 * - `category`   Which screen type(s) this header appears on.
 * - `note`       Human-readable description / conversion hint for LLM prompts.
 * - `ignore`     If true, the field is present on-screen but should not be
 *                extracted (too noisy, computed elsewhere, or out of scope).
 */
export interface HeaderEntry {
  japanese: string;
  english: string;
  category: ScreenCategory | ScreenCategory[];
  note: string;
  ignore?: boolean;
}

export type ScreenCategory =
  | "batting"
  | "pitching"
  | "final_score"
  | "advanced_contact";

// ---------------------------------------------------------------------------
// Batting screen headers  (columns appear in this left-to-right order in game)
// ---------------------------------------------------------------------------
export const BATTING_HEADERS: HeaderEntry[] = [
  { japanese: "打数",   english: "ab",      category: "batting",  note: "at-bats" },
  { japanese: "得点",   english: "r",       category: "batting",  note: "runs scored" },
  { japanese: "安打",   english: "h",       category: "batting",  note: "hits" },
  { japanese: "二塁打", english: "doubles", category: "batting",  note: "doubles (2B)" },
  { japanese: "三塁打", english: "triples", category: "batting",  note: "triples (3B)" },
  { japanese: "本塁打", english: "hr",      category: "batting",  note: "home runs — also appears in final-score screen as a highlight label" },
  { japanese: "打点",   english: "rbi",     category: "batting",  note: "runs batted in" },
  { japanese: "三振",   english: "so",      category: "batting",  note: "strikeouts (batter struck out)" },
  { japanese: "四死球", english: "bb",      category: "batting",  note: "walks + hit-by-pitch combined; map to bb" },
  { japanese: "犠打",   english: "sac",     category: "batting",  note: "sacrifice bunts", ignore: true },
  { japanese: "盗塁",   english: "sb",      category: "batting",  note: "stolen bases" },
  { japanese: "併殺",   english: "gdp",     category: "batting",  note: "double plays grounded into", ignore: true },
  { japanese: "失策",   english: "e",       category: "batting",  note: "errors (fielding errors made by this player)" },
];

// ---------------------------------------------------------------------------
// Pitching screen headers  (left-to-right order)
// ---------------------------------------------------------------------------
export const PITCHING_HEADERS: HeaderEntry[] = [
  {
    japanese: "投球回",
    english:  "ip",
    category: "pitching",
    note:     'innings pitched — Power Pros shows fractions like "6 1/3"; convert to "6.1" notation (whole.outs where outs ∈ {0,1,2})',
  },
  { japanese: "球数",   english: "pc",  category: "pitching", note: "pitch count",    ignore: true },
  { japanese: "打者",   english: "bf",  category: "pitching", note: "batters faced",  ignore: true },
  { japanese: "被安打", english: "h",   category: "pitching", note: "hits allowed" },
  { japanese: "奪三振", english: "so",  category: "pitching", note: "strikeouts recorded by pitcher" },
  { japanese: "四死球", english: "bb",  category: "pitching", note: "walks + hit-by-pitch combined; map to bb" },
  { japanese: "失点",   english: "r",   category: "pitching", note: "runs allowed (total, including unearned)" },
  { japanese: "自責点", english: "er",  category: "pitching", note: "earned runs" },
  { japanese: "暴投",   english: "wp",  category: "pitching", note: "wild pitches",   ignore: true },
  { japanese: "被本塁打", english: "hr", category: "pitching", note: "home runs allowed" },
  { japanese: "防御率", english: "era", category: "pitching", note: "ERA (computed elsewhere; ignore unless no other ERA source)", ignore: true },
];

// ---------------------------------------------------------------------------
// Final-score / linescore screen labels
// ---------------------------------------------------------------------------
export const FINAL_SCORE_HEADERS: HeaderEntry[] = [
  // Inning columns: 一 through 九 are kanji numerals for innings 1–9
  { japanese: "一", english: "inning1",  category: "final_score", note: "runs in inning 1" },
  { japanese: "二", english: "inning2",  category: "final_score", note: "runs in inning 2" },
  { japanese: "三", english: "inning3",  category: "final_score", note: "runs in inning 3" },
  { japanese: "四", english: "inning4",  category: "final_score", note: "runs in inning 4" },
  { japanese: "五", english: "inning5",  category: "final_score", note: "runs in inning 5" },
  { japanese: "六", english: "inning6",  category: "final_score", note: "runs in inning 6" },
  { japanese: "七", english: "inning7",  category: "final_score", note: "runs in inning 7" },
  { japanese: "八", english: "inning8",  category: "final_score", note: "runs in inning 8" },
  { japanese: "九", english: "inning9",  category: "final_score", note: "runs in inning 9" },
  // Summary columns
  { japanese: "計", english: "totalRuns",  category: "final_score", note: "total runs (linescore R column)" },
  { japanese: "H",  english: "hits",       category: "final_score", note: "total hits (linescore H column)" },
  { japanese: "E",  english: "errors",     category: "final_score", note: "total errors (linescore E column)" },
  // Row labels
  { japanese: "V",  english: "away",  category: "final_score", note: "visitor / away team row" },
  // Decision badges shown below the linescore
  { japanese: "勝利",   english: "win",  category: "final_score", note: "winning pitcher label" },
  { japanese: "セーブ", english: "save", category: "final_score", note: "save pitcher label" },
  { japanese: "敗戦",   english: "loss", category: "final_score", note: "losing pitcher label" },
  { japanese: "本塁打", english: "homeRunHighlight", category: "final_score", note: "home run highlight row label" },
  // Misc
  { japanese: "試合時間", english: "gameTime", category: "final_score", note: "game duration (flavor only)", ignore: true },
];

// ---------------------------------------------------------------------------
// Decision markers on the pitching screen (badge on left side of pitcher row)
// ---------------------------------------------------------------------------
export const PITCHING_DECISION_MAP: Record<string, "W" | "L" | "S"> = {
  "勝":    "W",   // 勝 or 勝利 = Win
  "勝利":  "W",
  "敗":    "L",   // 敗 or 敗戦 = Loss
  "敗戦":  "L",
  "セーブ": "S",  // Save
  "Ｓ":    "S",   // Full-width S sometimes used
  "S":     "S",
  "W":     "W",
  "L":     "L",
};

// ---------------------------------------------------------------------------
// Team-total row label (appears at the bottom of batting/pitching grids)
// ---------------------------------------------------------------------------
export const TOTALS_ROW_LABELS = new Set(["合計", "計"]);

// ---------------------------------------------------------------------------
// Advanced-contact extension slot
// ---------------------------------------------------------------------------
/**
 * Headers for the optional advanced contact / outcome screen.
 * This screen is NOT one of the standard five categories but may appear in future
 * Power Pros builds or in user-captured data. Add new entries here; the core
 * mapping logic (translateHeader, buildGlossaryText) picks them up automatically.
 *
 * Known candidate headers (add more as screens are discovered):
 */
export const ADVANCED_CONTACT_HEADERS: HeaderEntry[] = [
  { japanese: "打率",   english: "avg",    category: "advanced_contact", note: "batting average (computed)" },
  { japanese: "出塁率", english: "obp",    category: "advanced_contact", note: "on-base percentage (computed)" },
  { japanese: "長打率", english: "slg",    category: "advanced_contact", note: "slugging percentage (computed)" },
  { japanese: "OPS",   english: "ops",    category: "advanced_contact", note: "on-base plus slugging (computed)" },
  { japanese: "WHIP",  english: "whip",   category: "advanced_contact", note: "walks + hits per inning pitched (computed)" },
  { japanese: "被打率", english: "bavg",   category: "advanced_contact", note: "opponent batting average against (pitching)" },
  { japanese: "K%",    english: "kPct",   category: "advanced_contact", note: "strikeout rate %" },
  { japanese: "BB%",   english: "bbPct",  category: "advanced_contact", note: "walk rate %" },
  // Add future advanced-screen columns here without touching the core mapping logic.
];

// ---------------------------------------------------------------------------
// Master lookup: all known headers in one flat map
// ---------------------------------------------------------------------------

/**
 * Combined flat map of all known Japanese headers across all screen types.
 * Key = Japanese text (trimmed), Value = English field name.
 * For headers that are identical across screens but mean different things
 * (e.g. 本塁打 in batting = "hr", in final-score = "homeRunHighlight"),
 * see the per-category column lists below.
 */
// Note: batting/pitching headers are listed last so they "win" when the same
// Japanese text appears in multiple screen types (e.g. 本塁打 = "hr" as a stat
// column in batting/pitching, vs "homeRunHighlight" as a label in final_score).
// Per-category logic should use the typed header arrays (BATTING_HEADERS etc.)
// directly when screen-specific meaning matters.
export const HEADER_MAP: Record<string, string> = Object.fromEntries([
  ...FINAL_SCORE_HEADERS.map(h => [h.japanese, h.english]),
  ...ADVANCED_CONTACT_HEADERS.map(h => [h.japanese, h.english]),
  ...PITCHING_HEADERS.map(h => [h.japanese, h.english]),
  ...BATTING_HEADERS.map(h => [h.japanese, h.english]),
]);

// ---------------------------------------------------------------------------
// Per-category ordered column lists
// ---------------------------------------------------------------------------

/**
 * The ordered list of active (non-ignored) field names for each screen category,
 * matching the left-to-right column order as seen in Power Pros screenshots.
 * Used to build structured prompts and validate parsed output field counts.
 */
export const COLUMN_ORDER: Record<ScreenCategory, string[]> = {
  batting: BATTING_HEADERS
    .filter(h => !h.ignore)
    .map(h => h.english),

  pitching: PITCHING_HEADERS
    .filter(h => !h.ignore)
    .map(h => h.english),

  final_score: [
    "innings",    // array of per-inning run pairs, derived from inning1…inning9 columns
    "homeScore", "awayScore",
    "homeHits",  "awayHits",
    "homeErrors", "awayErrors",
  ],

  advanced_contact: ADVANCED_CONTACT_HEADERS
    .filter(h => !h.ignore)
    .map(h => h.english),
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Translates a raw Japanese header text (as OCR'd from the screenshot) into the
 * app's English field name. Returns undefined for unknown/unregistered headers.
 *
 * Performs trimmed exact-match. For partial / multi-character matches the caller
 * should pre-normalize the text (e.g. strip ruby annotations or whitespace).
 */
export function translateHeader(japanese: string): string | undefined {
  return HEADER_MAP[japanese.trim()];
}

/**
 * Translates a pitching-screen decision badge character to the standard
 * "W" | "L" | "S" decision code. Returns null if not a recognized decision marker.
 */
export function translateDecision(badge: string): "W" | "L" | "S" | null {
  return PITCHING_DECISION_MAP[badge.trim()] ?? null;
}

/**
 * Returns true if a row label is the team-totals summary row (should be skipped
 * when extracting per-player data).
 */
export function isTotalsRow(label: string): boolean {
  return TOTALS_ROW_LABELS.has(label.trim());
}

// ---------------------------------------------------------------------------
// LLM prompt helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Japanese-header glossary block injected into LLM system prompts.
 * Includes all headers for every screen category with notes and conversion hints.
 * Skips entries marked with `ignore: true` (they are in scope for reference but
 * should not be extracted).
 *
 * Pass `includeAdvancedContact: true` to include the advanced-contact extension
 * headers in the glossary (off by default to keep prompts lean for standard screens).
 */
export function buildGlossaryText(options?: { includeAdvancedContact?: boolean }): string {
  const allHeaders: HeaderEntry[] = [
    ...BATTING_HEADERS,
    ...PITCHING_HEADERS,
    ...FINAL_SCORE_HEADERS,
    ...(options?.includeAdvancedContact ? ADVANCED_CONTACT_HEADERS : []),
  ];

  // Deduplicate by japanese key (some headers, like 四死球, appear in both batting
  // and pitching with the same meaning) so the glossary isn't repetitive.
  const seen = new Set<string>();
  const lines: string[] = [
    "Japanese eBaseball Power Pros stat header glossary (map these to the English fields below):",
  ];
  for (const h of allHeaders) {
    if (seen.has(h.japanese)) continue;
    seen.add(h.japanese);
    const ignoreHint = h.ignore ? " (ignore unless specifically asked)" : "";
    lines.push(`- ${h.japanese} = ${h.english} — ${h.note}${ignoreHint}`);
  }
  return lines.join("\n");
}

/**
 * Returns the ordered active field list for a given screen category as a compact
 * string suitable for inclusion in LLM extraction prompts.
 * Example: "ab, r, h, doubles, triples, hr, rbi, so, bb, sb, e"
 */
export function fieldListForCategory(category: ScreenCategory): string {
  return (COLUMN_ORDER[category] ?? []).join(", ");
}

// ---------------------------------------------------------------------------
// Structured per-screen field metadata (for validation / client fieldMeta)
// ---------------------------------------------------------------------------

/**
 * Full metadata for all screen fields (active + ignored), keyed by English field
 * name within each category. Useful for building structured prompts and for
 * validating/annotating parsed OCR output.
 */
export const SCREEN_FIELDS: Record<ScreenCategory, Record<string, HeaderEntry>> = {
  batting:          Object.fromEntries(BATTING_HEADERS.map(h => [h.english, h])),
  pitching:         Object.fromEntries(PITCHING_HEADERS.map(h => [h.english, h])),
  final_score:      Object.fromEntries(FINAL_SCORE_HEADERS.map(h => [h.english, h])),
  advanced_contact: Object.fromEntries(ADVANCED_CONTACT_HEADERS.map(h => [h.english, h])),
};
