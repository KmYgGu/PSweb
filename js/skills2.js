/* =========================================================
 * 무기 없는 캐릭터 추가 스킬: 궁수 백스텝, 마법사 텔레포트, 성직자 기도, 신비술사 액셀러레이트
 *  연출·구슬 이동은 전역 훅(STAGE_HOOKS, match=false)에서 처리. 사운드 없음.
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const L = b => b.sk2 || (b.sk2 = { orbs: [], fx: [] });
  const free = (b, x, y, pad) => { const q = b.clampPos(x, y, pad); return Math.abs(q.x - x) < 0.5 && Math.abs(q.y - y) < 0.5 && !b.blockAt(x, y - 4, 9 + pad); };

  // ---------- 궁수: 백스텝 ----------
  SKILLS.backStep = {
    desc: '현재 이동 방향의 정반대로 빠르게 뒤로 물러납니다 (장애물·벽 앞에서 멈춤).',
    canUse: (u, e, d) => d < 120 && !u.airborne && !u.blocked('blocksMove'),
    use(u, e, b, slot) {
      const a = (u.dir || 0) + Math.PI, D = slot.dist || 95;
      let k = D; // 벽/장애물 앞까지만
      for (let s = 6; s <= D; s += 6) { if (!free(b, u.x + Math.cos(a) * s, u.y + Math.sin(a) * s, u.pad)) { k = s - 6; break; } }
      const tx = u.x + Math.cos(a) * k, ty = u.y + Math.sin(a) * k;
      L(b).fx.push({ type: 'step', x: u.x, y: u.y, ang: a, t: 0, dur: 0.35 });
      b.dust(u.x, u.y); b.dust(u.x, u.y);
      u.action = { type: 'dash', t: 0, dur: slot.dashT || 0.2, sx: u.x, sy: u.y, tx, ty, touched: true };
      u.dir = fixAngle(a); // 물러난 뒤 그 방향으로 계속 이동
      b.stats.backSteps = (b.stats.backSteps || 0) + 1;
    },
  };

  // ---------- 마법사: 텔레포트 ----------
  function tpSpot(b, u, e) {
    const P = b.play || AR; let best = null;
    for (let i = 0; i < 60; i++) {
      const x = rand(P.x + 24, P.x + P.w - 24), y = rand(P.y + 40, P.y + P.h - 20);
      if (!free(b, x, y, u.pad + 4) || b.zoneAt(x, y)) continue; // 장애물·물 등 지형 위 제외
      if (b.sub && b.sub.S && b.sub.S.train) { const T = b.sub.S.train; if (y > T.y - 16 && y < T.y + T.h + 16) continue; } // 지하철 선로 제외
      if (b.race && b.race.board) { const T = b.race; if (((x - T.cx) / (T.board.rx + 20)) ** 2 + ((y - T.cy) / (T.board.ry + 20)) ** 2 < 1) continue; }
      if (b.tw && b.tw.T && b.tw.T.hatch) { const h = b.tw.T.hatch; if (x > h.x - 10 && x < h.x + h.w + 10 && y > h.y - 10 && y < h.y + h.h + 10) continue; } // 해치 위 제외
      const s = e ? Math.min(dist({ x, y }, e), 220) + rand(0, 40) : rand(0, 1); // 상대와 적당히 먼 곳 선호
      if (!best || s > best.s) best = { x, y, s };
    }
    return best;
  }
  SKILLS.teleport = {
    desc: '무작위 위치로 순간이동합니다 (장애물·물·위험 지형이 아닌, 걸을 수 있는 경기장 안쪽 지점).',
    canUse: (u, e, d) => (d < 90 || u.hp < u.maxHp * 0.45) && !u.status('pin') && !u.climb && !u.inTrain,
    use(u, e, b, slot) {
      const p = tpSpot(b, u, e); if (!p) { b.text(u.x, u.y - 60, '실패…', '#c8b8ff', 9); return; }
      const fx = L(b).fx, ox = u.x, oy = u.y;
      fx.push({ type: 'tpOut', x: ox, y: oy, t: 0, dur: 0.45 });
      b.fx.push({ type: 'after', x: ox, y: oy, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.35, a: 0.6 });
      u.x = p.x; u.y = p.y; u.action = null; u.push = null; u.kx = u.ky = 0; if (u.air && u.air.fling) u.air = null;
      u.mPrev = null;
      fx.push({ type: 'tpIn', x: u.x, y: u.y, t: 0, dur: 0.5 });
      b.ring(u.x, u.y, 4, 30, 0.35, '#b89cff'); b.sparks(u.x, u.y - 18, '#d8c8ff', 10, 120);
      b.stats.teleports = (b.stats.teleports || 0) + 1;
    },
  };

  // ---------- 성직자: 기도 ----------
  SKILLS.pray = {
    desc: '잠시(2초) 제자리에 멈춰 기도합니다. 기도하는 동안 모든 상태이상 저항 +40%, 스킬 쿨타임이 2.5배 빠르게 줄어듭니다.',
    canUse: (u, e, d, b) => (d > 110 || u.statuses.some(s => !(STATUS_DEFS[s.id] || {}).positive)) && u.skillT.some((t, i) => t > 2 && u.skills[i].id !== 'pray'),
    use(u, e, b, slot) {
      const dur = slot.dur || 2;
      u.buffs = u.buffs.filter(q => q.type !== 'prayer');
      const bf = { type: 'prayer', name: '기도', t: dur, statusResist: slot.resist ?? 0.4, cdRate: slot.cdRate || 2.5 };
      u.buffs.push(bf);
      const st = { type: 'pray', t: 0 };
      st.step = dt => { st.t += dt; u.moving = false; if (st.t >= dur || u.dead) { u.action = null; bf.t = 0; } };
      u.action = st; u.vx = u.vy = 0;
      b.glow(u.x, u.y - 24, 40, '#fff0a0', 0.5); b.ring(u.x, u.y, 4, 26, 0.4, '#ffe9a0');
      b.stats.prayers = (b.stats.prayers || 0) + 1;
    },
  };

  // ---------- 신비술사: 액셀러레이트 ----------
  SKILLS.accelerate = {
    desc: '서로 다른 3방향으로 매우 빠른 마법구를 던집니다. 마법구는 벽·장애물에 튕기고 (3번째 충돌에서 소멸), 마법구끼리 부딪히면 함께 소멸. 상대를 관통하며 지나갈 때마다 피해 + 독(도트), 적중할 때마다 신비술사의 다른 스킬 쿨타임 감소.',
    canUse: (u, e, d) => !e.dead && d < 260,
    use(u, e, b, slot) {
      const a0 = Math.atan2(e.y - u.y, e.x - u.x), sp = slot.spread || 0.75;
      for (const k of [-1, 0, 1]) {
        const a = a0 + k * sp;
        L(b).orbs.push({ u, slot, x: u.x + Math.cos(a) * 10, y: u.y + Math.sin(a) * 10, vx: Math.cos(a) * (slot.spd || 640), vy: Math.sin(a) * (slot.spd || 640), bounces: 0, t: 0, inside: new Set(), trail: [], born: b.time, dead: false });
      }
      b.glow(u.x, u.y - 20, 34, '#d890ff', 0.35); b.ring(u.x, u.y - 16, 4, 22, 0.25, '#e0b0ff');
    },
  };
  function killOrb(b, o, col) { o.dead = true; b.sparks(o.x, o.y - 14, col || '#e8c8ff', 10, 160); b.ring(o.x, o.y - 14, 2, 14, 0.25, '#d890ff'); }
  function orbStep(b, o, dt) {
    const S = o.slot, u = o.u; o.t += dt;
    if (u.dead || o.t > (S.life || 3)) { killOrb(b, o); return; }
    const n = Math.max(1, Math.ceil(Math.hypot(o.vx, o.vy) * dt / 6)), h = dt / n;
    for (let i = 0; i < n && !o.dead; i++) {
      const nx = o.x + o.vx * h, ny = o.y + o.vy * h;
      const q = b.clampPos(nx, ny, 6); let hit = false;
      if (Math.abs(q.x - nx) > 0.01) { o.vx = -o.vx; hit = true; }
      if (Math.abs(q.y - ny) > 0.01) { o.vy = -o.vy; hit = true; }
      if (!hit && b.blockAt(nx, ny - 4, 6)) { // 장애물: 축별 반사
        if (!b.blockAt(o.x, ny - 4, 6)) o.vx = -o.vx; else if (!b.blockAt(nx, o.y - 4, 6)) o.vy = -o.vy; else { o.vx = -o.vx; o.vy = -o.vy; }
        const bl = b.blockAt(nx, ny - 4, 6); if (bl) b.hitBuilding(bl, 4, false, nx, ny - 8);
        hit = true;
      }
      if (hit) { o.bounces++; b.sparks(o.x, o.y - 14, '#e0b8ff', 5, 120); if (o.bounces >= (S.bounces || 3)) { killOrb(b, o); return; } continue; }
      o.x = nx; o.y = ny;
      for (const f of b.foes(u)) { // 관통: 지나갈 때마다 1회
        const inR = !f.airborne && Math.hypot(f.x - o.x, f.y - o.y) < 12 + f.pad;
        if (inR && !o.inside.has(f)) {
          o.inside.add(f);
          const dmg = b.damage(u, f, u.st.atk * (S.mult || 0.35), { element: S.element || 'dark', delivery: 'ranged', viaProj: true, color: '#e0b0ff', applies: [{ status: 'poison', duration: S.dotDur || 2, chance: 1, power: S.dotPow || 4 }] });
          b.sparks(f.x, f.y - 18, '#d890ff', 8, 150);
          if (dmg > 0) for (let k = 0; k < u.skills.length; k++) if (u.skills[k].id !== 'accelerate') u.skillT[k] = Math.max(0, u.skillT[k] - (S.cdCut || 0.8));
          if (dmg > 0) b.text(u.x, u.y - 70, '쿨타임 -' + (S.cdCut || 0.8) + '초', '#e0c8ff', 8);
        } else if (!inR) o.inside.delete(f);
      }
    }
    o.trail.push([o.x, o.y]); if (o.trail.length > 7) o.trail.shift();
  }
  function px(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); }
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.sk2 = { orbs: [], fx: [] }; },
    step(b, dt) {
      const O = L(b);
      for (const o of O.orbs) if (!o.dead) orbStep(b, o, dt);
      // 마법구끼리 충돌 → 함께 소멸
      for (let i = 0; i < O.orbs.length; i++) for (let j = i + 1; j < O.orbs.length; j++) {
        const a = O.orbs[i], c = O.orbs[j]; if (a.dead || c.dead || b.time - Math.max(a.born, c.born) < 0.12) continue;
        if (Math.hypot(a.x - c.x, a.y - c.y) < 11) { killOrb(b, a, '#ffffff'); killOrb(b, c, '#ffffff'); b.shock((a.x + c.x) / 2, (a.y + c.y) / 2 - 14, 4, 24, '#f0d8ff', 0.3, 3); }
      }
      O.orbs = O.orbs.filter(o => !o.dead);
      for (const f of O.fx) f.t += dt; O.fx = O.fx.filter(f => f.t < f.dur);
      for (const u of b.u) if (u.action && u.action.type === 'pray' && Math.random() < dt * 14) b.parts.push({ x: u.x + rand(-12, 12), y: u.y - rand(0, 10), vx: 0, vy: rand(-60, -30), life: 0.7, max: 0.7, color: Math.random() < 0.5 ? '#fff4b0' : '#ffffff', size: 2, glow: true });
    },
    drawOver(ctx, b) {
      const O = b.sk2; if (!O) return;
      ctx.save();
      for (const f of O.fx) {
        const p = f.t / f.dur;
        if (f.type === 'step') { // 백스텝: 바닥 화살표 잔상
          ctx.globalAlpha = 0.7 * (1 - p); ctx.fillStyle = '#bff0a8';
          for (let i = 0; i < 4; i++) { const d = 8 + i * 10 + p * 20; px(ctx, f.x + Math.cos(f.ang) * d, f.y + Math.sin(f.ang) * d * 0.6, 3, i % 2 ? '#e8ffd8' : '#8fd47a'); }
        } else if (f.type === 'tpOut' || f.type === 'tpIn') { // 텔레포트: 픽셀 기둥 + 룬 원
          const k = f.type === 'tpIn' ? 1 - p : p, a = 1 - p;
          ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#b89cff'; ctx.fillRect(Math.round(f.x - 7 + k * 4), Math.round(f.y - 50), Math.round(14 - k * 8), 50);
          ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - 50), 2, 50);
          for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + b.time * 3; px(ctx, f.x + Math.cos(an) * (16 + k * 6), f.y + Math.sin(an) * (6 + k * 2), 2, i % 2 ? '#e8dcff' : '#8f6ae0'); }
          for (let i = 0; i < 5; i++) px(ctx, f.x + Math.sin(i * 7.3 + f.t * 9) * 10, f.y - 10 - ((i * 13 + f.t * 90) % 46), 2, '#f0e8ff');
        }
      }
      for (const u of b.u) if (u.action && u.action.type === 'pray' && !u.dead) { // 기도: 머리 위 후광 + 발밑 빛 원
        const z = b.airZ(u), y = u.y - z;
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(b.time * 8); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(u.x, u.y, 20, 7, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(u.x, y - 48 - u.pad, 9, 3, 0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) { const an = i * TAU / 6 + b.time * 2; px(ctx, u.x + Math.cos(an) * 22, u.y + Math.sin(an) * 8, 2, '#fff8d0'); }
      }
      for (const o of O.orbs) { // 마법구: 꼬리 + 픽셀 구슬
        for (let i = 0; i < o.trail.length; i++) { ctx.globalAlpha = (i + 1) / o.trail.length * 0.5; px(ctx, o.trail[i][0], o.trail[i][1] - 14, 2 + Math.floor(i / 2), '#b070e0'); }
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#d890ff'; ctx.beginPath(); ctx.arc(o.x, o.y - 14, 8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; px(ctx, o.x, o.y - 14, 7, '#9a4ad8'); px(ctx, o.x, o.y - 14, 5, '#e0b0ff'); px(ctx, o.x - 1, o.y - 15, 2, '#ffffff');
      }
      ctx.restore(); ctx.globalAlpha = 1;
    },
  });
})();
