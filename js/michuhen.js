/* =========================================================
 * 미츄헨 데슈타프 (사용자 소설) — 도끼 + 권총 + 전자기 팔찌. 항상 남은 총알 수를 생각하며 싸움 (머리 위 탄창 UI)
 *  1. 히트호크 도끼 투척 : 상대 방향으로 비유도 투척 (베기). 멈춘 자리에 떨어져 있음. 손에 없으면 도끼 근접 공격 불가
 *  2. 히트호크 도끼 회수 : 팔찌 전자기장으로 회수. 제자리 회전 → 빠르게 회전하며 귀환. 도끼–미츄헨 사이 상대는 감전 + 귀환 도끼 피해
 *  3. 속사 / 4. 난사 / 5. 도탄 : 총알 사용 (탄창 6발)
 *  6. 장전 : 탄이 없거나 안전할 때 한 발씩 장전 (이동하며), 피격 시 중단
 *  난수는 전부 Math.random / rand (전투 중 리플레이 시드 난수로 교체됨)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, ID = 'michuhen', IMG = 'assets/Michuhen/';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1); return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t]; };
  const inArena = (x, y) => x > AR.x + 6 && x < AR.x + AR.w - 6 && y > AR.y + 24 && y < AR.y + AR.h - 4;
  const MAG = u => (u.def.mc && u.def.mc.mag) || 6; // 슈르프 등 다른 캐릭터가 흡수해도 탄창 6
  const M = u => u.mc || (u.mc = { ammo: MAG(u), axe: { state: 'hand' }, rl: null, ric: [] });

  STATUS_DEFS.mcShock = { name: '감전', color: '#9ff0ff', tint: '#c8faff', tintA: 0.45, particle: '#e8ffff', blocksAct: true, spdMul: 0.35, onApply(u) { u.action = null; } };

  const bulletHit = { element: 'pierce', delivery: 'ranged', color: '#ffe9a0' };
  function drawBullet(ctx, p) { const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffd86a'; ctx.fillRect(-14, -1, 12, 2); ctx.globalAlpha = 1; ctx.fillStyle = '#fff4c0'; ctx.fillRect(-2, -1, 4, 2); }
  function fire(b, u, ang, spd, mult) { // 총알 1발 (비유도 직선)
    const Mc = M(u); if (Mc.ammo <= 0) return false; Mc.ammo--;
    b.shoot(u, { angle: ang, spd, dmg: u.st.atk * mult, kind: 'mcBullet', hit: { ...bulletHit, element: 'blunt', noCrit: true } }); /* 난사 총알: 치명타 없음 */
    Object.assign(b.proj[b.proj.length - 1], { life: 0.6, r: 4, draw: drawBullet, noAirLock: true });
    b.parts.push({ x: u.x + Math.cos(ang) * 14, y: u.y - 20 + Math.sin(ang) * 14, vx: 0, vy: 0, life: 0.06, max: 0.06, color: '#fff0a0', size: 4, glow: true });
    return true;
  }
  const aimAt = (u, e) => Math.atan2(e.y - 18 - (u.y - 20), e.x - u.x);

  // ---------- 1. 도끼 투척 ----------
  SKILLS.mcThrow = {
    desc: '히트호크 도끼를 상대 방향으로 던집니다(유도 없음, 베기). 맞거나 멈춘 자리에 떨어져 있고, 손에 없는 동안 도끼 근접 공격을 못 합니다.',
    canUse: (u, e, d) => M(u).axe.state === 'hand' && d > 70 && d < 300 && !u.mc.rl,
    use(u, e0, b, slot) { const e = foeOf(b, u), S = slot, A = M(u).axe, a = Math.atan2(e.y - u.y, e.x - u.x);
      Object.assign(A, { state: 'fly', x: u.x + Math.cos(a) * 12, y: u.y + Math.sin(a) * 12, a, left: clamp(dist(u, e) + 40, 90, S.range), spin: 0, hit: new Set(), S });
      u.facing = Math.cos(a) >= 0 ? 1 : -1; u.swing = 0.2; },
  };
  // ---------- 2. 도끼 회수 ----------
  SKILLS.mcRecall = {
    desc: '전자기 팔찌로 떨어진 도끼를 회수합니다. 도끼가 제자리에서 잠시 돌다가 빠르게 회전하며 돌아오고, 도끼와 미츄헨 사이에 있는 상대는 전자기장에 감전된 뒤 도끼에 맞습니다.',
    canUse: (u, e, d, b) => { const A = M(u).axe; if (A.state !== 'ground') return false; const e2 = foeOf(b, u); if (!e2) return true;
      const [sd, t] = segD(e2.x, e2.y, A.x, A.y, u.x, u.y); return (sd < 22 + e2.pad && t > 0.1 && t < 0.9) || b.time - A.landT > 2.2 || Math.hypot(A.x - u.x, A.y - u.y) > 200; },
    use(u, e, b, slot) { const A = M(u).axe; A.state = 'spin'; A.t = 0; A.S = slot; A.hit = new Set(); b.ring(A.x, A.y - 8, 3, 20, 0.3, '#9ff0ff'); },
  };
  // ---------- 3. 속사 ----------
  SKILLS.mcQuick = {
    desc: '눈에 보이지 않을 만큼 빠른 총알 한 발. 쏘는 순간 무조건 명중합니다. 총알 1발 사용.',
    canUse: (u, e, d) => M(u).ammo >= 1 && !u.mc.rl && d < 330,
    use(u, e0, b, slot) { const e = foeOf(b, u), Mc = M(u); if (!e || Mc.ammo <= 0) return; Mc.ammo--; // 무조건 명중 (즉발 히트스캔)
      const a = aimAt(u, e); u.facing = Math.cos(a) >= 0 ? 1 : -1; playSfx('shot');
      const x0 = u.x + Math.cos(a) * 14, y0 = u.y - 20 + Math.sin(a) * 14;
      b.streak(x0, y0, e.x, e.y - 18 - b.airZ(e), '#ffe9a0', 3, 0.15);
      b.parts.push({ x: x0, y: y0, vx: 0, vy: 0, life: 0.06, max: 0.06, color: '#fff0a0', size: 4, glow: true });
      b.damage(u, e, u.st.atk * slot.mult, { element: 'blunt', delivery: 'ranged', color: '#ffe9a0', piercesBarrier: true, sureHit: true, noCrit: true }); /* 속사: 치명타 없음 */ },
  };
  // ---------- 4. 난사 ----------
  SKILLS.mcDump = {
    desc: '남은 총알을 전부 짧은 간격으로 퍼지게 쏟아붓습니다.',
    canUse: (u, e, d) => M(u).ammo >= 3 && !u.mc.rl && d < 220,
    use(u, e0, b, slot) { const S = slot; let t = 0;
      u.action = { type: 'mcDump', step(dt) { const e = foeOf(b, u); t -= dt; if (t > 0) return; t = S.gap;
        if (!e || M(u).ammo <= 0) { u.action = null; return; }
        const a = aimAt(u, e) + rand(-S.spread, S.spread); u.facing = Math.cos(a) >= 0 ? 1 : -1; fire(b, u, a, S.spd, S.mult); } }; },
  };
  // ---------- 5. 도탄 ----------
  function ricAim(b, u, e) { // 벽 하나에 반사시켜 맞히는 각도 (거울상 중 가장 짧은 경로)
    const L = AR.x + 6, R = AR.x + AR.w - 6, T = AR.y + 24, B = AR.y + AR.h - 4, tx = e.x, ty = e.y;
    const C = [[2 * L - tx, ty], [2 * R - tx, ty], [tx, 2 * T - ty], [tx, 2 * B - ty]].map(([x, y]) => ({ x, y, d: Math.hypot(x - u.x, y - u.y) })).sort((p, q) => p.d - q.d);
    return Math.atan2(C[0].y - u.y, C[0].x - u.x);
  }
  SKILLS.mcRicochet = {
    desc: '매우 빠른 총알을 벽·장애물에 튕겨(최대 3번) 상대를 노립니다. 튕기는 소리가 들릴 땐 이미 다음 벽으로 가는 중. 총알 1발 사용.',
    canUse: (u, e, d) => M(u).ammo >= 1 && !u.mc.rl && d < 360,
    use(u, e0, b, slot) { const e = foeOf(b, u), Mc = M(u); if (Mc.ammo <= 0) return; Mc.ammo--;
      const a = ricAim(b, u, e); u.facing = Math.cos(a) >= 0 ? 1 : -1; playSfx('shot');
      Mc.ric.push({ x: u.x + Math.cos(a) * 10, y: u.y + Math.sin(a) * 10, vx: Math.cos(a) * slot.spd, vy: Math.sin(a) * slot.spd, n: slot.bounces, len: 0, S: slot, trail: [] }); },
  };
  // ---------- 6. 장전 ----------
  SKILLS.mcReload = {
    desc: '총알을 모두 쓰거나 안전하다고 판단하면 한 발씩 장전합니다(움직이며). 공격받으면 장전을 멈추고 계속 싸웁니다.',
    canUse: (u, e, d) => { const Mc = M(u); return !Mc.rl && Mc.ammo < MAG(u) && ((Mc.ammo === 0 && d > 80) || d > 200 || (Mc.ammo <= 2 && d > 150)); },
    say(u, e, b) { return b.line(u, 'skill', '장전'); },
    use(u, e, b, slot) { M(u).rl = { t: 0, each: slot.each }; },
  };

  // 피격 시 장전 중단
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    const r = oDmg.call(this, src, tgt, amt, o);
    if (r > 0 && tgt && tgt.mc && tgt.mc.rl && src !== tgt) { tgt.mc.rl = null; this.text(tgt.x, tgt.y - 70, '장전 중단!', '#ffd08a', 9); }
    return r;
  };

  function stepAxe(b, u, dt) {
    const A = u.mc.axe, S = A.S;
    if (A.state === 'fly') {
      const st = Math.min(A.left, S.spd * dt), nx = A.x + Math.cos(A.a) * st, ny = A.y + Math.sin(A.a) * st; A.spin += dt * 20;
      if (!inArena(nx, ny) || b.blockAt(nx, ny - 4, 4)) { A.state = 'ground'; A.landT = b.time; b.sparks(A.x, A.y - 10, '#e8eef4', 6, 120); playSfx('wall'); return; }
      A.x = nx; A.y = ny; A.left -= st;
      for (const o of b.foes(u)) if (!o.hidden && !o.dead && !A.hit.has(o) && Math.hypot(o.x - A.x, o.y - A.y) < 12 + o.pad) {
        A.hit.add(o); b.damage(u, o, u.st.atk * S.mult, { element: 'slash', delivery: 'ranged', color: '#e8eef4' }); A.left = Math.min(A.left, 6); } // 맞으면 그 자리에 떨어짐
      if (A.left <= 0) { A.state = 'ground'; A.landT = b.time; b.dust(A.x, A.y); }
    } else if (A.state === 'ground') {
      if (!u.airborne && Math.hypot(u.x - A.x, u.y - A.y) < 14 + u.pad) { A.state = 'hand'; b.text(u.x, u.y - 62, '도끼 회수', '#d8e2ec', 9); } // 직접 주움
    } else if (A.state === 'spin') {
      A.t += dt; A.spin += dt * 14;
      if (A.t >= S.spinT) { A.state = 'back';
        for (const o of b.foes(u)) { if (o.hidden || o.dead) continue; const [sd, t] = segD(o.x, o.y, A.x, A.y, u.x, u.y); // 전자기장: 도끼–미츄헨 사이
          if (sd < 12 + o.pad && t > 0.05 && t < 0.95) { b.applyStatus(o, 'mcShock', S.shock, u); b.damage(u, o, u.st.atk * S.emMult, { element: 'elec', delivery: 'ranged', color: '#9ff0ff' }); b.sparks(o.x, o.y - 18, '#c8faff', 10, 160); } }
        A.emT = 0.25; }
    } else if (A.state === 'back') {
      A.spin += dt * 30; if (A.emT > 0) A.emT -= dt;
      const d = Math.hypot(u.x - A.x, u.y - A.y), st = Math.min(d, S.back * dt); if (d > 0.1) { A.x += (u.x - A.x) / d * st; A.y += (u.y - A.y) / d * st; }
      for (const o of b.foes(u)) if (!o.hidden && !o.dead && !A.hit.has(o) && Math.hypot(o.x - A.x, o.y - A.y) < 13 + o.pad) { A.hit.add(o); b.damage(u, o, u.st.atk * S.mult, { element: 'slash', delivery: 'ranged', color: '#e8eef4' }); }
      if (d < 14) { A.state = 'hand'; b.ring(u.x, u.y - 20, 3, 16, 0.2, '#9ff0ff'); }
    }
  }
  function stepRic(b, u, dt) {
    const L = AR.x + 6, R = AR.x + AR.w - 6, T = AR.y + 24, B = AR.y + AR.h - 4;
    for (const r of u.mc.ric) {
      const sub = 6; for (let k = 0; k < sub && !r.dead; k++) {
        let nx = r.x + r.vx * dt / sub, ny = r.y + r.vy * dt / sub, bounce = false;
        if (nx < L || nx > R) { r.vx = -r.vx; nx = clamp(nx, L, R); bounce = true; }
        if (ny < T || ny > B) { r.vy = -r.vy; ny = clamp(ny, T, B); bounce = true; }
        if (!bounce && b.blockAt(nx, ny - 4, 2)) { const bx = b.blockAt(nx, r.y - 4, 2), by = b.blockAt(r.x, ny - 4, 2); if (bx) r.vx = -r.vx; if (by || !bx) r.vy = -r.vy; nx = r.x; ny = r.y; bounce = true; }
        r.trail.push([r.x, r.y]); if (r.trail.length > 10) r.trail.shift();
        r.x = nx; r.y = ny; r.len += Math.hypot(r.vx, r.vy) * dt / sub;
        if (bounce) { if (r.n-- <= 0) { r.dead = true; b.sparks(r.x, r.y - 18, '#fff0a0', 5, 100); break; } playSfx('wall'); b.sparks(r.x, r.y - 18, '#fff0a0', 6, 140); }
        for (const o of b.foes(u)) if (!o.hidden && !o.dead && Math.hypot(o.x - r.x, o.y - r.y) < 9 + o.pad) {
          b.damage(u, o, u.st.atk * r.S.mult * (1 + 0.15 * (r.S.bounces - Math.max(0, r.n))), { element: 'blunt', delivery: 'ranged', color: '#ffe9a0' }); r.dead = true; break; } // 튕길수록 조금 더 아픔
      }
      if (r.len > r.S.range) r.dead = true;
    }
    u.mc.ric = u.mc.ric.filter(r => !r.dead);
  }

  function drawAxeIcon(ctx, x, y, a) { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a);
    ctx.fillStyle = '#6a4428'; ctx.fillRect(-7, -1, 14, 2); ctx.fillStyle = '#8a8f9c'; ctx.fillRect(3, -6, 5, 12); ctx.fillStyle = '#e0e6f0'; ctx.fillRect(7, -6, 1, 12); ctx.fillStyle = '#a02020'; ctx.fillRect(4, -1, 2, 2); ctx.restore(); }

  STAGE_HOOKS.push({
    match: () => false,
    init(b) { for (const u of b.u) if (u.def.id === ID) M(u); },
    step(b, dt) {
      for (const u of b.u) { if (u.def.id !== ID && !u.mc) continue; const Mc = M(u), me = u.def.id === ID;
        if (u.dead) { Mc.rl = null; continue; }
        if (!me && Mc.ammo <= 0 && !Mc.rl) Mc.rl = { t: 0, each: 0.4 }; // 흡수한 쪽은 장전 스킬이 없으니 0발이면 자동 장전
        if (me && Mc.axe.state !== 'hand') u.atkT = Math.max(u.atkT, 0.15); // 도끼가 없으면 근접 기본 공격 불가
        if (Mc.rl) { Mc.rl.t += dt; if (Mc.rl.t >= Mc.rl.each) { Mc.rl.t = 0; Mc.ammo++; b.text(u.x + 12, u.y - 58, '+1', '#ffe08a', 8); if (Mc.ammo >= MAG(u)) { Mc.rl = null; b.text(u.x, u.y - 70, '장전 완료', '#ffe08a', 9); } } }
        stepAxe(b, u, dt); stepRic(b, u, dt);
      }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (!u.mc) continue; const Mc = u.mc, A = Mc.axe;
        if (A.state === 'spin' || (A.state === 'back' && A.emT > 0)) { // 전자기장 선
          ctx.save(); ctx.strokeStyle = '#9ff0ff'; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(b.time * 50); ctx.lineWidth = 1.5; ctx.beginPath();
          const x0 = u.x - u.facing * 6, y0 = u.y - 18, x1 = A.x, y1 = A.y - 10, n = 8; ctx.moveTo(x0, y0);
          for (let i = 1; i < n; i++) { const k = i / n, j = Math.sin(b.time * 60 + i * 2.3) * 4; ctx.lineTo(x0 + (x1 - x0) * k + j, y0 + (y1 - y0) * k - j); } ctx.lineTo(x1, y1); ctx.stroke();
          ctx.globalAlpha = 0.25; ctx.lineWidth = 5; ctx.stroke(); ctx.restore(); }
        if (A.state !== 'hand') { const z = A.state === 'ground' ? 3 : 12, sp = A.state === 'ground' ? 0.6 : A.spin;
          ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(A.x, A.y + 1, 7, 2.5, 0, 0, TAU); ctx.fill(); ctx.restore(); drawAxeIcon(ctx, A.x, A.y - z, sp); }
        for (const r of Mc.ric) { ctx.save(); ctx.strokeStyle = '#ffe9a0'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.beginPath(); r.trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y - 18) : ctx.moveTo(x, y - 18)); ctx.lineTo(r.x, r.y - 18); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = '#fff4c0'; ctx.fillRect(Math.round(r.x) - 1, Math.round(r.y - 18) - 1, 3, 3); ctx.restore(); }
        if (u.dead || u.hidden) continue;
        if (u.def.id !== ID && !(u.schCopy && /^mc/.test(u.schCopy.id))) continue; // 흡수 중에만 탄창 표시
        // 탄창 UI (머리 위)
        const mag = MAG(u), w = 4, gap = 1, x0 = Math.round(u.x - (mag * (w + gap) - gap) / 2), y0 = Math.round(u.y + u.ky - b.airZ(u) - 66);
        ctx.save(); ctx.fillStyle = 'rgba(16,14,22,0.7)'; ctx.fillRect(x0 - 2, y0 - 2, mag * (w + gap) - gap + 4, 9);
        for (let i = 0; i < mag; i++) { const full = i < Mc.ammo, next = Mc.rl && i === Mc.ammo;
          ctx.fillStyle = full ? '#e8b84a' : next ? (Math.floor(b.time * 8) % 2 ? '#8a7040' : '#3a3240') : '#3a3240'; ctx.fillRect(x0 + i * (w + gap), y0 + 1, w, 4);
          if (full) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(x0 + i * (w + gap), y0, w, 1); } }
        if (A.state !== 'hand') { ctx.fillStyle = '#ff7a6a'; ctx.fillRect(x0 + mag * (w + gap) + 2, y0 + 1, 2, 4); } // 도끼 없음 표시
        ctx.restore(); }
    },
  });

  CHARACTERS.push({
    id: ID, name: '미츄헨', fullName: '미츄헨 데슈타프', gender: 'neutral', color: '#5a7aa0',
    stats: { hp: 820, atk: 30, spd: 265, range: 54, atkRate: 0.95, def: 12, crit: 0.04, critMult: 1.6 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { elec: 0.7 },
    weapon: 'axe',
    mc: { mag: 6 },
    skills: [
      { id: 'mcRecall', name: '히트호크 도끼 회수', cd: 3, spinT: 0.45, back: 560, shock: 0.9, emMult: 0.5, mult: 1.3, element: 'elec', delivery: 'ranged' },
      { id: 'mcDump', name: '난사', cd: 10, gap: 0.09, spread: 0.22, spd: 900, mult: 0.75, delivery: 'ranged' },
      { id: 'mcRicochet', name: '도탄', cd: 6, spd: 1100, bounces: 3, range: 900, mult: 1.3, delivery: 'ranged' },
      { id: 'mcQuick', name: '속사', cd: 2.5, spd: 1500, mult: 1.2, delivery: 'ranged' },
      { id: 'mcThrow', name: '히트호크 도끼 투척', cd: 6, spd: 520, range: 260, mult: 1.6, element: 'slash', delivery: 'ranged' },
      { id: 'mcReload', name: '장전', cd: 1, each: 0.4 },
    ],
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 3, foot: 1 },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '히트호크 도끼 투척': ['받아라.', '도끼부터 간다.'],
        '히트호크 도끼 회수': ['돌아와.', '자력, 최대.'],
        '속사': ['한 발.', '빗나갈 리 없지.'],
        '난사': ['남은 거 전부다!', '아끼는 건 여기까지.'],
        '도탄': ['벽이 내 편이야.', '어디로 올지 알겠어?'],
        '장전': ['장전.', '여섯 발, 다시.'],
      },
      event: {
        battleStart: ['남은 탄 여섯. 충분해.', '{opp}, 한 발이면 될까.'],
        lowHp: ['계산이… 빠듯하군.'],
        stunned: ['젠장, 손이…'],
        win: ['탄은 남았다.', '끝.'],
        lose: ['…탄이 모자랐나.'],
      },
    },
  });
})();
