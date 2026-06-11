import { cn } from "@/lib/utils";

interface LetterGradeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  isCommonAbility?: boolean;
}

export function getLetterGrade(value: number, isCommonAbility: boolean = false): { letter: string; tier: string } {
  if (value >= 90) return { letter: "S", tier: "s" };
  if (value >= 80) return { letter: "A", tier: "a" };
  if (value >= 70) return { letter: "B", tier: "b" };
  if (value >= 60) return { letter: "C", tier: "c" };
  if (value >= 50) return { letter: "D", tier: "d" };
  if (value >= 40) return { letter: "E", tier: "e" };
  if (value >= 20) return { letter: "F", tier: "f" };
  return { letter: "G", tier: "g" };
}

const tierColors: Record<string, string> = {
  s: "bg-fuchsia-500 text-white",
  a: "bg-pink-500 text-white",
  b: "bg-red-500 text-white",
  c: "bg-orange-500 text-white",
  d: "bg-yellow-500 text-black",
  e: "bg-green-400 text-black",
  f: "bg-blue-500 text-white",
  g: "bg-gray-400 text-white",
};

const commonAbilityColors: Record<string, string> = {
  s: "bg-amber-500 text-black",
  a: "bg-blue-600 text-white",
  b: "bg-blue-400 text-white",
  c: "bg-sky-400 text-white",
  d: "bg-sky-300 text-black",
  e: "bg-red-300 text-black",
  f: "bg-red-500 text-white",
  g: "bg-red-800 text-white",
};

const sizeClasses: Record<string, string> = {
  sm: "w-5 h-5 text-[10px]",
  md: "w-6 h-6 text-xs",
  lg: "w-8 h-8 text-sm",
};

export function LetterGrade({ value, size = "md", className, isCommonAbility = false }: LetterGradeProps) {
  const { letter, tier } = getLetterGrade(value, isCommonAbility);
  const colors = isCommonAbility ? commonAbilityColors : tierColors;
  
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded",
        colors[tier],
        sizeClasses[size],
        className
      )}
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
