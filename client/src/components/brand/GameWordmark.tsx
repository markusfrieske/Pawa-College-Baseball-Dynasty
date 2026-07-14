/**
 * GameWordmark — the ONLY permitted use of the brand-pixel font in the UI.
 * Must render at 16px or larger. Do not use for body text, labels, or buttons.
 */
import { cn } from "@/lib/utils";

interface GameWordmarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function GameWordmark({ className, size = "md" }: GameWordmarkProps) {
  const sizeClasses = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
  };
  return (
    <span
      className={cn("font-brand-pixel text-gold leading-snug", sizeClasses[size], className)}
    >
      CBDynasty
    </span>
  );
}
