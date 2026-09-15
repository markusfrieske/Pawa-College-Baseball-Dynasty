import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReportOverrideReason } from "../../client/src/components/report-override-reason";

// Actual panel, synthetic parent-owned state. This does not exercise report-game,
// its API, its styling pipeline, or durable persistence.
function Harness() {
  const [phase, setPhase] = useState<"score" | "review">("score");
  const [reason, setReason] = useState("");
  const [requiresReason, setRequiresReason] = useState(true);
  const [draft, setDraft] = useState("Synthetic score: 5–2");
  return <>
    <button onClick={() => setPhase(phase === "score" ? "review" : "score")}>Switch phase</button>
    <button onClick={() => setRequiresReason(!requiresReason)}>Toggle commissioner requirement</button>
    <p aria-label="Current phase">{phase}</p>
    <label>Score draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <div key={phase}>{requiresReason && <ReportOverrideReason value={reason} onChange={setReason} />}</div>
    <button onClick={() => document.getElementById("report-override-reason")?.focus()}>Review commissioner reason</button>
    <pre hidden data-testid="fixture-state">{JSON.stringify({ phase, reason, draft, requiresReason })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
