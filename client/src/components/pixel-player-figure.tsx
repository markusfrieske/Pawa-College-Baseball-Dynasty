interface PlayerFigureProps {
  primaryColor: string;
  secondaryColor: string;
  skinTone?: string;
  size?: number;
}

const SKIN_TONES: Record<string, string> = {
  light: "#fcd5b5",
  medium: "#d4a574",
  tan: "#c69c6d",
  olive: "#b8976a",
  dark: "#8d5524",
  deep: "#4a2c17",
};

function getSkin(tone: string) {
  return SKIN_TONES[tone] ?? SKIN_TONES.medium;
}

export function BatterFigure({ primaryColor, secondaryColor, skinTone = "medium", size = 120 }: PlayerFigureProps) {
  const skin = getSkin(skinTone);
  const cap = secondaryColor;
  const jersey = primaryColor;
  const pants = primaryColor;
  const belt = secondaryColor;
  const shoes = secondaryColor;
  const bat = "#c8a96e";

  const scale = size / 120;
  const w = 120;
  const h = 160;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      {/* ── Cap ── */}
      <rect x="44" y="4" width="34" height="6" fill={cap} />
      <rect x="40" y="10" width="42" height="4" fill={cap} />
      <rect x="38" y="8" width="6" height="8" fill={cap} />

      {/* ── Head ── */}
      <rect x="42" y="14" width="36" height="28" fill={skin} />
      {/* Face details */}
      <rect x="48" y="22" width="6" height="5" fill="#1a1a1a" />
      <rect x="66" y="22" width="6" height="5" fill="#1a1a1a" />
      <rect x="53" y="35" width="14" height="3" fill="#d08070" />

      {/* ── Neck ── */}
      <rect x="54" y="42" width="12" height="6" fill={skin} />

      {/* ── Jersey / Torso ── */}
      <rect x="38" y="48" width="44" height="40" fill={jersey} />
      {/* Jersey stripe */}
      <rect x="57" y="48" width="6" height="40" fill={secondaryColor} opacity="0.4" />

      {/* ── Arms ── */}
      {/* Left arm (front arm, extended) */}
      <rect x="20" y="50" width="18" height="10" fill={jersey} />
      <rect x="14" y="56" width="12" height="10" fill={skin} />

      {/* Right arm (back arm, slightly lower) */}
      <rect x="82" y="54" width="18" height="10" fill={jersey} />
      <rect x="96" y="58" width="12" height="10" fill={skin} />

      {/* ── Bat ── */}
      <rect x="4" y="52" width="6" height="52" fill={bat} />
      <rect x="2" y="50" width="10" height="6" fill={bat} />

      {/* ── Pants ── */}
      <rect x="38" y="88" width="20" height="36" fill={pants} />
      <rect x="62" y="88" width="20" height="36" fill={pants} />
      {/* Gap between legs */}
      <rect x="58" y="96" width="4" height="28" fill="#0a1a0a" />

      {/* ── Belt ── */}
      <rect x="38" y="86" width="44" height="5" fill={belt} />

      {/* ── Socks / Shoes ── */}
      <rect x="38" y="124" width="20" height="10" fill="#ffffff" />
      <rect x="62" y="124" width="20" height="10" fill="#ffffff" />
      <rect x="36" y="134" width="24" height="8" fill={shoes} />
      <rect x="60" y="134" width="24" height="8" fill={shoes} />

      {/* ── Helmet stripe ── */}
      <rect x="60" y="4" width="4" height="14" fill={primaryColor} opacity="0.6" />
    </svg>
  );
}

export function PitcherFigure({ primaryColor, secondaryColor, skinTone = "medium", size = 120 }: PlayerFigureProps) {
  const skin = getSkin(skinTone);
  const cap = secondaryColor;
  const jersey = primaryColor;
  const pants = primaryColor;
  const belt = secondaryColor;
  const shoes = secondaryColor;
  const ball = "#f5f5f5";

  const scale = size / 120;
  const w = 120;
  const h = 160;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      {/* ── Cap (tilted forward) ── */}
      <rect x="42" y="6" width="36" height="5" fill={cap} />
      <rect x="38" y="11" width="40" height="5" fill={cap} />
      <rect x="36" y="9" width="8" height="8" fill={cap} />

      {/* ── Head ── */}
      <rect x="40" y="16" width="36" height="28" fill={skin} />
      <rect x="46" y="23" width="6" height="5" fill="#1a1a1a" />
      <rect x="64" y="23" width="6" height="5" fill="#1a1a1a" />
      <rect x="51" y="36" width="14" height="3" fill="#d08070" />

      {/* ── Neck ── */}
      <rect x="52" y="44" width="12" height="6" fill={skin} />

      {/* ── Jersey / Torso ── */}
      <rect x="36" y="50" width="44" height="40" fill={jersey} />
      <rect x="55" y="50" width="6" height="40" fill={secondaryColor} opacity="0.4" />

      {/* ── Pitching arm (raised) ── */}
      <rect x="80" y="36" width="12" height="18" fill={jersey} />
      <rect x="82" y="22" width="10" height="18" fill={skin} />
      {/* Hand/Glove ── */}
      <rect x="80" y="14" width="12" height="12" fill="#8b6914" />
      {/* Ball */}
      <rect x="90" y="10" width="10" height="10" fill={ball} />
      <rect x="92" y="12" width="3" height="6" fill="#cc4444" opacity="0.7" />

      {/* ── Glove arm (extended forward) ── */}
      <rect x="24" y="60" width="14" height="10" fill={jersey} />
      <rect x="14" y="60" width="14" height="12" fill="#8b6914" />

      {/* ── Pants (stride stance) ── */}
      <rect x="36" y="90" width="18" height="40" fill={pants} />
      <rect x="62" y="90" width="20" height="40" fill={pants} />
      <rect x="54" y="98" width="8" height="32" fill="#0a1a0a" />

      {/* ── Belt ── */}
      <rect x="36" y="88" width="46" height="5" fill={belt} />

      {/* ── Socks / Shoes ── */}
      <rect x="36" y="130" width="18" height="8" fill="#ffffff" />
      <rect x="62" y="130" width="20" height="8" fill="#ffffff" />
      <rect x="32" y="138" width="24" height="8" fill={shoes} />
      <rect x="60" y="138" width="24" height="8" fill={shoes} />
    </svg>
  );
}
