import { History } from "lucide-react";
import { RetroCard, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import type { AuditLog } from "@shared/schema";

interface AuditLogTabProps {
  logs: AuditLog[];
}

export function AuditLogTab({ logs }: AuditLogTabProps) {
  return (
    <RetroCard>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <span>Audit Log</span>
        <Badge variant="outline" className="text-[8px]">
          {logs.length} entries
        </Badge>
      </RetroCardHeader>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded">
            <History className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm">{log.action}</p>
              {log.details && (
                <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No audit log entries yet</p>
          </div>
        )}
      </div>
    </RetroCard>
  );
}
