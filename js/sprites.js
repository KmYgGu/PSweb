/* 절차적 픽셀 스프라이트 생성 (16x16) */
const Sprites = (() => {
  const BASE = [
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HSSSSSSH....',
    '....SSESSESS....',
    '....SSSSSSSS....',
    '.....SSSSSS.....',
    '....BBBBBBBB....',
    '...BBBBAABBBB...',
    '...SBBBAABBBS...',
    '...SBBBBBBBBS...',
    '....BBBBBBBB....',
    '....LLL..LLL....',
    '....LLL..LLL....',
    '....DDD..DDD....',
    '................',
  ];
  const DEF_PAL = { S: '#f2c9a0', E: '#2a2230', D: '#3b2e2a', L: '#4a4058', H: '#555', B: '#777', A: '#bbb', W: '#ddd', w: '#7a5534', M: '#9cf' };
  const cache = {};

  function grid(def) {
    const sp = cfgOf(def);
    const g = BASE.map(r => r.split(''));
    for (const [i, row] of Object.entries(sp.rows || {})) g[+i] = row.padEnd(16, '.').slice(0, 16).split('');
    for (const [x, y, w, h, k] of sp.rects || []) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j]) g[j][i] = k;
    for (const [x, y, k] of sp.px || []) if (g[y] && x >= 0 && x < 16) g[y][x] = k;
    return g;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return 'rgb(' + c.join(',') + ')';
  }
  function render(g, pal, white) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d');
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const k = g[j][i]; if (k === '.') continue;
      x.fillStyle = white ? '#ffffff' : pal[k] || '#f0f';
      x.fillRect(i, j, 1, 1);
    }
    if (!white) { // 간단한 외곽선 (어두운 테두리)
      const o = document.createElement('canvas'); o.width = 18; o.height = 18;
      const ox = o.getContext('2d');
      ox.globalAlpha = 0.55;
      for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) ox.drawImage(silhouette(c, '#1a1622'), dx, dy);
      ox.globalAlpha = 1; ox.drawImage(c, 1, 1);
      return o;
    }
    const o = document.createElement('canvas'); o.width = 18; o.height = 18;
    o.getContext('2d').drawImage(c, 1, 1); return o;
  }
  function silhouette(src, col) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  /* sprite 설정 정규화
   *  sprite: 'assets/a.png'                         → 단일 이미지
   *  sprite: { src, frameW, frameH, frames, fps, scale, height, foot, portraitRect, pal/rows/px... }
   *  (src 없음/로드 실패 → 절차적 픽셀 스프라이트)                                      */
  function cfgOf(def) { const s = def.sprite; return typeof s === 'string' ? { src: s } : (s || {}); }
  const loaded = {}, portraits = {};
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
  }
  function preload(defs) {
    return Promise.all(defs.map(def => {
      const cfg = cfgOf(def), jobs = [];
      if (cfg.src) jobs.push(loadImg(cfg.src).then(img => { loaded[def.id] = img; }).catch(() => console.warn('스프라이트 로드 실패, 절차적 스프라이트 사용:', cfg.src)));
      if (cfg.back) jobs.push(loadImg(cfg.back).then(img => { loaded[def.id + '@back'] = img; }).catch(() => console.warn('뒷모습 로드 실패:', cfg.back)));
      if (def.portrait) jobs.push(loadImg(def.portrait).then(() => { portraits[def.id] = def.portrait; }).catch(() => console.warn('초상화 로드 실패:', def.portrait)));
      return Promise.all(jobs).then(() => { delete cache[def.id]; });
    }));
  }
  function portraitCanvas(def, src, sx, sy, sw, sh) {
    const p = document.createElement('canvas'); p.width = 48; p.height = 48;
    const px = p.getContext('2d'); px.imageSmoothingEnabled = false;
    const bg = px.createLinearGradient(0, 0, 0, 48);
    bg.addColorStop(0, shade(def.color, 0.55)); bg.addColorStop(1, shade(def.color, 0.3));
    px.fillStyle = bg; px.fillRect(0, 0, 48, 48);
    const k = 42 / Math.max(sw, sh);
    px.drawImage(src, sx, sy, sw, sh, Math.round(24 - sw * k / 2), 6, Math.round(sw * k), Math.round(sh * k));
    return p;
  }
  function get(def) {
    if (cache[def.id]) return cache[def.id];
    const cfg = cfgOf(def);
    const img = loaded[def.id];
    let s;
    if (img) {
      const fw = cfg.frameW || img.width, fh = cfg.frameH || img.height;
      const frames = cfg.frames || Math.max(1, Math.floor(img.width / fw));
      // 표시 배율: 지정 없으면 높이 ~54px에 가까운 0.5 단위 배율 (내부 2배 해상도라 0.5 단위도 선명)
      const scale = cfg.scale || (cfg.height ? cfg.height / fh : Math.max(0.5, Math.round(54 / fh * 2) / 2));
      s = { img, white: silhouette(img, '#ffffff'), fw, fh, frames, fps: cfg.fps || 6, dw: fw * scale, dh: fh * scale, foot: cfg.foot != null ? cfg.foot * scale : 0 };
      const bimg = loaded[def.id + '@back']; // 뒷모습 (위쪽으로 이동할 때)
      if (bimg) { const bs = bimg.height / fh * scale; s.back = { img: bimg, white: silhouette(bimg, '#ffffff'), fw: bimg.width, fh: bimg.height, frames: 1, fps: 0, dw: bimg.width * scale * fh / bimg.height, dh: fh * scale, foot: s.foot }; }
      let pc;
      const r = cfg.portraitRect || [Math.round(fw * 0.125), 0, Math.round(fw * 0.75), Math.round(fw * 0.75)];
      pc = portraitCanvas(def, img, r[0], r[1], r[2], r[3]);
      try { s.portrait = portraits[def.id] || pc.toDataURL(); } catch (e) { s.portrait = portraits[def.id] || cfg.src; } // file:// 오염 대비
    } else {
      const pal = { ...DEF_PAL, B: def.color || DEF_PAL.B, ...cfg.pal };
      const g = grid(def);
      s = { img: render(g, pal, false), white: render(g, pal, true), fw: 18, fh: 18, frames: 1, fps: 0, dw: 54, dh: 54, foot: 3 };
      s.portrait = portraits[def.id] || portraitCanvas(def, s.img, 2, 0, 14, 14).toDataURL();
    }
    if (portraits[def.id]) s.portrait = portraits[def.id];
    return (cache[def.id] = s);
  }
  // 프레임 그리기 (발 위치 = 원점)
  function draw(ctx, s, frame, white) {
    const f = s.frames > 1 ? frame % s.frames : 0;
    ctx.drawImage(white ? s.white : s.img, f * s.fw, 0, s.fw, s.fh, -s.dw / 2, -s.dh + s.foot, s.dw, s.dh);
  }
  function tinted(s, color) { const k = 't_' + color; return s[k] || (s[k] = silhouette(s.img, color)); }
  function drawTint(ctx, s, frame, color) {
    const f = s.frames > 1 ? frame % s.frames : 0;
    ctx.drawImage(tinted(s, color), f * s.fw, 0, s.fw, s.fh, -s.dw / 2, -s.dh + s.foot, s.dw, s.dh);
  }
  return { get, draw, drawTint, preload, shade };
})();
