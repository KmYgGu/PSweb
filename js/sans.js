/**
 * 샌즈 (언더테일) — HP 1, 자동 회피(스태미나), 업보(KR) 지속 피해
 *  피격 판정(피해·해로운 상태이상·고정 피해)이 들어오면 스태미나를 써서 옆으로 피함 (MISS)
 *  스태미나 0 → 잠깐 졸음(Zz, 회피 불가) → 이때 한 대 맞으면 쓰러짐
 *  1. 뼈 공격      : 한쪽 끝에서 반대쪽으로 쓸고 지나가는 뼈 줄 (빈틈으로 빠져나갈 수 있음)
 *  2. 파란 뼈      : 움직이는 상대만 맞는 파란 뼈 줄 (가만히 있으면 안전)
 *  3. 가스터 블래스터: 2~4개의 해골이 여러 방향에서 나타나 0.55초 뒤 직선 광선
 *  4. 중력 조작    : 상대를 가까운 벽에 내리꽂고(벽 충돌 피해) 곧바로 뼈 공격
 *  5. 순간이동     : 위험할 때 멀리 순간이동
 *  6. 최후의 공격 (패시브): 상대 체력이 낮아지면 블래스터·뼈를 쉬지 않고 퍼붓고, 끝나면 지쳐 잠듦
 */
(() => {
  const TAU = Math.PI * 2, ID = 'sans', IMG = 'assets/Sans/';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
  const ST = { max: 100, regen: 9, cost: 10, big: 15, sure: 20, dot: 3, status: 6, sleep: 1.6, wake: 50, finalSleep: 3.2 };
  const isSans = u => u && u.def.id === ID;
  const S_ = u => u.sn || (u.sn = { st: ST.max, sleep: 0, final: false, finalDone: false });
  const objs = b => b.snObjs || (b.snObjs = []);

  STATUS_DEFS.snSleep = { name: '졸음', color: '#a8b8e0', tint: '#304060', tintA: 0.25, blocksAct: true, blocksMove: true, positive: true, noResistScale: true };
  STATUS_DEFS.snKR = { name: '업보', color: '#e070ff', tint: '#a040d0', tintA: 0.18, particle: '#e8a0ff', tick: 0.5, stack: 'ignore',
    onTick(u, b, s) { if (!s.src || s.src.dead) return; b.damage(s.src, u, (s.power || 1) * s.src.st.atk * 0.11, { dot: true, element: 'dark', noCrit: true, color: '#e070ff' }); } };
  STATUS_DEFS.snStill = { name: '정지', color: '#7ab0ff', blocksMove: true, positive: true, noResistScale: true };
  function addKR(b, src, tgt, n) { if (tgt.dead) return; let s = tgt.status('snKR'); if (!s) { s = b.applyStatus(tgt, 'snKR', 3, src, { power: 0 }); if (!s) return; }
    s.power = Math.min(10, (s.power || 0) + n); s.t = Math.max(s.t, 3); s.src = src; }

  // ---------- 회피 ----------
  function sleep(b, u, dur) { const Z = S_(u); Z.st = 0; Z.sleep = dur; u.action = null; if (!u.status('snSleep')) u.statuses.push({ id: 'snSleep', t: dur, dur, src: u, tickT: 0 }); else u.status('snSleep').t = dur;
    b.text(u.x, u.y - 70, 'Zz…', '#c8d8ff', 12); b.say(u, 'sleep'); }
  function dodge(b, u, src, cost) {
    const Z = S_(u); Z.st -= cost; Z.lastDodge = b.time;
    const a = src ? angTo(src, u) + (rand(0, 1) < 0.5 ? 1 : -1) * Math.PI / 2 : rand(0, TAU), q = b.clampPos(u.x + Math.cos(a) * 16, u.y + Math.sin(a) * 16, u.pad, u);
    if (!b.blockAt(q.x, q.y - 4, 6)) { b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.25, a: 0.4 }); u.x = q.x; u.y = q.y; }
    if (!Z.missT || b.time - Z.missT > 0.15) { Z.missT = b.time; b.text(u.x, u.y - 54, 'MISS', '#e8e8f0', 10); }
    if (Z.st <= 0) sleep(b, u, ST.sleep);
  }
  const awake = (b, u) => isSans(u) && !u.dead && !b.freeze && !b.over && S_(u).sleep <= 0;
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (awake(this, tgt) && src !== tgt && amt > 0 && !o.selfHit) { dodge(this, tgt, src, o.dot ? ST.dot : o.sureHit ? ST.sure : o.big ? ST.big : ST.cost); return 0; }
    return oDmg.call(this, src, tgt, amt, o);
  };
  const oFix = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o = {}) {
    if (awake(this, tgt) && src !== tgt && amt > 0) { dodge(this, tgt, src, ST.big); return 0; }
    return oFix.call(this, src, tgt, amt, o);
  };
  const oStatus = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o = {}) {
    const d = STATUS_DEFS[id]; if (d && !d.positive && src && src !== tgt && awake(this, tgt)) { dodge(this, tgt, src, ST.status); return null; }
    return oStatus.call(this, tgt, id, dur, src, o);
  };

  // ---------- 뼈 줄 (세로 줄이 가로로 쓸고 지나감) ----------
  // 방향: axis 'x' = 세로 줄이 좌우로 이동, 'y' = 가로 줄이 위아래로 이동. dir +1 = 오른쪽/아래로
  function boneWave(b, u, o) { // o: { axis, dir, blue, gap, mult, kr, spd, delay }
    const L = AR.x + 6, R = AR.x + AR.w - 6, T = AR.y + 24, B = AR.y + AR.h - 4, ax = o.axis || 'x';
    const c0 = ax === 'x' ? T : L, c1 = ax === 'x' ? B : R, gapH = o.gap ? 46 : 0, gy = o.gap ? rand(c0 + 30, c1 - 30 - gapH) : 0;
    const p = ax === 'x' ? (o.dir > 0 ? L : R) : (o.dir > 0 ? T : B);
    objs(b).push({ k: 'bone', src: u, axis: ax, p, dir: o.dir, spd: o.spd || 210, c0, c1, gy, gh: gapH, blue: !!o.blue, mult: o.mult, kr: o.kr, hit: new Set(), t: -(o.delay || 0), still: new Map() });
  }
  // 방향 고르기: 상하/좌우 중 상대와 더 많이 떨어진 축을 60%, 나머지 축 40% (시드 난수), 샌즈 쪽에서 상대 쪽으로
  function pickDir(b, u, t) {
    const dx = Math.abs(t.x - u.x), dy = Math.abs(t.y - u.y), main = dx >= dy ? 'x' : 'y', ax = rand(0, 1) < 0.6 ? main : (main === 'x' ? 'y' : 'x');
    const d = ax === 'x' ? t.x - u.x : t.y - u.y; return { axis: ax, dir: d >= 0 ? 1 : -1 };
  }
  function blaster(b, u, tgt, n, mult, kr) {
    const a0 = rand(0, TAU);
    for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n + rand(-0.3, 0.3), R = 150;
      const q = b.clampPos(tgt.x + Math.cos(a) * R, tgt.y + Math.sin(a) * R, 0); const ang = Math.atan2(tgt.y - q.y, tgt.x - q.x);
      objs(b).push({ k: 'gb', src: u, x: q.x, y: q.y, ang, t: -i * 0.08, tele: 0.55, fire: 0.35, mult, kr, hit: new Set() }); }
  }
  function stepObjs(b, dt) {
    const L = objs(b); if (!L.length) return;
    for (const O of L) { O.t += dt; if (O.t < 0) continue; const u = O.src; if (u.dead) { O.dead = true; continue; }
      if (O.k === 'bone') {
        O.p += O.dir * O.spd * dt; const lo = O.axis === 'x' ? AR.x : AR.y, hi = O.axis === 'x' ? AR.x + AR.w : AR.y + AR.h; if (O.p < lo - 10 || O.p > hi + 10) { O.dead = true; continue; }
        for (const o of b.foes(u)) { if (o.hidden || O.hit.has(o)) continue;
          if (O.blue && !o.dead) { const ahead = (O.p - (O.axis === 'x' ? o.x : o.y)) * -O.dir; // 파란 뼈 반응 AI: 다가오면 멈춤 (가끔 실패)
            if (ahead > 0 && ahead < 70 && !O.still.has(o)) { const ok = rand(0, 1) < 0.7; O.still.set(o, ok); if (ok) { const s = o.status('snStill'); if (!s) o.statuses.push({ id: 'snStill', t: 0.45, dur: 0.45, src: u, tickT: 0 }); } } }
          const oa = O.axis === 'x' ? o.x : o.y, oc = O.axis === 'x' ? o.y : o.x;
          if (o.airborne || Math.abs(oa - O.p) > 7 + o.pad) continue;
          if (O.gh && oc > O.gy && oc < O.gy + O.gh) continue;
          if (O.blue && !o.snMoving) continue; // 파란 뼈: 움직일 때만
          O.hit.add(o); b.damage(u, o, u.st.atk * O.mult, { element: 'blunt', delivery: 'ranged', color: O.blue ? '#7ab0ff' : '#ffffff' }); addKR(b, u, o, O.kr); }
      } else if (O.k === 'gb') {
        if (O.t >= O.tele && !O.fired) { O.fired = true; playSfx('wall'); b.shake(1.5); }
        if (O.fired) { const x1 = O.x + Math.cos(O.ang) * 520, y1 = O.y + Math.sin(O.ang) * 520;
          for (const o of b.foes(u)) { if (o.hidden || o.dead || O.hit.has(o)) continue; if (segD(o.x, o.y - 14, O.x, O.y - 14, x1, y1 - 14) < 12 + o.pad) { O.hit.add(o); b.damage(u, o, u.st.atk * O.mult, { element: 'light', delivery: 'ranged', color: '#ffffff' }); addKR(b, u, o, O.kr); } } }
        if (O.t >= O.tele + O.fire) O.dead = true;
      } }
    b.snObjs = L.filter(O => !O.dead);
  }

  // ---------- 스킬 ----------
  const sl = (u, id) => u.skills.find(s => s.id === id);
  SKILLS.snBones = { desc: '뼈 줄이 한쪽 끝에서 반대쪽으로 쓸고 지나갑니다. 줄 중간의 빈틈으로 빠져나가거나 점프로 피할 수 있습니다. 맞으면 업보(KR) 누적.',
    canUse: (u, e, d) => d < 420, use(u, e, b, s) { const t = foeOf(b, u); boneWave(b, u, { ...pickDir(b, u, t), gap: true, mult: s.mult, kr: s.kr, spd: s.spd }); } };
  SKILLS.snBlue = { desc: '파란 뼈 줄이 쓸고 지나갑니다. 움직이는 상대만 맞습니다(가만히 있으면 안전). 맞으면 업보 누적.',
    canUse: (u, e, d) => d < 420, use(u, e, b, s) { const t = foeOf(b, u); boneWave(b, u, { ...pickDir(b, u, t), blue: true, mult: s.mult, kr: s.kr, spd: s.spd }); } };
  SKILLS.snGaster = { desc: '가스터 블래스터 2~4개가 여러 방향에서 나타나 입을 벌린 뒤(0.55초) 직선 광선을 쏩니다. 조준선이 보이니 피할 수 있습니다.',
    canUse: (u, e, d) => d < 400, use(u, e, b, s) { const t = foeOf(b, u); blaster(b, u, t, 2 + Math.floor(rand(0, 3)), s.mult, s.kr); } };
  SKILLS.snGravity = { desc: '상대의 영혼을 파랗게 물들여 가장 가까운 벽에 내리꽂고(벽 충돌 피해), 곧바로 뼈 공격이 이어집니다.',
    canUse: (u, e, d) => d < 300 && e && !e.airborne && !e.dead,
    use(u, e0, b, s) { const o = foeOf(b, u); if (!o || o.airborne || o.climb || o.inTrain) return;
      const L = o.x - AR.x, R = AR.x + AR.w - o.x, T = o.y - AR.y, Bm = AR.y + AR.h - o.y, m = Math.min(L, R, T, Bm);
      const tx = m === L ? AR.x : m === R ? AR.x + AR.w : o.x, ty = m === T ? AR.y : m === Bm ? AR.y + AR.h : o.y, q = b.clampPos(tx, ty, o.pad, o);
      o.action = null; o.air = { t: 0, dur: 0.28, h: 10, tumble: true, noLand: true, fling: { x0: o.x, y0: o.y, x1: q.x, y1: q.y } };
      b.streak(o.x, o.y - 18, q.x, q.y - 18, '#5a8aff', 10, 0.3); b.text(o.x, o.y - 66, '파란 영혼!', '#7ab0ff', 10);
      b.later(0.28, () => { if (o.dead || b.over) return; playSfx('wall'); b.shake(2.5); b.debris(o.x, o.y, 8); b.ring(o.x, o.y - 10, 3, 24, 0.3, '#7ab0ff');
        b.damage(u, o, u.st.atk * s.mult, { element: 'blunt', big: true, color: '#7ab0ff' }); addKR(b, u, o, s.kr); b.stun(o, s.stun, u);
        { const side = m === L || m === R ? 'x' : 'y', toHi = m === R || m === Bm; boneWave(b, u, { axis: side, dir: toHi ? 1 : -1, gap: true, mult: 0.9, kr: 2, spd: 260 }); } /* 박힌 벽 쪽으로 */ }); } };
  SKILLS.snTele = { desc: '위험하면 순간이동으로 멀리 피합니다.',
    canUse: (u, e, d, b) => (b.threatTo(u) && d < 220) || (d < 80 && (!u.sn || u.sn.st < 50)),
    use(u, e0, b) { const e = foeOf(b, u); let best = null, bd = -1;
      for (let i = 0; i < 10; i++) { const q = b.clampPos(rand(AR.x + 20, AR.x + AR.w - 20), rand(AR.y + 40, AR.y + AR.h - 20), u.pad, u); if (b.blockAt(q.x, q.y - 4, 10)) continue; const d = e ? Math.hypot(q.x - e.x, q.y - e.y) : 0; if (d > bd) { bd = d; best = q; } }
      if (!best) return; b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.35, a: 0.5 }); b.ring(u.x, u.y - 18, 4, 20, 0.2, '#c8d8ff');
      u.x = best.x; u.y = best.y; u.action = null; b.ring(u.x, u.y - 18, 20, 4, 0.2, '#c8d8ff'); } };

  // ---------- 최후의 공격 ----------
  function startFinal(b, u, e) { const Z = S_(u); Z.final = true; let t = 0, n = 0;
    b.hooks.onSystem && b.hooks.onSystem('샌즈의 최후의 공격!'); b.say(u, 'final'); b.text(u.x, u.y - 74, '최후의 공격', '#ffffff', 12);
    u.action = { type: 'snFinal', step(dt) { t -= dt; const o = foeOf(b, u); if (!o || o.dead) { u.action = null; return; }
      if (t > 0) return; t = 0.45; n++;
      if (n > 10) { u.action = null; Z.final = false; Z.finalDone = true; sleep(b, u, ST.finalSleep); return; }
      if (n % 2) blaster(b, u, o, 2, 1.0, 1); else boneWave(b, u, { axis: (n / 2) % 2 ? 'y' : 'x', dir: n % 8 < 4 ? 1 : -1, blue: n % 3 === 0, gap: n % 3 !== 0, mult: 0.8, kr: 1, spd: 240 }); } };
  }

  STAGE_HOOKS.push({
    match: () => false,
    init(b) { for (const u of b.u) if (isSans(u)) S_(u); },
    step(b, dt) {
      for (const o of b.u) { if (o.snPx != null) o.snMoving = Math.hypot(o.x - o.snPx, o.y - o.snPy) > 0.4; o.snPx = o.x; o.snPy = o.y; }
      stepObjs(b, dt);
      for (const u of b.u) { if (!isSans(u) || u.dead) continue; const Z = S_(u);
        if (Z.sleep > 0) { Z.sleep -= dt; if (Z.sleep <= 0) { Z.st = ST.wake; u.statuses = u.statuses.filter(s => s.id !== 'snSleep' && (STATUS_DEFS[s.id] || {}).positive); b.text(u.x, u.y - 66, '…어, 깼다', '#e0e8ff', 9); } continue; }
        if (!Z.final) Z.st = Math.min(ST.max, Z.st + ST.regen * dt);
        const e = foeOf(b, u); if (!Z.final && !Z.finalDone && e && !e.dead && e.hp < e.maxHp * 0.25 && !u.action && !u.blocked('blocksAct')) startFinal(b, u, e);
      }
    },
    drawOver(ctx, b) {
      for (const O of objs(b)) { if (O.t < 0) continue;
        if (O.k === 'bone') { ctx.save(); ctx.fillStyle = O.blue ? '#5a9aff' : '#f4f4f8'; const P = Math.round(O.p);
          for (let c = O.c0; c < O.c1; c += 7) { if (O.gh && c > O.gy && c < O.gy + O.gh) continue;
            if (O.axis === 'x') { ctx.fillRect(P - 1, c - 14, 3, 12); ctx.fillRect(P - 2, c - 15, 5, 2); } // 서 있는 뼈
            else { ctx.fillRect(c - 1, P - 12, 3, 12); ctx.fillRect(c - 2, P - 13, 5, 2); } }
          ctx.restore(); }
        else { const open = O.t >= O.tele, k = clamp(O.t / O.tele, 0, 1); ctx.save();
          if (!open) { ctx.globalAlpha = 0.25 + 0.3 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(O.x, O.y - 14); ctx.lineTo(O.x + Math.cos(O.ang) * 520, O.y - 14 + Math.sin(O.ang) * 520); ctx.stroke(); ctx.setLineDash([]); }
          else { const f = 1 - clamp((O.t - O.tele) / O.fire, 0, 1); ctx.globalAlpha = 0.9 * f + 0.1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 22 * f + 4; ctx.beginPath(); ctx.moveTo(O.x, O.y - 14); ctx.lineTo(O.x + Math.cos(O.ang) * 520, O.y - 14 + Math.sin(O.ang) * 520); ctx.stroke(); }
          ctx.globalAlpha = 1; ctx.translate(Math.round(O.x), Math.round(O.y - 14)); ctx.rotate(O.ang);
          ctx.fillStyle = '#f4f4f8'; ctx.fillRect(-12, -8, 14, 16); ctx.fillRect(2, -7, 6, open ? 4 : 6); ctx.fillRect(2, open ? 3 : 1, 6, open ? 4 : 6);
          ctx.fillStyle = '#20202a'; ctx.fillRect(-6, -6, 4, 4); ctx.fillRect(-6, 2, 4, 4); ctx.fillStyle = open ? '#7af0ff' : '#ffffff'; ctx.fillRect(-5, -5, 2, 2); ctx.restore(); } }
      for (const u of b.u) { if (!isSans(u) || u.dead || u.hidden || !u.sn) continue; const Z = u.sn;
        const w = 28, x0 = Math.round(u.x - w / 2), y0 = Math.round(u.y + u.ky - b.airZ(u) - 66);
        ctx.save(); ctx.fillStyle = 'rgba(16,14,22,0.75)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 5);
        ctx.fillStyle = Z.sleep > 0 ? '#5a6a90' : Z.st < 30 ? '#ffd060' : '#f0f0f8'; ctx.fillRect(x0, y0, Math.round(w * clamp(Z.st, 0, ST.max) / ST.max), 3);
        if (Z.sleep > 0) { ctx.fillStyle = '#e0e8ff'; ctx.font = '8px ' + (window.FONT || 'sans-serif'); ctx.textAlign = 'center'; ctx.fillText('Zz', u.x + 12 + Math.sin(b.time * 3) * 2, y0 - 3); }
        ctx.restore(); }
    },
  });

  CHARACTERS.push({
    id: ID, name: '샌즈', fullName: '샌즈', gender: 'male', color: '#4a7ad0',
    stats: { hp: 1, atk: 14, spd: 235, range: 54, atkRate: 0.8, def: 0, crit: 0 },
    attack: { element: 'blunt', delivery: 'melee' },
    skills: [
      { id: 'snTele', name: '순간이동', cd: 4 },
      { id: 'snGravity', name: '중력 조작', cd: 12, mult: 1.4, kr: 3, stun: 0.45 },
      { id: 'snGaster', name: '가스터 블래스터', cd: 7, mult: 1.3, kr: 3 },
      { id: 'snBlue', name: '파란 뼈', cd: 6, mult: 1.0, kr: 2, spd: 200 },
      { id: 'snBones', name: '뼈 공격', cd: 4.5, mult: 0.9, kr: 2, spd: 210 },
    ],
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 3, foot: 1 },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '뼈 공격': ['뼈 좀 맞아 볼래?', '이건 그냥 인사야.'],
        '파란 뼈': ['파란 건 가만히 있으면 돼. 알지?', '움직이지 마, 친구.'],
        '가스터 블래스터': ['한 방 크게 간다.', '이건 좀 아플걸.'],
        '중력 조작': ['넌 이제 파란색이야.', '쿵.'],
        '순간이동': ['지름길이야.', '어이, 여기야.'],
      },
      event: {
        battleStart: ['오늘 날씨 참 좋다. 이런 날엔…', '{opp}, 끔찍한 시간을 보내게 될 거야.'],
        sleep: ['…zzz', '좀… 쉬자…'],
        final: ['자, 이제 진짜 간다.', '이게 마지막이야. 진짜로.'],
        stunned: ['헤, 좀 어지럽네.'],
        win: ['헤헤. 핫도그나 먹으러 가야겠다.', '수고했어, 친구.'],
        lose: ['…뭐, 나름 열심히 했지.', '파피루스, 너 뭐 먹을래?'],
      },
    },
  });
})();
