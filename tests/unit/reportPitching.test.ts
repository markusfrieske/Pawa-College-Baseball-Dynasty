import { test, expect } from "@playwright/test";
import type { Player } from "../../shared/schema";
import { ocrPitchersToEntries, pitchingFieldMeta } from "../../client/src/lib/report-pitching";

test("unreadable pitcher stays aligned with its OCR stats and provenance", () => {
  const roster = [{ id: "named", firstName: "Alex", lastName: "Stone", position: "P" }] as Player[];
  const data = { players: [
    { ip: "2.1", h: 3, r: 1, er: 1, decision: "L" },
    { name: "Alex Stone", ip: "6.2", r: 0, er: 0, bb: 2, decision: "W" },
  ] };
  const entries = ocrPitchersToEntries(data, roster);
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ ip: "2.1", h: 3, r: 1, er: 1, loss: true });
  expect(entries[1]).toMatchObject({ playerId: "named", ip: "6.2", bb: 2, win: true });
  const metadata = pitchingFieldMeta("home", data, entries);
  expect(metadata[`pitching.home.${entries[0].playerId}.name`]).toBe("low");
  expect(metadata[`pitching.home.${entries[0].playerId}.h`]).toBe("ocr");
  expect(metadata["pitching.home.named.name"]).toBe("ocr");
  expect(metadata["pitching.home.named.h"]).toBe("low");
  expect(metadata["pitching.home.named.bb"]).toBe("ocr");
});

test("ambiguous pitcher names preserve independent rows and decisions", () => {
  const roster = [
    { id: "alex", firstName: "Alex", lastName: "Stone", position: "P" },
    { id: "sam", firstName: "Sam", lastName: "Stone", position: "P" },
  ] as Player[];
  const entries = ocrPitchersToEntries({ players: [{ name: "Stone", ip: "1.0", decision: "W" }, { name: "Stone", ip: "2.0", decision: "L" }] }, roster);
  expect(entries).toHaveLength(2);
  expect(new Set(entries.map(row => row.playerId)).size).toBe(2);
  expect(entries.every(row => row.playerId.startsWith("screenshot-"))).toBe(true);
  expect(entries.map(row => [row.ip, row.win, row.loss])).toEqual([["1.0", true, false], ["2.0", false, true]]);
});
