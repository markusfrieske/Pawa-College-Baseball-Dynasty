import speechBubbleIcon from "@assets/gold_speech_bubble.png";

export function DynastyLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src={speechBubbleIcon}
      alt="College Baseball Dynasty"
      className={`object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function DynastyLogoLarge({ className = "" }: { className?: string }) {
  return (
    <img
      src={speechBubbleIcon}
      alt="College Baseball Dynasty"
      className={`object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
