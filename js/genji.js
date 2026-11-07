/**
 * 겐지 (오버워치) — 사이보그 닌자. 근접 칼 평타, 표창은 스킬로만 사용
 *  1. 표창 연속 던지기 : 한 줄로 3발 연속 (발사 직전마다 현재 상대 쪽으로 조금씩 각도 보정, 발사 후 직진)
 *  2. 세 갈래 표창     : 부채꼴 3방향 동시 발사 (직진)
 *  3. 튕겨내기         : 1.1초 방어 자세. 반사 가능한 투사체는 상대에게 되돌리고, 근접 공격은 막음
 *  4. 질풍참           : 시전 순간 상대 위치로 곧게 질주하며 경로상 적을 한 번씩 벰. 치명타 또는 장애물 파괴 시 쿨 초기화
 *  5. 벽타기           : 이동 중 넘을 수 있는 장애물에 막히면 타고 넘어감
 *  6. 용검             : 질풍참 쿨 초기화 + 6초간 넓은 부채꼴 용검 평타 (표창 스킬 대신)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'genji', IMG = 'assets/Genji/', GREEN = '#9aff4a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const G_ = u => u.gj || (u.gj = { def: 0, blade: 0 });
  const isGenji = u => u && u.def && u.def.id === ID;
  const slotIdx = (u, id) => u.skills.findIndex(s => s.id === id);
  const D = {
    star: { spd: 620, r: 9 },
    deflect: { dur: 1.1, reach: 30 },
    dash: { len: 150, spd: 900, w: 30, mult: 1.6 },
    climb: { probe: 16, maxCross: 140, h: 30, dur: 0.42 },
    blade: { dur: 6, range: 78, rateK: 1.35, mult: 1.5, arc: 1.05 },
  };

  // ---------- 표창 ----------
  function drawStar(ctx, p) {
    ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate((p.spin = (p.spin || 0) + 0.5));
    ctx.fillStyle = p.reflected ? '#ffe27a' : '#d8e0ea'; ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-1, -4, 2, 8);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -1, 2, 2); ctx.fillStyle = GREEN; ctx.fillRect(0, 0, 1, 1);
  }
  function star(b, u, ang, mult, slot) {
    const sx = u.x + Math.cos(ang) * 10, sy = u.y - 20 - b.airZ(u) + Math.sin(ang) * 4;
    b.proj.push({ x: sx, y: sy, vx: Math.cos(ang) * D.star.spd, vy: Math.sin(ang) * D.star.spd, spd: D.star.spd, src: u, dmg: u.st.atk * mult, kind: 'gjStar', homing: false, noAirLock: true,
      life: 1.4, trail: 0, draw: drawStar, hit: { element: 'slash', delivery: 'ranged', color: '#e8f0ff' } });
    u.swing = 0.12; b.sparks(sx, sy, '#e8f4ff', 3, 80);
  }
  const bladeOn = u => !!(u.gj && u.gj.blade > 0);

  // ---------- 튕겨내기: 반사 가능 판별 ----------
  // 반사 가능 = 실제 투사체 객체(b.proj) 중 관통(pierce)·상쇄(cancel)·커스텀 적중(onHitUnit)·아군 피격(hitAlly)·noReflect 가 아닌 것
  // (빔·광역·즉발 히트스캔·블랙홀·지속 피해는 투사체 객체가 아니므로 애초에 대상이 아님)
  const canReflect = p => p && p.life > 0 && !p.pierce && !p.cancel && !p.onHitUnit && !p.hitAlly && !p.noReflect;
  function reflectStep(b, u) {
    for (const p of b.proj) {
      if (!canReflect(p) || !p.src || p.src.team === u.team) continue;
      const dx = u.x - p.x, dy = u.y - 18 - b.airZ(u) - p.y, d = Math.hypot(dx, dy);
      if (d > D.deflect.reach + u.pad) continue;
      const back = p.src.dead ? foeOf(b, u) : p.src, sp = Math.max(p.spd || 0, Math.hypot(p.vx || 0, p.vy || 0), 420);
      const a = back && !back.dead ? Math.atan2(back.y - 18 - p.y, back.x - p.x) : Math.atan2(-dy, -dx);
      p.src = u; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.homing = false; p.tgt = null; p.noAirLock = true; p.reflected = true;
      p.hit = { ...(p.hit || {}), reflected: true, noCrit: true }; p.hitSet = null; p.life = Math.max(p.life, 1.2);
      b.sparks(p.x, p.y, '#e8ffd0', 8, 180); b.ring(p.x, p.y, 2, 14, 0.2, GREEN); b.text(u.x, u.y - 62, '반사!', GREEN, 10);
      b.stats.gjReflect = (b.stats.gjReflect || 0) + 1;
    }
  }
  const isMeleeHit = (src, o) => o.delivery === 'melee' || o.bump || (o.basic && !o.viaProj && src && src.st && src.st.range < MELEE_RANGE);
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (isGenji(tgt) && tgt.gj && tgt.gj.def > 0 && !tgt.dead && src && src !== tgt && src.team !== tgt.team && !o.dot && !o.reflected && !o.fixed && isMeleeHit(src, o)) {
      if (!tgt.gj.blkT || this.time - tgt.gj.blkT > 0.15) { tgt.gj.blkT = this.time; this.text(tgt.x, tgt.y - 56, '막음', '#e8ffd0', 10); this.sparks(tgt.x + tgt.facing * 8, tgt.y - 22, '#ffffff', 6, 150); }
      this.stats.gjBlock = (this.stats.gjBlock || 0) + 1; return 0;
    }
    return oDmg.call(this, src, tgt, amt, o);
  };

  // ---------- 용검 평타 ----------
  const oBasic = Battle.prototype.basicAttack;
  Battle.prototype.basicAttack = function (u, e) {
    if (!bladeOn(u)) return oBasic.call(this, u, e);
    if (this.emit('attack', u, e)) { this.text(u.x, u.y - 50, '무효!', '#c8c0ff', 10); return; }
    u.swing = 0.2; const a0 = angTo(u, e);
    u.wSwing = { t: 0, dur: 0.26, ang: Math.atan2((e.y - 18) - (u.y - 20), e.x - u.x), k: 'ninjato' };
    this.later(0.08, () => {
      if (u.dead || this.over || u.stun) return; const R = u.reach + 18, atk = { element: 'slash', delivery: 'melee', basic: true, color: '#d8ffb0' };
      this.crescent(u.x + Math.cos(a0) * 18, u.y - 18 + Math.sin(a0) * 10, R * 0.7, a0, GREEN, 0.3);
      this.crescent(u.x + Math.cos(a0) * 14, u.y - 18 + Math.sin(a0) * 8, R * 0.55, a0, '#e8ffd0', 0.24, 0.04);
      this.sparks(u.x + Math.cos(a0) * 30, u.y - 18 + Math.sin(a0) * 16, GREEN, 8, 160);
      for (const o of this.foes(u)) { if (o.hidden || dist(u, o) > R + o.pad) continue; if (Math.abs(wrapA(angTo(u, o) - a0)) > D.blade.arc) continue;
        const bd = this.damage(u, o, u.st.atk * D.blade.mult, atk); if (bd > 0) this.resEvent(u, 'basicHit'); }
      const bl = this.blockAt(u.x + Math.cos(a0) * 24, u.y - 4 + Math.sin(a0) * 24, 10); if (bl) this.hitBuilding(bl, u.st.atk * this.rules.meleeK * 1.5, false, u.x + Math.cos(a0) * 20, u.y - 14);
    });
  };
  function bladeEnd(b, u) { const G = G_(u); if (G.base) { u.st.range = G.base.range; u.st.atkRate = G.base.atkRate; G.base = null; } G.blade = 0; }

  // ---------- 벽타기: 넘을 수 있는 장애물 판별 ----------
  // 대상 = b.buildings 의 고정 장애물(시가지 건물, 브로리 암반 등). 이동하는 벽(vx/vy, 뱀 스테이지)·스테이지 고체(solidAt: 전광판·열차·해치·철망)·경기장 외곽은 제외
  const climbable = bl => bl && !bl.dead && !bl.stageSolid && !bl.vx && !bl.vy && !bl.snWall && (bl.w || 0) > 0;
  function climbPlan(b, u) {
    const c = Math.cos(u.dir), s = Math.sin(u.dir); let bl = null;
    for (let k = 4; k <= D.climb.probe; k += 4) { const o = b.blockAt(u.x + c * k, u.y - 4 + s * k, 11 + u.pad); if (o) { bl = o; break; } }
    if (!climbable(bl) || !b.buildings.includes(bl)) return null;
    let k = 8, inside = false;
    for (; k <= D.climb.maxCross; k += 4) { const hit = b.blockAt(u.x + c * k, u.y - 4 + s * k, 11 + u.pad); if (hit) inside = true; else if (inside) break; }
    if (!inside || k > D.climb.maxCross) return null;
    const x = u.x + c * (k + 6), y = u.y + s * (k + 6), q = b.clampPos(x, y, u.pad, u);
    if (Math.abs(q.x - x) > 0.5 || Math.abs(q.y - y) > 0.5 || b.blockAt(q.x, q.y - 4, 11 + u.pad)) return null;
    const C = b.stage.circle; if (C && Math.hypot(q.x - C.cx, q.y - C.cy) > b.circleR() - 14) return null;
    return { x: q.x, y: q.y, bl };
  }

  // ---------- 스킬 ----------
  SKILLS.gjTriple = { desc: '표창 3개를 한 줄로 연속해서 던집니다. 한 발씩 던질 때마다 상대 쪽으로 조금씩 조준을 고칩니다(날아가는 표창은 직진). 용검 중엔 사용하지 않습니다.',
    canUse: (u, e, d) => !bladeOn(u) && d > 50 && d < 280,
    use(u, e0, b, s) { const e = foeOf(b, u); let aim = angTo(u, e); const n = s.n || 3;
      for (let i = 0; i < n; i++) b.later(i * (s.gap || 0.11), () => { if (u.dead || b.over || u.blocked('blocksAct')) return; const t = foeOf(b, u); if (!t || t.dead) return;
        aim += clamp(wrapA(angTo(u, t) - aim), -(s.adj || 0.09), s.adj || 0.09); star(b, u, aim, s.mult, s); }); } };
  SKILLS.gjFan = { desc: '표창 3개를 부채꼴 3방향으로 한 번에 던집니다(직진). 용검 중엔 사용하지 않습니다.',
    canUse: (u, e, d) => !bladeOn(u) && d > 40 && d < 220,
    use(u, e0, b, s) { const e = foeOf(b, u), a = angTo(u, e), sp = s.spread || 0.22; b.telegraphFan(u.x, u.y - 18, a, sp * 1.4, 120, 0.12, '#d8f0c0');
      b.windup(u, 0.12, () => { if (u.dead || b.over) return; for (let i = -1; i <= 1; i++) star(b, u, a + i * sp, s.mult, s); }); } };
  SKILLS.gjDeflect = { desc: '1.1초 동안 칼로 막는 자세. 반사 가능한 투사체는 상대 쪽으로 튕겨 되돌리고(원래 위력), 근접 공격은 막아냅니다. 광선·즉발·광역·지속 피해는 막지 못합니다.',
    canUse: (u, e, d, b) => b.threatTo(u) || (e && !e.dead && e.st.range < MELEE_RANGE && d < e.reach + 10 && e.atkT < 0.2),
    use(u, e0, b, s) { const G = G_(u); G.def = s.dur || D.deflect.dur; b.ring(u.x, u.y - 18, 4, 22, 0.25, GREEN); b.text(u.x, u.y - 66, '튕겨내기', '#e8ffd0', 10);
      u.action = { type: 'gjDeflect', step(dt) { if (!(G.def > 0)) u.action = null; } }; } };
  SKILLS.gjDash = { desc: '사용 순간 상대가 있던 방향으로 곧게 질주하며 벱니다(추적 없음, 벽·장애물에서 멈춤, 경로상 적에게 한 번씩 피해). 치명타가 터지거나 장애물을 부수면 쿨타임 초기화.',
    canUse: (u, e, d) => d > 30 && d < 175,
    use(u, e0, b, s) { const e = foeOf(b, u), a = angTo(u, e), hitS = new Set(); let gone = 0; const L = s.len || D.dash.len, V = s.spd || D.dash.spd, idx = slotIdx(u, s.id);
      const reset = why => { if (idx >= 0) u.skillT[idx] = 0.15; b.text(u.x, u.y - 70, '질풍참 초기화!', GREEN, 10); b.stats.gjReset = (b.stats.gjReset || 0) + 1; b.stats['gjReset_' + why] = (b.stats['gjReset_' + why] || 0) + 1; };
      b.glow(u.x, u.y - 18, 26, GREEN, 0.25); u.facing = Math.cos(a) >= 0 ? 1 : -1;
      u.action = { type: 'gjDash', trail: '#c8ff9a', step(dt) {
        const st = Math.min(V * dt, L - gone), px = u.x, py = u.y, nx = u.x + Math.cos(a) * st, ny = u.y + Math.sin(a) * st, q = b.clampPos(nx, ny, u.pad, u), bl = b.blockAt(nx, ny - 4, 9 + u.pad);
        let stop = false;
        if (bl) { stop = true; const was = !bl.dead; b.hitBuilding(bl, Math.max(60, u.st.atk * 3), true, nx, ny - 14); playSfx('wall'); b.dust(u.x, u.y); if (was && bl.dead) reset('obj'); }
        else if (Math.abs(q.x - nx) > 0.3 || Math.abs(q.y - ny) > 0.3) { stop = true; u.x = q.x; u.y = q.y; playSfx('wall'); b.dust(u.x, u.y); }
        else { u.x = nx; u.y = ny; gone += st; }
        b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.22, a: 0.35 });
        for (const o of b.foes(u)) { if (o.hidden || o.airborne || hitS.has(o)) continue; if (segD(o.x, o.y, px, py, u.x, u.y) > (s.w || D.dash.w) + o.pad) continue;
          hitS.add(o); const crit = Math.random() < u.st.crit;
          const dd = b.damage(u, o, u.st.atk * (s.mult || D.dash.mult), { element: 'slash', delivery: 'melee', crit, noCrit: !crit, color: '#d8ffb0' });
          b.crescent(o.x, o.y - 18, 26, a - 0.5, GREEN, 0.25); b.sparks(o.x, o.y - 18, '#e8ffd0', 10, 200);
          if (crit && dd > 0) reset('crit'); }
        if (stop || gone >= L - 0.01) { u.action = null; u.dir = fixAngle(a + Math.PI + rand(-0.6, 0.6)); b.slashFx(u.x, u.y - 18, u.facing, '#e8ffd0', 1.1); } } }; } };
  SKILLS.gjClimb = { desc: '이동 중 넘을 수 있는 장애물(건물·바위 등 고정 장애물)에 막히면 타고 넘어갑니다. 이동하는 벽·스테이지 외곽·고정 설비 벽은 넘지 못합니다.',
    canUse: (u, e, d, b) => { if (u.airborne || u.push || u.pull) return false; const P = climbPlan(b, u); if (!P) return false;
      const t = foeOf(b, u); if (t && Math.cos(u.dir) * (t.x - u.x) + Math.sin(u.dir) * (t.y - u.y) < 0) return false; u._gjPlan = P; return true; },
    use(u, e0, b, s) { const P = u._gjPlan; u._gjPlan = null; if (!P) return; u.action = null;
      b.text(u.x, u.y - 62, '벽타기', '#e8ffd0', 9); b.dust(u.x, u.y);
      u.air = { t: 0, dur: s.dur || D.climb.dur, h: s.h || D.climb.h, noLand: true, sfx: 1, gjClimb: true, fling: { x0: u.x, y0: u.y, x1: P.x, y1: P.y } };
      b.later((s.dur || D.climb.dur) + 0.02, () => { if (!u.dead) b.dust(u.x, u.y); }); b.stats.gjClimb = (b.stats.gjClimb || 0) + 1; } };
  SKILLS.gjBlade = { desc: '용검을 뽑습니다. 즉시 질풍참 쿨타임 초기화, 6초 동안 평타가 넓은 부채꼴·긴 사거리의 용검 베기로 바뀌고 피해·공격 속도가 오릅니다(표창 대신). 질풍참·튕겨내기·벽타기는 계속 사용.',
    canUse: (u, e, d) => !bladeOn(u) && e && !e.dead && d < 175,
    use(u, e0, b, s) { const G = G_(u); if (!G.base) G.base = { range: u.st.range, atkRate: u.st.atkRate };
      G.blade = s.dur || D.blade.dur; u.st.range = D.blade.range; u.st.atkRate = G.base.atkRate * D.blade.rateK;
      const i = slotIdx(u, 'gjDash'); if (i >= 0) u.skillT[i] = 0;
      b.hooks.onSystem && b.hooks.onSystem('겐지: 용검!'); b.text(u.x, u.y - 74, '용검', GREEN, 14);
      b.glow(u.x, u.y - 22, 60, GREEN, 0.6); b.shock(u.x, u.y, 6, 60, GREEN, 0.5, 5); b.sparks(u.x, u.y - 24, '#e8ffd0', 24, 220); b.hitstop(0.1); b.shake(1.5);
      G.dragonT = 0; } };

  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      for (const u of b.u) { if (!isGenji(u) || !u.gj) continue; const G = u.gj;
        if (u.dead) { if (G.blade > 0) bladeEnd(b, u); G.def = 0; continue; }
        if (G.def > 0) { G.def -= dt; reflectStep(b, u); if (G.def <= 0 && u.action && u.action.type === 'gjDeflect') u.action = null; }
        if (G.blade > 0) { G.blade -= dt; if (G.dragonT != null) G.dragonT += dt; if (G.blade <= 0) { bladeEnd(b, u); b.text(u.x, u.y - 62, '용검 종료', '#c8e8b0', 9); }
          else if (Math.random() < dt * 12) b.parts.push({ x: u.x + rand(-10, 10), y: u.y - rand(6, 40), vx: rand(-10, 10), vy: rand(-40, -15), life: 0.5, max: 0.5, color: GREEN, size: 2, glow: true }); } }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (!isGenji(u) || u.dead || u.hidden || !u.gj) continue; const G = u.gj, x = u.x + u.kx, y = u.y + u.ky - b.airZ(u) - 20;
        if (G.def > 0) { ctx.save(); const r = 15 + u.pad; ctx.strokeStyle = '#e8ffd0'; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
          for (let i = 0; i < 3; i++) { const a = b.time * 14 + i * TAU / 3; ctx.beginPath(); ctx.arc(x, y, r, a, a + 0.9); ctx.stroke(); }
          ctx.globalAlpha = 0.25; ctx.strokeStyle = GREEN; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke(); ctx.restore(); }
        if (G.blade > 0) { ctx.save(); // 초록 용 잔상: 몸을 감아 도는 마디 꼬리
          const n = 14, k = clamp((G.dragonT || 0) / 0.6, 0, 1), fade = Math.min(1, G.blade / 0.5);
          for (let i = 0; i < n; i++) { const t = b.time * 3.2 - i * 0.16, rr = (20 + u.pad) * (0.6 + 0.4 * k), px = x + Math.cos(t) * rr, py = y + 4 + Math.sin(t) * rr * 0.45 - i * 0.6;
            ctx.globalAlpha = fade * (0.7 - i * 0.045); ctx.fillStyle = i === 0 ? '#e8ffd0' : GREEN; const sz = i === 0 ? 4 : Math.max(1, 3 - i * 0.15); ctx.fillRect(Math.round(px - sz / 2), Math.round(py - sz / 2), Math.ceil(sz), Math.ceil(sz)); }
          ctx.restore(); } }
    },
  });

  CHARACTERS.push({
    id: ID, name: '겐지', fullName: '겐지 시마다', gender: 'male', color: '#9ae04a', weapon: 'ninjato',
    stats: { hp: 780, atk: 30, spd: 300, range: 56, atkRate: 1.0, def: 12, crit: 0.10, critMult: 2.0 },
    attack: { element: 'slash', delivery: 'melee' },
    skills: [
      { id: 'gjDeflect', name: '튕겨내기', cd: 8.5, dur: 1.1 },
      { id: 'gjBlade', name: '용검', cd: 38, dur: 6, ult: true },
      { id: 'gjClimb', name: '벽타기', cd: 4.5, h: 30, dur: 0.42 },
      { id: 'gjDash', name: '질풍참', cd: 6, mult: 1.6, len: 150, spd: 900, w: 30 },
      { id: 'gjFan', name: '세 갈래 표창', cd: 4, mult: 0.6, spread: 0.22 },
      { id: 'gjTriple', name: '표창 연속 던지기', cd: 3.2, mult: 0.55, n: 3, gap: 0.11, adj: 0.09 },
    ],
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 0.4, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '표창 연속 던지기': ['피할 수 있겠나?', '하나, 둘, 셋.'],
        '세 갈래 표창': ['어디로 피할 거지?', '빈틈이다.'],
        '튕겨내기': ['소용없다.', '돌려주마.'],
        '질풍참': ['느리군.', '베어 주마.'],
        '벽타기': ['이 정도 벽쯤이야.', '위로 간다.'],
        '용검': ['용의 검을 받아라!', '용이 나를 따른다!'],
      },
      event: {
        battleStart: ['수행의 성과를 보여 주지.', '{opp}, 각오해라.'],
        lowHp: ['아직… 끝나지 않았다.', '몸은 기계라도, 마음은 꺾이지 않는다.'],
        stunned: ['크윽, 시스템이…!'],
        win: ['수련이 부족했군.', '내 칼은 아직 날카롭다.'],
        lose: ['스승님… 죄송합니다.', '아직 갈 길이 멀다…'],
      },
    },
  });
})();
