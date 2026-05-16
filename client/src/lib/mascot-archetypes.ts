export type MascotArchetype =
  | "tiger"
  | "wildcat"
  | "panther"
  | "lion"
  | "cougar"
  | "bulldog"
  | "wolf"
  | "husky"
  | "wolverine"
  | "eagle"
  | "hawk"
  | "owl"
  | "gamecock"
  | "cardinal_bird"
  | "duck"
  | "falcon"
  | "bear"
  | "badger"
  | "beaver"
  | "knight_spartan"
  | "cowboy"
  | "native_warrior"
  | "pirate"
  | "mountaineer"
  | "longhorn"
  | "ram_mustang"
  | "bison_buffalo"
  | "razorback"
  | "horned_frog"
  | "gator"
  | "terrapin"
  | "rattler"
  | "insect"
  | "nautical"
  | "anteater"
  | "abstract";

/**
 * Ordered keyword → archetype table.
 * Multi-word / more-specific entries come first to prevent partial matches
 * (e.g. "bulldog" before "bull", "wolverine" before "wolf").
 */
const KEYWORD_MAP: Array<[string, MascotArchetype]> = [
  // multi-word compound phrases (most specific first)
  ["fighting irish",   "knight_spartan"],
  ["fighting illini",  "native_warrior"],
  ["yellow jacket",    "insect"],
  ["demon deacon",     "knight_spartan"],
  ["blue devil",       "knight_spartan"],
  ["sun devil",        "knight_spartan"],
  ["tar heel",         "abstract"],
  ["horned frog",      "horned_frog"],
  ["crimson tide",     "nautical"],
  ["scarlet knight",   "knight_spartan"],
  ["golden gopher",    "abstract"],
  ["golden eagle",     "eagle"],
  ["golden bear",      "bear"],
  ["red raider",       "cowboy"],
  ["nittany lion",     "lion"],
  ["mean green",       "abstract"],
  ["big red",          "abstract"],
  ["big green",        "abstract"],
  ["ragin cajun",      "abstract"],
  ["thunder herd",     "bison_buffalo"],
  ["thundering herd",  "bison_buffalo"],
  ["purple ace",       "abstract"],
  ["black knight",     "knight_spartan"],
  // longer compound-style words before shorter substrings
  ["bulldog",          "bulldog"],
  ["wolverine",        "wolverine"],
  ["wolfpack",         "wolf"],
  ["wolves",           "wolf"],
  ["razorback",        "razorback"],
  ["longhorn",         "longhorn"],
  ["catamount",        "cougar"],
  ["jayhawk",          "hawk"],
  ["hawkeye",          "hawk"],
  ["gamecock",         "gamecock"],
  ["roadrunner",       "gamecock"],
  ["racer",            "ram_mustang"],
  ["bearcat",          "bear"],
  ["warhawk",          "hawk"],
  ["chanticleer",      "gamecock"],
  ["mountaineer",      "mountaineer"],
  ["boilermaker",      "abstract"],
  ["cornhusker",       "cowboy"],
  ["lumberjack",       "mountaineer"],
  ["highlander",       "mountaineer"],
  ["minuteman",        "cowboy"],
  ["buccaneer",        "pirate"],
  ["musketeer",        "knight_spartan"],
  ["crusader",         "knight_spartan"],
  ["seminole",         "native_warrior"],
  ["cavalier",         "knight_spartan"],
  ["commodore",        "nautical"],
  ["anteater",         "anteater"],
  ["sycamore",         "abstract"],
  ["hoosier",          "abstract"],
  ["buckeye",          "abstract"],
  ["cyclone",          "nautical"],
  ["hurricane",        "nautical"],
  ["mariner",          "nautical"],
  ["midshipman",       "nautical"],
  ["leatherneck",      "cowboy"],
  ["dirtbag",          "abstract"],
  ["shocker",          "abstract"],
  ["49er",             "cowboy"],
  ["bronco",           "ram_mustang"],
  ["mustang",          "ram_mustang"],
  ["bison",            "bison_buffalo"],
  ["buffalo",          "bison_buffalo"],
  ["torero",           "cowboy"],
  ["titan",            "knight_spartan"],
  ["trojan",           "knight_spartan"],
  ["spartan",          "knight_spartan"],
  ["patriot",          "cowboy"],
  ["pioneer",          "mountaineer"],
  ["ranger",           "cowboy"],
  ["raider",           "pirate"],
  ["pirate",           "pirate"],
  ["corsair",          "pirate"],
  ["pilot",            "nautical"],
  ["monarch",          "knight_spartan"],
  ["flyer",            "abstract"],
  ["peacock",          "gamecock"],
  ["bluejay",          "cardinal_bird"],
  ["phoenix",          "eagle"],
  ["osprey",           "eagle"],
  ["penguin",          "duck"],
  // single-word feline
  ["jaguar",           "panther"],
  ["tiger",            "tiger"],
  ["wildcat",          "wildcat"],
  ["panther",          "panther"],
  ["cougar",           "cougar"],
  ["bobcat",           "wildcat"],
  ["lynx",             "wildcat"],
  ["lion",             "lion"],
  // single-word canine
  ["saluki",           "wolf"],
  ["retriever",        "wolf"],
  ["husky",            "husky"],
  ["huskie",           "husky"],
  ["terrier",          "bulldog"],
  ["wolf",             "wolf"],
  ["coyote",           "wolf"],
  ["lobo",             "wolf"],
  // single-word raptor/bird
  ["eagle",            "eagle"],
  ["falcon",           "falcon"],
  ["hawk",             "hawk"],
  ["owl",              "owl"],
  ["cardinal",         "cardinal_bird"],
  ["duck",             "duck"],
  ["pelican",          "duck"],
  ["hokie",            "gamecock"],
  ["raven",            "eagle"],
  ["mockingbird",      "cardinal_bird"],
  ["redbird",          "cardinal_bird"],
  ["heron",            "duck"],
  // single-word bear
  ["badger",           "badger"],
  ["beaver",           "beaver"],
  ["bear",             "bear"],
  ["grizzly",          "bear"],
  ["bruin",            "bear"],
  // single-word warrior / human
  ["warrior",          "native_warrior"],
  ["knight",           "knight_spartan"],
  ["cowboy",           "cowboy"],
  ["aggie",            "cowboy"],
  ["sooner",           "cowboy"],
  ["volunteer",        "mountaineer"],
  ["rebel",            "pirate"],
  ["brave",            "native_warrior"],
  ["aztec",            "native_warrior"],
  ["gaucho",           "cowboy"],
  ["cajun",            "abstract"],
  ["gael",             "knight_spartan"],
  ["friar",            "knight_spartan"],
  ["quaker",           "cowboy"],
  ["matador",          "cowboy"],
  ["blazer",           "cowboy"],
  ["ute",              "native_warrior"],
  ["duke",             "knight_spartan"],
  ["don",              "knight_spartan"],
  ["illini",           "native_warrior"],
  // single-word reptile
  ["triton",           "nautical"],
  ["rattler",          "rattler"],
  ["gator",            "gator"],
  ["alligator",        "gator"],
  ["terrapin",         "terrapin"],
  ["frog",             "horned_frog"],
  ["lizard",           "gator"],
  ["gecko",            "gator"],
  ["tortoise",         "terrapin"],
  // single-word bovine / livestock
  ["ram",              "ram_mustang"],
  ["bull",             "longhorn"],
  ["steer",            "longhorn"],
  ["herd",             "bison_buffalo"],
  // single-word insect
  ["hornet",           "insect"],
  ["wasp",             "insect"],
  ["beetle",           "insect"],
  ["yellowjacket",     "insect"],
  // single-word nautical
  ["tide",             "nautical"],
  ["wave",             "nautical"],
  ["seawolf",          "nautical"],
  // catch-all abstract
  ["flame",            "abstract"],
  ["beacon",           "abstract"],
  ["ace",              "abstract"],
  ["orange",           "abstract"],
  ["crimson",          "abstract"],
  ["gopher",           "abstract"],
];

export function getMascotArchetype(teamName: string): MascotArchetype | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();
  for (const [keyword, archetype] of KEYWORD_MAP) {
    if (lower.includes(keyword)) return archetype;
  }
  return null;
}
