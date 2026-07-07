import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TransferPortalPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  eligibility: string;
  fromTeam: string;
}

interface TransferPortalResponse {
  players: TransferPortalPlayer[];
}

interface TransferCommissionerSectionProps {
  leagueId: string;
}

export function TransferCommissionerSection({ leagueId }: TransferCommissionerSectionProps) {
  const { data, isLoading } = useQuery<TransferPortalResponse>({
    queryKey: ["/api/leagues", leagueId, "transfer-portal"],
  });

  const players = data?.players ?? [];

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-gold" />
          Transfer Portal
          <Badge variant="outline" className="ml-auto text-[10px]">
            {players.length} players
          </Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        )}
        {!isLoading && players.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No players currently in the transfer portal.
          </p>
        )}
        {!isLoading && players.length > 0 && (
          <div className="space-y-1.5">
            {players.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between px-3 py-2 rounded border border-border/30 bg-muted/10 text-sm"
                data-testid={`transfer-player-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] w-8 justify-center">
                    {p.position}
                  </Badge>
                  <span className="font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.eligibility}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{p.fromTeam}</span>
                  <span className="font-bold text-gold">{p.overall}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}
