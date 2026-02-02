import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface RetroInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const RetroInput = forwardRef<HTMLInputElement, RetroInputProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block font-pixel text-[10px] uppercase text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full bg-input border-2 border-border text-foreground px-4 py-3 font-sans text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:border-gold",
            "transition-colors duration-150",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

RetroInput.displayName = "RetroInput";
