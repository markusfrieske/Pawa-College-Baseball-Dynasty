import { useState, useEffect } from "react";

const STORAGE_KEY = "serverResetBannerDismissed_may26";

export function ServerResetBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-3"
      style={{
        background: "linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)",
        borderBottom: "2px solid #f59e0b",
        boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
      }}
      data-testid="server-reset-banner"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span
          className="text-yellow-300 shrink-0"
          style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "10px" }}
        >
          ⚠ NOTICE
        </span>
        <p
          className="text-white text-xs leading-snug"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          <span
            className="text-yellow-300 font-bold"
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "9px" }}
          >
            SERVER RESET:
          </span>{" "}
          All leagues, rosters &amp; recruiting classes will be cleared{" "}
          <span className="text-yellow-200 font-semibold">Wednesday May 27 at 12 AM PT</span>{" "}
          in prep for launch. Save anything you want to keep before then.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 px-3 py-1.5 text-xs font-bold rounded border border-yellow-400 text-yellow-300 hover:bg-yellow-400 hover:text-red-900 transition-colors cursor-pointer"
        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "8px" }}
        data-testid="server-reset-banner-dismiss"
      >
        OK, GOT IT
      </button>
    </div>
  );
}
