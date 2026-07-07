import { useEffect, useRef, useState } from "react";

interface FlipRevealProps {
  /** When true, triggers the flip to show the back face. */
  revealed: boolean;
  /** Content shown face-down / before reveal. */
  front: React.ReactNode;
  /** Content shown after the flip completes. */
  back: React.ReactNode;
  className?: string;
  /** Flip duration in ms. Defaults to 450. */
  duration?: number;
  /** Called when the flip animation finishes showing the back face. */
  onRevealComplete?: () => void;
}

/**
 * FlipReveal — a reusable 3-D Y-axis card flip component.
 *
 * Usage:
 *   <FlipReveal revealed={scouted} front={<CardBack />} back={<CardFront />} />
 *
 * Haptic category: "success" — pair with playScoutSfx() or playSuccess() at
 * the moment revealed flips to true for a consistent tap-to-reveal feel.
 *
 * Respects prefers-reduced-motion: when motion is reduced the flip is
 * instantaneous (opacity crossfade only, no 3-D transform).
 */
export function FlipReveal({
  revealed,
  front,
  back,
  className = "",
  duration = 450,
  onRevealComplete,
}: FlipRevealProps) {
  const [showBack, setShowBack] = useState(false);
  const cbRef = useRef(onRevealComplete);
  cbRef.current = onRevealComplete;

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!revealed) {
      setShowBack(false);
      return;
    }
    if (reducedMotion) {
      setShowBack(true);
      cbRef.current?.();
      return;
    }
    const half = duration / 2;
    const t = setTimeout(() => {
      setShowBack(true);
      cbRef.current?.();
    }, half);
    return () => clearTimeout(t);
  }, [revealed, duration, reducedMotion]);

  if (reducedMotion) {
    return (
      <div
        className={className}
        style={{ transition: `opacity ${duration}ms ease` }}
        data-testid="flip-reveal"
      >
        <div style={{ opacity: revealed ? 0 : 1, position: revealed ? "absolute" : "relative", pointerEvents: revealed ? "none" : "auto" }}>
          {front}
        </div>
        <div style={{ opacity: revealed ? 1 : 0, position: revealed ? "relative" : "absolute", pointerEvents: revealed ? "auto" : "none" }}>
          {back}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ perspective: "800px" }}
      data-testid="flip-reveal"
    >
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transition: revealed ? `transform ${duration}ms ease` : "none",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          {front}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
