// End-to-end test for Mini MEP: host screen + players, against a fake Firebase.
// Run: node web.spec.js [screenshotDir]   (needs playwright, or PW_MODULE=<playwright-core path> with Edge/Chrome)
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

// Fake backend shared by every page in one browser context: localStorage store, BroadcastChannel for live updates
function fakeBackend(){
  window.__MINIMEP_FAKE=(async()=>{
    const load=()=>JSON.parse(localStorage.getItem('fakedb')||'{}'),save=d=>localStorage.setItem('fakedb',JSON.stringify(d));
    let uid=sessionStorage.getItem('fakeuid');if(!uid){uid='u'+Math.random().toString(36).slice(2,10);sessionStorage.setItem('fakeuid',uid)}
    const ch=new BroadcastChannel('fakedb'),subs=new Set(),fire=()=>subs.forEach(f=>setTimeout(f));
    ch.onmessage=fire;const changed=()=>{ch.postMessage(1);fire()};
    const sub=f=>{subs.add(f);setTimeout(f);return()=>subs.delete(f)};
    const players=pin=>{const d=load();return Object.keys(d).filter(k=>k.startsWith('p/'+pin+'/')).map(k=>({id:k.split('/')[2],...d[k]}))};
    return{uid,
      async getSession(pin){return load()['s/'+pin]||null},
      watchSession(pin,cb){return sub(()=>cb(load()['s/'+pin]||null))},
      watchPlayers(pin,cb){return sub(()=>cb(players(pin)))},
      async setPlayer(pin,data){const d=load();if((d['s/'+pin]||{}).status==='closed')throw new Error('closed');if(!data.nick)throw new Error('rules: nick required');d['p/'+pin+'/'+uid]=data;save(d);changed()},
      async createSession(pin,data){const d=load();d['s/'+pin]={...data,hostUid:uid};save(d);changed()},
      async updateSession(pin,patch){const d=load();Object.assign(d['s/'+pin],patch);save(d);changed()},
      async removePlayer(pin,id){const d=load();delete d['p/'+pin+'/'+id];save(d);changed()}};
  })();
}

(async()=>{
  const server=http.createServer((req,res)=>{
    const f=path.join(WEB,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html');
    const file=fs.existsSync(f)&&fs.statSync(f).isDirectory()?path.join(f,'index.html'):f;
    if(!file.startsWith(WEB)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
    // Tests never touch the real Firebase project: serve an empty config instead
    if(path.basename(file)==='firebase-config.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end('window.MINIMEP_FIREBASE=null;');return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  }).listen(0);
  const base=`http://127.0.0.1:${server.address().port}/`;
  const {chromium}=loadPW(),out=process.argv[2]||'.';
  let b;try{b=await chromium.launch()}catch(e){b=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch({channel:'msedge'}))}
  const errs=[];const watch=(pg,name)=>pg.on('pageerror',e=>errs.push(name+': '+e.message));

  // ---- No config, no fake: the game plays offline as practice
  const solo=await b.newContext();const s0=await solo.newPage();watch(s0,'offline');
  await s0.goto(base);await s0.waitForTimeout(400);
  ok(await s0.evaluate(()=>__toy.S.modal==='landing')&&await s0.isVisible('.lmenu [data-act="play"]'),'landing: the first screen is the landing page with Play');
  await s0.waitForTimeout(1500);
  ok(await s0.evaluate(()=>+document.querySelector('#lsE').getAttribute('stroke-dashoffset')<100),'landing: the corridor draws itself');
  await s0.click('[data-act="play"]');
  ok(await s0.isVisible('[data-act="topin"]')&&await s0.isVisible('[data-act="solo"]'),'landing: Play opens "With a game PIN" and "On my own"');
  await s0.click('[data-act="topin"]');await s0.waitForTimeout(100);
  ok(await s0.evaluate(()=>__toy.S.modal==='landing'),'offline: no config, so "With a game PIN" stays on the landing with a note');
  await s0.click('[data-act="solo"]');
  ok(await s0.evaluate(()=>__toy.S.modal==='intro')&&/Start practice/.test(await s0.innerHTML('#modal')),'offline: "On my own" goes to practice');
  await solo.close();

  // ---- Live game: host + two players
  const ctx=await b.newContext({viewport:{width:1400,height:900},acceptDownloads:true});
  await ctx.addInitScript(fakeBackend);
  const host=await ctx.newPage();watch(host,'host');
  await host.goto(base+'host.html');await host.waitForTimeout(300);
  await host.click('[data-mode="live"]');await host.waitForTimeout(300);
  const pin=(await host.textContent('#pin')).trim();
  ok(/^\d{6}$/.test(pin)&&/Lobby/.test(await host.textContent('#status')),'host: live game created with a 6-digit PIN, in the lobby: '+pin);

  const join=async(name,viaLink)=>{
    const p=await ctx.newPage();watch(p,name);
    await p.goto(viaLink?`${base}?pin=${pin}`:base);await p.waitForTimeout(400);
    await p.evaluate(()=>{__toy.CONFIG.gameOverMs=0;__toy.CONFIG.countdownMs=60});
    if(!viaLink){
      await p.click('[data-act="play"]');await p.click('[data-act="topin"]');await p.waitForTimeout(100);
      ok(await p.isVisible('#pin'),name+': Play → With a game PIN asks for the PIN');
      await p.fill('#pin','95a4');
      ok(await p.evaluate(()=>[...document.querySelectorAll('#pinbox span')].map(s=>s.textContent).join('')==='954'),name+': PIN boxes show digits only');
      await p.fill('#pin','999999');await p.click('[data-act="pin"]');await p.waitForTimeout(200);
      ok(await p.evaluate(()=>__toy.S.modal==='join'),name+': unknown PIN is refused');
      await p.fill('#pin',pin);await p.click('[data-act="pin"]');await p.waitForTimeout(300);
    }
    ok(await p.isVisible('#nick'),name+': PIN accepted, asks for a nickname'+(viaLink?' (via ?pin= link)':''));
    return p;
  };
  const alpha=await join('Alpha',false),bravo=await join('Bravo',true);
  await alpha.fill('#nick','Alpha');await alpha.click('[data-act="join"]');await alpha.waitForTimeout(300);
  await bravo.fill('#nick','alpha');await bravo.click('[data-act="join"]');await bravo.waitForTimeout(200);
  ok(await bravo.evaluate(()=>__toy.S.modal==='nick'),'Bravo: a nickname taken in this game is refused');
  await bravo.fill('#nick','Bravo');await bravo.click('[data-act="join"]');await bravo.waitForTimeout(400);
  ok(await alpha.evaluate(()=>__toy.S.modal==='lobby')&&/Bravo/.test(await alpha.textContent('#lobby'))&&/2 players/.test(await alpha.textContent('#lobbyN')),'players wait in the lobby, see each other and the player count');
  ok(/Alpha/.test(await host.textContent('#players'))&&/Bravo/.test(await host.textContent('#players'))&&/2 players/.test(await host.textContent('#pCount')),'host: both nicknames pop in');
  await host.screenshot({path:path.join(out,'web-1-host-lobby.png')});
  await alpha.screenshot({path:path.join(out,'web-2-player-lobby.png')});

  await alpha.evaluate(()=>{__toy.CONFIG.countdownMs=400});
  await host.click('#bStart');await alpha.waitForTimeout(250);
  ok(/2 players · same arrivals/.test(await alpha.textContent('#cdsub')),'countdown: shows the player count');
  await alpha.waitForTimeout(1800);
  const st=await Promise.all([alpha,bravo].map(p=>p.evaluate(()=>({r:__toy.S.ranked,seed:__toy.S.seed,modal:__toy.S.modal,round:__toy.S.round}))));
  ok(st.every(x=>x.r&&!x.modal&&x.round===pin)&&st[0].seed===st[1].seed,'host Start: countdown, then both play the same ranked game: '+JSON.stringify(st));

  await alpha.evaluate(()=>{__toy.S.connected=5;__toy.gameOver('clash')});
  await bravo.evaluate(()=>{__toy.S.connected=2;__toy.gameOver('full',__toy.spawn('SA',0))});
  await host.waitForTimeout(500);
  const rows=await host.$$eval('#board tr',tr=>tr.map(r=>[...r.cells].map(c=>c.textContent.trim()).join(' ')));
  ok(rows.length===2&&/Alpha 5/.test(rows[0])&&/Bravo 2/.test(rows[1]),'host leaderboard ranks Alpha above Bravo: '+JSON.stringify(rows));
  await alpha.waitForFunction(()=>/#1<\/b> of 2/.test(document.querySelector('#modal').innerHTML),null,{timeout:3000}).catch(()=>{});
  ok(/#1<\/b> of 2/.test(await alpha.innerHTML('#modal')),'Alpha sees #1 of 2');
  await alpha.fill('#cmt','nice');await alpha.click('[data-act="cmt"]');await alpha.waitForTimeout(300);
  await host.screenshot({path:path.join(out,'web-3-host-board.png')});

  const [dl]=await Promise.all([host.waitForEvent('download'),host.click('#bCsv')]);
  const csv=fs.readFileSync(await dl.path(),'utf8');
  ok(/^pin,nickname,finished_at/.test(csv)&&/Alpha/.test(csv)&&/nice/.test(csv)&&csv.trim().split('\n').length===3,'host: results CSV has one row per run, with comments');

  await host.click('#bClose');await host.click('#bClose');
  await alpha.waitForFunction(()=>__toy.NET.session&&__toy.NET.session.status==='closed',null,{timeout:5000}).catch(()=>{});
  ok(/closed/i.test(await host.textContent('#status')),'host: game closed (two clicks)');
  await alpha.click('[data-act="again"]');await alpha.waitForTimeout(200);
  ok(await alpha.evaluate(()=>__toy.S.modal==='closed'),'player: Play again on a closed game shows "has ended"');

  // ---- Open round: join and play straight away
  await host.click('#bNew');await host.waitForTimeout(200);await host.click('[data-mode="open"]');await host.waitForTimeout(300);
  const pin2=(await host.textContent('#pin')).trim();
  ok(pin2!==pin&&/Open round/.test(await host.textContent('#status')),'host: open round created: '+pin2);
  const c=await ctx.newPage();watch(c,'Charlie');
  await c.goto(`${base}?pin=${pin2}`);await c.waitForTimeout(400);
  await c.fill('#nick','Charlie');await c.click('[data-act="join"]');await c.waitForTimeout(300);
  ok(await c.evaluate(()=>__toy.S.modal==='intro')&&/Start ranked game/.test(await c.innerHTML('#modal')),'open round: after the nickname, rules then Start (no lobby)');
  await c.click('[data-act="start"]');
  ok(await c.evaluate(pin2=>__toy.S.ranked&&__toy.S.round===pin2,pin2),'open round: ranked game starts');

  // ---- Practice without a PIN
  const d=await ctx.newPage();watch(d,'practice');
  await d.goto(base);await d.waitForTimeout(400);
  await d.click('[data-act="play"]');await d.click('[data-act="solo"]');
  ok(await d.evaluate(()=>__toy.S.modal==='intro')&&/Start practice/.test(await d.innerHTML('#modal')),'practice: available without a PIN');
  await d.setViewportSize({width:390,height:860});await d.waitForTimeout(200);
  ok(await d.evaluate(()=>document.documentElement.scrollWidth<=390),'no horizontal scroll at 390 px');

  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
  await b.close();server.close();
})();
