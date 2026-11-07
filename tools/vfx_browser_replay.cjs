// Optional developer-only rendered on/off RNG check. See VFX.md.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:360,height:640}});const errs=[];page.on('pageerror',e=>errs.push(e.stack));
 await page.addInitScript(()=>window.requestAnimationFrame=()=>0);await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'..','index.html')).href);await page.waitForTimeout(1000);
 const result=await page.evaluate(()=>{
  const native=Math.random,cv=document.createElement('canvas');cv.width=360;cv.height=640;const ctx=cv.getContext('2d');
  function run(enabled,mode){BattleVFX.enabled=enabled;let a=0x4bca71,n=0;const rng=()=>{n++;a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296};
   Math.random=rng;const b=new Battle(CHARACTERS.find(c=>c.id==='genji'),CHARACTERS.find(c=>c.id==='army'),{mode},'arena');Math.random=native;
   let frame=0,renderMs=0,renders=0;while(!b.over&&b.time<60){Math.random=rng;b.update(1/120);Math.random=native;b.updateVisual(1/120);if(frame++%8===0){const t=performance.now();Render.draw(ctx,b);renderMs+=performance.now()-t;renders++;}}
   return {n,winner:b.winner?.team??-1,time:b.time,hp:b.u.map(u=>u.hp),position:b.u.map(u=>[u.x,u.y]),stats:b.stats,renderMs:renderMs/renders};
  }
  return ['A','B'].map(mode=>({mode,off:run(false,mode),on:run(true,mode),errors:BattleVFX.errors,enabled:BattleVFX.enabled}));
 });
 for(const row of result){const off={...row.off},on={...row.on};delete off.renderMs;delete on.renderMs;assert.deepStrictEqual(on,off);assert(row.enabled);assert.deepStrictEqual(row.errors,[]);assert.deepStrictEqual(errs,[]);
 console.log('BROWSER_RENDER_ON_OFF_IDENTICAL',JSON.stringify(row));}await browser.close();
})();
