import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "destructive";
  size?: "sm" | "md" | "lg";
}

export const RetroButton = forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles = "font-pixel uppercase tracking-wider transition-all duration-150 border-2 disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-gold text-navy-dark border-gold-dark hover:bg-yellow-400 active:translate-y-0.5",
      secondary: "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80 active:translate-y-0.5",
      outline: "bg-transparent text-gold border-gold hover:bg-gold/10 active:translate-y-0.5",
      destructive: "bg-red-600 text-white border-red-800 hover:bg-red-500 active:translate-y-0.5",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-[8px]",
      md: "px-5 py-2.5 text-[10px]",
      lg: "px-8 py-4 text-xs",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

RetroButton.displayName = "RetroButton";
