"use strict";
/* OFFICER FRANK — noir suspense. Single-file engine, placeholder art.
   Art assets (assets/<key>.jpg) are loaded if present, else CSS placeholder. */

// ---------------------------------------------------------------- audio
const Audio = (() => {
  let ac=null, drone=[], droneGain=null, hbTimer=0, alive=false;
  function ctx(){ if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return ac; }
  function start(){
    const a=ctx(); if(!a||alive) return; alive=true;
    droneGain=a.createGain(); droneGain.gain.value=0.0; droneGain.connect(a.destination);
    [55,55.4,82.5].forEach(f=>{ const o=a.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
      const g=a.createGain(); g.gain.value=0.33; o.connect(g).connect(droneGain); o.start(); drone.push(o); });
  }
  function tension(t){ if(droneGain&&ac) droneGain.gain.setTargetAtTime(0.015+t*0.10, ac.currentTime, 0.3);
    drone.forEach((o,i)=>o.frequency.setTargetAtTime([55,55.4,82.5][i]*(1+t*0.06), ac.currentTime,0.4)); }
  function blip(freq,dur,type,vol,slide){ const a=ctx(); if(!a) return;
    const o=a.createOscillator(), g=a.createGain(); o.type=type||'square'; o.frequency.value=freq;
    if(slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime+dur);
    g.gain.value=vol||0.08; g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime+dur); }
  function noise(dur,vol){ const a=ctx(); if(!a) return;
    const n=a.sampleRate*dur, buf=a.createBuffer(1,n,a.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
    const s=a.createBufferSource(); s.buffer=buf; const g=a.createGain(); g.gain.value=vol||0.5;
    s.connect(g).connect(a.destination); s.start(); }
  const gunshot=()=>{ noise(0.22,0.6); blip(120,0.18,'sawtooth',0.18,40); };
  const npcShot=()=>{ noise(0.26,0.7); blip(90,0.22,'sawtooth',0.22,32); };
  const click=()=>blip(1400,0.03,'square',0.05);
  const cock=()=>{ blip(800,0.04,'square',0.06); setTimeout(()=>blip(600,0.05,'square',0.06),60); };
  const heart=()=>{ blip(60,0.13,'sine',0.16,42); setTimeout(()=>blip(55,0.12,'sine',0.12,40),150); };
  const stingGood=()=>{ blip(330,0.5,'triangle',0.10,500); };
  const stingBad =()=>{ blip(180,0.8,'sawtooth',0.12,70); };
  const stingDead=()=>{ blip(140,1.4,'sawtooth',0.14,40); noise(0.5,0.3); };
  return {start,tension,gunshot,npcShot,click,cock,heart,stingGood,stingBad,stingDead,resume:()=>ctx()&&ac.resume&&ac.resume()};
})();

// ---------------------------------------------------------------- content
// truth: innocent | prostitute | scammer.  threat = armed && hostile.
// trigger: how a hostile draws — 'detain' | 'harass' | 'random' | 'never'
const CASES = [
  {
    id:1, loc:"E. Wharf Rd, 11:40pm", art:"npc_lena", env:"rgba(40,30,80,.35)",
    desc:"Woman, short red dress, leaning on a parked sedan.",
    truth:"innocent", armed:false, hostile:false,
    intro:"She doesn't look up. \"You need something, officer, or you just like the view?\"",
    Q:[
      {q:"What are you doing out here this late?", a:"\"Waiting on my sister. Her shift ends at midnight. We share the car.\"", tell:"She checks her phone — a real text thread.", heat:0},
      {q:"Where do you work?", a:"\"Mercy General. I'm a night nurse. These shoes are murder, before you ask about the heels.\"", heat:0},
      {q:"You always dress like that to wait for your sister?", a:"\"Came straight from a friend's birthday. That a crime now?\"", tell:"Her jaw tightens. Insulted, not nervous.", heat:2},
      {q:"Anybody been bothering you tonight?", a:"\"Just you, sweetheart.\" A tired half-smile.", heat:0},
      {q:"Mind if I see some ID?", a:"She hands over a hospital badge without hesitation. Lena R. It checks.", heat:1},
      {q:"You carrying anything I should know about?", a:"\"A rape whistle and bus fare. Want to frisk a nurse on Wharf Road?\"", heat:2},
    ]
  },
  {
    id:2, loc:"Pawn district, 12:15am", art:"npc_marcus", env:"rgba(70,50,20,.34)",
    desc:"Man in a sharp coat, two phones, a roll of cash half-showing.",
    truth:"scammer", armed:false, hostile:false, trigger:"never",
    intro:"\"Officer! Good evening. Whatever it is, I assure you it's a misunderstanding.\" Big smile.",
    Q:[
      {q:"What's with the two phones?", a:"\"Business and personal. A man's got to keep his worlds apart.\"", tell:"One screen lights up: 'PAYMENT FAILED — RESEND?'", heat:1},
      {q:"Where'd the cash come from?", a:"\"Sold a watch. Beautiful piece. You want one? I do friends-of-law-enforcement pricing.\"", heat:1},
      {q:"What exactly do you do for work?", a:"\"Acquisitions. Opportunities. I connect people to... value.\"", tell:"He won't say a company name.", heat:1},
      {q:"You got a permit for street sales?", a:"\"Permit. Right. It's being processed. Slow city, you know how it is.\"", heat:2},
      {q:"Who were you just texting?", a:"\"A client. Lonely widow, lovely woman, sending her late husband's pension to my—to an investment.\"", tell:"He catches himself a beat too late.", heat:2},
      {q:"Empty your pockets for me.", a:"\"Sure, sure—\" Eleven gift cards, three IDs that aren't his, a list of names with dollar amounts.", heat:2},
    ]
  },
  {
    id:3, loc:"Bus shelter, 12:50am", art:"npc_dee", env:"rgba(20,50,60,.32)",
    desc:"Young woman, fishnets, glancing up the street every few seconds.",
    truth:"prostitute", armed:true, hostile:true, hp:1, trigger:"detain",
    intro:"\"I'm just waiting for the bus.\" She doesn't make eye contact.",
    drawLine:"\"...you know what? I'm not going anywhere with you.\"",
    Q:[
      {q:"Bus stopped running an hour ago. What are you really doing?", a:"\"Then I'll walk. Is that illegal too?\"", tell:"Her hand keeps drifting to her bag.", heat:2},
      {q:"You keep watching that corner. Expecting someone?", a:"\"No.\" Too fast.", tell:"She glances at the corner again.", heat:1},
      {q:"You okay? You can tell me if someone's making you do this.", a:"A flicker — then it's gone. \"I'm fine. I don't need saving.\"", heat:0},
      {q:"What's in the bag?", a:"\"Girl stuff. You really want to do this?\"", tell:"She pulls the bag in tight against her hip.", heat:2},
      {q:"I'm going to need you to step over to the car.", a:"\"No.\"", tell:"Her whole body goes still.", heat:3},
    ]
  },
  {
    id:4, loc:"24hr diner lot, 1:20am", art:"npc_walt", env:"rgba(30,40,30,.30)",
    desc:"Older man, work jacket, thermos, sitting on his truck's tailgate.",
    truth:"innocent", armed:true, hostile:false, trigger:"never",
    intro:"\"Evenin'. Long night for both of us, looks like.\" He raises the thermos a little.",
    Q:[
      {q:"What are you doing parked out here?", a:"\"Coffee before the drive. Forty years hauling freight, I don't push it tired anymore.\"", heat:0},
      {q:"That a weapon under the seat?", a:"\"Licensed .38. Paperwork's in the glovebox. I'll keep both hands right here while you look.\"", tell:"He sets the thermos down slow and shows his palms.", heat:1},
      {q:"Long way from home?", a:"\"Three states. Granddaughter's birthday tomorrow. Got her a bike in the back.\"", heat:0},
      {q:"You been drinking?", a:"\"Coffee, son. You're welcome to smell it.\"", heat:0},
      {q:"Step out of the vehicle.", a:"\"Sure thing. Slow as you like. No trouble here.\"", tell:"He moves carefully, deliberately unthreatening.", heat:0},
    ]
  },
  {
    id:5, loc:"Alley behind the club, 1:55am", art:"npc_rico", env:"rgba(60,20,40,.36)",
    desc:"Man pacing, hood up, hand never leaving his jacket pocket.",
    truth:"scammer", armed:true, hostile:true, hp:2, trigger:"random",
    intro:"\"I didn't do nothing. Whatever they told you, it's a lie.\"",
    drawLine:"\"Nah. Nah, I'm done talking.\"",
    Q:[
      {q:"Nobody told me anything. Why so jumpy?", a:"\"I ain't jumpy. You're the one with a gun.\"", tell:"He shifts his weight to the back foot.", heat:1},
      {q:"What's in the pocket?", a:"\"My hand. That a problem?\"", tell:"He does not take it out.", heat:2},
      {q:"You running cards out here? Skimmers?", a:"\"I don't know what you're talking about.\"", tell:"His eyes flick to a duffel by the dumpster.", heat:2},
      {q:"Take your hand out of the jacket. Slowly.", a:"He doesn't.", tell:"\"...\"", heat:3},
      {q:"Last chance — hand. Out. Now.", a:"He stares at you. The alley is very quiet.", heat:3},
    ]
  },
  {
    id:6, loc:"Riverside path, 2:30am", art:"npc_grace", env:"rgba(30,40,70,.30)",
    desc:"Woman in joggers, earbuds in, stretching by a bench.",
    truth:"innocent", armed:false, hostile:false,
    intro:"She pulls out one earbud. \"Is everything alright?\"",
    Q:[
      {q:"It's almost 3am. Bit late for a run?", a:"\"I work doubles. This is the only time the path's empty. I like the quiet.\"", heat:0},
      {q:"You live around here?", a:"\"Two blocks up, the blue building. You can walk me if you don't believe me.\"", heat:0},
      {q:"You seen anyone suspicious out here?", a:"\"Just a guy by the underpass earlier. Gave me a weird feeling. Went the other way.\"", tell:"Genuinely helpful.", heat:0},
      {q:"Why's your hand in your pocket?", a:"\"Pepper spray. Woman, alone, 3am — you'd carry it too.\"", tell:"She shows it to you, then puts it back.", heat:1},
      {q:"ID?", a:"\"In my armband.\" She hands it over. Local address, matches.", heat:1},
    ]
  },
  {
    id:7, loc:"Motel parking, 3:10am", art:"npc_sasha", env:"rgba(60,30,60,.36)",
    desc:"Woman in a fur-trim coat, heavy makeup, counting bills.",
    truth:"prostitute", armed:false, hostile:false, trigger:"never",
    intro:"She tucks the cash away fast. \"I already paid for the room, officer. I'm not bothering anybody.\"",
    Q:[
      {q:"Whose money is that?", a:"\"Mine. Tips. I dance at the Aces, three nights a week. Slow night, so don't get excited.\"", heat:1},
      {q:"You staying here tonight?", a:"\"For a few hours. Cheaper than a cab home at this hour.\"", heat:0},
      {q:"You doing okay? Anybody pressuring you?", a:"A long pause. \"...No. I handle myself. Always have.\"", tell:"She doesn't quite meet your eyes.", heat:0},
      {q:"I could run you in for solicitation.", a:"\"For standing in a parking lot? Try it. I've got a lawyer who eats cases like that.\"", heat:2},
      {q:"Step over here.", a:"She sighs and complies, hands visible, done this before.", tell:"No fear. Just tired.", heat:1},
    ]
  },
  {
    id:8, loc:"Gas station, 3:45am", art:"npc_eddie", env:"rgba(50,40,20,.32)",
    desc:"Twitchy man, hoodie, keeps looking at the clerk through the window.",
    truth:"scammer", armed:true, hostile:true, hp:1, trigger:"harass",
    intro:"\"Just getting smokes, man. You always roll up on people buying smokes?\"",
    drawLine:"\"You don't know me. You don't know NOTHING about me.\"",
    Q:[
      {q:"Why do you keep eyeing the clerk?", a:"\"I'm not. You're paranoid.\"", tell:"He absolutely is.", heat:2},
      {q:"What's the bulge in your hoodie?", a:"\"My phone. Chill.\"", tell:"It is not the shape of a phone.", heat:2},
      {q:"This your car? Plates don't match the registration I'm seeing.", a:"\"It's my cousin's.\"", tell:"He can't name the cousin.", heat:2},
      {q:"You're sweating through your shirt in 50-degree weather.", a:"\"I run hot. We done?\"", heat:3},
    ]
  },
];

// ---------------------------------------------------------------- DOM
const $=id=>document.getElementById(id);
const scenes={title:$("s-title"),how:$("s-how"),enc:$("s-enc"),end:$("s-end")};
function show(name){ Object.values(scenes).forEach(s=>s.classList.remove("on")); scenes[name].classList.add("on"); }

// ---------------------------------------------------------------- record (career)
const REC_KEY="officerFrank.record";
function loadRec(){ try{return JSON.parse(localStorage.getItem(REC_KEY))||{}}catch(e){return{}} }
function saveRec(r){ try{localStorage.setItem(REC_KEY,JSON.stringify(r))}catch(e){} }
let rec=Object.assign({cases:0,commend:0,marks:0,kills:0,deaths:0},loadRec());
function recLine(){ return `Cases ${rec.cases} · Commendations ${rec.commend} · Marks ${rec.marks} · Justified ${rec.kills} · Deaths ${rec.deaths}` +
  (rec.marks>=3 ? "  ⚠ UNDER REVIEW" : ""); }

// ---------------------------------------------------------------- gun placeholder art (SVG data-uri)
const GUN_SVG = `data:image/svg+xml;utf8,`+encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
<g fill='#15161c' stroke='#2a2c36' stroke-width='3'>
<path d='M70 250 q-10 -70 30 -100 l160 -8 q30 0 34 26 l4 40 -60 6 -10 -22 -150 8 q-18 30 6 60 z'/>
<rect x='250' y='150' width='120' height='30' rx='6'/>
<circle cx='150' cy='150' r='34' fill='#1b1c24'/>
</g>
<circle cx='150' cy='150' r='14' fill='#0c0d12' stroke='#3a3c48' stroke-width='3'/>
<rect x='250' y='156' width='120' height='6' fill='#3a3c48'/>
</svg>`);

// ---------------------------------------------------------------- combat / encounter state
let C=null;            // current case (deep-ish copy)
let asked=0, drew=false, resolved=false;
// gun physics
let drawn=false, aim=0, recoil=0;        // aim 0..1 (on target at 1), recoil lift
let bullets=6;
// npc
let npcDrawing=false, npcAim=0, npcDead=false, npcTelegraph=0, npcDrawScheduled=-1;
let tension=0, encStart=0, last=0;
const DRAW_TIME=0.5, NPC_DRAW=0.9;

function isThreat(c){ return c.armed && c.hostile; }

function startCase(){
  const src=CASES[rec.cases % CASES.length];
  C=JSON.parse(JSON.stringify(src)); C.hp=src.hp||1; C._asked=[];
  asked=0; drew=false; resolved=false;
  drawn=false; aim=0; recoil=0; bullets=6;
  npcDrawing=false; npcAim=0; npcDead=false; npcTelegraph=0;
  tension=0;
  // schedule a 'random' hostile to reach for it on their own timeline
  npcDrawScheduled = (C.trigger==="random") ? (6+Math.random()*7) : -1;

  $("caseNo").textContent=String(C.id).padStart(2,"0");
  $("caseLoc").textContent=C.loc;
  $("qLeft").textContent=5;
  $("convo").innerHTML="";
  $("envTint").style.background=C.env||"transparent";
  $("blood").style.opacity=0; document.querySelectorAll(".splat").forEach(s=>s.remove());
  $("cyl").style.display="none";
  setGun(); renderCyl();
  // portrait: try art, else placeholder
  const p=$("portrait"); p.classList.add("ph");
  const img=new Image();
  img.onload=()=>{ p.style.backgroundImage=`url(assets/${C.art}.jpg)`; p.classList.remove("ph"); };
  img.src=`assets/${C.art}.jpg`;
  $("pdesc").textContent=C.desc;

  show("enc");
  Audio.start(); Audio.resume();
  pushLine("sys", `CASE ${String(C.id).padStart(2,"0")} — ${C.loc}`);
  setTimeout(()=>pushLine("them", C.intro), 350);
  renderChoices(); renderResolve();
  encStart=performance.now()/1000; last=encStart;
  requestAnimationFrame(loop);
}

function pushLine(kind,text,tell){
  const d=document.createElement("div"); d.className="line "+kind; d.innerHTML=text;
  if(tell){ const t=document.createElement("span"); t.className="tell"; t.textContent=tell; d.appendChild(t); }
  $("convo").appendChild(d); $("convo").scrollTop=$("convo").scrollHeight;
}

// pick up to 3 unused questions
function renderChoices(){
  const box=$("choices"); box.innerHTML="";
  if(resolved || npcDrawing){ return; }
  if(asked>=5){
    const note=document.createElement("div"); note.className="choice"; note.style.opacity=.6; note.style.pointerEvents="none";
    note.textContent="No more questions — push further and it's harassment."; box.appendChild(note);
    return;
  }
  const pool=C.Q.map((q,i)=>({q,i})).filter(o=>!C._asked.includes(o.i));
  // stable-ish selection: first 3 unused
  pool.slice(0,3).forEach((o,n)=>{
    const b=document.createElement("div"); b.className="choice"; b.dataset.qi=o.i;
    b.innerHTML=`<span class="k">${n+1}</span>${o.q.q}`;
    b.onclick=()=>ask(o.i); box.appendChild(b);
  });
}
function renderResolve(){
  const r=$("resolve"); r.innerHTML="";
  if(resolved){ return; }
  const mk=(label,fn)=>{ const b=document.createElement("div"); b.className="choice"; b.textContent=label; b.onclick=fn; return b; };
  r.appendChild(mk("LET THEM GO", ()=>letGo()));
  r.appendChild(mk("DETAIN", ()=>detain()));
}

function ask(qi){
  if(resolved||npcDrawing||asked>=5) return;
  const item=C.Q[qi]; if(!item||C._asked.includes(qi)) return;
  C._asked.push(qi); asked++; $("qLeft").textContent=Math.max(0,5-asked);
  Audio.click();
  pushLine("me", item.q);
  tension=Math.min(1, tension + (item.heat||0)*0.12 + 0.04);
  setTimeout(()=>{ pushLine("them", item.a, item.tell); renderChoices(); }, 480);
  // harass-trigger hostiles draw when cornered on the last question
  if(isThreat(C) && C.trigger==="harass" && asked>=5){ setTimeout(()=>npcDraw(), 1100); }
  renderChoices();
}

function letGo(){
  if(resolved) return; resolved=true;
  if(C.truth==="innocent" && drew){            // you pulled a gun on a citizen, then walked it back
    rec.marks++;
    end("mark","DREW ON A CITIZEN","📋","They were clean the whole time, and you had iron in your hand. The complaint writes itself. A mark on your record.",true);
  } else if(isThreat(C)){                       // dangerous, and you walked — lucky, never knew it
    end("clean","WALKED AWAY","🚶","You let them go. Your gut said move on — and you'll never know how close that was.",false);
  } else if(C.truth==="innocent"){
    end("clean","CLEARED","✅","An innocent person, treated like one. No incident. That's the job done right.",false);
  } else {
    end("clean","SLIPPED AWAY","🌫️","You had a read and let it ride. They melt into the dark. No arrest, no harm — call it a draw.",false);
  }
  finalizeMarks();
}
function detain(){
  if(resolved||npcDrawing) return;
  if(isThreat(C) && (C.trigger==="detain"||C.trigger==="harass"||C.trigger==="random")){
    npcDraw(); return; // detaining a dangerous one sets them off
  }
  resolved=true;
  if(C.truth==="innocent"){
    rec.marks++; end("mark","FALSE ARREST","📋","You cuffed a citizen who did nothing. The complaint's already filed. A mark on your record.",true);
  } else { // scammer / prostitute, non-threat → good collar
    rec.commend++; end("clean","GOOD COLLAR","🚔","They go in quiet. The charges stick. Commendation logged.",false);
  }
  finalizeMarks();
}

// ---- the draw ----
function npcDraw(){
  if(npcDrawing||resolved||npcDead) return;
  npcDrawing=true; tension=1; renderChoices(); renderResolve();
  Audio.heart();
  if(C.drawLine) pushLine("them", C.drawLine);
  pushLine("sys","HE'S REACHING");
  npcTelegraph=0.55;  // wind-up before their gun comes up
}

// ---- player gun ----
function setGun(){ const g=$("gun"); g.src=GUN_SVG;
  const y = drawn ? (130 - aim*114 - recoil*70) : 130;
  g.style.transform=`translate(-30%, ${y}%)`; }
function renderCyl(){ const c=$("cyl"); c.innerHTML=""; c.style.display=drawn?"flex":"none";
  for(let i=0;i<6;i++){ const r=document.createElement("div"); r.className="r"+(i<(6-bullets)?" spent":""); c.appendChild(r); } }

function pullGun(){
  if(resolved||npcDead) return;
  if(!drawn){ drawn=true; aim=0; Audio.cock(); drew=true; $("bPull").classList.add("armed"); renderCyl(); }
}
function shoot(){
  if(resolved) return;
  if(!drawn){ return; }            // must pull first
  if(bullets<=0){ Audio.click(); return; }
  const settled = aim>=0.9 && recoil<0.12;   // was the gun up AND steady from the last kick?
  bullets--; renderCyl();
  recoil += 0.5;                   // this shot kicks the muzzle up
  Audio.gunshot(); flashMuzzle();
  if(settled && !npcDead){
    C.hp--; bloodHit();
    if(C.hp<=0){ npcKilled(); }
  } else {
    pushLine("sys", aim<0.9 ? "— round into the pavement —" : "— still rising — round goes wide —");
  }
  if(bullets<=0 && !npcDead && !resolved){ pushLine("sys","— cylinder empty —"); }
}

function npcKilled(){
  npcDead=true; npcDrawing=false; Audio.stingBad();
  bigBlood();
  setTimeout(()=>{
    if(isThreat(C)){
      rec.kills++; end("just","JUSTIFIED","🟢","His gun hits the ground next to him. Internal Affairs reviews the scene. The hand was on a weapon. <b>Good shooting, officer.</b>",false);
    } else {
      end("jail","CONVICTED","⛓️","You stand over a body that never held a weapon. The jury takes ninety minutes. <b>You'll do your time in the same system you served.</b>",false);
    }
    finalizeMarks();
  }, 900);
}
function playerHit(){
  if(resolved) return; resolved=true;
  Audio.npcShot(); npcFlash(); Audio.stingDead();
  $("blood").style.opacity=.95;
  $("blood").style.background="radial-gradient(circle at 50% 60%,rgba(184,18,26,.5),rgba(80,0,4,.8))";
  // tilt the world down toward the ground, bloody hand
  const app=$("app"); app.style.transition="transform 1.4s ease-in"; app.style.transformOrigin="50% 80%";
  app.style.transform="rotate(7deg) translateY(14%) scale(1.1)";
  for(let i=0;i<10;i++) splat();
  rec.deaths++;
  setTimeout(()=>{ app.style.transition=""; app.style.transform="";
    end("grave","THE GRAVEYARD","🪦","You went down on the pavement looking at your own hand. They never even raised their voice — just changed their mind. <b>Watch the hands. Always the hands.</b>",false);
    finalizeMarks();
  }, 1500);
}

function finalizeMarks(){ rec.cases++; saveRec(rec); }

// ---- fx ----
function flashMuzzle(){ const m=$("muzzle"); m.style.opacity=1; const f=$("flash"); f.style.opacity=.5;
  setTimeout(()=>{m.style.opacity=0;f.style.opacity=0;},60); }
function npcFlash(){ const m=$("npcMuzzle"); m.style.opacity=1; const f=$("flash"); f.style.opacity=.7;
  setTimeout(()=>{m.style.opacity=0;f.style.opacity=0;},80); }
function bloodHit(){ const b=$("blood"); b.style.opacity=.4;
  b.style.background="radial-gradient(circle at 50% 38%,rgba(184,18,26,.5),transparent 55%)";
  setTimeout(()=>b.style.opacity=0,160); splat(); }
function bigBlood(){ const b=$("blood"); b.style.opacity=.85;
  b.style.background="radial-gradient(circle at 50% 40%,rgba(150,4,10,.75),rgba(60,0,4,.5) 50%,transparent 70%)";
  for(let i=0;i<7;i++) splat(); }
function splat(){ const s=document.createElement("div"); s.className="splat";
  const sz=20+Math.random()*90; s.style.width=s.style.height=sz+"px";
  s.style.left=(20+Math.random()*60)+"%"; s.style.top=(25+Math.random()*45)+"%";
  $("s-enc").appendChild(s); }

// ---- main loop ----
function loop(t){
  if(!scenes.enc.classList.contains("on")) return;
  t/=1000; let dt=Math.min(0.05,t-last); last=t;

  // player gun physics
  if(drawn && aim<1){ aim=Math.min(1, aim+dt/DRAW_TIME); }
  recoil = Math.max(0, recoil - dt/0.4);   // muzzle falls back over ~0.4s
  setGun();

  // button live states
  $("bShoot").classList.toggle("live", drawn && aim>=0.9 && recoil<0.12 && bullets>0 && !resolved);

  // npc draw timeline
  if(npcDrawScheduled>0 && !npcDrawing && !npcDead && !resolved && (t-encStart)>=npcDrawScheduled){
    npcDrawScheduled=-1; npcDraw();
  }
  if(npcDrawing && !npcDead && !resolved){
    if(npcTelegraph>0){ npcTelegraph-=dt; }
    else { npcAim=Math.min(1, npcAim+dt/NPC_DRAW);
      if(npcAim>=1){ playerHit(); } }
  }

  // audio tension: rises with conversation + spikes during a draw
  let tgt=tension;
  if(npcDrawing && !npcDead) tgt=1;
  Audio.tension(tgt);
  $("tensionFill").style.width=(tgt*100)+"%";
  // heartbeat cadence under pressure
  hbAcc-=dt; if((tgt>0.55||npcDrawing) && hbAcc<=0){ Audio.heart(); hbAcc = npcDrawing?0.42:(0.9-tgt*0.4);
    $("hb").style.boxShadow=`inset 0 0 200px 30px rgba(184,18,26,${0.10+tgt*0.18})`;
    setTimeout(()=>{ if($("hb")) $("hb").style.boxShadow="inset 0 0 200px 30px rgba(184,18,26,0)"; },180);
  }

  requestAnimationFrame(loop);
}
let hbAcc=0;

// ---------------------------------------------------------------- endings
function end(kind,title,icon,body,isMark){
  resolved=true;
  scenes.end.className="scene on ending-"+kind;
  $("endIcon").textContent=icon; $("endTitle").innerHTML=title; $("endBody").innerHTML=body;
  $("endRec").textContent=recLine();
  if(kind==="just") Audio.stingGood(); else if(kind==="clean") Audio.stingGood();
  // reset world tilt if any
  $("app").style.transform=""; $("app").style.transition="";
  show("end");
}

// ---------------------------------------------------------------- buttons / input
$("startBtn").onclick=()=>{ Audio.start(); Audio.resume(); startCase(); };
$("howBtn").onclick=()=>show("how");
$("howBack").onclick=()=>show("title");
$("nextBtn").onclick=()=>startCase();
$("quitBtn").onclick=()=>{ $("titleRec").textContent=recLine(); show("title"); };
$("bPull").onpointerdown=e=>{e.preventDefault();pullGun();};
$("bShoot").onpointerdown=e=>{e.preventDefault();shoot();};

// keyboard (desktop)
addEventListener("keydown",e=>{
  if(!scenes.enc.classList.contains("on")) return;
  if(e.code==="KeyQ"||e.code==="Space"){ e.preventDefault(); pullGun(); }
  if(e.code==="KeyE"||e.code==="Enter"){ e.preventDefault(); shoot(); }
  if(["Digit1","Digit2","Digit3"].includes(e.code)){
    const i=+e.code.slice(-1)-1; const b=$("choices").children[i]; if(b&&b.dataset.qi!=null) ask(+b.dataset.qi);
  }
});

// gamepad: West=pull, South=shoot
let gpPrev={};
function gpPoll(){
  const gp=(navigator.getGamepads?navigator.getGamepads():[])[0];
  if(gp && scenes.enc.classList.contains("on")){
    const b=gp.buttons;
    if(b[2]&&b[2].pressed&&!gpPrev[2]) pullGun();      // X / square
    if(((b[0]&&b[0].pressed)||(b[7]&&b[7].value>0.4))&&!gpPrev[0]) shoot(); // A / R2
    gpPrev={0:b[0]&&b[0].pressed,2:b[2]&&b[2].pressed};
  }
  requestAnimationFrame(gpPoll);
}
gpPoll();

$("titleRec").textContent = rec.cases? recLine() : "";

// PWA
if("serviceWorker" in navigator){ addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{})); }
