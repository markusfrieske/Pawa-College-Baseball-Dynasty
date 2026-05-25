/**
 * validate-national-ranks — asserts that every team in NATIONAL_RANKS has a
 * unique rank number, with the exception of the floor rank (TOTAL_NATIONAL_TEAMS)
 * which multiple bottom-tier teams intentionally share.
 */

import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "../server/rosterScaleFactors";

const FLOOR_RANK = TOTAL_NATIONAL_TEAMS;
const rankToTeams: Record<number, string[]> = {};

for (const [team, rank] of Object.entries(NATIONAL_RANKS)) {
  if (!rankToTeams[rank]) {
    rankToTeams[rank] = [];
  }
  rankToTeams[rank].push(team);
}

const duplicates = Object.entries(rankToTeams).filter(
  ([rank, teams]) => teams.length > 1 && Number(rank) !== FLOOR_RANK
);

if (duplicates.length === 0) {
  const floorCount = (rankToTeams[FLOOR_RANK] ?? []).length;
  const floorNote = floorCount > 1 ? ` (${floorCount} teams share floor rank #${FLOOR_RANK} — intentional)` : "";
  console.log(
    `✓  All ${Object.keys(NATIONAL_RANKS).length} teams have unique national rank numbers${floorNote}.`
  );
  process.exit(0);
} else {
  console.error(
    `✗  Found ${duplicates.length} duplicate national rank number(s):\n`
  );
  for (const [rank, teams] of duplicates.sort(
    ([a], [b]) => Number(a) - Number(b)
  )) {
    console.error(`  Rank #${rank}: ${teams.join(", ")}`);
  }
  console.error(
    `\nFix NATIONAL_RANKS in server/rosterScaleFactors.ts so every team has a unique rank.`
  );
  process.exit(1);
}
