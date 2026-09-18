import campus from '@/assets/art/varsity-campus.png';

// One continuous approved campus plate establishes place across the game.
// Context is supplied by live page copy, never baked into the artwork.
const campusScene = (focalPoint = 'center 60%') => ({ desktop: campus, mobile: campus,
  alt: 'Miniature college campus and baseball field at golden hour', focalPoint });
export const artBackgrounds = {
  leagueWarRoom: campusScene(), recruiting: campusScene('25% 50%'),
  recruitProfile: campusScene('75% 65%'), scheduleDay: campusScene('75% 65%'),
  scheduleNight: campusScene('75% 65%'), reporting: campusScene('75% 75%'),
  commissioner: campusScene('20% 60%'), stats: campusScene('20% 70%'),
  postseason: campusScene('75% 65%'), offseason: campusScene('20% 55%'),
};
export type LeagueHubBannerKey = 'springTraining' | 'regularSeason' | 'conferenceChampionship' | 'superRegionals' | 'collegeWorldSeries' | 'offseason';
const banner = { src: campus, alt: artBackgrounds.leagueWarRoom.alt, desktopPosition: 'center 57%', mobilePosition: '65% 60%' };
export const LEAGUE_HUB_BANNERS: Record<LeagueHubBannerKey, typeof banner> = {
  springTraining: banner, regularSeason: banner, conferenceChampionship: banner,
  superRegionals: banner, collegeWorldSeries: banner, offseason: banner,
};
export function getLeagueHubBannerKey(phase: string, _week: number): LeagueHubBannerKey {
  const p = phase.toLowerCase();
  if (p === 'cws') return 'collegeWorldSeries';
  if (p === 'super_regionals') return 'superRegionals';
  if (p === 'conference_championship') return 'conferenceChampionship';
  if (p === 'regular_season') return 'regularSeason';
  if (p.startsWith('offseason') || p === 'dynasty_setup') return 'offseason';
  return 'springTraining';
}

// Quiet editorial emblems for story categories. These identify the category,
// not a fictional depiction of the event or an unearned award.
const emblem = (paths: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#17392f"/><path d="M0 330L460 0h180v360H0Z" fill="#214b3e"/><circle cx="320" cy="180" r="100" fill="#102c25" stroke="#c5ab71" stroke-width="2"/><g transform="translate(272 132)" fill="none" stroke="#e8ddbf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`);
const home = emblem('<path d="M12 44L48 14l36 30M22 39v43h52V39M40 82V58h16v24"/>');
const book = emblem('<path d="M48 24Q29 12 12 22v55q20-10 36 0 16-10 36 0V22Q66 12 48 24v53"/>');
const people = emblem('<circle cx="34" cy="30" r="12"/><circle cx="68" cy="36" r="10"/><path d="M10 78V65q0-18 24-18t24 18v13M61 54q23 0 23 20v4"/>');
const field = emblem('<path d="M48 12L86 50 48 88 10 50ZM48 50L66 68 48 86 30 68Z"/><circle cx="48" cy="66" r="3"/>');
const health = emblem('<path d="M36 16h24v20h20v24H60v20H36V60H16V36h20Z"/>');
const travel = emblem('<path d="M14 75h68M24 68V35h48v33M38 35V23h20v12M38 46v11M58 46v11"/>');
const change = emblem('<path d="M16 30h62L65 17M78 30L65 43M80 66H18l13-13M18 66l13 13"/>');
export const storylineArt: Record<string, string> = {
  personal: home, work_ethic: home, academics: book, eligibility: book,
  family: people, mentor: people, showcase: field, travel_ball: travel,
  scouting: field, rating_reveal: field, injury: health, recovery: health,
  position_change: change, exit: travel, leaves_pool: travel, default: field,
};
export function getStorylineArt(type: string): string { return storylineArt[type] ?? storylineArt.default; }
