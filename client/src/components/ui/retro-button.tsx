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
    const baseStyles = "varsity-button inline-flex items-center justify-center gap-2 rounded-md font-sans font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-primary text-primary-foreground border border-primary-border hover-elevate active-elevate-2",
      secondary: "bg-secondary text-secondary-foreground border border-input hover-elevate active-elevate-2",
      outline: "bg-transparent text-primary border border-input hover-elevate active-elevate-2",
      destructive: "bg-destructive text-destructive-foreground border border-destructive-border hover-elevate active-elevate-2",
      ghost: "bg-transparent text-primary border border-transparent hover-elevate active-elevate-2",
      shimmer: "relative overflow-hidden bg-primary text-primary-foreground border border-primary-border hover-elevate",
    };

    const sizes = {
      sm: "min-h-11 px-3 py-2 text-[0.8125rem]",
      md: "min-h-11 px-5 py-2.5 text-[0.8125rem]",
      lg: "min-h-11 px-8 py-3 text-sm",
      icon: "min-h-11 min-w-11 p-2 flex items-center justify-center",
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
            className="varsity-button-shimmer pointer-events-none absolute top-0 h-full w-[40%]"
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
