import { AlertTriangle, RefreshCw } from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { parseErrorMessage } from "@/lib/errorUtils";

interface QueryErrorProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function QueryError({ error, message, onRetry, compact = false, className = "" }: QueryErrorProps) {
  const displayMessage = message ?? (error ? parseErrorMessage(error) : "Something went wrong. Please try again.");

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-destructive text-xs ${className}`} data-testid="query-error-compact">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1">{displayMessage}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-gold hover:text-gold/80 min-h-[44px] min-w-[44px] px-2"
            aria-label="Retry"
            data-testid="query-error-retry"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 py-12 px-6 text-center ${className}`}
      data-testid="query-error"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 border border-destructive/30">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-destructive">Error</p>
        <p className="text-sm text-muted-foreground max-w-[280px]">{displayMessage}</p>
      </div>
      {onRetry && (
        <RetroButton
          size="sm"
          variant="outline"
          onClick={onRetry}
          data-testid="query-error-retry-btn"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Try Again
        </RetroButton>
      )}
    </div>
  );
}
