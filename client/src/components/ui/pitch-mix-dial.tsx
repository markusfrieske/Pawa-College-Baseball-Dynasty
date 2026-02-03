interface PitchMixListProps {
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

export function PitchMixDial({ pitches, className = "" }: PitchMixListProps) {
  const activePitches = pitches.filter(p => p.rating > 0);
  
  if (activePitches.length === 0) {
    return (
      <div className={`${className}`} data-testid="pitch-mix-dial">
        <div className="text-center text-muted-foreground text-xs">No pitches</div>
      </div>
    );
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 6) return "text-gold";
    if (rating >= 4) return "text-blue-400";
    if (rating >= 2) return "text-purple-400";
    return "text-muted-foreground";
  };

  return (
    <div className={`${className}`} data-testid="pitch-mix-dial">
      <h4 className="font-pixel text-[10px] text-gold mb-2">Pitch Mix</h4>
      <div className="flex flex-wrap gap-3">
        {activePitches.map((pitch) => (
          <div key={pitch.name} className="text-center min-w-[40px]">
            <span className="text-[10px] text-muted-foreground">{pitchLabels[pitch.name] || pitch.name}</span>
            <div className={`text-lg font-bold ${getRatingColor(pitch.rating)}`}>
              {pitch.rating}
            </div>
          </div>
        ))}
      </div>
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
