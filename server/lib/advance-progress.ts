type Progress = { stage: string; pct: number; updatedAt: number; owner: symbol };
const progress = new Map<string, Progress>();

/** Each execution closes over its own writer; a league lookup can never select a successor's writer. */
export function createAdvanceProgress(leagueId: string, persist: (stage: string, pct: number) => Promise<void>) {
  const owner = Symbol(leagueId);
  progress.set(leagueId, { stage: "initializing", pct: 0, updatedAt: Date.now(), owner });
  const publish = (stage: string, pct: number) => {
    if (progress.get(leagueId)?.owner === owner) progress.set(leagueId, { stage, pct, updatedAt: Date.now(), owner });
  };
  return Object.freeze({
    update: async (stage: string, pct: number) => {
      await persist(stage, pct);
      publish(stage, pct);
    },
    /** The callback commits both gameplay effects and their checkpoint before UI publication. */
    commitStage: async (stage: string, pct: number, commit: () => Promise<void>) => {
      await commit();
      publish(stage, pct);
    },
    clear: () => { if (progress.get(leagueId)?.owner === owner) progress.delete(leagueId); },
  });
}

export function getAdvanceProgress(leagueId: string) {
  const current = progress.get(leagueId);
  if (!current) return undefined;
  const { owner: _owner, ...visible } = current;
  return visible;
}
