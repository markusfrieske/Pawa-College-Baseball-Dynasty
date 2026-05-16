import { getMascotArchetype } from "../client/src/lib/mascot-archetypes";
import type { MascotArchetype } from "../client/src/lib/mascot-archetypes";

type TeamEntry = { name: string; mascot: string; expected: MascotArchetype };

const ALL_TEAMS: TeamEntry[] = [
  // SEC
  { name: "Alabama",             mascot: "Crimson Tide",      expected: "nautical" },
  { name: "Arkansas",            mascot: "Razorbacks",        expected: "razorback" },
  { name: "Auburn",              mascot: "Tigers",            expected: "tiger" },
  { name: "Florida",             mascot: "Gators",            expected: "gator" },
  { name: "Georgia",             mascot: "Bulldogs",          expected: "bulldog" },
  { name: "Kentucky",            mascot: "Wildcats",          expected: "wildcat" },
  { name: "LSU",                 mascot: "Tigers",            expected: "tiger" },
  { name: "Mississippi State",   mascot: "Bulldogs",          expected: "bulldog" },
  { name: "Missouri",            mascot: "Tigers",            expected: "tiger" },
  { name: "Ole Miss",            mascot: "Rebels",            expected: "cowboy" },
  { name: "South Carolina",      mascot: "Gamecocks",         expected: "gamecock" },
  { name: "Tennessee",           mascot: "Volunteers",        expected: "mountaineer" },
  { name: "Texas",               mascot: "Longhorns",         expected: "longhorn" },
  { name: "Texas A&M",           mascot: "Aggies",            expected: "cowboy" },
  { name: "Vanderbilt",          mascot: "Commodores",        expected: "nautical" },
  { name: "Oklahoma",            mascot: "Sooners",           expected: "cowboy" },
  // ACC
  { name: "Boston College",      mascot: "Eagles",            expected: "eagle" },
  { name: "Clemson",             mascot: "Tigers",            expected: "tiger" },
  { name: "Duke",                mascot: "Blue Devils",       expected: "knight_spartan" },
  { name: "Florida State",       mascot: "Seminoles",         expected: "native_warrior" },
  { name: "Georgia Tech",        mascot: "Yellow Jackets",    expected: "insect" },
  { name: "Louisville",          mascot: "Cardinals",         expected: "cardinal_bird" },
  { name: "Miami",               mascot: "Hurricanes",        expected: "nautical" },
  { name: "NC State",            mascot: "Wolfpack",          expected: "wolf" },
  { name: "North Carolina",      mascot: "Tar Heels",         expected: "abstract" },
  { name: "Notre Dame",          mascot: "Fighting Irish",    expected: "knight_spartan" },
  { name: "Pittsburgh",          mascot: "Panthers",          expected: "panther" },
  { name: "Syracuse",            mascot: "Orange",            expected: "abstract" },
  { name: "Virginia",            mascot: "Cavaliers",         expected: "knight_spartan" },
  { name: "Virginia Tech",       mascot: "Hokies",            expected: "gamecock" },
  { name: "Wake Forest",         mascot: "Demon Deacons",     expected: "knight_spartan" },
  { name: "Stanford",            mascot: "Cardinal",          expected: "cardinal_bird" },
  // Big Ten
  { name: "Illinois",            mascot: "Fighting Illini",   expected: "native_warrior" },
  { name: "Indiana",             mascot: "Hoosiers",          expected: "abstract" },
  { name: "Iowa",                mascot: "Hawkeyes",          expected: "hawk" },
  { name: "Maryland",            mascot: "Terrapins",         expected: "terrapin" },
  { name: "Michigan",            mascot: "Wolverines",        expected: "wolverine" },
  { name: "Michigan State",      mascot: "Spartans",          expected: "knight_spartan" },
  { name: "Minnesota",           mascot: "Golden Gophers",    expected: "abstract" },
  { name: "Nebraska",            mascot: "Cornhuskers",       expected: "cowboy" },
  { name: "Northwestern",        mascot: "Wildcats",          expected: "wildcat" },
  { name: "Ohio State",          mascot: "Buckeyes",          expected: "abstract" },
  { name: "Oregon",              mascot: "Ducks",             expected: "duck" },
  { name: "Penn State",          mascot: "Nittany Lions",     expected: "lion" },
  { name: "Purdue",              mascot: "Boilermakers",      expected: "abstract" },
  { name: "Rutgers",             mascot: "Scarlet Knights",   expected: "knight_spartan" },
  { name: "UCLA",                mascot: "Bruins",            expected: "bear" },
  { name: "Washington",          mascot: "Huskies",           expected: "husky" },
  // Big 12
  { name: "Baylor",              mascot: "Bears",             expected: "bear" },
  { name: "BYU",                 mascot: "Cougars",           expected: "cougar" },
  { name: "Cincinnati",          mascot: "Bearcats",          expected: "bear" },
  { name: "Houston",             mascot: "Cougars",           expected: "cougar" },
  { name: "Iowa State",          mascot: "Cyclones",          expected: "nautical" },
  { name: "Kansas",              mascot: "Jayhawks",          expected: "hawk" },
  { name: "Kansas State",        mascot: "Wildcats",          expected: "wildcat" },
  { name: "Oklahoma State",      mascot: "Cowboys",           expected: "cowboy" },
  { name: "TCU",                 mascot: "Horned Frogs",      expected: "horned_frog" },
  { name: "Texas Tech",          mascot: "Red Raiders",       expected: "cowboy" },
  { name: "UCF",                 mascot: "Knights",           expected: "knight_spartan" },
  { name: "Utah",                mascot: "Utes",              expected: "native_warrior" },
  { name: "West Virginia",       mascot: "Mountaineers",      expected: "mountaineer" },
  { name: "Arizona",             mascot: "Wildcats",          expected: "wildcat" },
  { name: "Arizona State",       mascot: "Sun Devils",        expected: "knight_spartan" },
  // Pac-12
  { name: "USC",                 mascot: "Trojans",           expected: "knight_spartan" },
  { name: "Oregon State",        mascot: "Beavers",           expected: "beaver" },
  // AAC
  { name: "Connecticut",         mascot: "Huskies",           expected: "husky" },
  { name: "East Carolina",       mascot: "Pirates",           expected: "pirate" },
  { name: "Florida Atlantic",    mascot: "Owls",              expected: "owl" },
  { name: "Memphis",             mascot: "Tigers",            expected: "tiger" },
  { name: "Navy",                mascot: "Midshipmen",        expected: "nautical" },
  { name: "Rice",                mascot: "Owls",              expected: "owl" },
  { name: "South Florida",       mascot: "Bulls",             expected: "longhorn" },
  { name: "Temple",              mascot: "Owls",              expected: "owl" },
  { name: "Tulane",              mascot: "Green Wave",        expected: "nautical" },
  { name: "Tulsa",               mascot: "Golden Hurricane",  expected: "nautical" },
  { name: "Wichita State",       mascot: "Shockers",          expected: "abstract" },
  // Sun Belt
  { name: "App State",           mascot: "Mountaineers",      expected: "mountaineer" },
  { name: "Arkansas State",      mascot: "Red Wolves",        expected: "wolf" },
  { name: "Coastal Carolina",    mascot: "Chanticleers",      expected: "gamecock" },
  { name: "Georgia Southern",    mascot: "Eagles",            expected: "eagle" },
  { name: "Georgia State",       mascot: "Panthers",          expected: "panther" },
  { name: "James Madison",       mascot: "Dukes",             expected: "knight_spartan" },
  { name: "Louisiana",           mascot: "Ragin Cajuns",      expected: "abstract" },
  { name: "Louisiana Monroe",    mascot: "Warhawks",          expected: "hawk" },
  { name: "Marshall",            mascot: "Thundering Herd",   expected: "bison_buffalo" },
  { name: "Old Dominion",        mascot: "Monarchs",          expected: "lion" },
  { name: "South Alabama",       mascot: "Jaguars",           expected: "panther" },
  { name: "Southern Miss",       mascot: "Golden Eagles",     expected: "eagle" },
  { name: "Texas State",         mascot: "Bobcats",           expected: "wildcat" },
  // WCC
  { name: "Gonzaga",             mascot: "Bulldogs",          expected: "bulldog" },
  { name: "LMU",                 mascot: "Lions",             expected: "lion" },
  { name: "Pacific",             mascot: "Tigers",            expected: "tiger" },
  { name: "Pepperdine",          mascot: "Waves",             expected: "nautical" },
  { name: "Portland",            mascot: "Pilots",            expected: "nautical" },
  { name: "San Diego",           mascot: "Toreros",           expected: "cowboy" },
  { name: "Santa Clara",         mascot: "Broncos",           expected: "ram_mustang" },
  // Mountain West
  { name: "Air Force",           mascot: "Falcons",           expected: "falcon" },
  { name: "Fresno State",        mascot: "Bulldogs",          expected: "bulldog" },
  { name: "Nevada",              mascot: "Wolf Pack",         expected: "wolf" },
  { name: "New Mexico",          mascot: "Lobos",             expected: "wolf" },
  { name: "San Jose State",      mascot: "Spartans",          expected: "knight_spartan" },
  { name: "UNLV",                mascot: "Rebels",            expected: "cowboy" },
  // Big West
  { name: "Cal Poly",            mascot: "Mustangs",          expected: "ram_mustang" },
  { name: "Cal State Bakersfield", mascot: "Roadrunners",     expected: "cardinal_bird" },
  { name: "Cal State Fullerton", mascot: "Titans",            expected: "knight_spartan" },
  { name: "Cal State Northridge", mascot: "Matadors",         expected: "cowboy" },
  { name: "Hawaii",              mascot: "Rainbow Warriors",  expected: "native_warrior" },
  { name: "Long Beach State",    mascot: "Dirtbags",          expected: "abstract" },
  { name: "UC Davis",            mascot: "Aggies",            expected: "cowboy" },
  { name: "UC Irvine",           mascot: "Anteaters",         expected: "anteater" },
  { name: "UC Riverside",        mascot: "Highlanders",       expected: "mountaineer" },
  { name: "UC Santa Barbara",    mascot: "Gauchos",           expected: "cowboy" },
  // Missouri Valley
  { name: "Bradley",             mascot: "Braves",            expected: "native_warrior" },
  { name: "Dallas Baptist",      mascot: "Patriots",          expected: "cowboy" },
  { name: "Evansville",          mascot: "Purple Aces",       expected: "abstract" },
  { name: "Illinois State",      mascot: "Redbirds",          expected: "cardinal_bird" },
  { name: "Indiana State",       mascot: "Sycamores",         expected: "abstract" },
  { name: "Missouri State",      mascot: "Bears",             expected: "bear" },
  { name: "Murray State",        mascot: "Racers",            expected: "ram_mustang" },
  { name: "Northern Iowa",       mascot: "Panthers",          expected: "panther" },
  { name: "Southern Illinois",   mascot: "Salukis",           expected: "wolf" },
  { name: "South Dakota State",  mascot: "Jackrabbits",       expected: "abstract" },
  { name: "Western Illinois",    mascot: "Leathernecks",      expected: "cowboy" },
  { name: "Youngstown State",    mascot: "Penguins",          expected: "duck" },
  // Ivy League
  { name: "Columbia",            mascot: "Lions",             expected: "lion" },
  { name: "Cornell",             mascot: "Big Red",           expected: "abstract" },
  { name: "Dartmouth",           mascot: "Big Green",         expected: "abstract" },
  { name: "Harvard",             mascot: "Crimson",           expected: "abstract" },
  { name: "Penn",                mascot: "Quakers",           expected: "mountaineer" },
  { name: "Princeton",           mascot: "Tigers",            expected: "tiger" },
  { name: "Yale",                mascot: "Bulldogs",          expected: "bulldog" },
  { name: "Brown",               mascot: "Bears",             expected: "bear" },
  // HBCU
  { name: "Alabama A&M",         mascot: "Bulldogs",          expected: "bulldog" },
  { name: "Alabama State",       mascot: "Hornets",           expected: "insect" },
  { name: "Alcorn State",        mascot: "Braves",            expected: "native_warrior" },
  { name: "Bethune-Cookman",     mascot: "Wildcats",          expected: "wildcat" },
  { name: "Coppin State",        mascot: "Eagles",            expected: "eagle" },
  { name: "Delaware State",      mascot: "Hornets",           expected: "insect" },
  { name: "Florida A&M",         mascot: "Rattlers",          expected: "rattler" },
  { name: "Grambling State",     mascot: "Tigers",            expected: "tiger" },
  { name: "Howard",              mascot: "Bison",             expected: "bison_buffalo" },
  { name: "Jackson State",       mascot: "Tigers",            expected: "tiger" },
  { name: "Maryland Eastern Shore", mascot: "Hawks",          expected: "hawk" },
  { name: "Mississippi Valley State", mascot: "Delta Devils", expected: "knight_spartan" },
  { name: "Morgan State",        mascot: "Bears",             expected: "bear" },
  { name: "Norfolk State",       mascot: "Spartans",          expected: "knight_spartan" },
  { name: "North Carolina A&T",  mascot: "Aggies",            expected: "cowboy" },
  { name: "Prairie View A&M",    mascot: "Panthers",          expected: "panther" },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const team of ALL_TEAMS) {
  const actual = getMascotArchetype(team.mascot);
  if (actual !== team.expected) {
    const msg = `FAIL  [${team.name}] mascot="${team.mascot}" expected=${team.expected} got=${actual ?? "null"}`;
    console.error(msg);
    failures.push(msg);
    failed++;
  } else {
    console.log(`  OK  [${team.name}] ${team.mascot} -> ${actual}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All mascot archetype assertions passed.");
}
