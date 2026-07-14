import { useMusic } from "@/lib/music-context";
import { Volume2, Volume1, VolumeX, ChevronUp, ChevronDown, Bell, BellOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { isSfxEnabled, setSfxEnabled, playClick } from "@/lib/sfx";

export function VolumeControl() {
  const { volume, setVolume, muted, toggleMute } = useMusic();
  const [showSlider, setShowSlider] = useState(false);
  const [sfxOn, setSfxOn] = useState(isSfxEnabled);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSlider(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const SliderChevron = showSlider ? ChevronDown : ChevronUp;

  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxOn(next);
    setSfxEnabled(next);
    if (next) playClick();
  };

  return (
    <div ref={containerRef} className="relative" data-testid="volume-control">
      <div className="flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            toggleMute();
          }}
          className="flex items-center justify-center w-9 h-9 rounded-md text-[#c8aa6e] hover-elevate active-elevate-2 transition-colors"
          data-testid="button-mute-toggle"
          title={muted ? "Unmute" : "Mute"}
        >
          <VolumeIcon className="w-5 h-5 pointer-events-none" />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowSlider((v) => !v);
          }}
          className="flex items-center justify-center w-5 h-9 rounded-md text-[#c8aa6e]/60 hover-elevate active-elevate-2 transition-colors"
          data-testid="button-volume-expand"
          title="Volume slider"
        >
          <SliderChevron className="w-3.5 h-3.5 pointer-events-none" />
        </button>
      </div>
      <div
        className={`absolute right-0 top-full mt-1 z-50 flex flex-col items-center gap-2 p-3 rounded-md border border-[#c8aa6e]/30 bg-[#1a2e1a] shadow-lg transition-all duration-200 ${
          showSlider ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        data-testid="volume-slider-panel"
      >
        <span
          className="text-xs text-[#c8aa6e] whitespace-nowrap"
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
          className="w-24 h-1.5 accent-[#c8aa6e] cursor-pointer"
          data-testid="input-volume-slider"
        />
        <span
          className="text-xs text-[#c8aa6e]/70 tabular-nums"
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
          {muted ? "MUTE" : `${Math.round(volume * 100)}%`}
        </span>
        <div className="w-full border-t border-[#c8aa6e]/20 pt-2 mt-1">
          <button
            onClick={toggleSfx}
            className="flex items-center gap-2 w-full justify-center text-[#c8aa6e] hover-elevate active-elevate-2 rounded-md py-1"
            data-testid="button-sfx-toggle"
            title={sfxOn ? "Disable SFX" : "Enable SFX"}
          >
            {sfxOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span
              className="text-xs whitespace-nowrap"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              SFX {sfxOn ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
