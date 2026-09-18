/* Standalone design proposal. All state and sample interactions stay in this page. */
const friskProposal = Object.freeze({
  direction: "A", portrait: "B", environment: "D", type: "B", palette: "A", shell: "A",
  profile: "A", marks: "A", icons: "B", density: "C", motion: "A", audio: "B"
});
const choices = { ...friskProposal };
const definitions = [
  ["direction", "01", "Direction", [
    ["Varsity Club", "Athletic broadcast composition with emerald, brass and warm baseball places.", "Best continuity. Needs expressive characters to avoid a generic sports menu."],
    ["Night Broadcast", "Ink surfaces, ice-blue action color, sharp typography and floodlit game nights.", "Strong for serious league play. Can feel cold without player personality."],
    ["Campus Chronicle", "Cream paper, oxblood accents, editorial titles and screenprinted ballparks.", "Great for program history. Less cinematic; texture must stay away from data."],
    ["Rally Arcade", "Playful sculpted characters, saturated team accents and softer shapes.", "Most approachable. Restraint is essential in dense reporting screens."]
  ]],
  ["portrait", "02", "Characters", [
    ["Sculpted 3D", "Consistent matte character busts with dimensional light and distinct silhouettes.", "Most immediately game-like; highest reusable-kit and rendering cost."],
    ["Cel illustration", "Expressive ink contours, simple shadows and modular cap, hair and jersey layers.", "Recommended. Readable small; needs disciplined line weight and a shared kit."],
    ["Graphic cut-paper", "Strong flat shapes, limited colors and editorial facial features.", "Distinctive and scalable. Less emotional subtlety at dramatic moments."],
    ["Painted portraits", "Semi-real athletic faces with controlled brushwork and natural proportions.", "Strong player stories. Hardest to keep consistent across hundreds of faces."]
  ]],
  ["environment", "03", "World art", [
    ["Painted places", "Warm dugouts, scouting rooms and collegiate ballparks frame the current task.", "Recommended. This first study is still too photographic; refine brushwork."],
    ["Cinematic stills", "Night lights, tunnels and dramatic stadium crops for game-day atmosphere.", "Premium matchups. Avoid making every program look like the same stadium."],
    ["Athletic posters", "Geometric ballparks, school colors and flat screenprint shapes.", "Fast to adapt and readable. Less sense of living inside a campus."],
    ["Miniature campus", "A stylized 3D model of a compact campus and its baseball field.", "Strong place identity. Do not imply clickable buildings or unsupported features."]
  ]],
  ["type", "04", "Typography", [
    ["Athletic broadcast", "Barlow Semi Condensed headlines · Inter UI · Plex Mono score readouts.", "Recommended. Existing families reduce migration work; body text stays wide."],
    ["Friendly console", "Sora headlines · Inter UI · tabular Inter statistics.", "Soft modern character. Wide headings need careful long-name wrapping."],
    ["Collegiate editorial", "Bitter headlines · Inter UI · tabular Inter statistics.", "Distinctive history and player names. Keep the slab face out of tables."],
    ["Modern franchise", "Space Grotesk headlines · Inter UI · tabular Inter statistics.", "Clean and flexible. Needs strong baseball art to establish genre."]
  ]],
  ["palette", "05", "Color + surfaces", [
    ["Forest & brass", "Deep emerald surfaces, warm ivory text, restrained brass actions.", "Recommended continuity. Gold cannot also mean warning, pending and prestige."],
    ["Ink & ice", "Midnight navy, blue-gray panels, cool white text and icy actions.", "Technical clarity. Keep team color in identity zones, not every surface."],
    ["Cream & oxblood", "Warm off-white, pale paper panels, dark ink and oxblood controls.", "Excellent daytime character. Never beige text on beige surfaces."],
    ["Navy, coral & aqua", "Deep blue menus with coral selection and small aqua highlights.", "Fresh and playful. Three accents need strict semantic roles."]
  ]],
  ["shell", "06", "Screen composition", [
    ["Matchday brief", "Matchup and one next action first; three obligations; a short player story.", "Recommended home. Requires deleting redundant dashboard panels."],
    ["Coach's desk", "A place-led two-column composition with the coaching brief beside it.", "Strong role-playing feel. The art collapses on phones, not the action."],
    ["Broadcast front page", "A wide editorial venue, matchup lead and concise league coverage.", "Best spectator atmosphere. Risk: slower returning-coach tasks."],
    ["Franchise workbench", "Compact labeled navigation, a working list and a selected-player inspector.", "Best inside roster/recruiting. Needs players to avoid an admin-tool feel."]
  ]],
  ["profile", "07", "Player presentation", [
    ["Sports profile", "Portrait, role and name first; strengths, availability, stats and career below.", "Recommended. Personality and serious comparison share one surface."],
    ["Collectible card", "A large framed identity card with career detail beside it.", "Memorable and shareable. Avoid rarity frames that imply paid progression."],
    ["Scouting dossier", "A smaller portrait stamp beside notes, strengths and comparison data.", "Fast for talent evaluation. Less emotional attachment without stories."],
    ["Character select", "A larger character treatment with expandable skills and career panels.", "Most character-led. Needs more art and space; never hide key availability."]
  ]],
  ["marks", "08", "Team identity", [
    ["Athletic monograms", "Bold initials, one consistent frame and a visible school name.", "Recommended baseline. Scales well; schools sharing initials need distinction."],
    ["School crests", "Simple shield, school initial and one local symbol.", "Collegiate prestige. Detailed crests become illegible at roster sizes."],
    ["Mascot emblems", "Original two-color mascot heads with strong silhouettes.", "Most memorable. Largest per-team art workload."],
    ["Cap lettering", "Custom baseball initials reused on cap, jersey, score and player card.", "Most baseball-specific. Needs careful letter design, not generic text."]
  ]],
  ["icons", "09", "Functional icons", [
    ["Clean outline", "One consistent outline family; visible labels for every main destination.", "Recommended. Reuses the existing Lucide foundation with consistent sizes."],
    ["Solid silhouette", "Filled action shapes with simple negative space.", "Strong at small sizes. More visual weight beside dense data."],
    ["Duotone", "Two tonal layers distinguish selected tools from quiet navigation.", "Adds polish. Must work in one color and keep meaning independent of hue."],
    ["Modern pixel", "Deliberate grid icons with restrained retro character.", "Distinctive indie feel. Conflicts with cinematic realism unless used carefully."]
  ]],
  ["density", "10", "Information density", [
    ["Cinematic", "More room around the focal decision, larger player art and fewer visible rows.", "Great first impression. Slower repeated roster/report tasks."],
    ["Balanced", "One focal region and a useful supporting column; readable compact rows.", "Good default. Needs prioritization rather than shrinking every element."],
    ["Expert", "More visible rows and a compact inspector with unchanged readable text.", "Best long management sessions. Less welcoming for a new coach."],
    ["Adaptive", "Balanced home; compact desktop comparison; comfortable phone list/detail.", "Recommended. Save the preference without changing where features live."]
  ]],
  ["motion", "11", "Motion", [
    ["Broadcast", "Short score wipes, crisp selection feedback, rare milestone reveals.", "Recommended. Prototype next; no motion assets are demonstrated here."],
    ["Cinematic", "Soft scene transitions and subtle environmental atmosphere.", "Most immersive. Repeated actions must never wait for a scene."],
    ["Tactile", "Quick panel slides, card settles and direct button feedback.", "Feels responsive. Avoid making stat entry bounce or drift."],
    ["Arcade", "Springy selection, expressive reactions and bigger celebrations.", "Playful. High risk of fatigue; full reduced-motion support is essential."]
  ]],
  ["audio", "12", "Sound", [
    ["Stadium light", "Quiet UI confirmation and a brief crowd lift at meaningful achievements.", "Recommended. Opt-in, always available mute; no audio sample generated yet."],
    ["Clubhouse", "Pen, paper, locker and ball sounds for a coach's everyday work.", "Intimate and grounded. Repetition can become distracting."],
    ["Minimal", "Restrained confirmation and warning tones with no ambient bed.", "Fast and comfortable. Less atmosphere."],
    ["Arcade score", "Short melodic stings, character cues and a playful menu score.", "Strong personality. Highest composition effort and interruption risk."]
  ]]
];
const fonts = ['"Barlow Semi Condensed", Arial, sans-serif', '"Sora", Arial, sans-serif', '"Bitter", Georgia, serif', '"Space Grotesk", Arial, sans-serif'];
const positions = ["0% 0%", "100% 0%", "0% 100%", "100% 100%"];
const palettes = [["#0c201c","#204139","#f4f1e5","#ebca83"],["#101a29","#213950","#f3f6ff","#afe2ff"],["#eee8db","#fffaf0","#292b28","#872e3a"],["#181f3d","#333f69","#ffac9f","#55ddca"]];
const presets = {
  A:{direction:"A",portrait:"B",environment:"A",type:"A",palette:"A",shell:"A",profile:"A",density:"D"},
  B:{direction:"B",portrait:"D",environment:"B",type:"D",palette:"B",shell:"D",profile:"C",density:"C"},
  C:{direction:"C",portrait:"C",environment:"C",type:"C",palette:"C",shell:"C",profile:"B",density:"B"},
  D:{direction:"D",portrait:"A",environment:"D",type:"B",palette:"D",shell:"B",profile:"D",density:"B"}
};
const notes = {
  A:"Varsity Club: expressive players and forest/brass continuity. Frisk's proposed mix pairs cel portraits with miniature campus art, friendly console type and expert density. Approval pending.",
  B:"Night Broadcast: prioritize comparison, crisp matchups and technical confidence. Tradeoff: less warmth.",
  C:"Campus Chronicle: prioritize program history and editorial character. Tradeoff: less cinematic urgency.",
  D:"Rally Arcade: prioritize character attachment and playful approachability. Tradeoff: more asset work and noise risk."
};
let currentScreen="today", currentCategory="portrait", mode="companion";
const preview=document.getElementById("game-preview");
const content=document.getElementById("screen-content");
const idx=letter=>letter.charCodeAt(0)-65;
const nameFor=key=>definitions.find(x=>x[0]===key)[3][idx(choices[key])][0];
const portrait=(extra="")=>'<div class="portrait '+extra+'" role="img" aria-label="Fictional Jalen Brooks portrait, '+nameFor("portrait")+'"></div>';
const button=(label,screen,primary=false)=>'<button type="button" class="g-button '+(primary?"primary":"")+'" data-go="'+screen+'">'+label+' <span aria-hidden="true">↗</span></button>';
const heading=(kicker,title,status)=>'<div class="page-heading"><div><span class="kicker">'+kicker+'</span><h2>'+title+'</h2></div>'+(status?'<span class="tag">'+status+'</span>':"")+'</div>';
const obligations=()=>'<div class="group-title"><h3>Your next decisions</h3><span>2 open</span></div><div class="obligation"><span class="index">01</span><b>'+(mode==="companion"?"Review Harbor's report":"Set the weekend rotation")+'</b><small>'+(mode==="companion"?"Awaiting you":"Before next game")+'</small></div><div class="obligation"><span class="index">02</span><b>Choose a recruiting priority</b><small>3 actions left</small></div>';
const story=()=>'<div class="group-title"><h3>Inside the program</h3><span>Player spotlight</span></div><div class="story">'+portrait("small")+'<div><strong>Brooks owns the moment.</strong><p>Three straight games with an extra-base hit. Your junior captain is setting the pace.</p></div></div><div class="league-strip"><span>RECORD <b>12–4</b></span><span>CONFERENCE <b>4–2</b></span></div>';
function today(){
  return '<span class="kicker">REGULAR SEASON / FRIDAY, APRIL 09</span><div class="hero"><div class="hero-copy"><span class="kicker">WEEKEND SERIES · GAME 1</span><h2>Make this<br>weekend yours.</h2><div class="match-teams"><span class="team-mark">CV</span><div class="team-name">Cedar Valley<small>12–4 · Home</small></div><span class="vs">VS</span><span class="team-mark away">HB</span><div class="team-name">Harbor<small>10–6 · Away</small></div></div><p class="hero-note">'+(mode==="companion"?"Power Pros league · Play by Sun, 8 PM MT":"Solo dynasty · Series opener ready")+'</p><div class="primary-row">'+button(mode==="companion"?"Prepare Power Pros game":"Review lineup & play","game",true)+'</div></div><div class="venue" role="img" aria-label="College ballpark environment study"></div></div><div class="content-grid"><section>'+obligations()+'</section><section>'+story()+'</section></div>';
}
function playerTable(recruit=false){
  const rows=recruit?[["MS","Mateo Silva","RHP · High school","A−","Strong","High"],["EB","Eli Bennett","SS · High school","B+","Growing","Medium"],["JL","Jonah Lee","CF · High school","B","Open","Medium"]]:[["24","Jalen Brooks","CF · Junior","82",".318","Ready"],["11","Noah Ellis","SS · Sophomore","79",".291","Ready"],["08","Isaac Reed","C · Senior","77",".274","Ready"],["19","Miles Carter","RHP · Junior","81","3.47","Resting"]];
  return '<div class="table-wrap"><table class="game-table"><thead><tr><th scope="col">'+(recruit?"Prospect":"Player")+'</th><th scope="col">'+(recruit?"Scout grade":"OVR")+'</th><th scope="col">'+(recruit?"Interest":"AVG / ERA")+'</th><th scope="col">'+(recruit?"Confidence":"Availability")+'</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr class="'+(!i?'selected':'')+'"><td><div class="row-player"><span class="row-number">'+r[0]+'</span><div><b>'+r[1]+'</b><span>'+r[2]+'</span></div></div></td><td>'+r[3]+'</td><td>'+r[4]+'</td><td>'+r[5]+'</td></tr>').join("")+'</tbody></table></div>';
}
function roster(){
  return heading("CEDAR VALLEY / TEAM","Build your best nine.","22 players · 2 pitchers resting")+'<div class="master-detail"><div>'+playerTable()+'<p class="small-note">Batters: AVG · Pitchers: ERA. Selected sample: Jalen Brooks.</p><div class="primary-row">'+button("Open Brooks profile","player",true)+button("Matchup preparation","game")+'</div></div><aside class="inspector">'+portrait()+'<span class="kicker">24 / CENTER FIELD / JUNIOR</span><h3>Jalen Brooks</h3><div class="attributes"><div class="attribute"><small>CONTACT</small><strong>82</strong></div><div class="attribute"><small>POWER</small><strong>76</strong></div><div class="attribute"><small>SPEED</small><strong>88</strong></div></div><span class="tag">Ready · Everyday starter</span><p>Contact and range make him your steady center fielder. Keep the throwing matchup in mind.</p></aside></div>';
}
function player(){
  return heading("PLAYER PROFILE / CEDAR VALLEY","Know your cornerstone.","Ready to play")+'<div class="player-feature">'+portrait()+'<div><span class="kicker">24 / CF / JUNIOR / BATS L · THROWS R</span><h2>Jalen<br>Brooks.</h2><p class="quiet">A steady bat. A voice the clubhouse trusts.</p><div class="attributes"><div class="attribute"><small>OVERALL</small><strong>82</strong></div><div class="attribute"><small>AVG</small><strong>.318</strong></div><div class="attribute"><small>RBI</small><strong>14</strong></div></div><div class="profile-story"><span class="kicker">COACH’S READ</span><p>Plus range and reliable contact. Arm strength limits the deep throw; keep him in center rather than right.</p></div>'+button("View in team","roster",true)+'</div></div><div class="timeline"><div><small>2025 / FRESHMAN</small><p>Won the fourth-outfielder role.</p></div><div><small>2026 / SOPHOMORE</small><p>Earned a full-time starting place.</p></div><div><small>2027 / JUNIOR</small><p>Helping a young lineup settle in.</p></div></div>';
}
function recruiting(){
  return heading("RECRUITING / YOUR SHORTLIST","Find the next difference-maker.","Priority need: starting pitching")+'<div class="recruit-budget"><span>ACTIONS REMAINING<b>3 of 5</b></span><span>SCHOLARSHIP ROOM<b>2 openings</b></span><span>CLASS TARGET<b>One RHP · One SS</b></span></div><div class="master-detail"><div>'+playerTable(true)+'<p class="small-note">Grades are scouting estimates. Confidence is separate from talent; uncertain information stays visible.</p></div><aside class="inspector"><span class="kicker">SHORTLIST / PITCHING PRIORITY</span><h3>Mateo Silva</h3><p>RHP · High school senior<br>Ground-ball profile · 3 pitches</p><div class="attributes"><div class="attribute"><small>SCOUT GRADE</small><strong>A−</strong></div><div class="attribute"><small>CONFIDENCE</small><strong>High</strong></div></div><p>Fits the open rotation role. Verify stamina before spending your final visit.</p><button type="button" class="g-button primary" data-demo="Recruiting action preview only. No resources were spent.">Preview scouting visit ↗</button></aside></div>';
}
function game(){
  return heading(mode==="companion"?"POWER PROS COMPANION / GAME 1":"SOLO DYNASTY / GAME 1","The weekend starts here.","Scheduled")+'<div class="game-score"><div><span class="team-mark">CV</span><strong>Cedar Valley</strong><p>12–4 · Home</p></div><span class="vs">VS</span><div><span class="team-mark away">HB</span><strong>Harbor</strong><p>10–6 · Away</p></div></div><div class="content-grid"><section><div class="group-title"><h3>Before first pitch</h3></div><div class="obligation"><span class="index">01</span><b>Check lineup and pitcher availability</b></div><div class="obligation"><span class="index">02</span><b>'+(mode==="companion"?"Review agreed league rules":"Review Harbor's scouting report")+'</b></div><div class="obligation"><span class="index">03</span><b>'+(mode==="companion"?"Verify the roster used in Power Pros":"Choose your starting pitcher")+'</b></div></section><aside class="inspector"><span class="kicker">SCOUTING KEY</span><h3>Make them earn the extra base.</h3><p>Harbor puts pressure on outfield arms. Brooks’ range matters; review the corner assignments.</p>'+button("Review team","roster")+'</aside></div><div class="primary-row">'+(mode==="companion"?button("Played the game? Review sample report","report",true):'<button type="button" class="g-button primary" data-demo="Game simulation is outside this concept. No result was created.">Preview play action ↗</button>')+'</div><p class="small-note">'+(mode==="companion"?"Games are played in Power Pros and reported here. This concept does not imply console synchronization.":"Concept preview only; no simulation is executed.")+'</p>';
}
function report(){
  return heading("COMPANION-ONLY SAMPLE / POWER PROS REPORT","Review what happened.","Submitted · Awaiting confirmation")+'<div class="report-progress"><span>01 Score</span><span>02 Statistics</span><span>03 Evidence</span><b>04 Review</b></div><div class="game-score"><div><strong>Cedar Valley</strong><p>Home</p></div><span class="score">5–3</span><div><strong>Harbor</strong><p>Away</p></div></div><div class="report-notice"><strong>Score-only report · Player statistics not supplied</strong>This result is pending review. Missing player lines and team totals must stay unknown, not zero.</div><div class="table-wrap"><table class="game-table"><thead><tr><th scope="col">Team</th><th scope="col">Runs</th><th scope="col">Hits</th><th scope="col">Errors</th></tr></thead><tbody><tr><td>Cedar Valley</td><td>5</td><td>Not supplied</td><td>Not supplied</td></tr><tr><td>Harbor</td><td>3</td><td>Not supplied</td><td>Not supplied</td></tr></tbody></table></div><div class="primary-row"><button type="button" class="g-button primary" data-demo="Confirmation preview only. This sample remains submitted; no official result was created.">Preview confirmation ↗</button><button type="button" class="g-button" data-demo="Dispute preview only. The real flow must preserve your reason, reviewed version and proposed correction.">Preview dispute</button></div><p class="small-note">Submitted by commissioner for Harbor · Reason: coach unavailable · Reviewed version 2 · Synthetic fixture. No victory celebration until an official result exists.</p>';
}
const renderers={today,roster,player,recruiting,game,report};
let cropObserver;
function cropArt(){
  // Crop a study cell in the browser without modifying the original image.
  // All three generated boards use a 1536 x 1024, two-by-two layout.
  preview.querySelectorAll(".portrait,.venue").forEach(el=>{
    const letter=el.classList.contains("portrait")?choices.portrait:choices.environment;
    const cell=idx(letter), sourceW=720, sourceH=452;
    const scale=Math.max(el.clientWidth/sourceW,el.clientHeight/sourceH);
    const x=(cell%2)*768+24, y=Math.floor(cell/2)*512+60;
    el.style.backgroundSize=(1536*scale)+"px "+(1024*scale)+"px";
    el.style.backgroundPosition=(-x*scale+(el.clientWidth-sourceW*scale)/2)+"px "+(-y*scale+(el.clientHeight-sourceH*scale)/2)+"px";
  });
}
function renderScreen(){
  preview.className="game-preview theme-"+choices.palette+" shell-"+choices.shell+" density-"+choices.density+" profile-"+choices.profile;
  preview.style.setProperty("--display",fonts[idx(choices.type)]);
  preview.style.setProperty("--stats",choices.type==="B"?'Inter, Arial, sans-serif':'"IBM Plex Mono", monospace');
  content.innerHTML=renderers[currentScreen]();
  preview.querySelectorAll(".portrait").forEach(el=>el.style.backgroundPosition=positions[idx(choices.portrait)]);
  preview.querySelectorAll(".venue").forEach(el=>el.style.backgroundPosition=positions[idx(choices.environment)]);
  cropObserver?.disconnect();cropArt();cropObserver=new ResizeObserver(cropArt);
  preview.querySelectorAll(".portrait,.venue").forEach(el=>cropObserver.observe(el));
  preview.querySelectorAll("[data-screen]").forEach(el=>{if(el.dataset.screen===currentScreen)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
  document.getElementById("preview-caption").textContent=nameFor("direction")+" · "+nameFor("shell")+" · "+nameFor("density")+" density";
  document.querySelectorAll("[data-direction]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.direction===choices.direction)));
  document.getElementById("direction-description").textContent=notes[choices.direction];
}
function sample(key,letter){
  const i=idx(letter);
  if(key==="portrait"||key==="environment")return '<span class="art-sample" style="background-image:url(assets/'+(key==="portrait"?"portrait":"environment")+'-studies.png);background-position:'+positions[i]+'" aria-hidden="true"></span>';
  if(key==="type")return '<span class="type-sample" style="font-family:'+fonts[i].replaceAll('"',"'")+'">Jalen Brooks<small>.318 AVG · 11–10 · 6⅔ IP<br>Clear names. Clear decisions.</small></span>';
  if(key==="palette")return '<span class="swatches" aria-hidden="true">'+palettes[i].map(c=>'<i style="background:'+c+'"></i>').join("")+'</span>';
  if(key==="marks")return '<span class="art-sample" style="background-image:url(assets/team-mark-studies.png);background-position:'+positions[i]+'" aria-hidden="true"></span>';
  if(key==="icons")return '<span class="icon-study icon-'+letter+'" aria-hidden="true"><span class="paper-icon"><i></i><i></i><b>✓</b></span><span class="icon-label">REPORT<br>Same action, four treatments</span></span>';
  return "";
}
function renderOptions(){
  const category=definitions.find(x=>x[0]===currentCategory);
  document.getElementById("decision-tabs").innerHTML=definitions.map(d=>'<button type="button" data-category="'+d[0]+'" aria-pressed="'+(d[0]===currentCategory)+'">'+d[1]+' '+d[2]+'</button>').join("");
  document.getElementById("option-grid").innerHTML=category[3].map((o,i)=>{
    const letter=String.fromCharCode(65+i);
    return '<button type="button" class="option" data-choice="'+letter+'" aria-pressed="'+(choices[currentCategory]===letter)+'"><small>'+category[1]+letter+'</small><strong>'+o[0]+'</strong>'+sample(currentCategory,letter)+'<p>'+o[1]+'</p><span class="tradeoff">'+o[2]+'</span></button>';
  }).join("");
  document.getElementById("recipe-text").textContent=definitions.map(d=>d[1]+choices[d[0]]).join(" · ");
}
function applyDirection(letter){Object.assign(choices,{marks:"A",icons:"A",motion:"A",audio:"A"},presets[letter]);renderScreen();renderOptions();}
document.getElementById("art-lab").addEventListener("click",event=>{
  const target=event.target.closest("button");if(!target)return;
  if(target.dataset.direction)applyDirection(target.dataset.direction);
  if(target.dataset.screen||target.dataset.go){currentScreen=target.dataset.screen||target.dataset.go;renderScreen();}
  if(target.dataset.category){currentCategory=target.dataset.category;renderOptions();document.querySelector('[data-category="'+currentCategory+'"]').focus();}
  if(target.dataset.choice){
    if(currentCategory==="direction")applyDirection(target.dataset.choice);
    else{choices[currentCategory]=target.dataset.choice;if(currentCategory==="profile")currentScreen="player";renderScreen();renderOptions();}
    document.getElementById("choice-status").textContent=nameFor(currentCategory)+" selected for your proposal.";
    document.querySelector('[data-choice="'+choices[currentCategory]+'"]').focus();
  }
  if(target.dataset.demo){let message=content.querySelector(".screen-message");if(!message){message=document.createElement("p");message.className="screen-message";message.setAttribute("role","status");content.append(message);}message.textContent=target.dataset.demo;}
});
document.getElementById("mode").addEventListener("change",event=>{mode=event.target.value;renderScreen();});
document.getElementById("restore-proposal").addEventListener("click",()=>{
  Object.assign(choices,friskProposal);renderScreen();renderOptions();
  document.getElementById("choice-status").textContent="Frisk's saved proposal restored. Approval pending.";
});
document.getElementById("copy-recipe").addEventListener("click",async()=>{
  const text="Frisk's proposed PAWA art direction (not yet approved):\n"+definitions.map(d=>d[1]+choices[d[0]]+" — "+d[2]+": "+nameFor(d[0])).join("\n");
  try{await navigator.clipboard.writeText(text);document.getElementById("choice-status").textContent="Choices copied. Paste them into the conversation when ready.";}
  catch{document.getElementById("choice-status").textContent="Copy is unavailable here. Your complete choice code is displayed above.";}
});
renderScreen();renderOptions();
