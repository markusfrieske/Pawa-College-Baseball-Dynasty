import warRoomDesktop from "@assets/War_Room_Dekstop_1783727749986.png";
import warRoomMobile from "@assets/War_Room_Mobile_1783727756882.png";
import recruitingDesktop from "@assets/Recruiting_Desktop_1783727759422.png";
import recruitingMobile from "@assets/Recruiting_Mobile_1783727762233.png";
import recruitProfileField from "@assets/Recruit_Profile_page_1783727765031.png";
import opponentPreviewDay from "@assets/Opponent_Preview_1783727767428.png";
import opponentPreviewNight from "@assets/Opponent_Preview_Night_1783727769652.png";
import reportingDesktop from "@assets/Game_Reporting_Desktop_1783727771864.png";
import reportingMobile from "@assets/Game_Reporting_Mobile_1783727774568.png";
import commissionerCenter from "@assets/Commissioner_Command_Center_1783727776490.png";
import statsArchive from "@assets/Stats_Record_Book_and_History_1783727778819.png";
import postseasonChampionship from "@assets/Postseason_championship_1783727780827.png";
import offseasonPlanningRoom from "@assets/Pffseason_and_recruiting_class_creator_1783727783289.png";

import storyDormRoom from "@assets/Dorm_Room_1783727785289.png";
import storyClassroom from "@assets/Classroom_1783727787423.png";
import storyRestaurant from "@assets/Restaraunt_1783727822213.png";
import storyBeach from "@assets/Beach_1783727824561.png";
import storyTrainingField from "@assets/Training_1783727833771.png";
import storyInjury from "@assets/Injury_1783727840047.png";
import storyPositionChange from "@assets/Position_Change_1783727847021.png";
import storyLeavesPool from "@assets/Player_leaves_recruit_pool_1783727852320.png";

export const artBackgrounds = {
  leagueWarRoom: {
    desktop: warRoomDesktop,
    mobile: warRoomMobile,
    alt: "Coach war room with baseball planning board and laptop",
    focalPoint: "center center",
  },
  recruiting: {
    desktop: recruitingDesktop,
    mobile: recruitingMobile,
    alt: "Recruiting classroom with baseball diagrams on chalkboard",
    focalPoint: "center top",
  },
  recruitProfile: {
    desktop: recruitProfileField,
    mobile: recruitProfileField,
    alt: "Baseball training field at sunset",
    focalPoint: "center center",
  },
  scheduleDay: {
    desktop: opponentPreviewDay,
    mobile: opponentPreviewDay,
    alt: "College baseball field during the day",
    focalPoint: "center bottom",
  },
  scheduleNight: {
    desktop: opponentPreviewNight,
    mobile: opponentPreviewNight,
    alt: "College baseball stadium lit up at night",
    focalPoint: "center bottom",
  },
  reporting: {
    desktop: reportingDesktop,
    mobile: reportingMobile,
    alt: "Scorekeeper desk with laptop and baseball scoresheets",
    focalPoint: "center center",
  },
  commissioner: {
    desktop: commissionerCenter,
    mobile: commissionerCenter,
    alt: "Commissioner command center with bracket whiteboard and pennants",
    focalPoint: "center center",
  },
  stats: {
    desktop: statsArchive,
    mobile: statsArchive,
    alt: "Baseball trophy room and records archive",
    focalPoint: "left center",
  },
  postseason: {
    desktop: postseasonChampionship,
    mobile: postseasonChampionship,
    alt: "Championship trophy on baseball field at sunset",
    focalPoint: "center center",
  },
  offseason: {
    desktop: offseasonPlanningRoom,
    mobile: offseasonPlanningRoom,
    alt: "Baseball team meeting room with whiteboard and conference table",
    focalPoint: "center center",
  },
};

// ─── League Hub Seasonal Banners ────────────────────────────────────────────

export type LeagueHubBannerKey =
  | "springTraining"
  | "regularSeason"
  | "conferenceChampionship"
  | "superRegionals"
  | "collegeWorldSeries"
  | "offseason";

export const LEAGUE_HUB_BANNERS: Record<
  LeagueHubBannerKey,
  { src: string; alt: string; desktopPosition: string; mobilePosition: string }
> = {
  springTraining: {
    src: "/images/league-hub-banners/league-hub-banner-spring-training-v1.png",
    alt: "Spring training coach office overlooking a baseball stadium",
    desktopPosition: "center 48%",
    mobilePosition: "center 50%",
  },
  regularSeason: {
    src: "/images/league-hub-banners/league-hub-banner-week-1-5-friday-night-v1.png",
    alt: "Friday night college baseball stadium under the lights",
    desktopPosition: "center 48%",
    mobilePosition: "center 50%",
  },
  conferenceChampionship: {
    src: "/images/league-hub-banners/league-hub-banner-conference-championship-trophy-room-v1.png",
    alt: "Conference championship trophy room",
    desktopPosition: "42% 50%",
    mobilePosition: "45% 50%",
  },
  superRegionals: {
    src: "/images/league-hub-banners/league-hub-banner-super-regionals-press-conference-v1.png",
    alt: "Super Regionals press conference podium with camera flashes",
    desktopPosition: "center 50%",
    mobilePosition: "48% 50%",
  },
  collegeWorldSeries: {
    src: "/images/league-hub-banners/league-hub-banner-college-world-series-omaha-aerial-v1.png",
    alt: "College World Series championship stadium aerial",
    desktopPosition: "center 48%",
    mobilePosition: "center 50%",
  },
  offseason: {
    src: "/images/league-hub-banners/league-hub-banner-offseason-board-room-v1.png",
    alt: "Offseason baseball operations board room with depth charts",
    desktopPosition: "center 50%",
    mobilePosition: "center 50%",
  },
} as const;

export function getLeagueHubBannerKey(phase: string, week: number): LeagueHubBannerKey {
  const p = phase.toLowerCase();

  if (p === "cws") return "collegeWorldSeries";
  if (p === "super_regionals") return "superRegionals";
  if (p === "conference_championship") return "conferenceChampionship";
  if (p === "regular_season") return "regularSeason";
  if (p === "preseason" || p === "spring_training") return "springTraining";
  if (p.startsWith("offseason") || p === "dynasty_setup") return "offseason";

  return "springTraining";
}

export const storylineArt: Record<string, string> = {
  personal: storyDormRoom,
  work_ethic: storyDormRoom,
  academics: storyClassroom,
  eligibility: storyClassroom,
  family: storyRestaurant,
  mentor: storyRestaurant,
  showcase: storyBeach,
  travel_ball: storyBeach,
  scouting: storyTrainingField,
  rating_reveal: storyTrainingField,
  injury: storyInjury,
  recovery: storyInjury,
  position_change: storyPositionChange,
  exit: storyLeavesPool,
  leaves_pool: storyLeavesPool,
  default: storyTrainingField,
};

export function getStorylineArt(type: string): string {
  return storylineArt[type] ?? storylineArt.default;
}
