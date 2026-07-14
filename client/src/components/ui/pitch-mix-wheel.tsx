interface PitchMixWheelProps {
  pitches?: {
    name: string;
    rating: number;
  }[];
  className?: string;
}

const defaultPitches = [
  { name: "FB", rating: 0 },
  { name: "SL", rating: 0 },
  { name: "CB", rating: 0 },
  { name: "CH", rating: 0 },
  { name: "CT", rating: 0 },
  { name: "SNK", rating: 0 },
];

const pitchLabels: Record<string, string> = {
  FB: "Fastball",
  SL: "Slider",
  CB: "Curveball",
  CH: "Changeup",
  CT: "Cutter",
  SNK: "Sinker",
  SPL: "Splitter",
  FRK: "Forkball",
  KN: "Knuckleball",
  SC: "Screwball",
};

export function PitchMixWheel({ pitches = defaultPitches, className = "" }: PitchMixWheelProps) {
  const centerX = 60;
  const centerY = 60;
  const maxRadius = 45;
  const minRadius = 12;
  
  const activePitches = pitches.filter(p => p.rating > 0);
  const numSlices = 6;
  const angleStep = (2 * Math.PI) / numSlices;
  const startAngle = -Math.PI / 2;

  const getCoordinates = (angle: number, radius: number) => ({
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  });

  const getRatingColor = (rating: number) => {
    if (rating >= 80) return "#C4A35A";
    if (rating >= 60) return "#4ade80";
    if (rating >= 40) return "#60a5fa";
    if (rating >= 20) return "#a78bfa";
    if (rating > 0) return "#94a3b8";
    return "#374151";
  };

  const getRatingRadius = (rating: number) => {
    if (rating === 0) return minRadius;
    return minRadius + ((rating / 100) * (maxRadius - minRadius));
  };

  return (
    <div className={`relative ${className}`} data-testid="pitch-mix-wheel">
      <svg viewBox="0 0 120 120" className="w-full h-full">
        {/* Background circles */}
        <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="#2d3d2d" strokeWidth="1" strokeDasharray="2,2" />
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.66} fill="none" stroke="#2d3d2d" strokeWidth="1" strokeDasharray="2,2" />
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.33} fill="none" stroke="#2d3d2d" strokeWidth="1" strokeDasharray="2,2" />
        <circle cx={centerX} cy={centerY} r={minRadius} fill="#1a2b1a" stroke="#C4A35A" strokeWidth="1" />
        
        {/* Radial lines */}
        {pitches.slice(0, numSlices).map((_, i) => {
          const angle = startAngle + i * angleStep;
          const end = getCoordinates(angle, maxRadius);
          return (
            <line
              key={`line-${i}`}
              x1={centerX}
              y1={centerY}
              x2={end.x}
              y2={end.y}
              stroke="#2d3d2d"
              strokeWidth="1"
            />
          );
        })}
        
        {/* Pitch slices */}
        {pitches.slice(0, numSlices).map((pitch, i) => {
          const angle = startAngle + i * angleStep;
          const nextAngle = startAngle + (i + 1) * angleStep;
          const radius = getRatingRadius(pitch.rating);
          
          const start = getCoordinates(angle, minRadius);
          const end = getCoordinates(nextAngle, minRadius);
          const outerStart = getCoordinates(angle, radius);
          const outerEnd = getCoordinates(nextAngle, radius);
          
          const pathData = `
            M ${start.x} ${start.y}
            L ${outerStart.x} ${outerStart.y}
            A ${radius} ${radius} 0 0 1 ${outerEnd.x} ${outerEnd.y}
            L ${end.x} ${end.y}
            A ${minRadius} ${minRadius} 0 0 0 ${start.x} ${start.y}
          `;
          
          const labelAngle = angle + angleStep / 2;
          const labelRadius = maxRadius + 8;
          const labelPos = getCoordinates(labelAngle, labelRadius);
          
          return (
            <g key={`slice-${i}`}>
              <path
                d={pathData}
                fill={getRatingColor(pitch.rating)}
                opacity={pitch.rating > 0 ? 0.7 : 0.2}
                stroke="#1a2b1a"
                strokeWidth="1"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                fill={pitch.rating > 0 ? "#C4A35A" : "#666"}
                fontSize="7"
                fontFamily="'IBM Plex Mono', monospace"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {pitch.name}
              </text>
            </g>
          );
        })}
        
        {/* Center dot */}
        <circle cx={centerX} cy={centerY} r="4" fill="#C4A35A" />
        
        {/* Signature pitch indicator */}
        {activePitches.length > 0 && (
          <text
            x={centerX}
            y={centerY}
            fill="#1a2b1a"
            fontSize="5"
            fontFamily="'IBM Plex Mono', monospace"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            SP
          </text>
        )}
      </svg>
      
      {/* Legend */}
      <div className="mt-2 text-center">
        <p className="text-xs text-muted-foreground">
          {activePitches.length > 0 
            ? `Signature: ${pitchLabels[activePitches.reduce((a, b) => a.rating > b.rating ? a : b).name] || activePitches[0].name}`
            : "No pitches scouted"
          }
        </p>
      </div>
    </div>
  );
}
