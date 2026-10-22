/* =========================================================
 * 블레이드 (거대한 하늘색 수정 칼날을 쓰는 원거리 캐릭터)
 *  스킬: 블레이드 탑승 / 스플릿블레이드 / 폭풍의 칼날 / 표식
 *  - 칼날 연출은 절차적으로 그림 (몸 스프라이트는 assets/Blade)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const CY = '#7fe0ff', CY2 = '#d8faff', CYD = '#2f9cc8', HUB = '#8a5a3a', HUBR = '#c8303a';

  // ---------- 칼날 그리기 ----------
  // 큰 칼날: 갈색/붉은 고리(손잡이) 둘레에 휘어진 하늘색 수정 날 4개 (참고 그림 형태)
  function drawBigBlade(ctx, x, y, s, rot, alpha = 1) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(s, s); ctx.globalAlpha *= alpha;
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.rotate(k * Math.PI / 2);
      ctx.fillStyle = CY; ctx.beginPath(); ctx.moveTo(5, -5); ctx.quadraticCurveTo(26, -12, 36, 8); ctx.quadraticCurveTo(22, -2, 6, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = CY2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(7, -4); ctx.quadraticCurveTo(25, -10, 35, 7); ctx.stroke();
      ctx.strokeStyle = CYD; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(9, 0); ctx.quadraticCurveTo(20, -3, 28, 4); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeStyle = HUB; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.stroke();
    ctx.strokeStyle = HUBR; ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, 6, k * Math.PI / 2 - 0.3, k * Math.PI / 2 + 0.3); ctx.stroke(); }
    ctx.restore();
  }
  // 작은 칼날 (투사체/함정): 가늘고 휜 하늘색 수정 칼날 (나이프형, 첫 버전 모양)
  function drawShard(ctx, x, y, ang, s = 1, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s); ctx.globalAlpha *= alpha;
    ctx.fillStyle = CY; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.quadraticCurveTo(0, -6, 9, -1); ctx.quadraticCurveTo(1, -1, -7, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = CY2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.quadraticCurveTo(0, -5, 8, -1); ctx.stroke();
    ctx.restore();
  }
  const shardDraw = (ctx, p) => drawShard(ctx, p.x, p.y, p.spin != null ? p.spin : Math.atan2(p.vy, p.vx), 1.15); // 던진 칼날: 진행 방향, 되돌아오는 칼날: 회전
  const iceHit = (b, x, y) => { b.sparks(x, y, CY2, 6, 140); b.glow(x, y, 14, CY, 0.2); };
  const hitO = (slot, extra) => ({ element: slot.element || 'ice', delivery: slot.delivery || 'ranged', pierce: slot.pierce || 0, applies: slot.applies || null, ...extra });
  const L = b => b.bladeObj || (b.bladeObj = { big: [], traps: [] });

  // 직선 투사체 (유도 없음)
  function throwShard(b, u, ang, spd, dmg, slot, o = {}) {
    b.proj.push({ x: u.x + Math.cos(ang) * 8, y: u.y - 18 - b.airZ(u) + Math.sin(ang) * 6, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, spd, src: u, dmg, kind: 'magic', homing: false, noAirLock: true,
      life: o.life || 1.0, trail: 0, r: o.r || 10, hit: hitO(slot, o.hit), draw: shardDraw, onHit: t => iceHit(b, t.x, t.y - 18) });
  }

  // ---------- 1. 블레이드 탑승 ----------
  SKILLS.bladeRide = {
    desc: '거대한 칼날에 올라타 공중 상태가 되고 이동 속도가 크게 증가합니다(x2.2, 지상 효과·근접 공격 무시). 피해를 받으면 즉시 내려옵니다. 이동 경로에 작은 칼날이 일정 간격으로 생겨(최대 3개) 무작위 방향으로 날아갔다가 잠시 후 되돌아옵니다(닿은 상대에게 피해).',
    canUse: (u, e, d, b) => !u.airborne && !u.bladeSplit && (d < 150 || b.threatTo(u)),
    use(u, e, b, slot) {
      const dur = slot.dur || 3;
      u.air = { t: 0, dur, h: slot.h || 16, ride: true };
      u.bladeRide = { slot, next: slot.gap || 0.6, n: 0 };
      u.buffs = u.buffs.filter(q => q.type !== 'bladeRideSpd'); u.buffs.push({ type: 'bladeRideSpd', t: dur, spdMul: slot.spdMul || 2.2 }); // 탑승 중 이동 속도 대폭 증가
      b.text(u.x, u.y - 64, '탑승!', CY2, 10); b.ring(u.x, u.y, 4, 26, 0.3, CY);
    },
  };
  function spawnRideShard(b, u, R) {
    const slot = R.slot, a = rand(0, TAU), spd = slot.outSpd || 300;
    b.proj.push({ x: u.x, y: u.y - 10, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, spd, src: u, dmg: u.st.atk * (slot.mult || 0.6), kind: 'magic', homing: false, noAirLock: true,
      life: 3.2, trail: 0, r: 10, pierce: true, bladeBack: { t: slot.out || 0.45, owner: u, spd: slot.backSpd || 360 }, spin: 0, hit: hitO(slot), draw: shardDraw, onHit: t => iceHit(b, t.x, t.y - 18) });
    R.n++; b.sparks(u.x, u.y - 10, CY, 4, 80);
  }

  // ---------- 2. 스플릿블레이드 ----------
  SKILLS.splitBlade = {
    desc: '제자리에 멈춰 큰 칼날을 조종합니다. 칼날은 빠르게 날아가며 벽·캐릭터·장애물에 튕기며 지나간 자리에 칼날 함정을 남깁니다(상대가 밟으면 피해, 일정 시간 후 소멸). 튕길 때마다 칼날이 작아지고, 사라지면 다시 움직일 수 있습니다.',
    canUse: (u, e, d) => !u.bladeSplit && !u.airborne && d > 50 && d < 240 && !e.dead,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x), spd = slot.spd || 300;
      const B = { u, slot, x: u.x + Math.cos(a) * 16, y: u.y - 4 + Math.sin(a) * 10, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, s: 1, rot: 0, t: 0, trail: 0, hitT: new Map() };
      L(b).big.push(B); u.bladeSplit = B;
      b.text(u.x, u.y - 64, '스플릿!', CY2, 10);
      const st = { type: 'bladeSplit', t: 0 };
      st.step = (dt) => { st.t += dt; if (!u.bladeSplit || st.t > (slot.maxT || 6) + 0.5) { u.action = null; if (u.bladeSplit) { u.bladeSplit.dead = true; u.bladeSplit = null; } } };
      u.action = st;
    },
  };
  function stepBig(b, B, dt) { // 고속(600) 터널링 방지: 이동 4px 단위로 쪼개서 진행
    const n = Math.max(1, Math.ceil(Math.hypot(B.vx, B.vy) * dt / 4));
    for (let i = 0; i < n && !B.dead; i++) stepBigSub(b, B, dt / n);
  }
  function stepBigSub(b, B, dt) {
    const S = B.slot, u = B.u, R = 18 * B.s;
    B.t += dt; B.rot += dt * 14;
    if (u.dead || B.t > (S.maxT || 6)) { B.dead = true; return; }
    let nx = B.x + B.vx * dt, ny = B.y + B.vy * dt, bounced = false;
    const p = b.clampPos(nx, ny, R);
    if (Math.abs(p.x - nx) > 0.01) { B.vx = -B.vx; bounced = true; nx = p.x; }
    if (Math.abs(p.y - ny) > 0.01) { B.vy = -B.vy; bounced = true; ny = p.y; }
    if (!bounced && b.blockAt(nx, ny + 4, R * 0.6)) { // 장애물(건물)
      if (!b.blockAt(B.x, ny + 4, R * 0.6)) B.vx = -B.vx; else if (!b.blockAt(nx, B.y + 4, R * 0.6)) B.vy = -B.vy; else { B.vx = -B.vx; B.vy = -B.vy; }
      bounced = true; nx = B.x; ny = B.y;
    }
    for (const o of b.u) { // 캐릭터에 튕김 (상대면 피해)
      if (o.dead || o === u || o.airborne || o.hidden) continue;
      const dx = B.x - o.x, dy = B.y - (o.y - 4), d = Math.hypot(dx, dy);
      if (d < R + 15 * (o.size || 1) && (B.hitT.get(o) || 0) <= B.t) {
        const vn = (B.vx * dx + B.vy * dy) / (d || 1); if (vn < 0) { B.vx -= 2 * vn * dx / (d || 1); B.vy -= 2 * vn * dy / (d || 1); }
        B.hitT.set(o, B.t + 0.35); bounced = true;
        if (o.team !== u.team) { b.damage(u, o, u.st.atk * (S.mult || 1.0) * Math.max(0.5, B.s), hitO(S)); iceHit(b, o.x, o.y - 18); }
      }
    }
    B.x = nx; B.y = ny;
    if (b.balls && b.balls.length) b.pushBalls(B.x, B.y, R + 4, 120); // 축구장: 공을 참
    if (bounced) {
      B.s *= S.shrink || 0.8; b.sparks(B.x, B.y, CY2, 8, 160); b.ring(B.x, B.y, 3, 18 * B.s + 8, 0.25, CY);
      if (B.s < (S.minS || 0.35)) { B.dead = true; b.burst(B.x, B.y, CY, 12); return; }
    }
    B.trail += Math.hypot(B.vx, B.vy) * dt;
    const T = L(b).traps, own = T.filter(q => q.u === u && !q.dead);
    if (B.trail >= (S.trapGap || 26)) {
      B.trail = 0;
      if (own.length >= (S.trapMax || 10)) own[0].dead = true;
      else if (T.filter(q => !q.dead).length >= 24) T.find(q => !q.dead).dead = true; // 전체 상한 (다인 팀/빌린 스킬)
      T.push({ u, x: B.x, y: B.y + 4, t: 0, dur: S.trapLife || 6, r: 11, dmg: u.st.atk * (S.trapMult || 0.7), slot: S, ang: rand(0, TAU) });
    }
  }

  // ---------- 3. 폭풍의 칼날 ----------
  SKILLS.bladeStorm = {
    desc: '일정 거리를 3~5번 연속으로 순간이동하며, 착지할 때마다 사방으로 칼날을 흩뿌립니다.',
    canUse: (u, e, d, b) => !u.airborne && !u.bladeSplit && d < 170 && !e.dead,
    use(u, e, b, slot) {
      const n = 3 + Math.floor(Math.random() * 3), gap = slot.gap || 0.3, D = slot.dist || 70;
      const st = { type: 'bladeStorm', t: 0, i: 0 };
      const hop = () => {
        let best = null;
        for (let k = 0; k < 12; k++) {
          const a = rand(0, TAU), tx = u.x + Math.cos(a) * D, ty = u.y + Math.sin(a) * D * 0.8, p = b.clampPos(tx, ty, u.pad, u);
          const off = Math.hypot(p.x - tx, p.y - ty), blocked = b.blockAt(p.x, p.y, u.pad);
          const ed = e && !e.dead ? Math.hypot(p.x - e.x, p.y - e.y) : 100;
          const score = -off * 3 - (blocked ? 999 : 0) - Math.abs(ed - 110) * 0.3; // 벽·장애물 회피, 상대와 적당한 거리
          if (!best || score > best.s) best = { s: score, x: p.x, y: p.y };
        }
        b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.3, a: 0.45 });
        b.streak(u.x, u.y - 18, best.x, best.y - 18, CY, 8, 0.2);
        u.x = best.x; u.y = best.y; b.ring(u.x, u.y, 3, 24, 0.25, CY);
        const m = slot.count || 8, off0 = rand(0, TAU);
        for (let j = 0; j < m; j++) throwShard(b, u, off0 + j * TAU / m, slot.spd || 380, u.st.atk * (slot.mult || 0.55), slot, { life: slot.life || 0.55, r: slot.hitR || 14 }); // 판정 반경 10 → 14
      };
      st.step = (dt) => {
        st.t -= dt; if (u.dead) { u.action = null; return; }
        if (st.t <= 0) { if (st.i >= n) { u.action = null; return; } hop(); st.i++; st.t = gap; }
      };
      u.action = st;
      b.text(u.x, u.y - 64, '폭풍의 칼날!', CY2, 10);
    },
  };

  // ---------- 4. 표식 ----------
  STATUS_DEFS.bladeMark = { name: '표식', color: '#7fe0ff', tint: '#7fe0ff', tintA: 0.12, particle: '#d8faff', stack: 'refresh' };
  SKILLS.bladeMark = {
    desc: '은신합니다(반투명, 회피율 +45%, 이동 속도 x1.4, 상태이상 저항 -30%). 은신 중 상대에게 닿으면 표식을 새기고, 제자리에 멈춰 상대의 현재 위치로 칼날 8개를 빠르게 연속으로 던집니다(유도 없음). 은신은 시간이 지나거나, 스킬을 쓰거나, 상태이상에 걸리면 풀립니다.',
    canUse: (u, e, d) => !u.bladeStealth && !u.airborne && !u.bladeSplit && d < 260 && !e.dead,
    use(u, e, b, slot) {
      const dur = slot.dur || 4;
      u.buffs = u.buffs.filter(q => q.type !== 'invis');
      u.buffs.push({ type: 'invis', t: dur, eva: slot.eva ?? 0.45, statusResist: slot.resDown ?? -0.3, spdMul: slot.spdMul || 1.4, bladeStealth: true }); // 은신: 회피↑, 저항↓, 이동 속도 x1.4 (은신 해제 시 함께 제거)
      u.bladeStealth = { t: dur, slot, nStat: u.statuses.filter(s => !(STATUS_DEFS[s.id] || {}).positive).length };
      b.smoke(u.x, u.y - 18, '#a8e8ff', 8); b.text(u.x, u.y - 64, '은신', CY2, 10);
    },
  };
  function endStealth(b, u, why) {
    if (!u.bladeStealth) return; u.bladeStealth = null;
    u.buffs = u.buffs.filter(q => !q.bladeStealth);
    b.smoke(u.x, u.y - 18, '#a8e8ff', 5); if (why) b.text(u.x, u.y - 60, why, '#c8f0ff', 9);
  }
  function markAndThrow(b, u, e, slot) {
    endStealth(b, u, null);
    b.applyStatus(e, 'bladeMark', slot.markDur || 4, u);
    b.text(e.x, e.y - 70, '표식!', CY2, 12);
    const n = slot.throws || 8, gap = slot.throwGap || 0.1, hold = 0.1 + n * gap + 0.1;
    if (u.action && u.action.pin && u.action.tgt) b.releasePin(u.action.tgt);
    const st = { type: 'bladeThrow', t: 0 }; st.step = (dt) => { st.t += dt; u.moving = false; if (st.t >= hold || u.dead) u.action = null; }; u.action = st; // 던지는 동안 제자리
    for (let i = 0; i < n; i++) b.later(0.1 + i * gap, () => {
      if (u.dead || e.dead || b.over) return;
      const tx = e.x, ty = e.y - 18 - b.airZ(e), a = Math.atan2(ty - (u.y - 18 - b.airZ(u)), tx - u.x); // 던지는 순간의 현재 위치 (유도 없음)
      throwShard(b, u, a, slot.spd || 520, u.st.atk * (slot.mult || 0.7), slot, { life: 1.0 });
    });
  }

  // ---------- 엔진 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.bladeObj = { big: [], traps: [] }; },
    on(b, ev, a, c) {
      if (ev === 'attack' && a && a.bladeStealth && c && !c.dead && !c.airborne) { markAndThrow(b, a, c, a.bladeStealth.slot); return false; } // 은신 중 충돌 = 접촉 → 표식 (충돌 피해는 그대로)
      if (ev === 'skill' && a && a.bladeStealth) endStealth(b, a, null); // 스킬 → 은신 해제
      if (ev === 'damaged' && c && c.bladeRide && c.air && c.air.ride) { c.air.t = c.air.dur; c.bladeRide = null; c.buffs = c.buffs.filter(q => q.type !== 'bladeRideSpd'); b.text(c.x, c.y - 60, '하차!', '#c8f0ff', 9); b.burst(c.x, c.y - 10, CY, 8); }
      return false;
    },
    step(b, dt) {
      const O = L(b);
      for (const u of b.u) {
        if (u.bladeRide) {
          const R = u.bladeRide;
          if (u.dead || !u.air || !u.air.ride) { u.bladeRide = null; u.buffs = u.buffs.filter(q => q.type !== 'bladeRideSpd'); }
          else if (R.n < (R.slot.max || 3)) { R.next -= dt; if (R.next <= 0) { R.next = R.slot.gap || 0.6; spawnRideShard(b, u, R); } }
        }
        if (u.bladeStealth) {
          const S = u.bladeStealth; S.t -= dt;
          const nBad = u.statuses.filter(s => !(STATUS_DEFS[s.id] || {}).positive).length;
          if (u.dead || S.t <= 0 || !u.buff('invis')) endStealth(b, u, S.t <= 0 ? '은신 해제' : null);
          else if (nBad > S.nStat) endStealth(b, u, '은신 풀림');
          else { // 이동은 일반 캐릭터와 같음. 우연히 상대에게 닿으면 표식
            const e = b.enemy(u);
            if (e && !e.dead && !e.airborne && dist(u, e) < 15 * ((u.size || 1) + (e.size || 1)) + 8) markAndThrow(b, u, e, S.slot);
          }
        }
      }
      // 되돌아오는 작은 칼날
      for (const p of b.proj) if (p.bladeBack) {
        const K = p.bladeBack; p.spin = (p.spin || 0) + dt * 16;
        if (K.t > 0) { K.t -= dt; if (K.t <= 0) p.hitSet = null; continue; }
        const o = K.owner; if (o.dead) { p.life = 0; continue; }
        const tx = o.x, ty = o.y - 18 - b.airZ(o), d = Math.hypot(tx - p.x, ty - p.y);
        if (d < 12) { p.life = 0; continue; }
        p.vx = (tx - p.x) / d * K.spd; p.vy = (ty - p.y) / d * K.spd;
      }
      for (const B of O.big) if (!B.dead) stepBig(b, B, dt);
      for (const B of O.big) if (B.dead && B.u.bladeSplit === B) B.u.bladeSplit = null;
      O.big = O.big.filter(B => !B.dead);
      for (const T of O.traps) {
        T.t += dt; if (T.t >= T.dur || T.u.dead) { T.dead = true; continue; }
        for (const o of b.u) {
          if (o.dead || o.team === T.u.team || o.airborne || o.hidden) continue;
          if (Math.hypot(o.x - T.x, (o.y - T.y) / 0.7) < T.r + 8 * (o.size || 1)) {
            T.dead = true; b.damage(T.u, o, T.dmg, hitO(T.slot)); iceHit(b, T.x, T.y - 6); break;
          }
        }
      }
      O.traps = O.traps.filter(T => !T.dead);
    },
    drawUnder(ctx, b, preview) {
      if (preview || !b.bladeObj) return;
      for (const T of b.bladeObj.traps) { const k = 1 - T.t / T.dur; drawShard(ctx, T.x, T.y, T.ang, 1, 0.5 + 0.5 * Math.min(1, k * 3)); }
    },
    drawOver(ctx, b) {
      if (!b.bladeObj) return;
      for (const B of b.bladeObj.big) drawBigBlade(ctx, B.x, B.y - 6, B.s * 0.8, B.rot);
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: 'blade', name: '블레이드', gender: 'female', color: '#5ac8f0',
    // 원거리·저체력 (평균 근처): HP 760 / ATK 33 / 사거리 130
    stats: { hp: 760, atk: 33, spd: 270, range: 130, atkRate: 0.95, def: 8, crit: 0.08 },
    attack: { element: 'ice', delivery: 'ranged' },
    resist: { ice: 0.7, fire: 1.2, blunt: 1.1 },
    // 탑승 중인 큰 칼날은 몸 뒤(아래)에 그림 — 캐릭터가 칼날 위에 올라탄 모습
    drawUnder(ctx, u, b) { if (u.air && u.air.ride) drawBigBlade(ctx, 0, 2, 0.7, Math.sin(b.time * 3) * 0.08); },
    skills: [
      { id: 'bladeMark', name: '표식', cd: 11, dur: 4, spdMul: 1.4, eva: 0.45, resDown: -0.3, markDur: 4, throws: 8, throwGap: 0.1, mult: 0.7, spd: 720, element: 'ice', delivery: 'ranged' },
      { id: 'splitBlade', name: '스플릿블레이드', cd: 10, spd: 600, mult: 1.0, shrink: 0.8, minS: 0.35, maxT: 6, trapGap: 26, trapMax: 10, trapLife: 6, trapMult: 0.7, element: 'ice', delivery: 'ranged' },
      { id: 'bladeStorm', name: '폭풍의 칼날', cd: 7.5, dist: 70, gap: 0.3, count: 8, hitR: 14, mult: 0.55, spd: 380, life: 0.55, element: 'ice', delivery: 'ranged' },
      { id: 'bladeRide', name: '블레이드 탑승', cd: 8.5, dur: 3, h: 16, spdMul: 2.2, gap: 0.6, max: 3, mult: 0.6, out: 0.45, outSpd: 300, backSpd: 360, element: 'ice', delivery: 'ranged' },
    ],
    sprite: { src: 'assets/Blade/front.png', back: 'assets/Blade/back.png', scale: 0.46, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/Blade/portrait.png',
    // 대사: 임시(placeholder) — 사용자가 교체 가능
    lines: {
      skill: { '블레이드 탑승': ['올라타자!'], '스플릿블레이드': ['갈라져라!'], '폭풍의 칼날': ['폭풍처럼!'], '표식': ['찾았다.'] },
      event: { battleStart: ['칼날이 당신을 겨눠요.', '시작할까요?'], win: ['깔끔하게 끝났네요.'], lose: ['칼날이… 무뎌졌어…'], lowHp: ['아직이에요!'] },
    },
  });
})();
