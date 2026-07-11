import { useState, useEffect } from "react";

export function HeroSpotlight() {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const duration = 6000;
    const id = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setProgress(pct);
      if (pct === 0) { clearInterval(id); setVisible(false); }
    }, 50);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div className="min-h-screen bg-[#0a1a0a] relative overflow-hidden flex items-center justify-center">
      {/* underlying sealed grid (blurred context) */}
      <div className="absolute inset-0 flex flex-wrap gap-4 p-12 opacity-20 blur-sm pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-28 h-40 rounded border border-white/10 bg-[#1a2f1a]" />
        ))}
      </div>

      {/* dark overlay */}
      <div className="absolute inset-0 bg-[#0a1a0a]/85" />

      {/* spotlight */}
      {visible && (
        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* ambient glow ring */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[420px] h-[420px] rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255,215,0,0.18) 0%, transparent 70%)",
                animation: "pulse 2s ease-in-out infinite",
              }} />
          </div>

          {/* tier label */}
          <div className="text-yellow-400 text-xs tracking-[0.35em] uppercase"
            style={{ fontFamily: "'Press Start 2P', monospace", textShadow: "0 0 12px rgba(255,215,0,0.7)" }}>
            ✦ Generational Talent ✦
          </div>

          {/* portrait card */}
          <div className="relative rounded overflow-hidden"
            style={{
              width: 180, height: 240,
              border: "2px solid #FFD700",
              boxShadow: "0 0 40px rgba(255,215,0,0.5), 0 0 80px rgba(255,215,0,0.15)",
              background: "linear-gradient(160deg, #2a3f1a, #1a2f0f)",
              animation: "heroEntrance 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
            }}>
            <div className="h-2 w-full" style={{ background: "#3b82f6" }} />
            <div className="flex flex-col items-center justify-between h-full p-4 pb-5">
              <div className="text-white/50 text-xs tracking-widest">SP</div>
              <div className="w-20 h-20 rounded-full bg-[#1a2a0a] border-2 border-yellow-400/30 flex items-center justify-center text-4xl shadow-inner">
                ⚾
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-white text-center leading-tight" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}>
                  Elijah Stone
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="text-[#FFD700]" style={{ fontSize: 11 }}>★</span>
                  ))}
                </div>
                <div className="text-yellow-400 text-[8px] tracking-widest uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>
                  GEN TALENT ✦
                </div>
              </div>
            </div>
          </div>

          {/* stat row */}
          <div className="flex gap-6">
            {[
              { label: "OVR", value: "634" },
              { label: "POT", value: "S" },
              { label: "VEL", value: "98" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1 bg-[#1a2f1a] border border-yellow-400/20 px-4 py-2 rounded">
                <div className="text-white/40 text-[8px] tracking-widest" style={{ fontFamily: "'Press Start 2P', monospace" }}>{label}</div>
                <div className="text-yellow-400 text-lg font-bold" style={{ fontFamily: "'Press Start 2P', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* top ability badge */}
          <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 px-4 py-2 rounded">
            <span className="text-yellow-400 text-xs">★</span>
            <span className="text-yellow-300 text-[9px] tracking-widest uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>
              Power Pitcher
            </span>
          </div>

          {/* auto-dismiss bar */}
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400/60 transition-none rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            className="text-white/30 text-[8px] tracking-widest hover:text-white/60 transition-colors cursor-pointer"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
            onClick={() => setVisible(false)}
          >
            CONTINUE →
          </button>
        </div>
      )}

      {!visible && (
        <div className="relative z-10 text-center flex flex-col items-center gap-4">
          <div className="text-white/40 text-xs" style={{ fontFamily: "'Press Start 2P', monospace" }}>
            Spotlight dismissed
          </div>
          <button
            className="text-[#C4A35A] text-[9px] tracking-widest hover:text-[#e8c87a] cursor-pointer"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
            onClick={() => { setVisible(true); setProgress(100); }}
          >
            ↺ Replay
          </button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes heroEntrance {
          from { opacity: 0; transform: scale(0.7) translateY(30px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
