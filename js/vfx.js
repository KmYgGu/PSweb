/* Visual-only PixelFX/Codixel adapter. No simulation random calls, timers, combat writes or actor redraws.
 * WeakMaps hold every live instance: nothing is added to units, projectiles or replay state.
 * See VFX.md and vendor/{pixelfx,codixel}/{LICENSE,NOTICE.md} for MIT attribution. */
(() => {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const X = root.PixelFX;
  const available = !!(X && X.effects && X.Pixel && typeof document !== 'undefined' && typeof ImageData !== 'undefined');
  const P = X && X.Pixel;
  const states = new WeakMap(), extras = new WeakMap(), muted = new WeakSet(), surfaces = new Map(), ramps = new Map(), glows = new Map();
  const emptyMask = { w: 24, h: 40, data: new Uint8Array(960) };
  // Geometry ONLY. Empty mask/pixels/eyes means stock status modules cannot paint a dummy body/face.
  const actor = { x: -12, y: -40, w: 24, h: 40, mask: emptyMask, pixels: new Uint32Array(960), eyes: [] };
  let draws = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rgb(c) { if (typeof c !== 'string') return [180, 210, 255]; if (/^#[\da-f]{3}$/i.test(c)) c = '#' + [...c.slice(1)].map(v => v + v).join(''); if (!/^#[\da-f]{6,8}$/i.test(c)) return [180, 210, 255]; return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
  const hex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function palette(color) {
    color = color || '#a8d8ff';
    if (ramps.has(color)) return ramps.get(color);
    const c = rgb(color), [h, s] = P.toHsl(c);
    const r = P.hueRamp(8, { hue: h, sat: Math.max(0.18, s), shift: 24, satDrop: 0.25, light: [0.10, 0.94] }).map(v => hex(P.unpack(v)));
    // Preserve the caller's exact mid/high colour instead of recoloring every skill alike.
    r[5] = hex(P.mix(c, [255,255,255], 0.08)); r[6] = hex(P.mix(c, [255,255,238], 0.58)); r[7] = '#fffdf2';
    ramps.set(color, r); return r;
  }
  function surface(size) {
    const n = Math.ceil(size / 32) * 32;
    if (surfaces.has(n)) return surfaces.get(n);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('VFX canvas unavailable');
    const s = { canvas, ctx, frame: X.createFrame(n, n, -n / 2, -n / 2), img: new ImageData(n, n) };
    surfaces.set(n, s); return s;
  }
  function fail(e) { API.errors.push(String(e.message || e)); API.enabled = false; console.warn('PixelFX disabled; original canvas effects restored.', e); }
  function live(ctx, key, id, t, x, y, opt = {}, layer = 1) {
    if (!API.enabled || !available || !ctx || !Number.isFinite(x + y + t) || t < 0) return false;
    const mod = X.effects[id]; if (!mod) return false;
    try {
      let bank = states.get(key); if (!bank) states.set(key, bank = new Map());
      const code = id + ':' + (opt.slot || '');
      let s = bank.get(code);
      // Absolute effect time supports pause, duplicate render passes and replay rewinds.
      const tt = Math.floor(Math.max(0, t) * 30 + 1e-6) / 30;
      if (!s || tt < s.time - 1e-6) {
        const angle = opt.angle || 0, cx = opt.cx || 0, cy = opt.cy || 0, fx = opt.flip ? -1 : 1;
        const opts = { actor, seed: hash(id + ':' + x.toFixed(1) + ':' + y.toFixed(1) + ':' + (opt.seed || 0)), light: 0.45, ...opt,
          x: -(cx * fx * Math.cos(angle) - cy * Math.sin(angle)), y: -(cx * fx * Math.sin(angle) + cy * Math.cos(angle)) };
        if (opt.color) opts.palette = palette(opt.color);
        s = { fx: X.createFx(mod, opts), time: 0 }; bank.set(code, s);
      }
      // Per-frame work budget: prevent burst/rapid-fire spam from hurting mobile UI.
      // Recognised low-priority effects are omitted, never replaced with double-drawn flat strokes.
      if (draws >= 32 && !opt.priority) return true;
      draws++;
      if (tt > s.time) { s.fx.update(tt - s.time); s.time = tt; }
      const ang=opt.angle||0,fx=opt.flip?-1:1,cx=opt.cx||0,cy=opt.cy||0;
      Object.assign(s.fx.options,{angle:ang,flip:!!opt.flip,x:-(cx*fx*Math.cos(ang)-cy*Math.sin(ang)),y:-(cx*fx*Math.sin(ang)+cy*Math.cos(ang))});
      const size = opt.buffer || Math.min(384, Math.max(...mod.meta.size) * (opt.angle ? 1.42 : 1) + 32);
      const f = surface(size); X.clearFrame(f.frame); s.fx.draw(f.frame, layer === 0 ? 'back' : 'front');
      X.composite(f.frame, f.img.data, null, 0.55); f.ctx.putImageData(f.img, 0, 0);
      const scale = opt.scale ?? 0.5, n = f.canvas.width, w = Math.max(1, Math.round(n * scale));
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha *= opt.alpha ?? 1;
      ctx.drawImage(f.canvas, Math.round(x - w / 2), Math.round(y - w / 2), w, w); ctx.restore();
      return true;
    } catch (e) { fail(e); return false; }
  }
  function drawFx(ctx, f, layer) {
    if (!API.enabled || !available) return false;
    if (muted.has(f)) return true;
    if (f.t < 0) return ['slash','crescent','glow','shock','ring','bolt','pillar','meteor','impact','wallDust','streak','ripple'].includes(f.type);
    const d = Math.max(0.01, f.dur - (f.delay || 0)), p = clamp(f.t / d, 0, 1), c = f.color || '#ffae64';
    const at = (id, opt = {}, time) => live(ctx, f, id, time ?? p * X.effects[id].meta.duration * 0.98, f.x, f.y, { color: c, ...opt }, layer);
    switch (f.type) {
      case 'chargeCue': {
        if(layer===0 && !f.u.dead && f.u.action && f.u.action.chargeTell){ctx.save();ctx.translate(f.u.x,f.u.y-4);ctx.rotate(f.ang);for(let i=-1;i<=1;i++){const xx=-42*(1-p)-8,yy=i*13;pixelPath(ctx,[[xx-13,yy],[xx,yy*.45]],c,(1-p)*.7,2);}ctx.restore();}return true;
      }
      case 'slash': return at('melee/sword-slash', { cx: 6, cy: -26, scale: clamp(0.45 * (f.s || 1), 0.25, 0.65), flip: f.dir < 0 }, p * 0.48);
      case 'crescent': return at('melee/double-slash', { cx:34, cy: -23, angle: f.ang || 0, scale: clamp((f.r || 24) / 75, 0.3, 0.7) }, p * 0.65);
      case 'impact': {
        const id = f.tier >= 1 ? 'impacts/crit-hit' : f.element === 'slash' ? 'melee/sword-slash' : f.element === 'elec' || f.element === 'electric' || f.element === 'lightning' ? 'lightning/zap-hit' : f.delivery === 'ranged' && f.element === 'blunt' ? 'impacts/bullet-impact' : f.element === 'blunt' ? 'impacts/blunt-hit' : 'impacts/hit-spark';
        return at(id, { cy: id.startsWith('lightning') ? 0 : -(X.effects[id].meta.options.height || 26), cx: id.startsWith('melee') ? 6 : 0, angle: f.ang || 0, scale: f.tier >= 3 ? 0.7 : f.tier >= 1 ? 0.48 : 0.42, priority: true }, id.startsWith('melee') ? p*0.48 : f.t < 0.07 ? f.t : 0.07+(f.t-0.07)*3.5);
      }
      case 'shock': case 'ring': return wave(ctx, f, layer);
      case 'glow': if(layer===0)glow(ctx,f.x,f.y,f.r*(.65+p*.25),c,(1-p)*.8);else orbit(ctx,f.x,f.y,f.t*3,c,4,Math.min(22,f.r*.45));return true;
      case 'wallDust': return at('impacts/heavy-landing', { scale: 0.45, alpha: 0.65, stone: c });
      case 'bolt': {
        if (!f.pts || !f.pts.length) return false;
        const end = f.pts[f.pts.length - 1];
        if (layer === 1) pixelPath(ctx, f.pts, c, (1 - p) ** 1.4, 3);
        return live(ctx, f, 'lightning/zap-hit', 0.055 + p * 0.78, end[0], end[1], { color: c, scale: 0.42, angle: Math.PI / 2, priority: true }, layer);
      }
      case 'pillar': return at('fire/flame-pillar', { scale: 0.5 }, 0.55 + p * 4.4);
      // This game's meteor is ONLY the inbound cue. Never show the library's impact early.
      case 'meteor': return at('fire/meteor', { scale: 0.52, flip: true }, p * 0.615);
      case 'streak': if (layer === 1) beam(ctx, f.x1, f.y1, f.x2, f.y2, f.w * (1 - p * 0.6), c, 1 - p, f.t); return true;
      case 'ripple': return at(f.big ? 'water/splash' : 'water/ripples', { color: '#66bde9', scale: f.big ? 0.55 : 0.5, alpha: (1 - p) * 0.9 }, p * (f.big ? 2.45 : 1.6) + 0.04);
      default: return false;
    }
  }
  // Codixel flat bands + thin boundary dither; used for exact-geometry waves/lines, never enlarges hitboxes.
  function blit(ctx, buf, x, y, a = 1) {
    const n = surface(Math.max(buf.w, buf.h)); n.ctx.clearRect(0,0,n.canvas.width,n.canvas.height);
    P.blit(buf,n.ctx,0,0); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha *= a;
    ctx.drawImage(n.canvas,0,0,buf.w,buf.h,Math.round(x),Math.round(y),buf.w,buf.h); ctx.restore();
  }
  function wave(ctx, f, layer) {
    const p = clamp(f.t / f.dur,0,1), r = f.r0 + (f.r1-f.r0)*(1-(1-p)**3), sy = f.type === 'shock' ? 0.35 : 0.55;
    const R = Math.min(125,Math.max(1,r)), pad=5, w=Math.ceil(R+pad)*2, h=Math.ceil(R*sy+pad)*2;
    const b=new P.Buf(w,h), pal=palette(f.color).map(c=>P.col(rgb(c))), width=Math.max(1,(f.w || 3)*(1-p)*0.65);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const dx=x-w/2, dy=(y-h/2)/sy, dist=Math.hypot(dx,dy), v=1-Math.abs(dist-R)/width;
      if(v<0 || (layer===0 ? dy>=0 : dy<0)) continue;
      b.pset(x,y,pal[P.band(v,8,x,y,0.18)]);
    }
    blit(ctx,b,f.x-w/2,f.y-h/2,(1-p)*0.82); return true;
  }
  function pixelPath(ctx, pts, color, alpha=1, width=1) {
    if(!available || !API.enabled || pts.length<2) return false;
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]), pad=width+2, x0=Math.floor(Math.min(...xs)-pad), y0=Math.floor(Math.min(...ys)-pad);
    const w=Math.min(900,Math.ceil(Math.max(...xs)-x0+pad)),h=Math.min(900,Math.ceil(Math.max(...ys)-y0+pad));
    if(w<1 || h<1) return true;
    const b=new P.Buf(w,h), ramp=palette(color).map(c=>P.col(rgb(c)));
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1],c=pts[i];
      if(width>1) b.line(a[0]-x0,a[1]-y0,c[0]-x0,c[1]-y0,ramp[2],Math.ceil(width));
      b.line(a[0]-x0,a[1]-y0,c[0]-x0,c[1]-y0,ramp[6]);
    }
    if(width<=1){const m=P.pixelPerfect(b.px.map(c=>c?1:0),w,h);for(let i=0;i<m.length;i++)if(!m[i])b.px[i]=0;}
    blit(ctx,b,x0,y0,alpha);return true;
  }
  function beam(ctx,x1,y1,x2,y2,width,color,alpha=1,t=0) {
    if(!available || !API.enabled) return false;
    // Raster in a thin local strip, then nearest-neighbour stamp individual pixels in world space.
    // Retains the exact endpoints/width; no decorative target, dummy, extra projectile or warning delay.
    const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);if(!L)return true;
    const pal=palette(color).map(c=>P.col(rgb(c))),half=clamp(width/2,.5,40),pad=Math.ceil(half);
    const buf=new P.Buf(Math.ceil(L)+1,pad*2+1);
    for(let d=0;d<buf.w;d++)for(let q=-pad;q<=pad;q++){
      const v=1-Math.abs(q)/half;if(v<0)continue;
      buf.pset(d,q+pad,pal[P.band(Math.pow(v,.6),8,d,q,.15)]);
    }
    ctx.save();ctx.translate(x1,y1);ctx.rotate(Math.atan2(dy,dx));blit(ctx,buf,0,-pad,alpha);ctx.restore();return true;
  }

  function glow(ctx,x,y,r,color,a) {
    if(!available || !API.enabled || !(r>0&&a>0))return false;
    const k=color || '#c0d8ff';let c=glows.get(k);
    if(!c){const b=new P.Buf(48,48),cs=rgb(k);for(let y=0;y<48;y++)for(let x=0;x<48;x++){
      const v=1-Math.hypot((x-23.5)/24,(y-23.5)/24);if(v<=0)continue;
      const band=P.band(v,5,x,y,0.16),al=[0.015,0.035,0.08,0.16,0.27][band];b.px[y*48+x]=((Math.round(al*255)<<24)|(P.col(cs)&0xffffff))>>>0;
    }c=document.createElement('canvas');c.width=c.height=48;P.blit(b,c.getContext('2d'));glows.set(k,c);}
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=Math.min(1,a);ctx.globalCompositeOperation='lighter';ctx.drawImage(c,Math.round(x-r),Math.round(y-r*.85),Math.round(r*2),Math.round(r*1.7));ctx.restore();return true;
  }
  function particle(ctx,p) {
    if(!available || !API.enabled)return false;if(muted.has(p))return true;
    const a=clamp(p.life/p.max,0,1),r=Math.max(1,Math.ceil(p.size)),ramp=palette(p.color);
    if(p.soft){
      ctx.save();ctx.globalAlpha*=a*0.34;ctx.fillStyle=ramp[3];
      const s=Math.ceil(r*(1.5-a*.4));ctx.fillRect(Math.round(p.x-s/2),Math.round(p.y-s/2),s,s);
      ctx.fillStyle=ramp[4];ctx.fillRect(Math.round(p.x-s/2),Math.round(p.y-s/2),Math.max(1,s-1),Math.max(1,s/2));ctx.restore();return true;
    }
    if(p.line)return pixelPath(ctx,[[p.x-p.vx*.025,p.y-p.vy*.025],[p.x,p.y]],p.color,a,r>2?2:1);
    ctx.save();ctx.globalAlpha*=a;ctx.fillStyle=ramp[2];ctx.fillRect(Math.round(p.x-r/2),Math.round(p.y-r/2),r,r);
    ctx.fillStyle=ramp[5];ctx.fillRect(Math.round(p.x-r/2),Math.round(p.y-r/2),Math.max(1,r-1),Math.max(1,r-1));
    ctx.fillStyle=ramp[7];ctx.fillRect(Math.round(p.x-r/2),Math.round(p.y-r/2),1,1);ctx.restore();return true;
  }
  function overlay(b,type,x,y,color,scale,dur=0.6) {
    let list=extras.get(b);if(!list)extras.set(b,list=[]);
    list.push({type,x,y,color,scale,dur,start:b.visualTime||0,t:0});if(list.length>48)list.shift();
  }
  function begin(b) { draws=0;const list=extras.get(b);if(list)extras.set(b,list.filter(f=>(b.visualTime||0)-f.start<f.dur)); }
  function drawExtras(ctx,b,layer) {
    if(!API.enabled)return;
    for(const f of extras.get(b)||[]){f.t=Math.max(0,(b.visualTime||0)-f.start);const p=f.t/f.dur;
      if(f.type==='smoke'){if(layer===0)smoke(ctx,f,f.x,f.y,p*f.dur,f.color,22,16,1-p);continue;}
      const id={explosion:'explosions/small-explosion',debris:'impacts/heavy-landing',sparks:'impacts/hit-spark',heal:'holy/heal'}[f.type];
      if(id)live(ctx,f,id,f.type==='explosion' ? (f.t<.15?f.t*2:.3+(f.t-.15)*7) : p*X.effects[id].meta.duration*.98,f.x,f.y,{color:f.color,scale:f.scale,cy:f.type==='sparks'?-20:0,alpha:Math.min(1,(1-p)*4)},layer);
    }
    for(const u of b.u){if(u.hidden)continue;const x=u.x+u.kx,y=u.y+u.ky-b.airZ(u);
      if(u.dead){if(u.deadT<0.45)live(ctx,u,'spawn/poof',u.deadT/0.45*1.58,x,y-14,{scale:.52,cy:-17,color:'#d8d0ea',alpha:.6,slot:'death'},layer);continue;}
      statuses(ctx,u,b,x,y,layer);
    }
  }
  function smoke(ctx,key,x,y,t,color,height=28,width=5,alpha=1) {
    if(!API.enabled || !available)return false;
    let bank=states.get(key);if(!bank)states.set(key,bank=new Map());
    let s=bank.get('smoke');if(!s){s=new P.Smoke({height,width,cols:palette(color).slice(1,6).map(rgb),bits:0,seed:hash(color),swayAmp:4,warp:12});bank.set('smoke',s);}
    const w=Math.ceil(width*14+32),h=Math.ceil(height*1.6+16),b=new P.Buf(w,h);s.draw(b,w/2,h-4,t);blit(ctx,b,x-w/2,y-h+4,alpha*.65);return true;
  }
  function flame(ctx,key,x,y,t,color,height=40,width=14,alpha=1) {
    if(!API.enabled || !available)return false;
    let bank=states.get(key);if(!bank)states.set(key,bank=new Map());
    const name='flame:'+height+':'+width;let s=bank.get(name);if(!s){s=new P.Flame({height,width,cols:palette(color).slice(2).map(rgb),bits:0,seed:hash(color),swayAmp:4,dither:.2});bank.set(name,s);}
    const w=Math.ceil(width*4+24),h=Math.ceil(height*1.5+12),b=new P.Buf(w,h);s.draw(b,w/2,h-4,t);blit(ctx,b,x-w/2,y-h+4,alpha);return true;
  }
  const statusMap={stun:'stunned',flinch:'stunned',arHalt:'stunned',confusion:'confused',gSleep:'sleep',snSleep:'sleep',bzTired:'sleep',slow:'slowed',snStill:'slowed',gStop:'slowed',charm:'charmed',charmed:'charmed'};
  function statuses(ctx,u,b,x,y,layer){
    for(const st of u.statuses){const d=typeof STATUS_DEFS!=='undefined'&&STATUS_DEFS[st.id],color=d&&d.color||'#b8a0e8',t=Math.max(0,(st.dur??st.t)-st.t),mapped=statusMap[st.id];
      if(mapped)live(ctx,st,'status/'+mapped,t,x,y-10,{scale:.72,color,priority:true},layer);
      else if(/Frozen|freeze|frozen|petrify|clsFreeze/i.test(st.id)){
        // No stock status/frozen: it redraws its entire dummy. Custom edge crystals leave the sprite intact.
        if(layer===1)crystals(ctx,st,x,y,t,color,st.id==='petrify');
      }else if(/burn|fire/i.test(st.id)){if(layer===0)flame(ctx,st,x,y,t,color,32,12,.65);}
      else if(st.id==='paralysis'||st.id==='mcShock'){live(ctx,st,'lightning/zap-hit',.06+(t%.45),x,y-20,{scale:.3,color,slot:'status'},layer);}
      else if(st.id==='poison'||/curse|snKR|bleed|weaken|resistDown|kiDown/.test(st.id)){
        if(layer===0)smoke(ctx,st,x,y,t,color,32,3,.65);
        if(layer===1)orbit(ctx,x,y-14,t,color,3,16);
      }else{ // All other active debuffs get a small, colour-matched orbit; lock/rope/sword silhouettes remain.
        if(layer===0)orbit(ctx,x,y-12,t,color,3,18);
      }
    }
    if(u.bbqHeat>35){if(layer===0)flame(ctx,u,x,y,b.time,'#ff982a',32,16,Math.min(.75,u.bbqHeat/140));else flame(ctx,u,x,y,b.time,'#ff982a',10,12,.42);}
    if(u.buff('shield'))live(ctx,u,'holy/divine-shield',b.time,x,y,{scale:.85,color:'#bfe3ff',slot:'shield',alpha:.6},layer);
    if(layer===0&&u.buff('rage'))flame(ctx,u,x,y,b.time,'#ff6a4a',38,14,.45);
    if(u.buff('hexCurse')&&layer===0)smoke(ctx,u.buff('hexCurse'),x,y,b.time,'#ff4a7a',24,3,.5);
  }
  function orbit(ctx,x,y,t,color,n=5,r=14){const pal=palette(color);ctx.save();for(let i=0;i<n;i++){const a=t*2+i*Math.PI*2/n,xx=Math.round(x+Math.cos(a)*r),yy=Math.round(y+Math.sin(a)*r*.35);ctx.globalAlpha*=.85;ctx.fillStyle=pal[3];ctx.fillRect(xx-1,yy,3,2);ctx.fillStyle=pal[6];ctx.fillRect(xx,yy,1,1);}ctx.restore();}
  function crystals(ctx,key,x,y,t,color,stone=false){const pal=palette(color);ctx.save();ctx.globalAlpha*=.75;for(let i=0;i<5;i++){
    const xx=Math.round(x+(i-2)*7),yy=Math.round(y-2+(i%2)*3),h=stone?5:7+i%3*3;
    for(let q=0;q<h;q++){const w=Math.max(1,Math.round((1-q/h)*3));ctx.fillStyle=pal[2];ctx.fillRect(xx-w,yy-q,w*2,1);ctx.fillStyle=pal[5];ctx.fillRect(xx-w,yy-q,w,1);}
    if(!stone&&Math.sin(t*5+i)>0.5){ctx.fillStyle=pal[7];ctx.fillRect(xx-1,yy-h-2,3,1);ctx.fillRect(xx,yy-h-3,1,3);}
  }ctx.restore();}
  function vortex(ctx,key,x,y,r,t,color='#9a60d8'){
    if(!API.enabled||!available)return false;const R=Math.ceil(Math.min(75,r)),b=new P.Buf(R*2+4,R*2+4),pal=palette(color).map(c=>P.col(rgb(c)));
    for(let yy=0;yy<b.h;yy++)for(let xx=0;xx<b.w;xx++){const d=Math.hypot(xx-b.w/2,yy-b.h/2)/R;if(d>1)continue;const k=P.band(Math.max(0,d*.8),8,xx,yy,.15);b.pset(xx,yy,pal[Math.min(4,k)]);}
    blit(ctx,b,x-b.w/2,y-b.h/2,.7);
    for(let i=0;i<3;i++){const pts=[];for(let j=0;j<70;j++){const q=j/69,ang=-t*3+i*Math.PI*2/3+q*4,rr=R*(1-q*.85);pts.push([x+Math.cos(ang)*rr,y+Math.sin(ang)*rr]);}pixelPath(ctx,pts,color,.6,2);}return true;
  }
  function orb(ctx,key,x,y,t,color='#d890ff',scale=.32){
    if(!API.enabled)return false;
    const a=live(ctx,key,'arcane/arcane-orb',t,x,y,{color,scale,cy:-52,priority:true},0);
    return live(ctx,key,'arcane/arcane-orb',t,x,y,{color,scale,cy:-52,priority:true},1)&&a;
  }
  function breath(ctx,key,L,half,t,color='#ff992a') {
    if(!available||!API.enabled)return false;
    let bank=states.get(key);if(!bank)states.set(key,bank=new Map());
    let s=bank.get('breath');const length=Math.ceil(Math.min(420,L));
    if(!s||s.length!==length||t<s.time){s={fx:new P.Breath({length,cols:palette(color).map(rgb),seed:hash(color)}),time:t,length};s.fx.step(true,150);bank.set('breath',s);}
    const steps=Math.min(12,Math.floor(Math.max(0,t-s.time)*90));if(steps){s.fx.step(true,steps);s.time+=steps/90;}
    const h=Math.ceil(Math.min(380,L*Math.tan(half)*2+40)),buf=new P.Buf(length+30,h);buf.oy=-Math.floor(h/2);
    s.fx.draw(buf,14,0,-half,half,t,1,buf.oy+buf.h);blit(ctx,buf,0,buf.oy,.85);return true;
  }
  function projectile(ctx,p){
    if(!API.enabled||!available)return false;
    if(p.kind==='arBullet'||p.kind==='mcBullet'||p.kind==='bullet')return live(ctx,p,'projectiles/bullet-tracer',Math.max(0,1.4-p.life),p.x,p.y,{scale:.35,length:52,color:p.reflected?'#ffe27a':'#ffe8a0',angle:Math.atan2(p.vy,p.vx)},1);
    if(!p.draw && (p.kind==='magic'||p.kind==='holy'))return orb(ctx,p,p.x,p.y,Math.max(0,4-p.life),p.color || (p.kind==='holy'?'#ffe7a0':'#d8a0ff'),.25);
    return false;
  }
  function blast(b,x,y,r,fi,pi,color='#ff9a4a'){
    if(!available||!API.enabled)return;
    for(let i=fi;i<b.fx.length;i++)muted.add(b.fx[i]);for(let i=pi;i<b.parts.length;i++)muted.add(b.parts[i]);
    const list=extras.get(b)||[];extras.set(b,list.filter(f=>Math.abs(f.x-x)>1||Math.abs(f.y-y)>20||f.start!==(b.visualTime||0)));
    overlay(b,'explosion',x,y,color,clamp(r/90,.4,.7),.72);
  }
  const API=root.BattleVFX={enabled:available,errors:[],palette,begin,drawFx,drawExtras,glow,particle,pixelPath,beam,flame,smoke,orb,projectile,live,crystals,breath,blast,vortex};
  if(!available || typeof Battle==='undefined')return;
  // Preserve every original call and RNG draw. Only the renderer's WeakSets hide the replaced primitives.
  for(const name of ['explosion','debris','sparks','smoke','heal']){
    const original=Battle.prototype[name];if(!original)continue;
    Battle.prototype[name]=function(...args){
      const fi=this.fx.length,pi=this.parts.length,result=original.apply(this,args);
      if(!API.enabled)return result;
      let x=args[0],y=args[1],color=args[2],scale=.4,dur=.6;
      if(name==='heal'){const u=args[0];if(args[2])return result;x=u.x;y=u.y;color='#80e88a';scale=.7;dur=.55;}
      if(name==='explosion'){color='#ff9a4a';scale=clamp(args[2]/90,.32,.65);dur=.72;}
      if(name==='debris'){color='#c8b898';scale=.4;dur=.55;}
      if(name==='sparks'){scale=clamp((args[3]||4)/55,.16,.4);dur=.28;}
      if(name==='smoke'){dur=.65;}
      overlay(this,name,x,y,color,scale,dur);
      if(name!=='heal'||!args[2]){
        for(let i=fi;i<this.fx.length;i++)muted.add(this.fx[i]);
        for(let i=pi;i<this.parts.length;i++)muted.add(this.parts[i]);
      }
      // An explosion already has its own fire/sparks/smoke: remove nested decoration overlays only.
      if(name==='explosion'){const list=extras.get(this);extras.set(this,list.filter(f=>f.type==='explosion'||Math.abs(f.x-x)>1||Math.abs(f.y-y)>20||f.start!==(this.visualTime||0)));}
      return result;
    };
  }
})();
