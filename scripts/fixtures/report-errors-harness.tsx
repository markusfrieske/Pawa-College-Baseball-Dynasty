import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReportErrors } from "../../client/src/components/report-errors";
import { validateBoxScore } from "../../server/lib/validateBoxScore";
import type { ReportErrorTarget } from "../../client/src/lib/report-errors";

// Actual feedback component and server validator, with a synthetic navigation/
// draft host. This is not a test of report-game.tsx, its providers, or persistence.
const validationErrors = validateBoxScore({ homeScore: 3, awayScore: 1, inningScores: [[1, 2]], homeBoxData: { pitching: [{ playerId: "pitcher", ip: "6.3", h: 1, r: 0, er: 1, bb: 0, so: 2, hr: 0 }] } });
validationErrors.push({ id: "away-batting-roster-8", field: "awayBoxData.batting.8.playerId", severity: "error", message: "Select a player from the away team's roster for this batting row" });
validationErrors.push({ id: "advisory", severity: "warning", message: "Check the optional detail" });
const initialError = new Error(`422: ${JSON.stringify({ message: validationErrors[0].message, validationErrors })}`);

function Harness() {
  const [error, setError] = useState<Error | string | null>(initialError);
  const [draft, setDraft] = useState("Synthetic draft: 3–1");
  const [target, setTarget] = useState<ReportErrorTarget | null>(null);
  const destination = useRef<HTMLInputElement>(null);
  return <>
    <ReportErrors error={error} onNavigate={next => { setTarget(next); destination.current?.focus(); }} />
    <label>Draft<input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <label>Selected section<input ref={destination} aria-label="Selected section" value={target?.section ?? "none"} readOnly /></label>
    <button onClick={() => setError('502: <html>Bad gateway</html>')}>Malformed response</button>
    <button onClick={() => setError(new Error('403: {"message":"Only an involved coach can report this game"}'))}>Permission response</button>
    <button onClick={() => setError('422: {"message":"Review this detail","validationErrors":[{"field":"unknown.path","message":"Text <img src=x onerror=alert(1)> remains text"}]}')}>Untrusted response</button>
    <button onClick={() => setError(null)}>Clear error</button>
    <pre hidden data-testid="fixture-state">{JSON.stringify({ draft, target, count: validationErrors.length })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
