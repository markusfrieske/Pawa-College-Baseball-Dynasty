import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface RetroCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "highlighted" | "bordered";
  style?: React.CSSProperties;
  "data-testid"?: string;
}

export function RetroCard({ children, className, variant = "default", style, "data-testid": testId }: RetroCardProps) {
  const variants = {
    default: "bg-card border-card-border",
    highlighted: "bg-card border-gold",
    bordered: "bg-transparent border-gold",
  };

  return (
    <div className={cn("border-2 p-4", variants[variant], className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

interface RetroCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function RetroCardHeader({ children, className }: RetroCardHeaderProps) {
  return (
    <div className={cn("font-pixel text-gold text-sm uppercase tracking-wider mb-4", className)}>
      {children}
    </div>
  );
}

interface RetroCardContentProps {
  children: ReactNode;
  className?: string;
}

export function RetroCardContent({ children, className }: RetroCardContentProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}
