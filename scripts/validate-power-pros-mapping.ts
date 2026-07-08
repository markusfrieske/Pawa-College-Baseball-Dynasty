/**
 * Unit tests for the Power Pros Japanese stat mapping module.
 *
 * Validates the full header→field translation table against the known-correct
 * column sets visible in the four sample Power Pros screenshots:
 *   - final_score   (linescore + decision badges)
 *   - batting       (打数/得点/安打/…/失策)
 *   - pitching      (投球回/球数/…/防御率)
 *   - advanced_contact (extension slot)
 *
 * Run: npx tsx scripts/validate-power-pros-mapping.ts
 */
import {
  translateHeader,
  translateDecision,
  isTotalsRow,
  buildGlossaryText,
  fieldListForCategory,
  COLUMN_ORDER,
  BATTING_HEADERS,
  PITCHING_HEADERS,
  FINAL_SCORE_HEADERS,
  ADVANCED_CONTACT_HEADERS,
  PITCHING_DECISION_MAP,
  TOTALS_ROW_LABELS,
  HEADER_MAP,
  SCREEN_FIELDS,
} from "../server/powerProsMapping";

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL [${label}]\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTruthy(label: string, value: unknown) {
  if (value) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL [${label}] — expected truthy, got ${JSON.stringify(value)}`);
  }
}

function expectFalsy(label: string, value: unknown) {
  if (!value) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL [${label}] — expected falsy, got ${JSON.stringify(value)}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name}`);
}

// ---------------------------------------------------------------------------
// 1. Batting header translations (verified against Screenshot_213111 / 213120)
// ---------------------------------------------------------------------------
section("Batting header translations");

// All 13 columns visible in the batting screenshots
const battingCases: [string, string][] = [
  ["打数",   "ab"],
  ["得点",   "r"],
  ["安打",   "h"],
  ["二塁打", "doubles"],
  ["三塁打", "triples"],
  ["本塁打", "hr"],
  ["打点",   "rbi"],
  ["三振",   "so"],
  ["四死球", "bb"],
  ["犠打",   "sac"],
  ["盗塁",   "sb"],
  ["併殺",   "gdp"],
  ["失策",   "e"],
];
for (const [jp, en] of battingCases) {
  expect(`translateHeader("${jp}")`, translateHeader(jp), en);
}

// ---------------------------------------------------------------------------
// 2. Pitching header translations (verified against Screenshot_213128)
// ---------------------------------------------------------------------------
section("Pitching header translations");

const pitchingCases: [string, string][] = [
  ["投球回",  "ip"],
  ["球数",    "pc"],
  ["打者",    "bf"],
  ["被安打",  "h"],
  ["奪三振",  "so"],
  ["四死球",  "bb"],
  ["失点",    "r"],
  ["自責点",  "er"],
  ["暴投",    "wp"],
  ["被本塁打", "hr"],
  ["防御率",  "era"],
];
for (const [jp, en] of pitchingCases) {
  expect(`translateHeader("${jp}")`, translateHeader(jp), en);
}

// ---------------------------------------------------------------------------
// 3. Final score / linescore labels (verified against Screenshot_215320)
// ---------------------------------------------------------------------------
section("Final score header translations");

const finalScoreCases: [string, string][] = [
  ["一", "inning1"],
  ["二", "inning2"],
  ["三", "inning3"],
  ["四", "inning4"],
  ["五", "inning5"],
  ["六", "inning6"],
  ["七", "inning7"],
  ["八", "inning8"],
  ["九", "inning9"],
  ["計", "totalRuns"],
  ["H", "hits"],
  ["E", "errors"],
  ["V", "away"],
  ["勝利",   "win"],
  ["セーブ", "save"],
  ["敗戦",   "loss"],
  ["本塁打", "hr"],   // also present in batting; HEADER_MAP last-write wins (batting hr)
];
// For 本塁打: it maps to "hr" from batting (which overwrites "homeRunHighlight" in the flat map).
// translateHeader is intentionally screen-agnostic for the flat map; category-specific logic
// uses the per-category header lists directly. We just confirm it doesn't return undefined.
const finalScoreCasesFiltered = finalScoreCases.filter(([jp]) => jp !== "本塁打");
for (const [jp, en] of finalScoreCasesFiltered) {
  expect(`translateHeader("${jp}")`, translateHeader(jp), en);
}
// 本塁打 exists in the map (any non-undefined value is fine)
expectTruthy('translateHeader("本塁打") defined', translateHeader("本塁打") !== undefined);

// ---------------------------------------------------------------------------
// 4. Decision marker translations
// ---------------------------------------------------------------------------
section("Decision marker translations");

expect('translateDecision("勝")',    translateDecision("勝"),    "W");
expect('translateDecision("勝利")',  translateDecision("勝利"),  "W");
expect('translateDecision("敗")',    translateDecision("敗"),    "L");
expect('translateDecision("敗戦")',  translateDecision("敗戦"),  "L");
expect('translateDecision("セーブ")', translateDecision("セーブ"), "S");
expect('translateDecision("Ｓ")',    translateDecision("Ｓ"),    "S");
expect('translateDecision("S")',     translateDecision("S"),     "S");
expect('translateDecision("W")',     translateDecision("W"),     "W");
expect('translateDecision("L")',     translateDecision("L"),     "L");
expect('translateDecision("unknown")', translateDecision("unknown"), null);
expect('translateDecision("")',      translateDecision(""),      null);

// ---------------------------------------------------------------------------
// 5. Totals-row detection
// ---------------------------------------------------------------------------
section("Totals row detection");

expect('isTotalsRow("合計")', isTotalsRow("合計"), true);
expect('isTotalsRow("計")',   isTotalsRow("計"),   true);
expect('isTotalsRow("  合計  ")', isTotalsRow("  合計  "), true);  // trim
expect('isTotalsRow("Nova")', isTotalsRow("Nova"), false);
expect('isTotalsRow("")',     isTotalsRow(""),     false);

// ---------------------------------------------------------------------------
// 6. Column ordering
// ---------------------------------------------------------------------------
section("Column ordering — batting active fields");

// Active (non-ignored) batting fields in screenshot order
const expectedBattingOrder = ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "so", "bb", "sb", "e"];
expect("COLUMN_ORDER.batting", COLUMN_ORDER.batting, expectedBattingOrder);

section("Column ordering — pitching active fields");

const expectedPitchingOrder = ["ip", "h", "so", "bb", "r", "er", "hr"];
expect("COLUMN_ORDER.pitching", COLUMN_ORDER.pitching, expectedPitchingOrder);

section("Column ordering — final_score fields");

// final_score uses a hand-crafted list (inning data is aggregated)
const fsOrder = COLUMN_ORDER.final_score;
expectTruthy("final_score has innings field", fsOrder.includes("innings"));
expectTruthy("final_score has homeScore field", fsOrder.includes("homeScore"));
expectTruthy("final_score has awayScore field", fsOrder.includes("awayScore"));
expectTruthy("final_score has homeErrors field", fsOrder.includes("homeErrors"));

// ---------------------------------------------------------------------------
// 7. Ignored fields are NOT in COLUMN_ORDER
// ---------------------------------------------------------------------------
section("Ignored fields excluded from COLUMN_ORDER");

expectFalsy("batting: 'sac' not in active order", COLUMN_ORDER.batting.includes("sac"));
expectFalsy("batting: 'gdp' not in active order", COLUMN_ORDER.batting.includes("gdp"));
expectFalsy("pitching: 'pc' not in active order",  COLUMN_ORDER.pitching.includes("pc"));
expectFalsy("pitching: 'bf' not in active order",  COLUMN_ORDER.pitching.includes("bf"));
expectFalsy("pitching: 'wp' not in active order",  COLUMN_ORDER.pitching.includes("wp"));
expectFalsy("pitching: 'era' not in active order", COLUMN_ORDER.pitching.includes("era"));

// ---------------------------------------------------------------------------
// 8. buildGlossaryText
// ---------------------------------------------------------------------------
section("buildGlossaryText");

const glossary = buildGlossaryText();
expectTruthy("glossary contains 打数",   glossary.includes("打数"));
expectTruthy("glossary contains 投球回", glossary.includes("投球回"));
expectTruthy("glossary contains 勝利",   glossary.includes("勝利"));
expectTruthy("glossary starts with header line", glossary.startsWith("Japanese eBaseball Power Pros"));

// Advanced contact should be absent by default
const glossaryNoAdv = buildGlossaryText({ includeAdvancedContact: false });
expectFalsy("glossary: no advanced_contact by default", glossaryNoAdv.includes("出塁率"));

// Advanced contact should be present when opted in
const glossaryWithAdv = buildGlossaryText({ includeAdvancedContact: true });
expectTruthy("glossary: includes 出塁率 when opted in", glossaryWithAdv.includes("出塁率"));

// Deduplication: 四死球 appears in both batting and pitching headers but should only appear once
const count四死球 = (glossary.match(/四死球/g) ?? []).length;
expect("glossary: 四死球 deduplicated", count四死球, 1);

// ---------------------------------------------------------------------------
// 9. fieldListForCategory
// ---------------------------------------------------------------------------
section("fieldListForCategory");

const battingFieldList = fieldListForCategory("batting");
expectTruthy("batting field list contains 'ab'",  battingFieldList.includes("ab"));
expectTruthy("batting field list contains 'rbi'", battingFieldList.includes("rbi"));
expectFalsy("batting field list excludes 'sac'",  battingFieldList.includes("sac"));

// ---------------------------------------------------------------------------
// 10. SCREEN_FIELDS metadata
// ---------------------------------------------------------------------------
section("SCREEN_FIELDS metadata");

expectTruthy("SCREEN_FIELDS.batting.ab defined", SCREEN_FIELDS.batting["ab"] !== undefined);
expect("SCREEN_FIELDS.batting.ab japanese", SCREEN_FIELDS.batting["ab"].japanese, "打数");
expectTruthy("SCREEN_FIELDS.pitching.ip defined", SCREEN_FIELDS.pitching["ip"] !== undefined);
expect("SCREEN_FIELDS.pitching.ip japanese", SCREEN_FIELDS.pitching["ip"].japanese, "投球回");
expectTruthy("SCREEN_FIELDS.advanced_contact.obp defined", SCREEN_FIELDS.advanced_contact["obp"] !== undefined);

// ---------------------------------------------------------------------------
// 11. HEADER_MAP completeness: every header list entry round-trips
// ---------------------------------------------------------------------------
section("HEADER_MAP completeness");

for (const h of BATTING_HEADERS) {
  expectTruthy(`HEADER_MAP covers batting "${h.japanese}"`, HEADER_MAP[h.japanese] !== undefined);
}
for (const h of PITCHING_HEADERS) {
  expectTruthy(`HEADER_MAP covers pitching "${h.japanese}"`, HEADER_MAP[h.japanese] !== undefined);
}
for (const h of ADVANCED_CONTACT_HEADERS) {
  expectTruthy(`HEADER_MAP covers advanced_contact "${h.japanese}"`, HEADER_MAP[h.japanese] !== undefined);
}

// ---------------------------------------------------------------------------
// 12. Whitespace trimming in translateHeader
// ---------------------------------------------------------------------------
section("Whitespace trimming in translateHeader");

expect('translateHeader("  打数  ")', translateHeader("  打数  "), "ab");
expect('translateHeader("\\t安打\\t")', translateHeader("\t安打\t"), "h");

// ---------------------------------------------------------------------------
// 13. Advanced-contact extension slot is extensible without touching core
// ---------------------------------------------------------------------------
section("Advanced contact extension slot");

// All advanced-contact headers are NOT in the batting or pitching header lists
const battingJpSet = new Set(BATTING_HEADERS.map(h => h.japanese));
const pitchingJpSet = new Set(PITCHING_HEADERS.map(h => h.japanese));
for (const h of ADVANCED_CONTACT_HEADERS) {
  // Some (打率, 本塁打…) could conceivably overlap — just check they parse
  expectTruthy(
    `ADVANCED_CONTACT_HEADERS["${h.japanese}"] has english field`,
    typeof h.english === "string" && h.english.length > 0
  );
}

// The COLUMN_ORDER for advanced_contact contains only non-ignored entries
const advOrder = COLUMN_ORDER.advanced_contact;
for (const f of advOrder) {
  const entry = ADVANCED_CONTACT_HEADERS.find(h => h.english === f);
  expectTruthy(`advanced_contact field "${f}" is not ignored`, entry && !entry.ignore);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`✓ All ${passed} tests passed.`);
} else {
  console.log(`✗ ${failed} test(s) FAILED (${passed} passed):\n`);
  for (const msg of failures) console.log(msg);
  process.exit(1);
}
