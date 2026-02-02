import { cn } from "@/lib/utils";

interface LetterGradeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function getLetterGrade(value: number): { letter: string; tier: string } {
  if (value >= 90) return { letter: "S", tier: "s" };
  if (value >= 80) return { letter: "A", tier: "a" };
  if (value >= 70) return { letter: "B", tier: "b" };
  if (value >= 60) return { letter: "C", tier: "c" };
  if (value >= 50) return { letter: "D", tier: "d" };
  if (value >= 40) return { letter: "E", tier: "e" };
  if (value >= 30) return { letter: "F", tier: "f" };
  return { letter: "G", tier: "g" };
}

const tierColors: Record<string, string> = {
  s: "bg-pink-500 text-white",
  a: "bg-pink-400 text-white",
  b: "bg-orange-500 text-white",
  c: "bg-yellow-500 text-black",
  d: "bg-yellow-600 text-white",
  e: "bg-gray-500 text-white",
  f: "bg-gray-600 text-white",
  g: "bg-gray-700 text-white",
};

const sizeClasses: Record<string, string> = {
  sm: "w-5 h-5 text-[10px]",
  md: "w-6 h-6 text-xs",
  lg: "w-8 h-8 text-sm",
};

export function LetterGrade({ value, size = "md", className }: LetterGradeProps) {
  const { letter, tier } = getLetterGrade(value);
  
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded",
        tierColors[tier],
        sizeClasses[size],
        className
      )}
      title={`${value}/100`}
    >
      {letter}
    </span>
  );
}

interface AttributeWithGradeProps {
  label: string;
  value: number;
  showValue?: boolean;
}

export function AttributeWithGrade({ label, value, showValue = true }: AttributeWithGradeProps) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <LetterGrade value={value} size="sm" />
        {showValue && <span className="font-bold text-foreground w-6 text-right">{value}</span>}
      </div>
    </div>
  );
}
