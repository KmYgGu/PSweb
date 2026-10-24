/* =========================================================
 * 루델리안 블러드 체폐슜 (사용자 소설) — 흡혈귀 마검사/마법사
 *  1. 헬 인페르노   : 시전 순간 상대 위치(고정 지점)로 세 방향 지옥불이 회전하며 수렴. 멀수록 크고 강함
 *  2. 헬 파이어     : 논타겟 화염구 3연발, 매우 빠르게 출발해 점점 느려짐
 *  3. 블러드 엣지   : (패시브) 근접 공격이 방어력 무시, 무시한 만큼(추가로 얻은 피해) 자기 체력 차감
 *  4. 딥 블러드 아이 섀도우 : 눈에서 혈사포를 시계/반시계(시전마다 무작위) 방향으로 빠르게 360° 난사
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

  // ---------- 2. 헬 파이어 ----------
  SKILLS.hellFire = {
    desc: '처음엔 매우 빠르다가 점점 느려지는 화염구를 논타겟으로 3연속 발사합니다(발사 순간의 상대 위치를 향함, 유도 없음).',
    canUse: (u, e, d) => d > 50 && d < 300,
    use(u, e, b, slot) {
      b.glow(u.x + u.facing * 10, u.y - 22, 26, '#ff6a2a', 0.3);
      b.windup(u, 0.18, () => {
        for (let i = 0; i < slot.n; i++) b.later(i * slot.gap, () => {
          if (u.dead || b.over) return; const t = b.enemy(u); if (!t || t.dead) return;
          const a = Math.atan2(t.y - 18 - (u.y - 22), t.x - u.x);
          b.shoot(u, { angle: a, spd: slot.v0, dmg: u.st.atk * slot.mult, kind: 'rdFire', hit: { element: 'fire', delivery: 'ranged', color: '#ff9a5a' } });
          const p = b.proj[b.proj.length - 1]; Object.assign(p, { y: u.y - 22, rdDecel: slot.decel, rdMin: slot.vMin, life: slot.life, r: 10, noAirLock: false, draw: drawFireball });
          b.ring(u.x + Math.cos(a) * 12, u.y - 22 + Math.sin(a) * 12, 3, 14, 0.2, '#ffb05a');
        });
      });
    },
  };
  function drawFireball(ctx, p, glowAt) {
    const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(p.vy, p.vx), tl = Math.min(26, 6 + sp * 0.03);
    ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    glowAt(ctx, 0, 0, 16, '#ff6a2a', 0.45);
    ctx.fillStyle = 'rgba(200,30,10,0.55)'; ctx.beginPath(); ctx.moveTo(-tl, 0); ctx.lineTo(0, -6); ctx.lineTo(0, 6); ctx.fill();
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(1, 0, 3.5, 0, TAU); ctx.fill();
  }

  // ---------- 4. 딥 블러드 아이 섀도우 ----------
  SKILLS.deepBloodEye = {
    desc: '두 눈에서 혈사포를 빠르게 연사하며 시계 방향 또는 반시계 방향(시전마다 무작위)으로 전 방위를 휩씁니다. 혈사포는 각각 피할 수 있고 장애물에 막힙니다.',
    canUse: (u, e, d) => d < 260,
    use(u, e, b, slot) {
      const S = slot, dir = Math.random() < 0.5 ? 1 : -1, a0 = Math.atan2(e.y - u.y, e.x - u.x) - dir * 0.9; // 상대 쪽 조금 앞에서 시작
      b.glow(u.x, u.y - 40, 22, '#ff2a3a', 0.35); b.text(u.x, u.y - 70, dir > 0 ? '↻' : '↺', '#ff5a6a', 12);
      b.windup(u, S.wind, () => {
        u.action = { type: 'wind', t: S.dur + 0.05, next: null }; // 난사 중 제자리
        u.rdEye = { t: 0, dur: S.dur, a0, dir, n: 0, slot: S };
      });
    },
  };
  function eyeStep(b, u, dt) {
    const E = u.rdEye; E.t += dt; const S = E.slot;
    const want = Math.min(S.shots, Math.floor(E.t / E.dur * S.shots));
    while (E.n < want) {
      const a = E.a0 + E.dir * TAU * (E.n / S.shots); E.n++;
      b.shoot(u, { angle: a, spd: S.spd, dmg: u.st.atk * S.mult, kind: 'rdBlood', hit: { element: 'dark', delivery: 'ranged', color: '#ff5a6a' } });
      Object.assign(b.proj[b.proj.length - 1], { x: u.x + Math.cos(a) * 8, y: u.y - 40 + Math.sin(a) * 5, life: 0.9, r: 7, draw: drawBlood, noAirLock: true });
      u.facing = Math.cos(a) >= 0 ? 1 : -1;
    }
    if (E.t >= E.dur || u.dead) u.rdEye = null;
  }
  function drawBlood(ctx, p, glowAt) {
    const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    glowAt(ctx, 0, 0, 10, '#ff2a3a', 0.35);
    for (const oy of [-3, 3]) { ctx.fillStyle = '#d0102a'; ctx.fillRect(-14, oy - 1, 18, 2); ctx.fillStyle = '#ff9aa8'; ctx.fillRect(0, oy - 1, 4, 2); } // 두 눈 → 쌍줄기
  }

  // ---------- 3. 블러드 엣지 (패시브) ----------
  const oDamage = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amount, o = {}) {
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
      for (const u of b.u) if (u.rdEye) eyeStep(b, u, dt);
    },
    drawOver(ctx, b) {
      for (const F of b.rdFlames || []) drawFlame(ctx, b, F);
      for (const u of b.u) if (u.rdEye && !u.dead) { ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(b.time * 40); ctx.fillStyle = '#ff2a3a'; ctx.fillRect(Math.round(u.x) - 5, Math.round(u.y) - 42, 3, 2); ctx.fillRect(Math.round(u.x) + 2, Math.round(u.y) - 42, 3, 2); ctx.restore(); }
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: ID, name: '루델리안', fullName: '루델리안 블러드 체폐슜', gender: 'female', color: '#9a1a32',
    stats: { hp: 680, atk: 26, spd: 300, range: 60, atkRate: 0.85, def: 10, crit: 0.08 },
    attack: { element: 'dark', delivery: 'melee' },
    resist: { fire: 0.8, dark: 0.8, light: 1.25 },
    skills: [
      { id: 'hellInferno', name: '헬 인페르노', cd: 11, wind: 0.35, R0: 150, dur: 1.6, spin: 2.4, s0: 34, s1: 7, m0: 3.0, m1: 0.6, element: 'fire', delivery: 'ranged' },
      { id: 'hellFire', name: '헬 파이어', cd: 6, n: 3, gap: 0.2, v0: 760, vMin: 110, decel: 2.4, life: 1.8, mult: 1.0, element: 'fire', delivery: 'ranged' },
      { id: 'deepBloodEye', name: '딥 블러드 아이 섀도우', cd: 13, wind: 0.3, dur: 0.9, shots: 36, spd: 480, mult: 0.42, element: 'dark', delivery: 'ranged' },
    ],
    // 패시브 블러드 엣지: js/rudelian.js (근접 공격 방어 무시 + 무시한 만큼 자기 체력 차감)
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 0.5, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '헬 인페르노': ['지옥의 불길이여, 그곳으로 모여라.', '도망칠수록 더 뜨거울 거예요.', '그 자리, 기억해 두었답니다.'],
        '헬 파이어': ['불꽃 세 송이를 드리죠.', '받아 주시겠어요?', '천천히, 그러나 확실하게.'],
        '딥 블러드 아이 섀도우': ['제 눈을 보지 마세요.', '피의 시선에서 벗어날 수 있을까요.', '사방이 저의 사정거리랍니다.'],
      },
      event: {
        battleStart: ['블러드 체폐슜 가의 이름으로.', '{opp}, 예의는 갖추고 덤비시길.', '오래 걸리지 않을 거예요.'],
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
