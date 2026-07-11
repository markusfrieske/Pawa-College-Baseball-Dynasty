import { useState } from "react";

const POS_COLORS: Record<string, string> = {
  SP: "#3b82f6", RP: "#8b5cf6", C: "#f59e0b",
  "1B": "#10b981", "2B": "#10b981", "3B": "#10b981",
  SS: "#10b981", LF: "#ef4444", CF: "#ef4444", RF: "#ef4444",
};

const MOCK_RECRUITS = [
  { id: "1", pos: "SP", stars: 4, tier: "blue-chip", name: "Marcus Webb" },
  { id: "2", pos: "SS", stars: 3, tier: "standard", name: "Danny Cruz" },
  { id: "3", pos: "CF", stars: 5, tier: "generational", name: "Elijah Stone" },
  { id: "4", pos: "1B", stars: 3, tier: "standard", name: "Trey Malone" },
  { id: "5", pos: "RP", stars: 4, tier: "impact", name: "Cole Nguyen" },
  { id: "6", pos: "C", stars: 3, tier: "standard", name: "Bryce Harper Jr." },
  { id: "7", pos: "3B", stars: 2, tier: "standard", name: "Ivan Reyes" },
  { id: "8", pos: "SP", stars: 4, tier: "program-changer", name: "Jordan Mills" },
];

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 justify-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < count ? "text-[#C4A35A]" : "text-white/10"} style={{ fontSize: 10 }}>★</span>
      ))}
    </div>
  );
}

function borderStyle(tier: string) {
  if (tier === "generational") return "2px solid #FFD700";
  if (tier === "program-changer") return "2px solid #C4A35A";
  if (tier === "blue-chip") return "2px solid #60a5fa";
  return "1px solid rgba(255,255,255,0.1)";
}
function glowStyle(tier: string) {
  if (tier === "generational") return "0 0 20px rgba(255,215,0,0.5), 0 0 40px rgba(255,215,0,0.15)";
  if (tier === "program-changer") return "0 0 16px rgba(196,163,90,0.4)";
  if (tier === "blue-chip") return "0 0 14px rgba(96,165,250,0.35)";
  return "none";
}

function SealedCard({ recruit }: { recruit: typeof MOCK_RECRUITS[0] }) {
  const [revealed, setRevealed] = useState(false);
  const posColor = POS_COLORS[recruit.pos] ?? "#6b7280";

  if (revealed) {
    return (
      <div
        className="relative rounded overflow-hidden cursor-default select-none"
        style={{
          width: 140, height: 200,
          border: borderStyle(recruit.tier),
          boxShadow: glowStyle(recruit.tier),
          background: "linear-gradient(160deg, #1a2f1a, #0f1f0f)",
          animation: "cardReveal 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <div className="h-1.5 w-full" style={{ background: posColor }} />
        <div className="flex flex-col items-center justify-between h-full p-3 pb-4">
          <div className="text-xs font-bold text-white/70 tracking-wider">{recruit.pos}</div>
          <div className="w-14 h-14 rounded-full bg-[#2a3f2a] border border-white/10 flex items-center justify-center text-2xl">
            ⚾
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-white text-xs text-center leading-tight" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7 }}>
              {recruit.name}
            </div>
            <StarRow count={recruit.stars} />
            {recruit.tier === "generational" && (
              <div className="text-[9px] tracking-widest text-yellow-400 uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>GEN TALENT ✦</div>
            )}
            {recruit.tier === "program-changer" && (
              <div className="text-[9px] tracking-widest text-[#C4A35A] uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>EXCEEDED</div>
            )}
            {recruit.tier === "blue-chip" && (
              <div className="text-[9px] tracking-widest text-blue-400 uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>BLUE CHIP</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded overflow-hidden cursor-pointer group select-none"
      style={{
        width: 140, height: 200,
        border: borderStyle(recruit.tier),
        boxShadow: glowStyle(recruit.tier),
        background: "linear-gradient(160deg, #1a2f1a, #0f1f0f)",
      }}
      onClick={() => setRevealed(true)}
    >
      <div className="h-1.5 w-full" style={{ background: posColor }} />

      {/* silhouette area */}
      <div className="flex flex-col items-center justify-between h-full p-3 pb-4">
        <div className="text-xs font-bold text-white/30 tracking-wider">{recruit.pos}</div>
        <div className="w-14 h-14 rounded-full bg-[#1a2a1a] border border-white/5 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white/10" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="text-white/10" style={{ fontSize: 10 }}>★</span>
            ))}
          </div>
          <div className="text-white/20 text-[8px] tracking-widest uppercase">NLI</div>
        </div>
      </div>

      {/* hover reveal overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ background: "rgba(196,163,90,0.12)" }}>
        <div className="text-[#C4A35A] text-[9px] tracking-widest uppercase font-bold"
          style={{ fontFamily: "'Press Start 2P', monospace" }}>
          REVEAL
        </div>
      </div>
    </div>
  );
}

export function SealedCards() {
  const [openAll, setOpenAll] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a1a0a] flex flex-col overflow-hidden">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="text-white/40 text-xs tracking-widest uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          ← Back
        </div>
        <div className="text-[#C4A35A] text-xs tracking-widest uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          2028 Signing Class · Oregon
        </div>
        <div className="flex gap-3">
          <button
            className="text-xs px-4 py-2 border border-[#C4A35A]/40 text-[#C4A35A] tracking-widest uppercase hover:bg-[#C4A35A]/10 transition-colors"
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7 }}
            onClick={() => setOpenAll(true)}
          >
            Open All
          </button>
          <button
            className="text-xs px-4 py-2 border border-white/10 text-white/40 tracking-widest uppercase hover:border-white/20 transition-colors"
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7 }}
          >
            Skip →
          </button>
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-wrap gap-5 justify-center max-w-2xl">
          {MOCK_RECRUITS.map((r) => (
            <SealedCard key={r.id} recruit={openAll ? { ...r } : r} />
          ))}
        </div>
      </div>

      <div className="text-center pb-4 text-white/20 text-[9px] tracking-widest"
        style={{ fontFamily: "'Press Start 2P', monospace" }}>
        Click each envelope to reveal · Gold border = elite tier
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes cardReveal {
          from { opacity: 0; transform: scale(0.85) rotateY(15deg); }
          to   { opacity: 1; transform: scale(1) rotateY(0deg); }
        }
      `}</style>
    </div>
  );
}
