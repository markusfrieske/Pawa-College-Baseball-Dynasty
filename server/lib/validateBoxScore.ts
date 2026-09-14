/** Pure validation of untrusted report payloads. Database roster membership is
 * checked separately; player names are display labels, never identities. */
export interface BoxScoreIssue {
  id: string;
  field?: string;
  severity: "error" | "warning";
  message: string;
}

type Row = Record<string, unknown>;
const isObject = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
// Persisted counting stats use PostgreSQL integer columns. This is a storage
// boundary, not a maximum baseball performance or configurable league rule.
const MAX_COUNTER = 2_147_483_647;
const isCounter = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER;
// Required fields match the report form's emitted payload. Advanced counters
// absent from that form remain optional; omission must not certify a zero.
const BATTING_CORE = ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"];
const BATTING_COUNTERS = [...BATTING_CORE, "hbp", "cs", "barrels", "ballsInPlay", "hardHits", "putouts", "assists", "fieldingErrors", "totalChances"];
const PITCHING_CORE = ["h", "r", "er", "bb", "so", "hr"];
const PITCHING_COUNTERS = [...PITCHING_CORE, "totalPitches", "whiffs"];
const IP_RE = /^\d+(\.[012])?$/;

export function validateBoxScore(data: unknown): BoxScoreIssue[] {
  const issues: BoxScoreIssue[] = [];
  const error = (id: string, field: string, message: string) => {
    issues.push({ id, field, severity: "error", message });
  };
  if (!isObject(data)) {
    error("invalid-report", "report", "Report must be an object");
    return issues;
  }

  // Preserve the existing application policy pending configurable league rules.
  // This is not a claim that every Power Pros ruleset prohibits tied games.
  for (const side of ["home", "away"] as const) {
    const score = data[`${side}Score`];
    if (!isCounter(score) || score > 30) {
      error(`invalid-${side}-score`, `${side}Score`, `${side} score must be a whole number 0–30 under the current reporting policy`);
    }
    for (const stat of ["Hits", "Errors"]) {
      const field = `${side}${stat}`;
      if (data[field] != null && !isCounter(data[field])) {
        error(`invalid-${side}-${stat.toLowerCase()}`, field, `${field} must be a nonnegative safe whole number`);
      }
    }
  }
  if (isCounter(data.homeScore) && isCounter(data.awayScore) && data.homeScore === data.awayScore) {
    error("tied-score", "homeScore", "Tied scores are not supported by the current reporting policy");
  }

  if (data.inningScores != null) {
    if (!Array.isArray(data.inningScores)) {
      error("invalid-innings", "inningScores", "Inning scores must be an array of [away, home] whole-number pairs");
    } else {
      let home = 0;
      let away = 0;
      let valid = true;
      for (let i = 0; i < data.inningScores.length; i++) {
        const inning = data.inningScores[i];
        if (!Array.isArray(inning) || inning.length !== 2 || !isCounter(inning[0]) || !isCounter(inning[1])) {
          error(`invalid-inning-${i}`, `inningScores.${i}`, "Each inning must contain exactly [away, home] nonnegative safe whole numbers");
          valid = false;
        } else {
          away += inning[0];
          home += inning[1];
        }
      }
      if (valid && data.inningScores.length > 0) {
        if (home !== data.homeScore) error("home-inning-total", "inningScores", "Home inning totals must match the reported home score");
        if (away !== data.awayScore) error("away-inning-total", "inningScores", "Away inning totals must match the reported away score");
      }
    }
  }

  function validateCounters(row: Row, fields: string[], path: string, required: string[] = []) {
    for (const field of fields) {
      if ((row[field] !== undefined || required.includes(field)) && !isCounter(row[field])) {
        error(`invalid-counter-${path}.${field}`, `${path}.${field}`, `${field} must be a nonnegative safe whole number`);
      }
    }
  }

  function validateRelations(row: Row, path: string, pitching: boolean) {
    if (!pitching && isCounter(row.h) && isCounter(row.ab) && row.h > row.ab) {
      error(`hits-exceed-ab-${path}`, `${path}.h`, "Hits cannot exceed at-bats");
    }
    if (!pitching && isCounter(row.h) && isCounter(row.so) && isCounter(row.ab) && row.h + row.so > row.ab) {
      error(`hits-and-so-exceed-ab-${path}`, `${path}.ab`, "Hits plus strikeouts cannot exceed at-bats");
    }
    if (!pitching && isCounter(row.h)) {
      const extraHits = [row.doubles, row.triples, row.hr].filter(isCounter).reduce((sum, n) => sum + n, 0);
      if (extraHits > row.h) error(`extra-hits-exceed-h-${path}`, `${path}.h`, "Supplied doubles, triples and home runs cannot exceed hits");
    }
    if (pitching && isCounter(row.er) && isCounter(row.r) && row.er > row.r) {
      error(`earned-runs-exceed-runs-${path}`, `${path}.er`, "Earned runs cannot exceed runs allowed");
    }
    for (const stat of pitching ? ["h", "r"] : ["r", "rbi"]) {
      if (isCounter(row.hr) && isCounter(row[stat]) && row.hr > row[stat]) {
        error(`hr-exceed-${stat}-${path}`, `${path}.hr`, `Home runs cannot exceed ${stat}`);
      }
    }
  }

  for (const side of ["home", "away"] as const) {
    const boxPath = `${side}BoxData`;
    const box = data[boxPath];
    if (box == null) continue; // Existing score-only commissioner reports.
    if (!isObject(box)) {
      error(`invalid-${side}-box`, boxPath, "Box score must be an object or null");
      continue;
    }
    if (box.totals !== undefined) {
      if (!isObject(box.totals)) error(`invalid-${side}-totals`, `${boxPath}.totals`, "Box score totals must be an object");
      else {
        validateCounters(box.totals, BATTING_COUNTERS, `${boxPath}.totals`);
        validateRelations(box.totals, `${boxPath}.totals`, false);
      }
    }
    for (const kind of ["batting", "pitching"] as const) {
      const path = `${boxPath}.${kind}`;
      const rows = box[kind];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) {
        error(`invalid-${side}-${kind}`, path, `${kind} must be an array`);
        continue;
      }
      if (kind === "batting" && rows.length > 0 && rows.length < 9) {
        error(`${side}-min-batters`, path, "The current reporting policy requires at least 9 batters when batting rows are supplied");
      }
      const ids = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const rowPath = `${path}.${i}`;
        const row = rows[i];
        if (!isObject(row)) {
          error(`invalid-row-${rowPath}`, rowPath, "Every stat row must be an object");
          continue;
        }
        if (typeof row.playerId !== "string" || row.playerId.trim().length === 0 || row.playerId !== row.playerId.trim()) {
          error(`invalid-player-${rowPath}`, `${rowPath}.playerId`, "Each stat row requires an exact, nonblank roster playerId");
        } else if (ids.has(row.playerId)) {
          error(`duplicate-player-${rowPath}`, `${rowPath}.playerId`, "A player can appear only once in this team's batting or pitching section");
        } else ids.add(row.playerId);
        validateCounters(row, kind === "batting" ? BATTING_COUNTERS : PITCHING_COUNTERS, rowPath, kind === "batting" ? BATTING_CORE : PITCHING_CORE);
        validateRelations(row, rowPath, kind === "pitching");
        const measurement = kind === "batting" ? "exitVelo" : "spinRate";
        if (row[measurement] !== undefined && (typeof row[measurement] !== "number" || !Number.isFinite(row[measurement]) || row[measurement] < 0 || row[measurement] > Number.MAX_SAFE_INTEGER)) {
          error(`invalid-measurement-${rowPath}.${measurement}`, `${rowPath}.${measurement}`, `${measurement} must be a finite nonnegative number`);
        }
        if (kind === "pitching") {
          const validIp = typeof row.ip === "string" && IP_RE.test(row.ip)
            && isCounter(Number(row.ip.split(".")[0]) * 3 + Number(row.ip.split(".")[1] ?? 0));
          if (!validIp) error(`invalid-ip-${rowPath}`, `${rowPath}.ip`, "IP must use whole innings plus 0, 1 or 2 outs, such as 6.0 or 2.1");
          for (const decision of ["win", "loss"]) {
            if (row[decision] !== undefined && typeof row[decision] !== "boolean") {
              error(`invalid-decision-${rowPath}.${decision}`, `${rowPath}.${decision}`, `${decision} must be a boolean when supplied`);
            }
          }
        }
      }
      if (kind === "batting" && rows.length > 0) {
        if (isObject(box.totals)) {
          for (const stat of BATTING_COUNTERS) {
            if (isCounter(box.totals[stat]) && rows.every(row => isObject(row) && isCounter(row[stat]))) {
              const sum = rows.reduce((acc, row) => acc + row[stat], 0);
              if (sum !== box.totals[stat]) error(`${side}-totals-${stat}`, `${boxPath}.totals.${stat}`, `Supplied ${stat} total must match the batting rows`);
            }
          }
        }
        for (const [stat, total, id] of [
          ["r", data[`${side}Score`], `${side}-batting-runs`],
          ["h", data[`${side}Hits`], `${side}-hits-mismatch`],
        ] as const) {
          if (total == null) continue;
          if (rows.every(row => isObject(row) && isCounter(row[stat]))) {
            const sum = rows.reduce((acc, row) => acc + row[stat], 0);
            if (sum !== total) error(id, path, `Batting ${stat} totals must match the reported team total`);
          }
        }
      }
    }
  }
  return issues;
}
