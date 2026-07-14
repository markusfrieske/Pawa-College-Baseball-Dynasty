import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Clock, User, Lock } from "lucide-react";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditChange {
  id: string; fieldName: string; beforeJson: unknown; afterJson: unknown;
}

interface EditBatch {
  id: string; actorId: string; actorEmail: string | null;
  entityType: "team" | "player"; entityId: string; entityLabel: string | null;
  reason: string; effectiveSeason: number | null;
  isReversed: boolean; createdAt: string; changes: EditChange[];
}

function fieldLabel(f: string): string {
  const MAP: Record<string, string> = {
    name: "Name", mascot: "Mascot", abbreviation: "Abbrev", city: "City", state: "State",
    primaryColor: "Primary Color", secondaryColor: "Secondary Color",
    prestige: "Prestige", facilities: "Facilities", academics: "Academics",
    stadium: "Stadium", collegeLife: "College Life", marketing: "Marketing",
    nilBudget: "NIL Budget", enrollment: "Enrollment",
    firstName: "First Name", lastName: "Last Name", position: "Position",
    eligibility: "Eligibility", overall: "OVR", starRating: "Stars",
    abilities: "Abilities", velocity: "Velocity", control: "Control",
    hitForAvg: "Contact", power: "Power", speed: "Speed",
  };
  return MAP[f] ?? f;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "(none)" : (v as string[]).join(", ");
  if (typeof v === "number" && v > 10000) return `$${v.toLocaleString()}`;
  return String(v);
}

export function LeagueEditsReadOnly({ leagueId }: { leagueId: string }) {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{
    batches: EditBatch[]; total: number; page: number; pageSize: number;
  }>({
    queryKey: ["/api/leagues", leagueId, "editor", "history", page, entityType],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (entityType !== "all") params.set("entityType", entityType);
      return fetch(`/api/leagues/${leagueId}/editor/history?${params}`, { credentials: "include" }).then(r => r.json());
    },
    retry: false,
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  if (isError) {
    return (
      <RetroCard className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Unable to load commissioner edit history.</p>
      </RetroCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs font-semibold text-gold">Commissioner Edits</p>
          <p className="text-xs text-muted-foreground">Transparent log of all roster and school changes made by the commissioner.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(1); }}>
            <SelectTrigger className="w-32 h-7 text-xs" data-testid="select-edits-type">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="team">Schools</SelectItem>
              <SelectItem value="player">Players</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground shrink-0">{data?.total ?? 0} edits</span>
        </div>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}

      <div className="space-y-2">
        {data?.batches.map(batch => (
          <RetroCard key={batch.id} className={batch.isReversed ? "opacity-50" : ""}>
            <RetroCardContent className="py-2 px-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs ${batch.entityType === "team" ? "border-blue-500/40 text-blue-400" : "border-green-500/40 text-green-400"}`}
                    >
                      {batch.entityType === "team" ? "School" : "Player"}
                    </Badge>
                    <span className="text-xs font-medium truncate max-w-[200px]">
                      {batch.entityLabel ?? "(unknown)"}
                    </span>
                    {batch.isReversed && (
                      <Badge variant="outline" className="text-xs border-red-500/40 text-red-400">Reversed</Badge>
                    )}
                    {batch.effectiveSeason && (
                      <span className="text-xs text-muted-foreground">Season {batch.effectiveSeason}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">"{batch.reason}"</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(batch.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-2.5 h-2.5" />
                      Commissioner
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {batch.changes.length} field{batch.changes.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)}
                  className="p-1 rounded hover:bg-card/80 text-muted-foreground transition-colors shrink-0"
                  data-testid={`btn-expand-edit-${batch.id}`}
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${expandedId === batch.id ? "rotate-90" : ""}`} />
                </button>
              </div>

              {expandedId === batch.id && batch.changes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border space-y-1">
                  {batch.changes.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-28 shrink-0">{fieldLabel(c.fieldName)}</span>
                      <span className="text-red-400/80 line-through truncate max-w-[120px]">{fmtVal(c.beforeJson)}</span>
                      <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      <span className="text-green-400 truncate max-w-[120px]">{fmtVal(c.afterJson)}</span>
                    </div>
                  ))}
                </div>
              )}
            </RetroCardContent>
          </RetroCard>
        ))}
        {data?.batches.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">No commissioner edits yet.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <RetroButton variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </RetroButton>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <RetroButton variant="secondary" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </RetroButton>
        </div>
      )}
    </div>
  );
}
