import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: string;
}

export function StatCard({ icon, label, value, highlight, tooltip }: StatCardProps) {
  const card = (
    <div className={`bg-card border p-1.5 rounded text-center ${highlight ? "border-red-500/50" : "border-border"} ${tooltip ? "cursor-help" : ""}`}>
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
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
