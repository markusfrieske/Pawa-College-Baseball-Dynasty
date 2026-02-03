interface PitchMixDialProps {
  pitches: {
    name: string;
    rating: number;
  }[];
  className?: string;
}

const pitchLabels: Record<string, string> = {
  FB: "Fastball",
  SL: "Slider",
  CB: "Curveball",
  CH: "Changeup",
  CT: "Cutter",
  SNK: "Sinker",
  SPL: "Splitter",
};

const pitchOrder = ["FB", "SL", "CB", "CH", "CT", "SNK", "SPL"];

export function PitchMixDial({ pitches, className = "" }: PitchMixDialProps) {
  const centerX = 70;
  const centerY = 70;
  const maxLength = 45;
  const minLength = 8;

  const activePitches = pitches.filter(p => p.rating > 0);
  const numPitches = activePitches.length;
  
  if (numPitches === 0) {
    return (
      <div className={`${className}`} data-testid="pitch-mix-dial">
        <div className="text-center text-muted-foreground text-xs">No pitches</div>
      </div>
    );
  }

  const angleStep = (2 * Math.PI) / Math.max(numPitches, 1);
  const startAngle = -Math.PI / 2;

  const getCoordinates = (angle: number, length: number) => ({
    x: centerX + length * Math.cos(angle),
    y: centerY + length * Math.sin(angle),
  });

  const getRatingLength = (rating: number) => {
    const normalized = Math.min(7, Math.max(1, rating));
    return minLength + ((normalized - 1) / 6) * (maxLength - minLength);
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 6) return "#C4A35A";
    if (rating >= 4) return "#60a5fa";
    if (rating >= 2) return "#a78bfa";
    return "#94a3b8";
  };

  return (
    <div className={`${className}`} data-testid="pitch-mix-dial">
      <svg viewBox="0 0 140 140" className="w-full h-full">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <circle cx={centerX} cy={centerY} r={maxLength + 2} fill="none" stroke="#2d3d2d" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        <circle cx={centerX} cy={centerY} r={maxLength * 0.5 + 2} fill="none" stroke="#2d3d2d" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
        
        <circle cx={centerX} cy={centerY} r="10" fill="#C4A35A" />
        <circle cx={centerX} cy={centerY} r="6" fill="#1a2b1a" />
        
        {activePitches.map((pitch, i) => {
          const angle = startAngle + i * angleStep;
          const length = getRatingLength(pitch.rating);
          const end = getCoordinates(angle, length);
          const color = getRatingColor(pitch.rating);
          
          const labelRadius = maxLength + 16;
          const labelPos = getCoordinates(angle, labelRadius);
          
          const isFastball = pitch.name === "FB";
          const strokeWidth = isFastball ? 6 : 4;
          
          return (
            <g key={pitch.name}>
              <line
                x1={centerX}
                y1={centerY}
                x2={end.x}
                y2={end.y}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                filter="url(#glow)"
              />
              
              <circle
                cx={end.x}
                cy={end.y}
                r={isFastball ? 5 : 4}
                fill={color}
              />
              
              <text
                x={labelPos.x}
                y={labelPos.y}
                fill="#C4A35A"
                fontSize="8"
                fontFamily="'Press Start 2P', monospace"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {pitch.name}
              </text>
              
              <text
                x={labelPos.x}
                y={labelPos.y + 10}
                fill="#94a3b8"
                fontSize="6"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {pitch.rating}
              </text>
            </g>
          );
        })}
      </svg>
      
      <div className="text-center mt-1">
        <p className="text-[10px] text-muted-foreground font-pixel">
          {numPitches} Pitch Mix
        </p>
      </div>
    </div>
  );
}

export function generatePitchMixForDial(player: {
  position: string;
  velocity?: number | null;
  control?: number | null;
  stuff?: number | null;
}): { name: string; rating: number }[] {
  if (player.position !== "P") return [];
  
  const stuff = player.stuff || 50;
  const velocity = player.velocity || 50;
  const control = player.control || 50;
  
  const numPitches = Math.min(7, Math.max(2, Math.floor(stuff / 14) + 2));
  
  const basePitches = [
    { name: "FB", rating: 1 },
    { name: "SL", rating: Math.min(7, Math.max(1, Math.floor(stuff / 14))) },
    { name: "CB", rating: Math.min(7, Math.max(1, Math.floor(control / 14))) },
    { name: "CH", rating: Math.min(7, Math.max(1, Math.floor((stuff + control) / 28))) },
    { name: "CT", rating: Math.min(7, Math.max(1, Math.floor((velocity + control) / 28))) },
    { name: "SNK", rating: Math.min(7, Math.max(1, Math.floor(velocity / 14))) },
    { name: "SPL", rating: Math.min(7, Math.max(1, Math.floor((stuff * 0.8) / 14))) },
  ];
  
  return basePitches
    .slice(0, numPitches)
    .filter(p => p.name === "FB" || p.rating >= 2);
}
