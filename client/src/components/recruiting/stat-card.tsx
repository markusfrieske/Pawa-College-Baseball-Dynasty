import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: React.ReactNode;
  "data-testid"?: string;
}

export function StatCard({ icon, label, value, highlight, tooltip, "data-testid": testId }: StatCardProps) {
  const card = (
    <div
      className={`bg-card border p-1.5 rounded text-center ${highlight ? "border-red-500/50" : "border-border"} ${tooltip ? "cursor-help" : ""}`}
      data-testid={testId}
    >
      <div className={`flex items-center justify-center gap-1 mb-0.5 ${highlight ? "text-red-400" : "text-muted-foreground"}`}>
        <span className="[&>svg]:w-3 [&>svg]:h-3">{icon}</span>
        <span className="text-[9px] uppercase tracking-wide leading-none">{label}</span>
      </div>
      <p className={`text-sm font-bold leading-none ${highlight ? "text-red-400" : "text-foreground"}`}>{value}</p>
    </div>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-center text-[11px]">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
