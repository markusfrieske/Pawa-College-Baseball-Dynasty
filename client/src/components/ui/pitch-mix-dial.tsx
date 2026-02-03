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
  const centerX = 80;
  const centerY = 90;
  const maxRadius = 55;
  const minRadius = 10;

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

  const getCoordinates = (angle: number, radius: number) => ({
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  });

  const getRatingRadius = (rating: number) => {
    const normalized = Math.min(7, Math.max(1, rating));
    return minRadius + ((normalized - 1) / 6) * (maxRadius - minRadius);
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 6) return "#C4A35A";
    if (rating >= 4) return "#60a5fa";
    if (rating >= 2) return "#a78bfa";
    return "#94a3b8";
  };

  const ringRadii = [1, 2, 3, 4, 5, 6, 7].map(r => minRadius + ((r - 1) / 6) * (maxRadius - minRadius));

  return (
    <div className={`${className}`} data-testid="pitch-mix-dial">
      <div className="text-center mb-2">
        <span className="font-pixel text-[10px] text-gold">Pitch Mix</span>
      </div>
      
      <svg viewBox="0 0 160 160" className="w-full h-full">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {[1, 3, 5, 7].map((level) => (
          <circle
            key={level}
            cx={centerX}
            cy={centerY}
            r={ringRadii[level - 1]}
            fill="none"
            stroke="#2d3d2d"
            strokeWidth="1"
            strokeDasharray={level === 7 ? "none" : "4,4"}
            opacity={level === 7 ? 0.6 : 0.3}
          />
        ))}
        
        {[1, 3, 5, 7].map((level) => {
          const labelAngle = -Math.PI / 2 + Math.PI / 8;
          const pos = getCoordinates(labelAngle, ringRadii[level - 1] + 2);
          return (
            <text
              key={`label-${level}`}
              x={pos.x}
              y={pos.y}
              fill="#94a3b8"
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {level}
            </text>
          );
        })}
        
        <circle cx={centerX} cy={centerY} r="8" fill="#C4A35A" />
        <circle cx={centerX} cy={centerY} r="5" fill="#1a2b1a" />
        
        {activePitches.map((pitch, i) => {
          const angle = startAngle + i * angleStep;
          const radius = getRatingRadius(pitch.rating);
          const end = getCoordinates(angle, radius);
          const color = getRatingColor(pitch.rating);
          
          const labelRadius = maxRadius + 18;
          const labelPos = getCoordinates(angle, labelRadius);
          
          const isFastball = pitch.name === "FB";
          const strokeWidth = isFastball ? 5 : 3;
          
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
                y={labelPos.y - 5}
                fill="#C4A35A"
                fontSize="9"
                fontFamily="'Press Start 2P', monospace"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {pitch.name}
              </text>
              
              <text
                x={labelPos.x}
                y={labelPos.y + 8}
                fill={color}
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {pitch.rating}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function generatePitchMixForDial(player: {
  position: string;
  velocity?: number | null;
  control?: number | null;
  stuff?: number | null;
  starRating?: number | null;
}): { name: string; rating: number }[] {
  if (player.position !== "P") return [];
  
  const stuff = player.stuff || 50;
  const velocity = player.velocity || 50;
  const control = player.control || 50;
  const starRating = player.starRating || 3;
  
  let numPitches: number;
  if (starRating >= 5) {
    numPitches = 4 + Math.floor(Math.random() * 2);
  } else if (starRating >= 4) {
    numPitches = 4 + Math.floor(Math.random() * 2);
  } else if (starRating >= 3) {
    numPitches = 3 + Math.floor(Math.random() * 2);
  } else {
    numPitches = 2 + Math.floor(Math.random() * 3);
  }
  
  const baseRating = starRating >= 4 ? 4 : starRating >= 3 ? 3 : 2;
  
  const fbRating = Math.min(7, Math.max(1, baseRating + Math.floor(velocity / 25) - 1 + Math.floor(Math.random() * 2)));
  
  const basePitches = [
    { name: "FB", rating: fbRating },
    { name: "SL", rating: Math.min(7, Math.max(1, baseRating + Math.floor(stuff / 30) - 1 + Math.floor(Math.random() * 2))) },
    { name: "CB", rating: Math.min(7, Math.max(1, baseRating + Math.floor(control / 30) - 1 + Math.floor(Math.random() * 2))) },
    { name: "CH", rating: Math.min(7, Math.max(1, baseRating + Math.floor((stuff + control) / 60) - 1 + Math.floor(Math.random() * 2))) },
    { name: "CT", rating: Math.min(7, Math.max(1, baseRating + Math.floor((velocity + control) / 60) - 1 + Math.floor(Math.random() * 2))) },
    { name: "SNK", rating: Math.min(7, Math.max(1, baseRating + Math.floor(velocity / 35) + Math.floor(Math.random() * 2))) },
    { name: "SPL", rating: Math.min(7, Math.max(1, baseRating + Math.floor(stuff / 35) + Math.floor(Math.random() * 2))) },
  ];
  
  const shuffledSecondary = basePitches.slice(1).sort(() => Math.random() - 0.5);
  const selectedPitches = [basePitches[0], ...shuffledSecondary.slice(0, numPitches - 1)];
  
  return selectedPitches.filter(p => p.name === "FB" || p.rating >= 1);
}
