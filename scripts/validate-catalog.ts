/**
 * validate-catalog — asserts catalog invariants required by the Full Season preset:
 *   1. Exactly 12 conferences in CONFERENCE_CATALOG
 *   2. Total team count equals FULL_SEASON_TOTAL (149)
 *   3. Conference names are unique
 *   4. Every conference name maps to a valid roster source
 *   5. Team count per conference matches CONF_SIZE_MAP
 *   6. FULL_SEASON_TOTAL agrees with rosterScaleFactors.TOTAL_NATIONAL_TEAMS
 */

import { CONFERENCE_CATALOG, FULL_SEASON_TOTAL, CONF_SIZE_MAP } from "../shared/catalog";
import { TOTAL_NATIONAL_TEAMS } from "../server/rosterScaleFactors";

const errors: string[] = [];
const warnings: string[] = [];

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
const seen = new Set<string>();
for (const c of CONFERENCE_CATALOG) {
  if (seen.has(c.name)) {
    errors.push(`Duplicate conference name: "${c.name}"`);
  }
  seen.add(c.name);
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

// Report
if (errors.length === 0) {
  const note = warnings.length > 0 ? ` (${warnings.length} warning(s) — see above)` : "";
  console.log(
    `✓  Catalog valid: ${CONFERENCE_CATALOG.length} conferences, ${FULL_SEASON_TOTAL} total teams${note}.`
  );
  if (warnings.length > 0) warnings.forEach(w => console.warn("  ⚠ ", w));
  process.exit(0);
} else {
  console.error(`✗  Catalog validation failed (${errors.length} error(s)):`);
  errors.forEach(e => console.error("  ✗ ", e));
  process.exit(1);
}
