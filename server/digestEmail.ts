import { sendEmail } from "./email";
import type { IStorage } from "./storage";

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    preseason: "Spring Training",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason_departures: "Player Departures",
    offseason_recruiting_1: "Offseason Recruiting (Wk 1)",
    offseason_recruiting_2: "Offseason Recruiting (Wk 2)",
    offseason_recruiting_3: "Offseason Recruiting (Wk 3)",
    offseason_recruiting_4: "Offseason Recruiting (Wk 4)",
    offseason_signing_day: "Signing Day",
    offseason_walkons: "Walk-Ons",
  };
  return labels[phase] || phase;
}

function starStr(stars: number): string {
  return "★".repeat(Math.max(0, Math.min(5, stars)));
}

function buildDigestHtml(opts: {
  coachName: string;
  leagueName: string;
  teamName: string;
  teamAbbr: string;
  season: number;
  week: number;
  phase: string;
  games: Array<{ opponent: string; isHome: boolean; homeScore: number; awayScore: number; isComplete: boolean }>;
  standingsRank: number;
  totalTeams: number;
  wins: number;
  losses: number;
  topRecruits: Array<{ name: string; position: string; stars: number; interest: number }>;
  unsubUrl: string;
}): string {
  const { coachName, leagueName, teamName, teamAbbr, season, week, phase, games, standingsRank, totalTeams, wins, losses, topRecruits, unsubUrl } = opts;

  const gameRows = games.length === 0
    ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#8aaa8a;">No games this week</td></tr>`
    : games.map(g => {
        const teamScore = g.isHome ? g.homeScore : g.awayScore;
        const oppScore = g.isHome ? g.awayScore : g.homeScore;
        const won = teamScore > oppScore;
        const resultColor = won ? "#FFD700" : "#e05252";
        const result = won ? "W" : "L";
        const venue = g.isHome ? "vs" : "@";
        return `<tr>
          <td style="padding:8px 12px;color:#d4d4aa;">${venue} ${g.opponent}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:bold;color:${resultColor};">${result}</td>
          <td style="padding:8px 12px;text-align:center;color:#c8c8a8;">${teamScore}–${oppScore}</td>
        </tr>`;
      }).join("");

  const recruitRows = topRecruits.length === 0
    ? `<tr><td colspan="3" style="padding:12px;text-align:center;color:#8aaa8a;">No active recruits</td></tr>`
    : topRecruits.slice(0, 5).map(r => {
        const interestColor = r.interest >= 70 ? "#FFD700" : r.interest >= 40 ? "#88cc88" : "#8aaa8a";
        return `<tr>
          <td style="padding:8px 12px;color:#d4d4aa;">${r.name}</td>
          <td style="padding:8px 12px;text-align:center;color:#aac8aa;">${r.position} · ${starStr(r.stars)}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:bold;color:${interestColor};">${r.interest}%</td>
        </tr>`;
      }).join("");

  const rankOrdinal = standingsRank === 1 ? "1st" : standingsRank === 2 ? "2nd" : standingsRank === 3 ? "3rd" : `${standingsRank}th`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>College Baseball Dynasty — Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background:#0a1a0a;font-family:'Courier New',monospace;color:#d4d4aa;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1a0a;padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#0d220d;border:2px solid #FFD700;border-radius:4px 4px 0 0;padding:24px;text-align:center;">
          <div style="font-size:11px;letter-spacing:3px;color:#FFD700;text-transform:uppercase;margin-bottom:8px;">⚾ College Baseball Dynasty</div>
          <div style="font-size:22px;font-weight:bold;color:#FFD700;letter-spacing:1px;">${teamAbbr} Weekly Digest</div>
          <div style="font-size:12px;color:#8aaa8a;margin-top:6px;">Season ${season} · ${phaseLabel(phase)} · Week ${week}</div>
          <div style="font-size:13px;color:#c8c8a8;margin-top:4px;">${leagueName}</div>
        </td>
      </tr>

      <!-- Greeting -->
      <tr>
        <td style="background:#0f1e0f;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:20px 24px;">
          <p style="margin:0;color:#c8c8a8;font-size:14px;">Coach ${coachName},</p>
          <p style="margin:12px 0 0;color:#8aaa8a;font-size:13px;">Here's your weekly update for the <strong style="color:#FFD700;">${teamName}</strong>.</p>
        </td>
      </tr>

      <!-- Standings -->
      <tr>
        <td style="background:#0d1c0d;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:0 24px 20px;">
          <div style="background:#112211;border:1px solid #2a4a2a;border-radius:4px;padding:16px;display:flex;justify-content:space-between;align-items:center;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;padding:0 8px;">
                  <div style="font-size:28px;font-weight:bold;color:#FFD700;">${rankOrdinal}</div>
                  <div style="font-size:10px;color:#8aaa8a;letter-spacing:1px;">OF ${totalTeams} TEAMS</div>
                </td>
                <td style="border-left:1px solid #2a4a2a;padding:0 16px;">
                  <div style="font-size:20px;font-weight:bold;color:#d4d4aa;">${wins}–${losses}</div>
                  <div style="font-size:10px;color:#8aaa8a;">OVERALL RECORD</div>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- Games -->
      <tr>
        <td style="background:#0d1c0d;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:0 24px 20px;">
          <div style="font-size:11px;font-weight:bold;color:#FFD700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">This Week's Results</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#112211;border:1px solid #2a4a2a;border-radius:4px;overflow:hidden;">
            <thead>
              <tr style="background:#183018;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">OPPONENT</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">RESULT</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">SCORE</th>
              </tr>
            </thead>
            <tbody>${gameRows}</tbody>
          </table>
        </td>
      </tr>

      <!-- Recruiting -->
      <tr>
        <td style="background:#0d1c0d;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:0 24px 20px;">
          <div style="font-size:11px;font-weight:bold;color:#FFD700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Top Recruiting Interests</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#112211;border:1px solid #2a4a2a;border-radius:4px;overflow:hidden;">
            <thead>
              <tr style="background:#183018;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">RECRUIT</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">POS / STARS</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;color:#8aaa8a;letter-spacing:1px;font-weight:normal;">INTEREST</th>
              </tr>
            </thead>
            <tbody>${recruitRows}</tbody>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#0a1a0a;border:2px solid #FFD700;border-top:none;border-radius:0 0 4px 4px;padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#5a7a5a;">
            You're receiving this because you're a coach in <strong style="color:#8aaa8a;">${leagueName}</strong>.
          </p>
          <p style="margin:8px 0 0;font-size:11px;">
            <a href="${unsubUrl}" style="color:#8aaa8a;text-decoration:underline;">Unsubscribe from digest emails</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendWeeklyDigests(
  leagueId: string,
  storage: IStorage,
  appBaseUrl: string = process.env.APP_BASE_URL || "https://collegebaseballdynasty.replit.app",
): Promise<void> {
  try {
    const league = await storage.getLeague(leagueId);
    if (!league) return;
    if (!(league as any).emailDigestsEnabled) return;

    const allTeams = await storage.getTeamsByLeague(leagueId);
    const humanTeams = allTeams.filter(t => !t.isCpu);
    if (humanTeams.length === 0) return;

    const allCoaches = await storage.getCoachesByLeague(leagueId);
    const allStandings = await storage.getStandingsByLeague(leagueId, league.currentSeason);
    const standingsByTeam = new Map(allStandings.map(s => [s.teamId, s]));

    const rankedTeams = [...allTeams].sort((a, b) => {
      const sa = standingsByTeam.get(a.id);
      const sb = standingsByTeam.get(b.id);
      const wa = (sa?.wins ?? 0);
      const wb = (sb?.wins ?? 0);
      return wb - wa;
    });
    const rankMap = new Map(rankedTeams.map((t, i) => [t.id, i + 1]));

    for (const team of humanTeams) {
      const coach = allCoaches.find(c => c.teamId === team.id);
      if (!coach?.userId) continue;

      const user = await storage.getUser(coach.userId);
      if (!user?.email) continue;
      if ((user as any).emailOptOut) continue;

      const [teamGames, interests] = await Promise.all([
        storage.getGamesByTeam(team.id),
        storage.getRecruitingInterestsByTeam(team.id),
      ]);

      const thisWeekGames = teamGames.filter(
        g => g.season === league.currentSeason && g.week === league.currentWeek && g.isComplete,
      );

      const gameData = thisWeekGames.map(g => ({
        opponent: g.homeTeamId === team.id
          ? (allTeams.find(t => t.id === g.awayTeamId)?.abbreviation ?? "OPP")
          : (allTeams.find(t => t.id === g.homeTeamId)?.abbreviation ?? "OPP"),
        isHome: g.homeTeamId === team.id,
        homeScore: g.homeScore ?? 0,
        awayScore: g.awayScore ?? 0,
        isComplete: !!g.isComplete,
      }));

      const activeInterests = interests
        .filter(i => (i.interestLevel ?? 0) > 0)
        .sort((a, b) => (b.interestLevel ?? 0) - (a.interestLevel ?? 0));

      const recruitData: Array<{ name: string; position: string; stars: number; interest: number }> = [];
      for (const interest of activeInterests.slice(0, 5)) {
        const recruits = await storage.getRecruitsByLeague(leagueId);
        const recruit = recruits.find(r => r.id === interest.recruitId);
        if (recruit) {
          recruitData.push({
            name: `${recruit.firstName} ${recruit.lastName}`,
            position: recruit.position,
            stars: recruit.starRating ?? 3,
            interest: Math.round(interest.interestLevel ?? 0),
          });
        }
      }

      const standing = standingsByTeam.get(team.id);
      const wins = standing?.wins ?? 0;
      const losses = standing?.losses ?? 0;
      const rank = rankMap.get(team.id) ?? allTeams.length;

      const unsubToken = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");
      const unsubUrl = `${appBaseUrl}/api/users/unsubscribe?token=${unsubToken}`;

      const html = buildDigestHtml({
        coachName: `${coach.firstName} ${coach.lastName}`,
        leagueName: league.name,
        teamName: team.name,
        teamAbbr: team.abbreviation,
        season: league.currentSeason,
        week: league.currentWeek,
        phase: league.currentPhase,
        games: gameData,
        standingsRank: rank,
        totalTeams: allTeams.length,
        wins,
        losses,
        topRecruits: recruitData,
        unsubUrl,
      });

      const subject = `[${team.abbreviation}] Season ${league.currentSeason} Week ${league.currentWeek} Digest — ${league.name}`;
      await sendEmail(user.email, subject, html);
    }
  } catch (e) {
    console.error("[digest] Failed to send weekly digests:", e);
  }
}
