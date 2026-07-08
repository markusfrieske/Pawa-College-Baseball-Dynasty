/**
 * Unit tests for multi-screenshot batting table merge logic (Power Pros OCR import).
 *
 * Covers:
 *   - Rows for the same roster player across multiple screenshots are deduplicated into one entry.
 *   - The most complete (most OCR-provided fields) duplicate wins.
 *   - Unmatched-but-named rows dedupe by normalized name.
 *   - Nameless/ambiguous rows are preserved (never dropped) and flagged `needsName`.
 *   - Merge order follows first-appearance order across screenshots.
 *
 * These are pure-logic tests — no database, HTTP server, or OCR call required.
 */
import { test, expect } from "@playwright/test";
import { mergeBattingRows, type OcrBattingPlayer } from "../../client/src/lib/ocr-batting-merge";
import type { Player } from "../../shared/schema";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    teamId: "t1",
    firstName: "John",
    lastName: "Doe",
    position: "SS",
    eligibility: "FR",
    overall: 300,
    starRating: 3,
    ...overrides,
  } as unknown as Player;
}

const players: Player[] = [
  makePlayer({ id: "p-smith", firstName: "Alex", lastName: "Smith", position: "SS" }),
  makePlayer({ id: "p-jones", firstName: "Bo", lastName: "Jones", position: "2B" }),
  makePlayer({ id: "p-lee", firstName: "Cam", lastName: "Lee", position: "OF" }),
];

test.describe("mergeBattingRows", () => {
  test("dedupes the same roster player appearing in two screenshots, keeping the most complete row", () => {
    const shot1: OcrBattingPlayer[] = [
      { name: "Alex Smith", ab: 4, r: 1, h: 2 }, // partial read
    ];
    const shot2: OcrBattingPlayer[] = [
      { name: "Alex Smith", ab: 4, r: 1, h: 2, doubles: 1, hr: 0, rbi: 2, bb: 0, so: 1, sb: 0 }, // fuller read
    ];

    const { entries } = mergeBattingRows("home", [shot1, shot2], players);

    expect(entries).toHaveLength(1);
    expect(entries[0].playerId).toBe("p-smith");
    expect(entries[0].name).toBe("Alex Smith");
    expect(entries[0].doubles).toBe(1);
    expect(entries[0].rbi).toBe(2);
    expect(entries[0].needsName).toBeFalsy();
  });

  test("merges rows for different roster players across screenshots without cross-contamination", () => {
    const shot1: OcrBattingPlayer[] = [{ name: "Alex Smith", ab: 3, h: 1 }];
    const shot2: OcrBattingPlayer[] = [{ name: "Bo Jones", ab: 4, h: 2 }];

    const { entries } = mergeBattingRows("home", [shot1, shot2], players);

    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.playerId)).toEqual(["p-smith", "p-jones"]);
  });

  test("dedupes an unmatched-but-named player by normalized name across screenshots", () => {
    const shot1: OcrBattingPlayer[] = [{ name: "Randy Walker", ab: 3, h: 0 }];
    const shot2: OcrBattingPlayer[] = [{ name: "randy   walker", ab: 3, h: 0, so: 2 }];

    const { entries } = mergeBattingRows("home", [shot1, shot2], players);

    expect(entries).toHaveLength(1);
    // The more complete row (with `so` present) wins, carrying its own raw OCR name text.
    expect(entries[0].so).toBe(2);
    expect(entries[0].needsName).toBeFalsy();
  });

  test("preserves nameless rows as distinct, flagged needsName, instead of dropping or merging them", () => {
    const shot1: OcrBattingPlayer[] = [{ name: "", ab: 2, h: 1 }];
    const shot2: OcrBattingPlayer[] = [{ ab: 1, h: 0 }];

    const { entries } = mergeBattingRows("home", [shot1, shot2], players);

    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.needsName)).toBe(true);
    expect(entries.every(e => e.name === "(unidentified batter)")).toBe(true);
  });

  test("keeps first-appearance order across merged screenshots", () => {
    const shot1: OcrBattingPlayer[] = [{ name: "Cam Lee", ab: 4 }, { name: "Alex Smith", ab: 4 }];
    const shot2: OcrBattingPlayer[] = [{ name: "Bo Jones", ab: 4 }, { name: "Cam Lee", ab: 4, h: 1 }];

    const { entries } = mergeBattingRows("home", [shot1, shot2], players);

    expect(entries.map(e => e.playerId)).toEqual(["p-lee", "p-smith", "p-jones"]);
    // Cam Lee's second (more complete) reading should win the merge.
    expect(entries[0].h).toBe(1);
  });

  test("recomputed merge is empty when no screenshots are applied", () => {
    const { entries, screenshotCount } = mergeBattingRows("away", [], players);
    expect(entries).toHaveLength(0);
    expect(screenshotCount).toBe(0);
  });
});
