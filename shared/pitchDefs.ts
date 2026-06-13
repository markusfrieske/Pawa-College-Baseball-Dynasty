export interface PitchDef {
  key: string;
  label: string;
  binary: boolean;
  alwaysOn?: boolean;
}

export const PITCH_DEFS: PitchDef[] = [
  { key: "pitchFB",  label: "FB",  binary: true,  alwaysOn: true  },
  { key: "pitch2S",  label: "2S",  binary: true  },
  { key: "pitchCH",  label: "CH",  binary: false },
  { key: "pitchFK",  label: "FK",  binary: true  },
  { key: "pitchSFF", label: "SFF", binary: true  },
  { key: "pitchKN",  label: "KN",  binary: true  },
  { key: "pitchSL",  label: "SL",  binary: false },
  { key: "pitchCB",  label: "CB",  binary: false },
  { key: "pitchCT",  label: "CT",  binary: false },
  { key: "pitchSNK", label: "SNK", binary: false },
  { key: "pitchSHU", label: "SHU", binary: false },
  { key: "pitchVSL", label: "VSL", binary: false },
  { key: "pitchHSL", label: "HSL", binary: false },
  { key: "pitchSWP", label: "SWP", binary: false },
  { key: "pitchCCH", label: "CCH", binary: false },
  { key: "pitchSCB", label: "SCB", binary: false },
  { key: "pitchPCB", label: "PCB", binary: false },
];

export const BINARY_PITCH_KEYS = PITCH_DEFS.filter(p => p.binary).map(p => p.key);
export const RATED_PITCH_KEYS  = PITCH_DEFS.filter(p => !p.binary).map(p => p.key);
