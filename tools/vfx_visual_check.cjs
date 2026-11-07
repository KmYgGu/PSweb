// Optional developer-only visual smoke check. Install playwright separately; see VFX.md.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const out=path.resolve(process.argv[2]||'vfx-check-shots');
const game=path.resolve(__dirname,'..','index.html');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:360,height:640},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='warning' && m.text().includes('PixelFX'))console.log(m.text())});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0});
 await page.goto(require('url').pathToFileURL(game).href);await page.waitForTimeout(1300);
 await page.evaluate(()=>{const cv=document.createElement('canvas');cv.id='vfxCapture';cv.width=360;cv.height=640;cv.style='position:fixed;top:0;left:0;z-index:99999;width:360px;height:640px';document.body.append(cv);window.vctx=cv.getContext('2d');});
 fs.mkdirSync(out,{recursive:true});
 for(const [kind,time] of [['slash',.075],['crit',.05],['explosion',.07],['explosion-tail',.23],['bolt',.07],['frozen',.7],['burning',.7],['ripple',.2],['pillar',.07],['meteor',.18],['status',.8],['mystic',.7],['broly',.7],['sans',.9],['water-splash',.1],['kaiba-beam',.12],['dragon-breath',.6],['death',.08],['vortex',.6],['fire-field',.6],['hearts',.9],['galford-orb',.3],['genji-guard',.6],['okuyasu-charge',.2]]){
 const st=await page.evaluate(({kind,time})=>{
  const id=kind==='broly'?'broly':kind==='sans'?'sans':kind==='mystic'?'mystic':kind==='galford-orb'?'galford':kind==='okuyasu-charge'?'okuyasu':'genji';
  const b=new Battle(CHARACTERS.find(c=>c.id===id),CHARACTERS.find(c=>c.id==='army'),{},'arena');
  b.u[0].x=140;b.u[1].x=205;b.u.forEach(u=>u.y=340);window.fixture=b;
  if(kind==='genji-guard')b.u[0].gj={def:1,blade:2,dragonT:.4};
  if(kind==='okuyasu-charge'){b.u[0].ok=b.u[0].ok||{};b.u[0].ok.erase={x:140,y:340,ang:0,W:40,L:140,t:.2,charge:.4};}
  if(kind==='vortex')b.u[0].bzHole={objs:[]};
  if(kind==='fire-field')b.rdFlames=[{x:190,y:340,size:20,a:.5}];
  if(kind==='hearts')b.bfx=[{type:'hearts',a:b.u[0],b:b.u[1],t:.9,dur:1.1,items:[]}];
  if(kind==='galford-orb'){const slot=b.u[0].skills.find(s=>s.id==='galShock');SKILLS.galShock.use(b.u[0],b.u[1],b,slot);b.u[0].action.next();b.proj.forEach(p=>{p.x=180;p.y=310;});}
  if(kind==='slash'){b.slashFx(185,320,1,'#a0ffc0',1);b.impact(200,318,0,'#aaffc8',0,'slash');}
  if(kind==='crit')b.impact(205,318,0,'#ffe27a',2,'blunt');
  if(kind.startsWith('explosion'))b.explosion(205,333,66,'#ff9c42');
  if(kind==='bolt')b.bolt(205,330,100,'#86caff');
  if(kind==='frozen')b.u[1].statuses.push({id:'gFrozen',t:2.3,dur:3});
  if(kind==='burning')b.u[1].bbqHeat=95;
  if(kind==='ripple'||kind==='water-splash')b.fx.push({type:'ripple',x:205,y:340,t:0,dur:.6,big:kind==='water-splash'});
  if(kind==='pillar')b.pillar(205,340,'#ffb45a');
  if(kind==='meteor')b.meteor(205,340,.4);
  if(kind==='status'){b.u[0].statuses.push({id:'stun',t:2.2,dur:3});b.u[1].statuses.push({id:'poison',t:2.2,dur:3});}
  if(kind==='mystic')b.u[0].orb={x:190,y:315,trail:[[175,320],[180,318]]};
  if(kind==='broly')b.u.find(u=>u.def.id==='broly') .form=b.u.find(u=>u.def.id==='broly').def.lss.form;
  if(kind==='kaiba-beam')b.kfx=[{type:'ebeam',x:110,y:280,ca:1,sa:.2,L:180,w:22,t:.12,dur:.9,col:'#8ad0ff',col2:'#e8f8ff',seed:12}];
  if(kind==='death'){b.u[1].dead=true;b.u[1].deadT=.08;}
  if(kind==='sans'){b.snObjs=[{x:120,y:300,ang:.1,t:.9,tele:.6,fire:.5}];}
  b.fx.forEach(f=>f.t=time);b.visualFx.forEach(f=>f.t=time);b.time=time;b.visualTime=time;b.shakeT=0;b.zoom=null;
  Render.draw(vctx,b);if(kind==='dragon-breath'){vctx.save();vctx.translate(145,300);BattleVFX.breath(vctx,b,130,.35,.6);vctx.restore();}vctx.save();vctx.font='11px monospace';vctx.fillStyle='#fff';vctx.fillText('VFX fixture: '+kind,12,110);vctx.restore();
  return {enabled:BattleVFX.enabled,errors:BattleVFX.errors};
 },{kind,time});
 await page.locator('#vfxCapture').screenshot({path:path.join(out,kind+'.png')});console.log(kind,JSON.stringify(st));assert(st.enabled);assert.deepStrictEqual(st.errors,[]);
 }
 const moduleSmoke=await page.evaluate(()=>{BattleVFX.enabled=true;for(const id of Object.keys(PixelFX.effects)){const key={};for(const t of [.033,.18,.48])for(const layer of [0,1]){BattleVFX.begin(fixture);BattleVFX.live(vctx,key,id,t,180,300,{color:'#aaddff',scale:.45},layer);}}return BattleVFX.errors});
 assert.deepStrictEqual(moduleSmoke,[]);assert.deepStrictEqual(errors,[]);console.log('ALL_SELECTED_MODULES_OK',moduleSmoke);
 await browser.close();
})();
