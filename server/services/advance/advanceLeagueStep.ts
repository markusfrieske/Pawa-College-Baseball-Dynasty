/**
 * advanceLeagueStep — authoritative single-step advance service.
 *
 * The implementation lives in server/routes/simulation.ts so it can access
 * the private helpers (advanceSuperRegionals, advanceCWS, runCpuRecruiting,
 * etc.) defined at module scope there. This module re-exports the public
 * surface so callers outside simulation.ts have a stable import path.
 */
export {
  advanceLeagueStep,
  AdvancePreconditionError,
} from "../../routes/simulation";
export type { AdvanceStepResult } from "../../routes/simulation";
