/**
 * Validates NIL bonus computation logic for key postseason scenarios.
 * Tests that bonuses are awarded correctly as exclusive tiers.
 */
import { CONFERENCE_TIER_NIL, DEFAULT_CONFERENCE_NIL } from "@shared/nilConfig";

interface EarningRow {
  category: string;
  amount: number;
  description: string;
}

function computePostseasonBonuses(phaseResult: string): EarningRow[] {
  const bonuses: EarningRow[] = [];
  if (phaseResult === "national_champion" || phaseResult === "cws") {
    bonuses.push({ category: "cws_appearance", amount: 750_000, description: "College World Series appearance" });
  }
  if (phaseResult === "super_regionals") {
    bonuses.push({ category: "super_regionals", amount: 400_000, description: "Super Regionals appearance" });
  }
  if (phaseResult === "conf_championship") {
    bonuses.push({ category: "conf_championship", amount: 200_000, description: "Conference Championship win" });
  }
  return bonuses;
}

function computeRecruitingBonus(classRank: number, totalTeams: number): EarningRow[] {
  const bonuses: EarningRow[] = [];
  const pctile = classRank / totalTeams;
  if (pctile <= 0.10) {
    bonuses.push({ category: "recruiting_top10", amount: 400_000, description: "Top 10% recruiting class" });
  } else if (pctile <= 0.25) {
    bonuses.push({ category: "recruiting_top25", amount: 200_000, description: "Top 25% recruiting class" });
  } else if (pctile <= 0.50) {
    bonuses.push({ category: "recruiting_top50", amount: 100_000, description: "Top 50% recruiting class" });
  }
  return bonuses;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// ── Test 1: Super Regionals team — no conf_championship overpay
{
  console.log("Test 1: super_regionals phaseResult");
  const bonuses = computePostseasonBonuses("super_regionals");
  assert(bonuses.length === 1, "exactly 1 bonus");
  assert(bonuses[0].category === "super_regionals", "category is super_regionals");
  assert(!bonuses.some(b => b.category === "conf_championship"), "no conf_championship overpay");
  assert(!bonuses.some(b => b.category === "cws_appearance"), "no cws_appearance overpay");
}

// ── Test 2: CWS team — gets CWS bonus only
{
  console.log("Test 2: cws phaseResult");
  const bonuses = computePostseasonBonuses("cws");
  assert(bonuses.length === 1, "exactly 1 bonus");
  assert(bonuses[0].category === "cws_appearance", "category is cws_appearance");
  assert(!bonuses.some(b => b.category === "conf_championship"), "no conf_championship overpay");
  assert(!bonuses.some(b => b.category === "super_regionals"), "no super_regionals overpay");
}

// ── Test 3: National champion — gets CWS bonus only
{
  console.log("Test 3: national_champion phaseResult");
  const bonuses = computePostseasonBonuses("national_champion");
  assert(bonuses.length === 1, "exactly 1 bonus");
  assert(bonuses[0].category === "cws_appearance", "category is cws_appearance");
  assert(!bonuses.some(b => b.category === "conf_championship"), "no conf_championship overpay");
}

// ── Test 4: Conference champion only — gets conf bonus
{
  console.log("Test 4: conf_championship phaseResult");
  const bonuses = computePostseasonBonuses("conf_championship");
  assert(bonuses.length === 1, "exactly 1 bonus");
  assert(bonuses[0].category === "conf_championship", "category is conf_championship");
  assert(!bonuses.some(b => b.category === "super_regionals"), "no super_regionals overpay");
}

// ── Test 5: Regular season only — no postseason bonus
{
  console.log("Test 5: regular_season phaseResult");
  const bonuses = computePostseasonBonuses("regular_season");
  assert(bonuses.length === 0, "no postseason bonuses for regular_season team");
}

// ── Test 6: Recruiting class rank bonuses
{
  console.log("Test 6: recruiting class rank bonuses");
  const totalTeams = 16;
  const top10 = computeRecruitingBonus(1, totalTeams);
  assert(top10[0]?.category === "recruiting_top10" && top10[0].amount === 400_000, "rank 1/16 → top10 $400K");

  const top25 = computeRecruitingBonus(4, totalTeams);
  assert(top25[0]?.category === "recruiting_top25" && top25[0].amount === 200_000, "rank 4/16 → top25 $200K");

  const top50 = computeRecruitingBonus(8, totalTeams);
  assert(top50[0]?.category === "recruiting_top50" && top50[0].amount === 100_000, "rank 8/16 → top50 $100K");

  const bottom50 = computeRecruitingBonus(12, totalTeams);
  assert(bottom50.length === 0, "rank 12/16 → no recruiting bonus");
}

// ── Test 7: Conference tier base allocations (from shared nilConfig)
{
  console.log("Test 7: conference tier base allocations");
  assert(CONFERENCE_TIER_NIL["SEC"] === 3_500_000, "SEC = $3.5M");
  assert(CONFERENCE_TIER_NIL["AAC"] === 2_500_000, "AAC = $2.5M");
  assert(CONFERENCE_TIER_NIL["Missouri Valley"] === 1_750_000, "Missouri Valley = $1.75M");
  assert(CONFERENCE_TIER_NIL["Ivy League"] === 1_500_000, "Ivy League = $1.5M");
  assert(CONFERENCE_TIER_NIL["HBCU"] === 1_250_000, "HBCU = $1.25M");
  assert(Object.keys(CONFERENCE_TIER_NIL).length === 13, "all 13 conferences mapped");
  assert(DEFAULT_CONFERENCE_NIL === 2_000_000, "default fallback = $2.0M");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("✗ NIL bonus validation FAILED");
  process.exit(1);
} else {
  console.log("✓ All NIL bonus validation checks passed.");
}
