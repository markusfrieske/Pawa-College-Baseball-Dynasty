type OverlayStrength = "none" | "light" | "medium" | "heavy";

type ArtworkBackgroundProps = {
  desktopSrc: string;
  mobileSrc?: string;
  alt?: string;
  focalPoint?: string;
  overlayStrength?: OverlayStrength;
  className?: string;
  imageClassName?: string;
  children?: React.ReactNode;
  priority?: boolean;
};

const overlayClasses: Record<OverlayStrength, string> = {
  none: "",
  light: "bg-gradient-to-t from-background/60 via-black/20 to-black/10",
  medium: "bg-gradient-to-t from-background/80 via-black/40 to-black/20",
  heavy: "bg-gradient-to-b from-black/60 via-black/50 to-background/90",
};

export function ArtworkBackground({
  desktopSrc,
  mobileSrc,
  alt,
  focalPoint = "center center",
  overlayStrength = "medium",
  className = "",
  imageClassName = "",
  children,
  priority = false,
}: ArtworkBackgroundProps) {
  const isDecorative = !alt;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {mobileSrc && mobileSrc !== desktopSrc ? (
        <>
          <img
            src={desktopSrc}
            alt={isDecorative ? "" : alt}
            aria-hidden={isDecorative}
            loading={priority ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover hidden sm:block pointer-events-none select-none ${imageClassName}`}
            style={{ objectPosition: focalPoint }}
          />
          <img
            src={mobileSrc}
            alt={isDecorative ? "" : alt}
            aria-hidden={isDecorative}
            loading={priority ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover sm:hidden pointer-events-none select-none ${imageClassName}`}
            style={{ objectPosition: focalPoint }}
          />
        </>
      ) : (
        <img
          src={desktopSrc}
          alt={isDecorative ? "" : alt}
          aria-hidden={isDecorative}
          loading={priority ? "eager" : "lazy"}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none select-none ${imageClassName}`}
          style={{ objectPosition: focalPoint }}
        />
      )}
      {overlayStrength !== "none" && (
        <div
          className={`absolute inset-0 pointer-events-none ${overlayClasses[overlayStrength]}`}
          aria-hidden="true"
        />
      )}
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
    </div>
  );
}
