export const TRAJECTORY_REVEAL_THRESHOLD = 50;
export const ARCHETYPE_REVEAL_THRESHOLD = 75;

const DEFAULT_PITCHER_SCOUTING_ORDER = [
  'velocity','control','stamina',
  'pitchFB','pitch2S','pitchSL','pitchCB','pitchCH','pitchCT',
  'pitchSNK','pitchSPL','pitchFK','pitchSFF','pitchSHU',
  'pitchSWP','pitchKN','pitchVSL','pitchSCB','pitchPCB',
  'wRISP','vsLefty','poise','grit','heater','agile','recovery',
];

/**
 * Returns the set of pitch/attribute field names that should be visible on the
 * recruiting board and card for a pitcher, given their scouting progress.
 * Matches the reveal logic used in recruit-profile.tsx's RecruitPitchMixSection.
 */
export function computeRevealedPitchFields(
  scoutingOrder: string[] | null | undefined,
  scoutPct: number,
): Set<string> {
  const effectiveOrder =
    scoutingOrder && scoutingOrder.length > 0
      ? scoutingOrder
      : DEFAULT_PITCHER_SCOUTING_ORDER;
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  return new Set(effectiveOrder.slice(0, revealCount));
}
