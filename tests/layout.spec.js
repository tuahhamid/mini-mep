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
