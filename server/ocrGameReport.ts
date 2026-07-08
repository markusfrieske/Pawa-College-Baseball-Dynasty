/**
 * OCR extraction for eBaseball Power Pros (Japanese-language) box score screenshots.
 *
 * Coaches upload categorized screenshots (final score, home/away batting, home/away
 * pitching, advanced stats). This module sends each image to the OpenAI vision-capable
 * model with a prompt tuned to Power Pros' Japanese stat-table layouts, and returns
 * structured JSON matching the app's box score shape (BatterEntry/PitcherEntry-like
 * fields used by client/src/pages/report-game.tsx and the `game_reports` table).
 *
 * OCR output is a DRAFT ONLY — it is never auto-applied. The coach reviews/corrects
 * every field in the client before submitting a report.
 *
 * Japanese header translations and field ordering come from powerProsMapping.ts —
 * fix mapping bugs or add new screen types there, not here.
 */
import OpenAI from "openai";
import type { ScreenshotCategory } from "@shared/schema";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { buildGlossaryText } from "./powerProsMapping";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const objectStorageService = new ObjectStorageService();

// ---------------------------------------------------------------------------
// LLM prompt construction — uses powerProsMapping for the glossary
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const glossary = buildGlossaryText({ includeAdvancedContact: false });
  return `You are an OCR assistant specialized in reading eBaseball Power Pros (Japanese-language) baseball game screenshots and converting their stat tables into structured JSON for a college baseball dynasty simulator's game-reporting feature.

${glossary}

Always respond with ONLY a single JSON object (no markdown fences, no commentary). If a field cannot be determined, use null rather than guessing. Never fabricate data that isn't visible in the image.`;
}

function categoryInstructions(category: ScreenshotCategory): string {
  switch (category) {
    case "final_score":
      return `This is a FINAL SCORE / linescore screen. Extract:
{
  "homeScore": number, "awayScore": number,
  "homeHits": number, "awayHits": number,
  "homeErrors": number, "awayErrors": number,
  "innings": [[awayRunsInning1, homeRunsInning1], [awayRunsInning2, homeRunsInning2], ...]
}
The linescore rows are labelled V (visitor/away) and H (home). The kanji column headers 一二三四五六七八九 are innings 1–9; 計 is the total-runs column; H is hits; E is errors.
If the linescore table isn't visible, omit "innings" and just return the totals you can see. Use null for any value you truly cannot read.
The decision badges below the board use: 勝利 = winning pitcher, セーブ = save pitcher, 敗戦 = losing pitcher — include those names only if a "decisions" field would help the caller; otherwise omit.`;

    case "home_batting":
    case "away_batting":
      return `This is a BATTING grid for one team. The columns from left to right are:
打数 (ab), 得点 (r), 安打 (h), 二塁打 (doubles), 三塁打 (triples), 本塁打 (hr), 打点 (rbi), 三振 (so), 四死球 (bb), 犠打 (sac — omit), 盗塁 (sb), 併殺 (gdp — omit), 失策 (e).

Extract a "players" array, one entry per batter row:
{
  "players": [
    { "name": string, "position": string | null, "ab": number, "r": number, "h": number,
      "doubles": number, "triples": number, "hr": number, "rbi": number, "bb": number,
      "so": number, "sb": number, "e": number }
  ]
}
Skip the 合計 (team totals) row. Use the player's in-game displayed name exactly as shown. Use 0 for blank/dash cells; null only if truly unreadable.`;

    case "home_pitching":
    case "away_pitching":
      return `This is a PITCHING grid for one team. The columns from left to right are:
投球回 (ip), 球数 (pc — omit), 打者 (bf — omit), 被安打 (h), 奪三振 (so), 四死球 (bb), 失点 (r), 自責点 (er), 暴投 (wp — omit), 被本塁打 (hr), 防御率 (era — omit).

Extract a "players" array, one entry per pitcher row, in order (first row is normally the starter):
{
  "players": [
    { "name": string, "ip": string, "h": number, "r": number, "er": number, "bb": number,
      "so": number, "hr": number, "decision": "W" | "L" | "S" | null }
  ]
}
"ip" should be "6.1" notation (whole.outs where outs ∈ {0,1,2}) — Power Pros often shows fractions like "6 1/3"; convert accordingly.
Mark "decision" for the pitcher credited with the win (勝/勝利/W), loss (敗/敗戦/L), or save (セーブ/S) if a badge is shown next to their name; otherwise use null.`;

    case "advanced_stats":
    default:
      return `This is an ADVANCED STATS screen (may show exit velocity, pitch speed, spin, batting average, OBP, SLG, or other Statcast-like data). Extract whatever labeled stat rows/columns you can read into a flat JSON object:
{
  "stats": [ { "label": string, "value": string } ]
}
This data is reference-only and won't be auto-applied to the box score.`;
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface OcrExtractionResult {
  success: boolean;
  data?: Record<string, unknown>;
  /** Raw, unparsed text returned by the OCR model — kept verbatim for the audit trail. */
  rawText?: string;
  /**
   * Derived (not model-reported) per-field confidence: "low" for any field the model
   * returned as null/unreadable, "high" otherwise. This is a heuristic computed from the
   * parsed JSON shape, not a change to the extraction prompt/model itself.
   */
  fieldConfidence?: Record<string, "high" | "low">;
  error?: string;
}

// ---------------------------------------------------------------------------
// Field-confidence derivation
// ---------------------------------------------------------------------------

/**
 * Walks the parsed OCR JSON and derives a flat per-field confidence map using the same
 * dotted-key convention the client uses for its fieldMeta (e.g. "homeScore", "players.0.ab").
 * A value of null/undefined is treated as "low" confidence (OCR couldn't read it); anything
 * else is "high". This purely reflects what the model already returned — it does not alter
 * extraction behavior.
 */
function deriveFieldConfidence(data: Record<string, unknown>): Record<string, "high" | "low"> {
  const confidence: Record<string, "high" | "low"> = {};
  function walk(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i)));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    if (!path) return;
    confidence[path] = value === null || value === undefined ? "low" : "high";
  }
  walk(data, "");
  return confidence;
}

// ---------------------------------------------------------------------------
// Main extraction entry point
// ---------------------------------------------------------------------------

/**
 * Downloads the image bytes for an object-storage path and runs OCR extraction
 * via the vision-capable chat model, returning structured JSON for the given category.
 */
export async function extractBoxScoreFromScreenshot(
  objectPath: string,
  category: ScreenshotCategory
): Promise<OcrExtractionResult> {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [buffer] = await objectFile.download();
    const [metadata] = await objectFile.getMetadata();
    const contentType = (metadata.contentType as string) || "image/png";
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    const systemPrompt = buildSystemPrompt();
    const userPrompt = categoryInstructions(category);

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return { success: false, error: "OCR model returned an empty response" };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { success: false, error: "OCR model returned invalid JSON", rawText: raw };
    }

    return { success: true, data: parsed, rawText: raw, fieldConfidence: deriveFieldConfidence(parsed) };
  } catch (error) {
    console.error("[ocr] extraction failed:", error);
    const message = error instanceof Error ? error.message : "Unknown OCR error";
    return { success: false, error: message };
  }
}
