import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { Gavel, CheckCircle, X } from "lucide-react";
import type { AuctionOutcome } from "../types";
import { fmtKLeague } from "../helpers";

export function WalkonAuctionSummaryModal({ outcomes, onDismiss }: {
  outcomes: AuctionOutcome[];
  onDismiss: () => void;
}) {
  const won = outcomes.filter(r => r.won);
  const lost = outcomes.filter(r => !r.won);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="bg-card border-gold/30 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="modal-auction-summary">
        <DialogHeader>
          <DialogTitle className="text-gold text-sm flex items-center gap-2">
            <Gavel className="w-4 h-4 text-gold" />
            Walk-On Auction Results
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground mb-4">
          Here's a summary of your results from the walk-on auction.
          {won.length > 0 && lost.length > 0 && ` You signed ${won.length} player${won.length !== 1 ? "s" : ""} and were outbid on ${lost.length}.`}
          {won.length > 0 && lost.length === 0 && ` You won all ${won.length} bid${won.length !== 1 ? "s" : ""}.`}
          {won.length === 0 && lost.length > 0 && ` You were outbid on all ${lost.length} player${lost.length !== 1 ? "s" : ""}.`}
        </p>

        {won.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-green-400 mb-2 uppercase">Signed</h3>
            <div className="space-y-1.5">
              {won.map(r => (
                <div
                  key={r.walkonId}
                  className="flex items-center justify-between p-2 rounded bg-green-900/10 border border-green-700/30"
                  data-testid={`auction-won-${r.walkonId}`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                      <p className="text-xs text-muted-foreground">{r.position} · {r.overall} OVR</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-400">{fmtKLeague(r.pricePaid)}</p>
                    <p className="text-xs text-muted-foreground">your bid: {fmtKLeague(r.yourBid)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lost.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-red-400 mb-2 uppercase">Outbid On</h3>
            <div className="space-y-1.5">
              {lost.map(r => (
                <div
                  key={r.walkonId}
                  className="flex items-center justify-between p-2 rounded bg-red-900/10 border border-red-700/30"
                  data-testid={`auction-lost-${r.walkonId}`}
                >
                  <div className="flex items-center gap-2">
                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                      <p className="text-xs text-muted-foreground">{r.position} · {r.overall} OVR</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">won by {r.winnerTeamName}</p>
                    <p className="text-sm font-medium text-red-400">{fmtKLeague(r.pricePaid)}</p>
                    <p className="text-xs text-muted-foreground">your bid: {fmtKLeague(r.yourBid)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <RetroButton
          onClick={onDismiss}
          className="w-full mt-2"
          data-testid="button-dismiss-auction-summary"
        >
          Got It
        </RetroButton>
      </DialogContent>
    </Dialog>
  );
}
