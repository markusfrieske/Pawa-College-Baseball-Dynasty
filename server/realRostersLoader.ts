import type { RealPlayer } from "./realRosters";

type RosterCache = {
  ALL_REAL_ROSTERS: Record<string, RealPlayer[]>;
  SEC_REAL_ROSTERS: Record<string, RealPlayer[]>;
};

let _cache: RosterCache | null = null;
let _loading: Promise<RosterCache> | null = null;

/**
 * Lazily loads and caches all real roster data.
 * On first call, dynamically imports realRosters.ts (and all batch files).
 * Subsequent calls return the cached object instantly (no I/O, no re-parse).
 * This keeps ~3,500 players out of the server startup bundle until first needed.
 */
export async function getRealRosters(): Promise<RosterCache> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = import("./realRosters").then(mod => {
    _cache = {
      ALL_REAL_ROSTERS: mod.ALL_REAL_ROSTERS,
      SEC_REAL_ROSTERS: mod.SEC_REAL_ROSTERS,
    };
    _loading = null;
    return _cache;
  }).catch(err => {
    _loading = null;
    throw err;
  });
  return _loading;
}
