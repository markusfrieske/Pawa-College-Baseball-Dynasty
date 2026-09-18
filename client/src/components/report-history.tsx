import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Revision = { id: string; editVersion: number; actorUserId: string | null; event: string; createdAt: string;
  snapshot: { homeScore: number; awayScore: number; homeHits: number | null; awayHits: number | null; homeErrors: number | null; awayErrors: number | null; status: string; disputeReason?: string | null };
  corrections: unknown[] };
type History = { revisions: Revision[]; actorNames: Record<string, string>; receipt: { reportRevisionId: string | null; acceptedByUserId: string | null; finalizedAt: string } | null };
const events: Record<string, string> = { submitted: "Submitted", edited: "Edited", disputed: "Disputed", accepted: "Accepted", confirmed: "Accepted", "force-finalized": "Accepted by commissioner", "legacy-observed": "Existing report preserved" };

export function ReportHistory({ leagueId, gameId }: { leagueId: string; gameId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery<History>({ queryKey: ["/api/leagues", leagueId, "games", gameId, "report", "history"], enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/leagues/${leagueId}/games/${gameId}/report/history`, { credentials: "include", signal });
      if (!response.ok) throw new Error(response.status === 403 ? "Only participating coaches and commissioners can view report history." : "Report history could not be loaded.");
      return response.json();
    }, retry: false,
  });
  const observed = (value: number | null) => value == null ? "Not recorded" : String(value);
  return <section className="space-y-2 text-sm">
    <button type="button" className="underline underline-offset-4 text-gold" aria-expanded={open} onClick={() => setOpen(value => !value)}>Report history</button>
    {open && <div className="space-y-3 rounded border border-border p-3" aria-label="Report history">
      {query.isLoading && <p role="status">Loading report history…</p>}
      {query.isError && <div role="alert"><p>{query.error.message}</p><button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button></div>}
      {query.data && !query.isError && <>
        {query.data.receipt && !query.data.receipt.reportRevisionId && <p>This official result has no linked accepted report version.</p>}
        {query.data.revisions.length === 0 && <p>No report history is recorded for this game.</p>}
        <p className="text-xs text-muted-foreground">Names reflect current league profiles.</p>
        <button type="button" className="underline text-xs" onClick={() => void query.refetch()}>Refresh history</button>
        <ol className="space-y-3">{query.data.revisions.map(revision => {
          const official = query.data!.receipt?.reportRevisionId === revision.id;
          const actor = revision.actorUserId ? query.data!.actorNames[revision.actorUserId] ?? "Recorded league member" : "Actor not recorded";
          return <li key={revision.id} className="rounded border border-border p-3 space-y-1">
            <p className="font-semibold">Version {revision.editVersion} · {events[revision.event] ?? "Report updated"}{official ? " · Official result" : ""}</p>
            <p>Away {revision.snapshot.awayScore} – Home {revision.snapshot.homeScore}</p>
            <p className="text-xs text-muted-foreground">{actor} · {new Date(revision.createdAt).toLocaleString()}</p>
            {revision.event === "legacy-observed" && <p className="text-xs">Preserved when history tracking began. Earlier edits and their authors are unavailable.</p>}
            <details className="text-xs"><summary className="cursor-pointer">Recorded details</summary>
              <p>Status: {revision.snapshot.status}</p>
              <p>Hits — Away: {observed(revision.snapshot.awayHits)}; Home: {observed(revision.snapshot.homeHits)}</p>
              <p>Errors — Away: {observed(revision.snapshot.awayErrors)}; Home: {observed(revision.snapshot.homeErrors)}</p>
              {revision.snapshot.disputeReason && <p>Dispute: {revision.snapshot.disputeReason}</p>}
              <p>{revision.event === "legacy-observed" ? "Earlier correction history is not attributed to this version." : `${revision.corrections.length} recorded field corrections`}</p>
            </details>
          </li>;
        })}</ol>
      </>}
    </div>}
  </section>;
}
