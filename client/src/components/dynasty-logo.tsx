import ribbonIcon from "@assets/image_1770493395165.png";

export function DynastyLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src={ribbonIcon}
      alt="College Baseball Dynasty"
      className={`object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function DynastyLogoLarge({ className = "" }: { className?: string }) {
  return (
    <img
      src={ribbonIcon}
      alt="College Baseball Dynasty"
      className={`object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
