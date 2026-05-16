import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface RetroCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "highlighted" | "bordered" | "cinematic";
  style?: React.CSSProperties;
  "data-testid"?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export function RetroCard({ children, className, variant = "default", style, "data-testid": testId, onClick }: RetroCardProps) {
  const variants = {
    default: "bg-card border-card-border",
    highlighted: "bg-card border-gold",
    bordered: "bg-transparent border-gold",
    cinematic: "border-gold/60",
  };

  const glowStyles: Record<string, React.CSSProperties> = {
    default: {
      background: "radial-gradient(ellipse at 50% 0%, hsl(120 22% 17%) 0%, hsl(120 22% 14%) 60%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.25)",
    },
    highlighted: {
      background: "radial-gradient(ellipse at 50% 0%, hsl(120 22% 17%) 0%, hsl(120 22% 14%) 60%)",
      boxShadow: "var(--glow-gold), inset 0 1px 0 rgba(255,255,255,0.04)",
    },
    bordered: {},
    cinematic: {
      background: "linear-gradient(135deg, hsl(120 22% 16%) 0%, hsl(120 18% 12%) 100%)",
      borderTop: "1px solid rgba(196,163,90,0.6)",
      boxShadow: "inset 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.35)",
    },
  };

  return (
    <div
      className={cn("border-2 p-4", variants[variant], className)}
      style={{ ...glowStyles[variant], ...style }}
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
