import crypto from "crypto";
import { sendEmail } from "./email";
import type { IStorage } from "./storage";

// Fail closed if SESSION_SECRET is not configured — no signed tokens without it.
const HMAC_SECRET = process.env.SESSION_SECRET;

export function signUnsubToken(userId: string): string | null {
  if (!HMAC_SECRET) return null;
  const day = Math.floor(Date.now() / 86400000);
  const payload = `${userId}:${day}`;
  const sig = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("base64url");
  return Buffer.from(JSON.stringify({ userId, sig, day })).toString("base64url");
}

export function verifyUnsubToken(token: string): string | null {
  if (!HMAC_SECRET) return null;
  try {
    const { userId, sig, day } = JSON.parse(Buffer.from(token, "base64url").toString());
    if (!userId || !sig || day == null) return null;
    // Accept tokens up to 30 days old to handle emails sitting in inboxes
    const now = Math.floor(Date.now() / 86400000);
    if (now - day > 30) return null;
    const payload = `${userId}:${day}`;
    const expected = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "base64url"), Buffer.from(expected, "base64url"))) return null;
    return userId;
  } catch {
    return null;
  }
}

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
  topRecruits: Array<{ name: string; position: string; stars: number; interest: number; weeklyGain: number }>;
  unsubUrl: string | null;
  appBaseUrl: string;
}): string {
  const { coachName, leagueName, teamName, teamAbbr, season, week, phase, games, standingsRank, totalTeams, wins, losses, topRecruits, unsubUrl, appBaseUrl } = opts;

  const gameRows = games.length === 0
    ? `<tr><td colspan="3" style="padding:12px;text-align:center;color:#8aaa8a;">No games this week</td></tr>`
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
    ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#8aaa8a;">No active recruits</td></tr>`
    : topRecruits.slice(0, 5).map(r => {
        const interestColor = r.interest >= 70 ? "#FFD700" : r.interest >= 40 ? "#88cc88" : "#8aaa8a";
        const gainStr = r.weeklyGain > 0 ? `<span style="color:#88cc88;font-size:10px;">+${r.weeklyGain}%</span>` : "";
        return `<tr>
          <td style="padding:8px 12px;color:#d4d4aa;">${r.name}</td>
          <td style="padding:8px 12px;text-align:center;color:#aac8aa;">${r.position} · ${starStr(r.stars)}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:bold;color:${interestColor};">${r.interest}%</td>
          <td style="padding:8px 12px;text-align:center;">${gainStr}</td>
        </tr>`;
      }).join("");

  const rankOrdinal = standingsRank === 1 ? "1st" : standingsRank === 2 ? "2nd" : standingsRank === 3 ? "3rd" : `${standingsRank}th`;

  const unsubLine = unsubUrl
    ? `<p style="margin:8px 0 0;font-size:11px;"><a href="${unsubUrl}" style="color:#8aaa8a;text-decoration:underline;">Unsubscribe from digest emails</a></p>`
    : `<p style="margin:8px 0 0;font-size:11px;color:#5a7a5a;">To unsubscribe, visit your coach profile settings.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>College Baseball Dynasty — Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background:#0a1a0a;font-family:'Courier New',Courier,monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1a0a;padding:32px 0;">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#0d2010;border:2px solid #FFD700;border-radius:4px 4px 0 0;padding:24px 28px;text-align:center;">
          <div style="font-size:11px;letter-spacing:3px;color:#FFD700;text-transform:uppercase;margin-bottom:8px;">⚾ College Baseball Dynasty</div>
          <h1 style="margin:0;font-size:20px;color:#FFD700;letter-spacing:1px;">${teamAbbr} Weekly Digest</h1>
          <p style="margin:8px 0 0;font-size:12px;color:#8aaa8a;">${phaseLabel(phase)} · Season ${season} · Week ${week}</p>
        </td>
      </tr>

      <!-- Greeting -->
      <tr>
        <td style="background:#0a1a0a;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:20px 28px;">
          <p style="margin:0;color:#c8c8a8;font-size:13px;">Coach <strong style="color:#FFD700;">${coachName}</strong>,</p>
          <p style="margin:8px 0 0;color:#8aaa8a;font-size:12px;">Here's your summary for <strong style="color:#c8c8a8;">${teamName}</strong> after this week's advance.</p>
        </td>
      </tr>

      <!-- Standings -->
      <tr>
        <td style="background:#0d1a0d;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:16px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#FFD700;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding-bottom:10px;">Standings</td>
            </tr>
            <tr>
              <td style="color:#d4d4aa;font-size:24px;font-weight:bold;">${rankOrdinal} <span style="font-size:14px;color:#8aaa8a;">of ${totalTeams} teams</span></td>
              <td style="text-align:right;color:#aac8aa;font-size:18px;font-weight:bold;">${wins}–${losses}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- This Week's Games -->
      <tr>
        <td style="background:#0a1a0a;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:16px 28px 0;">
          <p style="margin:0 0 10px;color:#FFD700;font-size:11px;letter-spacing:2px;text-transform:uppercase;">This Week's Results</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid #1e3a1e;">
                <th style="padding:6px 12px;text-align:left;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">OPPONENT</th>
                <th style="padding:6px 12px;text-align:center;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">RESULT</th>
                <th style="padding:6px 12px;text-align:center;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">SCORE</th>
              </tr>
            </thead>
            <tbody>${gameRows}</tbody>
          </table>
        </td>
      </tr>

      <!-- Top Recruits -->
      <tr>
        <td style="background:#0a1a0a;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:16px 28px 0;">
          <p style="margin:0 0 4px;color:#FFD700;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Top Recruiting Targets</p>
          <p style="margin:0 0 10px;color:#5a7a5a;font-size:10px;">Sorted by current interest · weekly gain shown in green</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid #1e3a1e;">
                <th style="padding:6px 12px;text-align:left;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">RECRUIT</th>
                <th style="padding:6px 12px;text-align:center;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">POS / STARS</th>
                <th style="padding:6px 12px;text-align:center;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">INTEREST</th>
                <th style="padding:6px 12px;text-align:center;color:#5a7a5a;font-size:10px;font-weight:normal;letter-spacing:1px;">THIS WEEK</th>
              </tr>
            </thead>
            <tbody>${recruitRows}</tbody>
          </table>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="background:#0a1a0a;border-left:2px solid #FFD700;border-right:2px solid #FFD700;padding:20px 28px;text-align:center;">
          <a href="${appBaseUrl}" style="display:inline-block;background:#FFD700;color:#0a1a0a;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:10px 28px;border-radius:3px;">Open Dynasty</a>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#0a1a0a;border:2px solid #FFD700;border-top:none;border-radius:0 0 4px 4px;padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#5a7a5a;">
            You're receiving this because you're a coach in <strong style="color:#8aaa8a;">${leagueName}</strong>.
          </p>
          ${unsubLine}
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
  completedSeason: number,
  completedWeek: number,
  completedPhase: string,
  appBaseUrl: string = process.env.APP_BASE_URL || "https://collegebaseballdynasty.replit.app",
): Promise<void> {
  try {
    const league = await storage.getLeague(leagueId);
    if (!league) return;
    if (!league.emailDigestsEnabled) return;

    const allTeams = await storage.getTeamsByLeague(leagueId);
    const humanTeams = allTeams.filter(t => !t.isCpu);
    if (humanTeams.length === 0) return;

    const allCoaches = await storage.getCoachesByLeague(leagueId);
    const allStandings = await storage.getStandingsByLeague(leagueId, completedSeason);
    const standingsByTeam = new Map(allStandings.map(s => [s.teamId, s]));

    const rankedTeams = [...allTeams].sort((a, b) => {
      const wa = standingsByTeam.get(a.id)?.wins ?? 0;
      const wb = standingsByTeam.get(b.id)?.wins ?? 0;
      return wb - wa;
    });
    const rankMap = new Map(rankedTeams.map((t, i) => [t.id, i + 1]));

    // Hoist recruit list fetch outside per-team loop (avoids N+1 queries)
    const allRecruits = await storage.getRecruitsByLeague(leagueId);
    const recruitById = new Map(allRecruits.map(r => [r.id, r]));

    // Fetch this week's recruiting actions log once for the whole league
    const weekActions = await storage.getRecruitingActionsLogByLeagueWeek(leagueId, completedSeason, completedWeek);

    // Build a map: teamId -> recruitId -> total interestChange this week
    const weeklyGainByTeamRecruit = new Map<string, Map<string, number>>();
    for (const action of weekActions) {
      if (!weeklyGainByTeamRecruit.has(action.teamId)) {
        weeklyGainByTeamRecruit.set(action.teamId, new Map());
      }
      const teamMap = weeklyGainByTeamRecruit.get(action.teamId)!;
      teamMap.set(action.recruitId, (teamMap.get(action.recruitId) ?? 0) + action.interestChange);
    }

    for (const team of humanTeams) {
      const coach = allCoaches.find(c => c.teamId === team.id);
      if (!coach?.userId) continue;

      const user = await storage.getUser(coach.userId);
      if (!user?.email) continue;
      if (user.emailOptOut) continue;

      const [teamGames, interests] = await Promise.all([
        storage.getGamesByTeam(team.id),
        storage.getRecruitingInterestsByTeam(team.id),
      ]);

      // Use the completed week's games (before week increment)
      const thisWeekGames = teamGames.filter(
        g => g.season === completedSeason && g.week === completedWeek && g.isComplete,
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

      // Top recruits sorted by current interest level; include weekly gain delta from actions log
      const teamWeekGains = weeklyGainByTeamRecruit.get(team.id) ?? new Map<string, number>();
      const topInterests = [...interests]
        .filter(i => (i.interestLevel ?? 0) > 0)
        .sort((a, b) => (b.interestLevel ?? 0) - (a.interestLevel ?? 0))
        .slice(0, 5);

      const recruitData = topInterests
        .map(i => {
          const recruit = recruitById.get(i.recruitId);
          if (!recruit) return null;
          const weeklyGain = Math.max(0, Math.round(teamWeekGains.get(i.recruitId) ?? 0));
          return {
            name: `${recruit.firstName} ${recruit.lastName}`,
            position: recruit.position,
            stars: recruit.starRating ?? 3,
            interest: Math.round(i.interestLevel ?? 0),
            weeklyGain,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const standing = standingsByTeam.get(team.id);
      const wins = standing?.wins ?? 0;
      const losses = standing?.losses ?? 0;
      const rank = rankMap.get(team.id) ?? allTeams.length;

      const token = signUnsubToken(user.id);
      const unsubUrl = token ? `${appBaseUrl}/api/users/unsubscribe?token=${token}` : null;

      const html = buildDigestHtml({
        coachName: `${coach.firstName} ${coach.lastName}`,
        leagueName: league.name,
        teamName: team.name,
        teamAbbr: team.abbreviation,
        season: completedSeason,
        week: completedWeek,
        phase: completedPhase,
        games: gameData,
        standingsRank: rank,
        totalTeams: allTeams.length,
        wins,
        losses,
        topRecruits: recruitData,
        unsubUrl,
        appBaseUrl,
      });

      const subject = `[${team.abbreviation}] Season ${completedSeason} Week ${completedWeek} Digest — ${league.name}`;
      await sendEmail(user.email, subject, html);
    }
  } catch (e) {
    console.error("[digest] Failed to send weekly digests:", e);
  }
}
