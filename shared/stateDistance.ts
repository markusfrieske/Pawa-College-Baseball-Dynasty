const STATE_ADJACENCY: Record<string, string[]> = {
  "Alabama": ["Mississippi", "Tennessee", "Florida", "Georgia"],
  "Alaska": [],
  "Arizona": ["California", "Colorado", "Nevada", "New Mexico", "Utah"],
  "Arkansas": ["Louisiana", "Mississippi", "Missouri", "Oklahoma", "Tennessee", "Texas"],
  "California": ["Arizona", "Nevada", "Oregon"],
  "Colorado": ["Arizona", "Kansas", "Nebraska", "New Mexico", "Oklahoma", "Utah", "Wyoming"],
  "Connecticut": ["Massachusetts", "New York", "Rhode Island"],
  "Delaware": ["Maryland", "New Jersey", "Pennsylvania"],
  "Florida": ["Alabama", "Georgia"],
  "Georgia": ["Alabama", "Florida", "North Carolina", "South Carolina", "Tennessee"],
  "Hawaii": [],
  "Idaho": ["Montana", "Nevada", "Oregon", "Utah", "Washington", "Wyoming"],
  "Illinois": ["Indiana", "Iowa", "Kentucky", "Missouri", "Wisconsin"],
  "Indiana": ["Illinois", "Kentucky", "Michigan", "Ohio"],
  "Iowa": ["Illinois", "Minnesota", "Missouri", "Nebraska", "South Dakota", "Wisconsin"],
  "Kansas": ["Colorado", "Missouri", "Nebraska", "Oklahoma"],
  "Kentucky": ["Illinois", "Indiana", "Missouri", "Ohio", "Tennessee", "Virginia", "West Virginia"],
  "Louisiana": ["Arkansas", "Mississippi", "Texas"],
  "Maine": ["New Hampshire"],
  "Maryland": ["Delaware", "Pennsylvania", "Virginia", "West Virginia"],
  "Massachusetts": ["Connecticut", "New Hampshire", "New York", "Rhode Island", "Vermont"],
  "Michigan": ["Indiana", "Ohio", "Wisconsin"],
  "Minnesota": ["Iowa", "North Dakota", "South Dakota", "Wisconsin"],
  "Mississippi": ["Alabama", "Arkansas", "Louisiana", "Tennessee"],
  "Missouri": ["Arkansas", "Illinois", "Iowa", "Kansas", "Kentucky", "Nebraska", "Oklahoma", "Tennessee"],
  "Montana": ["Idaho", "North Dakota", "South Dakota", "Wyoming"],
  "Nebraska": ["Colorado", "Iowa", "Kansas", "Missouri", "South Dakota", "Wyoming"],
  "Nevada": ["Arizona", "California", "Idaho", "Oregon", "Utah"],
  "New Hampshire": ["Maine", "Massachusetts", "Vermont"],
  "New Jersey": ["Delaware", "New York", "Pennsylvania"],
  "New Mexico": ["Arizona", "Colorado", "Oklahoma", "Texas", "Utah"],
  "New York": ["Connecticut", "Massachusetts", "New Jersey", "Pennsylvania", "Vermont"],
  "North Carolina": ["Georgia", "South Carolina", "Tennessee", "Virginia"],
  "North Dakota": ["Minnesota", "Montana", "South Dakota"],
  "Ohio": ["Indiana", "Kentucky", "Michigan", "Pennsylvania", "West Virginia"],
  "Oklahoma": ["Arkansas", "Colorado", "Kansas", "Missouri", "New Mexico", "Texas"],
  "Oregon": ["California", "Idaho", "Nevada", "Washington"],
  "Pennsylvania": ["Delaware", "Maryland", "New Jersey", "New York", "Ohio", "West Virginia"],
  "Rhode Island": ["Connecticut", "Massachusetts"],
  "South Carolina": ["Georgia", "North Carolina"],
  "South Dakota": ["Iowa", "Minnesota", "Montana", "Nebraska", "North Dakota", "Wyoming"],
  "Tennessee": ["Alabama", "Arkansas", "Georgia", "Kentucky", "Mississippi", "Missouri", "North Carolina", "Virginia"],
  "Texas": ["Arkansas", "Louisiana", "New Mexico", "Oklahoma"],
  "Utah": ["Arizona", "Colorado", "Idaho", "Nevada", "New Mexico", "Wyoming"],
  "Vermont": ["Massachusetts", "New Hampshire", "New York"],
  "Virginia": ["Kentucky", "Maryland", "North Carolina", "Tennessee", "West Virginia"],
  "Washington": ["Idaho", "Oregon"],
  "West Virginia": ["Kentucky", "Maryland", "Ohio", "Pennsylvania", "Virginia"],
  "Wisconsin": ["Illinois", "Iowa", "Michigan", "Minnesota"],
  "Wyoming": ["Colorado", "Idaho", "Montana", "Nebraska", "South Dakota", "Utah"],
};

const STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const stateNameMap: Record<string, string> = {};
for (const state of Object.keys(STATE_ADJACENCY)) {
  stateNameMap[state.toLowerCase()] = state;
}
for (const [abbr, full] of Object.entries(STATE_ABBR_TO_NAME)) {
  stateNameMap[abbr.toLowerCase()] = full;
}

function normalizeState(state: string): string | null {
  if (!state || !state.trim()) return null;
  return stateNameMap[state.trim().toLowerCase()] ?? null;
}

function bfsDistance(from: string, to: string): number | null {
  if (from === to) return 0;

  const visited = new Set<string>([from]);
  const queue: [string, number][] = [[from, 0]];

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    const neighbors = STATE_ADJACENCY[current];
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (neighbor === to) return dist + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }

  return null;
}

export function getStateDistance(teamState: string, recruitState: string): number {
  const normalizedTeam = normalizeState(teamState);
  const normalizedRecruit = normalizeState(recruitState);

  if (!normalizedTeam || !normalizedRecruit) return 3;

  const distance = bfsDistance(normalizedTeam, normalizedRecruit);

  if (distance === null) return 5;
  if (distance === 0) return 1;
  if (distance <= 2) return 2;
  if (distance <= 5) return 3;
  return 5;
}

export function getActionPointCost(actionType: string, teamState: string, recruitState: string): number {
  const lowerAction = actionType.toLowerCase();

  if (lowerAction === "visit" || lowerAction === "head_coach_visit") {
    return getStateDistance(teamState, recruitState);
  }

  if (lowerAction === "phone") {
    return 2;
  }

  return 1;
}
