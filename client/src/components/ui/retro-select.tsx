import { cn } from "@/lib/utils";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface RetroSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const RetroSelect = forwardRef<HTMLSelectElement, RetroSelectProps>(
  ({ className, label, id, options, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block font-pixel text-[10px] uppercase text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            className={cn(
              "w-full bg-input border-2 border-border text-foreground px-4 py-3 font-pixel text-[10px]",
              "appearance-none cursor-pointer focus:outline-none focus:border-gold",
              "transition-colors duration-150",
              className
            )}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>
    );
  }
);

RetroSelect.displayName = "RetroSelect";
