/**
 * Runtime roster-structure validation.
 *
 * Applies the same 10P / 2C / 6-7INF / 6OF / 25-total rules used by
 * scripts/validate-roster-structure.ts, but against live DB rosters instead
 * of static import files.  Called after each phase transition so CPU-built
 * rosters are caught immediately during development.
 *
 * All violations are logged as [roster-validation] console.error lines —
 * they do NOT throw, so a single malformed roster never aborts the transition
 * for the whole league.
 */

const PITCHER_POSITIONS   = new Set(["P", "SP", "RP", "CP"]);
const CATCHER_POSITIONS   = new Set(["C"]);
const INFIELD_POSITIONS   = new Set(["1B", "2B", "3B", "SS", "DH", "INF"]);
const OUTFIELD_POSITIONS  = new Set(["OF", "LF", "CF", "RF"]);
const ALL_KNOWN_POSITIONS = new Set([
  ...Array.from(PITCHER_POSITIONS),
  ...Array.from(CATCHER_POSITIONS),
  ...Array.from(INFIELD_POSITIONS),
  ...Array.from(OUTFIELD_POSITIONS),
]);

export interface RosterPlayer {
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
}

export interface RosterViolation {
  teamName: string;
  message: string;
}

/**
 * Check a single team's roster array against the structural rules.
 * Returns an array of human-readable violation messages (empty = pass).
 */
export function checkTeamRosterStructure(
  teamName: string,
  players: RosterPlayer[]
): RosterViolation[] {
  const violations: RosterViolation[] = [];
  const fail = (msg: string) => violations.push({ teamName, message: msg });

  // 1. Roster size
  if (players.length !== 25) {
    fail(`has ${players.length} players (expected 25)`);
  }

  // 2. Freshmen count
  const frCount = players.filter(p => p.eligibility === "FR").length;
  if (frCount !== 5) {
    fail(`has ${frCount} freshmen (expected 5)`);
  }

  // 3. Unknown positions
  for (const p of players) {
    if (!ALL_KNOWN_POSITIONS.has(p.position)) {
      fail(`${p.firstName} ${p.lastName} has unknown position "${p.position}"`);
    }
  }

  // 4. Position-group counts
  const pitchers   = players.filter(p => PITCHER_POSITIONS.has(p.position)).length;
  const catchers   = players.filter(p => CATCHER_POSITIONS.has(p.position)).length;
  const infielders = players.filter(p => INFIELD_POSITIONS.has(p.position)).length;
  const outfielders = players.filter(p => OUTFIELD_POSITIONS.has(p.position)).length;

  if (pitchers !== 10)                           fail(`has ${pitchers} pitchers (expected 10)`);
  if (catchers !== 2)                            fail(`has ${catchers} catchers (expected 2)`);
  if (infielders < 6 || infielders > 7)          fail(`has ${infielders} infielders (expected 6–7)`);
  if (outfielders !== 6)                         fail(`has ${outfielders} outfielders (expected 6)`);

  return violations;
}

export interface ValidationResult {
  violations: number;
  fetchErrors: number;
  teamsChecked: number;
}

/**
 * Query every team in a league from the DB and log any roster-structure
 * violations.  Returns a result object distinguishing validation violations
 * from DB fetch errors — a fetchErrors > 0 means the check was incomplete
 * and should not be treated as a clean pass.
 *
 * @param leagueId   - league to check
 * @param getTeams   - async fn returning teams with { id, name }
 * @param getPlayers - async fn returning players with { position, eligibility, firstName, lastName }
 * @param label      - context label shown in log prefix, e.g. "post-signing-day"
 */
export async function validateLeagueRosters(
  leagueId: string,
  getTeams: (leagueId: string) => Promise<Array<{ id: string; name: string }>>,
  getPlayers: (teamId: string) => Promise<RosterPlayer[]>,
  label: string
): Promise<ValidationResult> {
  const TAG = `[roster-validation:${label}]`;

  let teams: Array<{ id: string; name: string }>;
  try {
    teams = await getTeams(leagueId);
  } catch (err) {
    console.error(`${TAG} Failed to fetch teams — validation skipped:`, err);
    return { violations: 0, fetchErrors: 1, teamsChecked: 0 };
  }

  const allViolations: RosterViolation[] = [];
  let fetchErrors = 0;

  for (const team of teams) {
    let players: RosterPlayer[];
    try {
      players = await getPlayers(team.id);
    } catch (err) {
      console.error(`${TAG} Failed to fetch players for team "${team.name}" — skipping:`, err);
      fetchErrors++;
      continue;
    }

    const teamViolations = checkTeamRosterStructure(team.name, players);
    allViolations.push(...teamViolations);
  }

  const teamsChecked = teams.length - fetchErrors;

  if (fetchErrors > 0) {
    console.error(
      `${TAG} WARNING: ${fetchErrors} team(s) could not be fetched — results are incomplete.`
    );
  }

  if (allViolations.length === 0) {
    console.log(`${TAG} All ${teamsChecked} team rosters pass structure validation.`);
    return { violations: 0, fetchErrors, teamsChecked };
  }

  console.error(
    `${TAG} Found ${allViolations.length} roster-structure violation(s) across ${teamsChecked} teams checked:`
  );
  for (const v of allViolations) {
    console.error(`${TAG}   [${v.teamName}]: ${v.message}`);
  }
  console.error(
    `${TAG} These violations indicate CPU auto-signing or walk-on logic produced malformed rosters.`
  );
  console.error(
    `${TAG} Expected: 25 players total, 5 FR, 10P / 2C / 6-7 INF / 6 OF per team.`
  );

  return { violations: allViolations.length, fetchErrors, teamsChecked };
}
