/* =========================================================
 * 브리우스 니어 라미아 (사용자 소설) — 다양한 마법 + 스탠드 '브릴리언스'(팔 6개, 수정 인형)
 *  1. 스탠드 전개   : 스탠드를 독립시켜 기존 캐릭터처럼 튕겨 다니며 충돌 공격. 체력은 라미아와 공유. 호출하면 라미아에게 날아와 복귀
 *                    (복귀 중 상대와 부딪히면 서로 충돌 피해는 그대로, 튕겨나는 건 상대만)
 *  2. 광역 빙결 마법 : 스탠드로 공중 부상 → 잠시 뒤 마법서를 던져 땅 위의 모든 것을 빙결. 던지기 전 피격 시 추락·취소
 *  3. 명령          : 전개 중인 스탠드에게 제한 시간 내 상대를 붙잡으라고 명령(라미아는 정지). 잡으면 걸어가 뺨 때리기, 피격/시간 초과 시 실패
 *  4. 스탠드 산개    : 이동하며 상대를 조준하는 팔 6개를 차례로 설치 → 조준 고정 후 6개 모두 빛 속성 직선 광선
 *  난수는 전부 Math.random (전투 중 리플레이 시드 난수로 교체됨)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, ID = 'lamia';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const mainFoe = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const STAND = { id: 'lamia@stand', name: '브릴리언스', gender: 'neutral', color: '#9fd8ff', size: 1.1,
    stats: { hp: 760, atk: 22, spd: 290, range: 40, atkRate: 0.9, def: 10 }, attack: { element: 'ice', delivery: 'melee' }, skills: [],
    sprite: { src: 'assets/Lamia/stand/front.png', back: 'assets/Lamia/stand/back.png', scale: 3, foot: 1 },
    drawUnder(ctx, s) { const ow = s.summon && s.summon.owner; drawStandArms(ctx, ow ? armCount(ow) : 6); } };
  const ARM = { id: 'lamia@arm', name: '브릴리언스의 팔', color: '#9fd8ff', sprite: { src: 'assets/Lamia/stand/arm.png', scale: 2, foot: 0 } };
  STATUS_DEFS.lmFrozen = { name: '빙결', color: '#a8e8ff', tint: '#9fdcff', tintA: 0.55, blocksMove: true, blocksAct: true, onApply(u) { u.action = null; } };
  const armCount = u => Math.max(1, Math.min(6, Math.ceil(6 * Math.max(0, u.hp) / u.maxHp))); // 팔 개수 = 체력 비례 (가득 6개, 최소 1개)
  // 스탠드 팔 그리기 (몸통 스프라이트 좌표계: 발 = 원점, 배율 3). 순서: 오른쪽 위→왼쪽 위→오른쪽 중간→… (n개만)
  const ARM_SLOTS = [[8, -32, -0.35], [-8, -32, Math.PI + 0.35], [9, -24, 0.05], [-9, -24, Math.PI - 0.05], [8, -17, 0.4], [-8, -17, Math.PI - 0.4]];
  function drawStandArms(ctx, n) {
    const s = Sprites.get(ARM), k = 1.6 / 2; // arm.png 를 몸통 배율에 맞춤
    for (let i = 0; i < n; i++) { const [x, y, a] = ARM_SLOTS[i]; ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.drawImage(s.img, 0, 0, s.fw, s.fh, -3 * k * 2, -s.dh * k / 2, s.dw * k, s.dh * k); ctx.restore(); }
  }
  // 초반 화력: 개전 '절대 계산' 구간
  const TRACK = 0.3, OPEN = { dur: 14, mult: 1.9, cd: 1.6, first: 0.8 };
  const opening = (b, u) => b.time < OPEN.dur && !u.dead;
  const standOf = u => u.lmStand && !u.lmStand.dead && u.lmStand.summon && !u.lmStand.summon.ended ? u.lmStand : null;

  // ---------- 1. 스탠드 전개 / 호출 ----------
  function deploy(b, u) {
    const s = GHOUL.summon(b, u, 'lmStand', u.x - u.facing * 16, u.y, { def: STAND, dur: 1e9, quiet: true, extra: { lm: true } });
    if (!s) return; s.maxHp = u.maxHp; s.hp = u.hp; u.lmStand = s; u.lmDeployT = b.time;
    b.text(s.x, s.y - 56, '브릴리언스!', '#bfe8ff', 10); b.shock(s.x, s.y - 20, 6, 36, '#bfe8ff', 0.35, 3);
  }
  function recall(b, u) {
    const s = standOf(u); if (!s || s.lmBack) return; s.lmBack = true; s.statuses = s.statuses.filter(x => x.id !== 'pin');
    const hit = new Set();
    s.action = { type: 'dash', lm: true, trail: '#bfe8ff', step(dt) { // 'dash' 형식: 일반 충돌(서로 튕김)에서 제외 → 상대만 밀려남
      if (u.dead) return; const d = dist(s, u), st = Math.min(d, 560 * dt); if (d > 1) { s.x += (u.x - s.x) / d * st; s.y += (u.y - s.y) / d * st; }
      for (const o of b.foes(s)) if (!hit.has(o) && !o.airborne && dist(s, o) < 15 * (s.size + o.size) + 4) {
        hit.add(o); s.bumpT = 0; o.bumpT = Math.min(o.bumpT || 0, 0); b.bumpAttack(s, o); b.bumpAttack(o, s);
        b.knockback(o, angTo(s, o), 340, 0.22); b.ring((s.x + o.x) / 2, (s.y + o.y) / 2 - 4, 4, 22, 0.25, '#e8f6ff'); }
      if (d < 18) { GHOUL.removeSummon(b, s); u.lmStand = null; b.ring(u.x, u.y - 20, 4, 24, 0.25, '#bfe8ff'); }
    } };
  }
  SKILLS.lmStand = {
    desc: '스탠드 브릴리언스를 독립시켜 기존 캐릭터처럼 튕겨 다니며 충돌 공격하게 합니다(체력은 라미아와 공유). 다시 쓰면 호출: 라미아에게 날아오며 부딪힌 상대만 밀려납니다.',
    canUse: (u, e, d, b) => { const s = standOf(u); if (!s) return !u.lmLev && !u.lmSp && b.time > 0.8;
      return !s.lmBack && !s.lmOrder && (b.time - u.lmDeployT > u.def.lm.stay || dist(u, mainFoe(b, u)) < 70); },
    say(u, e, b) { return standOf(u) ? '돌아와, 브릴리언스.' : b.line(u, 'skill', '스탠드 전개'); },
    use(u, e, b) { if (standOf(u)) recall(b, u); else deploy(b, u); },
  };

  // ---------- 2. 광역 빙결 마법 ----------
  SKILLS.lmFreeze = {
    desc: '스탠드로 여유롭게 공중에 떠오른 뒤, 잠시 후 마법서를 땅에 던져 땅 위의 모든 것(상대·소환수)을 빙결시킵니다. 공중에 뜬 대상은 피합니다. 던지기 전에 공격받으면 땅으로 떨어지며 취소됩니다.',
    canUse: (u, e, d, b) => d < 330 && !u.lmSp && !u.airborne,
    use(u, e, b, slot) {
      const S = slot; u.lmLev = { t: 0, hurt: false }; u.air = { t: 0, dur: 99, h: S.h, ride: true, lm: true };
      b.ring(u.x, u.y, 6, 30, 0.4, '#bfe8ff');
      u.action = { type: 'lmLev', step(dt) {
        const L = u.lmLev; if (!L) { u.action = null; return; } L.t += dt;
        if (Math.random() < 0.5) b.parts.push({ x: u.x + rand(-10, 10), y: u.y - 2, vx: 0, vy: 20, life: 0.4, max: 0.4, color: '#cfefff', size: 2, glow: true });
        if (!L.thrown && L.t >= S.delay) { L.thrown = true; L.bt = 0; b.text(u.x, u.y - 80, '마법서!', '#bfe8ff', 10); }
        if (L.thrown) L.bt += dt;
        if (L.thrown && !L.done && L.bt >= S.fall) { L.done = true; // 착탄: 땅 위 모두 빙결
          b.shock(u.x, u.y, 10, 320, '#bfe8ff', 0.7, 8); b.shock(u.x, u.y, 6, 180, '#ffffff', 0.5, 4); b.shake(2); b.glow(u.x, u.y, 80, '#bfe8ff', 0.5);
          for (const o of b.u) { if (o === u || o.dead || o.hidden || o.airborne || o.def.noDraw || (o.summon && o.summon.owner === u)) continue;
            b.applyStatus(o, 'lmFrozen', S.dur, u); b.damage(u, o, u.st.atk * S.mult, { element: 'ice', delivery: 'ranged', color: '#bfe8ff', quiet: true }); }
        }
        if (L.done && L.bt >= S.fall + S.after) { u.lmLev = null; u.air = null; u.action = null; }
      } };
    },
  };

  // ---------- 3. 명령 ----------
  SKILLS.lmOrder = {
    desc: '전개 중인 스탠드에게 제한 시간 안에 상대를 붙잡으라고 명령합니다(라미아는 가만히 있음). 잡으면 웃으며 걸어가 뺨을 때리고, 그 사이 공격받거나 시간 안에 못 잡으면 스탠드를 탓하며 취소됩니다.',
    canUse: (u, e, d, b) => { const s = standOf(u); return !!s && !s.lmBack && !s.lmOrder && !s.stun && !u.lmLev && !u.lmSp && dist(s, mainFoe(b, u)) < 280; },
    use(u, e0, b, slot) {
      const S = slot, s = standOf(u), e = mainFoe(b, u); if (!s || !e) return;
      const O = s.lmOrder = { t: 0, grab: false, slap: false }; u.lmHurt = false;
      let ang = angTo(s, e);
      const fail = why => { if (s.lmOrder !== O) return; s.lmOrder = null; s.action = null; u.action = null; b.releasePin(e);
        b.text(u.x, u.y - 66, why, '#bfe8ff', 10); b.say(u, 'orderFail'); };
      s.action = { type: 'lmHunt', step(dt) { // 빠르게 튕겨 다니며 상대를 쫓음 (방향 전환 제한 → 피할 수 있음)
        if (s.lmOrder !== O) { s.action = null; return; }
        if (O.grab) { const a = angTo(e, s); s.x = e.x + Math.cos(a) * 22; s.y = e.y + Math.sin(a) * 10; return; }
        const t = angTo(s, e), df = Math.atan2(Math.sin(t - ang), Math.cos(t - ang)); ang += Math.max(-S.turn * dt, Math.min(S.turn * dt, df));
        let nx = s.x + Math.cos(ang) * S.spd * dt, ny = s.y + Math.sin(ang) * S.spd * dt; const q = b.clampPos(nx, ny, s.pad, s);
        if (q.x !== nx) ang = Math.PI - ang; if (q.y !== ny) ang = -ang; s.x = q.x; s.y = q.y; s.facing = Math.cos(ang) >= 0 ? 1 : -1;
        if (b.blockAt(s.x, s.y - 4, 6)) { ang += Math.PI; b.resolveBuildings(s); }
        if (Math.random() < 0.6) b.fx.push({ type: 'after', x: s.x, y: s.y, def: s.fdef, back: false, facing: s.facing, t: 0, dur: 0.2 });
        if (!e.dead && !e.airborne && !e.hidden && dist(s, e) < 15 * (s.size + e.size) + 6) {
          if (e.counter || e.evadeT > b.time) { b.damage(s, e, 1, {}); return; }
          O.grab = true; e.action = null; e.statuses = e.statuses.filter(x => x.id !== 'pin'); b.applyStatus(e, 'pin', S.limit + 3, s);
          b.text(e.x, e.y - 70, '붙잡힘!', '#bfe8ff', 11); b.say(u, 'orderOk'); b.text(u.x, u.y - 70, '후후훗', '#ffe8b0', 10);
        }
      } };
      u.action = { type: 'lmCommand', step(dt) {
        if (s.lmOrder !== O || !b.u.includes(s)) { s.lmOrder = null; u.action = null; b.releasePin(e); return; } O.t += dt;
        if (u.lmHurt && !O.slap) return fail('…쓸모없긴.');
        if (!O.grab) { if (O.t >= S.limit || s.dead || e.dead) fail('제때 못 잡다니, 한심하군.'); return; }
        if (e.dead) { s.lmOrder = null; s.action = null; u.action = null; return; }
        const d = dist(u, e); O.wt = (O.wt || 0) + dt; // 여유롭게 걸어가기 (최대 S.walkMax초, 막히면 실패)
        if (O.wt > S.walkMax) return fail('…귀찮게 하는군.');
        if (d > 30) { const st = Math.min(d - 30, S.walk * dt); u.x += (e.x - u.x) / d * st; u.y += (e.y - u.y) / d * st; u.facing = e.x >= u.x ? 1 : -1; u.moving = true; u.walk += dt * 18; return; }
        O.slap = true; s.lmOrder = null; s.action = null; u.action = null; b.releasePin(e);
        b.damage(u, e, u.st.atk * S.mult, { element: 'blunt', delivery: 'melee', big: true, color: '#ffd0d0', airHit: true });
        b.slashFx(e.x, e.y - 30, u.facing, '#ffffff', 1.2); b.text(e.x, e.y - 66, '짝!', '#ffffff', 14); b.hitstop(0.08); b.shake(1.5);
        b.knockback(e, angTo(u, e), 260, 0.2);
      } };
    },
  };

  // ---------- 4. 스탠드 산개 ----------
  SKILLS.lmSpread = {
    desc: '움직이면서 그 자리에 스탠드 팔을 하나씩 설치합니다. 각 팔은 설치 순간의 상대 방향으로 고정됩니다. 팔 개수는 체력에 비례(가득 6개, 최소 1개). 모두 설치하면 고정된 조준선을 잠시 보여 준 뒤 각 방향으로 빛 속성 직선 광선을 쏩니다. 광선은 벽에 막힙니다.',
    canUse: (u, e, d) => d < 320 && !u.lmSp && !u.lmLev,
    use(u, e, b, slot) { u.lmSp = { S: slot, n: armCount(u), arms: [], next: 0, phase: 'plant', t: 0 }; b.text(u.x, u.y - 66, '팔 ' + armCount(u) + '개', '#bfe8ff', 9); },
  };
  function spreadStep(b, u, dt) {
    const P = u.lmSp, S = P.S, e = mainFoe(b, u); P.t += dt;
    if (u.dead || b.over) { u.lmSp = null; return; }
    for (const A of P.arms) if (A.age < TRACK) { A.age += dt; if (e) A.a = Math.atan2(e.y - 18 - A.y, e.x - A.x); }
    if (P.phase === 'plant') {
      if ((P.next -= dt) <= 0 && P.arms.length < P.n) { P.next = S.gap; P.arms.push({ x: u.x, y: u.y - 22, a: e ? Math.atan2(e.y - 18 - (u.y - 22), e.x - u.x) : 0, age: 0 }); /* 설치 후 0.3초 추적 → 고정 */ b.ring(u.x, u.y - 22, 3, 16, 0.25, '#bfe8ff'); }
      if (P.arms.length >= P.n && P.arms[P.arms.length - 1].age >= TRACK) { P.phase = 'lock'; P.t = 0; b.text(u.x, u.y - 66, '쏴라.', '#fff4c0', 10); }
    } else if (P.phase === 'lock') {
      if (P.t >= S.lock) { P.phase = 'fire'; P.t = 0;
        for (const A of P.arms) fireBeam(b, u, A, S);
        b.shake(1.5);
      }
    } else if (P.t >= 0.3) u.lmSp = null;
  }
  function fireBeam(b, u, A, S) { // A: {x, y(발 기준 -22), a} → 길이 계산 + 피해
    const c = Math.cos(A.a), s = Math.sin(A.a); let L = 0;
    for (; L < S.len; L += 5) { const x = A.x + c * L, y = A.y + 22 + s * L; if (x < AR.x || x > AR.x + AR.w || y < AR.y || y > AR.y + AR.h + 10 || (L > 8 && b.blockAt(x, y - 4))) break; }
    A.L = L;
    for (const o of b.foes(u)) { if (o.hidden) continue; const dx = o.x - A.x, dy = (o.y - 18) - A.y, t = dx * c + dy * s; if (t < 0 || t > L + o.pad) continue;
      if (Math.abs(-dx * s + dy * c) > S.width + o.pad) continue;
      b.damage(u, o, u.st.atk * S.mult * (opening(b, u) ? OPEN.mult : 1), { element: 'light', delivery: 'ranged', color: '#fff4c0' }); }
  }
  function drawBeams(ctx, arms, phase, t, lock, len) {
    for (const A of arms) {
      if (phase === 'lock') { ctx.save(); ctx.globalAlpha = 0.35 + 0.4 * Math.min(1, t / lock); ctx.strokeStyle = '#fff4c0'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + Math.cos(A.a) * len, A.y + Math.sin(A.a) * len); ctx.stroke(); ctx.restore(); }
      if (phase === 'fire' && A.L != null) { const k = Math.max(0, 1 - t / 0.3); ctx.save(); ctx.lineCap = 'round'; const x1 = A.x + Math.cos(A.a) * A.L, y1 = A.y + Math.sin(A.a) * A.L;
        ctx.globalAlpha = 0.4 * k; ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.globalAlpha = 0.95 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke(); ctx.restore(); }
      drawArm(ctx, A, phase === 'fire' ? Math.max(0, 1 - t / 0.3) : 0.9);
    }
  }
  function drawArm(ctx, A, k) {
    const s = Sprites.get(ARM); ctx.save(); ctx.translate(Math.round(A.x), Math.round(A.y)); ctx.rotate(A.a); ctx.globalAlpha = k;
    ctx.drawImage(s.img, 0, 0, s.fw, s.fh, -s.dw * 0.25, -s.dh / 2, s.dw, s.dh); ctx.restore();
  }
  function drawSpread(ctx, b, u) { const P = u.lmSp; drawBeams(ctx, P.arms, P.phase, P.t, P.S.lock, P.S.len); }

  // ---------- 5. 브릴리언스 서클 ----------
  SKILLS.lmCircle = {
    desc: '스탠드의 팔들이 라미아를 둥글게 둘러싸고(팔 개수는 체력 비례), 잠시 조준선을 보여 준 뒤 각자 바깥 방향으로 빛 속성 직선 광선을 쏩니다. 한 팔은 시전 순간의 상대 방향을 향합니다. 스탠드가 나가 있으면 즉시 불러들입니다.',
    canUse: (u, e, d, b) => d < 210 && !u.lmSp && !u.lmLev && !(standOf(u) && standOf(u).lmOrder),
    use(u, e0, b, slot) {
      const S = slot, e = mainFoe(b, u), s = standOf(u);
      if (s) { b.ring(s.x, s.y - 20, 4, 26, 0.3, '#bfe8ff'); GHOUL.removeSummon(b, s); u.lmStand = null; } // 즉시 회수
      const n = armCount(u), a0 = e ? Math.atan2(e.y - 18 - (u.y - 22), e.x - u.x) : 0;
      const C = u.lmCircle = { S, phase: 'lock', t: 0, arms: [] };
      for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; C.arms.push({ x: u.x + Math.cos(a) * S.r, y: u.y - 22 + Math.sin(a) * S.r * 0.8, a }); }
      b.ring(u.x, u.y - 20, 6, S.r + 8, 0.35, '#bfe8ff'); b.text(u.x, u.y - 70, '팔 ' + n + '개', '#bfe8ff', 9);
      u.action = { type: 'lmCircle', step(dt) { // 시전 중 제자리
        const C2 = u.lmCircle; if (!C2) { u.action = null; return; } C2.t += dt;
        if (C2.phase === 'lock' && C2.t >= S.lock) { C2.phase = 'fire'; C2.t = 0; for (const A of C2.arms) fireBeam(b, u, A, S); b.shake(1.8); b.glow(u.x, u.y - 22, 40, '#fff4c0', 0.3); }
        else if (C2.phase === 'fire' && C2.t >= 0.3) { u.lmCircle = null; u.action = null; }
      } };
    },
  };

  // ---------- 엔진 연결 ----------
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (tgt && tgt.summon && tgt.summon.lm) { const ow = tgt.summon.owner; if (!ow || ow.dead) return 0; // 스탠드 피해 → 라미아 체력 (공유)
      tgt.flash = 0.12; return this.damage(src, ow, amt, o); }
    const r = oDmg.call(this, src, tgt, amt, o);
    if (r > 0 && tgt && tgt.def.id === ID && src !== tgt && !o.dot) { tgt.lmHurt = true;
      const L = tgt.lmLev; if (L && !L.thrown) { tgt.lmLev = null; tgt.air = null; tgt.action = null; this.text(tgt.x, tgt.y - 60, '추락!', '#bfe8ff', 11); this.dust(tgt.x, tgt.y); this.say(tgt, 'levFail'); } }
    return r;
  };
  const oFixed = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) {
    if (tgt && tgt.summon && tgt.summon.lm) { const ow = tgt.summon.owner; return ow && !ow.dead ? oFixed.call(this, src, ow, amt, o) : 0; }
    return oFixed.call(this, src, tgt, amt, o); };

  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.winner && b.winner.summon && b.winner.summon.lm) b.winner = b.winner.summon.owner; // 스탠드가 승리 판정 대상이 되면 라미아로
      for (const u of b.u) {
        if (u.def.id !== ID) continue;
        const s = standOf(u); if (s) { s.maxHp = u.maxHp; s.hp = u.hp; } else if (u.lmStand) u.lmStand = null;
        if (opening(b, u)) { const ex = dt * (OPEN.cd - 1) * u.mult('cdRate'); for (let i = 0; i < u.skillT.length; i++) u.skillT[i] -= ex; // 쿨타임 1.6배 빠르게
          if (!u.lmOpened && b.time >= OPEN.first) { const e = mainFoe(b, u), i = u.skills.findIndex(k => k.id === 'lmSpread');
            if (e && i >= 0 && !u.lmSp && !u.lmLev && !u.lmCircle && !u.stunned && !u.statuses.some(x => x.id === 'lmFrozen' || x.id === 'stun')) { u.lmOpened = true; // 개전 즉시 산개
              b.text(u.x, u.y - 78, '절대 계산!', '#fff4c0', 11); SKILLS.lmSpread.use(u, e, b, u.skills[i]); u.skillT[i] = u.skills[i].cd; } } }
        if (u.lmSp) spreadStep(b, u, dt);
      }
    },
    drawUnder(ctx, b) { // 전개하지 않은 스탠드: 라미아 뒤에 반투명으로
      for (const u of b.u) if (u.def.id === ID && !u.dead && !u.hidden && opening(b, u)) { const k = 0.25 + 0.15 * Math.sin(b.time * 8), z = b.airZ(u); // 초반 화력 구간 빛
        ctx.save(); ctx.globalAlpha = k * Math.min(1, (OPEN.dur - b.time) / 1.5); ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.ellipse(u.x, u.y - 16 - z, 17, 21, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      for (const u of b.u) { if (u.def.id !== ID || u.dead || u.hidden || standOf(u)) continue;
        const sp = Sprites.get(STAND), z = b.airZ(u); ctx.save(); ctx.globalAlpha = u.lmLev ? 0.75 : 0.4; ctx.translate(Math.round(u.x - u.facing * 9), Math.round(u.y - 4 - z * (u.lmLev ? 0.6 : 1)));
        if (u.facing < 0) ctx.scale(-1, 1); if (!u.lmCircle) drawStandArms(ctx, armCount(u)); Sprites.draw(ctx, sp, 0); ctx.restore(); }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (u.def.id !== ID) continue;
        if (u.lmSp) drawSpread(ctx, b, u);
        if (u.lmCircle) { const C = u.lmCircle; drawBeams(ctx, C.arms, C.phase, C.t, C.S.lock, C.S.len); }
        const L = u.lmLev; if (L && L.thrown && !L.done) { const k = L.bt / u.skills.find(s => s.id === 'lmFreeze').fall, z = b.airZ(u) * (1 - k);
          ctx.save(); ctx.translate(Math.round(u.x + 8), Math.round(u.y - 30 - z + 30 * k)); ctx.rotate(L.bt * 12); ctx.fillStyle = '#3a2a5a'; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = '#e8d8a8'; ctx.fillRect(-4, -3, 8, 1); ctx.fillStyle = '#bfe8ff'; ctx.fillRect(-1, -1, 2, 2); ctx.restore(); }
        const s = standOf(u); if (s && s.lmOrder) { ctx.save(); ctx.strokeStyle = '#bfe8ff'; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(u.x, u.y - 30); ctx.lineTo(s.x, s.y - 24); ctx.stroke(); ctx.restore(); }
      }
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: ID, name: '라미아', fullName: '브리우스 니어 라미아', gender: 'female', color: '#bfe8ff',
    stats: { hp: 760, atk: 30, spd: 250, range: 130, atkRate: 1.0, def: 10 },
    attack: { element: 'ice', delivery: 'ranged' },
    resist: { ice: 0.7, light: 0.9, fire: 1.2 },
    skills: [
      { id: 'lmStand', name: '스탠드 전개', cd: 4 },
      { id: 'lmFreeze', name: '광역 빙결 마법', cd: 14, h: 34, delay: 1.0, fall: 0.35, after: 0.35, dur: 1.8, mult: 0.4, element: 'ice', delivery: 'ranged' },
      { id: 'lmOrder', name: '명령', cd: 11, limit: 4, spd: 430, turn: 3.2, walk: 120, walkMax: 3, mult: 2.4 },
      { id: 'lmCircle', name: '브릴리언스 서클', cd: 10, r: 26, lock: 0.45, len: 300, width: 16, mult: 0.7, element: 'light', delivery: 'ranged' },
      { id: 'lmSpread', name: '스탠드 산개', cd: 13, n: 6, gap: 0.3, lock: 0.35, len: 360, width: 16, mult: 0.55, element: 'light', delivery: 'ranged' },
    ],
    lm: { stay: 9 }, // 스탠드 전개 유지 시간(초) 뒤 호출 (또는 상대가 70 안으로 붙으면)
    extraDefs: [STAND, ARM],
    sprite: { src: 'assets/Lamia/front.png', back: 'assets/Lamia/back.png', scale: 3, foot: 1 },
    portrait: 'assets/Lamia/portrait.png',
    lines: {
      cd: { orderOk: 0, orderFail: 0, levFail: 0 },
      skill: {
        '스탠드 전개': ['가라, 브릴리언스. 꼬마 상대로는 과분하지만.', '계산대로야. 브릴리언스, 나가.', '내 손을 더럽힐 필요는 없지.'],
        '광역 빙결 마법': ['지면 위의 모든 것은 정지한다. 그게 이치야.', '올려다보는 기분이 어때, 꼬마?', '절대영역의 결빙을 보여 주지.'],
        '명령': ['브릴리언스, 저 꼬마를 붙잡아.', '도망쳐 봐. 계산은 끝났으니까.', '명령이다. 놓치지 마.'],
        '브릴리언스 서클': ['내 주위는 전부 사선이야.', '빛의 원 안에서 무릎 꿇어, 꼬마.', '빠져나갈 틈은 계산해 두지 않았어.'],
        '스탠드 산개': ['여섯 개의 궤적, 전부 계산 안이야.', '산개해, 브릴리언스.', '빛의 기하학을 가르쳐 주지.'],
      },
      event: {
        battleStart: ['꼬마, 내 시간을 낭비하게 하지 마.', '{opp}? 흥, 변수조차 안 되겠군.', '결과는 이미 도출됐어.'],
        orderOk: ['후후훗, 착하지. 자, 꼬마. 얼굴 이리 대.', '그래, 그렇게 붙잡고 있어.'],
        orderFail: ['쓸모없는 인형 같으니.', '이 정도도 못 하다니, 실망이야.'],
        levFail: ['…감히 나를 떨어뜨려?'],
        lowHp: ['계산 착오…? 아니, 아직이야.', '꼬마 주제에 제법이군.'],
        stunned: ['불쾌하군.'],
        win: ['잘 있어, 꼬마.', '예측 범위 안이었어.', '시간 낭비였군.'],
        lose: ['이런 결과는… 계산에 없었어.', '기억해 두겠어, 꼬마.'],
      },
    },
  });
})();
