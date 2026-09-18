import { cn } from "@/lib/utils";
import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface RetroInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const RetroInput = forwardRef<HTMLInputElement, RetroInputProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id || generatedId;
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={fieldId} className="block text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            "w-full min-h-11 rounded-md bg-background border border-input text-foreground px-4 py-2.5 font-sans text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:border-gold",
            "transition-[border-color,box-shadow] duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

RetroInput.displayName = "RetroInput";
