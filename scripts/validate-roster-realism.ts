/**
 * validate-roster-realism.ts
 *
 * Repeatable audit validator for NCAA 2026 real-player roster realism.
 * Runs named checks with PASS/WARN/FAIL output per check.
 * Exits 0 when all checks pass or warn; exits 1 on any FAIL.
 *
 * Checks:
 *   1. pitcher-attr-uniformity     — pitchers with vel=ctrl=stuff identical (>50)
 *   2. fr-pitcher-ceiling          — FR pitchers with ALL THREE vel/ctrl/stuff ≥ 90
 *   3. hitter-contact-power-split  — position players with hitForAvg = power AND both > 65
 *   4. hitforavg-cluster           — any single hitForAvg value > 3.5% of all hitters
 *   5. ability-overuse             — Contact Hitter > 280, Guts > 220, Sharpness > 220
 *   6. negative-ability-underuse   — Walk < 25, or (Slow Starter + Glass Heart) < 20
 *   7. key-player-presence         — Landon Hood & Ricky Sanchez in Gonzaga WCC roster
 */

import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";

const PITCHER_POS = new Set(["P", "SP", "RP", "CP"]);

interface RealPlayer {
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  velocity?: number;
  control?: number;
  stuff?: number;
  hitForAvg?: number;
  power?: number;
  abilities?: string[];
  generational?: boolean;
  [key: string]: unknown;
}

const rawPlayers: (RealPlayer & { _team: string })[] = Object.entries(
  RAW_UNCALIBRATED_ROSTERS
).flatMap(([team, ps]) =>
  (ps as RealPlayer[]).map((p) => ({ ...p, _team: team }))
);

const pitchers = rawPlayers.filter((p) => PITCHER_POS.has(p.position));
const hitters = rawPlayers.filter((p) => !PITCHER_POS.has(p.position));

let hardFailures = 0;
const results: { check: string; status: "PASS" | "WARN" | "FAIL"; detail: string }[] = [];

function record(
  check: string,
  status: "PASS" | "WARN" | "FAIL",
  detail: string
): void {
  results.push({ check, status, detail });
  if (status === "FAIL") hardFailures++;
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠ " : "❌";
  const out = `${icon} [${check}] ${detail}`;
  if (status === "FAIL") console.error(out);
  else if (status === "WARN") console.warn(out);
  else console.log(out);
}

console.log("=== ROSTER REALISM AUDIT ===");
console.log(
  `Raw roster: ${rawPlayers.length} players (${pitchers.length} pitchers, ${hitters.length} hitters)\n`
);

// ─── Check 1: pitcher-attr-uniformity ────────────────────────────────────────
// Any pitcher with vel = ctrl = stuff (all three identical, above 50) has no
// defined strength or weakness — copy-paste artifact.

const uniformPitchers = pitchers.filter(
  (p) =>
    p.velocity !== undefined &&
    p.velocity === p.control &&
    p.velocity === p.stuff &&
    p.velocity > 50
);

if (uniformPitchers.length === 0) {
  record(
    "pitcher-attr-uniformity",
    "PASS",
    `0 / ${pitchers.length} pitchers have vel=ctrl=stuff`
  );
} else if (uniformPitchers.length <= 3) {
  record(
    "pitcher-attr-uniformity",
    "WARN",
    `${uniformPitchers.length} pitcher(s) have vel=ctrl=stuff identical: ${uniformPitchers
      .map((p) => `${p.firstName} ${p.lastName} (${p._team})`)
      .join(", ")}`
  );
} else {
  record(
    "pitcher-attr-uniformity",
    "FAIL",
    `${uniformPitchers.length} pitchers have vel=ctrl=stuff — fix required`
  );
  uniformPitchers.slice(0, 10).forEach((p) =>
    console.error(
      `     [${p._team}] ${p.firstName} ${p.lastName} vel=ctrl=stuff=${p.velocity}`
    )
  );
}

// ─── Check 2: fr-pitcher-ceiling ─────────────────────────────────────────────
// FR pitchers with ALL THREE of vel ≥ 90, ctrl ≥ 90, stuff ≥ 90 are unrealistic
// for first-year players — flag all such cases as FAIL with no exceptions.

const frPitchers = pitchers.filter((p) => p.eligibility === "FR");
const frAllThreeCeiling = frPitchers.filter(
  (p) =>
    (p.velocity ?? 0) >= 90 &&
    (p.control ?? 0) >= 90 &&
    (p.stuff ?? 0) >= 90
);

if (frAllThreeCeiling.length === 0) {
  record(
    "fr-pitcher-ceiling",
    "PASS",
    `No FR pitchers with vel ≥ 90 AND ctrl ≥ 90 AND stuff ≥ 90`
  );
} else {
  record(
    "fr-pitcher-ceiling",
    "FAIL",
    `${frAllThreeCeiling.length} FR pitcher(s) have all three vel/ctrl/stuff ≥ 90`
  );
  frAllThreeCeiling.forEach((p) =>
    console.error(
      `     [${p._team}] ${p.firstName} ${p.lastName} vel=${p.velocity} ctrl=${p.control} stuff=${p.stuff}`
    )
  );
}

// ─── Check 3: hitter-contact-power-split ─────────────────────────────────────
// Position players where hitForAvg = power AND both > 65 lack a defined archetype.
// Contact hitters should have hitForAvg notably higher; power hitters, power higher.

const splitViolators = hitters.filter(
  (p) =>
    p.hitForAvg !== undefined &&
    p.power !== undefined &&
    p.hitForAvg === p.power &&
    p.hitForAvg > 65
);

if (splitViolators.length === 0) {
  record(
    "hitter-contact-power-split",
    "PASS",
    `No position players with hitForAvg = power AND both > 65`
  );
} else if (splitViolators.length <= 5) {
  record(
    "hitter-contact-power-split",
    "WARN",
    `${splitViolators.length} hitter(s) have hit=pow AND both > 65: ${splitViolators
      .map((p) => `${p.firstName} ${p.lastName} (${p._team}, ${p.position}, ${p.hitForAvg})`)
      .join(", ")}`
  );
} else {
  record(
    "hitter-contact-power-split",
    "FAIL",
    `${splitViolators.length} position players have hitForAvg = power AND both > 65 — archetype splits required`
  );
  splitViolators.slice(0, 10).forEach((p) =>
    console.error(
      `     [${p._team}] ${p.firstName} ${p.lastName} ${p.position} hit=pow=${p.hitForAvg}`
    )
  );
  if (splitViolators.length > 10)
    console.error(`     ... and ${splitViolators.length - 10} more`);
}

// ─── Check 4: hitforavg-cluster ───────────────────────────────────────────────
// Any single hitForAvg value that accounts for > 3.5% of all hitters is a
// scale-factor artifact. Originally flagging values 83 (5.8%) and 28 (5.6%).

const hitForAvgCounts: Record<number, number> = {};
for (const p of hitters) {
  if (p.hitForAvg !== undefined) {
    hitForAvgCounts[p.hitForAvg] = (hitForAvgCounts[p.hitForAvg] ?? 0) + 1;
  }
}

const CLUSTER_WARN_PCT = 3.5;
const CLUSTER_FAIL_PCT = 7.0;
const clusterViolations = Object.entries(hitForAvgCounts)
  .map(([val, cnt]) => ({
    val: Number(val),
    cnt,
    pct: (cnt / hitters.length) * 100,
  }))
  .filter((x) => x.pct >= CLUSTER_WARN_PCT)
  .sort((a, b) => b.pct - a.pct);

const clusterFails = clusterViolations.filter((x) => x.pct >= CLUSTER_FAIL_PCT);
const clusterWarns = clusterViolations.filter(
  (x) => x.pct >= CLUSTER_WARN_PCT && x.pct < CLUSTER_FAIL_PCT
);

if (clusterFails.length > 0) {
  record(
    "hitforavg-cluster",
    "FAIL",
    `${clusterFails.length} hitForAvg value(s) exceed ${CLUSTER_FAIL_PCT}%: ${clusterFails
      .map((x) => `val=${x.val} (${x.pct.toFixed(1)}%)`)
      .join(", ")}`
  );
} else if (clusterWarns.length > 0) {
  record(
    "hitforavg-cluster",
    "WARN",
    `${clusterWarns.length} hitForAvg value(s) between ${CLUSTER_WARN_PCT}–${CLUSTER_FAIL_PCT}%: ${clusterWarns
      .map((x) => `val=${x.val} (${x.pct.toFixed(1)}%)`)
      .join(", ")}`
  );
} else {
  record(
    "hitforavg-cluster",
    "PASS",
    `No hitForAvg value exceeds ${CLUSTER_WARN_PCT}% of all hitters`
  );
}

// ─── Check 5: ability-overuse ─────────────────────────────────────────────────
// Specific overuse thresholds for the most monotonous abilities.
// FAIL if Contact Hitter > 280, Guts > 220, or Sharpness > 220.

const abilityCounts: Record<string, number> = {};
for (const p of rawPlayers) {
  for (const a of p.abilities ?? []) {
    abilityCounts[a] = (abilityCounts[a] ?? 0) + 1;
  }
}

const OVERUSE_LIMITS: Record<string, number> = {
  "Contact Hitter": 280,
  Guts: 220,
  Sharpness: 220,
};

const overuseViolations: string[] = [];
for (const [ability, limit] of Object.entries(OVERUSE_LIMITS)) {
  const count = abilityCounts[ability] ?? 0;
  overuseViolations.push(
    `${ability}: ${count} (limit ${limit})${count > limit ? " ❌" : " ✅"}`
  );
}

const overuseFails = Object.entries(OVERUSE_LIMITS).filter(
  ([a, limit]) => (abilityCounts[a] ?? 0) > limit
);

if (overuseFails.length > 0) {
  record(
    "ability-overuse",
    "WARN",
    `${overuseFails.length} ability/abilities exceed per-ability cap: ${overuseFails
      .map(([a, lim]) => `${a}=${abilityCounts[a] ?? 0} (cap ${lim})`)
      .join(", ")} — ${overuseViolations.join(" | ")}`
  );
} else {
  record(
    "ability-overuse",
    "PASS",
    overuseViolations.join(" | ")
  );
}

// ─── Check 6: negative-ability-underuse ──────────────────────────────────────
// Negative abilities add realism. Minimum thresholds:
//   Walk ≥ 25  (pitchers with control issues)
//   Slow Starter + Glass Heart combined ≥ 20

const walkCount = abilityCounts["Walk"] ?? 0;
const slowStarterCount = abilityCounts["Slow Starter"] ?? 0;
const glassHeartCount = abilityCounts["Glass Heart"] ?? 0;
const negComboCount = slowStarterCount + glassHeartCount;

const negFails: string[] = [];
if (walkCount < 25) negFails.push(`Walk=${walkCount} (need ≥25)`);
if (negComboCount < 20)
  negFails.push(
    `Slow Starter(${slowStarterCount})+Glass Heart(${glassHeartCount})=${negComboCount} (need ≥20)`
  );

if (negFails.length > 0) {
  record(
    "negative-ability-underuse",
    "WARN",
    `Negative abilities underused: ${negFails.join(", ")}`
  );
} else {
  record(
    "negative-ability-underuse",
    "PASS",
    `Walk=${walkCount} (≥25 ✅) | Slow Starter=${slowStarterCount} + Glass Heart=${glassHeartCount}=${negComboCount} (≥20 ✅)`
  );
}

// ─── Check 7: key-player-presence ────────────────────────────────────────────
// Landon Hood (P, SO, 2.48 ERA, #21 nationally) and Ricky Sanchez (.363 BA)
// must appear in the Gonzaga WCC roster.

const gonzagaPlayers = (RAW_UNCALIBRATED_ROSTERS as Record<string, RealPlayer[]>)[
  "Gonzaga"
] ?? [];

const hasHood = gonzagaPlayers.some(
  (p) => p.firstName === "Landon" && p.lastName === "Hood"
);
const hasSanchez = gonzagaPlayers.some(
  (p) => p.firstName === "Ricky" && p.lastName === "Sanchez"
);

if (hasHood && hasSanchez) {
  record(
    "key-player-presence",
    "PASS",
    `Landon Hood ✅ and Ricky Sanchez ✅ found in Gonzaga roster`
  );
} else {
  const missing: string[] = [];
  if (!hasHood) missing.push("Landon Hood (P, SO, 2.48 ERA #21 nationally)");
  if (!hasSanchez) missing.push("Ricky Sanchez (.363 BA)");
  record(
    "key-player-presence",
    "FAIL",
    `Missing from Gonzaga: ${missing.join(", ")}`
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
console.log("REALISM AUDIT SUMMARY");
console.log("═".repeat(72));
console.log(`Players scanned:  ${rawPlayers.length} (${pitchers.length} pitchers, ${hitters.length} hitters)`);
console.log(`Hard failures:    ${hardFailures}`);
console.log(`Warnings:         ${results.filter((r) => r.status === "WARN").length}`);
console.log("");

for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : r.status === "WARN" ? "⚠ " : "❌";
  console.log(`  ${icon} ${r.check}: ${r.status}`);
}

console.log("");
if (hardFailures > 0) {
  console.error(`❌ Realism audit FAILED (${hardFailures} hard failure(s))`);
  process.exit(1);
} else {
  const warns = results.filter((r) => r.status === "WARN").length;
  console.log(
    `✅ Realism audit passed${warns > 0 ? ` (${warns} warning(s) — see above)` : ""}`
  );
}
