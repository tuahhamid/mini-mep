// Step 1 checks for the web build: theme toggle, pause menu, three layouts, rotate prompt, touch taps.
// Run: node layout.spec.js [screenshotDir]   (needs playwright, or PW_MODULE=<playwright-core path> with Edge/Chrome)
const path=require('path'),fs=require('fs'),http=require('http');
function loadPW(){
  const cands=[process.env.PW_MODULE];
  try{cands.push(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')}catch(e){}
  cands.push('playwright','playwright-core');
  for(const m of cands){if(!m)continue;try{return require(m)}catch(e){}}
  throw new Error('Playwright not found. Set PW_MODULE to a playwright or playwright-core folder.');
}
const ok=(c,msg)=>{if(!c){console.log('FAIL',msg);process.exitCode=1}else console.log('ok  ',msg)};
const WEB=path.resolve(__dirname,'..');   // repo root (this file lives in tests/)
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css'};

(async()=>{
  const server=http.createServer((req,res)=>{
    const f=path.join(WEB,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html');
    if(!f.startsWith(WEB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return}
    if(path.basename(f)==='firebase-config.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end('window.MINIMEP_FIREBASE=null;');return}
    res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base=`http://127.0.0.1:${server.address().port}/`;
  const {chromium}=loadPW(),out=process.argv[2]||'.';
  let b;try{b=await chromium.launch()}catch(e){b=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch({channel:'msedge'}))}
  const errs=[];
  const open=async(opts,name)=>{const c=await b.newContext(opts);const p=await c.newPage();p.on('pageerror',e=>errs.push(name+': '+e.message));
    await p.goto(base);await p.waitForTimeout(300);await p.evaluate(()=>__toy.start());await p.waitForTimeout(200);return{c,p}};
  const noScroll=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight);

  // ---- Theme: follows the system, then the player's pick is remembered (game and host share it)
  {const {c,p}=await open({viewport:{width:1440,height:900},colorScheme:'dark'},'theme');
   ok(await p.evaluate(()=>!document.documentElement.dataset.theme&&getComputedStyle(document.body).backgroundColor==='rgb(15, 23, 25)'),'theme: follows a dark system setting by default');
   await p.click('#bTheme');
   ok(await p.evaluate(()=>document.documentElement.dataset.theme==='light'&&localStorage.getItem('minimep.theme')==='light'&&getComputedStyle(document.body).backgroundColor==='rgb(236, 240, 238)'),'theme: the toggle switches to light and saves it');
   await p.reload();await p.waitForTimeout(300);
   ok(await p.evaluate(()=>document.documentElement.dataset.theme==='light'),'theme: the choice survives a reload');
   const h=await c.newPage();await h.goto(base+'host.html');await h.waitForTimeout(200);
   ok(await h.evaluate(()=>document.documentElement.dataset.theme==='light'&&document.querySelector('#bTheme use').getAttribute('href')==='#ic-t-moon'),'theme: the host page picks up the same choice');
   await c.close();}

  // ---- Desktop: pause menu holds the tools; a drawer opened from it keeps the game paused
  {const {c,p}=await open({viewport:{width:1440,height:900}},'desktop');
   ok(await noScroll(p),'desktop 1440 x 900: no scrollbars');
   await p.click('#bPause');
   ok(await p.evaluate(()=>['resume','log','theme','restart'].every(a=>document.querySelector(`#modal [data-act="${a}"]`))),'pause menu: Resume, Decision log, theme and Restart');
   await p.click('#modal [data-act="log"]');
   const t0=await p.evaluate(()=>__toy.S.t);await p.waitForTimeout(500);
   ok(await p.evaluate(t0=>__toy.S.modal==='drawer'&&__toy.S.t===t0&&document.querySelector('#drawer').classList.contains('open'),t0),'pause menu: the log opens and the game stays paused');
   await p.click('#drawer [data-close]');
   ok(await p.evaluate(()=>__toy.S.modal==='paused'),'pause menu: closing the log returns to the pause menu');
   await p.screenshot({path:path.join(out,'layout-desktop.png')});
   ok(/Main menu/.test(await p.textContent('#modal [data-act="menu"]')),'pause menu (practice): Main menu button');
   await p.click('#modal [data-act="menu"]');await p.waitForTimeout(150);
   ok(await p.evaluate(()=>__toy.S.modal==='landing'),'pause menu: Main menu goes straight to the landing page in practice');
   await c.close();}

  // ---- Sound: the landing plays its loop, the board makes the game music, cues follow events, M mutes and is remembered
  {const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();p.on('pageerror',e=>errs.push('sound: '+e.message));
   await p.goto(base);await p.waitForTimeout(300);
   const dark0=await p.evaluate(()=>document.documentElement.dataset.theme||'');
   await p.click('.land [data-act="theme"]');
   ok(await p.evaluate(d=>(document.documentElement.dataset.theme||'')!==d&&__toy.S.modal==='landing',dark0),'landing: the light/dark icon sits top right and switches the theme');
   await p.screenshot({path:require('path').join(process.argv[2]||'.','landing.png')});
   await p.click('[data-act="play"]');await p.waitForTimeout(300);
   ok(await p.evaluate(()=>MiniSound.mode()==='landing'&&MiniSound.audio()==='running'&&MiniSound.playing()),'sound: after the first click the landing music plays: '+await p.evaluate(()=>MiniSound.mode()+'/'+MiniSound.audio()));
   await p.click('[data-act="solo"]');await p.click('[data-act="start"]');await p.waitForTimeout(300);
   ok(await p.evaluate(()=>MiniSound.mode()==='game'&&MiniSound.playing()),'sound: starting the game hands over to the game music');
   await p.evaluate(()=>__toy.spawn('CHW',2));
   await p.evaluate(()=>{const r=__toy.S.runs.find(x=>!x.placed);for(let l=0;l<5;l++)for(let y=0;y<4;y++)if(__toy.place(r.id,l,y))return});
   ok(await p.evaluate(()=>MiniSound.log.includes('arrive')&&MiniSound.log.some(x=>x==='place'||x==='clear')),'sound: an arrival and a placement each play a cue: '+await p.evaluate(()=>MiniSound.log.join(',')));
   await p.click('#bPause');
   ok(await p.evaluate(()=>!!document.querySelector('#modal #vol')&&!!document.querySelector('#modal [data-act="sound"]')&&!!document.querySelector('#bSound')),'sound: mute button in the tools, mute and volume in the pause menu');
   await p.keyboard.press('m');await p.waitForTimeout(100);
   ok(await p.evaluate(()=>MiniSound.muted&&!MiniSound.playing()&&JSON.parse(localStorage.getItem('minimep.sound')).muted===true&&document.querySelector('#modal [data-act="sound"]').getAttribute('aria-pressed')==='true'),'sound: M mutes, the music stops and the choice is remembered');
   await p.keyboard.press('m');await p.waitForTimeout(200);
   ok(await p.evaluate(()=>!MiniSound.muted&&MiniSound.playing()),'sound: M again brings the music back');
   await p.evaluate(()=>{const v=document.querySelector('#vol');v.value=40;v.dispatchEvent(new Event('input',{bubbles:true}))});
   ok(await p.evaluate(()=>MiniSound.volume===40&&document.querySelector('#volN').textContent==='40%'),'sound: the volume slider sets the volume');
   await p.evaluate(()=>{__toy.CONFIG.gameOverMs=0;__toy.gameOver('clash')});await p.waitForTimeout(200);
   ok(await p.evaluate(()=>MiniSound.mode()==='over'&&MiniSound.log.includes('over')&&!MiniSound.playing()),'sound: game over plays its line and the music stops');
   await c.close();}

  // ---- A Clash Area is a strike: "1 of 3", and the slot that just filled pulses
  {const {c,p}=await open({viewport:{width:1440,height:900}},'strike');
   await p.evaluate(()=>{const a=__toy.spawn('CHW',1),b=__toy.spawn('CW',4);__toy.place(a.id,3,1);__toy.place(b.id,0,1);
     const k=Object.keys(__toy.S.cx)[0];__toy.S.cx[k].remain=0.01;__toy.tick(0.05);__toy.render()});
   ok(await p.evaluate(()=>__toy.S.areas.length===1&&!!document.querySelector('#slots i.on.hit')&&document.querySelector('.areas').classList.contains('hit')&&/Clash Area 1 of 3/.test(document.querySelector('#toast').textContent)),'strike: "Clash Area 1 of 3" and the new slot pulses');
   await p.screenshot({path:path.join(out,'strike.png'),clip:{x:900,y:0,width:540,height:120}});
   await p.waitForTimeout(1600);await p.evaluate(()=>__toy.render());
   ok(await p.evaluate(()=>!document.querySelector('#slots i.hit')&&!!document.querySelector('#slots i.on')),'strike: the pulse ends, the slot stays filled');
   await c.close();}

  // ---- How to play: four steps on the practice intro and from the pause menu; rules only, no sound descriptions
  {const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();p.on('pageerror',e=>errs.push('howto: '+e.message));
   await p.goto(base);await p.waitForTimeout(300);
   await p.click('[data-act="play"]');await p.click('[data-act="solo"]');await p.waitForTimeout(300);
   ok(await p.evaluate(()=>__toy.S.modal==='intro'&&/Fit each service in its band/.test(document.querySelector('#htp').textContent)&&!!document.querySelector('#htp svg')),'how to play: the practice intro opens at step 1 with its picture');
   await p.click('#htp [data-act="hnext"]');
   ok(/Watch for crossings/.test(await p.textContent('#htp')),'how to play: Next turns to step 2');
   await p.keyboard.press('ArrowRight');await p.waitForTimeout(50);
   ok(/Decide before the ring runs out/.test(await p.textContent('#htp')),'how to play: the arrow keys turn the steps');
   ok(await p.evaluate(()=>!/hear/i.test(document.querySelector('#modal').textContent)),'how to play: no text describes a sound');
   ok(await p.evaluate(()=>/Tutorial/.test(document.querySelector('#modal .bar').textContent)),'practice intro: the tutorial is offered');
   await p.click('#htp [data-act="hgo"][data-n="4"]');
   ok(await p.evaluate(()=>document.querySelectorAll('#modal [data-act="tut"],#modal [data-act="htry"]').length===1),'practice intro: one tutorial button, not two');
   await p.screenshot({path:path.join(out,'howto-intro.png')});
   await p.click('[data-act="start"]');await p.waitForTimeout(700);
   ok(await p.evaluate(()=>!__toy.S.modal&&getComputedStyle(document.querySelector('#ov')).visibility==='hidden'),'transition: the intro fades out and the game starts');
   await p.click('#bPause');await p.click('#modal [data-act="howto"]');await p.waitForTimeout(250);
   ok(await p.evaluate(()=>__toy.S.modal==='howto'&&!!document.querySelector('#htp')),'pause menu: How to play opens');
   for(let i=0;i<3;i++){await p.click('#htp [data-act="hnext"]')}
   await p.click('#htp [data-act="hclose"]');await p.waitForTimeout(250);
   ok(await p.evaluate(()=>__toy.S.modal==='paused'),'how to play: "Back to the game" returns to the pause menu');
   await c.close();}

  // ---- Tutorial: eleven beats on the real board, the coach waits for each move
  {const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();p.on('pageerror',e=>errs.push('tutorial: '+e.message));
   await p.goto(base);await p.waitForTimeout(300);
   await p.click('[data-act="play"]');await p.click('[data-act="solo"]');await p.waitForTimeout(250);
   await p.click('#modal [data-act="tut"]');await p.waitForTimeout(400);
   const beat=()=>p.evaluate(()=>__toy.S.tut&&__toy.S.tut.beat);
   ok(await beat()===1&&await p.isVisible('#coach')&&/Your first corridor/.test(await p.textContent('#coach')),'tutorial 1: the coach welcomes you');
   await p.click('#coachGo');await p.waitForTimeout(150);
   ok(await beat()===2&&await p.evaluate(()=>!__toy.place('SA-1',1,1)),'tutorial 2: SA-1 arrives; only the slots the coach names are allowed');
   await p.screenshot({path:path.join(out,'tutorial-2.png')});
   await p.evaluate(()=>__toy.place('SA-1',1,2));await p.waitForTimeout(250);
   ok(await beat()===3&&await p.evaluate(()=>__toy.S.list.some(c=>c.turn.type==='MG')),'tutorial 3: placing SA-1 moves on; MG-1 makes a crossing');
   ok(await p.evaluate(()=>(document.querySelector('#spot path').getAttribute('d').match(/Z/g)||[]).length===2),'tutorial 3: the spotlight lights the crossing');
   const t0=await p.evaluate(()=>__toy.S.t);await p.waitForTimeout(400);
   ok(await p.evaluate(t0=>__toy.S.t===t0,t0),'tutorial: the clock waits for you');
   await p.click('#coachGo');await p.waitForTimeout(150);
   await p.evaluate(()=>__toy.place('MG-1',2,0));await p.waitForTimeout(250);
   ok(await beat()===5,'tutorial 4: moving MG-1 to Layer 1 fixes it and moves on');
   await p.evaluate(()=>{__toy.arm('reroute')});
   ok(await p.evaluate(()=>__toy.S.armed===null),'tutorial 5: only Drop can be armed');
   await p.evaluate(()=>{__toy.arm('drop');const c=__toy.S.list.find(c=>c.turn.type==='FP');__toy.applyCx(c.key)});await p.waitForTimeout(500);
   ok(await beat()===5&&await p.evaluate(()=>document.querySelector('#coach').hidden&&document.querySelector('#spot').hidden),'tutorial 5: after Drop, the board is clear while it plays out');
   await p.waitForTimeout(2400);
   ok(await beat()===6&&await p.evaluate(()=>__toy.S.list.some(c=>c.turn.id==='EA-1'||c.thru.id==='EA-1')),'tutorial 5: Drop on the crossing moves on; EA-1 crosses SA-1');
   await p.evaluate(()=>{__toy.arm('reroute');__toy.applyRun('SA-1')});
   ok(await beat()===6&&await p.evaluate(()=>!!__toy.S.runs.find(r=>r.id==='SA-1')),'tutorial 6: Reroute only takes the run the coach names');
   await p.evaluate(()=>{__toy.applyRun('EA-1')});await p.waitForTimeout(2900);
   ok(await beat()===7&&await p.evaluate(()=>__toy.S.list.some(c=>c.turn.id==='FP-2')),'tutorial 6: rerouting EA-1 moves on; FP-2 makes a crossing');
   await p.evaluate(()=>{__toy.arm('defer');const c=__toy.S.list.find(c=>c.turn.id==='FP-2');__toy.applyCx(c.key)});await p.waitForTimeout(2900);
   ok(await beat()===8&&/On hold/.test(await p.textContent('#plan')),'tutorial 7: Defer puts it on hold and moves on');
   for(let i=0;i<20&&await beat()===8;i++){await p.evaluate(()=>{__toy.tick(0.5);__toy.render()})}
   ok(await beat()===9&&await p.evaluate(()=>__toy.S.areas.length===1&&!!document.querySelector('#slots i.on')),'tutorial 8: left alone, CW-1 hardens into Clash Area 1 of 3 (the one on hold waits)');
   await p.click('#coachGo');await p.waitForTimeout(250);
   ok(await beat()===10&&await p.evaluate(()=>__toy.S.modal==='height')&&await p.isVisible('#coach'),'tutorial 10: the meeting starts with Extra Layer');
   await p.screenshot({path:path.join(out,'tutorial-10.png')});
   const L0=await p.evaluate(()=>__toy.S.L);await p.click('[data-act="hband"]');await p.waitForTimeout(300);
   ok(await beat()===11&&await p.evaluate(L0=>__toy.S.L===L0+1&&__toy.S.modal==='week',L0)&&await p.isVisible('#coach'),'tutorial 11: one more layer, then pick a power-up');
   await p.screenshot({path:path.join(out,'tutorial-11.png')});
   ok(await p.evaluate(()=>!/hear/i.test(document.querySelector('#coach').textContent)),'tutorial: the coach never describes a sound');
   await p.click('.pucard');await p.waitForTimeout(300);
   ok(await p.evaluate(()=>__toy.S.modal==='tutdone'&&/You're ready/.test(document.querySelector('#modal').textContent)&&document.querySelector('#coach').hidden&&localStorage.getItem('minimep.tutDone')==='1'),'tutorial done: you\'re ready, and it is remembered as done');
   await p.click('[data-act="tutpractice"]');await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!__toy.S.modal&&!__toy.S.tut),'tutorial: Start practice goes straight into a normal game');
   await p.click('#bPause');await p.click('#modal [data-act="menu"]');await p.waitForTimeout(250);
   await p.click('[data-act="play"]');await p.click('[data-act="solo"]');await p.waitForTimeout(250);
   ok(await p.evaluate(()=>/Start practice/.test(document.querySelector('#modal .bar .primary').textContent)),'after the tutorial, Start practice is the main button');
   await c.close();}

  // ---- Compact: a laptop at 150% zoom sees 960 x 600
  {const {c,p}=await open({viewport:{width:960,height:600}},'compact');
   ok(await noScroll(p),'compact 960 x 600: no scrollbars');
   ok(await p.evaluate(()=>getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length===2&&getComputedStyle(document.querySelector('#weekN')).display!=='none'),'compact: section and plan stay side by side, week shown in the top bar');
   await p.screenshot({path:path.join(out,'layout-compact.png')});
   await c.close();}

  // ---- Phone sideways: tools fold into Pause, power-ups in a right-hand column
  {const {c,p}=await open({viewport:{width:844,height:390},hasTouch:true,isMobile:true},'sideways');
   ok(await noScroll(p),'phone sideways 844 x 390: no scrollbars');
   ok(await p.evaluate(()=>['#bLog','#bRestart','#bTheme'].every(s=>getComputedStyle(document.querySelector(s)).display==='none')&&getComputedStyle(document.querySelector('#bPause')).display!=='none'),'phone sideways: only Pause shows in the tools');
   ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#dock')).flexDirection==='column'),'phone sideways: power-ups stack in a column');
   ok(await p.evaluate(()=>document.querySelector('#rotate').hidden),'phone sideways: no rotate prompt');
   // Touch: tap a waiting service, then tap a green slot
   await p.evaluate(()=>{__toy.S.runs=__toy.S.runs.filter(r=>r.placed);__toy.spawn('CHW',2);__toy.render()});
   const n0=await p.evaluate(()=>__toy.S.connected);
   const tok=await p.evaluate(()=>{const r=document.querySelector('.qcard').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
   await p.touchscreen.tap(tok.x,tok.y);await p.waitForTimeout(150);
   const cell=await p.evaluate(()=>{const c=document.querySelector('#sec .cell.valid');if(!c)return null;const r=c.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
   ok(!!cell,'touch: tapping a waiting service lights up its green slots');
   if(cell){await p.touchscreen.tap(cell.x,cell.y);await p.waitForTimeout(150)}
   ok(await p.evaluate(n0=>__toy.S.connected===n0+1,n0),'touch: tapping a green slot places it');
   await p.screenshot({path:path.join(out,'layout-phone-sideways.png')});
   await c.close();}

  // ---- Phone upright: rotate prompt during play, game paused, escape hatch works
  {const {c,p}=await open({viewport:{width:390,height:844},hasTouch:true,isMobile:true},'upright');
   ok(await p.evaluate(()=>!document.querySelector('#rotate').hidden),'phone upright: the rotate prompt shows during play');
   const t0=await p.evaluate(()=>__toy.S.t);await p.waitForTimeout(600);
   ok(await p.evaluate(t0=>__toy.S.t===t0,t0),'phone upright: the game is paused behind the prompt');
   await p.screenshot({path:path.join(out,'layout-phone-rotate.png')});
   await p.click('#bUpright');await p.waitForTimeout(600);
   ok(await p.evaluate(t0=>document.querySelector('#rotate').hidden&&__toy.S.t>t0,t0),'phone upright: "Play upright anyway" hides it and the game runs');
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone upright: no sideways scroll');
   await p.setViewportSize({width:844,height:390});await p.waitForTimeout(200);
   ok(await p.evaluate(()=>document.querySelector('#rotate').hidden),'phone: turning sideways clears the prompt');
   await c.close();}

  // ---- Gameplay (step 3): HUD, arrival cards, power-ups, meeting with Peek, Extra Layer
  {const {c,p}=await open({viewport:{width:1440,height:900}},'gameplay');
   ok(await p.evaluate(()=>document.querySelector('#fitted').textContent===String(__toy.S.connected)&&document.querySelector('#dialTxt').textContent==='W1'&&document.querySelectorAll('#slots i').length===3),'HUD: score, week dial and three Clash Area slots');
   ok(await p.evaluate(()=>[...document.querySelectorAll('.dock .pu b')].map(b=>b.textContent).join()==='Drop,Reroute,Defer'),'dock: power-ups are labeled Drop, Reroute, Defer');
   await p.evaluate(()=>{__toy.S.runs=__toy.S.runs.filter(r=>r.placed);__toy.spawn('SA',3);__toy.spawn('MG',5);__toy.render()});
   ok(await p.evaluate(()=>document.querySelectorAll('.qcard').length===2&&/Supply air duct/.test(document.querySelector('.qcard').textContent)),'arrivals: waiting services show as cards with ID, room and name');
   const n0=await p.evaluate(()=>__toy.S.connected);
   const from=await p.evaluate(()=>{const r=document.querySelector('.qcard').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
   await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+30,from.y+40,{steps:4});await p.waitForTimeout(100);
   const to=await p.evaluate(()=>{const c=document.querySelector('#sec .cell.valid');const r=c.getBoundingClientRect();return{x:r.x+r.width,y:r.y+r.height/2}});
   await p.mouse.move(to.x,to.y,{steps:6});await p.mouse.up();await p.waitForTimeout(150);
   ok(await p.evaluate(n0=>__toy.S.connected===n0+1,n0),'arrivals: dragging a card onto a green slot places it');
   // A known crossing: CW turns at Clean utility across CHW, which runs on to the Store
   await p.evaluate(()=>{const T=__toy;const a=T.spawn('CHW',4);T.place(a.id,0,1);const b=T.spawn('CW',2);T.place(b.id,2,1);T.render()});
   ok(await p.evaluate(()=>!!document.querySelector('#plan .callout')&&/×/.test(document.querySelector('#plan .callout').textContent)),'plan: the most urgent crossing gets a callout');
   await p.keyboard.press('1');await p.waitForTimeout(100);
   ok(await p.evaluate(()=>!!document.querySelector('#plan .mk.target')&&/Drop is armed/.test(document.querySelector('#armed').textContent)),'Drop armed: the crossing it can fix lights up, with a hint');
   await p.keyboard.press('Escape');
   // End of week 1: the Extra Layer comes first (it's the week 2 gift), then the meeting
   await p.evaluate(()=>__toy.endWeek());await p.waitForTimeout(150);
   ok(await p.evaluate(()=>__toy.S.modal==='height'&&document.querySelectorAll('.bandcard').length===3&&/Extra Layer/.test(document.querySelector('#modal').textContent)&&/Feeling generous today/.test(document.querySelector('#modal').textContent)),'Extra Layer: architect\'s line and three band cards with waiting vs free');
   await p.click('[data-act="peek"]');
   ok(await p.evaluate(()=>__toy.S.modal==='height'&&document.querySelector('#ov').classList.contains('peeking')&&!document.querySelector('#peekbar').hidden),'peek: the choice hides, the board shows, the game stays paused');
   await p.screenshot({path:path.join(out,'step3-peek.png')});
   await p.click('#bPeekBack');
   ok(await p.evaluate(()=>!document.querySelector('#ov').classList.contains('peeking')&&document.querySelector('#peekbar').hidden),'peek: Back to the meeting brings the choice back');
   await p.screenshot({path:path.join(out,'step3-extra-layer.png')});
   await p.click('.bandcard');await p.waitForTimeout(150);
   ok(await p.evaluate(()=>__toy.S.modal==='week'&&__toy.S.L===5&&document.querySelectorAll('.pucard').length===2&&!!document.querySelector('[data-act="peek"]')),'meeting: after the band pick, two tall power-up cards and a Peek button');
   await p.keyboard.down('p');const held=await p.evaluate(()=>document.querySelector('#ov').classList.contains('peeking'));await p.keyboard.up('p');
   ok(held&&await p.evaluate(()=>!document.querySelector('#ov').classList.contains('peeking')),'peek: holding P peeks, letting go returns');
   await p.screenshot({path:path.join(out,'step3-meeting.png')});
   await p.click('.pucard');await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!__toy.S.modal&&__toy.S.week===2),'meeting: picking a power-up starts week 2');
   await p.screenshot({path:path.join(out,'step3-play.png')});
   await p.evaluate(()=>{__toy.CONFIG.gameOverMs=0;__toy.gameOver('clash')});await p.waitForTimeout(200);
   ok(await p.evaluate(()=>__toy.S.modal==='over'&&!!document.querySelector('#resBadge')&&/Three Clash Areas/.test(document.querySelector('.lesson').textContent)&&/Practice/.test(document.querySelector('.resside').textContent)),'results (practice): score badge, the lesson, and the practice panel');
   ok(await noScroll(p),'results: no scrollbars at 1440 x 900');
   ok(/Main menu/.test(await p.textContent('.res [data-act="menu"]')),'results (practice): Main menu button beside Start over');
   await p.screenshot({path:path.join(out,'step4-results-practice.png')});
   await c.close();}

  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
  await b.close();server.close();
})();
