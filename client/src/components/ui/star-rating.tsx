import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  showEmpty?: boolean;
}

export function StarRating({ rating, maxRating = 5, size = "md", showEmpty = true }: StarRatingProps) {
  const sizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const starColors: Record<number, string> = {
    1: "text-gray-400",
    2: "text-blue-500",
    3: "text-green-500",
    4: "text-yellow-500",
    5: "text-orange-500",
  };

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxRating }, (_, i) => {
        const filled = i < rating;
        return (
          <Star
            key={i}
            className={cn(
              sizes[size],
              filled ? cn("fill-current", starColors[rating]) : "text-muted-foreground/30",
              !filled && !showEmpty && "hidden"
            )}
            style={filled ? { filter: "drop-shadow(0 0 3px rgba(196,163,90,0.65))" } : undefined}
          />
        );
      })}
    </div>
  );
}
