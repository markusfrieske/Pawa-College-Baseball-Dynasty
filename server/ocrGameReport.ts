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
 */
import OpenAI from "openai";
import type { ScreenshotCategory } from "@shared/schema";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const objectStorageService = new ObjectStorageService();

const JAPANESE_HEADER_GLOSSARY = `
Japanese eBaseball Power Pros stat header glossary (map these to the English fields below):
- 打数 = at-bats (ab)
- 得点 = runs (r)
- 安打 = hits (h)
- 二塁打 = doubles
- 三塁打 = triples
- 本塁打 = home runs (hr)
- 打点 = RBI
- 三振 = strikeouts (so) — for batters this is times struck out; for pitchers this is strikeouts recorded
- 四死球 = walks + hit-by-pitch combined (map to bb)
- 犠打 = sacrifice bunts (ignore unless asked)
- 盗塁 = stolen bases (sb)
- 併殺 = double plays grounded into (ignore unless asked)
- 失策 = errors (e)
- 投球回 = innings pitched (ip) — format as X.Y where Y is outs past the whole inning (0/1/2), Power Pros often shows this as a fraction like "6 1/3"; convert to "6.1" style (whole.outs)
- 球数 = pitch count (ignore unless asked)
- 打者 = batters faced (ignore unless asked)
- 被安打 = hits allowed (h, pitching)
- 奪三振 = strikeouts (so, pitching)
- 自責点 = earned runs (er)
- 暴投 = wild pitches (ignore unless asked)
- 被本塁打 = home runs allowed (hr, pitching)
- 防御率 = ERA (ignore, computed elsewhere)
- 勝利 = win (W)
- セーブ = save (S)
- 敗戦 = loss (L)
`;

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
If the linescore table isn't visible, omit "innings" and just return the totals you can see. Use null for any value you truly cannot read.`;
    case "home_batting":
    case "away_batting":
      return `This is a BATTING grid for one team. Extract a "players" array, one entry per row:
{
  "players": [
    { "name": string, "position": string | null, "ab": number, "r": number, "h": number,
      "doubles": number, "triples": number, "hr": number, "rbi": number, "bb": number,
      "so": number, "sb": number }
  ]
}
Skip the "totals"/team-total row if present. Use the player's in-game displayed name exactly as shown (romanized or as displayed). Use 0 for blank/dash cells, null only if truly unreadable.`;
    case "home_pitching":
    case "away_pitching":
      return `This is a PITCHING grid for one team. Extract a "players" array, one entry per row, in the order pitchers appear (first row is normally the starter):
{
  "players": [
    { "name": string, "ip": string, "h": number, "r": number, "er": number, "bb": number,
      "so": number, "hr": number, "decision": "W" | "L" | "S" | null }
  ]
}
"ip" should be formatted like "6.1" (6 and 1/3 innings) matching whole.outs notation. Only mark "decision" for the pitcher(s) actually credited with the win/loss/save if shown (often marked with 勝/敗/Ｓ or W/L/S next to the name).`;
    case "advanced_stats":
    default:
      return `This is an ADVANCED STATS screen (may show exit velocity, pitch speed, spin, or other Statcast-like data). Extract whatever labeled stat rows/columns you can read into a flat JSON object of { "label": "value" } pairs, grouped under a top-level "stats" array of { "label": string, "value": string }. This data is reference-only and won't be auto-applied to the box score.`;
  }
}

export interface OcrExtractionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

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

    const systemPrompt = `You are an OCR assistant specialized in reading eBaseball Power Pros (Japanese-language) baseball game screenshots and converting their stat tables into structured JSON for a college baseball dynasty simulator's game-reporting feature. ${JAPANESE_HEADER_GLOSSARY}

Always respond with ONLY a single JSON object (no markdown fences, no commentary). If a field cannot be determined, use null rather than guessing. Never fabricate data that isn't visible in the image.`;

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
      return { success: false, error: "OCR model returned invalid JSON" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[ocr] extraction failed:", error);
    const message = error instanceof Error ? error.message : "Unknown OCR error";
    return { success: false, error: message };
  }
}
