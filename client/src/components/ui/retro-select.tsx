import { cn } from "@/lib/utils";
import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface RetroSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const RetroSelect = forwardRef<HTMLSelectElement, RetroSelectProps>(
  ({ className, label, id, options, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id || generatedId;
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={fieldId} className="block text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            className={cn(
              "w-full min-h-11 rounded-md bg-background border border-input text-foreground pl-4 pr-10 py-2.5 font-sans text-sm",
              "appearance-none cursor-pointer focus:outline-none focus:border-gold",
              "transition-[border-color,box-shadow] duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
