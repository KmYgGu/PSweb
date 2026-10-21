/* =========================================================
 * 확장 스테이지 로직 4 (STAGE_HOOKS): 축구장, 패스트푸드점 아르바이트
 *  - 공격 판정 공유: 이펙트(근접 참격/충격파/초승달/참격선/폭발) 발생 위치를 스테이지 훅(onFx)에 알림
 *    → 시전자(actor)는 updateUnit 중인 유닛 (b.later 예약 콜백도 예약 당시 유닛을 기억)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const steer = (u, ang, rate, dt) => { const d = Math.atan2(Math.sin(ang - u.dir), Math.cos(ang - u.dir)); u.dir = fixAngle(u.dir + clamp(d, -rate * dt, rate * dt)); };
  const canSteer = u => !u.dead && !u.action && !u.airborne && !u.push && !u.pull && !u.ghostChain && !u.climb && !u.blocked('blocksMove') && !u.blocked('blocksAct');
  const segDist = (px, py, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1, t = clamp(((px - x1) * vx + (py - y1) * vy) / L2, 0, 1); return [Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t)), x1 + vx * t, y1 + vy * t]; };

  // ---------- 공격 이펙트 → 스테이지 훅 (시전자 추적) ----------
  const FX_HOOKS = [];
  const P = Battle.prototype;
  const active = b => b.soc || b.ff;
  const emit = (b, g) => { if (b._fxMute) return; g.actor = b._actor || null; for (const h of FX_HOOKS) h.onFx(b, g); };
  const _uu = P.updateUnit;
  P.updateUnit = function (u, dt) { if (!active(this)) return _uu.call(this, u, dt); const pv = this._actor; this._actor = u; try { return _uu.call(this, u, dt); } finally { this._actor = pv; } };
  const _later = P.later;
  P.later = function (t, fn) {
    const a = this._actor; if (!a || !active(this)) return _later.call(this, t, fn);
    return _later.call(this, t, () => { const pv = this._actor; this._actor = a; try { fn(); } finally { this._actor = pv; } });
  };
  // gy: 이펙트 좌표를 바닥(발) 높이로 환산하는 보정
  const wrapFx = (name, geo) => { const o = P[name]; P[name] = function (...a) { const r = o.apply(this, a); if (active(this)) emit(this, geo(...a)); return r; }; };
  wrapFx('slashFx', (x, y, dir, c, s) => ({ kind: 'slash', x, y: y + 18, r: 16 * (s || 1), mult: 1 }));
  wrapFx('shock', (x, y, r0, r1) => ({ kind: 'shock', x, y: y + 6, r: Math.min(r1, 90), mult: 1.15 }));
  wrapFx('crescent', (x, y, r) => ({ kind: 'crescent', x, y: y + 18, r: r + 4, mult: 1.15 }));
  wrapFx('explosion', (x, y, r) => ({ kind: 'explosion', x, y, r: r * 1.2, mult: 1.6 }));
  wrapFx('streak', (x1, y1, x2, y2, c, w) => ({ kind: 'streak', x: x1, y: y1 + 18, x2, y2: y2 + 18, r: (w || 10) / 2 + 4, mult: 1.25 }));

  // ---------- 픽셀 아이콘 (미리 렌더) ----------
  const PAL = { b: '#d8913a', B: '#a8601e', w: '#fff3d0', g: '#5cc84a', m: '#6a3a22', y: '#ffd23a', r: '#e0402e', c: '#d89a48', p: '#ffd860', o: '#b8661e', O: '#e8a048', W: '#f4ecd8', f: '#ffe04a', F: '#e0a828', k: '#d83a2a', M: '#ffd820', s: '#eef2f6', S: '#a8b4c4', n: '#f4d070', N: '#d0a040', h: '#c83a28', l: '#7a3a1e', u: '#d0603a', U: '#9a3a22' };
  const FOOD = {
    burger: { name: '햄버거', bg: '#7a4a2a', px: ['....bbbb....', '..bbbwbbbb..', '.bbwbbbbwbb.', '.bbbbbbwbbb.', '.BBBBBBBBBB.', 'gggggggggggg', '.yyyyyyyyyy.', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '.bbbbbbbbbb.', '..BBBBBBBB..', '............'] },
    pizza: { name: '피자', bg: '#8a3a2a', px: ['.cccccccccc.', 'cBccccccccBc', '.pppppppppp.', '.pprppppprp.', '..pppppppp..', '..prpppppp..', '...pppprp...', '...pppppp...', '....prpp....', '....pppp....', '.....pp.....', '............'] },
    chicken: { name: '치킨', bg: '#7a5a2a', px: ['...oooo.....', '..oOOOOo....', '.oOOOOyOo...', '.oOOOOOOo...', '.oOyOOOOo...', '.ooOOOOoo...', '..ooOOoo....', '....ooWW....', '.....WWW....', '......WWW...', '.....WW.WW..', '.....W...W..'] },
    fries: { name: '감자튀김', bg: '#8a2a2a', px: ['..f.f..f.f..', '..fFf.ffFf..', '.ffFfFfFff..', '.fFfffFffF..', '.kkkkkkkkkk.', '.kkkkkkkkkk.', '.kkMkkkkMkk.', '..kkMMMMkk..', '..kkkkkkkk..', '..kkkkkkkk..', '...kkkkkk...', '............'] },
    spaghetti: { name: '스파게티', bg: '#3a5a6a', px: ['............', '....hhhh....', '..nnhllhnn..', '.nNnhllhnNn.', '.nnNnhhnNnn.', '.NnnNnnNnnN.', 'snnNnnnnNnns', 'sSnnnnnnnnSs', '.sSSSSSSSSs.', '..ssssssss..', '............', '............'] },
    hotdog: { name: '핫도그', bg: '#6a4a2a', px: ['............', '............', '..bbbbbbbb..', '.bbbbbbbbbb.', 'uUMuuMuuMuUu', 'uuuMuuMuuMuu', 'UuuuuuuuuuuU', '.bbbbbbbbbb.', '..BBBBBBBB..', '............', '............', '............'] },
  };
  const iconCache = {};
  function icon(id) { // 12x12 픽셀 + 1px 외곽선 → 14x14
    if (iconCache[id]) return iconCache[id];
    const c = document.createElement('canvas'); c.width = c.height = 14; const x = c.getContext('2d');
    const px = FOOD[id].px.map(r => r.padEnd(12, '.').slice(0, 12)), on = (i, j) => j >= 0 && j < 12 && i >= 0 && i < 12 && px[j][i] !== '.';
    x.fillStyle = '#2a1a14';
    for (let j = -1; j <= 12; j++) for (let i = -1; i <= 12; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) x.fillRect(i + 1, j + 1, 1, 1);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) if (on(i, j)) { x.fillStyle = PAL[px[j][i]] || '#f0f'; x.fillRect(i + 1, j + 1, 1, 1); }
    return (iconCache[id] = c);
  }
  const bubCache = {};
  function bubble(id) { // 말풍선 + 음식 (미리 렌더, 20x22)
    if (bubCache[id]) return bubCache[id];
    const c = document.createElement('canvas'); c.width = 40; c.height = 44; const x = c.getContext('2d'); x.scale(2, 2);
    x.fillStyle = '#2a2230'; x.fillRect(1, 0, 18, 18); x.fillRect(0, 1, 20, 16); x.fillRect(7, 17, 6, 2); x.fillRect(9, 19, 2, 2);
    x.fillStyle = '#ffffff'; x.fillRect(2, 1, 16, 16); x.fillRect(1, 2, 18, 14); x.fillRect(8, 17, 4, 1); x.fillRect(9, 18, 2, 1);
    x.fillStyle = '#e4e8f0'; x.fillRect(2, 15, 16, 1);
    x.imageSmoothingEnabled = false; x.drawImage(icon(id), 3, 2);
    return (bubCache[id] = c);
  }
  let ballFrames = null;
  function ballSprite(k) { // 축구공 4프레임 (굴러감)
    if (!ballFrames) {
      ballFrames = [];
      for (let f = 0; f < 4; f++) {
        const c = document.createElement('canvas'); c.width = c.height = 13; const x = c.getContext('2d');
        const pts = [[0, 0], [3.2, -2.4], [-3.2, -2.4], [3.4, 2.6], [-3.4, 2.6], [0, 4.6], [0, -4.6]].map(([px, py]) => [px, ((py + f * 1.6 + 6.5) % 13) - 6.5]);
        for (let j = 0; j < 13; j++) for (let i = 0; i < 13; i++) {
          const dx = i - 6, dy = j - 6, d = Math.hypot(dx, dy); if (d > 6.2) continue;
          let col = d > 5.4 ? '#3a3a44' : (dx + dy > 3 ? '#d4d8e0' : '#ffffff');
          if (d <= 5.4 && pts.some(([px, py]) => Math.hypot(dx - px, dy - py) < (px === 0 && py === 0 ? 1.7 : 1.2) * (1 - Math.abs(py) / 12))) col = '#24242c';
          x.fillStyle = col; x.fillRect(i, j, 1, 1);
        }
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(3, 3, 2, 1);
        ballFrames.push(c);
      }
    }
    return ballFrames[k & 3];
  }

  // ===================== 축구장 =====================
  const SOCCER = {
    match: st => !!st.soccer,
    init(b) {
      const S = b.stage.soccer; if (!S) return;
      const F = { L: AR.x + S.side, R: AR.x + AR.w - S.side, T: S.top, B: S.bottom, gx0: 180 - S.goalW / 2, gx1: 180 + S.goalW / 2, cx: 180, cy: (S.top + S.bottom) / 2 };
      b.soc = { S, F, ball: null, score: [0, 0], ann: null, last: null, sfxT: -1 };
      SOCCER.spawnBall(b, false);
      b.u.forEach(u => { u.socAI = { mode: 'free', t: rand(0.4, 1.4) }; });
      Object.assign(b.stats, { goals: 0, ownGoals: 0, kicks: 0 });
    },
    spawnBall(b, drop) {
      const F = b.soc.F, S = b.soc.S;
      b.soc.ball = { x: F.cx, y: F.cy, vx: 0, vy: 0, z: drop ? 46 : 0, vz: 0, r: S.ball.r, roll: 0, state: 'play', kickT: -1, lastSpd: 0 };
      b.soc.last = null;
    },
    kick(b, ang, spd, actor, lift = 0) {
      const B = b.soc.ball; if (!B || B.state !== 'play') return;
      if (b.time - B.kickT < 0.06 && spd <= B.lastSpd) return; // 같은 공격의 중복 이펙트
      spd = Math.min(spd, b.soc.S.ball.maxSpd);
      B.vx = Math.cos(ang) * spd + B.vx * 0.12; B.vy = Math.sin(ang) * spd + B.vy * 0.12;
      B.vz = Math.max(B.vz, lift); B.kickT = b.time; B.lastSpd = spd;
      if (actor) b.soc.last = actor;
      b.stats.kicks++;
    },
    power(b, actor, mult) { const K = b.soc.S.ball; return (K.kickBase + (actor ? actor.st.atk : 30) * K.kickAtk) * mult; },
    onFx(b, g) {
      const D = b.soc; if (!D || b.over) return;
      const B = D.ball; if (!B || B.state !== 'play' || B.z > 20) return;
      let d, qx = g.x, qy = g.y;
      if (g.kind === 'streak') [d, qx, qy] = segDist(B.x, B.y, g.x, g.y, g.x2, g.y2);
      else d = Math.hypot(B.x - g.x, (B.y - g.y) * 1.15);
      if (d > g.r + B.r + 3) return;
      const a = g.actor;
      let ang = d > 2 ? Math.atan2(B.y - qy, B.x - qx) : a ? Math.atan2(B.y - a.y, B.x - a.x) : rand(0, TAU);
      if (g.kind === 'streak' && d <= 4) ang = Math.atan2(g.y2 - g.y, g.x2 - g.x);
      SOCCER.kick(b, ang + rand(-0.12, 0.12), SOCCER.power(b, a, g.mult), a, g.mult > 1.3 ? 120 : 60);
      SOCCER.kickFx(b, B.x, B.y);
    },
    kickFx(b, x, y) { b.ring(x, y, 2, 14, 0.2, '#ffffff'); for (let i = 0; i < 4; i++) b.parts.push({ x, y: y - 3, vx: rand(-60, 60), vy: rand(-80, -20), g: 260, life: 0.35, max: 0.35, color: i % 2 ? '#8fe07a' : '#ffffff', size: 1.5 }); },
    step(b, dt) {
      const D = b.soc; if (!D) return;
      const S = D.S, F = D.F, K = S.ball, B = D.ball;
      if (D.ann) { D.ann.t += dt; if (D.ann.t >= D.ann.dur) { D.ann = null; if (!b.over) { SOCCER.spawnBall(b, true); sys(b, '공이 중앙에 놓였습니다.'); } } }
      if (!B) return;
      // ---- 공 물리 ----
      B.z = Math.max(0, B.z + B.vz * dt); B.vz = B.z > 0 ? B.vz - 520 * dt : 0;
      if (B.z === 0 && B.vz < 0) B.vz = 0;
      const net = B.state === 'net', fr = Math.exp(-(net ? 5 : K.friction) * dt);
      B.x += B.vx * dt; B.y += B.vy * dt; B.vx *= fr; B.vy *= fr;
      const sp = Math.hypot(B.vx, B.vy); if (sp < 4) { B.vx = B.vy = 0; } B.roll += sp * dt;
      const r = B.r, e = K.rest, wallHit = () => { if (sp > 230 && b.time - D.sfxT > 0.15) { D.sfxT = b.time; playSfx('wall'); } };
      if (net) { // 골망 안: 망에 걸려 멈춤
        const N = B.netTop ? [F.T - S.net + r, F.T - r * 0.2] : [F.B + r * 0.2, F.B + S.net - r];
        B.x = clamp(B.x, F.gx0 + r, F.gx1 - r); if (B.x <= F.gx0 + r || B.x >= F.gx1 - r) B.vx *= -0.3;
        if (B.y < N[0] || B.y > N[1]) { B.y = clamp(B.y, N[0], N[1]); B.vy *= -0.25; }
      } else if (B.state === 'play') {
        if (B.x < F.L + r) { B.x = F.L + r; B.vx = Math.abs(B.vx) * e; wallHit(); }
        if (B.x > F.R - r) { B.x = F.R - r; B.vx = -Math.abs(B.vx) * e; wallHit(); }
        const mouth = B.x > F.gx0 && B.x < F.gx1;
        if (B.y < F.T + r && !mouth) { B.y = F.T + r; B.vy = Math.abs(B.vy) * e; wallHit(); }
        if (B.y > F.B - r && !mouth) { B.y = F.B - r; B.vy = -Math.abs(B.vy) * e; wallHit(); }
        for (const [px, py] of [[F.gx0, F.T], [F.gx1, F.T], [F.gx0, F.B], [F.gx1, F.B]]) { // 골대 기둥
          const dx = B.x - px, dy = B.y - py, d = Math.hypot(dx, dy), R0 = r + S.postR;
          if (d < R0 && d > 1e-3) { const nx = dx / d, ny = dy / d, vn = B.vx * nx + B.vy * ny; B.x = px + nx * R0; B.y = py + ny * R0; if (vn < 0) { B.vx -= (1 + e) * vn * nx; B.vy -= (1 + e) * vn * ny; } wallHit(); if (sp > 120) b.text(px, py - 14, '골대!', '#ffffff', 9); }
        }
        for (const bl of b.buildings) { // 임시 지형 (브로리 지반 격파 등)
          if (bl.dead) continue;
          const qx = clamp(B.x, bl.x, bl.x + bl.w), qy = clamp(B.y, bl.y, bl.y + bl.h), dx = B.x - qx, dy = B.y - qy, d = Math.hypot(dx, dy);
          if (d < r && d > 1e-3) { const nx = dx / d, ny = dy / d, vn = B.vx * nx + B.vy * ny; B.x = qx + nx * r; B.y = qy + ny * r; if (vn < 0) { B.vx -= (1 + e) * vn * nx; B.vy -= (1 + e) * vn * ny; } wallHit(); }
        }
        // 골 판정: 공 중심이 골라인을 넘으면
        if (mouth && B.y < F.T - 2) SOCCER.goal(b, 1, true);       // 위 골대 = 1P 골대 → 2P 득점
        else if (mouth && B.y > F.B + 2) SOCCER.goal(b, 0, false); // 아래 골대 = 2P 골대 → 1P 득점
      }
      if (B.state === 'play' && !b.over) {
        // ---- 투사체 ----
        for (const p of b.proj) {
          if (p.life <= 0 || p.socHit || !p.src || B.z > 20) continue;
          const gy = p.y + 18; if (Math.hypot(p.x - B.x, gy - B.y) > r + (p.r ? Math.min(p.r, 16) : 6)) continue;
          p.socHit = true;
          const ang = Math.atan2(p.vy || 0, p.vx || 0) || Math.atan2(B.y - p.src.y, B.x - p.src.x);
          SOCCER.kick(b, ang + rand(-0.15, 0.15), SOCCER.power(b, p.src, 0.85), p.src, 40); SOCCER.kickFx(b, B.x, B.y);
        }
        // ---- 몸통 ----
        for (const u of b.u) {
          if (u.dead || u.airborne || u.hidden || B.z > 14) continue;
          const R0 = 11 + u.pad + r, dx = B.x - u.x, dy = B.y - (u.y - 2), d = Math.hypot(dx, dy);
          if (d >= R0 || d < 1e-3) continue;
          const nx = dx / d, ny = dy / d; B.x = u.x + nx * R0; B.y = u.y - 2 + ny * R0;
          const a = u.action, rush = a && (['dash', 'chase', 'charge', 'combo'].includes(a.type) || a.trail);
          if (u.push) { SOCCER.kick(b, Math.atan2(ny, nx), Math.max(u.push.spd * 0.95, SOCCER.power(b, u, 1.1)), u, 80); SOCCER.kickFx(b, B.x, B.y); continue; }
          if (rush) { SOCCER.kick(b, Math.atan2(ny, nx) + rand(-0.1, 0.1), SOCCER.power(b, u, 1.15), u, 70); SOCCER.kickFx(b, B.x, B.y); continue; }
          const ux = Math.cos(u.dir) * u.speed, uy = Math.sin(u.dir) * u.speed, vin = (u.moving ? ux * nx + uy * ny : 0) - (B.vx * nx + B.vy * ny);
          if (vin <= 0) continue;
          // 가벼운 드리블: 몸 방향과 접촉 법선 사이로 굴러감
          const mx = nx * 0.6 + Math.cos(u.dir) * 0.4, my = ny * 0.6 + Math.sin(u.dir) * 0.4;
          const spd = clamp(u.speed * 0.9, 90, 300) * (0.75 + K.body * 0.5) + u.st.atk * 1.5;
          const vn = B.vx * nx + B.vy * ny; if (vn < 0) { B.vx -= vn * nx * 1.5; B.vy -= vn * ny * 1.5; } // 부딪혀 튕김
          if (b.time - (u.socBumpT || -1) > 0.1) { u.socBumpT = b.time; SOCCER.kick(b, Math.atan2(my, mx), spd, u, 0); }
        }
      }
      // ---- AI: 가끔 공을 상대 골대 쪽으로 몰기 ----
      if (b.over) return;
      for (const u of b.u) {
        const A = u.socAI; if (!A || u.dead) continue;
        A.t -= dt;
        if (A.t <= 0) { A.mode = Math.random() < S.ai.chase ? 'ball' : 'free'; A.t = rand(S.ai.dur[0], S.ai.dur[1]) * (A.mode === 'ball' ? 1 : 0.8); }
        if (A.mode !== 'ball' || B.state !== 'play' || !canSteer(u)) continue;
        const gx = F.cx, gy = u.team === 0 ? F.B + 8 : F.T - 8;        // 공격 방향: 1P → 아래 골대, 2P → 위 골대
        let g0 = gx - B.x, g1 = gy - B.y; const gl = Math.hypot(g0, g1) || 1; g0 /= gl; g1 /= gl;
        const rx = u.x - B.x, ry = u.y - B.y, along = rx * g0 + ry * g1, perp = rx * -g1 + ry * g0;
        let tx, ty;
        if (along < -6 && Math.abs(perp) < 12 + u.pad) { tx = B.x + g0 * 40; ty = B.y + g1 * 40; }        // 공 뒤 정렬 완료 → 밀고 나감
        else if (along < -6) { tx = B.x - g0 * (18 + u.pad); ty = B.y - g1 * (18 + u.pad); }               // 공 뒤로 정렬
        else { const s = perp >= 0 ? 1 : -1; tx = B.x - g0 * 26 - g1 * s * (28 + u.pad); ty = B.y - g1 * 26 + g0 * s * (28 + u.pad); } // 공 앞쪽이면 돌아서 뒤로
        steer(u, Math.atan2(ty - u.y, tx - u.x), S.ai.turn, dt);
      }
    },
    teamName(b, t) { const m = b.u.filter(o => o.team === t); return m.length > 1 ? m.map(o => o.def.name).join(' & ') : m[0].def.name; },
    goal(b, team, top) {
      const D = b.soc, B = D.ball, last = D.last;
      if (b.over || B.state !== 'play') return;
      B.state = 'net'; B.netTop = top; B.vx *= 0.35; B.vy *= 0.35;
      const own = !!(last && last.team !== team);
      D.score[team]++; b.stats.goals++; if (own) b.stats.ownGoals++;
      D.ann = { t: 0, dur: D.S.annDur, team, own, who: last ? last.def.name : null, score: [...D.score] };
      const sc = `${D.score[0]} : ${D.score[1]}`;
      sys(b, own ? `자책골! ${last.def.name} → ${team ? '2P' : '1P'} 득점 (${sc})` : `골! ${last ? last.def.name : SOCCER.teamName(b, team)} 득점 (${sc})`);
      if (last) b.text(last.x, last.y - 74, own ? '앗…' : 'GOAL!', own ? '#c8d0e0' : '#ffe27a', own ? 11 : 14);
      const gy = top ? D.F.T - 6 : D.F.B + 6;
      for (let i = 0; i < 26; i++) { const a = rand(0, TAU), s = rand(40, 150); b.parts.push({ x: B.x, y: gy, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 60, g: 200, life: rand(0.6, 1.1), max: 1.1, color: ['#ffffff', TEAM_COL[team], '#ffe27a'][i % 3], size: rand(1.5, 3) }); }
      b.ring(B.x, gy, 4, 40, 0.5, TEAM_COL[team]); b.shake(2);
      if (D.score[team] >= D.S.win) SOCCER.finish(b, team);
    },
    finish(b, team) {
      const D = b.soc, w = b.teamBest(team);
      b.over = true; b.winner = w; b.endType = 'goal';
      b.resultText = label => { const m = b.u.filter(o => o.team === team); return `${D.score[0]} : ${D.score[1]} ${m.map(label).join(' & ')} 승리! (${D.S.win}골 선취)`; };
      b.u.forEach(o => { if (!o.dead) b.say(o, o.team === team ? 'win' : 'lose'); });
      b.hitstop(0.2);
    },
    floor(x, st) {
      const S = st.soccer; if (!S) return;
      const L = AR.x + S.side, R = AR.x + AR.w - S.side, T = S.top, B = S.bottom, g0 = 180 - S.goalW / 2, g1 = 180 + S.goalW / 2, cy = (T + B) / 2;
      x.fillStyle = '#2e7a3a'; x.fillRect(AR.x, AR.y, AR.w, AR.h);
      for (let j = 0, k = 0; AR.y + j < AR.y + AR.h; j += 21, k++) { x.fillStyle = k % 2 ? '#3a8c44' : '#348240'; x.fillRect(AR.x, AR.y + j, AR.w, 21); }
      for (let i = 0; i < 260; i++) { x.fillStyle = i % 3 ? 'rgba(0,40,0,0.18)' : 'rgba(200,255,180,0.10)'; x.fillRect(AR.x + (i * 67) % AR.w, AR.y + (i * 139) % AR.h, 1, 2); }
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(AR.x, AR.y, AR.w, T - AR.y); x.fillRect(AR.x, B, AR.w, AR.y + AR.h - B); x.fillRect(AR.x, AR.y, L - AR.x, AR.h); x.fillRect(R, AR.y, AR.x + AR.w - R, AR.h);
      // 라인
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5;
      x.strokeRect(L, T, R - L, B - T);
      x.beginPath(); x.moveTo(L, cy); x.lineTo(R, cy); x.stroke();
      x.beginPath(); x.arc(180, cy, 38, 0, TAU); x.stroke();
      x.fillStyle = '#ffffff'; x.fillRect(178.5, cy - 1.5, 3, 3);
      for (const [y0, dir] of [[T, 1], [B, -1]]) {
        const pw = 170, pd = 52, gw = 96, gd = 18;
        x.strokeRect(180 - pw / 2, dir > 0 ? y0 : y0 - pd, pw, pd);
        x.strokeRect(180 - gw / 2, dir > 0 ? y0 : y0 - gd, gw, gd);
        x.fillRect(178.5, y0 + dir * 38 - 1.5, 3, 3);
        x.beginPath(); x.arc(180, y0 + dir * 38, 30, dir > 0 ? 0.62 : Math.PI + 0.62, dir > 0 ? Math.PI - 0.62 : TAU - 0.62); x.stroke();
        for (const cx of [L, R]) { x.beginPath(); x.arc(cx, y0, 7, 0, TAU); x.stroke(); }
      }
      // 골대 + 골망 (위 = 1P 파랑, 아래 = 2P 빨강)
      for (const [y0, dir, col] of [[T, -1, TEAM_COL[0]], [B, 1, TEAM_COL[1]]]) {
        const ny = dir < 0 ? y0 - S.net : y0;
        x.fillStyle = 'rgba(10,20,14,0.55)'; x.fillRect(g0, ny, g1 - g0, S.net);
        x.strokeStyle = 'rgba(235,240,255,0.45)'; x.lineWidth = 1;
        x.beginPath(); for (let i = g0 + 4; i < g1; i += 5) { x.moveTo(i, ny); x.lineTo(i, ny + S.net); } for (let j = ny + 3; j < ny + S.net; j += 4) { x.moveTo(g0, j); x.lineTo(g1, j); } x.stroke();
        x.fillStyle = col; x.fillRect(g0 - 2, ny, 3, S.net); x.fillRect(g1 - 1, ny, 3, S.net); x.fillRect(g0 - 2, dir < 0 ? ny : ny + S.net - 2, g1 - g0 + 4, 2);
        x.fillStyle = '#ffffff'; x.fillRect(g0 - 3, y0 - 2, 5, 4); x.fillRect(g1 - 2, y0 - 2, 5, 4); // 기둥
        x.fillStyle = col; for (const fx of [g0 - 26, g1 + 22]) { x.fillRect(fx, y0 + dir * 4 - (dir < 0 ? 8 : 0), 1, 8); x.fillRect(fx + 1, y0 + dir * 4 - (dir < 0 ? 8 : 0), 4, 3); } // 팀 깃발
      }
    },
    drawUnder(ctx, b, thumb) {
      const D = b.soc; if (!D) return;
      const B = D.ball; if (!B) return;
      const drop = B.z, k = Math.floor(B.roll / 4);
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - Math.min(0.6, drop / 60)); ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(B.x, B.y + 1, B.r * (1 - drop / 140), B.r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ballSprite(Math.abs(k)), Math.round(B.x - 6.5), Math.round(B.y - 6.5 - 4 - drop), 13, 13);
      ctx.restore();
    },
    drawTop(ctx, b) {
      const D = b.soc; if (!D) return;
      ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      // 점수판 (왼쪽 위)
      const x0 = AR.x + 6, y0 = AR.y + 3;
      ctx.fillStyle = 'rgba(14,16,24,0.78)'; ctx.fillRect(x0, y0, 62, 15);
      ctx.fillStyle = TEAM_COL[0]; ctx.fillRect(x0, y0, 3, 15); ctx.fillStyle = TEAM_COL[1]; ctx.fillRect(x0 + 59, y0, 3, 15);
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillStyle = TEAM_COL[0]; ctx.fillText(String(D.score[0]), x0 + 16, y0 + 8.5);
      ctx.fillStyle = '#d8dce8'; ctx.fillText(':', x0 + 31, y0 + 8);
      ctx.fillStyle = TEAM_COL[1]; ctx.fillText(String(D.score[1]), x0 + 46, y0 + 8.5);
      ctx.font = `7px ${FONT}`; ctx.fillStyle = '#c8cede'; ctx.textAlign = 'left'; ctx.fillText(`${D.S.win}골 승리`, x0 + 2, y0 + 23);
      // 골 안내 (전투는 멈추지 않음)
      const A = D.ann;
      if (A) {
        const t = A.t, inn = Math.min(1, t / 0.18), out = t > A.dur - 0.35 ? Math.max(0, (A.dur - t) / 0.35) : 1, a = inn * out, cy = 300;
        const h = 58 * easeOut(inn);
        ctx.globalAlpha = 0.82 * a; ctx.fillStyle = '#0e1018'; ctx.fillRect(0, cy - h / 2, W, h);
        ctx.globalAlpha = a; ctx.fillStyle = A.own ? '#9aa4b8' : TEAM_COL[A.team]; ctx.fillRect(0, cy - h / 2, W, 2); ctx.fillRect(0, cy + h / 2 - 2, W, 2);
        const pop = t < 0.25 ? 0.6 + 0.4 * easeOut(t / 0.25) * 1.08 : 1;
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(24 * pop)}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#0e1018';
        const big = A.own ? '자책골!' : 'GOAL!';
        ctx.strokeText(big, 180, cy - 9); ctx.fillStyle = A.own ? '#e0e6f4' : '#ffe27a'; ctx.fillText(big, 180, cy - 9);
        ctx.font = `bold 10px ${FONT}`;
        const who = A.who ? (A.own ? `${A.who}의 자책골 → ${A.team ? '2P' : '1P'} 득점` : `${A.who} 득점! (${A.team ? '2P' : '1P'})`) : `${A.team ? '2P' : '1P'} 득점!`;
        ctx.fillStyle = TEAM_COL[A.team]; ctx.fillText(who, 180, cy + 11);
        ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#d8dce8'; ctx.fillText(`${A.score[0]} : ${A.score[1]}`, 180, cy + 23);
      }
      ctx.restore();
    },
  };

  // ===================== 패스트푸드점 아르바이트 =====================
  const FF = {
    match: st => !!st.fastfood,
    init(b) {
      const F = b.stage.fastfood; if (!F) return;
      const ids = new Set(b.u.map(u => u.def.id)), pool = CHARACTERS.filter(c => !ids.has(c.id) && !(c.partner && ids.has(c.partner.id)));
      const src = (pool.length ? pool : CHARACTERS).slice().sort(() => Math.random() - 0.5);
      b.play = { x: AR.x, y: F.wallY - 16, w: AR.w, h: AR.y + AR.h - (F.wallY - 16) }; // 메뉴판 벽 위쪽은 이동 불가
      b.ff = { F, cust: [], src, k: 0, nextT: F.first, flash: F.foods.map(() => 0), secW: AR.w / F.foods.length };
      b.u.forEach(u => { u.ffFood = null; u.ffWall = false; u.ffAI = { mode: 'free', t: rand(0.6, 1.6) }; });
      Object.assign(b.stats, { ffPicked: 0, ffServed: 0, ffRight: 0, ffCast: 0, ffLeft: 0 });
    },
    spawn(b) {
      const D = b.ff, F = D.F, def = D.src[D.k++ % D.src.length], side = Math.random() < 0.5 ? -1 : 1, dy = F.doors[Math.floor(Math.random() * F.doors.length)];
      let tx = 0, ty = 0;
      for (let i = 0; i < 30; i++) {
        tx = rand(AR.x + 30, AR.x + AR.w - 30); ty = rand(F.wallY + 70, AR.y + AR.h - 18);
        if (D.cust.every(c => Math.hypot(c.tx - tx, c.ty - ty) > 60) && b.u.every(u => Math.hypot(u.x - tx, u.y - ty) > 40)) break;
      }
      D.cust.push({ def, x: side < 0 ? -14 : W + 14, y: dy, tx, ty, door: dy, side, state: 'in', want: Math.floor(Math.random() * F.foods.length), got: null, t: 0, ph: rand(0, TAU), face: -side, walk: 0, msg: null });
    },
    pick(b, u, x, how) {
      const D = b.ff, F = D.F; if (!D || u.dead || b.over) return;
      if (!Number.isFinite(x) || b.time - (u.ffHitT || -9) < F.hitCd) return;
      u.ffHitT = b.time;
      const i = clamp(Math.floor((x - AR.x) / D.secW), 0, F.foods.length - 1), id = F.foods[i];
      D.flash[i] = 0.3; u.ffFood = id; u.ffPop = b.time; b.stats.ffPicked++;
      const cx = AR.x + D.secW * (i + 0.5);
      b.text(u.x, u.y - 76 - u.pad * 2, FOOD[id].name + '!', '#ffe9b0', 10);
      for (let k = 0; k < 8; k++) b.parts.push({ x: cx + rand(-14, 14), y: F.wallY - 22 + rand(-8, 8), vx: rand(-50, 50), vy: rand(-70, -10), g: 220, life: rand(0.35, 0.6), max: 0.6, color: k % 2 ? '#ffe9b0' : '#ffffff', size: 2 });
    },
    onFx(b, g) {
      const D = b.ff; if (!D || b.over) return;
      const a = g.actor; if (!a || a.dead) return;
      let x = g.x, y = g.y; if (g.kind === 'streak' && g.y2 < g.y) { x = g.x2; y = g.y2; }
      if (y - g.r <= D.F.wallY + 4) FF.pick(b, a, clamp(x, AR.x + 1, AR.x + AR.w - 1), g.kind);
    },
    deliver(b, u, c) {
      const D = b.ff, food = u.ffFood, right = D.F.foods[c.want] === food;
      u.ffFood = null; c.got = food; c.state = 'happy'; c.t = 0;
      c.msg = { txt: right ? '감사합니다! ♥' : '이것도 좋아요!', col: right ? '#ff9ad8' : '#ffe9b0', t: 0 };
      b.stats.ffServed++; if (right) b.stats.ffRight++;
      sys(b, `${u.def.name} → ${c.def.name}에게 ${FOOD[food].name} 배달!${right ? '' : ' (주문과 다르지만 OK)'}`);
      for (let k = 0; k < 10; k++) { const a = rand(0, TAU), s = rand(30, 90); b.parts.push({ x: c.x, y: c.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 160, life: rand(0.4, 0.8), max: 0.8, color: k % 2 ? '#ff9ad8' : '#fff0a0', size: 2 }); }
      u.ffCast = { def: c.def, t: 3 }; // 행동 가능해지면 바로 시전 (최대 3초 대기)
    },
    cast(b, u, def) {
      const list = (def.skills || []).filter(s => SKILLS[s.id]);
      if (!list.length || u.dead || b.over) return;
      const slot = list[Math.floor(Math.random() * list.length)], sk = SKILLS[slot.id], e = b.enemy(u);
      if (!e || e.dead) return;
      if (u.action) { if (u.action.pin && u.action.tgt) b.releasePin(u.action.tgt); u.action = null; }
      let vl = null; try { vl = sk.say ? sk.say(u, e, b, slot) : null; } catch (err) { vl = null; }
      b.hooks.onSkill && b.hooks.onSkill(u, `${slot.name} (${def.name}의 스킬)`, vl);
      b.text(u.x, u.y - 88 - u.pad * 2, `${def.name}의 ${slot.name}!`, def.color || '#ffffff', 10);
      b.fx.push({ type: 'glow', x: u.x, y: u.y - 20, r: 36, color: def.color || '#ffffff', t: 0, dur: 0.4 });
      b.stats.ffCast++;
      if (b.emit('skill', u, slot, e)) { b.text(u.x, u.y - 60, '무효!', '#c8c0ff', 11); return; } // 듀얼리스트 함정 등
      try { sk.use(u, e, b, slot); } catch (err) { console.warn('[fastfood] borrowed skill failed:', slot.id, err); u.action = null; }
    },
    step(b, dt) {
      const D = b.ff; if (!D) return;
      const F = D.F;
      for (let i = 0; i < D.flash.length; i++) D.flash[i] = Math.max(0, D.flash[i] - dt);
      // ---- 손님 ----
      if (!b.over) { D.nextT -= dt; if (D.nextT <= 0 && D.cust.length < F.maxCust) { FF.spawn(b); D.nextT = D.cust.length < 2 ? 1.4 : rand(F.gap[0], F.gap[1]); } }
      for (const c of D.cust) {
        c.t += dt; if (c.msg) c.msg.t += dt;
        let tx = c.tx, ty = c.ty;
        if (c.state === 'in' && !c.entered) { tx = c.side < 0 ? AR.x + 24 : AR.x + AR.w - 24; ty = c.door; if (Math.hypot(c.x - tx, c.y - ty) < 1) c.entered = true; } // 문으로 들어온 뒤 자리로
        if (c.state === 'wait') { if (c.t > F.patience && !b.over) { c.state = 'leave'; c.t = 0; c.msg = { txt: '…그냥 갈래요', col: '#b8c0d0', t: 0 }; b.stats.ffLeft++; } continue; }
        if (c.state === 'happy' || c.state === 'leave') {
          if (c.t < 0.9) continue; // 잠깐 기뻐하고(아쉬워하고) 나감
          const exL = c.x < 180; c.exit = c.exit ?? (exL ? -1 : 1);
          const ex = c.exit < 0 ? AR.x + 24 : AR.x + AR.w - 24, dy = F.doors.reduce((a, d) => Math.abs(d - c.y) < Math.abs(a - c.y) ? d : a, F.doors[0]);
          if (Math.abs(c.x - ex) > 3 && (c.exit < 0 ? c.x > ex : c.x < ex)) { tx = ex; ty = dy; } else { tx = c.exit < 0 ? -20 : W + 20; ty = dy; }
        }
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), st = F.walk * dt;
        if (d <= st) { c.x = tx; c.y = ty; if (c.state === 'in' && c.entered && tx === c.tx && ty === c.ty) { c.state = 'wait'; c.t = 0; } }
        else { c.x += dx / d * st; c.y += dy / d * st; c.walk += dt * 8; if (Math.abs(dx) > 2) c.face = dx > 0 ? 1 : -1; }
      }
      const before = D.cust.length;
      D.cust = D.cust.filter(c => (c.x > -18 && c.x < W + 18) || c.state === 'in' || c.state === 'wait');
      if (D.cust.length < before && !b.over) D.nextT = Math.max(D.nextT, rand(F.gap[0], F.gap[1]));
      if (b.over) return;
      // ---- 메뉴판 벽: 몸으로 부딪힘 ----
      const P = b.play;
      for (const u of b.u) {
        if (u.dead) continue;
        const touch = !u.airborne && u.y <= P.y + 26 + u.pad + 1.2;
        if (touch && !u.ffWall) FF.pick(b, u, u.x, 'body');
        u.ffWall = touch;
        if (u.ffCast) { u.ffCast.t -= dt; const C = u.ffCast; if (!u.blocked('blocksAct') && !u.status('pin')) { u.ffCast = null; FF.cast(b, u, C.def); } else if (C.t <= 0) u.ffCast = null; }
        // 배달
        if (u.ffFood && !u.airborne) for (const c of D.cust) {
          if ((c.state !== 'wait' && c.state !== 'in') || c.x < AR.x + 4 || c.x > AR.x + AR.w - 4) continue;
          if (Math.hypot(u.x - c.x, u.y - c.y) < 11 + u.pad + 10) { FF.deliver(b, u, c); break; }
        }
      }
      // ---- 투사체: 메뉴판에 맞으면 막히고 음식 획득 ----
      for (const p of b.proj) {
        if (p.life <= 0 || !p.src || p.src.dead || p.y + 18 > F.wallY - 2) continue;
        FF.pick(b, p.src, clamp(p.x, AR.x + 1, AR.x + AR.w - 1), 'proj');
        p.life = 0; b.burst(p.x, p.y, '#ffe9b0', 5); p.fizzle && p.fizzle(p);
      }
      // ---- AI: 가끔 심부름 (음식 없음 → 메뉴판, 들고 있음 → 기다리는 손님) ----
      for (const u of b.u) {
        const A = u.ffAI; if (!A || u.dead) continue;
        A.t -= dt;
        if (A.t <= 0) { A.mode = Math.random() < (u.ffFood ? F.ai.errandFood : F.ai.errand) ? 'errand' : 'free'; A.t = rand(F.ai.dur[0], F.ai.dur[1]); A.sec = rand(AR.x + 30, AR.x + AR.w - 30); }
        if (A.mode !== 'errand' || !canSteer(u)) continue;
        let tx, ty;
        if (u.ffFood) { let best = null, bd = 1e9; for (const c of D.cust) if ((c.state === 'wait' || c.state === 'in') && c.x > AR.x && c.x < AR.x + AR.w) { const d = Math.hypot(c.x - u.x, c.y - u.y); if (d < bd) { bd = d; best = c; } } if (!best) continue; tx = best.x; ty = best.y; }
        else { tx = A.sec; ty = F.wallY; }
        steer(u, Math.atan2(ty - u.y, tx - u.x), F.ai.turn, dt);
      }
    },
    floor(x, st) {
      const F = st.fastfood; if (!F) return;
      // 바닥: 빨강/크림 체크 타일
      for (let j = 0; j * 16 < AR.h; j++) for (let i = 0; i * 16 < AR.w; i++) { x.fillStyle = (i + j) % 2 ? '#e9dcc4' : '#b8443a'; x.fillRect(AR.x + i * 16, AR.y + j * 16, 16, 16); }
      x.fillStyle = 'rgba(0,0,0,0.06)'; for (let j = 0; j < AR.h; j += 16) x.fillRect(AR.x, AR.y + j, AR.w, 1);
      for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(AR.x + (i * 89) % AR.w, AR.y + (i * 157) % AR.h, 2, 1); }
      // 출입문 (좌우)
      for (const dy of F.doors) for (const side of [-1, 1]) {
        const dx = side < 0 ? AR.x : AR.x + AR.w - 6;
        x.fillStyle = '#5a4a3a'; x.fillRect(dx, dy - 22, 6, 30); x.fillStyle = '#8fd0f0'; x.fillRect(dx + 1, dy - 20, 4, 26);
        x.fillStyle = '#3a3a44'; x.fillRect(side < 0 ? AR.x + 6 : AR.x + AR.w - 24, dy - 10, 18, 20); x.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 20; k += 3) x.fillRect(side < 0 ? AR.x + 6 : AR.x + AR.w - 24, dy - 10 + k, 18, 1);
      }
      // 메뉴판 벽 + 카운터
      const top = AR.y, wy = F.wallY, n = F.foods.length, sw = AR.w / n;
      x.fillStyle = '#2a2026'; x.fillRect(AR.x, top, AR.w, wy - top);
      for (let i = 0; i < n; i++) {
        const fd = FOOD[F.foods[i]], sx = AR.x + sw * i;
        x.fillStyle = '#1a1418'; x.fillRect(sx, top + 2, sw, wy - top - 16);
        x.fillStyle = fd.bg; x.fillRect(sx + 2, top + 4, sw - 4, wy - top - 20);
        x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(sx + 2, top + 4, sw - 4, 2);
        x.imageSmoothingEnabled = false; x.drawImage(icon(F.foods[i]), Math.round(sx + sw / 2 - 12), top + 5, 24, 24);
        x.fillStyle = '#fff4dc'; x.font = `bold 8px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(fd.name, sx + sw / 2, top + 34.5);
      }
      x.fillStyle = '#c8ccd4'; x.fillRect(AR.x, wy - 14, AR.w, 6); x.fillStyle = '#e8ecf2'; x.fillRect(AR.x, wy - 14, AR.w, 2); // 카운터 상판
      x.fillStyle = '#8a3028'; x.fillRect(AR.x, wy - 8, AR.w, 8); x.fillStyle = '#6a2420'; x.fillRect(AR.x, wy - 2, AR.w, 2);
      x.fillStyle = '#ffd23a'; for (let i = 0; i < n; i++) x.fillRect(AR.x + sw * i + sw / 2 - 6, wy - 6, 12, 2);
      x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(AR.x, wy, AR.w, 4);
    },
    drawCust(ctx, b, c, F, thumb) {
      const s = Sprites.get(c.def), k = F.custScale, bob = thumb ? 0 : (c.state === 'happy' ? -Math.abs(Math.sin(c.t * 10)) * 3 : -Math.abs(Math.sin(c.walk)) * 1.5);
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, 9 * k * (c.def.size || 1), 3.2, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y + bob)); ctx.scale(spriteSX(c.def, false, c.face) * k, k);
      Sprites.draw(ctx, s, 0, false); ctx.restore();
    },
    drawUnder(ctx, b, thumb) {
      const D = b.ff; if (!D) return;
      const F = D.F;
      ctx.save();
      for (let i = 0; i < D.flash.length; i++) if (D.flash[i] > 0) { ctx.globalAlpha = D.flash[i] / 0.3 * 0.45; ctx.fillStyle = '#ffffff'; ctx.fillRect(AR.x + D.secW * i + 2, AR.y + 4, D.secW - 4, F.wallY - AR.y - 20); }
      ctx.globalAlpha = 1;
      if (thumb && !D.cust.length) { // 썸네일: 기다리는 손님 예시
        const ex = CHARACTERS.slice(2, 5);
        ex.forEach((def, i) => D.cust.push({ def, x: [80, 250, 170][i], y: [300, 360, 470][i], state: 'wait', want: i * 2 % F.foods.length, t: 0, walk: 0, face: i % 2 ? -1 : 1 }));
      }
      for (const c of D.cust) FF.drawCust(ctx, b, c, F, thumb);
      if (thumb) FF.drawOver(ctx, b, true);
      ctx.restore();
    },
    drawOver(ctx, b, thumb) {
      const D = b.ff; if (!D) return;
      const F = D.F;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const c of D.cust) { // 주문 말풍선 / 받은 음식 / 반응
        const s = Sprites.get(c.def), hy = c.y - s.dh * F.custScale + s.foot * F.custScale;
        if (c.state === 'wait' || c.state === 'in') {
          if (c.state === 'in' && (c.x < AR.x || c.x > AR.x + AR.w)) continue;
          const bob = thumb ? 0 : Math.sin(b.time * 3 + c.ph) * 1.2, late = !thumb && c.state === 'wait' && c.t > F.patience - 4;
          ctx.globalAlpha = late ? 0.55 + 0.45 * Math.abs(Math.sin(b.time * 8)) : 1;
          ctx.drawImage(bubble(F.foods[c.want]), Math.round(c.x - 10), Math.round(hy - 24 + bob), 20, 22);
          ctx.globalAlpha = 1;
        } else if (c.got) ctx.drawImage(icon(c.got), Math.round(c.x + c.face * 6 - 7), Math.round(c.y - s.dh * F.custScale * 0.55 - 7), 14, 14);
        if (c.msg && c.msg.t < 1.4) {
          ctx.globalAlpha = c.msg.t > 1.0 ? (1.4 - c.msg.t) / 0.4 : 1; ctx.font = `bold 8px ${FONT}`;
          const w = ctx.measureText(c.msg.txt).width + 8, mx = clamp(c.x, AR.x + w / 2 + 2, AR.x + AR.w - w / 2 - 2), my = hy - 10 - c.msg.t * 6;
          ctx.fillStyle = 'rgba(20,18,30,0.8)'; ctx.fillRect(mx - w / 2, my - 6, w, 12);
          ctx.fillStyle = c.msg.col; ctx.fillText(c.msg.txt, mx, my + 0.5); ctx.globalAlpha = 1;
        }
      }
      if (!thumb) for (const u of b.u) { // 들고 있는 음식 (머리 위)
        if (!u.ffFood || u.dead) continue;
        const s = Sprites.get(u.fdef), pop = clamp((b.time - (u.ffPop || 0)) / 0.18, 0, 1), sc = 0.6 + 0.4 * easeOut(pop);
        const hx = u.x + u.kx, hy = u.y + u.ky - b.airZ(u) - Math.min(s.dh - s.foot, 70) - 12 + Math.sin(b.time * 5) * 1.2;
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx, hy + 9, 6, 1.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        const z = 14 * sc * 1.15; ctx.drawImage(icon(u.ffFood), Math.round(hx - z / 2), Math.round(hy - z / 2), Math.round(z), Math.round(z));
      }
      ctx.restore();
    },
  };

  STAGE_HOOKS.push(SOCCER, FF);
  FX_HOOKS.push(SOCCER, FF);
  window.StageExt4 = { SOCCER, FF, FOOD, icon };
})();
