import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface RetroCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "highlighted" | "bordered" | "cinematic";
  style?: React.CSSProperties;
  "data-testid"?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  id?: string;
}

export function RetroCard({ children, className, variant = "default", style, "data-testid": testId, onClick, id }: RetroCardProps) {
  const variants = {
    default: "bg-card border-card-border",
    highlighted: "bg-card border-primary/70",
    bordered: "bg-transparent border-primary/60",
    cinematic: "bg-card border-primary/40",
  };

  const surfaceStyles: Partial<Record<typeof variant, React.CSSProperties>> = {
    cinematic: {
      background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--card)))",
    },
  };

  return (
    <div
      id={id}
      className={cn("rounded-lg border p-4 sm:p-5", variants[variant], className)}
      style={{ ...surfaceStyles[variant], ...style }}
      data-testid={testId}
      onClick={onClick}
    >
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
    <div className={cn("font-display font-semibold text-foreground text-base tracking-tight mb-4", className)}>
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
