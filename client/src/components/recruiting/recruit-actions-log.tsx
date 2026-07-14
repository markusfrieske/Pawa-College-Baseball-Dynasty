import { useQuery } from "@tanstack/react-query";
import { Eye, Phone, Mail, GraduationCap, MapPin, HelpCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getInterestChangeLabel } from "@/lib/recruitingUtils";

interface RecruitActionsLogProps {
  recruitId: string;
  leagueId: string;
}

export function RecruitActionsLog({ recruitId, leagueId }: RecruitActionsLogProps) {
  const { data: actionsData, isLoading } = useQuery<{
    actions: Array<{
      id: string;
      week: number;
      season: number;
      actionType: string;
      interestChange: number;
      notes: string | null;
      isAutoPilot: boolean;
      createdAt: string;
    }>;
  }>({
    queryKey: ["/api/leagues", leagueId, "recruiting", recruitId, "actions"],
    enabled: !!recruitId && !!leagueId,
  });

  const actionIcons: Record<string, any> = {
    scout: <Eye className="w-3 h-3" />,
    phone: <Phone className="w-3 h-3" />,
    email: <Mail className="w-3 h-3" />,
    offer: <GraduationCap className="w-3 h-3" />,
    visit: <MapPin className="w-3 h-3" />,
  };

  const actionColors: Record<string, string> = {
    scout: "text-green-400",
    phone: "text-blue-400",
    email: "text-purple-400",
    offer: "text-gold",
    visit: "text-teal-400",
  };

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="font-pixel text-xs text-gold mb-2">Activity Log</h4>
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (!actionsData?.actions?.length) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="font-pixel text-xs text-gold mb-2">Activity Log</h4>
        <p className="text-xs text-muted-foreground italic">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <h4 className="font-pixel text-xs text-gold mb-2">Activity Log</h4>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {actionsData.actions.slice(0, 10).map((action) => (
          <div
            key={action.id}
            className="flex items-center gap-2 text-xs py-1 px-2 bg-muted/30 rounded"
            data-testid={`action-log-${action.id}`}
          >
            <span className={actionColors[action.actionType] || "text-muted-foreground"}>
              {actionIcons[action.actionType] || <HelpCircle className="w-3 h-3" />}
            </span>
            <span className="text-muted-foreground">
              Wk {action.week}, S{action.season}
            </span>
            <span className="text-foreground capitalize">{action.actionType}</span>
            {action.isAutoPilot ? (
              <span className="text-blue-400/80 flex-1">by CPU (Auto-Pilot)</span>
            ) : (
              action.notes && (
                <span className="text-muted-foreground truncate flex-1">{action.notes}</span>
              )
            )}
            {action.interestChange !== 0 && (
              <span className={action.interestChange > 0 ? getInterestChangeLabel(action.interestChange).color : "text-red-400"}>
                {action.interestChange > 0 ? `↑ ${getInterestChangeLabel(action.interestChange).label}` : "↓ Interest dropped"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
