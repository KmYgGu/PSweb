/**
 * 베르제브트 (사용자 소설) — 날개 없는 천사, 악마성 깃발 + 루델리안의 마력 팬던트
 *  머리 위 마력 게이지. 대부분의 스킬이 마력을 씀. 마력은 천천히 회복.
 *  마력 0 → 그 자리에서 탈진 (이동·공격·스킬 불가) → 마력 60%까지 차면 회복
 *  1. 깃발 낫        : 반원 베기 + 6초간 기본 공격이 낫 (피해↑·사거리↑)
 *  2. 공중 내려치기  : 팬던트로 떠올라 정한 지점에 깃발을 내리꽂음 → 충격파
 *  3. 슬러스터 홀    : 자리 고정·상태이상 면역, 상대·맵 밖 오브젝트를 빨아들인 뒤 내뱉기
 *  4. 단계 분리      : 깃발 분신 돌진(논타겟)으로 띄우고 → 망토 분신이 가까운 벽으로 차버림
 *  5. 장미 재배      : (마력 없음) 이속 증가 + 지나간 자리에 장미 → 자라는 곳의 상대 띄움
 *  6. 장미 가시날 연사: 가시 연사. 상대의 어떤 공격에도 상쇄됨
 *  7. 근성 (패시브)  : 마력이 남은 상태(탈진 아님)에서 치명상 → 마력 비율만큼 체력으로 부활 (1회). 이후 마력이 0이 되면 다시 차지 않음
 */
(() => {
  const TAU = Math.PI * 2, ID = 'berzebut', IMG = 'assets/Berzebut/';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const canLaunch = t => t && !t.dead && !t.airborne && !t.climb && !t.inTrain && !t.status('pin');
  const MANA = { max: 100, regen: 4.5, tiredRegen: 11, wake: 60 };
  const B = u => u.bz || (u.bz = { mana: MANA.max, tired: false, grit: false, dry: false, scyT: 0 });
  const isBz = u => u && u.def.id === ID;
  // AI 마력 관리: 비용을 내고도 15 이상 남거나, 안전할 때(멀리/상대 행동불가)·마무리 때만 바닥까지 씀
  function affordable(u, e, d, cost) {
    if (!isBz(u)) return false; const Z = B(u); if (Z.tired || Z.mana < cost) return false;
    if (Z.mana - cost >= 15) return true;
    return d > 230 || (e && (e.airborne || e.blocked('blocksAct'))) || (e && e.hp < e.maxHp * 0.2);
  }
  function spend(b, u, cost) { const Z = B(u); Z.mana = Math.max(0, Z.mana - cost); if (Z.mana <= 0) Z.empty = true; b.text(u.x + 14, u.y - 74, '-' + cost, '#c89aff', 8); }

  STATUS_DEFS.bzTired = { name: '탈진', color: '#b8a8d0', tint: '#504060', tintA: 0.3, blocksAct: true, blocksMove: true, noResistScale: true };

  // ---------- 1. 깃발 낫 ----------
  SKILLS.bzScythe = {
    desc: '깃발에 마력을 불어넣어 낫으로 바꾸고 앞쪽 반원을 크게 벱니다. 6초 동안 기본 공격도 낫(피해 1.5배·사거리 증가)이 됩니다.',
    canUse: (u, e, d) => d < 105 && affordable(u, e, d, u.skills.find(s => s.id === 'bzScythe').cost),
    use(u, e0, b, slot) { const e = foeOf(b, u), a = angTo(u, e); spend(b, u, slot.cost); u.facing = Math.cos(a) >= 0 ? 1 : -1;
      b.glow(u.x, u.y - 20, 30, '#c89aff', 0.3);
      b.windup(u, slot.wind, () => { if (u.dead || b.over) return;
        b.crescent(u.x + Math.cos(a) * 20, u.y - 18 + Math.sin(a) * 16, slot.r * 0.8, a, '#d8b0ff', 0.3); b.shake(1.5); playSfx('whiff');
        for (const o of b.foes(u)) { if (o.hidden) continue; const dd = dist(u, o), da = Math.abs(Math.atan2(Math.sin(angTo(u, o) - a), Math.cos(angTo(u, o) - a)));
          if (dd < slot.r + o.pad && da < Math.PI / 2 + 0.15) b.damage(u, o, u.st.atk * slot.mult, { element: 'slash', delivery: 'melee', color: '#e0c0ff' }); }
        B(u).scyT = slot.dur; }); },
  };
  // ---------- 2. 공중 내려치기 ----------
  SKILLS.bzSlam = {
    desc: '팬던트의 마력으로 떠올라, 정해 둔 지점(시전 순간 상대 위치)에 깃발을 내리꽂아 충격파를 일으킵니다. 지점이 보이니 피할 수 있습니다.',
    canUse: (u, e, d) => d > 110 && d < 320 && !u.airborne && affordable(u, e, d, u.skills.find(s => s.id === 'bzSlam').cost),
    use(u, e0, b, slot) { const e = foeOf(b, u); spend(b, u, slot.cost); const p = b.clampPos(e.x, e.y, u.pad, u), S = slot;
      b.telegraphCircle(p.x, p.y, S.r, S.dur, '#c89aff');
      u.air = { t: 0, dur: S.dur, h: 70, noLand: true, fling: { x0: u.x, y0: u.y, x1: p.x, y1: p.y } };
      u.action = { type: 'bzSlam', t: 0, step(dt) { this.t += dt; if (u.air) return; u.action = null;
        b.shock(u.x, u.y, 6, S.r, '#d8b0ff', 0.45, 6); b.shock(u.x, u.y, 4, S.r * 0.6, '#ffffff', 0.3, 3); b.shake(2.5); b.debris(u.x, u.y, 10); playSfx('land');
        for (const o of b.foes(u)) if (!o.hidden && !o.airborne && Math.hypot(o.x - u.x, (o.y - u.y) / 0.8) < S.r + o.pad) {
          b.damage(u, o, u.st.atk * S.mult, { element: 'blunt', delivery: 'melee', big: true, color: '#e0c0ff' }); b.knockback(o, angTo(u, o), 380, 0.25); } } }; },
  };
  // ---------- 3. 슬러스터 홀 ----------
  function holeObj(b, u) { // 맵 밖 가장자리에서 생성
    const side = Math.floor(rand(0, 4)), m = 16; let x, y;
    if (side === 0) { x = AR.x - m; y = rand(AR.y, AR.y + AR.h); } else if (side === 1) { x = AR.x + AR.w + m; y = rand(AR.y, AR.y + AR.h); }
    else if (side === 2) { x = rand(AR.x, AR.x + AR.w); y = AR.y - m; } else { x = rand(AR.x, AR.x + AR.w); y = AR.y + AR.h + m; }
    return { x, y, k: Math.floor(rand(0, 3)), spin: rand(0, TAU) };
  }
  SKILLS.bzHole = {
    desc: '그 자리에 고정되어(상태이상 면역) 상대와 맵 밖의 물건들을 천천히 빨아들입니다. 상대가 공격하면 시전 시간이 줄어듭니다. 날아오는 물건에 맞은 상대는 기절(근접 공격이 준비돼 있으면 바로 부숨). 빨아들인 물건 수·시전 시간만큼 강한 내뱉기, 상대를 삼켰다면 마력을 회복하고 크게 뱉어냅니다.',
    canUse: (u, e, d) => d < 260 && !u.airborne && affordable(u, e, d, u.skills.find(s => s.id === 'bzHole').cost),
    use(u, e0, b, slot) { const S = slot; spend(b, u, S.cost); u.statuses = u.statuses.filter(s => (STATUS_DEFS[s.id] || {}).positive);
      const H = u.bzHole = { t: 0, dur: S.dur, objs: [], got: 0, spawnT: 0.05, swallowed: null };
      u.action = { type: 'bzHole', step(dt) {
        const e = foeOf(b, u); H.t += dt; H.spawnT -= dt;
        if (H.spawnT <= 0 && H.t < H.dur - 0.4) { H.spawnT = S.every; H.objs.push(holeObj(b, u)); }
        if (e && !e.dead && !e.airborne && !e.hidden) { const dd = dist(u, e), R = 15 * (u.size + e.size) + 6;
          if (dd <= R) { H.swallowed = e; H.dur = H.t; }
          else { const sb = e.buffs.find(x => x.type === 'bzPull'); if (sb) sb.t = 0.15; else e.buffs.push({ type: 'bzPull', t: 0.15, spdMul: S.slow }); // 빨려드는 동안 이동 느려짐
            const k = Math.min(dd - R, S.pull * dt), q = b.clampPos(e.x + (u.x - e.x) / dd * k, e.y + (u.y - e.y) / dd * k, e.pad, e); e.x = q.x; e.y = q.y; } }
        for (const O of H.objs) { if (O.dead) continue; const dd = Math.hypot(u.x - O.x, u.y - O.y), sp = S.objSpd * (1 + H.t * 0.15); O.spin += dt * 8;
          if (dd < 14) { O.dead = true; H.got++; b.ring(u.x, u.y - 20, 3, 18, 0.2, '#c89aff'); continue; }
          O.x += (u.x - O.x) / dd * sp * dt; O.y += (u.y - O.y) / dd * sp * dt;
          for (const o of b.foes(u)) { if (o.dead || o.hidden || o.airborne || Math.hypot(o.x - O.x, o.y - O.y) > 12 + o.pad) continue;
            O.dead = true;
            if (o.atkT <= 0 && !o.blocked('blocksAct')) { o.atkT = 1 / Math.max(0.3, o.atkRate); o.swing = 0.2; b.slashFx(O.x, O.y - 16, o.facing, '#ffffff', 0.9); b.debris(O.x, O.y, 6); b.text(O.x, O.y - 30, '격파!', '#ffffff', 9); }
            else { b.damage(u, o, u.st.atk * S.objMult, { element: 'blunt', delivery: 'ranged', color: '#d0c0a0' }); b.stun(o, S.stun, u); b.debris(O.x, O.y, 6); }
            break; } }
        H.objs = H.objs.filter(O => !O.dead);
        if (H.t >= H.dur) { u.action = null; u.bzHole = null; spit(b, u, e, H, S); } } }; },
  };
  function spit(b, u, e, H, S) {
    const pow = S.mult * (1 + S.perSec * H.t + S.perObj * H.got);
    b.shock(u.x, u.y - 18, 6, 40, '#c89aff', 0.35, 5); playSfx('big');
    if (H.swallowed && !H.swallowed.dead) { const o = H.swallowed; const Z = B(u);
      if (!Z.dry || Z.mana > 0) { Z.mana = Math.min(MANA.max, Z.mana + S.manaBack); b.text(u.x, u.y - 78, '마력 +' + S.manaBack, '#c89aff', 9); }
      b.damage(u, o, u.st.atk * pow * S.swallowK, { element: 'dark', delivery: 'melee', big: true, color: '#d8b0ff' });
      b.knockback(o, angTo(u, o) || (u.facing > 0 ? 0 : Math.PI), 620, 0.45, () => b.damage(u, o, u.st.atk * 0.4, { element: 'blunt', color: '#f0e8d8' }));
      b.hitstop(0.12); b.shake(3); return; }
    if (!e) return; const a = angTo(u, e);
    b.shoot(u, { angle: a, spd: 430, dmg: u.st.atk * pow, kind: 'bzSpit', hit: { element: 'dark', delivery: 'ranged', color: '#d8b0ff', big: true } });
    const r = 10 + Math.min(10, H.got * 2); Object.assign(b.proj[b.proj.length - 1], { x: u.x, y: u.y - 20, life: 1.2, r, noAirLock: true, draw(ctx, p) { ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#2a1238'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#d8b0ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); } });
    if (H.got) b.text(u.x, u.y - 78, `내뱉기 x${H.got}`, '#d8b0ff', 9);
  }
  // ---------- 4. 단계 분리 ----------
  SKILLS.bzSplit = {
    desc: '둘로 나뉩니다. 깃발을 든 쪽이 상대가 있던 방향으로 돌진(논타겟)해 띄우고, 망토를 두른 쪽이 날아가 띄워진 상대를 가까운 벽으로 차 버립니다(벽 충돌 피해). 띄우기에 실패하거나 끝나면 다시 합쳐집니다.',
    canUse: (u, e, d) => d > 60 && d < 240 && !u.airborne && affordable(u, e, d, u.skills.find(s => s.id === 'bzSplit').cost),
    use(u, e0, b, slot) { const S = slot, e = foeOf(b, u), a = angTo(u, e); spend(b, u, S.cost);
      const C = u.bzClone = { x: u.x, y: u.y, z: 0, ph: 'wait', t: 0, tgt: null }; b.smoke(u.x, u.y - 16, '#c89aff', 6);
      b.telegraphLine(u.x, u.y, u.x + Math.cos(a) * S.len, u.y + Math.sin(a) * S.len, 18, 0.15, '#ffd0e0');
      let run = 0;
      u.action = { type: 'bzSplit', trail: '#ffb0c8', step(dt) { const st = S.spd * dt; run += st;
        const q = b.clampPos(u.x + Math.cos(a) * st, u.y + Math.sin(a) * st, u.pad, u), blocked = Math.abs(q.x - u.x - Math.cos(a) * st) > 0.5 || Math.abs(q.y - u.y - Math.sin(a) * st) > 0.5 || b.blockAt(q.x, q.y - 4, 6);
        if (!blocked) { u.x = q.x; u.y = q.y; }
        for (const o of b.foes(u)) if (!o.hidden && Math.hypot(o.x - u.x, o.y - u.y) < 16 + o.pad + 14) {
          u.action = null; b.damage(u, o, u.st.atk * S.mult, { element: 'blunt', delivery: 'melee', color: '#ffd0e0' });
          if (canLaunch(o) && !o.dead) { o.action = null; o.air = { t: 0, dur: 1.1, h: 50, tumble: true }; b.text(o.x, o.y - 60, '띄움!', '#ffe080', 9); C.ph = 'fly'; C.tgt = o; C.t = 0; } else C.ph = 'merge';
          return; }
        if (run >= S.len || blocked) { u.action = null; C.ph = 'merge'; b.text(u.x, u.y - 60, '빗나감', '#e0d0f0', 9); } } };
    },
  };
  function stepClone(b, u, dt, S) {
    const C = u.bzClone; C.t += dt;
    const moveTo = (x, y, sp) => { const d = Math.hypot(x - C.x, y - C.y), k = Math.min(d, sp * dt); if (d > 0.1) { C.x += (x - C.x) / d * k; C.y += (y - C.y) / d * k; } return d; };
    if (C.ph === 'fly') { const o = C.tgt; C.z = Math.min(40, C.z + dt * 160);
      if (!o || o.dead || !o.air) { C.ph = 'merge'; return; }
      const d = moveTo(o.x - u.facing * 0, o.y, S.flySpd);
      if (d < 18 || C.t > 0.6) { // 벽 차기: 가장 가까운 벽으로
        const L = o.x - AR.x, R = AR.x + AR.w - o.x, T = o.y - AR.y, Bm = AR.y + AR.h - o.y, m = Math.min(L, R, T, Bm);
        const tx = m === L ? AR.x : m === R ? AR.x + AR.w : o.x, ty = m === T ? AR.y : m === Bm ? AR.y + AR.h : o.y;
        const q = b.clampPos(tx, ty, o.pad, o); o.air = { t: 0, dur: 0.32, h: 30, tumble: true, noLand: true, fling: { x0: o.x, y0: o.y, x1: q.x, y1: q.y } };
        b.slashFx(o.x, o.y - 30, u.facing, '#ffb0c8', 1.2); b.text(o.x, o.y - 66, '뻥!', '#ffb0c8', 11); playSfx('melee');
        b.damage(u, o, u.st.atk * S.kickMult, { element: 'blunt', delivery: 'melee', color: '#ffb0c8' });
        C.ph = 'kick'; C.t = 0; C.kx = q.x; C.ky = q.y; }
    } else if (C.ph === 'kick') { const o = C.tgt;
      if (C.t >= 0.32) { if (o && !o.dead) { playSfx('wall'); b.shake(2.5); b.dust(o.x, o.y); b.ring(o.x, o.y - 10, 3, 24, 0.3, '#f0e8d8'); b.debris(o.x, o.y, 8);
          b.damage(u, o, u.st.atk * S.wallMult, { element: 'blunt', big: true, color: '#f0e8d8' }); b.stun(o, S.wallStun, u); }
        C.ph = 'merge'; }
    } else if (C.ph === 'merge') { C.z = Math.max(0, C.z - dt * 120);
      if (moveTo(u.x, u.y, 520) < 10) { u.bzClone = null; b.smoke(u.x, u.y - 16, '#c89aff', 5); b.text(u.x, u.y - 62, '합체!', '#e0c8ff', 9); }
    } else if (C.ph === 'wait' && C.t > 1.2) C.ph = 'merge';
  }
  // ---------- 5. 장미 재배 ----------
  SKILLS.bzRose = {
    desc: '잠깐 이동 속도가 빨라지고, 지나간 자리에 장미 씨앗을 심습니다. 장미는 순식간에 자라며 그 자리에 상대가 있으면 띄워 올립니다. (마력 소모 없음)',
    canUse: (u, e, d) => d < 260 && !u.bzRose && !(u.bz && u.bz.tired),
    use(u, e, b, slot) { u.buffs.push({ type: 'bzRose', t: slot.dur, spdMul: slot.spdMul }); (u.bzRose = { t: slot.dur, plant: 0, S: slot }); b.burst(u.x, u.y - 10, '#ff6a8a', 10); },
  };
  // ---------- 6. 장미 가시날 연사 ----------
  function drawThorn(ctx, p) { const a = Math.atan2(p.vy, p.vx); ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.fillStyle = '#3a8a4a'; ctx.fillRect(-5, -1, 6, 2); ctx.fillStyle = '#ff5a7a'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(0, -2.5); ctx.lineTo(0, 2.5); ctx.fill(); ctx.restore(); }
  SKILLS.bzThorns = {
    desc: '망토 속에서 장미 가시를 쉴 새 없이 쏘아냅니다(논타겟). 가시는 상대의 어떤 공격(투사체·근접·스킬)에도 상쇄됩니다.',
    canUse: (u, e, d) => d > 70 && d < 300 && affordable(u, e, d, u.skills.find(s => s.id === 'bzThorns').cost),
    use(u, e0, b, slot) { const S = slot; spend(b, u, S.cost); let t = 0, n = 0;
      u.action = { type: 'bzThorns', step(dt) { const e = foeOf(b, u); t -= dt; if (t > 0) return; t = S.gap;
        if (!e || n >= S.n) { u.action = null; return; } n++;
        const a = angTo(u, e) + rand(-S.spread, S.spread); u.facing = Math.cos(a) >= 0 ? 1 : -1;
        b.shoot(u, { angle: a, spd: S.spd, dmg: u.st.atk * S.mult, kind: 'bzThorn', hit: { element: 'slash', delivery: 'ranged', color: '#ff7a9a', noCrit: true } }); /* 가시: 치명타 없음 */
        Object.assign(b.proj[b.proj.length - 1], { x: u.x - u.facing * 4, y: u.y - 16, life: 0.8, r: 5, draw: drawThorn, noAirLock: true, bzThorn: true }); } }; },
  };
  function thornCut(b, x, y, r, team) { // (x,y) 반경 r 안의 가시 상쇄 (team = 가시를 지우는 쪽)
    for (const p of b.proj) if (p.bzThorn && p.life > 0 && p.src.team !== team && Math.hypot(p.x - x, p.y - y) < r) { p.life = 0; b.burst(p.x, p.y, '#ff8aa8', 3); }
  }

  // ---------- 공통 훅 ----------
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (src && isBz(src) && o.basic && src.bz && src.bz.scyT > 0) { amt *= 1.5; o = { ...o, element: 'slash', color: '#e0c0ff' }; } // 낫 기본 공격
    const r = oDmg.call(this, src, tgt, amt, o);
    if (r > 0 && tgt && tgt.bzHole && src !== tgt && !o.dot) { tgt.bzHole.dur = Math.max(tgt.bzHole.t, tgt.bzHole.dur - 0.3); this.text(tgt.x, tgt.y - 76, '시전 단축', '#ffd0a0', 8); } // 맞으면 시전 시간 단축
    if (r > 0 && src && tgt && src.team !== tgt.team && o.delivery !== 'ranged' && !o.viaProj) thornCut(this, tgt.x, tgt.y - 18, 40, src.team); // 근접·범위 공격: 맞은 자리 가시 상쇄
    return r;
  };
  const oStatus = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o = {}) {
    const d = STATUS_DEFS[id]; if (tgt && tgt.bzHole && d && !d.positive && src !== tgt) { this.text(tgt.x, tgt.y - 76, '면역', '#e0d0ff', 9); return null; } // 슬러스터 홀: 상태이상 면역
    return oStatus.call(this, tgt, id, dur, src, o);
  };
  const oKill = Battle.prototype.kill; Battle.prototype.kill = function (tgt, src) { // 근성
    if (isBz(tgt) && !tgt.dead && tgt.bz && !tgt.bz.grit && !tgt.bz.tired && tgt.bz.mana > 0 && !this.over && !(this.freeze && this.freeze.allowKill === false)) {
      const Z = tgt.bz; Z.grit = true; Z.dry = true; tgt.hp = Math.max(1, Math.round(tgt.maxHp * Z.mana / MANA.max));
      tgt.statuses = tgt.statuses.filter(s => (STATUS_DEFS[s.id] || {}).positive);
      this.text(tgt.x, tgt.y - 80, '근성!', '#ffd0f0', 14); this.glow(tgt.x, tgt.y - 20, 50, '#ffd0f0', 0.6); this.shock(tgt.x, tgt.y - 18, 6, 50, '#ffd0f0', 0.5, 5); this.hitstop(0.2);
      this.hooks.onSystem && this.hooks.onSystem(`베르제브트 근성! 체력 ${tgt.hp}로 부활 (이후 마력 고갈 시 회복 불가)`);
      this.say(tgt, 'grit'); return; }
    return oKill.call(this, tgt, src);
  };

  function setTired(b, u, on) { const Z = B(u); Z.tired = on;
    if (on) { u.action = null; u.bzRose = null; if (!u.status('bzTired')) u.statuses.push({ id: 'bzTired', t: 999, dur: 999, src: u, tickT: 0 }); b.text(u.x, u.y - 72, '탈진…', '#b8a8d0', 11); b.say(u, 'tired'); }
    else { u.statuses = u.statuses.filter(s => s.id !== 'bzTired'); b.text(u.x, u.y - 72, '회복!', '#e0c8ff', 10); b.ring(u.x, u.y - 18, 4, 28, 0.3, '#c89aff'); } }

  STAGE_HOOKS.push({
    match: () => false,
    init(b) { for (const u of b.u) if (isBz(u)) B(u); },
    on(b, ev, u, x) {
      if (ev === 'attack' && u) thornCut(b, u.x + u.facing * 16, u.y - 18, u.reach + 10, u.team); // 휘두르기 자체로 상쇄
      if (ev === 'skill' && u) thornCut(b, u.x, u.y - 18, 70, u.team);
      return false;
    },
    step(b, dt) {
      // 투사체끼리 상쇄: 가시 ↔ 상대 투사체 (가시만 사라짐)
      const th = b.proj.filter(p => p.bzThorn && p.life > 0);
      if (th.length) for (const q of b.proj) { if (q.bzThorn || q.life <= 0) continue; for (const p of th) if (p.life > 0 && p.src.team !== q.src.team && Math.hypot(p.x - q.x, p.y - q.y) < (q.r || 10) + 5) { p.life = 0; b.burst(p.x, p.y, '#ff8aa8', 3); } }
      for (const u of b.u) { // 장미 (슈르프가 흡수해도 동작)
        if (u.bzRose && !u.dead) { const R = u.bzRose; R.t -= dt; R.plant -= dt; if (R.plant <= 0 && !u.airborne) { R.plant = R.S.every; (u.bzRoses || (u.bzRoses = [])).push({ x: u.x, y: u.y, t: 0, grow: R.S.grow, S: R.S, done: false }); } if (R.t <= 0) u.bzRose = null; }
        if (!u.bzRoses) continue;
        for (const r of u.bzRoses) { r.t += dt; if (!r.done && r.t >= r.grow) { r.done = true; b.burst(r.x, r.y - 6, '#ff5a7a', 6);
            if (!u.dead) for (const o of b.foes(u)) if (!o.hidden && Math.hypot(o.x - r.x, o.y - r.y) < r.S.r + o.pad && canLaunch(o)) { o.action = null; o.air = { t: 0, dur: 0.75, h: 40, tumble: true }; b.damage(u, o, u.st.atk * r.S.mult, { element: 'slash', delivery: 'melee', color: '#ff7a9a' }); b.text(o.x, o.y - 60, '띄움!', '#ffe080', 9); } } }
        u.bzRoses = u.bzRoses.filter(r => r.t < 3.5);
      }
      for (const u of b.u) { if (!isBz(u)) continue; const Z = B(u), S = k => u.def.skills.find(s => s.id === k);
        if (u.dead) continue;
        if (Z.scyT > 0) Z.scyT -= dt;
        if (u.bzClone) stepClone(b, u, dt, S('bzSplit'));
        // 마력
        if (Z.tired) { if (!Z.dry) Z.mana = Math.min(MANA.max, Z.mana + MANA.tiredRegen * dt); if (!u.status('bzTired')) u.statuses.push({ id: 'bzTired', t: 999, dur: 999, src: u, tickT: 0 });
          if (Z.dry) { Z.dryT = (Z.dryT || 0) + dt; if (Z.dryT > 2) { Z.dryT = 0; setTired(b, u, false); } } // 근성 이후: 마력은 0 그대로, 2초만 주저앉았다가 깃발만으로 싸움
          else if (Z.mana >= MANA.wake) setTired(b, u, false); }
        else if (Z.empty) { if (!u.action) { Z.empty = false; if (!Z.dryDone) { setTired(b, u, true); if (Z.dry) Z.dryDone = true; } } } // 마력 0: 하던 동작이 끝나면 탈진
        else if (!(Z.dry && Z.mana <= 0)) Z.mana = Math.min(MANA.max, Z.mana + MANA.regen * dt);
      }
    },
    drawUnder(ctx, b) {
      for (const u of b.u) {
        for (const r of u.bzRoses || []) { const k = clamp(r.t / r.grow, 0, 1), fade = clamp((3.5 - r.t) / 0.6, 0, 1); ctx.save(); ctx.globalAlpha = fade; const x = Math.round(r.x), y = Math.round(r.y);
          if (!r.done) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 1, y - 1, 3, 2); ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(x, y, r.S.r, r.S.r * 0.6, 0, 0, TAU); ctx.stroke(); }
          else { const h = 6 + 4 * Math.min(1, (r.t - r.grow) * 8); ctx.fillStyle = '#3a8a4a'; ctx.fillRect(x, y - h, 1, h); ctx.fillRect(x - 2, y - h + 4, 2, 1); ctx.fillStyle = '#e8304a'; ctx.fillRect(x - 2, y - h - 3, 5, 4); ctx.fillStyle = '#ff7a8a'; ctx.fillRect(x - 1, y - h - 3, 2, 2); }
          ctx.restore(); }
        const H = u.bzHole; if (H) { ctx.save(); const R = 26 + 6 * Math.sin(b.time * 10); const g = ctx.createRadialGradient(u.x, u.y - 18, 2, u.x, u.y - 18, R + 20); g.addColorStop(0, 'rgba(20,0,30,0.9)'); g.addColorStop(0.5, 'rgba(90,40,140,0.45)'); g.addColorStop(1, 'rgba(90,40,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, u.y - 18, R + 20, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#c89aff'; ctx.globalAlpha = 0.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(u.x, u.y - 18, ((b.time * 50 + i * 20) % 60) + 6, 0, TAU); ctx.stroke(); } ctx.restore(); }
      }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (!u.bz) continue; const Z = u.bz;
        if (u.bzHole) for (const O of u.bzHole.objs) { ctx.save(); ctx.translate(Math.round(O.x), Math.round(O.y - 12)); ctx.rotate(O.spin);
          ctx.fillStyle = ['#8a6a4a', '#9a9a9a', '#6a8a5a'][O.k]; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-5, 2, 10, 3); ctx.restore(); }
        const C = u.bzClone; if (C) { const s = Sprites.get(u.def); ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(Math.round(C.x), Math.round(C.y - C.z)); if (u.facing < 0) ctx.scale(-1, 1); Sprites.draw(ctx, s, 0); ctx.restore();
          ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#a0203a'; ctx.beginPath(); ctx.moveTo(C.x - 8, C.y - C.z - 30); ctx.lineTo(C.x + 8, C.y - C.z - 30); ctx.lineTo(C.x + 12, C.y - C.z - 4); ctx.lineTo(C.x - 12, C.y - C.z - 4); ctx.fill(); ctx.restore(); }
        if (Z.scyT > 0 && !u.dead) { ctx.save(); ctx.translate(Math.round(u.x - u.facing * 12), Math.round(u.y - 30 - b.airZ(u))); ctx.strokeStyle = '#d8b0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.facing * 4, -8, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore(); }
        if (u.dead || u.hidden) continue;
        const w = 30, x0 = Math.round(u.x - w / 2), y0 = Math.round(u.y + u.ky - b.airZ(u) - 66);
        ctx.save(); ctx.fillStyle = 'rgba(16,14,22,0.75)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 5);
        ctx.fillStyle = Z.tired ? (Math.floor(b.time * 4) % 2 ? '#6a5a80' : '#8a7aa0') : Z.dry ? '#a07a9a' : '#b07aff'; ctx.fillRect(x0, y0, Math.round(w * Z.mana / MANA.max), 3);
        ctx.fillStyle = '#ff4a6a'; ctx.fillRect(x0 - 4, y0, 2, 3); // 팬던트
        if (Z.tired) { ctx.fillStyle = '#e0d8f0'; ctx.font = '8px ' + (window.FONT || 'sans-serif'); ctx.textAlign = 'center'; ctx.fillText('Zz', u.x + 12, y0 - 3); }
        ctx.restore(); }
    },
  });

  CHARACTERS.push({
    id: ID, name: '베르제브트', fullName: '베르제브트', gender: 'female', color: '#b0305a',
    stats: { hp: 860, atk: 31, spd: 255, range: 56, atkRate: 0.9, def: 14, crit: 0.06, critMult: 1.8 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { dark: 0.85 },
    weapon: 'spear',
    skills: [
      { id: 'bzHole', name: '슬러스터 홀', cd: 16, cost: 40, dur: 3.2, every: 0.35, pull: 70, slow: 0.45, objSpd: 160, objMult: 0.35, stun: 0.8, mult: 1.0, perSec: 0.35, perObj: 0.3, swallowK: 1.3, manaBack: 25 },
      { id: 'bzSplit', name: '단계 분리', cd: 11, cost: 30, spd: 560, len: 230, mult: 0.8, flySpd: 520, kickMult: 0.9, wallMult: 1.2, wallStun: 0.6 },
      { id: 'bzSlam', name: '공중 내려치기', cd: 7, cost: 20, dur: 0.65, r: 56, mult: 1.6 },
      { id: 'bzScythe', name: '깃발 낫', cd: 9, cost: 20, wind: 0.2, r: 84, mult: 1.8, dur: 6 },
      { id: 'bzThorns', name: '장미 가시날 연사', cd: 7, cost: 22, n: 18, gap: 0.06, spread: 0.2, spd: 470, mult: 0.25 },
      { id: 'bzRose', name: '장미 재배', cd: 9, dur: 2.4, spdMul: 1.55, every: 0.22, grow: 0.3, r: 16, mult: 0.6 },
    ],
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 3, foot: 1 },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '깃발 낫': ['깃발아, 낫이 돼라!', '싹둑 해줄게!'],
        '공중 내려치기': ['날아간다~!', '거기 딱 서 있어!'],
        '슬러스터 홀': ['다 빨아들일 거야!', '이리 와, 이리 와~'],
        '단계 분리': ['나 둘이다!', '하나, 둘, 뻥!'],
        '장미 재배': ['장미 심을래~', '밟으면 아프다?'],
        '장미 가시날 연사': ['가시 따끔따끔!', '망토 속에 잔뜩 있지롱!'],
      },
      event: {
        battleStart: ['나 안 놔! 절대!', '{opp}, 덤벼 봐!'],
        lowHp: ['아직… 안 놨어!'],
        stunned: ['으앗, 어지러…'],
        tired: ['헥헥… 잠깐만…', '마력이 텅텅…'],
        grit: ['안 놔… 아직 안 끝났어!'],
        win: ['이겼다~! 봤지?', '헤헤, 루델리안한테 자랑해야지!'],
        lose: ['으… 다음엔 안 져…'],
      },
    },
  });
})();
