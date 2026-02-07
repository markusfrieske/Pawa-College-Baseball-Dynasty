import { useMusic } from "@/lib/music-context";
import { Volume2, Volume1, VolumeX } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function VolumeControl() {
  const { volume, setVolume, muted, toggleMute } = useMusic();
  const [showSlider, setShowSlider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSlider(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div ref={containerRef} className="relative" data-testid="volume-control">
      <button
        onClick={toggleMute}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowSlider((v) => !v);
        }}
        onMouseEnter={() => setShowSlider(true)}
        className="flex items-center justify-center w-9 h-9 rounded-md text-[#c8aa6e] hover-elevate active-elevate-2 transition-colors"
        data-testid="button-mute-toggle"
        title={muted ? "Unmute" : "Mute (right-click for volume)"}
      >
        <VolumeIcon className="w-5 h-5" />
      </button>
      <div
        className={`absolute right-0 top-full mt-1 z-50 flex flex-col items-center gap-2 p-3 rounded-md border border-[#c8aa6e]/30 bg-[#1a2e1a] shadow-lg transition-all duration-200 ${
          showSlider ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onMouseLeave={() => setShowSlider(false)}
        data-testid="volume-slider-panel"
      >
        <span
          className="text-[10px] text-[#c8aa6e] whitespace-nowrap"
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
          VOL
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (muted && v > 0) toggleMute();
          }}
          onInput={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            setVolume(v);
            if (muted && v > 0) toggleMute();
          }}
          className="w-24 h-1.5 accent-[#c8aa6e] cursor-pointer"
          data-testid="input-volume-slider"
        />
        <span
          className="text-[9px] text-[#c8aa6e]/70 tabular-nums"
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
          {muted ? "MUTE" : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  );
}
