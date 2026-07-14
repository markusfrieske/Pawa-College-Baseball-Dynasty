import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { cn } from "@/lib/utils";

interface ActionButtonProps {
  label: string;
  description: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline" | "destructive";
  className?: string;
  dataTestId?: string;
  "data-testid"?: string;
}

export function ActionButton({
  label,
  description,
  icon,
  onClick,
  href,
  disabled,
  loading,
  variant = "outline",
  className,
  dataTestId,
  "data-testid": testId,
}: ActionButtonProps) {
  const resolvedTestId = testId ?? dataTestId;

  const inner = (
    <RetroButton
      variant={variant}
      onClick={href ? undefined : onClick}
      disabled={disabled}
      loading={loading}
      className={cn("flex flex-col items-start h-auto py-3 px-4 text-left gap-1 w-full", className)}
      data-testid={resolvedTestId}
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        {icon}
        {label}
      </div>
      <p className="text-xs text-muted-foreground font-normal whitespace-normal leading-tight">
        {description}
      </p>
    </RetroButton>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }

  return inner;
}
