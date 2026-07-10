export interface CoachPerk {
  id: string;
  tree: "recruiting" | "scouting" | "development" | "game_management" | "culture";
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  effect: string;
  cost: number;
  requires?: string[];
}

export const COACH_PERKS: CoachPerk[] = [
  // ── Recruiting Tree ───────────────────────────────────────────────
  {
    id: "rec_hustler",
    tree: "recruiting",
    tier: 1,
    name: "Hustler",
    description: "Your relentless follow-up keeps your program top of mind.",
    effect: "+8% interest gain from emails and phone calls",
    cost: 1,
  },
  {
    id: "rec_campus_closer",
    tree: "recruiting",
    tier: 2,
    name: "Campus Closer",
    description: "When they step on your campus, they fall in love with your program.",
    effect: "Campus Visit and Head Coach Visit gains +15%",
    cost: 2,
    requires: ["rec_hustler"],
  },
  {
    id: "rec_elite_network",
    tree: "recruiting",
    tier: 3,
    name: "Elite Network",
    description: "Your connections open doors no other program can.",
    effect: "+1 Campus Visit and +1 Head Coach Visit available per season",
    cost: 3,
    requires: ["rec_campus_closer"],
  },

  // ── Scouting Tree ─────────────────────────────────────────────────
  {
    id: "scout_quick_study",
    tree: "scouting",
    tier: 1,
    name: "Quick Study",
    description: "Your staff processes film faster than anyone in the country.",
    effect: "+3 scouting actions available per week",
    cost: 1,
  },
  {
    id: "scout_hawk_eye",
    tree: "scouting",
    tier: 2,
    name: "Hawk Eye",
    description: "You see things in a player other scouts simply cannot.",
    effect: "Scouting actions reveal 25% more attribute progress per use",
    cost: 2,
    requires: ["scout_quick_study"],
  },
  {
    id: "scout_crystal_ball",
    tree: "scouting",
    tier: 3,
    name: "Crystal Ball",
    description: "Your instincts on generational talent are never wrong.",
    effect: "Generational Gems and Busts are identified 2 weeks earlier",
    cost: 3,
    requires: ["scout_hawk_eye"],
  },

  // ── Player Development Tree ────────────────────────────────────────
  {
    id: "dev_coach_eye",
    tree: "development",
    tier: 1,
    name: "Coach's Eye",
    description: "You put players in the right positions to improve every day.",
    effect: "Hitters and pitchers each have +3% chance of above-average progression",
    cost: 1,
  },
  {
    id: "dev_trainer",
    tree: "development",
    tier: 2,
    name: "Strength Trainer",
    description: "Your conditioning program is among the best in the country.",
    effect: "All players gain at least +1 OVR per offseason above the normal floor",
    cost: 2,
    requires: ["dev_coach_eye"],
  },
  {
    id: "dev_dynasty_maker",
    tree: "development",
    tier: 3,
    name: "Dynasty Maker",
    description: "Under your watch, the best players become legends.",
    effect: "Top 3 players on your roster have +10% breakthrough progression chance",
    cost: 3,
    requires: ["dev_trainer"],
  },

  // ── Game Management Tree ──────────────────────────────────────────
  {
    id: "gm_tactician",
    tree: "game_management",
    tier: 1,
    name: "Field Tactician",
    description: "Every win is a masterclass in preparation and adjustments.",
    effect: "+30 XP per win; +20 XP bonus per conference win",
    cost: 1,
  },
  {
    id: "gm_playoff_poise",
    tree: "game_management",
    tier: 2,
    name: "Playoff Poise",
    description: "The bright lights only make your coaching sharper.",
    effect: "+150 XP for each postseason milestone reached",
    cost: 2,
    requires: ["gm_tactician"],
  },
  {
    id: "gm_legendary",
    tree: "game_management",
    tier: 3,
    name: "Legendary",
    description: "Your CWS runs become the stories that define a generation.",
    effect: "+300 XP for CWS appearances; each conference championship awards 1 bonus Skill Point",
    cost: 3,
    requires: ["gm_playoff_poise"],
  },

  // ── Culture / Retention Tree ──────────────────────────────────────
  {
    id: "cult_locker_room",
    tree: "culture",
    tier: 1,
    name: "Locker Room Leader",
    description: "Players choose your program over the portal. Culture wins.",
    effect: "Transfer portal exit chance reduced by 10% per player",
    cost: 1,
  },
  {
    id: "cult_loyalty",
    tree: "culture",
    tier: 2,
    name: "Loyalty Builder",
    description: "Every player you retain is a statement about what you've built.",
    effect: "+75 XP for each portal player you successfully retain",
    cost: 2,
    requires: ["cult_locker_room"],
  },
  {
    id: "cult_dynasty",
    tree: "culture",
    tier: 3,
    name: "True Dynasty",
    description: "Players know finishing here means something. The portal doesn't tempt them.",
    effect: "One player per offseason is automatically retained from the portal",
    cost: 3,
    requires: ["cult_loyalty"],
  },
];

export const PERK_TREE_META: Record<
  string,
  { name: string; color: string; bgColor: string; borderColor: string; description: string }
> = {
  recruiting: {
    name: "Recruiting",
    color: "text-amber-400",
    bgColor: "bg-amber-900/30",
    borderColor: "border-amber-600/60",
    description: "Master the art of landing elite talent",
  },
  scouting: {
    name: "Scouting",
    color: "text-emerald-400",
    bgColor: "bg-emerald-900/30",
    borderColor: "border-emerald-600/60",
    description: "See what others miss in evaluation",
  },
  development: {
    name: "Development",
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-600/60",
    description: "Turn raw talent into finished products",
  },
  game_management: {
    name: "Game Mgmt",
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-600/60",
    description: "Win more and win bigger",
  },
  culture: {
    name: "Culture",
    color: "text-rose-400",
    bgColor: "bg-rose-900/30",
    borderColor: "border-rose-600/60",
    description: "Build a program players never leave",
  },
};

export const PERK_TREE_ORDER = [
  "recruiting",
  "scouting",
  "development",
  "game_management",
  "culture",
] as const;

export function getPerksByTree(tree: string): CoachPerk[] {
  return COACH_PERKS.filter(p => p.tree === tree).sort((a, b) => a.tier - b.tier);
}

export function getCoachPerks(
  coach: { perks?: Record<string, boolean> | null | unknown },
): Set<string> {
  const perks = coach.perks as Record<string, boolean> | null | undefined;
  if (!perks) return new Set();
  return new Set(
    Object.entries(perks)
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  );
}

export function hasPerk(
  coach: { perks?: Record<string, boolean> | null | unknown },
  perkId: string,
): boolean {
  return getCoachPerks(coach).has(perkId);
}

export function canUnlockPerk(
  coach: {
    perks?: Record<string, boolean> | null | unknown;
    skillPoints?: number | null;
  },
  perkId: string,
): { ok: boolean; reason?: string } {
  const perk = COACH_PERKS.find(p => p.id === perkId);
  if (!perk) return { ok: false, reason: "Unknown perk" };

  const owned = getCoachPerks(coach);
  if (owned.has(perkId)) return { ok: false, reason: "Already unlocked" };

  const sp = coach.skillPoints ?? 0;
  if (sp < perk.cost) {
    return { ok: false, reason: `Need ${perk.cost} Skill Point${perk.cost > 1 ? "s" : ""} (have ${sp})` };
  }

  for (const req of perk.requires ?? []) {
    if (!owned.has(req)) {
      const reqPerk = COACH_PERKS.find(p => p.id === req);
      return { ok: false, reason: `Requires: ${reqPerk?.name ?? req}` };
    }
  }

  return { ok: true };
}

// XP award constants — used in multiple backend locations
export const XP_AWARDS = {
  WIN: 80,
  LOSS: 20,
  // gm_tactician adds these on top of base WIN
  TACTICIAN_WIN_BONUS: 30,
  TACTICIAN_CONF_BONUS: 20,
  // postseason milestones (base, before perk multiplier)
  CONF_CHAMP: 200,
  SR_ADVANCE: 200,
  CWS_APPEARANCE: 300,
  CWS_WIN: 500,
  // gm_playoff_poise adds this to any postseason milestone
  PLAYOFF_POISE_BONUS: 150,
  // gm_legendary adds this to CWS appearance (stacks with PLAYOFF_POISE)
  LEGENDARY_CWS_BONUS: 300,
  // signing recruits
  SIGN_BY_STAR: [0, 40, 65, 100, 175, 275] as const, // index = star rank (1-5)
  SIGN_BLUE_CHIP: 400,
  // development/draft/retention
  PLAYER_IMPROVED: 20,
  DRAFT_PICK: 120,
  RETENTION: 50,
  RETENTION_LOYALTY_BONUS: 25, // cult_loyalty adds this
} as const;
