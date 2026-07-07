const STORAGE_KEY_SFX_ENABLED = "cbd_sfx_enabled";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSfxEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_SFX_ENABLED);
    return v !== "false";
  } catch {
    return true;
  }
}

export function setSfxEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_SFX_ENABLED, String(enabled));
  } catch {}
}

function getSfxVolume(): number {
  try {
    const v = localStorage.getItem("cbd_music_volume");
    if (v !== null) return Math.max(0, Math.min(1, parseFloat(v)));
  } catch {}
  return 0.5;
}

function isMuted(): boolean {
  try {
    return localStorage.getItem("cbd_music_muted") === "true";
  } catch {}
  return false;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "square",
  volumeMult: number = 0.3,
  startTime: number = 0
): void {
  const ctx = getCtx();
  if (!ctx || !isSfxEnabled() || isMuted()) return;

  const vol = getSfxVolume() * volumeMult;
  if (vol <= 0) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration);
}

export function playChime(): void {
  playTone(880, 0.12, "square", 0.2, 0);
  playTone(1174.66, 0.12, "square", 0.2, 0.08);
  playTone(1318.51, 0.18, "square", 0.25, 0.16);
}

export function playClick(): void {
  playTone(660, 0.06, "square", 0.12, 0);
}

export function playSuccess(): void {
  playTone(523.25, 0.1, "square", 0.2, 0);
  playTone(659.25, 0.1, "square", 0.2, 0.08);
  playTone(783.99, 0.1, "square", 0.2, 0.16);
  playTone(1046.50, 0.2, "square", 0.25, 0.24);
}

export function playLevelUp(): void {
  playTone(523.25, 0.08, "square", 0.2, 0);
  playTone(587.33, 0.08, "square", 0.2, 0.07);
  playTone(659.25, 0.08, "square", 0.2, 0.14);
  playTone(783.99, 0.08, "square", 0.2, 0.21);
  playTone(880, 0.08, "square", 0.2, 0.28);
  playTone(1046.50, 0.25, "triangle", 0.3, 0.35);
}

export function playError(): void {
  playTone(220, 0.15, "sawtooth", 0.15, 0);
  playTone(185, 0.2, "sawtooth", 0.15, 0.12);
}

export function playAdvanceComplete(): void {
  playTone(440, 0.08, "square", 0.18, 0);
  playTone(554.37, 0.08, "square", 0.18, 0.06);
  playTone(659.25, 0.12, "square", 0.22, 0.12);
}

/** Light tap — scout reveal, target, minor interactions. Maps to haptic: light. */
export function playScoutSfx(): void {
  playTone(660, 0.05, "square", 0.12, 0);
  playTone(990, 0.1, "square", 0.15, 0.04);
}

/** Soft ascending 3-note — email sent. Maps to haptic: light. */
export function playEmailSfx(): void {
  playTone(523.25, 0.08, "square", 0.14, 0);
  playTone(659.25, 0.08, "square", 0.14, 0.07);
  playTone(783.99, 0.13, "square", 0.16, 0.14);
}

/** Double-ring beep — phone call made. Maps to haptic: medium. */
export function playPhoneSfx(): void {
  playTone(880, 0.06, "square", 0.14, 0);
  playTone(880, 0.06, "square", 0.11, 0.11);
  playTone(1108.73, 0.13, "square", 0.17, 0.2);
}

/** Warm ascending — campus/coach visit completed. Maps to haptic: success. */
export function playVisitSfx(): void {
  playTone(440, 0.08, "triangle", 0.17, 0);
  playTone(554.37, 0.08, "triangle", 0.17, 0.07);
  playTone(659.25, 0.08, "triangle", 0.17, 0.14);
  playTone(880, 0.2, "triangle", 0.22, 0.21);
}

/** Fanfare — scholarship offered. Maps to haptic: success (heavy). */
export function playOfferSfx(): void {
  playTone(392, 0.07, "square", 0.17, 0);
  playTone(523.25, 0.07, "square", 0.17, 0.06);
  playTone(659.25, 0.07, "square", 0.17, 0.12);
  playTone(783.99, 0.07, "square", 0.19, 0.18);
  playTone(1046.50, 0.25, "triangle", 0.26, 0.24);
}

/** Confirmation chime — ready-up marked. Maps to haptic: success. */
export function playReadyUpSfx(): void {
  playTone(523.25, 0.08, "square", 0.19, 0);
  playTone(659.25, 0.08, "square", 0.19, 0.07);
  playTone(783.99, 0.08, "square", 0.19, 0.14);
  playTone(1046.50, 0.22, "square", 0.26, 0.21);
}

/** Satisfying completion — score reported. Maps to haptic: medium. */
export function playScoreSubmitSfx(): void {
  playTone(440, 0.08, "triangle", 0.17, 0);
  playTone(554.37, 0.11, "triangle", 0.19, 0.07);
  playTone(659.25, 0.18, "triangle", 0.23, 0.15);
}
