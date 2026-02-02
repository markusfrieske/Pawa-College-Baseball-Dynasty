import { cn } from "@/lib/utils";

interface AttributeSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  showValue?: boolean;
  colorScale?: boolean;
}

export function AttributeSlider({
  label,
  value,
  min = 1,
  max = 10,
  onChange,
  disabled = false,
  showValue = true,
  colorScale = true,
}: AttributeSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  const getColor = (pct: number) => {
    if (!colorScale) return "rgb(var(--gold))";
    if (pct < 30) return "#ef4444";
    if (pct < 50) return "#f97316";
    if (pct < 70) return "#eab308";
    if (pct < 85) return "#22c55e";
    return "#3b82f6";
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">{label}</span>
        {showValue && (
          <span className="font-bold text-foreground">{value}</span>
        )}
      </div>
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            backgroundColor: getColor(percentage),
          }}
        />
        {!disabled && onChange && (
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
      </div>
    </div>
  );
}
