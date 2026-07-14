import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { playClick } from "@/lib/sfx";

interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost" | "shimmer";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
  noClickSound?: boolean;
}

export const RetroButton = forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, noClickSound = false, children, disabled, onClick, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.01em] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-gold text-forest-dark border-2 border-gold-dark hover-elevate active-elevate-2 hover:shadow-[var(--glow-gold)] active:scale-[0.98]",
      secondary: "bg-secondary text-secondary-foreground border-2 border-border hover-elevate active-elevate-2",
      outline: "bg-transparent text-gold border-2 border-gold hover-elevate active-elevate-2",
      destructive: "bg-red-600 text-white border-2 border-red-800 hover-elevate active-elevate-2 hover:shadow-[var(--glow-red)] active:scale-[0.98]",
      ghost: "bg-transparent text-gold border-0 hover-elevate active-elevate-2",
      shimmer: "relative overflow-hidden bg-gold text-forest-dark border-2 border-gold-dark hover:shadow-[var(--glow-gold)] active:scale-[0.98]",
    };

    const sizes = {
      sm: "min-h-9 px-3 py-1.5 text-[0.8125rem]",
      md: "min-h-10 px-5 py-2.5 text-[0.8125rem]",
      lg: "min-h-11 px-8 py-3 text-sm",
      icon: "min-h-9 min-w-9 p-2 flex items-center justify-center",
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!noClickSound && !disabled && !loading) {
        playClick();
      }
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        onClick={handleClick}
        {...props}
      >
        {variant === "shimmer" && (
          <span
            className="pointer-events-none absolute top-0 h-full w-[40%]"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
              animation: "btn-shimmer 3s ease-in-out infinite",
              position: "absolute",
            }}
          />
        )}
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);

RetroButton.displayName = "RetroButton";
