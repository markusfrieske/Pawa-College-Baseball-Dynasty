/** Pending-report recipients come from actual game participants, never the
 * commissioner's unrelated coaching team or client role hints. */
export function reportPendingRecipientIds(
  coaches: ReadonlyArray<{ userId: string | null; teamId: string | null }>,
  game: { homeTeamId: string | null; awayTeamId: string | null },
  reporterUserId: string,
  reporterTeamId: string | null,
): string[] {
  const participatingTeams = new Set([game.homeTeamId, game.awayTeamId].filter((id): id is string => !!id));
  const involvedReporterTeam = reporterTeamId && participatingTeams.has(reporterTeamId) ? reporterTeamId : null;
  return [...new Set(coaches
    .filter(coach => coach.teamId && participatingTeams.has(coach.teamId)
      && coach.teamId !== involvedReporterTeam && coach.userId && coach.userId !== reporterUserId)
    .map(coach => coach.userId!))];
}
