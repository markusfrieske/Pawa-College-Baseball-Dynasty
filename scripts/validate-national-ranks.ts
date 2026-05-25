/**
 * validate-national-ranks — asserts that every team in NATIONAL_RANKS has a
 * unique rank number.  Exits non-zero and lists all duplicate entries when
 * conflicts are found.
 */

import { NATIONAL_RANKS } from "../server/rosterScaleFactors";

const rankToTeams: Record<number, string[]> = {};

for (const [team, rank] of Object.entries(NATIONAL_RANKS)) {
  if (!rankToTeams[rank]) {
    rankToTeams[rank] = [];
  }
  rankToTeams[rank].push(team);
}

const duplicates = Object.entries(rankToTeams).filter(
  ([, teams]) => teams.length > 1
);

if (duplicates.length === 0) {
  console.log(
    `✓  All ${Object.keys(NATIONAL_RANKS).length} teams have unique national rank numbers.`
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
