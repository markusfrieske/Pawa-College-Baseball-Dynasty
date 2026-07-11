export function Lobby() {
  return (
    <div className="min-h-screen bg-[#0a1a0a] flex flex-col items-center justify-center relative overflow-hidden">
      {/* star field */}
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white opacity-30"
          style={{
            width: Math.random() > 0.8 ? 2 : 1,
            height: Math.random() > 0.8 ? 2 : 1,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }}
        />
      ))}

      {/* ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C4A35A]/5 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-8">
        {/* Team badge placeholder */}
        <div className="w-24 h-24 rounded-full bg-[#1a2f1a] border-2 border-[#C4A35A]/40 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(196,163,90,0.2)]">
          🌲
        </div>

        <div className="flex flex-col gap-2">
          <div
            className="text-[#C4A35A] text-xs tracking-[0.3em] uppercase"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
          >
            Season 3 · Signing Day
          </div>
          <h1
            className="text-white text-3xl leading-tight"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
          >
            Oregon Ducks
          </h1>
          <div className="text-[#C4A35A]/60 text-sm tracking-widest uppercase mt-1" style={{ fontFamily: "'Press Start 2P', monospace" }}>
            2028 Recruiting Class
          </div>
        </div>

        {/* commit count badge */}
        <div className="flex items-center gap-3 bg-[#1a2f1a] border border-[#C4A35A]/30 rounded px-5 py-3">
          <span className="text-[#C4A35A] text-2xl" style={{ fontFamily: "'Press Start 2P', monospace" }}>8</span>
          <span className="text-white/60 text-xs tracking-widest uppercase">Letters of Intent</span>
        </div>

        <p className="text-white/40 text-xs max-w-xs leading-relaxed">
          Open each letter to reveal your signees one by one, or skip straight to the full class.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <button
            className="px-8 py-4 text-xs tracking-widest uppercase text-[#0a1a0a] font-bold cursor-pointer"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              background: 'linear-gradient(135deg, #C4A35A, #e8c87a)',
              boxShadow: '0 0 20px rgba(196,163,90,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
              imageRendering: 'pixelated',
            }}
          >
            Open Letters →
          </button>
          <button
            className="px-8 py-4 text-xs tracking-widest uppercase text-white/50 border border-white/10 cursor-pointer hover:border-white/20 transition-colors"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
          >
            Skip to Results
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
