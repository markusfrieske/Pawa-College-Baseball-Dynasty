type ArtPanelProps = {
  src: string;
  alt?: string;
  title?: React.ReactNode;
  children?: React.ReactNode;
  overlayStrength?: "light" | "medium" | "heavy";
  className?: string;
  focalPoint?: string;
};

const overlayMap = {
  light: "bg-gradient-to-t from-black/50 via-black/20 to-transparent",
  medium: "bg-gradient-to-t from-black/75 via-black/35 to-black/10",
  heavy: "bg-gradient-to-t from-black/90 via-black/55 to-black/20",
};

export function ArtPanel({
  src,
  alt,
  title,
  children,
  overlayStrength = "medium",
  className = "",
  focalPoint = "center center",
}: ArtPanelProps) {
  const isDecorative = !alt;
  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <img
        src={src}
        alt={isDecorative ? "" : alt}
        aria-hidden={isDecorative}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ objectPosition: focalPoint }}
      />
      <div
        className={`absolute inset-0 pointer-events-none ${overlayMap[overlayStrength]}`}
        aria-hidden="true"
      />
      <div className="relative z-10">
        {title && (
          <div className="px-4 pt-4 pb-1">{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}
