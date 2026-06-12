export const TRAJECTORY_REVEAL_THRESHOLD = 50;
export const ARCHETYPE_REVEAL_THRESHOLD = 75;

/**
 * All pitch field keys that should appear in a pitcher's scouting order.
 * pitchSPL is intentionally excluded (legacy/deprecated field).
 */
export const ALL_PITCH_SCOUTING_KEYS: readonly string[] = [
  'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT',
  'pitchSNK', 'pitchVSL', 'pitchHSL', 'pitchSWP', 'pitchCCH',
  'pitchSCB', 'pitchPCB', 'pitchFK', 'pitchSFF', 'pitchSHU', 'pitchKN',
];

export const DEFAULT_PITCHER_SCOUTING_ORDER = [
  'velocity','control','stamina',
  ...ALL_PITCH_SCOUTING_KEYS,
  'wRISP','vsLefty','poise','grit','heater','agile','recovery',
];

/**
 * Patches a stored scoutingOrder to include any pitch keys that are missing.
 * Old recruits generated before certain pitch fields were added will have an
 * incomplete stored order; those fields are appended at the end so they reveal
 * at the highest scouting percentages instead of never appearing.
 */
export function patchScoutingOrder(scoutingOrder: string[]): string[] {
  const stored = new Set(scoutingOrder);
  const missing = ALL_PITCH_SCOUTING_KEYS.filter(k => !stored.has(k));
  return missing.length > 0 ? [...scoutingOrder, ...missing] : scoutingOrder;
}

/**
 * Returns the set of pitch/attribute field names that should be visible on the
 * recruiting board and card for a pitcher, given their scouting progress.
 * Matches the reveal logic used in recruit-profile.tsx's RecruitPitchMixSection.
 */
export function computeRevealedPitchFields(
  scoutingOrder: string[] | null | undefined,
  scoutPct: number,
): Set<string> {
  let effectiveOrder: string[];
  if (scoutingOrder && scoutingOrder.length > 0) {
    effectiveOrder = patchScoutingOrder(scoutingOrder);
  } else {
    effectiveOrder = DEFAULT_PITCHER_SCOUTING_ORDER;
  }
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  return new Set(effectiveOrder.slice(0, revealCount));
}
