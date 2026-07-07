export const phaseLabels: Record<string, string> = {
  dynasty_setup: "Dynasty Setup",
  preseason: "Spring Training",
  spring_training: "Spring Training",
  regular_season: "Regular Season",
  conference_championship: "Conference Championship",
  super_regionals: "Super Regionals",
  cws: "College World Series",
  offseason: "Offseason",
  offseason_departures: "Player Departures",
  offseason_recruiting_1: "Offseason Recruiting (Wk 1)",
  offseason_recruiting_2: "Offseason Recruiting (Wk 2)",
  offseason_recruiting_3: "Offseason Recruiting (Wk 3)",
  offseason_recruiting_4: "Offseason Recruiting (Wk 4)",
  offseason_signing_day: "Decision Day",
  offseason_walkons: "Walk-Ons",
};

export const RECRUITING_PHASES = [
  "offseason_recruiting_1",
  "offseason_recruiting_2",
  "offseason_recruiting_3",
  "offseason_recruiting_4",
] as const;

export const difficultyOptions = [
  { value: "beginner", label: "Beginner", description: "CPU recruits poorly, fewer actions" },
  { value: "high_school", label: "High School", description: "Balanced recruiting, standard pace" },
  { value: "all_american", label: "All-American", description: "Aggressive CPU recruiting" },
  { value: "elite", label: "Elite", description: "Maximum CPU recruiting power" },
];

export const aggressionOptions = [
  { value: 1, label: "Conservative", description: "CPU offers late, easy to out-recruit" },
  { value: 2, label: "Cautious", description: "CPU moves carefully, slightly slower" },
  { value: 3, label: "Standard", description: "Default CPU recruiting pace" },
  { value: 4, label: "Aggressive", description: "CPU offers earlier, harder to sign recruits" },
  { value: 5, label: "Ultra", description: "CPU offers immediately, maximum competition" },
];

export const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
];

export function formatLastActivity(lastActivityAt: string | null): string {
  if (!lastActivityAt) return "No activity";
  const diff = Date.now() - new Date(lastActivityAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
