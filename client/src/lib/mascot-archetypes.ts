export type MascotArchetype =
  | "feline"
  | "canine"
  | "raptor"
  | "bear"
  | "warrior"
  | "reptile"
  | "bovine"
  | "insect"
  | "nautical"
  | "abstract";

/**
 * Ordered keyword → archetype table.
 * Multi-word / more-specific entries come first to prevent partial matches
 * (e.g. "bulldog" before "bull", "wolverine" before "wolf").
 */
const KEYWORD_MAP: Array<[string, MascotArchetype]> = [
  // ── multi-word compound phrases (most specific first) ─────────────────────
  ["fighting irish", "warrior"],
  ["fighting illini", "warrior"],
  ["yellow jacket", "insect"],
  ["demon deacon", "warrior"],
  ["blue devil", "warrior"],
  ["sun devil", "warrior"],
  ["tar heel", "warrior"],
  ["horned frog", "reptile"],
  ["crimson tide", "nautical"],
  ["scarlet knight", "warrior"],
  ["golden gopher", "abstract"],
  ["golden eagle", "raptor"],
  ["golden bear", "bear"],
  ["red raider", "warrior"],
  ["nittany lion", "feline"],
  ["mean green", "abstract"],
  ["big red", "abstract"],
  ["ragin cajun", "warrior"],
  ["thunder herd", "bovine"],
  ["thundering herd", "bovine"],
  ["purple ace", "abstract"],
  ["black knight", "warrior"],
  // ── longer compound-style words before shorter substrings ──────────────────
  ["bulldog", "canine"],
  ["wolverine", "canine"],
  ["wolfpack", "canine"],
  ["razorback", "bovine"],
  ["longhorn", "bovine"],
  ["catamount", "feline"],
  ["jayhawk", "raptor"],
  ["hawkeye", "raptor"],
  ["gamecock", "raptor"],
  ["roadrunner", "raptor"],
  ["bearcat", "bear"],
  ["warhawk", "raptor"],
  ["chanticleer", "raptor"],
  ["mountaineer", "warrior"],
  ["boilermaker", "abstract"],
  ["cornhusker", "warrior"],
  ["lumberjack", "warrior"],
  ["highlander", "warrior"],
  ["minuteman", "warrior"],
  ["buccaneer", "warrior"],
  ["musketeer", "warrior"],
  ["crusader", "warrior"],
  ["seminole", "warrior"],
  ["cavalier", "warrior"],
  ["commodore", "warrior"],
  ["anteater", "abstract"],
  ["sycamore", "abstract"],
  ["hoosier", "abstract"],
  ["buckeye", "abstract"],
  ["cyclone", "nautical"],
  ["hurricane", "nautical"],
  ["mariner", "nautical"],
  ["midshipman", "nautical"],
  ["leatherneck", "warrior"],
  ["dirtbag", "abstract"],
  ["shocker", "abstract"],
  ["49er", "warrior"],
  ["bronco", "bovine"],
  ["mustang", "bovine"],
  ["bison", "bovine"],
  ["buffalo", "bovine"],
  ["torero", "warrior"],
  ["titan", "warrior"],
  ["trojan", "warrior"],
  ["spartan", "warrior"],
  ["patriot", "warrior"],
  ["pioneer", "warrior"],
  ["ranger", "warrior"],
  ["raider", "warrior"],
  ["pirate", "warrior"],
  ["corsair", "nautical"],
  ["pilot", "nautical"],
  ["monarch", "raptor"],
  ["flyer", "raptor"],
  ["peacock", "raptor"],
  ["bluejay", "raptor"],
  ["phoenix", "raptor"],
  ["osprey", "raptor"],
  ["penguin", "raptor"],
  // ── single-word ───────────────────────────────────────────────────────────
  // Feline
  ["jaguar", "feline"],
  ["tiger", "feline"],
  ["wildcat", "feline"],
  ["panther", "feline"],
  ["cougar", "feline"],
  ["bobcat", "feline"],
  ["lynx", "feline"],
  ["lion", "feline"],
  // Canine
  ["saluki", "canine"],
  ["retriever", "canine"],
  ["husky", "canine"],
  ["huskie", "canine"],
  ["terrier", "canine"],
  ["wolf", "canine"],
  ["coyote", "canine"],
  ["lobo", "canine"],
  // Raptor / Bird
  ["eagle", "raptor"],
  ["falcon", "raptor"],
  ["hawk", "raptor"],
  ["owl", "raptor"],
  ["cardinal", "raptor"],
  ["duck", "raptor"],
  ["pelican", "raptor"],
  ["hokie", "raptor"],
  ["raven", "raptor"],
  ["mockingbird", "raptor"],
  ["redbird", "raptor"],
  ["heron", "raptor"],
  // Bear
  ["badger", "bear"],
  ["beaver", "bear"],
  ["bear", "bear"],
  ["grizzly", "bear"],
  ["bruin", "bear"],
  // Warrior / Human
  ["warrior", "warrior"],
  ["knight", "warrior"],
  ["cowboy", "warrior"],
  ["aggie", "warrior"],
  ["sooner", "warrior"],
  ["volunteer", "warrior"],
  ["rebel", "warrior"],
  ["brave", "warrior"],
  ["aztec", "warrior"],
  ["gael", "warrior"],
  ["friar", "warrior"],
  ["quaker", "warrior"],
  ["matador", "warrior"],
  ["blazer", "warrior"],
  ["ute", "warrior"],
  ["duke", "warrior"],
  ["don", "warrior"],
  ["illini", "warrior"],
  // Reptile
  ["rattler", "reptile"],
  ["gator", "reptile"],
  ["alligator", "reptile"],
  ["terrapin", "reptile"],
  ["frog", "reptile"],
  ["lizard", "reptile"],
  ["gecko", "reptile"],
  ["tortoise", "reptile"],
  // Bovine / Livestock
  ["ram", "bovine"],
  ["bull", "bovine"],
  ["steer", "bovine"],
  ["herd", "bovine"],
  // Insect
  ["hornet", "insect"],
  ["wasp", "insect"],
  ["beetle", "insect"],
  ["yellowjacket", "insect"],
  // Nautical
  ["tide", "nautical"],
  ["wave", "nautical"],
  ["seawolf", "nautical"],
  // Abstract / catch-all
  ["flame", "abstract"],
  ["beacon", "abstract"],
  ["ace", "abstract"],
  ["orange", "abstract"],
  ["crimson", "abstract"],
  ["gopher", "abstract"],
];

export function getMascotArchetype(teamName: string): MascotArchetype | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();
  for (const [keyword, archetype] of KEYWORD_MAP) {
    if (lower.includes(keyword)) return archetype;
  }
  return null;
}
