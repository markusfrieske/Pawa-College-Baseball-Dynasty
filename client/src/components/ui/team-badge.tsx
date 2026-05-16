import { cn } from "@/lib/utils";
import { getMascotArchetype, type MascotArchetype } from "@/lib/mascot-archetypes";

interface TeamBadgeProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor?: string;
  size?: "sm" | "md" | "lg";
  /** School name (e.g. "Alabama") — used for aria-label. */
  name?: string;
  /** Mascot name (e.g. "Crimson Tide") — used to derive the pixel-art archetype. Takes precedence over name for lookup. */
  mascot?: string;
  className?: string;
}

export function TeamBadge({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = "md",
  name,
  mascot,
  className,
}: TeamBadgeProps) {
  const sizes = {
    sm: "w-8 h-8 text-[8px]",
    md: "w-12 h-12 text-xs",
    lg: "w-16 h-16 text-sm",
  };

  const archetype = mascot
    ? getMascotArchetype(mascot)
    : name
    ? getMascotArchetype(name)
    : null;

  if (archetype) {
    const acc = secondaryColor || "#ffffff";
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

    // ── FELINE (cat face) ────────────────────────────────────────────────────
    case "feline":
      return (
        <>
          {/* Pointed ears */}
          <polygon points="3,14 8,2 13,14" fill={acc} />
          <polygon points="19,14 24,2 29,14" fill={acc} />
          <polygon points="5,13 8,6 11,13" fill={det} />
          <polygon points="21,13 24,6 27,13" fill={det} />
          {/* Head — blocky octagon */}
          <polygon points="6,12 10,8 22,8 26,12 28,20 26,26 22,30 10,30 6,26 4,20" fill={acc} />
          {/* Left eye */}
          <rect x="9" y="16" width="5" height="5" fill={det} />
          <rect x="10" y="17" width="2" height="2" fill={acc} />
          {/* Right eye */}
          <rect x="18" y="16" width="5" height="5" fill={det} />
          <rect x="19" y="17" width="2" height="2" fill={acc} />
          {/* Nose */}
          <polygon points="14,22 16,25 18,22" fill={det} />
          {/* Mouth */}
          <rect x="15" y="25" width="2" height="3" fill={det} />
        </>
      );

    // ── CANINE (dog face) ────────────────────────────────────────────────────
    case "canine":
      return (
        <>
          {/* Left floppy ear */}
          <polygon points="0,12 6,10 8,26 0,28" fill={acc} />
          {/* Right floppy ear */}
          <polygon points="32,12 26,10 24,26 32,28" fill={acc} />
          {/* Head */}
          <polygon points="6,10 10,6 22,6 26,10 28,20 24,28 8,28 4,20" fill={acc} />
          {/* Left eye */}
          <rect x="9" y="13" width="5" height="5" fill={det} />
          <rect x="10" y="14" width="2" height="2" fill={acc} />
          {/* Right eye */}
          <rect x="18" y="13" width="5" height="5" fill={det} />
          <rect x="19" y="14" width="2" height="2" fill={acc} />
          {/* Muzzle */}
          <rect x="10" y="20" width="12" height="7" fill={det} />
          <rect x="11" y="21" width="4" height="3" fill={acc} />
          <rect x="17" y="21" width="4" height="3" fill={acc} />
          {/* Nose */}
          <rect x="13" y="20" width="6" height="3" fill={det} />
        </>
      );

    // ── RAPTOR (bird face) ───────────────────────────────────────────────────
    case "raptor":
      return (
        <>
          {/* Crest feathers */}
          <polygon points="10,8 12,0 14,8" fill={acc} />
          <polygon points="14,6 16,0 18,6" fill={acc} />
          <polygon points="18,8 20,0 22,8" fill={acc} />
          {/* Head */}
          <polygon points="6,10 10,6 22,6 26,10 28,20 24,28 8,28 4,20" fill={acc} />
          {/* Left eye ring + pupil */}
          <rect x="8" y="12" width="7" height="7" fill={det} />
          <rect x="9" y="13" width="4" height="4" fill={acc} />
          <rect x="10" y="14" width="2" height="2" fill={det} />
          {/* Right eye ring + pupil */}
          <rect x="17" y="12" width="7" height="7" fill={det} />
          <rect x="18" y="13" width="4" height="4" fill={acc} />
          <rect x="19" y="14" width="2" height="2" fill={det} />
          {/* Hooked beak */}
          <polygon points="12,20 20,20 19,26 16,28 13,26" fill={det} />
          <polygon points="13,20 19,20 18,24 16,26 14,24" fill={acc} />
        </>
      );

    // ── BEAR ─────────────────────────────────────────────────────────────────
    case "bear":
      return (
        <>
          {/* Left ear */}
          <rect x="3" y="4" width="8" height="8" fill={acc} />
          <rect x="5" y="6" width="4" height="4" fill={det} />
          {/* Right ear */}
          <rect x="21" y="4" width="8" height="8" fill={acc} />
          <rect x="23" y="6" width="4" height="4" fill={det} />
          {/* Head */}
          <polygon points="4,12 8,8 24,8 28,12 28,26 24,30 8,30 4,26" fill={acc} />
          {/* Left eye */}
          <rect x="9" y="14" width="5" height="5" fill={det} />
          <rect x="10" y="15" width="2" height="2" fill={acc} />
          {/* Right eye */}
          <rect x="18" y="14" width="5" height="5" fill={det} />
          <rect x="19" y="15" width="2" height="2" fill={acc} />
          {/* Snout */}
          <rect x="11" y="21" width="10" height="7" fill={det} />
          <rect x="12" y="22" width="3" height="3" fill={acc} />
          <rect x="17" y="22" width="3" height="3" fill={acc} />
          {/* Nose */}
          <rect x="13" y="21" width="6" height="3" fill={det} />
        </>
      );

    // ── WARRIOR (helmet) ─────────────────────────────────────────────────────
    case "warrior":
      return (
        <>
          {/* Helmet dome */}
          <polygon points="6,22 4,16 5,10 9,5 16,3 23,5 27,10 28,16 26,22" fill={acc} />
          {/* Left cheek guard */}
          <rect x="4" y="21" width="5" height="9" fill={acc} />
          {/* Right cheek guard */}
          <rect x="23" y="21" width="5" height="9" fill={acc} />
          {/* Neck guard */}
          <rect x="6" y="25" width="20" height="5" fill={acc} />
          {/* Visor slot */}
          <rect x="7" y="14" width="18" height="8" fill={det} />
          {/* Visor interior highlight */}
          <rect x="9" y="16" width="14" height="4" fill={acc} />
          {/* Nasal guard */}
          <rect x="15" y="13" width="2" height="10" fill={acc} />
          {/* Crest */}
          <rect x="15" y="0" width="2" height="5" fill={det} />
        </>
      );

    // ── REPTILE (gator / croc) ───────────────────────────────────────────────
    case "reptile":
      return (
        <>
          {/* Eye bumps (raised top of skull) */}
          <rect x="6" y="4" width="7" height="7" fill={acc} />
          <rect x="19" y="4" width="7" height="7" fill={acc} />
          {/* Eyes */}
          <rect x="8" y="5" width="4" height="4" fill={det} />
          <rect x="20" y="5" width="4" height="4" fill={det} />
          <rect x="9" y="6" width="2" height="2" fill={acc} />
          <rect x="21" y="6" width="2" height="2" fill={acc} />
          {/* Upper head / snout */}
          <rect x="2" y="9" width="28" height="12" fill={acc} />
          {/* Lower jaw */}
          <rect x="2" y="19" width="28" height="8" fill={acc} />
          {/* Teeth row */}
          <rect x="4" y="25" width="3" height="5" fill="#ffffff" />
          <rect x="9" y="25" width="3" height="5" fill="#ffffff" />
          <rect x="14" y="25" width="3" height="5" fill="#ffffff" />
          <rect x="19" y="25" width="3" height="5" fill="#ffffff" />
          <rect x="24" y="25" width="3" height="5" fill="#ffffff" />
          {/* Nostrils */}
          <rect x="12" y="14" width="3" height="3" fill={det} />
          <rect x="17" y="14" width="3" height="3" fill={det} />
        </>
      );

    // ── BOVINE (bull with horns) ─────────────────────────────────────────────
    case "bovine":
      return (
        <>
          {/* Left horn */}
          <polygon points="4,16 2,6 8,4 12,14" fill={acc} />
          {/* Right horn */}
          <polygon points="28,16 30,6 24,4 20,14" fill={acc} />
          {/* Head */}
          <polygon points="4,14 8,10 24,10 28,14 28,26 24,30 8,30 4,26" fill={acc} />
          {/* Left eye */}
          <rect x="9" y="15" width="5" height="5" fill={det} />
          <rect x="10" y="16" width="2" height="2" fill={acc} />
          {/* Right eye */}
          <rect x="18" y="15" width="5" height="5" fill={det} />
          <rect x="19" y="16" width="2" height="2" fill={acc} />
          {/* Nose plate */}
          <rect x="10" y="23" width="12" height="6" fill={det} />
          <rect x="11" y="24" width="4" height="3" fill={acc} />
          <rect x="17" y="24" width="4" height="3" fill={acc} />
          {/* Nose ring */}
          <rect x="14" y="27" width="4" height="2" fill={det} />
        </>
      );

    // ── INSECT (bee / wasp / hornet) ─────────────────────────────────────────
    case "insect":
      return (
        <>
          {/* Left wing */}
          <polygon points="2,10 0,18 10,18 12,10" fill={acc} />
          {/* Right wing */}
          <polygon points="30,10 32,18 22,18 20,10" fill={acc} />
          {/* Head */}
          <polygon points="11,2 21,2 23,6 23,12 21,14 11,14 9,12 9,6" fill={acc} />
          {/* Left antenna */}
          <rect x="12" y="0" width="2" height="4" fill={acc} />
          <rect x="10" y="0" width="4" height="2" fill={det} />
          {/* Right antenna */}
          <rect x="18" y="0" width="2" height="4" fill={acc} />
          <rect x="18" y="0" width="4" height="2" fill={det} />
          {/* Eyes */}
          <rect x="11" y="5" width="3" height="3" fill={det} />
          <rect x="18" y="5" width="3" height="3" fill={det} />
          {/* Body */}
          <rect x="11" y="14" width="10" height="16" fill={acc} />
          {/* Stripes */}
          <rect x="11" y="17" width="10" height="3" fill={det} />
          <rect x="11" y="23" width="10" height="3" fill={det} />
        </>
      );

    // ── NAUTICAL (anchor) ────────────────────────────────────────────────────
    case "nautical":
      return (
        <>
          {/* Anchor ring (square approximation) */}
          <rect x="12" y="2" width="8" height="2" fill={acc} />
          <rect x="10" y="4" width="2" height="6" fill={acc} />
          <rect x="20" y="4" width="2" height="6" fill={acc} />
          <rect x="12" y="8" width="8" height="2" fill={acc} />
          {/* Center dot */}
          <rect x="14" y="3" width="4" height="4" fill={det} />
          {/* Shaft */}
          <rect x="15" y="6" width="2" height="20" fill={acc} />
          {/* Crossbar */}
          <rect x="7" y="13" width="18" height="3" fill={acc} />
          {/* Left fluke */}
          <polygon points="15,26 3,30 5,26 11,24" fill={acc} />
          {/* Right fluke */}
          <polygon points="17,26 29,30 27,26 21,24" fill={acc} />
        </>
      );

    // ── ABSTRACT (lightning bolt) ─────────────────────────────────────────────
    case "abstract":
    default:
      return (
        <>
          {/* Lightning bolt — polygon only, no curves */}
          <polygon
            points="21,1 8,18 17,18 11,31 24,14 15,14"
            fill={acc}
          />
          {/* Outline layer for contrast */}
          <polygon
            points="21,1 8,18 17,18 11,31 24,14 15,14"
            fill="none"
            stroke={det}
            strokeWidth="2"
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
