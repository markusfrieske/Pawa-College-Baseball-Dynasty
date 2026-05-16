import { cn } from "@/lib/utils";
import { getMascotArchetype, type MascotArchetype } from "@/lib/mascot-archetypes";

interface TeamBadgeProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor?: string;
  size?: "sm" | "md" | "lg";
  /** Full team name (e.g. "Alabama Crimson Tide") used to derive the mascot archetype. */
  name?: string;
  className?: string;
}

export function TeamBadge({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = "md",
  name,
  className,
}: TeamBadgeProps) {
  const sizes = {
    sm: "w-8 h-8 text-[8px]",
    md: "w-12 h-12 text-xs",
    lg: "w-16 h-16 text-sm",
  };

  const archetype = name ? getMascotArchetype(name) : null;

  if (archetype) {
    // Accent color: secondary if available, otherwise white
    const acc = secondaryColor || "#ffffff";
    // Detail color: rendered on top of acc fill — use primary for visibility
    const det = primaryColor;

    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center border-2 overflow-hidden shrink-0",
          sizes[size],
          className,
        )}
        style={{
          backgroundColor: primaryColor,
          borderColor: secondaryColor || primaryColor,
        }}
        aria-label={name ?? abbreviation}
        data-testid="team-badge-avatar"
      >
        <svg
          viewBox="0 0 32 32"
          width="80%"
          height="80%"
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="crispEdges"
          aria-hidden
        >
          {renderArchetype(archetype, acc, det)}
        </svg>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-pixel font-bold border-2 shrink-0",
        sizes[size],
        className,
      )}
      style={{
        backgroundColor: primaryColor,
        borderColor: secondaryColor || primaryColor,
        color: isLightColor(primaryColor) ? "#1a2b1a" : "#ffffff",
      }}
      data-testid="team-badge-letter"
    >
      {abbreviation}
    </div>
  );
}

function renderArchetype(archetype: MascotArchetype, acc: string, det: string) {
  switch (archetype) {
    case "feline":
      return (
        <>
          {/* Pointed ears */}
          <polygon points="3,14 8,2 13,14" fill={acc} />
          <polygon points="19,14 24,2 29,14" fill={acc} />
          <polygon points="5,13 8,5 11,13" fill={det} />
          <polygon points="21,13 24,5 27,13" fill={det} />
          {/* Head */}
          <ellipse cx="16" cy="21" rx="13" ry="11" fill={acc} />
          {/* Eyes */}
          <ellipse cx="11" cy="18" rx="3" ry="3.5" fill={det} />
          <ellipse cx="21" cy="18" rx="3" ry="3.5" fill={det} />
          <ellipse cx="11" cy="18.5" rx="1.5" ry="2" fill={acc} />
          <ellipse cx="21" cy="18.5" rx="1.5" ry="2" fill={acc} />
          {/* Nose */}
          <polygon points="14,23 16,26 18,23" fill={det} />
        </>
      );

    case "canine":
      return (
        <>
          {/* Floppy ears */}
          <ellipse cx="5" cy="21" rx="5" ry="8" fill={acc} />
          <ellipse cx="27" cy="21" rx="5" ry="8" fill={acc} />
          {/* Head */}
          <ellipse cx="16" cy="18" rx="12" ry="11" fill={acc} />
          {/* Eyes */}
          <circle cx="11" cy="15" r="2.5" fill={det} />
          <circle cx="21" cy="15" r="2.5" fill={det} />
          <circle cx="11.5" cy="14.5" r="1" fill={acc} />
          <circle cx="21.5" cy="14.5" r="1" fill={acc} />
          {/* Muzzle */}
          <ellipse cx="16" cy="23" rx="6" ry="4" fill={det} />
          <circle cx="14" cy="22" r="1.5" fill={acc} />
          <circle cx="18" cy="22" r="1.5" fill={acc} />
        </>
      );

    case "raptor":
      return (
        <>
          {/* Head feather crest */}
          <polygon points="8,6 12,1 16,6 20,1 24,6" fill={acc} />
          {/* Head */}
          <ellipse cx="16" cy="16" rx="12" ry="11" fill={acc} />
          {/* Eyes */}
          <circle cx="10" cy="13" r="3.5" fill={det} />
          <circle cx="22" cy="13" r="3.5" fill={det} />
          <circle cx="10" cy="13" r="1.8" fill={acc} />
          <circle cx="22" cy="13" r="1.8" fill={acc} />
          <circle cx="10.5" cy="12.5" r="0.7" fill={det} />
          <circle cx="22.5" cy="12.5" r="0.7" fill={det} />
          {/* Hooked beak */}
          <polygon points="12,20 16,17 20,20 16,26" fill={det} />
          <polygon points="12,20 20,20 16,23" fill={acc} />
        </>
      );

    case "bear":
      return (
        <>
          {/* Ears */}
          <circle cx="8" cy="9" r="5.5" fill={acc} />
          <circle cx="24" cy="9" r="5.5" fill={acc} />
          <circle cx="8" cy="9" r="3" fill={det} />
          <circle cx="24" cy="9" r="3" fill={det} />
          {/* Head */}
          <ellipse cx="16" cy="20" rx="13" ry="11" fill={acc} />
          {/* Eyes */}
          <circle cx="11" cy="17" r="2.5" fill={det} />
          <circle cx="21" cy="17" r="2.5" fill={det} />
          <circle cx="11.5" cy="16.5" r="1" fill={acc} />
          <circle cx="21.5" cy="16.5" r="1" fill={acc} />
          {/* Snout */}
          <ellipse cx="16" cy="24" rx="5.5" ry="4" fill={det} />
          <ellipse cx="15" cy="23" rx="1.5" ry="1" fill={acc} />
          <ellipse cx="17" cy="23" rx="1.5" ry="1" fill={acc} />
        </>
      );

    case "warrior":
      return (
        <>
          {/* Helmet dome */}
          <path d="M4 20 Q4 3 16 2 Q28 3 28 20Z" fill={acc} />
          {/* Cheek guards */}
          <rect x="4" y="19" width="4" height="9" rx="2" fill={acc} />
          <rect x="24" y="19" width="4" height="9" rx="2" fill={acc} />
          {/* Neck guard */}
          <rect x="6" y="22" width="20" height="5" rx="2" fill={acc} />
          {/* Visor slot */}
          <rect x="7" y="14" width="18" height="7" rx="1" fill={det} />
          {/* Visor interior */}
          <rect x="9" y="16" width="14" height="3" rx="1" fill={acc} />
          {/* Crest line */}
          <rect x="15" y="2" width="2" height="6" rx="1" fill={det} />
          {/* Nasal */}
          <rect x="15" y="14" width="2" height="7" rx="0.5" fill={acc} />
        </>
      );

    case "reptile":
      return (
        <>
          {/* Eye bumps */}
          <circle cx="9" cy="10" r="5" fill={acc} />
          <circle cx="23" cy="10" r="5" fill={acc} />
          <circle cx="9" cy="10" r="2.5" fill={det} />
          <circle cx="23" cy="10" r="2.5" fill={det} />
          <circle cx="9" cy="10" r="1" fill={acc} />
          <circle cx="23" cy="10" r="1" fill={acc} />
          {/* Head / snout */}
          <ellipse cx="16" cy="20" rx="14" ry="9" fill={acc} />
          {/* Nostrils */}
          <circle cx="13" cy="17" r="1.5" fill={det} />
          <circle cx="19" cy="17" r="1.5" fill={det} />
          {/* Teeth row */}
          <rect x="7" y="22" width="3" height="4" rx="0.5" fill="#ffffff" />
          <rect x="12" y="22" width="3" height="4" rx="0.5" fill="#ffffff" />
          <rect x="17" y="22" width="3" height="4" rx="0.5" fill="#ffffff" />
          <rect x="22" y="22" width="3" height="4" rx="0.5" fill="#ffffff" />
        </>
      );

    case "bovine":
      return (
        <>
          {/* Horns */}
          <path d="M6 14 Q1 6 5 3 Q9 3 11 12" fill={acc} />
          <path d="M26 14 Q31 6 27 3 Q23 3 21 12" fill={acc} />
          {/* Head */}
          <ellipse cx="16" cy="21" rx="12" ry="10" fill={acc} />
          {/* Eyes */}
          <circle cx="11" cy="18" r="2.5" fill={det} />
          <circle cx="21" cy="18" r="2.5" fill={det} />
          <circle cx="11.5" cy="17.5" r="1" fill={acc} />
          <circle cx="21.5" cy="17.5" r="1" fill={acc} />
          {/* Nose ring area */}
          <ellipse cx="16" cy="26" rx="5.5" ry="4" fill={det} />
          <ellipse cx="16" cy="25.5" rx="3" ry="2.5" fill={acc} />
          {/* Nose ring */}
          <circle cx="16" cy="26" r="2" fill="none" stroke={det} strokeWidth="1.5" />
        </>
      );

    case "insect":
      return (
        <>
          {/* Wings */}
          <ellipse cx="8" cy="14" rx="8" ry="5" fill={acc} opacity="0.85" />
          <ellipse cx="24" cy="14" rx="8" ry="5" fill={acc} opacity="0.85" />
          {/* Head */}
          <circle cx="16" cy="9" r="5.5" fill={acc} />
          {/* Antennae */}
          <line x1="13" y1="5" x2="9" y2="1" stroke={acc} strokeWidth="1.8" />
          <line x1="19" y1="5" x2="23" y2="1" stroke={acc} strokeWidth="1.8" />
          <circle cx="9" cy="1" r="2" fill={det} />
          <circle cx="23" cy="1" r="2" fill={det} />
          {/* Eyes */}
          <circle cx="13" cy="9" r="2" fill={det} />
          <circle cx="19" cy="9" r="2" fill={det} />
          {/* Body */}
          <ellipse cx="16" cy="22" rx="6.5" ry="8.5" fill={acc} />
          {/* Stripes */}
          <path d="M10 19 Q16 17 22 19" stroke={det} strokeWidth="2.5" fill="none" />
          <path d="M10 23 Q16 21 22 23" stroke={det} strokeWidth="2.5" fill="none" />
          <path d="M11 27 Q16 25 21 27" stroke={det} strokeWidth="2" fill="none" />
        </>
      );

    case "nautical":
      return (
        <>
          {/* Anchor ring */}
          <circle cx="16" cy="8" r="6" fill="none" stroke={acc} strokeWidth="3" />
          <circle cx="16" cy="8" r="2.5" fill={det} />
          {/* Shaft */}
          <rect x="14.5" y="6" width="3" height="20" rx="1.5" fill={acc} />
          {/* Crossbar */}
          <rect x="7" y="13" width="18" height="3" rx="1.5" fill={acc} />
          {/* Flukes */}
          <path d="M14.5 26 Q6 31 4 28 Q4 24 9 24 L14.5 26Z" fill={acc} />
          <path d="M17.5 26 Q26 31 28 28 Q28 24 23 24 L17.5 26Z" fill={acc} />
          {/* Wave decoration */}
          <path d="M4 31 Q8 28 12 31 Q16 34 20 31 Q24 28 28 31" fill="none" stroke={det} strokeWidth="2" />
        </>
      );

    case "abstract":
    default:
      return (
        <>
          {/* Lightning bolt */}
          <polygon
            points="22,1 9,18 17,18 10,31 23,14 15,14"
            fill={acc}
          />
          <polygon
            points="22,1 9,18 17,18 10,31 23,14 15,14"
            fill="none"
            stroke={det}
            strokeWidth="1.5"
          />
        </>
      );
  }
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}
