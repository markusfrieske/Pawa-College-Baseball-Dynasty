import { useState, useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [visible, setVisible] = useState(!navigator.onLine);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsOffline(true);
      setVisible(true);
    };
    const handleOnline = () => {
      setIsOffline(false);
      timerRef.current = setTimeout(() => setVisible(false), 2500);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-300 ${
        isOffline
          ? "bg-destructive/90 text-destructive-foreground"
          : "bg-green-800/90 text-green-100"
      }`}
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
      data-testid="offline-banner"
      role="status"
      aria-live="polite"
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span>No connection — some features may be unavailable</span>
        </>
      ) : (
        <span>Back online</span>
      )}
    </div>
  );
}
