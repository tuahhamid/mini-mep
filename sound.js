// Mini MEP sound. Everything is synthesized with Web Audio: no sound files.
// The music follows Disasterpeace's approach for Mini Motorways: the corridor makes the music.
//   One major pentatonic key. Trades are instruments in their own register (pipes low, ducts middle, trays high),
//   rooms are notes, the door's position is the pan. An open crossing is a slightly out-of-tune horn that speeds up
//   as its ring runs out. Arrivals and chimes snap to a 96 BPM grid; your own input sounds at once.
//   Each Clash Area muffles the music a step; the week meeting muffles it all; each new week moves the key a fifth.
//
// window.MiniSound:
//   watch(fn)         fn() says what the page is doing: {mode:'landing'|'count'|'game'|'over'|'none', ...} (see gameState)
//   cue(id, opts)     one event sound: arrive, place, invalid, clear, area, drop, reroute, defer, knock, stamp,
//                     week, height, peek, theme, count, over, join, and for the tutorial coach, done, finish
//   Major screen changes (landing <-> game, game over -> anything) play a swell and fade the new music in.
//   toggleMute(), setVolume(0..100), muted, volume, onChange(fn)    remembered under minimep.sound (game and host share it)
//   mode(), audio(), playing(), log    for tests: the music mode, the audio state, whether music is running, the last cues
// Browsers allow no sound before the first click or key press, so nothing plays until then.
(function(){
'use strict';
const KEY='minimep.sound',pref={vol:70,muted:false};
try{Object.assign(pref,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
const savePref=()=>{try{localStorage.setItem(KEY,JSON.stringify(pref))}catch(e){}};
let ctx=null,master=null,bus=null,noiseBuf=null,watcher=null;
const subs=[],log=[];
const live=()=>!!ctx&&ctx.state==='running'&&!pref.muted;
const level=()=>pref.muted?0:pref.vol/100*0.9;
function unlock(){
  try{
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      ctx=new AC();const comp=ctx.createDynamicsCompressor();master=ctx.createGain();
      master.gain.value=level();master.connect(comp);comp.connect(ctx.destination);bus=master;
    }
    if(ctx.state==='suspended')ctx.resume();
  }catch(e){}
}
['pointerdown','keydown','touchend'].forEach(ev=>addEventListener(ev,unlock,{capture:true,passive:true}));

// ---------- Synth parts (from the Sound Lab) ----------
function dest(pan,pan2,t,dur){
  if(!pan&&pan2==null||!ctx.createStereoPanner)return bus;
  const p=ctx.createStereoPanner();p.pan.setValueAtTime(pan||0,t);
  if(pan2!=null)p.pan.linearRampToValueAtTime(pan2,t+dur);
  p.connect(bus);return p;
}
function env(g,t,a,d,peak){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002),t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+d)}
function osc(type,f,t,dur,o={}){
  const n=ctx.createOscillator();n.type=type;n.frequency.setValueAtTime(f,t);if(o.det)n.detune.value=o.det;
  if(o.f2)n.frequency.exponentialRampToValueAtTime(o.f2,t+dur);
  const g=ctx.createGain();env(g,t,o.a??0.005,dur,o.peak??0.3);
  let last=n;
  if(o.lp){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.value=o.lp;fl.Q.value=o.q??1;n.connect(fl);last=fl}
  last.connect(g);g.connect(dest(o.pan,o.pan2,t,dur));n.start(t);n.stop(t+(o.a??0.005)+dur+0.05);
}
function noise(t,dur,o={}){
  if(!noiseBuf){noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  const s=ctx.createBufferSource();s.buffer=noiseBuf;
  const fl=ctx.createBiquadFilter();fl.type=o.type||'bandpass';fl.frequency.setValueAtTime(o.f||1500,t);
  if(o.f2)fl.frequency.exponentialRampToValueAtTime(o.f2,t+dur);fl.Q.value=o.q??1;
  const g=ctx.createGain();env(g,t,o.a??0.003,dur,o.peak??0.3);
  s.connect(fl);fl.connect(g);g.connect(dest(o.pan,o.pan2,t,dur));s.start(t,Math.random());s.stop(t+(o.a??0.003)+dur+0.05);
}
const PENTA=[0,2,4,7,9],REG={pipe:-12,duct:0,tray:12},BEAT=0.625,EIGHTH=BEAT/2;   // 96 BPM
const ROOTS=[60,55,62,57,64,59];                                                   // each week a fifth up, folded into one octave
const mtof=m=>440*Math.pow(2,(m-69)/12);
const deg=(d,root=60)=>{const o=Math.floor(d/5),i=((d%5)+5)%5;return root+o*12+PENTA[i]};
const roomPan=r=>-0.7+r*0.28;
function voice(kind,m,t,dur,o={}){
  const f=mtof(m+REG[kind]),peak=o.peak??0.16,f2=o.to!=null?mtof(o.to+REG[kind]):null,p={pan:o.pan,pan2:o.pan2};
  if(kind==='pipe'){osc('sine',f,t,dur*0.8,{peak,a:0.002,f2,...p});osc('sine',f*4,t,0.05,{peak:peak*0.25,a:0.001,...p})}
  else if(kind==='duct'){osc('triangle',f,t,dur,{peak:peak*0.9,a:0.03,lp:1800,f2,...p});osc('sine',f*2,t,dur*0.5,{peak:peak*0.15,a:0.03,...p})}
  else{osc('sine',f,t,dur*1.3,{peak:peak*0.8,a:0.002,f2,...p});osc('sine',f*2.76,t,dur*0.5,{peak:peak*0.18,...p})}
}
// The crossing horn: a note and the semitone above it, slightly out of tune. Musical, but clearly wrong.
function horn(m,t,o={}){
  const f=mtof(m),peak=o.peak??0.08,d=o.dur??0.22;
  osc('sawtooth',f,t,d,{peak,a:0.012,lp:o.lp??1400,q:2,pan:o.pan,det:-8});
  osc('sawtooth',f*Math.pow(2,1/12),t,d,{peak,a:0.012,lp:o.lp??1400,q:2,pan:o.pan,det:9});
}
const thunk=(t,peak=0.35)=>{osc('sine',90,t,0.14,{peak,f2:55});noise(t,0.05,{type:'lowpass',f:600,peak:peak*0.6})};
function padChord(root,t,dur,peak=0.05,bend=false){
  [0,2,4,5].forEach(d=>{const f=mtof(deg(d,root-12));osc('triangle',bend?f*0.97:f,t,dur,{peak,a:0.5,lp:1300,f2:bend?f:null})});
}
function filtered(t,f1,f2,dur,fn){
  const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(f1,t);fl.frequency.exponentialRampToValueAtTime(f2,t+dur);
  fl.connect(bus);const prev=bus;bus=fl;fn();bus=prev;
}
function echoed(fn,o={}){const d=ctx.createDelay(2),fb=ctx.createGain(),wet=ctx.createGain(),split=ctx.createGain();
  d.delayTime.value=o.time??0.3;fb.gain.value=o.fb??0.38;wet.gain.value=o.mix??0.45;d.connect(fb);fb.connect(d);d.connect(wet);wet.connect(bus);
  split.connect(bus);split.connect(d);const prev=bus;bus=split;fn();bus=prev}
// Run fn with new sounds going into node instead of the master
function into(node,fn){const prev=bus;bus=node;try{fn()}finally{bus=prev}}

// ---------- Event cues (the Sound Lab's Proposed versions, fed with the real run, room and key) ----------
const M={mode:'none',g:null,land:null,st:null};
const root=()=>M.g?M.g.root:60;
const CUE={
  arrive:(t,o)=>voice(o.kind,deg(o.room,root()),t,0.3,{pan:roomPan(o.room),peak:0.15}),
  place:(t,o)=>voice(o.kind,deg(o.room,root()),t,0.1,{pan:roomPan(o.room),peak:0.07}),
  invalid:t=>noise(t,0.05,{type:'lowpass',f:700,peak:0.22}),
  clear:(t,o)=>{voice(o.kind,deg(o.room,root()),t,0.3,{pan:roomPan(o.room)});voice(o.kind,deg(o.room+1,root()),t+EIGHTH,0.5,{pan:roomPan(o.room)})},
  area:t=>thunk(t,0.3),                                     // the music's filter closes a step by itself
  drop:(t,o)=>voice('pipe',deg(o.room+2,root()),t,0.45,{to:deg(o.room,root()),pan:roomPan(o.room),peak:0.2}),
  reroute:(t,o)=>{voice(o.kind,deg(o.room,root()),t,0.9,{to:deg(o.room-1,root()),pan:roomPan(o.room),pan2:1,peak:0.2});
    noise(t,0.6,{f:600,f2:2500,q:1.5,peak:0.06,pan:roomPan(o.room),pan2:1,a:0.2})},
  defer:(t,o)=>{voice('tray',deg(o.room,root()),t+EIGHTH,0.4,{peak:0.1});voice('tray',deg(o.room-1,root()),t+BEAT,0.6,{peak:0.1})},
  knock:(t,o)=>{[0,0.07,0.15].forEach(d=>noise(t+d,0.05,{type:'highpass',f:3500,peak:0.06}));
    voice(o.kind,deg(o.from,root()),t+0.15,1.1,{to:deg(o.to,root()),pan:roomPan(o.from),pan2:roomPan(o.to),peak:0.2})},
  stamp:t=>thunk(t+0.11),                                   // off the beat and unpitched: nobody decided
  week:t=>filtered(t,3500,450,0.8,()=>padChord(root(),t,1.6,0.06)),
  height:t=>[5,6,7,8,9].forEach((d,i)=>voice('tray',deg(d,root()),t+i*EIGHTH,0.35,{peak:0.12})),
  peek:t=>noise(t,0.22,{f:700,f2:2200,q:1,peak:0.08,a:0.06}),
  // Like Mini Motorways' night mode: dark plays the chord a sixth up with an echo; light brings it home
  theme:(t,o)=>{const r=o.dark?69:60;echoed(()=>[0,2,4].forEach((d,i)=>voice('tray',deg(d,r),t+i*0.05,0.5,{peak:0.1})),{mix:o.dark?0.45:0.05})},
  count:(t,o)=>{if(!o.go){voice('tray',deg(4),t,0.12,{peak:0.14});return}[0,2,4].forEach(d=>voice('tray',deg(d),t,0.6,{peak:0.12}));padChord(60,t,1.6,0.05)},
  over:t=>{const r=root();[0,1,2].forEach(i=>voice('pipe',deg(2-i,r),t+i*BEAT,0.25,{peak:0.12-i*0.03}));
    [7,6,5,4,3,2,1,0].forEach((d,i)=>voice('tray',deg(d,r),t+2.2+i*EIGHTH*1.3,i===7?1.6:0.4,{peak:0.12}))},
  join:(t,o)=>voice('tray',deg((o.n||0)%10),t,0.6,{peak:0.12}),  // each new player is the next note: a full lobby builds a chord
  // Tutorial: a two-note chime when the coach speaks, a rising figure when a step is done, a chord at the end
  coach:t=>{voice('tray',deg(7,root()),t,0.3,{peak:0.07});voice('tray',deg(9,root()),t+0.12,0.45,{peak:0.07})},
  done:t=>[4,5,7].forEach((d,i)=>voice('tray',deg(d,root()),t+i*EIGHTH*0.7,0.3,{peak:0.09})),
  finish:t=>{[0,2,4].forEach((d,i)=>voice('tray',deg(d),t+i*0.06,0.8,{peak:0.12}));padChord(60,t,2,0.05)},
  // Major transitions: a pad chord that swells in and fades out under the change of screen
  swell:t=>{[0,2,4].forEach(d=>osc('triangle',mtof(deg(d,60)),t,1.6,{peak:0.05,a:0.45,lp:1600}));noise(t,0.9,{type:'lowpass',f:400,f2:1800,peak:0.025,a:0.4})}
};
const QUANT=new Set(['arrive','clear','height']);
function cue(id,o={}){
  log.push(id);if(log.length>60)log.shift();
  if(!live()||!CUE[id])return;
  try{
    let t=ctx.currentTime+0.02;
    if(QUANT.has(id)&&M.g)t=M.g.t0+Math.ceil((t-M.g.t0)/EIGHTH-1e-6)*EIGHTH;
    into(master,()=>CUE[id](t,o));
  }catch(e){console.error('Mini MEP sound:',e)}
}

// ---------- Game music: built step by step from what is on the board ----------
// gameState: {mode:'game', muffled, week, areas, extra, runs:[{kind, room}], cx:[{key, room, left, deferred}]}
const PAT={pipe:[1,0,0,1,0,0,1,0],duct:[0,0,1,0,0,0,1,0],tray:[0,1,0,1,0,1,0,1]},LEN={pipe:0.25,duct:0.45,tray:0.3};
const OPEN=[4200,2000,1100,650];
function chain(){const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='lowpass';f.connect(g);g.connect(master);return{f,g}}
function fadeOut(c,sec){const t=ctx.currentTime;c.g.gain.setTargetAtTime(0.0001,t,sec/3);setTimeout(()=>{try{c.g.disconnect()}catch(e){}},sec*1000+1500)}
const rootOf=week=>ROOTS[(Math.max(1,week||1)-1)%ROOTS.length];
function gameStart(st,fade){
  const c=chain(),now=ctx.currentTime,t0=now+(fade?0.4:0.08);
  c.f.frequency.value=st.muffled?450:OPEN[Math.min(st.areas||0,3)];
  if(fade){c.g.gain.setValueAtTime(0.0001,now);c.g.gain.exponentialRampToValueAtTime(1,now+fade)}
  M.g={...c,t0,next:t0,step:0,root:rootOf(st.week),fq:c.f.frequency.value,horn:{}};
}
function gameSteps(st){
  const g=M.g,now=ctx.currentTime;
  const fq=st.muffled?450:OPEN[Math.min(st.areas||0,3)];
  if(fq!==g.fq){g.fq=fq;g.f.frequency.setTargetAtTime(fq,now,0.15)}
  const r=rootOf(st.week);
  if(r!==g.root){g.root=r;into(g.f,()=>padChord(r,Math.max(g.next,now+0.05),2.8,0.05,true))}   // new week, new key
  if(g.next<now)g.next=g.t0+Math.ceil((now-g.t0)/EIGHTH)*EIGHTH,g.step=Math.round((g.next-g.t0)/EIGHTH);
  while(g.next<now+0.2){into(g.f,()=>step(g,g.step,g.next,st));g.step++;g.next+=EIGHTH}
}
function step(g,n,t,st){
  const runs=st.runs||[],total=runs.length;
  if(n%16===0)padChord(g.root,t,8*BEAT+0.4,Math.max(0.018,0.055-total*0.006));   // the pad thins out as the corridor fills
  for(const kind of ['pipe','duct','tray']){
    const mine=runs.filter(r=>r.kind===kind);if(!mine.length)continue;
    const extra=kind==='tray'&&st.extra>0;                                          // Extra Layer: a new bell voice joins
    if(!PAT[kind][n%8]&&!(extra&&n%8===4))continue;
    const r=mine[n%mine.length],gain=0.07/(1+0.12*total)*(0.6+0.4*Math.min(mine.length,3)/3);
    voice(kind,deg(r.room,g.root),t,LEN[kind],{peak:gain,pan:roomPan(r.room)});
  }
  // Horns: every 2 beats while open, faster and louder in the last 5 s; muffled and slow while deferred; quiet during meetings
  const seen=new Set();
  if(!st.muffled||st.horns)for(const c of st.cx||[]){
    seen.add(c.key);if(g.horn[c.key]!=null&&t<g.horn[c.key]-1e-3)continue;
    const m=deg(c.room,g.root);
    if(c.deferred)horn(m,t,{lp:450,peak:0.045,pan:roomPan(c.room)});
    else horn(m,t,{peak:0.07+(c.left<5?(5-c.left)*0.012:0),pan:roomPan(c.room)});
    g.horn[c.key]=t+(c.deferred?4*BEAT:c.left<2?EIGHTH:c.left<5?BEAT:2*BEAT);
  }
  if(!st.muffled||st.horns)for(const k in g.horn)if(!seen.has(k))delete g.horn[k];
}

// ---------- Landing music: the corridor drawing on the landing page plays itself (hover notes off) ----------
const LOOP=9;
function landingLoop(at,k,from){
  const r=(k%4<2)?60:55,R=d=>deg(d,r),ev=[[0,t=>padChord(r,t,LOOP+0.6,0.03)]];
  const fig=(kind,d,start)=>[0,0.4,0.8].forEach((o,i)=>ev.push([start+o,t=>voice(kind,R(d-2+i),t,0.35,{peak:0.09})]));
  fig('tray',5,0.2);fig('pipe',4,1.3);fig('duct',2,2.65);                                  // each run plucks its trade as it draws
  [4.1,4.7,5.3].forEach(o=>ev.push([o,t=>horn(R(2),t,{peak:0.03,lp:900})]));               // the crossing: a soft horn
  ev.push([5.6,t=>{voice('pipe',R(2),t,0.3,{peak:0.1});voice('tray',R(4),t+0.2,0.7,{peak:0.08})}]);   // decided, in key
  into(M.land.g,()=>{for(const [o,fn] of ev){const t=at+o;if(t>=from+0.01)fn(t)}});
}
function landingSteps(st){
  const L=M.land,v0=st.land0||0,nowMs=performance.now(),k=Math.floor((nowMs-v0)/1000/LOOP);
  if(L.sched<0){L.sched=k;landingLoop(ctx.currentTime-(nowMs-v0-k*LOOP*1000)/1000,k,ctx.currentTime);return}
  if(L.sched>k)return;
  L.sched=k+1;landingLoop(ctx.currentTime+(v0+(k+1)*LOOP*1000-nowMs)/1000,k+1,ctx.currentTime);
}

// ---------- Mode changes, checked 20 times a second ----------
function stopMusic(sec){
  if(M.g){const c=M.g;M.g=null;if(ctx)c.f.frequency.setTargetAtTime(280,ctx.currentTime,sec/3),fadeOut(c,sec)}
  if(M.land){const c=M.land;M.land=null;if(ctx)c.f.frequency.setTargetAtTime(280,ctx.currentTime,sec/3),fadeOut(c,sec)}
}
function pump(){
  let st=null;try{st=watcher?watcher():null}catch(e){}
  const want=(st&&st.mode)||'none',was=M.mode;
  if(want!==was){
    M.mode=want;
    const major=(was==='landing'&&want==='game')||(was==='game'&&want==='landing')||(was==='over'&&(want==='landing'||want==='game'));
    M.swell=major;M.fade=major||(was==='none'&&want==='landing')?(want==='game'?1.2:1.5):0;
    if(was==='game'&&M.g)stopMusic(want==='over'?1.6:0.8);
    if(was==='landing'&&M.land){const c=M.land;M.land=null;if(ctx){c.f.frequency.setTargetAtTime(280,ctx.currentTime,0.27);fadeOut(c,0.8)}}
  }
  if(!live()){M.swell=false;return}
  try{
    if(M.swell){M.swell=false;const t=ctx.currentTime+0.05;into(master,()=>CUE.swell(t))}
    if(M.mode==='game'){if(!M.g){gameStart(st,M.fade);M.fade=0}gameSteps(st)}
    else if(M.mode==='landing'){if(!M.land){const c=chain();c.f.frequency.value=5000;
      if(M.fade){const t=ctx.currentTime;c.g.gain.setValueAtTime(0.0001,t);c.g.gain.exponentialRampToValueAtTime(1,t+M.fade);M.fade=0}
      M.land={...c,sched:-1}}landingSteps(st)}
  }catch(e){console.error('Mini MEP sound:',e)}
}
setInterval(pump,50);

function changed(){if(master)master.gain.setTargetAtTime(level(),ctx.currentTime,0.05);if(pref.muted)stopMusic(0.2);savePref();subs.forEach(f=>{try{f()}catch(e){}})}
window.MiniSound={
  watch(fn){watcher=fn},cue,unlock,log,
  mode:()=>M.mode,audio:()=>ctx?ctx.state:'none',playing:()=>!!(M.g||M.land),
  get muted(){return pref.muted},get volume(){return pref.vol},
  toggleMute(){pref.muted=!pref.muted;changed();return pref.muted},
  setVolume(v){pref.vol=Math.max(0,Math.min(100,Math.round(+v||0)));if(pref.vol>0&&pref.muted)pref.muted=false;changed()},
  onChange(fn){subs.push(fn)}
};
})();
