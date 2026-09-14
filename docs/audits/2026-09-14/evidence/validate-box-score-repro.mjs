// Database-free source reproduction for TI-03.
// Run from the repository root with Node 24:
// node --experimental-strip-types docs/audits/2026-09-14/evidence/validate-box-score-repro.mjs
// Imports the actual source validator. Does not import storage or connect to a database.
import { validateBoxScore } from "../../../../server/lib/validateBoxScore.ts";

const rows = Array.from({ length: 9 }, (_, i) => ({
  r: i === 0 ? 1 : 0,
  h: 0,
  ab: -7,
  hr: 999,
}));
const zero = rows.map(row => ({ ...row, r: 0 }));
const payload = {
  homeScore: 1,
  awayScore: 0,
  inningScores: [[0, 1]],
  homeBoxData: { batting: rows, pitching: [{ ip: "0.0" }] },
  awayBoxData: { batting: zero, pitching: [{ ip: "0.0" }] },
};

const issues = validateBoxScore(payload);
console.log(JSON.stringify({
  sourceRevision: "8a1e113070c1e809da83cc66fc7eb84ffb9bec21",
  nodeVersion: process.version,
  scenario: "Negative AB, 999 HR, no player IDs, one inning, zero outs",
  validationIssues: issues,
  defectReproduced: issues.length === 0,
  payload,
}, null, 2));
