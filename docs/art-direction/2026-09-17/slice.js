/* Fictional design slice. No API calls, game state or persistent user data. */
"use strict";
const paths={
 home:"M12 2 1 11h3v11h6v-7h4v7h6V11h3L12 2Z",
 player:"M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM3 22v-3a7 7 0 0 1 7-6h4a7 7 0 0 1 7 6v3H3Z",
 report:"M5 2h10l5 5v15H5V2Zm9 2v5h5l-5-5ZM8 12v2h9v-2H8Zm0 4v2h9v-2H8Z"
};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));
const screen=document.getElementById("screen");
let current="today", mode="companion", dialogKind="confirm";
const mark=(away=false)=>'<span class="monogram '+(away?"away":"")+'" aria-hidden="true">'+(away?"HB":"CV")+'</span>';
const title=(eyebrow,name,right="")=>'<div class="page-title"><div><span class="eyebrow">'+eyebrow+'</span><h1>'+name+'</h1></div>'+right+'</div>';
const pending='<span class="status pending">Submitted · Awaiting confirmation</span>';
function today(){
 return title("YOUR PROGRAM / YOUR NEXT MOVE","Your matchday brief.",'<span class="date">FRIDAY<br>APRIL 09</span>')+
 (mode==="companion"?'<section class="priority-brief"><div><span class="eyebrow">REQUIRES YOUR REVIEW / APRIL 08</span><b>Cedar Valley 5–3 Harbor</b><p>Previous game · Version 2 · Score-only report</p></div><button class="primary" data-action="report">Review pending report →</button></section>':"")+
 '<section class="hero"><div class="venue" role="img" aria-label="Miniature Cedar Valley campus and baseball field"></div><div class="hero-copy"><span class="eyebrow">UP NEXT / APRIL 09 / SERIES OPENER</span><h2>Home field.<br>Big opportunity.</h2><div class="matchup">'+mark()+'<div>Cedar Valley<small>12–4 · Home</small></div><span class="versus">VS</span>'+mark(true)+'<div>Harbor<small>10–6 · Away</small></div></div><button class="secondary" data-action="prepare">'+(mode==="companion"?"Prepare Power Pros game":"Review lineup & matchup")+' <span aria-hidden="true">→</span></button></div><span class="hero-caption">CEDAR PARK / CEDAR VALLEY</span></section>'+
 '<div class="season-strip"><div><span class="tiny">OVERALL</span><b>12–4 <small>Record</small></b></div><div><span class="tiny">CONFERENCE</span><b>4–2 <small>Record</small></b></div><div><span class="tiny">LAST 5</span><b>4–1 <small>Record</small></b></div><div><span class="tiny">'+(mode==="companion"?"PLAY BY":"UP NEXT")+'</span><b>'+(mode==="companion"?'SUN <small>8 PM MT</small>':'G1 <small>Harbor</small>')+'</b></div></div>'+
 '<div class="two-col"><section><div class="section-head"><h2>On your desk</h2><span>2 decisions</span></div><button class="task-row" data-action="'+(mode==="companion"?"report":"prepare")+'"><span class="number">01</span><div><b>'+(mode==="companion"?"Review the previous Harbor report":"Review your starting pitcher")+'</b><small>'+(mode==="companion"?"Previous game · Score-only · Awaiting confirmation":"Miles Carter · Resting · Check availability")+'</small></div><span class="arrow">↗</span></button><button class="task-row" data-action="player"><span class="number">02</span><div><b>Check your center-field matchup</b><small>Jalen Brooks · Range 88 · Arm 64</small></div><span class="arrow">↗</span></button></section><section><div class="section-head"><h2>Inside the program</h2><span>Player spotlight</span></div><article class="story"><div class="portrait" role="img" aria-label="Cel portrait of Jalen Brooks"></div><div class="story-copy"><span class="tiny">24 / CF / JUNIOR</span><h3>A steady bat.<br>A familiar face.</h3><p>Brooks brings contact and range to the heart of your lineup.</p><button class="text-button" data-action="player">Meet your center fielder ↗</button></div></article></section></div>'+
 '<details class="prep" id="preparation"><summary>Game preparation checklist</summary><ol><li>Review the starting lineup and pitcher availability.</li><li>'+(mode==="companion"?"Verify the roster and agreed league rules used in Power Pros.":"Review Harbor’s scouting report and your defensive matchups.")+'</li><li>'+(mode==="companion"?"Play in Power Pros, then submit the result for league review.":"Choose your starter before advancing to the game.")+'</li></ol><p class="mode-note">'+(mode==="companion"?"Games are played in Power Pros. This companion does not synchronize with the console.":"Solo mode simulates games in PAWA. This design slice does not execute a simulation.")+'</p></details>';
}
function player(){
 const ratings=[["Contact",82],["Power",76],["Speed",88],["Range",88],["Arm",64]];
 return title("PLAYER PROFILE / CEDAR VALLEY","Your everyday cornerstone.",'<span class="status ready">Ready to play</span>')+
 '<div class="profile-hero"><div class="portrait-stage"><div class="portrait" role="img" aria-label="Jalen Brooks, the same cel character used on Today"></div><span class="jersey-number">24</span><span class="portrait-caption">CEL PORTRAIT STUDY / UNIFORM PENDING</span></div><section><span class="eyebrow">CENTER FIELD / JUNIOR</span><h2 class="player-name">Jalen Brooks</h2><p class="player-bio">Bats left · Throws right<br>Year 3 of 4 · Everyday starter</p><div class="identity-tags"><span>CONTACT BAT</span><span>PLUS RANGE</span><span>TEAM CAPTAIN</span></div><p class="quote">“A steady bat. A voice the clubhouse trusts.”<br><span class="tiny">COACH’S NOTE / FICTIONAL PROFILE</span></p><button class="secondary" data-action="prepare">Review next matchup <span aria-hidden="true">↗</span></button></section></div>'+
 '<div class="two-col profile-lower"><section class="panel"><div class="section-head"><h2>Player ratings</h2><span>0–100 scale</span></div>'+ratings.map(([label,n])=>'<div class="rating-row"><span>'+label+'</span><span class="meter" aria-hidden="true"><i style="width:'+n+'%"></i></span><b>'+n+'</b></div>').join("")+'<p class="muted" style="margin-top:20px">Coach’s read: contact and range suit center field. The arm is the tradeoff on deep throws.</p></section><section class="panel"><div class="section-head"><h2>Season performance</h2><span>2027 · Official games</span></div><div class="stats-grid">'+[["AVG",".318"],["OBP",".400"],["SLG",".500"],["HR","2"],["RBI","14"],["AB","44"]].map(([k,v])=>'<div><span class="tiny">'+k+'</span><b>'+v+'</b></div>').join("")+'</div><p class="muted">Recorded batting lines only. Pending reports and score-only games do not add player statistics.</p></section></div>'+
 '<section class="career"><div class="section-head"><h2>A career taking shape</h2><span>Program history</span></div><div class="career-grid"><div><span class="tiny">2025 / FRESHMAN</span><p>Earned the fourth-outfielder role.</p></div><div><span class="tiny">2026 / SOPHOMORE</span><p>Won an everyday place in center.</p></div><div><span class="tiny">2027 / JUNIOR</span><p>A familiar voice for a young lineup.</p></div></div></section>';
}
function report(){
 return title("POWER PROS COMPANION / PREVIOUS GAME / CV–HB","Review the result.",pending)+
 (mode==="solo"?'<p class="report-warning">This is a companion report sample. Solo simulation results use a separate result flow.</p>':"")+
 '<div class="report-grid"><section><div class="report-score"><div>'+mark()+'<b>Cedar Valley</b><small>Home</small></div><div class="score">5–3<small>REPORTED SCORE</small></div><div>'+mark(true)+'<b>Harbor</b><small>Away</small></div></div><div class="report-warning"><b>Score-only report · Player lines not supplied</b>The submitted score is awaiting review. Hits, errors and player statistics are unknown. This game has not updated the displayed official records.</div><div class="table-scroll" tabindex="0" role="region" aria-label="Reported team totals"><table><thead><tr><th scope="col">Team</th><th scope="col">R</th><th scope="col">H</th><th scope="col">E</th></tr></thead><tbody><tr><th scope="row">Cedar Valley</th><td>5</td><td><span class="unknown">Not supplied</span></td><td><span class="unknown">Not supplied</span></td></tr><tr><th scope="row">Harbor</th><td>3</td><td><span class="unknown">Not supplied</span></td><td><span class="unknown">Not supplied</span></td></tr></tbody></table></div><section class="review-history"><div class="section-head"><h2>Report history</h2><span>Version 2</span></div><p><b>Version 1</b> · Commissioner submitted 5–2 for Harbor.</p><p><b>Version 2</b> · Commissioner corrected Harbor’s score to 3. Reason: score transcription error.</p><p><b>Current state</b> · Awaiting Cedar Valley review of version 2.</p></section></section><aside><section class="panel"><div class="section-head"><h2>Before you decide</h2></div><dl class="report-meta"><div><dt>Game</dt><dd>April 08, 2027 · Cedar Park<br>Previous game · CV–HB</dd></div><div><dt>Submitted by</dt><dd>Commissioner, on behalf of Harbor</dd></div><div><dt>Submission reason</dt><dd>Harbor coach unavailable</dd></div><div><dt>Reviewed version</dt><dd>2 · Reported score 5–3</dd></div></dl><div class="evidence"><span class="tiny">EVIDENCE</span><p>No attachment supplied. Check the agreed result with the opposing coach before confirming.</p></div></section><p class="mode-note">Sample workflow only. League-specific evidence requirements still need to be defined; this screen does not waive them.</p></aside><section class="report-actions" aria-label="Review decision"><div class="button-row"><button class="primary" data-action="confirm">'+icon("report")+'Preview confirmation</button><button class="secondary" data-action="dispute">Preview dispute</button></div><p class="mode-note">Reviewing as Cedar Valley’s coach · Version 2<br>Only an authorized reviewer can confirm an official result in the game.</p></section></div>';
}
function crop(){
 screen.querySelectorAll(".portrait,.venue").forEach(el=>{
  const cell=el.classList.contains("portrait")?1:3;
  const sw=720,sh=452,scale=Math.max(el.clientWidth/sw,el.clientHeight/sh);
  const x=(cell%2)*768+24,y=Math.floor(cell/2)*512+60;
  el.style.backgroundSize=1536*scale+"px "+1024*scale+"px";
  el.style.backgroundPosition=(-x*scale+(el.clientWidth-sw*scale)/2)+"px "+(-y*scale+(el.clientHeight-sh*scale)/2)+"px";
 });
}
const observer=new ResizeObserver(crop);
function render(focus=true){
 observer.disconnect();screen.innerHTML=({today,player,report})[current]();
 document.querySelectorAll("[data-screen]").forEach(b=>{if(b.dataset.screen===current)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
 screen.classList.remove("screen-enter");void screen.offsetWidth;screen.classList.add("screen-enter");
 crop();screen.querySelectorAll(".portrait,.venue").forEach(el=>observer.observe(el));
 if(focus)screen.focus();
}
function openReview(kind){
 dialogKind=kind;
 document.getElementById("dialog-title").textContent=kind==="confirm"?"Confirm this reported score?":"Flag a disagreement";
 document.getElementById("dialog-description").textContent="Cedar Valley 5 · Harbor 3 / April 08 / Version 2";
 document.getElementById("dialog-fields").innerHTML=kind==="confirm"?'<label><input type="checkbox" id="ack" required>I reviewed version 2 and understand that player statistics and evidence were not supplied.</label>':'<label for="reason">Reason for disagreement</label><textarea id="reason" required maxlength="500" placeholder="Describe the score or detail that needs correction."></textarea><label for="correction">Proposed correction (optional)</label><textarea id="correction" maxlength="500" placeholder="State the corrected score or detail, if known."></textarea>';
 document.getElementById("review-submit").disabled=kind==="confirm";
 document.getElementById("review-dialog").showModal();
}
document.addEventListener("click",e=>{
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.screen){current=b.dataset.screen;render();}
 const action=b.dataset.action;
 if(action==="player"||action==="report"){current=action;render();}
 if(action==="prepare"){current="today";render();const details=document.getElementById("preparation");details.open=true;details.querySelector("summary").focus();details.scrollIntoView({block:"center",behavior:"auto"});}
 if(action==="confirm"||action==="dispute")openReview(action);
});
document.getElementById("mode").addEventListener("change",e=>{mode=e.target.value;render(false);});
document.getElementById("close-dialog").addEventListener("click",()=>document.getElementById("review-dialog").close());
document.getElementById("dialog-fields").addEventListener("input",()=>{if(dialogKind==="confirm")document.getElementById("review-submit").disabled=!document.getElementById("ack").checked;});
document.getElementById("review-form").addEventListener("submit",e=>{
 e.preventDefault();
 if(dialogKind==="dispute"&&!document.getElementById("reason").value.trim()){document.getElementById("reason").setCustomValidity("Enter a reason for the disagreement.");document.getElementById("reason").reportValidity();return;}
 document.getElementById("review-dialog").close();
 document.getElementById("notice").textContent=(dialogKind==="confirm"?"Confirmation":"Dispute")+" preview complete. Sample remains submitted; no official result changed.";
});
document.getElementById("dialog-fields").addEventListener("input",e=>e.target.setCustomValidity(""));
render(false);
