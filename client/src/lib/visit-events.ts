export interface VisitEvent {
  headline: string;
  body: string;
}

type OutcomeTier = "low" | "medium" | "high";

interface VisitEventContext {
  school: string;
  recruit: string;
  coach: string;
}

function fill(template: string, ctx: VisitEventContext): string {
  return template
    .replace(/\{school\}/g, ctx.school)
    .replace(/\{recruit\}/g, ctx.recruit)
    .replace(/\{coach\}/g, ctx.coach);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ────────────────────────────────────────────────────────────────
// Campus Visit event pools
// Keyed first by priority (or "general"), then by outcome tier
// ────────────────────────────────────────────────────────────────

const CAMPUS_VISIT_EVENTS: Record<string, Record<OutcomeTier, VisitEvent[]>> = {
  facilities: {
    low: [
      {
        headline: "UNDERWHELMED BY THE FACILITY",
        body: "{recruit} toured the complex but left with more questions than answers. The weight room didn't quite match what he'd seen elsewhere.",
      },
      {
        headline: "FACILITY TOUR FELL FLAT",
        body: "The visit was pleasant enough, but {recruit} didn't seem wowed by what {school} had to offer. More work to do.",
      },
      {
        headline: "MIXED FEELINGS ON CAMPUS",
        body: "{recruit} appreciated the hospitality but wasn't blown away by the training facilities. Still a long way to go in his recruitment.",
      },
      {
        headline: "THE COMPLEX DIDN'T CLICK",
        body: "{school}'s facility is solid, but {recruit} has seen flashier setups on other visits. It's a tough sell when competing programs are investing heavily.",
      },
    ],
    medium: [
      {
        headline: "FACILITY TOUR IMPRESSED HIM",
        body: "{recruit} got a good look at the {school} training complex and liked what he saw. The pitching lab caught his eye.",
      },
      {
        headline: "HE LIKED THE SETUP",
        body: "After a full campus tour, {recruit} walked away with a strong impression of {school}'s facilities. Things are trending in the right direction.",
      },
      {
        headline: "STRONG SHOWING AT THE COMPLEX",
        body: "The tour of {school}'s complex resonated with {recruit}. He mentioned the field conditions and the locker room as highlights.",
      },
      {
        headline: "TRAINING CENTER MADE AN IMPRESSION",
        body: "The batting cages and bullpen mounds at {school} looked top-tier to {recruit}. He spent an extra twenty minutes just walking through the hitting facility.",
      },
    ],
    high: [
      {
        headline: "HE LOVED THE FACILITIES",
        body: "The state-of-the-art training complex left {recruit} speechless. He told his parents it was the best facility he'd seen on any visit.",
      },
      {
        headline: "BLOWN AWAY BY THE COMPLEX",
        body: "{recruit}'s jaw dropped when he saw the new training center at {school}. After the tour, he was already picturing himself suiting up here.",
      },
      {
        headline: "FACILITIES SEALED THE VISIT",
        body: "The {school} complex delivered exactly what {recruit} was looking for. He couldn't stop talking about the bullpen mounds and the hitters' cage.",
      },
      {
        headline: "NOTHING ELSE COMES CLOSE",
        body: "{recruit} has been on six official visits — and he told his recruiter the {school} facility was in a class by itself. This one is hard to beat.",
      },
    ],
  },

  college_life: {
    low: [
      {
        headline: "CAMPUS LIFE DIDN'T CLICK",
        body: "{recruit} enjoyed meeting the players but wasn't sure the campus culture was the right fit for him at this point.",
      },
      {
        headline: "ATMOSPHERE DIDN'T WIN HIM OVER",
        body: "The {school} campus didn't leave the lasting impression the staff hoped for. {recruit} was quiet on the drive back.",
      },
      {
        headline: "STILL EXPLORING OPTIONS",
        body: "{recruit} had a solid enough time on campus, but nothing grabbed him in a big way. He's keeping his options open.",
      },
      {
        headline: "VIBE WASN'T QUITE RIGHT",
        body: "The campus energy just didn't match what {recruit} was picturing. It's a personal fit thing — he's going to keep looking before making a decision.",
      },
    ],
    medium: [
      {
        headline: "LOVED THE CAMPUS VIBE",
        body: "{recruit} connected with the guys in the locker room and felt right at home walking around campus. A solid day for {school}.",
      },
      {
        headline: "GOOD ENERGY ON CAMPUS",
        body: "The atmosphere at {school} resonated with {recruit}. He mentioned the student section and the night life downtown as big pluses.",
      },
      {
        headline: "BONDED WITH THE TEAM",
        body: "An afternoon with the {school} roster paid off — {recruit} hit it off with several players and left with a smile on his face.",
      },
      {
        headline: "FELT COMFORTABLE FROM THE START",
        body: "{recruit} said the campus had a laid-back, welcoming vibe that he doesn't feel at every school. {school} passed the culture test.",
      },
    ],
    high: [
      {
        headline: "HE FELT RIGHT AT HOME",
        body: "{recruit} could see himself at {school} the moment he walked on campus. The team chemistry and campus energy won him over completely.",
      },
      {
        headline: "FELL IN LOVE WITH CAMPUS LIFE",
        body: "From the student section to the downtown strip, {recruit} experienced {school} at its best. He was already texting friends about the visit.",
      },
      {
        headline: "CAMPUS VISIT WAS A HOME RUN",
        body: "The campus experience at {school} checked every box for {recruit}. The guys welcomed him like a future teammate — because that's exactly what he's thinking.",
      },
      {
        headline: "COULDN'T STOP SMILING",
        body: "{recruit}'s family said they've never seen him this enthusiastic coming off a campus visit. {school}'s culture is something special.",
      },
    ],
  },

  academics: {
    low: [
      {
        headline: "ACADEMIC TOUR WASN'T A SELL",
        body: "{recruit} met with the academic advisor but the program's offerings didn't align with what he was looking for in his major.",
      },
      {
        headline: "PROGRAM FIT STILL IN QUESTION",
        body: "The academics presentation was fine, but {recruit} had tougher questions about his field of study than the staff could answer.",
      },
      {
        headline: "MAJOR CONCERNS WEREN'T ADDRESSED",
        body: "{recruit} came in with specific academic questions. The answers were vague, and that uncertainty is going to make it harder to close this one.",
      },
    ],
    medium: [
      {
        headline: "IMPRESSED WITH THE PROGRAMS",
        body: "{recruit} met with professors in his major and left feeling like {school} could set him up for life after baseball.",
      },
      {
        headline: "ACADEMIC PRESENTATION LANDED",
        body: "The dean's office made a strong case during {recruit}'s visit. He's starting to see {school} as a place to grow on and off the field.",
      },
      {
        headline: "CLASSROOM AND DIAMOND",
        body: "{recruit} appreciated the depth of {school}'s academic offerings. His mom specifically asked about graduation rates — and was pleased with what she heard.",
      },
    ],
    high: [
      {
        headline: "ACADEMIC VISIT BLEW HIM AWAY",
        body: "{recruit} was genuinely impressed by {school}'s academic reputation and the resources available to student athletes. A major step forward.",
      },
      {
        headline: "SOLD ON THE CLASSROOM TOO",
        body: "Baseball and a degree from {school}? {recruit}'s family was thrilled. The academic component made {school} stand out from every other program on his list.",
      },
      {
        headline: "THE FULL PACKAGE",
        body: "{recruit} left {school} convinced he could pursue his career dreams on and off the field. The academic resources sealed what the baseball pitch started.",
      },
    ],
  },

  prestige: {
    low: [
      {
        headline: "PRESTIGE PITCH DIDN'T LAND",
        body: "The tour covered the program's history and tradition, but {recruit} wasn't quite convinced it was the right fit for his ambitions.",
      },
      {
        headline: "TRADITION ALONE WASN'T ENOUGH",
        body: "{recruit} respects what {school} has built, but the visit didn't move the needle the way the staff had hoped.",
      },
      {
        headline: "LOOKING FOR MORE THAN HISTORY",
        body: "{recruit} acknowledges {school}'s storied past, but he's more focused on where a program is going than where it's been. The pitch needs to be forward-looking.",
      },
    ],
    medium: [
      {
        headline: "TRADITION MADE AN IMPRESSION",
        body: "Walking through the {school} trophy case made an impact on {recruit}. Playing for a program with this kind of history is something he's thinking about.",
      },
      {
        headline: "PROGRAM HISTORY RESONATED",
        body: "The championship banners and the storied roster of alumni made {recruit} take {school} more seriously than he had before.",
      },
      {
        headline: "LEGACY MATTERS TO HIM",
        body: "{recruit} did his homework before the visit and came in knowing {school}'s history. Seeing it in person validated what he'd read.",
      },
    ],
    high: [
      {
        headline: "PROGRAM PRESTIGE SEALED THE VISIT",
        body: "The legacy on display at {school} left {recruit} in awe. He wants to be part of something that matters — and this program clearly does.",
      },
      {
        headline: "HE WANTS TO BE PART OF THE LEGACY",
        body: "Standing in the {school} facility surrounded by championship history, {recruit} told his dad — 'This is where I want to make my mark.'",
      },
      {
        headline: "TROPHY CASE SAID IT ALL",
        body: "{recruit} spent fifteen minutes alone in front of {school}'s championship display. He left that room a completely different recruit.",
      },
    ],
  },

  general: {
    low: [
      {
        headline: "VISIT DIDN'T MOVE THE NEEDLE MUCH",
        body: "{recruit} appreciated the invite from {school}, but the day didn't produce the breakthrough the staff was hoping for. Time to regroup.",
      },
      {
        headline: "STILL ON THE FENCE",
        body: "A pleasant enough visit, but {recruit} wasn't overly enthusiastic. He's got more schools to see before making any decisions.",
      },
      {
        headline: "CAMPUS VISIT RETURNS MIXED SIGNALS",
        body: "{recruit} had a good time at {school}, but he seemed noncommittal when asked about it afterward. The recruitment continues.",
      },
      {
        headline: "POLITE, BUT NOT PERSUADED",
        body: "{recruit}'s family thanked the {school} staff for their time, but the buzz just wasn't there on the drive home. More work to do.",
      },
    ],
    medium: [
      {
        headline: "CAMPUS VISIT WENT WELL",
        body: "{recruit} got a full look at what {school} has to offer and came away with a positive impression. His interest in the program is growing.",
      },
      {
        headline: "SOLID DAY ON CAMPUS",
        body: "The visit to {school} gave {recruit} a chance to see the program up close. He left with more reasons to put {school} high on his list.",
      },
      {
        headline: "VISIT BOOSTED HIS INTEREST",
        body: "Seeing {school}'s campus in person did exactly what the staff needed. {recruit} walked away more interested than he arrived.",
      },
      {
        headline: "PRODUCTIVE CAMPUS TRIP",
        body: "{recruit} and his family had a great experience at {school}. The coaching staff made a strong impression and answered all their questions.",
      },
    ],
    high: [
      {
        headline: "VISIT LEFT A LASTING IMPRESSION",
        body: "{recruit} had one of his best official visits at {school}. From the facilities to the culture, everything checked out.",
      },
      {
        headline: "BIG DAY AT {school}",
        body: "The campus visit could not have gone better. {recruit} told his parents on the drive home that {school} might be the one.",
      },
      {
        headline: "CAMPUS SOLD HIM",
        body: "Between the facility tour and the team dinner, {recruit} got a full picture of life at {school} — and he loved every second of it.",
      },
      {
        headline: "EVERYTHING CLICKED",
        body: "{recruit} came in curious and left convinced. {school} checked every box he had — facility, culture, location, and the people around the program.",
      },
    ],
  },
};

// ────────────────────────────────────────────────────────────────
// Head Coach Visit event pools
// Keyed by archetype bucket, then outcome tier
// ────────────────────────────────────────────────────────────────

const HC_VISIT_EVENTS: Record<string, Record<OutcomeTier, VisitEvent[]>> = {
  "Pure CEO": {
    low: [
      {
        headline: "BUSINESS PITCH FELL FLAT",
        body: "Coach {coach} laid out the program's vision and resources, but {recruit} was looking for something more personal. The relationship-building still needs work.",
      },
      {
        headline: "PROFESSIONAL, BUT NOT PERSONAL ENOUGH",
        body: "Coach {coach} made a polished case for {school}, but {recruit} walked away feeling like he'd heard a boardroom presentation. Not quite what he needed.",
      },
      {
        headline: "NUMBERS WEREN'T ENOUGH",
        body: "Coach {coach} came armed with data — rankings, development metrics, pro draft numbers. {recruit} appreciated it, but he's a family-feel guy first. The fit still needs work.",
      },
    ],
    medium: [
      {
        headline: "COACH LAID OUT THE VISION",
        body: "Coach {coach} gave {recruit} the full blueprint — where the program is heading, what resources are available, and exactly where he fits in.",
      },
      {
        headline: "PROGRAM SELL WAS STRONG",
        body: "{recruit} appreciated the organized, professional approach from Coach {coach}. He knows {school} has its act together.",
      },
      {
        headline: "LONG-TERM PLAN RESONATED",
        body: "Coach {coach} walked {recruit} through a five-year program arc, including draft development and pro prospects. That structured thinking made an impression.",
      },
      {
        headline: "PROGRAM'S AMBITION WAS CLEAR",
        body: "{recruit} came in curious about the direction of {school}'s program. Coach {coach} painted a picture of where this thing is going — and {recruit} liked what he saw.",
      },
    ],
    high: [
      {
        headline: "COACH CLOSED THE DEAL",
        body: "Coach {coach} walked {recruit} through every detail of the program's growth plan — and the pitch landed perfectly. {school} just moved to the top of the list.",
      },
      {
        headline: "VISIONARY PITCH SEALED IT",
        body: "{recruit} came away convinced that Coach {coach} is building something special at {school}. He wants to be on the ground floor.",
      },
      {
        headline: "STRATEGIC VISION WON HIM OVER",
        body: "Coach {coach} is the kind of coach who shows you the blueprints, not just the highlight reel. {recruit} left {school} fully bought in on where this program is going.",
      },
    ],
  },

  "Player's Coach": {
    low: [
      {
        headline: "CONNECTION WAS HARD TO FIND",
        body: "Coach {coach} tried hard to build rapport with {recruit}, but the conversation didn't flow the way the staff had hoped. More groundwork needed.",
      },
      {
        headline: "VIBE JUST WASN'T THERE",
        body: "Coach {coach} is known for building relationships, but today the chemistry with {recruit} just wasn't clicking. The recruitment continues.",
      },
      {
        headline: "GENUINE, BUT TIMING WAS OFF",
        body: "Coach {coach} brought real warmth to the visit, but {recruit} seemed distracted and hard to read. A second visit might tell the real story.",
      },
    ],
    medium: [
      {
        headline: "COACH CONNECTED ON A PERSONAL LEVEL",
        body: "Coach {coach} spent real one-on-one time with {recruit} and his family. The genuine approach made an impression — {school} is in a good spot.",
      },
      {
        headline: "RECRUIT RESPONDED TO THE ENERGY",
        body: "{recruit} immediately felt at ease around Coach {coach}. That comfort level is exactly what families look for in a head coach.",
      },
      {
        headline: "FAMILY FELT THE WARMTH",
        body: "Coach {coach} didn't just talk to {recruit} — he talked to the whole family. {recruit}'s mom called it the most comfortable visit she'd been on.",
      },
      {
        headline: "COACH KNEW HIS STORY",
        body: "Coach {coach} referenced specific moments from {recruit}'s high school career that he'd clearly been watching. That personal investment hit home.",
      },
    ],
    high: [
      {
        headline: "COACH MADE HIM FEEL LIKE FAMILY",
        body: "Coach {coach} has a gift for connecting with kids, and {recruit} felt it immediately. His parents left knowing {school} would take care of their son.",
      },
      {
        headline: "PERSONAL CONNECTION MADE ALL THE DIFFERENCE",
        body: "{recruit} told his mom the visit felt different — more genuine, more personal. Coach {coach}'s approach is hard to compete with.",
      },
      {
        headline: "RELATIONSHIP WAS INSTANT",
        body: "Coaches like Coach {coach} don't come along often. {recruit} left the visit feeling like he'd known him for years. That's the hardest thing to fake in recruiting.",
      },
      {
        headline: "HEART OF THE PROGRAM SHOWED",
        body: "{recruit} and his dad sat with Coach {coach} for two hours. They talked baseball, life, family. He left knowing exactly who he'd be playing for.",
      },
    ],
  },

  Tactician: {
    low: [
      {
        headline: "DEVELOPMENT PITCH MISSED THE MARK",
        body: "Coach {coach} walked {recruit} through the development system in detail, but {recruit} was looking for early playing time, not a multi-year plan.",
      },
      {
        headline: "SCHEME DIDN'T RESONATE",
        body: "Coach {coach} is meticulous, but {recruit} left the visit wanting more than Xs and Os. The personal connection was thin.",
      },
      {
        headline: "TOO MUCH SYSTEM, NOT ENOUGH STORY",
        body: "Coach {coach} presented a polished development system, but {recruit} was hoping to hear more about himself specifically. The pitch felt generic.",
      },
    ],
    medium: [
      {
        headline: "RECRUIT GOT THE DEVELOPMENT PITCH",
        body: "Coach {coach} walked {recruit} through the program's player development system, position by position. It was exactly the kind of detail {recruit} was looking for.",
      },
      {
        headline: "SCHEME AND SYSTEM LANDED",
        body: "{recruit} left impressed by the level of detail in Coach {coach}'s approach. He knows exactly how he'd be used at {school}.",
      },
      {
        headline: "POSITION-SPECIFIC PLAN IMPRESSED HIM",
        body: "Coach {coach} had clearly put thought into how {recruit}'s specific tools would be developed at {school}. That attention to detail matters.",
      },
      {
        headline: "TACTICAL DEPTH WAS REFRESHING",
        body: "Most coaches sell their program. Coach {coach} sold a plan. {recruit} left {school} with a clear picture of what his career arc would look like.",
      },
    ],
    high: [
      {
        headline: "DEVELOPMENT PLAN WON HIM OVER",
        body: "Coach {coach} showed {recruit} exactly how {school}'s system would develop his game at the next level. He's already bought in.",
      },
      {
        headline: "COACH MADE THE SYSTEM CRYSTAL CLEAR",
        body: "{recruit} walked out with a complete picture of how Coach {coach} would use him at {school}. That clarity is rare — and {recruit} loved it.",
      },
      {
        headline: "BLUEPRINT FOR HIS CAREER",
        body: "Coach {coach} drew it all out — how {recruit} develops, when he starts, where his game ends up. {recruit} said it was the most detailed coaching conversation he'd ever had.",
      },
    ],
  },

  "Old School": {
    low: [
      {
        headline: "RECRUIT WANTED SOMETHING DIFFERENT",
        body: "Coach {coach}'s straightforward, no-nonsense approach wasn't quite the sales pitch {recruit} was expecting. Some kids want more bells and whistles.",
      },
      {
        headline: "OLD SCHOOL PITCH DIDN'T LAND",
        body: "Coach {coach} kept it real and honest, but {recruit} seemed to want more warmth. The direct approach didn't click today.",
      },
      {
        headline: "TOO BLUNT FOR THIS ONE",
        body: "Coach {coach} tells it like it is — every time. {recruit} came in expecting a sell. He got the truth instead, and he's not sure that's what he wanted.",
      },
    ],
    medium: [
      {
        headline: "STRAIGHT TALK WENT OVER WELL",
        body: "Coach {coach} doesn't sugarcoat anything — and {recruit}'s family respected that. A real conversation about expectations, playing time, and the program's demands.",
      },
      {
        headline: "RECRUIT RESPECTED THE DIRECTNESS",
        body: "{recruit} appreciated that Coach {coach} laid out the truth without a sales pitch. He knows exactly what he'd be getting into at {school}.",
      },
      {
        headline: "NO GAMES, NO PROMISES",
        body: "Coach {coach} told {recruit} exactly what it takes to play here. That level of honesty is rare in recruiting, and {recruit}'s dad was clearly impressed by it.",
      },
      {
        headline: "TOUGH LOVE RESONATED",
        body: "{recruit} came in knowing Coach {coach}'s reputation. The meeting confirmed it — demanding, fair, and completely straight with him. He can work with that.",
      },
    ],
    high: [
      {
        headline: "STRAIGHT TALK WON HIM OVER",
        body: "Coach {coach} told {recruit} exactly how hard it would be and exactly why he could handle it. That honesty hit home. {school} jumped up his board.",
      },
      {
        headline: "NO-NONSENSE APPROACH SEALED IT",
        body: "{recruit} came in looking for a coach he could trust. Coach {coach}'s direct style and high standards were exactly what he wanted to hear.",
      },
      {
        headline: "EARNED HIS RESPECT",
        body: "Coach {coach} challenged {recruit} in the meeting, not sold him. {recruit} left thinking — 'That's the kind of coach I want to play for.' High praise.",
      },
      {
        headline: "TOLD THE TRUTH AND IT WORKED",
        body: "Other coaches told {recruit} what he wanted to hear. Coach {coach} told him what he needed to hear. That distinction made all the difference.",
      },
    ],
  },

  "Scout Master": {
    low: [
      {
        headline: "EVALUATION VISIT DIDN'T EXCITE HIM",
        body: "Coach {coach} shared detailed notes on {recruit}'s game, but {recruit} was looking for encouragement, not just a clinical breakdown.",
      },
      {
        headline: "SCOUTING FOCUS FELT COLD",
        body: "Coach {coach} walked {recruit} through his analytical scouting report with precision. But {recruit} wanted someone to believe in him, not just evaluate him.",
      },
      {
        headline: "TOO MUCH ANALYSIS, NOT ENOUGH HEART",
        body: "Coach {coach}'s film breakdown was sharp, but {recruit} felt like a prospect being graded rather than a kid being recruited. The connection needs to come first.",
      },
    ],
    medium: [
      {
        headline: "COACH SAW SOMETHING IN HIM",
        body: "Coach {coach} broke down exactly what {school} sees in {recruit}'s game — and that honest, detailed evaluation meant a lot to the young player.",
      },
      {
        headline: "SCOUTING EYE BUILT TRUST",
        body: "Coach {coach} showed {recruit} he's been watching closely. Walking through specific areas of his game that {school} wants to develop built instant credibility.",
      },
      {
        headline: "HE KNEW THE FILM",
        body: "Coach {coach} referenced specific at-bats and outings from {recruit}'s junior season. That level of preparation told {recruit} he's been seriously evaluated.",
      },
      {
        headline: "DETAILED BREAKDOWN IMPRESSED HIM",
        body: "{recruit} has been to six visits. Nobody came close to the level of preparation Coach {coach} showed. The specific feedback was something he's never gotten before.",
      },
    ],
    high: [
      {
        headline: "COACH KNEW HIS GAME INSIDE OUT",
        body: "Coach {coach} broke down {recruit}'s mechanics and ceiling in a way no other staff has come close to. {recruit} felt truly seen as a player — and it landed hard.",
      },
      {
        headline: "DEEP EVALUATION SEALED THE VISIT",
        body: "{recruit} was floored by how much Coach {coach} had studied his film. The personalized plan for his development put {school} in a class of its own.",
      },
      {
        headline: "THE MOST PREPARED STAFF HE'D MET",
        body: "Coach {coach} pulled out a full breakdown of {recruit}'s tools and tendencies — things even {recruit}'s own high school coach hadn't noticed. That's a different level.",
      },
      {
        headline: "SCOUT'S EYE WON THE VISIT",
        body: "{recruit} said Coach {coach} saw things in his game that nobody else has identified. He left believing {school} could unlock his full potential.",
      },
    ],
  },

  "Academic Dean": {
    low: [
      {
        headline: "ACADEMIC PITCH WASN'T ENOUGH",
        body: "Coach {coach} highlighted the academic support system, but {recruit} came to talk baseball first. A solid presentation that missed the target.",
      },
      {
        headline: "PRIORITIES DIDN'T ALIGN TODAY",
        body: "Coach {coach} leaned heavily into life after baseball. {recruit} is eighteen and focused on playing time. The big-picture pitch landed somewhere between relevant and premature.",
      },
      {
        headline: "GREAT MESSAGE, WRONG MOMENT",
        body: "The values Coach {coach} talked about were genuine — character, education, life skills. {recruit} just isn't there yet. He needs to be sold on the baseball first.",
      },
    ],
    medium: [
      {
        headline: "COACH PAINTED THE WHOLE PICTURE",
        body: "Coach {coach} laid out what life at {school} looks like — on and off the field. The balance between athletics and academics made a real impression.",
      },
      {
        headline: "LIFE AFTER BASEBALL RESONATED",
        body: "{recruit}'s parents were impressed by how Coach {coach} talks about preparing players for life beyond the game. That matters to this family.",
      },
      {
        headline: "CHARACTER PITCH LANDED WITH THE FAMILY",
        body: "Coach {coach} spent as much time talking about who {recruit} will become as what he'll do on the field. The parents walked out sold.",
      },
      {
        headline: "GRAD RATES AND BASEBALL",
        body: "{recruit} came focused on the diamond. Coach {coach} shifted the conversation to graduation rates, major options, and post-ball opportunities. It connected.",
      },
    ],
    high: [
      {
        headline: "COACH WON OVER THE WHOLE FAMILY",
        body: "Coach {coach}'s emphasis on academics, character, and long-term success hit exactly the right notes with {recruit} and his parents. {school} is the real deal.",
      },
      {
        headline: "FAMILY COMPLETELY SOLD",
        body: "{recruit}'s mom pulled the coach aside after the visit to say she'd love for her son to play for him. That's Coach {coach}'s calling card.",
      },
      {
        headline: "BIGGER THAN BASEBALL",
        body: "Coach {coach} talked about life with a conviction that {recruit}'s family couldn't ignore. This isn't just about four years of baseball — and everyone in the room knew it.",
      },
      {
        headline: "THE KIND OF COACH PARENTS DREAM ABOUT",
        body: "{recruit}'s dad shook Coach {coach}'s hand three times on the way out. The values, the care, the long view — it was everything the family was hoping to find.",
      },
    ],
  },

  Dealmaker: {
    low: [
      {
        headline: "NIL PITCH DIDN'T CLOSE",
        body: "Coach {coach} came with an NIL package in hand, but {recruit} wasn't ready to commit to any program based on numbers alone.",
      },
      {
        headline: "OFFER DIDN'T MOVE HIM",
        body: "The financial framework Coach {coach} presented was competitive, but {recruit}'s family wants to see more than a dollar figure before making a decision.",
      },
      {
        headline: "MORE THAN MONEY",
        body: "{recruit} was respectful about the NIL offer Coach {coach} brought to the table, but he made clear he's weighing more than compensation in this decision.",
      },
    ],
    medium: [
      {
        headline: "COACH CAME PREPARED",
        body: "Coach {coach} laid out the full package for {recruit} — NIL resources, brand partnerships, and a clear path to maximum exposure at {school}.",
      },
      {
        headline: "FULL PACKAGE ON THE TABLE",
        body: "{recruit} appreciated Coach {coach}'s transparency. Between the scholarship and the NIL framework, {school} is offering a very serious deal.",
      },
      {
        headline: "RESOURCES IMPRESSED THE FAMILY",
        body: "Coach {coach} outlined the NIL ecosystem at {school} in detail. {recruit}'s family walked away knowing exactly what kind of support system is behind this program.",
      },
      {
        headline: "VALUE PROPOSITION RESONATED",
        body: "Coach {coach} doesn't just recruit players — he builds packages. {recruit} left understanding the full scope of what {school} is putting on the table.",
      },
    ],
    high: [
      {
        headline: "COACH MADE AN OFFER HE CAN'T IGNORE",
        body: "Coach {coach} pulled out all the stops — NIL resources, brand exposure, and a position of importance in the program from day one. {recruit} was stunned.",
      },
      {
        headline: "DEAL WAS TOO GOOD TO OVERLOOK",
        body: "Coach {coach} is known for closing, and today was no different. {recruit} walked out with an offer that no other school on his list can match.",
      },
      {
        headline: "BEST OFFER HE'S SEEN",
        body: "Coach {coach} structured a package that {recruit} and his family called the most comprehensive they've received. {school} just became the clear frontrunner.",
      },
      {
        headline: "RESOURCES, EXPOSURE, AND A PLAN",
        body: "Coach {coach} didn't just bring money — he brought a career strategy. Sponsorships, social media growth, postseason exposure. {recruit} felt the full vision.",
      },
    ],
  },

  Balanced: {
    low: [
      {
        headline: "VISIT WAS A STEP IN THE RIGHT DIRECTION",
        body: "Coach {coach} made a well-rounded case for {school}, but {recruit} wasn't ready to be wowed just yet. The conversation is ongoing.",
      },
      {
        headline: "GOOD MEETING, NOT A GAME-CHANGER",
        body: "Coach {coach} and {recruit} had a productive conversation, but the visit didn't produce the leap in interest the staff was looking for.",
      },
      {
        headline: "STILL UNDECIDED",
        body: "The visit with Coach {coach} was positive, but {recruit} has a long list and isn't ready to commit emotionally to any school just yet.",
      },
    ],
    medium: [
      {
        headline: "COACH MADE HIS PITCH",
        body: "A personal visit from Coach {coach} showed {recruit} exactly how serious {school} is. The message was clear: they want him, and they've got the program to back it up.",
      },
      {
        headline: "GENUINE INTEREST CAME THROUGH",
        body: "Coach {coach}'s visit felt authentic to {recruit} — no script, no gimmicks. That kind of honesty is hard to find in recruiting.",
      },
      {
        headline: "VISIT BUILT REAL MOMENTUM",
        body: "{recruit} left the sit-down with Coach {coach} feeling like {school} is genuinely invested in him. That personal touch is exactly what he was looking for.",
      },
      {
        headline: "WELL-ROUNDED SELL",
        body: "Coach {coach} covered all the bases — facilities, academics, team culture, development path. Nothing was missing from the pitch, and {recruit} noticed.",
      },
    ],
    high: [
      {
        headline: "COACH MADE A LASTING IMPRESSION",
        body: "Coach {coach} put in the time and it showed. {recruit} was struck by the genuine commitment from {school}'s staff — this is a program that truly wants him.",
      },
      {
        headline: "PERSONAL VISIT PAID OFF",
        body: "{recruit} knew the coach believed in him the moment Coach {coach} walked through the door. That kind of personal investment is hard to beat.",
      },
      {
        headline: "COACH CLOSED STRONG",
        body: "From the opening handshake to the final goodbye, Coach {coach} delivered. {recruit} told his dad this was his best visit so far.",
      },
      {
        headline: "EXACTLY WHAT HE WAS LOOKING FOR",
        body: "{recruit} had a mental checklist going into this visit. Coach {coach} hit every item on it. Some recruits know — this was one of those moments.",
      },
    ],
  },
};

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

function getOutcomeTier(gain: number): OutcomeTier {
  if (gain > 40) return "high";
  if (gain >= 15) return "medium";
  return "low";
}

/**
 * Determine which priority-key to use for campus visit flavor.
 * Returns "general" if no top priority maps to the known keys.
 */
function getTopCampusPriorityKey(recruit: {
  facilitiesPriority?: string | null;
  collegeLifePriority?: string | null;
  academicsPriority?: string | null;
  prestigePriority?: string | null;
}): string {
  const priorities: [string, string | null | undefined][] = [
    ["facilities", recruit.facilitiesPriority],
    ["college_life", recruit.collegeLifePriority],
    ["academics", recruit.academicsPriority],
    ["prestige", recruit.prestigePriority],
  ];

  // Pick the most important one (Extremely > Very > Somewhat > Not Important > undefined)
  const order: Record<string, number> = {
    Extremely: 4,
    Very: 3,
    Somewhat: 2,
    "Not Important": 1,
  };

  let topKey = "general";
  let topScore = 0;

  for (const [key, value] of priorities) {
    const score = order[value ?? ""] ?? 0;
    if (score > topScore) {
      topScore = score;
      topKey = key;
    }
  }

  return topKey;
}

/**
 * Pick a flavor event for a campus visit action.
 */
export function pickCampusVisitEvent(
  gain: number,
  recruit: {
    firstName?: string | null;
    lastName?: string | null;
    facilitiesPriority?: string | null;
    collegeLifePriority?: string | null;
    academicsPriority?: string | null;
    prestigePriority?: string | null;
  },
  schoolName: string,
  coachName: string
): VisitEvent {
  const tier = getOutcomeTier(gain);
  const priorityKey = getTopCampusPriorityKey(recruit);
  const pool = CAMPUS_VISIT_EVENTS[priorityKey]?.[tier] ?? CAMPUS_VISIT_EVENTS.general[tier];
  const event = pick(pool);
  const ctx: VisitEventContext = {
    school: schoolName,
    recruit: recruit.firstName ?? "He",
    coach: coachName,
  };
  return {
    headline: fill(event.headline, ctx),
    body: fill(event.body, ctx),
  };
}

/**
 * Pick a flavor event for a head coach visit action.
 * coachLevel influences the flavor text selection: higher levels skew
 * toward more prestigious/confident events by shifting toward the high-
 * tier pool when the outcome is medium and the coach is experienced.
 */
export function pickHeadCoachVisitEvent(
  gain: number,
  recruit: {
    firstName?: string | null;
    lastName?: string | null;
  },
  schoolName: string,
  coachLastName: string,
  coachArchetype: string,
  coachLevel?: number
): VisitEvent {
  let tier = getOutcomeTier(gain);

  // Experienced coaches (level 8+) in medium outcomes occasionally pull a
  // high-tier event, reflecting the weight a seasoned head coach carries.
  if (tier === "medium" && (coachLevel ?? 1) >= 8 && Math.random() < 0.35) {
    tier = "high";
  }

  const archetypeKey = HC_VISIT_EVENTS[coachArchetype] ? coachArchetype : "Balanced";
  const pool = HC_VISIT_EVENTS[archetypeKey][tier];
  const event = pick(pool);
  const ctx: VisitEventContext = {
    school: schoolName,
    recruit: recruit.firstName ?? "He",
    coach: coachLastName,
  };
  return {
    headline: fill(event.headline, ctx),
    body: fill(event.body, ctx),
  };
}
