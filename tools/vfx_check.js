const assert=require('assert');
const {loadGame}=require('./headless.js');
const path=require('path');
const now=loadGame(path.resolve(__dirname,'..')), before=process.argv[2]?loadGame(path.resolve(process.argv[2])):now;
function run(g,mode){let a=0x4bca71,n=0;const native=Math.random;
 const rng=()=>{n++;a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296};
 Math.random=rng;let b;try{b=new g.Battle(g.CHARACTERS.find(c=>c.id==='genji'),g.CHARACTERS.find(c=>c.id==='army'),{mode},'arena');while(!b.over&&b.time<60)b.update(1/120);}finally{Math.random=native;}
 return {mode,n,winner:b.winner?.team??-1,time:b.time,end:b.endType,hp:b.u.map(u=>u.hp),position:b.u.map(u=>[u.x,u.y]),stats:b.stats};
}
for(const mode of ['A','B']){const old=run(before,mode),fresh=run(now,mode);assert.strictEqual(JSON.stringify(fresh),JSON.stringify(old));console.log(process.argv[2]?'BASELINE_IDENTICAL':'DETERMINISTIC_REPEAT',JSON.stringify(fresh));}
assert.strictEqual(now.BattleVFX.enabled,false);
console.log('HEADLESS_FALLBACK_OK');
