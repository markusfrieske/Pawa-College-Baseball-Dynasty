import { isReportEditVersion } from "../../../shared/reporting";

export interface ReviewedReport {
  readonly gameId: string;
  readonly expectedEditVersion: number;
  readonly homeScore: number;
  readonly awayScore: number;
}

/** Copy the review target, so a refreshed report cannot change an open dispute draft. */
export function captureReviewedReport(report: { gameId: string; editVersion?: unknown; homeScore: number; awayScore: number }): ReviewedReport {
  if (!isReportEditVersion(report.editVersion)) {
    throw new Error("Reload and review this report before taking action.");
  }
  return Object.freeze({ gameId: report.gameId, expectedEditVersion: report.editVersion, homeScore: report.homeScore, awayScore: report.awayScore });
}
