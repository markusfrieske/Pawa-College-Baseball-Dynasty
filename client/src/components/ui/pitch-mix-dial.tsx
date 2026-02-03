interface PitchMixListProps {
  pitches: {
    name: string;
    rating: number;
  }[];
  className?: string;
}

const pitchLabels: Record<string, string> = {
  FB: "Fastball",
  "2FB": "2-Seam",
  CH: "Change Up",
  CB: "Curveball",
  SL: "Slider",
  SNK: "Sinker",
  CT: "Cutter",
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

const commonPitches = ["FB", "2FB", "CH", "CB", "SL", "SNK", "CT"];
const skilledPitches = ["SHU", "CCH", "HSL", "SWP", "KN", "VSL", "SFF", "FK", "SCB", "PCB"];

export function generatePitchMixForDial(player: {
  id?: string;
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
  
  const seedFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  };
  
  const seed = player.id ? seedFromId(player.id) : Math.floor(Math.random() * 10000);
  const seededRandom = (s: number, idx: number) => {
    const x = Math.sin(s + idx * 9999) * 10000;
    return x - Math.floor(x);
  };
  
  let numPitches: number;
  if (starRating >= 5) {
    numPitches = 5 + (seed % 2);
  } else if (starRating >= 4) {
    numPitches = 4 + (seed % 2);
  } else {
    numPitches = 3 + (seed % 2);
  }
  
  const result: { name: string; rating: number }[] = [];
  
  const attrToRating = (attrValue: number): number => {
    const base = Math.floor((attrValue / 100) * 5) + 2;
    return Math.min(7, Math.max(1, base + Math.floor(seededRandom(seed, attrValue) * 2) - 1));
  };
  
  const fbRating = attrToRating(velocity);
  result.push({ name: "FB", rating: fbRating });
  
  const availableCommon = commonPitches.filter(p => p !== "FB");
  const shuffledCommon = [...availableCommon].sort((a, b) => 
    seededRandom(seed, availableCommon.indexOf(a)) - seededRandom(seed, availableCommon.indexOf(b))
  );
  
  const commonCount = Math.min(numPitches - 1, starRating >= 4 ? 3 : 2);
  
  for (let i = 0; i < commonCount && i < shuffledCommon.length; i++) {
    const pitch = shuffledCommon[i];
    let rating: number;
    
    if (pitch === "CB") {
      rating = attrToRating(control);
    } else if (pitch === "SL") {
      rating = attrToRating(stuff);
    } else if (pitch === "CH") {
      rating = attrToRating((stuff + control) / 2);
    } else if (pitch === "CT" || pitch === "2FB") {
      rating = attrToRating(velocity);
    } else {
      rating = attrToRating((velocity + stuff + control) / 3);
    }
    
    result.push({ name: pitch, rating });
  }
  
  if (starRating >= 4 && result.length < numPitches) {
    const shuffledSkilled = [...skilledPitches].sort((a, b) =>
      seededRandom(seed, skilledPitches.indexOf(a) + 100) - seededRandom(seed, skilledPitches.indexOf(b) + 100)
    );
    
    const skilledCount = numPitches - result.length;
    for (let i = 0; i < skilledCount && i < shuffledSkilled.length; i++) {
      const pitch = shuffledSkilled[i];
      const rating = attrToRating(stuff);
      result.push({ name: pitch, rating });
    }
  }
  
  while (result.length < numPitches && shuffledCommon.length > result.length - 1) {
    const nextCommonIdx = result.length - 1;
    if (nextCommonIdx < shuffledCommon.length) {
      const pitch = shuffledCommon[nextCommonIdx];
      if (!result.find(p => p.name === pitch)) {
        const rating = attrToRating((velocity + stuff) / 2);
        result.push({ name: pitch, rating });
      }
    } else {
      break;
    }
  }
  
  return result.sort((a, b) => b.rating - a.rating);
}
