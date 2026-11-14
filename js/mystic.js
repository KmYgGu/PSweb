/* =========================================================
 * 신비술사 스킬: 미스틱 볼, 포지셔닝 / 패시브: 리플레이스, 리스트레인트 / 근접 기본 공격: 손등으로 치기 (상대가 가까울 때만)
 *  상태: 조종(control), 봉인(seal) → status.js
 *  구슬·표식·조종 이동은 전역 훅(STAGE_HOOKS, match=false → 썸네일 무관)에서 처리
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const DEF = CHARACTERS.find(c => c.id === 'mystic');
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const slotOf = (u, id) => u.skills.find(s => s.id === id);

  // ---------- 미스틱 볼 ----------
  // MB_RANGE: 구슬이 나아가는 고정 거리 (상대 거리와 무관). 끝까지 가거나 벽·장애물에 닿으면 시전자에게 돌아옴.
  //  적중: 갈 때 1회 + 올 때 1회 (올 때는 이미 이 신비술사에게 조종 중인 상대면 건너뜀 → 조종 시간 갱신 남용 없음)
  const MB_RANGE = 220;
  // MB_SIZE: 구슬 크기 배율 (적중 반경 14 → 14×배율, 그림 반경 11·고리 6·잔상도 같은 배율로 함께 커짐)
  const MB_SIZE = 2, MB_HIT = 14 * MB_SIZE;
  SKILLS.mysticBall = {
    desc: '상대의 현재 위치 방향으로 마법 구슬을 날립니다(유도 없음). 구슬은 상대 거리와 상관없이 항상 일정 거리를 나아간 뒤(벽에 닿으면 그 자리에서) 시전자에게 돌아옵니다. 갈 때와 올 때 모두 맞힐 수 있고, 구슬에 닿은 상대는 조종 상태: 신비술사가 움직이는 대로 끌려다니며, 벽에 부딪히면 큰 피해.',
    canUse: (u, e, d) => !u.orb && !e.dead && d < 280,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      u.orb = { x: u.x + Math.cos(a) * 12, y: u.y - 18, dx: Math.cos(a), dy: Math.sin(a), go: 0, phase: 'out', t: 0, hit: false, hitBack: false, slot, trail: [] };
      b.glow(u.x, u.y - 20, 30, '#d890ff', 0.35);
    },
  };
  function orbStep(b, u, dt) {
    const O = u.orb, S = O.slot;
    const e = b.foes(u).find(f => Math.hypot(f.x - O.x, (f.y - 18 - b.airZ(f)) - O.y) < MB_HIT + f.pad) || b.enemy(u); // 다인 팀: 구슬에 닿은 상대
    O.t += dt;
    if (O.phase === 'out') {
      const st = Math.min(S.spd * dt, MB_RANGE - O.go), nx = O.x + O.dx * st, ny = O.y + O.dy * st, q = b.clampPos(nx, ny + 18, 4);
      if (Math.abs(q.x - nx) > 0.5 || Math.abs(q.y - (ny + 18)) > 0.5 || (b.blockAt && b.blockAt(nx, ny + 14, 4))) O.phase = 'back'; // 벽·장애물: 그 자리에서 돌아오기
      else { O.x = nx; O.y = ny; O.go += st; if (O.go >= MB_RANGE - 1e-6) O.phase = 'back'; } // 고정 거리 도달 → 돌아오기
    } else {
      const dx = u.x - O.x, dy = u.y - 18 - O.y, d = Math.hypot(dx, dy), st = S.backSpd * dt;
      if (d <= Math.max(st, 10) || u.dead || O.t > 4) { u.orb = null; if (!u.dead) b.glow(u.x, u.y - 20, 22, '#d890ff', 0.25); return; }
      O.x += dx / d * st; O.y += dy / d * st;
    }
    O.trail.push([O.x, O.y]); if (O.trail.length > 8) O.trail.shift();
    if (Math.random() < 0.5) b.parts.push({ x: O.x + rand(-3, 3), y: O.y + rand(-3, 3), vx: rand(-10, 10), vy: rand(-10, 10), life: 0.35, max: 0.35, color: '#e0b0ff', size: 2, glow: true });
    const back = O.phase === 'back', ctl = e.status && e.status('control');
    if (!(back ? O.hitBack || (ctl && ctl.src === u) : O.hit) && !e.dead && !b.over && Math.hypot(e.x - O.x, (e.y - 18 - b.airZ(e)) - O.y) < MB_HIT + e.pad) {
      if (back) O.hitBack = true; else O.hit = true; // 갈 때 1회, 올 때 1회
      b.stats.mbHitOut = (b.stats.mbHitOut || 0) + (back ? 0 : 1); b.stats.mbHitBack = (b.stats.mbHitBack || 0) + (back ? 1 : 0);
      b.shock(e.x, e.y - 18, 6, 34, '#d890ff', 0.4, 3);
      const r = b.statusResist(e, 'control');
      if (Math.random() < r) { b.text(e.x, e.y - 84, '조종 저항', '#a8b0c4', 9); return; }
      const s = b.applyStatus(e, 'control', S.control * (1 - r / 2), u);
      if (s) { s.wallCd = 0; sys(b, `${e.def.name} 조종당함!`); b.stats.controls = (b.stats.controls || 0) + 1; }
    }
  }
  // 조종: 신비술사가 움직인 만큼 같이 이동. 벽(이동 가능 영역 경계/스테이지 벽)에 막히면 큰 피해
  function controlStep(b, u, dt) {
    const e = b.u.find(o => o.team !== u.team && o.status('control') && o.status('control').src === u) || (u.def.id === 'mystic' ? b.enemy(u) : null), s = e && e.status('control');
    const dx = u.x - (u.mPrev ? u.mPrev[0] : u.x), dy = u.y - (u.mPrev ? u.mPrev[1] : u.y);
    if (!s || e.dead || b.over || e.airborne || e.climb || e.inTrain) return;
    s.wallCd = Math.max(0, (s.wallCd || 0) - dt);
    if (Math.hypot(dx, dy) > 40 || (dx === 0 && dy === 0)) return; // 순간이동 등은 무시
    const nx = e.x + dx, ny = e.y + dy, q = b.clampPos(nx, ny, e.pad, e);
    const bl = b.blockAt && b.blockAt(nx, ny - 4, 9 + e.pad);
    if (!bl) { e.x = q.x; e.y = q.y; }
    const blocked = bl || Math.abs(q.x - nx) > 0.3 || Math.abs(q.y - ny) > 0.3;
    if (Math.random() < dt * 10) b.parts.push({ x: e.x + rand(-6, 6), y: e.y - rand(4, 30), vx: dx / dt * 0.2, vy: dy / dt * 0.2, life: 0.3, max: 0.3, color: '#d890ff', size: 2, glow: true });
    if (blocked && s.wallCd <= 0) {
      const S = slotOf(u, 'mysticBall') || {};
      s.wallCd = S.wallCd || 0.4;
      b.damage(u, e, u.st.atk * (S.wallMult || 2), { element: 'dark', delivery: 'ranged', big: true, color: '#e0b0ff' });
      b.shock(e.x, e.y - 10, 4, 30, '#ffffff', 0.35, 4); b.shake(2); b.dust(e.x, e.y);
      b.text(e.x, e.y - 70, '벽 충돌!', '#e0b0ff', 11); b.say(u, 'controlWall'); charSfx(u, 'controlWall');
      b.stats.controlWall = (b.stats.controlWall || 0) + 1;
    }
  }

  // ---------- 손등으로 치기 (근접 기본 공격) ----------
  // 신비술사는 원거리(사거리 115)라 엔진의 자동 기본 공격이 없음 → 상대가 근접 거리 안일 때만 손등으로 후려침.
  //  간격 = 엔진 근접 기본 공격과 같음 (1/공격속도 × meleeRateMul, B타입은 사거리 BK.range 기준 bMeleeCdK 배율). 무음 (전용 소리 없음)
  //  넉백은 상대가 행동(돌진·시전 동작) 중이 아닐 때만 (행동 끊기 부가효과 없음)
  const BK = { range: 50, mult: 0.35, delay: 0.08, kbSpd: 200, kbDur: 0.12 };
  function backhandStep(b, u) {
    if (u.def.id !== 'mystic' || u.dead || b.over || b.freeze || u.action || u.stun || u.airborne || u.atkT > 0 || u.blocked('blocksAct')) return;
    const e = b.enemy(u); if (!e || e.dead || e.hidden || e.airborne) return;
    const reach = BK.range + 20 + u.pad; if (dist(u, e) > reach) return;
    u.atkT = 1 / (u.atkRate * u.mult('meleeRateMul')); if (b.modeB) u.atkT *= B_MODE.cdBase + Math.max(0, BK.range - B_MODE.cdRefRange) * B_MODE.cdPerPx;
    if (b.emit('attack', u, e)) { b.text(u.x, u.y - 50, '무효!', '#c8c0ff', 10); return; } // 미러 포스류 함정
    u.facing = e.x >= u.x ? 1 : -1; u.swing = 0.2; b.stats.backhand = (b.stats.backhand || 0) + 1;
    b.later(BK.delay, () => {
      if (u.dead || u.stun || e.dead || b.over) return;
      if (dist(u, e) > reach + 12) { b.slashFx(u.x + u.facing * 18, u.y - 18, u.facing, '#e0b0ff', 0.8); return; } // 헛침
      const bd = b.damage(u, e, u.st.atk * BK.mult, { ...(u.def.attack || {}), delivery: 'melee', basic: true, color: '#f0d0ff' });
      b.slashFx(e.x - u.facing * 4, e.y - 18, -u.facing, '#f0d0ff', 1); // 손등: 반대 방향으로 휘두른 호
      if (bd > 0) { b.stats.backhandHit = (b.stats.backhandHit || 0) + 1; b.resEvent(u, 'basicHit');
        if (!e.dead && !e.action) b.knockback(e, Math.atan2(e.y - u.y, e.x - u.x), BK.kbSpd, BK.kbDur); }
    });
  }

  // ---------- 포지셔닝 ----------
  SKILLS.positioning = {
    desc: '현재 위치에 표식을 남기고, 일정 시간(3초) 뒤 표식 위치로 순간이동합니다.',
    canUse: (u, e, d, b) => !u.mark && (d < 120 || u.hp < u.maxHp * 0.5),
    use(u, e, b, slot) {
      u.mark = { x: u.x, y: u.y, t: 0, dur: slot.delay || 3 };
      b.ring(u.x, u.y, 4, 22, 0.4, '#d890ff');
    },
  };
  function markStep(b, u, dt) {
    const M = u.mark; M.t += dt;
    if (M.t < M.dur || u.dead) { if (u.dead) u.mark = null; return; }
    u.mark = null;
    if (b.over || u.climb || u.inTrain || u.status('pin')) return;
    const from = { x: u.x, y: u.y }, q = b.clampPos(M.x, M.y, u.pad, u);
    for (let i = 0; i < 10; i++) b.parts.push({ x: from.x + rand(-8, 8), y: from.y - rand(0, 40), vx: rand(-30, 30), vy: rand(-60, -20), life: 0.5, max: 0.5, color: '#e0b0ff', size: 2.5, glow: true });
    u.x = q.x; u.y = q.y; u.action = null; if (u.air && u.air.fling) u.air = null;
    b.glow(u.x, u.y - 20, 40, '#d890ff', 0.5); b.shock(u.x, u.y, 4, 34, '#e0b0ff', 0.4, 3);
    b.text(u.x, u.y - 64, '포지셔닝!', '#e0b0ff', 10);
    sys(b, `${u.def.name}: 표식으로 귀환`); b.say(u, 'positionReturn'); charSfx(u, 'posReturn');
    u.mPrev = [u.x, u.y];
  }

  // ---------- 패시브 ----------
  const canSwap = (b, x) => !x.dead && !x.airborne && !x.climb && !x.inTrain && !x.status('pin') && !x.pull && !x.fallen && !(x.action && x.action.pin);
  DEF.onHurt = (u, src, b, dmg, o) => { // 리플레이스
    const P = DEF.passives.replace;
    if (o.dot || b.time - (u.replaceT ?? -99) < P.icd || Math.random() >= P.chance) return;
    if (!canSwap(b, u) || !canSwap(b, src)) return;
    u.replaceT = b.time;
    const a = b.clampPos(src.x, src.y, u.pad, u), c = b.clampPos(u.x, u.y, src.pad, src);
    const fx = [u.x, u.y, src.x, src.y];
    u.x = a.x; u.y = a.y; src.x = c.x; src.y = c.y; u.action = null; src.action = null;
    u.mPrev = [u.x, u.y];
    for (const [x, y] of [[fx[0], fx[1]], [fx[2], fx[3]]]) { b.smoke && b.smoke(x, y - 18, '#d890ff', 6); b.shock(x, y, 4, 26, '#d890ff', 0.35, 3); }
    const bad = u.statuses.filter(s => { const d = STATUS_DEFS[s.id]; return d && !d.positive; });
    u.statuses = u.statuses.filter(s => !bad.includes(s));
    const moved = [];
    for (const s of bad) { const n = b.applyStatus(src, s.id, s.t, u, { power: s.power }); if (n) moved.push(STATUS_DEFS[s.id].name); }
    b.text(u.x, u.y - 66, '리플레이스!', '#e0b0ff', 11);
    sys(b, `${u.def.name}: 리플레이스! 위치 교환` + (moved.length ? ` (${moved.join(', ')} 전가)` : ''));
    b.stats.replaces = (b.stats.replaces || 0) + 1; b.say(u, 'replace'); charSfx(u, 'replace');
  };
  DEF.onHit = (u, tgt, b, dmg, o) => { // 리스트레인트
    const P = DEF.passives.restraint;
    if (o.dot || Math.random() >= P.chance) return;
    const s = b.applyStatus(tgt, 'seal', P.dur, u);
    if (s) { sys(b, `${u.def.name}: 리스트레인트! ${tgt.def.name} 스킬 봉인`); b.stats.seals = (b.stats.seals || 0) + 1; b.say(u, 'restraint'); charSfx(u, 'seal'); }
  };

  // ---------- 전역 훅 ----------
  function drawLock(ctx, x, y, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(x), Math.round(y));
    ctx.strokeStyle = '#d8d0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -4, 4, Math.PI, 0); ctx.lineTo(4, -1); ctx.moveTo(-4, -4); ctx.lineTo(-4, -1); ctx.stroke();
    ctx.fillStyle = '#6a60c0'; ctx.fillRect(-6, -1, 12, 9); ctx.strokeStyle = '#d8d0ff'; ctx.lineWidth = 1; ctx.strokeRect(-5.5, -0.5, 11, 8);
    ctx.fillStyle = '#ffe07a'; ctx.fillRect(-1, 2, 2, 3);
    ctx.restore();
  }
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      for (const u of b.u) {
        if (u.def.id !== 'mystic' && !u.orb && !u.mark && !b.u.some(o => o.team !== u.team && o.status('control') && o.status('control').src === u)) { u.mPrev = null; continue; } // 다른 캐릭터가 빌려 쓴 미스틱 볼/포지셔닝 (패스트푸드점 배달 스킬)도 처리
        backhandStep(b, u);
        if (u.orb) orbStep(b, u, dt);
        if (u.mark) markStep(b, u, dt);
        controlStep(b, u, dt);
        u.mPrev = [u.x, u.y];
      }
    },
    drawUnder(ctx, b) {
      for (const u of b.u) if (u.mark) { // 표식
        const M = u.mark, p = M.t / M.dur, r = 14 + 2 * Math.sin(b.time * 6);
        ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * p; ctx.strokeStyle = '#d890ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(M.x, M.y + 1, r, r * 0.45, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(M.x, M.y + 1, r * 0.6, r * 0.27, 0, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
        ctx.translate(M.x, M.y + 1); ctx.rotate(b.time * 1.5); ctx.scale(1, 0.45); ctx.fillStyle = '#e0b0ff';
        for (let k = 0; k < 4; k++) { ctx.rotate(TAU / 4); ctx.fillRect(r - 2, -1, 4, 2); }
        ctx.restore();
      }
    },
    drawOver(ctx, b) {
      function drawOrb(ctx, O, b) {
          ctx.save();
          O.trail.forEach(([x, y], i) => { ctx.globalAlpha = 0.08 * i; ctx.fillStyle = '#d890ff'; ctx.beginPath(); ctx.arc(x, y, (3 + i * 0.5) * MB_SIZE, 0, TAU); ctx.fill(); });
          const g = ctx.createRadialGradient(O.x, O.y, 1, O.x, O.y, 11 * MB_SIZE); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#e0b0ff'); g.addColorStop(1, 'rgba(150,60,220,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(O.x, O.y, 11 * MB_SIZE, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(O.x, O.y, 6 * MB_SIZE, b.time * 5, b.time * 5 + 4); ctx.stroke();
          ctx.restore();
      }
      for (const u of b.u) {
        const O = u.orb;
        if (O && b._v3d) { // 직접 플레이: 구슬(+잔상)을 제자리(몸 높이 18)에 세움
          const V = b._v3d, d = O.trail.reduce((m, [x]) => Math.max(m, Math.abs(x - O.x)), 0);
          V.shadow(O.x, O.y + 18, 6); V.stand({ x: O.x, y: O.y + 18, w: d * 2 + 30 * MB_SIZE, h: 60 * MB_SIZE + 30, draw: c => drawOrb(c, O, b) });
        } else if (O) drawOrb(ctx, O, b);
        const s = u.status('seal');
        if (s && !u.dead) drawLock(ctx, u.x, u.y - 86 - b.airZ(u) - u.pad * 2.2, s.t < 0.5 ? s.t / 0.5 : 1);
        if (u.status('control') && !u.dead) { // 조종 실
          const m = u.status('control').src || b.enemy(u);
          if (b._v3d && m) { b._v3d.beam({ x1: m.x, y1: m.y, x2: u.x, y2: u.y, z1: 30, z2: 20, w: 4, draw: (c, L) => { c.globalAlpha = 0.35 + 0.15 * Math.sin(b.time * 10); c.strokeStyle = '#d890ff'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, 0); c.lineTo(L, 0); c.stroke(); } }); continue; } // 직접 플레이: 조종 실 = 3D 띠
          ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(b.time * 10); ctx.strokeStyle = '#d890ff'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(m.x, m.y - 30); ctx.lineTo(u.x, u.y - 20); ctx.stroke(); ctx.restore();
        }
      }
    },
  });
})();
