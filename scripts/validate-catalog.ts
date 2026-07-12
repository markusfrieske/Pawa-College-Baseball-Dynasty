/**
 * validate-catalog — asserts catalog invariants required by the Full Season preset.
 *
 * Conference-level checks:
 *   1. Exactly 12 conferences in CONFERENCE_CATALOG
 *   2. Sum of conference sizes == FULL_SEASON_TOTAL (149)
 *   3. Conference names are unique
 *   4. Every conference name maps to a valid CONF_SIZE_MAP entry
 *   5. Each conference size > 0
 *   6. FULL_SEASON_TOTAL == rosterScaleFactors.TOTAL_NATIONAL_TEAMS
 *
 * Team-level checks (via NATIONAL_RANKS):
 *   7. NATIONAL_RANKS has exactly FULL_SEASON_TOTAL (149) entries
 *   8. All team names in NATIONAL_RANKS are unique (keys are unique by definition,
 *      so we validate no duplicate values across canonical name variants)
 *   9. Every rank value is in range [1, TOTAL_NATIONAL_TEAMS]
 *  10. At most one team holds each rank (except the shared floor rank)
 */

import { CONFERENCE_CATALOG, FULL_SEASON_TOTAL, CONF_SIZE_MAP } from "../shared/catalog";
import { TOTAL_NATIONAL_TEAMS, NATIONAL_RANKS } from "../server/rosterScaleFactors";

const errors: string[] = [];
const warnings: string[] = [];

// ── Conference-level ─────────────────────────────────────────────────────────

// 1. Conference count
const EXPECTED_CONF_COUNT = 12;
if (CONFERENCE_CATALOG.length !== EXPECTED_CONF_COUNT) {
  errors.push(`CONFERENCE_CATALOG has ${CONFERENCE_CATALOG.length} entries, expected ${EXPECTED_CONF_COUNT}`);
}

// 2. Total teams
const derivedTotal = CONFERENCE_CATALOG.reduce((s, c) => s + c.size, 0);
if (derivedTotal !== FULL_SEASON_TOTAL) {
  errors.push(`Sum of conference sizes (${derivedTotal}) ≠ FULL_SEASON_TOTAL (${FULL_SEASON_TOTAL})`);
}

// 3. Unique conference names
const seenConfs = new Set<string>();
for (const c of CONFERENCE_CATALOG) {
  if (seenConfs.has(c.name)) {
    errors.push(`Duplicate conference name: "${c.name}"`);
  }
  seenConfs.add(c.name);
}

// 4. CONF_SIZE_MAP entries match CONFERENCE_CATALOG
for (const c of CONFERENCE_CATALOG) {
  const mapSize = CONF_SIZE_MAP.get(c.name);
  if (mapSize === undefined) {
    errors.push(`CONF_SIZE_MAP is missing entry for "${c.name}"`);
  } else if (mapSize !== c.size) {
    errors.push(`CONF_SIZE_MAP["${c.name}"] = ${mapSize} but CONFERENCE_CATALOG says size=${c.size}`);
  }
}

// 5. Each conference size > 0
for (const c of CONFERENCE_CATALOG) {
  if (c.size <= 0) {
    errors.push(`Conference "${c.name}" has invalid size ${c.size}`);
  }
}

// 6. FULL_SEASON_TOTAL agrees with rosterScaleFactors constant
if (FULL_SEASON_TOTAL !== TOTAL_NATIONAL_TEAMS) {
  errors.push(
    `FULL_SEASON_TOTAL (${FULL_SEASON_TOTAL}) ≠ rosterScaleFactors.TOTAL_NATIONAL_TEAMS (${TOTAL_NATIONAL_TEAMS})`
  );
}

// ── Team-level (via NATIONAL_RANKS) ──────────────────────────────────────────

const teamNames = Object.keys(NATIONAL_RANKS);
const rankValues = Object.values(NATIONAL_RANKS);

// 7. NATIONAL_RANKS has exactly 149 entries
if (teamNames.length !== FULL_SEASON_TOTAL) {
  errors.push(`NATIONAL_RANKS has ${teamNames.length} teams, expected ${FULL_SEASON_TOTAL}`);
}

// 8. All team names are unique (Record keys are inherently unique, but verify no
//    case-insensitive near-duplicates that could indicate a typo)
const normalizedNames = new Map<string, string>();
for (const name of teamNames) {
  const key = name.trim().toLowerCase();
  if (normalizedNames.has(key)) {
    errors.push(`Near-duplicate team name in NATIONAL_RANKS: "${name}" vs "${normalizedNames.get(key)}"`);
  }
  normalizedNames.set(key, name);
}

// 9. Every rank value is in [1, TOTAL_NATIONAL_TEAMS]
const outOfRangeRanks = rankValues.filter(r => r < 1 || r > TOTAL_NATIONAL_TEAMS);
if (outOfRangeRanks.length > 0) {
  errors.push(
    `${outOfRangeRanks.length} rank value(s) out of [1, ${TOTAL_NATIONAL_TEAMS}]: ${[...new Set(outOfRangeRanks)].join(", ")}`
  );
}

// 10. No non-floor duplicate ranks
const FLOOR_RANK = TOTAL_NATIONAL_TEAMS;
const rankToTeams: Record<number, string[]> = {};
for (const [team, rank] of Object.entries(NATIONAL_RANKS)) {
  if (!rankToTeams[rank]) rankToTeams[rank] = [];
  rankToTeams[rank].push(team);
}
const duplicateRanks = Object.entries(rankToTeams).filter(
  ([rank, teams]) => teams.length > 1 && Number(rank) !== FLOOR_RANK
);
if (duplicateRanks.length > 0) {
  for (const [rank, teams] of duplicateRanks) {
    errors.push(`Duplicate rank ${rank} shared by: ${teams.join(", ")}`);
  }
}
const floorCount = (rankToTeams[FLOOR_RANK] ?? []).length;

// ── Report ───────────────────────────────────────────────────────────────────

if (errors.length === 0) {
  const floorNote = floorCount > 1 ? ` (${floorCount} teams share floor rank #${FLOOR_RANK})` : "";
  const warnNote = warnings.length > 0 ? ` (${warnings.length} warning(s) — see above)` : "";
  console.log(
    `✓  Catalog valid: ${CONFERENCE_CATALOG.length} conferences, ${FULL_SEASON_TOTAL} total teams, ` +
    `${teamNames.length} in NATIONAL_RANKS${floorNote}${warnNote}.`
  );
  if (warnings.length > 0) warnings.forEach(w => console.warn("  ⚠ ", w));
  process.exit(0);
} else {
  console.error(`✗  Catalog validation failed (${errors.length} error(s)):`);
  errors.forEach(e => console.error("  ✗ ", e));
  process.exit(1);
}
