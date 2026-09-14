import type { RequestHandler } from "express";

/**
 * The legacy endpoints accept client-controlled game outcomes without an
 * authoritative simulation session. Keep them unreachable until replaced.
 * This terminal middleware intentionally has no environment-flag override.
 */
export const rejectLegacyPlayByPlay: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "Play-by-play is temporarily unavailable. Open the schedule to manage games." });
};
