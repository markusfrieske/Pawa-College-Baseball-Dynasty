interface PitchMixListProps {
  pitches: {
    name: string;
    rating: number;
  }[];
  className?: string;
}

export const pitchLabels: Record<string, string> = {
  FB: "Fastball",
  "2S": "2-Seam",
  CH: "Change Up",
  CB: "Curveball",
  SL: "Slider",
  SNK: "Sinker",
  CT: "Cutter",
  SPL: "Splitter",
  SHU: "Shuuto",
  CCH: "Circle Change",
  HSL: "Hard Slider",
  SWP: "Sweeper",
  KN: "Knuckleball",
  VSL: "Vertical Slider",
  SFF: "SFF",
  FK: "Forkball",
  SCB: "Slow Curve",
  PCB: "Power Curve",
};

export const allPitchKeys = [
  "FB", "2S", "SL", "CB", "CH", "CT", "SNK", "SPL",
  "SHU", "CCH", "HSL", "SWP", "KN", "VSL", "SFF", "FK", "SCB", "PCB",
] as const;

const pitchDbFieldMap: Record<string, string> = {
  FB: "pitchFB",
  "2S": "pitch2S",
  SL: "pitchSL",
  CB: "pitchCB",
  CH: "pitchCH",
  CT: "pitchCT",
  SNK: "pitchSNK",
  SPL: "pitchSPL",
  SHU: "pitchSHU",
  CCH: "pitchCCH",
  HSL: "pitchHSL",
  SWP: "pitchSWP",
  KN: "pitchKN",
  VSL: "pitchVSL",
  SFF: "pitchSFF",
  FK: "pitchFK",
  SCB: "pitchSCB",
  PCB: "pitchPCB",
};

export function PitchMixDial({ pitches, className = "" }: PitchMixListProps) {
  const activePitches = pitches.filter(p => p.rating > 0);
  
  if (activePitches.length === 0) {
    return (
      <div className={`${className}`} data-testid="pitch-mix-dial">
        <div className="text-center text-muted-foreground text-xs">No pitches</div>
      </div>
    );
  }

  const pairs: ({ name: string; rating: number } | null)[][] = [];
  for (let i = 0; i < activePitches.length; i += 2) {
    const pair: ({ name: string; rating: number } | null)[] = [activePitches[i]];
    if (i + 1 < activePitches.length) {
      pair.push(activePitches[i + 1]);
    } else {
      pair.push(null);
    }
    pairs.push(pair);
  }

  return (
    <div className={`${className}`} data-testid="pitch-mix-dial">
      <div className="space-y-1">
        {pairs.map((pair, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-4">
            {pair.map((pitch, pIdx) => (
              <div key={pIdx} className="flex items-center gap-2">
                {pitch ? (
                  <>
                    <span className="text-sm text-foreground" data-testid={`pitch-name-${pitch.name}`}>
                      {pitchLabels[pitch.name] || pitch.name}
                    </span>
                    <span className="text-sm font-bold text-gold" data-testid={`pitch-rating-${pitch.name}`}>
                      {pitch.rating}
                    </span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function generatePitchMixForDial(player: Record<string, any>): { name: string; rating: number }[] {
  if (player.position !== "P") return [];
  
  const result: { name: string; rating: number }[] = [];
  
  for (const pitchKey of allPitchKeys) {
    const dbField = pitchDbFieldMap[pitchKey];
    const val = player[dbField];
    if (val && val > 0) {
      result.push({ name: pitchKey, rating: val });
    }
  }
  
  if (result.length === 0) {
    result.push({ name: "FB", rating: 1 });
  }
  
  return result.sort((a, b) => {
    if (a.name === "FB") return -1;
    if (b.name === "FB") return 1;
    if (a.name === "2S") return -1;
    if (b.name === "2S") return 1;
    return b.rating - a.rating;
  });
}
