/**
 * simulateUntil — fast-forward loop over advanceLeagueStep.
 *
 * The implementation lives in server/routes/simulation.ts alongside the private
 * helpers it calls. This module re-exports the public surface for callers
 * outside simulation.ts.
 */
export { simulateUntil } from "../../routes/simulation";
