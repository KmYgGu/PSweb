/**
 * 도마뱀 삼촌 (테일즈런너 팬 캐릭터) — 함정·장애물로 판을 어지럽히는 트릭스터. 근접 꼬리치기 평타
 *  1. X발판 소환      : 맵 무작위 지점에 X발판(최대 3개, 15초). 상대가 밟으면 진행 방향 뒤로 튕겨 날아감(공중).
 *                       날아가는 동안 스킬을 썼으면 무사히 착지('낙법!'), 그대로 땅에 닿으면 혼란
 *  2. 화염볼          : 위아래로 통통 튀는 화염 구체. 낮을 때는 땅의 상대만, 높을 때는 공중(점프)의 상대만 맞음.
 *                       벽·장애물에 튕겨 다른 쪽으로 가고, 몇 번 튀면 소멸 (맞혀도 사라지지 않음, 같은 상대는 0.5초에 한 번)
 *  3. 롤러 도마뱀 소환 : (메인) 테니스장 롤러를 탄 미니 도마뱀이 시전 순간 상대 쪽으로 직진. 패턴: 한 마리 / 두 마리 나란히 / 세 마리 나란히 / 지그재그.
 *                       맞은 상대는 큰 피해 + 납작(이동 불가, 그림이 납작하게 눌림)
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'lizard', GRN = '#5ab84a', FIRE = '#ff8a3a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isL = u => !!(u && u.def && u.def.id === ID);
  function voice(b, u, txt, color, size) { b.hooks.onVoice && b.hooks.onVoice(u, txt, null); if (color) b.text(u.x, u.y - 74 - u.pad * 2, txt.length > 14 ? txt.slice(0, 13) + '…' : txt, color, size || 9); }
  const D = {
    pad: { max: 3, life: 15, r: 15, fly: 0.9, h: 42, dist: 150, conf: 2.5, minD: 70 },
    ball: { spd: 230, period: 0.5, H: 42, low: 15, bounces: 7, mult: 1.0, hitCd: 0.5, r: 9 },
    roller: { spd: 270, life: 2.6, mult: 2.0, flat: 2.0, gap: 34, zig: 70, zigF: 3.2, r: 16 },
  };

  // ---------- 상태: 납작 (이동 불가, 그림 납작하게) ----------
  // 그림: 대상 def 를 원본을 상속한 객체로 잠시 바꿔 drawXform(세로로 눌림)을 얹음 — 스프라이트 캐시는 def.id 기준이라 그대로 사용, 풀리면 원래 def 로
  function flatXf(ctx, u, b, sx) { const O = u.lzOrigDef, base = O && O.drawXform ? O.drawXform(ctx, u, b, sx) : sx; const s = u.status('lzFlat'), k = s ? Math.min(1, (s.dur - s.t) / 0.08, s.t / 0.15) : 0; ctx.scale(1 + 0.4 * k, 1 - 0.62 * k); return base; }
  STATUS_DEFS.lzFlat = { name: '납작', color: '#c8e8a0', tint: '#e8f0d0', tintA: 0.12, blocksMove: true, stack: 'refresh',
    onApply(u) { u.action = null; if (!u.lzOrigDef) { u.lzOrigDef = u.def; u.def = Object.create(u.def, { drawXform: { value: flatXf, configurable: true } }); } },
    onExpire(u) { if (u.lzOrigDef) { u.def = u.lzOrigDef; u.lzOrigDef = null; } } };

  // ---------- 1. X발판 ----------
  function freeSpot(b, r) { const P = b.play || AR;
    for (let k = 0; k < 14; k++) { const x = rand(P.x + 30, P.x + P.w - 30), y = rand(P.y + 50, P.y + P.h - 26), q = b.clampPos(x, y, r, null);
      if (b.blockAt(q.x, q.y - 4, r + 6)) continue; const C = b.stage.circle; if (C && Math.hypot(q.x - C.cx, q.y - C.cy) > b.circleR() - r - 10) continue;
      if ((b.lzPads || []).some(p => Math.hypot(p.x - q.x, p.y - q.y) < r * 3)) continue; return q; }
    return null; }
  SKILLS.lzPad = { desc: '맵 무작위 지점에 X발판(최대 3개, 15초)을 소환합니다. 상대가 밟으면 진행 방향 뒤로 150px 튕겨 날아가고(0.9초 공중), 날아가는 동안 스킬을 썼으면 무사히 착지, 그대로 땅에 닿으면 혼란 2.5초.',
    canUse: (u, e, d, b) => e && !e.dead && b.time > 1.5,
    use(u, e0, b, s) { const P = { ...D.pad, ...s }, L = b.lzPads || (b.lzPads = []);
      const mine = L.filter(p => p.owner === u); if (mine.length >= P.max) mine[0].gone = true;
      const q = freeSpot(b, P.r); if (!q) return;
      L.push({ x: q.x, y: q.y, owner: u, t0: b.time, life: P.life, gone: false, used: 0 }); b.lzPads = L.filter(p => !p.gone);
      b.ring(q.x, q.y, 3, 20, 0.35, '#ffe06a'); b.text(q.x, q.y - 30, 'X!', '#ffe06a', 10); voice(b, u, '발판 깔아 둔다~', '#c8f0a0', 9); b.stats.lzPad = (b.stats.lzPad || 0) + 1; } };

  // ---------- 2. 화염볼 ----------
  SKILLS.lzFireball = { desc: '위아래로 통통 튀는 화염 구체(ATK×1.0, 화염)를 상대 쪽으로 쏩니다. 낮을 때(붉고 작게, 바닥에 붉은 고리)는 땅에 있는 상대만, 높을 때(크고 밝게, 그림자 작게)는 공중(점프)의 상대만 맞습니다. 벽·장애물에 튕겨 다른 쪽으로 가고 7번 튀면 소멸. 맞혀도 사라지지 않고 같은 상대는 0.5초에 한 번.',
    canUse: (u, e, d) => e && !e.dead && d > 60 && d < 320,
    use(u, e0, b, s) { const B = { ...D.ball, ...s }, e = foeOf(b, u), a = angTo(u, e);
      (b.lzBalls || (b.lzBalls = [])).push({ x: u.x + Math.cos(a) * 14, y: u.y + Math.sin(a) * 6, vx: Math.cos(a) * B.spd, vy: Math.sin(a) * B.spd, ph: 0.5, n: 0, src: u, opt: B, hit: new Map(), gone: false });
      voice(b, u, '화염볼!', FIRE, 10); playSfx('shot'); b.stats.lzBall = (b.stats.lzBall || 0) + 1; } };
  function ballStep(b, B, dt) {
    const O = B.opt, P = b.play || AR; B.ph += dt / O.period; if (B.ph >= 1) { B.ph -= 1; B.n++; b.dust(B.x, B.y); if (B.n >= O.bounces) { B.gone = true; b.burst(B.x, B.y - 6, FIRE, 6); return; } }
    const z = Math.sin(Math.PI * B.ph) * O.H; B.z = z;
    let nx = B.x + B.vx * dt, ny = B.y + B.vy * dt;
    if (nx < P.x + 16 || nx > P.x + P.w - 16) { B.vx = -B.vx; nx = B.x; } // 경기장 끝: 튕김
    if (ny < P.y + 30 || ny > P.y + P.h - 8) { B.vy = -B.vy; ny = B.y; }
    const C = b.stage.circle; if (C && Math.hypot(nx - C.cx, ny - C.cy) > b.circleR() - 10) { const a = Math.atan2(ny - C.cy, nx - C.cx), vn = B.vx * Math.cos(a) + B.vy * Math.sin(a); B.vx -= 2 * vn * Math.cos(a); B.vy -= 2 * vn * Math.sin(a); nx = B.x; ny = B.y; }
    if (b.blockAt(nx, ny - 4, 6)) { if (!b.blockAt(B.x, ny - 4, 6)) B.vx = -B.vx; else if (!b.blockAt(nx, B.y - 4, 6)) B.vy = -B.vy; else { B.vx = -B.vx; B.vy = -B.vy; } nx = B.x; ny = B.y; } // 장애물: 막힌 축만 튕김
    B.x = nx; B.y = ny;
    const low = z < O.low;
    for (const o of b.foes(B.src)) { if (o.hidden || o.dead) continue; const air = o.airborne; if (low === !!air) continue; // 낮으면 땅의 상대만, 높으면 공중의 상대만
      if (Math.hypot(o.x - B.x, o.y - B.y) > O.r + 9 + o.pad) continue; if (b.time - (B.hit.get(o) || -9) < O.hitCd) continue; B.hit.set(o, b.time);
      b.damage(B.src, o, B.src.st.atk * O.mult, { element: 'fire', delivery: 'ranged', noCrit: true, color: '#ffc08a' }); b.sparks(B.x, B.y - z, FIRE, 4, 120); b.stats.lzBallHit = (b.stats.lzBallHit || 0) + 1; }
  }

  // ---------- 3. 롤러 도마뱀 소환 ----------
  const PATTERNS = ['한 마리', '두 마리 나란히', '세 마리 나란히', '지그재그'];
  SKILLS.lzRoller = { desc: '테니스장 롤러를 탄 미니 도마뱀을 시전 순간 상대 쪽으로 직진시킵니다(270px/s, 2.6초). 패턴(무작위): 한 마리 / 두 마리 나란히 / 세 마리 나란히 / 한 마리 지그재그. 맞은 상대는 ATK×2.0 피해 + 납작 2초(이동 불가). 롤러마다 상대당 1번, 벽·장애물에 닿으면 멈춤.',
    canUse: (u, e, d) => e && !e.dead && d > 50 && d < 340,
    use(u, e0, b, s) { const R = { ...D.roller, ...s }, e = foeOf(b, u), a = angTo(u, e), pat = Math.floor(Math.random() * 4), L = b.lzRollers || (b.lzRollers = []);
      const offs = pat === 0 || pat === 3 ? [0] : pat === 1 ? [-R.gap / 2, R.gap / 2] : [-R.gap, 0, R.gap], px = -Math.sin(a), py = Math.cos(a);
      for (const o of offs) L.push({ x: u.x + Math.cos(a) * 18 + px * o, y: u.y + Math.sin(a) * 18 + py * o, a, t: 0, zig: pat === 3, cx: u.x + px * o, cy: u.y + py * o, go: 18, src: u, opt: R, hit: new Set(), gone: false });
      voice(b, u, `롤러 도마뱀 출동! (${PATTERNS[pat]})`, '#c8f0a0', 9); b.stats.lzRoller = (b.stats.lzRoller || 0) + 1; } };
  function rollerStep(b, R, dt) {
    const O = R.opt; R.t += dt; if (R.t > O.life) { R.gone = true; b.smoke(R.x, R.y - 6, '#c8d8b8', 4); return; }
    R.go += O.spd * dt; const c = Math.cos(R.a), s = Math.sin(R.a), side = R.zig ? Math.sin(R.t * O.zigF * Math.PI) * O.zig / 2 : 0;
    const nx = R.cx + c * R.go - s * side, ny = R.cy + s * R.go + c * side, q = b.clampPos(nx, ny, 8, null);
    if (Math.abs(q.x - nx) > 0.5 || Math.abs(q.y - ny) > 0.5 || b.blockAt(nx, ny - 4, 8)) { R.gone = true; b.dust(R.x, R.y); b.ring(R.x, R.y - 4, 2, 14, 0.2, '#e8e8d8'); return; }
    R.vx = (nx - R.x) / dt; R.x = nx; R.y = ny;
    for (const o of b.foes(R.src)) { if (o.hidden || o.dead || o.airborne || R.hit.has(o)) continue; if (Math.hypot(o.x - R.x, o.y - R.y) > O.r + 8 + o.pad) continue; R.hit.add(o);
      b.damage(R.src, o, R.src.st.atk * O.mult, { element: 'blunt', delivery: 'ranged', big: true, color: '#e8f0c8' });
      if (!o.dead) { b.applyStatus(o, 'lzFlat', O.flat, R.src); b.text(o.x, o.y - 70, '납작!', '#e8f0c8', 11); } b.shake(1.5); b.stats.lzRollerHit = (b.stats.lzRollerHit || 0) + 1; }
  }

  // ---------- 스테이지 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    on(b, ev, a) { if (ev === 'skill' && a && a.lzFly) a.lzFly.cast = true; return false; }, // 날아가는 동안 스킬 사용 → 낙법
    step(b, dt) {
      if (b.over) return;
      const held = window.BSB_HELD && window.BSB_HELD(b);
      if (b.lzPads && b.lzPads.length) {
        for (const p of b.lzPads) { if (b.time - p.t0 > p.life || !b.u.includes(p.owner)) { p.gone = true; continue; } if (held) continue;
          for (const o of b.foes(p.owner)) { if (o.dead || o.hidden || o.airborne || o.summon || o.lzFly || Math.hypot(o.x - p.x, o.y - p.y) > D.pad.r + 6 + o.pad) continue;
            const v = o.v ? Math.atan2(o.v[1], o.v[0]) : o.dir, back = v + Math.PI, q = b.clampPos(o.x + Math.cos(back) * D.pad.dist, o.y + Math.sin(back) * D.pad.dist, o.pad, o);
            o.action = null; o.push = null; o.air = { t: 0, dur: D.pad.fly, h: D.pad.h, noLand: true, tumble: true, fling: { x0: o.x, y0: o.y, x1: q.x, y1: q.y } };
            o.lzFly = { cast: false, src: p.owner }; p.used++; b.shock(p.x, p.y, 4, 26, '#ffe06a', 0.3, 3); b.text(o.x, o.y - 66, '튕!', '#ffe06a', 11); b.stats.lzPadHit = (b.stats.lzPadHit || 0) + 1; } }
        b.lzPads = b.lzPads.filter(p => !p.gone);
      }
      for (const u of b.u) if (u.lzFly && !u.air) { const F = u.lzFly; u.lzFly = null; if (u.dead) continue; b.dust(u.x, u.y);
        if (F.cast) { b.text(u.x, u.y - 66, '낙법!', '#bfe8ff', 10); b.stats.lzSafe = (b.stats.lzSafe || 0) + 1; }
        else { b.applyStatus(u, 'confusion', D.pad.conf, F.src); b.stats.lzConf = (b.stats.lzConf || 0) + 1; } }
      if (b.lzBalls && b.lzBalls.length) { if (!held) for (const B of b.lzBalls) if (!B.gone) ballStep(b, B, dt); b.lzBalls = b.lzBalls.filter(B => !B.gone && !B.src.dead); }
      if (b.lzRollers && b.lzRollers.length) { if (!held) for (const R of b.lzRollers) if (!R.gone) rollerStep(b, R, dt); b.lzRollers = b.lzRollers.filter(R => !R.gone); }
      for (const u of b.u) if (u.lzOrigDef && !u.status('lzFlat')) { u.def = u.lzOrigDef; u.lzOrigDef = null; } // 납작이 다른 방법으로 풀린 경우에도 원래 그림으로
    },
    drawUnder(ctx, b) { // X발판 (바닥)
      if (!b.lzPads) return;
      for (const p of b.lzPads) { const left = p.life - (b.time - p.t0), a = left < 2 ? 0.4 + 0.4 * Math.abs(Math.sin(b.time * 10)) : 1;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.fillStyle = '#5a4a2a'; ctx.beginPath(); ctx.ellipse(0, 0, D.pad.r + 1, (D.pad.r + 1) * 0.55, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8c050'; ctx.beginPath(); ctx.ellipse(0, -1, D.pad.r - 1, (D.pad.r - 1) * 0.55, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c83a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(8, 3); ctx.moveTo(8, -5); ctx.lineTo(-8, 3); ctx.stroke(); ctx.restore(); }
    },
    drawOver(ctx, b) {
      if (b.lzBalls) for (const B of b.lzBalls) { // 원근: 높을수록 크고 밝게(가까이 떠오름), 그림자는 작고 옅게 / 낮을 땐 붉고 작게 + 바닥 표시
        const O = B.opt, z = B.z || 0, h = clamp(z / O.H, 0, 1), low = z < O.low, sp = Math.hypot(B.vx, B.vy) || 1;
        ctx.save(); ctx.globalAlpha = 0.5 - 0.32 * h; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(Math.round(B.x), Math.round(B.y), 7 - 3 * h, (7 - 3 * h) * 0.42, 0, 0, TAU); ctx.fill(); ctx.restore(); // 그림자
        if (low) { ctx.save(); ctx.globalAlpha = 0.55 + 0.25 * Math.sin(b.time * 20); ctx.strokeStyle = '#ff4a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(Math.round(B.x), Math.round(B.y), 10, 4.2, 0, 0, TAU); ctx.stroke(); ctx.restore(); } // 땅을 쓸고 지나감
        ctx.save(); ctx.globalAlpha = 0.25 * h; ctx.strokeStyle = '#ffd86a'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(Math.round(B.x), Math.round(B.y) - 1); ctx.lineTo(Math.round(B.x), Math.round(B.y - 6 - z)); ctx.stroke(); ctx.restore(); // 높이 기준선
        for (let k = 3; k >= 1; k--) { const dtk = k * 0.04, ph = B.ph - dtk / O.period, zz = Math.sin(Math.PI * ((ph % 1) + 1) % Math.PI) * O.H, tx = B.x - B.vx / sp * 230 * dtk, ty = B.y - B.vy / sp * 230 * dtk;
          ctx.save(); ctx.globalAlpha = 0.18 * (4 - k) / 3; ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(tx, ty - 6 - Math.abs(zz), 3 + 3 * h, 0, TAU); ctx.fill(); ctx.restore(); } // 꼬리 궤적
        const y = B.y - 6 - z, R0 = 4 + 5 * h, k2 = 1 + 0.1 * Math.sin(b.time * 30);
        ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = low ? '#e83a1a' : h > 0.7 ? '#ffe070' : '#ff9a3a'; ctx.beginPath(); ctx.arc(B.x, y, (R0 + 4) * k2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = low ? '#ff7a3a' : h > 0.7 ? '#fff2a0' : '#ffc86a'; ctx.beginPath(); ctx.arc(B.x, y, R0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(B.x - R0 * 0.35), Math.round(y - R0 * 0.45), Math.max(1, Math.round(R0 * 0.4)), Math.max(1, Math.round(R0 * 0.4))); ctx.restore(); }
      if (b.lzRollers) for (const R of b.lzRollers) { const x = Math.round(R.x), y = Math.round(R.y), f = Math.cos(R.a) >= 0 ? 1 : -1, sp = Math.floor(b.time * 14) % 2;
        ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-12, -1, 24, 3);
        ctx.fillStyle = '#5a5a62'; ctx.fillRect(-11, -9, 22, 9); ctx.fillStyle = '#9a9aa4'; ctx.fillRect(-11, -9, 22, 2); ctx.fillStyle = sp ? '#7a7a84' : '#6a6a74'; for (let i = -9; i < 11; i += 4) ctx.fillRect(i + (sp ? 2 : 0), -6, 1, 5); // 롤러
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-1, -16, 2, 7); ctx.fillRect(-8, -17, 9, 2); // 손잡이
        ctx.fillStyle = '#3a7a2e'; ctx.fillRect(-2, -26, 8, 8); ctx.fillStyle = GRN; ctx.fillRect(-1, -25, 6, 6); ctx.fillStyle = '#f0e070'; ctx.fillRect(0, -21, 4, 2); // 미니 도마뱀 몸
        ctx.fillStyle = GRN; ctx.fillRect(4, -31, 6, 5); ctx.fillStyle = '#ffffff'; ctx.fillRect(7, -31, 2, 2); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(8, -31, 1, 1); // 머리·눈
        ctx.fillStyle = '#3a7a2e'; ctx.fillRect(-6, -20, 4, 2); ctx.fillRect(-9, -19, 3, 2); // 꼬리
        ctx.restore(); }
    },
  });

  CHARACTERS.push({
    id: ID, name: '도마뱀 삼촌', fullName: '도마뱀 삼촌', gender: 'male', color: '#5ab84a',
    stats: { hp: 870, atk: 31, spd: 265, range: 50, atkRate: 1.0, def: 16, crit: 0.06, critMult: 1.8 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { fire: 0.8, ice: 1.25 }, // 도마뱀: 추위에 약함
    skills: [
      { id: 'lzRoller', name: '롤러 도마뱀 소환', cd: 6.5 },
      { id: 'lzFireball', name: '화염볼', cd: 5.5 },
      { id: 'lzPad', name: 'X발판 소환', cd: 6 },
    ],
    sprite: { src: 'assets/lizard/front.png', back: 'assets/lizard/back.png', scale: 2, foot: 1 }, // 24x30 도트 (tools/gen_lizard_sprites.py): 뒤의 불꽃, 이마의 '3', 콧수염, 큰 입, 담배, 물방울 넥타이
    portrait: 'assets/lizard/portrait.png',
    lines: {
      skill: {}, // 스킬 대사는 스킬 코드에서 직접
      event: {
        battleStart: ['삼촌이 놀아 주마~', '달리기 전에 발밑부터 조심하라고!'],
        lowHp: ['어이쿠, 꼬리가 잘리겠네!'], stunned: ['으엑?!'],
        win: ['역시 삼촌이 한 수 위지~', '다음 판도 기대하라고!'], lose: ['꼬리… 꼬리 자르고 도망…'],
      },
    },
  });
})();
