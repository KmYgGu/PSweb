/* =========================================================
 * 루델리안 블러드 체폐슈 (사용자 소설) — 흡혈귀 마검사/마법사
 *  1. 헬 인페르노   : 시전 순간 상대 위치(고정 지점)로 세 방향 지옥불이 회전하며 수렴. 멀수록 크고 강함
 *  2. 다크 패럴     : 논타겟 다크 볼(어둠+화염) 3연발, 매우 빠르게 출발해 점점 느려짐. 볼 주위 섬광 원이 근처 적을 약하게 끌어당김
 *  5. 헬 파이어     : 몸이 분해되며 순간이동 → 붉은 오라 속에서 재구성 → 상대를 향해 화염구 직렬(한 줄) 일제 발사
 *  3. 블러드 엣지   : (패시브) 근접 공격이 방어력 무시, 무시한 만큼(추가로 얻은 피해) 자기 체력 차감
 *  4. 딥 블러드 아이 섀도우 : 눈에서 직선 혈사포 광선으로 시계/반시계(무작위) 방향 360° 회전 소사
 *  난수는 전부 Math.random (전투 중에는 리플레이용 시드 난수로 교체됨)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, ID = 'rudelian';
  const IMG = 'assets/Rudelian/';

  // ---------- 1. 헬 인페르노 ----------
  SKILLS.hellInferno = {
    desc: '시전 순간 상대가 있던 지점을 중심으로, 세 방향에서 거대한 지옥불이 회전하며 그 지점으로 모여듭니다(추적 없음). 처음엔 매우 크고 강하지만 지점에 가까워질수록 작고 약해집니다 — 많이 움직이는 상대일수록 큰 불에 맞기 쉽습니다.',
    canUse: (u, e, d) => d < 320,
    use(u, e, b, slot) {
      const P = { x: e.x, y: e.y }, S = slot;
      b.telegraphCircle(P.x, P.y, S.R0, S.wind + 0.3, '#ff5a3a');
      b.glow(u.x, u.y - 30, 30, '#ff4a2a', 0.5);
      b.windup(u, S.wind, () => {
        const a0 = Math.random() * TAU, dir = Math.random() < 0.5 ? 1 : -1;
        const L = b.rdFlames || (b.rdFlames = []);
        for (let k = 0; k < 3; k++) L.push({ src: u, slot: S, cx: P.x, cy: P.y, a: a0 + k * TAU / 3, dir, t: 0, hit: new Set(), hitB: new Set() });
        b.shock(P.x, P.y, 10, S.R0, '#ff6a3a', 0.5, 5); b.shake(1.5);
      });
    },
  };
  function flameStep(b, F, dt) {
    const S = F.slot; F.t += dt; const k = Math.max(0, 1 - F.t / S.dur); // k: 1(바깥, 크고 강함) → 0(중심, 작고 약함)
    F.a += F.dir * S.spin * dt * (1.4 - 0.4 * k); // 회전하며 안으로 (안쪽일수록 조금 빨리 돎)
    F.r = S.R0 * k; F.x = F.cx + Math.cos(F.a) * F.r; F.y = F.cy + Math.sin(F.a) * F.r * 0.75;
    F.size = S.s1 + (S.s0 - S.s1) * k;
    if (Math.random() < 0.8) b.parts.push({ x: F.x + rand(-F.size, F.size) * 0.6, y: F.y - rand(4, F.size * 1.4), vx: rand(-20, 20), vy: rand(-80, -30), life: 0.45, max: 0.45, color: ['#ff3a1a', '#ff8a2a', '#ffd04a'][Math.floor(Math.random() * 3)], size: 2 + 3 * k, glow: true });
    const u = F.src;
    for (const o of b.u) {
      if (o.dead || o.team === u.team || o.hidden || F.hit.has(o)) continue;
      if (Math.hypot(o.x - F.x, (o.y - F.y) / 0.75) > F.size + o.pad * 0.5 || b.airZ(o) > F.size * 1.6) continue;
      F.hit.add(o);
      b.damage(u, o, u.st.atk * (S.m1 + (S.m0 - S.m1) * k), { element: 'fire', delivery: 'ranged', big: k > 0.5, color: '#ff8a5a', piercesBarrier: true });
      b.burst(o.x, o.y - 18, '#ff6a2a', 6 + 8 * k);
    }
    for (const bl of b.buildings || []) if (!bl.dead && !F.hitB.has(bl) && b.blockAt(F.x, F.y)) { F.hitB.add(bl); b.hitBuilding(bl, u.st.atk * 2 * k, true, F.x, F.y); }
    return F.t < S.dur;
  }
  function drawFlame(ctx, b, F) {
    const s = F.size, x = Math.round(F.x), y = Math.round(F.y), fl = 0.85 + 0.15 * Math.sin(b.time * 30 + F.a * 5);
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, -s * 0.5, 1, 0, -s * 0.5, s * 1.5); g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(0.35, 'rgba(255,120,30,0.85)'); g.addColorStop(0.75, 'rgba(180,20,10,0.55)'); g.addColorStop(1, 'rgba(80,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -s * 0.5, s * 1.2, s * 1.5 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,90,20,0.8)'; for (let i = 0; i < 5; i++) { const ox = Math.sin(b.time * 9 + i * 1.7 + F.a) * s * 0.5; ctx.beginPath(); ctx.moveTo(ox - s * 0.25, -s * 0.2); ctx.lineTo(ox, -s * (1.5 + 0.5 * Math.sin(b.time * 14 + i)) ); ctx.lineTo(ox + s * 0.25, -s * 0.2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,230,140,0.9)'; ctx.beginPath(); ctx.ellipse(0, -s * 0.35, s * 0.4, s * 0.55, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#300000'; ctx.beginPath(); ctx.ellipse(0, 2, s, s * 0.35, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- 2. 다크 패럴 ----------
  SKILLS.darkParallel = {
    desc: '볼 주위의 큰 섬광 원이 근처 적을 약하게 끌어당깁니다. 처음엔 매우 빠르다가 점점 느려지는 다크 볼(어둠+화염 이중 속성)을 논타겟으로 3연속 발사합니다(발사 순간의 상대 위치를 향함, 유도 없음).',
    canUse: (u, e, d) => d > 50 && d < 300,
    use(u, e, b, slot) {
      b.glow(u.x + u.facing * 10, u.y - 22, 26, '#8a3aff', 0.3);
      b.windup(u, 0.18, () => {
        for (let i = 0; i < slot.n; i++) b.later(i * slot.gap, () => {
          if (u.dead || b.over) return; const t = b.enemy(u); if (!t || t.dead) return;
          const a = Math.atan2(t.y - 18 - (u.y - 22), t.x - u.x);
          b.shoot(u, { angle: a, spd: slot.v0, dmg: u.st.atk * slot.mult, kind: 'rdFire', hit: { element: 'dark', element2: 'fire', delivery: 'ranged', color: '#c08aff' } });
          const p = b.proj[b.proj.length - 1]; Object.assign(p, { y: u.y - 22, rdDecel: slot.decel, rdMin: slot.vMin, rdPullR: slot.pullR, rdPull: slot.pull, life: slot.life, r: 10, noAirLock: false, draw: drawFireball });
          b.ring(u.x + Math.cos(a) * 12, u.y - 22 + Math.sin(a) * 12, 3, 14, 0.2, '#b06aff');
        });
      });
    },
  };
  function drawFireball(ctx, p, glowAt) { // 다크 볼: 검보라 구체 + 화염 테두리
    const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(p.vy, p.vx), tl = Math.min(26, 6 + sp * 0.03);
    ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    glowAt(ctx, 0, 0, 16, '#7a2aff', 0.4);
    ctx.fillStyle = 'rgba(255,90,30,0.5)'; ctx.beginPath(); ctx.moveTo(-tl, 0); ctx.lineTo(0, -6); ctx.lineTo(0, 6); ctx.fill();
    ctx.fillStyle = 'rgba(90,20,140,0.6)'; ctx.beginPath(); ctx.moveTo(-tl * 0.7, 0); ctx.lineTo(0, -4); ctx.lineTo(0, 4); ctx.fill();
    ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a1060'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0e0418'; ctx.beginPath(); ctx.arc(0.5, 0, 3.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c08aff'; ctx.fillRect(-3, -4, 2, 2);
  }

  // ---------- 5. 헬 파이어 (순간이동 + 화염구 직렬) ----------
  function pickSpot(b, u, e, S) { // 상대에게서 중거리, 벽/장애물 밖, 현재 상대-루델리안 직선에서 벗어난 곳 (시드 난수)
    const line = Math.atan2(u.y - e.y, u.x - e.x); let best = null;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, d = S.dMin + Math.random() * (S.dMax - S.dMin);
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      if (x < AR.x + 22 || x > AR.x + AR.w - 22 || y < AR.y + 40 || y > AR.y + AR.h - 14) continue;
      if (b.blockAt(x, y - 4, 16)) continue;
      const off = Math.abs(Math.atan2(Math.sin(a - line), Math.cos(a - line)));
      if (!best || (off > 0.7 && best.off <= 0.7)) best = { x, y, off };
      if (off > 0.7) break;
    }
    return best;
  }
  function dissolve(b, u, col, n, inward) {
    for (let i = 0; i < n; i++) { const ox = rand(-8, 8), oy = rand(-44, 0);
      b.parts.push(inward ? { x: u.x + ox * 3, y: u.y + oy - 10 + rand(-10, 10), vx: -ox * 6, vy: -10 * 3, life: 0.3, max: 0.3, color: col[i % col.length], size: 2 }
        : { x: u.x + ox, y: u.y + oy, vx: rand(-40, 40), vy: rand(-90, -20), life: 0.55, max: 0.55, color: col[i % col.length], size: 2 }); }
  }
  SKILLS.hellFire = {
    desc: '몸이 분해되며 사라져(무적) 상대와 중거리의 다른 곳으로 순간이동합니다. 붉은 오라 속에서 몸이 다시 나타나고, 상대를 향해 화염구를 가로 한 줄(나란히)로 일제히 발사합니다(유도 없음).',
    canUse: (u, e, d) => d < 340,
    use(u, e, b, slot) {
      const S = slot, dest = pickSpot(b, u, e, S) || { x: u.x, y: u.y };
      dissolve(b, u, ['#9a1a32', '#1e1a24', '#ff5a6a', '#f4e4e0'], 26, false); b.glow(u.x, u.y - 22, 24, '#ff2a3a', 0.4);
      u.action = { type: 'wind', t: S.out + S.gap + S.aura + 0.25, next: null };
      u.rdPhase = true;
      b.later(S.out * 0.5, () => { if (!u.dead) u.hidden = true; });
      b.later(S.out + S.gap, () => { if (u.dead || b.over) return; u.x = dest.x; u.y = dest.y; u.vx = u.vy = 0; u.rdAura = { t: 0, dur: S.aura }; });
      b.later(S.out + S.gap + S.aura, () => {
        u.rdAura = null; if (u.dead || b.over) { u.hidden = false; u.rdPhase = false; return; }
        u.hidden = false; u.rdPhase = false; dissolve(b, u, ['#ff3a4a', '#ffb0b8', '#9a1a32'], 18, true); b.shock(u.x, u.y - 20, 6, 34, '#ff3a4a', 0.35, 3);
        b.later(0.15, () => {
          if (u.dead || b.over) return; const t = b.enemy(u); if (!t || t.dead) return;
          const a = Math.atan2(t.y - 18 - (u.y - 24), t.x - u.x); u.facing = Math.cos(a) >= 0 ? 1 : -1;
          for (let i = 0; i < S.n; i++) {
            b.shoot(u, { angle: a, spd: S.spd, dmg: u.st.atk * S.mult, kind: 'rdHF', hit: { element: 'fire', delivery: 'ranged', color: '#ffae6b' } });
            const off = (i - (S.n - 1) / 2) * S.space; // 발사 방향에 수직으로 가로 한 줄
            Object.assign(b.proj[b.proj.length - 1], { x: u.x + Math.cos(a) * 12 - Math.sin(a) * off, y: u.y - 24 + Math.sin(a) * 12 + Math.cos(a) * off, life: S.life, r: 8, draw: drawHF });
          }
          b.ring(u.x + Math.cos(a) * 12, u.y - 24 + Math.sin(a) * 12, 4, 18, 0.25, '#ffb05a');
        });
      });
    },
  };
  function drawHF(ctx, p, glowAt) {
    const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    glowAt(ctx, 0, 0, 13, '#ff6a2a', 0.45);
    ctx.fillStyle = 'rgba(220,40,10,0.55)'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5); ctx.fill();
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(1, 0, 3, 0, TAU); ctx.fill();
  }
  function drawAura(ctx, b, u) {
    const A = u.rdAura, q = Math.min(1, A.t / A.dur), x = Math.round(u.x), y = Math.round(u.y);
    ctx.save(); ctx.globalAlpha = 0.25 + 0.45 * q; ctx.fillStyle = '#c0101e';
    ctx.beginPath(); ctx.ellipse(x, y, 10 + 10 * q, 4 + 4 * q, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(0, y - 56, 0, y); g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, 'rgba(255,40,60,0.75)');
    ctx.fillStyle = g; ctx.fillRect(x - 8 - 6 * q, y - 56 * q, 16 + 12 * q, 56 * q);
    ctx.fillStyle = '#ff8a9a'; for (let i = 0; i < 6; i++) { const ph = (b.time * 2.2 + i / 6) % 1; ctx.fillRect(x + Math.round(Math.sin(i * 2.1) * 10), Math.round(y - ph * 50), 2, 3); }
    ctx.restore();
  }

  // ---------- 4. 딥 블러드 아이 섀도우 ----------
  SKILLS.deepBloodEye = {
    desc: '두 눈에서 직선 혈사포 광선을 뿜으며 시계 또는 반시계 방향(시전마다 무작위)으로 빠르게 전 방위를 휩씁니다. 광선은 벽·장애물에 막히고, 닿은 대상에게 짧은 간격으로 피해를 줍니다.',
    canUse: (u, e, d) => d < 260,
    use(u, e, b, slot) {
      const S = slot, dir = Math.random() < 0.5 ? 1 : -1, a0 = Math.atan2(e.y - u.y, e.x - u.x) - dir * 0.9; // 상대 쪽 조금 앞에서 시작
      b.glow(u.x, u.y - 40, 22, '#ff2a3a', 0.35); b.text(u.x, u.y - 70, dir > 0 ? '↻' : '↺', '#ff5a6a', 12);
      b.windup(u, S.wind, () => {
        u.action = { type: 'wind', t: S.dur + 0.05, next: null }; // 난사 중 제자리
        u.rdEye = { t: 0, dur: S.dur, a0, a: a0, dir, slot: S, hitT: new Map() };
      });
    },
  };
  // 직선 광선: 눈높이에서 수평으로 뻗고, 벽/장애물에서 멈춤. 대상마다 tick 간격으로 피해
  function beamEnd(b, u, a, max) {
    const c = Math.cos(a), s = Math.sin(a); let L = 0;
    for (; L < max; L += 5) { const x = u.x + c * L, y = u.y + s * L;
      if (x < AR.x || x > AR.x + AR.w || y < AR.y || y > AR.y + AR.h) break;
      const bl = L > 10 && b.blockAt(x, y - 4); if (bl) return { L, bl }; }
    return { L, bl: null };
  }
  function eyeStep(b, u, dt) {
    const E = u.rdEye; E.t += dt; const S = E.slot;
    E.a = E.a0 + E.dir * S.turns * TAU * Math.min(1, E.t / E.dur);
    u.facing = Math.cos(E.a) >= 0 ? 1 : -1;
    const c = Math.cos(E.a), s = Math.sin(E.a), R = beamEnd(b, u, E.a, S.len); E.L = R.L;
    if (R.bl && (E.bt = (E.bt || 0) - dt) <= 0) { E.bt = 0.25; b.hitBuilding(R.bl, u.st.atk * 0.5, false, u.x + c * R.L, u.y + s * R.L); }
    for (const o of b.u) {
      if (o.dead || o.team === u.team || o.hidden) continue;
      const dx = o.x - u.x, dy = o.y - u.y, t = dx * c + dy * s;
      if (t < 0 || t > R.L + o.pad) continue;
      if (Math.abs(-dx * s + dy * c) > S.width + o.pad || b.airZ(o) > 60) continue;
      if ((E.hitT.get(o) || -9) > E.t - S.tick) continue;
      E.hitT.set(o, E.t);
      b.damage(u, o, u.st.atk * S.mult, { element: 'dark', delivery: 'ranged', color: '#ff5a6a' });
      b.sparks(o.x, o.y - 20, '#ff3a4a', 5);
    }
    if (E.t >= E.dur || u.dead) u.rdEye = null;
  }
  function drawBeam(ctx, b, u) {
    const E = u.rdEye; if (E.L == null) return;
    const c = Math.cos(E.a), s = Math.sin(E.a), px = -s, py = c, fl = 0.8 + 0.2 * Math.sin(b.time * 60);
    ctx.save(); ctx.lineCap = 'round';
    for (const k of [-3, 3]) { const x0 = u.x + px * k, y0 = u.y - 40 + py * k * 0.5, x1 = x0 + c * E.L, y1 = y0 + s * E.L;
      ctx.globalAlpha = 0.35 * fl; ctx.strokeStyle = '#ff1a2a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d0102a'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#ffc0c8'; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 0.8 * fl; ctx.fillStyle = '#ff6a7a'; ctx.beginPath(); ctx.arc(x1, y1, 4, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ---------- 3. 블러드 엣지 (패시브) ----------
  const oDamage = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amount, o = {}) {
    if (tgt && tgt.rdPhase) return 0; // 헬 파이어 분해·이동 중 무적
    if (!src || src.def.id !== ID || o.delivery !== 'melee' || o.dot || o.fixed || o.reflected || src === tgt || !tgt.st || !(tgt.st.def > 0)) return oDamage.call(this, src, tgt, amount, o);
    const r = oDamage.call(this, src, tgt, amount, { ...o, pierce: 1, color: '#ff7a8a' });
    if (r > 0 && !src.dead) {
      const extra = Math.round(r - r * 100 / (100 + tgt.st.def)); // 방어 무시로 더 들어간 만큼
      if (extra > 0) { src.hp = Math.max(1, src.hp - extra); this.text(src.x + rand(-6, 6), src.y - 46, '-' + extra, '#ff3a4a', 9);
        for (let i = 0; i < 4; i++) this.parts.push({ x: src.x + rand(-5, 5), y: src.y - 30, vx: rand(-30, 30), vy: rand(-60, -10), g: 220, life: 0.5, max: 0.5, color: '#c0101e', size: 2 }); }
    }
    return r;
  };

  // ---------- 공용 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.rdFlames && b.rdFlames.length) b.rdFlames = b.rdFlames.filter(F => !b.over && flameStep(b, F, dt));
      for (const p of b.proj) if (p.rdDecel) { const sp = Math.hypot(p.vx, p.vy); if (sp > p.rdMin) { const k = Math.max(p.rdMin / sp, Math.exp(-p.rdDecel * dt)); p.vx *= k; p.vy *= k; } }
      for (const u of b.u) { if (u.rdEye) eyeStep(b, u, dt); if (u.rdAura) u.rdAura.t += dt; }
      for (const p of b.proj) if (p.rdPullR) for (const o of b.u) { // 다크 패럴 섬광 원: 약한 끌어당김 (적 본체·소환수)
        if (o.dead || o.hidden || o.team === p.src.team || o.def.noDraw || b.airZ(o) > 20) continue;
        const dx = p.x - o.x, dy = (p.y + 22) - o.y, d = Math.hypot(dx, dy);
        if (d > p.rdPullR || d < 6) continue;
        const f = p.rdPull * (1 - d / p.rdPullR * 0.5) * dt, q = b.clampPos(o.x + dx / d * f, o.y + dy / d * f, 0, o);
        o.x = q.x; o.y = q.y; b.resolveBuildings(o);
      }
    },
    drawOver(ctx, b) {
      for (const F of b.rdFlames || []) drawFlame(ctx, b, F);
      for (const u of b.u) if (u.rdAura) drawAura(ctx, b, u);
      for (const p of b.proj) if (p.rdPullR) { const ph = (b.time * 3 + (p.r * 7 % 1)) % 1, fl = 0.5 + 0.5 * Math.sin(b.time * 22); ctx.save(); // 섬광 원
        ctx.globalAlpha = 0.18 + 0.3 * fl; ctx.strokeStyle = '#b06aff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.rdPullR * 0.95, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.08 + 0.12 * fl; ctx.fillStyle = '#7a2aff'; ctx.fill();
        ctx.globalAlpha = 0.5 * (1 - ph); ctx.strokeStyle = '#ffd0ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.rdPullR * (1 - ph * 0.8), 0, TAU); ctx.stroke(); ctx.restore(); }
      for (const u of b.u) if (u.rdEye && !u.dead) { drawBeam(ctx, b, u); ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(b.time * 40); ctx.fillStyle = '#ff2a3a'; ctx.fillRect(Math.round(u.x) - 5, Math.round(u.y) - 42, 3, 2); ctx.fillRect(Math.round(u.x) + 2, Math.round(u.y) - 42, 3, 2); ctx.restore(); }
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: ID, name: '루델리안', fullName: '루델리안 블러드 체폐슈', gender: 'female', color: '#9a1a32',
    stats: { hp: 680, atk: 26, spd: 300, range: 60, atkRate: 0.85, def: 10, crit: 0.03, critMult: 1.5 },
    attack: { element: 'dark', delivery: 'melee' },
    resist: { fire: 0.8, dark: 0.8, light: 1.25 },
    skills: [
      { id: 'hellInferno', name: '헬 인페르노', cd: 11, wind: 0.35, R0: 150, dur: 1.3, spin: 3.6, s0: 48, s1: 10, m0: 3.0, m1: 0.6, element: 'fire', delivery: 'ranged' },
      { id: 'darkParallel', name: '다크 패럴', cd: 6, n: 3, gap: 0.2, v0: 760, vMin: 110, decel: 2.4, life: 1.8, mult: 1.0, pullR: 60, pull: 55, element: 'dark', element2: 'fire', delivery: 'ranged' },
      { id: 'hellFire', name: '헬 파이어', cd: 10, out: 0.35, gap: 0.2, aura: 0.4, dMin: 140, dMax: 200, n: 5, space: 18, spd: 430, life: 1.4, mult: 0.75, element: 'fire', delivery: 'ranged' },
      { id: 'deepBloodEye', name: '딥 블러드 아이 섀도우', cd: 13, wind: 0.3, dur: 0.8, turns: 1.5, len: 320, width: 10, tick: 0.1, mult: 0.9, element: 'dark', delivery: 'ranged' },
    ],
    // 패시브 블러드 엣지: js/rudelian.js (근접 공격 방어 무시 + 무시한 만큼 자기 체력 차감)
    weapon: 'demonSword', // 블러드 엣지 마검 휘두르기 (game.js WEAPONS)
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 3, foot: 1 },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '헬 인페르노': ['지옥의 불길이여, 그곳으로 모여라.', '도망칠수록 더 뜨거울 거예요.', '그 자리, 기억해 두었답니다.'],
        '다크 패럴': ['어둠 세 송이를 드리죠.', '이리 오세요. 조금만 더.', '천천히, 그러나 확실하게.'],
        '헬 파이어': ['여기예요.', '흩어졌다가… 다시.', '한 줄로 받아 주시겠어요?'],
        '딥 블러드 아이 섀도우': ['제 눈을 보지 마세요.', '피의 시선에서 벗어날 수 있을까요.', '사방이 저의 사정거리랍니다.'],
      },
      event: {
        battleStart: ['블러드 체폐슈 가의 이름으로.', '{opp}, 예의는 갖추고 덤비시길.', '오래 걸리지 않을 거예요.'],
        lowHp: ['…피가, 조금 모자라네요.', '아직 품위를 잃을 정도는 아니에요.'],
        healed: ['고마워요. 잊지 않겠어요.'],
        stunned: ['무례하군요…'],
        knockedDown: ['흙먼지가 묻었네요.'],
        win: ['우아하게 끝났네요.', '피 한 방울도 아깝지 않았어요.', '이제 돌아가 쉬어야겠어요.'],
        lose: ['반드시……반드시……꼭 돌아올게.'],
      },
    },
  });
})();
