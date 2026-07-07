import type { ReadyStatusData } from "./types";
import { getEffectiveReady as sharedGetEffectiveReady, getReadyReason as sharedGetReadyReason, getReadyBlockReason as sharedGetReadyBlockReason } from "@/lib/ready-status";

// Format NIL budget values: ≥1M → "$X.XM", otherwise "$XK"
export function formatNil(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1000)}K`;
}

// Helper to get display name from user email/username
export function getDisplayName(user?: { email: string; username?: string | null } | null): string {
  if (!user) return "";
  if (user.username) return user.username;
  const emailPrefix = user.email.split("@")[0];
  // For guest accounts, show shortened version
  if (emailPrefix.startsWith("guest-")) {
    return "Guest";
  }
  return emailPrefix;
}

export function fmtKLeague(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export const STAR_COLORS: Record<number, string> = {
  1: "bg-gray-500",
  2: "bg-blue-500",
  3: "bg-green-500",
  4: "bg-yellow-500",
  5: "bg-orange-500",
};

export const STAR_TEXT_COLORS: Record<number, string> = {
  1: "text-gray-400",
  2: "text-blue-400",
  3: "text-green-400",
  4: "text-yellow-400",
  5: "text-orange-400",
};

export function percentileToGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C+";
  if (pct >= 40) return "C";
  if (pct >= 30) return "D+";
  if (pct >= 20) return "D";
  return "F";
}

export function attrToGrade(val: number): string {
  if (val >= 80) return "A+";
  if (val >= 72) return "A";
  if (val >= 65) return "B+";
  if (val >= 58) return "B";
  if (val >= 50) return "C+";
  if (val >= 42) return "C";
  if (val >= 35) return "D+";
  if (val >= 28) return "D";
  return "F";
}

export function starToGrade(stars: number): string {
  if (stars >= 4.5) return "A+";
  if (stars >= 4.0) return "A";
  if (stars >= 3.5) return "B+";
  if (stars >= 3.0) return "B";
  if (stars >= 2.5) return "C+";
  if (stars >= 2.0) return "C";
  if (stars >= 1.5) return "D+";
  return "F";
}

export function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-400";
  if (grade.startsWith("B")) return "text-blue-400";
  if (grade.startsWith("C")) return "text-yellow-400";
  if (grade.startsWith("D")) return "text-orange-400";
  return "text-red-400";
}

export function percentileLabel(pct: number): string {
  const fromTop = Math.max(1, 100 - pct);
  const fromBot = Math.max(1, pct);
  if (pct >= 50) return `Top ${fromTop}%`;
  return `Bottom ${fromBot}%`;
}

export function gradeColorLV(grade: string): string {
  if (grade.startsWith("A")) return "text-gold";
  if (grade.startsWith("B")) return "text-green-400";
  if (grade.startsWith("C")) return "text-yellow-400";
  if (grade === "D") return "text-orange-400";
  return "text-red-400";
}

export function getClassGrade(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.10) return "A+";
  if (pct <= 0.20) return "A";
  if (pct <= 0.30) return "A-";
  if (pct <= 0.40) return "B+";
  if (pct <= 0.55) return "B";
  if (pct <= 0.70) return "B-";
  if (pct <= 0.80) return "C+";
  if (pct <= 0.90) return "C";
  return "D";
}

export function getGradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "text-green-400";
  if (grade === "A-" || grade === "B+") return "text-lime-400";
  if (grade === "B") return "text-yellow-400";
  if (grade === "B-" || grade === "C+") return "text-orange-400";
  return "text-red-400";
}

export function getGradeBg(grade: string): string {
  if (grade === "A+" || grade === "A") return "bg-green-400/10 border-green-400/30";
  if (grade === "A-" || grade === "B+") return "bg-lime-400/10 border-lime-400/30";
  if (grade === "B") return "bg-yellow-400/10 border-yellow-400/30";
  if (grade === "B-" || grade === "C+") return "bg-orange-400/10 border-orange-400/30";
  return "bg-red-400/10 border-red-400/30";
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

export function getEffectiveReady(
  entry: ReadyStatusData["readyStatus"][0],
  phase: string
): boolean {
  return sharedGetEffectiveReady(entry, phase);
}

export function getReadyReason(
  entry: ReadyStatusData["readyStatus"][0],
  phase: string
): string | null {
  return sharedGetReadyReason(entry, phase);
}

export function getReadyBlockReason(
  entry: ReadyStatusData["readyStatus"][0],
  phase: string
): string | null {
  return sharedGetReadyBlockReason(entry, phase);
}

export function getRecentForm<T extends { id: string; week: number; isComplete: boolean; homeScore: number | null; awayScore: number | null; homeTeamId: string; awayTeamId: string }>(
  teamId: string,
  allGames: T[],
  beforeGame: T,
  limit = 5
): ("W" | "L")[] {
  const completed = allGames
    .filter(g => g.isComplete && g.homeScore != null && g.awayScore != null && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .filter(g => g.week < beforeGame.week || (g.week === beforeGame.week && g.id !== beforeGame.id))
    .sort((a, b) => a.week - b.week)
    .slice(-limit);
  return completed.map(g => {
    const isHome = g.homeTeamId === teamId;
    const teamScore = isHome ? g.homeScore! : g.awayScore!;
    const oppScore = isHome ? g.awayScore! : g.homeScore!;
    return teamScore > oppScore ? "W" : "L";
  });
}
