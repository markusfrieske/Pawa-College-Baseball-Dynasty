import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReportEntryMode, type ReportEntryModeValue } from "../../client/src/components/report-entry-mode";
import { buildScoreOnlyReport } from "../../shared/reporting";

/** Synthetic parent state exercises the actual control, not full report-page integration. */
function Harness() {
  const [mode, setMode] = useState<ReportEntryModeValue>("full");
  const [draftNote, setDraftNote] = useState("Synthetic full report draft");
  const fullDraft = {
    homeScore: 4, awayScore: 2,
    homeBatting: [{ playerId: "synthetic-home", ab: 4, h: 2 }],
    awayPitching: [{ playerId: "synthetic-away", ip: "6.0", er: 4 }],
    innings: [{ home: 4, away: 2 }],
    note: draftNote,
  };
  const payload = mode === "score-only"
    ? buildScoreOnlyReport({ homeScore: fullDraft.homeScore, awayScore: fullDraft.awayScore, overrideReason: "Missing scorebook" })
    : fullDraft;
  return <main>
    <ReportEntryMode value={mode} onChange={setMode} />
    {mode === "full" && <label>Full draft note<input value={draftNote} onChange={event => setDraftNote(event.target.value)} /></label>}
    <pre data-testid="fixture-state">{JSON.stringify({ mode, fullDraft, payload })}</pre>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
