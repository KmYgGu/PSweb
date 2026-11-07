// Focused visual-only fixtures: seven retained families and original-render fallthrough.
// Uses a fresh headless test browser, ordinary file:// and no file-access flags.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const out=path.resolve(process.argv[2]||'vfx-check-shots');
const kept=['melee','schurf-breath','sans-blaster','army-grenade','broly-ssj','yugi-osiris','kaiba-twilight'];
const reverted=['heal-status','ripple','mystic-orb','meteor-pillar','generic-bolt','genji-decoration','okuyasu-charge','kaiba-plasma','ranged-impact','army-tracer'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:360,height:640},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
 await page.goto(require('url').pathToFileURL(path.resolve(__dirname,'..','index.html')).href);await page.waitForTimeout(1000);
 await page.evaluate(()=>{const cv=document.createElement('canvas');cv.id='vfxCapture';cv.width=360;cv.height=640;cv.style='position:fixed;top:0;left:0;z-index:99999;width:360px;height:640px';document.body.append(cv);window.vctx=cv.getContext('2d');});
 const report=[];
 for(const kind of [...kept,...reverted]){
  const images=[];const states=[];
  for(const enabled of [false,true]){
   states.push(await page.evaluate(({kind,enabled})=>{
    const native=Math.random;let seed=1234567,calls=0;Math.random=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    try {
     BattleVFX.enabled=enabled;
     const ids={'schurf-breath':'schurf','sans-blaster':'sans','army-grenade':'army','broly-ssj':'broly','yugi-osiris':'yugi','kaiba-twilight':'kaiba','mystic-orb':'mystic','okuyasu-charge':'okuyasu','kaiba-plasma':'kaiba'};
     const b=new Battle(CHARACTERS.find(c=>c.id===(ids[kind]||'genji')),CHARACTERS.find(c=>c.id==='army'),{},'arena');
     const u=b.u.find(x=>x.def.id===(ids[kind]||'genji')),e=b.u.find(x=>x.team===1);u.x=120;e.x=235;u.y=e.y=350;u.facing=1;e.facing=-1;b.timers=[];b.shakeT=0;b.zoom=null;
     // Execute actual scheduled skill callbacks, but no AI/balance simulation.
     function due(t){for(let j=0;j<100;j++){const list=b.timers.filter(x=>x.t<=t);if(!list.length)break;b.timers=b.timers.filter(x=>x.t>t);for(const x of list)x.fn();}}
     if(kind==='melee'){b.slashFx(190,326,1,'#a0ffc0',1);b.impact(220,326,0,'#ffe27a',1,'blunt','melee');}
     if(kind==='schurf-breath'){__sch.dragon(b,u);u.schForm.L=155;u.schForm.aim=0;u.schDragonA.step(1/120);u.schForm.L=155;u.schForm.aim=0;}
     if(kind==='sans-blaster')b.snObjs=[{x:120,y:300,ang:.1,t:.9,tele:.6,fire:.5}];
     if(kind==='army-grenade'){b.arGren=[{u,sx:120,sy:350,tx:215,ty:350,t:.6,dur:.55,h:46,mult:.9,r:34}];for(const h of STAGE_HOOKS)h.step&&h.step(b,0);}
     if(kind==='broly-ssj')u.form=u.def.lss.form;
     if(kind==='yugi-osiris'||kind==='kaiba-twilight'){
      const def=CARD_DEFS[kind==='yugi-osiris'?'Y14':'K31'],ci=DUEL.inst(def.id),sp=DUEL.spawnSpirit(b,u,def,1.8);
      sp.t=.6;def.effect(DUEL.makeCtx(b,u,ci,null,{spirit:sp}));due(kind==='yugi-osiris'?.12:.15);due(kind==='yugi-osiris'?.12:.18);
     }
     if(kind==='heal-status'){u.hp=Math.floor(u.maxHp*.6);b.heal(u,20);u.statuses.push({id:'stun',t:2.2,dur:3});e.statuses.push({id:'poison',t:2.2,dur:3});u.buffs.push({type:'shield',t:2,dur:3});}
     if(kind==='ripple')b.fx.push({type:'ripple',x:215,y:350,t:0,dur:.6,big:true});
     if(kind==='mystic-orb')u.orb={x:190,y:315,trail:[[175,320],[180,318]]};
     if(kind==='meteor-pillar'){b.meteor(180,330,.4);b.pillar(230,350,'#ffb45a');}
     if(kind==='generic-bolt')b.bolt(215,340,100,'#86caff');
     if(kind==='genji-decoration')u.gj={def:1,blade:2,dragonT:.4};
     if(kind==='okuyasu-charge'){u.ok=u.ok||{};u.ok.erase={x:140,y:340,ang:0,W:40,L:140,t:.2,charge:.4};}
     if(kind==='kaiba-plasma')b.kfx=[{type:'ebeam',x:110,y:280,ca:1,sa:.2,L:180,w:22,t:.12,dur:.9,col:'#8ad0ff',col2:'#e8f8ff',seed:12},{type:'impact',x:280,y:315,w:22,t:.12,dur:.6,col:'#8ad0ff'}];
     if(kind==='ranged-impact')b.impact(215,326,0,'#ffe27a',2,'blunt','ranged');
     if(kind==='army-tracer')b.proj.push({kind:'arBullet',x:190,y:315,vx:300,vy:0,life:1,color:'#ffe8a0'});
     const t=kind==='ripple'?.2:kind==='meteor-pillar'?.1:.06;
     b.fx.forEach(f=>f.t=t);b.visualFx.forEach(f=>f.t=t);b.time=.6;b.visualTime=t;b.shakeT=0;b.zoom=null;
     Render.draw(vctx,b);vctx.save();vctx.font='11px monospace';vctx.fillStyle='#fff';vctx.fillText(kind,12,110);vctx.restore();
     return {calls,hp:b.u.map(x=>x.hp),position:b.u.map(x=>[x.x,x.y]),stats:b.stats,errors:BattleVFX.errors,parts:b.parts.length,fx:b.fx.length};
    } finally {Math.random=native;}
   },{kind,enabled}));
   const buf=await page.locator('#vfxCapture').screenshot({path:path.join(out,kind+(enabled?'':'-original')+'.png')});images.push(crypto.createHash('sha256').update(buf).digest('hex'));
  }
  assert.deepStrictEqual(states[0],states[1],kind+' combat/RNG changed');
  if(kept.includes(kind))assert.notStrictEqual(images[0],images[1],kind+' upgraded visual missing');
  else assert.strictEqual(images[0],images[1],kind+' failed original fallthrough');
  report.push({kind,upgraded:images[0]!==images[1],state:states[1]});console.log('FIXTURE_OK',JSON.stringify(report.at(-1)));
 }
 assert.deepStrictEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
